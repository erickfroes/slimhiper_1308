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

function bearerToken(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function maskWalletId(value: unknown) {
  const walletId = asString(value);
  return walletId ? `${walletId.slice(0, 4)}***` : null;
}

async function resolveTenant(params: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
}) {
  const { supabase, userId } = params;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('active_tenant_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) throw profileError;

  const activeTenantId = asString(profile?.active_tenant_id);
  if (activeTenantId) {
    const { data: membership, error: membershipError } = await supabase
      .from('tenant_memberships')
      .select('tenant_id')
      .eq('tenant_id', activeTenantId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (membership?.tenant_id) return String(membership.tenant_id);
  }

  const { data: membership, error: membershipError } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;
  return membership?.tenant_id ? String(membership.tenant_id) : '';
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
      console.error('[asaas-create-tenant-subaccount] missing environment configuration');
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

    const tenantId = await resolveTenant({ supabase, userId: user.id });
    if (!tenantId) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'No active tenant membership.' },
        meta: { timestamp },
      });
    }

    const { data: canWrite, error: permissionError } = await supabase.rpc('has_permission', {
      p_tenant_id: tenantId,
      p_permission: 'financial.write',
    });

    if (permissionError) throw permissionError;
    if (canWrite !== true) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing financial.write permission.' },
        meta: { tenantId, timestamp },
      });
    }

    const { data: existing, error: existingError } = await supabase
      .from('asaas_subaccounts')
      .select('id, status, wallet_id_masked')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing?.id) {
      return jsonResponse(200, {
        ok: true,
        data: {
          id: existing.id,
          status: existing.status ?? 'active',
          wallet_id_masked: existing.wallet_id_masked ?? null,
        },
        meta: { tenantId, timestamp, reused: true },
      });
    }

    const body = await req.json().catch(() => ({}));
    const payload = {
      name: asString(body?.name, 'SlimHiper Clinic'),
      email: asString(body?.email) || undefined,
    };

    const providerResponse = await fetch(`${asaasBase}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: asaasKey },
      body: JSON.stringify(payload),
    });

    if (!providerResponse.ok) {
      console.error('[asaas-create-tenant-subaccount] provider_error', {
        status: providerResponse.status,
      });
      return jsonResponse(502, {
        ok: false,
        error: { code: 'asaas_error', message: 'Billing provider request failed.' },
        meta: { tenantId, timestamp },
      });
    }

    const providerData = await providerResponse.json().catch(() => ({}));
    const providerAccountId = asString(providerData.id);
    if (!providerAccountId) {
      return jsonResponse(502, {
        ok: false,
        error: { code: 'asaas_invalid_response', message: 'Billing provider response invalid.' },
        meta: { tenantId, timestamp },
      });
    }

    const walletMasked = maskWalletId(providerData.walletId);
    const { data: account, error: accountError } = await supabase
      .from('tenant_billing_accounts')
      .upsert(
        {
          tenant_id: tenantId,
          provider: 'asaas',
          status: 'active',
          wallet_id: asString(providerData.walletId) || null,
          wallet_id_masked: walletMasked,
          metadata: { provider: 'asaas' },
        },
        { onConflict: 'tenant_id' }
      )
      .select('id')
      .single();

    if (accountError) throw accountError;

    const { data: subaccount, error: subaccountError } = await supabase
      .from('asaas_subaccounts')
      .upsert(
        {
          tenant_id: tenantId,
          tenant_billing_account_id: account.id,
          asaas_account_id: providerAccountId,
          wallet_id: asString(providerData.walletId) || null,
          wallet_id_masked: walletMasked,
          account_name: asString(providerData.name, payload.name),
          status: 'active',
          masked_metadata: { email: asString(providerData.email) || null },
        },
        { onConflict: 'tenant_billing_account_id' }
      )
      .select('id, status, wallet_id_masked')
      .single();

    if (subaccountError) throw subaccountError;

    return jsonResponse(200, {
      ok: true,
      data: {
        id: subaccount.id,
        status: subaccount.status,
        wallet_id_masked: subaccount.wallet_id_masked ?? null,
      },
      meta: { tenantId, timestamp },
    });
  } catch (error) {
    console.error('[asaas-create-tenant-subaccount] unexpected_error', {
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
