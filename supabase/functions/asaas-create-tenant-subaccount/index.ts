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

function bearerToken(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function maskWalletId(value: unknown) {
  const walletId = asString(value);
  return walletId ? `${walletId.slice(0, 4)}***` : null;
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
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

    const supabaseUrl = envString(Deno.env, 'SUPABASE_URL');
    const anonKey = envString(Deno.env, 'SUPABASE_ANON_KEY');
    const serviceRoleKey = envString(Deno.env, 'SUPABASE_SERVICE_ROLE_KEY');
    const asaasKey = envString(Deno.env, 'ASAAS_API_KEY');
    const asaasBase = envString(Deno.env, 'ASAAS_BASE_URL');

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !asaasKey || !asaasBase) {
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

    const { data: existing, error: existingError } = await admin
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

    let billingAccount: {
      id: string;
      status?: string | null;
      wallet_id_masked?: string | null;
    } | null = null;
    const { data: createdAccount, error: accountCreateError } = await admin
      .from('tenant_billing_accounts')
      .insert({
        tenant_id: tenantId,
        provider: 'asaas',
        status: 'pending',
        metadata: { provider: 'asaas', creation_started_at: timestamp },
      })
      .select('id, status, wallet_id_masked')
      .single();

    if (accountCreateError) {
      if (accountCreateError.code !== '23505') throw accountCreateError;

      const { data: pendingAccount, error: pendingAccountError } = await admin
        .from('tenant_billing_accounts')
        .select('id, status, wallet_id_masked')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (pendingAccountError) throw pendingAccountError;

      if (pendingAccount?.id && pendingAccount.status === 'disabled') {
        const { data: retryAccount, error: retryAccountError } = await admin
          .from('tenant_billing_accounts')
          .update({
            status: 'pending',
            metadata: { provider: 'asaas', retry_started_at: timestamp },
          })
          .eq('id', pendingAccount.id)
          .eq('tenant_id', tenantId)
          .eq('status', 'disabled')
          .select('id, status, wallet_id_masked')
          .maybeSingle();

        if (retryAccountError) throw retryAccountError;
        billingAccount = retryAccount?.id ? retryAccount : null;
      }

      if (!billingAccount?.id) {
        return jsonResponse(202, {
          ok: true,
          data: {
            id: pendingAccount?.id ?? null,
            status: pendingAccount?.status ?? 'pending',
            wallet_id_masked: pendingAccount?.wallet_id_masked ?? null,
          },
          meta: {
            tenantId,
            timestamp,
            reused: true,
            creation_in_progress: true,
          },
        });
      }
    } else {
      billingAccount = createdAccount;
    }

    if (!billingAccount?.id) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'account_lock_failed', message: 'Billing account lock was not created.' },
        meta: { tenantId, timestamp },
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
      await admin
        .from('tenant_billing_accounts')
        .update({
          status: 'disabled',
          metadata: { provider: 'asaas', last_error: 'provider_error' },
        })
        .eq('id', billingAccount.id)
        .eq('tenant_id', tenantId);

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
      await admin
        .from('tenant_billing_accounts')
        .update({
          status: 'disabled',
          metadata: { provider: 'asaas', last_error: 'invalid_provider_response' },
        })
        .eq('id', billingAccount.id)
        .eq('tenant_id', tenantId);

      return jsonResponse(502, {
        ok: false,
        error: { code: 'asaas_invalid_response', message: 'Billing provider response invalid.' },
        meta: { tenantId, timestamp },
      });
    }

    const walletMasked = maskWalletId(providerData.walletId);

    const { data: subaccount, error: subaccountError } = await admin
      .from('asaas_subaccounts')
      .upsert(
        {
          tenant_id: tenantId,
          tenant_billing_account_id: billingAccount.id,
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

    const { error: accountUpdateError } = await admin
      .from('tenant_billing_accounts')
      .update({
        status: 'active',
        wallet_id: asString(providerData.walletId) || null,
        wallet_id_masked: walletMasked,
        metadata: { provider: 'asaas', activated_at: timestamp },
      })
      .eq('id', billingAccount.id)
      .eq('tenant_id', tenantId);

    if (accountUpdateError) throw accountUpdateError;

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
      message: safeErrorMessage(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
