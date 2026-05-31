import type {
  MealAdherenceEntry,
  MealPhoto,
  NutritionFoodGroup,
  NutritionMeal,
  NutritionPlanHistory,
  NutritionTeamNote,
  PatientNutritionPlanSummary,
} from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

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
};

const isMockEnabled = () => process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
const getSupabaseClient = () => createBrowserSupabaseClient();

async function getMockPatient360(patientId: string) {
  const { getPatient360 } = await import('@/services/mockApi');
  return getPatient360(patientId);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) return { message: fallback, details: error.message };
  return { message: fallback };
}

function unwrapEdgeResponse<T>(response: unknown): {
  data: T | null;
  error: SafeServiceError | null;
} {
  if (response && typeof response === 'object' && 'ok' in response) {
    const envelope = response as EdgeResponseEnvelope<T>;
    if (envelope.ok === true) return { data: (envelope.data ?? null) as T | null, error: null };
    return {
      data: null,
      error: {
        message:
          envelope.error?.message ?? envelope.error?.code ?? 'Falha ao carregar plano alimentar.',
        code: envelope.error?.code,
      },
    };
  }

  return { data: response as T, error: null };
}

function normalizeMeal(value: unknown): NutritionMeal | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const name = asString(record.name);
  if (!id || !name) return null;
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

function normalizeFoodGroup(value: unknown): NutritionFoodGroup | null {
  const record = asRecord(value);
  const label = asString(record.label);
  const category = asString(record.category) as NutritionFoodGroup['category'];
  if (!label || !category) return null;
  return {
    label,
    category,
    portionDescription: asString(record.portionDescription),
    dailyServings: asNumber(record.dailyServings),
    examples: asArray(record.examples).filter((item): item is string => typeof item === 'string'),
  };
}

function normalizeHistory(value: unknown): NutritionPlanHistory | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
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

function normalizeAdherence(value: unknown): MealAdherenceEntry | null {
  const record = asRecord(value);
  const week = asNumber(record.week);
  if (week <= 0) return null;
  return {
    week,
    label: asString(record.label),
    adherencePercent: asNumber(record.adherencePercent),
    mealsLogged: asNumber(record.mealsLogged),
    mealsTotal: asNumber(record.mealsTotal),
  };
}

function normalizePhoto(value: unknown): MealPhoto | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const photoUrl = asString(record.photoUrl);
  if (!id || !photoUrl) return null;
  return {
    id,
    mealName: asString(record.mealName),
    photoUrl,
    submittedAt: asString(record.submittedAt),
    note: typeof record.note === 'string' ? record.note : undefined,
    reviewedBy: typeof record.reviewedBy === 'string' ? record.reviewedBy : undefined,
    reviewNote: typeof record.reviewNote === 'string' ? record.reviewNote : undefined,
  };
}

function normalizeTeamNote(value: unknown): NutritionTeamNote | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const content = asString(record.content);
  if (!id || !content) return null;
  return {
    id,
    authorName: asString(record.authorName),
    authorRole: asString(record.authorRole),
    content,
    createdAt: asString(record.createdAt),
    isInternal: asBoolean(record.isInternal, true),
  };
}

function normalizeNutritionPlan(
  payload: unknown,
  patientId: string
): PatientNutritionPlanSummary | null {
  const record = asRecord(payload);
  const id = asString(record.id);
  const planPatientId = asString(record.patientId, patientId);
  const planName = asString(record.planName);

  if (!id || !planPatientId || !planName) return null;

  return {
    id,
    patientId: planPatientId,
    planName,
    targetCalories: asNumber(record.targetCalories),
    targetProteinG: asNumber(record.targetProteinG),
    targetCarbsG: asNumber(record.targetCarbsG),
    targetFatG: asNumber(record.targetFatG),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
    nutritionistName: asString(record.nutritionistName),
    isActive: asBoolean(record.isActive),
    adherencePercent:
      typeof record.adherencePercent === 'number' ? record.adherencePercent : undefined,
    meals: asArray(record.meals)
      .map(normalizeMeal)
      .filter((item): item is NutritionMeal => Boolean(item)),
    foodGroups: asArray(record.foodGroups)
      .map(normalizeFoodGroup)
      .filter((item): item is NutritionFoodGroup => Boolean(item)),
    planHistory: asArray(record.planHistory)
      .map(normalizeHistory)
      .filter((item): item is NutritionPlanHistory => Boolean(item)),
    mealAdherence: asArray(record.mealAdherence)
      .map(normalizeAdherence)
      .filter((item): item is MealAdherenceEntry => Boolean(item)),
    mealPhotos: asArray(record.mealPhotos)
      .map(normalizePhoto)
      .filter((item): item is MealPhoto => Boolean(item)),
    teamNotes: asArray(record.teamNotes)
      .map(normalizeTeamNote)
      .filter((item): item is NutritionTeamNote => Boolean(item)),
  };
}

export async function getPatientNutritionPlan(
  patientId: string
): Promise<{ data: PatientNutritionPlanSummary | null; error: SafeServiceError | null }> {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para carregar nutricao.' } };
  }

  try {
    if (isMockEnabled()) {
      const summary = await getMockPatient360(patientId);
      return { data: summary?.nutritionPlan ?? null, error: null };
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('patient-nutrition-plan', {
      body: { patient_id: patientId },
    });

    if (error) {
      return {
        data: null,
        error: {
          message: 'Falha ao carregar plano alimentar.',
          code: error.name,
          details: error.message,
        },
      };
    }

    const unwrapped = unwrapEdgeResponse<unknown>(data);
    if (unwrapped.error) return { data: null, error: unwrapped.error };

    const plan = normalizeNutritionPlan(unwrapped.data, patientId);
    if (!plan) {
      return {
        data: null,
        error: {
          message: 'Contrato invalido do plano alimentar retornado pela Edge Function.',
          code: 'invalid_nutrition_contract',
        },
      };
    }

    return { data: plan, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel carregar nutricao.') };
  }
}
