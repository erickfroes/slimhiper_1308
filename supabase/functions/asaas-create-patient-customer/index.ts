import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function bearerToken(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const asaasKey = Deno.env.get('ASAAS_API_KEY');
    const asaasBase = Deno.env.get('ASAAS_BASE_URL');

    if (!supabaseUrl || !anonKey || !asaasKey || !asaasBase) {
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

    const { data: existingCustomer, error: existingError } = await supabase
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

    const providerResponse = await fetch(`${asaasBase}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: asaasKey },
      body: JSON.stringify({
        name: patientName,
        email: asString(pii?.email) || undefined,
        mobilePhone: safePhone(pii?.phone),
        externalReference: patientId,
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

    const { data: customer, error: upsertError } = await supabase
      .from('patient_customers')
      .upsert(
        {
          tenant_id: tenantId,
          patient_id: patientId,
          asaas_customer_id: providerCustomerId,
          status: 'active',
          metadata: { provider: 'asaas' },
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
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
