import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

type SignedUrlRequest = {
  generated_document_id?: string;
  patient_id?: string;
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const allowedBuckets = new Set([
  'patient-documents',
  'signed-documents',
  'clinical-attachments',
  'evidence-packages',
]);

function jsonResponse(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidStoragePath(path: string, tenantId: string, patientId: string, documentId: string) {
  const parts = path.split('/');
  return (
    parts.length === 4 &&
    parts[0] === tenantId &&
    parts[1] === patientId &&
    parts[2] === documentId &&
    parts[3].length > 0
  );
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      error: { code: 'method_not_allowed' },
      meta: { timestamp },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized' },
        meta: { timestamp },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(500, {
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
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized' },
        meta: { timestamp },
      });
    }

    const body = (await req.json().catch(() => null)) as SignedUrlRequest | null;
    const generatedDocumentId = safeString(body?.generated_document_id);
    const patientId = safeString(body?.patient_id);

    if (!generatedDocumentId || !patientId) {
      return jsonResponse(400, {
        ok: false,
        error: { code: 'invalid_request' },
        meta: { timestamp },
      });
    }

    const { data: doc, error: documentError } = await supabase
      .from('generated_documents')
      .select('id, tenant_id, patient_id, storage_bucket, storage_path')
      .eq('id', generatedDocumentId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (documentError) throw documentError;
    if (!doc) {
      return jsonResponse(404, {
        ok: false,
        error: { code: 'not_found' },
        meta: { timestamp },
      });
    }

    const tenantId = String(doc.tenant_id);
    const documentPatientId = String(doc.patient_id);
    const documentId = String(doc.id);
    const storageBucket = String(doc.storage_bucket);
    const storagePath = String(doc.storage_path);

    if (!allowedBuckets.has(storageBucket)) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'invalid_storage_bucket' },
        meta: { timestamp },
      });
    }

    if (!isValidStoragePath(storagePath, tenantId, documentPatientId, documentId)) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'invalid_storage_path' },
        meta: { timestamp },
      });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('tenant_memberships')
      .select('tenant_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', authData.user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;

    let canReadAsStaff = false;
    if (membership) {
      const { data: canReadDocuments, error: permissionError } = await supabase.rpc(
        'has_clinical_permission',
        {
          p_tenant_id: tenantId,
          p_permission: 'documents.read',
        }
      );
      if (permissionError) throw permissionError;
      canReadAsStaff = canReadDocuments === true;
    }

    const { data: canReadOwnDocument, error: ownDocumentError } = await supabase.rpc(
      'can_read_own_patient_document',
      {
        p_tenant_id: tenantId,
        p_patient_id: documentPatientId,
      }
    );
    if (ownDocumentError) throw ownDocumentError;

    if (!canReadAsStaff && canReadOwnDocument !== true) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden' },
        meta: { timestamp },
      });
    }

    const expiresInSeconds = 300;
    const { data, error } = await admin.storage
      .from(storageBucket)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error) throw error;

    return jsonResponse(200, {
      ok: true,
      data: { url: data.signedUrl, expiresInSeconds },
      meta: {
        timestamp,
        tenant_id: tenantId,
        patient_id: documentPatientId,
        generated_document_id: documentId,
      },
    });
  } catch (error) {
    console.error('[document-signed-url] unexpected_error', {
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
