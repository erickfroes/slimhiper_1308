import React from 'react';
import { redirect } from 'next/navigation';
import PlatformAdminGuard from './components/PlatformAdminGuard';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentAppSession();

  if (!session) {
    redirect('/auth/login');
  }

  const authorized = canAccessPlatformAdminFromSession(session);

  return (
    <PlatformAdminGuard backHref="/" backLabel="Voltar ao Dashboard" initialAuthorized={authorized}>
      {children}
    </PlatformAdminGuard>
  );
}
