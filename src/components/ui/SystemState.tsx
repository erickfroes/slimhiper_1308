import React from 'react';
import { AlertTriangle, FileQuestion, Loader2, RefreshCw } from 'lucide-react';

export function SystemLoading({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section
        className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 card-shadow"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </section>
    </main>
  );
}

export function SystemError({
  title,
  description,
  reference,
  actionLabel = 'Tentar novamente',
  onRetry,
}: {
  title: string;
  description: string;
  reference?: string;
  actionLabel?: string;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section
        className="w-full max-w-md rounded-xl border border-negative-border bg-card p-6 card-shadow"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-negative-bg text-negative-foreground">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {reference ? (
          <p className="mt-4 rounded-lg bg-surface-subtle px-3 py-2 font-mono text-xs text-muted-foreground">
            Referência: {reference}
          </p>
        ) : null}
        <button type="button" className="btn-primary mt-5 min-h-11" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </button>
      </section>
    </main>
  );
}

export function SystemNotFound({ onBack, onHome }: { onBack: () => void; onHome: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center card-shadow">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-surface-subtle text-muted-foreground">
          <FileQuestion className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-foreground">Página não encontrada</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O endereço não existe ou não está mais disponível.
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <button type="button" onClick={onBack} className="btn-secondary min-h-11">
            Voltar
          </button>
          <button type="button" onClick={onHome} className="btn-primary min-h-11">
            Ir para o início
          </button>
        </div>
      </section>
    </main>
  );
}
