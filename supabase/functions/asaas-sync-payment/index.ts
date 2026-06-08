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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toAmountCents(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function normalizeInvoiceStatus(value: unknown) {
  const normalized = String(value ?? '').toLowerCase();
  if (
    ['received', 'confirmed', 'paid', 'payment_received', 'payment_confirmed'].includes(normalized)
  ) {
    return 'paid';
  }
  if (['overdue', 'payment_overdue'].includes(normalized)) return 'overdue';
  if (['refunded', 'chargeback'].includes(normalized)) return 'refunded';
  if (
    ['deleted', 'cancelled', 'canceled', 'payment_deleted', 'payment_cancelled'].includes(
      normalized
    )
  ) {
    return 'cancelled';
  }
  return 'pending';
}

function normalizePaymentStatus(value: unknown) {
  const invoiceStatus = normalizeInvoiceStatus(value);
  if (invoiceStatus === 'cancelled') return 'canceled';
  return invoiceStatus;
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
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
      console.error('[asaas-sync-payment] missing environment configuration');
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
    const localInvoiceId = asString(body?.invoice_id ?? body?.invoiceId);
    const reason = asString(body?.reason, 'manual_sync').slice(0, 160);

    if (!localInvoiceId) {
      return jsonResponse(400, {
        ok: false,
        error: { code: 'invalid_request', message: 'invoice_id is required.' },
        meta: { timestamp },
      });
    }

    const invoiceResult = await admin
      .from('patient_invoices')
      .select(
        'id,tenant_id,patient_id,patient_customer_id,asaas_invoice_id,amount_cents,status,due_date,paid_at,metadata'
      )
      .eq('id', localInvoiceId)
      .maybeSingle();

    if (invoiceResult.error) throw invoiceResult.error;
    const invoice = invoiceResult.data ? asRecord(invoiceResult.data) : null;
    const tenantId = asString(invoice?.tenant_id);
    const patientId = asString(invoice?.patient_id);
    const providerPaymentId = asString(invoice?.asaas_invoice_id);

    if (!invoice || !tenantId || !patientId || !providerPaymentId) {
      return jsonResponse(404, {
        ok: false,
        error: { code: 'invoice_not_found', message: 'Provider-backed invoice was not found.' },
        meta: { timestamp },
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

    const jobInsert = await admin
      .from('billing_sync_jobs')
      .insert({
        tenant_id: tenantId,
        patient_invoice_id: localInvoiceId,
        status: 'processing',
        source: 'edge',
        reason,
        requested_by: user.id,
      })
      .select('id')
      .single();

    if (jobInsert.error) throw jobInsert.error;
    const jobId = String(jobInsert.data.id);

    const providerResponse = await fetch(
      `${asaasBase}/payments/${encodeURIComponent(providerPaymentId)}`,
      {
        method: 'GET',
        headers: { accept: 'application/json', access_token: asaasKey },
      }
    );

    if (!providerResponse.ok) {
      console.error('[asaas-sync-payment] provider_error', { status: providerResponse.status });
      await admin
        .from('billing_sync_jobs')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString(),
          error_code: `asaas_${providerResponse.status}`,
        })
        .eq('id', jobId)
        .eq('tenant_id', tenantId);

      return jsonResponse(502, {
        ok: false,
        error: { code: 'asaas_error', message: 'Billing provider sync failed.' },
        meta: { tenantId, timestamp },
      });
    }

    const providerData = await providerResponse.json().catch(() => ({}));
    const providerRecord = asRecord(providerData);
    const providerStatus = asString(providerRecord.status);
    const invoiceStatus = normalizeInvoiceStatus(providerStatus);
    const paymentStatus = normalizePaymentStatus(providerStatus);
    const amountCents = toAmountCents(providerRecord.value) || Number(invoice.amount_cents ?? 0);
    const paidAt =
      invoiceStatus === 'paid'
        ? asString(providerRecord.paymentDate ?? providerRecord.clientPaymentDate) ||
          new Date().toISOString()
        : null;
    const dueDate = asString(providerRecord.dueDate) || asString(invoice.due_date) || null;
    const processedAt = new Date().toISOString();

    await admin
      .from('patient_invoices')
      .update({
        status: invoiceStatus,
        paid_at: paidAt,
        due_date: dueDate,
        invoice_url: asString(providerRecord.invoiceUrl ?? providerRecord.invoice_url) || null,
        payment_link:
          asString(
            providerRecord.bankSlipUrl,
            asString(providerRecord.invoiceUrl ?? providerRecord.invoice_url)
          ) || null,
        metadata: {
          ...asRecord(invoice.metadata),
          provider_status: providerStatus || null,
          synced_at: processedAt,
          sync_job_id: jobId,
        },
      })
      .eq('id', localInvoiceId)
      .eq('tenant_id', tenantId);

    if (amountCents > 0) {
      await admin.from('payments').upsert(
        {
          tenant_id: tenantId,
          patient_id: patientId,
          patient_invoice_id: localInvoiceId,
          asaas_payment_id: providerPaymentId,
          status: paymentStatus,
          amount_cents: amountCents,
          paid_at: paymentStatus === 'paid' ? (paidAt ?? processedAt) : null,
          due_date: dueDate,
          method: asString(providerRecord.billingType).toLowerCase() || null,
          metadata: {
            provider_status: providerStatus || null,
            source: 'asaas-sync-payment',
            sync_job_id: jobId,
          },
        },
        { onConflict: 'asaas_payment_id' }
      );
    }

    await admin.from('asaas_events').insert({
      tenant_id: tenantId,
      event_type: 'PAYMENT_SYNC',
      asaas_event_id: null,
      external_reference: asString(providerRecord.externalReference) || null,
      idempotency_key: `sync:${jobId}`,
      status: 'processed',
      processed_at: processedAt,
      payload_summary: {
        event: 'PAYMENT_SYNC',
        payment_status: providerStatus || null,
        value_cents: amountCents || null,
        due_date: dueDate,
      },
    });

    await admin
      .from('billing_sync_jobs')
      .update({
        status: 'succeeded',
        processed_at: processedAt,
        metadata: { invoice_status: invoiceStatus, payment_status: paymentStatus },
      })
      .eq('id', jobId)
      .eq('tenant_id', tenantId);

    await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: user.id,
      action: 'billing_payment.synced',
      entity_type: 'patient_invoice',
      entity_id: localInvoiceId,
      metadata: { patientId, syncJobId: jobId, invoiceStatus },
    });

    return jsonResponse(200, {
      ok: true,
      data: {
        id: localInvoiceId,
        sync_job_id: jobId,
        status: invoiceStatus,
        payment_status: paymentStatus,
        amount_cents: amountCents,
        synced_at: processedAt,
      },
      meta: { tenantId, timestamp },
    });
  } catch (error) {
    console.error('[asaas-sync-payment] unexpected_error', { message: safeErrorMessage(error) });
    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
