import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';

const PROVIDERS = new Set(['asaas', 'mercadopago', 'd4sign']);
const OPERATIONAL_STATES = new Set(['normal', 'investigating', 'resolved']);

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function normalizeText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const session = await getCurrentAppSession();
  if (!session) return jsonError('Sessao obrigatoria para atualizar integracao.', 401);

  const canManage =
    isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole);
  if (!canAccessPlatformAdminFromSession(session) || !canManage) {
    return jsonError('Apenas administradores da plataforma podem atualizar integracoes.', 403);
  }

  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) return jsonError('Tenant invalido.', 400);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError('Payload JSON invalido.', 400);

  const provider = normalizeText(body.provider, 20).toLowerCase();
  const state = normalizeText(body.state, 40).toLowerCase();
  const reason = normalizeText(body.reason, 500);

  if (!PROVIDERS.has(provider)) return jsonError('Provider de integracao invalido.', 400);
  if (!OPERATIONAL_STATES.has(state)) return jsonError('Estado operacional invalido.', 400);
  if (reason.length < 16) {
    return jsonError('Informe um motivo auditavel com pelo menos 16 caracteres.', 400);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id,settings')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantError) return jsonError('Falha ao carregar tenant.', 500);
  if (!tenant) return jsonError('Tenant nao encontrado.', 404);

  const settings = asRecord(tenant.settings);
  const integrations = { ...asRecord(settings.integrations) };
  const currentProviderSettings = asRecord(integrations[provider]);
  const nowIso = new Date().toISOString();

  integrations[provider] = {
    ...currentProviderSettings,
    operationalStatus: state,
    operationalUpdatedAt: nowIso,
    operationalUpdatedBy: session.userId,
  };

  const { error: updateError } = await admin
    .from('tenants')
    .update({
      settings: {
        ...settings,
        integrations,
      },
    })
    .eq('id', tenantId);

  if (updateError) return jsonError('Falha ao atualizar estado local da integracao.', 500);

  const { error: auditError } = await admin.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: session.userId,
    action: 'platform_tenant_integration.local_state_updated',
    entity_type: 'tenant_integration',
    entity_id: `${tenantId}:${provider}`,
    metadata: {
      reason,
      provider,
      state,
      source: 'platform_admin_console',
    },
  });

  if (auditError) return jsonError('Falha ao auditar integracao.', 500);

  return NextResponse.json({
    data: {
      tenantId,
      provider,
      state,
      updatedAt: nowIso,
    },
    error: null,
  });
}
