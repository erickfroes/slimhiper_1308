import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { asSafePaymentUrl } from '@/lib/safeExternalUrl';

export interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

export interface PatientPortalLinkedPatient {
  tenantId: string;
  patientId: string;
  linkageType: 'patient' | 'guardian';
  relationship?: string | null;
  displayName: string;
  status: string;
}

export interface PatientPortalPatientSummary {
  id: string;
  tenantId: string;
  preferredName: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  tags: string[];
  createdAt?: string | null;
}

export interface PatientPortalDocument {
  id: string;
  name: string;
  category: string;
  status: string;
  generatedAt?: string | null;
  releasedToPatient: boolean;
}

export interface PatientPortalInvoice {
  id: string;
  status: string;
  amountCents: number;
  dueDate?: string | null;
  paidAt?: string | null;
  description?: string | null;
  paymentLink?: string | null;
}

export interface PatientPortalMessage {
  id: string;
  senderLabel: string;
  isOwn: boolean;
  body: string;
  createdAt?: string | null;
}

export interface PatientPortalChat {
  threadId?: string | null;
  status: string;
  lastMessageAt?: string | null;
  messages: PatientPortalMessage[];
}

export interface PatientPortalNotification {
  id: string;
  title: string;
  body?: string | null;
  category?: string | null;
  status: 'unread' | 'read' | 'archived' | string;
  createdAt?: string | null;
}

export interface PatientPortalCheckin {
  id: string;
  title: string;
  status: 'scheduled' | 'sent' | 'completed' | 'overdue' | 'canceled' | string;
  channel?: string | null;
  dueDate?: string | null;
  questions: unknown[];
  responses: Record<string, unknown>;
  completedAt?: string | null;
}

export interface PatientPortalSnapshot {
  selectedPatientId: string;
  patients: PatientPortalLinkedPatient[];
  patient: PatientPortalPatientSummary;
  documents: PatientPortalDocument[];
  invoices: PatientPortalInvoice[];
  chat: PatientPortalChat;
  notifications: PatientPortalNotification[];
  checkins: PatientPortalCheckin[];
}

export type PatientOnboardingStep = 'profile' | 'goals' | 'routine' | 'reminders' | 'consent';

export interface PatientJourneyOnboarding {
  status: 'not_started' | 'in_progress' | 'completed' | string;
  currentStep: PatientOnboardingStep | string;
  completedSteps: string[];
  progressPercent: number;
  completedAt?: string | null;
  pendingReviewCount: number;
}

export interface PatientJourneyProfile {
  preferredName: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  status: string;
  editableFields: Record<string, string>;
  pendingReviews: Array<{
    id: string;
    status: string;
    createdAt?: string | null;
    fields: string[];
  }>;
}

export interface PatientJourneyProgram {
  id?: string | null;
  programId?: string | null;
  name?: string | null;
  programType?: string | null;
  objective?: string | null;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  currentWeek: number;
  totalWeeks: number;
  services: Array<{ label: string; quantity: number; unit: string }>;
  phases: Array<{ name: string; durationWeeks: number; description?: string | null }>;
}

export interface PatientJourneyGoals {
  source: string;
  waterGoalMl: number;
  mealsGoal: number;
  workoutsGoal: number;
  sleepGoalHours: number;
  programGoal?: string | null;
  checkinRequired: boolean;
  editableFields: Record<string, boolean>;
}

export interface PatientJourneyPlanItem {
  id: string;
  kind: 'checkin' | 'medication' | 'daily' | string;
  title: string;
  detail?: string | null;
  status: string;
  dueDate?: string | null;
  actionTab?: string | null;
}

export interface PatientMedicationReminder {
  id: string;
  title: string;
  medicationLabel?: string | null;
  dosage?: string | null;
  instructions?: string | null;
  scheduleTimes: string[];
  timezone: string;
  status: 'active' | 'paused' | 'archived' | string;
  patientEditable: boolean;
  externalNotificationConsent: boolean;
  notificationCopyMode: 'generic' | 'details' | string;
  startDate?: string | null;
  endDate?: string | null;
  source: string;
}

export interface PatientJourneyHistoryItem {
  id: string;
  kind: string;
  title: string;
  detail?: string | null;
  occurredAt?: string | null;
}

export interface PatientJourneySnapshot {
  selectedPatientId: string;
  onboarding: PatientJourneyOnboarding;
  profile: PatientJourneyProfile;
  program: PatientJourneyProgram;
  goals: PatientJourneyGoals;
  planToday: PatientJourneyPlanItem[];
  medicationReminders: PatientMedicationReminder[];
  history: PatientJourneyHistoryItem[];
}

export interface PatientOnboardingResult {
  patientId: string;
  status: string;
  currentStep?: string | null;
  completedSteps: string[];
  completedAt?: string | null;
}

const ONBOARDING_STEPS = new Set<PatientOnboardingStep>([
  'profile',
  'goals',
  'routine',
  'reminders',
  'consent',
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('')
    .trim()
    .slice(0, maxLength);
}

function asUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized
  )
    ? normalized
    : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function normalizeLinkedPatient(value: unknown): PatientPortalLinkedPatient | null {
  const record = asRecord(value);
  const patientId = asString(record.patientId);
  const tenantId = asString(record.tenantId);
  if (!patientId || !tenantId) return null;

  const linkageType =
    asString(record.linkageType, 'patient') === 'guardian' ? 'guardian' : 'patient';

  return {
    tenantId,
    patientId,
    linkageType,
    relationship: asNullableString(record.relationship),
    displayName: asString(record.displayName, 'Paciente'),
    status: asString(record.status, 'active'),
  };
}

function normalizePatient(value: unknown): PatientPortalPatientSummary {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    tenantId: asString(record.tenantId),
    preferredName: asString(record.preferredName, 'Paciente'),
    fullName: asNullableString(record.fullName),
    email: asNullableString(record.email),
    phone: asNullableString(record.phone),
    status: asString(record.status, 'active'),
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    createdAt: asNullableString(record.createdAt),
  };
}

function normalizeDocument(value: unknown): PatientPortalDocument | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    name: asString(record.name, 'Documento'),
    category: asString(record.category, 'documento'),
    status: asString(record.status, 'generated'),
    generatedAt: asNullableString(record.generatedAt),
    releasedToPatient: asBoolean(record.releasedToPatient, true),
  };
}

function normalizeInvoice(value: unknown): PatientPortalInvoice | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    status: asString(record.status, 'pending'),
    amountCents: asNumber(record.amountCents),
    dueDate: asNullableString(record.dueDate),
    paidAt: asNullableString(record.paidAt),
    description: asNullableString(record.description),
    paymentLink: asSafePaymentUrl(record.paymentLink),
  };
}

function normalizeMessage(value: unknown): PatientPortalMessage | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    senderLabel: asString(record.senderLabel, 'Mensagem'),
    isOwn: asBoolean(record.isOwn),
    body: asString(record.body),
    createdAt: asNullableString(record.createdAt),
  };
}

function normalizeNotification(value: unknown): PatientPortalNotification | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    title: asString(record.title, 'Notificacao'),
    body: asNullableString(record.body),
    category: asNullableString(record.category),
    status: asString(record.status, 'unread'),
    createdAt: asNullableString(record.createdAt),
  };
}

function normalizeCheckin(value: unknown): PatientPortalCheckin | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    title: asString(record.title, 'Check-in'),
    status: asString(record.status, 'scheduled'),
    channel: asNullableString(record.channel),
    dueDate: asNullableString(record.dueDate),
    questions: Array.isArray(record.questions) ? record.questions : [],
    responses: asRecord(record.responses),
    completedAt: asNullableString(record.completedAt),
  };
}

function normalizeSnapshot(value: unknown): PatientPortalSnapshot | null {
  const record = asRecord(value);
  const selectedPatientId = asString(record.selectedPatientId);
  const patients = Array.isArray(record.patients)
    ? record.patients
        .map(normalizeLinkedPatient)
        .filter((item): item is PatientPortalLinkedPatient => Boolean(item))
    : [];
  const patient = normalizePatient(record.patient);

  if (!selectedPatientId || patients.length === 0 || !patient.id) return null;

  const chatRecord = asRecord(record.chat);
  const messages = Array.isArray(chatRecord.messages)
    ? chatRecord.messages
        .map(normalizeMessage)
        .filter((item): item is PatientPortalMessage => Boolean(item))
    : [];

  return {
    selectedPatientId,
    patients,
    patient,
    documents: Array.isArray(record.documents)
      ? record.documents
          .map(normalizeDocument)
          .filter((item): item is PatientPortalDocument => Boolean(item))
      : [],
    invoices: Array.isArray(record.invoices)
      ? record.invoices
          .map(normalizeInvoice)
          .filter((item): item is PatientPortalInvoice => Boolean(item))
      : [],
    chat: {
      threadId: asNullableString(chatRecord.threadId),
      status: asString(chatRecord.status, 'open'),
      lastMessageAt: asNullableString(chatRecord.lastMessageAt),
      messages,
    },
    notifications: Array.isArray(record.notifications)
      ? record.notifications
          .map(normalizeNotification)
          .filter((item): item is PatientPortalNotification => Boolean(item))
      : [],
    checkins: Array.isArray(record.checkins)
      ? record.checkins
          .map(normalizeCheckin)
          .filter((item): item is PatientPortalCheckin => Boolean(item))
      : [],
  };
}

function normalizeStringArray(value: unknown, maxItems = 30): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(String(item ?? ''), 120))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  const normalized: Record<string, string> = {};
  Object.entries(asRecord(value))
    .slice(0, 20)
    .forEach(([key, nestedValue]) => {
      const safeKey = sanitizeText(key, 80);
      const safeValue = sanitizeText(String(nestedValue ?? ''), 80);
      if (safeKey && safeValue) normalized[safeKey] = safeValue;
    });
  return normalized;
}

function normalizeBooleanRecord(value: unknown): Record<string, boolean> {
  const normalized: Record<string, boolean> = {};
  Object.entries(asRecord(value))
    .slice(0, 20)
    .forEach(([key, nestedValue]) => {
      const safeKey = sanitizeText(key, 80);
      if (safeKey) normalized[safeKey] = nestedValue === true || nestedValue === 'true';
    });
  return normalized;
}

function normalizePendingReview(
  value: unknown
): PatientJourneyProfile['pendingReviews'][number] | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    status: asString(record.status, 'pending'),
    createdAt: asNullableString(record.createdAt),
    fields: normalizeStringArray(record.fields, 12),
  };
}

function normalizeJourneyProfile(value: unknown): PatientJourneyProfile {
  const record = asRecord(value);
  return {
    preferredName: asString(record.preferredName, 'Paciente'),
    fullName: asNullableString(record.fullName),
    email: asNullableString(record.email),
    phone: asNullableString(record.phone),
    birthDate: asNullableString(record.birthDate),
    status: asString(record.status, 'active'),
    editableFields: normalizeStringRecord(record.editableFields),
    pendingReviews: Array.isArray(record.pendingReviews)
      ? record.pendingReviews
          .map(normalizePendingReview)
          .filter((item): item is PatientJourneyProfile['pendingReviews'][number] => Boolean(item))
      : [],
  };
}

function normalizeProgramService(value: unknown): PatientJourneyProgram['services'][number] | null {
  const record = asRecord(value);
  const label = asString(record.label);
  if (!label) return null;
  return {
    label,
    quantity: asBoundedNumber(record.quantity, 0, 0, 999),
    unit: asString(record.unit),
  };
}

function normalizeProgramPhase(value: unknown): PatientJourneyProgram['phases'][number] | null {
  const record = asRecord(value);
  const name = asString(record.name);
  if (!name) return null;
  return {
    name,
    durationWeeks: Math.round(asBoundedNumber(record.durationWeeks, 0, 0, 520)),
    description: asNullableString(record.description),
  };
}

function normalizeJourneyProgram(value: unknown): PatientJourneyProgram {
  const record = asRecord(value);
  return {
    id: asNullableString(record.id),
    programId: asNullableString(record.programId),
    name: asNullableString(record.name),
    programType: asNullableString(record.programType),
    objective: asNullableString(record.objective),
    status: asString(record.status, 'not_enrolled'),
    startDate: asNullableString(record.startDate),
    endDate: asNullableString(record.endDate),
    currentWeek: Math.round(asBoundedNumber(record.currentWeek, 0, 0, 520)),
    totalWeeks: Math.round(asBoundedNumber(record.totalWeeks, 0, 0, 520)),
    services: Array.isArray(record.services)
      ? record.services
          .map(normalizeProgramService)
          .filter((item): item is PatientJourneyProgram['services'][number] => Boolean(item))
      : [],
    phases: Array.isArray(record.phases)
      ? record.phases
          .map(normalizeProgramPhase)
          .filter((item): item is PatientJourneyProgram['phases'][number] => Boolean(item))
      : [],
  };
}

function normalizeJourneyGoals(value: unknown): PatientJourneyGoals {
  const record = asRecord(value);
  return {
    source: asString(record.source, 'fallback'),
    waterGoalMl: Math.round(asBoundedNumber(record.waterGoalMl, 2000, 250, 10000)),
    mealsGoal: Math.round(asBoundedNumber(record.mealsGoal, 4, 1, 12)),
    workoutsGoal: Math.round(asBoundedNumber(record.workoutsGoal, 1, 0, 4)),
    sleepGoalHours: asBoundedNumber(record.sleepGoalHours, 8, 0, 24),
    programGoal: asNullableString(record.programGoal),
    checkinRequired: asBoolean(record.checkinRequired, true),
    editableFields: normalizeBooleanRecord(record.editableFields),
  };
}

function normalizePlanItem(value: unknown): PatientJourneyPlanItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    kind: asString(record.kind, 'daily'),
    title: asString(record.title, 'Acao do plano'),
    detail: asNullableString(record.detail),
    status: asString(record.status, 'open'),
    dueDate: asNullableString(record.dueDate),
    actionTab: asNullableString(record.actionTab),
  };
}

function normalizeMedicationReminder(value: unknown): PatientMedicationReminder | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    title: asString(record.title, 'Lembrete do tratamento'),
    medicationLabel: asNullableString(record.medicationLabel),
    dosage: asNullableString(record.dosage),
    instructions: asNullableString(record.instructions),
    scheduleTimes: normalizeStringArray(record.scheduleTimes, 12),
    timezone: asString(record.timezone, 'America/Sao_Paulo'),
    status: asString(record.status, 'active'),
    patientEditable: asBoolean(record.patientEditable, true),
    externalNotificationConsent: asBoolean(record.externalNotificationConsent),
    notificationCopyMode: asString(record.notificationCopyMode, 'generic'),
    startDate: asNullableString(record.startDate),
    endDate: asNullableString(record.endDate),
    source: asString(record.source, 'patient_portal'),
  };
}

function normalizeHistoryItem(value: unknown): PatientJourneyHistoryItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    kind: asString(record.kind, 'event'),
    title: asString(record.title, 'Evento'),
    detail: asNullableString(record.detail),
    occurredAt: asNullableString(record.occurredAt),
  };
}

function normalizeJourneySnapshot(value: unknown): PatientJourneySnapshot | null {
  const record = asRecord(value);
  const selectedPatientId = asString(record.selectedPatientId);
  if (!selectedPatientId) return null;

  const onboardingRecord = asRecord(record.onboarding);
  return {
    selectedPatientId,
    onboarding: {
      status: asString(onboardingRecord.status, 'not_started'),
      currentStep: asString(onboardingRecord.currentStep, 'profile'),
      completedSteps: normalizeStringArray(onboardingRecord.completedSteps, 10),
      progressPercent: Math.round(asBoundedNumber(onboardingRecord.progressPercent, 0, 0, 100)),
      completedAt: asNullableString(onboardingRecord.completedAt),
      pendingReviewCount: Math.round(
        asBoundedNumber(onboardingRecord.pendingReviewCount, 0, 0, 99)
      ),
    },
    profile: normalizeJourneyProfile(record.profile),
    program: normalizeJourneyProgram(record.program),
    goals: normalizeJourneyGoals(record.goals),
    planToday: Array.isArray(record.planToday)
      ? record.planToday
          .map(normalizePlanItem)
          .filter((item): item is PatientJourneyPlanItem => Boolean(item))
      : [],
    medicationReminders: Array.isArray(record.medicationReminders)
      ? record.medicationReminders
          .map(normalizeMedicationReminder)
          .filter((item): item is PatientMedicationReminder => Boolean(item))
      : [],
    history: Array.isArray(record.history)
      ? record.history
          .map(normalizeHistoryItem)
          .filter((item): item is PatientJourneyHistoryItem => Boolean(item))
      : [],
  };
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  const record = asRecord(error);
  return {
    message: fallback,
    code: asNullableString(record.code) ?? undefined,
  };
}

function sanitizeResponseValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return sanitizeText(value, depth === 0 ? 4000 : 1000);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value) && depth < 2) {
    return value
      .slice(0, 25)
      .map((item) => sanitizeResponseValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && depth < 2) {
    const nested: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>)
      .slice(0, 20)
      .forEach(([key, nestedValue]) => {
        const safeKey = sanitizeText(key, 80);
        const safeValue = sanitizeResponseValue(nestedValue, depth + 1);
        if (safeKey && safeValue !== undefined) nested[safeKey] = safeValue;
      });
    return nested;
  }
  return undefined;
}

function normalizeCheckinResponses(responses: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  Object.entries(asRecord(responses))
    .slice(0, 50)
    .forEach(([key, value]) => {
      const safeKey = sanitizeText(key, 80);
      const safeValue = sanitizeResponseValue(value);
      if (safeKey && safeValue !== undefined) normalized[safeKey] = safeValue;
    });
  return normalized;
}

function normalizeJourneyPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return asRecord(sanitizeResponseValue(payload));
}

function normalizeOnboardingResult(value: unknown): PatientOnboardingResult | null {
  const record = asRecord(value);
  const patientId = asString(record.patientId);
  if (!patientId) return null;
  return {
    patientId,
    status: asString(record.status, 'in_progress'),
    currentStep: asNullableString(record.currentStep),
    completedSteps: normalizeStringArray(record.completedSteps, 10),
    completedAt: asNullableString(record.completedAt),
  };
}

export async function getPatientPortalSnapshot(patientId?: string): Promise<{
  data: PatientPortalSnapshot | null;
  error: SafeServiceError | null;
}> {
  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_portal_snapshot', {
      p_patient_id: asUuid(patientId) ?? null,
    });
    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel carregar o portal.') };
    }

    const snapshot = normalizeSnapshot(data);
    if (!snapshot) {
      return {
        data: null,
        error: { message: 'Contrato invalido do portal do paciente.', code: 'invalid_contract' },
      };
    }

    return { data: snapshot, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel carregar o portal.') };
  }
}

export async function getPatientJourneySnapshot(patientId?: string): Promise<{
  data: PatientJourneySnapshot | null;
  error: SafeServiceError | null;
}> {
  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_journey_snapshot', {
      p_patient_id: asUuid(patientId) ?? null,
    });
    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel carregar a jornada.') };
    }

    const journey = normalizeJourneySnapshot(data);
    if (!journey) {
      return {
        data: null,
        error: { message: 'Contrato invalido da jornada do paciente.', code: 'invalid_contract' },
      };
    }

    return { data: journey, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel carregar a jornada.') };
  }
}

export async function completePatientOnboarding(
  patientId: string | undefined,
  step: PatientOnboardingStep,
  payload: Record<string, unknown>,
  finish = false
): Promise<{ data: PatientOnboardingResult | null; error: SafeServiceError | null }> {
  if (!ONBOARDING_STEPS.has(step)) {
    return {
      data: null,
      error: { message: 'Etapa de onboarding invalida.', code: 'invalid_input' },
    };
  }

  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('complete_patient_onboarding', {
      p_patient_id: asUuid(patientId) ?? null,
      p_step: step,
      p_payload: normalizeJourneyPayload(payload),
      p_finish: finish,
    });
    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel salvar a etapa.') };
    }

    const result = normalizeOnboardingResult(data);
    return {
      data: result,
      error: result ? null : { message: 'Contrato de onboarding indisponivel.' },
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel salvar a etapa.') };
  }
}

export async function sendPatientPortalMessage(
  patientId: string,
  body: string
): Promise<{
  data: { id: string; threadId: string } | null;
  error: SafeServiceError | null;
}> {
  const safePatientId = asUuid(patientId);
  const safeBody = sanitizeText(body, 2000);
  if (!safePatientId || !safeBody) {
    return {
      data: null,
      error: { message: 'Informe uma mensagem valida para enviar ao time.', code: 'invalid_input' },
    };
  }

  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('send_patient_portal_message', {
      p_patient_id: safePatientId,
      p_body: safeBody,
    });
    if (error) return { data: null, error: safeError(error, 'Nao foi possivel enviar mensagem.') };

    const record = asRecord(data);
    return {
      data: { id: asString(record.id), threadId: asString(record.threadId) },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel enviar mensagem.') };
  }
}

export async function submitPatientPortalCheckin(
  checkinId: string,
  responses: Record<string, unknown>
): Promise<{ data: { id: string; status: string } | null; error: SafeServiceError | null }> {
  const safeCheckinId = asUuid(checkinId);
  if (!safeCheckinId) {
    return {
      data: null,
      error: { message: 'Check-in invalido para envio.', code: 'invalid_input' },
    };
  }

  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('submit_patient_portal_checkin', {
      p_checkin_id: safeCheckinId,
      p_responses: normalizeCheckinResponses(responses),
    });
    if (error)
      return { data: null, error: safeError(error, 'Nao foi possivel concluir check-in.') };

    const record = asRecord(data);
    return { data: { id: asString(record.id), status: asString(record.status) }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel concluir check-in.') };
  }
}

export async function markPatientPortalNotificationRead(
  notificationId: string
): Promise<{ data: { id: string; status: string } | null; error: SafeServiceError | null }> {
  const safeNotificationId = asUuid(notificationId);
  if (!safeNotificationId) {
    return {
      data: null,
      error: { message: 'Notificacao invalida para atualizacao.', code: 'invalid_input' },
    };
  }

  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('mark_patient_portal_notification_read', {
      p_notification_id: safeNotificationId,
    });
    if (error)
      return { data: null, error: safeError(error, 'Nao foi possivel atualizar notificacao.') };

    const record = asRecord(data);
    return { data: { id: asString(record.id), status: asString(record.status) }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel atualizar notificacao.') };
  }
}
