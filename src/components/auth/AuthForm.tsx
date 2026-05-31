'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type AppSessionResponse = {
  authenticated: boolean;
  targetRoute?: string;
};

export default function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    if (!supabase) {
      setError('Supabase nao esta configurado para login neste ambiente.');
      setSubmitting(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError('Nao foi possivel entrar com essas credenciais.');
      setSubmitting(false);
      return;
    }

    try {
      const sessionResponse = await fetch('/api/auth/app-session', { cache: 'no-store' });
      const session = (await sessionResponse.json()) as AppSessionResponse;

      router.push(session.authenticated ? (session.targetRoute ?? '/') : '/auth/login');
      router.refresh();
    } catch {
      setError('Login realizado, mas nao foi possivel validar o destino da sessao.');
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4"
    >
      <h1 className="text-xl font-semibold text-foreground">Entrar</h1>
      <input
        id="login-email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="E-mail"
        autoComplete="email"
        disabled={submitting}
        className="w-full rounded-xl border border-border bg-background p-3 outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
      <input
        id="login-password"
        type="password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Senha"
        autoComplete="current-password"
        disabled={submitting}
        className="w-full rounded-xl border border-border bg-background p-3 outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
