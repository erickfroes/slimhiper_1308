import React from 'react';
import { Suspense } from 'react';
import DashboardShell from '@/components/DashboardShell';
import PatientListContent from '@/app/patient-list/components/PatientListContent';
import { SkeletonTableRow } from '@/components/LoadingSkeleton';

function PatientsFallback() {
  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
      <div className="card-base overflow-hidden">
        <table className="w-full min-w-[1100px]">
          <tbody>
            {Array.from({ length: 8 }).map((_, index) => (
              <SkeletonTableRow key={`patients-fallback-${index}`} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ClinicPatientsPage() {
  return (
    <DashboardShell>
      <Suspense fallback={<PatientsFallback />}>
        <PatientListContent />
      </Suspense>
    </DashboardShell>
  );
}
