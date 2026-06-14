import type {
  AttendanceQueueStatus,
  AppointmentSummary,
  AppointmentStatus,
  AppointmentType,
  BlockedSlotSummary,
  OperationalClinicalStage,
  OperationalClinicalWorkflow,
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
  professionalProfileId?: string | null;
  roomId?: string | null;
  unitId?: string | null;
  commercialContext?: AppointmentCommercialContext | null;
  billingContext?: AppointmentBillingContext | null;
}

export type AgendaBillingMode = 'none' | 'local_invoice' | 'manual_paid';

export type AgendaManualPaymentMethod =
  | 'pix'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'boleto'
  | 'dinheiro'
  | 'transferencia';

export interface AppointmentCommercialContext {
  programId?: string | null;
  packageId?: string | null;
  serviceId?: string | null;
  enrollmentId?: string | null;
}

export interface AppointmentBillingContext {
  mode: AgendaBillingMode;
  amountCents?: number | null;
  dueDate?: string | null;
  paymentMethod?: AgendaManualPaymentMethod | null;
  paidAt?: string | null;
  description?: string | null;
}

export type AgendaRoomType =
  | 'consulting'
  | 'triage'
  | 'bioimpedance'
  | 'procedure'
  | 'admin'
  | 'other';

export type AgendaRoomStatus = 'active' | 'inactive' | 'maintenance';

export interface AgendaRoom {
  id: string;
  unitId?: string;
  unitName?: string;
  code: string;
  name: string;
  roomType: AgendaRoomType;
  status: AgendaRoomStatus;
  capacity: number;
}

export interface AgendaProfessionalOption {
  id: string;
  userId: string;
  unitId?: string;
  unitName?: string;
  name: string;
  email?: string;
  professionalType: string;
  specialty?: string;
  licenseNumber?: string;
  licenseState?: string;
  isActive: boolean;
}

export type ProfessionalDayAllocationStatus = 'scheduled' | 'available' | 'blocked' | 'cancelled';

export interface ProfessionalDayAllocation {
  id: string;
  unitId?: string;
  unitName?: string;
  workDate: string;
  startsAt: string;
  endsAt: string;
  startTime: string;
  endTime: string;
  status: ProfessionalDayAllocationStatus;
  notes?: string;
  professionalProfileId: string;
  professionalUserId: string;
  professionalName: string;
  professionalType?: string;
  professionalSpecialty?: string;
  roomId?: string;
  roomName?: string;
  roomCode?: string;
  roomType?: AgendaRoomType;
}

export interface AgendaScheduleUnit {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface AgendaScheduleOptions {
  date: string;
  timezone?: string;
  units: AgendaScheduleUnit[];
  rooms: AgendaRoom[];
  professionals: AgendaProfessionalOption[];
  allocations: ProfessionalDayAllocation[];
}

export interface AgendaRoomInput {
  id?: string | null;
  unitId?: string | null;
  code: string;
  name: string;
  roomType: AgendaRoomType;
  status: AgendaRoomStatus;
  capacity?: number | null;
}

export interface ProfessionalDayAllocationInput {
  id?: string | null;
  unitId?: string | null;
  professionalProfileId: string;
  roomId?: string | null;
  workDate: string;
  startTime: string;
  endTime: string;
  status?: ProfessionalDayAllocationStatus;
  notes?: string | null;
}

export type OperationalClinicalStageAction = 'start' | 'complete';

export interface OperationalClinicalStageInput {
  appointmentId?: string | null;
  queueId?: string | null;
  patientId?: string | null;
  stage: OperationalClinicalStage;
  action: OperationalClinicalStageAction;
  roomId?: string | null;
  professionalProfileId?: string | null;
  notes?: string | null;
  occurredAt?: string | null;
}

export interface OperationalClinicalStageResult {
  appointmentId: string;
  queueId: string;
  patientId: string;
  stage: OperationalClinicalStage;
  action: OperationalClinicalStageAction;
  status: AppointmentStatus;
  queueStatus?: AttendanceQueueStatus;
  occurredAt: string;
}

interface AgendaProvider {
  getAgendaDay(date: string): Promise<AgendaDayData>;
  getScheduleOptions(date: string): Promise<AgendaScheduleOptions>;
  saveClinicRoom(input: AgendaRoomInput): Promise<AgendaRoom>;
  saveProfessionalDayAllocation(
    input: ProfessionalDayAllocationInput
  ): Promise<ProfessionalDayAllocation>;
  cancelProfessionalDayAllocation(allocationId: string, reason?: string | null): Promise<void>;
  updateAppointmentStatus(
    appointmentId: string,
    nextStatus: AppointmentStatus,
    reason?: string | null
  ): Promise<void>;
  recordOperationalClinicalStage(
    input: OperationalClinicalStageInput
  ): Promise<OperationalClinicalStageResult>;
  createAppointment(input: AppointmentMutationInput): Promise<AppointmentMutationResult>;
  updateAppointment(
    appointmentId: string,
    input: AppointmentMutationInput
  ): Promise<AppointmentMutationResult>;
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

export interface AppointmentMutationResult {
  id: string;
  invoiceId?: string | null;
  paymentId?: string | null;
  financialStatus?: AppointmentSummary['financialStatus'];
  financialError?: string | null;
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
  professional_profile_id?: string | null;
  room_id?: string | null;
  unit_id?: string | null;
  location: string | null;
  notes: string | null;
};

const APPOINTMENT_STATUS_FLOW: AppointmentStatus[] = [
  'agendado',
  'confirmado',
  'chegou',
  'triagem',
  'medidas',
  'bioimpedancia',
  'aguardando_medico',
  'em_consulta',
  'checkout',
];

const APPOINTMENT_TERMINAL_STATUSES = new Set<AppointmentStatus>([
  'concluido',
  'falta',
  'cancelado',
]);

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

function getNextStatusForOperationalStage(stage: OperationalClinicalStage): AppointmentStatus {
  if (stage === 'triagem') return 'medidas';
  if (stage === 'medidas') return 'bioimpedancia';
  return 'aguardando_medico';
}

function getMockQueueStatusForAppointment(
  status: AppointmentStatus
): AttendanceQueueStatus | undefined {
  if (status === 'agendado' || status === 'confirmado') return 'scheduled';
  if (status === 'chegou') return 'waiting';
  if (
    status === 'triagem' ||
    status === 'medidas' ||
    status === 'bioimpedancia' ||
    status === 'aguardando_medico' ||
    status === 'em_consulta'
  ) {
    return 'in_attendance';
  }
  if (status === 'checkout') return 'checkout';
  if (status === 'concluido') return 'completed';
  if (status === 'falta') return 'no_show';
  if (status === 'cancelado') return 'cancelled';
  return undefined;
}

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
  mockAgendaProviderPromise ??= import('@/data/mockData').then((mockData) => {
    const mockAppointments = mockData.mockTodayAppointments.map((appointment) => ({
      ...appointment,
    }));
    const mockQueue = mockData.mockWaitingQueue.map((entry) => {
      const appointment = mockAppointments.find((item) => item.patientId === entry.patientId);
      return {
        ...entry,
        queueId: entry.queueId ?? entry.id,
        appointmentId: entry.appointmentId ?? appointment?.id,
        queueStatus: entry.queueStatus ?? getMockQueueStatusForAppointment(entry.status),
      };
    });

    const applyMockAppointmentStatus = (appointmentId: string, nextStatus: AppointmentStatus) => {
      const appointment = mockAppointments.find((item) => item.id === appointmentId);
      if (appointment) {
        appointment.status = nextStatus;
      }

      const entry = mockQueue.find(
        (item) => item.appointmentId === appointmentId || item.patientId === appointment?.patientId
      );
      if (entry) {
        entry.status = nextStatus;
        entry.queueStatus = getMockQueueStatusForAppointment(nextStatus);
      }
    };

    return {
      async getAgendaDay(date) {
        const appointments = mockAppointments.map((appointment) => ({
          ...appointment,
          scheduledAt: shiftIsoDate(appointment.scheduledAt, date),
        }));
        const waitingQueue = mockQueue.map((entry) => ({
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
      async getScheduleOptions(date) {
        return {
          date,
          rooms: [],
          professionals: [],
          allocations: [],
          units: [],
        };
      },
      async saveClinicRoom(input) {
        return {
          id: input.id ?? 'mock-room',
          unitId: input.unitId ?? undefined,
          code: input.code,
          name: input.name,
          roomType: input.roomType,
          status: input.status,
          capacity: input.capacity ?? 1,
        };
      },
      async saveProfessionalDayAllocation(input) {
        return {
          id: input.id ?? 'mock-allocation',
          unitId: input.unitId ?? undefined,
          workDate: input.workDate,
          startsAt: `${input.workDate}T${input.startTime}:00`,
          endsAt: `${input.workDate}T${input.endTime}:00`,
          startTime: input.startTime,
          endTime: input.endTime,
          status: input.status ?? 'available',
          notes: input.notes ?? undefined,
          professionalProfileId: input.professionalProfileId,
          professionalUserId: 'mock-professional-user',
          professionalName: 'Profissional mock',
          roomId: input.roomId ?? undefined,
        };
      },
      async cancelProfessionalDayAllocation() {
        return undefined;
      },
      async updateAppointmentStatus(appointmentId, nextStatus) {
        applyMockAppointmentStatus(appointmentId, nextStatus);
        return undefined;
      },
      async recordOperationalClinicalStage(input) {
        const appointmentId = input.appointmentId ?? 'mock-appointment';
        const queueId = input.queueId ?? 'mock-queue';
        const nextStatus =
          input.action === 'complete' ? getNextStatusForOperationalStage(input.stage) : input.stage;
        applyMockAppointmentStatus(appointmentId, nextStatus);

        const queueEntry = mockQueue.find(
          (entry) =>
            entry.queueId === queueId ||
            entry.id === queueId ||
            entry.appointmentId === appointmentId
        );
        if (queueEntry) {
          queueEntry.clinicalWorkflow = {
            ...queueEntry.clinicalWorkflow,
            [input.stage]: {
              ...queueEntry.clinicalWorkflow?.[input.stage],
              ...(input.action === 'start'
                ? { startedAt: input.occurredAt ?? new Date().toISOString() }
                : { completedAt: input.occurredAt ?? new Date().toISOString() }),
              roomId: input.roomId ?? undefined,
              professionalProfileId: input.professionalProfileId ?? undefined,
              notes: input.notes ?? undefined,
            },
          };
        }

        return {
          appointmentId,
          queueId,
          patientId: input.patientId ?? 'patient-001',
          stage: input.stage,
          action: input.action,
          status: nextStatus,
          queueStatus: getMockQueueStatusForAppointment(nextStatus),
          occurredAt: input.occurredAt ?? new Date().toISOString(),
        };
      },
      async createAppointment() {
        return { id: 'mock-appointment', financialStatus: 'not_required' };
      },
      async updateAppointment(appointmentId) {
        return { id: appointmentId, financialStatus: 'not_required' };
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
    };
  });

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

function normalizeOptionalId(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toCommercialRpcPayload(input?: AppointmentCommercialContext | null) {
  return {
    programId: normalizeOptionalId(input?.programId),
    packageId: normalizeOptionalId(input?.packageId),
    serviceId: normalizeOptionalId(input?.serviceId),
    enrollmentId: normalizeOptionalId(input?.enrollmentId),
  };
}

function toBillingRpcPayload(input?: AppointmentBillingContext | null) {
  if (!input || input.mode === 'none') {
    return { mode: 'none' };
  }

  return {
    mode: input.mode,
    amountCents:
      input.amountCents === null || input.amountCents === undefined
        ? null
        : Math.max(0, Math.round(input.amountCents)),
    dueDate: normalizeOptionalText(input.dueDate),
    paymentMethod: normalizeOptionalText(input.paymentMethod),
    paidAt: normalizeOptionalText(input.paidAt),
    description: normalizeOptionalText(input.description),
  };
}

function normalizeMutationResult(payload: unknown, fallbackId?: string): AppointmentMutationResult {
  const record = asRecord(payload);
  const id = asString(record.id, fallbackId ?? '');
  if (!id) throw new Error('Contrato invalido ao salvar consulta.');

  return {
    id,
    invoiceId: asString(record.invoiceId) || null,
    paymentId: asString(record.paymentId) || null,
    financialStatus: normalizeFinancialStatus(record.financialStatus),
    financialError: asString(record.financialError) || null,
  };
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
    professionalProfileId: row.professional_profile_id ?? undefined,
    professionalName: 'Equipe clinica',
    professionalRole: 'Profissional',
    roomId: row.room_id ?? undefined,
    roomName: row.location ?? undefined,
    unitId: row.unit_id ?? undefined,
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

const roomTypeValues = new Set<AgendaRoomType>([
  'consulting',
  'triage',
  'bioimpedance',
  'procedure',
  'admin',
  'other',
]);

const roomStatusValues = new Set<AgendaRoomStatus>(['active', 'inactive', 'maintenance']);

const allocationStatusValues = new Set<ProfessionalDayAllocationStatus>([
  'scheduled',
  'available',
  'blocked',
  'cancelled',
]);

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

const financialStatusValues = new Set<NonNullable<AppointmentSummary['financialStatus']>>([
  'not_required',
  'pending_local_invoice',
  'manual_paid',
  'failed',
]);

const operationalClinicalStageValues = new Set<OperationalClinicalStage>([
  'triagem',
  'medidas',
  'bioimpedancia',
]);

const operationalClinicalStageActionValues = new Set<OperationalClinicalStageAction>([
  'start',
  'complete',
]);

function normalizeAttendanceQueueStatus(value: unknown): AttendanceQueueStatus | undefined {
  const normalized = asString(value).toLowerCase() as AttendanceQueueStatus;
  return attendanceQueueStatusValues.has(normalized) ? normalized : undefined;
}

function normalizeFinancialStatus(
  value: unknown
): NonNullable<AppointmentSummary['financialStatus']> | undefined {
  const normalized = asString(value).toLowerCase() as NonNullable<
    AppointmentSummary['financialStatus']
  >;
  return financialStatusValues.has(normalized) ? normalized : undefined;
}

function normalizeOperationalStage(value: unknown): OperationalClinicalStage | undefined {
  const normalized = asString(value).toLowerCase() as OperationalClinicalStage;
  return operationalClinicalStageValues.has(normalized) ? normalized : undefined;
}

function normalizeOperationalStageAction(
  value: unknown
): OperationalClinicalStageAction | undefined {
  const normalized = asString(value).toLowerCase() as OperationalClinicalStageAction;
  return operationalClinicalStageActionValues.has(normalized) ? normalized : undefined;
}

function normalizePatientReturnStatus(value: unknown): PatientReturnStatus {
  const normalized = asString(value).toLowerCase() as PatientReturnStatus;
  return patientReturnStatusValues.has(normalized) ? normalized : 'pendente';
}

function normalizeRoomType(value: unknown): AgendaRoomType {
  const normalized = asString(value).toLowerCase() as AgendaRoomType;
  return roomTypeValues.has(normalized) ? normalized : 'consulting';
}

function normalizeRoomStatus(value: unknown): AgendaRoomStatus {
  const normalized = asString(value).toLowerCase() as AgendaRoomStatus;
  return roomStatusValues.has(normalized) ? normalized : 'active';
}

function normalizeAllocationStatus(value: unknown): ProfessionalDayAllocationStatus {
  const normalized = asString(value).toLowerCase() as ProfessionalDayAllocationStatus;
  return allocationStatusValues.has(normalized) ? normalized : 'available';
}

function normalizeAgendaRoom(value: unknown): AgendaRoom | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const code = asString(record.code);
  const name = asString(record.name);
  if (!id || !code || !name) return null;

  return {
    id,
    unitId: asString(record.unitId) || undefined,
    unitName: asString(record.unitName) || undefined,
    code,
    name,
    roomType: normalizeRoomType(record.roomType),
    status: normalizeRoomStatus(record.status),
    capacity: Math.max(1, Math.round(asNumber(record.capacity, 1))),
  };
}

function normalizeAgendaProfessional(value: unknown): AgendaProfessionalOption | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const userId = asString(record.userId);
  if (!id || !userId) return null;

  return {
    id,
    userId,
    unitId: asString(record.unitId) || undefined,
    unitName: asString(record.unitName) || undefined,
    name: asString(record.name, 'Profissional sem nome'),
    email: asString(record.email) || undefined,
    professionalType: asString(record.professionalType, 'professional'),
    specialty: asString(record.specialty) || undefined,
    licenseNumber: asString(record.licenseNumber) || undefined,
    licenseState: asString(record.licenseState) || undefined,
    isActive: record.isActive !== false,
  };
}

function normalizeProfessionalAllocation(value: unknown): ProfessionalDayAllocation | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const professionalProfileId = asString(record.professionalProfileId);
  const professionalUserId = asString(record.professionalUserId);
  const workDate = asString(record.workDate);
  const startsAt = asString(record.startsAt);
  const endsAt = asString(record.endsAt);
  if (!id || !professionalProfileId || !professionalUserId || !workDate || !startsAt || !endsAt) {
    return null;
  }

  return {
    id,
    unitId: asString(record.unitId) || undefined,
    unitName: asString(record.unitName) || undefined,
    workDate,
    startsAt,
    endsAt,
    startTime: asString(record.startTime) || toLocalTimeFromIso(startsAt),
    endTime: asString(record.endTime) || toLocalTimeFromIso(endsAt),
    status: normalizeAllocationStatus(record.status),
    notes: asString(record.notes) || undefined,
    professionalProfileId,
    professionalUserId,
    professionalName: asString(record.professionalName, 'Profissional sem nome'),
    professionalType: asString(record.professionalType) || undefined,
    professionalSpecialty: asString(record.professionalSpecialty) || undefined,
    roomId: asString(record.roomId) || undefined,
    roomName: asString(record.roomName) || undefined,
    roomCode: asString(record.roomCode) || undefined,
    roomType: record.roomType ? normalizeRoomType(record.roomType) : undefined,
  };
}

function normalizeAgendaUnit(value: unknown): AgendaScheduleUnit | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const name = asString(record.name);
  if (!id || !name) return null;
  return {
    id,
    code: asString(record.code),
    name,
    status: asString(record.status, 'active'),
  };
}

function normalizeScheduleOptionsPayload(payload: unknown): AgendaScheduleOptions {
  const record = asRecord(payload);
  const date = asString(record.date);
  return {
    date,
    timezone: asString(record.timezone) || undefined,
    units: asArray(record.units)
      .map(normalizeAgendaUnit)
      .filter((item): item is AgendaScheduleUnit => Boolean(item)),
    rooms: asArray(record.rooms)
      .map(normalizeAgendaRoom)
      .filter((item): item is AgendaRoom => Boolean(item)),
    professionals: asArray(record.professionals)
      .map(normalizeAgendaProfessional)
      .filter((item): item is AgendaProfessionalOption => Boolean(item)),
    allocations: asArray(record.allocations)
      .map(normalizeProfessionalAllocation)
      .filter((item): item is ProfessionalDayAllocation => Boolean(item)),
  };
}

function toLocalTimeFromIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
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
    professionalProfileId: asString(record.professionalProfileId) || undefined,
    professionalUserId: asString(record.professionalUserId) || undefined,
    professionalName: asString(record.professionalName, 'Equipe clinica'),
    professionalRole: asString(record.professionalRole, 'Profissional'),
    roomId: asString(record.roomId) || undefined,
    roomName: asString(record.roomName) || undefined,
    roomCode: asString(record.roomCode) || undefined,
    unitId: asString(record.unitId) || undefined,
    unitName: asString(record.unitName) || undefined,
    programId: asString(record.programId) || undefined,
    programName: asString(record.programName) || undefined,
    packageId: asString(record.packageId) || undefined,
    packageName: asString(record.packageName) || undefined,
    serviceId: asString(record.serviceId) || undefined,
    serviceName: asString(record.serviceName) || undefined,
    enrollmentId: asString(record.enrollmentId) || undefined,
    invoiceId: asString(record.invoiceId) || undefined,
    paymentId: asString(record.paymentId) || undefined,
    financialStatus: normalizeFinancialStatus(record.financialStatus),
    financialAmountCents:
      record.financialAmountCents === null || record.financialAmountCents === undefined
        ? undefined
        : Math.max(0, Math.round(asNumber(record.financialAmountCents))),
    financialDueDate: asString(record.financialDueDate) || undefined,
    financialPaymentMethod: asString(record.financialPaymentMethod) || undefined,
    financialError: asString(record.financialError) || undefined,
    notes: asString(record.notes) || undefined,
    attendanceLink: asString(record.attendanceLink) || undefined,
    attendanceQueueId: asString(record.attendanceQueueId) || undefined,
    attendanceQueueStatus: normalizeAttendanceQueueStatus(record.attendanceQueueStatus),
    recommendedReturn: asString(record.recommendedReturn) || undefined,
  };
}

function normalizeOperationalClinicalWorkflow(value: unknown): OperationalClinicalWorkflow {
  const record = asRecord(value);
  const workflow: OperationalClinicalWorkflow = {};

  for (const stage of operationalClinicalStageValues) {
    const rawStage = asRecord(record[stage]);
    const startedAt = asString(rawStage.startedAt);
    const completedAt = asString(rawStage.completedAt);
    const actorId = asString(rawStage.actorId);
    const roomId = asString(rawStage.roomId);
    const professionalProfileId = asString(rawStage.professionalProfileId);
    const notes = asString(rawStage.notes);

    if (startedAt || completedAt || actorId || roomId || professionalProfileId || notes) {
      workflow[stage] = {
        startedAt: startedAt || undefined,
        completedAt: completedAt || undefined,
        actorId: actorId || undefined,
        roomId: roomId || undefined,
        professionalProfileId: professionalProfileId || undefined,
        notes: notes || undefined,
      };
    }
  }

  return workflow;
}

function normalizeOperationalClinicalStageResult(value: unknown): OperationalClinicalStageResult {
  const record = asRecord(value);
  const appointmentId = asString(record.appointmentId);
  const queueId = asString(record.queueId);
  const patientId = asString(record.patientId);
  const stage = normalizeOperationalStage(record.stage);
  const action = normalizeOperationalStageAction(record.action);

  if (!appointmentId || !queueId || !patientId || !stage || !action) {
    throw new Error('Contrato invalido ao registrar etapa operacional.');
  }

  return {
    appointmentId,
    queueId,
    patientId,
    stage,
    action,
    status: mapAppointmentStatus(asString(record.status)),
    queueStatus: normalizeAttendanceQueueStatus(record.queueStatus),
    occurredAt: asString(record.occurredAt) || new Date().toISOString(),
  };
}

function mergeOperationalQueueWorkflow(
  day: AgendaDayData,
  operationalPayload: unknown
): AgendaDayData {
  const workflowByQueueId = new Map<string, OperationalClinicalWorkflow>();

  for (const item of asArray(operationalPayload)) {
    const record = asRecord(item);
    const queueId = asString(record.queueId);
    if (queueId) {
      workflowByQueueId.set(queueId, normalizeOperationalClinicalWorkflow(record.clinicalWorkflow));
    }
  }

  if (workflowByQueueId.size === 0) return day;

  return {
    ...day,
    waitingQueue: day.waitingQueue.map((entry) => {
      const queueId = entry.queueId ?? entry.id;
      const clinicalWorkflow = workflowByQueueId.get(queueId);
      return clinicalWorkflow ? { ...entry, clinicalWorkflow } : entry;
    }),
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
    professionalProfileId: asString(record.professionalProfileId) || undefined,
    professionalUserId: asString(record.professionalUserId) || undefined,
    professionalName: asString(record.professionalName, 'Equipe clinica'),
    roomId: asString(record.roomId) || undefined,
    room: asString(record.room) || undefined,
    programId: asString(record.programId) || undefined,
    programName: asString(record.programName) || undefined,
    packageId: asString(record.packageId) || undefined,
    packageName: asString(record.packageName) || undefined,
    serviceId: asString(record.serviceId) || undefined,
    serviceName: asString(record.serviceName) || undefined,
    invoiceId: asString(record.invoiceId) || undefined,
    paymentId: asString(record.paymentId) || undefined,
    financialStatus: normalizeFinancialStatus(record.financialStatus),
    encounterId: asString(record.encounterId) || undefined,
    attendanceLink: asString(record.attendanceLink) || undefined,
    clinicalWorkflow: normalizeOperationalClinicalWorkflow(record.clinicalWorkflow),
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
    roomId: asString(record.roomId) || undefined,
    roomName: asString(record.roomName) || undefined,
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
    const [dayResult, operationalResult] = await Promise.all([
      supabase.rpc('get_agenda_day_snapshot', {
        p_target_date: date,
      }),
      supabase.rpc('get_agenda_operational_queue', {
        p_target_date: date,
      }),
    ]);

    if (dayResult.error) throw dayResult.error;
    if (operationalResult.error) throw operationalResult.error;

    return mergeOperationalQueueWorkflow(
      normalizeAgendaDayPayload(dayResult.data),
      operationalResult.data
    );
  },

  async getScheduleOptions(date) {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_agenda_schedule_options', {
      p_target_date: date,
    });

    if (error) throw error;
    return normalizeScheduleOptionsPayload(data);
  },

  async saveClinicRoom(input) {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('upsert_clinic_room', {
      p_room_id: input.id ?? null,
      p_payload: {
        unitId: input.unitId ?? null,
        code: input.code,
        name: input.name,
        roomType: input.roomType,
        status: input.status,
        capacity: input.capacity ?? 1,
      },
    });

    if (error) throw error;
    const room = normalizeAgendaRoom(data);
    if (!room) throw new Error('Contrato invalido ao salvar sala.');
    return room;
  },

  async saveProfessionalDayAllocation(input) {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('upsert_professional_day_allocation', {
      p_allocation_id: input.id ?? null,
      p_payload: {
        unitId: input.unitId ?? null,
        professionalProfileId: input.professionalProfileId,
        roomId: input.roomId ?? null,
        workDate: input.workDate,
        startTime: input.startTime,
        endTime: input.endTime,
        status: input.status ?? 'available',
        notes: normalizeOptionalText(input.notes),
      },
    });

    if (error) throw error;
    const allocation = normalizeProfessionalAllocation(data);
    if (!allocation) throw new Error('Contrato invalido ao salvar escala.');
    return allocation;
  },

  async cancelProfessionalDayAllocation(allocationId, reason) {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('cancel_professional_day_allocation', {
      p_allocation_id: allocationId,
      p_reason: reason ?? null,
    });

    if (error) throw error;
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

  async recordOperationalClinicalStage(input) {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('record_operational_clinical_stage', {
      p_payload: {
        appointmentId: normalizeOptionalId(input.appointmentId),
        queueId: normalizeOptionalId(input.queueId),
        patientId: normalizeOptionalId(input.patientId),
        stage: input.stage,
        action: input.action,
        roomId: normalizeOptionalId(input.roomId),
        professionalProfileId: normalizeOptionalId(input.professionalProfileId),
        notes: normalizeOptionalText(input.notes),
        occurredAt: normalizeOptionalText(input.occurredAt),
      },
    });

    if (error) throw error;
    return normalizeOperationalClinicalStageResult(data);
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
      p_professional_profile_id: normalizeOptionalText(input.professionalProfileId),
      p_room_id: normalizeOptionalText(input.roomId),
      p_unit_id: normalizeOptionalText(input.unitId),
      p_commercial_context: toCommercialRpcPayload(input.commercialContext),
      p_billing_context: toBillingRpcPayload(input.billingContext),
    });

    if (error) throw error;
    return normalizeMutationResult(data);
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
      p_professional_profile_id: normalizeOptionalText(input.professionalProfileId),
      p_room_id: normalizeOptionalText(input.roomId),
      p_unit_id: normalizeOptionalText(input.unitId),
      p_commercial_context: toCommercialRpcPayload(input.commercialContext),
      p_billing_context: toBillingRpcPayload(input.billingContext),
    });

    if (error) throw error;
    return normalizeMutationResult(data, appointmentId);
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

export async function getAgendaScheduleOptions(date: string): Promise<AgendaScheduleOptions> {
  return runAgendaOperation((provider) => provider.getScheduleOptions(date));
}

export async function saveClinicRoom(
  input: AgendaRoomInput
): Promise<{ data: AgendaRoom | null; error: SafeServiceError | null }> {
  try {
    return {
      data: await runAgendaOperation((provider) => provider.saveClinicRoom(input)),
      error: null,
    };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel salvar sala.') };
  }
}

export async function saveProfessionalDayAllocation(
  input: ProfessionalDayAllocationInput
): Promise<{ data: ProfessionalDayAllocation | null; error: SafeServiceError | null }> {
  try {
    return {
      data: await runAgendaOperation((provider) => provider.saveProfessionalDayAllocation(input)),
      error: null,
    };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel salvar escala.') };
  }
}

export async function cancelProfessionalDayAllocation(
  allocationId: string,
  reason?: string | null
): Promise<{ error: SafeServiceError | null }> {
  try {
    await runAgendaOperation((provider) =>
      provider.cancelProfessionalDayAllocation(allocationId, reason)
    );
    return { error: null };
  } catch (error) {
    return { error: asServiceError(error, 'Nao foi possivel cancelar escala.') };
  }
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
        'id,tenant_id,patient_id,type,status,scheduled_at,arrived_at,duration_minutes,practitioner_id,professional_profile_id,room_id,unit_id,location,notes'
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

export async function recordOperationalClinicalStage(
  input: OperationalClinicalStageInput
): Promise<{ data: OperationalClinicalStageResult | null; error: SafeServiceError | null }> {
  try {
    return {
      data: await runAgendaOperation((provider) => provider.recordOperationalClinicalStage(input)),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: asServiceError(error, 'Nao foi possivel registrar etapa operacional.'),
    };
  }
}

export async function createAppointment(
  input: AppointmentMutationInput
): Promise<{ data: AppointmentMutationResult | null; error: SafeServiceError | null }> {
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
): Promise<{ data: AppointmentMutationResult | null; error: SafeServiceError | null }> {
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

export function getPreviousAppointmentStatus(status: AppointmentStatus): AppointmentStatus | null {
  if (APPOINTMENT_TERMINAL_STATUSES.has(status)) return null;
  const currentIndex = APPOINTMENT_STATUS_FLOW.indexOf(status);
  if (currentIndex <= 0) return null;
  return APPOINTMENT_STATUS_FLOW[currentIndex - 1] ?? null;
}

export function getAppointmentStatusPath(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus
): AppointmentStatus[] {
  if (currentStatus === targetStatus) return [];
  if (
    APPOINTMENT_TERMINAL_STATUSES.has(currentStatus) ||
    APPOINTMENT_TERMINAL_STATUSES.has(targetStatus)
  ) {
    return [];
  }

  const currentIndex = APPOINTMENT_STATUS_FLOW.indexOf(currentStatus);
  const targetIndex = APPOINTMENT_STATUS_FLOW.indexOf(targetStatus);
  if (currentIndex < 0 || targetIndex < 0) return [];

  const step = currentIndex < targetIndex ? 1 : -1;
  const path: AppointmentStatus[] = [];
  for (
    let index = currentIndex + step;
    step > 0 ? index <= targetIndex : index >= targetIndex;
    index += step
  ) {
    path.push(APPOINTMENT_STATUS_FLOW[index]);
  }
  return path;
}
