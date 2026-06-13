import type {
  AttendanceQueueStatus,
  AppointmentSummary,
  AppointmentStatus,
  AppointmentType,
  BlockedSlotSummary,
  PatientReturnStatus,
  PatientReturnSummary,
  WaitingQueueEntry,
} from '@/domain/types';
import { isMockDataEnabled } from '@/lib/mockMode';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface AgendaDayData {
  appointments: AppointmentSummary[];
  waitingQueue: WaitingQueueEntry[];
  returns: PatientReturnSummary[];
  blockedSlots: BlockedSlotSummary[];
  calendarEvents: Record<string, number>;
  timezone?: string;
}

export interface SafeServiceError {
  message: string;
  code?: string;
}

export interface AppointmentMutationInput {
  patientId: string;
  type: AppointmentType;
  scheduledAt: string;
  durationMinutes?: number | null;
  location?: string | null;
  notes?: string | null;
}

interface AgendaProvider {
  getAgendaDay(date: string): Promise<AgendaDayData>;
  updateAppointmentStatus(
    appointmentId: string,
    nextStatus: AppointmentStatus,
    reason?: string | null
  ): Promise<void>;
  createAppointment(input: AppointmentMutationInput): Promise<{ id: string }>;
  updateAppointment(
    appointmentId: string,
    input: AppointmentMutationInput
  ): Promise<{ id: string }>;
  cancelAppointment(appointmentId: string, reason?: string | null): Promise<void>;
  callAttendanceQueue(queueId: string): Promise<void>;
  startAttendanceEncounter(input: {
    appointmentId?: string | null;
    queueId?: string | null;
  }): Promise<StartAttendanceEncounterResult>;
  recordPatientReturnAction(
    returnId: string,
    action: PatientReturnAction,
    options?: { appointmentId?: string | null; notes?: string | null }
  ): Promise<void>;
}

export type PatientReturnAction = 'contacted' | 'scheduled' | 'dismissed' | 'cancelled';

export interface StartAttendanceEncounterResult {
  encounterId: string;
  appointmentId: string;
  queueId: string;
  patientId: string;
  href: string;
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

const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  agendado: ['confirmado', 'cancelado', 'falta'],
  confirmado: ['chegou', 'cancelado', 'falta'],
  chegou: ['triagem', 'aguardando_medico', 'cancelado', 'falta'],
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
  return isMockDataEnabled();
}

async function getMockPatient360(patientId: string) {
  const { getPatient360 } = await import('@/services/mockApi');
  return getPatient360(patientId);
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
        returns: [],
        blockedSlots: [],
        calendarEvents: { [date]: appointments.length },
      };
    },
    async updateAppointmentStatus() {
      return undefined;
    },
    async createAppointment() {
      return { id: 'mock-appointment' };
    },
    async updateAppointment(appointmentId) {
      return { id: appointmentId };
    },
    async cancelAppointment() {
      return undefined;
    },
    async callAttendanceQueue() {
      return undefined;
    },
    async startAttendanceEncounter() {
      return {
        encounterId: 'mock-encounter',
        appointmentId: 'mock-appointment',
        queueId: 'mock-queue',
        patientId: 'patient-001',
        href: '/clinic/patients/patient-001/encounter',
      };
    },
    async recordPatientReturnAction() {
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

function mapAppointmentStatus(status: string | null | undefined): AppointmentStatus {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'scheduled' || normalized === 'agendado') return 'agendado';
  if (normalized === 'confirmed' || normalized === 'confirmado') return 'confirmado';
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

function assertAppointmentMutationInput(input: AppointmentMutationInput) {
  if (!input.patientId.trim()) throw new Error('Paciente invalido para consulta.');

  const scheduled = new Date(input.scheduledAt);
  if (Number.isNaN(scheduled.getTime())) {
    throw new Error('Informe uma data e horario validos para a consulta.');
  }

  if (input.durationMinutes !== undefined && input.durationMinutes !== null) {
    if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) {
      throw new Error('A duracao da consulta deve ser maior que zero.');
    }
  }
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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

function asServiceError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) return { message: error.message || fallback };
  if (error && typeof error === 'object' && 'message' in error) {
    return { message: String((error as { message?: unknown }).message ?? fallback) };
  }
  return { message: fallback };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const attendanceQueueStatusValues = new Set<AttendanceQueueStatus>([
  'scheduled',
  'waiting',
  'called',
  'in_attendance',
  'checkout',
  'completed',
  'no_show',
  'cancelled',
  'stuck',
]);

const patientReturnStatusValues = new Set<PatientReturnStatus>([
  'pendente',
  'contatado',
  'agendado',
  'dispensado',
  'vencido',
  'cancelado',
]);

function normalizeAttendanceQueueStatus(value: unknown): AttendanceQueueStatus | undefined {
  const normalized = asString(value).toLowerCase() as AttendanceQueueStatus;
  return attendanceQueueStatusValues.has(normalized) ? normalized : undefined;
}

function normalizePatientReturnStatus(value: unknown): PatientReturnStatus {
  const normalized = asString(value).toLowerCase() as PatientReturnStatus;
  return patientReturnStatusValues.has(normalized) ? normalized : 'pendente';
}

function normalizeAppointmentSummary(value: unknown): AppointmentSummary | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const patientId = asString(record.patientId);
  if (!id || !patientId) return null;

  return {
    id,
    patientId,
    patientName: asString(record.patientName, 'Paciente sem nome'),
    patientPhone: asString(record.patientPhone) || undefined,
    activePackageName: asString(record.activePackageName) || undefined,
    alertCount: asNumber(record.alertCount),
    type: mapAppointmentType(asString(record.type)),
    status: mapAppointmentStatus(asString(record.status)),
    scheduledAt: asString(record.scheduledAt),
    durationMinutes: Math.max(1, Math.round(asNumber(record.durationMinutes, 30))),
    professionalName: asString(record.professionalName, 'Equipe clinica'),
    professionalRole: asString(record.professionalRole, 'Profissional'),
    roomName: asString(record.roomName) || undefined,
    notes: asString(record.notes) || undefined,
    attendanceLink: asString(record.attendanceLink) || undefined,
    attendanceQueueId: asString(record.attendanceQueueId) || undefined,
    attendanceQueueStatus: normalizeAttendanceQueueStatus(record.attendanceQueueStatus),
    recommendedReturn: asString(record.recommendedReturn) || undefined,
  };
}

function normalizeWaitingQueueEntry(value: unknown): WaitingQueueEntry | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const patientId = asString(record.patientId);
  if (!id || !patientId) return null;

  return {
    id,
    queueId: asString(record.queueId, id),
    appointmentId: asString(record.appointmentId) || undefined,
    patientId,
    patientName: asString(record.patientName, 'Paciente sem nome'),
    patientPhone: asString(record.patientPhone) || undefined,
    activePackageName: asString(record.activePackageName) || undefined,
    alertCount: asNumber(record.alertCount),
    appointmentType: mapAppointmentType(asString(record.appointmentType)),
    status: mapAppointmentStatus(asString(record.status)),
    queueStatus: normalizeAttendanceQueueStatus(record.queueStatus),
    scheduledTime: asString(record.scheduledTime),
    arrivedAt: asString(record.arrivedAt) || undefined,
    calledAt: asString(record.calledAt) || undefined,
    startedAt: asString(record.startedAt) || undefined,
    completedAt: asString(record.completedAt) || undefined,
    waitingMinutes: Math.max(0, Math.round(asNumber(record.waitingMinutes))),
    professionalName: asString(record.professionalName, 'Equipe clinica'),
    room: asString(record.room) || undefined,
    encounterId: asString(record.encounterId) || undefined,
    attendanceLink: asString(record.attendanceLink) || undefined,
  };
}

function normalizePatientReturn(value: unknown): PatientReturnSummary | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const patientId = asString(record.patientId);
  if (!id || !patientId) return null;

  return {
    id,
    patientId,
    patientName: asString(record.patientName, 'Paciente sem nome'),
    patientPhone: asString(record.patientPhone) || undefined,
    activePackageName: asString(record.activePackageName) || undefined,
    alertCount: asNumber(record.alertCount),
    dueDate: asString(record.dueDate),
    status: normalizePatientReturnStatus(record.status),
    reason: asString(record.reason, 'Retorno pendente'),
    contactMethod: asString(record.contactMethod) || undefined,
    lastContactAt: asString(record.lastContactAt) || undefined,
    nextActionAt: asString(record.nextActionAt) || undefined,
    sourceAppointmentId: asString(record.sourceAppointmentId) || undefined,
    targetAppointmentId: asString(record.targetAppointmentId) || undefined,
    notes: asString(record.notes) || undefined,
    href: asString(record.href) || undefined,
  };
}

function normalizeBlockedSlot(value: unknown): BlockedSlotSummary | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const startAt = asString(record.startAt);
  const endAt = asString(record.endAt);
  if (!id || !startAt || !endAt) return null;

  return {
    id,
    startAt,
    endAt,
    status: asString(record.status) === 'cancelled' ? 'cancelled' : 'active',
    reason: asString(record.reason, 'Horario bloqueado'),
    location: asString(record.location) || undefined,
  };
}

function normalizeCalendarEvents(value: unknown): Record<string, number> {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, total]) => [key, Math.max(0, Math.round(asNumber(total)))])
  );
}

function normalizeAgendaDayPayload(payload: unknown): AgendaDayData {
  const record = asRecord(payload);
  return {
    appointments: asArray(record.appointments)
      .map(normalizeAppointmentSummary)
      .filter((item): item is AppointmentSummary => Boolean(item)),
    waitingQueue: asArray(record.waitingQueue)
      .map(normalizeWaitingQueueEntry)
      .filter((item): item is WaitingQueueEntry => Boolean(item)),
    returns: asArray(record.returns)
      .map(normalizePatientReturn)
      .filter((item): item is PatientReturnSummary => Boolean(item)),
    blockedSlots: asArray(record.blockedSlots)
      .map(normalizeBlockedSlot)
      .filter((item): item is BlockedSlotSummary => Boolean(item)),
    calendarEvents: normalizeCalendarEvents(record.calendarEvents),
    timezone: asString(record.timezone) || undefined,
  };
}

function normalizeStartAttendancePayload(payload: unknown): StartAttendanceEncounterResult {
  const record = asRecord(payload);
  const encounterId = asString(record.encounterId);
  const appointmentId = asString(record.appointmentId);
  const queueId = asString(record.queueId);
  const patientId = asString(record.patientId);

  if (!encounterId || !appointmentId || !queueId || !patientId) {
    throw new Error('Contrato invalido ao iniciar atendimento.');
  }

  return {
    encounterId,
    appointmentId,
    queueId,
    patientId,
    href:
      asString(record.href) ||
      `/clinic/patients/${patientId}/encounter?appointmentId=${appointmentId}&encounterId=${encounterId}`,
  };
}

const supabaseAgendaProvider: AgendaProvider = {
  async getAgendaDay(date) {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_agenda_day_snapshot', {
      p_target_date: date,
    });

    if (error) throw error;
    return normalizeAgendaDayPayload(data);
  },

  async updateAppointmentStatus(appointmentId, nextStatus, reason) {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('update_appointment_status', {
      p_appointment_id: appointmentId,
      p_next_status: nextStatus,
      p_reason: reason ?? null,
    });

    if (error) throw error;
  },

  async createAppointment(input) {
    assertAppointmentMutationInput(input);

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('create_agenda_appointment', {
      p_patient_id: input.patientId,
      p_type: input.type,
      p_scheduled_at: new Date(input.scheduledAt).toISOString(),
      p_duration_minutes: input.durationMinutes ?? 30,
      p_location: normalizeOptionalText(input.location),
      p_notes: normalizeOptionalText(input.notes),
    });

    if (error) throw error;
    const id = asString(asRecord(data).id);
    if (!id) throw new Error('Contrato invalido ao criar consulta.');
    return { id };
  },

  async updateAppointment(appointmentId, input) {
    assertAppointmentMutationInput(input);

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('update_agenda_appointment', {
      p_appointment_id: appointmentId,
      p_patient_id: input.patientId,
      p_type: input.type,
      p_scheduled_at: new Date(input.scheduledAt).toISOString(),
      p_duration_minutes: input.durationMinutes ?? 30,
      p_location: normalizeOptionalText(input.location),
      p_notes: normalizeOptionalText(input.notes),
    });

    if (error) throw error;
    const id = asString(asRecord(data).id, appointmentId);
    return { id };
  },

  async cancelAppointment(appointmentId, reason) {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('cancel_agenda_appointment', {
      p_appointment_id: appointmentId,
      p_reason: reason ?? null,
    });

    if (error) throw error;
  },

  async callAttendanceQueue(queueId) {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('call_attendance_queue', {
      p_queue_id: queueId,
    });

    if (error) throw error;
  },

  async startAttendanceEncounter(input) {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('start_attendance_encounter', {
      p_appointment_id: input.appointmentId ?? null,
      p_queue_id: input.queueId ?? null,
    });

    if (error) throw error;
    return normalizeStartAttendancePayload(data);
  },

  async recordPatientReturnAction(returnId, action, options) {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('confirm_patient_return', {
      p_return_id: returnId,
      p_action: action,
      p_appointment_id: options?.appointmentId ?? null,
      p_notes: options?.notes ?? null,
    });

    if (error) throw error;
  },
};

async function getAgendaProvider(): Promise<AgendaProvider> {
  if (canUseMockAgendaProvider()) return getMockAgendaProvider();
  return supabaseAgendaProvider;
}

async function runAgendaOperation<T>(operation: (provider: AgendaProvider) => Promise<T>) {
  const provider = await getAgendaProvider();
  return operation(provider);
}

export async function getAgendaDay(date: string): Promise<AgendaDayData> {
  return runAgendaOperation((provider) => provider.getAgendaDay(date));
}

export async function getPatientAppointments(
  patientId: string
): Promise<{ data: AppointmentSummary[]; error: SafeServiceError | null }> {
  if (!patientId.trim()) {
    return { data: [], error: { message: 'Paciente invalido para carregar consultas.' } };
  }

  try {
    if (isMockExplicitlyEnabled()) {
      const patient = await getMockPatient360(patientId);
      return { data: patient?.upcomingAppointments ?? [], error: null };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('appointments')
      .select(
        'id,tenant_id,patient_id,type,status,scheduled_at,arrived_at,duration_minutes,practitioner_id,location,notes'
      )
      .eq('patient_id', patientId)
      .order('scheduled_at', { ascending: false })
      .limit(50);

    if (error) return { data: [], error: { message: error.message, code: error.code } };

    const rows = (data ?? []) as AppointmentRow[];
    if (rows.length === 0) return { data: [], error: null };

    const tenantId = rows[0]?.tenant_id;
    const names = tenantId
      ? await getPatientNames(tenantId, [patientId])
      : new Map<string, string>();
    return {
      data: rows.map((row) => toAppointmentSummary(row, names)),
      error: null,
    };
  } catch (error) {
    return { data: [], error: asServiceError(error, 'Nao foi possivel carregar consultas.') };
  }
}

export async function updateAppointmentStatus(
  appointmentId: string,
  nextStatus: AppointmentStatus,
  reason?: string | null
): Promise<void> {
  return runAgendaOperation((provider) =>
    provider.updateAppointmentStatus(appointmentId, nextStatus, reason)
  );
}

export async function createAppointment(
  input: AppointmentMutationInput
): Promise<{ data: { id: string } | null; error: SafeServiceError | null }> {
  try {
    return {
      data: await runAgendaOperation((provider) => provider.createAppointment(input)),
      error: null,
    };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel criar consulta.') };
  }
}

export async function updateAppointment(
  appointmentId: string,
  input: AppointmentMutationInput
): Promise<{ data: { id: string } | null; error: SafeServiceError | null }> {
  try {
    return {
      data: await runAgendaOperation((provider) =>
        provider.updateAppointment(appointmentId, input)
      ),
      error: null,
    };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel atualizar consulta.') };
  }
}

export async function cancelAppointment(
  appointmentId: string,
  reason?: string | null
): Promise<{ error: SafeServiceError | null }> {
  try {
    await runAgendaOperation((provider) => provider.cancelAppointment(appointmentId, reason));
    return { error: null };
  } catch (error) {
    return { error: asServiceError(error, 'Nao foi possivel cancelar consulta.') };
  }
}

export async function callAttendanceQueue(
  queueId: string
): Promise<{ error: SafeServiceError | null }> {
  try {
    await runAgendaOperation((provider) => provider.callAttendanceQueue(queueId));
    return { error: null };
  } catch (error) {
    return { error: asServiceError(error, 'Nao foi possivel chamar paciente na fila.') };
  }
}

export async function startAttendanceEncounter(input: {
  appointmentId?: string | null;
  queueId?: string | null;
}): Promise<{ data: StartAttendanceEncounterResult | null; error: SafeServiceError | null }> {
  try {
    return {
      data: await runAgendaOperation((provider) => provider.startAttendanceEncounter(input)),
      error: null,
    };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel iniciar atendimento.') };
  }
}

export async function recordPatientReturnAction(
  returnId: string,
  action: PatientReturnAction,
  options?: { appointmentId?: string | null; notes?: string | null }
): Promise<{ error: SafeServiceError | null }> {
  try {
    await runAgendaOperation((provider) =>
      provider.recordPatientReturnAction(returnId, action, options)
    );
    return { error: null };
  } catch (error) {
    return { error: asServiceError(error, 'Nao foi possivel registrar retorno.') };
  }
}

export function getNextAppointmentStatus(status: AppointmentStatus): AppointmentStatus | null {
  return APPOINTMENT_TRANSITIONS[status]?.[0] ?? null;
}
