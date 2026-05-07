import React from 'react';
import DashboardShell from '@/components/DashboardShell';
import Patient360Content from '@/app/paciente-360/components/Patient360Content';

interface ClinicPatientPageProps {
  params: Promise<{ patientId: string }>;
}

export default async function ClinicPatientPage({ params }: ClinicPatientPageProps) {
  const { patientId } = await params;
  return (
    <DashboardShell>
      <Patient360Content patientId={patientId} />
    </DashboardShell>
  );
}
