import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function jsonResponse(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

function toPdfDocument(payload: Record<string, unknown>): string {
  const rows = Array.isArray(payload.rows) ? payload.rows.map(asRecord) : [];
  const title = asString(payload.reportKey, 'relatorio-clinico');
  const lines = [
    `SlimHiper - ${title}`,
    'Export seguro, minimizado e auditado.',
    `Gerado em ${new Date().toISOString()}`,
    '',
    ...rows.slice(0, 24).map((row) =>
      Object.entries(row)
        .map(([key, value]) => `${key}: ${formatPdfValue(value)}`)
        .join(' | ')
    ),
  ];

  if (rows.length === 0) lines.push('Sem dados para os filtros selecionados.');
  if (rows.length > 24)
    lines.push(`Resultado truncado na previa PDF: ${rows.length} linhas no total.`);

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

function formatPdfValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      error: { code: 'method_not_allowed', message: 'Only GET or POST is allowed.' },
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
      console.error('[clinic-report-export] missing environment configuration');
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

    const body =
      req.method === 'POST'
        ? asRecord(await req.json().catch(() => ({})))
        : Object.fromEntries(new URL(req.url).searchParams.entries());

    const runId = asString(body.run_id);
    const exportToken = asString(body.token);
    if (!runId || !exportToken) {
      return jsonResponse(400, {
        ok: false,
        error: { code: 'invalid_export_request', message: 'Report run and token are required.' },
        meta: { timestamp },
      });
    }

    const { data, error } = await supabase.rpc('get_clinic_report_export', {
      p_run_id: runId,
      p_export_token: exportToken,
    });
    if (error) throw error;

    const payload = asRecord(data);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const format = asString(payload.format, 'csv');
    const filename = asString(payload.filename, `relatorio.${format}`);

    if (format === 'pdf') {
      return new Response(toPdfDocument(payload), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response(toCsv(rows), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /forbidden|permission|expired|invalid|42501/i.test(message) ? 403 : 500;
    console.error('[clinic-report-export] unexpected_error', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });

    return jsonResponse(status, {
      ok: false,
      error: {
        code: status === 403 ? 'forbidden_or_expired' : 'internal_error',
        message: status === 403 ? 'Export expirado ou sem permissao.' : 'Unexpected server error.',
      },
      meta: { timestamp },
    });
  }
});
