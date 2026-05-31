import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (status: number, payload: Json) =>
  new Response(JSON.stringify(payload), { status, headers: corsHeaders });

const activeSignatureStatuses = new Set(['pending', 'sent', 'viewed']);
const signableCategories = new Set(['termo', 'contrato', 'consentimento', 'orientacao']);

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSignatureStatus(value: unknown) {
  const status = safeString(value).toLowerCase();
  if (
    status.includes('sign') ||
    status.includes('assinad') ||
    status === 'done' ||
    status === 'completed'
  ) {
    return 'signed';
  }
  if (status.includes('view') || status.includes('opened') || status.includes('visualiz')) {
    return 'viewed';
  }
  if (status.includes('reject') || status.includes('refus') || status.includes('declin')) {
    return 'rejected';
  }
  if (status.includes('expir')) return 'expired';
  if (status.includes('cancel')) return 'canceled';
  if (status.includes('error') || status.includes('fail') || status.includes('invalid')) {
    return 'error';
  }
  if (status.includes('sent') || status.includes('created') || status.includes('enviado')) {
    return 'sent';
  }
  if (status.includes('pending')) return 'sent';
  return 'sent';
}

function documentStatusFromSignature(status: string) {
  if (status === 'signed') return 'assinado';
  if (status === 'rejected' || status === 'canceled') return 'cancelado';
  if (status === 'expired') return 'vencido';
  if (status === 'error') return 'em_analise';
  return 'pendente_assinatura';
}

function mapDocumentStatus(documentStatus: unknown, signatureStatus?: string) {
  if (signatureStatus) return documentStatusFromSignature(signatureStatus);

  const status = safeString(documentStatus).toLowerCase();
  if (status === 'signed' || status === 'assinado') return 'assinado';
  if (status === 'sent_for_signature' || status === 'pending_signature') {
    return 'pendente_assinatura';
  }
  if (status === 'expired') return 'vencido';
  if (status === 'cancelled' || status === 'canceled') return 'cancelado';
  if (status === 'failed') return 'em_analise';
  if (status === 'draft') return 'em_analise';
  return 'disponivel';
}

function signatureLabelFromDocumentStatus(status: string, hasSignatureRequest: boolean) {
  if (status === 'assinado') return 'assinado';
  if (hasSignatureRequest || status === 'pendente_assinatura') return 'pendente';
  return 'nao_requerido';
}

function getSignatureDisabledReason(params: {
  category: string;
  documentStatus: string;
  signatureStatus?: string;
}) {
  if (params.documentStatus === 'assinado') return 'Documento ja esta assinado.';
  if (params.signatureStatus && activeSignatureStatuses.has(params.signatureStatus)) {
    return 'Documento ja possui assinatura pendente.';
  }
  if (!signableCategories.has(params.category)) {
    return 'Categoria sem contrato local para envio D4Sign.';
  }
  if (params.documentStatus === 'cancelado' || params.documentStatus === 'vencido') {
    return 'Documento nao pode ser enviado nesse status.';
  }
  return undefined;
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      error: { code: 'method_not_allowed' },
      meta: { timestamp },
    });
  }

  try {
    const auth = req.headers.get('Authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized' },
        meta: { timestamp },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized' },
        meta: { timestamp },
      });
    }

    const body = await req.json().catch(() => ({}));
    const patientId = typeof body.patient_id === 'string' ? body.patient_id : '';
    if (!patientId) {
      return jsonResponse(400, {
        ok: false,
        error: { code: 'invalid_request', message: 'patient_id required' },
        meta: { timestamp },
      });
    }

    const { data: patient } = await supabase
      .from('patients')
      .select('id, tenant_id')
      .eq('id', patientId)
      .maybeSingle();
    if (!patient) {
      return jsonResponse(404, {
        ok: false,
        error: { code: 'not_found' },
        meta: { timestamp },
      });
    }

    const tenantId = patient.tenant_id as string;

    const { data: membership } = await supabase
      .from('tenant_memberships')
      .select('tenant_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden' },
        meta: { timestamp, tenant_id: tenantId },
      });
    }

    const { data: canRead } = await supabase.rpc('has_clinical_permission', {
      p_tenant_id: tenantId,
      p_permission: 'documents.read',
    });
    if (canRead !== true) {
      return jsonResponse(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Missing documents.read permission.' },
        meta: { timestamp, tenant_id: tenantId },
      });
    }

    const { data: rows, error } = await supabase
      .from('generated_documents')
      .select(
        'id,patient_id,name,category,status,generated_at,created_at,signature_requests(id,status,provider_document_id,created_at)'
      )
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const documents = (rows ?? []).map((row: any) => {
      const signatureRequest = Array.isArray(row.signature_requests)
        ? row.signature_requests[0]
        : null;
      const signatureStatus = signatureRequest
        ? normalizeSignatureStatus(signatureRequest.status)
        : undefined;
      const status = mapDocumentStatus(row.status, signatureStatus);
      const category = safeString(row.category);
      const disabledReason = getSignatureDisabledReason({
        category,
        documentStatus: status,
        signatureStatus,
      });

      return {
        id: row.id,
        patientId: row.patient_id,
        name: row.name,
        category,
        tipo: category,
        status,
        assinatura: signatureLabelFromDocumentStatus(status, Boolean(signatureRequest)),
        emitidoEm: new Date(row.generated_at ?? row.created_at).toLocaleDateString('pt-BR'),
        emitidoPor: 'Equipe clinica',
        hasEvidencePackage: false,
        canRequestSignature: disabledReason === undefined,
        signatureDisabledReason: disabledReason,
        signature: signatureRequest
          ? {
              provider: 'd4sign',
              providerDocumentId: signatureRequest.provider_document_id ?? null,
              signatureRequestId: signatureRequest.id,
              status: signatureStatus,
            }
          : undefined,
      };
    });

    return jsonResponse(200, {
      ok: true,
      data: { documents },
      meta: { timestamp, tenant_id: tenantId, patient_id: patientId, count: documents.length },
    });
  } catch (error) {
    console.error('[patient-documents] unexpected_error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(500, {
      ok: false,
      error: { code: 'internal_error', message: 'Unexpected server error.' },
      meta: { timestamp },
    });
  }
});
