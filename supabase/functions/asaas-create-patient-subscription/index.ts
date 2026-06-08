import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envString } from '../_shared/env.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

const baseCorsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function configuredAllowedOrigins() {
  return new Set(
    [
      ...(Deno.env.get('APP_ALLOWED_ORIGINS') ?? '').split(','),
      Deno.env.get('SITE_URL') ?? '',
      Deno.env.get('NEXT_PUBLIC_SITE_URL') ?? '',
      'http://localhost:4028',
      'http://127.0.0.1:4028',
    ]
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function isLocalOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function allowedCorsOrigin(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  if (!origin) return null;
  const configured = configuredAllowedOrigins();
  return configured.has(origin) || isLocalOrigin(origin) ? origin : null;
}

function defaultCorsOrigin() {
  return configuredAllowedOrigins().values().next().value ?? null;
}

function corsHeaders(req?: Request) {
  const headers: Record<string, string> = { ...baseCorsHeaders };
  const origin = req ? allowedCorsOrigin(req) : defaultCorsOrigin();
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

const cycleMap: Record<string, { local: string; provider: string }> = {
  weekly: { local: 'weekly', provider: 'WEEKLY' },
  biweekly: { local: 'biweekly', provider: 'BIWEEKLY' },
  monthly: { local: 'monthly', provider: 'MONTHLY' },
  quarterly: { local: 'quarterly', provider: 'QUARTERLY' },
  yearly: { local: 'yearly', provider: 'YEARLY' },
};

function jsonResponse(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders() });
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

function normalizeSubscriptionStatus(value: unknown) {
  const normalized = String(value ?? '').toLowerCase();
  if (['active', 'ativo'].includes(normalized)) return 'active';
  if (['paused', 'pause'].includes(normalized)) return 'paused';
  if (['cancelled', 'canceled', 'inactive', 'expired'].includes(normalized)) return 'canceled';
  return 'active';
}

async function getOrCreateBillingExternalReference(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  patientId: string
) {
  const existing = await admin
    .from('billing_external_references')
    .select('reference')
    .eq('tenant_id', tenantId)
    .eq('patient_id', patientId)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data?.reference) return String(existing.data.reference);

  const reference = `shr_${crypto.randomUUID().replaceAll('-', '')}`;
  const inserted = await admin
    .from('billing_external_references')
    .insert({
      tenant_id: tenantId,
      patient_id: patientId,
      reference,
      metadata: { source: 'asaas-create-patient-subscription' },
    })
    .select('reference')
    .single();

  if (!inserted.error && inserted.data?.reference) return String(inserted.data.reference);

  const retry = await admin
    .from('billing_external_references')
    .select('reference')
    .eq('tenant_id', tenantId)
    .eq('patient_id', patientId)
    .maybeSingle();

  if (retry.error) throw retry.error;
  if (retry.data?.reference) return String(retry.data.reference);
  throw inserted.error ?? new Error('billing_external_reference_failed');
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

  if (req.method === 'OPTIONS') {
    if (req.headers.get('Origin') && !allowedCorsOrigin(req)) {
      return new Response('forbidden', { status: 403, headers: corsHeaders(req) });
    }
    return new Response('ok', { headers: corsHeaders(req) });
  }

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
      console.error('[asaas-create-patient-subscription] missing environment configuration');
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
    const nextDueDate = asString(body?.next_due_date);
    const description = asString(body?.description, 'Assinatura SlimHiper').slice(0, 240);
    const cycle = cycleMap[String(body?.cycle ?? 'monthly').toLowerCase()] ?? cycleMap.monthly;
    const idempotencyKey = safeIdempotencyKey(body?.idempotency_key ?? body?.idempotencyKey);

    if (!patientId || !amountCents || !nextDueDate || !isDateInput(nextDueDate)) {
      return jsonResponse(400, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'patient_id, amount_cents and next_due_date are required.',
        },
        meta: { timestamp },
      });
    }

    const tenantResolution = await resolvePatientTenant({ supabase, userId: user.id, patientId });
    if (tenantResolution.error) return tenantResolution.error;
    const tenantId = tenantResolution.tenantId as string;

    if (idempotencyKey) {
      const { data: existingSubscription, error: existingSubscriptionError } = await admin
        .from('patient_subscriptions')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .eq('metadata->>idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingSubscriptionError) throw existingSubscriptionError;
      if (existingSubscription?.id) {
        return jsonResponse(200, {
          ok: true,
          data: {
            id: existingSubscription.id,
            status: existingSubscription.status,
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
          message: 'Create the patient billing customer before creating subscriptions.',
        },
        meta: { tenantId, timestamp },
      });
    }

    const externalReference = await getOrCreateBillingExternalReference(admin, tenantId, patientId);

    const providerResponse = await fetch(`${asaasBase}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: asaasKey },
      body: JSON.stringify({
        customer: customer.asaas_customer_id,
        billingType: normalizeBillingType(body?.billing_type),
        value: amountCents / 100,
        nextDueDate,
        cycle: cycle.provider,
        description,
        externalReference,
      }),
    });

    if (!providerResponse.ok) {
      console.error('[asaas-create-patient-subscription] provider_error', {
        status: providerResponse.status,
      });
      return jsonResponse(502, {
        ok: false,
        error: { code: 'asaas_error', message: 'Billing provider request failed.' },
        meta: { tenantId, timestamp },
      });
    }

    const providerData = await providerResponse.json().catch(() => ({}));
    const providerSubscriptionId = asString(providerData.id);
    if (!providerSubscriptionId) {
      return jsonResponse(502, {
        ok: false,
        error: { code: 'asaas_invalid_response', message: 'Billing provider response invalid.' },
        meta: { tenantId, timestamp },
      });
    }

    const { data: subscription, error: insertError } = await admin
      .from('patient_subscriptions')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        patient_customer_id: customer.id,
        asaas_subscription_id: providerSubscriptionId,
        status: normalizeSubscriptionStatus(providerData.status),
        cycle: cycle.local,
        amount_cents: amountCents,
        next_due_date: nextDueDate,
        metadata: {
          provider: 'asaas',
          description,
          external_reference: externalReference,
          idempotency_key: idempotencyKey || null,
        },
      })
      .select('id, status')
      .single();

    if (insertError) throw insertError;

    return jsonResponse(200, {
      ok: true,
      data: { id: subscription.id, status: subscription.status },
      meta: { tenantId, timestamp },
    });
  } catch (error) {
    console.error('[asaas-create-patient-subscription] unexpected_error', {
      message: safeErrorMessage(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
