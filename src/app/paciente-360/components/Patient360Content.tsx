'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getPatient360Summary } from '@/services/patient360Api';
import type { Patient360Summary } from '@/domain/types';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPatient360 = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: summary, error: summaryError } = await getPatient360Summary(patientId);

      if (summaryError) {
        throw new Error(summaryError.message);
      }

      setData(summary);
    } catch (loadError) {
      const message = 'Falha ao carregar dados do paciente. Tente novamente.';
      setError(message);
      toast.error(message);
      if (loadError instanceof Error) {
        console.error('[Patient360Content] load error:', loadError.message);
      }
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void loadPatient360();
  }, [loadPatient360]);

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
          <p className="text-base font-semibold text-foreground mb-1">
            {error ? 'Falha ao carregar paciente' : 'Paciente não encontrado'}
          </p>
          <p className="text-sm text-muted-foreground">
            {error
              ? 'Não foi possível carregar os dados. Tente novamente.'
              : 'Verifique o ID do paciente e tente novamente.'}
          </p>
          {error && (
            <button
              type="button"
              onClick={() => void loadPatient360()}
              className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Tentar novamente
            </button>
          )}
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
          { label: data.profile.name?.trim() || 'Paciente sem nome' },
        ]}
      />
      <PatientHeaderCard data={data} patientId={patientId} userContext={userContext} />
      <Patient360Tabs data={data} patientId={patientId} userContext={userContext} />
    </div>
  );
}
