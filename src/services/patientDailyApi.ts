import type { PatientPortalCheckin, PatientPortalSnapshot } from '@/services/patientPortalApi';

export type PatientDailyAction = 'water' | 'meal' | 'workout' | 'checkin' | 'message';
export type PatientDailyEntryKind = Exclude<PatientDailyAction, 'message'>;
export type PatientDailyEntryStatus = 'pending' | 'failed' | 'derived';
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
}

export interface PatientDailySnapshot {
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
  backendStatus: 'local_only';
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

const DAILY_ACTIONS = new Set<PatientDailyAction>([
  'water',
  'meal',
  'workout',
  'checkin',
  'message',
]);

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
    } satisfies PatientDailyWeekDay;
  });
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
      detail: [notes || 'Registro rapido', photoName ? 'foto anexada localmente' : null]
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
    .filter((entry) => entry.kind === 'water')
    .reduce((total, entry) => total + Number(entry.metadata?.amountMl ?? 0), 0);
  const mealsCount = dayEntries.filter((entry) => entry.kind === 'meal').length;
  const workoutsCount = dayEntries.filter((entry) => entry.kind === 'workout').length;
  const localCheckinDone = dayEntries.some((entry) => entry.kind === 'checkin');
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
    if (entry.kind === 'checkin' || entry.kind === 'water' || entry.kind === 'meal') {
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
