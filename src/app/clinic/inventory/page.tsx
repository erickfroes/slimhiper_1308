import React, { Suspense } from 'react';
import DashboardShell from '@/components/DashboardShell';
import InventoryOperationsContent from '@/app/clinic/inventory/components/InventoryOperationsContent';

function InventoryFallback() {
  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto space-y-4">
      <div className="h-24 rounded-2xl bg-muted animate-pulse" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-64 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function ClinicInventoryPage() {
  return (
    <DashboardShell>
      <Suspense fallback={<InventoryFallback />}>
        <InventoryOperationsContent />
      </Suspense>
    </DashboardShell>
  );
}
