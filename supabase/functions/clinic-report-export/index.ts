import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function configuredAllowedOrigins() {
  return new Set(
    [
      ...(Deno.env.get('APP_ALLOWED_ORIGINS') ?? '').split(','),
      Deno.env.get('SITE_URL') ?? '',
      Deno.env.get('NEXT_PUBLIC_SITE_URL') ?? '',
    ]
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function isLocalOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function allowedCorsOrigin(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  if (!origin) return null;
  const configured = configuredAllowedOrigins();
  return configured.has(origin) || isLocalOrigin(origin) ? origin : null;
}

function responseHeaders(req: Request) {
  const headers: Record<string, string> = { ...baseCorsHeaders, 'Content-Type': 'application/json' };
  const origin = allowedCorsOrigin(req);
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

function jsonResponse(req: Request, status: number, payload: Json) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(req),
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidReportExportPath(path: string, runId: string, artifactId: string) {
  const parts = path.split('/');
  return (
    parts.length === 4 &&
    isUuid(parts[0]) &&
    parts[1] === runId &&
    parts[2] === artifactId &&
    /^[a-z0-9][a-z0-9._-]*\.(csv|pdf)$/.test(parts[3])
  );
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  if (req.method === 'OPTIONS') {
    if (req.headers.get('Origin') && !allowedCorsOrigin(req)) {
      return new Response('forbidden', { status: 403, headers: responseHeaders(req) });
    }
    return new Response('ok', { headers: responseHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, 405, {
      ok: false,
      error: { code: 'method_not_allowed', message: 'Only POST is allowed.' },
      meta: { timestamp },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return jsonResponse(req, 401, {
        ok: false,
        error: { code: 'unauthorized', message: 'Missing bearer token.' },
        meta: { timestamp },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('[clinic-report-export] missing environment configuration');
      return jsonResponse(req, 500, {
        ok: false,
        error: { code: 'server_misconfigured', message: 'Server configuration error.' },
        meta: { timestamp },
      });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse(req, 401, {
        ok: false,
        error: { code: 'unauthorized', message: 'Invalid or expired token.' },
        meta: { timestamp },
      });
    }

    const body = asRecord(await req.json().catch(() => ({})));
    const artifactId = asString(body.artifact_id);
    const runId = asString(body.run_id);
    if (!artifactId) {
      return jsonResponse(req, 400, {
        ok: false,
        error: {
          code: 'invalid_export_request',
          message: 'Report artifact is required.',
        },
        meta: { timestamp },
      });
    }

    const { data, error } = await supabase.rpc('get_clinic_report_export_artifact', {
      p_artifact_id: artifactId || null,
      p_run_id: runId || null,
      p_export_token: null,
    });
    if (error) throw error;

    const payload = asRecord(data);
    const resolvedArtifactId = asString(payload.artifactId);
    const resolvedRunId = asString(payload.runId);
    const bucket = asString(payload.bucket);
    const path = asString(payload.path);
    const filename = asString(payload.filename, 'relatorio.csv');
    const expiresInSeconds = Number(payload.expiresInSeconds) || 300;

    if (
      bucket !== 'report-exports' ||
      !resolvedArtifactId ||
      !resolvedRunId ||
      !isValidReportExportPath(path, resolvedRunId, resolvedArtifactId)
    ) {
      return jsonResponse(req, 500, {
        ok: false,
        error: { code: 'invalid_storage_contract', message: 'Invalid storage contract.' },
        meta: { timestamp },
      });
    }

    const { data: signed, error: signedError } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds, { download: filename });
    if (signedError) throw signedError;

    return jsonResponse(req, 200, {
      ok: true,
      data: {
        url: signed.signedUrl,
        filename,
        expiresInSeconds,
        artifactId: resolvedArtifactId,
        runId: resolvedRunId,
        artifactExpiresAt: payload.artifactExpiresAt,
      },
      meta: { timestamp },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /forbidden|permission|expired|invalid|42501/i.test(message) ? 403 : 500;
    console.error('[clinic-report-export] unexpected_error', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });

    return jsonResponse(req, status, {
      ok: false,
      error: {
        code: status === 403 ? 'forbidden_or_expired' : 'internal_error',
        message: status === 403 ? 'Export expirado ou sem permissao.' : 'Unexpected server error.',
      },
      meta: { timestamp },
    });
  }
});
