import type { PatientReportDefinition } from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

type EdgeResponseEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    message?: string;
    code?: string;
  };
};

function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function unwrapEdgeResponse<T>(response: unknown): {
  data: T | null;
  error: SafeServiceError | null;
} {
  if (response && typeof response === 'object' && 'ok' in response) {
    const envelope = response as EdgeResponseEnvelope<T>;

    if (envelope.ok === true) {
      return { data: (envelope.data ?? null) as T | null, error: null };
    }

    return {
      data: null,
      error: {
        message:
          envelope.error?.message ??
          envelope.error?.code ??
          'Falha ao carregar relatorios clinicos.',
        code: envelope.error?.code,
      },
    };
  }

  return { data: response as T, error: null };
}

function normalizeReportDefinition(item: unknown): PatientReportDefinition | null {
  const record = asRecord(item);
  const key = asString(record.key);
  const label = asString(record.label);
  const description = asString(record.description);
  const iconKey = asString(record.iconKey, 'FileText');

  if (!key || !label || !description) return null;

  return {
    key,
    label,
    description,
    iconKey,
    badge: typeof record.badge === 'string' ? record.badge : undefined,
    badgeColor: typeof record.badgeColor === 'string' ? record.badgeColor : undefined,
    exportImplemented: asBoolean(record.exportImplemented),
  };
}

export async function getPatientReportDefinitions(
  patientId: string
): Promise<{ data: PatientReportDefinition[]; error: SafeServiceError | null }> {
  if (!isValidUuid(patientId)) {
    return {
      data: [],
      error: { message: 'Paciente invalido para carregar relatorios clinicos.' },
    };
  }

  if (isMockEnabled()) {
    const { mockReportDefinitions } = await import('@/data/mockData');
    return { data: mockReportDefinitions, error: null };
  }

  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.functions.invoke('patient-reports', {
      body: { patient_id: patientId },
    });

    if (error) {
      return {
        data: [],
        error: {
          message: 'Falha ao carregar relatorios clinicos.',
          code: error.name,
          details: error.message,
        },
      };
    }

    const unwrapped = unwrapEdgeResponse<unknown>(data);
    if (unwrapped.error) return { data: [], error: unwrapped.error };

    const reportDefinitions = Array.isArray(unwrapped.data)
      ? unwrapped.data
          .map(normalizeReportDefinition)
          .filter((item): item is PatientReportDefinition => Boolean(item))
      : null;

    if (!reportDefinitions) {
      return {
        data: [],
        error: {
          message: 'Contrato invalido de relatorios retornado pela Edge Function.',
          code: 'invalid_reports_contract',
        },
      };
    }

    return { data: reportDefinitions, error: null };
  } catch (error) {
    return {
      data: [],
      error: {
        message: 'Nao foi possivel carregar relatorios clinicos.',
        details: error instanceof Error ? error.message : undefined,
      },
    };
  }
}
