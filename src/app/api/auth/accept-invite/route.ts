import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function normalizeText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return jsonError('Supabase server client nao configurado.', 503);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return jsonError('Sessao do convite nao encontrada.', 401);

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const tenantId = normalizeText(body.tenantId, 80);
  if (tenantId && !isUuid(tenantId)) return jsonError('Tenant do convite invalido.', 400);

  let query = admin
    .from('tenant_memberships')
    .select('id,tenant_id,status')
    .eq('user_id', user.id)
    .eq('status', 'invited')
    .order('created_at', { ascending: false });

  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data: invitedMemberships, error: invitedError } = await query;
  if (invitedError) return jsonError('Falha ao localizar convite pendente.', 500);

  if (!invitedMemberships?.length) {
    let activeQuery = admin
      .from('tenant_memberships')
      .select('id,tenant_id,status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false });

    if (tenantId) activeQuery = activeQuery.eq('tenant_id', tenantId);

    const { data: activeMemberships, error: activeError } = await activeQuery;
    if (activeError) return jsonError('Falha ao validar vinculo ativo.', 500);
    if (activeMemberships?.length) {
      const activeTenantId = String(activeMemberships[0].tenant_id);
      await admin
        .from('profiles')
        .update({ active_tenant_id: activeTenantId, is_active: true })
        .eq('id', user.id);

      return NextResponse.json({
        data: {
          acceptedMemberships: [],
          activeTenantId,
          alreadyActive: true,
        },
        error: null,
      });
    }

    return jsonError('Nenhum convite pendente foi encontrado para este usuario.', 404);
  }

  if (!tenantId && invitedMemberships.length > 1) {
    return jsonError('Ha mais de um convite pendente. Abra o link mais recente do tenant.', 409);
  }

  const nowIso = new Date().toISOString();
  const acceptedIds = invitedMemberships.map((membership) => String(membership.id));
  const activeTenantId = String(invitedMemberships[0].tenant_id);

  const { error: updateError } = await admin
    .from('tenant_memberships')
    .update({
      status: 'active',
      accepted_at: nowIso,
      updated_at: nowIso,
    })
    .eq('user_id', user.id)
    .in('id', acceptedIds);

  if (updateError) return jsonError('Falha ao ativar convite.', 500);

  const { error: profileError } = await admin
    .from('profiles')
    .update({ active_tenant_id: activeTenantId, is_active: true })
    .eq('id', user.id);
  if (profileError) return jsonError('Convite ativado, mas perfil nao foi atualizado.', 500);

  const auditRows = invitedMemberships.map((membership) => ({
    tenant_id: String(membership.tenant_id),
    user_id: user.id,
    action: 'tenant_membership.invite_accepted',
    entity_type: 'tenant_membership',
    entity_id: String(membership.id),
    metadata: {
      acceptedAt: nowIso,
      source: 'auth_accept_invite',
    },
  }));

  const { error: auditError } = await admin.from('audit_logs').insert(auditRows);
  if (auditError) return jsonError('Convite ativado, mas auditoria falhou.', 500);

  return NextResponse.json({
    data: {
      acceptedMemberships: acceptedIds,
      activeTenantId,
      alreadyActive: false,
    },
    error: null,
  });
}
