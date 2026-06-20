import { NextResponse } from 'next/server';
import {
  encryptMercadoPagoToken,
  hashMercadoPagoOAuthState,
  maskMercadoPagoAccountRef,
} from '@/lib/mercadopago/tokenCrypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentAppSession, type AppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function canManageTenantMercadoPago(session: AppSession, tenantId: string) {
  if (isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole)) {
    return true;
  }
  return session.activeTenant?.id === tenantId && session.permissions.includes('financial.write');
}

function appRedirectUrl(request: Request, tenantId: string, status: string, session: AppSession) {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || '';
  let origin = new URL(request.url).origin;
  if (configuredOrigin) {
    try {
      origin = new URL(configuredOrigin).origin;
    } catch {
      origin = new URL(request.url).origin;
    }
  }
  const path =
    isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole)
      ? `/admin/tenants/${tenantId}?tab=integrations&mercadopago=${status}`
      : `/clinic/settings?mercadopago=${status}`;
  return new URL(path, origin);
}

function isOAuthTestTokenEnabled() {
  return ['true', '1', 'yes', 'sim'].includes(
    (process.env.MERCADOPAGO_OAUTH_TEST_TOKEN ?? '').trim().toLowerCase()
  );
}

function mercadoPagoBaseUrl() {
  return (process.env.MERCADOPAGO_BASE_URL?.trim() || 'https://api.mercadopago.com').replace(
    /\/+$/,
    ''
  );
}

function tokenExpiresAt(seconds: unknown) {
  const parsed = Number(seconds);
  const safeSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 15552000;
  return new Date(Date.now() + safeSeconds * 1000).toISOString();
}

function mergeMercadoPagoSettings(
  settings: unknown,
  params: { status: string; accountRef: string }
) {
  const current = asRecord(settings);
  const integrations = asRecord(current.integrations);
  const mercadopago = asRecord(integrations.mercadopago);
  return {
    ...current,
    paymentMethod: 'mercadopago',
    integrations: {
      ...integrations,
      mercadopago: {
        ...mercadopago,
        status: params.status,
        accountRef: params.accountRef,
        connectedAt: new Date().toISOString(),
        disconnectedAt: null,
        errorCode: null,
      },
    },
  };
}

async function markStateFailed(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  stateId: string,
  errorCode: string
) {
  if (!admin || !stateId) return;
  await admin
    .from('mercadopago_oauth_states')
    .update({ status: 'failed', consumed_at: new Date().toISOString(), error_code: errorCode })
    .eq('id', stateId);
}

export async function GET(request: Request) {
  const session = await getCurrentAppSession();
  const url = new URL(request.url);
  const state = asString(url.searchParams.get('state'));
  const code = asString(url.searchParams.get('code'));
  const providerError = asString(url.searchParams.get('error'));

  if (!session) {
    return NextResponse.redirect(
      new URL('/auth/login?error=mercadopago_oauth_session', url.origin)
    );
  }
  if (!state) {
    return NextResponse.redirect(new URL('/admin?mercadopago=missing_state', url.origin));
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.redirect(new URL('/admin?mercadopago=server_misconfigured', url.origin));
  }

  const stateHash = await hashMercadoPagoOAuthState(state);
  const stateResult = await admin
    .from('mercadopago_oauth_states')
    .select('id,tenant_id,requested_by,redirect_uri,status,expires_at')
    .eq('state_hash', stateHash)
    .maybeSingle();

  const stateRow = stateResult.data ? asRecord(stateResult.data) : null;
  const stateId = asString(stateRow?.id);
  const tenantId = asString(stateRow?.tenant_id);
  if (stateResult.error || !stateRow || !isUuid(tenantId)) {
    return NextResponse.redirect(new URL('/admin?mercadopago=invalid_state', url.origin));
  }

  const callbackErrorUrl = (status: string) =>
    NextResponse.redirect(appRedirectUrl(request, tenantId, status, session));

  const stateStatus = asString(stateRow.status);
  const expiresAt = Date.parse(asString(stateRow.expires_at));
  if (stateStatus !== 'pending' || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await admin
      .from('mercadopago_oauth_states')
      .update({
        status: 'expired',
        consumed_at: new Date().toISOString(),
        error_code: 'oauth_state_expired',
      })
      .eq('id', stateId);
    return callbackErrorUrl('expired');
  }

  const requestedBy = asString(stateRow.requested_by);
  if (requestedBy !== session.userId && !canManageTenantMercadoPago(session, tenantId)) {
    await markStateFailed(admin, stateId, 'forbidden');
    return callbackErrorUrl('forbidden');
  }

  if (providerError || !code) {
    await markStateFailed(admin, stateId, providerError || 'missing_code');
    return callbackErrorUrl('error');
  }

  const clientId = process.env.MERCADOPAGO_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET?.trim() ?? '';
  const redirectUri = asString(stateRow.redirect_uri);
  if (!clientId || !clientSecret || !redirectUri) {
    await markStateFailed(admin, stateId, 'server_misconfigured');
    return callbackErrorUrl('server_misconfigured');
  }

  const tokenBody: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  };
  if (isOAuthTestTokenEnabled()) {
    tokenBody.test_token = 'true';
  }

  const tokenResponse = await fetch(`${mercadoPagoBaseUrl()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tokenBody),
  });
  const tokenData = asRecord(await tokenResponse.json().catch(() => ({})));
  if (!tokenResponse.ok) {
    await markStateFailed(admin, stateId, `mercadopago_${tokenResponse.status}`);
    return callbackErrorUrl('provider_error');
  }

  const accessToken = asString(tokenData.access_token);
  const refreshToken = asString(tokenData.refresh_token);
  if (!accessToken || !refreshToken) {
    await markStateFailed(admin, stateId, 'invalid_token_response');
    return callbackErrorUrl('invalid_token_response');
  }

  let encryptedAccessToken: Awaited<ReturnType<typeof encryptMercadoPagoToken>>;
  let encryptedRefreshToken: Awaited<ReturnType<typeof encryptMercadoPagoToken>>;
  try {
    [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
      encryptMercadoPagoToken(accessToken),
      encryptMercadoPagoToken(refreshToken),
    ]);
  } catch {
    await markStateFailed(admin, stateId, 'token_encryption_unavailable');
    return callbackErrorUrl('token_encryption_unavailable');
  }

  const mercadoPagoUserId = asString(tokenData.user_id);
  const accountRefMasked = maskMercadoPagoAccountRef(mercadoPagoUserId);
  const expiresAtIso = tokenExpiresAt(tokenData.expires_in);

  const billingAccountResult = await admin
    .from('tenant_billing_accounts')
    .upsert(
      {
        tenant_id: tenantId,
        provider: 'mercadopago',
        status: 'active',
        wallet_id: mercadoPagoUserId || null,
        wallet_id_masked: accountRefMasked || null,
        metadata: {
          provider: 'mercadopago',
          oauth_connected_at: new Date().toISOString(),
          source: 'mercadopago_oauth_callback',
        },
      },
      { onConflict: 'tenant_id' }
    )
    .select('id')
    .single();
  if (billingAccountResult.error) {
    await markStateFailed(admin, stateId, 'billing_account_upsert_failed');
    return callbackErrorUrl('billing_account_failed');
  }

  const accountResult = await admin
    .from('mercadopago_tenant_accounts')
    .upsert(
      {
        tenant_id: tenantId,
        tenant_billing_account_id: billingAccountResult.data.id,
        status: 'active',
        mercadopago_user_id: mercadoPagoUserId || null,
        account_ref_masked: accountRefMasked || null,
        access_token_ciphertext: encryptedAccessToken.ciphertext,
        access_token_iv: encryptedAccessToken.iv,
        refresh_token_ciphertext: encryptedRefreshToken.ciphertext,
        refresh_token_iv: encryptedRefreshToken.iv,
        token_type: asString(tokenData.token_type, 'bearer'),
        scope: asString(tokenData.scope),
        expires_at: expiresAtIso,
        connected_by: session.userId,
        connected_at: new Date().toISOString(),
        last_refreshed_at: null,
        disconnected_at: null,
        error_code: null,
        error_message: null,
        metadata: {
          provider: 'mercadopago',
          oauth_connected_at: new Date().toISOString(),
          token_user_id_present: Boolean(mercadoPagoUserId),
        },
      },
      { onConflict: 'tenant_id' }
    )
    .select('id')
    .single();
  if (accountResult.error) {
    await markStateFailed(admin, stateId, 'tenant_account_upsert_failed');
    return callbackErrorUrl('tenant_account_failed');
  }

  const tenantResult = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();
  const tenantSettings = mergeMercadoPagoSettings(tenantResult.data?.settings, {
    status: 'active',
    accountRef: accountRefMasked,
  });
  const tenantUpdate = await admin
    .from('tenants')
    .update({ settings: tenantSettings })
    .eq('id', tenantId);
  if (tenantUpdate.error) {
    await markStateFailed(admin, stateId, 'tenant_settings_update_failed');
    return callbackErrorUrl('tenant_settings_failed');
  }

  await admin
    .from('mercadopago_oauth_states')
    .update({ status: 'consumed', consumed_at: new Date().toISOString(), error_code: null })
    .eq('id', stateId);

  await admin.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: session.userId,
    action: 'mercadopago_oauth.connected',
    entity_type: 'tenant',
    entity_id: tenantId,
    metadata: {
      provider: 'mercadopago',
      accountRef: accountRefMasked || null,
      tenantBillingAccountId: billingAccountResult.data.id,
      mercadoPagoTenantAccountId: accountResult.data.id,
      source: 'mercadopago_oauth_callback',
    },
  });

  return NextResponse.redirect(appRedirectUrl(request, tenantId, 'connected', session));
}
