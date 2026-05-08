import React from 'react';
import DashboardShell from '@/components/DashboardShell';
import ClinicSettingsContent from './components/ClinicSettingsContent';

export default function ClinicSettingsPage() {
  return (
    <DashboardShell>
      <ClinicSettingsContent />
    </DashboardShell>
  );
}
