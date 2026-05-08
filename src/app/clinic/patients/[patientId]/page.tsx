import React from 'react';
import DashboardShell from '@/components/DashboardShell';
import Patient360Content from '@/app/paciente-360/components/Patient360Content';
import { getCurrentUserContext } from '@/lib/auth/getCurrentUserContext';

interface ClinicPatientPageProps {
  params: Promise<{ patientId: string }>;
}

export default async function ClinicPatientPage({ params }: ClinicPatientPageProps) {
  const { patientId } = await params;
  const userContext = await getCurrentUserContext();

  return (
    <DashboardShell>
      <Patient360Content patientId={patientId} userContext={userContext} />
    </DashboardShell>
  );
}
