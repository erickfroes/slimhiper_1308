import { NextResponse } from 'next/server';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  findAuthUserByEmail,
  sendTenantInviteEmail,
  sendTenantPasswordSetupEmail,
  type TenantInviteDelivery,
} from '@/lib/auth/tenantInviteEmail';

const INVITEE_TYPES = new Set(['patient', 'guardian']);

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function normalizeString(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function normalizeEmail(value: unknown) {
  return normalizeString(value, 254).toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function maskEmail(value: string) {
  const [localPart, domain] = value.split('@');
  if (!localPart || !domain) return '';
  return `${localPart.slice(0, 2)}${localPart.length > 2 ? '***' : '*'}@${domain}`;
}

export async function POST(request: Request, context: { params: Promise<{ patientId: string }> }) {
  const session = await getCurrentAppSession();
  if (!session) return jsonError('Sessao obrigatoria para convidar paciente.', 401);

  const tenantId = session.activeTenant?.id ?? '';
  if (!isUuid(tenantId)) return jsonError('Tenant ativo invalido.', 400);
  if (!session.permissions.includes('patients.write')) {
    return jsonError('Sem permissao para convidar paciente ao portal.', 403);
  }

  const { patientId } = await context.params;
  if (!isUuid(patientId)) return jsonError('Paciente invalido.', 400);

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError('Payload JSON invalido.', 400);

  const inviteeType = normalizeString(body.inviteeType, 30) || 'patient';
  const requestedEmail = normalizeEmail(body.email);
  const phone = normalizeString(body.phone, 40) || null;
  const relationship = normalizeString(body.relationship, 80) || null;

  if (!INVITEE_TYPES.has(inviteeType)) return jsonError('Tipo de convite invalido.', 400);

  const { data: patient, error: patientError } = await admin
    .from('patients')
    .select('id,tenant_id,preferred_name')
    .eq('tenant_id', tenantId)
    .eq('id', patientId)
    .maybeSingle();

  if (patientError) return jsonError('Falha ao validar paciente.', 500);
  if (!patient) return jsonError('Paciente nao encontrado para este tenant.', 404);

  const { data: pii, error: piiError } = await admin
    .from('patient_pii')
    .select('full_name,email,phone')
    .eq('tenant_id', tenantId)
    .eq('patient_id', patientId)
    .maybeSingle();

  if (piiError) return jsonError('Falha ao carregar dados do paciente.', 500);

  const email = requestedEmail || (inviteeType === 'patient' ? normalizeEmail(pii?.email) : '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Informe um e-mail valido para enviar o convite do portal.', 400);
  }

  const { data: role, error: roleError } = await admin
    .from('roles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', inviteeType)
    .maybeSingle();

  if (roleError) return jsonError('Falha ao validar papel do portal.', 500);
  if (!role) return jsonError('Papel do portal nao configurado para este tenant.', 400);

  try {
    const fullName =
      inviteeType === 'patient'
        ? normalizeString(pii?.full_name, 160) ||
          normalizeString(patient.preferred_name, 160) ||
          email
        : email;
    const nowIso = new Date().toISOString();
    let authUser = await findAuthUserByEmail(admin, email);
    let inviteDelivery: TenantInviteDelivery = 'password_setup_sent';

    if (!authUser) {
      const invited = await sendTenantInviteEmail({
        admin,
        request,
        email,
        tenantId,
        roleCode: inviteeType,
        fullName,
      });
      authUser = invited.user;
      inviteDelivery = invited.delivery;
    } else {
      await sendTenantPasswordSetupEmail({ admin, request, email, tenantId });
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
      .select('id,status,role_code,unit_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (existingMembershipError) throw existingMembershipError;

    const existingRole = normalizeString(existingMembership?.role_code, 30);
    const existingStatus = normalizeString(existingMembership?.status, 30);
    if (
      existingMembership &&
      (!INVITEE_TYPES.has(existingRole) ||
        existingRole !== inviteeType ||
        !['active', 'invited', 'revoked'].includes(existingStatus))
    ) {
      return jsonError('E-mail ja vinculado a outro perfil neste tenant.', 409);
    }

    let membership = existingMembership;
    if (!membership || membership.status !== 'active') {
      const membershipResult = existingMembership
        ? await admin
            .from('tenant_memberships')
            .update({
              role_code: inviteeType,
              role: inviteeType,
              status: 'invited',
              invited_by: session.userId,
              accepted_at: null,
              updated_at: nowIso,
            })
            .eq('id', existingMembership.id)
            .select('id,status,role_code,unit_id')
            .single()
        : await admin
            .from('tenant_memberships')
            .insert({
              tenant_id: tenantId,
              user_id: authUser.id,
              role_code: inviteeType,
              role: inviteeType,
              status: 'invited',
              invited_by: session.userId,
            })
            .select('id,status,role_code,unit_id')
            .single();

      if (membershipResult.error) throw membershipResult.error;
      membership = membershipResult.data;
    }

    if (!membership) throw new Error('patient_portal_membership_not_persisted');
    const linkStatus = membership.status === 'active' ? 'active' : 'pending';
    let patientAccountId: string | null = null;
    let guardianLinkId: string | null = null;

    if (inviteeType === 'patient') {
      const { data: existingAccount, error: existingAccountError } = await admin
        .from('patient_accounts')
        .select('id,status,linked_at')
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (existingAccountError) throw existingAccountError;

      const nextStatus = existingAccount?.status === 'active' ? 'active' : linkStatus;
      const accountResult = existingAccount
        ? await admin
            .from('patient_accounts')
            .update({
              status: nextStatus,
              linked_at:
                nextStatus === 'active'
                  ? (existingAccount.linked_at ?? nowIso)
                  : existingAccount.linked_at,
              updated_at: nowIso,
            })
            .eq('id', existingAccount.id)
            .select('id')
            .single()
        : await admin
            .from('patient_accounts')
            .insert({
              tenant_id: tenantId,
              patient_id: patientId,
              user_id: authUser.id,
              status: nextStatus,
              linked_at: nextStatus === 'active' ? nowIso : null,
            })
            .select('id')
            .single();
      if (accountResult.error) throw accountResult.error;
      patientAccountId = accountResult.data.id;
    } else {
      const { data: existingGuardian, error: existingGuardianError } = await admin
        .from('guardian_links')
        .select('id,status')
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .eq('guardian_user_id', authUser.id)
        .maybeSingle();
      if (existingGuardianError) throw existingGuardianError;

      const nextStatus = existingGuardian?.status === 'active' ? 'active' : linkStatus;
      const guardianResult = existingGuardian
        ? await admin
            .from('guardian_links')
            .update({
              relationship,
              status: nextStatus,
              updated_at: nowIso,
            })
            .eq('id', existingGuardian.id)
            .select('id')
            .single()
        : await admin
            .from('guardian_links')
            .insert({
              tenant_id: tenantId,
              patient_id: patientId,
              guardian_user_id: authUser.id,
              relationship,
              status: nextStatus,
            })
            .select('id')
            .single();
      if (guardianResult.error) throw guardianResult.error;
      guardianLinkId = guardianResult.data.id;
    }

    const inviteStatus = linkStatus === 'active' ? 'active' : 'linked';
    const { data: invite, error: inviteError } = await admin
      .from('patient_portal_access_invites')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        invitee_type: inviteeType,
        email,
        phone: phone ?? (normalizeString(pii?.phone, 40) || null),
        relationship,
        status: inviteStatus,
        user_id: authUser.id,
        patient_account_id: patientAccountId,
        guardian_link_id: guardianLinkId,
        invited_by: session.userId,
        activated_at: inviteStatus === 'active' ? nowIso : null,
        metadata: {
          source: 'clinic_patient_portal_invite_api',
          inviteDelivery,
        },
      })
      .select('id,status')
      .single();

    if (inviteError) throw inviteError;

    const emailRedacted = maskEmail(email);
    const { error: auditError } = await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: session.userId,
      action: 'patient_portal.invite_email_sent',
      entity_type: 'patient',
      entity_id: patientId,
      metadata: {
        targetUserId: authUser.id,
        inviteId: invite.id,
        inviteeType,
        email: emailRedacted,
        emailDomain: email.split('@')[1] ?? '',
        inviteDelivery,
        status: invite.status,
      },
    });

    if (auditError) throw auditError;

    return NextResponse.json({
      data: {
        patientId,
        userId: authUser.id,
        inviteId: invite.id,
        inviteDelivery,
        status: invite.status,
        emailRedacted,
      },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/rate limit|too many|over email send rate limit/i.test(message)) {
      return jsonError(
        'Limite de envio de e-mails atingido. Aguarde alguns minutos e tente novamente.',
        429
      );
    }

    return jsonError('Falha ao enviar convite do portal do paciente.', 500);
  }
}
