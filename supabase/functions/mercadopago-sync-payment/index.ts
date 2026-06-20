import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envString } from '../_shared/env.ts';
import { tenantHasFeatureFlag } from '../_shared/plan-entitlements.ts';
import {
  amountToCents,
  asRecord,
  asString,
  bearerToken,
  corsHeaders,
  jsonResponse,
  mercadoPagoFetch,
  MERCADOPAGO_FEATURE_FLAGS,
  MERCADOPAGO_PROVIDER,
  normalizePaymentStatus,
  safeErrorMessage,
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

async function upsertPayment(params: {
  admin: ReturnType<typeof createClient>;
  tenantId: string;
  patientId: string;
  invoiceId: string;
  providerPaymentId: string;
  paymentStatus: string;
  amountCents: number;
  paidAt: string | null;
  dueDate: string | null;
  method: string | null;
  metadata: Record<string, unknown>;
}) {
  const {
    admin,
    tenantId,
    patientId,
    invoiceId,
    providerPaymentId,
    paymentStatus,
    amountCents,
    paidAt,
    dueDate,
    method,
    metadata,
  } = params;

  const existing = await admin
    .from('payments')
    .select('id,metadata')
    .eq('tenant_id', tenantId)
    .eq('provider', MERCADOPAGO_PROVIDER)
    .eq('provider_payment_id', providerPaymentId)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const payload = {
    tenant_id: tenantId,
    patient_id: patientId,
    patient_invoice_id: invoiceId,
    provider: MERCADOPAGO_PROVIDER,
    provider_payment_id: providerPaymentId,
    status: paymentStatus,
    amount_cents: amountCents,
    paid_at: paidAt,
    due_date: dueDate,
    method,
    metadata: { ...asRecord(existing.data?.metadata), ...metadata },
  };

  if (existing.data?.id) {
    const updateResult = await admin
      .from('payments')
      .update(payload)
      .eq('id', existing.data.id)
      .eq('tenant_id', tenantId);
    if (updateResult.error) throw updateResult.error;
    return existing.data.id as string;
  }

  const insertResult = await admin.from('payments').insert(payload).select('id').single();
  if (insertResult.error) throw insertResult.error;
  return String(insertResult.data.id);
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
      console.error('[mercadopago-sync-payment] missing environment configuration');
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
    const localInvoiceId = asString(body?.invoice_id ?? body?.invoiceId);
    const reason = safeText(body?.reason || 'manual_sync', 160);

    if (!localInvoiceId) {
      return jsonResponse(
        Deno.env,
        400,
        {
          ok: false,
          error: { code: 'invalid_request', message: 'invoice_id is required.' },
          meta: { timestamp },
        },
        req
      );
    }

    const invoiceResult = await admin
      .from('patient_invoices')
      .select(
        'id,tenant_id,patient_id,provider,provider_payment_id,provider_invoice_id,provider_preference_id,amount_cents,status,due_date,paid_at,metadata'
      )
      .eq('id', localInvoiceId)
      .eq('provider', MERCADOPAGO_PROVIDER)
      .maybeSingle();

    if (invoiceResult.error) throw invoiceResult.error;
    const invoice = invoiceResult.data ? asRecord(invoiceResult.data) : null;
    const tenantId = asString(invoice?.tenant_id);
    const patientId = asString(invoice?.patient_id);
    const providerPaymentId = asString(invoice?.provider_payment_id);

    if (!invoice || !tenantId || !patientId) {
      return jsonResponse(
        Deno.env,
        404,
        {
          ok: false,
          error: { code: 'invoice_not_found', message: 'Provider-backed invoice was not found.' },
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
            message: 'Payment id is resolved by webhook before direct payment sync.',
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

    const jobInsert = await admin
      .from('billing_sync_jobs')
      .insert({
        tenant_id: tenantId,
        patient_invoice_id: localInvoiceId,
        provider: MERCADOPAGO_PROVIDER,
        status: 'processing',
        source: 'edge',
        reason,
        requested_by: user.id,
      })
      .select('id')
      .single();

    if (jobInsert.error) throw jobInsert.error;
    const jobId = String(jobInsert.data.id);

    const providerResponse = await mercadoPagoFetch(
      Deno.env,
      `/v1/payments/${encodeURIComponent(providerPaymentId)}`,
      { method: 'GET' }
    );

    if (!providerResponse.ok) {
      console.error('[mercadopago-sync-payment] provider_error', {
        status: providerResponse.status,
      });
      await admin
        .from('billing_sync_jobs')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString(),
          error_code: providerResponse.errorCode,
        })
        .eq('id', jobId)
        .eq('tenant_id', tenantId);

      return jsonResponse(
        Deno.env,
        providerResponse.status === 0 ? 500 : 502,
        {
          ok: false,
          error: { code: providerResponse.errorCode, message: 'Billing provider sync failed.' },
          meta: { tenantId, timestamp },
        },
        req
      );
    }

    const providerRecord = asRecord(providerResponse.data);
    const providerStatus = asString(providerRecord.status);
    const mapping = normalizePaymentStatus(providerStatus);
    const amountCents =
      amountToCents(providerRecord.transaction_amount) || Number(invoice.amount_cents ?? 0);
    const paidAt =
      mapping.paymentStatus === 'paid'
        ? asString(providerRecord.date_approved) || new Date().toISOString()
        : null;
    const dueDate = asString(invoice.due_date) || null;
    const method =
      asString(providerRecord.payment_method_id) ||
      asString(providerRecord.payment_type_id) ||
      null;
    const processedAt = new Date().toISOString();
    const paymentId = await upsertPayment({
      admin,
      tenantId,
      patientId,
      invoiceId: localInvoiceId,
      providerPaymentId,
      paymentStatus: mapping.paymentStatus,
      amountCents,
      paidAt,
      dueDate,
      method,
      metadata: {
        provider_status: providerStatus || null,
        provider_preference_id:
          asString(providerRecord.preference_id) ||
          asString(invoice.provider_preference_id) ||
          null,
        provider_order_id: asString(asRecord(providerRecord.order).id) || null,
        source: 'mercadopago-sync-payment',
        sync_job_id: jobId,
      },
    });

    await admin
      .from('patient_invoices')
      .update({
        status: mapping.invoiceStatus,
        paid_at: paidAt,
        provider_payment_id: providerPaymentId,
        metadata: {
          ...asRecord(invoice.metadata),
          provider_status: providerStatus || null,
          provider_financial_state: mapping.financialState,
          payment_id: paymentId,
          synced_at: processedAt,
          sync_job_id: jobId,
        },
      })
      .eq('id', localInvoiceId)
      .eq('tenant_id', tenantId);

    await admin.from('billing_provider_events').insert({
      tenant_id: tenantId,
      provider: MERCADOPAGO_PROVIDER,
      provider_event_id: null,
      event_type: 'PAYMENT_SYNC',
      resource_type: 'payment',
      resource_id: providerPaymentId,
      idempotency_key: `sync:${jobId}`,
      status: 'processed',
      processed_at: processedAt,
      payload_summary: {
        payment_id: providerPaymentId,
        payment_status: providerStatus || null,
        local_invoice_status: mapping.invoiceStatus,
        value_cents: amountCents || null,
      },
    });

    await admin
      .from('billing_sync_jobs')
      .update({
        status: 'succeeded',
        processed_at: processedAt,
        metadata: {
          invoice_status: mapping.invoiceStatus,
          payment_status: mapping.paymentStatus,
          provider_payment_id: providerPaymentId,
        },
      })
      .eq('id', jobId)
      .eq('tenant_id', tenantId);

    await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: user.id,
      action: 'billing_payment.synced',
      entity_type: 'patient_invoice',
      entity_id: localInvoiceId,
      metadata: { provider: MERCADOPAGO_PROVIDER, patientId, syncJobId: jobId, paymentId },
    });

    return jsonResponse(
      Deno.env,
      200,
      {
        ok: true,
        data: {
          id: localInvoiceId,
          sync_job_id: jobId,
          status: mapping.invoiceStatus,
          payment_status: mapping.paymentStatus,
          amount_cents: amountCents,
          synced_at: processedAt,
        },
        meta: { tenantId, timestamp },
      },
      req
    );
  } catch (error) {
    console.error('[mercadopago-sync-payment] unexpected_error', {
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
