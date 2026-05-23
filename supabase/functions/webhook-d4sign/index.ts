import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type JsonRecord = Record<string, unknown>;

type SignatureStatus = 'sent' | 'viewed' | 'signed' | 'rejected' | 'expired' | 'canceled' | 'error';
type SignerStatus = 'pending' | 'viewed' | 'signed' | 'rejected' | 'expired' | 'canceled' | 'error';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-d4sign-signature, x-d4sign-token, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, payload: JsonRecord) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function toObject(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function getString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function normalizeStatus(rawStatus: string): SignatureStatus {
  const status = rawStatus.toLowerCase();
  if (status.includes('sign') || status.includes('assinad') || status === 'done' || status === 'completed') return 'signed';
  if (status.includes('view') || status.includes('opened') || status.includes('visualiz')) return 'viewed';
  if (status.includes('reject') || status.includes('refus') || status.includes('declin')) return 'rejected';
  if (status.includes('expir')) return 'expired';
  if (status.includes('cancel')) return 'canceled';
  if (status.includes('error') || status.includes('fail') || status.includes('invalid')) return 'error';
  if (status.includes('sent') || status.includes('created') || status.includes('enviado')) return 'sent';
  return 'sent';
}

function signatureToSignerStatus(status: SignatureStatus): SignerStatus {
  if (status === 'signed') return 'signed';
  if (status === 'viewed') return 'viewed';
  if (status === 'rejected') return 'rejected';
  if (status === 'expired') return 'expired';
  if (status === 'canceled') return 'canceled';
  if (status === 'error') return 'error';
  return 'pending';
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function isWebhookAuthentic(req: Request, rawBody: string) {
  const sharedToken = Deno.env.get('D4SIGN_WEBHOOK_TOKEN')?.trim() ?? '';
  const hmacSecret = Deno.env.get('D4SIGN_WEBHOOK_HMAC_SECRET')?.trim() ?? '';
  if (!sharedToken && !hmacSecret) return { ok: false, reason: 'webhook_auth_not_configured' };

  const providedToken = getString(
    req.headers.get('x-d4sign-token'),
    req.headers.get('x-webhook-token'),
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''),
  );
  const providedSignature = getString(req.headers.get('x-d4sign-signature'), req.headers.get('x-signature')).toLowerCase();

  if (sharedToken && providedToken !== sharedToken) return { ok: false, reason: 'token_mismatch' };

  if (hmacSecret) {
    if (!providedSignature) return { ok: false, reason: 'missing_signature' };
    const expected = (await hmacSha256Hex(hmacSecret, rawBody)).toLowerCase();
    if (providedSignature.replace(/^sha256=/, '') !== expected) return { ok: false, reason: 'signature_mismatch' };
  }

  return { ok: true, reason: 'verified' };
}

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: { code: 'method_not_allowed', message: 'Only POST is allowed.' }, meta: { timestamp } });

  const rawBody = await req.text();
  let body: JsonRecord = {};
  try {
    body = toObject(JSON.parse(rawBody || '{}'));
  } catch {
    return jsonResponse(400, { ok: false, error: { code: 'invalid_json', message: 'Invalid JSON payload.' }, meta: { timestamp } });
  }

  try {
    const authCheck = await isWebhookAuthentic(req, rawBody);
    if (!authCheck.ok) return jsonResponse(401, { ok: false, error: { code: 'unauthorized_webhook', message: authCheck.reason }, meta: { timestamp } });

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const eventType = getString(body.event, body.event_type, body.type, body.action, body.status) || 'unknown';
    const providerEventId = getString(body.event_id, body.id, body.uuid);
    const providerDocumentId = getString(body.provider_document_id, body.document_id, body.document_uuid, toObject(body.document).id, toObject(body.document).uuid);
    const idempotencyKey = getString(body.idempotency_key, req.headers.get('idempotency-key'), providerEventId && `${providerEventId}:${eventType}`, providerDocumentId && `${providerDocumentId}:${eventType}`, crypto.randomUUID());

    const { data: existingEvent, error: existingEventError } = await supabase.from('d4sign_events').select('id').eq('idempotency_key', idempotencyKey).maybeSingle();
    if (existingEventError) throw existingEventError;
    if (existingEvent) return jsonResponse(200, { ok: true, duplicate: true, data: { idempotency_key: idempotencyKey, event_id: existingEvent.id }, meta: { timestamp } });

    const { data: signatureRequest, error: signatureRequestError } = await supabase
      .from('signature_requests')
      .select('id, tenant_id, patient_id, generated_document_id')
      .eq('provider', 'd4sign')
      .eq('provider_document_id', providerDocumentId)
      .maybeSingle();

    if (signatureRequestError) throw signatureRequestError;
    if (!signatureRequest) {
      return jsonResponse(202, { ok: true, ignored: true, reason: 'signature_request_not_found', data: { provider_document_id: providerDocumentId, idempotency_key: idempotencyKey }, meta: { timestamp } });
    }

    const normalizedStatus = normalizeStatus(getString(body.status, body.event, body.event_type, body.type));

    const { data: insertedEvent, error: insertEventError } = await supabase
      .from('d4sign_events')
      .insert({
        tenant_id: signatureRequest.tenant_id,
        signature_request_id: signatureRequest.id,
        provider_event_id: providerEventId || null,
        event_type: eventType,
        status: 'processed',
        received_at: timestamp,
        processed_at: timestamp,
        idempotency_key: idempotencyKey,
        payload_summary: {
          event_type: eventType,
          provider_event_id: providerEventId || null,
          provider_document_id: providerDocumentId || null,
          status: normalizedStatus,
          signer_count: Array.isArray(body.signers) ? body.signers.length : 0,
          received_at: timestamp,
        },
      })
      .select('id')
      .single();
    if (insertEventError) throw insertEventError;

    const signaturePatch: JsonRecord = { status: normalizedStatus, updated_at: timestamp };
    if (normalizedStatus === 'sent') signaturePatch.sent_at = timestamp;
    if (normalizedStatus === 'viewed') signaturePatch.viewed_at = timestamp;
    if (normalizedStatus === 'signed') signaturePatch.signed_at = timestamp;
    if (normalizedStatus === 'canceled') signaturePatch.canceled_at = timestamp;
    if (normalizedStatus === 'expired') signaturePatch.expires_at = timestamp;

    const { error: updateRequestError } = await supabase.from('signature_requests').update(signaturePatch).eq('id', signatureRequest.id).eq('tenant_id', signatureRequest.tenant_id);
    if (updateRequestError) throw updateRequestError;

    const signers = Array.isArray(body.signers) ? body.signers : [];
    for (const signerRaw of signers) {
      const signer = toObject(signerRaw);
      const signerEmail = getString(signer.email, signer.signer_email);
      const signerPhone = getString(signer.phone, signer.signer_phone);
      const specificStatus = normalizeStatus(getString(signer.status, body.status, eventType));

      let query = supabase
        .from('signature_signers')
        .update({ status: signatureToSignerStatus(specificStatus), signed_at: specificStatus === 'signed' ? timestamp : null, updated_at: timestamp })
        .eq('signature_request_id', signatureRequest.id)
        .eq('tenant_id', signatureRequest.tenant_id);

      if (signerEmail) query = query.eq('email', signerEmail);
      else if (signerPhone) query = query.eq('phone', signerPhone);
      else continue;

      const { error: signerUpdateError } = await query;
      if (signerUpdateError) throw signerUpdateError;
    }

    if (normalizedStatus === 'signed') {
      const { error: generatedDocumentError } = await supabase.from('generated_documents').update({ status: 'signed', updated_at: timestamp }).eq('id', signatureRequest.generated_document_id).eq('tenant_id', signatureRequest.tenant_id);
      if (generatedDocumentError) throw generatedDocumentError;

      const { error: timelineError } = await supabase.from('patient_timeline_events').insert({
        tenant_id: signatureRequest.tenant_id,
        patient_id: signatureRequest.patient_id,
        event_type: 'documento_assinado',
        category: 'documents',
        status: 'recorded',
        title: 'Documento assinado',
        description: 'Documento assinado via D4Sign.',
        status_label: 'Assinado',
        action_label: 'Ver documentos',
        details_href: `/paciente-360?patient=${signatureRequest.patient_id}&tab=documentos`,
        payload: {
          signature_request_id: signatureRequest.id,
          provider: 'd4sign',
          provider_document_id: providerDocumentId || null,
          d4sign_event_id: insertedEvent.id,
        },
      });
      if (timelineError) throw timelineError;
    }

    return jsonResponse(200, { ok: true, processed: true, data: { idempotency_key: idempotencyKey, signature_request_id: signatureRequest.id, status: normalizedStatus }, meta: { timestamp } });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: { code: 'internal_error', message: error instanceof Error ? error.message : 'Unexpected webhook error.' }, meta: { timestamp } });
  }
});
