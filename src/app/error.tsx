'use client';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
          Falha inesperada
        </p>
        <h1 className="mt-2 text-xl font-bold text-foreground">
          Nao foi possivel carregar esta area
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tente novamente. Se o erro continuar, use a referencia abaixo para investigar nos logs.
        </p>
        {error.digest ? (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Referencia: {error.digest}
          </p>
        ) : null}
        <button type="button" className="btn-primary mt-5" onClick={() => reset()}>
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
