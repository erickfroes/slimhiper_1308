import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendTenantInviteEmail } from '@/lib/auth/tenantInviteEmail';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function normalizeText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function maskEmail(value: string) {
  const [localPart, domain] = value.split('@');
  if (!localPart || !domain) return '';
  const visiblePrefix = localPart.slice(0, 2);
  return `${visiblePrefix}${localPart.length > 2 ? '***' : '*'}@${domain}`;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ tenantId: string; membershipId: string }> }
) {
  const session = await getCurrentAppSession();
  if (!session) return jsonError('Sessao obrigatoria para reenviar convite.', 401);

  const canResend =
    isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole);
  if (!canAccessPlatformAdminFromSession(session) || !canResend) {
    return jsonError('Apenas administradores da plataforma podem reenviar convites.', 403);
  }

  const { tenantId, membershipId } = await context.params;
  if (!isUuid(tenantId)) return jsonError('Tenant invalido.', 400);
  if (!isUuid(membershipId)) return jsonError('Vinculo invalido.', 400);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError('Payload JSON invalido.', 400);

  const reason = normalizeText(body.reason, 500);
  if (reason.length < 16) {
    return jsonError('Informe um motivo auditavel com pelo menos 16 caracteres.', 400);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  const { data: membership, error: membershipError } = await admin
    .from('tenant_memberships')
    .select('id,tenant_id,user_id,status,role_code,unit_id')
    .eq('tenant_id', tenantId)
    .eq('id', membershipId)
    .maybeSingle();

  if (membershipError) return jsonError('Falha ao validar vinculo.', 500);
  if (!membership) return jsonError('Vinculo nao encontrado para este tenant.', 404);
  if (membership.status !== 'invited') {
    return jsonError('Apenas convites pendentes podem ser reenviados.', 409);
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,email,full_name')
    .eq('id', membership.user_id)
    .maybeSingle();

  if (profileError) return jsonError('Falha ao carregar usuario convidado.', 500);
  const email = normalizeText(profile?.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Usuario convidado nao possui e-mail valido.', 409);
  }

  try {
    const resentInvite = await sendTenantInviteEmail({
      admin,
      request,
      email,
      tenantId,
      roleCode: membership.role_code,
      fullName: normalizeText(profile?.full_name, 160) || undefined,
    });

    const nowIso = new Date().toISOString();
    const { error: updateError } = await admin
      .from('tenant_memberships')
      .update({
        status: 'invited',
        invited_by: session.userId,
        accepted_at: null,
      })
      .eq('tenant_id', tenantId)
      .eq('id', membershipId);

    if (updateError) throw updateError;

    const emailRedacted = maskEmail(email);
    const { error: auditError } = await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: session.userId,
      action: 'platform_tenant_membership.invite_resent',
      entity_type: 'tenant_membership',
      entity_id: membershipId,
      metadata: {
        reason,
        targetUserId: membership.user_id,
        email: emailRedacted,
        emailDomain: email.split('@')[1] ?? '',
        roleCode: membership.role_code,
        unitId: membership.unit_id,
        lastInviteSentAt: nowIso,
        inviteDelivery: resentInvite.delivery,
      },
    });

    if (auditError) throw auditError;

    return NextResponse.json({
      data: {
        membershipId,
        status: 'invited',
        lastInviteSentAt: nowIso,
        emailRedacted,
        inviteDelivery: resentInvite.delivery,
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

    return jsonError('Falha ao reenviar convite do tenant.', 500);
  }
}
