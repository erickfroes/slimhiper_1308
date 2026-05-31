import type { ReactNode } from 'react';
import Link from 'next/link';
import { getClinicAccessState } from '@/lib/auth/clinicAccessGuard';

function ClinicAccessStateView({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="max-w-md text-center">
        <h1 className="mb-2 text-xl font-bold text-foreground">{title}</h1>
        <p className="mb-5 text-sm text-muted-foreground">{description}</p>
        <Link href={actionHref} className="btn-primary">
          {actionLabel}
        </Link>
      </section>
    </main>
  );
}

export default async function ClinicLayout({ children }: { children: ReactNode }) {
  const access = await getClinicAccessState();

  if (access.status === 'ok') {
    return <>{children}</>;
  }

  if (access.status === 'unauthenticated') {
    return (
      <ClinicAccessStateView
        title="Sessao necessaria"
        description="Entre novamente para acessar o workspace clinico."
        actionHref="/auth/login"
        actionLabel="Ir para login"
      />
    );
  }

  if (access.status === 'no_workspace') {
    return (
      <ClinicAccessStateView
        title="Sem workspace clinico ativo"
        description="Sua conta esta autenticada, mas ainda nao possui um vinculo clinico ativo."
        actionHref="/no-workspace"
        actionLabel="Ver opcoes"
      />
    );
  }

  if (access.status === 'forbidden') {
    return (
      <ClinicAccessStateView
        title="Acesso clinico negado"
        description="Seu vinculo atual nao tem permissao para abrir o workspace clinico."
        actionHref="/no-workspace"
        actionLabel="Ver workspace"
      />
    );
  }

  return (
    <ClinicAccessStateView
      title="Nao foi possivel validar a sessao"
      description="A validacao da sessao falhou. Tente novamente em instantes."
      actionHref="/auth/login"
      actionLabel="Voltar ao login"
    />
  );
}
