import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  'consulta', 'nutricao', 'medicamento', 'medida', 'documento', 'pagamento', 'alerta', 'mensagem',
  'inicio_programa', 'meta_atingida', 'lead_criado', 'lead_convertido', 'pacote_vendido', 'contrato_assinado',
  'paciente_cadastrado', 'consulta_agendada', 'checkin_realizado', 'atendimento_iniciado', 'atendimento_concluido',
  'anamnese_preenchida', 'soap_atualizado', 'medida_registrada', 'plano_alimentar_publicado', 'prescricao_emitida',
  'documento_gerado', 'documento_assinado', 'pagamento_recebido', 'pagamento_atrasado', 'mensagem_enviada', 'checkin_semanal_enviado',
]);

const VALID_EVENT_CATEGORIES: Set<TimelineEventCategory> = new Set([
  'clinical', 'financial', 'documents', 'agenda', 'communication', 'patient_app', 'commercial',
]);

function mapEventType(value: unknown): TimelineEventType {
  if (typeof value === 'string' && VALID_EVENT_TYPES.has(value as TimelineEventType)) return value as TimelineEventType;
  return 'mensagem';
}

function mapEventCategory(value: unknown): TimelineEventCategory {
  if (typeof value === 'string' && VALID_EVENT_CATEGORIES.has(value as TimelineEventCategory)) return value as TimelineEventCategory;
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
        supabase.rpc('has_permission', { p_tenant_id: tenantId, p_permission: 'prescriptions.read' }),
      ]);

      const set = new Set<string>();
      if (checks[0].error || checks[1].error || checks[2].error) {
        throw checks[0].error ?? checks[1].error ?? checks[2].error;
      }
      if (checks[0].data === true) set.add('patients.read');
      if (checks[1].data === true) set.add('soap.read');
      if (checks[2].data === true) set.add('prescriptions.read');
      permissionsByTenant.set(tenantId, set);
    }

    const readableTenants = tenantIds.filter((t) => permissionsByTenant.get(t)?.has('patients.read'));
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
  patient: { id: string; tenant_id: string; status: string; preferred_name: string | null; created_at: string; updated_at: string };
  patientId: string;
  tenantPermissions: Set<string>;
}) {
  const [piiRes, alertsRes, tasksRes, appointmentsRes, timelineRes, latestSoapRes, prescriptionsRes] = await Promise.all([
    supabase
      .from('patient_pii')
      .select('full_name, email, phone, cpf_masked, birth_date, sex_gender, updated_at')
      .eq('patient_id', patientId)
      .eq('tenant_id', patient.tenant_id)
      .maybeSingle(),
    supabase
      .from('patient_alerts')
      .select('id, alert_type, title, description, severity, starts_at, ends_at, status, updated_at')
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
      .select('id, scheduled_at, duration_minutes, status, location, practitioner_id, notes, updated_at')
      .eq('patient_id', patientId)
      .eq('tenant_id', patient.tenant_id)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10),
    supabase
      .from('patient_timeline_events')
      .select('id, patient_id, event_type, category, title, description, actor_name, status, status_label, action_label, details_href, event_at, created_at, payload, updated_at')
      .eq('patient_id', patientId)
      .eq('tenant_id', patient.tenant_id)
      .order('event_at', { ascending: false })
      .limit(25),
    tenantPermissions.has('soap.read')
      ? supabase
          .from('soap_notes')
          .select('id, status, subjective, objective, assessment, plan, authored_by, updated_at, created_at')
          .eq('patient_id', patientId)
          .eq('tenant_id', patient.tenant_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    tenantPermissions.has('prescriptions.read')
      ? supabase
          .from('prescriptions_placeholder')
          .select('id, status, prescription_text, created_by, created_at, updated_at')
          .eq('patient_id', patientId)
          .eq('tenant_id', patient.tenant_id)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const queryErrors = [piiRes.error, alertsRes.error, tasksRes.error, appointmentsRes.error, timelineRes.error, latestSoapRes.error, prescriptionsRes.error].filter(Boolean);
  if (queryErrors.length) throw queryErrors[0];

  const lastUpdate = [
    patient.updated_at,
    piiRes.data?.updated_at,
    ...((alertsRes.data ?? []).map((a) => a.updated_at)),
    ...((tasksRes.data ?? []).map((t) => t.updated_at)),
    ...((appointmentsRes.data ?? []).map((a) => a.updated_at)),
    ...((timelineRes.data ?? []).map((t) => t.updated_at)),
    latestSoapRes.data?.updated_at,
  ]
    .filter(Boolean)
    .sort()
    .at(-1) ?? patient.updated_at;

  const upcomingAppointments = (appointmentsRes.data ?? []).map((appointment) => ({
    id: appointment.id,
    patientId,
    patientName: piiRes.data?.full_name ?? patient.preferred_name ?? 'Paciente',
    type: 'consulta_medica',
    status: 'agendado',
    scheduledAt: appointment.scheduled_at,
    durationMinutes: appointment.duration_minutes ?? 30,
    professionalName: appointment.practitioner_id ?? 'Equipe SlimHiper',
    professionalRole: 'Profissional de saúde',
  }));

  const recentTimeline = (timelineRes.data ?? []).map((event) => {
    const payload = safeTimelinePayload(event.payload);
    return {
      id: event.id,
      patientId: event.patient_id ?? patientId,
      type: mapEventType(event.event_type),
      title: String(event.title ?? payload?.title ?? 'Atualização do paciente'),
      description: String(event.description ?? payload?.description ?? payload?.summary ?? 'Evento registrado no prontuário do paciente.'),
      date: mapEventDate(event.event_at, event.created_at),
      category: mapEventCategory(event.category ?? payload?.category),
      actorName: event.actor_name ?? payload?.professionalName ?? 'Equipe clínica',
      statusLabel: String(event.status_label ?? payload?.status ?? event.status ?? 'Registrado'),
      actionLabel: event.action_label ?? undefined,
      detailsHref: event.details_href ?? undefined,
      metadata: payload ?? undefined,
    };
  });

  const data = {
    profile: {
      id: patient.id,
      tenantId: patient.tenant_id,
      status: 'ativo',
      name: piiRes.data?.full_name ?? patient.preferred_name ?? 'Paciente',
      preferredName: patient.preferred_name ?? undefined,
      age: calculateAge(piiRes.data?.birth_date) ?? 0,
      birthDate: piiRes.data?.birth_date ?? patient.created_at,
      phone: piiRes.data?.phone ?? '',
      email: piiRes.data?.email ?? '',
      cpfMasked: piiRes.data?.cpf_masked ?? '***.***.***-**',
      careTeam: [],
      createdAt: patient.created_at,
    },
    activePackage: {
      id: `pkg-${patientId}`,
      patientId,
      programName: 'Programa SlimHiper',
      programType: 'saude_metabolica',
      totalWeeks: 12,
      currentWeek: 1,
      startDate: patient.created_at,
      endDate: patient.created_at,
      status: 'aguardando',
      totalConsultations: 0,
      usedConsultations: 0,
      totalNutritionSessions: 0,
      usedNutritionSessions: 0,
    },
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
        }))
      : [],
    nutritionPlan: {
      id: `nutrition-${patientId}`,
      patientId,
      planName: 'Plano nutricional inicial',
      targetCalories: 0,
      targetProteinG: 0,
      targetCarbsG: 0,
      targetFatG: 0,
      createdAt: patient.created_at,
      updatedAt: lastUpdate,
      nutritionistName: 'Equipe de Nutrição',
      isActive: false,
    },
    chat: {
      id: `chat-${patientId}`,
      patientId,
      lastMessageAt: lastUpdate,
      lastMessagePreview: 'Sem mensagens recentes.',
      lastMessageFrom: 'staff',
      unreadCount: 0,
      isOpen: true,
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
      tenantId: patient.tenant_id,
      permissions: {
        patientsRead: tenantPermissions.has('patients.read'),
        soapRead: tenantPermissions.has('soap.read'),
        prescriptionsRead: tenantPermissions.has('prescriptions.read'),
      },
      timestamp: new Date().toISOString(),
    },
  });
}
