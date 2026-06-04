import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envString } from '../_shared/env.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asPositiveInteger(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function isDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime());
}

function bearerToken(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function safeIdempotencyKey(value: unknown) {
  const key = asString(value);
  if (!key) return '';
  return key.length <= 120 ? key : '';
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

function normalizeBillingType(value: unknown) {
  const normalized = String(value ?? 'PIX').toUpperCase();
  if (['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'].includes(normalized)) return normalized;
  return 'PIX';
}

function normalizeInvoiceStatus(value: unknown) {
  const normalized = String(value ?? '').toLowerCase();
  if (
    ['paid', 'received', 'confirmed', 'payment_received', 'payment_confirmed'].includes(normalized)
  ) {
    return 'paid';
  }
  if (['overdue', 'payment_overdue'].includes(normalized)) return 'overdue';
  if (
    ['deleted', 'cancelled', 'canceled', 'payment_deleted', 'payment_cancelled'].includes(
      normalized
    )
  ) {
    return 'cancelled';
  }
  return 'pending';
}

async function resolvePatientTenant(params: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  patientId: string;
}) {
  const { supabase, userId, patientId } = params;
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id, tenant_id')
    .eq('id', patientId)
    .maybeSingle();

  if (patientError) throw patientError;
  if (!patient) return { error: jsonResponse(404, { ok: false, error: { code: 'not_found' } }) };

  const tenantId = String(patient.tenant_id ?? '');
  const { data: membership, error: membershipError } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    return {
      error: jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'No active tenant membership.' },
      }),
    };
  }

  const { data: canWrite, error: permissionError } = await supabase.rpc('has_permission', {
    p_tenant_id: tenantId,
    p_permission: 'financial.write',
  });

  if (permissionError) throw permissionError;
  if (canWrite !== true) {
    return {
      error: jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing financial.write permission.' },
      }),
    };
  }

  return { tenantId };
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
      console.error('[asaas-create-patient-invoice] missing environment configuration');
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
    const patientId = asString(body?.patient_id);
    const amountCents = asPositiveInteger(body?.amount_cents);
    const dueDate = asString(body?.due_date);
    const description = asString(body?.description).slice(0, 240);
    const idempotencyKey = safeIdempotencyKey(body?.idempotency_key ?? body?.idempotencyKey);

    if (!patientId || !amountCents || !dueDate || !isDateInput(dueDate) || !description) {
      return jsonResponse(400, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'patient_id, amount_cents, due_date and description are required.',
        },
        meta: { timestamp },
      });
    }

    const tenantResolution = await resolvePatientTenant({ supabase, userId: user.id, patientId });
    if (tenantResolution.error) return tenantResolution.error;
    const tenantId = tenantResolution.tenantId as string;

    if (idempotencyKey) {
      const { data: existingInvoice, error: existingInvoiceError } = await admin
        .from('patient_invoices')
        .select('id, status, invoice_url, payment_link')
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .eq('metadata->>idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingInvoiceError) throw existingInvoiceError;
      if (existingInvoice?.id) {
        return jsonResponse(200, {
          ok: true,
          data: {
            id: existingInvoice.id,
            status: existingInvoice.status,
            invoice_url: existingInvoice.invoice_url ?? null,
            payment_link: existingInvoice.payment_link ?? null,
          },
          meta: { tenantId, timestamp, reused: true },
        });
      }
    }

    const { data: customer, error: customerError } = await admin
      .from('patient_customers')
      .select('id, asaas_customer_id')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer?.asaas_customer_id) {
      return jsonResponse(409, {
        ok: false,
        error: {
          code: 'customer_required',
          message: 'Create the patient billing customer before creating invoices.',
        },
        meta: { tenantId, timestamp },
      });
    }

    const providerResponse = await fetch(`${asaasBase}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: asaasKey },
      body: JSON.stringify({
        customer: customer.asaas_customer_id,
        billingType: normalizeBillingType(body?.billing_type),
        value: amountCents / 100,
        dueDate,
        description,
        externalReference: patientId,
      }),
    });

    if (!providerResponse.ok) {
      console.error('[asaas-create-patient-invoice] provider_error', {
        status: providerResponse.status,
      });
      return jsonResponse(502, {
        ok: false,
        error: { code: 'asaas_error', message: 'Billing provider request failed.' },
        meta: { tenantId, timestamp },
      });
    }

    const providerData = await providerResponse.json().catch(() => ({}));
    const providerInvoiceId = asString(providerData.id);
    if (!providerInvoiceId) {
      return jsonResponse(502, {
        ok: false,
        error: { code: 'asaas_invalid_response', message: 'Billing provider response invalid.' },
        meta: { tenantId, timestamp },
      });
    }

    const invoiceUrl = asString(providerData.invoiceUrl ?? providerData.invoice_url) || null;
    const paymentLink =
      asString(providerData.bankSlipUrl ?? providerData.invoiceUrl ?? providerData.invoice_url) ||
      null;

    const { data: invoice, error: insertError } = await admin
      .from('patient_invoices')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        patient_customer_id: customer.id,
        asaas_invoice_id: providerInvoiceId,
        status: normalizeInvoiceStatus(providerData.status),
        amount_cents: amountCents,
        due_date: dueDate,
        description,
        invoice_url: invoiceUrl,
        payment_link: paymentLink,
        metadata: {
          provider: 'asaas',
          invoice_number: providerData.invoiceNumber ?? null,
          idempotency_key: idempotencyKey || null,
        },
      })
      .select('id, status, invoice_url, payment_link')
      .single();

    if (insertError) throw insertError;

    return jsonResponse(200, {
      ok: true,
      data: {
        id: invoice.id,
        status: invoice.status,
        invoice_url: invoice.invoice_url ?? null,
        payment_link: invoice.payment_link ?? null,
      },
      meta: { tenantId, timestamp },
    });
  } catch (error) {
    console.error('[asaas-create-patient-invoice] unexpected_error', {
      message: safeErrorMessage(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
