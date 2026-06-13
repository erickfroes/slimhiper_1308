'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type AppSessionResponse = {
  authenticated: boolean;
  targetRoute?: string;
};

type InviteState = 'checking' | 'ready' | 'saving' | 'error';

type InviteOtpType = 'invite' | 'recovery';

function authHashError() {
  if (typeof window === 'undefined') return '';
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  return (
    hash.get('error_description') ??
    hash.get('error') ??
    search.get('error_description') ??
    search.get('error') ??
    ''
  );
}

function getInviteOtpType(value: string | null): InviteOtpType {
  return value === 'recovery' ? 'recovery' : 'invite';
}

export default function AcceptInviteForm() {
  const router = useRouter();
  const [state, setState] = useState<InviteState>('checking');
  const [email, setEmail] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveInviteSession() {
      const supabase = createClient();
      if (!supabase) {
        setError('Supabase nao esta configurado para aceitar convites neste ambiente.');
        setState('error');
        return;
      }

      const hashError = authHashError();
      if (hashError) {
        setError('O link de convite esta invalido ou expirado. Solicite um novo convite.');
        setState('error');
        return;
      }

      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const inviteTenantId = url.searchParams.get('tenantId') ?? '';
      const otpType = getInviteOtpType(url.searchParams.get('type'));
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError('Nao foi possivel validar o convite. Solicite um novo link.');
          setState('error');
          return;
        }
      } else if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        });
        if (verifyError) {
          setError('Nao foi possivel validar o convite. Solicite um novo link.');
          setState('error');
          return;
        }
      } else if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setSessionError) {
          setError('Nao foi possivel validar o convite. Solicite um novo link.');
          setState('error');
          return;
        }
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionError || !data.session) {
        setError('Sessao do convite nao encontrada. Abra o link mais recente enviado por e-mail.');
        setState('error');
        return;
      }

      window.history.replaceState({}, document.title, '/auth/accept-invite');
      setEmail(data.session.user.email ?? '');
      setTenantId(inviteTenantId);
      setState('ready');
    }

    void resolveInviteSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas nao conferem.');
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError('Supabase nao esta configurado para aceitar convites neste ambiente.');
      return;
    }

    setState('saving');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError('Nao foi possivel salvar a senha. Solicite um novo convite.');
      setState('ready');
      return;
    }

    const acceptResponse = await fetch('/api/auth/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: tenantId || undefined }),
    });
    const acceptPayload = (await acceptResponse.json().catch(() => null)) as {
      error?: { message?: string } | null;
    } | null;
    if (!acceptResponse.ok || acceptPayload?.error) {
      setError(
        acceptPayload?.error?.message ??
          'Senha salva, mas nao foi possivel ativar o convite. Solicite suporte.'
      );
      setState('ready');
      return;
    }

    try {
      const sessionResponse = await fetch('/api/auth/app-session', { cache: 'no-store' });
      const session = (await sessionResponse.json()) as AppSessionResponse;
      router.push(session.authenticated ? (session.targetRoute ?? '/') : '/auth/login');
      router.refresh();
    } catch {
      router.push('/auth/login');
      router.refresh();
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6"
    >
      <div>
        <h1 className="text-xl font-semibold text-foreground">Criar senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Complete o convite para acessar o workspace SlimHiper.
        </p>
      </div>

      {email ? (
        <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {email}
        </div>
      ) : null}

      {state === 'checking' ? (
        <p className="text-sm text-muted-foreground">Validando convite...</p>
      ) : null}

      {state !== 'checking' ? (
        <>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Nova senha"
            autoComplete="new-password"
            disabled={state === 'saving' || state === 'error'}
            className="w-full rounded-xl border border-border bg-background p-3 outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirmar senha"
            autoComplete="new-password"
            disabled={state === 'saving' || state === 'error'}
            className="w-full rounded-xl border border-border bg-background p-3 outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state !== 'ready'}
        className="w-full rounded-xl bg-primary py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === 'saving' ? 'Salvando...' : 'Criar senha e entrar'}
      </button>
    </form>
  );
}
