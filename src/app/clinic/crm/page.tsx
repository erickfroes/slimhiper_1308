import React, { Suspense } from 'react';
import DashboardShell from '@/components/DashboardShell';
import CrmPipelineContent from '@/app/clinic/crm/components/CrmPipelineContent';

function CrmFallback() {
  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto space-y-4">
      <div className="h-24 rounded-2xl bg-muted animate-pulse" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-72 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function ClinicCrmPage() {
  return (
    <DashboardShell>
      <Suspense fallback={<CrmFallback />}>
        <CrmPipelineContent />
      </Suspense>
    </DashboardShell>
  );
}
