'use client';

export default function ClinicError({
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
          Workspace clinico indisponivel
        </p>
        <h1 className="mt-2 text-xl font-bold text-foreground">
          Nao foi possivel carregar a area clinica
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A sessao ou os dados clinicos falharam durante o carregamento.
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
