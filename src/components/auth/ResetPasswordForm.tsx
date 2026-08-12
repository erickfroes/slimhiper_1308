'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type State = 'checking' | 'ready' | 'saving' | 'error';
export default function ResetPasswordForm() {
  const [state, setState] = useState<State>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function verify() {
      const supabase = createClient();
      if (!supabase) {
        if (!cancelled) {
          setError('Supabase nao esta configurado neste ambiente.');
          setState('error');
        }
        return;
      }
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      let authError = hash.get('error_description') ?? url.searchParams.get('error_description');
      if (!authError && code)
        authError = (await supabase.auth.exchangeCodeForSession(code)).error?.message ?? null;
      else if (!authError && tokenHash)
        authError =
          (await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })).error
            ?.message ?? null;
      else if (!authError && hash.get('access_token') && hash.get('refresh_token'))
        authError =
          (
            await supabase.auth.setSession({
              access_token: hash.get('access_token')!,
              refresh_token: hash.get('refresh_token')!,
            })
          ).error?.message ?? null;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (authError || !data.session) {
        setError('Este link de recuperação é inválido ou expirou. Solicite um novo link.');
        setState('error');
        return;
      }
      window.history.replaceState({}, document.title, '/auth/reset-password');
      setState('ready');
    }
    void verify();
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
      setError('Supabase nao esta configurado neste ambiente.');
      return;
    }
    setState('saving');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError('Nao foi possivel atualizar sua senha. Solicite um novo link.');
      setState('ready');
      return;
    }
    await supabase.auth.signOut();
    window.location.assign('/auth/login');
  }
  return (
    <form
      onSubmit={onSubmit}
      className="w-full space-y-5 rounded-xl border border-border bg-card p-6 card-shadow sm:p-8"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
          Recuperação de acesso
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Criar nova senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Escolha uma senha com pelo menos oito caracteres.
        </p>
      </div>
      {state === 'checking' ? (
        <p className="text-sm text-muted-foreground">Validando link seguro...</p>
      ) : null}
      {state === 'ready' || state === 'saving' ? (
        <>
          <label className="block space-y-1.5 text-sm font-semibold text-foreground">
            <span>Nova senha</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={state === 'saving'}
              className="input-base min-h-11 bg-surface-subtle"
            />
          </label>
          <label className="block space-y-1.5 text-sm font-semibold text-foreground">
            <span>Confirmar nova senha</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={state === 'saving'}
              className="input-base min-h-11 bg-surface-subtle"
            />
          </label>
          <button
            type="submit"
            disabled={state === 'saving'}
            className="btn-primary min-h-11 w-full justify-center"
          >
            {state === 'saving' ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-negative-border bg-negative-bg p-3 text-sm text-negative-foreground"
        >
          {error}
        </p>
      ) : null}
      <Link href="/auth/forgot-password" className="btn-ghost min-h-11 w-full justify-center">
        Solicitar novo link
      </Link>
    </form>
  );
}
