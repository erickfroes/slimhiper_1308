import Link from 'next/link';

export default function NoWorkspacePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="max-w-md text-center">
        <h1 className="mb-2 text-xl font-bold text-foreground">Sem workspace ativo</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Sua conta esta autenticada, mas ainda nao possui um workspace clinico ativo ou vinculo de
          portal do paciente.
        </p>
        <Link href="/auth/login" className="btn-secondary">
          Voltar ao login
        </Link>
      </section>
    </main>
  );
}
