import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

type Json = Record<string, unknown>;
type TimelineCategory =
  | 'all' |'clinical' |'financial' |'documents' |'agenda' |'communication' |'patient_app' |'commercial';

const ALLOWED_CATEGORIES: TimelineCategory[] = [
  'all',
  'clinical',
  'financial',
  'documents',
  'agenda',
  'communication',
  'patient_app',
  'commercial',
];

type TimelineEventType =
  | 'consulta' |'nutricao' |'medicamento' |'medida' |'documento' |'pagamento' |'alerta' |'mensagem' |'inicio_programa' |'meta_atingida' |'lead_criado' |'lead_convertido' |'pacote_vendido' |'contrato_assinado' |'paciente_cadastrado' |'consulta_agendada' |'checkin_realizado' |'atendimento_iniciado' |'atendimento_concluido' |'anamnese_preenchida' |'soap_atualizado' |'medida_registrada' |'exame_solicitado' |'exame_resultado_recebido' |'plano_alimentar_publicado' |'prescricao_emitida' |'documento_gerado' |'documento_assinado' |'pagamento_recebido' |'pagamento_atrasado' |'mensagem_enviada' |'checkin_semanal_enviado';

type TimelineEventCategory =
  | 'clinical' |'financial' |'documents' |'agenda' |'communication' |'patient_app' |'commercial';

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
  if (typeof value === 'string' && VALID_EVENT_TYPES.has(value as TimelineEventType)) {
    return value as TimelineEventType;
  }
  return 'mensagem';
}

function mapEventCategory(value: unknown): TimelineEventCategory {
  if (typeof value === 'string' && VALID_EVENT_CATEGORIES.has(value as TimelineEventCategory)) {
    return value as TimelineEventCategory;
  }
  return 'clinical';
}

function mapEventDate(eventAt: unknown, createdAt: unknown): string {
  const eventDate = safeDate(eventAt);
  if (eventDate) return eventDate;
  const createdDate = safeDate(createdAt);
  if (createdDate) return createdDate;
  return new Date(0).toISOString();
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

function safeDate(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      error: { code: 'method_not_allowed', message: 'Only POST is allowed.' },
      meta: { timestamp },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
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
      return jsonResponse(500, {
        ok: false,
        error: { code: 'server_misconfigured', message: 'Server configuration error.' },
        meta: { timestamp },
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
        meta: { timestamp },
      });
    }

    const body = await req.json().catch(() => null);
    const patientId = typeof body?.patient_id === 'string' ? body.patient_id.trim() : '';
    const category = typeof body?.category === 'string' ? body.category.trim() : 'all';
    const page = Number.isInteger(body?.page) ? Number(body.page) : 1;
    const pageSize = Number.isInteger(body?.page_size) ? Number(body.page_size) : 20;
    const dateStart = safeDate(body?.date_start ?? body?.start_date);
    const dateEnd = safeDate(body?.date_end ?? body?.end_date);

    if (!patientId) {
      return jsonResponse(400, {
        ok: false,
        error: { code: 'invalid_request', message: 'patient_id is required.' },
        meta: { timestamp, userId: authData.user.id },
      });
    }

    if (!ALLOWED_CATEGORIES.includes(category as TimelineCategory)) {
      return jsonResponse(400, {
        ok: false,
        error: { code: 'invalid_request', message: 'Invalid category filter.' },
        meta: { timestamp, userId: authData.user.id },
      });
    }

    const normalizedPage = page > 0 ? page : 1;
    const normalizedPageSize = pageSize > 0 && pageSize <= 100 ? pageSize : 20;

    const { data: memberships, error: membershipsError } = await supabase
      .from('tenant_memberships')
      .select('tenant_id, status')
      .eq('user_id', authData.user.id)
      .eq('status', 'active');

    if (membershipsError) throw membershipsError;

    const tenantIds = (memberships ?? []).map((m) => m.tenant_id).filter(Boolean);
    if (!tenantIds.length) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'No active tenant membership.' },
        meta: { timestamp },
      });
    }

    const permissionsByTenant = new Map<string, Set<string>>();
    for (const tenantId of tenantIds) {
      const [readCheck, sensitiveCheck] = await Promise.all([
        supabase.rpc('has_permission', { p_tenant_id: tenantId, p_permission: 'patients.read' }),
        supabase.rpc('has_permission', { p_tenant_id: tenantId, p_permission: 'timeline.sensitive.read' }),
      ]);

      if (readCheck.error || sensitiveCheck.error) throw readCheck.error ?? sensitiveCheck.error;

      const permissionSet = new Set<string>();
      if (readCheck.data === true) permissionSet.add('patients.read');
      if (sensitiveCheck.data === true) permissionSet.add('timeline.sensitive.read');
      permissionsByTenant.set(tenantId, permissionSet);
    }

    const readableTenants = tenantIds.filter((tenantId) => permissionsByTenant.get(tenantId)?.has('patients.read'));
    if (!readableTenants.length) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing patients.read permission.' },
        meta: { timestamp },
      });
    }

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, tenant_id')
      .eq('id', patientId)
      .in('tenant_id', readableTenants)
      .maybeSingle();

    if (patientError) throw patientError;
    if (!patient) {
      return jsonResponse(404, {
        ok: false,
        error: { code: 'not_found', message: 'Patient not found.' },
        meta: { timestamp },
      });
    }

    const tenantPermissions = permissionsByTenant.get(patient.tenant_id) ?? new Set<string>();
    if (!tenantPermissions.has('patients.read')) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing patients.read permission.' },
        meta: { timestamp },
      });
    }

    const from = (normalizedPage - 1) * normalizedPageSize;
    const to = from + normalizedPageSize - 1;

    const includeSensitive = tenantPermissions.has('timeline.sensitive.read');
    const selectColumns = [
      'id',
      'tenant_id',
      'patient_id',
      'event_type',
      'category',
      'status',
      'title',
      'description',
      'actor_name',
      'status_label',
      'action_label',
      'details_href',
      'event_at',
      'created_at',
      ...(includeSensitive ? ['payload'] : []),
    ].join(',');

    let query = supabase
      .from('patient_timeline_events')
      .select(selectColumns, { count: 'exact' })
      .eq('patient_id', patientId)
      .eq('tenant_id', patient.tenant_id)
      .order('event_at', { ascending: false })
      .range(from, to);

    if (category !== 'all') query = query.eq('category', category);
    if (dateStart) query = query.gte('event_at', dateStart);
    if (dateEnd) query = query.lte('event_at', dateEnd);

    const { data: eventsData, error: eventsError, count } = await query;
    if (eventsError) throw eventsError;

    const events = (eventsData ?? []).map((event) => {
      const row = event as Record<string, unknown>;
      return {
        id: row.id,
        patientId: row.patient_id,
        type: mapEventType(row.event_type),
        title: row.title,
        description: row.description,
        date: mapEventDate(row.event_at, row.created_at),
        category: mapEventCategory(row.category),
        actorName: row.actor_name,
        statusLabel: row.status_label,
        actionLabel: row.action_label,
        detailsHref: row.details_href,
        ...(includeSensitive ? { metadata: row.payload } : {}),
      };
    });

    return jsonResponse(200, {
      ok: true,
      data: {
        events,
        page: normalizedPage,
        page_size: normalizedPageSize,
        total: count ?? 0,
      },
      meta: {
        timestamp,
        patient_id: patientId,
        category,
        date_start: dateStart,
        date_end: dateEnd,
      },
    });
  } catch (error) {
    console.error('[patient-timeline] unexpected_error', {
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
