// Agenda e Fila — /clinic/agenda
// Backend integration point: replace service calls with Supabase queries

import React from 'react';
import DashboardShell from '@/components/DashboardShell';
import AgendaContent from './components/AgendaContent';

export default function AgendaPage() {
  return (
    <DashboardShell>
      <AgendaContent />
    </DashboardShell>
  );
}
