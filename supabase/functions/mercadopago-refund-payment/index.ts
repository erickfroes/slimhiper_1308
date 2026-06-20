import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envString } from '../_shared/env.ts';
import { tenantHasFeatureFlag } from '../_shared/plan-entitlements.ts';
import {
  amountToCents,
  asPositiveInteger,
  asRecord,
  asString,
  bearerToken,
  centsToProviderAmount,
  corsHeaders,
  jsonResponse,
  mercadoPagoFetchWithAccessToken,
  MERCADOPAGO_FEATURE_FLAGS,
  MERCADOPAGO_PROVIDER,
  resolveMercadoPagoTenantAccessToken,
  safeErrorMessage,
  safeIdempotencyKey,
  safeText,
} from '../_shared/mercadopago.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

async function tenantHasBillingProviderFeature(
  admin: ReturnType<typeof createClient>,
  tenantId: string
) {
  for (const flag of MERCADOPAGO_FEATURE_FLAGS) {
    if (await tenantHasFeatureFlag(admin, tenantId, flag)) return true;
  }
  return false;
}

async function requireFinancialWrite(params: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  tenantId: string;
}) {
  const { supabase, userId, tenantId } = params;
  const { data: membership, error: membershipError } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) return false;

  const { data: canWrite, error: permissionError } = await supabase.rpc('has_permission', {
    p_tenant_id: tenantId,
    p_permission: 'financial.write',
  });

  if (permissionError) throw permissionError;
  return canWrite === true;
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(Deno.env, req) });
  if (req.method !== 'POST') {
    return jsonResponse(
      Deno.env,
      405,
      {
        ok: false,
        error: { code: 'method_not_allowed', message: 'Only POST is allowed.' },
        meta: { timestamp },
      },
      req
    );
  }

  try {
    const token = bearerToken(req);
    if (!token) {
      return jsonResponse(
        Deno.env,
        401,
        {
          ok: false,
          error: { code: 'unauthorized', message: 'Missing bearer token.' },
          meta: { timestamp },
        },
        req
      );
    }

    const supabaseUrl = envString(Deno.env, 'SUPABASE_URL');
    const anonKey = envString(Deno.env, 'SUPABASE_ANON_KEY');
    const serviceRoleKey = envString(Deno.env, 'SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('[mercadopago-refund-payment] missing environment configuration');
      return jsonResponse(
        Deno.env,
        500,
        {
          ok: false,
          error: { code: 'server_misconfigured', message: 'Server configuration error.' },
          meta: { timestamp },
        },
        req
      );
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse(
        Deno.env,
        401,
        {
          ok: false,
          error: { code: 'unauthorized', message: 'Invalid or expired token.' },
          meta: { timestamp },
        },
        req
      );
    }

    const body = await req.json().catch(() => null);
    const localPaymentId = asString(body?.payment_id ?? body?.paymentId);
    const localInvoiceId = asString(body?.invoice_id ?? body?.invoiceId);
    const amountCents = asPositiveInteger(body?.amount_cents ?? body?.amountCents);
    const reason = safeText(body?.reason, 500);
    const idempotencyKey =
      safeIdempotencyKey(body?.idempotency_key ?? body?.idempotencyKey) ||
      `refund:${crypto.randomUUID()}`;

    if ((!localPaymentId && !localInvoiceId) || !amountCents || reason.length < 10) {
      return jsonResponse(
        Deno.env,
        400,
        {
          ok: false,
          error: {
            code: 'invalid_request',
            message: 'payment_id or invoice_id, amount_cents and a refund reason are required.',
          },
          meta: { timestamp },
        },
        req
      );
    }

    let payment: Record<string, unknown> | null = null;
    let invoice: Record<string, unknown> | null = null;

    if (localPaymentId) {
      const paymentResult = await admin
        .from('payments')
        .select(
          'id,tenant_id,patient_id,patient_invoice_id,provider,provider_payment_id,amount_cents,status,metadata'
        )
        .eq('id', localPaymentId)
        .eq('provider', MERCADOPAGO_PROVIDER)
        .maybeSingle();
      if (paymentResult.error) throw paymentResult.error;
      payment = paymentResult.data ? asRecord(paymentResult.data) : null;
    }

    const invoiceLookupId = localInvoiceId || asString(payment?.patient_invoice_id);
    if (invoiceLookupId) {
      const invoiceResult = await admin
        .from('patient_invoices')
        .select(
          'id,tenant_id,patient_id,provider,provider_payment_id,provider_invoice_id,amount_cents,status,paid_at,metadata'
        )
        .eq('id', invoiceLookupId)
        .eq('provider', MERCADOPAGO_PROVIDER)
        .maybeSingle();
      if (invoiceResult.error) throw invoiceResult.error;
      invoice = invoiceResult.data ? asRecord(invoiceResult.data) : null;
    }

    if (!payment && invoice) {
      const paymentResult = await admin
        .from('payments')
        .select(
          'id,tenant_id,patient_id,patient_invoice_id,provider,provider_payment_id,amount_cents,status,metadata'
        )
        .eq('tenant_id', invoice.tenant_id)
        .eq('patient_invoice_id', invoice.id)
        .eq('provider', MERCADOPAGO_PROVIDER)
        .order('paid_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (paymentResult.error) throw paymentResult.error;
      payment = paymentResult.data ? asRecord(paymentResult.data) : null;
    }

    const tenantId = asString(payment?.tenant_id ?? invoice?.tenant_id);
    const patientId = asString(payment?.patient_id ?? invoice?.patient_id);
    const paymentId = asString(payment?.id);
    const invoiceId = asString(invoice?.id ?? payment?.patient_invoice_id) || null;
    const providerPaymentId = asString(
      payment?.provider_payment_id ?? invoice?.provider_payment_id
    );
    const localAmountCents = Number(payment?.amount_cents ?? invoice?.amount_cents ?? 0);

    if (!tenantId || !patientId || !Number.isFinite(localAmountCents)) {
      return jsonResponse(
        Deno.env,
        404,
        {
          ok: false,
          error: { code: 'payment_not_found', message: 'Refundable payment was not found.' },
          meta: { timestamp },
        },
        req
      );
    }

    if (!providerPaymentId) {
      return jsonResponse(
        Deno.env,
        409,
        {
          ok: false,
          error: {
            code: 'provider_payment_unresolved',
            message: 'Provider payment id is required before refund.',
          },
          meta: { tenantId, timestamp },
        },
        req
      );
    }

    if (amountCents > localAmountCents) {
      return jsonResponse(
        Deno.env,
        422,
        {
          ok: false,
          error: {
            code: 'amount_exceeds_payment',
            message: 'Refund amount exceeds payment amount.',
          },
          meta: { tenantId, timestamp },
        },
        req
      );
    }

    if (!(await requireFinancialWrite({ supabase, userId: user.id, tenantId }))) {
      return jsonResponse(
        Deno.env,
        403,
        {
          ok: false,
          error: { code: 'forbidden', message: 'Missing financial.write permission.' },
          meta: { tenantId, timestamp },
        },
        req
      );
    }

    if (!(await tenantHasBillingProviderFeature(admin, tenantId))) {
      return jsonResponse(
        Deno.env,
        403,
        {
          ok: false,
          error: {
            code: 'plan_feature_disabled',
            message: 'Payment provider is not enabled for this tenant plan.',
          },
          meta: { tenantId, timestamp },
        },
        req
      );
    }

    const existingRefund = await admin
      .from('billing_refunds')
      .select('id,status,amount_cents,processed_at')
      .eq('tenant_id', tenantId)
      .eq('provider', MERCADOPAGO_PROVIDER)
      .eq('metadata->>idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingRefund.error) throw existingRefund.error;
    if (existingRefund.data?.id) {
      return jsonResponse(
        Deno.env,
        200,
        {
          ok: true,
          data: {
            id: existingRefund.data.id,
            status: existingRefund.data.status,
            amount_cents: existingRefund.data.amount_cents,
            processed_at: existingRefund.data.processed_at ?? null,
          },
          meta: { tenantId, timestamp, reused: true },
        },
        req
      );
    }

    const refundInsert = await admin
      .from('billing_refunds')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        patient_invoice_id: invoiceId,
        payment_id: paymentId || null,
        provider: MERCADOPAGO_PROVIDER,
        status: 'processing',
        amount_cents: amountCents,
        reason,
        requested_by: user.id,
        metadata: { idempotency_key: idempotencyKey, provider_payment_id: providerPaymentId },
      })
      .select('id,status')
      .single();

    if (refundInsert.error) throw refundInsert.error;
    const refundId = String(refundInsert.data.id);
    const fullRefund = amountCents >= localAmountCents;
    const tenantToken = await resolveMercadoPagoTenantAccessToken(Deno.env, admin, tenantId);
    if (!tenantToken.accessToken) {
      await admin
        .from('billing_refunds')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString(),
          error_code: tenantToken.errorCode || 'tenant_mercadopago_not_connected',
        })
        .eq('id', refundId)
        .eq('tenant_id', tenantId);

      return jsonResponse(
        Deno.env,
        409,
        {
          ok: false,
          error: {
            code: tenantToken.errorCode || 'tenant_mercadopago_not_connected',
            message: 'Mercado Pago OAuth account is not active for this tenant.',
          },
          meta: { tenantId, timestamp },
        },
        req
      );
    }

    const providerResponse = await mercadoPagoFetchWithAccessToken(
      Deno.env,
      tenantToken.accessToken,
      `/v1/payments/${encodeURIComponent(providerPaymentId)}/refunds`,
      {
        method: 'POST',
        idempotencyKey,
        body: JSON.stringify(fullRefund ? {} : { amount: centsToProviderAmount(amountCents) }),
      }
    );

    if (!providerResponse.ok) {
      console.error('[mercadopago-refund-payment] provider_error', {
        status: providerResponse.status,
      });
      await admin
        .from('billing_refunds')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString(),
          error_code: providerResponse.errorCode,
        })
        .eq('id', refundId)
        .eq('tenant_id', tenantId);

      return jsonResponse(
        Deno.env,
        providerResponse.status === 0 ? 500 : 502,
        {
          ok: false,
          error: { code: providerResponse.errorCode, message: 'Billing provider refund failed.' },
          meta: { tenantId, timestamp },
        },
        req
      );
    }

    const providerRecord = asRecord(providerResponse.data);
    const providerRefundId = asString(providerRecord.id) || null;
    const providerStatus = asString(providerRecord.status, 'approved');
    const providerAmountCents = amountToCents(providerRecord.amount) || amountCents;
    const processedAt = new Date().toISOString();

    await admin
      .from('billing_refunds')
      .update({
        status: 'succeeded',
        processed_at: processedAt,
        provider_refund_id: providerRefundId,
        provider_status: providerStatus,
        metadata: {
          idempotency_key: idempotencyKey,
          provider_payment_id: providerPaymentId,
          provider_status: providerStatus,
          provider_amount_cents: providerAmountCents,
          full_refund: fullRefund,
        },
      })
      .eq('id', refundId)
      .eq('tenant_id', tenantId);

    await admin.from('billing_provider_events').insert({
      tenant_id: tenantId,
      provider: MERCADOPAGO_PROVIDER,
      provider_event_id: providerRefundId,
      event_type: 'REFUND_CREATED',
      resource_type: 'payment',
      resource_id: providerPaymentId,
      idempotency_key: `refund:${refundId}`,
      status: 'processed',
      processed_at: processedAt,
      payload_summary: {
        refund_id: providerRefundId,
        payment_id: providerPaymentId,
        amount_cents: providerAmountCents,
        provider_status: providerStatus,
      },
    });

    if (paymentId) {
      await admin
        .from('payments')
        .update({
          status: fullRefund ? 'refunded' : asString(payment?.status, 'paid'),
          metadata: {
            ...asRecord(payment?.metadata),
            last_refund_id: refundId,
            refunded_amount_cents: amountCents,
            refund_status: fullRefund ? 'full' : 'partial',
          },
        })
        .eq('id', paymentId)
        .eq('tenant_id', tenantId);
    }

    if (invoiceId && fullRefund) {
      await admin
        .from('patient_invoices')
        .update({
          status: 'refunded',
          metadata: { ...asRecord(invoice?.metadata), last_refund_id: refundId },
        })
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId);
    }

    await admin.from('patient_timeline_events').insert({
      tenant_id: tenantId,
      patient_id: patientId,
      event_type: 'pagamento',
      category: 'financial',
      title: fullRefund ? 'Pagamento estornado' : 'Estorno parcial registrado',
      description: fullRefund
        ? 'Estorno financeiro processado pelo provedor.'
        : 'Estorno parcial processado pelo provedor.',
      status: 'recorded',
      status_label: fullRefund ? 'estornado' : 'parcial',
      event_at: processedAt,
      payload: {
        provider: MERCADOPAGO_PROVIDER,
        refundId,
        invoiceId,
        paymentId: paymentId || null,
      },
    });

    await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: user.id,
      action: 'billing_refund.succeeded',
      entity_type: 'billing_refund',
      entity_id: refundId,
      metadata: { provider: MERCADOPAGO_PROVIDER, patientId, invoiceId, amountCents, fullRefund },
    });

    return jsonResponse(
      Deno.env,
      200,
      {
        ok: true,
        data: {
          id: refundId,
          status: 'succeeded',
          amount_cents: amountCents,
          processed_at: processedAt,
        },
        meta: { tenantId, timestamp },
      },
      req
    );
  } catch (error) {
    console.error('[mercadopago-refund-payment] unexpected_error', {
      message: safeErrorMessage(error),
    });
    return jsonResponse(
      Deno.env,
      500,
      {
        ok: false,
        error: { code: 'internal_error', message: 'Unexpected server error.' },
        meta: { timestamp },
      },
      req
    );
  }
});
