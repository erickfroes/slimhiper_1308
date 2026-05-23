import type {
  AppointmentSummary,
  AppointmentStatus,
  AppointmentType,
  AlertSeverity,
  DashboardAlert,
  DashboardStats,
  PatientReviewItem,
  WaitingQueueEntry,
} from '@/domain/types';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface DashboardProvider {
  getDashboardStats(): Promise<DashboardStats>;
  getWaitingQueue(): Promise<WaitingQueueEntry[]>;
  getTodayAppointments(): Promise<AppointmentSummary[]>;
  getDashboardAlerts(): Promise<DashboardAlert[]>;
  getPatientsNeedingReview(): Promise<PatientReviewItem[]>;
}

function isMockExplicitlyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function canUseDevelopmentMockFallback(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function canUseMockDashboardProvider(): boolean {
  return isMockExplicitlyEnabled();
}

let mockDashboardProviderPromise: Promise<DashboardProvider> | null = null;

function getMockDashboardProvider(): Promise<DashboardProvider> {
  mockDashboardProviderPromise ??= import('@/services/mockApi').then((mockApi) => ({
    getDashboardStats: mockApi.getDashboardStats,
    getWaitingQueue: mockApi.getWaitingQueue,
    getTodayAppointments: mockApi.getTodayAppointments,
    getDashboardAlerts: mockApi.getDashboardAlerts,
    getPatientsNeedingReview: mockApi.getPatientsNeedingReview,
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

async function getPatientNames(tenantId: string, patientIds: string[]) {
  if (patientIds.length === 0) return new Map<string, string>();
  const supabase = createBrowserSupabaseClient();
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

async function getTodayAppointmentRows(tenantId: string) {
  const supabase = createBrowserSupabaseClient();
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

async function getActiveAlertRows(tenantId: string, limit = 10) {
  const supabase = createBrowserSupabaseClient();
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

const supabaseDashboardProvider: DashboardProvider = {
  async getDashboardStats() {
    const supabase = createBrowserSupabaseClient();
    const tenantId = await resolveActiveTenantId();
    const todayAppointments = await getTodayAppointmentRows(tenantId);
    const completedToday = todayAppointments.filter(
      (appointment) => mapAppointmentStatus(appointment.status) === 'concluido'
    ).length;
    const queueStatuses: AppointmentStatus[] = [
      'chegou',
      'triagem',
      'medidas',
      'bioimpedancia',
      'aguardando_medico',
      'em_consulta',
      'checkout',
    ];

    const [
      activePatientsResult,
      activeAlertsResult,
      pendingDocumentsResult,
      overdueInvoicesResult,
    ] = await Promise.all([
      supabase
        .from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active'),
      supabase
        .from('patient_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active'),
      supabase
        .from('generated_documents')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['draft', 'pending_signature', 'sent_for_signature']),
      supabase
        .from('patient_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['OVERDUE', 'overdue', 'vencido']),
    ]);

    for (const result of [
      activePatientsResult,
      activeAlertsResult,
      pendingDocumentsResult,
      overdueInvoicesResult,
    ]) {
      if (result.error) throw result.error;
    }

    return {
      consultasHoje: todayAppointments.length,
      consultasConcluidas: completedToday,
      filaEspera: todayAppointments.filter((appointment) =>
        queueStatuses.includes(mapAppointmentStatus(appointment.status))
      ).length,
      programasAtivos: activePatientsResult.count ?? 0,
      alertasClinicos: activeAlertsResult.count ?? 0,
      mensagensNaoLidas: 0,
      documentosPendentes: pendingDocumentsResult.count ?? 0,
      inadimplentes: overdueInvoicesResult.count ?? 0,
      taxaOcupacao: todayAppointments.length
        ? Math.round((completedToday / todayAppointments.length) * 100)
        : 0,
    };
  },

  async getWaitingQueue() {
    const tenantId = await resolveActiveTenantId();
    const rows = await getTodayAppointmentRows(tenantId);
    const queueStatuses: AppointmentStatus[] = [
      'chegou',
      'triagem',
      'medidas',
      'bioimpedancia',
      'aguardando_medico',
      'em_consulta',
      'checkout',
    ];
    const queueRows = rows.filter((row) =>
      queueStatuses.includes(mapAppointmentStatus(row.status))
    );
    const names = await getPatientNames(
      tenantId,
      queueRows.map((row) => row.patient_id)
    );

    return queueRows.map((row) => ({
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
  },

  async getTodayAppointments() {
    const tenantId = await resolveActiveTenantId();
    const rows = await getTodayAppointmentRows(tenantId);
    const names = await getPatientNames(
      tenantId,
      rows.map((row) => row.patient_id)
    );

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
  },

  async getDashboardAlerts() {
    const tenantId = await resolveActiveTenantId();
    const rows = await getActiveAlertRows(tenantId);
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
  },

  async getPatientsNeedingReview() {
    const tenantId = await resolveActiveTenantId();
    const rows = await getActiveAlertRows(tenantId, 6);
    const names = await getPatientNames(
      tenantId,
      rows.map((row) => row.patient_id)
    );

    return rows.map((row) => ({
      id: row.patient_id,
      name: names.get(row.patient_id) ?? 'Paciente sem nome',
      issue: row.title,
      severity: mapAlertSeverity(row.severity),
    }));
  },
};

async function runDashboardOperation<T>(
  operation: (provider: DashboardProvider) => Promise<T>
): Promise<T> {
  const provider = await getDashboardProvider();

  try {
    return await operation(provider);
  } catch (error) {
    if (canUseDevelopmentMockFallback() && !canUseMockDashboardProvider()) {
      return operation(await getMockDashboardProvider());
    }

    throw error;
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return runDashboardOperation((provider) => provider.getDashboardStats());
}

export async function getWaitingQueue(): Promise<WaitingQueueEntry[]> {
  return runDashboardOperation((provider) => provider.getWaitingQueue());
}

export async function getTodayAppointments(): Promise<AppointmentSummary[]> {
  return runDashboardOperation((provider) => provider.getTodayAppointments());
}

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  return runDashboardOperation((provider) => provider.getDashboardAlerts());
}

export async function getPatientsNeedingReview(): Promise<PatientReviewItem[]> {
  return runDashboardOperation((provider) => provider.getPatientsNeedingReview());
}

async function getDashboardProvider(): Promise<DashboardProvider> {
  if (canUseMockDashboardProvider()) return getMockDashboardProvider();
  return supabaseDashboardProvider;
}
