import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': (Deno.env.get('APP_ALLOWED_ORIGINS') ?? Deno.env.get('SITE_URL') ?? Deno.env.get('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:4028').split(',')[0].trim(),
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

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: unknown[]): string {
  const records = rows.map(asRecord);
  const columns = Array.from(new Set(records.flatMap((row) => Object.keys(row))));
  if (columns.length === 0) return 'sem_dados\n';

  return [
    columns.map(csvEscape).join(','),
    ...records.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ].join('\n');
}

function pdfEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .slice(0, 110);
}

function formatPdfValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toPdfDocument(payload: Record<string, unknown>): string {
  const rows = Array.isArray(payload.rows) ? payload.rows.map(asRecord) : [];
  const title = asString(payload.reportKey, 'relatorio-clinico');
  const lines = [
    `SlimHiper - ${title}`,
    'Export persistente, minimizado e auditado.',
    `Gerado em ${new Date().toISOString()}`,
    '',
    ...rows.slice(0, 24).map((row) =>
      Object.entries(row)
        .map(([key, value]) => `${key}: ${formatPdfValue(value)}`)
        .join(' | ')
    ),
  ];

  if (rows.length === 0) lines.push('Sem dados para os filtros selecionados.');
  if (rows.length > 24) {
    lines.push(`Resultado truncado na previa PDF: ${rows.length} linhas no total.`);
  }

  const content = [
    'BT',
    '/F1 10 Tf',
    '50 790 Td',
    ...lines.flatMap((line, index) => {
      const escaped = pdfEscape(line);
      return index === 0 ? [`(${escaped}) Tj`] : ['0 -14 Td', `(${escaped}) Tj`];
    }),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function persistReportArtifact(params: {
  supabase: ReturnType<typeof createClient>;
  admin: ReturnType<typeof createClient>;
  run: Record<string, unknown>;
}) {
  const runId = asString(params.run.id);
  if (!runId) throw new Error('invalid_report_run_contract');

  const { data: artifactData, error: artifactError } = await params.supabase.rpc(
    'prepare_clinic_report_artifact',
    { p_run_id: runId }
  );
  if (artifactError) throw artifactError;

  const artifact = asRecord(artifactData);
  const artifactId = asString(artifact.id);
  const bucket = asString(artifact.storageBucket);
  const path = asString(artifact.storagePath);
  const mimeType = asString(artifact.mimeType);
  const format = asString(artifact.format, asString(params.run.exportFormat, 'csv'));

  if (!artifactId || bucket !== 'report-exports' || !path || !mimeType) {
    throw new Error('invalid_report_artifact_contract');
  }

  const rows = Array.isArray(params.run.rows) ? params.run.rows : [];
  const content = format === 'pdf' ? toPdfDocument(params.run) : toCsv(rows);
  const bytes = new TextEncoder().encode(content);
  const checksum = await sha256Hex(bytes);

  const { error: uploadError } = await params.admin.storage
    .from(bucket)
    .upload(path, new Blob([bytes], { type: mimeType }), {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    await params.supabase.rpc('mark_clinic_report_artifact_failed', {
      p_artifact_id: artifactId,
      p_error_message: 'storage_upload_failed',
    });
    throw new Error('report_artifact_upload_failed');
  }

  const { data: readyRun, error: readyError } = await params.supabase.rpc(
    'mark_clinic_report_artifact_ready',
    {
      p_artifact_id: artifactId,
      p_size_bytes: bytes.byteLength,
      p_content_sha256: checksum,
    }
  );
  if (readyError) throw readyError;

  return asRecord(readyRun);
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

      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!serviceRoleKey) {
        console.error('[clinic-reports] missing artifact storage configuration');
        return jsonResponse(500, {
          ok: false,
          error: { code: 'server_misconfigured', message: 'Server configuration error.' },
          meta: { timestamp },
        });
      }

      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data, error } = await supabase.rpc('create_clinic_report_run', {
        p_report_key: reportKey,
        p_filters: asRecord(body.filters),
        p_export_format: exportFormat,
        p_patient_id: asString(body.patient_id) || null,
      });
      if (error) throw error;

      const persistedRun = await persistReportArtifact({
        supabase,
        admin,
        run: asRecord(data),
      });

      return jsonResponse(200, { ok: true, data: persistedRun, meta: { timestamp } });
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

    if (action === 'history') {
      const { data, error } = await supabase.rpc('list_clinic_report_runs', {
        p_report_key: asString(body.report_key) || null,
        p_status: asString(body.status) || null,
        p_from: asString(body.from) || null,
        p_to: asString(body.to) || null,
        p_limit: Number.isFinite(Number(body.limit)) ? Number(body.limit) : 20,
      });
      if (error) throw error;
      return jsonResponse(200, { ok: true, data: data ?? [], meta: { timestamp } });
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
