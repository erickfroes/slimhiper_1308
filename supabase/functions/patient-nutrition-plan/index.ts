import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': (Deno.env.get('APP_ALLOWED_ORIGINS') ?? Deno.env.get('SITE_URL') ?? Deno.env.get('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:4028').split(',')[0].trim(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value ?? fallback);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function mapFoodCategory(value: unknown) {
  const normalized = String(value ?? '').toLowerCase();
  if (
    ['fonte_proteica', 'carboidrato', 'vegetais', 'gorduras_boas', 'frutas', 'liquidos'].includes(
      normalized
    )
  ) {
    return normalized;
  }
  return 'vegetais';
}

function mapMeal(value: unknown, index: number) {
  const row = asRecord(value);
  const fallbackId = `meal-${index + 1}`;
  return {
    id: asString(row.id, fallbackId),
    name: asString(row.name, `Refeicao ${index + 1}`),
    time: asString(row.time, ''),
    targetCalories: asNumber(row.targetCalories ?? row.target_calories),
    targetProteinG: asNumber(row.targetProteinG ?? row.target_protein_g),
    targetCarbsG: asNumber(row.targetCarbsG ?? row.target_carbs_g),
    targetFatG: asNumber(row.targetFatG ?? row.target_fat_g),
    description: asString(row.description) || undefined,
  };
}

function mapFoodGroup(value: unknown) {
  const row = asRecord(value);
  return {
    label: asString(row.label, 'Grupo alimentar'),
    category: mapFoodCategory(row.category),
    portionDescription: asString(row.portionDescription ?? row.portion_description),
    dailyServings: asNumber(row.dailyServings ?? row.daily_servings),
    examples: asArray(row.examples)
      .map((item) => String(item))
      .filter(Boolean),
  };
}

function mapAdherence(value: unknown, index: number) {
  const row = asRecord(value);
  const adherencePercent = Math.max(
    0,
    Math.min(100, asNumber(row.adherencePercent ?? row.adherence_percent))
  );
  return {
    week: asNumber(row.week, index + 1),
    label: asString(row.label, `S${index + 1}`),
    adherencePercent,
    mealsLogged: Math.max(0, asNumber(row.mealsLogged ?? row.meals_logged)),
    mealsTotal: Math.max(0, asNumber(row.mealsTotal ?? row.meals_total)),
  };
}

function mapPlanStatus(value: unknown) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'active') return 'ativo';
  if (normalized === 'draft') return 'duplicado';
  return 'arquivado';
}

function mapHistoryPlan(row: Record<string, unknown>) {
  const metadata = asRecord(row.metadata);
  const createdAt = asIsoDate(row.created_at, new Date(0).toISOString());
  return {
    id: String(row.id ?? ''),
    planName: asString(row.name, 'Plano alimentar'),
    createdAt,
    archivedAt: asString(row.archived_at) || undefined,
    nutritionistName: asString(
      metadata.nutritionistName ?? metadata.nutritionist_name,
      'Equipe de Nutricao'
    ),
    targetCalories: asNumber(row.target_calories),
    status: mapPlanStatus(row.status),
    notes: asString(metadata.notes ?? metadata.summary) || undefined,
  };
}

function mapTeamNote(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    authorName: asString(row.author_name, 'Equipe de Nutricao'),
    authorRole: asString(row.author_role, 'Nutricionista'),
    content: asString(row.content),
    createdAt: asIsoDate(row.created_at, new Date(0).toISOString()),
    isInternal: asBoolean(row.is_internal, true),
  };
}

function mapDailyMealPhoto(value: unknown) {
  const row = asRecord(value);
  return {
    id: String(row.id ?? ''),
    mealName: asString(row.mealName ?? row.meal_name, 'Refeicao'),
    submittedAt: asIsoDate(row.submittedAt ?? row.submitted_at, new Date(0).toISOString()),
    note: asString(row.note) || undefined,
    photoUploadStatus: asString(row.photoUploadStatus ?? row.photo_upload_status, 'uploaded'),
    hasPhoto: asBoolean(row.hasPhoto ?? row.has_photo, true),
    reviewedAt: asString(row.reviewedAt ?? row.reviewed_at) || undefined,
    reviewNote: asString(row.reviewNote ?? row.review_note) || undefined,
  };
}

function emptyPlan(patientId: string, patientCreatedAt: string, updatedAt: string) {
  return {
    id: `nutrition-${patientId}`,
    patientId,
    planName: 'Sem plano alimentar ativo',
    targetCalories: 0,
    targetProteinG: 0,
    targetCarbsG: 0,
    targetFatG: 0,
    createdAt: patientCreatedAt,
    updatedAt,
    nutritionistName: 'Equipe de Nutricao',
    isActive: false,
    meals: [],
    foodGroups: [],
    planHistory: [],
    mealAdherence: [],
    mealPhotos: [],
    teamNotes: [],
  };
}

function mapActivePlan(params: {
  row: Record<string, unknown>;
  patientId: string;
  history: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  mealPhotoRows?: unknown[];
}) {
  const { row, patientId, history, notes, mealPhotoRows } = params;
  const metadata = asRecord(row.metadata);
  const mealAdherence = asArray(row.meal_adherence).map(mapAdherence);
  const mealPhotos = asArray(mealPhotoRows)
    .map(mapDailyMealPhoto)
    .filter((photo) => photo.id);
  const adherencePercent =
    typeof metadata.adherencePercent === 'number' || typeof metadata.adherence_percent === 'number'
      ? Math.max(
          0,
          Math.min(100, asNumber(metadata.adherencePercent ?? metadata.adherence_percent))
        )
      : mealAdherence.length
        ? Math.round(
            mealAdherence.reduce((sum, entry) => sum + entry.adherencePercent, 0) /
              mealAdherence.length
          )
        : undefined;

  return {
    id: String(row.id ?? ''),
    patientId,
    planName: asString(row.name, 'Plano alimentar'),
    targetCalories: asNumber(row.target_calories),
    targetProteinG: asNumber(row.target_protein_g),
    targetCarbsG: asNumber(row.target_carbs_g),
    targetFatG: asNumber(row.target_fat_g),
    createdAt: asIsoDate(row.created_at, new Date(0).toISOString()),
    updatedAt: asIsoDate(row.updated_at, new Date(0).toISOString()),
    nutritionistName: asString(
      metadata.nutritionistName ?? metadata.nutritionist_name,
      'Equipe de Nutricao'
    ),
    isActive: row.status === 'active',
    adherencePercent,
    meals: asArray(row.meals).map(mapMeal),
    foodGroups: asArray(row.food_groups).map(mapFoodGroup),
    planHistory: history.map(mapHistoryPlan),
    mealAdherence,
    mealPhotos,
    teamNotes: notes.map(mapTeamNote).filter((note) => note.content),
  };
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      error: { code: 'method_not_allowed', message: 'Only POST is allowed.' },
      meta: { timestamp },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized', message: 'Missing bearer token.' },
        meta: { timestamp },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) {
      console.error('[patient-nutrition-plan] missing environment configuration');
      return jsonResponse(500, {
        ok: false,
        error: { code: 'server_misconfigured', message: 'Server configuration error.' },
        meta: { timestamp },
      });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized', message: 'Invalid or expired token.' },
        meta: { timestamp },
      });
    }

    const body = await req.json().catch(() => null);
    const patientId = typeof body?.patient_id === 'string' ? body.patient_id.trim() : '';
    if (!patientId) {
      return jsonResponse(400, {
        ok: false,
        error: { code: 'invalid_request', message: 'patient_id is required.' },
        meta: { timestamp },
      });
    }

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, tenant_id, created_at, updated_at')
      .eq('id', patientId)
      .maybeSingle();

    if (patientError) throw patientError;
    if (!patient) {
      return jsonResponse(404, {
        ok: false,
        error: { code: 'not_found', message: 'Patient not found.' },
        meta: { timestamp },
      });
    }

    const tenantId = String(patient.tenant_id ?? '');
    const { data: membership, error: membershipError } = await supabase
      .from('tenant_memberships')
      .select('tenant_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'No active tenant membership.' },
        meta: { timestamp, tenant_id: tenantId },
      });
    }

    const { data: canRead, error: permissionError } = await supabase.rpc(
      'has_clinical_permission',
      {
        p_tenant_id: tenantId,
        p_permission: 'nutrition.read',
      }
    );

    if (permissionError) throw permissionError;
    if (canRead !== true) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing nutrition.read permission.' },
        meta: { timestamp, tenant_id: tenantId },
      });
    }

    const [activePlanResult, historyResult, dailySummaryResult] = await Promise.all([
      supabase
        .from('nutrition_plans')
        .select(
          'id,tenant_id,patient_id,status,name,target_calories,target_protein_g,target_carbs_g,target_fat_g,meals,food_groups,meal_adherence,metadata,created_at,updated_at,archived_at'
        )
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('nutrition_plans')
        .select('id,status,name,target_calories,metadata,created_at,updated_at,archived_at')
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(6),
      supabase.rpc('get_clinic_patient_daily_summary', {
        p_patient_id: patientId,
        p_target_date: null,
      }),
    ]);

    if (activePlanResult.error || historyResult.error || dailySummaryResult.error) {
      throw activePlanResult.error ?? historyResult.error ?? dailySummaryResult.error;
    }

    const activePlan = activePlanResult.data ?? null;
    const historyRows = historyResult.data ?? [];
    const dailySummary = asRecord(dailySummaryResult.data);
    const mealPhotoRows = asArray(dailySummary.mealPhotos);

    if (!activePlan) {
      return jsonResponse(200, {
        ok: true,
        data: {
          ...emptyPlan(patientId, String(patient.created_at), String(patient.updated_at)),
          planHistory: historyRows.map((row) => mapHistoryPlan(row as Record<string, unknown>)),
          mealPhotos: mealPhotoRows.map(mapDailyMealPhoto).filter((photo) => photo.id),
        },
        meta: { tenantId, timestamp },
      });
    }

    const { data: noteRows, error: notesError } = await supabase
      .from('nutrition_plan_notes')
      .select('id,author_name,author_role,content,is_internal,created_at')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .eq('nutrition_plan_id', activePlan.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (notesError) throw notesError;

    return jsonResponse(200, {
      ok: true,
      data: mapActivePlan({
        row: activePlan as Record<string, unknown>,
        patientId,
        history: historyRows as Record<string, unknown>[],
        notes: (noteRows ?? []) as Record<string, unknown>[],
        mealPhotoRows,
      }),
      meta: { tenantId, timestamp },
    });
  } catch (error) {
    console.error('[patient-nutrition-plan] unexpected_error', {
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
