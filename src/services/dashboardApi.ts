import type {
  AppointmentSummary,
  AppointmentStatus,
  AppointmentType,
  AlertSeverity,
  DashboardAlert,
  DashboardDegradedSection,
  DashboardSnapshot,
  DashboardStats,
  PatientReviewItem,
  WaitingQueueEntry,
} from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface DashboardProvider {
  getDashboardSnapshot(): Promise<DashboardSnapshot>;
}

type BrowserSupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

function isMockExplicitlyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

export function canUseMockDashboardProvider(): boolean {
  return isMockExplicitlyEnabled();
}

let mockDashboardProviderPromise: Promise<DashboardProvider> | null = null;

function getMockDashboardProvider(): Promise<DashboardProvider> {
  mockDashboardProviderPromise ??= import('@/services/mockApi').then((mockApi) => ({
    async getDashboardSnapshot() {
      const [stats, waitingQueue, todayAppointments, alerts, patientsNeedingReview] =
        await Promise.all([
          mockApi.getDashboardStats(),
          mockApi.getWaitingQueue(),
          mockApi.getTodayAppointments(),
          mockApi.getDashboardAlerts(),
          mockApi.getPatientsNeedingReview(),
        ]);

      return {
        stats,
        waitingQueue,
        todayAppointments,
        alerts,
        patientsNeedingReview,
      };
    },
  }));

  return mockDashboardProviderPromise;
}

type PatientNameRow = {
  patient_id: string;
  full_name: string | null;
};

type AppointmentRow = {
  id: string;
  patient_id: string;
  status: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  practitioner_id: string | null;
  location: string | null;
  notes: string | null;
};

type AlertRow = {
  id: string;
  patient_id: string;
  title: string;
  description: string | null;
  severity: string | null;
  alert_type: string | null;
  created_at: string;
};

type ChatThreadUnreadRow = {
  unread_count: number | null;
};

type DashboardInsightsRpc = {
  crm?: {
    canRead?: boolean;
    openLeads?: number;
    overdueTasks?: number;
    href?: string;
  };
  inventory?: {
    canRead?: boolean;
    criticalStockItems?: number;
    expiringLots?: number;
    daysToExpiry?: number;
    href?: string;
  };
};

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function mapAppointmentStatus(status: string | null | undefined): AppointmentStatus {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'arrived' || normalized === 'chegou') return 'chegou';
  if (normalized === 'triage' || normalized === 'triagem') return 'triagem';
  if (normalized === 'measurements' || normalized === 'medidas') return 'medidas';
  if (normalized === 'bioimpedance' || normalized === 'bioimpedancia') return 'bioimpedancia';
  if (normalized === 'waiting_doctor' || normalized === 'aguardando_medico') {
    return 'aguardando_medico';
  }
  if (normalized === 'in_consultation' || normalized === 'em_consulta') return 'em_consulta';
  if (normalized === 'checkout') return 'checkout';
  if (normalized === 'completed' || normalized === 'concluido') return 'concluido';
  if (normalized === 'no_show' || normalized === 'falta') return 'falta';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'cancelado') {
    return 'cancelado';
  }
  return 'agendado';
}

function mapAlertSeverity(severity: string | null | undefined): AlertSeverity {
  const normalized = (severity ?? '').toLowerCase();
  if (normalized === 'critical' || normalized === 'critico') return 'critico';
  if (normalized === 'high' || normalized === 'alto') return 'alto';
  if (normalized === 'low' || normalized === 'baixo') return 'baixo';
  return 'medio';
}

function waitingMinutesFromScheduledAt(scheduledAt: string) {
  const scheduled = new Date(scheduledAt).getTime();
  if (Number.isNaN(scheduled)) return 0;
  return Math.max(0, Math.floor((Date.now() - scheduled) / 60000));
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeDashboardInsights(payload: unknown): DashboardStats['operationalInsights'] {
  const record = payload && typeof payload === 'object' ? (payload as DashboardInsightsRpc) : {};
  const crm = record.crm ?? {};
  const inventory = record.inventory ?? {};

  return {
    crm: {
      canRead: crm.canRead === true,
      openLeads: Number(crm.openLeads ?? 0),
      overdueTasks: Number(crm.overdueTasks ?? 0),
      href: typeof crm.href === 'string' ? crm.href : '/clinic/crm',
    },
    inventory: {
      canRead: inventory.canRead === true,
      criticalStockItems: Number(inventory.criticalStockItems ?? 0),
      expiringLots: Number(inventory.expiringLots ?? 0),
      daysToExpiry: Number(inventory.daysToExpiry ?? 30),
      href: typeof inventory.href === 'string' ? inventory.href : '/clinic/inventory',
    },
  };
}

function dashboardFallbackInsights(): DashboardStats['operationalInsights'] {
  return normalizeDashboardInsights({});
}

function formatDashboardSectionError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '').trim();
    if (message) return message;
  }
  return 'Leitura parcial indisponivel.';
}

async function readDashboardSection<T>(
  degradedSections: DashboardDegradedSection[],
  key: string,
  label: string,
  task: PromiseLike<T>,
  fallback: T
) {
  try {
    return await task;
  } catch (error) {
    degradedSections.push({
      key,
      label,
      canRead: false,
      error: formatDashboardSectionError(error),
    });
    return fallback;
  }
}

async function readDashboardCount(
  degradedSections: DashboardDegradedSection[],
  key: string,
  label: string,
  task: PromiseLike<{ count: number | null; error: unknown }>
) {
  try {
    const result = await task;
    if (result.error) throw result.error;
    return result.count ?? 0;
  } catch (error) {
    degradedSections.push({
      key,
      label,
      canRead: false,
      error: formatDashboardSectionError(error),
    });
    return 0;
  }
}

async function readDashboardRows<T>(
  degradedSections: DashboardDegradedSection[],
  key: string,
  label: string,
  task: PromiseLike<{ data: unknown[] | null; error: unknown }>
) {
  try {
    const result = await task;
    if (result.error) throw result.error;
    return (result.data ?? []) as T[];
  } catch (error) {
    degradedSections.push({
      key,
      label,
      canRead: false,
      error: formatDashboardSectionError(error),
    });
    return [] as T[];
  }
}

async function getOperationalInsights(supabase: BrowserSupabaseClient) {
  const { data, error } = await supabase.rpc('get_crm_inventory_dashboard_insights', {
    p_days_to_expiry: 30,
  });

  if (error) throw error;
  return normalizeDashboardInsights(data);
}

async function resolveActiveTenantId(supabase: BrowserSupabaseClient) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('unauthenticated');

  const [profileResult, { data: memberships, error: membershipsError }] = await Promise.all([
    supabase.from('profiles').select('active_tenant_id').eq('id', user.id).maybeSingle(),
    supabase
      .from('tenant_memberships')
      .select('tenant_id,status')
      .eq('user_id', user.id)
      .eq('status', 'active'),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (membershipsError) throw membershipsError;

  const activeMemberships = memberships ?? [];
  const preferredTenantId =
    typeof profileResult.data?.active_tenant_id === 'string'
      ? profileResult.data.active_tenant_id
      : null;
  const preferredMembership = preferredTenantId
    ? activeMemberships.find((membership) => membership.tenant_id === preferredTenantId)
    : null;
  const tenantId = preferredMembership?.tenant_id ?? activeMemberships[0]?.tenant_id ?? null;

  if (!tenantId) throw new Error('no_active_tenant');
  return tenantId;
}

async function getPatientNamesForClient(
  supabase: BrowserSupabaseClient,
  tenantId: string,
  patientIds: string[]
) {
  if (patientIds.length === 0) return new Map<string, string>();
  const { data, error } = await supabase
    .from('patient_pii')
    .select('patient_id,full_name')
    .eq('tenant_id', tenantId)
    .in('patient_id', patientIds);
  if (error) throw error;
  return new Map(
    ((data ?? []) as PatientNameRow[]).map((row) => [
      row.patient_id,
      row.full_name ?? 'Paciente sem nome',
    ])
  );
}

async function getTodayAppointmentRows(
  tenantId: string,
  supabase: BrowserSupabaseClient = createBrowserSupabaseClient()
) {
  const { start, end } = todayRange();
  const { data, error } = await supabase
    .from('appointments')
    .select('id,patient_id,status,scheduled_at,duration_minutes,practitioner_id,location,notes')
    .eq('tenant_id', tenantId)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as AppointmentRow[];
}

async function getActiveAlertRows(
  tenantId: string,
  limit = 10,
  supabase: BrowserSupabaseClient = createBrowserSupabaseClient()
) {
  const { data, error } = await supabase
    .from('patient_alerts')
    .select('id,patient_id,title,description,severity,alert_type,created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AlertRow[];
}

const queueStatuses: AppointmentStatus[] = [
  'chegou',
  'triagem',
  'medidas',
  'bioimpedancia',
  'aguardando_medico',
  'em_consulta',
  'checkout',
];

function mapWaitingQueueRows(
  rows: AppointmentRow[],
  names: Map<string, string>
): WaitingQueueEntry[] {
  return rows.map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: names.get(row.patient_id) ?? 'Paciente sem nome',
    appointmentType: 'consulta_medica' as AppointmentType,
    status: mapAppointmentStatus(row.status),
    scheduledTime: row.scheduled_at,
    waitingMinutes: waitingMinutesFromScheduledAt(row.scheduled_at),
    professionalName: 'Equipe clinica',
    room: row.location ?? undefined,
  }));
}

function mapAppointmentRows(
  rows: AppointmentRow[],
  names: Map<string, string>
): AppointmentSummary[] {
  return rows.map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: names.get(row.patient_id) ?? 'Paciente sem nome',
    type: 'consulta_medica' as AppointmentType,
    status: mapAppointmentStatus(row.status),
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes ?? 30,
    professionalName: 'Equipe clinica',
    professionalRole: 'Profissional',
    roomName: row.location ?? undefined,
    notes: row.notes ?? undefined,
  }));
}

function mapAlertRows(rows: AlertRow[]): DashboardAlert[] {
  return rows.map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    severity: mapAlertSeverity(row.severity),
    title: row.title,
    description: row.description ?? '',
    createdAt: row.created_at,
    isResolved: false,
    category: 'clinico',
  }));
}

function mapReviewRows(rows: AlertRow[], names: Map<string, string>): PatientReviewItem[] {
  return rows.map((row) => ({
    id: row.patient_id,
    name: names.get(row.patient_id) ?? 'Paciente sem nome',
    issue: row.title,
    severity: mapAlertSeverity(row.severity),
  }));
}

const supabaseDashboardProvider: DashboardProvider = {
  async getDashboardSnapshot() {
    const supabase = createBrowserSupabaseClient();
    const tenantId = await resolveActiveTenantId(supabase);
    const degradedSections: DashboardDegradedSection[] = [];
    const [todayAppointments, activeAlertRows] = await Promise.all([
      readDashboardSection(
        degradedSections,
        'todayAppointments',
        'Agenda do dia',
        getTodayAppointmentRows(tenantId, supabase),
        [] as AppointmentRow[]
      ),
      readDashboardSection(
        degradedSections,
        'alerts',
        'Alertas clinicos',
        getActiveAlertRows(tenantId, 10, supabase),
        [] as AlertRow[]
      ),
    ]);
    const completedToday = todayAppointments.filter(
      (appointment) => mapAppointmentStatus(appointment.status) === 'concluido'
    ).length;
    const queueRows = todayAppointments.filter((appointment) =>
      queueStatuses.includes(mapAppointmentStatus(appointment.status))
    );
    const [
      activeProgramsCount,
      activeAlertsCount,
      pendingDocumentsCount,
      overdueInvoicesCount,
      unreadThreadRows,
      operationalInsights,
    ] = await Promise.all([
      readDashboardCount(
        degradedSections,
        'activePrograms',
        'Programas ativos',
        supabase
          .from('patient_program_enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'ativo')
      ),
      readDashboardCount(
        degradedSections,
        'activeAlertsCount',
        'Contagem de alertas',
        supabase
          .from('patient_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'active')
      ),
      readDashboardCount(
        degradedSections,
        'pendingDocuments',
        'Documentos pendentes',
        supabase
          .from('generated_documents')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('status', ['draft', 'pending_signature', 'sent_for_signature'])
      ),
      readDashboardCount(
        degradedSections,
        'overdueInvoices',
        'Cobrancas vencidas',
        supabase
          .from('patient_invoices')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('status', ['OVERDUE', 'overdue', 'vencido'])
      ),
      readDashboardRows<ChatThreadUnreadRow>(
        degradedSections,
        'unreadThreads',
        'Mensagens nao lidas',
        supabase
          .from('patient_chat_threads')
          .select('unread_count')
          .eq('tenant_id', tenantId)
          .gt('unread_count', 0)
      ),
      readDashboardSection(
        degradedSections,
        'operationalInsights',
        'Inteligencia operacional',
        getOperationalInsights(supabase),
        dashboardFallbackInsights()
      ),
    ]);

    const unreadMessages = unreadThreadRows.reduce((sum, row) => sum + (row.unread_count ?? 0), 0);
    const patientNames = await readDashboardSection(
      degradedSections,
      'patientNames',
      'Identificacao de pacientes',
      getPatientNamesForClient(
        supabase,
        tenantId,
        uniqueValues([
          ...todayAppointments.map((row) => row.patient_id),
          ...activeAlertRows.map((row) => row.patient_id),
        ])
      ),
      new Map<string, string>()
    );

    return {
      stats: {
        consultasHoje: todayAppointments.length,
        consultasConcluidas: completedToday,
        filaEspera: queueRows.length,
        programasAtivos: activeProgramsCount,
        alertasClinicos: activeAlertsCount,
        mensagensNaoLidas: unreadMessages,
        documentosPendentes: pendingDocumentsCount,
        inadimplentes: overdueInvoicesCount,
        taxaOcupacao: todayAppointments.length
          ? Math.round((completedToday / todayAppointments.length) * 100)
          : 0,
        operationalInsights,
      },
      waitingQueue: mapWaitingQueueRows(queueRows, patientNames),
      todayAppointments: mapAppointmentRows(todayAppointments, patientNames),
      alerts: mapAlertRows(activeAlertRows),
      patientsNeedingReview: mapReviewRows(activeAlertRows.slice(0, 6), patientNames),
      degradedSections,
    };
  },
};

async function runDashboardOperation<T>(
  operation: (provider: DashboardProvider) => Promise<T>
): Promise<T> {
  const provider = await getDashboardProvider();
  return operation(provider);
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  return runDashboardOperation((provider) => provider.getDashboardSnapshot());
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const snapshot = await getDashboardSnapshot();
  return snapshot.stats;
}

export async function getWaitingQueue(): Promise<WaitingQueueEntry[]> {
  const snapshot = await getDashboardSnapshot();
  return snapshot.waitingQueue;
}

export async function getTodayAppointments(): Promise<AppointmentSummary[]> {
  const snapshot = await getDashboardSnapshot();
  return snapshot.todayAppointments;
}

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  const snapshot = await getDashboardSnapshot();
  return snapshot.alerts;
}

export async function getPatientsNeedingReview(): Promise<PatientReviewItem[]> {
  const snapshot = await getDashboardSnapshot();
  return snapshot.patientsNeedingReview;
}

async function getDashboardProvider(): Promise<DashboardProvider> {
  if (canUseMockDashboardProvider()) return getMockDashboardProvider();
  return supabaseDashboardProvider;
}
