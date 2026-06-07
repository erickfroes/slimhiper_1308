import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

type GeneratePrescriptionPdfRequest = {
  prescription_id?: string;
  patient_id?: string;
};

type PrescriptionRow = {
  id: string;
  tenant_id: string;
  patient_id: string;
  category: string;
  status: string;
  title: string;
  summary: string | null;
  issue_date: string | null;
  valid_until: string | null;
  current_version: number | null;
};

type PrescriptionItemRow = {
  id: string;
  position: number;
  item_type: string;
  label: string;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  quantity: string | null;
  instructions: string | null;
};

type RegulatoryRow = {
  legal_signature_requirement: string;
  legal_signature_status: string;
  regulatory_classification: string;
  provider_policy: string;
  prescriber_name: string | null;
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

function createPdfBytes(title: string, lines: string[]) {
  const pageLines = [title, '', ...lines].flatMap((line) => wrapPdfLine(line, 88)).slice(0, 58);
  const textStream = [
    'BT',
    '/F1 11 Tf',
    '50 792 Td',
    '14 TL',
    ...pageLines.map((line, index) => `${index === 0 ? '' : 'T* '}(${escapePdfText(line)}) Tj`),
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

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
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

    const body = (await req.json().catch(() => null)) as GeneratePrescriptionPdfRequest | null;
    const prescriptionId = safeString(body?.prescription_id);
    const requestedPatientId = safeString(body?.patient_id);

    if (!isUuid(prescriptionId) || (requestedPatientId && !isUuid(requestedPatientId))) {
      return jsonResponse(req, 400, {
        ok: false,
        error: { code: 'invalid_request' },
        meta: { timestamp },
      });
    }

    const { data: prescriptionData, error: prescriptionError } = await supabase
      .from('prescriptions')
      .select(
        'id, tenant_id, patient_id, category, status, title, summary, issue_date, valid_until, current_version'
      )
      .eq('id', prescriptionId)
      .maybeSingle();

    if (prescriptionError) throw prescriptionError;
    if (!prescriptionData) {
      return jsonResponse(req, 404, {
        ok: false,
        error: { code: 'not_found' },
        meta: { timestamp },
      });
    }

    const prescription = prescriptionData as PrescriptionRow;
    if (requestedPatientId && requestedPatientId !== prescription.patient_id) {
      return jsonResponse(req, 400, {
        ok: false,
        error: { code: 'patient_mismatch' },
        meta: { timestamp },
      });
    }
    if (prescription.status !== 'issued') {
      return jsonResponse(req, 409, {
        ok: false,
        error: { code: 'prescription_not_issued' },
        meta: { timestamp },
      });
    }

    const { data: canWrite, error: permissionError } = await supabase.rpc(
      'has_clinical_permission',
      {
        p_tenant_id: prescription.tenant_id,
        p_permission: 'prescriptions.write',
      }
    );
    if (permissionError) throw permissionError;
    if (canWrite !== true) {
      return jsonResponse(req, 403, {
        ok: false,
        error: { code: 'forbidden' },
        meta: { timestamp },
      });
    }

    const [{ data: itemsData, error: itemsError }, { data: regulatoryData, error: regulatoryError }] =
      await Promise.all([
        admin
          .from('prescription_items')
          .select(
            'id, position, item_type, label, dosage, route, frequency, duration, quantity, instructions'
          )
          .eq('tenant_id', prescription.tenant_id)
          .eq('prescription_id', prescription.id)
          .order('position', { ascending: true }),
        admin
          .from('prescription_regulatory_metadata')
          .select(
            'legal_signature_requirement, legal_signature_status, regulatory_classification, provider_policy, prescriber_name'
          )
          .eq('tenant_id', prescription.tenant_id)
          .eq('prescription_id', prescription.id)
          .maybeSingle(),
      ]);

    if (itemsError) throw itemsError;
    if (regulatoryError) throw regulatoryError;

    const [{ data: patientPii }, { data: tenant }, { data: profile }] = await Promise.all([
      admin
        .from('patient_pii')
        .select('full_name, cpf_masked, birth_date')
        .eq('tenant_id', prescription.tenant_id)
        .eq('patient_id', prescription.patient_id)
        .maybeSingle(),
      admin.from('tenants').select('name').eq('id', prescription.tenant_id).maybeSingle(),
      admin
        .from('profiles')
        .select('full_name, email')
        .eq('id', authData.user.id)
        .maybeSingle(),
    ]);

    const items = (itemsData ?? []) as PrescriptionItemRow[];
    const regulatory = regulatoryData as RegulatoryRow | null;
    const professionalName =
      regulatory?.prescriber_name ??
      profile?.full_name ??
      profile?.email ??
      authData.user.email ??
      'Equipe clinica';

    const contentLines = [
      `Clinica: ${tenant?.name ?? 'SlimHiper'}`,
      `Paciente: ${patientPii?.full_name ?? 'Paciente'}`,
      patientPii?.cpf_masked ? `CPF: ${patientPii.cpf_masked}` : '',
      patientPii?.birth_date ? `Nascimento: ${formatDate(patientPii.birth_date)}` : '',
      `Profissional: ${professionalName}`,
      `Categoria: ${prescription.category}`,
      `Emissao: ${formatDate(prescription.issue_date)}`,
      `Validade: ${formatDate(prescription.valid_until)}`,
      `Versao: ${prescription.current_version ?? 1}`,
      `Classificacao: ${regulatory?.regulatory_classification ?? 'clinical'}`,
      `Assinatura: ${regulatory?.legal_signature_requirement ?? 'none'} / ${regulatory?.legal_signature_status ?? 'not_required'}`,
      '',
      'Itens',
      ...items.flatMap((item) => [
        `${item.position}. ${item.label}`,
        item.dosage ? `Dose: ${item.dosage}` : '',
        item.route ? `Via: ${item.route}` : '',
        item.frequency ? `Frequencia: ${item.frequency}` : '',
        item.duration ? `Duracao: ${item.duration}` : '',
        item.quantity ? `Quantidade: ${item.quantity}` : '',
        item.instructions ? `Orientacoes: ${item.instructions}` : '',
      ]),
      prescription.summary ? '' : '',
      prescription.summary ? `Observacoes: ${prescription.summary}` : '',
      '',
      'Documento gerado em bucket privado. Link de acesso deve ser assinado e temporario.',
    ].filter((line) => line !== '');

    const artifactId = crypto.randomUUID();
    const storageBucket = 'prescription-pdfs';
    const storagePath = `${prescription.tenant_id}/${prescription.patient_id}/${prescription.id}/${artifactId}/prescription.pdf`;
    if (
      !isValidPrescriptionPdfPath(
        storagePath,
        prescription.tenant_id,
        prescription.patient_id,
        prescription.id,
        artifactId
      )
    ) {
      return jsonResponse(req, 500, {
        ok: false,
        error: { code: 'invalid_storage_path' },
        meta: { timestamp },
      });
    }

    const pdfBytes = createPdfBytes(prescription.title || 'Prescricao SlimHiper', contentLines);
    const digestSha256 = await sha256Hex(pdfBytes);

    await admin
      .from('prescription_pdf_artifacts')
      .update({ status: 'superseded' })
      .eq('tenant_id', prescription.tenant_id)
      .eq('prescription_id', prescription.id)
      .eq('status', 'generated');

    const { error: uploadError } = await admin.storage
      .from(storageBucket)
      .upload(storagePath, new Blob([pdfBytes], { type: 'application/pdf' }), {
        upsert: true,
        contentType: 'application/pdf',
      });
    if (uploadError) throw uploadError;

    const { data: artifact, error: artifactError } = await admin
      .from('prescription_pdf_artifacts')
      .insert({
        id: artifactId,
        tenant_id: prescription.tenant_id,
        patient_id: prescription.patient_id,
        prescription_id: prescription.id,
        version_number: prescription.current_version ?? 1,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        file_name: 'prescription.pdf',
        size_bytes: pdfBytes.byteLength,
        digest_sha256: digestSha256,
        released_to_patient: true,
        released_at: timestamp,
        generated_by: authData.user.id,
        metadata: {
          regulatoryClassification: regulatory?.regulatory_classification ?? null,
          providerPolicy: regulatory?.provider_policy ?? null,
        },
      })
      .select('id, status, generated_at, version_number')
      .single();
    if (artifactError) throw artifactError;

    const signatureRequirement =
      regulatory?.legal_signature_requirement ??
      (prescription.category === 'prescricao_medica' ? 'qualified_or_icp_required' : 'none');
    const signatureStatus =
      regulatory?.legal_signature_status ??
      (signatureRequirement === 'qualified_or_icp_required' ? 'not_configured' : 'not_required');

    await admin.from('legal_signatures').insert({
      tenant_id: prescription.tenant_id,
      patient_id: prescription.patient_id,
      prescription_id: prescription.id,
      pdf_artifact_id: artifactId,
      provider:
        signatureRequirement === 'qualified_or_icp_required'
          ? 'internal_policy'
          : 'internal_policy',
      signature_type:
        signatureRequirement === 'qualified_or_icp_required' ? 'qualified' : 'not_required',
      status: signatureStatus,
      requested_by: authData.user.id,
      requested_at: timestamp,
      validation_summary: {
        pdfDigestSha256: digestSha256,
        rawProviderPayloadStored: false,
      },
    });

    await Promise.all([
      admin.from('patient_timeline_events').insert({
        tenant_id: prescription.tenant_id,
        patient_id: prescription.patient_id,
        event_type: 'documento_gerado',
        category: 'documents',
        status: 'recorded',
        title: 'PDF regulatorio de prescricao gerado',
        description: 'Arquivo privado gerado pela equipe autorizada.',
        actor_name: profile?.full_name ?? profile?.email ?? 'Equipe clinica',
        status_label: 'Gerado',
        details_href: `/paciente-360?patient=${prescription.patient_id}&tab=prescricoes`,
        payload: {
          prescriptionId: prescription.id,
          artifactId,
          version: prescription.current_version ?? 1,
        },
      }),
      admin.from('audit_logs').insert({
        tenant_id: prescription.tenant_id,
        user_id: authData.user.id,
        action: 'patient_prescription.pdf_generated',
        entity_type: 'prescription',
        entity_id: prescription.id,
        metadata: {
          patientId: prescription.patient_id,
          artifactId,
          version: prescription.current_version ?? 1,
          digestSha256,
        },
      }),
    ]);

    const expiresInSeconds = 300;
    const { data: signed, error: signedError } = await admin.storage
      .from(storageBucket)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (signedError) throw signedError;

    return jsonResponse(req, 200, {
      ok: true,
      data: {
        artifact: {
          id: artifact.id,
          status: artifact.status,
          versionNumber: artifact.version_number,
          generatedAt: artifact.generated_at,
          url: signed.signedUrl,
          expiresInSeconds,
        },
        signature: {
          requirement: signatureRequirement,
          status: signatureStatus,
        },
      },
      meta: { timestamp },
    });
  } catch {
    console.error('[generate-prescription-pdf] unexpected_error');

    return jsonResponse(req, 500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
