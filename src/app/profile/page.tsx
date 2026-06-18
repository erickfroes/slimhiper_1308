import { redirect } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import {
  getAppSessionTargetRoute,
  getCurrentAppSession,
} from '@/services/session/getCurrentAppSession';
import ProfileContent from './ProfileContent';

export default async function ProfilePage() {
  const session = await getCurrentAppSession();

  if (!session) {
    redirect('/auth/login');
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <AppLogo size={32} />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground">Meu perfil</h1>
            <p className="truncate text-sm text-muted-foreground">{session.email}</p>
          </div>
        </div>
      </header>
      <ProfileContent backHref={getAppSessionTargetRoute(session)} />
    </main>
  );
}
