import React from 'react';
import DashboardShell from '@/components/DashboardShell';
import Patient360Content from './components/Patient360Content';

export default function Paciente360Page() {
  return (
    <DashboardShell>
      <Patient360Content patientId="patient-001" />
    </DashboardShell>
  );
}