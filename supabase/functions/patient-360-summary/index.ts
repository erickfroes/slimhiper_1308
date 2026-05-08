import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Json = Record<string, unknown>;

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
      .select('id, event_type, status, event_at, payload, updated_at')
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

  const data = {
    profile: {
      id: patient.id,
      tenantId: patient.tenant_id,
      status: patient.status,
      name: piiRes.data?.full_name ?? patient.preferred_name ?? null,
      preferredName: patient.preferred_name,
      age: calculateAge(piiRes.data?.birth_date),
      birthDate: piiRes.data?.birth_date ?? null,
      sexGender: piiRes.data?.sex_gender ?? null,
      phone: piiRes.data?.phone ?? null,
      email: piiRes.data?.email ?? null,
      cpfMasked: piiRes.data?.cpf_masked ?? null,
    },
    activePackage: {
      id: null,
      name: null,
      status: 'inactive',
      startedAt: null,
      endsAt: null,
      sessionsCompleted: 0,
      sessionsTotal: 0,
    },
    clinicalStatus: {
      status: 'stable',
      lastUpdatedAt: lastUpdate,
      latestSoap: tenantPermissions.has('soap.read') ? latestSoapRes.data : null,
    },
    financial: {
      status: 'em_dia',
      outstandingAmount: 0,
      overdueAmount: 0,
      paidAmount: 0,
      currency: 'BRL',
      lastPaymentAt: null,
      nextDueAt: null,
    },
    alerts: alertsRes.data ?? [],
    tasks: tasksRes.data ?? [],
    upcomingAppointments: (appointmentsRes.data ?? []).map((appointment) => ({
      id: appointment.id,
      scheduledAt: appointment.scheduled_at,
      durationMinutes: appointment.duration_minutes,
      status: appointment.status,
      location: appointment.location,
      practitionerId: appointment.practitioner_id,
      notes: appointment.notes,
    })),
    recentTimeline: (timelineRes.data ?? []).map((event) => ({
      id: event.id,
      type: event.event_type,
      status: event.status,
      eventAt: event.event_at,
      payload: safeTimelinePayload(event.payload),
      updatedAt: event.updated_at,
    })),
    documents: [],
    prescriptions: tenantPermissions.has('prescriptions.read')
      ? (prescriptionsRes.data ?? []).map((prescription) => ({
          id: prescription.id,
          status: prescription.status,
          text: prescription.prescription_text,
          createdBy: prescription.created_by,
          createdAt: prescription.created_at,
          updatedAt: prescription.updated_at,
        }))
      : null,
    nutritionPlan: {
      status: 'not_started',
      goal: null,
      kcalTarget: null,
      meals: [],
      updatedAt: null,
    },
    chat: {
      status: 'unavailable',
      unreadCount: 0,
      lastMessageAt: null,
      lastMessagePreview: null,
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
