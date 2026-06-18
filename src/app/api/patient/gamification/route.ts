import { NextResponse } from 'next/server';
import {
  createObservabilityContext,
  logObservedEvent,
  observedHeaders,
} from '@/lib/observability/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import {
  buildPatientGamificationState,
  type GamificationPortalTab,
  type GamificationSummary,
} from '@/services/patientGamificationEngine';
import type {
  PatientDailyEntry,
  PatientDailyWeekDay,
  PatientDailyHabit,
  PatientDailySnapshot,
} from '@/services/patientDailyApi';
import type {
  PatientJourneySnapshot,
  PatientPortalCheckin,
  PatientPortalChat,
  PatientPortalDocument,
  PatientPortalInvoice,
  PatientPortalLinkedPatient,
  PatientPortalMessage,
  PatientPortalNotification,
  PatientPortalPatientSummary,
  PatientPortalSnapshot,
} from '@/services/patientPortalApi';

type JsonRecord = Record<string, unknown>;
type ServerSupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type GamificationTabShortcut = {
  id: GamificationPortalTab;
  label: string;
};

const SAFE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FALLBACK_TAB_LABELS: Record<GamificationPortalTab, string> = {
  resumo: 'Resumo',
  diario: 'Diario',
  jornada: 'Jornada',
  beneficios: 'Beneficios',
  comunidade: 'Comunidade',
  documentos: 'Documentos',
  financeiro: 'Financeiro',
  chat: 'Chat',
  notificacoes: 'Notificacoes',
  checkins: 'Check-ins',
};
const FALLBACK_TABS: GamificationPortalTab[] = [
  'resumo',
  'diario',
  'jornada',
  'beneficios',
  'comunidade',
  'documentos',
  'financeiro',
  'chat',
  'notificacoes',
  'checkins',
];
const FALLBACK_TAB_SET = new Set<string>(FALLBACK_TABS);

function isGamificationPortalTab(value: string): value is GamificationPortalTab {
  return FALLBACK_TAB_SET.has(value);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asNullableString(value: unknown) {
  const text = asString(value);
  return text || null;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function asBoundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const valueAsNumber = asNumber(value, fallback);
  if (Number.isNaN(valueAsNumber)) return fallback;
  return Math.max(min, Math.min(max, valueAsNumber));
}

function asUuid(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return SAFE_UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function asStringArray(value: unknown, maxItems = 30): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function asStringRecord(value: unknown): Record<string, string> {
  const output: Record<string, string> = {};
  Object.entries(asRecord(value)).forEach(([key, nestedValue]) => {
    const safeKey = asString(key);
    const safeValue = asString(nestedValue);
    if (safeKey && safeValue) output[safeKey] = safeValue;
  });
  return output;
}

function asBooleanRecord(value: unknown): Record<string, boolean> {
  const output: Record<string, boolean> = {};
  Object.entries(asRecord(value)).forEach(([key, nestedValue]) => {
    const safeKey = asString(key);
    if (safeKey) output[safeKey] = nestedValue === true || nestedValue === 'true';
  });
  return output;
}

function asEntryMetadata(value: unknown): Record<string, string | number | boolean | null> {
  const output: Record<string, string | number | boolean | null> = {};
  Object.entries(asRecord(value)).forEach(([key, nestedValue]) => {
    const safeKey = asString(key);
    if (!safeKey) return;
    if (
      typeof nestedValue === 'string' ||
      typeof nestedValue === 'number' ||
      typeof nestedValue === 'boolean' ||
      nestedValue === null
    ) {
      output[safeKey] = nestedValue;
    }
  });
  return output;
}

function parseTargetDate(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : normalized;
}

function normalizePortalMessage(value: unknown): PatientPortalMessage | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;

  const deliveryStatus = asString(record.deliveryStatus);

  return {
    id,
    senderLabel: asString(record.senderLabel, 'Mensagem'),
    isOwn: asBoolean(record.isOwn),
    body: asString(record.body),
    createdAt: asNullableString(record.createdAt),
    deliveryStatus:
      deliveryStatus === 'sending' || deliveryStatus === 'failed' ? deliveryStatus : 'sent',
    isAutomated: asBoolean(record.isAutomated),
    attachments: [],
  };
}

function normalizePortalNotification(value: unknown): PatientPortalNotification | null {
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

function normalizePortalDocument(value: unknown): PatientPortalDocument | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const status = asString(record.status, 'pending');
  if (!id) return null;

  return {
    id,
    name: asString(record.name, 'Documento'),
    category: asString(record.category, 'documento'),
    status,
    generatedAt: asNullableString(record.generatedAt),
    releasedToPatient: asBoolean(record.releasedToPatient, true),
  };
}

function normalizePortalInvoice(value: unknown): PatientPortalInvoice | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;

  return {
    id,
    status: asString(record.status, 'pending'),
    amountCents: Math.round(asNumber(record.amountCents, 0)),
    dueDate: asNullableString(record.dueDate),
    paidAt: asNullableString(record.paidAt),
    description: asNullableString(record.description),
    paymentLink: asNullableString(record.paymentLink),
  };
}

function normalizeLinkedPatient(value: unknown): PatientPortalLinkedPatient | null {
  const record = asRecord(value);
  const patientId = asString(record.patientId);
  const tenantId = asString(record.tenantId);
  if (!patientId || !tenantId) return null;

  return {
    tenantId,
    patientId,
    linkageType: asString(record.linkageType, 'patient') as 'patient' | 'guardian',
    relationship: asNullableString(record.relationship),
    displayName: asString(record.displayName, 'Paciente'),
    status: asString(record.status, 'active'),
  };
}

function normalizePatientProfile(value: unknown): PatientPortalPatientSummary | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const tenantId = asString(record.tenantId);
  if (!id || !tenantId) return null;

  return {
    id,
    tenantId,
    preferredName: asString(record.preferredName, asString(record.fullName, 'Paciente')),
    fullName: asNullableString(record.fullName),
    email: asNullableString(record.email),
    phone: asNullableString(record.phone),
    status: asString(record.status, 'active'),
    tags: asStringArray(record.tags),
    createdAt: asNullableString(record.createdAt),
  };
}

function normalizePortalChat(value: unknown): PatientPortalChat {
  const record = asRecord(value);
  const serviceHours = asRecord(record.serviceHours);
  const days = asString(serviceHours.days);
  const start = asString(serviceHours.start);
  const end = asString(serviceHours.end);

  return {
    threadId: asNullableString(record.threadId),
    status: asString(record.status, 'open'),
    lastMessageAt: asNullableString(record.lastMessageAt),
    messages: Array.isArray(record.messages)
      ? record.messages.map(normalizePortalMessage).filter(isPresent)
      : [],
    serviceHours:
      days || start || end
        ? {
            days,
            start,
            end,
            timezone: asNullableString(serviceHours.timezone) ?? undefined,
            isAvailable:
              typeof serviceHours.isAvailable === 'boolean' ? serviceHours.isAvailable : undefined,
            unavailableMessage: asNullableString(serviceHours.unavailableMessage) ?? undefined,
          }
        : undefined,
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

function normalizePortalSnapshot(value: unknown): PatientPortalSnapshot | null {
  const record = asRecord(value);
  const selectedPatientId = asString(record.selectedPatientId);
  if (!selectedPatientId) return null;

  const patients = Array.isArray(record.patients)
    ? record.patients.map(normalizeLinkedPatient).filter(isPresent)
    : [];
  const patient = normalizePatientProfile(record.patient);
  if (patients.length === 0 || !patient?.id) return null;

  return {
    selectedPatientId,
    patients,
    patient,
    documents: Array.isArray(record.documents)
      ? record.documents.map(normalizePortalDocument).filter(isPresent)
      : [],
    invoices: Array.isArray(record.invoices)
      ? record.invoices.map(normalizePortalInvoice).filter(isPresent)
      : [],
    paymentReceipts: [],
    chat: normalizePortalChat(record.chat),
    notifications: Array.isArray(record.notifications)
      ? record.notifications.map(normalizePortalNotification).filter(isPresent)
      : [],
    checkins: Array.isArray(record.checkins)
      ? record.checkins.map(normalizeCheckin).filter(isPresent)
      : [],
    warnings: [],
  };
}

function normalizeDailyHabit(value: unknown): PatientDailyHabit | null {
  const record = asRecord(value);
  const kind = asString(record.kind);
  if (!kind || !['water', 'meal', 'workout'].includes(kind)) return null;

  return {
    kind: kind as PatientDailyHabit['kind'],
    label: asString(record.label, 'Meta'),
    value: asString(record.value, '0'),
    target: asString(record.target, '0'),
    helper: asString(record.helper, ''),
    status: asString(record.status, 'empty') as PatientDailyHabit['status'],
    progressPercent: Math.round(asBoundedNumber(record.progressPercent, 0, 0, 100)),
  };
}

function normalizeDailyWeekDay(value: unknown): PatientDailyWeekDay | null {
  const record = asRecord(value);
  const isoDate = asString(record.isoDate);
  const label = asString(record.label);
  const status = asString(record.status, 'empty');
  if (!isoDate || !label) return null;
  if (status !== 'done' && status !== 'partial' && status !== 'empty' && status !== 'today') {
    return null;
  }

  return {
    isoDate,
    label,
    status: status as PatientDailyWeekDay['status'],
    progressPercent: Math.round(asBoundedNumber(record.progressPercent, 0, 0, 100)),
  };
}

function normalizeDailyEntry(value: unknown): PatientDailyEntry | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;

  const kind = asString(record.kind);
  if (kind !== 'water' && kind !== 'meal' && kind !== 'workout' && kind !== 'checkin') return null;

  const status = asString(record.status, 'synced');
  if (status !== 'pending' && status !== 'failed' && status !== 'derived' && status !== 'synced') {
    return null;
  }

  return {
    id,
    kind: kind as PatientDailyEntry['kind'],
    title: asString(record.title, 'Registro'),
    detail: asString(record.detail, ''),
    occurredAt: asString(record.occurredAt, new Date().toISOString()),
    status: status as PatientDailyEntry['status'],
    metadata: asEntryMetadata(record.metadata),
  };
}

function normalizeDailySnapshot(value: unknown): PatientDailySnapshot | null {
  const record = asRecord(value);
  const dateIso = asString(record.dateIso, new Date().toISOString());
  if (!dateIso) return null;

  return {
    selectedPatientId: asNullableString(record.selectedPatientId) ?? undefined,
    dateIso,
    dateLabel: asString(record.dateLabel, dateIso),
    programStatus: asString(record.programStatus, 'active'),
    progressPercent: Math.round(asBoundedNumber(record.progressPercent, 0, 0, 100)),
    streakDays: Math.max(0, Math.round(asNumber(record.streakDays, 0))),
    waterMl: Math.max(0, Math.round(asNumber(record.waterMl, 0))),
    waterGoalMl: Math.max(1, Math.round(asNumber(record.waterGoalMl, 2000))),
    mealsCount: Math.max(0, Math.round(asNumber(record.mealsCount, 0))),
    mealsGoal: Math.max(1, Math.round(asNumber(record.mealsGoal, 4))),
    workoutsCount: Math.max(0, Math.round(asNumber(record.workoutsCount, 0))),
    workoutsGoal: Math.max(1, Math.round(asNumber(record.workoutsGoal, 1))),
    checkinRequired: asBoolean(record.checkinRequired, true),
    checkinDone: asBoolean(record.checkinDone, false),
    pendingProgramCheckins: Array.isArray(record.pendingProgramCheckins)
      ? record.pendingProgramCheckins.map(normalizeCheckin).filter(isPresent)
      : [],
    habits: Array.isArray(record.habits)
      ? record.habits.map(normalizeDailyHabit).filter(isPresent)
      : [],
    week: Array.isArray(record.week)
      ? record.week.map(normalizeDailyWeekDay).filter(isPresent)
      : [],
    timeline: Array.isArray(record.timeline)
      ? record.timeline.map(normalizeDailyEntry).filter(isPresent)
      : [],
    backendStatus: 'synced',
  };
}

function parseJourneyText(value: unknown, fallback = '') {
  const text = asString(value);
  return text || fallback;
}

function normalizeJourneySnapshot(value: unknown): PatientJourneySnapshot | null {
  const record = asRecord(value);
  const selectedPatientId = asString(record.selectedPatientId);
  if (!selectedPatientId) return null;

  const onboarding = asRecord(record.onboarding);
  const profileRecord = asRecord(record.profile);
  const programRecord = asRecord(record.program);
  const goalsRecord = asRecord(record.goals);
  const onboardingPendingReviewCount = Math.max(
    0,
    Math.round(asNumber(onboarding.pendingReviewCount, 0))
  );

  return {
    selectedPatientId,
    onboarding: {
      status: parseJourneyText(onboarding.status, 'not_started'),
      currentStep: parseJourneyText(onboarding.currentStep, 'profile'),
      completedSteps: asStringArray(onboarding.completedSteps, 10),
      progressPercent: Math.round(asBoundedNumber(onboarding.progressPercent, 0, 0, 100)),
      completedAt: asNullableString(onboarding.completedAt),
      pendingReviewCount: onboardingPendingReviewCount,
    },
    profile: {
      preferredName: asString(profileRecord.preferredName, 'Paciente'),
      fullName: asNullableString(profileRecord.fullName),
      email: asNullableString(profileRecord.email),
      phone: asNullableString(profileRecord.phone),
      birthDate: asNullableString(profileRecord.birthDate),
      status: asString(profileRecord.status, 'active'),
      editableFields: asStringRecord(profileRecord.editableFields),
      pendingReviews: [],
    },
    program: {
      id: asNullableString(programRecord.id),
      programId: asNullableString(programRecord.programId),
      name: asNullableString(programRecord.name),
      programType: asNullableString(programRecord.programType),
      objective: asNullableString(programRecord.objective),
      status: asString(programRecord.status, 'not_enrolled'),
      startDate: asNullableString(programRecord.startDate),
      endDate: asNullableString(programRecord.endDate),
      currentWeek: Math.round(asBoundedNumber(programRecord.currentWeek, 0, 0, 520)),
      totalWeeks: Math.round(asBoundedNumber(programRecord.totalWeeks, 0, 0, 520)),
      services: [],
      phases: [],
    },
    goals: {
      source: asString(goalsRecord.source, 'fallback'),
      waterGoalMl: Math.round(asBoundedNumber(goalsRecord.waterGoalMl, 2000, 250, 10000)),
      mealsGoal: Math.round(asBoundedNumber(goalsRecord.mealsGoal, 4, 1, 12)),
      workoutsGoal: Math.round(asBoundedNumber(goalsRecord.workoutsGoal, 1, 0, 4)),
      sleepGoalHours: asBoundedNumber(goalsRecord.sleepGoalHours, 8, 0, 24),
      programGoal: asNullableString(goalsRecord.programGoal),
      checkinRequired: asBoolean(goalsRecord.checkinRequired, true),
      editableFields: asBooleanRecord(goalsRecord.editableFields),
    },
    planToday: [],
    medicationReminders: [],
    history: [],
  };
}

function parseTabs(value: string | null): GamificationTabShortcut[] {
  const requestedTabs = value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const orderedTabs: GamificationPortalTab[] = [];
  const seen = new Set<GamificationPortalTab>();

  requestedTabs.forEach((raw) => {
    if (!isGamificationPortalTab(raw) || seen.has(raw)) return;
    seen.add(raw);
    orderedTabs.push(raw);
  });

  if (requestedTabs.length > 0 && orderedTabs.length === 0) {
    FALLBACK_TABS.forEach((tab) => {
      if (!seen.has(tab)) {
        seen.add(tab);
        orderedTabs.push(tab);
      }
    });
    return orderedTabs.map((id) => ({ id, label: FALLBACK_TAB_LABELS[id] }));
  }

  if (!orderedTabs.length) {
    FALLBACK_TABS.forEach((tab) => orderedTabs.push(tab));
  }

  return orderedTabs.map((id) => ({ id, label: FALLBACK_TAB_LABELS[id] }));
}

function toSerializableSummary(summary: GamificationSummary): JsonRecord {
  const nextAction = { ...summary.nextAction } as JsonRecord;
  delete nextAction.icon;
  return { ...summary, nextAction } as unknown as JsonRecord;
}

async function persistGamificationSummary({
  supabase,
  context,
  patientId,
  summary,
  targetDate,
}: {
  supabase: ServerSupabaseClient;
  context: ReturnType<typeof createObservabilityContext>;
  patientId: string;
  summary: GamificationSummary;
  targetDate: string | null;
}) {
  const { error } = await supabase.rpc('record_patient_gamification_summary', {
    p_patient_id: patientId,
    p_summary: toSerializableSummary(summary),
    p_snapshot_date: targetDate ? targetDate.slice(0, 10) : null,
  });

  if (error) {
    logObservedEvent(context, 'patient_gamification_persistence', 'warn', 'failure', {
      patient_id: patientId,
      error_code: error.code ?? 'gamification_persistence_failed',
    });
    return;
  }

  logObservedEvent(context, 'patient_gamification_persistence', 'info', 'success', {
    patient_id: patientId,
    weekly_window_key: summary.weeklyWindowKey,
  });
}

function jsonError(
  context: ReturnType<typeof createObservabilityContext>,
  message: string,
  status: number,
  code?: string
) {
  logObservedEvent(context, 'patient_gamification_summary', 'warn', 'failure', {
    error_code: code ?? 'gamification_summary_error',
    reason: message,
    status_code: status,
  });

  return NextResponse.json(
    { data: null, error: { message, ...(code ? { code } : {}) } },
    { status, headers: observedHeaders(context) }
  );
}

export async function GET(request: Request) {
  const context = createObservabilityContext('api.patient.gamification', request);
  const session = await getCurrentAppSession();
  if (!session) {
    return jsonError(
      context,
      'Sessao obrigatoria para consultar progressao da jornada.',
      401,
      'unauthenticated'
    );
  }
  if (!session.canAccessPatientPortal()) {
    return jsonError(context, 'Sem permissao para acessar progresso do portal.', 403, 'forbidden');
  }

  const url = new URL(request.url);
  const requestedPatientId = asUuid(url.searchParams.get('patientId'));
  if (url.searchParams.get('patientId') && !requestedPatientId) {
    return jsonError(context, 'Parametro patientId invalido.', 400, 'invalid_patient_id');
  }
  const targetDate = parseTargetDate(url.searchParams.get('targetDate'));
  const tabItems = parseTabs(url.searchParams.get('tabs'));

  const supabase = await createClient();
  if (!supabase) {
    return jsonError(context, 'Supabase nao configurado no servidor.', 503, 'supabase_unavailable');
  }

  const [portalResult, journeyResult, dailyResult] = await Promise.all([
    supabase.rpc('get_patient_portal_snapshot', {
      p_patient_id: requestedPatientId ?? null,
    }),
    supabase.rpc('get_patient_journey_snapshot', {
      p_patient_id: requestedPatientId ?? null,
    }),
    supabase.rpc('get_patient_daily_snapshot', {
      p_patient_id: requestedPatientId ?? null,
      p_target_date: targetDate ?? null,
    }),
  ]);

  if (portalResult.error || !portalResult.data) {
    return jsonError(
      context,
      'Nao foi possivel carregar snapshot do paciente.',
      500,
      'portal_snapshot_failed'
    );
  }

  const portalSnapshot = normalizePortalSnapshot(portalResult.data);
  if (!portalSnapshot) {
    return jsonError(
      context,
      'Contrato do snapshot do paciente invalido.',
      500,
      'portal_snapshot_invalid'
    );
  }

  const journeySnapshot =
    journeyResult.error || !journeyResult.data
      ? null
      : normalizeJourneySnapshot(journeyResult.data);
  if (!journeyResult.error && !journeySnapshot) {
    portalSnapshot.warnings.push({ message: 'Contrato de jornada indisponivel.' });
  }
  if (journeyResult.error) {
    portalSnapshot.warnings.push({ message: 'Jornada indisponivel no momento.' });
  }

  const dailySnapshot =
    dailyResult.error || !dailyResult.data ? null : normalizeDailySnapshot(dailyResult.data);
  if (!dailyResult.error && !dailySnapshot) {
    portalSnapshot.warnings.push({ message: 'Contrato do diario indisponivel.' });
  }
  if (dailyResult.error) {
    portalSnapshot.warnings.push({ message: 'Diario indisponivel no momento.' });
  }

  const now = targetDate ? new Date(targetDate) : new Date();
  const summary = buildPatientGamificationState({
    snapshot: portalSnapshot,
    journey: journeySnapshot,
    dailySnapshot,
    tabItems,
    dailyLoading: false,
    dailyError: dailyResult.error ? 'Diario temporariamente indisponivel.' : null,
    now,
  });

  await persistGamificationSummary({
    supabase,
    context,
    patientId: portalSnapshot.selectedPatientId,
    summary,
    targetDate,
  });

  logObservedEvent(context, 'patient_gamification_summary', 'info', 'success', {
    patient_id: portalSnapshot.selectedPatientId,
    journey_loaded: Boolean(journeySnapshot),
    daily_loaded: Boolean(dailySnapshot),
    tab_count: tabItems.length,
    warnings: portalSnapshot.warnings.length,
  });

  return NextResponse.json({ data: summary, error: null }, { headers: observedHeaders(context) });
}
