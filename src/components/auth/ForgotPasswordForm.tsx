'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'ready' | 'saving' | 'sent' | 'error'>('ready');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setState('saving');
    const supabase = createClient();
    if (!supabase) {
      setError('Supabase nao esta configurado neste ambiente.');
      setState('error');
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (resetError) {
      setError('Nao foi possivel solicitar a recuperacao de senha. Tente novamente.');
      setState('error');
      return;
    }
    setState('sent');
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
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Redefinir senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enviaremos um link seguro para o seu e-mail.
        </p>
      </div>
      {state === 'sent' ? (
        <div
          role="status"
          className="rounded-lg border border-positive-border bg-positive-bg p-3 text-sm text-positive-foreground"
        >
          Se o e-mail estiver cadastrado, você receberá as instruções para criar uma nova senha.
        </div>
      ) : (
        <>
          <label className="block space-y-1.5 text-sm font-semibold text-foreground">
            <span>E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input-base min-h-11 bg-surface-subtle"
            />
          </label>
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-negative-border bg-negative-bg p-3 text-sm text-negative-foreground"
            >
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={state === 'saving'}
            className="btn-primary min-h-11 w-full justify-center"
          >
            {state === 'saving' ? 'Enviando...' : 'Enviar link de recuperação'}
          </button>
        </>
      )}
      <Link href="/auth/login" className="btn-ghost min-h-11 w-full justify-center">
        Voltar para login
      </Link>
    </form>
  );
}
