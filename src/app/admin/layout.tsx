import React from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentAppSession();

  if (!session) {
    redirect('/auth/login');
  }

  const authorized = canAccessPlatformAdminFromSession(session);

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <h2 className="mb-2 text-lg font-bold text-foreground">Acesso negado</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Esta area e restrita a usuarios autorizados da plataforma.
          </p>
          <Link href="/" className="btn-primary">
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
