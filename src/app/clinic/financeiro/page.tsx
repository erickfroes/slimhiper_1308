import React from 'react';
import DashboardShell from '@/components/DashboardShell';
import ClinicFinanceiroContent from './components/ClinicFinanceiroContent';

export default function ClinicFinanceiroPage() {
  return (
    <DashboardShell>
      <ClinicFinanceiroContent />
    </DashboardShell>
  );
}
