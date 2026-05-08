'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getPatient360, getPatientDocuments360 } from '@/services/mockApi';
import type { Patient360Summary, PatientDocument360Item } from '@/domain/types';
import type { UserContext } from '@/lib/auth/getCurrentUserContext';
import PatientHeaderCard from '@/components/PatientHeaderCard';
import Patient360Tabs from './Patient360Tabs';
import { SkeletonCard } from '@/components/LoadingSkeleton';
import PageHeader from '@/components/PageHeader';

interface Patient360ContentProps {
  patientId: string;
  userContext: UserContext | null;
}

export default function Patient360Content({ patientId, userContext }: Patient360ContentProps) {
  const [data, setData] = useState<Patient360Summary | null>(null);
  const [documents360, setDocuments360] = useState<PatientDocument360Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Backend integration point: replace with getPatient360(patientId) Supabase call
    Promise.all([getPatient360(patientId), getPatientDocuments360(patientId)])
      .then(([patient, docs]) => {
        setData(patient);
        setDocuments360(docs);
      })
      .catch(() => toast.error('Falha ao carregar dados do paciente. Tente novamente.'))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) {
    return (
      <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto space-y-4">
        <div className="h-7 bg-muted rounded-xl w-48 animate-pulse mb-4" />
        <div className="card-base p-5 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-muted rounded w-48" />
              <div className="h-3 bg-muted rounded w-32" />
              <div className="h-3 bg-muted rounded w-64" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`tab-skel-${i}`} className="h-9 bg-muted rounded-xl w-20 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={`p360-skel-${i}`} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
        <div className="card-base p-8 text-center">
          <p className="text-base font-semibold text-foreground mb-1">Paciente não encontrado</p>
          <p className="text-sm text-muted-foreground">
            Verifique o ID do paciente e tente novamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
      <PageHeader
        title="Paciente 360°"
        breadcrumb={[
          { label: 'Pacientes', href: '/clinic/patients' },
          { label: data.profile.name },
        ]}
      />
      <PatientHeaderCard data={data} patientId={patientId} />
      <Patient360Tabs data={data} documents360={documents360} userContext={userContext} />
    </div>
  );
}
