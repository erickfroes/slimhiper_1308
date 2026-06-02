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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeExportFormat(value: unknown): 'csv' | 'pdf' | null {
  const format = asString(value, 'csv').toLowerCase();
  if (format === 'csv' || format === 'pdf') return format;
  return null;
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
      const reportKey = asString(body.report_key);
      const exportFormat = normalizeExportFormat(body.export_format);

      if (!reportKey) {
        return jsonResponse(400, {
          ok: false,
          error: { code: 'invalid_report_key', message: 'Report key is required.' },
          meta: { timestamp },
        });
      }

      if (!exportFormat) {
        return jsonResponse(400, {
          ok: false,
          error: { code: 'invalid_export_format', message: 'Export format must be csv or pdf.' },
          meta: { timestamp },
        });
      }

      const { data: definitions, error: definitionsError } = await supabase.rpc(
        'list_clinic_report_definitions'
      );
      if (definitionsError) throw definitionsError;

      const definition = asArray(definitions)
        .map(asRecord)
        .find((item) => asString(item.key) === reportKey);

      if (!definition) {
        return jsonResponse(404, {
          ok: false,
          error: { code: 'report_not_found', message: 'Report definition is not available.' },
          meta: { timestamp },
        });
      }

      if (definition.canRun !== true) {
        return jsonResponse(403, {
          ok: false,
          error: { code: 'forbidden', message: 'Permissao insuficiente para relatorios.' },
          meta: { timestamp },
        });
      }

      if (definition.exportEnabled === false) {
        return jsonResponse(403, {
          ok: false,
          error: {
            code: 'export_disabled',
            message: 'Exportacao desabilitada para este relatorio.',
          },
          meta: { timestamp },
        });
      }

      const { data, error } = await supabase.rpc('create_clinic_report_run', {
        p_report_key: reportKey,
        p_filters: asRecord(body.filters),
        p_export_format: exportFormat,
        p_patient_id: asString(body.patient_id) || null,
      });
      if (error) throw error;
      return jsonResponse(200, { ok: true, data, meta: { timestamp } });
    }

    if (action === 'get') {
      const runId = asString(body.run_id);
      if (!runId) {
        return jsonResponse(400, {
          ok: false,
          error: { code: 'invalid_run_id', message: 'Report run id is required.' },
          meta: { timestamp },
        });
      }

      const { data, error } = await supabase.rpc('get_clinic_report_run', {
        p_run_id: runId,
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
    console.error('[clinic-reports] unexpected_error', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });

    return jsonResponse(status, {
      ok: false,
      error: {
        code: status === 403 ? 'forbidden' : 'internal_error',
        message:
          status === 403 ? 'Permissao insuficiente para relatorios.' : 'Unexpected server error.',
      },
      meta: { timestamp },
    });
  }
});
