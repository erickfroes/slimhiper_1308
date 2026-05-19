'use client';

import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type AuthorizationState = boolean | null;

export default function PlatformAdminGuard({
  children,
  backHref = '/admin',
  backLabel = 'Voltar ao Admin',
  initialAuthorized = null,
}: {
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  initialAuthorized?: AuthorizationState;
}) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<AuthorizationState>(initialAuthorized);

  useEffect(() => {
    let mounted = true;

    const resolveAuthorization = async () => {
      const response = await fetch('/api/auth/app-session', { cache: 'no-store' });
      const result: { authenticated: boolean; canAccessPlatformAdmin: boolean } =
        await response.json();

      if (!mounted) return;

      if (!result.authenticated) {
        router.replace('/auth/login');
        return;
      }

      setAuthorized(result.canAccessPlatformAdmin);
    };

    if (initialAuthorized === null) {
      void resolveAuthorization();
    }

    return () => {
      mounted = false;
    };
  }, [initialAuthorized, router]);

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <Shield size={28} className="text-red-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground mb-1">Acesso Negado</h2>
            <p className="text-sm text-muted-foreground">
              Esta área é restrita ao proprietário da plataforma. Você não tem permissão para
              acessar este painel.
            </p>
          </div>
          <Link href={backHref} className="btn-primary">
            {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
