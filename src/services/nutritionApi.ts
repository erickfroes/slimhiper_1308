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
  if (!id) return null;
  return {
    id,
    mealName: asString(record.mealName),
    photoUrl: asString(record.photoUrl) || undefined,
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

export async function getMealPhotoSignedUrl(
  patientId: string,
  mealEntryId: string
): Promise<{
  data: { url: string; expiresInSeconds: number } | null;
  error: SafeServiceError | null;
}> {
  if (!patientId.trim() || !mealEntryId.trim()) {
    return { data: null, error: { message: 'Foto invalida para visualizacao.' } };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('meal-photo-signed-url', {
      body: {
        patient_id: patientId,
        meal_entry_id: mealEntryId,
      },
    });

    if (error) {
      return {
        data: null,
        error: {
          message: 'Falha ao gerar URL segura da foto.',
          code: error.name,
          details: error.message,
        },
      };
    }

    const unwrapped = unwrapEdgeResponse<unknown>(data);
    if (unwrapped.error) return { data: null, error: unwrapped.error };

    const record = asRecord(unwrapped.data);
    const url = asString(record.url);
    const expiresInSeconds = asNumber(record.expiresInSeconds, 300);
    if (!url) {
      return {
        data: null,
        error: {
          message: 'Contrato invalido da URL segura retornada pela Edge Function.',
          code: 'invalid_meal_photo_url_contract',
        },
      };
    }

    return { data: { url, expiresInSeconds }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel abrir a foto.') };
  }
}

export type NutritionPlanMutationInput = {
  patientId: string;
  planId?: string | null;
  planName: string;
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  meals?: NutritionMeal[];
  foodGroups?: NutritionFoodGroup[];
  publish?: boolean;
};

export async function savePatientNutritionPlan(input: NutritionPlanMutationInput): Promise<{
  data: { id: string; status: string } | null;
  error: SafeServiceError | null;
}> {
  if (!input.patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para salvar nutricao.' } };
  }
  if (!input.planName.trim()) {
    return { data: null, error: { message: 'Informe o nome do plano alimentar.' } };
  }

  try {
    if (isMockEnabled()) {
      return {
        data: { id: input.planId ?? `mock-nutrition-${Date.now()}`, status: 'active' },
        error: null,
      };
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('save_patient_nutrition_plan', {
      p_patient_id: input.patientId,
      p_plan_id: input.planId ?? null,
      p_publish: input.publish ?? true,
      p_payload: {
        planName: input.planName,
        targetCalories: Math.max(0, Math.round(input.targetCalories)),
        targetProteinG: Math.max(0, input.targetProteinG),
        targetCarbsG: Math.max(0, input.targetCarbsG),
        targetFatG: Math.max(0, input.targetFatG),
        meals: input.meals ?? [],
        foodGroups: input.foodGroups ?? [],
      },
    });
    if (error) return { data: null, error: safeError(error, 'Nao foi possivel salvar nutricao.') };
    return { data: data as { id: string; status: string }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel salvar nutricao.') };
  }
}

export async function archivePatientNutritionPlan(planId: string): Promise<{
  data: { id: string; status: string } | null;
  error: SafeServiceError | null;
}> {
  if (!planId.trim()) {
    return { data: null, error: { message: 'Plano invalido para arquivar.' } };
  }

  try {
    if (isMockEnabled()) return { data: { id: planId, status: 'archived' }, error: null };
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('archive_patient_nutrition_plan', {
      p_plan_id: planId,
    });
    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel arquivar nutricao.') };
    }
    return { data: data as { id: string; status: string }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel arquivar nutricao.') };
  }
}
