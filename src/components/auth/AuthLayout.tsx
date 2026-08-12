import React from 'react';
import AppLogo from '@/components/ui/AppLogo';
import { visualAssets } from '@/lib/visualAssets';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-surface-subtle p-0 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <section
        className="relative hidden overflow-hidden bg-brand-ink p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between"
        style={{
          backgroundImage: `url(${visualAssets.brandPatternDark})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-brand-ink/85" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <AppLogo variant="reversed" size={42} />
          <div>
            <p className="text-lg font-bold tracking-tight">SlimHiper</p>
            <p className="text-xs font-semibold tracking-wide text-brand-mint">Clinic OS</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-mint">
            Precisão clínica
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">
            Progresso visível. Operação sob controle.
          </h1>
          <p className="mt-5 text-base leading-7 text-primary-foreground/75">
            Uma experiência clínica clara para acompanhar pacientes, programas e a rotina da sua
            equipe.
          </p>
        </div>
        <p className="relative text-xs text-primary-foreground/60">SlimHiper Clinic OS</p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <AppLogo size={34} />
            <div>
              <p className="text-sm font-bold tracking-tight text-brand-ink">SlimHiper</p>
              <p className="text-xs font-semibold text-primary">Clinic OS</p>
            </div>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
