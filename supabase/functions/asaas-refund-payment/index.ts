import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envString } from '../_shared/env.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': (Deno.env.get('APP_ALLOWED_ORIGINS') ?? Deno.env.get('SITE_URL') ?? Deno.env.get('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:4028').split(',')[0].trim(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function bearerToken(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asPositiveInteger(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function safeReason(value: unknown) {
  return asString(value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .slice(0, 500);
}

function safeIdempotencyKey(value: unknown) {
  const key = asString(value);
  return key && key.length <= 120 ? key : '';
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      error: { code: 'method_not_allowed', message: 'Only POST is allowed.' },
      meta: { timestamp },
    });
  }

  try {
    const token = bearerToken(req);
    if (!token) {
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized', message: 'Missing bearer token.' },
        meta: { timestamp },
      });
    }

    const supabaseUrl = envString(Deno.env, 'SUPABASE_URL');
    const anonKey = envString(Deno.env, 'SUPABASE_ANON_KEY');
    const serviceRoleKey = envString(Deno.env, 'SUPABASE_SERVICE_ROLE_KEY');
    const asaasKey = envString(Deno.env, 'ASAAS_API_KEY');
    const asaasBase = envString(Deno.env, 'ASAAS_BASE_URL');

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !asaasKey || !asaasBase) {
      console.error('[asaas-refund-payment] missing environment configuration');
      return jsonResponse(500, {
        ok: false,
        error: { code: 'server_misconfigured', message: 'Billing provider is not configured.' },
        meta: { timestamp },
      });
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
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized', message: 'Invalid or expired token.' },
        meta: { timestamp },
      });
    }

    const body = await req.json().catch(() => null);
    const localPaymentId = asString(body?.payment_id ?? body?.paymentId);
    const localInvoiceId = asString(body?.invoice_id ?? body?.invoiceId);
    const amountCents = asPositiveInteger(body?.amount_cents ?? body?.amountCents);
    const reason = safeReason(body?.reason);
    const idempotencyKey = safeIdempotencyKey(body?.idempotency_key ?? body?.idempotencyKey);

    if ((!localPaymentId && !localInvoiceId) || !amountCents || reason.length < 10) {
      return jsonResponse(400, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'payment_id or invoice_id, amount_cents and a refund reason are required.',
        },
        meta: { timestamp },
      });
    }

    let payment: Record<string, unknown> | null = null;
    let invoice: Record<string, unknown> | null = null;

    if (localPaymentId) {
      const paymentResult = await admin
        .from('payments')
        .select(
          'id,tenant_id,patient_id,patient_invoice_id,asaas_payment_id,amount_cents,status,metadata'
        )
        .eq('id', localPaymentId)
        .maybeSingle();
      if (paymentResult.error) throw paymentResult.error;
      payment = paymentResult.data ? asRecord(paymentResult.data) : null;
    }

    const invoiceIdFromPayment = asString(payment?.patient_invoice_id);
    const invoiceLookupId = localInvoiceId || invoiceIdFromPayment;
    if (invoiceLookupId) {
      const invoiceResult = await admin
        .from('patient_invoices')
        .select('id,tenant_id,patient_id,asaas_invoice_id,amount_cents,status,paid_at,metadata')
        .eq('id', invoiceLookupId)
        .maybeSingle();
      if (invoiceResult.error) throw invoiceResult.error;
      invoice = invoiceResult.data ? asRecord(invoiceResult.data) : null;
    }

    if (!payment && invoice) {
      const paymentResult = await admin
        .from('payments')
        .select(
          'id,tenant_id,patient_id,patient_invoice_id,asaas_payment_id,amount_cents,status,metadata'
        )
        .eq('tenant_id', invoice.tenant_id)
        .eq('patient_invoice_id', invoice.id)
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
    const providerPaymentId = asString(payment?.asaas_payment_id ?? invoice?.asaas_invoice_id);
    const localAmountCents = Number(payment?.amount_cents ?? invoice?.amount_cents ?? 0);

    if (!tenantId || !patientId || !providerPaymentId || !Number.isFinite(localAmountCents)) {
      return jsonResponse(404, {
        ok: false,
        error: { code: 'payment_not_found', message: 'Refundable payment was not found.' },
        meta: { timestamp },
      });
    }

    if (amountCents > localAmountCents) {
      return jsonResponse(422, {
        ok: false,
        error: { code: 'amount_exceeds_payment', message: 'Refund amount exceeds payment amount.' },
        meta: { tenantId, timestamp },
      });
    }

    const canWrite = await requireFinancialWrite({ supabase, userId: user.id, tenantId });
    if (!canWrite) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing financial.write permission.' },
        meta: { tenantId, timestamp },
      });
    }

    if (idempotencyKey) {
      const existingRefund = await admin
        .from('billing_refunds')
        .select('id,status,amount_cents,processed_at')
        .eq('tenant_id', tenantId)
        .eq('metadata->>idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingRefund.error) throw existingRefund.error;
      if (existingRefund.data?.id) {
        return jsonResponse(200, {
          ok: true,
          data: {
            id: existingRefund.data.id,
            status: existingRefund.data.status,
            amount_cents: existingRefund.data.amount_cents,
            processed_at: existingRefund.data.processed_at ?? null,
          },
          meta: { tenantId, timestamp, reused: true },
        });
      }
    }

    const refundInsert = await admin
      .from('billing_refunds')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        patient_invoice_id: invoiceId,
        payment_id: paymentId || null,
        status: 'processing',
        amount_cents: amountCents,
        reason,
        requested_by: user.id,
        metadata: { idempotency_key: idempotencyKey || null },
      })
      .select('id,status')
      .single();

    if (refundInsert.error) throw refundInsert.error;
    const refundId = String(refundInsert.data.id);

    const providerResponse = await fetch(
      `${asaasBase}/payments/${encodeURIComponent(providerPaymentId)}/refund`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', access_token: asaasKey },
        body: JSON.stringify({ value: amountCents / 100, description: reason }),
      }
    );

    if (!providerResponse.ok) {
      console.error('[asaas-refund-payment] provider_error', { status: providerResponse.status });
      await admin
        .from('billing_refunds')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString(),
          error_code: `asaas_${providerResponse.status}`,
        })
        .eq('id', refundId)
        .eq('tenant_id', tenantId);

      return jsonResponse(502, {
        ok: false,
        error: { code: 'asaas_error', message: 'Billing provider refund failed.' },
        meta: { tenantId, timestamp },
      });
    }

    const providerData = await providerResponse.json().catch(() => ({}));
    const providerRecord = asRecord(providerData);
    const providerRefundId = asString(providerRecord.id ?? providerRecord.refundId) || null;
    const providerStatus = asString(providerRecord.status, 'succeeded');
    const fullRefund = amountCents >= localAmountCents;
    const processedAt = new Date().toISOString();

    await admin
      .from('billing_refunds')
      .update({
        status: 'succeeded',
        processed_at: processedAt,
        provider_refund_id: providerRefundId,
        provider_status: providerStatus,
        metadata: {
          idempotency_key: idempotencyKey || null,
          provider_status: providerStatus,
          full_refund: fullRefund,
        },
      })
      .eq('id', refundId)
      .eq('tenant_id', tenantId);

    if (paymentId) {
      const paymentMetadata = asRecord(payment?.metadata);
      await admin
        .from('payments')
        .update({
          status: fullRefund ? 'refunded' : asString(payment?.status, 'paid'),
          metadata: {
            ...paymentMetadata,
            last_refund_id: refundId,
            refunded_amount_cents: amountCents,
            refund_status: fullRefund ? 'full' : 'partial',
          },
        })
        .eq('id', paymentId)
        .eq('tenant_id', tenantId);
    }

    if (invoiceId && fullRefund) {
      const invoiceMetadata = asRecord(invoice?.metadata);
      await admin
        .from('patient_invoices')
        .update({
          status: 'refunded',
          metadata: { ...invoiceMetadata, last_refund_id: refundId },
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
        ? 'Estorno financeiro processado pelo gateway.'
        : 'Estorno parcial processado pelo gateway.',
      status: 'recorded',
      status_label: fullRefund ? 'estornado' : 'parcial',
      event_at: processedAt,
      payload: { refundId, invoiceId, paymentId: paymentId || null },
    });

    await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: user.id,
      action: 'billing_refund.succeeded',
      entity_type: 'billing_refund',
      entity_id: refundId,
      metadata: { patientId, invoiceId, paymentId: paymentId || null, amountCents, fullRefund },
    });

    return jsonResponse(200, {
      ok: true,
      data: {
        id: refundId,
        status: 'succeeded',
        amount_cents: amountCents,
        processed_at: processedAt,
      },
      meta: { tenantId, timestamp },
    });
  } catch (error) {
    console.error('[asaas-refund-payment] unexpected_error', { message: safeErrorMessage(error) });
    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
