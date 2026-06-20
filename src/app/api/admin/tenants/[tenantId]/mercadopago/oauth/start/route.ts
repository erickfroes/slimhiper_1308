import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hashMercadoPagoOAuthState } from '@/lib/mercadopago/tokenCrypto';
import {
  canManageMercadoPagoOAuthTenant,
  isUuid,
  resolveMercadoPagoOAuthTenantId,
} from '@/lib/mercadopago/oauthTenant';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOAuthEnv() {
  const clientId = process.env.MERCADOPAGO_CLIENT_ID?.trim() ?? '';
  const redirectUri = process.env.MERCADOPAGO_OAUTH_REDIRECT_URL?.trim() ?? '';
  if (!clientId || !redirectUri) return null;
  return { clientId, redirectUri };
}

function updateMercadoPagoSettings(settings: unknown, status: string) {
  const current = asRecord(settings);
  const integrations = asRecord(current.integrations);
  const mercadopago = asRecord(integrations.mercadopago);
  return {
    ...current,
    integrations: {
      ...integrations,
      mercadopago: {
        ...mercadopago,
        status,
        oauthStartedAt: new Date().toISOString(),
      },
    },
  };
}

export async function POST(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const session = await getCurrentAppSession();
  if (!session) return jsonError('Sessao obrigatoria para conectar Mercado Pago.', 401);

  const oauthEnv = readOAuthEnv();
  if (!oauthEnv) return jsonError('OAuth Mercado Pago nao configurado no servidor.', 503);

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  const params = await context.params;
  const tenantId = await resolveMercadoPagoOAuthTenantId(admin, session, params.tenantId);
  if (!isUuid(tenantId)) return jsonError('Tenant invalido.', 400);
  if (!(await canManageMercadoPagoOAuthTenant(admin, session, tenantId))) {
    return jsonError('Permissao financeira obrigatoria para conectar Mercado Pago.', 403);
  }

  const tenantResult = await admin
    .from('tenants')
    .select('id,settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantResult.error) return jsonError('Falha ao carregar tenant.', 500);
  if (!tenantResult.data) return jsonError('Tenant nao encontrado.', 404);

  const state = randomBytes(32).toString('base64url');
  const stateHash = await hashMercadoPagoOAuthState(state);

  const insertResult = await admin.from('mercadopago_oauth_states').insert({
    tenant_id: tenantId,
    requested_by: session.userId,
    state_hash: stateHash,
    redirect_uri: oauthEnv.redirectUri,
  });
  if (insertResult.error) return jsonError('Falha ao registrar estado OAuth.', 500);

  const nextSettings = updateMercadoPagoSettings(tenantResult.data.settings, 'pending');
  const updateResult = await admin
    .from('tenants')
    .update({ settings: nextSettings })
    .eq('id', tenantId);
  if (updateResult.error) return jsonError('Falha ao marcar integracao como pendente.', 500);

  const auditResult = await admin.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: session.userId,
    action: 'mercadopago_oauth.started',
    entity_type: 'tenant',
    entity_id: tenantId,
    metadata: {
      provider: 'mercadopago',
      source: 'platform_admin_console',
    },
  });
  if (auditResult.error) return jsonError('Falha ao auditar inicio do OAuth.', 500);

  const authorizationUrl = new URL('https://auth.mercadopago.com/authorization');
  authorizationUrl.searchParams.set('client_id', oauthEnv.clientId);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('platform_id', 'mp');
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('redirect_uri', oauthEnv.redirectUri);

  return NextResponse.json({
    data: { authorizationUrl: authorizationUrl.toString() },
    error: null,
  });
}
