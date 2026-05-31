import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function mapReportDefinition(row: Record<string, unknown>) {
  const definition = asRecord(row.definition);
  return {
    key: asString(row.key, String(row.id ?? 'report')),
    label: asString(row.label, 'Relatorio clinico'),
    description: asString(row.description, 'Relatorio disponivel para o paciente.'),
    iconKey: asString(row.icon_key ?? definition.iconKey ?? definition.icon_key, 'FileText'),
    badge: asString(definition.badge) || undefined,
    badgeColor: asString(definition.badgeColor ?? definition.badge_color) || undefined,
    exportImplemented: row.export_enabled === true,
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
      console.error('[patient-reports] missing environment configuration');
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
      .select('id, tenant_id')
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

    const [patientPermission, reportsPermission] = await Promise.all([
      supabase.rpc('has_clinical_permission', {
        p_tenant_id: tenantId,
        p_permission: 'patients.read',
      }),
      supabase.rpc('has_permission', {
        p_tenant_id: tenantId,
        p_permission: 'reports.read',
      }),
    ]);

    if (patientPermission.error || reportsPermission.error) {
      throw patientPermission.error ?? reportsPermission.error;
    }

    if (patientPermission.data !== true || reportsPermission.data !== true) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing reports.read permission.' },
        meta: { timestamp, tenant_id: tenantId },
      });
    }

    const { data: rows, error: reportsError } = await supabase
      .from('report_definitions')
      .select('id,key,label,description,icon_key,export_enabled,definition,status,updated_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('label', { ascending: true });

    if (reportsError) throw reportsError;

    return jsonResponse(200, {
      ok: true,
      data: (rows ?? []).map((row) => mapReportDefinition(row as Record<string, unknown>)),
      meta: { tenantId, timestamp },
    });
  } catch (error) {
    console.error('[patient-reports] unexpected_error', {
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
