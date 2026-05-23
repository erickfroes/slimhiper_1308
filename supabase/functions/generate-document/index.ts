import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

type Json = Record<string, unknown>;

type GenerateDocumentRequest = {
  patient_id?: string;
  template_id?: string;
  variables?: Record<string, unknown>;
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

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function interpolateTemplate(templateBody: string, variables: Record<string, unknown>) {
  return templateBody.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  });
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidStoragePath(path: string, tenantId: string, patientId: string, documentId: string) {
  if (!path) return false;
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

    const body = (await req.json().catch(() => null)) as GenerateDocumentRequest | null;
    const patientId = typeof body?.patient_id === 'string' ? body.patient_id.trim() : '';
    const templateId = typeof body?.template_id === 'string' ? body.template_id.trim() : '';
    const variablesOverride = toRecord(body?.variables);

    if (!patientId || !templateId) {
      return jsonResponse(400, {
        ok: false,
        error: { code: 'invalid_request', message: 'patient_id and template_id are required.' },
        meta: { timestamp, userId: authData.user.id },
      });
    }

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, tenant_id, preferred_name, status')
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
        meta: { timestamp, tenantId },
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

    const { data: template, error: templateError } = await supabase
      .from('document_templates')
      .select('id, tenant_id, name, category, status, template_body, variables')
      .eq('id', templateId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (templateError) throw templateError;
    if (!template) {
      return jsonResponse(404, {
        ok: false,
        error: { code: 'not_found', message: 'Template not found for tenant.' },
        meta: { timestamp, tenantId },
      });
    }

    const { data: patientPii, error: piiError } = await supabase
      .from('patient_pii')
      .select('full_name, email, phone, cpf_masked, birth_date, sex_gender')
      .eq('patient_id', patientId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (piiError) throw piiError;

    const defaultVariables = toRecord(template.variables);
    const systemVariables: Record<string, unknown> = {
      patient_id: patient.id,
      patient_name: patientPii?.full_name ?? patient.preferred_name ?? '',
      patient_email: patientPii?.email ?? '',
      patient_phone: patientPii?.phone ?? '',
      patient_cpf_masked: patientPii?.cpf_masked ?? '',
      patient_birth_date: patientPii?.birth_date ?? '',
      patient_sex_gender: patientPii?.sex_gender ?? '',
      generated_at: timestamp,
      generated_by_user_id: authData.user.id,
    };

    const mergedVariables = {
      ...defaultVariables,
      ...systemVariables,
      ...variablesOverride,
    };

    const templateBody = typeof template.template_body === 'string' ? template.template_body : '';
    const renderedContent = interpolateTemplate(templateBody, mergedVariables);

    const generatedDocumentId = crypto.randomUUID();
    if (!isUuidLike(tenantId) || !isUuidLike(patientId) || !isUuidLike(generatedDocumentId)) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'internal_error', message: 'Invalid storage identifiers.' },
        meta: { timestamp },
      });
    }
    const storageBucket = 'patient-documents';
    const storagePath = `${tenantId}/${patientId}/${generatedDocumentId}/document.html`;
    if (!isValidStoragePath(storagePath, tenantId, patientId, generatedDocumentId)) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'internal_error', message: 'Invalid storage path format.' },
        meta: { timestamp },
      });
    }

    const uploadContent = new Blob([renderedContent], { type: 'text/html; charset=utf-8' });
    const { error: uploadError } = await supabase.storage.from(storageBucket).upload(storagePath, uploadContent, { upsert: true, contentType: 'text/html; charset=utf-8' });
    if (uploadError) throw uploadError;

    const { data: generatedDocument, error: generatedDocumentError } = await supabase
      .from('generated_documents')
      .insert({
        id: generatedDocumentId,
        tenant_id: tenantId,
        patient_id: patientId,
        template_id: template.id,
        name: template.name,
        category: template.category,
        status: 'draft',
        storage_bucket: storageBucket,
        storage_path: storagePath,
        generated_by: authData.user.id,
      })
      .select('id, tenant_id, patient_id, template_id, name, category, status, generated_by, generated_at, created_at, updated_at')
      .single();

    if (generatedDocumentError) throw generatedDocumentError;

    const timelinePayload = {
      template_id: template.id,
      generated_document_id: generatedDocument.id,
      rendered_content: renderedContent,
      variables: mergedVariables,
    };

    const { error: timelineError } = await supabase.from('patient_timeline_events').insert({
      tenant_id: tenantId,
      patient_id: patientId,
      event_type: 'documento_gerado',
      category: 'documents',
      status: 'recorded',
      title: `Documento gerado: ${template.name}`,
      description: `Documento \"${template.name}\" gerado para o paciente.`,
      actor_name: authData.user.email ?? 'Usuário do sistema',
      status_label: 'Gerado',
      action_label: 'Visualizar documento',
      details_href: `/paciente-360?patient=${patientId}&tab=documentos`,
      payload: timelinePayload,
    });

    if (timelineError) throw timelineError;

    return jsonResponse(200, {
      ok: true,
      data: {
        generatedDocument: {
          id: generatedDocument.id,
          status: generatedDocument.status,
          name: generatedDocument.name,
          category: generatedDocument.category,
          generated_at: generatedDocument.generated_at,
          created_at: generatedDocument.created_at,
        },
      },
      meta: {
        timestamp,
        tenant_id: tenantId,
        patient_id: patientId,
      },
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
