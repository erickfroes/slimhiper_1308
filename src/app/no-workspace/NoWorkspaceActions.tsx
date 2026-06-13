import Link from 'next/link';

export default function NoWorkspaceActions() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
      <form action="/api/auth/logout" method="post">
        <button type="submit" className="btn-primary">
          Sair e voltar ao login
        </button>
      </form>
      <Link href="mailto:suporte@slimhiper.local" className="btn-secondary">
        Falar com suporte
      </Link>
    </div>
  );
}
