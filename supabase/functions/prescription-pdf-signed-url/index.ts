import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

type SignedUrlRequest = {
  prescription_pdf_artifact_id?: string;
  prescription_id?: string;
  patient_id?: string;
};

type ArtifactRow = {
  id: string;
  tenant_id: string;
  patient_id: string;
  prescription_id: string;
  status: string;
  storage_bucket: string;
  storage_path: string;
  released_to_patient: boolean;
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidPrescriptionPdfPath(
  path: string,
  tenantId: string,
  patientId: string,
  prescriptionId: string,
  artifactId: string
) {
  const parts = path.split('/');
  return (
    parts.length === 5 &&
    parts[0] === tenantId &&
    parts[1] === patientId &&
    parts[2] === prescriptionId &&
    parts[3] === artifactId &&
    parts[4] === 'prescription.pdf'
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
    const artifactId = safeString(body?.prescription_pdf_artifact_id);
    const prescriptionId = safeString(body?.prescription_id);
    const patientId = safeString(body?.patient_id);

    if (!isUuid(artifactId) && !isUuid(prescriptionId)) {
      return jsonResponse(req, 400, {
        ok: false,
        error: { code: 'invalid_request' },
        meta: { timestamp },
      });
    }
    if (patientId && !isUuid(patientId)) {
      return jsonResponse(req, 400, {
        ok: false,
        error: { code: 'invalid_patient' },
        meta: { timestamp },
      });
    }

    let query = supabase
      .from('prescription_pdf_artifacts')
      .select(
        'id, tenant_id, patient_id, prescription_id, status, storage_bucket, storage_path, released_to_patient'
      )
      .eq('status', 'generated')
      .order('generated_at', { ascending: false })
      .limit(1);

    if (isUuid(artifactId)) {
      query = query.eq('id', artifactId);
    } else {
      query = query.eq('prescription_id', prescriptionId);
    }
    if (patientId) query = query.eq('patient_id', patientId);

    const { data: artifacts, error: artifactError } = await query;
    if (artifactError) throw artifactError;

    const artifact = (artifacts?.[0] ?? null) as ArtifactRow | null;
    if (!artifact) {
      return jsonResponse(req, 404, {
        ok: false,
        error: { code: 'not_found' },
        meta: { timestamp },
      });
    }

    if (artifact.storage_bucket !== 'prescription-pdfs') {
      return jsonResponse(req, 500, {
        ok: false,
        error: { code: 'invalid_storage_bucket' },
        meta: { timestamp },
      });
    }

    if (
      !isValidPrescriptionPdfPath(
        artifact.storage_path,
        artifact.tenant_id,
        artifact.patient_id,
        artifact.prescription_id,
        artifact.id
      )
    ) {
      return jsonResponse(req, 500, {
        ok: false,
        error: { code: 'invalid_storage_path' },
        meta: { timestamp },
      });
    }

    const expiresInSeconds = 300;
    const { data, error } = await admin.storage
      .from(artifact.storage_bucket)
      .createSignedUrl(artifact.storage_path, expiresInSeconds);
    if (error) throw error;

    return jsonResponse(req, 200, {
      ok: true,
      data: {
        url: data.signedUrl,
        expiresInSeconds,
        artifactId: artifact.id,
        prescriptionId: artifact.prescription_id,
      },
      meta: { timestamp },
    });
  } catch {
    console.error('[prescription-pdf-signed-url] unexpected_error');

    return jsonResponse(req, 500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
