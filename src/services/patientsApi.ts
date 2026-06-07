import type {
  AdherenceLevel,
  FinancialStatus,
  PatientListRow,
  PatientPriorityBand,
  PatientStatus,
  PatientWalletAccess,
  PatientWalletRow,
  PatientWalletSnapshot,
  ProgramType,
} from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getPatientList as getMockPatientList } from '@/services/mockApi';

type SafeServiceError = {
  message: string;
  code?: string;
};

type PatientRow = {
  id: string;
  tenant_id: string;
  status: string | null;
  preferred_name: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

type PatientPiiRow = {
  patient_id: string;
  full_name: string | null;
  email?: string | null;
  phone: string | null;
  cpf_masked?: string | null;
  birth_date: string | null;
  sex_gender?: string | null;
};

type PatientAlertRow = {
  patient_id: string;
};

type AppointmentRow = {
  patient_id: string;
  scheduled_at: string;
  status: string | null;
};

type ProgramEnrollmentRow = {
  patient_id: string;
  program_id: string | null;
  status: string | null;
  current_week: number | null;
  metadata: Record<string, unknown> | null;
};

type ProgramRow = {
  id: string;
  name: string | null;
  program_type: string | null;
  duration_weeks: number | null;
};

type InvoiceRow = {
  patient_id: string;
  status: string | null;
};

export type PatientListFilters = {
  search?: string;
  status?: PatientStatus | '';
  unitId?: string;
};

export type PatientListPageParams = PatientListFilters & {
  page?: number;
  pageSize?: number;
};

export type PatientListPage = {
  rows: PatientListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type PatientWalletSnapshotParams = PatientListFilters & {
  page?: number;
  pageSize?: number;
};

export type PatientMutationInput = {
  fullName: string;
  preferredName?: string | null;
  email?: string | null;
  phone?: string | null;
  cpfMasked?: string | null;
  birthDate?: string | null;
  sexGender?: string | null;
  status?: PatientStatus;
  tags?: string[];
  unitId?: string | null;
};

export type PatientFormSnapshot = {
  id: string;
  fullName: string;
  preferredName: string;
  email: string;
  phone: string;
  cpfMasked: string;
  birthDate: string;
  sexGender: string;
  status: PatientStatus;
  tags: string[];
  unitId: string;
};

const DEFAULT_PROGRAM_TYPE: ProgramType = 'emagrecimento';
const DEFAULT_FINANCIAL_STATUS: FinancialStatus = 'em_dia';
const DEFAULT_ADHERENCE_LEVEL: AdherenceLevel = 'critico';
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_WALLET_ACCESS: PatientWalletAccess = {
  clinical: { canRead: true, error: null },
  financial: { canRead: true, error: null },
  documents: { canRead: true, error: null },
  chat: { canRead: true, error: null },
};

const PRIORITY_BAND_LABEL: Record<PatientPriorityBand, string> = {
  critico: 'critica',
  alto: 'alta',
  medio: 'media',
  baixo: 'baixa',
};

function isMockExplicitlyEnabled() {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function asServiceError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) return { message: error.message || fallback };
  if (error && typeof error === 'object' && 'message' in error) {
    return {
      message: String((error as { message?: unknown }).message ?? fallback),
      code:
        'code' in error && typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : undefined,
    };
  }
  return { message: fallback };
}

function maskPhone(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 4) return 'Nao informado';
  const suffix = digits.slice(-4);
  return `(**) *****-${suffix}`;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function sanitizePatientSearchQuery(value: string | null | undefined) {
  return Array.from(value ?? '')
    .map((char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : char;
    })
    .join('')
    .normalize('NFKC')
    .replace(/[,%_*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 20);
}

function calculateAge(birthDate: string | null | undefined) {
  if (!birthDate) return 0;
  const date = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDelta = today.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) age -= 1;
  return Math.max(0, age);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function clampPercent(value: unknown, fallback = 0) {
  const numeric = asNumber(value) ?? fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function adherenceLevel(value: number): AdherenceLevel {
  if (value >= 85) return 'excelente';
  if (value >= 70) return 'bom';
  if (value >= 55) return 'regular';
  return 'critico';
}

function mapPatientStatus(status: string | null | undefined): PatientStatus {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'inactive' || normalized === 'inativo') return 'inativo';
  if (normalized === 'paused' || normalized === 'pausado') return 'pausado';
  if (normalized === 'completed' || normalized === 'concluido') return 'concluido';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'cancelado') {
    return 'cancelado';
  }
  return 'ativo';
}

function toDbPatientStatus(status: PatientStatus | undefined) {
  if (status === 'inativo') return 'inactive';
  if (status === 'pausado') return 'paused';
  if (status === 'concluido') return 'completed';
  if (status === 'cancelado') return 'cancelled';
  return 'active';
}

function mapProgramType(value: string | null | undefined): ProgramType {
  if (
    value === 'hipertrofia' ||
    value === 'recomposicao' ||
    value === 'saude_metabolica' ||
    value === 'longevidade'
  ) {
    return value;
  }
  return DEFAULT_PROGRAM_TYPE;
}

function mapFinancialStatus(rows: InvoiceRow[]): FinancialStatus {
  if (
    rows.some((row) =>
      ['overdue', 'OVERDUE', 'vencido', 'inadimplente'].includes(String(row.status ?? ''))
    )
  ) {
    return 'inadimplente';
  }

  if (
    rows.some((row) =>
      ['pending', 'PENDING', 'aguardando', 'pendente'].includes(String(row.status ?? ''))
    )
  ) {
    return 'pendente';
  }

  return DEFAULT_FINANCIAL_STATUS;
}

function mapPriorityBand(value: unknown): PatientPriorityBand {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'critical' || normalized === 'critico' || normalized === 'critica') {
    return 'critico';
  }
  if (normalized === 'high' || normalized === 'alto' || normalized === 'alta') return 'alto';
  if (normalized === 'medium' || normalized === 'medio' || normalized === 'media') return 'medio';
  return 'baixo';
}

function bandFromScore(score: number): PatientPriorityBand {
  if (score >= 75) return 'critico';
  if (score >= 50) return 'alto';
  if (score >= 25) return 'medio';
  return 'baixo';
}

function normalizeWalletAccess(value: unknown): PatientWalletAccess {
  const record = asRecord(value);
  return {
    clinical: normalizeSectionAccess(record.clinical, DEFAULT_WALLET_ACCESS.clinical),
    financial: normalizeSectionAccess(record.financial, DEFAULT_WALLET_ACCESS.financial),
    documents: normalizeSectionAccess(record.documents, DEFAULT_WALLET_ACCESS.documents),
    chat: normalizeSectionAccess(record.chat, DEFAULT_WALLET_ACCESS.chat),
  };
}

function normalizeSectionAccess(
  value: unknown,
  fallback: PatientWalletAccess[keyof PatientWalletAccess]
) {
  const record = asRecord(value);
  return {
    canRead: asBoolean(record.canRead, fallback.canRead),
    error: typeof record.error === 'string' ? record.error : null,
  };
}

function formatAppointment(value: unknown) {
  const raw = asString(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function normalizeWalletRow(value: unknown, access: PatientWalletAccess): PatientWalletRow | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const name = asString(record.name, 'Paciente sem nome');
  if (!id) return null;

  const weeklyAdherence = clampPercent(record.weeklyAdherence);
  const priorityScore = clampPercent(record.priorityScore);
  const priorityBand = mapPriorityBand(record.priorityBand ?? bandFromScore(priorityScore));
  const financialStatus = mapFinancialStatus([
    { patient_id: id, status: asString(record.financialStatus) },
  ]);
  const nextAction = asRecord(record.nextAction);
  const nextAppointmentAt = asString(record.nextAppointmentAt);

  return {
    id,
    name,
    age: Math.max(0, Math.round(asNumber(record.age) ?? 0)),
    phone: asString(record.phone, 'Nao informado'),
    activePackage: asString(record.activePackage, 'Sem programa'),
    programType: mapProgramType(asString(record.programType)),
    currentWeek: Math.max(0, Math.round(asNumber(record.currentWeek) ?? 0)),
    totalWeeks: Math.max(0, Math.round(asNumber(record.totalWeeks) ?? 0)),
    weeklyAdherence,
    adherenceLevel: adherenceLevel(weeklyAdherence),
    nextAppointment:
      formatAppointment(nextAppointmentAt) ?? (asString(record.nextAppointment) || undefined),
    careTeam: asStringArray(record.careTeam),
    alertCount: Math.max(0, Math.round(asNumber(record.alertCount) ?? 0)),
    financialStatus,
    status: mapPatientStatus(asString(record.status)),
    avatarUrl: asString(record.avatarUrl) || undefined,
    priorityScore,
    priorityBand,
    triageStatus:
      priorityBand === 'critico'
        ? 'acao_imediata'
        : priorityBand === 'alto' || priorityBand === 'medio'
          ? 'monitorar'
          : 'rotina',
    scoreExplanation:
      asString(record.scoreExplanation) ||
      `Prioridade ${PRIORITY_BAND_LABEL[priorityBand]} por score ${priorityScore}/100.`,
    scoreReasons: asStringArray(record.scoreReasons),
    nextAction: {
      label: asString(nextAction.label, 'Abrir Paciente 360'),
      href: asString(nextAction.href, `/clinic/patients/${id}`),
      kind: ['clinical', 'financial', 'documents', 'chat', 'agenda', 'patient'].includes(
        asString(nextAction.kind)
      )
        ? (asString(nextAction.kind) as PatientWalletRow['nextAction']['kind'])
        : 'patient',
    },
    nextAppointmentAt: nextAppointmentAt || undefined,
    activeProgramId: asString(record.activeProgramId) || undefined,
    activeProgramName: asString(
      record.activeProgramName,
      asString(record.activePackage, 'Sem programa')
    ),
    pendingDocumentCount: access.documents.canRead
      ? Math.max(0, Math.round(asNumber(record.pendingDocumentCount) ?? 0))
      : 0,
    unreadChatCount: access.chat.canRead
      ? Math.max(0, Math.round(asNumber(record.unreadChatCount) ?? 0))
      : 0,
    lastMessageAt: access.chat.canRead ? asString(record.lastMessageAt) || undefined : undefined,
    financialPendingCount: access.financial.canRead
      ? Math.max(0, Math.round(asNumber(record.financialPendingCount) ?? 0))
      : 0,
    financialOverdueCount: access.financial.canRead
      ? Math.max(0, Math.round(asNumber(record.financialOverdueCount) ?? 0))
      : 0,
    clinicalAlertSeverity: ['critical', 'high', 'medium', 'low'].includes(
      asString(record.clinicalAlertSeverity)
    )
      ? (asString(record.clinicalAlertSeverity) as PatientWalletRow['clinicalAlertSeverity'])
      : undefined,
  };
}

function summarizeWalletRows(
  rows: PatientWalletRow[],
  total = rows.length
): PatientWalletSnapshot['summary'] {
  return {
    total,
    loaded: rows.length,
    active: rows.filter((row) => row.status === 'ativo').length,
    highPriority: rows.filter(
      (row) => row.priorityBand === 'alto' || row.priorityBand === 'critico'
    ).length,
    criticalPriority: rows.filter((row) => row.priorityBand === 'critico').length,
    lowAdherence: rows.filter((row) => row.weeklyAdherence < 60).length,
    pendingFinancial: rows.filter(
      (row) => row.financialStatus === 'inadimplente' || row.financialStatus === 'pendente'
    ).length,
    pendingDocuments: rows.reduce((acc, row) => acc + row.pendingDocumentCount, 0),
    unreadChats: rows.reduce((acc, row) => acc + row.unreadChatCount, 0),
  };
}

function normalizeWalletSnapshot(
  value: unknown,
  page: number,
  pageSize: number
): PatientWalletSnapshot | null {
  const record = asRecord(value);
  const access = normalizeWalletAccess(record.access);
  const rows = Array.isArray(record.rows)
    ? record.rows
        .map((row) => normalizeWalletRow(row, access))
        .filter((row): row is PatientWalletRow => Boolean(row))
    : [];
  const total = Math.max(0, Math.round(asNumber(record.total) ?? rows.length));
  const summaryRecord = asRecord(record.summary);
  const summary: PatientWalletSnapshot['summary'] = {
    ...summarizeWalletRows(rows, total),
    total: Math.max(0, Math.round(asNumber(summaryRecord.total) ?? total)),
    loaded: Math.max(0, Math.round(asNumber(summaryRecord.loaded) ?? rows.length)),
    active: Math.max(
      0,
      Math.round(
        asNumber(summaryRecord.active) ?? rows.filter((row) => row.status === 'ativo').length
      )
    ),
    highPriority: Math.max(
      0,
      Math.round(
        asNumber(summaryRecord.highPriority) ??
          rows.filter((row) => row.priorityBand === 'alto' || row.priorityBand === 'critico').length
      )
    ),
    criticalPriority: Math.max(
      0,
      Math.round(
        asNumber(summaryRecord.criticalPriority) ??
          rows.filter((row) => row.priorityBand === 'critico').length
      )
    ),
    lowAdherence: Math.max(
      0,
      Math.round(
        asNumber(summaryRecord.lowAdherence) ??
          rows.filter((row) => row.weeklyAdherence < 60).length
      )
    ),
    pendingFinancial: Math.max(
      0,
      Math.round(
        asNumber(summaryRecord.pendingFinancial) ??
          rows.filter(
            (row) => row.financialStatus === 'inadimplente' || row.financialStatus === 'pendente'
          ).length
      )
    ),
    pendingDocuments: Math.max(
      0,
      Math.round(
        asNumber(summaryRecord.pendingDocuments) ??
          rows.reduce((acc, row) => acc + row.pendingDocumentCount, 0)
      )
    ),
    unreadChats: Math.max(
      0,
      Math.round(
        asNumber(summaryRecord.unreadChats) ??
          rows.reduce((acc, row) => acc + row.unreadChatCount, 0)
      )
    ),
  };

  return {
    rows,
    total,
    page,
    pageSize,
    generatedAt: asString(record.generatedAt, new Date().toISOString()),
    summary,
    access,
  };
}

function mockWalletRow(row: PatientListRow): PatientWalletRow {
  const score =
    (row.alertCount > 0 ? Math.min(35, row.alertCount * 12) : 0) +
    (row.weeklyAdherence < 55 ? 30 : row.weeklyAdherence < 70 ? 18 : 0) +
    (row.financialStatus === 'inadimplente' ? 22 : row.financialStatus === 'pendente' ? 12 : 0);
  const priorityScore = Math.min(100, score);
  const priorityBand = bandFromScore(priorityScore);
  const reasons = [
    row.alertCount > 0 ? `${row.alertCount} alerta(s) ativo(s)` : null,
    row.weeklyAdherence < 70 ? `Adesao em ${row.weeklyAdherence}%` : null,
    row.financialStatus !== 'em_dia' ? `Financeiro ${row.financialStatus}` : null,
  ].filter((item): item is string => Boolean(item));
  const nextAction =
    row.alertCount > 0 || row.weeklyAdherence < 70
      ? {
          label: 'Revisar plano e acionar paciente',
          href: `/clinic/patients/${row.id}?tab=timeline`,
          kind: 'clinical' as const,
        }
      : row.financialStatus !== 'em_dia'
        ? {
            label: 'Acionar financeiro',
            href: `/clinic/financeiro?patientId=${row.id}`,
            kind: 'financial' as const,
          }
        : {
            label: 'Abrir Paciente 360',
            href: `/clinic/patients/${row.id}`,
            kind: 'patient' as const,
          };

  return {
    ...row,
    priorityScore,
    priorityBand,
    triageStatus:
      priorityBand === 'critico'
        ? 'acao_imediata'
        : priorityBand === 'baixo'
          ? 'rotina'
          : 'monitorar',
    scoreExplanation:
      reasons.length > 0
        ? `Prioridade ${PRIORITY_BAND_LABEL[priorityBand]} por ${reasons.join(', ')}.`
        : 'Prioridade baixa: sem pendencias criticas na carga atual.',
    scoreReasons: reasons,
    nextAction,
    activeProgramName: row.activePackage,
    pendingDocumentCount: row.alertCount > 1 ? 1 : 0,
    unreadChatCount: row.alertCount > 2 ? 2 : row.alertCount > 0 ? 1 : 0,
    financialPendingCount: row.financialStatus === 'pendente' ? 1 : 0,
    financialOverdueCount: row.financialStatus === 'inadimplente' ? 1 : 0,
    clinicalAlertSeverity:
      row.alertCount > 2 ? 'critical' : row.alertCount > 0 ? 'medium' : undefined,
  };
}

function validatePatientInput(input: PatientMutationInput) {
  const fullName = input.fullName.trim();
  if (fullName.length < 3) {
    throw new Error('Informe o nome completo do paciente.');
  }

  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    throw new Error('Informe um email valido ou deixe o campo em branco.');
  }

  if (input.birthDate) {
    const birthDate = new Date(`${input.birthDate}T00:00:00`);
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
      throw new Error('Informe uma data de nascimento valida.');
    }
  }
}

async function resolveActiveTenantId() {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('unauthenticated');

  const [{ data: profile }, { data: memberships, error: membershipsError }] = await Promise.all([
    supabase.from('profiles').select('active_tenant_id').eq('id', user.id).maybeSingle(),
    supabase
      .from('tenant_memberships')
      .select('tenant_id,status')
      .eq('user_id', user.id)
      .eq('status', 'active'),
  ]);

  if (membershipsError) throw membershipsError;

  const activeMemberships = memberships ?? [];
  const preferredTenantId =
    typeof profile?.active_tenant_id === 'string' ? profile.active_tenant_id : null;
  const preferredMembership = preferredTenantId
    ? activeMemberships.find((membership) => membership.tenant_id === preferredTenantId)
    : null;
  const tenantId = preferredMembership?.tenant_id ?? activeMemberships[0]?.tenant_id ?? null;

  if (!tenantId) throw new Error('no_active_tenant');
  return tenantId;
}

async function getSearchMatchedPatientIds(tenantId: string, search: string) {
  const query = sanitizePatientSearchQuery(search);
  if (!query) return null;

  const digits = normalizeDigits(query);
  const terms = Array.from(new Set([query, digits].filter((term) => term.length >= 2)));
  if (terms.length === 0) return null;

  const supabase = createBrowserSupabaseClient();
  const columns = ['full_name', 'cpf_masked', 'phone', 'email'] as const;
  const results = await Promise.all(
    terms.flatMap((term) =>
      columns.map((column) =>
        supabase
          .from('patient_pii')
          .select('patient_id')
          .eq('tenant_id', tenantId)
          .ilike(column, `%${term}%`)
          .limit(250)
      )
    )
  );

  const patientIds = new Set<string>();
  for (const result of results) {
    if (result.error) throw result.error;
    for (const row of result.data ?? []) {
      patientIds.add(row.patient_id as string);
    }
  }

  return Array.from(patientIds).slice(0, 250);
}

async function getPatientRows(
  tenantId: string,
  params: Required<Pick<PatientListPageParams, 'page' | 'pageSize'>> & PatientListFilters
) {
  const searchMatches = await getSearchMatchedPatientIds(tenantId, params.search ?? '');
  if (searchMatches && searchMatches.length === 0) return { rows: [], total: 0 };

  let query = createBrowserSupabaseClient()
    .from('patients')
    .select('id,tenant_id,status,preferred_name,tags,metadata', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (params.status) {
    query = query.eq('status', toDbPatientStatus(params.status));
  }

  if (params.unitId) {
    query = query.contains('metadata', { main_unit_id: params.unitId });
  }

  if (searchMatches) {
    query = query.in('id', searchMatches);
  }

  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) throw error;
  return { rows: (data ?? []) as PatientRow[], total: count ?? 0 };
}

async function getPatientListFromSupabase(
  params: Required<Pick<PatientListPageParams, 'page' | 'pageSize'>> & PatientListFilters
): Promise<PatientListPage> {
  const supabase = createBrowserSupabaseClient();
  const tenantId = await resolveActiveTenantId();
  const { rows: patients, total } = await getPatientRows(tenantId, params);
  const patientIds = patients.map((patient) => patient.id);

  if (patientIds.length === 0) {
    return { rows: [], total, page: params.page, pageSize: params.pageSize };
  }

  const [piiResult, alertsResult, appointmentsResult, enrollmentsResult, invoicesResult] =
    await Promise.all([
      supabase
        .from('patient_pii')
        .select('patient_id,full_name,email,phone,cpf_masked,birth_date,sex_gender')
        .eq('tenant_id', tenantId)
        .in('patient_id', patientIds),
      supabase
        .from('patient_alerts')
        .select('patient_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .in('patient_id', patientIds),
      supabase
        .from('appointments')
        .select('patient_id,scheduled_at,status')
        .eq('tenant_id', tenantId)
        .gte('scheduled_at', new Date().toISOString())
        .in('patient_id', patientIds)
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('patient_program_enrollments')
        .select('patient_id,program_id,status,current_week,metadata')
        .eq('tenant_id', tenantId)
        .eq('status', 'ativo')
        .in('patient_id', patientIds)
        .order('updated_at', { ascending: false }),
      supabase
        .from('patient_invoices')
        .select('patient_id,status')
        .eq('tenant_id', tenantId)
        .in('patient_id', patientIds),
    ]);

  for (const result of [
    piiResult,
    alertsResult,
    appointmentsResult,
    enrollmentsResult,
    invoicesResult,
  ]) {
    if (result.error) throw result.error;
  }

  const enrollments = (enrollmentsResult.data ?? []) as ProgramEnrollmentRow[];
  const programIds = Array.from(
    new Set(enrollments.map((row) => row.program_id).filter((id): id is string => !!id))
  );
  const programsResult =
    programIds.length > 0
      ? await supabase
          .from('programs')
          .select('id,name,program_type,duration_weeks')
          .eq('tenant_id', tenantId)
          .in('id', programIds)
      : { data: [], error: null };

  if (programsResult.error) throw programsResult.error;

  const piiByPatientId = new Map(
    ((piiResult.data ?? []) as PatientPiiRow[]).map((row) => [row.patient_id, row])
  );
  const alertCountByPatientId = ((alertsResult.data ?? []) as PatientAlertRow[]).reduce(
    (acc, row) => acc.set(row.patient_id, (acc.get(row.patient_id) ?? 0) + 1),
    new Map<string, number>()
  );
  const nextAppointmentByPatientId = new Map<string, string>();
  for (const appointment of (appointmentsResult.data ?? []) as AppointmentRow[]) {
    const appointmentStatus = String(appointment.status ?? '');
    if (['cancelled', 'canceled', 'cancelado', 'falta'].includes(appointmentStatus)) continue;
    if (!nextAppointmentByPatientId.has(appointment.patient_id)) {
      nextAppointmentByPatientId.set(
        appointment.patient_id,
        new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(appointment.scheduled_at))
      );
    }
  }

  const firstEnrollmentByPatientId = new Map<string, ProgramEnrollmentRow>();
  for (const enrollment of enrollments) {
    if (!firstEnrollmentByPatientId.has(enrollment.patient_id)) {
      firstEnrollmentByPatientId.set(enrollment.patient_id, enrollment);
    }
  }
  const programsById = new Map(
    ((programsResult.data ?? []) as ProgramRow[]).map((program) => [program.id, program])
  );
  const invoicesByPatientId = ((invoicesResult.data ?? []) as InvoiceRow[]).reduce((acc, row) => {
    const rows = acc.get(row.patient_id) ?? [];
    rows.push(row);
    acc.set(row.patient_id, rows);
    return acc;
  }, new Map<string, InvoiceRow[]>());

  const rows = patients.map((patient) => {
    const pii = piiByPatientId.get(patient.id);
    const enrollment = firstEnrollmentByPatientId.get(patient.id);
    const program = enrollment?.program_id ? programsById.get(enrollment.program_id) : undefined;
    const weeklyAdherence =
      asNumber(enrollment?.metadata?.weekly_adherence_percent) ??
      asNumber(enrollment?.metadata?.weeklyAdherencePercent) ??
      0;

    return {
      id: patient.id,
      name: pii?.full_name ?? patient.preferred_name ?? 'Paciente sem nome',
      age: calculateAge(pii?.birth_date),
      phone: maskPhone(pii?.phone),
      activePackage: program?.name ?? 'Sem programa',
      programType: mapProgramType(program?.program_type),
      currentWeek: enrollment?.current_week ?? 0,
      totalWeeks: program?.duration_weeks ?? 0,
      weeklyAdherence,
      adherenceLevel:
        weeklyAdherence > 0 ? adherenceLevel(weeklyAdherence) : DEFAULT_ADHERENCE_LEVEL,
      nextAppointment: nextAppointmentByPatientId.get(patient.id),
      careTeam: [],
      alertCount: alertCountByPatientId.get(patient.id) ?? 0,
      financialStatus: mapFinancialStatus(invoicesByPatientId.get(patient.id) ?? []),
      status: mapPatientStatus(patient.status),
      avatarUrl: undefined,
    };
  });

  return { rows, total, page: params.page, pageSize: params.pageSize };
}

export async function getPatientListPage(
  params: PatientListPageParams = {}
): Promise<{ data: PatientListPage | null; error: SafeServiceError | null }> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));

  if (isMockExplicitlyEnabled()) {
    const search = sanitizePatientSearchQuery(params.search).toLocaleLowerCase('pt-BR');
    const rows = (await getMockPatientList()).filter((row) => {
      const matchesStatus = params.status ? row.status === params.status : true;
      const matchesSearch = search
        ? [row.name, row.phone, row.activePackage].some((value) =>
            value.toLocaleLowerCase('pt-BR').includes(search)
          )
        : true;
      return matchesStatus && matchesSearch;
    });
    const from = (page - 1) * pageSize;
    return {
      data: {
        rows: rows.slice(from, from + pageSize),
        total: rows.length,
        page,
        pageSize,
      },
      error: null,
    };
  }

  try {
    const data = await getPatientListFromSupabase({ ...params, page, pageSize });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao carregar lista de pacientes.') };
  }
}

export async function getPatientWalletSnapshot(
  params: PatientWalletSnapshotParams = {}
): Promise<{ data: PatientWalletSnapshot | null; error: SafeServiceError | null }> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));

  if (isMockExplicitlyEnabled()) {
    const search = sanitizePatientSearchQuery(params.search).toLocaleLowerCase('pt-BR');
    const allRows = (await getMockPatientList()).map(mockWalletRow);
    const rows = allRows.filter((row) => {
      const matchesStatus = params.status ? row.status === params.status : true;
      const matchesSearch = search
        ? [row.name, row.phone, row.activePackage].some((value) =>
            value.toLocaleLowerCase('pt-BR').includes(search)
          )
        : true;
      return matchesStatus && matchesSearch;
    });
    const from = (page - 1) * pageSize;
    const pagedRows = rows.slice(from, from + pageSize);
    return {
      data: {
        rows: pagedRows,
        total: rows.length,
        page,
        pageSize,
        generatedAt: new Date().toISOString(),
        summary: summarizeWalletRows(pagedRows, rows.length),
        access: DEFAULT_WALLET_ACCESS,
      },
      error: null,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_wallet_snapshot', {
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
      p_search: sanitizePatientSearchQuery(params.search),
      p_status: params.status || null,
    });

    if (error) throw error;

    const snapshot = normalizeWalletSnapshot(data, page, pageSize);
    if (!snapshot) {
      return {
        data: null,
        error: { message: 'Contrato invalido da carteira de pacientes.', code: 'invalid_contract' },
      };
    }

    return { data: snapshot, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao carregar carteira de pacientes.') };
  }
}

export async function auditPatientWalletContextOpen(
  patientId: string,
  sections: Array<keyof PatientWalletAccess>
): Promise<{ data: { status: string } | null; error: SafeServiceError | null }> {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para auditoria.' } };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('audit_patient_wallet_context_opened', {
      p_patient_id: patientId,
      p_sections: sections,
    });
    if (error) throw error;
    const record = asRecord(data);
    return { data: { status: asString(record.status, 'logged') }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao auditar contexto do paciente.') };
  }
}

export async function getPatientList(): Promise<PatientListRow[]> {
  if (isMockExplicitlyEnabled()) return getMockPatientList();

  const result = await getPatientListPage({ page: 1, pageSize: 100 });
  if (result.error || !result.data) {
    throw result.error ?? { message: 'Falha ao carregar lista de pacientes.' };
  }
  return result.data.rows;
}

export async function getPatientFormSnapshot(
  patientId: string
): Promise<{ data: PatientFormSnapshot | null; error: SafeServiceError | null }> {
  try {
    const supabase = createBrowserSupabaseClient();
    const tenantId = await resolveActiveTenantId();
    const [patientResult, piiResult] = await Promise.all([
      supabase
        .from('patients')
        .select('id,status,preferred_name,tags,metadata')
        .eq('tenant_id', tenantId)
        .eq('id', patientId)
        .single(),
      supabase
        .from('patient_pii')
        .select('patient_id,full_name,email,phone,cpf_masked,birth_date,sex_gender')
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .single(),
    ]);

    if (patientResult.error) throw patientResult.error;
    if (piiResult.error) throw piiResult.error;

    const patient = patientResult.data as PatientRow;
    const pii = piiResult.data as PatientPiiRow;
    const metadata = patient.metadata ?? {};

    return {
      data: {
        id: patient.id,
        fullName: pii.full_name ?? '',
        preferredName: patient.preferred_name ?? '',
        email: pii.email ?? '',
        phone: pii.phone ?? '',
        cpfMasked: pii.cpf_masked ?? '',
        birthDate: pii.birth_date ?? '',
        sexGender: pii.sex_gender ?? '',
        status: mapPatientStatus(patient.status),
        tags: patient.tags ?? [],
        unitId: typeof metadata.main_unit_id === 'string' ? metadata.main_unit_id : '',
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao carregar dados do paciente.') };
  }
}

export async function createPatient(
  input: PatientMutationInput
): Promise<{ data: { id: string } | null; error: SafeServiceError | null }> {
  try {
    validatePatientInput(input);

    const supabase = createBrowserSupabaseClient();
    const tenantId = await resolveActiveTenantId();
    const fullName = input.fullName.trim();
    const metadata = input.unitId ? { main_unit_id: input.unitId } : {};

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .insert({
        tenant_id: tenantId,
        status: toDbPatientStatus(input.status),
        preferred_name: normalizeOptionalText(input.preferredName),
        tags: input.tags ?? [],
        metadata,
      })
      .select('id')
      .single();

    if (patientError) throw patientError;

    const { error: piiError } = await supabase.from('patient_pii').insert({
      tenant_id: tenantId,
      patient_id: patient.id,
      full_name: fullName,
      email: normalizeOptionalText(input.email),
      phone: normalizeOptionalText(input.phone),
      cpf_masked: normalizeOptionalText(input.cpfMasked),
      birth_date: normalizeOptionalText(input.birthDate),
      sex_gender: normalizeOptionalText(input.sexGender),
    });

    if (piiError) {
      await supabase.from('patients').delete().eq('tenant_id', tenantId).eq('id', patient.id);
      throw piiError;
    }

    return { data: { id: patient.id }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao cadastrar paciente.') };
  }
}

export async function updatePatient(
  patientId: string,
  input: PatientMutationInput
): Promise<{ data: { id: string } | null; error: SafeServiceError | null }> {
  try {
    validatePatientInput(input);

    const supabase = createBrowserSupabaseClient();
    const tenantId = await resolveActiveTenantId();
    const metadata = input.unitId ? { main_unit_id: input.unitId } : {};

    const { error: patientError } = await supabase
      .from('patients')
      .update({
        status: toDbPatientStatus(input.status),
        preferred_name: normalizeOptionalText(input.preferredName),
        tags: input.tags ?? [],
        metadata,
      })
      .eq('tenant_id', tenantId)
      .eq('id', patientId);

    if (patientError) throw patientError;

    const { error: piiError } = await supabase.from('patient_pii').upsert(
      {
        tenant_id: tenantId,
        patient_id: patientId,
        full_name: input.fullName.trim(),
        email: normalizeOptionalText(input.email),
        phone: normalizeOptionalText(input.phone),
        cpf_masked: normalizeOptionalText(input.cpfMasked),
        birth_date: normalizeOptionalText(input.birthDate),
        sex_gender: normalizeOptionalText(input.sexGender),
      },
      { onConflict: 'patient_id' }
    );

    if (piiError) throw piiError;

    return { data: { id: patientId }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao atualizar paciente.') };
  }
}

export async function createPatientReviewFlag(
  patientId: string,
  reason = 'Revisao solicitada pela equipe'
): Promise<{ data: { id: string; status: string } | null; error: SafeServiceError | null }> {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para revisao.' } };
  }
  const normalizedReason = reason.trim().slice(0, 500);
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('create_patient_review_flag', {
      p_patient_id: patientId,
      p_reason: normalizedReason || 'Revisao solicitada pela equipe',
    });
    if (error) throw error;
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    return {
      data: {
        id: typeof record.id === 'string' ? record.id : '',
        status: typeof record.status === 'string' ? record.status : 'active',
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao marcar revisao do paciente.') };
  }
}
