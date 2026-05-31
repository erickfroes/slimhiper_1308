import type { PatientReportDefinition } from '@/domain/types';

interface SafeServiceError {
  message: string;
}

function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

export async function getPatientReportDefinitions(
  patientId: string
): Promise<{ data: PatientReportDefinition[]; error: SafeServiceError | null }> {
  if (!patientId.trim()) {
    return {
      data: [],
      error: { message: 'Paciente inválido para carregar relatórios clínicos.' },
    };
  }

  if (isMockEnabled()) {
    const { mockReportDefinitions } = await import('@/data/mockData');
    return { data: mockReportDefinitions, error: null };
  }

  return {
    data: [],
    error: {
      message: 'Relatórios clínicos ainda não possuem contrato backend disponível.',
    },
  };
}
