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

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const patientVisibleReportKeys = new Set([
  'resumo-clinico',
  'servicos-consumidos',
  'documentos-emitidos',
  'adesao-plano',
]);

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isPatientVisibleReport(row: Record<string, unknown>) {
  const key = asString(row.key);
  if (!patientVisibleReportKeys.has(key)) return false;

  return (
    asBoolean(row.canRun) &&
    asBoolean(row.exportEnabled, true) &&
    !asBoolean(row.requiresFinancialRead) &&
    !asBoolean(row.requiresSensitiveRead)
  );
}

function mapReportDefinition(row: Record<string, unknown>) {
  return {
    key: asString(row.key, 'report'),
    label: asString(row.label, 'Relatorio clinico'),
    description: asString(row.description, 'Relatorio disponivel para o paciente.'),
    iconKey: asString(row.iconKey, 'FileText'),
    badge: asString(row.badge) || 'Paciente',
    badgeColor: asString(row.badgeColor) || 'bg-blue-100 text-blue-700',
    exportImplemented: asBoolean(row.exportEnabled, true),
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

    const { data: rows, error: reportsError } = await supabase.rpc(
      'list_clinic_report_definitions'
    );

    if (reportsError) throw reportsError;

    const patientReports = Array.isArray(rows)
      ? rows.map(asRecord).filter(isPatientVisibleReport).map(mapReportDefinition)
      : [];

    return jsonResponse(200, {
      ok: true,
      data: patientReports,
      meta: { tenantId, timestamp, scope: 'patient' },
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
