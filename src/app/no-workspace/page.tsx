import Link from 'next/link';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import NoWorkspaceActions from './NoWorkspaceActions';

type NoWorkspaceState = 'authenticated_without_workspace' | 'unauthenticated' | 'validation_error';

async function resolveNoWorkspaceState(): Promise<NoWorkspaceState> {
  try {
    const session = await getCurrentAppSession();
    return session ? 'authenticated_without_workspace' : 'unauthenticated';
  } catch {
    return 'validation_error';
  }
}

export default async function NoWorkspacePage() {
  const state = await resolveNoWorkspaceState();

  if (state === 'unauthenticated') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <section className="max-w-md text-center">
          <h1 className="mb-2 text-xl font-bold text-foreground">Sessao necessaria</h1>
          <p className="mb-5 text-sm text-muted-foreground">
            Entre novamente para que possamos validar seu workspace, perfil clinico ou acesso ao
            portal do paciente.
          </p>
          <Link href="/auth/login" className="btn-primary">
            Ir para login
          </Link>
        </section>
      </main>
    );
  }

  if (state === 'validation_error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <section className="max-w-md text-center">
          <h1 className="mb-2 text-xl font-bold text-foreground">
            Nao foi possivel validar a sessao
          </h1>
          <p className="mb-5 text-sm text-muted-foreground">
            A validacao falhou de forma segura. Tente sair e entrar novamente antes de acionar o
            suporte.
          </p>
          <NoWorkspaceActions />
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="max-w-md text-center">
        <h1 className="mb-2 text-xl font-bold text-foreground">Sem workspace ativo</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Sua conta esta autenticada, mas ainda nao possui um workspace clinico ativo ou vinculo de
          portal do paciente liberado.
        </p>
        <NoWorkspaceActions />
      </section>
    </main>
  );
}
