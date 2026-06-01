import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createEdgeContext, logEdgeEvent, observedEdgeHeaders } from '../_shared/observability.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;

const headers = { 'Content-Type': 'application/json' };
const json = (status: number, payload: Json, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { ...headers, ...extraHeaders } });
const internalError = async (
  edgeContext: ReturnType<typeof createEdgeContext>,
  reason: string,
  context: Json = {}
) => {
  await logEdgeEvent(edgeContext, 'webhook_internal_error', 'error', 'failure', {
    reason,
    ...context,
  });
  return json(500, { ok: false, error: 'internal_error' }, observedEdgeHeaders(edgeContext));
};

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function toAmountCents(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function normalizeEvent(event: string) {
  if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
    return {
      invoiceStatus: 'paid',
      paymentStatus: 'paid',
      timelineEventType: 'pagamento_recebido',
      timelineTitle: 'Pagamento recebido',
      timelineDescription: 'Pagamento confirmado via Asaas.',
    };
  }

  if (event === 'PAYMENT_OVERDUE') {
    return {
      invoiceStatus: 'overdue',
      paymentStatus: 'overdue',
      timelineEventType: 'pagamento_atrasado',
      timelineTitle: 'Pagamento atrasado',
      timelineDescription: 'Pagamento marcado como atrasado no Asaas.',
    };
  }

  if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_CANCELLED') {
    return {
      invoiceStatus: 'cancelled',
      paymentStatus: 'canceled',
      timelineEventType: null,
      timelineTitle: null,
      timelineDescription: null,
    };
  }

  return {
    invoiceStatus: 'pending',
    paymentStatus: 'pending',
    timelineEventType: 'pagamento',
    timelineTitle: 'Pagamento criado',
    timelineDescription: 'Cobranca criada no Asaas.',
  };
}

function minimizedWebhookPayload(
  bodyRecord: Record<string, unknown>,
  payment: Record<string, unknown>,
  eventHash: string
) {
  const valueCents = toAmountCents(payment.value);
  return {
    event: getString(bodyRecord.event) || 'unknown',
    event_hash: eventHash,
    provider_event_id: getString(bodyRecord.id) || null,
    payment_id: getString(payment.id) || null,
    payment_status: getString(payment.status) || null,
    billing_type: getString(payment.billingType) || null,
    value_cents: valueCents > 0 ? valueCents : null,
    due_date: getString(payment.dueDate) || null,
  };
}

Deno.serve(async (req) => {
  const context = createEdgeContext('edge.webhook-asaas', req);
  const timestamp = new Date().toISOString();

  if (req.method !== 'POST') {
    await logEdgeEvent(context, 'webhook_rejected', 'warn', 'denied', {
      reason: 'method_not_allowed',
    });
    return json(405, { ok: false, error: 'method_not_allowed' }, observedEdgeHeaders(context));
  }

  const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
  const receivedToken = req.headers.get('asaas-access-token');
  if (!expectedToken || !receivedToken || receivedToken !== expectedToken) {
    await logEdgeEvent(context, 'webhook_signature_failed', 'warn', 'denied', {
      reason: 'invalid_webhook_token',
    });
    return json(401, { ok: false, error: 'invalid_webhook_token' }, observedEdgeHeaders(context));
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    await logEdgeEvent(context, 'webhook_rejected', 'warn', 'failure', {
      reason: 'invalid_payload',
    });
    return json(400, { ok: false, error: 'invalid_payload' }, observedEdgeHeaders(context));
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return internalError(context, 'server_misconfigured');
  }

  const bodyRecord = toObject(body);
  const payment = toObject(bodyRecord.payment);
  const eventType = getString(bodyRecord.event) || 'unknown';
  const providerEventId = getString(bodyRecord.id);
  const paymentId = getString(payment.id);
  const eventHash = await sha256(JSON.stringify(bodyRecord));
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existing = await supabase
    .from('billing_webhook_events')
    .select('id')
    .eq('event_hash', eventHash)
    .maybeSingle();

  if (existing.error) {
    return internalError(context, 'idempotency_lookup_failed', { eventHash });
  }

  if (existing.data?.id) {
    await logEdgeEvent(context, 'webhook_duplicate', 'info', 'success', {
      provider: 'asaas',
      event_type: eventType,
    });
    return json(200, { ok: true, idempotent: true }, observedEdgeHeaders(context));
  }

  const { error: webhookInsertError } = await supabase.from('billing_webhook_events').insert({
    provider: 'asaas',
    event_hash: eventHash,
    event_type: eventType,
    payload: minimizedWebhookPayload(bodyRecord, payment, eventHash),
    status: 'received',
  });

  if (webhookInsertError) {
    return internalError(context, 'webhook_event_insert_failed', { eventHash });
  }

  let tenantId: string | null = null;
  let patientId: string | null = null;
  let invoiceId: string | null = null;

  if (paymentId) {
    const invoice = await supabase
      .from('patient_invoices')
      .select('id, tenant_id, patient_id')
      .eq('asaas_invoice_id', paymentId)
      .maybeSingle();

    if (invoice.error) {
      await supabase
        .from('billing_webhook_events')
        .update({ status: 'failed', error_message: 'invoice_lookup_failed' })
        .eq('event_hash', eventHash);
      return internalError(context, 'invoice_lookup_failed', { eventHash });
    }

    tenantId = invoice.data?.tenant_id ?? null;
    patientId = invoice.data?.patient_id ?? null;
    invoiceId = invoice.data?.id ?? null;
  }

  const mapping = normalizeEvent(eventType);
  const payloadSummary = {
    event: eventType,
    provider_event_id: providerEventId || null,
    payment_id: paymentId || null,
    external_reference: getString(payment.externalReference) || null,
    status: getString(payment.status) || null,
  };

  const { error: asaasEventError } = await supabase.from('asaas_events').insert({
    tenant_id: tenantId,
    event_type: eventType,
    asaas_event_id: providerEventId || null,
    external_reference: getString(payment.externalReference) || null,
    idempotency_key: eventHash,
    status: tenantId ? 'processed' : 'ignored',
    processed_at: timestamp,
    payload_summary: payloadSummary,
    error_message: tenantId ? null : 'tenant_not_resolved',
  });

  if (asaasEventError) {
    await supabase
      .from('billing_webhook_events')
      .update({ status: 'failed', error_message: 'asaas_event_insert_failed' })
      .eq('event_hash', eventHash);
    return internalError(context, 'asaas_event_insert_failed', { eventHash });
  }

  if (tenantId && patientId && invoiceId) {
    const { error: invoiceUpdateError } = await supabase
      .from('patient_invoices')
      .update({
        status: mapping.invoiceStatus,
        paid_at: mapping.invoiceStatus === 'paid' ? timestamp : null,
        invoice_url: getString(payment.invoiceUrl, payment.invoice_url) || null,
        payment_link:
          getString(payment.bankSlipUrl, payment.invoiceUrl, payment.invoice_url) || null,
        metadata: {
          provider_status: getString(payment.status) || null,
          provider_event: eventType,
          billing_type: getString(payment.billingType) || null,
        },
      })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId);

    if (invoiceUpdateError) {
      await supabase
        .from('billing_webhook_events')
        .update({ status: 'failed', error_message: 'invoice_update_failed' })
        .eq('event_hash', eventHash);
      return internalError(context, 'invoice_update_failed', { eventHash });
    }

    const amountCents = toAmountCents(payment.value);
    if (amountCents > 0) {
      const { error: paymentUpsertError } = await supabase.from('payments').upsert(
        {
          tenant_id: tenantId,
          patient_id: patientId,
          patient_invoice_id: invoiceId,
          asaas_payment_id: paymentId || providerEventId || eventHash,
          status: mapping.paymentStatus,
          amount_cents: amountCents,
          paid_at: mapping.paymentStatus === 'paid' ? timestamp : null,
          due_date: getString(payment.dueDate) || null,
          method: getString(payment.billingType).toLowerCase() || null,
          metadata: {
            provider_event: eventType,
            provider_status: getString(payment.status) || null,
          },
        },
        { onConflict: 'asaas_payment_id' }
      );

      if (paymentUpsertError) {
        await supabase
          .from('billing_webhook_events')
          .update({ status: 'failed', error_message: 'payment_upsert_failed' })
          .eq('event_hash', eventHash);
        return internalError(context, 'payment_upsert_failed', { eventHash });
      }
    }

    if (mapping.timelineEventType) {
      const { error: timelineError } = await supabase.from('patient_timeline_events').insert({
        tenant_id: tenantId,
        patient_id: patientId,
        event_type: mapping.timelineEventType,
        category: 'financial',
        title: mapping.timelineTitle,
        description: mapping.timelineDescription,
        status: 'recorded',
        status_label: mapping.invoiceStatus,
        event_at: timestamp,
        payload: {
          provider: 'asaas',
          event_type: eventType,
          event_hash: eventHash,
          invoice_id: invoiceId,
        },
      });

      if (timelineError) {
        await supabase
          .from('billing_webhook_events')
          .update({ status: 'failed', error_message: 'timeline_insert_failed' })
          .eq('event_hash', eventHash);
        return internalError(context, 'timeline_insert_failed', { eventHash });
      }
    }
  }

  const { error: processedUpdateError } = await supabase
    .from('billing_webhook_events')
    .update({
      status: 'processed',
      processed_at: timestamp,
      error_message: tenantId ? null : 'tenant_not_resolved',
    })
    .eq('event_hash', eventHash);

  if (processedUpdateError) {
    return internalError(context, 'webhook_event_update_failed', { eventHash });
  }

  await logEdgeEvent(context, 'webhook_processed', 'info', 'success', {
    provider: 'asaas',
    event_type: eventType,
    tenant_id: tenantId,
    resolved: Boolean(tenantId && patientId && invoiceId),
  });

  return json(
    200,
    {
      ok: true,
      processed: true,
      resolved: Boolean(tenantId && patientId && invoiceId),
    },
    observedEdgeHeaders(context)
  );
});
