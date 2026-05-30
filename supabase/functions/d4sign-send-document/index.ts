import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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

    const body = (await req.json().catch(() => null)) as SendDocumentRequest | null;
    const generatedDocumentId = safeString(body?.generated_document_id);
    const patientId = safeString(body?.patient_id);
    const signers = sanitizeSigners(body?.signers);

    if (!generatedDocumentId || !patientId || signers.length === 0) {
      return jsonResponse(400, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'generated_document_id, patient_id and at least one valid signer are required.',
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

    const { data: canWriteDocuments, error: permissionError } = await supabase.rpc('has_clinical_permission', {
      p_tenant_id: tenantId,
      p_permission: 'documents.write',
    });

    if (permissionError) throw permissionError;
    if (canWriteDocuments !== true) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing documents.write permission.' },
        meta: { timestamp, tenantId },
      });
    }

    const { data: generatedDocument, error: generatedDocumentError } = await supabase
      .from('generated_documents')
      .select('id, tenant_id, patient_id, name, category, status')
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

    if (isPrescriptionCategory(generatedDocument.category ?? '')) {
      return jsonResponse(422, {
        ok: false,
        error: {
          code: 'unsupported_document_category',
          message: 'D4Sign must not be used for medical prescriptions.',
        },
        meta: { timestamp },
      });
    }

    const d4signTokenApi = Deno.env.get('D4SIGN_TOKEN_API');
    const d4signCryptKey = Deno.env.get('D4SIGN_CRYPT_KEY');
    const d4signBaseUrl = Deno.env.get('D4SIGN_BASE_URL');

    if (!d4signTokenApi || !d4signCryptKey || !d4signBaseUrl) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'server_misconfigured', message: 'D4Sign environment is not configured.' },
        meta: { timestamp },
      });
    }

    const d4signPayload = {
      generated_document_id: generatedDocument.id,
      name: generatedDocument.name,
      signers,
    };

    const providerResponse = await fetch(`${d4signBaseUrl.replace(/\/$/, '')}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${d4signTokenApi}`,
        'X-Crypt-Key': d4signCryptKey,
      },
      body: JSON.stringify(d4signPayload),
    });

    if (!providerResponse.ok) {
      await providerResponse.text();
      return jsonResponse(502, {
        ok: false,
        error: { code: 'provider_error', message: 'Unable to send document to D4Sign.' },
        // Intentionally omit provider raw payload to avoid leaking sensitive data.
        meta: { timestamp, provider_status: providerResponse.status },
      });
    }

    const providerData = (await providerResponse.json().catch(() => ({}))) as Record<string, unknown>;
    const providerDocumentId = safeString(providerData.document_id ?? providerData.uuid ?? providerData.id);

    const { data: signatureRequest, error: signatureRequestError } = await supabase
      .from('signature_requests')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        generated_document_id: generatedDocument.id,
        provider: 'd4sign',
        provider_document_id: providerDocumentId || null,
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
      email: signer.email || null,
      phone: signer.phone || null,
      role: signer.role,
      status: 'pending',
    }));

    const { error: signerInsertError } = await supabase.from('signature_signers').insert(signerRows);
    if (signerInsertError) throw signerInsertError;

    const { error: updateDocumentError } = await supabase
      .from('generated_documents')
      .update({ status: 'sent_for_signature' })
      .eq('id', generatedDocument.id)
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId);

    if (updateDocumentError) throw updateDocumentError;

    const { error: timelineError } = await supabase.from('patient_timeline_events').insert({
      tenant_id: tenantId,
      patient_id: patientId,
      event_type: 'documento_assinado',
      category: 'documents',
      status: 'pending',
      title: `Documento enviado para assinatura: ${generatedDocument.name}`,
      description: 'Documento enviado para assinatura digital via D4Sign.',
      actor_name: authData.user.email ?? 'Usuário do sistema',
      status_label: 'Enviado',
      action_label: 'Acompanhar assinatura',
      details_href: `/paciente-360?patient=${patientId}&tab=documentos`,
      payload: {
        generated_document_id: generatedDocument.id,
        signature_request_id: signatureRequest.id,
        provider: 'd4sign',
        signer_count: signerRows.length,
      },
    });

    if (timelineError) throw timelineError;

    return jsonResponse(200, {
      ok: true,
      data: {
        provider_document_id: signatureRequest.provider_document_id,
        signature_request_id: signatureRequest.id,
        status: signatureRequest.status,
      },
      meta: { timestamp, tenant_id: tenantId, patient_id: patientId },
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: {
        code: 'internal_error',
        message: error instanceof Error ? error.message : 'Unexpected error.',
      },
      meta: { timestamp },
    });
  }
});
