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
  'Access-Control-Allow-Origin': (Deno.env.get('APP_ALLOWED_ORIGINS') ?? Deno.env.get('SITE_URL') ?? Deno.env.get('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:4028').split(',')[0].trim(),
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

function normalizePdfText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '?');
}

function escapePdfText(value: string) {
  return normalizePdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapPdfLine(value: string, maxLength = 88) {
  const line = normalizePdfText(value).replace(/\s+/g, ' ').trim();
  if (!line) return [''];

  const wrapped: string[] = [];
  let remaining = line;
  while (remaining.length > maxLength) {
    const index = remaining.lastIndexOf(' ', maxLength);
    const splitAt = index > 24 ? index : maxLength;
    wrapped.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  wrapped.push(remaining);
  return wrapped;
}

function createPdfBytes(title: string, content: string) {
  const lines = [
    ...wrapPdfLine(title, 76),
    '',
    ...content.split(/\r?\n/).flatMap((line) => wrapPdfLine(line, 88)),
  ].slice(0, 52);

  const textStream = [
    'BT',
    '/F1 11 Tf',
    '50 792 Td',
    '14 TL',
    ...lines.map((line, index) => `${index === 0 ? '' : 'T* '}(${escapePdfText(line)}) Tj`),
    'ET',
  ].join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${textStream.length} >>\nstream\n${textStream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object) => {
    const offset = pdf.length;
    pdf += object;
    return offset;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
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

const PROTECTED_VARIABLE_KEYS = new Set([
  'patient_id',
  'patient_name',
  'patient_email',
  'patient_phone',
  'patient_cpf_masked',
  'patient_birth_date',
  'patient_sex_gender',
  'clinic_name',
  'date',
  'generated_at',
  'generated_by_user_id',
  'professional_name',
]);

function sanitizeVariableOverrides(
  overrides: Record<string, unknown>,
  templateVariables: Record<string, unknown>
) {
  const allowedKeys = new Set(
    Object.keys(templateVariables).filter((key) => !PROTECTED_VARIABLE_KEYS.has(key))
  );
  const sanitized: Record<string, string | number | boolean> = {};
  const invalidKeys: string[] = [];

  for (const [key, value] of Object.entries(overrides)) {
    if (!allowedKeys.has(key)) {
      invalidKeys.push(key);
      continue;
    }
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'string') {
      if (value.length > 500) invalidKeys.push(key);
      else sanitized[key] = value;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      sanitized[key] = value;
      continue;
    }
    invalidKeys.push(key);
  }

  return { sanitized, invalidKeys };
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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
    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
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
    if (template.status !== 'active') {
      return jsonResponse(422, {
        ok: false,
        error: {
          code: 'inactive_template',
          message: 'Only active document templates can be generated.',
        },
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
    const { sanitized: safeOverrides, invalidKeys } = sanitizeVariableOverrides(
      variablesOverride,
      defaultVariables
    );
    if (invalidKeys.length > 0) {
      return jsonResponse(400, {
        ok: false,
        error: {
          code: 'invalid_template_variables',
          message: 'Document variables include keys that are not allowed for this template.',
          invalid_keys: invalidKeys,
        },
        meta: { timestamp, tenantId },
      });
    }

    const [{ data: tenant }, { data: profile }] = await Promise.all([
      serviceSupabase.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
      serviceSupabase
        .from('profiles')
        .select('full_name,email')
        .eq('id', authData.user.id)
        .maybeSingle(),
    ]);

    const systemVariables: Record<string, unknown> = {
      patient_id: patient.id,
      patient_name: patientPii?.full_name ?? patient.preferred_name ?? '',
      patient_email: patientPii?.email ?? '',
      patient_phone: patientPii?.phone ?? '',
      patient_cpf_masked: patientPii?.cpf_masked ?? '',
      patient_birth_date: patientPii?.birth_date ?? '',
      patient_sex_gender: patientPii?.sex_gender ?? '',
      clinic_name: tenant?.name ?? '',
      date: new Date(timestamp).toLocaleDateString('pt-BR'),
      generated_at: timestamp,
      generated_by_user_id: authData.user.id,
      professional_name: profile?.full_name ?? profile?.email ?? authData.user.email ?? '',
    };

    const mergedVariables = {
      ...defaultVariables,
      ...safeOverrides,
      ...systemVariables,
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
    const storagePath = `${tenantId}/${patientId}/${generatedDocumentId}/document.pdf`;
    if (!isValidStoragePath(storagePath, tenantId, patientId, generatedDocumentId)) {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'internal_error', message: 'Invalid storage path format.' },
        meta: { timestamp },
      });
    }

    const pdfBytes = createPdfBytes(template.name ?? 'Documento SlimHiper', renderedContent);
    const uploadContent = new Blob([pdfBytes], { type: 'application/pdf' });
    const { error: uploadError } = await serviceSupabase.storage
      .from(storageBucket)
      .upload(storagePath, uploadContent, {
        upsert: true,
        contentType: 'application/pdf',
      });
    if (uploadError) throw uploadError;

    const { data: generatedDocument, error: generatedDocumentError } = await serviceSupabase
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
      .select(
        'id, tenant_id, patient_id, template_id, name, category, status, generated_by, generated_at, created_at, updated_at'
      )
      .single();

    if (generatedDocumentError) throw generatedDocumentError;

    const timelinePayload = {
      template_id: template.id,
      generated_document_id: generatedDocument.id,
      document_name: generatedDocument.name,
      document_category: generatedDocument.category,
      document_status: generatedDocument.status,
    };

    const { error: timelineError } = await serviceSupabase.from('patient_timeline_events').insert({
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
    console.error('[generate-document] unexpected_error', {
      message: error instanceof Error ? error.message : String(error),
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
