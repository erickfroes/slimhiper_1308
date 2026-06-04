'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw } from 'lucide-react';
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

type Patient360LoadError = {
  title: string;
  message: string;
  toastMessage: string;
};

function mapPatient360LoadError(error: { message?: string; code?: string } | null) {
  const rawCode = error?.code ?? '';
  const rawMessage = error?.message ?? '';
  const normalized = `${rawCode} ${rawMessage}`.toLowerCase();

  if (normalized.includes('invalid_patient360_contract')) {
    return {
      title: 'Contrato do Paciente 360 invalido',
      message:
        'A resposta do backend nao possui o formato minimo esperado. O fallback mock continua bloqueado quando a flag de mock nao esta ativa.',
      toastMessage: 'Contrato invalido no Paciente 360.',
    };
  }

  if (
    normalized.includes('forbidden') ||
    normalized.includes('42501') ||
    normalized.includes('permission')
  ) {
    return {
      title: 'Acesso ao paciente negado',
      message:
        'Seu perfil nao possui permissao para visualizar este paciente ou o vinculo ativo nao pertence ao tenant atual.',
      toastMessage: 'Acesso negado ao Paciente 360.',
    };
  }

  if (
    normalized.includes('not_found') ||
    normalized.includes('p0002') ||
    normalized.includes('404')
  ) {
    return {
      title: 'Paciente nao encontrado',
      message: 'Verifique se o paciente existe, esta ativo e pertence ao tenant selecionado.',
      toastMessage: 'Paciente nao encontrado.',
    };
  }

  return {
    title: 'Paciente 360 indisponivel',
    message:
      'Nao foi possivel carregar o snapshot real do paciente. Tente novamente ou acione suporte se o erro persistir.',
    toastMessage: 'Falha ao carregar dados do paciente.',
  };
}

export default function Patient360Content({ patientId, userContext }: Patient360ContentProps) {
  const [data, setData] = useState<Patient360Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Patient360LoadError | null>(null);
  const loadRequestIdRef = useRef(0);

  const loadPatient360 = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const { data: summary, error: summaryError } = await getPatient360Summary(patientId);

      if (summaryError) {
        if (requestId !== loadRequestIdRef.current) return;
        const mappedError = mapPatient360LoadError(summaryError);
        setError(mappedError);
        toast.error(mappedError.toastMessage);
        console.error(
          '[Patient360Content] load error:',
          summaryError.code ?? 'patient360_summary_failed'
        );
        return;
      }

      if (!summary) {
        if (requestId !== loadRequestIdRef.current) return;
        const mappedError = mapPatient360LoadError({
          code: 'patient360_empty_summary',
          message: 'Patient summary returned empty.',
        });
        setError(mappedError);
        toast.error(mappedError.toastMessage);
        console.error('[Patient360Content] load error: patient360_empty_summary');
        return;
      }

      if (requestId !== loadRequestIdRef.current) return;
      setData(summary);
    } catch {
      if (requestId !== loadRequestIdRef.current) return;
      const mappedError = mapPatient360LoadError(null);
      setError(mappedError);
      toast.error(mappedError.toastMessage);
      console.error('[Patient360Content] load error: patient360_unexpected_error');
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
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
        <div className="card-base mx-auto max-w-2xl p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle size={20} />
          </div>
          <p className="mb-1 mt-4 text-base font-semibold text-foreground">
            {error?.title ?? 'Paciente nao encontrado'}
          </p>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground">
            {error?.message ?? 'Verifique o ID do paciente e tente novamente.'}
          </p>
          {error && (
            <button
              type="button"
              onClick={() => void loadPatient360()}
              className="btn-primary mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              <RefreshCw size={14} />
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
