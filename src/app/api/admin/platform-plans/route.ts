import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';
import {
  arePlanEntitlementsEqual,
  normalizePlanEntitlements,
  validatePlanEntitlementsInput,
} from '@/services/planEntitlements';

const BILLING_CYCLES = new Set(['monthly', 'quarterly', 'yearly']);

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function normalizeText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function normalizeCode(value: unknown) {
  return normalizeText(value, 80)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeNonNegativeInteger(value: unknown, max = 1_000_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded >= 0 && rounded <= max ? rounded : null;
}

function normalizeMoneyToCents(value: unknown, maxReais = 1_000_000) {
  const parsed = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(parsed * 100);
  return cents >= 0 && cents <= maxReais * 100 ? cents : null;
}

function normalizePositiveInteger(value: unknown, max = 1_000_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 && rounded <= max ? rounded : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildFeatures(value: unknown) {
  const input = asRecord(value);
  const doctorsLimit = normalizePositiveInteger(
    input.doctorsLimit ?? input.doctors_limit ?? input.physiciansLimit ?? input.physicians_limit,
    10000
  );

  return {
    doctors_limit: doctorsLimit ?? 1,
  };
}

async function getAuthorizedSession() {
  const session = await getCurrentAppSession();
  if (!session) return { session: null, response: jsonError('Sessao obrigatoria.', 401) };

  const canManage =
    isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole);
  if (!canAccessPlatformAdminFromSession(session) || !canManage) {
    return {
      session: null,
      response: jsonError('Apenas administradores da plataforma podem gerenciar planos.', 403),
    };
  }

  return { session, response: null };
}

export async function POST(request: Request) {
  const { session, response } = await getAuthorizedSession();
  if (!session) return response;

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError('Payload JSON invalido.', 400);

  const code = normalizeCode(body.code);
  const name = normalizeText(body.name, 120);
  const billingCycle = normalizeText(body.billingCycle, 24).toLowerCase();
  const amountCents =
    body.amountCents === undefined
      ? normalizeMoneyToCents(body.amountReais, 1000000)
      : normalizeNonNegativeInteger(body.amountCents, 100000000);
  const currency = normalizeText(body.currency, 3).toUpperCase() || 'BRL';
  const active = body.active !== false;
  const reason = normalizeText(body.reason, 500);
  const entitlementErrors = validatePlanEntitlementsInput(body.entitlements);

  if (!/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(code)) {
    return jsonError('Codigo do plano invalido.', 400);
  }
  if (name.length < 3) return jsonError('Informe o nome do plano.', 400);
  if (!BILLING_CYCLES.has(billingCycle)) return jsonError('Ciclo de cobranca invalido.', 400);
  if (amountCents === null) return jsonError('Valor do plano invalido.', 400);
  if (!/^[A-Z]{3}$/.test(currency)) return jsonError('Moeda invalida.', 400);
  if (reason.length < 16) {
    return jsonError('Informe um motivo auditavel com pelo menos 16 caracteres.', 400);
  }
  if (entitlementErrors.length > 0) return jsonError(entitlementErrors[0], 400);

  const features = buildFeatures(body.features);
  const entitlements = normalizePlanEntitlements(body.entitlements);
  const { data: plan, error } = await admin
    .from('platform_plans')
    .insert({
      code,
      name,
      billing_cycle: billingCycle,
      amount_cents: amountCents,
      currency,
      active,
      metadata: {
        features,
        entitlements,
        source: 'platform_admin_console',
      },
    })
    .select('id,code,name,billing_cycle,amount_cents,currency,active,metadata')
    .single();

  if (error) {
    if (error.code === '23505') return jsonError('Ja existe um plano com este codigo.', 409);
    return jsonError('Falha ao criar plano.', 500);
  }

  const { error: auditError } = await admin.from('audit_logs').insert({
    tenant_id: null,
    user_id: session.userId,
    action: 'platform_plan.created',
    entity_type: 'platform_plan',
    entity_id: plan.id,
    metadata: {
      reason,
      code,
      name,
      billingCycle,
      amountCents,
      currency,
      active,
      features,
      entitlements,
      source: 'platform_admin_console',
    },
  });
  if (auditError) {
    await admin.from('platform_plans').delete().eq('id', plan.id);
    return jsonError('Falha ao auditar criacao do plano.', 500);
  }

  return NextResponse.json({ data: plan, error: null }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { session, response } = await getAuthorizedSession();
  if (!session) return response;

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError('Payload JSON invalido.', 400);

  const id = normalizeText(body.id, 80);
  const name = normalizeText(body.name, 120);
  const billingCycle = normalizeText(body.billingCycle, 24).toLowerCase();
  const amountCents =
    body.amountCents === undefined
      ? normalizeMoneyToCents(body.amountReais, 1000000)
      : normalizeNonNegativeInteger(body.amountCents, 100000000);
  const currency = normalizeText(body.currency, 3).toUpperCase() || 'BRL';
  const active = body.active !== false;
  const reason = normalizeText(body.reason, 500);
  const entitlementErrors = validatePlanEntitlementsInput(body.entitlements);

  if (!isUuid(id)) return jsonError('Plano invalido.', 400);
  if (name.length < 3) return jsonError('Informe o nome do plano.', 400);
  if (!BILLING_CYCLES.has(billingCycle)) return jsonError('Ciclo de cobranca invalido.', 400);
  if (amountCents === null) return jsonError('Valor do plano invalido.', 400);
  if (!/^[A-Z]{3}$/.test(currency)) return jsonError('Moeda invalida.', 400);
  if (reason.length < 16) {
    return jsonError('Informe um motivo auditavel com pelo menos 16 caracteres.', 400);
  }
  if (entitlementErrors.length > 0) return jsonError(entitlementErrors[0], 400);

  const { data: current, error: currentError } = await admin
    .from('platform_plans')
    .select('id,code,name,billing_cycle,amount_cents,currency,active,metadata')
    .eq('id', id)
    .maybeSingle();
  if (currentError) return jsonError('Falha ao carregar plano.', 500);
  if (!current) return jsonError('Plano nao encontrado.', 404);

  const features = buildFeatures(body.features);
  const entitlements = normalizePlanEntitlements(body.entitlements);
  const currentEntitlements = normalizePlanEntitlements(asRecord(current.metadata).entitlements);
  const entitlementsChanged = !arePlanEntitlementsEqual(currentEntitlements, entitlements);
  const metadata = {
    ...asRecord(current.metadata),
    features,
    entitlements,
    source: 'platform_admin_console',
  };

  const { data: plan, error } = await admin
    .from('platform_plans')
    .update({
      name,
      billing_cycle: billingCycle,
      amount_cents: amountCents,
      currency,
      active,
      metadata,
    })
    .eq('id', id)
    .select('id,code,name,billing_cycle,amount_cents,currency,active,metadata')
    .single();

  if (error) return jsonError('Falha ao atualizar plano.', 500);

  const auditRows: Array<{
    tenant_id: null;
    user_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    metadata: Record<string, unknown>;
  }> = [
    {
      tenant_id: null,
      user_id: session.userId,
      action: 'platform_plan.updated',
      entity_type: 'platform_plan',
      entity_id: id,
      metadata: {
        reason,
        code: current.code,
        changes: {
          name,
          billingCycle,
          amountCents,
          currency,
          active,
          features,
          entitlements,
        },
        source: 'platform_admin_console',
      },
    },
  ];
  if (entitlementsChanged) {
    auditRows.push({
      tenant_id: null,
      user_id: session.userId,
      action: 'platform_plan.entitlements_updated',
      entity_type: 'platform_plan',
      entity_id: id,
      metadata: {
        reason,
        code: current.code,
        previousEntitlements: currentEntitlements,
        entitlements,
        source: 'platform_admin_console',
      },
    });
  }

  const { error: auditError } = await admin.from('audit_logs').insert(auditRows);
  if (auditError) {
    await admin
      .from('platform_plans')
      .update({
        name: current.name,
        billing_cycle: current.billing_cycle,
        amount_cents: current.amount_cents,
        currency: current.currency,
        active: current.active,
        metadata: current.metadata,
      })
      .eq('id', id);
    return jsonError('Falha ao auditar atualizacao do plano.', 500);
  }

  return NextResponse.json({ data: plan, error: null });
}
