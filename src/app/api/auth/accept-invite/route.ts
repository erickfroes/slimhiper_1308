import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { withSecureRoute } from '@/lib/security/route';

async function acceptInvitation(request: Request) {
  const supabase = await createClient();
  const admin = createSupabaseAdminClient();
  if (!supabase || !admin)
    return NextResponse.json(
      { data: null, error: { message: 'Servico indisponivel.' } },
      { status: 503 }
    );
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !user.email_confirmed_at) {
    return NextResponse.json(
      { data: null, error: { message: 'Sessao e e-mail confirmado obrigatorios.' } },
      { status: 401 }
    );
  }
  const body = await request.json().catch(() => null);
  const token = body?.inviteToken;
  const tenantId = body?.tenantId ?? null;
  if (
    typeof token !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    (tenantId !== null &&
      (typeof tenantId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          tenantId
        )))
  ) {
    return NextResponse.json(
      { data: null, error: { message: 'Convite invalido.' } },
      { status: 400 }
    );
  }
  const tokenHash = createHash('sha256').update(token).digest('hex');
  // Check proof before revoking sessions; the RPC revalidates it under locks.
  const { data: proof, error: proofError } = await admin
    .from('tenant_invitation_tokens')
    .select('id')
    .eq('token_hash', tokenHash)
    .eq('user_id', user.id)
    .eq('email', (user.email ?? '').trim().toLowerCase())
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (proofError || !proof)
    return NextResponse.json(
      { data: null, error: { message: 'Convite invalido, expirado ou utilizado.' } },
      { status: 403 }
    );
  const { error: revokeError } = await supabase.auth.signOut({ scope: 'others' });
  if (revokeError)
    return NextResponse.json(
      { data: null, error: { message: 'Falha ao proteger as sessoes anteriores.' } },
      { status: 503 }
    );
  const { data, error: acceptError } = await admin.rpc('accept_tenant_invitation', {
    p_token_hash: tokenHash,
    p_tenant_id: tenantId,
    p_user_id: user.id,
  });
  if (acceptError)
    return NextResponse.json(
      {
        data: null,
        error: { message: 'Convite invalido ou nao pode ser ativado. Solicite novo envio.' },
      },
      { status: acceptError.code === '42501' ? 403 : 503 }
    );
  return NextResponse.json({ data, error: null });
}

export const POST = withSecureRoute(acceptInvitation, { scope: 'auth:accept-invite', limit: 10 });
