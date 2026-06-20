import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createEdgeContext, logEdgeEvent, observedEdgeHeaders } from '../_shared/observability.ts';
import { envString } from '../_shared/env.ts';
import {
  amountToCents,
  asRecord,
  asString,
  mercadoPagoFetch,
  mercadoPagoFetchWithAccessToken,
  MERCADOPAGO_PROVIDER,
  normalizePaymentStatus,
  resolveMercadoPagoTenantAccessToken,
  safeErrorMessage,
  sha256Hex,
  verifyMercadoPagoWebhookSignature,
} from '../_shared/mercadopago.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

const headers = { 'Content-Type': 'application/json' };
const json = (status: number, payload: Json, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { ...headers, ...extraHeaders } });

async function internalError(
  edgeContext: ReturnType<typeof createEdgeContext>,
  reason: string,
  context: Json = {}
) {
  await logEdgeEvent(edgeContext, 'webhook_internal_error', 'error', 'failure', {
    reason,
    ...context,
  });
  return json(500, { ok: false, error: 'internal_error' }, observedEdgeHeaders(edgeContext));
}

function getWebhookDataId(bodyRecord: Record<string, unknown>, req: Request) {
  const data = asRecord(bodyRecord.data);
  const url = new URL(req.url);
  return (
    asString(data.id) ||
    asString(bodyRecord['data.id']) ||
    asString(url.searchParams.get('data.id')) ||
    asString(url.searchParams.get('id'))
  );
}

function getWebhookResourceType(bodyRecord: Record<string, unknown>) {
  const eventType = asString(bodyRecord.type).toLowerCase();
  const action = asString(bodyRecord.action).toLowerCase();
  if (eventType === 'payment' || action.startsWith('payment.')) return 'payment';
  if (eventType.includes('preapproval') || action.includes('preapproval')) return 'preapproval';
  return eventType || 'unknown';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function getTenantIdHint(req: Request) {
  const value = asString(new URL(req.url).searchParams.get('tenant_id'));
  return isUuid(value) ? value : '';
}

function minimizedWebhookPayload(params: {
  bodyRecord: Record<string, unknown>;
  eventHash: string;
  dataId: string;
  requestId: string;
}) {
  const { bodyRecord, eventHash, dataId, requestId } = params;
  return {
    event_hash: eventHash,
    provider_event_id: asString(bodyRecord.id) || null,
    action: asString(bodyRecord.action) || null,
    type: asString(bodyRecord.type) || null,
    resource_id: dataId || null,
    request_hash: requestId ? `mp_req_${requestId.slice(0, 12)}` : null,
  };
}

function timelineForPaymentStatus(status: string) {
  if (status === 'paid') {
    return {
      eventType: 'pagamento_recebido',
      title: 'Pagamento recebido',
      description: 'Pagamento confirmado pelo provedor.',
    };
  }
  if (status === 'refunded') {
    return {
      eventType: 'pagamento',
      title: 'Pagamento estornado',
      description: 'Pagamento marcado como estornado pelo provedor.',
    };
  }
  if (status === 'chargeback') {
    return {
      eventType: 'pagamento',
      title: 'Contestacao de pagamento',
      description: 'Pagamento sinalizado como contestado pelo provedor.',
    };
  }
  return null;
}

async function resolveInvoice(params: {
  supabase: ReturnType<typeof createClient>;
  providerPaymentId: string;
  providerPreferenceId: string;
  externalReference: string;
}) {
  const { supabase, providerPaymentId, providerPreferenceId, externalReference } = params;
  const select =
    'id,tenant_id,patient_id,provider_payment_id,provider_preference_id,amount_cents,due_date,metadata';

  if (providerPaymentId) {
    const byPayment = await supabase
      .from('patient_invoices')
      .select(select)
      .eq('provider', MERCADOPAGO_PROVIDER)
      .eq('provider_payment_id', providerPaymentId)
      .maybeSingle();
    if (byPayment.error) throw byPayment.error;
    if (byPayment.data) return asRecord(byPayment.data);
  }

  if (providerPreferenceId) {
    const byPreference = await supabase
      .from('patient_invoices')
      .select(select)
      .eq('provider', MERCADOPAGO_PROVIDER)
      .eq('provider_preference_id', providerPreferenceId)
      .maybeSingle();
    if (byPreference.error) throw byPreference.error;
    if (byPreference.data) return asRecord(byPreference.data);
  }

  if (externalReference) {
    const byReference = await supabase
      .from('patient_invoices')
      .select(select)
      .eq('provider', MERCADOPAGO_PROVIDER)
      .eq('metadata->>external_reference', externalReference)
      .maybeSingle();
    if (byReference.error) throw byReference.error;
    if (byReference.data) return asRecord(byReference.data);
  }

  return null;
}

async function upsertPayment(params: {
  supabase: ReturnType<typeof createClient>;
  tenantId: string;
  patientId: string;
  invoiceId: string;
  providerPaymentId: string;
  status: string;
  amountCents: number;
  paidAt: string | null;
  dueDate: string | null;
  method: string | null;
  metadata: Record<string, unknown>;
}) {
  const {
    supabase,
    tenantId,
    patientId,
    invoiceId,
    providerPaymentId,
    status,
    amountCents,
    paidAt,
    dueDate,
    method,
    metadata,
  } = params;

  const existing = await supabase
    .from('payments')
    .select('id,metadata')
    .eq('tenant_id', tenantId)
    .eq('provider', MERCADOPAGO_PROVIDER)
    .eq('provider_payment_id', providerPaymentId)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const payload = {
    tenant_id: tenantId,
    patient_id: patientId,
    patient_invoice_id: invoiceId,
    provider: MERCADOPAGO_PROVIDER,
    provider_payment_id: providerPaymentId,
    status,
    amount_cents: amountCents,
    paid_at: paidAt,
    due_date: dueDate,
    method,
    metadata: { ...asRecord(existing.data?.metadata), ...metadata },
  };

  if (existing.data?.id) {
    const updateResult = await supabase
      .from('payments')
      .update(payload)
      .eq('id', existing.data.id)
      .eq('tenant_id', tenantId);
    if (updateResult.error) throw updateResult.error;
    return String(existing.data.id);
  }

  const insertResult = await supabase.from('payments').insert(payload).select('id').single();
  if (insertResult.error) throw insertResult.error;
  return String(insertResult.data.id);
}

Deno.serve(async (req) => {
  const context = createEdgeContext('edge.webhook-mercadopago', req);
  const timestamp = new Date().toISOString();

  if (req.method !== 'POST') {
    await logEdgeEvent(context, 'webhook_rejected', 'warn', 'denied', {
      reason: 'method_not_allowed',
    });
    return json(405, { ok: false, error: 'method_not_allowed' }, observedEdgeHeaders(context));
  }

  try {
    const rawText = await req.text();
    const tenantIdHint = getTenantIdHint(req);
    const body = rawText
      ? await Promise.resolve()
          .then(() => JSON.parse(rawText))
          .catch(() => null)
      : null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      await logEdgeEvent(context, 'webhook_rejected', 'warn', 'failure', {
        reason: 'invalid_payload',
      });
      return json(400, { ok: false, error: 'invalid_payload' }, observedEdgeHeaders(context));
    }

    const bodyRecord = asRecord(body);
    const dataId = getWebhookDataId(bodyRecord, req);
    const resourceType = getWebhookResourceType(bodyRecord);
    const signature = await verifyMercadoPagoWebhookSignature({ env: Deno.env, req, dataId });
    if (!signature.valid) {
      await logEdgeEvent(context, 'webhook_signature_failed', 'warn', 'denied', {
        reason: 'invalid_signature',
        resource_type: resourceType,
      });
      return json(401, { ok: false, error: 'invalid_signature' }, observedEdgeHeaders(context));
    }

    const supabaseUrl = envString(Deno.env, 'SUPABASE_URL');
    const serviceRoleKey = envString(Deno.env, 'SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return internalError(context, 'server_misconfigured');

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const eventHash = await sha256Hex(rawText);
    const providerEventId =
      asString(bodyRecord.id) ||
      (signature.requestId && dataId ? `${signature.requestId}:${dataId}` : eventHash);
    const eventType = asString(bodyRecord.action) || asString(bodyRecord.type) || 'unknown';

    const existingProviderEvent = await supabase
      .from('billing_provider_events')
      .select('id,status')
      .eq('provider', MERCADOPAGO_PROVIDER)
      .eq('provider_event_id', providerEventId)
      .maybeSingle();
    if (existingProviderEvent.error) {
      return internalError(context, 'provider_event_lookup_failed');
    }
    if (existingProviderEvent.data?.id) {
      await logEdgeEvent(context, 'webhook_duplicate', 'info', 'success', {
        provider: MERCADOPAGO_PROVIDER,
        event_type: eventType,
        dedupe: 'provider_event_id',
      });
      return json(200, { ok: true, idempotent: true }, observedEdgeHeaders(context));
    }

    const existingHash = await supabase
      .from('billing_webhook_events')
      .select('id')
      .eq('event_hash', eventHash)
      .maybeSingle();
    if (existingHash.error) return internalError(context, 'idempotency_lookup_failed');
    if (existingHash.data?.id) {
      await logEdgeEvent(context, 'webhook_duplicate', 'info', 'success', {
        provider: MERCADOPAGO_PROVIDER,
        event_type: eventType,
        dedupe: 'event_hash',
      });
      return json(200, { ok: true, idempotent: true }, observedEdgeHeaders(context));
    }

    const { error: webhookInsertError } = await supabase.from('billing_webhook_events').insert({
      provider: MERCADOPAGO_PROVIDER,
      event_hash: eventHash,
      event_type: eventType,
      payload: minimizedWebhookPayload({
        bodyRecord,
        eventHash,
        dataId,
        requestId: signature.requestId,
      }),
      status: 'received',
    });
    if (webhookInsertError) return internalError(context, 'webhook_event_insert_failed');

    if (resourceType !== 'payment' || !dataId) {
      await supabase.from('billing_provider_events').insert({
        tenant_id: null,
        provider: MERCADOPAGO_PROVIDER,
        provider_event_id: providerEventId,
        event_type: eventType,
        resource_type: resourceType,
        resource_id: dataId || null,
        idempotency_key: eventHash,
        status: 'ignored',
        processed_at: timestamp,
        error_code:
          resourceType !== 'payment' ? 'unsupported_resource_type' : 'missing_resource_id',
        payload_summary: { event: eventType, resource_type: resourceType },
      });
      await supabase
        .from('billing_webhook_events')
        .update({
          status: 'ignored',
          processed_at: timestamp,
          error_message:
            resourceType !== 'payment' ? 'unsupported_resource_type' : 'missing_resource_id',
        })
        .eq('event_hash', eventHash);

      return json(200, { ok: true, processed: false, ignored: true }, observedEdgeHeaders(context));
    }

    const tenantToken = tenantIdHint
      ? await resolveMercadoPagoTenantAccessToken(Deno.env, supabase, tenantIdHint)
      : null;
    if (tenantIdHint && !tenantToken?.accessToken) {
      await supabase
        .from('billing_webhook_events')
        .update({
          status: 'failed',
          processed_at: timestamp,
          error_message: tenantToken?.errorCode || 'tenant_mercadopago_not_connected',
        })
        .eq('event_hash', eventHash);
      return internalError(context, 'tenant_token_unavailable', {
        tenant_id: tenantIdHint,
        error_code: tenantToken?.errorCode || 'tenant_mercadopago_not_connected',
      });
    }

    const providerResponse = tenantToken?.accessToken
      ? await mercadoPagoFetchWithAccessToken(
          Deno.env,
          tenantToken.accessToken,
          `/v1/payments/${encodeURIComponent(dataId)}`,
          { method: 'GET' }
        )
      : await mercadoPagoFetch(Deno.env, `/v1/payments/${encodeURIComponent(dataId)}`, {
          method: 'GET',
        });
    if (!providerResponse.ok) {
      await supabase
        .from('billing_webhook_events')
        .update({
          status: 'failed',
          processed_at: timestamp,
          error_message: providerResponse.errorCode,
        })
        .eq('event_hash', eventHash);
      return internalError(context, 'provider_fetch_failed', { status: providerResponse.status });
    }

    const providerPayment = asRecord(providerResponse.data);
    const providerPaymentId = asString(providerPayment.id) || dataId;
    const providerPreferenceId = asString(providerPayment.preference_id);
    const externalReference = asString(providerPayment.external_reference);
    const invoice = await resolveInvoice({
      supabase,
      providerPaymentId,
      providerPreferenceId,
      externalReference,
    });
    const tenantId = asString(invoice?.tenant_id) || null;
    const patientId = asString(invoice?.patient_id) || null;
    const invoiceId = asString(invoice?.id) || null;
    if (tenantIdHint && tenantId && tenantIdHint !== tenantId) {
      await supabase.from('billing_provider_events').insert({
        tenant_id: tenantIdHint,
        provider: MERCADOPAGO_PROVIDER,
        provider_event_id: providerEventId,
        event_type: eventType,
        resource_type: 'payment',
        resource_id: providerPaymentId,
        idempotency_key: eventHash,
        status: 'failed',
        processed_at: timestamp,
        error_code: 'tenant_mismatch',
        payload_summary: {
          event: eventType,
          payment_id: providerPaymentId,
          tenant_hint: tenantIdHint,
        },
      });
      await supabase
        .from('billing_webhook_events')
        .update({
          status: 'failed',
          processed_at: timestamp,
          error_message: 'tenant_mismatch',
        })
        .eq('event_hash', eventHash);
      await logEdgeEvent(context, 'webhook_rejected', 'warn', 'denied', {
        provider: MERCADOPAGO_PROVIDER,
        event_type: eventType,
        reason: 'tenant_mismatch',
      });
      return json(
        200,
        { ok: true, processed: false, rejected: true },
        observedEdgeHeaders(context)
      );
    }
    const providerStatus = asString(providerPayment.status);
    const mapping = normalizePaymentStatus(providerStatus);
    const amountCents =
      amountToCents(providerPayment.transaction_amount) || Number(invoice?.amount_cents ?? 0);
    const paidAt =
      mapping.paymentStatus === 'paid'
        ? asString(providerPayment.date_approved) || new Date().toISOString()
        : null;
    const dueDate = asString(invoice?.due_date) || null;
    const method =
      asString(providerPayment.payment_method_id) ||
      asString(providerPayment.payment_type_id) ||
      null;

    const { error: providerEventInsertError } = await supabase
      .from('billing_provider_events')
      .insert({
        tenant_id: tenantId,
        provider: MERCADOPAGO_PROVIDER,
        provider_event_id: providerEventId,
        event_type: eventType,
        resource_type: 'payment',
        resource_id: providerPaymentId,
        idempotency_key: eventHash,
        status: tenantId && patientId && invoiceId ? 'processed' : 'ignored',
        processed_at: timestamp,
        error_code: tenantId && patientId && invoiceId ? null : 'tenant_not_resolved',
        payload_summary: {
          event: eventType,
          payment_id: providerPaymentId,
          preference_id: providerPreferenceId || null,
          payment_status: providerStatus || null,
          value_cents: amountCents || null,
        },
      });

    if (providerEventInsertError) return internalError(context, 'provider_event_insert_failed');

    if (!tenantId || !patientId || !invoiceId) {
      await supabase
        .from('billing_webhook_events')
        .update({
          status: 'ignored',
          processed_at: timestamp,
          error_message: 'tenant_not_resolved',
        })
        .eq('event_hash', eventHash);
      await logEdgeEvent(context, 'webhook_ignored', 'warn', 'skipped', {
        provider: MERCADOPAGO_PROVIDER,
        event_type: eventType,
        reason: 'tenant_not_resolved',
      });
      return json(
        200,
        { ok: true, processed: false, resolved: false },
        observedEdgeHeaders(context)
      );
    }

    const paymentId = await upsertPayment({
      supabase,
      tenantId,
      patientId,
      invoiceId,
      providerPaymentId,
      status: mapping.paymentStatus,
      amountCents,
      paidAt,
      dueDate,
      method,
      metadata: {
        provider_event: eventType,
        provider_status: providerStatus || null,
        provider_preference_id: providerPreferenceId || null,
        provider_financial_state: mapping.financialState,
        event_hash: eventHash,
      },
    });

    const { error: invoiceUpdateError } = await supabase
      .from('patient_invoices')
      .update({
        status: mapping.invoiceStatus,
        paid_at: paidAt,
        provider_payment_id: providerPaymentId,
        provider_preference_id:
          providerPreferenceId || asString(invoice.provider_preference_id) || null,
        metadata: {
          ...asRecord(invoice.metadata),
          provider_status: providerStatus || null,
          provider_event: eventType,
          provider_financial_state: mapping.financialState,
          payment_id: paymentId,
        },
      })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId);
    if (invoiceUpdateError) return internalError(context, 'invoice_update_failed');

    const timeline = timelineForPaymentStatus(mapping.paymentStatus);
    if (timeline) {
      const { error: timelineError } = await supabase.from('patient_timeline_events').insert({
        tenant_id: tenantId,
        patient_id: patientId,
        event_type: timeline.eventType,
        category: 'financial',
        title: timeline.title,
        description: timeline.description,
        status: 'recorded',
        status_label: mapping.invoiceStatus,
        event_at: timestamp,
        payload: {
          provider: MERCADOPAGO_PROVIDER,
          event_type: eventType,
          event_hash: eventHash,
          invoice_id: invoiceId,
        },
      });
      if (timelineError) return internalError(context, 'timeline_insert_failed');
    }

    const { error: processedUpdateError } = await supabase
      .from('billing_webhook_events')
      .update({
        status: 'processed',
        processed_at: timestamp,
        error_message: null,
      })
      .eq('event_hash', eventHash);
    if (processedUpdateError) return internalError(context, 'webhook_event_update_failed');

    await logEdgeEvent(context, 'webhook_processed', 'info', 'success', {
      provider: MERCADOPAGO_PROVIDER,
      event_type: eventType,
      tenant_id: tenantId,
      resolved: true,
    });

    return json(200, { ok: true, processed: true, resolved: true }, observedEdgeHeaders(context));
  } catch (error) {
    console.error('[webhook-mercadopago] unexpected_error', {
      message: safeErrorMessage(error),
    });
    return internalError(context, 'unexpected_error');
  }
});
