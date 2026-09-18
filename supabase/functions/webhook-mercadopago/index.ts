import { secureEdge } from '../_shared/http-security.ts';
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
  normalizeSubscriptionStatus,
  pickPaymentLink,
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
  if (eventType === 'subscription_authorized_payment') return 'authorized_payment';
  if (eventType === 'subscription_preapproval_plan') return 'preapproval_plan';
  if (eventType === 'subscription_preapproval') return 'preapproval';
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
    collection_mode: 'provider',
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

Deno.serve(secureEdge(async (req) => {
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
    let tenantIdHint = getTenantIdHint(req);
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
      .select('id,status,attempts')
      .eq('provider', MERCADOPAGO_PROVIDER)
      .eq('provider_event_id', providerEventId)
      .maybeSingle();
    if (existingProviderEvent.error) {
      return internalError(context, 'provider_event_lookup_failed');
    }
    if (
      existingProviderEvent.data?.id &&
      ['processed', 'ignored', 'rejected', 'dead_letter'].includes(
        asString(existingProviderEvent.data.status)
      )
    ) {
      await logEdgeEvent(context, 'webhook_duplicate', 'info', 'success', {
        provider: MERCADOPAGO_PROVIDER,
        event_type: eventType,
        dedupe: 'provider_event_id',
      });
      return json(200, { ok: true, idempotent: true }, observedEdgeHeaders(context));
    }

    const existingHash = await supabase
      .from('billing_webhook_events')
      .select('id,status')
      .eq('event_hash', eventHash)
      .maybeSingle();
    if (existingHash.error) return internalError(context, 'idempotency_lookup_failed');
    if (
      existingHash.data?.id &&
      !existingProviderEvent.data?.id &&
      ['processed', 'ignored'].includes(asString(existingHash.data.status))
    ) {
      await logEdgeEvent(context, 'webhook_duplicate', 'info', 'success', {
        provider: MERCADOPAGO_PROVIDER,
        event_type: eventType,
        dedupe: 'event_hash',
      });
      return json(200, { ok: true, idempotent: true }, observedEdgeHeaders(context));
    }

    if (!existingHash.data?.id) {
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
    } else {
      await supabase
        .from('billing_webhook_events')
        .update({ status: 'received', processed_at: null, error_message: null })
        .eq('id', existingHash.data.id);
    }

    let providerEventRowId = asString(existingProviderEvent.data?.id);
    if (!providerEventRowId) {
      const { data: insertedProviderEvent, error: providerEventInsertError } = await supabase
        .from('billing_provider_events')
        .insert({
          tenant_id: tenantIdHint || null,
          provider: MERCADOPAGO_PROVIDER,
          provider_event_id: providerEventId,
          event_type: eventType,
          resource_type: resourceType,
          resource_id: dataId || null,
          idempotency_key: eventHash,
          status: 'received',
          signature_valid: true,
          payload_digest: eventHash,
          attempts: 0,
          payload_summary: { event: eventType, resource_type: resourceType },
        })
        .select('id')
        .single();
      if (providerEventInsertError || !insertedProviderEvent?.id) {
        return internalError(context, 'provider_event_insert_failed');
      }
      providerEventRowId = asString(insertedProviderEvent.id);
    }
    const providerEventAttempts = Number(existingProviderEvent.data?.attempts ?? 0) + 1;
    const processingUpdate = await supabase
      .from('billing_provider_events')
      .update({
        status: 'processing',
        attempts: providerEventAttempts,
        retry_count: providerEventAttempts,
        error_code: null,
        error_message: null,
        updated_at: timestamp,
      })
      .eq('id', providerEventRowId);
    if (processingUpdate.error) return internalError(context, 'provider_event_update_failed');

    if (
      !['payment', 'preapproval', 'authorized_payment', 'preapproval_plan'].includes(
        resourceType
      ) ||
      !dataId
    ) {
      await supabase
        .from('billing_provider_events')
        .update({
          status: 'ignored',
          processed_at: timestamp,
          error_code: !dataId ? 'missing_resource_id' : 'unsupported_resource_type',
          updated_at: timestamp,
        })
        .eq('id', providerEventRowId);
      await supabase
        .from('billing_webhook_events')
        .update({
          status: 'ignored',
          processed_at: timestamp,
          error_message: !dataId ? 'missing_resource_id' : 'unsupported_resource_type',
        })
        .eq('event_hash', eventHash);

      return json(200, { ok: true, processed: false, ignored: true }, observedEdgeHeaders(context));
    }

    if (!tenantIdHint && resourceType === 'preapproval_plan') {
      const { data: packageTenant } = await supabase
        .from('packages')
        .select('tenant_id')
        .eq('provider', MERCADOPAGO_PROVIDER)
        .eq('provider_plan_id', dataId)
        .limit(1)
        .maybeSingle();
      tenantIdHint = asString(packageTenant?.tenant_id);
    } else if (!tenantIdHint && resourceType === 'preapproval') {
      const { data: subscriptionTenant } = await supabase
        .from('patient_subscriptions')
        .select('tenant_id')
        .eq('provider', MERCADOPAGO_PROVIDER)
        .eq('provider_subscription_id', dataId)
        .limit(1)
        .maybeSingle();
      tenantIdHint = asString(subscriptionTenant?.tenant_id);
    }

    const tenantToken = tenantIdHint
      ? await resolveMercadoPagoTenantAccessToken(Deno.env, supabase, tenantIdHint)
      : null;
    if (tenantIdHint && !tenantToken?.accessToken) {
      await supabase
        .from('billing_provider_events')
        .update({
          status: providerEventAttempts >= 10 ? 'dead_letter' : 'retryable_failed',
          error_code: tenantToken?.errorCode || 'tenant_mercadopago_not_connected',
          next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          updated_at: timestamp,
        })
        .eq('id', providerEventRowId);
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

    const providerPath =
      resourceType === 'payment'
        ? `/v1/payments/${encodeURIComponent(dataId)}`
        : resourceType === 'preapproval'
          ? `/preapproval/${encodeURIComponent(dataId)}`
          : resourceType === 'authorized_payment'
            ? `/authorized_payments/${encodeURIComponent(dataId)}`
            : `/preapproval_plan/${encodeURIComponent(dataId)}`;
    const providerResponse = tenantToken?.accessToken
      ? await mercadoPagoFetchWithAccessToken(Deno.env, tenantToken.accessToken, providerPath, {
          method: 'GET',
        })
      : await mercadoPagoFetch(Deno.env, providerPath, {
          method: 'GET',
        });
    if (!providerResponse.ok) {
      await supabase
        .from('billing_provider_events')
        .update({
          status: providerEventAttempts >= 10 ? 'dead_letter' : 'retryable_failed',
          error_code: providerResponse.errorCode || 'provider_fetch_failed',
          next_attempt_at: new Date(
            Date.now() + Math.min(3_600_000, 30_000 * 2 ** providerEventAttempts)
          ).toISOString(),
          updated_at: timestamp,
        })
        .eq('id', providerEventRowId);
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

    const providerResource = asRecord(providerResponse.data);

    if (resourceType === 'preapproval_plan') {
      const providerPlanStatus = asString(providerResource.status).toLowerCase();
      const updateResult = await supabase
        .from('packages')
        .update({
          provider_sync_status: providerPlanStatus === 'cancelled' ? 'retired' : 'active',
          provider_last_synced_at: timestamp,
          provider_error_code: null,
        })
        .eq('tenant_id', tenantIdHint)
        .eq('provider_plan_id', dataId)
        .select('id')
        .limit(1);
      if (updateResult.error) return internalError(context, 'package_plan_update_failed');
      await supabase
        .from('billing_provider_events')
        .update({
          tenant_id: tenantIdHint || null,
          status: updateResult.data?.length ? 'processed' : 'ignored',
          processed_at: timestamp,
          error_code: updateResult.data?.length ? null : 'package_not_resolved',
          updated_at: timestamp,
        })
        .eq('id', providerEventRowId);
      await supabase
        .from('billing_webhook_events')
        .update({
          status: updateResult.data?.length ? 'processed' : 'ignored',
          processed_at: timestamp,
          error_message: updateResult.data?.length ? null : 'package_not_resolved',
        })
        .eq('event_hash', eventHash);
      return json(
        200,
        { ok: true, processed: Boolean(updateResult.data?.length) },
        observedEdgeHeaders(context)
      );
    }

    if (resourceType === 'preapproval' || resourceType === 'authorized_payment') {
      const preapprovalId =
        resourceType === 'preapproval'
          ? asString(providerResource.id) || dataId
          : asString(providerResource.preapproval_id) ||
            asString(asRecord(providerResource.subscription).id);
      const externalReference = asString(providerResource.external_reference);
      let subscriptionResult = preapprovalId
        ? await supabase
            .from('patient_subscriptions')
            .select(
              'id,tenant_id,patient_id,package_id,program_id,enrollment_id,service_id,amount_cents,next_due_date,status,metadata'
            )
            .eq('provider', MERCADOPAGO_PROVIDER)
            .eq('provider_subscription_id', preapprovalId)
            .maybeSingle()
        : { data: null, error: null };
      if (subscriptionResult.error) return internalError(context, 'subscription_lookup_failed');
      if (!subscriptionResult.data && externalReference) {
        subscriptionResult = await supabase
          .from('patient_subscriptions')
          .select(
            'id,tenant_id,patient_id,package_id,program_id,enrollment_id,service_id,amount_cents,next_due_date,status,metadata'
          )
          .eq('provider', MERCADOPAGO_PROVIDER)
          .eq('metadata->>external_reference', externalReference)
          .maybeSingle();
      }
      const subscription = subscriptionResult.data;
      if (
        !subscription?.id ||
        (tenantIdHint && tenantIdHint !== asString(subscription.tenant_id))
      ) {
        await supabase
          .from('billing_provider_events')
          .update({
            status: 'retryable_failed',
            error_code: 'subscription_not_resolved',
            next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
            updated_at: timestamp,
          })
          .eq('id', providerEventRowId);
        return internalError(context, 'subscription_not_resolved');
      }

      const subscriptionTenantId = asString(subscription.tenant_id);
      const subscriptionPatientId = asString(subscription.patient_id);
      if (resourceType === 'preapproval') {
        const providerStatus = asString(providerResource.status);
        const localStatus = normalizeSubscriptionStatus(providerStatus);
        const nextPaymentDate = asString(providerResource.next_payment_date);
        const metadata = asRecord(subscription.metadata);
        const { error: updateError } = await supabase
          .from('patient_subscriptions')
          .update({
            status: localStatus,
            provider_subscription_id: preapprovalId,
            next_due_date: nextPaymentDate
              ? nextPaymentDate.slice(0, 10)
              : subscription.next_due_date,
            metadata: {
              ...metadata,
              provider_status: providerStatus,
              payment_link: pickPaymentLink(providerResource),
              last_provider_event: eventType,
            },
          })
          .eq('id', subscription.id)
          .eq('tenant_id', subscriptionTenantId);
        if (updateError) return internalError(context, 'subscription_update_failed');
      } else {
        const providerStatus = asString(providerResource.status).toLowerCase();
        const paid = ['approved', 'processed'].includes(providerStatus);
        const failed = ['rejected', 'failed'].includes(providerStatus);
        const amountCents =
          amountToCents(providerResource.transaction_amount) ||
          Number(subscription.amount_cents ?? 0);
        const paymentId =
          asString(providerResource.payment_id) || asString(asRecord(providerResource.payment).id);
        const existingInvoice = await supabase
          .from('patient_invoices')
          .select('id,metadata')
          .eq('provider', MERCADOPAGO_PROVIDER)
          .eq('provider_invoice_id', dataId)
          .maybeSingle();
        if (existingInvoice.error)
          return internalError(context, 'subscription_invoice_lookup_failed');
        const invoicePayload = {
          tenant_id: subscriptionTenantId,
          patient_id: subscriptionPatientId,
          provider: MERCADOPAGO_PROVIDER,
          collection_mode: 'provider',
          provider_invoice_id: dataId,
          provider_payment_id: paymentId || null,
          status: paid ? 'paid' : failed ? 'failed' : 'pending',
          amount_cents: amountCents,
          due_date:
            asString(providerResource.debit_date).slice(0, 10) || subscription.next_due_date,
          paid_at: paid ? asString(providerResource.date_created) || timestamp : null,
          description: 'Cobranca recorrente de pacote',
          package_id: subscription.package_id,
          program_id: subscription.program_id,
          enrollment_id: subscription.enrollment_id,
          service_id: subscription.service_id,
          source_module: 'mercadopago_subscription',
          metadata: {
            ...asRecord(existingInvoice.data?.metadata),
            provider_status: providerStatus,
            provider_subscription_id: preapprovalId,
            authorized_payment_id: dataId,
          },
        };
        let localInvoiceId = asString(existingInvoice.data?.id);
        if (localInvoiceId) {
          const updateInvoice = await supabase
            .from('patient_invoices')
            .update(invoicePayload)
            .eq('id', localInvoiceId)
            .eq('tenant_id', subscriptionTenantId);
          if (updateInvoice.error)
            return internalError(context, 'subscription_invoice_update_failed');
        } else {
          const insertInvoice = await supabase
            .from('patient_invoices')
            .insert(invoicePayload)
            .select('id')
            .single();
          if (insertInvoice.error)
            return internalError(context, 'subscription_invoice_insert_failed');
          localInvoiceId = asString(insertInvoice.data.id);
        }
        if (paymentId) {
          await upsertPayment({
            supabase,
            tenantId: subscriptionTenantId,
            patientId: subscriptionPatientId,
            invoiceId: localInvoiceId,
            providerPaymentId: paymentId,
            status: paid ? 'paid' : failed ? 'failed' : 'pending',
            amountCents,
            paidAt: paid ? timestamp : null,
            dueDate: invoicePayload.due_date,
            method: null,
            metadata: {
              provider_event: eventType,
              provider_status: providerStatus,
              provider_subscription_id: preapprovalId,
              authorized_payment_id: dataId,
            },
          });
        }
        await supabase
          .from('patient_subscriptions')
          .update({
            status: paid ? 'active' : failed ? 'past_due' : subscription.status,
            metadata: {
              ...asRecord(subscription.metadata),
              provider_status: providerStatus,
              last_authorized_payment_id: dataId,
            },
          })
          .eq('id', subscription.id)
          .eq('tenant_id', subscriptionTenantId);
      }

      await supabase
        .from('billing_provider_events')
        .update({
          tenant_id: subscriptionTenantId,
          local_subscription_id: subscription.id,
          status: 'processed',
          processed_at: timestamp,
          error_code: null,
          updated_at: timestamp,
        })
        .eq('id', providerEventRowId);
      await supabase
        .from('billing_webhook_events')
        .update({ status: 'processed', processed_at: timestamp, error_message: null })
        .eq('event_hash', eventHash);
      return json(200, { ok: true, processed: true }, observedEdgeHeaders(context));
    }

    const providerPayment = providerResource;
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
      await supabase
        .from('billing_provider_events')
        .update({
          tenant_id: tenantIdHint,
          resource_id: providerPaymentId,
          status: 'rejected',
          processed_at: timestamp,
          error_code: 'tenant_mismatch',
          payload_summary: {
            event: eventType,
            payment_id: providerPaymentId,
            tenant_hint: tenantIdHint,
          },
          updated_at: timestamp,
        })
        .eq('id', providerEventRowId);
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

    const { error: providerEventUpdateError } = await supabase
      .from('billing_provider_events')
      .update({
        tenant_id: tenantId,
        resource_type: 'payment',
        resource_id: providerPaymentId,
        local_invoice_id: invoiceId,
        status: tenantId && patientId && invoiceId ? 'processing' : 'retryable_failed',
        processed_at: null,
        error_code: tenantId && patientId && invoiceId ? null : 'tenant_not_resolved',
        next_attempt_at:
          tenantId && patientId && invoiceId
            ? timestamp
            : new Date(Date.now() + 5 * 60_000).toISOString(),
        payload_summary: {
          event: eventType,
          payment_id: providerPaymentId,
          preference_id: providerPreferenceId || null,
          payment_status: providerStatus || null,
          value_cents: amountCents || null,
        },
        updated_at: timestamp,
      })
      .eq('id', providerEventRowId);

    if (providerEventUpdateError) return internalError(context, 'provider_event_update_failed');

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
      return internalError(context, 'tenant_not_resolved');
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
      const { data: existingTimeline, error: timelineLookupError } = await supabase
        .from('patient_timeline_events')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .eq('payload->>event_hash', eventHash)
        .limit(1)
        .maybeSingle();
      if (timelineLookupError) return internalError(context, 'timeline_lookup_failed');
      if (!existingTimeline?.id) {
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

    const { error: providerProcessedError } = await supabase
      .from('billing_provider_events')
      .update({
        status: 'processed',
        processed_at: timestamp,
        error_code: null,
        error_message: null,
        updated_at: timestamp,
      })
      .eq('id', providerEventRowId);
    if (providerProcessedError) return internalError(context, 'provider_event_finalize_failed');

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
}, "webhook-mercadopago"));
