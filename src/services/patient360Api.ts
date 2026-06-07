import type {
  MealAdherenceEntry,
  MealPhoto,
  NutritionFoodGroup,
  NutritionMeal,
  NutritionPlanHistory,
  NutritionTeamNote,
  Patient360Summary,
  PatientTimelineEvent,
  TimelineEventCategory,
  TimelineEventType,
} from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

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

async function getMockPatient360(patientId: string) {
  const { getPatient360 } = await import('@/services/mockApi');
  return getPatient360(patientId);
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

function patientSummaryContractError(): SafeServiceError {
  return {
    message: 'Invalid patient summary contract returned by Edge Function.',
    code: 'invalid_patient360_contract',
  };
}

function patientTimelineContractError(): SafeServiceError {
  return {
    message: 'Invalid patient timeline contract returned by Edge Function.',
    code: 'invalid_patient_timeline_contract',
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function maskEmail(value: unknown): string {
  const normalized = asString(value).toLowerCase();
  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain) return '';
  const visiblePrefix = localPart.slice(0, 2);
  return `${visiblePrefix}${localPart.length > 2 ? '***' : '*'}@${domain}`;
}

function maskPhone(value: unknown): string {
  const digits = asString(value).replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `(**) *****-${digits.slice(-4)}`;
}

function maskCpf(value: unknown): string {
  const normalized = asString(value);
  if (!normalized) return '***.***.***-**';
  const digits = normalized.replace(/\D/g, '');
  if (digits.length >= 2) return `***.***.***-${digits.slice(-2)}`;
  return '***.***.***-**';
}

function hasPatientSummaryIdentity(payload: unknown): boolean {
  const raw = asRecord(payload);
  const rawProfile = asRecord(raw?.profile);
  return typeof rawProfile?.id === 'string' && rawProfile.id.trim().length > 0;
}

function getTimelineItems(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (Array.isArray(record?.events)) return record.events;
  return null;
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

type PrescriptionItemSummary = NonNullable<
  Patient360Summary['prescriptions'][number]['items']
>[number];

type PrescriptionReminderSummary = NonNullable<
  Patient360Summary['prescriptions'][number]['medicationReminders']
>[number];

type PrescriptionRegulatorySummary = NonNullable<
  Patient360Summary['prescriptions'][number]['regulatory']
>;

type PrescriptionPdfArtifactSummary = NonNullable<
  Patient360Summary['prescriptions'][number]['pdfArtifact']
>;

function normalizePrescription(
  item: unknown,
  patientId: string
): Patient360Summary['prescriptions'][number] | null {
  const record = asRecord(item);
  if (!record) return null;
  const items = Array.isArray(record.items)
    ? record.items
        .map((entry): PrescriptionItemSummary | null => {
          const itemRecord = asRecord(entry);
          if (!itemRecord) return null;
          const normalized: PrescriptionItemSummary = {
            id: asString(itemRecord.id),
            label: asString(itemRecord.label),
            itemType: asString(
              itemRecord.itemType,
              'medicamento'
            ) as PrescriptionItemSummary['itemType'],
            scheduleTimes: Array.isArray(itemRecord.scheduleTimes)
              ? itemRecord.scheduleTimes.map((time) => String(time))
              : [],
            reminderEnabled: asBoolean(itemRecord.reminderEnabled),
          };
          if (typeof itemRecord.dosage === 'string') normalized.dosage = itemRecord.dosage;
          if (typeof itemRecord.route === 'string') normalized.route = itemRecord.route;
          if (typeof itemRecord.frequency === 'string') normalized.frequency = itemRecord.frequency;
          if (typeof itemRecord.duration === 'string') normalized.duration = itemRecord.duration;
          if (typeof itemRecord.quantity === 'string') normalized.quantity = itemRecord.quantity;
          if (typeof itemRecord.instructions === 'string') {
            normalized.instructions = itemRecord.instructions;
          }
          if (typeof itemRecord.startDate === 'string') normalized.startDate = itemRecord.startDate;
          if (typeof itemRecord.endDate === 'string') normalized.endDate = itemRecord.endDate;
          return normalized;
        })
        .filter((entry): entry is PrescriptionItemSummary => Boolean(entry))
    : undefined;
  const regulatory = asRecord(record.regulatory);
  const pdfArtifact = asRecord(record.pdfArtifact);
  const reminders = Array.isArray(record.medicationReminders)
    ? record.medicationReminders
        .map((entry): PrescriptionReminderSummary | null => {
          const reminder = asRecord(entry);
          if (!reminder) return null;
          const normalized: PrescriptionReminderSummary = {
            id: asString(reminder.id),
            title: asString(reminder.title),
            scheduleTimes: Array.isArray(reminder.scheduleTimes)
              ? reminder.scheduleTimes.map((time) => String(time))
              : [],
            status: asString(reminder.status, 'active') as PrescriptionReminderSummary['status'],
          };
          if (typeof reminder.medicationLabel === 'string') {
            normalized.medicationLabel = reminder.medicationLabel;
          }
          if (typeof reminder.dosage === 'string') normalized.dosage = reminder.dosage;
          if (typeof reminder.instructions === 'string') {
            normalized.instructions = reminder.instructions;
          }
          return normalized;
        })
        .filter((entry): entry is PrescriptionReminderSummary => Boolean(entry))
    : undefined;

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
    linkedDocumentId:
      typeof record.linkedDocumentId === 'string' ? record.linkedDocumentId : undefined,
    linkedDocument: typeof record.linkedDocument === 'string' ? record.linkedDocument : undefined,
    signatureStatus:
      typeof record.signatureStatus === 'string'
        ? (record.signatureStatus as Patient360Summary['prescriptions'][number]['signatureStatus'])
        : undefined,
    signatureRequirement:
      typeof record.signatureRequirement === 'string'
        ? (record.signatureRequirement as Patient360Summary['prescriptions'][number]['signatureRequirement'])
        : undefined,
    version: typeof record.version === 'string' ? record.version : undefined,
    requiresReview: asBoolean(record.requiresReview),
    patientVisible: asBoolean(record.patientVisible, true),
    items,
    regulatory: regulatory
      ? {
          classification: asString(regulatory.classification),
          scope: asString(regulatory.scope),
          signatureRequirement: asString(
            regulatory.signatureRequirement,
            'none'
          ) as PrescriptionRegulatorySummary['signatureRequirement'],
          signatureStatus: asString(
            regulatory.signatureStatus,
            'not_required'
          ) as PrescriptionRegulatorySummary['signatureStatus'],
          d4signAllowed: asBoolean(regulatory.d4signAllowed),
          providerPolicy:
            typeof regulatory.providerPolicy === 'string' ? regulatory.providerPolicy : undefined,
          prescriberName:
            typeof regulatory.prescriberName === 'string' ? regulatory.prescriberName : undefined,
        }
      : undefined,
    pdfArtifact: pdfArtifact
      ? {
          id: asString(pdfArtifact.id),
          status: asString(
            pdfArtifact.status,
            'generated'
          ) as PrescriptionPdfArtifactSummary['status'],
          versionNumber: asNumber(pdfArtifact.versionNumber, 1),
          generatedAt:
            typeof pdfArtifact.generatedAt === 'string' ? pdfArtifact.generatedAt : undefined,
          releasedToPatient: asBoolean(pdfArtifact.releasedToPatient),
        }
      : undefined,
    medicationReminders: reminders,
  };
}

function normalizeNutritionMeal(item: unknown): NutritionMeal | null {
  const record = asRecord(item);
  const id = asString(record?.id);
  const name = asString(record?.name);
  if (!record || !id || !name) return null;

  return {
    id,
    name,
    time: asString(record.time),
    targetCalories: asNumber(record.targetCalories),
    targetProteinG: asNumber(record.targetProteinG),
    targetCarbsG: asNumber(record.targetCarbsG),
    targetFatG: asNumber(record.targetFatG),
    description: typeof record.description === 'string' ? record.description : undefined,
  };
}

function normalizeNutritionFoodGroup(item: unknown): NutritionFoodGroup | null {
  const record = asRecord(item);
  const label = asString(record?.label);
  const category = asString(record?.category);
  if (!record || !label || !category) return null;

  return {
    label,
    category: category as NutritionFoodGroup['category'],
    portionDescription: asString(record.portionDescription),
    dailyServings: asNumber(record.dailyServings),
    examples: Array.isArray(record.examples)
      ? record.examples.filter((example): example is string => typeof example === 'string')
      : [],
  };
}

function normalizeNutritionHistory(item: unknown): NutritionPlanHistory | null {
  const record = asRecord(item);
  const id = asString(record?.id);
  if (!record || !id) return null;

  return {
    id,
    planName: asString(record.planName),
    createdAt: asString(record.createdAt),
    archivedAt: typeof record.archivedAt === 'string' ? record.archivedAt : undefined,
    nutritionistName: asString(record.nutritionistName),
    targetCalories: asNumber(record.targetCalories),
    status: asString(record.status, 'arquivado') as NutritionPlanHistory['status'],
    notes: typeof record.notes === 'string' ? record.notes : undefined,
  };
}

function normalizeMealAdherence(item: unknown): MealAdherenceEntry | null {
  const record = asRecord(item);
  const week = asNumber(record?.week);
  if (!record || week <= 0) return null;

  return {
    week,
    label: asString(record.label),
    adherencePercent: asNumber(record.adherencePercent),
    mealsLogged: asNumber(record.mealsLogged),
    mealsTotal: asNumber(record.mealsTotal),
  };
}

function normalizeMealPhoto(item: unknown): MealPhoto | null {
  const record = asRecord(item);
  const id = asString(record?.id);
  if (!record || !id) return null;

  return {
    id,
    mealName: asString(record.mealName),
    photoUrl: typeof record.photoUrl === 'string' ? record.photoUrl : undefined,
    submittedAt: asString(record.submittedAt),
    note: typeof record.note === 'string' ? record.note : undefined,
    reviewedBy: typeof record.reviewedBy === 'string' ? record.reviewedBy : undefined,
    reviewedAt: typeof record.reviewedAt === 'string' ? record.reviewedAt : undefined,
    reviewNote: typeof record.reviewNote === 'string' ? record.reviewNote : undefined,
    photoUploadStatus:
      typeof record.photoUploadStatus === 'string' ? record.photoUploadStatus : undefined,
    hasPhoto: typeof record.hasPhoto === 'boolean' ? record.hasPhoto : undefined,
  };
}

function normalizeDailyAdherence(item: unknown): Patient360Summary['dailyAdherence'] | null {
  const record = asRecord(item);
  const dateIso = asString(record?.dateIso);
  if (!record || !dateIso) return null;

  return {
    dateIso,
    progressPercent: Math.max(0, Math.min(100, asNumber(record.progressPercent))),
    status: asString(record.status, 'empty'),
    lastSignalAt: typeof record.lastSignalAt === 'string' ? record.lastSignalAt : undefined,
    waterMl: Math.max(0, asNumber(record.waterMl)),
    waterGoalMl: Math.max(1, asNumber(record.waterGoalMl, 2000)),
    mealsCount: Math.max(0, asNumber(record.mealsCount)),
    mealsGoal: Math.max(1, asNumber(record.mealsGoal, 4)),
    workoutsCount: Math.max(0, asNumber(record.workoutsCount)),
    workoutsGoal: Math.max(0, asNumber(record.workoutsGoal, 1)),
    checkinRequired: asBoolean(record.checkinRequired, true),
    checkinDone: asBoolean(record.checkinDone),
    pendingCheckinsCount: Math.max(0, asNumber(record.pendingCheckinsCount)),
    mealPhotos: Array.isArray(record.mealPhotos)
      ? record.mealPhotos
          .map(normalizeMealPhoto)
          .filter((photo): photo is MealPhoto => Boolean(photo))
      : [],
  };
}

function normalizeNutritionTeamNote(item: unknown): NutritionTeamNote | null {
  const record = asRecord(item);
  const id = asString(record?.id);
  const content = asString(record?.content);
  if (!record || !id || !content) return null;

  return {
    id,
    authorName: asString(record.authorName),
    authorRole: asString(record.authorRole),
    content,
    createdAt: asString(record.createdAt),
    isInternal: asBoolean(record.isInternal, true),
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
      birthDate: '',
      cpfMasked: maskCpf(rawProfile?.cpfMasked),
      phone: maskPhone(rawProfile?.phone),
      email: maskEmail(rawProfile?.email),
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
      packageHistory: Array.isArray(asRecord(raw?.activePackage)?.packageHistory)
        ? (asRecord(raw?.activePackage)
            ?.packageHistory as Patient360Summary['activePackage']['packageHistory'])
        : undefined,
      packageEntitlements: Array.isArray(asRecord(raw?.activePackage)?.packageEntitlements)
        ? (asRecord(raw?.activePackage)
            ?.packageEntitlements as Patient360Summary['activePackage']['packageEntitlements'])
        : undefined,
      serviceUsage: Array.isArray(asRecord(raw?.activePackage)?.serviceUsage)
        ? (asRecord(raw?.activePackage)
            ?.serviceUsage as Patient360Summary['activePackage']['serviceUsage'])
        : undefined,
      packageLimits: Array.isArray(asRecord(raw?.activePackage)?.packageLimits)
        ? (asRecord(raw?.activePackage)
            ?.packageLimits as Patient360Summary['activePackage']['packageLimits'])
        : undefined,
      checkins: Array.isArray(asRecord(raw?.activePackage)?.checkins)
        ? (asRecord(raw?.activePackage)?.checkins as Patient360Summary['activePackage']['checkins'])
        : undefined,
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
    dailyAdherence: normalizeDailyAdherence(raw?.dailyAdherence),
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
      adherencePercent:
        typeof asRecord(raw?.nutritionPlan)?.adherencePercent === 'number'
          ? (asRecord(raw?.nutritionPlan)?.adherencePercent as number)
          : undefined,
      meals: Array.isArray(asRecord(raw?.nutritionPlan)?.meals)
        ? (asRecord(raw?.nutritionPlan)?.meals as unknown[])
            .map(normalizeNutritionMeal)
            .filter((item): item is NutritionMeal => Boolean(item))
        : [],
      foodGroups: Array.isArray(asRecord(raw?.nutritionPlan)?.foodGroups)
        ? (asRecord(raw?.nutritionPlan)?.foodGroups as unknown[])
            .map(normalizeNutritionFoodGroup)
            .filter((item): item is NutritionFoodGroup => Boolean(item))
        : [],
      planHistory: Array.isArray(asRecord(raw?.nutritionPlan)?.planHistory)
        ? (asRecord(raw?.nutritionPlan)?.planHistory as unknown[])
            .map(normalizeNutritionHistory)
            .filter((item): item is NutritionPlanHistory => Boolean(item))
        : [],
      mealAdherence: Array.isArray(asRecord(raw?.nutritionPlan)?.mealAdherence)
        ? (asRecord(raw?.nutritionPlan)?.mealAdherence as unknown[])
            .map(normalizeMealAdherence)
            .filter((item): item is MealAdherenceEntry => Boolean(item))
        : [],
      mealPhotos: Array.isArray(asRecord(raw?.nutritionPlan)?.mealPhotos)
        ? (asRecord(raw?.nutritionPlan)?.mealPhotos as unknown[])
            .map(normalizeMealPhoto)
            .filter((item): item is MealPhoto => Boolean(item))
        : [],
      teamNotes: Array.isArray(asRecord(raw?.nutritionPlan)?.teamNotes)
        ? (asRecord(raw?.nutritionPlan)?.teamNotes as unknown[])
            .map(normalizeNutritionTeamNote)
            .filter((item): item is NutritionTeamNote => Boolean(item))
        : [],
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
      const summary = await getMockPatient360(patientId);
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

    const unwrapped = unwrapEdgeResponse<unknown>(data);
    if (unwrapped.error) return { data: null, error: unwrapped.error };
    if (!hasPatientSummaryIdentity(unwrapped.data)) {
      return { data: null, error: patientSummaryContractError() };
    }

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
      const summary = await getMockPatient360(patientId);
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

    const unwrapped = unwrapEdgeResponse<unknown>(data);
    if (unwrapped.error) return { data: [], error: unwrapped.error };

    const list = getTimelineItems(unwrapped.data);
    if (!list) {
      return { data: [], error: patientTimelineContractError() };
    }

    const normalized = list.map(normalizeTimelineEvent);
    if (normalized.some((item) => !item)) {
      return { data: [], error: patientTimelineContractError() };
    }

    return {
      data: applyTimelineFilters(
        normalized.filter((item): item is PatientTimelineEvent => Boolean(item)),
        filters
      ),
      error: null,
    };
  } catch (error) {
    return { data: [], error: safeError(error, 'Unable to load patient timeline right now.') };
  }
}
