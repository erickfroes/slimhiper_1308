import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

export interface ClinicReportDefinition {
  id?: string | null;
  key: string;
  label: string;
  description: string;
  iconKey: string;
  badge?: string;
  badgeColor?: string;
  exportEnabled: boolean;
  requiresFinancialRead: boolean;
  requiresSensitiveRead: boolean;
  canRun: boolean;
  disabledReason?: string | null;
}

export interface ClinicReportFilters {
  from: string;
  to: string;
  unitId?: string;
  practitionerId?: string;
  programId?: string;
  financialStatus?: string;
  documentStatus?: string;
  patientId?: string;
  detail?: boolean;
}

export interface ClinicReportRun {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  reportKey: string;
  scope: 'clinic' | 'patient';
  patientId?: string | null;
  resultSummary: Record<string, unknown>;
  rows: Record<string, unknown>[];
  exportFormat?: 'csv' | 'pdf';
  exportToken?: string;
  exportExpiresAt?: string;
  createdAt?: string;
  completedAt?: string;
}

type EdgeResponseEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    message?: string;
    code?: string;
  };
};

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
          envelope.error?.message ?? envelope.error?.code ?? 'Falha no contrato de relatorios.',
        code: envelope.error?.code,
      },
    };
  }

  return { data: response as T, error: null };
}

function normalizeDefinition(item: unknown): ClinicReportDefinition | null {
  const record = asRecord(item);
  const key = asString(record.key);
  const label = asString(record.label);
  const description = asString(record.description);

  if (!key || !label || !description) return null;

  return {
    id: asString(record.id) || null,
    key,
    label,
    description,
    iconKey: asString(record.iconKey, 'FileText'),
    badge: asString(record.badge) || undefined,
    badgeColor: asString(record.badgeColor) || undefined,
    exportEnabled: asBoolean(record.exportEnabled, true),
    requiresFinancialRead: asBoolean(record.requiresFinancialRead),
    requiresSensitiveRead: asBoolean(record.requiresSensitiveRead),
    canRun: asBoolean(record.canRun, true),
    disabledReason: asString(record.disabledReason) || null,
  };
}

function normalizeRun(item: unknown): ClinicReportRun | null {
  const record = asRecord(item);
  const id = asString(record.id);
  const reportKey = asString(record.reportKey);

  if (!id || !reportKey) return null;

  const rows = Array.isArray(record.rows) ? record.rows.map(asRecord) : [];

  return {
    id,
    status: asString(record.status, 'completed') as ClinicReportRun['status'],
    reportKey,
    scope: asString(record.scope, 'clinic') as ClinicReportRun['scope'],
    patientId: asString(record.patientId) || null,
    resultSummary: asRecord(record.resultSummary),
    rows,
    exportFormat: asString(record.exportFormat, 'csv') as ClinicReportRun['exportFormat'],
    exportToken: asString(record.exportToken) || undefined,
    exportExpiresAt: asString(record.exportExpiresAt) || undefined,
    createdAt: asString(record.createdAt) || undefined,
    completedAt: asString(record.completedAt) || undefined,
  };
}

async function invokeClinicReports<T>(
  body: Record<string, unknown>
): Promise<{ data: T | null; error: SafeServiceError | null }> {
  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.functions.invoke('clinic-reports', { body });

    if (error) {
      return {
        data: null,
        error: {
          message: 'Falha ao acessar relatorios clinicos.',
          code: error.name,
          details: error.message,
        },
      };
    }

    return unwrapEdgeResponse<T>(data);
  } catch (error) {
    return {
      data: null,
      error: {
        message: 'Nao foi possivel acessar relatorios clinicos.',
        details: error instanceof Error ? error.message : undefined,
      },
    };
  }
}

export async function listClinicReportDefinitions(): Promise<{
  data: ClinicReportDefinition[];
  error: SafeServiceError | null;
}> {
  const { data, error } = await invokeClinicReports<unknown[]>({ action: 'list' });
  if (error) return { data: [], error };

  if (!Array.isArray(data)) {
    return {
      data: [],
      error: { message: 'Contrato invalido de definicoes de relatorio.', code: 'invalid_contract' },
    };
  }

  return {
    data: data
      .map(normalizeDefinition)
      .filter((item): item is ClinicReportDefinition => Boolean(item)),
    error: null,
  };
}

export async function createClinicReportRun(params: {
  reportKey: string;
  filters: ClinicReportFilters;
  exportFormat: 'csv' | 'pdf';
  patientId?: string;
}): Promise<{ data: ClinicReportRun | null; error: SafeServiceError | null }> {
  const { data, error } = await invokeClinicReports<unknown>({
    action: 'run',
    report_key: params.reportKey,
    filters: params.filters,
    export_format: params.exportFormat,
    patient_id: params.patientId,
  });
  if (error) return { data: null, error };

  const run = normalizeRun(data);
  if (!run) {
    return {
      data: null,
      error: { message: 'Contrato invalido de execucao de relatorio.', code: 'invalid_contract' },
    };
  }

  return { data: run, error: null };
}

export async function getClinicReportRun(runId: string): Promise<{
  data: ClinicReportRun | null;
  error: SafeServiceError | null;
}> {
  const { data, error } = await invokeClinicReports<unknown>({ action: 'get', run_id: runId });
  if (error) return { data: null, error };

  const run = normalizeRun(data);
  if (!run) {
    return {
      data: null,
      error: { message: 'Contrato invalido de status de relatorio.', code: 'invalid_contract' },
    };
  }

  return { data: run, error: null };
}

export function getClinicReportExportUrl(run: ClinicReportRun): string | null {
  if (!run.exportToken) return null;

  const params = new URLSearchParams({ run_id: run.id, token: run.exportToken });
  return `/functions/v1/clinic-report-export?${params.toString()}`;
}

export async function downloadClinicReportExport(run: ClinicReportRun): Promise<{
  data: { blob: Blob; filename: string } | null;
  error: SafeServiceError | null;
}> {
  if (!run.exportToken) {
    return { data: null, error: { message: 'Token de exportacao indisponivel.' } };
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return { data: null, error: { message: 'Supabase URL publica nao configurada.' } };
    }

    const supabase = await createBrowserSupabaseClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return { data: null, error: { message: 'Sessao invalida para baixar exportacao.' } };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/clinic-report-export`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ run_id: run.id, token: run.exportToken }),
    });

    if (!response.ok) {
      return {
        data: null,
        error: { message: 'Exportacao expirada ou indisponivel.', code: String(response.status) },
      };
    }

    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filenameMatch = /filename="?([^";]+)"?/i.exec(disposition);
    const filename =
      filenameMatch?.[1] ?? `relatorio-${run.reportKey}.${run.exportFormat ?? 'csv'}`;
    return { data: { blob: await response.blob(), filename }, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: 'Nao foi possivel baixar a exportacao segura.',
        details: error instanceof Error ? error.message : undefined,
      },
    };
  }
}
