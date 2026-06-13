'use client';

import { createClient } from '@/lib/supabase/client';

export async function signOutFromApp() {
  const supabase = createClient();

  await Promise.allSettled([
    supabase?.auth?.signOut() ?? Promise.resolve(),
    fetch('/api/auth/app-session', {
      method: 'DELETE',
      cache: 'no-store',
      credentials: 'include',
    }),
  ]);
}

export function redirectToLogin() {
  window.location.assign('/auth/login');
}
