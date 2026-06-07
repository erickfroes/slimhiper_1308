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

function safePhone(value: unknown) {
  const digits = asString(value).replace(/\D/g, '');
  return digits.length >= 10 ? digits : undefined;
}

function safeCpfCnpj(value: unknown) {
  const digits = asString(value).replace(/\D/g, '');
  return digits.length === 11 || digits.length === 14 ? digits : undefined;
}

function bearerToken(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
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
      metadata: { source: 'asaas-create-patient-customer' },
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
      console.error('[asaas-create-patient-customer] missing environment configuration');
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
    const cpfCnpj = safeCpfCnpj(body?.cpf_cnpj ?? body?.cpfCnpj);
    if (!patientId) {
      return jsonResponse(400, {
        ok: false,
        error: { code: 'invalid_request', message: 'patient_id is required.' },
        meta: { timestamp },
      });
    }

    const tenantResolution = await resolvePatientTenant({ supabase, userId: user.id, patientId });
    if (tenantResolution.error) return tenantResolution.error;
    const tenantId = tenantResolution.tenantId as string;

    const { data: existingCustomer, error: existingError } = await admin
      .from('patient_customers')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existingCustomer?.id) {
      return jsonResponse(200, {
        ok: true,
        data: { id: existingCustomer.id, status: existingCustomer.status ?? 'active' },
        meta: { tenantId, timestamp, reused: true },
      });
    }

    if (!cpfCnpj) {
      return jsonResponse(422, {
        ok: false,
        error: {
          code: 'missing_patient_billing_document',
          message: 'CPF/CNPJ is required to create an Asaas-ready billing customer.',
        },
        meta: { tenantId, timestamp },
      });
    }

    const { data: pii, error: piiError } = await supabase
      .from('patient_pii')
      .select('full_name, email, phone')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (piiError) throw piiError;
    const patientName = asString(pii?.full_name);
    if (!patientName) {
      return jsonResponse(422, {
        ok: false,
        error: {
          code: 'missing_patient_billing_identity',
          message: 'Patient billing identity is incomplete.',
        },
        meta: { tenantId, timestamp },
      });
    }

    const externalReference = await getOrCreateBillingExternalReference(admin, tenantId, patientId);

    const providerResponse = await fetch(`${asaasBase}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: asaasKey },
      body: JSON.stringify({
        name: patientName,
        email: asString(pii?.email) || undefined,
        mobilePhone: safePhone(pii?.phone),
        cpfCnpj,
        externalReference,
      }),
    });

    if (!providerResponse.ok) {
      console.error('[asaas-create-patient-customer] provider_error', {
        status: providerResponse.status,
      });
      return jsonResponse(502, {
        ok: false,
        error: { code: 'asaas_error', message: 'Billing provider request failed.' },
        meta: { tenantId, timestamp },
      });
    }

    const providerData = await providerResponse.json().catch(() => ({}));
    const providerCustomerId = asString(providerData.id);
    if (!providerCustomerId) {
      return jsonResponse(502, {
        ok: false,
        error: { code: 'asaas_invalid_response', message: 'Billing provider response invalid.' },
        meta: { tenantId, timestamp },
      });
    }

    const { data: customer, error: upsertError } = await admin
      .from('patient_customers')
      .upsert(
        {
          tenant_id: tenantId,
          patient_id: patientId,
          asaas_customer_id: providerCustomerId,
          status: 'active',
          metadata: {
            provider: 'asaas',
            cpf_cnpj_last4: cpfCnpj.slice(-4),
            external_reference: externalReference,
          },
        },
        { onConflict: 'tenant_id,patient_id' }
      )
      .select('id, status')
      .single();

    if (upsertError) throw upsertError;

    return jsonResponse(200, {
      ok: true,
      data: { id: customer.id, status: customer.status ?? 'active' },
      meta: { tenantId, timestamp },
    });
  } catch (error) {
    console.error('[asaas-create-patient-customer] unexpected_error', {
      message: safeErrorMessage(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
