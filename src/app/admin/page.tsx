'use client';

import React, { useState, useEffect } from 'react';
import AdminContent from './components/AdminContent';
import { Shield } from 'lucide-react';

// Route protection: only platform_admin role can access
// In production, replace with real auth check from Supabase session
const MOCK_USER_ROLE = 'platform_admin'; // Change to 'clinic_admin' to test access denial

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    // TODO: Replace with real auth check → supabase.auth.getUser() + check role
    const role = MOCK_USER_ROLE;
    setAuthorized(role === 'platform_admin');
  }, []);

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
          <a href="/" className="btn-primary">
            Voltar ao Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <AdminContent />;
}
