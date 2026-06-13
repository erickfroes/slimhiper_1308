import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { canInvitePhysicianWithinLimit } from '@/lib/tenant/doctorLimits';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';

const MUTABLE_ROLES = new Set([
  'tenant_owner',
  'clinic_admin',
  'receptionist',
  'physician',
  'nutritionist',
  'fitness_professional',
  'financial_user',
  'external_professional',
]);

const MUTABLE_STATUSES = new Set(['active', 'invited', 'suspended', 'revoked']);

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function normalizeText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function nullableUuid(value: unknown) {
  const normalized = normalizeText(value, 80);
  return normalized || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ tenantId: string; membershipId: string }> }
) {
  const session = await getCurrentAppSession();
  if (!session) return jsonError('Sessao obrigatoria para atualizar usuario do tenant.', 401);

  const canManage =
    isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole);
  if (!canAccessPlatformAdminFromSession(session) || !canManage) {
    return jsonError('Apenas administradores da plataforma podem atualizar usuarios.', 403);
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

  const roleCode = normalizeText(body.roleCode, 80) || null;
  const status = normalizeText(body.status, 40) || null;
  const unitId = nullableUuid(body.unitId);

  if (roleCode && !MUTABLE_ROLES.has(roleCode)) return jsonError('Papel nao permitido.', 400);
  if (status && !MUTABLE_STATUSES.has(status)) return jsonError('Status nao permitido.', 400);
  if (unitId && !isUuid(unitId)) return jsonError('Unidade invalida.', 400);

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  const { data: membership, error: membershipError } = await admin
    .from('tenant_memberships')
    .select('id,tenant_id,user_id,role_code,status')
    .eq('tenant_id', tenantId)
    .eq('id', membershipId)
    .maybeSingle();

  if (membershipError) return jsonError('Falha ao validar vinculo.', 500);
  if (!membership) return jsonError('Vinculo nao encontrado para este tenant.', 404);

  const nextRole = roleCode ?? membership.role_code;
  const nextStatus = status ?? membership.status;
  if (nextRole === 'physician' && ['active', 'invited'].includes(nextStatus)) {
    try {
      const limitCheck = await canInvitePhysicianWithinLimit({
        admin,
        tenantId,
        targetUserId: membership.user_id,
      });
      if (!limitCheck.allowed) {
        return jsonError(
          `Limite de medicos do plano atingido (${limitCheck.current}/${limitCheck.limit}).`,
          409
        );
      }
    } catch {
      return jsonError('Falha ao validar limite de medicos.', 500);
    }
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError('Supabase server client nao configurado.', 503);

  const { data, error } = await supabase.rpc('update_platform_tenant_membership', {
    p_tenant_id: tenantId,
    p_membership_id: membershipId,
    p_role_code: roleCode,
    p_status: status,
    p_unit_id: unitId,
    p_reason: reason,
  });

  if (error) {
    if (error.code === '42501') return jsonError('Acesso negado para atualizar usuario.', 403);
    if (error.code === 'P0002') return jsonError('Vinculo, papel ou unidade nao encontrado.', 404);
    if (error.code === '23514' || error.message?.includes('tenant_doctors_limit_exceeded')) {
      return jsonError('Limite de medicos do plano atingido.', 409);
    }
    return jsonError('Falha ao atualizar usuario do tenant.', 500);
  }

  if (status && status !== 'active') {
    const { error: clearAcceptedAtError } = await admin
      .from('tenant_memberships')
      .update({ accepted_at: null })
      .eq('tenant_id', tenantId)
      .eq('id', membershipId);

    if (clearAcceptedAtError) {
      return jsonError('Usuario atualizado, mas aceite anterior nao foi limpo.', 500);
    }
  }

  return NextResponse.json({ data, error: null });
}
