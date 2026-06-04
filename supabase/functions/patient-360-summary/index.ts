import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

type TimelineEventType =
  | 'consulta'
  | 'nutricao'
  | 'medicamento'
  | 'medida'
  | 'documento'
  | 'pagamento'
  | 'alerta'
  | 'mensagem'
  | 'inicio_programa'
  | 'meta_atingida'
  | 'lead_criado'
  | 'lead_convertido'
  | 'pacote_vendido'
  | 'contrato_assinado'
  | 'paciente_cadastrado'
  | 'consulta_agendada'
  | 'checkin_realizado'
  | 'atendimento_iniciado'
  | 'atendimento_concluido'
  | 'anamnese_preenchida'
  | 'soap_atualizado'
  | 'medida_registrada'
  | 'exame_solicitado'
  | 'exame_resultado_recebido'
  | 'plano_alimentar_publicado'
  | 'prescricao_emitida'
  | 'documento_gerado'
  | 'documento_assinado'
  | 'pagamento_recebido'
  | 'pagamento_atrasado'
  | 'mensagem_enviada'
  | 'checkin_semanal_enviado';

type TimelineEventCategory =
  | 'clinical'
  | 'financial'
  | 'documents'
  | 'agenda'
  | 'communication'
  | 'patient_app'
  | 'commercial';

const VALID_EVENT_TYPES: Set<TimelineEventType> = new Set([
  'consulta',
  'nutricao',
  'medicamento',
  'medida',
  'documento',
  'pagamento',
  'alerta',
  'mensagem',
  'inicio_programa',
  'meta_atingida',
  'lead_criado',
  'lead_convertido',
  'pacote_vendido',
  'contrato_assinado',
  'paciente_cadastrado',
  'consulta_agendada',
  'checkin_realizado',
  'atendimento_iniciado',
  'atendimento_concluido',
  'anamnese_preenchida',
  'soap_atualizado',
  'medida_registrada',
  'exame_solicitado',
  'exame_resultado_recebido',
  'plano_alimentar_publicado',
  'prescricao_emitida',
  'documento_gerado',
  'documento_assinado',
  'pagamento_recebido',
  'pagamento_atrasado',
  'mensagem_enviada',
  'checkin_semanal_enviado',
]);

const VALID_EVENT_CATEGORIES: Set<TimelineEventCategory> = new Set([
  'clinical',
  'financial',
  'documents',
  'agenda',
  'communication',
  'patient_app',
  'commercial',
]);

function mapEventType(value: unknown): TimelineEventType {
  if (typeof value === 'string' && VALID_EVENT_TYPES.has(value as TimelineEventType))
    return value as TimelineEventType;
  return 'mensagem';
}

function mapEventCategory(value: unknown): TimelineEventCategory {
  if (typeof value === 'string' && VALID_EVENT_CATEGORIES.has(value as TimelineEventCategory))
    return value as TimelineEventCategory;
  return 'clinical';
}

function safeDate(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function mapEventDate(eventAt: unknown, createdAt: unknown): string {
  return safeDate(eventAt) ?? safeDate(createdAt) ?? new Date(0).toISOString();
}

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function calculateAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = today.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age >= 0 ? age : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value ?? fallback);
  return Number.isFinite(numberValue) ? numberValue : fallback;
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

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function maskEmail(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain) return '';
  const visiblePrefix = localPart.slice(0, 2);
  return `${visiblePrefix}${localPart.length > 2 ? '***' : '*'}@${domain}`;
}

function maskPhone(value: string | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `(**) *****-${digits.slice(-4)}`;
}

function maskCpf(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '***.***.***-**';
  const digits = normalized.replace(/\D/g, '');
  if (digits.length >= 2) return `***.***.***-${digits.slice(-2)}`;
  return '***.***.***-**';
}

function mapAppointmentType(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'retorno' || normalized === 'follow_up') return 'retorno';
  if (normalized === 'nutricao' || normalized === 'consulta_nutricao') return 'nutricao';
  if (normalized === 'avaliacao_inicial' || normalized === 'initial_assessment') {
    return 'avaliacao_inicial';
  }
  if (normalized === 'bioimpedancia' || normalized === 'bioimpedance') return 'bioimpedancia';
  if (normalized === 'checkup') return 'checkup';
  return 'consulta_medica';
}

function mapAppointmentStatus(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'scheduled' || normalized === 'agendado') return 'agendado';
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

function mapProgramType(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase();
  if (
    ['emagrecimento', 'hipertrofia', 'recomposicao', 'saude_metabolica', 'longevidade'].includes(
      normalized
    )
  ) {
    return normalized;
  }
  return 'saude_metabolica';
}

function mapPackageStatus(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase();
  if (['ativo', 'pausado', 'concluido', 'cancelado', 'aguardando'].includes(normalized)) {
    return normalized;
  }
  return 'aguardando';
}

function mapPrescriptionStatus(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'final' || normalized === 'active' || normalized === 'ativo') return 'ativo';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'cancelado') {
    return 'cancelado';
  }
  return 'rascunho';
}

function mapPrescriptionSummary(row: Record<string, unknown>, patientId: string) {
  const status = String(row.status ?? '');
  const prescriptionText = typeof row.prescription_text === 'string' ? row.prescription_text : '';
  const instructions = typeof row.instructions === 'string' ? row.instructions : '';

  return {
    id: String(row.id ?? ''),
    patientId,
    medicationName:
      typeof row.medication_name === 'string' && row.medication_name.trim()
        ? row.medication_name
        : 'Prescricao registrada',
    dosage:
      typeof row.dosage === 'string' && row.dosage.trim()
        ? row.dosage
        : prescriptionText || 'Conforme orientacao',
    frequency:
      typeof row.frequency === 'string' && row.frequency.trim()
        ? row.frequency
        : 'Conforme orientacao',
    startDate:
      typeof row.start_date === 'string'
        ? row.start_date
        : typeof row.created_at === 'string'
          ? row.created_at
          : new Date(0).toISOString(),
    endDate: typeof row.end_date === 'string' ? row.end_date : undefined,
    prescribedBy: 'Equipe medica',
    isActive: status === 'final',
    notes: instructions || prescriptionText || undefined,
    status: mapPrescriptionStatus(status),
    issueDate: typeof row.created_at === 'string' ? row.created_at : undefined,
    validity: typeof row.end_date === 'string' ? row.end_date : undefined,
    signatureStatus: 'nao_requerido',
  };
}

function mapFoodCategory(value: unknown): string {
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

function mapNutritionMeal(value: unknown, index: number) {
  const row = asRecord(value);
  return {
    id: asString(row.id, `meal-${index + 1}`),
    name: asString(row.name, `Refeicao ${index + 1}`),
    time: asString(row.time),
    targetCalories: asNumber(row.targetCalories ?? row.target_calories),
    targetProteinG: asNumber(row.targetProteinG ?? row.target_protein_g),
    targetCarbsG: asNumber(row.targetCarbsG ?? row.target_carbs_g),
    targetFatG: asNumber(row.targetFatG ?? row.target_fat_g),
    description: asString(row.description) || undefined,
  };
}

function mapNutritionFoodGroup(value: unknown) {
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

function mapNutritionAdherence(value: unknown, index: number) {
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

function mapNutritionHistoryStatus(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'active') return 'ativo';
  if (normalized === 'draft') return 'duplicado';
  return 'arquivado';
}

function mapNutritionPlanHistory(row: Record<string, unknown>) {
  const metadata = asRecord(row.metadata);
  return {
    id: String(row.id ?? ''),
    planName: asString(row.name, 'Plano alimentar'),
    createdAt: asString(row.created_at, new Date(0).toISOString()),
    archivedAt: asString(row.archived_at) || undefined,
    nutritionistName: asString(
      metadata.nutritionistName ?? metadata.nutritionist_name,
      'Equipe de Nutricao'
    ),
    targetCalories: asNumber(row.target_calories),
    status: mapNutritionHistoryStatus(row.status),
    notes: asString(metadata.notes ?? metadata.summary) || undefined,
  };
}

function mapNutritionTeamNote(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    authorName: asString(row.author_name, 'Equipe de Nutricao'),
    authorRole: asString(row.author_role, 'Nutricionista'),
    content: asString(row.content),
    createdAt: asString(row.created_at, new Date(0).toISOString()),
    isInternal: asBoolean(row.is_internal, true),
  };
}

function mapNutritionPlan(params: {
  row: Record<string, unknown> | null;
  patientId: string;
  patientCreatedAt: string;
  lastUpdate: string;
  historyRows: Record<string, unknown>[];
  noteRows: Record<string, unknown>[];
}) {
  const { row, patientId, patientCreatedAt, lastUpdate, historyRows, noteRows } = params;

  if (!row) {
    return {
      id: `nutrition-${patientId}`,
      patientId,
      planName: 'Sem plano alimentar ativo',
      targetCalories: 0,
      targetProteinG: 0,
      targetCarbsG: 0,
      targetFatG: 0,
      createdAt: patientCreatedAt,
      updatedAt: lastUpdate,
      nutritionistName: 'Equipe de Nutricao',
      isActive: false,
      meals: [],
      foodGroups: [],
      planHistory: historyRows.map(mapNutritionPlanHistory),
      mealAdherence: [],
      mealPhotos: [],
      teamNotes: [],
    };
  }

  const metadata = asRecord(row.metadata);
  const mealAdherence = asArray(row.meal_adherence).map(mapNutritionAdherence);
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
    createdAt: asString(row.created_at, patientCreatedAt),
    updatedAt: asString(row.updated_at, lastUpdate),
    nutritionistName: asString(
      metadata.nutritionistName ?? metadata.nutritionist_name,
      'Equipe de Nutricao'
    ),
    isActive: row.status === 'active',
    adherencePercent,
    meals: asArray(row.meals).map(mapNutritionMeal),
    foodGroups: asArray(row.food_groups).map(mapNutritionFoodGroup),
    planHistory: historyRows.map(mapNutritionPlanHistory),
    mealAdherence,
    mealPhotos: [],
    teamNotes: noteRows.map(mapNutritionTeamNote).filter((note) => note.content),
  };
}

function safeTimelinePayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;
  const allowedKeys = [
    'title',
    'description',
    'summary',
    'status',
    'type',
    'category',
    'scheduledAt',
    'location',
    'channel',
    'professionalName',
    'referenceId',
  ];

  const sanitized: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (source[key] !== undefined) sanitized[key] = source[key];
  }
  return Object.keys(sanitized).length ? sanitized : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      error: { code: 'method_not_allowed', message: 'Only POST is allowed.' },
      meta: { timestamp: new Date().toISOString() },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized', message: 'Missing bearer token.' },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) {
      console.error('[patient-360-summary] missing environment configuration');
      return jsonResponse(500, {
        ok: false,
        error: { code: 'server_misconfigured', message: 'Server configuration error.' },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized', message: 'Invalid or expired token.' },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    const body = await req.json().catch(() => null);
    const patientId = typeof body?.patient_id === 'string' ? body.patient_id.trim() : '';
    if (!patientId) {
      return jsonResponse(400, {
        ok: false,
        error: { code: 'invalid_request', message: 'patient_id is required.' },
        meta: { timestamp: new Date().toISOString(), userId: authData.user.id },
      });
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from('tenant_memberships')
      .select('tenant_id, role_code, status')
      .eq('user_id', authData.user.id)
      .eq('status', 'active');

    if (membershipsError) throw membershipsError;

    const tenantIds = (memberships ?? []).map((m) => m.tenant_id).filter(Boolean);
    if (!tenantIds.length) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'No active tenant membership.' },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    const permissionsByTenant = new Map<string, Set<string>>();
    for (const tenantId of tenantIds) {
      const checks = await Promise.all([
        supabase.rpc('has_permission', { p_tenant_id: tenantId, p_permission: 'patients.read' }),
        supabase.rpc('has_permission', { p_tenant_id: tenantId, p_permission: 'soap.read' }),
        supabase.rpc('has_permission', {
          p_tenant_id: tenantId,
          p_permission: 'prescriptions.read',
        }),
        supabase.rpc('has_permission', { p_tenant_id: tenantId, p_permission: 'packages.read' }),
        supabase.rpc('has_permission', { p_tenant_id: tenantId, p_permission: 'chat.read' }),
        supabase.rpc('has_clinical_permission', {
          p_tenant_id: tenantId,
          p_permission: 'nutrition.read',
        }),
      ]);

      const set = new Set<string>();
      if (
        checks[0].error ||
        checks[1].error ||
        checks[2].error ||
        checks[3].error ||
        checks[4].error ||
        checks[5].error
      ) {
        throw (
          checks[0].error ??
          checks[1].error ??
          checks[2].error ??
          checks[3].error ??
          checks[4].error ??
          checks[5].error
        );
      }
      if (checks[0].data === true) set.add('patients.read');
      if (checks[1].data === true) set.add('soap.read');
      if (checks[2].data === true) set.add('prescriptions.read');
      if (checks[3].data === true) set.add('packages.read');
      if (checks[4].data === true) set.add('chat.read');
      if (checks[5].data === true) set.add('nutrition.read');
      permissionsByTenant.set(tenantId, set);
    }

    const readableTenants = tenantIds.filter((t) =>
      permissionsByTenant.get(t)?.has('patients.read')
    );
    if (!readableTenants.length) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing patients.read permission.' },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, tenant_id, status, preferred_name, created_at, updated_at')
      .eq('id', patientId)
      .in('tenant_id', readableTenants)
      .maybeSingle();

    if (patientError) throw patientError;
    if (!patient) {
      return jsonResponse(404, {
        ok: false,
        error: { code: 'not_found', message: 'Patient not found.' },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    const tenantPermissions = permissionsByTenant.get(patient.tenant_id) ?? new Set<string>();
    return await buildAndReturnSummary({ supabase, patient, patientId, tenantPermissions });
  } catch (error) {
    console.error('[patient-360-summary] unexpected_error', {
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp: new Date().toISOString() },
    });
  }
});

async function buildAndReturnSummary({
  supabase,
  patient,
  patientId,
  tenantPermissions,
}: {
  supabase: ReturnType<typeof createClient>;
  patient: {
    id: string;
    tenant_id: string;
    status: string;
    preferred_name: string | null;
    created_at: string;
    updated_at: string;
  };
  patientId: string;
  tenantPermissions: Set<string>;
}) {
  const [
    piiRes,
    alertsRes,
    tasksRes,
    appointmentsRes,
    timelineRes,
    latestSoapRes,
    prescriptionsRes,
    packageEnrollmentRes,
    chatThreadRes,
    latestChatMessageRes,
    nutritionPlanRes,
  ] = await Promise.all([
    supabase
      .from('patient_pii')
      .select('full_name, email, phone, cpf_masked, birth_date, sex_gender, updated_at')
      .eq('patient_id', patientId)
      .eq('tenant_id', patient.tenant_id)
      .maybeSingle(),
    supabase
      .from('patient_alerts')
      .select(
        'id, alert_type, title, description, severity, starts_at, ends_at, status, updated_at'
      )
      .eq('patient_id', patientId)
      .eq('tenant_id', patient.tenant_id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('patient_tasks')
      .select('id, title, details, due_at, status, assigned_to, updated_at')
      .eq('patient_id', patientId)
      .eq('tenant_id', patient.tenant_id)
      .order('due_at', { ascending: true })
      .limit(20),
    supabase
      .from('appointments')
      .select(
        'id, scheduled_at, duration_minutes, status, location, practitioner_id, notes, updated_at'
      )
      .eq('patient_id', patientId)
      .eq('tenant_id', patient.tenant_id)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10),
    supabase
      .from('patient_timeline_events')
      .select(
        'id, patient_id, event_type, category, title, description, actor_name, status, status_label, action_label, details_href, event_at, created_at, payload, updated_at'
      )
      .eq('patient_id', patientId)
      .eq('tenant_id', patient.tenant_id)
      .order('event_at', { ascending: false })
      .limit(25),
    tenantPermissions.has('soap.read')
      ? supabase
          .from('soap_notes')
          .select(
            'id, status, subjective, objective, assessment, plan, authored_by, updated_at, created_at'
          )
          .eq('patient_id', patientId)
          .eq('tenant_id', patient.tenant_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    tenantPermissions.has('prescriptions.read')
      ? supabase
          .from('prescriptions_placeholder')
          .select(
            'id, status, prescription_text, medication_name, dosage, frequency, instructions, start_date, end_date, created_by, created_at, updated_at'
          )
          .eq('patient_id', patientId)
          .eq('tenant_id', patient.tenant_id)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null, error: null }),
    tenantPermissions.has('packages.read')
      ? supabase
          .from('patient_program_enrollments')
          .select(
            'id, program_id, status, start_date, end_date, current_week, total_consultations, used_consultations, total_nutrition_sessions, used_nutrition_sessions, metadata, created_at, updated_at'
          )
          .eq('patient_id', patientId)
          .eq('tenant_id', patient.tenant_id)
          .in('status', ['ativo', 'pausado', 'aguardando'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    tenantPermissions.has('chat.read')
      ? supabase
          .from('patient_chat_threads')
          .select('id, status, last_message_at, unread_count, metadata, created_at, updated_at')
          .eq('patient_id', patientId)
          .eq('tenant_id', patient.tenant_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    tenantPermissions.has('chat.read')
      ? supabase
          .from('patient_chat_messages')
          .select('id, sender_label, body, metadata, created_at')
          .eq('patient_id', patientId)
          .eq('tenant_id', patient.tenant_id)
          .order('created_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null, error: null }),
    tenantPermissions.has('nutrition.read')
      ? supabase
          .from('nutrition_plans')
          .select(
            'id,tenant_id,patient_id,status,name,target_calories,target_protein_g,target_carbs_g,target_fat_g,meals,food_groups,meal_adherence,metadata,created_at,updated_at,archived_at'
          )
          .eq('patient_id', patientId)
          .eq('tenant_id', patient.tenant_id)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const queryErrors = [
    piiRes.error,
    alertsRes.error,
    tasksRes.error,
    appointmentsRes.error,
    timelineRes.error,
    latestSoapRes.error,
    prescriptionsRes.error,
    packageEnrollmentRes.error,
    chatThreadRes.error,
    latestChatMessageRes.error,
    nutritionPlanRes.error,
  ].filter(Boolean);
  if (queryErrors.length) throw queryErrors[0];

  const packageEnrollment = packageEnrollmentRes.data ?? null;
  const [
    packageProgramRes,
    packageServicesRes,
    packageEntitlementsRes,
    packageCheckinsRes,
    packageRequiredDocumentsRes,
  ] =
    packageEnrollment?.program_id && tenantPermissions.has('packages.read')
      ? await Promise.all([
          supabase
            .from('programs')
            .select('id, name, program_type, duration_weeks, checkins_total, checkin_frequency, updated_at')
            .eq('id', packageEnrollment.program_id)
            .eq('tenant_id', patient.tenant_id)
            .maybeSingle(),
          supabase
            .from('program_services')
            .select('id, label, quantity, unit, metadata')
            .eq('program_id', packageEnrollment.program_id)
            .eq('tenant_id', patient.tenant_id)
            .order('created_at', { ascending: true }),
          supabase
            .from('program_entitlements')
            .select('id, key, label, enabled')
            .eq('program_id', packageEnrollment.program_id)
            .eq('tenant_id', patient.tenant_id)
            .order('created_at', { ascending: true }),
          supabase
            .from('patient_program_checkins')
            .select('id, title, status, due_date, completed_at, channel')
            .eq('enrollment_id', packageEnrollment.id)
            .eq('patient_id', patientId)
            .eq('tenant_id', patient.tenant_id)
            .order('due_date', { ascending: false })
            .limit(12),
          supabase
            .from('program_required_documents')
            .select('id, label, required')
            .eq('program_id', packageEnrollment.program_id)
            .eq('tenant_id', patient.tenant_id)
            .order('created_at', { ascending: true }),
        ])
      : [
          { data: null, error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];

  if (
    packageProgramRes.error ||
    packageServicesRes.error ||
    packageEntitlementsRes.error ||
    packageCheckinsRes.error ||
    packageRequiredDocumentsRes.error
  ) {
    throw (
      packageProgramRes.error ??
      packageServicesRes.error ??
      packageEntitlementsRes.error ??
      packageCheckinsRes.error ??
      packageRequiredDocumentsRes.error
    );
  }

  const packageProgram = packageProgramRes.data ?? null;
  const packageServices = Array.isArray(packageServicesRes.data) ? packageServicesRes.data : [];
  const packageEntitlements = Array.isArray(packageEntitlementsRes.data)
    ? packageEntitlementsRes.data
    : [];
  const packageCheckins = Array.isArray(packageCheckinsRes.data) ? packageCheckinsRes.data : [];
  const packageRequiredDocuments = Array.isArray(packageRequiredDocumentsRes.data)
    ? packageRequiredDocumentsRes.data
    : [];
  const nutritionPlanRow = nutritionPlanRes.data ?? null;

  const [nutritionHistoryRes, nutritionNotesRes] = tenantPermissions.has('nutrition.read')
    ? await Promise.all([
        supabase
          .from('nutrition_plans')
          .select('id,status,name,target_calories,metadata,created_at,updated_at,archived_at')
          .eq('patient_id', patientId)
          .eq('tenant_id', patient.tenant_id)
          .order('created_at', { ascending: false })
          .limit(6),
        nutritionPlanRow?.id
          ? supabase
              .from('nutrition_plan_notes')
              .select('id,author_name,author_role,content,is_internal,created_at')
              .eq('tenant_id', patient.tenant_id)
              .eq('patient_id', patientId)
              .eq('nutrition_plan_id', nutritionPlanRow.id)
              .order('created_at', { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [], error: null }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (nutritionHistoryRes.error || nutritionNotesRes.error) {
    throw nutritionHistoryRes.error ?? nutritionNotesRes.error;
  }

  const nutritionHistoryRows = Array.isArray(nutritionHistoryRes.data)
    ? (nutritionHistoryRes.data as Record<string, unknown>[])
    : [];
  const nutritionNoteRows = Array.isArray(nutritionNotesRes.data)
    ? (nutritionNotesRes.data as Record<string, unknown>[])
    : [];

  const lastUpdate =
    [
      patient.updated_at,
      piiRes.data?.updated_at,
      ...(alertsRes.data ?? []).map((a) => a.updated_at),
      ...(tasksRes.data ?? []).map((t) => t.updated_at),
      ...(appointmentsRes.data ?? []).map((a) => a.updated_at),
      ...(timelineRes.data ?? []).map((t) => t.updated_at),
      latestSoapRes.data?.updated_at,
      packageEnrollment?.updated_at,
      packageProgram?.updated_at,
      nutritionPlanRow?.updated_at,
      ...(nutritionHistoryRows ?? []).map((plan) => plan.updated_at),
      ...(nutritionNoteRows ?? []).map((note) => note.created_at),
      chatThreadRes.data?.updated_at,
      ...(Array.isArray(latestChatMessageRes.data)
        ? latestChatMessageRes.data.map((message) => message.created_at)
        : []),
    ]
      .filter(Boolean)
      .sort()
      .at(-1) ?? patient.updated_at;

  const latestChatMessage = Array.isArray(latestChatMessageRes.data)
    ? (latestChatMessageRes.data[0] ?? null)
    : null;
  const latestChatMetadata =
    latestChatMessage?.metadata &&
    typeof latestChatMessage.metadata === 'object' &&
    !Array.isArray(latestChatMessage.metadata)
      ? (latestChatMessage.metadata as Record<string, unknown>)
      : {};
  const latestChatSenderType = String(
    latestChatMetadata.sender_type ?? latestChatMetadata.from ?? ''
  ).toLowerCase();
  const latestChatSender =
    typeof latestChatMessage?.sender_label === 'string' && latestChatMessage.sender_label.trim()
      ? latestChatMessage.sender_label
      : latestChatSenderType === 'patient'
        ? 'Paciente'
        : 'Equipe';

  const upcomingAppointments = (appointmentsRes.data ?? []).map((appointment) => ({
    id: appointment.id,
    patientId,
    patientName: piiRes.data?.full_name ?? patient.preferred_name ?? 'Paciente',
    type: mapAppointmentType(appointment.type),
    status: mapAppointmentStatus(appointment.status),
    scheduledAt: appointment.scheduled_at,
    durationMinutes: appointment.duration_minutes ?? 30,
    professionalName: 'Equipe SlimHiper',
    professionalRole: 'Profissional de saude',
    roomName: appointment.location ?? undefined,
    notes: appointment.notes ?? undefined,
  }));

  const recentTimeline = (timelineRes.data ?? []).map((event) => {
    const payload = safeTimelinePayload(event.payload);
    return {
      id: event.id,
      patientId: event.patient_id ?? patientId,
      type: mapEventType(event.event_type),
      title: String(event.title ?? payload?.title ?? 'Atualização do paciente'),
      description: String(
        event.description ??
          payload?.description ??
          payload?.summary ??
          'Evento registrado no prontuário do paciente.'
      ),
      date: mapEventDate(event.event_at, event.created_at),
      category: mapEventCategory(event.category ?? payload?.category),
      actorName: event.actor_name ?? payload?.professionalName ?? 'Equipe clínica',
      statusLabel: String(event.status_label ?? payload?.status ?? event.status ?? 'Registrado'),
      actionLabel: event.action_label ?? undefined,
      detailsHref: event.details_href ?? undefined,
      metadata: payload ?? undefined,
    };
  });

  const activePackage =
    packageEnrollment && packageProgram
      ? {
          id: packageEnrollment.id,
          patientId,
          programName: packageProgram.name ?? 'Programa SlimHiper',
          programType: mapProgramType(packageProgram.program_type),
          totalWeeks: asNumber(packageProgram.duration_weeks),
          currentWeek: asNumber(packageEnrollment.current_week),
          startDate: packageEnrollment.start_date ?? packageEnrollment.created_at,
          endDate:
            packageEnrollment.end_date ??
            packageEnrollment.start_date ??
            packageEnrollment.created_at,
          status: mapPackageStatus(packageEnrollment.status),
          totalConsultations: asNumber(packageEnrollment.total_consultations),
          usedConsultations: asNumber(packageEnrollment.used_consultations),
          totalNutritionSessions: asNumber(packageEnrollment.total_nutrition_sessions),
          usedNutritionSessions: asNumber(packageEnrollment.used_nutrition_sessions),
          serviceUsage: packageServices.map((service) => ({
            label: String(service.label ?? 'Servico'),
            used: 0,
            total: asNumber(service.quantity),
            color: 'bg-teal-500',
            bgColor: 'bg-teal-50 text-teal-700',
          })),
          packageEntitlements: packageEntitlements.map((entitlement) => ({
            key: String(entitlement.key ?? entitlement.id),
            label: String(entitlement.label ?? entitlement.key ?? 'Acesso'),
            enabled: entitlement.enabled !== false,
          })),
          packageLimits: [
            {
              label: 'Check-ins planejados',
              value: `${packageCheckins.length}/${asNumber(packageProgram.checkins_total)} gerados`,
            },
            ...packageRequiredDocuments.map((document) => ({
              label: String(document.label ?? 'Documento'),
              value: document.required === false ? 'Opcional' : 'Obrigatorio',
            })),
          ],
          checkins: packageCheckins.map((checkin) => ({
            id: checkin.id,
            title: String(checkin.title ?? 'Check-in'),
            status: checkin.status ?? 'scheduled',
            dueDate: checkin.due_date,
            completedAt: checkin.completed_at ?? undefined,
            channel: checkin.channel ?? undefined,
          })),
        }
      : {
          id: `pkg-${patientId}`,
          patientId,
          programName: 'Sem pacote ativo',
          programType: 'saude_metabolica',
          totalWeeks: 0,
          currentWeek: 0,
          startDate: patient.created_at,
          endDate: patient.created_at,
          status: 'aguardando',
          totalConsultations: 0,
          usedConsultations: 0,
          totalNutritionSessions: 0,
          usedNutritionSessions: 0,
        };

  const nutritionPlan = tenantPermissions.has('nutrition.read')
    ? mapNutritionPlan({
        row: nutritionPlanRow ? (nutritionPlanRow as Record<string, unknown>) : null,
        patientId,
        patientCreatedAt: patient.created_at,
        lastUpdate,
        historyRows: nutritionHistoryRows,
        noteRows: nutritionNoteRows,
      })
    : mapNutritionPlan({
        row: null,
        patientId,
        patientCreatedAt: patient.created_at,
        lastUpdate,
        historyRows: [],
        noteRows: [],
      });

  const data = {
    profile: {
      id: patient.id,
      status: 'ativo',
      name: piiRes.data?.full_name ?? patient.preferred_name ?? 'Paciente',
      preferredName: patient.preferred_name ?? undefined,
      age: calculateAge(piiRes.data?.birth_date) ?? 0,
      birthDate: '',
      phone: maskPhone(piiRes.data?.phone),
      email: maskEmail(piiRes.data?.email),
      cpfMasked: maskCpf(piiRes.data?.cpf_masked),
      careTeam: [],
      createdAt: patient.created_at,
    },
    activePackage,
    clinicalStatus: {
      currentWeightKg: 0,
      goalWeightKg: 0,
      startWeightKg: 0,
      currentBmi: 0,
      weeklyAdherencePercent: 0,
      adherenceLevel: 'regular',
      weightLostKg: 0,
      weightToGoKg: 0,
      progressPercent: 0,
      lastMeasuredAt: lastUpdate,
      weightHistory: [],
      adherenceHistory: [],
    },
    financial: {
      status: 'em_dia',
      financialState: 'em_dia',
      totalContractValue: 0,
      totalPaid: 0,
      totalPending: 0,
      totalOverdue: 0,
      invoices: [],
    },
    alerts: (alertsRes.data ?? []).map((alert) => ({
      id: alert.id,
      patientId,
      severity: 'medio',
      title: alert.title,
      description: alert.description ?? '',
      createdAt: alert.starts_at ?? alert.updated_at,
      resolvedAt: undefined,
      isResolved: false,
      category: 'clinico',
    })),
    tasks: (tasksRes.data ?? []).map((task) => ({
      id: task.id,
      patientId,
      title: task.title,
      description: task.details ?? undefined,
      dueDate: task.due_at ?? task.updated_at,
      isCompleted: task.status === 'done',
      completedAt: task.status === 'done' ? task.updated_at : undefined,
      assignedTo: task.assigned_to ?? undefined,
      category: 'clinico',
      priority: 'media',
    })),
    upcomingAppointments,
    recentTimeline,
    documents: [],
    prescriptions: tenantPermissions.has('prescriptions.read')
      ? (prescriptionsRes.data ?? []).map((prescription) => ({
          id: prescription.id,
          patientId,
          medicationName: 'Prescrição registrada',
          dosage: prescription.prescription_text ?? 'Conforme orientação profissional',
          frequency: 'Conforme orientação profissional',
          startDate: prescription.created_at,
          endDate: undefined,
          prescribedBy: prescription.created_by ?? 'Equipe médica',
          isActive: prescription.status === 'active',
          notes: prescription.prescription_text ?? undefined,
          status: 'ativo',
          issueDate: prescription.created_at,
          ...mapPrescriptionSummary(prescription as Record<string, unknown>, patientId),
        }))
      : [],
    nutritionPlan,
    chat: {
      id: chatThreadRes.data?.id ?? `chat-${patientId}`,
      patientId,
      lastMessageAt:
        latestChatMessage?.created_at ??
        chatThreadRes.data?.last_message_at ??
        chatThreadRes.data?.updated_at ??
        lastUpdate,
      lastMessagePreview: latestChatMessage?.body ?? 'Sem mensagens recentes.',
      lastMessageFrom: latestChatSender,
      unreadCount: Math.max(0, Number(chatThreadRes.data?.unread_count ?? 0)),
      isOpen: chatThreadRes.data?.status === 'open',
    },
    mainUnit: null,
    responsibleProfessional: null,
    clinicalRisk: null,
    lastUpdate,
  };

  return jsonResponse(200, {
    ok: true,
    data,
    meta: {
      permissions: {
        patientsRead: tenantPermissions.has('patients.read'),
        soapRead: tenantPermissions.has('soap.read'),
        prescriptionsRead: tenantPermissions.has('prescriptions.read'),
        packagesRead: tenantPermissions.has('packages.read'),
        nutritionRead: tenantPermissions.has('nutrition.read'),
      },
      timestamp: new Date().toISOString(),
    },
  });
}
