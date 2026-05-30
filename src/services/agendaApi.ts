import type {
  AppointmentSummary,
  AppointmentStatus,
  AppointmentType,
  WaitingQueueEntry,
} from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface AgendaDayData {
  appointments: AppointmentSummary[];
  waitingQueue: WaitingQueueEntry[];
  calendarEvents: Record<string, number>;
}

interface AgendaProvider {
  getAgendaDay(date: string): Promise<AgendaDayData>;
  updateAppointmentStatus(appointmentId: string, nextStatus: AppointmentStatus): Promise<void>;
}

type PatientNameRow = {
  patient_id: string;
  full_name: string | null;
};

type AppointmentRow = {
  id: string;
  tenant_id: string;
  patient_id: string;
  type: string | null;
  status: string | null;
  scheduled_at: string;
  arrived_at: string | null;
  duration_minutes: number | null;
  practitioner_id: string | null;
  location: string | null;
  notes: string | null;
};

type AppointmentStatusRow = {
  tenant_id: string;
  patient_id: string;
  status: string | null;
  arrived_at: string | null;
};

const ACTIVE_QUEUE_STATUSES: AppointmentStatus[] = [
  'chegou',
  'triagem',
  'medidas',
  'bioimpedancia',
  'aguardando_medico',
  'em_consulta',
  'checkout',
];

const AGENDA_QUEUE_STATUSES: AppointmentStatus[] = ['agendado', ...ACTIVE_QUEUE_STATUSES];

const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  agendado: ['chegou', 'triagem', 'cancelado', 'falta'],
  chegou: ['triagem', 'cancelado'],
  triagem: ['medidas', 'aguardando_medico', 'cancelado'],
  medidas: ['bioimpedancia', 'aguardando_medico', 'cancelado'],
  bioimpedancia: ['aguardando_medico', 'cancelado'],
  aguardando_medico: ['em_consulta', 'cancelado'],
  em_consulta: ['checkout', 'cancelado'],
  checkout: ['concluido'],
  concluido: [],
  falta: [],
  cancelado: [],
};

function isMockExplicitlyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function canUseDevelopmentMockFallback(): boolean {
  return process.env.NODE_ENV === 'development';
}

function canUseMockAgendaProvider(): boolean {
  return isMockExplicitlyEnabled();
}

let mockAgendaProviderPromise: Promise<AgendaProvider> | null = null;

function getMockAgendaProvider(): Promise<AgendaProvider> {
  mockAgendaProviderPromise ??= import('@/data/mockData').then((mockData) => ({
    async getAgendaDay(date) {
      const appointments = mockData.mockTodayAppointments.map((appointment) => ({
        ...appointment,
        scheduledAt: shiftIsoDate(appointment.scheduledAt, date),
      }));
      const waitingQueue = mockData.mockWaitingQueue.map((entry) => ({
        ...entry,
        scheduledTime: entry.scheduledTime.includes('T')
          ? shiftIsoDate(entry.scheduledTime, date)
          : entry.scheduledTime,
      }));

      return {
        appointments,
        waitingQueue,
        calendarEvents: { [date]: appointments.length },
      };
    },
    async updateAppointmentStatus() {
      return undefined;
    },
  }));

  return mockAgendaProviderPromise;
}

function shiftIsoDate(value: string, date: string) {
  const original = new Date(value);
  if (Number.isNaN(original.getTime())) return value;
  const hours = String(original.getHours()).padStart(2, '0');
  const minutes = String(original.getMinutes()).padStart(2, '0');
  const seconds = String(original.getSeconds()).padStart(2, '0');
  return `${date}T${hours}:${minutes}:${seconds}`;
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function monthRange(date: string) {
  const [year, month] = date.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function isoDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return localDateValue(date);
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function mapAppointmentStatus(status: string | null | undefined): AppointmentStatus {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'scheduled' || normalized === 'agendado') return 'agendado';
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

function mapAppointmentType(type: string | null | undefined): AppointmentType {
  const normalized = (type ?? '').toLowerCase();
  if (normalized === 'retorno' || normalized === 'follow_up') return 'retorno';
  if (normalized === 'nutricao' || normalized === 'consulta_nutricao') return 'nutricao';
  if (normalized === 'avaliacao_inicial' || normalized === 'initial_assessment') {
    return 'avaliacao_inicial';
  }
  if (normalized === 'bioimpedancia' || normalized === 'bioimpedance') return 'bioimpedancia';
  if (normalized === 'checkup') return 'checkup';
  return 'consulta_medica';
}

function waitingMinutes(scheduledAt: string, arrivedAt: string | null) {
  const reference = arrivedAt ? new Date(arrivedAt).getTime() : new Date(scheduledAt).getTime();
  if (Number.isNaN(reference)) return 0;
  return Math.max(0, Math.floor((Date.now() - reference) / 60000));
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

function toAppointmentSummary(row: AppointmentRow, names: Map<string, string>): AppointmentSummary {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: names.get(row.patient_id) ?? 'Paciente sem nome',
    type: mapAppointmentType(row.type),
    status: mapAppointmentStatus(row.status),
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes ?? 30,
    professionalName: 'Equipe clinica',
    professionalRole: 'Profissional',
    roomName: row.location ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function toWaitingQueueEntry(row: AppointmentRow, names: Map<string, string>): WaitingQueueEntry {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: names.get(row.patient_id) ?? 'Paciente sem nome',
    appointmentType: mapAppointmentType(row.type),
    status: mapAppointmentStatus(row.status),
    scheduledTime: timeLabel(row.scheduled_at),
    arrivedAt: row.arrived_at ? timeLabel(row.arrived_at) : undefined,
    waitingMinutes: waitingMinutes(row.scheduled_at, row.arrived_at),
    professionalName: 'Equipe clinica',
    room: row.location ?? undefined,
  };
}

const supabaseAgendaProvider: AgendaProvider = {
  async getAgendaDay(date) {
    const supabase = createBrowserSupabaseClient();
    const tenantId = await resolveActiveTenantId();
    const day = dayRange(date);
    const month = monthRange(date);

    const [appointmentsResult, monthAppointmentsResult] = await Promise.all([
      supabase
        .from('appointments')
        .select(
          'id,tenant_id,patient_id,type,status,scheduled_at,arrived_at,duration_minutes,practitioner_id,location,notes'
        )
        .eq('tenant_id', tenantId)
        .gte('scheduled_at', day.start)
        .lt('scheduled_at', day.end)
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('appointments')
        .select('scheduled_at')
        .eq('tenant_id', tenantId)
        .gte('scheduled_at', month.start)
        .lt('scheduled_at', month.end),
    ]);

    if (appointmentsResult.error) throw appointmentsResult.error;
    if (monthAppointmentsResult.error) throw monthAppointmentsResult.error;

    const rows = (appointmentsResult.data ?? []) as AppointmentRow[];
    const names = await getPatientNames(
      tenantId,
      rows.map((row) => row.patient_id)
    );
    const appointments = rows.map((row) => toAppointmentSummary(row, names));
    const waitingQueue = rows
      .filter((row) => AGENDA_QUEUE_STATUSES.includes(mapAppointmentStatus(row.status)))
      .map((row) => toWaitingQueueEntry(row, names));
    const calendarEvents = (monthAppointmentsResult.data ?? []).reduce<Record<string, number>>(
      (events, row) => {
        const key = isoDateKey(row.scheduled_at);
        events[key] = (events[key] ?? 0) + 1;
        return events;
      },
      {}
    );

    return { appointments, waitingQueue, calendarEvents };
  },

  async updateAppointmentStatus(appointmentId, nextStatus) {
    const supabase = createBrowserSupabaseClient();
    const { data: current, error: currentError } = await supabase
      .from('appointments')
      .select('tenant_id,patient_id,status,arrived_at')
      .eq('id', appointmentId)
      .single();

    if (currentError) throw currentError;

    const row = current as AppointmentStatusRow;
    const currentStatus = mapAppointmentStatus(row.status);
    const allowed = APPOINTMENT_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(nextStatus)) {
      throw new Error(`Invalid appointment transition: ${currentStatus} -> ${nextStatus}`);
    }

    const now = new Date().toISOString();
    const shouldSetArrival =
      !row.arrived_at && (nextStatus === 'chegou' || ACTIVE_QUEUE_STATUSES.includes(nextStatus));

    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        status: nextStatus,
        arrived_at: shouldSetArrival ? now : row.arrived_at,
        updated_at: now,
      })
      .eq('id', appointmentId)
      .eq('tenant_id', row.tenant_id);

    if (updateError) throw updateError;

    const { error: queueEventError } = await supabase.from('queue_events').insert({
      tenant_id: row.tenant_id,
      patient_id: row.patient_id,
      appointment_id: appointmentId,
      event_type: 'appointment_status_transition',
      status: 'recorded',
      event_at: now,
      metadata: {
        fromStatus: currentStatus,
        toStatus: nextStatus,
      },
    });

    if (queueEventError) throw queueEventError;
  },
};

async function getAgendaProvider(): Promise<AgendaProvider> {
  if (canUseMockAgendaProvider()) return getMockAgendaProvider();
  return supabaseAgendaProvider;
}

async function runAgendaOperation<T>(operation: (provider: AgendaProvider) => Promise<T>) {
  const provider = await getAgendaProvider();

  try {
    return await operation(provider);
  } catch (error) {
    if (canUseDevelopmentMockFallback() && !canUseMockAgendaProvider()) {
      return operation(await getMockAgendaProvider());
    }

    throw error;
  }
}

export async function getAgendaDay(date: string): Promise<AgendaDayData> {
  return runAgendaOperation((provider) => provider.getAgendaDay(date));
}

export async function updateAppointmentStatus(
  appointmentId: string,
  nextStatus: AppointmentStatus
): Promise<void> {
  return runAgendaOperation((provider) =>
    provider.updateAppointmentStatus(appointmentId, nextStatus)
  );
}

export function getNextAppointmentStatus(status: AppointmentStatus): AppointmentStatus | null {
  return APPOINTMENT_TRANSITIONS[status]?.[0] ?? null;
}
