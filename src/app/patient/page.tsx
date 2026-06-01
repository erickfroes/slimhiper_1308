import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PatientPortalContent from './components/PatientPortalContent';

export default async function PatientPage() {
  const supabase = await createClient();
  if (!supabase) redirect('/auth/login');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { error } = await supabase.rpc('get_patient_portal_snapshot', { p_patient_id: null });
  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <section className="max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-foreground">Acesso ao portal nao liberado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este usuario precisa de permissao patient_portal.access e vinculo ativo como paciente ou
            responsavel para abrir o portal.
          </p>
        </section>
      </main>
    );
  }

  return <PatientPortalContent />;
}
