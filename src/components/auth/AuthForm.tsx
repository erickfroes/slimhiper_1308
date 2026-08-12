'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

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
      className="w-full space-y-5 rounded-xl border border-border bg-card p-6 card-shadow sm:p-8"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Acesso seguro</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          Entrar na sua clínica
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use suas credenciais para acessar o SlimHiper.
        </p>
      </div>
      <label className="block space-y-1.5 text-sm font-semibold text-foreground">
        <span>E-mail</span>
        <input
          id="login-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="E-mail"
          autoComplete="email"
          disabled={submitting}
          className="input-base min-h-11 bg-surface-subtle"
        />
      </label>
      <div className="flex justify-end">
        <Link
          href="/auth/forgot-password"
          className="rounded-sm text-sm font-semibold text-primary hover:text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Esqueci minha senha
        </Link>
      </div>
      <label className="block space-y-1.5 text-sm font-semibold text-foreground">
        <span>Senha</span>
        <input
          id="login-password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Senha"
          autoComplete="current-password"
          disabled={submitting}
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
        disabled={submitting}
        className="btn-primary min-h-11 w-full justify-center"
      >
        {submitting ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
