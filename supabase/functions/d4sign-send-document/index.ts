import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envBoolean, envString } from '../_shared/env.ts';

type Json = Record<string, unknown>;

type SignerInput = {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
};

type SendDocumentRequest = {
  generated_document_id?: string;
  patient_id?: string;
  signers?: SignerInput[];
};

type GeneratedDocumentRecord = {
  id: string;
  tenant_id: string;
  patient_id: string;
  name: string;
  category: string | null;
  status: string | null;
  storage_bucket: string;
  storage_path: string;
  document_templates?:
    | { d4sign_enabled?: boolean | null; status?: string | null }
    | Array<{ d4sign_enabled?: boolean | null; status?: string | null }>
    | null;
};

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
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
      'http://localhost:4028',
      'http://127.0.0.1:4028',
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

function defaultCorsOrigin() {
  return configuredAllowedOrigins().values().next().value ?? null;
}

function corsHeaders(req?: Request) {
  const headers: Record<string, string> = { ...baseCorsHeaders };
  const origin = req ? allowedCorsOrigin(req) : defaultCorsOrigin();
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

const allowedBuckets = new Set([
  'patient-documents',
  'signed-documents',
  'clinical-attachments',
  'evidence-packages',
]);

function jsonResponse(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders() });
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (record.message && typeof record.message === 'object') {
      return safeErrorMessage(record.message);
    }
    const summary = [
      typeof record.name === 'string' ? record.name : '',
      typeof record.code === 'string' ? record.code : '',
      typeof record.status === 'number' ? `status_${record.status}` : '',
    ]
      .filter(Boolean)
      .join(':');
    if (summary) return summary;
  }
  return String(error);
}

function sanitizeSigners(value: unknown): Array<Required<SignerInput>> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      name: safeString(item?.name),
      email: safeString(item?.email),
      phone: safeString(item?.phone),
      role: safeString(item?.role) || 'signer',
    }))
    .filter((signer) => signer.name && (signer.email || signer.phone));
}

function isPrescriptionCategory(category: string) {
  const normalized = category.toLowerCase();
  return normalized.includes('prescri');
}

function signerFromPatientPii(value: Record<string, unknown> | null | undefined) {
  if (!value) return [];
  return sanitizeSigners([
    {
      name: safeString(value.full_name),
      email: safeString(value.email),
      phone: safeString(value.phone),
      role: 'patient',
    },
  ]);
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

function getDocumentTemplate(record: GeneratedDocumentRecord) {
  const template = record.document_templates;
  return Array.isArray(template) ? (template[0] ?? null) : (template ?? null);
}

function templateAllowsD4Sign(record: GeneratedDocumentRecord) {
  const template = getDocumentTemplate(record);
  return template?.d4sign_enabled === true && String(template.status ?? 'active') === 'active';
}

function isProviderSupportedDocument(path: string) {
  return /\.(pdf|doc|docx|jpg|jpeg|png|bmp)$/i.test(path);
}

function sanitizeFileName(value: string) {
  const name = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return name || 'documento-slimhiper';
}

function d4signUrl(baseUrl: string, path: string, params: Record<string, string>) {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function getSafeUuid(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const row = value as Record<string, unknown>;
  return safeString(row['uuid-safe'] ?? row.uuidSafe ?? row.uuid_safe ?? row.uuid);
}

async function discoverD4SignSafeUuid(baseUrl: string, tokenApi: string, cryptKey: string) {
  const response = await fetch(
    d4signUrl(baseUrl, '/safes', {
      tokenAPI: tokenApi,
      cryptKey,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (!response.ok) {
    await response.text();
    return { uuid: '', status: response.status, found: false };
  }

  const payload = (await response.json().catch(() => [])) as unknown;
  const safes = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as Json).data)
      ? ((payload as Json).data as unknown[])
      : [];
  const uuid = getSafeUuid(safes[0]);
  return { uuid, status: response.status, found: Boolean(uuid) };
}

async function markDocumentFailed(
  supabase: ReturnType<typeof createClient>,
  generatedDocument: GeneratedDocumentRecord
) {
  await supabase
    .from('generated_documents')
    .update({ status: 'failed' })
    .eq('id', generatedDocument.id)
    .eq('tenant_id', generatedDocument.tenant_id)
    .eq('patient_id', generatedDocument.patient_id);
}

function providerErrorResponse(timestamp: string, providerStep: string, providerStatus: number) {
  return jsonResponse(502, {
    ok: false,
    error: { code: 'provider_error', message: 'Unable to send document to D4Sign.' },
    meta: { timestamp, provider_step: providerStep, provider_status: providerStatus },
  });
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();

  if (req.method === 'OPTIONS') {
    if (req.headers.get('Origin') && !allowedCorsOrigin(req)) {
      return new Response('forbidden', { status: 403, headers: corsHeaders(req) });
    }
    return new Response('ok', { headers: corsHeaders(req) });
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

    const supabaseUrl = envString(Deno.env, 'SUPABASE_URL');
    const anonKey = envString(Deno.env, 'SUPABASE_ANON_KEY');
    const serviceRoleKey = envString(Deno.env, 'SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(500, {
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

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized', message: 'Invalid or expired token.' },
        meta: { timestamp },
      });
    }

    const body = (await req.json().catch(() => null)) as SendDocumentRequest | null;
    const generatedDocumentId = safeString(body?.generated_document_id);
    const patientId = safeString(body?.patient_id);
    let signers = sanitizeSigners(body?.signers);
    let signerSource = signers.length > 0 ? 'request' : 'patient_pii';

    if (!generatedDocumentId || !patientId) {
      return jsonResponse(400, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'generated_document_id and patient_id are required.',
        },
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

    const tenantId = patient.tenant_id as string;

    const { data: membership, error: membershipError } = await supabase
      .from('tenant_memberships')
      .select('tenant_id, status')
      .eq('tenant_id', tenantId)
      .eq('user_id', authData.user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'No active tenant membership for patient tenant.' },
        meta: { timestamp },
      });
    }

    const { data: canWriteDocuments, error: permissionError } = await supabase.rpc(
      'has_clinical_permission',
      {
        p_tenant_id: tenantId,
        p_permission: 'documents.write',
      }
    );

    if (permissionError) throw permissionError;
    if (canWriteDocuments !== true) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing documents.write permission.' },
        meta: { timestamp, tenantId },
      });
    }

    if (signers.length === 0) {
      const { data: patientPii, error: patientPiiError } = await supabase
        .from('patient_pii')
        .select('full_name, email, phone')
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .maybeSingle();

      if (patientPiiError) throw patientPiiError;
      signers = signerFromPatientPii(patientPii as Record<string, unknown> | null);
      signerSource = 'patient_pii';
    }

    if (signers.length === 0 || signers.some((signer) => !signer.email)) {
      return jsonResponse(422, {
        ok: false,
        error: {
          code: 'missing_patient_signer',
          message: 'Patient needs a real name and email before D4Sign can be requested.',
        },
        meta: { timestamp, tenantId, patient_id: patientId },
      });
    }

    const { data: generatedDocument, error: generatedDocumentError } = await supabase
      .from('generated_documents')
      .select(
        'id, tenant_id, patient_id, name, category, status, storage_bucket, storage_path, document_templates!generated_documents_template_same_tenant(d4sign_enabled,status)'
      )
      .eq('id', generatedDocumentId)
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (generatedDocumentError) throw generatedDocumentError;
    if (!generatedDocument) {
      return jsonResponse(404, {
        ok: false,
        error: { code: 'not_found', message: 'Generated document not found for tenant/patient.' },
        meta: { timestamp },
      });
    }

    const documentRecord = generatedDocument as GeneratedDocumentRecord;

    if (!templateAllowsD4Sign(documentRecord)) {
      return jsonResponse(422, {
        ok: false,
        error: {
          code: 'd4sign_disabled_for_template',
          message: 'This document template is not enabled for D4Sign signature.',
        },
        meta: { timestamp },
      });
    }

    if (isPrescriptionCategory(documentRecord.category ?? '')) {
      return jsonResponse(422, {
        ok: false,
        error: {
          code: 'unsupported_document_category',
          message: 'D4Sign must not be used for medical prescriptions.',
        },
        meta: { timestamp },
      });
    }

    if (!allowedBuckets.has(documentRecord.storage_bucket)) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'invalid_storage_bucket', message: 'Document storage bucket is invalid.' },
        meta: { timestamp },
      });
    }

    if (!isValidStoragePath(documentRecord.storage_path, tenantId, patientId, documentRecord.id)) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'invalid_storage_path', message: 'Document storage path is invalid.' },
        meta: { timestamp },
      });
    }

    if (!isProviderSupportedDocument(documentRecord.storage_path)) {
      return jsonResponse(422, {
        ok: false,
        error: {
          code: 'unsupported_document_format',
          message: 'D4Sign accepts PDF, DOC, DOCX, JPG, PNG or BMP documents only.',
        },
        meta: { timestamp },
      });
    }

    const { data: existingSignatureRequest, error: existingSignatureRequestError } = await admin
      .from('signature_requests')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .eq('generated_document_id', documentRecord.id)
      .in('status', ['sent', 'viewed', 'pending'])
      .limit(1)
      .maybeSingle();

    if (existingSignatureRequestError) throw existingSignatureRequestError;
    if (existingSignatureRequest) {
      return jsonResponse(409, {
        ok: false,
        error: {
          code: 'signature_already_pending',
          message: 'This document already has a pending signature request.',
        },
        meta: { timestamp, tenantId, patient_id: patientId },
      });
    }

    const d4signTokenApi = envString(Deno.env, 'D4SIGN_TOKEN_API');
    const d4signCryptKey = envString(Deno.env, 'D4SIGN_CRYPT_KEY');
    const d4signBaseUrl = envString(Deno.env, 'D4SIGN_BASE_URL');
    let d4signSafeUuid = envString(Deno.env, 'D4SIGN_SAFE_UUID');
    const d4signFolderUuid = envString(Deno.env, 'D4SIGN_FOLDER_UUID');
    const shouldAutoDiscoverSafe = envBoolean(Deno.env, 'D4SIGN_AUTO_DISCOVER_SAFE');

    if (!d4signTokenApi || !d4signCryptKey || !d4signBaseUrl) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'server_misconfigured', message: 'D4Sign environment is not configured.' },
        meta: { timestamp },
      });
    }

    if (!d4signSafeUuid && shouldAutoDiscoverSafe) {
      const safeDiscovery = await discoverD4SignSafeUuid(
        d4signBaseUrl,
        d4signTokenApi,
        d4signCryptKey
      );
      if (!safeDiscovery.found) {
        return jsonResponse(502, {
          ok: false,
          error: {
            code: 'provider_safe_not_found',
            message: 'D4Sign did not return an available safe for this account.',
          },
          meta: { timestamp, provider_step: 'list_safes', provider_status: safeDiscovery.status },
        });
      }
      d4signSafeUuid = safeDiscovery.uuid;
    }

    if (!d4signSafeUuid) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'server_misconfigured', message: 'D4Sign safe UUID is not configured.' },
        meta: { timestamp },
      });
    }

    const { data: documentBlob, error: downloadError } = await admin.storage
      .from(documentRecord.storage_bucket)
      .download(documentRecord.storage_path);
    if (downloadError) throw downloadError;
    if (!documentBlob) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'document_storage_unavailable', message: 'Generated file was not found.' },
        meta: { timestamp },
      });
    }

    const formData = new FormData();
    formData.append('file', documentBlob, `${sanitizeFileName(documentRecord.name)}.pdf`);
    formData.append('workflow', '2');
    if (d4signFolderUuid) formData.append('uuid_folder', d4signFolderUuid);

    const uploadResponse = await fetch(
      d4signUrl(d4signBaseUrl, `/documents/${d4signSafeUuid}/upload`, {
        tokenAPI: d4signTokenApi,
        cryptKey: d4signCryptKey,
      }),
      {
        method: 'POST',
        headers: { tokenAPI: d4signTokenApi },
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      await markDocumentFailed(admin, documentRecord);
      await uploadResponse.text();
      return providerErrorResponse(timestamp, 'upload', uploadResponse.status);
    }

    const uploadData = (await uploadResponse.json().catch(() => ({}))) as Record<string, unknown>;
    const providerDocumentId = safeString(uploadData.uuid ?? uploadData.uuidDoc ?? uploadData.id);
    if (!providerDocumentId) {
      await markDocumentFailed(admin, documentRecord);
      return jsonResponse(502, {
        ok: false,
        error: { code: 'provider_contract_error', message: 'D4Sign did not return document id.' },
        meta: { timestamp, provider_step: 'upload' },
      });
    }

    const signerPayload = {
      signers: signers.map((signer) => ({
        email: signer.email,
        act: '1',
        foreign: '0',
        certificadoicpbr: '0',
        assinatura_presencial: '0',
        docauth: '0',
        docauthandselfie: '0',
        embed_methodauth: 'email',
        embed_smsnumber: '',
        upload_allow: '0',
        skipemail: '0',
      })),
    };

    const signerResponse = await fetch(
      d4signUrl(d4signBaseUrl, `/documents/${providerDocumentId}/createlist`, {
        tokenAPI: d4signTokenApi,
        cryptKey: d4signCryptKey,
      }),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signerPayload),
      }
    );

    if (!signerResponse.ok) {
      await markDocumentFailed(admin, documentRecord);
      await signerResponse.text();
      return providerErrorResponse(timestamp, 'create_signers', signerResponse.status);
    }

    const sendResponse = await fetch(
      d4signUrl(d4signBaseUrl, `/documents/${providerDocumentId}/sendtosigner`, {
        tokenAPI: d4signTokenApi,
        cryptKey: d4signCryptKey,
      }),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Documento disponivel para assinatura.',
          skip_email: '0',
          workflow: '0',
          tokenAPI: d4signTokenApi,
        }),
      }
    );

    if (!sendResponse.ok) {
      await markDocumentFailed(admin, documentRecord);
      await sendResponse.text();
      return providerErrorResponse(timestamp, 'send_to_signer', sendResponse.status);
    }

    const { data: signatureRequest, error: signatureRequestError } = await admin
      .from('signature_requests')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        generated_document_id: documentRecord.id,
        provider: 'd4sign',
        provider_document_id: providerDocumentId,
        status: 'sent',
        sent_at: timestamp,
      })
      .select('id, provider_document_id, status')
      .single();

    if (signatureRequestError) throw signatureRequestError;

    const signerRows = signers.map((signer) => ({
      tenant_id: tenantId,
      signature_request_id: signatureRequest.id,
      name: signer.name,
      email: signer.email,
      phone: signer.phone || null,
      role: signer.role,
      status: 'pending',
    }));

    const { error: signerInsertError } = await admin.from('signature_signers').insert(signerRows);
    if (signerInsertError) throw signerInsertError;

    const { error: updateDocumentError } = await admin
      .from('generated_documents')
      .update({ status: 'sent_for_signature' })
      .eq('id', documentRecord.id)
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId);

    if (updateDocumentError) throw updateDocumentError;

    const { error: timelineError } = await admin.from('patient_timeline_events').insert({
      tenant_id: tenantId,
      patient_id: patientId,
      event_type: 'documento_assinado',
      category: 'documents',
      status: 'pending',
      title: `Documento enviado para assinatura: ${documentRecord.name}`,
      description: 'Documento enviado para assinatura digital via D4Sign.',
      actor_name: authData.user.email ?? 'Usuario do sistema',
      status_label: 'Enviado',
      action_label: 'Acompanhar assinatura',
      details_href: `/paciente-360?patient=${patientId}&tab=documentos`,
      payload: {
        generated_document_id: documentRecord.id,
        signature_request_id: signatureRequest.id,
        provider: 'd4sign',
        signer_count: signerRows.length,
        signer_source: signerSource,
      },
    });

    if (timelineError) throw timelineError;

    return jsonResponse(200, {
      ok: true,
      data: {
        signature_request_id: signatureRequest.id,
        status: signatureRequest.status,
        signer_source: signerSource,
      },
      meta: { timestamp },
    });
  } catch (error) {
    console.error('[d4sign-send-document] unexpected_error', {
      message: safeErrorMessage(error),
    });

    return jsonResponse(500, {
      ok: false,
      error: {
        code: 'internal_error',
        message: 'Unexpected server error.',
      },
      meta: { timestamp },
    });
  }
});
