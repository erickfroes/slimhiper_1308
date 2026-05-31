import React from 'react';
import DashboardShell from '@/components/DashboardShell';
import ClinicDocumentsContent from './components/ClinicDocumentsContent';

export default function ClinicDocumentsPage() {
  return (
    <DashboardShell>
      <ClinicDocumentsContent />
    </DashboardShell>
  );
}
