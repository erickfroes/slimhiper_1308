import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

type SignedUrlRequest = {
  record_attachment_id?: string;
  patient_id?: string;
};

const baseCorsHeaders = {
  'Content-Type': 'application/json',
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
  if (configured.has(origin) || isLocalOrigin(origin)) return origin;
  return null;
}

function responseHeaders(req: Request) {
  const headers: Record<string, string> = { ...baseCorsHeaders };
  const origin = allowedCorsOrigin(req);
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

function jsonResponse(req: Request, status: number, payload: Json) {
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders(req) });
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidStoragePath(path: string, tenantId: string, patientId: string, attachmentId: string) {
  const parts = path.split('/');
  return (
    parts.length === 4 &&
    parts[0] === tenantId &&
    parts[1] === patientId &&
    parts[2] === attachmentId &&
    parts[3].length > 0
  );
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();

  if (req.method === 'OPTIONS') {
    const headers = responseHeaders(req);
    if (req.headers.get('Origin') && !headers['Access-Control-Allow-Origin']) {
      return new Response('forbidden', { status: 403, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('ok', { headers });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, 405, {
      ok: false,
      error: { code: 'method_not_allowed' },
      meta: { timestamp },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return jsonResponse(req, 401, {
        ok: false,
        error: { code: 'unauthorized' },
        meta: { timestamp },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(req, 500, {
        ok: false,
        error: { code: 'server_misconfigured' },
        meta: { timestamp },
      });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse(req, 401, {
        ok: false,
        error: { code: 'unauthorized' },
        meta: { timestamp },
      });
    }

    const body = (await req.json().catch(() => null)) as SignedUrlRequest | null;
    const attachmentId = safeString(body?.record_attachment_id);
    const patientId = safeString(body?.patient_id);

    if (!attachmentId || !patientId) {
      return jsonResponse(req, 400, {
        ok: false,
        error: { code: 'invalid_request' },
        meta: { timestamp },
      });
    }

    const { data: attachment, error: attachmentError } = await supabase
      .from('record_attachments')
      .select('id, tenant_id, patient_id, storage_bucket, storage_path, status')
      .eq('id', attachmentId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (attachmentError) throw attachmentError;
    if (!attachment) {
      return jsonResponse(req, 404, {
        ok: false,
        error: { code: 'not_found' },
        meta: { timestamp },
      });
    }

    const tenantId = String(attachment.tenant_id);
    const attachmentPatientId = String(attachment.patient_id);
    const storageBucket = String(attachment.storage_bucket);
    const storagePath = String(attachment.storage_path);

    if (storageBucket !== 'clinical-attachments' || attachment.status !== 'uploaded') {
      return jsonResponse(req, 409, {
        ok: false,
        error: { code: 'attachment_not_available' },
        meta: { timestamp },
      });
    }

    if (!isValidStoragePath(storagePath, tenantId, attachmentPatientId, attachmentId)) {
      return jsonResponse(req, 500, {
        ok: false,
        error: { code: 'invalid_storage_path' },
        meta: { timestamp },
      });
    }

    const expiresInSeconds = 300;
    const { data, error } = await admin.storage
      .from(storageBucket)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error) throw error;

    return jsonResponse(req, 200, {
      ok: true,
      data: { url: data.signedUrl, expiresInSeconds },
      meta: { timestamp },
    });
  } catch (error) {
    console.error('[record-attachment-signed-url] unexpected_error', {
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(req, 500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
