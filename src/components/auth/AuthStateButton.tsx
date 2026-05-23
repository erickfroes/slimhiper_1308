'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthStateButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname?.startsWith('/auth/login')) {
    return null;
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase?.auth?.signOut();

    router?.push('/auth/login');
    router?.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="fixed right-4 top-4 z-50 rounded-lg border border-border bg-card px-3 py-2 text-sm"
    >
      Sair
    </button>
  );
}
