import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function normalizeText(value: unknown, maxLength = 240) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function slugify(value: string) {
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

export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const session = await getCurrentAppSession();
  if (!session) return jsonError('Sessao obrigatoria para alterar unidade.', 401);

  const canManage =
    isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole);
  if (!canAccessPlatformAdminFromSession(session) || !canManage) {
    return jsonError('Apenas administradores da plataforma podem alterar unidades.', 403);
  }

  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) return jsonError('Tenant invalido.', 400);

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado no servidor.', 503);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError('Payload JSON invalido.', 400);

  const unitId = normalizeText(body.unitId, 80);
  const name = normalizeText(body.name, 120);
  const code = slugify(normalizeText(body.code, 80) || name);
  const status = normalizeText(body.status, 24).toLowerCase() || 'active';
  const city = normalizeText(body.city, 120);
  const state = normalizeText(body.state, 2)
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  const reason = normalizeText(body.reason, 500);

  if (!name) return jsonError('Informe o nome da unidade.', 400);
  if (!code) return jsonError('Codigo da unidade invalido.', 400);
  if (!['active', 'inactive', 'archived'].includes(status)) {
    return jsonError('Status da unidade invalido.', 400);
  }
  if (state && state.length !== 2) return jsonError('UF da unidade invalida.', 400);
  if (reason.length < 16) {
    return jsonError('Informe um motivo auditavel com pelo menos 16 caracteres.', 400);
  }
  if (unitId && !isUuid(unitId)) return jsonError('Unidade invalida.', 400);

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantError) return jsonError('Falha ao validar tenant.', 500);
  if (!tenant) return jsonError('Tenant nao encontrado.', 404);

  const payload = {
    tenant_id: tenantId,
    code,
    name,
    status,
    metadata: {
      city,
      state,
      source: 'platform_admin_console',
    },
  };

  const result = unitId
    ? await admin
        .from('tenant_units')
        .update(payload)
        .eq('tenant_id', tenantId)
        .eq('id', unitId)
        .select('id,code,name,status')
        .single()
    : await admin.from('tenant_units').insert(payload).select('id,code,name,status').single();

  if (result.error) return jsonError('Falha ao salvar unidade.', 500);

  const { error: auditError } = await admin.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: session.userId,
    action: unitId ? 'platform_tenant_unit.updated' : 'platform_tenant_unit.created',
    entity_type: 'tenant_unit',
    entity_id: result.data.id,
    metadata: {
      reason,
      unitId: result.data.id,
      code,
      status,
      source: 'platform_admin_console',
    },
  });
  if (auditError) return jsonError('Falha ao auditar unidade.', 500);

  return NextResponse.json({ data: result.data, error: null });
}
