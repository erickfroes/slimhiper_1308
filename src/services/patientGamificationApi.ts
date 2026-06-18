import { isMockDataEnabled } from '@/lib/mockMode';
import {
  resolveGamificationNextActionIcon,
  type GamificationPortalTab,
  type GamificationSummary,
} from '@/services/patientGamificationEngine';

export type GamificationApiError = { message: string; code?: string };

export interface GamificationTabShortcut {
  id: GamificationPortalTab;
  label: string;
  shortLabel: string;
}

export interface PatientGamificationSummaryResponse {
  data: GamificationSummary | null;
  error: GamificationApiError | null;
}

export function shouldUseMockDataForGamification() {
  return isMockDataEnabled();
}

function hydrateGamificationSummary(value: unknown): GamificationSummary | null {
  if (!value || typeof value !== 'object') return null;

  const summary = value as GamificationSummary;
  if (!summary.nextAction || typeof summary.nextAction !== 'object') return null;

  return {
    ...summary,
    fallbackReasons: Array.isArray(summary.fallbackReasons) ? summary.fallbackReasons : [],
    nextAction: {
      ...summary.nextAction,
      icon: resolveGamificationNextActionIcon(summary.nextAction.iconKey),
    },
  };
}

export async function getPatientGamificationSummary(params: {
  patientId?: string;
  targetDate?: string;
  tabItems: GamificationTabShortcut[];
}): Promise<PatientGamificationSummaryResponse> {
  if (shouldUseMockDataForGamification()) {
    return { data: null, error: { message: 'Modo mock sem persistencia de progresso.' } };
  }

  try {
    const url = new URL('/api/patient/gamification', window.location.origin);
    if (params.patientId) {
      url.searchParams.set('patientId', params.patientId);
    }

    if (params.targetDate) {
      url.searchParams.set('targetDate', params.targetDate);
    }

    const fallbackTabs = params.tabItems.map((item) => item.id);
    if (fallbackTabs.length > 0) {
      url.searchParams.set('tabs', fallbackTabs.join(','));
    }

    const response = await fetch(url.toString(), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return {
        data: null,
        error: { message: 'Nao foi possivel carregar gamificacao do paciente.' },
      };
    }

    const responsePayload = await response.json();
    const record = responsePayload as {
      data?: unknown;
      error?: { message?: string; code?: string };
    };

    if (!record || typeof record !== 'object') {
      return {
        data: null,
        error: { message: 'Resposta invalida do servico de gamificacao.' },
      };
    }

    if ((record as { error?: GamificationApiError | null }).error?.message) {
      const apiError = (record as { error?: GamificationApiError }).error;
      return { data: null, error: apiError ?? { message: 'Erro desconhecido.' } };
    }

    if (!record.data) {
      return { data: null, error: { message: 'Resumo de gamificacao indisponivel.' } };
    }

    const summary = hydrateGamificationSummary(record.data);
    if (!summary) {
      return { data: null, error: { message: 'Contrato de gamificacao invalido.' } };
    }

    return {
      data: summary,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Nao foi possivel buscar resumo de gamificacao.';
    return { data: null, error: { message } };
  }
}
