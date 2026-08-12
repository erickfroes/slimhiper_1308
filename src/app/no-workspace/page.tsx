import Link from 'next/link';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import NoWorkspaceActions from './NoWorkspaceActions';
import AppLogo from '@/components/ui/AppLogo';
import { ShieldAlert } from 'lucide-react';

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
      <main className="flex min-h-screen items-center justify-center bg-surface-subtle px-6">
        <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center card-shadow sm:p-8">
          <AppLogo size={38} className="justify-center" />
          <div className="mx-auto mt-5 flex h-11 w-11 items-center justify-center rounded-lg bg-warning-bg text-warning-foreground">
            <ShieldAlert className="h-5 w-5" />
          </div>
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
      <main className="flex min-h-screen items-center justify-center bg-surface-subtle px-6">
        <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center card-shadow sm:p-8">
          <AppLogo size={38} className="justify-center" />
          <div className="mx-auto mt-5 flex h-11 w-11 items-center justify-center rounded-lg bg-negative-bg text-negative-foreground">
            <ShieldAlert className="h-5 w-5" />
          </div>
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
    <main className="flex min-h-screen items-center justify-center bg-surface-subtle px-6">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center card-shadow sm:p-8">
        <AppLogo size={38} className="justify-center" />
        <div className="mx-auto mt-5 flex h-11 w-11 items-center justify-center rounded-lg bg-warning-bg text-warning-foreground">
          <ShieldAlert className="h-5 w-5" />
        </div>
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
