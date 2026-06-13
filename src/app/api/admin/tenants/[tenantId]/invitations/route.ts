import { NextResponse } from 'next/server';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  findAuthUserByEmail,
  sendTenantInviteEmail,
  sendTenantPasswordSetupEmail,
  type TenantInviteDelivery,
} from '@/lib/auth/tenantInviteEmail';
import { canInvitePhysicianWithinLimit } from '@/lib/tenant/doctorLimits';
import {
  normalizeProfessionalProfileInput,
  professionalProfileAuditMetadata,
  upsertTenantProfessionalProfile,
} from '@/lib/tenant/professionalProfiles';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';

const INVITABLE_ROLES = new Set([
  'tenant_owner',
  'clinic_admin',
  'receptionist',
  'physician',
  'nutritionist',
  'fitness_professional',
  'financial_user',
  'external_professional',
]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function maskEmail(value: string) {
  const [localPart, domain] = value.split('@');
  if (!localPart || !domain) return '';
  const visiblePrefix = localPart.slice(0, 2);
  return `${visiblePrefix}${localPart.length > 2 ? '***' : '*'}@${domain}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const session = await getCurrentAppSession();

  if (!session) {
    return jsonError('Sessao obrigatoria para convidar usuario.', 401);
  }

  const canInviteTenantUsers =
    isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole);

  if (!canAccessPlatformAdminFromSession(session) || !canInviteTenantUsers) {
    return jsonError('Apenas administradores da plataforma podem convidar usuarios.', 403);
  }

  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) {
    return jsonError('Tenant invalido.', 400);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return jsonError('Supabase admin client nao configurado no servidor.', 503);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return jsonError('Payload JSON invalido.', 400);
  }

  const email = normalizeEmail(body.email);
  const fullName = normalizeString(body.fullName);
  const roleCode = normalizeString(body.roleCode);
  const unitId = normalizeString(body.unitId) || null;
  const reason = normalizeString(body.reason);
  const professionalProfileResult = normalizeProfessionalProfileInput(
    body.professionalProfile,
    roleCode
  );

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('E-mail invalido.', 400);
  }

  if (!INVITABLE_ROLES.has(roleCode)) {
    return jsonError('Papel nao permitido para convite.', 400);
  }

  if (unitId && !isUuid(unitId)) {
    return jsonError('Unidade invalida.', 400);
  }

  if (reason.length < 16) {
    return jsonError('Informe um motivo auditavel com pelo menos 16 caracteres.', 400);
  }
  if (professionalProfileResult.error) {
    return jsonError(professionalProfileResult.error, 400);
  }

  const professionalProfile = professionalProfileResult.profile;

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantError) {
    return jsonError('Falha ao validar tenant.', 500);
  }

  if (!tenant) {
    return jsonError('Tenant nao encontrado.', 404);
  }

  const { data: role, error: roleError } = await admin
    .from('roles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', roleCode)
    .maybeSingle();

  if (roleError) {
    return jsonError('Falha ao validar papel do tenant.', 500);
  }

  if (!role) {
    return jsonError('Papel nao configurado para este tenant.', 400);
  }

  if (unitId) {
    const { data: unit, error: unitError } = await admin
      .from('tenant_units')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', unitId)
      .maybeSingle();

    if (unitError) {
      return jsonError('Falha ao validar unidade.', 500);
    }

    if (!unit) {
      return jsonError('Unidade nao encontrada para este tenant.', 404);
    }
  }

  try {
    let authUser = await findAuthUserByEmail(admin, email);
    let inviteDelivery: TenantInviteDelivery = 'password_setup_sent';

    if (professionalProfile?.professionalType === 'physician') {
      const limitCheck = await canInvitePhysicianWithinLimit({
        admin,
        tenantId,
        targetUserId: authUser?.id,
      });
      if (!limitCheck.allowed) {
        return jsonError(
          `Limite de medicos do plano atingido (${limitCheck.current}/${limitCheck.limit}).`,
          409
        );
      }
    }

    if (!authUser) {
      const invited = await sendTenantInviteEmail({
        admin,
        request,
        email,
        tenantId,
        roleCode,
        fullName,
      });
      authUser = invited.user;
      inviteDelivery = invited.delivery;
    } else {
      await sendTenantPasswordSetupEmail({
        admin,
        request,
        email,
        tenantId,
      });
    }

    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: authUser.id,
        email,
        full_name: fullName || authUser.user_metadata?.full_name || email,
        platform_role: 'user',
        active_tenant_id: tenantId,
        is_active: true,
      },
      { onConflict: 'id' }
    );

    if (profileError) throw profileError;

    const { data: existingMembership, error: existingMembershipError } = await admin
      .from('tenant_memberships')
      .select('id,status')
      .eq('tenant_id', tenantId)
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (existingMembershipError) throw existingMembershipError;

    if (existingMembership && !['invited', 'revoked'].includes(existingMembership.status)) {
      return jsonError('Usuario ja possui vinculo ativo/suspenso. Use a edicao auditada.', 409);
    }

    const membershipPayload = {
      tenant_id: tenantId,
      user_id: authUser.id,
      unit_id: unitId,
      role_code: roleCode,
      role: roleCode,
      status: 'invited',
      invited_by: session.userId,
      accepted_at: null,
    };

    const membershipResult = existingMembership
      ? await admin
          .from('tenant_memberships')
          .update(membershipPayload)
          .eq('id', existingMembership.id)
          .select('id,status,role_code,unit_id')
          .single()
      : await admin
          .from('tenant_memberships')
          .insert(membershipPayload)
          .select('id,status,role_code,unit_id')
          .single();

    if (membershipResult.error) throw membershipResult.error;

    if (professionalProfile) {
      const { error: professionalError } = await upsertTenantProfessionalProfile({
        admin,
        tenantId,
        userId: authUser.id,
        membershipId: membershipResult.data.id,
        unitId,
        profile: professionalProfile,
      });
      if (professionalError) throw professionalError;
    }

    const { error: auditError } = await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: session.userId,
      action: 'platform_tenant_membership.invited',
      entity_type: 'tenant_membership',
      entity_id: membershipResult.data.id,
      metadata: {
        reason,
        targetUserId: authUser.id,
        email: maskEmail(email),
        emailDomain: email.split('@')[1] ?? '',
        roleCode,
        unitId,
        inviteDelivery,
        professionalProfile: professionalProfileAuditMetadata(professionalProfile),
      },
    });

    if (auditError) throw auditError;

    return NextResponse.json({
      data: {
        id: membershipResult.data.id,
        tenantId,
        userId: authUser.id,
        emailRedacted: maskEmail(email),
        role: membershipResult.data.role_code,
        status: membershipResult.data.status,
        unitId: membershipResult.data.unit_id,
        professionalProfile: professionalProfileAuditMetadata(professionalProfile),
        inviteDelivery,
      },
      error: null,
    });
  } catch {
    return jsonError('Falha ao convidar usuario do tenant.', 500);
  }
}
