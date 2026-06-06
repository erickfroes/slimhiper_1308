import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { PatientPortalCheckin, PatientPortalSnapshot } from '@/services/patientPortalApi';

export interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

export type PatientDailyAction = 'water' | 'meal' | 'workout' | 'checkin' | 'message';
export type PatientDailyEntryKind = Exclude<PatientDailyAction, 'message'>;
export type PatientDailyEntryStatus = 'pending' | 'failed' | 'derived' | 'synced';
export type PatientDailyHabitStatus = 'done' | 'partial' | 'pending' | 'empty' | 'not_configured';

export interface PatientDailyEntry {
  id: string;
  kind: PatientDailyEntryKind;
  title: string;
  detail: string;
  occurredAt: string;
  status: PatientDailyEntryStatus;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface PatientDailyHabit {
  kind: PatientDailyEntryKind;
  label: string;
  value: string;
  target: string;
  helper: string;
  status: PatientDailyHabitStatus;
  progressPercent: number;
}

export interface PatientDailyWeekDay {
  isoDate: string;
  label: string;
  status: 'done' | 'partial' | 'empty' | 'today';
  progressPercent?: number;
}

export interface PatientDailySnapshot {
  selectedPatientId?: string;
  dateIso: string;
  dateLabel: string;
  programStatus: string;
  progressPercent: number;
  streakDays: number;
  waterMl: number;
  waterGoalMl: number;
  mealsCount: number;
  mealsGoal: number;
  workoutsCount: number;
  workoutsGoal: number;
  checkinRequired: boolean;
  checkinDone: boolean;
  pendingProgramCheckins: PatientPortalCheckin[];
  habits: PatientDailyHabit[];
  week: PatientDailyWeekDay[];
  timeline: PatientDailyEntry[];
  backendStatus: 'local_only' | 'synced';
}

interface CreateDailyEntryInput {
  amountMl?: number;
  mealType?: string;
  notes?: string;
  photoName?: string;
  workoutTitle?: string;
  durationMinutes?: number;
  intensity?: string;
  mood?: number;
  energy?: number;
  symptoms?: string;
}

export interface RecordPatientDailyMealInput {
  mealType?: string;
  notes?: string;
  photoFile?: File | null;
}

export interface RecordPatientDailyWorkoutInput {
  workoutTitle?: string;
  durationMinutes?: number;
  intensity?: string;
  notes?: string;
}

export interface RecordPatientDailyCheckinInput {
  mood: number;
  energy: number;
  symptoms?: string;
}

export interface PatientDailyMutationResult {
  entry: PatientDailyEntry;
}

type ServiceEnvelope<T> = Promise<{ data: T | null; error: SafeServiceError | null }>;

const DAILY_ACTIONS = new Set<PatientDailyAction>([
  'water',
  'meal',
  'workout',
  'checkin',
  'message',
]);
const ENTRY_KINDS = new Set<PatientDailyEntryKind>(['water', 'meal', 'workout', 'checkin']);
const ENTRY_STATUSES = new Set<PatientDailyEntryStatus>(['pending', 'failed', 'derived', 'synced']);
const HABIT_STATUSES = new Set<PatientDailyHabitStatus>([
  'done',
  'partial',
  'pending',
  'empty',
  'not_configured',
]);
const WEEK_STATUSES = new Set<PatientDailyWeekDay['status']>(['done', 'partial', 'empty', 'today']);
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const SAFE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameLocalDay(value?: string | null, day = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return toIsoDate(date) === toIsoDate(day);
}

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? sanitizeText(value, 1000) : fallback;
}

function asNullableString(value: unknown) {
  const text = asString(value);
  return text || null;
}

function asNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function asUuid(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return SAFE_UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  const record = asRecord(error);
  return {
    message: fallback,
    code: asNullableString(record.code) ?? undefined,
    details: asNullableString(record.details) ?? undefined,
  };
}

function createLocalId(kind: PatientDailyEntryKind) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `local-${kind}-${crypto.randomUUID()}`;
  }
  return `local-${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', '');
}

function getHabitStatus(current: number, target: number): PatientDailyHabitStatus {
  if (current <= 0) return 'empty';
  if (current >= target) return 'done';
  return 'partial';
}

function getPendingProgramCheckins(checkins: PatientPortalCheckin[]) {
  return checkins
    .filter((checkin) => checkin.status !== 'completed' && checkin.status !== 'canceled')
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
}

function getCompletedProgramCheckinsToday(checkins: PatientPortalCheckin[], today: Date) {
  return checkins.filter(
    (checkin) => checkin.status === 'completed' && isSameLocalDay(checkin.completedAt, today)
  );
}

function getConsecutiveDays(completedDates: Set<string>, today: Date) {
  let count = 0;
  const cursor = startOfLocalDay(today);

  while (completedDates.has(toIsoDate(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return count;
}

function buildWeek(completedDates: Set<string>, today: Date, progressPercent: number) {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = startOfLocalDay(today);
    date.setDate(date.getDate() - (6 - index));
    const isoDate = toIsoDate(date);
    const isToday = isoDate === toIsoDate(today);
    const done = completedDates.has(isoDate);

    return {
      isoDate,
      label: formatWeekday(date),
      status: done
        ? 'done'
        : isToday && progressPercent > 0
          ? 'partial'
          : isToday
            ? 'today'
            : 'empty',
      progressPercent: done ? 100 : isToday ? progressPercent : 0,
    } satisfies PatientDailyWeekDay;
  });
}

function normalizeEntryMetadata(value: unknown) {
  const metadata: Record<string, string | number | boolean | null> = {};
  Object.entries(asRecord(value))
    .slice(0, 20)
    .forEach(([key, nestedValue]) => {
      const safeKey = sanitizeText(key, 80);
      if (!safeKey) return;

      if (typeof nestedValue === 'string') {
        metadata[safeKey] = sanitizeText(nestedValue, 500);
      } else if (typeof nestedValue === 'number' && Number.isFinite(nestedValue)) {
        metadata[safeKey] = nestedValue;
      } else if (typeof nestedValue === 'boolean' || nestedValue === null) {
        metadata[safeKey] = nestedValue;
      }
    });
  return metadata;
}

function normalizeEntry(value: unknown): PatientDailyEntry | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const kind = asString(record.kind);
  if (!id || !ENTRY_KINDS.has(kind as PatientDailyEntryKind)) return null;

  const status = asString(record.status, 'synced');
  return {
    id,
    kind: kind as PatientDailyEntryKind,
    title: asString(record.title, 'Registro'),
    detail: asString(record.detail, ''),
    occurredAt: asString(record.occurredAt, new Date().toISOString()),
    status: ENTRY_STATUSES.has(status as PatientDailyEntryStatus)
      ? (status as PatientDailyEntryStatus)
      : 'synced',
    metadata: normalizeEntryMetadata(record.metadata),
  };
}

function normalizeHabit(value: unknown): PatientDailyHabit | null {
  const record = asRecord(value);
  const kind = asString(record.kind);
  if (!ENTRY_KINDS.has(kind as PatientDailyEntryKind)) return null;

  const status = asString(record.status, 'empty');
  return {
    kind: kind as PatientDailyEntryKind,
    label: asString(record.label, 'Meta'),
    value: asString(record.value, '0'),
    target: asString(record.target, ''),
    helper: asString(record.helper, ''),
    status: HABIT_STATUSES.has(status as PatientDailyHabitStatus)
      ? (status as PatientDailyHabitStatus)
      : 'empty',
    progressPercent: Math.round(clamp(asNumber(record.progressPercent, 0), 0, 100)),
  };
}

function normalizeWeekDay(value: unknown): PatientDailyWeekDay | null {
  const record = asRecord(value);
  const isoDate = asString(record.isoDate);
  const label = asString(record.label);
  const status = asString(record.status, 'empty');
  if (!isoDate || !label || !WEEK_STATUSES.has(status as PatientDailyWeekDay['status'])) {
    return null;
  }

  return {
    isoDate,
    label,
    status: status as PatientDailyWeekDay['status'],
    progressPercent: Math.round(clamp(asNumber(record.progressPercent, 0), 0, 100)),
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
    questions: Array.isArray(record.questions) ? record.questions.slice(0, 50) : [],
    responses: asRecord(record.responses),
    completedAt: asNullableString(record.completedAt),
  };
}

function normalizeSnapshot(value: unknown): PatientDailySnapshot | null {
  const record = asRecord(value);
  const dateIso = asString(record.dateIso);
  if (!dateIso) return null;

  const habits = Array.isArray(record.habits)
    ? record.habits.map(normalizeHabit).filter((item): item is PatientDailyHabit => Boolean(item))
    : [];
  const week = Array.isArray(record.week)
    ? record.week.map(normalizeWeekDay).filter((item): item is PatientDailyWeekDay => Boolean(item))
    : [];
  const timeline = Array.isArray(record.timeline)
    ? record.timeline
        .map(normalizeEntry)
        .filter((item): item is PatientDailyEntry => Boolean(item))
        .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    : [];
  const pendingProgramCheckins = Array.isArray(record.pendingProgramCheckins)
    ? record.pendingProgramCheckins
        .map(normalizeCheckin)
        .filter((item): item is PatientPortalCheckin => Boolean(item))
    : [];

  return {
    selectedPatientId: asNullableString(record.selectedPatientId) ?? undefined,
    dateIso,
    dateLabel: asString(record.dateLabel, dateIso),
    programStatus: asString(record.programStatus, 'active'),
    progressPercent: Math.round(clamp(asNumber(record.progressPercent, 0), 0, 100)),
    streakDays: Math.max(0, Math.round(asNumber(record.streakDays, 0))),
    waterMl: Math.max(0, Math.round(asNumber(record.waterMl, 0))),
    waterGoalMl: Math.max(1, Math.round(asNumber(record.waterGoalMl, 2000))),
    mealsCount: Math.max(0, Math.round(asNumber(record.mealsCount, 0))),
    mealsGoal: Math.max(1, Math.round(asNumber(record.mealsGoal, 4))),
    workoutsCount: Math.max(0, Math.round(asNumber(record.workoutsCount, 0))),
    workoutsGoal: Math.max(0, Math.round(asNumber(record.workoutsGoal, 1))),
    checkinRequired: asBoolean(record.checkinRequired, true),
    checkinDone: asBoolean(record.checkinDone, false),
    pendingProgramCheckins,
    habits,
    week,
    timeline,
    backendStatus: 'synced',
  };
}

function normalizeMutationResult(value: unknown): PatientDailyMutationResult | null {
  const entry = normalizeEntry(asRecord(value).entry);
  return entry ? { entry } : null;
}

function getValidPhoto(file?: File | null): { file: File | null; error: SafeServiceError | null } {
  if (!file) return { file: null, error: null };
  if (!file.type.startsWith('image/')) {
    return { file: null, error: { message: 'A foto precisa ser uma imagem.' } };
  }
  if (file.size <= 0 || file.size > PHOTO_MAX_BYTES) {
    return { file: null, error: { message: 'A foto precisa ter ate 5 MB.' } };
  }
  return { file, error: null };
}

export function isPatientDailyAction(value: unknown): value is PatientDailyAction {
  return typeof value === 'string' && DAILY_ACTIONS.has(value as PatientDailyAction);
}

export function createPatientDailyLocalEntry(
  kind: PatientDailyEntryKind,
  input: CreateDailyEntryInput = {}
): PatientDailyEntry {
  const occurredAt = new Date().toISOString();

  if (kind === 'water') {
    const amountMl = Math.round(clamp(Number(input.amountMl ?? 250), 50, 3000));
    return {
      id: createLocalId(kind),
      kind,
      title: 'Agua',
      detail: `${amountMl} ml registrados`,
      occurredAt,
      status: 'pending',
      metadata: { amountMl },
    };
  }

  if (kind === 'meal') {
    const mealType = sanitizeText(input.mealType, 40);
    const notes = sanitizeText(input.notes, 180);
    const photoName = sanitizeText(input.photoName, 120);
    return {
      id: createLocalId(kind),
      kind,
      title: mealType ? `Refeicao - ${mealType}` : 'Refeicao',
      detail: [notes || 'Registro rapido', photoName ? 'foto anexada' : null]
        .filter(Boolean)
        .join(' - '),
      occurredAt,
      status: 'pending',
      metadata: { mealType: mealType || null, notes: notes || null, hasPhoto: Boolean(photoName) },
    };
  }

  if (kind === 'workout') {
    const workoutTitle = sanitizeText(input.workoutTitle, 80) || 'Treino registrado';
    const durationMinutes = Math.round(clamp(Number(input.durationMinutes ?? 30), 1, 360));
    const intensity = sanitizeText(input.intensity, 40);
    return {
      id: createLocalId(kind),
      kind,
      title: workoutTitle,
      detail: `${durationMinutes} min${intensity ? ` - ${intensity}` : ''}`,
      occurredAt,
      status: 'pending',
      metadata: { workoutTitle, durationMinutes, intensity: intensity || null },
    };
  }

  const mood = Math.round(clamp(Number(input.mood ?? 3), 1, 5));
  const energy = Math.round(clamp(Number(input.energy ?? 3), 1, 5));
  const symptoms = sanitizeText(input.symptoms, 180);
  return {
    id: createLocalId(kind),
    kind,
    title: 'Check-in diario',
    detail: `Humor ${mood}/5 - energia ${energy}/5${symptoms ? ` - ${symptoms}` : ''}`,
    occurredAt,
    status: 'pending',
    metadata: { mood, energy, symptoms: symptoms || null },
  };
}

export function buildPatientDailySnapshot(
  portalSnapshot: PatientPortalSnapshot,
  localEntries: PatientDailyEntry[]
): PatientDailySnapshot {
  const today = new Date();
  const dateIso = toIsoDate(today);
  const waterGoalMl = 2000;
  const mealsGoal = 4;
  const workoutsGoal = 1;
  const dayEntries = localEntries.filter((entry) => isSameLocalDay(entry.occurredAt, today));
  const pendingProgramCheckins = getPendingProgramCheckins(portalSnapshot.checkins);
  const completedProgramCheckinsToday = getCompletedProgramCheckinsToday(
    portalSnapshot.checkins,
    today
  );

  const waterMl = dayEntries
    .filter((entry) => entry.kind === 'water' && entry.status !== 'failed')
    .reduce((total, entry) => total + Number(entry.metadata?.amountMl ?? 0), 0);
  const mealsCount = dayEntries.filter(
    (entry) => entry.kind === 'meal' && entry.status !== 'failed'
  ).length;
  const workoutsCount = dayEntries.filter(
    (entry) => entry.kind === 'workout' && entry.status !== 'failed'
  ).length;
  const localCheckinDone = dayEntries.some(
    (entry) => entry.kind === 'checkin' && entry.status !== 'failed'
  );
  const checkinRequired = pendingProgramCheckins.length > 0 || portalSnapshot.checkins.length > 0;
  const checkinDone = localCheckinDone || completedProgramCheckinsToday.length > 0;
  const checkinWeight = checkinRequired ? 20 : 0;
  const totalWeight = 35 + 25 + 20 + checkinWeight;
  const progressPercent = Math.round(
    ((Math.min(waterMl / waterGoalMl, 1) * 35 +
      Math.min(mealsCount / mealsGoal, 1) * 25 +
      Math.min(workoutsCount / workoutsGoal, 1) * 20 +
      (checkinRequired && checkinDone ? checkinWeight : 0)) /
      totalWeight) *
      100
  );

  const completedDates = new Set<string>();
  dayEntries.forEach((entry) => {
    if (
      entry.status !== 'failed' &&
      (entry.kind === 'checkin' || entry.kind === 'water' || entry.kind === 'meal')
    ) {
      completedDates.add(toIsoDate(new Date(entry.occurredAt)));
    }
  });
  portalSnapshot.checkins.forEach((checkin) => {
    if (checkin.status === 'completed' && checkin.completedAt) {
      const date = new Date(checkin.completedAt);
      if (!Number.isNaN(date.getTime())) completedDates.add(toIsoDate(date));
    }
  });

  const derivedTimeline: PatientDailyEntry[] = [
    ...completedProgramCheckinsToday.map((checkin) => ({
      id: `derived-checkin-${checkin.id}`,
      kind: 'checkin' as const,
      title: checkin.title,
      detail: 'Check-in do programa enviado',
      occurredAt: checkin.completedAt ?? new Date().toISOString(),
      status: 'derived' as const,
      metadata: { source: 'program_checkin' },
    })),
    ...pendingProgramCheckins
      .filter((checkin) => isSameLocalDay(checkin.dueDate, today))
      .map((checkin) => ({
        id: `derived-pending-${checkin.id}`,
        kind: 'checkin' as const,
        title: checkin.title,
        detail: 'Pendente para hoje',
        occurredAt: checkin.dueDate ?? new Date().toISOString(),
        status: 'derived' as const,
        metadata: { source: 'pending_program_checkin' },
      })),
  ];

  return {
    selectedPatientId: portalSnapshot.selectedPatientId,
    dateIso,
    dateLabel: formatDateLabel(today),
    programStatus: portalSnapshot.patient.status,
    progressPercent,
    streakDays: getConsecutiveDays(completedDates, today),
    waterMl,
    waterGoalMl,
    mealsCount,
    mealsGoal,
    workoutsCount,
    workoutsGoal,
    checkinRequired,
    checkinDone,
    pendingProgramCheckins,
    habits: [
      {
        kind: 'water',
        label: 'Agua',
        value: `${waterMl} ml`,
        target: `${waterGoalMl} ml`,
        helper: waterMl >= waterGoalMl ? 'Meta do dia concluida' : 'Some em um toque quando beber.',
        status: getHabitStatus(waterMl, waterGoalMl),
        progressPercent: Math.min(100, Math.round((waterMl / waterGoalMl) * 100)),
      },
      {
        kind: 'meal',
        label: 'Refeicoes',
        value: String(mealsCount),
        target: `${mealsGoal} registros`,
        helper: mealsCount > 0 ? 'Registros aguardando sincronizacao.' : 'Foto opcional no mobile.',
        status: getHabitStatus(mealsCount, mealsGoal),
        progressPercent: Math.min(100, Math.round((mealsCount / mealsGoal) * 100)),
      },
      {
        kind: 'workout',
        label: 'Treino',
        value: String(workoutsCount),
        target: `${workoutsGoal} treino`,
        helper: workoutsCount > 0 ? 'Treino informado hoje.' : 'Registre ou repita o ultimo.',
        status: getHabitStatus(workoutsCount, workoutsGoal),
        progressPercent: Math.min(100, Math.round((workoutsCount / workoutsGoal) * 100)),
      },
      {
        kind: 'checkin',
        label: 'Check-in',
        value: checkinDone ? 'feito' : checkinRequired ? 'pendente' : 'sem agenda',
        target: checkinRequired ? '1 resposta' : 'nao configurado',
        helper: checkinRequired
          ? 'Use a escala e, se preciso, responda o check-in do programa.'
          : 'Nenhum check-in do programa foi configurado para este vinculo.',
        status: checkinRequired ? (checkinDone ? 'done' : 'pending') : 'not_configured',
        progressPercent: checkinRequired ? (checkinDone ? 100 : 0) : 0,
      },
    ],
    week: buildWeek(completedDates, today, progressPercent),
    timeline: [...dayEntries, ...derivedTimeline].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
    ),
    backendStatus: 'local_only',
  };
}

export async function getPatientDailySnapshot(
  patientId?: string,
  targetDate?: string
): ServiceEnvelope<PatientDailySnapshot> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_daily_snapshot', {
      p_patient_id: asUuid(patientId) ?? null,
      p_target_date: targetDate ?? null,
    });
    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel carregar o diario.') };
    }

    const snapshot = normalizeSnapshot(data);
    if (!snapshot) {
      return {
        data: null,
        error: { message: 'Contrato do diario indisponivel.' },
      };
    }

    return { data: snapshot, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel carregar o diario.') };
  }
}

export async function recordPatientDailyWater(
  patientId: string | undefined,
  amountMl: number
): ServiceEnvelope<PatientDailyMutationResult> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('record_patient_water_entry', {
      p_patient_id: asUuid(patientId) ?? null,
      p_amount_ml: Math.round(clamp(Number(amountMl), 1, 5000)),
      p_occurred_at: new Date().toISOString(),
    });
    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel registrar agua.') };
    }

    return {
      data: normalizeMutationResult(data),
      error: normalizeMutationResult(data) ? null : { message: 'Contrato de agua indisponivel.' },
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel registrar agua.') };
  }
}

export async function recordPatientDailyMeal(
  patientId: string | undefined,
  input: RecordPatientDailyMealInput
): ServiceEnvelope<PatientDailyMutationResult> {
  const { file, error: photoError } = getValidPhoto(input.photoFile);
  if (photoError) return { data: null, error: photoError };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('record_patient_meal_entry', {
      p_patient_id: asUuid(patientId) ?? null,
      p_meal_type: sanitizeText(input.mealType, 40) || null,
      p_notes: sanitizeText(input.notes, 500) || null,
      p_photo_file_name: file?.name ?? null,
      p_photo_mime_type: file?.type ?? null,
      p_photo_size_bytes: file?.size ?? null,
      p_occurred_at: new Date().toISOString(),
    });
    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel registrar refeicao.') };
    }

    const mutation = normalizeMutationResult(data);
    if (!mutation) {
      return { data: null, error: { message: 'Contrato de refeicao indisponivel.' } };
    }

    const uploadRecord = asRecord(asRecord(data).photoUpload);
    const bucket = asString(uploadRecord.bucket);
    const path = asString(uploadRecord.path);
    if (!file || !bucket || !path) return { data: mutation, error: null };

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      await supabase.rpc('confirm_patient_meal_photo', {
        p_meal_entry_id: mutation.entry.id,
        p_upload_status: 'failed',
      });
      return {
        data: null,
        error: safeError(uploadError, 'A refeicao foi salva, mas a foto nao foi enviada.'),
      };
    }

    const confirmResult = await supabase.rpc('confirm_patient_meal_photo', {
      p_meal_entry_id: mutation.entry.id,
      p_upload_status: 'uploaded',
    });
    if (confirmResult.error) {
      return {
        data: null,
        error: safeError(confirmResult.error, 'A foto foi enviada, mas nao foi confirmada.'),
      };
    }

    return {
      data: normalizeMutationResult(confirmResult.data) ?? mutation,
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel registrar refeicao.') };
  }
}

export async function recordPatientDailyWorkout(
  patientId: string | undefined,
  input: RecordPatientDailyWorkoutInput
): ServiceEnvelope<PatientDailyMutationResult> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('record_patient_workout_entry', {
      p_patient_id: asUuid(patientId) ?? null,
      p_workout_title: sanitizeText(input.workoutTitle, 80) || 'Treino registrado',
      p_duration_minutes:
        input.durationMinutes == null
          ? null
          : Math.round(clamp(Number(input.durationMinutes), 1, 360)),
      p_intensity: sanitizeText(input.intensity, 20) || null,
      p_notes: sanitizeText(input.notes, 500) || null,
      p_occurred_at: new Date().toISOString(),
    });
    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel registrar treino.') };
    }

    return {
      data: normalizeMutationResult(data),
      error: normalizeMutationResult(data) ? null : { message: 'Contrato de treino indisponivel.' },
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel registrar treino.') };
  }
}

export async function recordPatientDailyCheckin(
  patientId: string | undefined,
  input: RecordPatientDailyCheckinInput
): ServiceEnvelope<PatientDailyMutationResult> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('record_patient_daily_checkin', {
      p_patient_id: asUuid(patientId) ?? null,
      p_mood_score: Math.round(clamp(Number(input.mood), 1, 5)),
      p_energy_score: Math.round(clamp(Number(input.energy), 1, 5)),
      p_symptoms: sanitizeText(input.symptoms, 500) || null,
      p_occurred_at: new Date().toISOString(),
    });
    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel enviar check-in.') };
    }

    return {
      data: normalizeMutationResult(data),
      error: normalizeMutationResult(data)
        ? null
        : { message: 'Contrato de check-in indisponivel.' },
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel enviar check-in.') };
  }
}
