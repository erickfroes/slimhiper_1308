import React from 'react';
import DashboardShell from '@/components/DashboardShell';
import PatientListContent from './components/PatientListContent';

export default function PatientListPage() {
  return (
    <DashboardShell>
      <PatientListContent />
    </DashboardShell>
  );
}