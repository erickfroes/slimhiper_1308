import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  findAuthUserByEmail,
  sendTenantInviteEmail,
  sendTenantPasswordSetupEmail,
  type TenantInviteDelivery,
} from '@/lib/auth/tenantInviteEmail';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { applyTenantEntitlements } from '@/services/adminTenantEntitlements';
import { normalizePlanEntitlements } from '@/services/planEntitlements';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';
import {
  normalizeProfessionalProfileInput,
  professionalProfileAuditMetadata,
  upsertTenantProfessionalProfile,
} from '@/lib/tenant/professionalProfiles';

const TRIAL_DAYS = 14;
const DEFAULT_UNIT_CODE = 'matriz';
const DEFAULT_TECHNICAL_LIMITS = {
  usersLimit: 10000,
  storageCapacityGb: 100000,
  apiLimitMonthly: 100000000,
  d4signDocsLimit: 1000000,
  doctorsLimit: 1,
};

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

interface ProfileSnapshot {
  id: string;
  email: string | null;
  full_name: string | null;
  platform_role: string;
  active_tenant_id: string | null;
  is_active: boolean;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeString(value: unknown, maxLength = 240) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function normalizeEmail(value: unknown) {
  return normalizeString(value, 254).toLowerCase();
}

function normalizeSlug(value: unknown) {
  return normalizeString(value, 80)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

function normalizeUnitCode(value: unknown) {
  return normalizeSlug(value) || DEFAULT_UNIT_CODE;
}

function normalizeUf(value: unknown) {
  return normalizeString(value, 2)
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

function maskEmail(value: string) {
  const [localPart, domain] = value.split('@');
  if (!localPart || !domain) return '';
  return `${localPart.slice(0, 2)}${localPart.length > 2 ? '***' : '*'}@${domain}`;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isSafeSlug(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapProfileSnapshot(value: unknown): ProfileSnapshot | null {
  const record = asRecord(value);
  const id = normalizeString(record.id, 80);
  if (!isUuid(id)) return null;

  return {
    id,
    email: typeof record.email === 'string' ? record.email : null,
    full_name: typeof record.full_name === 'string' ? record.full_name : null,
    platform_role: normalizeString(record.platform_role, 80) || 'user',
    active_tenant_id:
      typeof record.active_tenant_id === 'string' && isUuid(record.active_tenant_id)
        ? record.active_tenant_id
        : null,
    is_active: record.is_active !== false,
  };
}

function planUsageDefaults(metadata: unknown) {
  const features = asRecord(asRecord(metadata).features);
  const doctorsLimit = Number(
    features.doctors_limit ??
      features.doctorsLimit ??
      features.physicians_limit ??
      features.physiciansLimit
  );

  return {
    ...DEFAULT_TECHNICAL_LIMITS,
    doctorsLimit:
      Number.isFinite(doctorsLimit) && doctorsLimit > 0
        ? Math.trunc(doctorsLimit)
        : DEFAULT_TECHNICAL_LIMITS.doctorsLimit,
  };
}

async function rollbackTenantProvisioning(params: {
  admin: SupabaseAdmin;
  tenantId: string | null;
  createdAuthUserId: string | null;
  createdProfileUserId: string | null;
  previousProfile: ProfileSnapshot | null;
}) {
  const { admin, tenantId, createdAuthUserId, createdProfileUserId, previousProfile } = params;

  if (previousProfile) {
    await admin
      .from('profiles')
      .update({
        email: previousProfile.email,
        full_name: previousProfile.full_name,
        platform_role: previousProfile.platform_role,
        active_tenant_id: previousProfile.active_tenant_id,
        is_active: previousProfile.is_active,
      })
      .eq('id', previousProfile.id);
  } else if (createdProfileUserId && !createdAuthUserId) {
    await admin.from('profiles').delete().eq('id', createdProfileUserId);
  }

  if (tenantId) {
    await admin.from('tenants').delete().eq('id', tenantId);
  }

  if (createdAuthUserId) {
    await admin.auth.admin.deleteUser(createdAuthUserId);
  }
}

export async function POST(request: Request) {
  const session = await getCurrentAppSession();

  if (!session) {
    return jsonError('Sessao obrigatoria para criar tenant.', 401);
  }

  const canCreateTenant =
    isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole);

  if (!canAccessPlatformAdminFromSession(session) || !canCreateTenant) {
    return jsonError('Apenas administradores da plataforma podem criar tenants.', 403);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return jsonError('Supabase admin client nao configurado no servidor.', 503);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return jsonError('Payload JSON invalido.', 400);
  }

  const clinicName = normalizeString(body.clinicName, 160);
  const slug = normalizeSlug(body.slug);
  const cnpj = normalizeString(body.cnpj, 32);
  const phone = normalizeString(body.phone, 32);
  const website = normalizeString(body.website, 160);
  const ownerName = normalizeString(body.ownerName, 160);
  const ownerEmail = normalizeEmail(body.ownerEmail);
  const reason = normalizeString(body.reason, 500);
  const planCode = normalizeString(body.planCode, 80).toLowerCase();
  const unitName = normalizeString(body.unitName, 120) || 'Matriz';
  const unitCode = normalizeUnitCode(body.unitCode);
  const city = normalizeString(body.city, 120);
  const state = normalizeUf(body.state);
  const professionalProfileResult = normalizeProfessionalProfileInput(
    body.professionalProfile,
    'tenant_owner'
  );

  if (clinicName.length < 3) return jsonError('Informe o nome da clinica.', 400);
  if (!isSafeSlug(slug)) return jsonError('Slug do tenant invalido.', 400);
  if (!ownerName) return jsonError('Informe o nome do owner.', 400);
  if (!isEmail(ownerEmail)) return jsonError('E-mail do owner invalido.', 400);
  if (!planCode) return jsonError('Selecione um plano ativo.', 400);
  if (!isSafeSlug(unitCode)) return jsonError('Codigo da unidade invalido.', 400);
  if (state && state.length !== 2) return jsonError('UF da unidade invalida.', 400);
  if (reason.length < 16) {
    return jsonError('Informe um motivo auditavel com pelo menos 16 caracteres.', 400);
  }
  if (professionalProfileResult.error) {
    return jsonError(professionalProfileResult.error, 400);
  }

  const professionalProfile = professionalProfileResult.profile;

  const { data: existingTenant, error: existingTenantError } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existingTenantError) return jsonError('Falha ao validar slug do tenant.', 500);
  if (existingTenant) return jsonError('Ja existe um tenant com este slug.', 409);

  const { data: plan, error: planError } = await admin
    .from('platform_plans')
    .select('id, code, name, amount_cents, currency, metadata')
    .eq('code', planCode)
    .eq('active', true)
    .maybeSingle();
  if (planError) return jsonError('Falha ao validar plano.', 500);
  if (!plan) return jsonError('Plano ativo nao encontrado.', 400);

  let tenantId: string | null = null;
  let createdAuthUserId: string | null = null;
  let createdProfileUserId: string | null = null;
  let previousProfile: ProfileSnapshot | null = null;

  try {
    const existingAuthUser = await findAuthUserByEmail(admin, ownerEmail);
    if (existingAuthUser) {
      const { data: profileRow, error: profileFetchError } = await admin
        .from('profiles')
        .select('id, email, full_name, platform_role, active_tenant_id, is_active')
        .eq('id', existingAuthUser.id)
        .maybeSingle();
      if (profileFetchError) throw profileFetchError;

      previousProfile = mapProfileSnapshot(profileRow);
      if (previousProfile?.is_active === false) {
        return jsonError('Usuario owner existente esta inativo.', 409);
      }
    }

    const usage = planUsageDefaults(plan.metadata);
    const planEntitlements = normalizePlanEntitlements(asRecord(plan.metadata).entitlements);
    const nowIso = new Date().toISOString();
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .insert({
        slug,
        name: clinicName,
        status: 'active',
        settings: {
          profile: {
            owner: ownerName,
            email: ownerEmail,
            phone,
            website,
            cnpj,
          },
          plan: planCode,
          planEntitlements,
          planEntitlementsSource: 'plan_snapshot',
          planEntitlementsSyncedAt: nowIso,
          planEntitlementsSyncedBy: session.userId,
          usage: {
            storageUsedGb: 0,
            storageCapacityGb: usage.storageCapacityGb,
            apiLimitMonthly: usage.apiLimitMonthly,
            usersLimit: usage.usersLimit,
            doctorsLimit: usage.doctorsLimit,
          },
          integrations: {
            asaas: { status: 'not_configured' },
            d4sign: { status: 'not_configured', docsLimit: usage.d4signDocsLimit },
          },
          onboarding: {
            source: 'platform_admin',
            createdBy: session.userId,
            createdAt: nowIso,
            ownerInviteStatus: 'pending',
          },
        },
      })
      .select('id, slug')
      .single();

    if (tenantError) {
      if (tenantError.code === '23505') return jsonError('Ja existe um tenant com este slug.', 409);
      return jsonError('Falha ao criar tenant.', 500);
    }

    const createdTenantId = tenant.id;
    tenantId = createdTenantId;

    const { data: unit, error: unitError } = await admin
      .from('tenant_units')
      .insert({
        tenant_id: createdTenantId,
        code: unitCode,
        name: unitName,
        status: 'active',
        metadata: {
          city,
          state,
          kind: 'default',
          source: 'platform_admin_tenant_create',
        },
      })
      .select('id, code, name')
      .single();
    if (unitError) throw unitError;

    const { error: subscriptionError } = await admin.from('tenant_subscriptions').insert({
      tenant_id: createdTenantId,
      platform_plan_id: plan.id,
      status: 'trialing',
      starts_at: nowIso,
      trial_ends_at: trialEndsAt,
      metadata: {
        source: 'platform_admin_tenant_create',
        trialDays: TRIAL_DAYS,
      },
    });
    if (subscriptionError) throw subscriptionError;

    const { data: ownerRole, error: ownerRoleError } = await admin
      .from('roles')
      .select('id')
      .eq('tenant_id', createdTenantId)
      .eq('name', 'tenant_owner')
      .maybeSingle();
    if (ownerRoleError) throw ownerRoleError;
    if (!ownerRole) throw new Error('tenant_owner_role_not_seeded');

    await applyTenantEntitlements({
      admin,
      tenantId: createdTenantId,
      entitlements: planEntitlements,
    });

    let authUser = existingAuthUser;
    let inviteDelivery: TenantInviteDelivery = 'password_setup_sent';

    if (!authUser) {
      const invited = await sendTenantInviteEmail({
        admin,
        request,
        email: ownerEmail,
        tenantId: createdTenantId,
        roleCode: 'tenant_owner',
        fullName: ownerName,
      });
      authUser = invited.user;
      createdAuthUserId = invited.delivery === 'supabase_invite_sent' ? invited.user.id : null;
      inviteDelivery = invited.delivery;
    } else {
      await sendTenantPasswordSetupEmail({
        admin,
        request,
        email: ownerEmail,
        tenantId: createdTenantId,
      });
    }

    if (!previousProfile) createdProfileUserId = authUser.id;

    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: authUser.id,
        email: ownerEmail,
        full_name: ownerName || previousProfile?.full_name || ownerEmail,
        platform_role: previousProfile?.platform_role ?? 'user',
        active_tenant_id: createdTenantId,
        is_active: true,
      },
      { onConflict: 'id' }
    );
    if (profileError) throw profileError;

    const { data: membership, error: membershipError } = await admin
      .from('tenant_memberships')
      .insert({
        tenant_id: createdTenantId,
        user_id: authUser.id,
        unit_id: unit.id,
        role_code: 'tenant_owner',
        role: 'tenant_owner',
        status: 'invited',
        invited_by: session.userId,
        accepted_at: null,
      })
      .select('id, status, role_code')
      .single();
    if (membershipError) throw membershipError;

    if (professionalProfile) {
      const { error: professionalError } = await upsertTenantProfessionalProfile({
        admin,
        tenantId: createdTenantId,
        userId: authUser.id,
        membershipId: membership.id,
        unitId: unit.id,
        profile: professionalProfile,
      });
      if (professionalError) throw professionalError;
    }

    const { error: auditError } = await admin.from('audit_logs').insert({
      tenant_id: createdTenantId,
      user_id: session.userId,
      action: 'platform_tenant.created',
      entity_type: 'tenant',
      entity_id: createdTenantId,
      metadata: {
        reason,
        description: `Tenant ${clinicName} criado pela plataforma.`,
        slug,
        planCode,
        planName: plan.name,
        unitId: unit.id,
        unitCode: unit.code,
        ownerUserId: authUser.id,
        ownerMembershipId: membership.id,
        ownerEmail: maskEmail(ownerEmail),
        ownerEmailDomain: ownerEmail.split('@')[1] ?? '',
        inviteDelivery,
        professionalProfile: professionalProfileAuditMetadata(professionalProfile),
        trialDays: TRIAL_DAYS,
      },
    });
    if (auditError) throw auditError;

    return NextResponse.json(
      {
        data: {
          tenantId: createdTenantId,
          tenantSlug: tenant.slug,
          unitId: unit.id,
          ownerMembershipId: membership.id,
          ownerInviteDelivery: inviteDelivery,
          subscriptionStatus: 'trialing',
          trialEndsAt,
        },
        error: null,
      },
      { status: 201 }
    );
  } catch {
    await rollbackTenantProvisioning({
      admin,
      tenantId,
      createdAuthUserId,
      createdProfileUserId,
      previousProfile,
    }).catch(() => undefined);

    return jsonError('Falha ao criar tenant.', 500);
  }
}
