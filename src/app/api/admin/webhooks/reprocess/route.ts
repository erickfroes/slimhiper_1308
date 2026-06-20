import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createClient } from '@/lib/supabase/server';
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

export async function POST(request: Request) {
  const session = await getCurrentAppSession();

  if (!session) {
    return jsonError('Sessao obrigatoria para reprocessar webhook.', 401);
  }

  const canReprocess =
    isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole);

  if (!canAccessPlatformAdminFromSession(session) || !canReprocess) {
    return jsonError('Apenas administradores da plataforma podem solicitar reprocesso.', 403);
  }

  const supabase = await createClient();
  if (!supabase) {
    return jsonError('Supabase client nao configurado no servidor.', 503);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError('Payload JSON invalido.', 400);

  const provider = normalizeText(body.provider, 20).toLowerCase();
  const eventId = normalizeText(body.eventId, 80);
  const reason = normalizeText(body.reason, 500);
  const scope = normalizeText(body.scope, 240);

  if (provider !== 'asaas' && provider !== 'd4sign' && provider !== 'mercadopago') {
    return jsonError('Provider invalido.', 400);
  }

  if (!isUuid(eventId)) {
    return jsonError('Evento de webhook invalido.', 400);
  }

  if (reason.length < 12) {
    return jsonError('Informe um motivo auditavel com pelo menos 12 caracteres.', 400);
  }

  if (scope.length < 8) {
    return jsonError('Informe um escopo operacional com pelo menos 8 caracteres.', 400);
  }

  const composedReason = `${reason} Escopo: ${scope}`;
  const { data, error } = await supabase.rpc('request_webhook_reprocess', {
    p_provider: provider,
    p_event_id: eventId,
    p_reason: composedReason,
  });

  if (error) {
    return jsonError('Falha ao solicitar reprocesso.', 500);
  }

  return NextResponse.json({ data, error: null });
}
