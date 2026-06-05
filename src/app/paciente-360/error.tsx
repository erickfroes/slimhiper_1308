'use client';

export default function Patient360Error({
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
          Paciente 360 indisponivel
        </p>
        <h1 className="mt-2 text-xl font-bold text-foreground">
          Nao foi possivel carregar o prontuario
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A consulta do paciente falhou antes da tela ficar pronta.
        </p>
        {error.digest ? (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Referencia: {error.digest}
          </p>
        ) : null}
        <button type="button" className="btn-primary mt-5" onClick={() => reset()}>
          Recarregar
        </button>
      </section>
    </main>
  );
}
