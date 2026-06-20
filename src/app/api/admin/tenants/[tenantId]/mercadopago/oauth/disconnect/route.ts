import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentAppSession, type AppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function canManageTenantMercadoPago(session: AppSession, tenantId: string) {
  if (isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole)) {
    return true;
  }
  return session.activeTenant?.id === tenantId && session.permissions.includes('financial.write');
}

function disconnectMercadoPagoSettings(settings: unknown) {
  const current = asRecord(settings);
  const integrations = asRecord(current.integrations);
  const mercadopago = asRecord(integrations.mercadopago);
  return {
    ...current,
    paymentMethod: 'not_configured',
    integrations: {
      ...integrations,
      mercadopago: {
        ...mercadopago,
        status: 'disconnected',
        accountRef: '',
        disconnectedAt: new Date().toISOString(),
      },
    },
  };
}

export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const session = await getCurrentAppSession();
  if (!session) return jsonError('Sessao obrigatoria para desconectar Mercado Pago.', 401);

  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) return jsonError('Tenant invalido.', 400);
  if (!canManageTenantMercadoPago(session, tenantId)) {
    return jsonError('Permissao financeira obrigatoria para desconectar Mercado Pago.', 403);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const reason = normalizeText(body?.reason);
  if (reason.length < 16) {
    return jsonError('Informe um motivo auditavel com pelo menos 16 caracteres.', 400);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  const tenantResult = await admin
    .from('tenants')
    .select('id,settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantResult.error) return jsonError('Falha ao carregar tenant.', 500);
  if (!tenantResult.data) return jsonError('Tenant nao encontrado.', 404);

  const disconnectedAt = new Date().toISOString();
  const accountUpdate = await admin
    .from('mercadopago_tenant_accounts')
    .update({
      status: 'disconnected',
      access_token_ciphertext: null,
      access_token_iv: null,
      refresh_token_ciphertext: null,
      refresh_token_iv: null,
      disconnected_at: disconnectedAt,
      error_code: null,
      error_message: null,
    })
    .eq('tenant_id', tenantId);
  if (accountUpdate.error) return jsonError('Falha ao desconectar conta Mercado Pago.', 500);

  const billingUpdate = await admin
    .from('tenant_billing_accounts')
    .update({
      provider: 'mercadopago',
      status: 'disabled',
      metadata: {
        provider: 'mercadopago',
        disconnected_at: disconnectedAt,
        source: 'mercadopago_oauth_disconnect',
      },
    })
    .eq('tenant_id', tenantId)
    .eq('provider', 'mercadopago');
  if (billingUpdate.error) return jsonError('Falha ao atualizar conta de billing.', 500);

  const nextSettings = disconnectMercadoPagoSettings(tenantResult.data.settings);
  const tenantUpdate = await admin
    .from('tenants')
    .update({ settings: nextSettings })
    .eq('id', tenantId);
  if (tenantUpdate.error) return jsonError('Falha ao atualizar tenant.', 500);

  const auditResult = await admin.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: session.userId,
    action: 'mercadopago_oauth.disconnected',
    entity_type: 'tenant',
    entity_id: tenantId,
    metadata: {
      provider: 'mercadopago',
      reason,
      source: 'platform_admin_console',
    },
  });
  if (auditResult.error) return jsonError('Falha ao auditar desconexao.', 500);

  return NextResponse.json({
    data: { tenantId, status: 'disconnected' },
    error: null,
  });
}
