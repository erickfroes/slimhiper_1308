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
  requiresCrmRead?: boolean;
  requiresInventoryRead?: boolean;
  requiresInventoryCostRead?: boolean;
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

export type ClinicReportRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface ClinicReportRun {
  id: string;
  status: ClinicReportRunStatus;
  reportKey: string;
  scope: 'clinic' | 'patient';
  patientId?: string | null;
  resultSummary: Record<string, unknown>;
  rows: Record<string, unknown>[];
  exportFormat?: 'csv' | 'pdf';
  exportExpiresAt?: string;
  artifact?: ClinicReportArtifact | null;
  artifactId?: string;
  artifactStatus?: ClinicReportArtifactStatus | ClinicReportRunStatus;
  artifactExpiresAt?: string;
  createdAt?: string;
  completedAt?: string;
}

export type ClinicReportArtifactStatus =
  | 'pending'
  | 'running'
  | 'ready'
  | 'failed'
  | 'expired'
  | 'deleted';

export interface ClinicReportArtifact {
  id: string;
  reportRunId: string;
  reportKey: string;
  format: 'csv' | 'pdf';
  status: ClinicReportArtifactStatus;
  filename: string;
  mimeType?: string;
  sizeBytes?: number | null;
  rowCount?: number;
  downloadCount?: number;
  expiresAt?: string;
  retainedUntil?: string;
  createdAt?: string;
  generatedAt?: string;
  lastDownloadedAt?: string;
}

export interface ClinicReportHistoryFilters {
  reportKey?: string;
  status?: ClinicReportArtifactStatus | ClinicReportRunStatus | '';
  from?: string;
  to?: string;
  limit?: number;
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

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

function normalizeArtifact(item: unknown): ClinicReportArtifact | null {
  const record = asRecord(item);
  const id = asString(record.id);
  const reportRunId = asString(record.reportRunId);
  const reportKey = asString(record.reportKey);
  const format = asString(record.format, 'csv');
  const status = asString(record.status, 'pending');

  if (!id || !reportRunId || !reportKey) return null;

  return {
    id,
    reportRunId,
    reportKey,
    format: format === 'pdf' ? 'pdf' : 'csv',
    status: status as ClinicReportArtifactStatus,
    filename: asString(record.filename, `relatorio-${reportKey}.${format}`),
    mimeType: asString(record.mimeType) || undefined,
    sizeBytes: asNumber(record.sizeBytes) ?? null,
    rowCount: asNumber(record.rowCount),
    downloadCount: asNumber(record.downloadCount),
    expiresAt: asString(record.expiresAt) || undefined,
    retainedUntil: asString(record.retainedUntil) || undefined,
    createdAt: asString(record.createdAt) || undefined,
    generatedAt: asString(record.generatedAt) || undefined,
    lastDownloadedAt: asString(record.lastDownloadedAt) || undefined,
  };
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
    requiresCrmRead: asBoolean(record.requiresCrmRead),
    requiresInventoryRead: asBoolean(record.requiresInventoryRead),
    requiresInventoryCostRead: asBoolean(record.requiresInventoryCostRead),
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
  const artifact = normalizeArtifact(record.artifact);
  const artifactId = asString(record.artifactId) || artifact?.id;
  const artifactStatus = asString(record.artifactStatus) || artifact?.status;
  const artifactExpiresAt = asString(record.artifactExpiresAt) || artifact?.expiresAt;

  return {
    id,
    status: asString(record.status, 'completed') as ClinicReportRun['status'],
    reportKey,
    scope: asString(record.scope, 'clinic') as ClinicReportRun['scope'],
    patientId: asString(record.patientId) || null,
    resultSummary: asRecord(record.resultSummary),
    rows,
    exportFormat: asString(record.exportFormat, 'csv') as ClinicReportRun['exportFormat'],
    exportExpiresAt: asString(record.exportExpiresAt) || undefined,
    artifact,
    artifactId,
    artifactStatus: artifactStatus as ClinicReportRun['artifactStatus'],
    artifactExpiresAt,
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

export async function listClinicReportRuns(
  filters: ClinicReportHistoryFilters = {}
): Promise<{ data: ClinicReportRun[]; error: SafeServiceError | null }> {
  const { data, error } = await invokeClinicReports<unknown[]>({
    action: 'history',
    report_key: filters.reportKey || undefined,
    status: filters.status || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    limit: filters.limit ?? 20,
  });
  if (error) return { data: [], error };

  if (!Array.isArray(data)) {
    return {
      data: [],
      error: { message: 'Contrato invalido de historico de relatorios.', code: 'invalid_contract' },
    };
  }

  return {
    data: data.map(normalizeRun).filter((item): item is ClinicReportRun => Boolean(item)),
    error: null,
  };
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

export async function downloadClinicReportExport(run: ClinicReportRun): Promise<{
  data: { blob: Blob; filename: string } | null;
  error: SafeServiceError | null;
}> {
  if (!run.artifactId && !run.artifact?.id) {
    return { data: null, error: { message: 'Artefato de exportacao indisponivel.' } };
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
      body: JSON.stringify({
        artifact_id: run.artifactId ?? run.artifact?.id,
        run_id: run.id,
      }),
    });

    if (!response.ok) {
      return {
        data: null,
        error: { message: 'Exportacao expirada ou indisponivel.', code: String(response.status) },
      };
    }

    const payload = unwrapEdgeResponse<unknown>(await response.json().catch(() => null));
    if (payload.error) return { data: null, error: payload.error };

    const signed = asRecord(payload.data);
    const signedUrl = asString(signed.url);
    const filename = asString(
      signed.filename,
      `relatorio-${run.reportKey}.${run.exportFormat ?? 'csv'}`
    );

    if (!signedUrl) {
      return {
        data: null,
        error: { message: 'Contrato invalido de URL assinada.', code: 'invalid_contract' },
      };
    }

    const signedResponse = await fetch(signedUrl, { method: 'GET' });
    if (!signedResponse.ok) {
      return {
        data: null,
        error: {
          message: 'URL assinada expirada ou indisponivel.',
          code: String(signedResponse.status),
        },
      };
    }

    return { data: { blob: await signedResponse.blob(), filename }, error: null };
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
