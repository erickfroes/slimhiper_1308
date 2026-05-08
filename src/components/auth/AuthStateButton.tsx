'use client';

import { usePathname, useRouter } from 'next/navigation';

export default function AuthStateButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname.startsWith('/auth/login')) {
    return null;
  }

  async function handleLogout() {
    const refreshToken = document.cookie
      .split('; ')
      .find((part) => part.startsWith('sb-refresh-token='))
      ?.split('=')[1];

    if (refreshToken) {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    }

    document.cookie = 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax';
    document.cookie = 'sb-refresh-token=; Path=/; Max-Age=0; SameSite=Lax';

    router.push('/auth/login');
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className="fixed right-4 top-4 z-50 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      Sair
    </button>
  );
}
