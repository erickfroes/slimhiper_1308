import { secureEdge } from '../_shared/http-security.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envString } from '../_shared/env.ts';
import {
  asRecord,
  asString,
  decryptMercadoPagoToken,
  isConfiguredSecret,
  mercadoPagoFetchWithAccessToken,
  safeErrorMessage,
  sha256Hex,
  verifyMercadoPagoWebhookSignatureWithSecret,
} from '../_shared/mercadopago.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

function response(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function normalizedResourceType(value: unknown) {
  const type = asString(value).toLowerCase();
  if (type === 'subscription_preapproval') return 'preapproval';
  if (type === 'subscription_preapproval_plan') return 'preapproval_plan';
  if (type === 'subscription_authorized_payment') return 'authorized_payment';
  if (type === 'payment') return 'payment';
  return '';
}

function resourcePath(resourceType: string, resourceId: string) {
  if (resourceType === 'preapproval') return `/preapproval/${encodeURIComponent(resourceId)}`;
  if (resourceType === 'preapproval_plan') {
    return `/preapproval_plan/${encodeURIComponent(resourceId)}`;
  }
  if (resourceType === 'authorized_payment') {
    return `/authorized_payments/${encodeURIComponent(resourceId)}`;
  }
  if (resourceType === 'payment') return `/v1/payments/${encodeURIComponent(resourceId)}`;
  return '';
}

Deno.serve(secureEdge(async (req) => {
  if (req.method !== 'POST') return response(405, { ok: false, error: 'method_not_allowed' });

  const rawBody = await req.text();
  let parsedPayload: unknown;
  let persistedEventId = '';
  let persistedAttempts = 0;
  try {
    parsedPayload = JSON.parse(rawBody || '{}');
  } catch {
    return response(400, { ok: false, error: 'invalid_json' });
  }
  const payload = asRecord(parsedPayload);
  const data = asRecord(payload.data);
  const resourceId = asString(data.id);
  const resourceType = normalizedResourceType(payload.type);
  const providerEventId =
    asString(payload.id) || `${resourceType}:${resourceId}:${asString(payload.action)}`;
  const environment = payload.live_mode === false ? 'test' : 'production';

  if (!resourceId || !resourceType || !providerEventId) {
    return response(400, { ok: false, error: 'invalid_event_contract' });
  }

  const supabaseUrl = envString(Deno.env, 'SUPABASE_URL');
  const serviceRoleKey = envString(Deno.env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return response(500, { ok: false, error: 'server_misconfigured' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: connection, error: connectionError } = await admin
      .from('platform_billing_connections')
      .select(
        'id,status,access_token_ciphertext,access_token_iv,webhook_secret_ciphertext,webhook_secret_iv'
      )
      .eq('provider', 'mercadopago')
      .eq('environment', environment)
      .maybeSingle();
    if (connectionError || !connection) {
      return response(503, { ok: false, error: 'platform_connection_unavailable' });
    }

    const webhookSecret = await decryptMercadoPagoToken(
      Deno.env,
      connection.webhook_secret_ciphertext,
      connection.webhook_secret_iv
    );
    const signature = await verifyMercadoPagoWebhookSignatureWithSecret({
      req,
      dataId: resourceId,
      secret: webhookSecret,
    });
    const digest = await sha256Hex(rawBody);
    const now = new Date().toISOString();

    const { data: existing } = await admin
      .from('platform_billing_webhook_events')
      .select('id,status,attempts')
      .eq('connection_id', connection.id)
      .eq('provider_event_id', providerEventId)
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .maybeSingle();

    let event = existing;
    if (!event) {
      const { data: inserted, error: insertError } = await admin
        .from('platform_billing_webhook_events')
        .insert({
          connection_id: connection.id,
          provider: 'mercadopago',
          provider_event_id: providerEventId,
          event_type: asString(payload.action) || asString(payload.type),
          resource_type: resourceType,
          resource_id: resourceId,
          signature_valid: signature.valid,
          status: signature.valid ? 'received' : 'rejected',
          payload_digest: digest,
          payload_summary: {
            liveMode: payload.live_mode === true,
            type: asString(payload.type),
            action: asString(payload.action),
          },
          error_code: signature.valid
            ? null
            : signature.fresh
              ? 'signature_invalid'
              : 'signature_stale',
          processed_at: signature.valid ? null : now,
        })
        .select('id,status,attempts')
        .single();
      if (insertError) {
        const { data: raced } = await admin
          .from('platform_billing_webhook_events')
          .select('id,status,attempts')
          .eq('connection_id', connection.id)
          .eq('provider_event_id', providerEventId)
          .eq('resource_type', resourceType)
          .eq('resource_id', resourceId)
          .maybeSingle();
        event = raced;
      } else {
        event = inserted;
      }
    }

    if (!signature.valid) return response(401, { ok: false, error: 'invalid_signature' });
    if (!event?.id) return response(500, { ok: false, error: 'event_persistence_failed' });
    persistedEventId = event.id;
    persistedAttempts = Number(event.attempts ?? 0);
    if (event.status === 'rejected') {
      return response(401, { ok: false, error: 'event_previously_rejected' });
    }
    if (event.status === 'processed' || event.status === 'ignored') {
      return response(200, { ok: true, duplicate: true });
    }
    if (event.status === 'dead_letter' || Number(event.attempts ?? 0) >= 20) {
      return response(200, { ok: true, deadLetter: true });
    }

    const accessToken = await decryptMercadoPagoToken(
      Deno.env,
      connection.access_token_ciphertext,
      connection.access_token_iv
    );
    if (!isConfiguredSecret(accessToken)) {
      const attempts = persistedAttempts + 1;
      await admin
        .from('platform_billing_webhook_events')
        .update({
          status: attempts >= 10 ? 'dead_letter' : 'retryable_failed',
          attempts,
          error_code: 'platform_token_unavailable',
          next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          updated_at: now,
        })
        .eq('id', event.id);
      return response(503, { ok: false, error: 'platform_token_unavailable' });
    }

    const providerResponse = await mercadoPagoFetchWithAccessToken(
      Deno.env,
      accessToken,
      resourcePath(resourceType, resourceId)
    );
    if (!providerResponse.ok) {
      const attempts = Number(event.attempts ?? 0) + 1;
      await admin
        .from('platform_billing_webhook_events')
        .update({
          status: attempts >= 10 ? 'dead_letter' : 'retryable_failed',
          attempts,
          error_code: providerResponse.errorCode || 'provider_fetch_failed',
          next_attempt_at: new Date(
            Date.now() + Math.min(3_600_000, 30_000 * 2 ** attempts)
          ).toISOString(),
          updated_at: now,
        })
        .eq('id', event.id);
      return response(503, { ok: false, error: 'provider_fetch_failed' });
    }

    const providerResource = asRecord(providerResponse.data);
    if (resourceType === 'preapproval_plan') {
      await admin
        .from('platform_plan_prices')
        .update({
          provider_status: asString(providerResource.status) === 'cancelled' ? 'retired' : 'active',
          provider_last_synced_at: now,
          provider_error_code: null,
          updated_at: now,
        })
        .eq('provider_plan_id', resourceId);
      await admin
        .from('platform_billing_webhook_events')
        .update({
          status: 'processed',
          attempts: Number(event.attempts ?? 0) + 1,
          processed_at: now,
          updated_at: now,
        })
        .eq('id', event.id);
    } else {
      const { data: projection, error: projectionError } = await admin.rpc(
        'apply_platform_mercadopago_event',
        {
          p_event_id: event.id,
          p_resource: { ...providerResource, type: resourceType },
        }
      );
      if (projectionError) throw projectionError;
      if (asString(asRecord(projection).status) === 'retryable_failed') {
        return response(503, { ok: false, error: 'projection_retry_scheduled' });
      }
    }

    return response(200, { ok: true });
  } catch (error) {
    if (persistedEventId) {
      const now = new Date().toISOString();
      const attempts = persistedAttempts + 1;
      await admin
        .from('platform_billing_webhook_events')
        .update({
          status: attempts >= 10 ? 'dead_letter' : 'retryable_failed',
          attempts,
          error_code: 'processing_failed',
          next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
          updated_at: now,
        })
        .eq('id', persistedEventId)
        .neq('status', 'processed');
    }
    console.error('[webhook-mercadopago-platform] processing_failed', {
      message: safeErrorMessage(error).slice(0, 160),
      resourceType,
    });
    return response(500, { ok: false, error: 'processing_failed' });
  }
}, "webhook-mercadopago-platform"));
