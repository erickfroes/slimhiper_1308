import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { applyTenantEntitlements } from '@/services/adminTenantEntitlements';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';
import {
  arePlanEntitlementsEqual,
  normalizePlanEntitlements,
  validatePlanEntitlementsInput,
  type PlanEntitlements,
} from '@/services/planEntitlements';

type EntitlementSource = 'plan_snapshot' | 'tenant_override';

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function authorize(requireManage: boolean) {
  const session = await getCurrentAppSession();
  if (!session) return { session: null, response: jsonError('Sessao obrigatoria.', 401) };

  const canManage =
    isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole);
  if (!canAccessPlatformAdminFromSession(session) || (requireManage && !canManage)) {
    return {
      session: null,
      response: jsonError('Sem permissao para gerenciar modulos do tenant.', 403),
    };
  }

  return { session, response: null };
}

async function loadTenantPlan(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  tenantId: string
) {
  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id,settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantError) throw new Error('tenant_load_failed');
  if (!tenant) return null;

  const { data: subscription, error: subscriptionError } = await admin
    .from('tenant_subscriptions')
    .select('platform_plan_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (subscriptionError) throw new Error('subscription_load_failed');

  const settings = asRecord(tenant.settings);
  const platformPlanId = normalizeText(asRecord(subscription).platform_plan_id, 80);
  const planCode = normalizeText(settings.plan, 80).toLowerCase();

  const planQuery = admin.from('platform_plans').select('id,code,name,metadata').limit(1);
  const { data: plans, error: planError } = platformPlanId
    ? await planQuery.eq('id', platformPlanId)
    : await planQuery.eq('code', planCode);
  if (planError) throw new Error('plan_load_failed');

  const plan = Array.isArray(plans) ? plans[0] : null;
  if (!plan) return null;

  return { tenant, settings, plan };
}

function buildResponse(params: {
  tenantId: string;
  settings: Record<string, unknown>;
  plan: Record<string, unknown>;
}) {
  const planCode = normalizeText(params.plan.code, 80).toLowerCase();
  const planEntitlements = normalizePlanEntitlements(asRecord(params.plan.metadata).entitlements);
  const currentEntitlements = normalizePlanEntitlements(
    params.settings.planEntitlements ?? planEntitlements
  );
  const source: EntitlementSource =
    params.settings.planEntitlementsSource === 'tenant_override'
      ? 'tenant_override'
      : 'plan_snapshot';

  return {
    tenantId: params.tenantId,
    planCode,
    source,
    isOutOfSync: !arePlanEntitlementsEqual(currentEntitlements, planEntitlements),
    currentEntitlements,
    planEntitlements,
    syncedAt:
      typeof params.settings.planEntitlementsSyncedAt === 'string'
        ? params.settings.planEntitlementsSyncedAt
        : null,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const { session, response } = await authorize(false);
  if (!session) return response;

  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) return jsonError('Tenant invalido.', 400);

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  try {
    const loaded = await loadTenantPlan(admin, tenantId);
    if (!loaded) return jsonError('Tenant ou plano nao encontrado.', 404);
    return NextResponse.json({
      data: buildResponse({
        tenantId,
        settings: loaded.settings,
        plan: asRecord(loaded.plan),
      }),
      error: null,
    });
  } catch {
    return jsonError('Falha ao carregar modulos do tenant.', 500);
  }
}

export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const { session, response } = await authorize(true);
  if (!session) return response;

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

  const hasOverride = body.entitlements !== undefined && body.entitlements !== null;
  const entitlementErrors = validatePlanEntitlementsInput(body.entitlements);
  if (entitlementErrors.length > 0) return jsonError(entitlementErrors[0], 400);

  try {
    const loaded = await loadTenantPlan(admin, tenantId);
    if (!loaded) return jsonError('Tenant ou plano nao encontrado.', 404);

    const previousSettings = loaded.settings;
    const plan = asRecord(loaded.plan);
    const planEntitlements = normalizePlanEntitlements(asRecord(plan.metadata).entitlements);
    const entitlements: PlanEntitlements = hasOverride
      ? normalizePlanEntitlements(body.entitlements)
      : planEntitlements;
    const source: EntitlementSource = hasOverride ? 'tenant_override' : 'plan_snapshot';
    const nowIso = new Date().toISOString();
    const nextSettings = {
      ...previousSettings,
      plan: normalizeText(plan.code, 80).toLowerCase(),
      planEntitlements: entitlements,
      planEntitlementsSource: source,
      planEntitlementsSyncedAt: nowIso,
      planEntitlementsSyncedBy: session.userId,
    };

    const { error: updateError } = await admin
      .from('tenants')
      .update({ settings: nextSettings })
      .eq('id', tenantId);
    if (updateError) throw updateError;

    try {
      await applyTenantEntitlements({ admin, tenantId, entitlements });

      const { error: auditError } = await admin.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: session.userId,
        action: hasOverride ? 'tenant_entitlements.overridden' : 'tenant_entitlements.synced',
        entity_type: 'tenant',
        entity_id: tenantId,
        metadata: {
          reason,
          planCode: nextSettings.plan,
          source,
          entitlements,
          description: hasOverride
            ? 'Entitlements do tenant sobrescritos pela plataforma.'
            : 'Entitlements do tenant sincronizados com o plano.',
        },
      });
      if (auditError) throw auditError;
    } catch (error) {
      await admin.from('tenants').update({ settings: previousSettings }).eq('id', tenantId);
      throw error;
    }

    return NextResponse.json({
      data: buildResponse({ tenantId, settings: nextSettings, plan }),
      error: null,
    });
  } catch {
    return jsonError('Falha ao salvar modulos do tenant.', 500);
  }
}
