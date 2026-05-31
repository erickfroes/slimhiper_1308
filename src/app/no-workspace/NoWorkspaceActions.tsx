'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function NoWorkspaceActions() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase?.auth?.signOut();

    router.push('/auth/login');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
      <button type="button" onClick={handleLogout} className="btn-primary">
        Sair e voltar ao login
      </button>
      <Link href="mailto:suporte@slimhiper.local" className="btn-secondary">
        Falar com suporte
      </Link>
    </div>
  );
}
