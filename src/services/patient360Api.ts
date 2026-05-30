import type {
  Patient360Summary,
  PatientTimelineEvent,
  TimelineEventCategory,
  TimelineEventType,
} from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getPatient360 } from '@/services/mockApi';

export interface PatientTimelineFilters {
  category?: TimelineEventCategory;
  types?: TimelineEventType[];
  fromDate?: string;
  toDate?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
}

interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

type EdgeResponseEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    message?: string;
    code?: string;
  };
  meta?: Record<string, unknown>;
};

function unwrapEdgeResponse<T>(response: unknown): {
  data: T | null;
  error: SafeServiceError | null;
} {
  if (response && typeof response === 'object' && 'ok' in response) {
    const envelope = response as EdgeResponseEnvelope<T>;

    if (envelope.ok === true) {
      return { data: (envelope.data ?? null) as T | null, error: null };
    }

    const edgeError = envelope.error;
    return {
      data: null,
      error: {
        message: edgeError?.message ?? edgeError?.code ?? 'Edge function request failed.',
        code: edgeError?.code,
      },
    };
  }

  return { data: response as T, error: null };
}

function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function normalizeTimelineEvent(event: unknown): PatientTimelineEvent | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as Record<string, unknown>;

  if (
    typeof record.id !== 'string' ||
    typeof record.patientId !== 'string' ||
    typeof record.type !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.description !== 'string' ||
    typeof record.date !== 'string'
  ) {
    return null;
  }

  return {
    id: record.id,
    patientId: record.patientId,
    type: record.type as TimelineEventType,
    title: record.title,
    description: record.description,
    date: record.date,
    professional: typeof record.professional === 'string' ? record.professional : undefined,
    metadata:
      record.metadata && typeof record.metadata === 'object'
        ? (record.metadata as Record<string, string | number | boolean>)
        : undefined,
    category:
      typeof record.category === 'string' ? (record.category as TimelineEventCategory) : undefined,
    actorName: typeof record.actorName === 'string' ? record.actorName : undefined,
    statusLabel: typeof record.statusLabel === 'string' ? record.statusLabel : undefined,
    actionLabel: typeof record.actionLabel === 'string' ? record.actionLabel : undefined,
    detailsHref: typeof record.detailsHref === 'string' ? record.detailsHref : undefined,
  };
}

function normalizeSummary(payload: unknown): Patient360Summary {
  return normalizePatient360Summary(payload);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeAppointment(
  item: unknown,
  patientId: string
): Patient360Summary['upcomingAppointments'][number] | null {
  const record = asRecord(item);
  if (!record) return null;

  return {
    id: asString(record.id),
    patientId: asString(record.patientId, patientId),
    patientName: asString(record.patientName),
    patientAvatarUrl:
      typeof record.patientAvatarUrl === 'string' ? record.patientAvatarUrl : undefined,
    type: asString(
      record.type,
      'consulta_medica'
    ) as Patient360Summary['upcomingAppointments'][number]['type'],
    status: asString(
      record.status,
      'agendado'
    ) as Patient360Summary['upcomingAppointments'][number]['status'],
    scheduledAt: asString(record.scheduledAt),
    durationMinutes: asNumber(record.durationMinutes),
    professionalName: asString(record.professionalName),
    professionalRole: asString(record.professionalRole),
    roomName: typeof record.roomName === 'string' ? record.roomName : undefined,
    notes: typeof record.notes === 'string' ? record.notes : undefined,
    attendanceLink: typeof record.attendanceLink === 'string' ? record.attendanceLink : undefined,
    recommendedReturn:
      typeof record.recommendedReturn === 'string' ? record.recommendedReturn : undefined,
  };
}

function normalizePrescription(
  item: unknown,
  patientId: string
): Patient360Summary['prescriptions'][number] | null {
  const record = asRecord(item);
  if (!record) return null;

  return {
    id: asString(record.id),
    patientId: asString(record.patientId, patientId),
    medicationName: asString(record.medicationName),
    dosage: asString(record.dosage),
    frequency: asString(record.frequency),
    startDate: asString(record.startDate),
    endDate: typeof record.endDate === 'string' ? record.endDate : undefined,
    prescribedBy: asString(record.prescribedBy),
    isActive: asBoolean(record.isActive),
    notes: typeof record.notes === 'string' ? record.notes : undefined,
    category:
      typeof record.category === 'string'
        ? (record.category as Patient360Summary['prescriptions'][number]['category'])
        : undefined,
    status:
      typeof record.status === 'string'
        ? (record.status as Patient360Summary['prescriptions'][number]['status'])
        : undefined,
    issueDate: typeof record.issueDate === 'string' ? record.issueDate : undefined,
    validity: typeof record.validity === 'string' ? record.validity : undefined,
    linkedDocument: typeof record.linkedDocument === 'string' ? record.linkedDocument : undefined,
    signatureStatus:
      typeof record.signatureStatus === 'string'
        ? (record.signatureStatus as Patient360Summary['prescriptions'][number]['signatureStatus'])
        : undefined,
    version: typeof record.version === 'string' ? record.version : undefined,
  };
}

function normalizePatient360Summary(payload: unknown): Patient360Summary {
  const raw = asRecord(payload);
  const rawProfile = asRecord(raw?.profile);
  const patientId = asString(rawProfile?.id);

  const timeline = Array.isArray(raw?.recentTimeline)
    ? raw.recentTimeline
        .map(normalizeTimelineEvent)
        .filter((item): item is PatientTimelineEvent => Boolean(item))
    : [];
  const appointments = Array.isArray(raw?.upcomingAppointments)
    ? raw.upcomingAppointments
        .map((item) => normalizeAppointment(item, patientId))
        .filter((item): item is Patient360Summary['upcomingAppointments'][number] => Boolean(item))
    : [];
  const prescriptions = Array.isArray(raw?.prescriptions)
    ? raw.prescriptions
        .map((item) => normalizePrescription(item, patientId))
        .filter((item): item is Patient360Summary['prescriptions'][number] => Boolean(item))
    : [];

  return {
    profile: {
      id: patientId,
      tenantId: asString(rawProfile?.tenantId),
      name: asString(rawProfile?.name),
      preferredName:
        typeof rawProfile?.preferredName === 'string' ? rawProfile.preferredName : undefined,
      age: asNumber(rawProfile?.age),
      birthDate: asString(rawProfile?.birthDate),
      cpfMasked: asString(rawProfile?.cpfMasked),
      phone: asString(rawProfile?.phone),
      email: asString(rawProfile?.email),
      avatarUrl: typeof rawProfile?.avatarUrl === 'string' ? rawProfile.avatarUrl : undefined,
      status: asString(rawProfile?.status, 'inativo') as Patient360Summary['profile']['status'],
      careTeam: Array.isArray(rawProfile?.careTeam)
        ? rawProfile.careTeam.filter((item): item is string => typeof item === 'string')
        : [],
      createdAt: asString(rawProfile?.createdAt),
      tags: Array.isArray(rawProfile?.tags)
        ? rawProfile.tags.filter((item): item is string => typeof item === 'string')
        : undefined,
    },
    activePackage: {
      id: asString(asRecord(raw?.activePackage)?.id),
      patientId: asString(asRecord(raw?.activePackage)?.patientId, patientId),
      programName: asString(asRecord(raw?.activePackage)?.programName),
      programType: asString(
        asRecord(raw?.activePackage)?.programType,
        'emagrecimento'
      ) as Patient360Summary['activePackage']['programType'],
      totalWeeks: asNumber(asRecord(raw?.activePackage)?.totalWeeks),
      currentWeek: asNumber(asRecord(raw?.activePackage)?.currentWeek),
      startDate: asString(asRecord(raw?.activePackage)?.startDate),
      endDate: asString(asRecord(raw?.activePackage)?.endDate),
      status: asString(
        asRecord(raw?.activePackage)?.status,
        'aguardando'
      ) as Patient360Summary['activePackage']['status'],
      totalConsultations: asNumber(asRecord(raw?.activePackage)?.totalConsultations),
      usedConsultations: asNumber(asRecord(raw?.activePackage)?.usedConsultations),
      totalNutritionSessions: asNumber(asRecord(raw?.activePackage)?.totalNutritionSessions),
      usedNutritionSessions: asNumber(asRecord(raw?.activePackage)?.usedNutritionSessions),
    },
    clinicalStatus: {
      currentWeightKg: asNumber(asRecord(raw?.clinicalStatus)?.currentWeightKg),
      goalWeightKg: asNumber(asRecord(raw?.clinicalStatus)?.goalWeightKg),
      startWeightKg: asNumber(asRecord(raw?.clinicalStatus)?.startWeightKg),
      currentBmi: asNumber(asRecord(raw?.clinicalStatus)?.currentBmi),
      weeklyAdherencePercent: asNumber(asRecord(raw?.clinicalStatus)?.weeklyAdherencePercent),
      adherenceLevel: asString(
        asRecord(raw?.clinicalStatus)?.adherenceLevel,
        'regular'
      ) as Patient360Summary['clinicalStatus']['adherenceLevel'],
      weightLostKg: asNumber(asRecord(raw?.clinicalStatus)?.weightLostKg),
      weightToGoKg: asNumber(asRecord(raw?.clinicalStatus)?.weightToGoKg),
      progressPercent: asNumber(asRecord(raw?.clinicalStatus)?.progressPercent),
      lastMeasuredAt: asString(asRecord(raw?.clinicalStatus)?.lastMeasuredAt),
      weightHistory: Array.isArray(asRecord(raw?.clinicalStatus)?.weightHistory)
        ? (asRecord(raw?.clinicalStatus)
            ?.weightHistory as Patient360Summary['clinicalStatus']['weightHistory'])
        : [],
      adherenceHistory: Array.isArray(asRecord(raw?.clinicalStatus)?.adherenceHistory)
        ? (asRecord(raw?.clinicalStatus)
            ?.adherenceHistory as Patient360Summary['clinicalStatus']['adherenceHistory'])
        : [],
    },
    financial: {
      status: asString(
        asRecord(raw?.financial)?.status,
        'isento'
      ) as Patient360Summary['financial']['status'],
      totalContractValue: asNumber(asRecord(raw?.financial)?.totalContractValue),
      totalPaid: asNumber(asRecord(raw?.financial)?.totalPaid),
      totalPending: asNumber(asRecord(raw?.financial)?.totalPending),
      totalOverdue: asNumber(asRecord(raw?.financial)?.totalOverdue),
      invoices: Array.isArray(asRecord(raw?.financial)?.invoices)
        ? (asRecord(raw?.financial)?.invoices as Patient360Summary['financial']['invoices'])
        : [],
      financialState:
        typeof asRecord(raw?.financial)?.financialState === 'string'
          ? (asRecord(raw?.financial)
              ?.financialState as Patient360Summary['financial']['financialState'])
          : undefined,
    },
    alerts: Array.isArray(raw?.alerts) ? (raw.alerts as Patient360Summary['alerts']) : [],
    tasks: Array.isArray(raw?.tasks) ? (raw.tasks as Patient360Summary['tasks']) : [],
    upcomingAppointments: appointments,
    recentTimeline: timeline,
    documents: Array.isArray(raw?.documents)
      ? (raw.documents as Patient360Summary['documents'])
      : [],
    prescriptions,
    nutritionPlan: {
      id: asString(asRecord(raw?.nutritionPlan)?.id),
      patientId: asString(asRecord(raw?.nutritionPlan)?.patientId, patientId),
      planName: asString(asRecord(raw?.nutritionPlan)?.planName),
      targetCalories: asNumber(asRecord(raw?.nutritionPlan)?.targetCalories),
      targetProteinG: asNumber(asRecord(raw?.nutritionPlan)?.targetProteinG),
      targetCarbsG: asNumber(asRecord(raw?.nutritionPlan)?.targetCarbsG),
      targetFatG: asNumber(asRecord(raw?.nutritionPlan)?.targetFatG),
      createdAt: asString(asRecord(raw?.nutritionPlan)?.createdAt),
      updatedAt: asString(asRecord(raw?.nutritionPlan)?.updatedAt),
      nutritionistName: asString(asRecord(raw?.nutritionPlan)?.nutritionistName),
      isActive: asBoolean(asRecord(raw?.nutritionPlan)?.isActive),
    },
    chat: {
      id: asString(asRecord(raw?.chat)?.id),
      patientId: asString(asRecord(raw?.chat)?.patientId, patientId),
      lastMessageAt: asString(asRecord(raw?.chat)?.lastMessageAt),
      lastMessagePreview: asString(asRecord(raw?.chat)?.lastMessagePreview),
      lastMessageFrom: asString(asRecord(raw?.chat)?.lastMessageFrom),
      unreadCount: asNumber(asRecord(raw?.chat)?.unreadCount),
      isOpen: asBoolean(asRecord(raw?.chat)?.isOpen),
    },
    mainUnit: typeof raw?.mainUnit === 'string' ? raw.mainUnit : undefined,
    responsibleProfessional:
      typeof raw?.responsibleProfessional === 'string' ? raw.responsibleProfessional : undefined,
    clinicalRisk:
      typeof raw?.clinicalRisk === 'string'
        ? (raw.clinicalRisk as Patient360Summary['clinicalRisk'])
        : undefined,
    lastUpdate: typeof raw?.lastUpdate === 'string' ? raw.lastUpdate : undefined,
  };
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) {
    return { message: fallback, details: error.message };
  }
  return { message: fallback };
}

function getSupabaseClient() {
  return createBrowserSupabaseClient();
}

function applyTimelineFilters(
  events: PatientTimelineEvent[],
  filters?: PatientTimelineFilters
): PatientTimelineEvent[] {
  if (!filters) return events;

  return events
    .filter((event) => (filters.category ? event.category === filters.category : true))
    .filter((event) => (filters.types?.length ? filters.types.includes(event.type) : true))
    .filter((event) =>
      filters.fromDate ? new Date(event.date) >= new Date(filters.fromDate) : true
    )
    .filter((event) => (filters.toDate ? new Date(event.date) <= new Date(filters.toDate) : true))
    .slice(0, filters.limit ?? events.length);
}

export async function getPatient360Summary(
  patientId: string
): Promise<{ data: Patient360Summary | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) {
      const summary = await getPatient360(patientId);
      return { data: summary, error: null };
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('patient-360-summary', {
      body: { patient_id: patientId },
    });

    if (error) {
      return {
        data: null,
        error: {
          message: 'Failed to fetch patient summary.',
          code: error.name,
          details: error.message,
        },
      };
    }

    const unwrapped = unwrapEdgeResponse<Patient360Summary>(data);
    if (unwrapped.error) return { data: null, error: unwrapped.error };

    return { data: normalizeSummary(unwrapped.data), error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to load patient summary right now.') };
  }
}

export async function getPatientTimeline(
  patientId: string,
  filters?: PatientTimelineFilters
): Promise<{ data: PatientTimelineEvent[]; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) {
      const summary = await getPatient360(patientId);
      const events = summary?.recentTimeline ?? [];
      return { data: applyTimelineFilters(events, filters), error: null };
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('patient-timeline', {
      body: {
        patient_id: patientId,
        category: filters?.category ?? 'all',
        page: filters?.page ?? 1,
        page_size: filters?.pageSize ?? filters?.limit ?? 20,
        date_start: filters?.fromDate,
        date_end: filters?.toDate,
      },
    });

    if (error) {
      return {
        data: [],
        error: {
          message: 'Failed to fetch patient timeline.',
          code: error.name,
          details: error.message,
        },
      };
    }

    const unwrapped = unwrapEdgeResponse<{ events?: unknown[] } | unknown[]>(data);
    if (unwrapped.error) return { data: [], error: unwrapped.error };

    const timelineData = unwrapped.data;
    const list = Array.isArray(timelineData)
      ? timelineData
      : ((timelineData as { events?: unknown[] } | null)?.events ?? []);
    const normalized = list
      .map(normalizeTimelineEvent)
      .filter((item): item is PatientTimelineEvent => Boolean(item));

    return { data: applyTimelineFilters(normalized, filters), error: null };
  } catch (error) {
    return { data: [], error: safeError(error, 'Unable to load patient timeline right now.') };
  }
}
