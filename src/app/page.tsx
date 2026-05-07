// Clinic Dashboard — entry point screen
// Backend integration point: replace service calls in components with Supabase queries

import React from 'react';
import DashboardShell from '@/components/DashboardShell';
import DashboardContent from './components/DashboardContent';

export default function ClinicDashboardPage() {
  return (
    <DashboardShell>
      <DashboardContent />
    </DashboardShell>
  );
}