import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function normalizeText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function normalizePositiveNumber(value: unknown, max = 1_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 && rounded <= max ? rounded : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function PATCH(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const session = await getCurrentAppSession();
  if (!session) return jsonError('Sessao obrigatoria para atualizar tenant.', 401);

  const canManage =
    isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole);
  if (!canAccessPlatformAdminFromSession(session) || !canManage) {
    return jsonError('Apenas administradores da plataforma podem atualizar tenants.', 403);
  }

  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) return jsonError('Tenant invalido.', 400);

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError('Payload JSON invalido.', 400);

  const reason = normalizeText(body.reason, 500);
  if (reason.length < 16) {
    return jsonError('Informe um motivo auditavel com pelo menos 16 caracteres.', 400);
  }

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id,status,settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantError) return jsonError('Falha ao carregar tenant.', 500);
  if (!tenant) return jsonError('Tenant nao encontrado.', 404);

  const currentSettings = asRecord(tenant.settings);
  const nextSettings = { ...currentSettings };
  const changes: Record<string, unknown> = {};

  const status = normalizeText(body.status, 24).toLowerCase();
  const tenantUpdate: Record<string, unknown> = {};
  if (status) {
    if (!['active', 'suspended', 'cancelled'].includes(status)) {
      return jsonError('Status do tenant invalido.', 400);
    }
    tenantUpdate.status = status === 'cancelled' ? 'archived' : status;
    changes.status = status;
  }

  const planCode = normalizeText(body.planCode, 80).toLowerCase();
  if (planCode) {
    const { data: plan, error: planError } = await admin
      .from('platform_plans')
      .select('id,code')
      .eq('code', planCode)
      .eq('active', true)
      .maybeSingle();
    if (planError) return jsonError('Falha ao validar plano.', 500);
    if (!plan) return jsonError('Plano ativo nao encontrado.', 400);

    const { error: subscriptionError } = await admin
      .from('tenant_subscriptions')
      .update({ platform_plan_id: plan.id })
      .eq('tenant_id', tenantId);
    if (subscriptionError) return jsonError('Falha ao atualizar assinatura local.', 500);
    nextSettings.plan = plan.code;
    changes.planCode = plan.code;
  }

  const usageInput = asRecord(body.usage);
  const usage = { ...asRecord(currentSettings.usage) };
  const usersLimit = normalizePositiveNumber(usageInput.usersLimit, 10000);
  const storageCapacityGb = normalizePositiveNumber(usageInput.storageCapacityGb, 100000);
  const apiLimitMonthly = normalizePositiveNumber(usageInput.apiLimitMonthly, 100000000);
  if (usersLimit !== null) usage.usersLimit = usersLimit;
  if (storageCapacityGb !== null) usage.storageCapacityGb = storageCapacityGb;
  if (apiLimitMonthly !== null) usage.apiLimitMonthly = apiLimitMonthly;
  if (usersLimit !== null || storageCapacityGb !== null || apiLimitMonthly !== null) {
    nextSettings.usage = usage;
    changes.usage = usage;
  }

  const featureFlagsInput = asRecord(body.featureFlags);
  if (Object.keys(featureFlagsInput).length > 0) {
    const currentFlags = asRecord(currentSettings.featureFlags);
    const featureFlags = { ...currentFlags };
    for (const [key, value] of Object.entries(featureFlagsInput)) {
      if (!/^[a-z0-9_.-]{2,80}$/i.test(key)) continue;
      featureFlags[key] = value === true;
    }
    nextSettings.featureFlags = featureFlags;
    changes.featureFlags = featureFlagsInput;
  }

  if (Object.keys(changes).length === 0) {
    return jsonError('Nenhuma alteracao valida informada.', 400);
  }

  tenantUpdate.settings = nextSettings;
  const { error: updateError } = await admin
    .from('tenants')
    .update(tenantUpdate)
    .eq('id', tenantId);
  if (updateError) return jsonError('Falha ao atualizar tenant.', 500);

  const { error: auditError } = await admin.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: session.userId,
    action: 'platform_tenant.config_updated',
    entity_type: 'tenant',
    entity_id: tenantId,
    metadata: {
      reason,
      changes,
      source: 'platform_admin_console',
    },
  });
  if (auditError) return jsonError('Falha ao auditar alteracao.', 500);

  return NextResponse.json({ data: { tenantId, changes }, error: null });
}
