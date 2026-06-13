import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const session = await getCurrentAppSession();
  if (!session) return jsonError('Sessao obrigatoria para carregar webhooks.', 401);

  if (!canAccessPlatformAdminFromSession(session)) {
    return jsonError('Acesso administrativo obrigatorio para carregar webhooks.', 403);
  }

  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) return jsonError('Tenant invalido.', 400);

  const url = new URL(request.url);
  const limitInput = Number(url.searchParams.get('limit') ?? 100);
  const limit = Number.isFinite(limitInput)
    ? Math.min(Math.max(Math.trunc(limitInput), 1), 500)
    : 100;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError('Supabase server client nao configurado.', 503);

  const { data, error } = await supabase.rpc('list_platform_webhook_events', {
    p_limit: Math.max(limit * 5, 100),
  });

  if (error) {
    if (error.code === '42501') return jsonError('Acesso negado para carregar webhooks.', 403);
    return jsonError('Falha ao carregar webhooks do tenant.', 500);
  }

  const rows = Array.isArray(data) ? data : [];
  const filtered = rows.filter((row) => asRecord(row).tenantId === tenantId).slice(0, limit);

  return NextResponse.json({ data: filtered, error: null });
}
