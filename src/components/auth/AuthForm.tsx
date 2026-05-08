'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseAnonKey, supabaseUrl, type SupabaseSession } from '@/lib/supabase';

function getRouteForRole(role: string | null) {
  if (role === 'platform_admin' || role === 'platform_support') return '/admin';
  if (
    role &&
    [
      'tenant_owner',
      'clinic_admin',
      'receptionist',
      'physician',
      'nutritionist',
      'fitness_professional',
      'financial_user',
    ].includes(role)
  )
    return '/clinic/dashboard';
  if (role === 'patient' || role === 'guardian') return '/patient';
  return '/clinic/dashboard';
}

export default function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.msg ?? 'Falha no login.');
      return;
    }

    const session = (await response.json()) as SupabaseSession;
    document.cookie = `sb-access-token=${session.access_token}; Path=/; Max-Age=${session.expires_in}; SameSite=Lax`;
    document.cookie = `sb-refresh-token=${session.refresh_token}; Path=/; Max-Age=${session.expires_in}; SameSite=Lax`;

    router.push(getRouteForRole(session.user?.app_metadata?.role ?? null));
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
