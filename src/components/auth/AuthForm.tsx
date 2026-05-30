'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const supabase = createClient();
    if (!supabase) {
      setError('Supabase não está configurado para login neste ambiente.');
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message ?? 'Falha no login.');
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4"
    >
      <h1 className="text-xl font-semibold text-foreground">Entrar</h1>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-mail"
        className="w-full rounded-xl border border-border bg-background p-3 outline-none"
      />
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Senha"
        className="w-full rounded-xl border border-border bg-background p-3 outline-none"
      />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <button
        type="submit"
        className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium"
      >
        Entrar
      </button>
    </form>
  );
}
