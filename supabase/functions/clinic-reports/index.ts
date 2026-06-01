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
      console.error('[clinic-reports] missing environment configuration');
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

    const body = asRecord(await req.json().catch(() => ({})));
    const action = asString(body.action, 'list');

    if (action === 'list') {
      const { data, error } = await supabase.rpc('list_clinic_report_definitions');
      if (error) throw error;
      return jsonResponse(200, { ok: true, data: data ?? [], meta: { timestamp } });
    }

    if (action === 'run') {
      const { data, error } = await supabase.rpc('create_clinic_report_run', {
        p_report_key: asString(body.report_key),
        p_filters: asRecord(body.filters),
        p_export_format: asString(body.export_format, 'csv'),
        p_patient_id: asString(body.patient_id) || null,
      });
      if (error) throw error;
      return jsonResponse(200, { ok: true, data, meta: { timestamp } });
    }

    if (action === 'get') {
      const { data, error } = await supabase.rpc('get_clinic_report_run', {
        p_run_id: asString(body.run_id),
      });
      if (error) throw error;
      return jsonResponse(200, { ok: true, data, meta: { timestamp } });
    }

    return jsonResponse(400, {
      ok: false,
      error: { code: 'invalid_action', message: 'Unsupported clinic report action.' },
      meta: { timestamp },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /forbidden|permission|42501|financial|sensitive/i.test(message) ? 403 : 500;
    console.error('[clinic-reports] unexpected_error', { message });

    return jsonResponse(status, {
      ok: false,
      error: {
        code: status === 403 ? 'forbidden' : 'internal_error',
        message: status === 403 ? 'Permissao insuficiente para relatorios.' : 'Unexpected server error.',
      },
      meta: { timestamp },
    });
  }
});
