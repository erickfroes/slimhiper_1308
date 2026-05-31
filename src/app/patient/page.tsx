export default function PatientPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="max-w-md text-center">
        <h1 className="mb-2 text-xl font-bold text-foreground">Portal do paciente bloqueado</h1>
        <p className="text-sm text-muted-foreground">
          O portal permanece fail-closed ate existir vinculo paciente-conta, RLS propria e smoke
          cross-patient autorizado.
        </p>
      </section>
    </main>
  );
}
