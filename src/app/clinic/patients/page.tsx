import React from 'react';
import DashboardShell from '@/components/DashboardShell';
import PatientListContent from '@/app/patient-list/components/PatientListContent';

export default function ClinicPatientsPage() {
  return (
    <DashboardShell>
      <PatientListContent />
    </DashboardShell>
  );
}
