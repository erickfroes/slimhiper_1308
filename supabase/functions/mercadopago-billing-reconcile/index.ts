import { secureEdge } from '../_shared/http-security.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { envString } from '../_shared/env.ts';
import {
  asRecord,
  asString,
  decryptMercadoPagoToken,
  mercadoPagoFetchWithAccessToken,
  safeErrorMessage,
  timingSafeEqual,
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

function resourcePath(type: string, id: string) {
  if (type === 'preapproval') return `/preapproval/${encodeURIComponent(id)}`;
  if (type === 'preapproval_plan') return `/preapproval_plan/${encodeURIComponent(id)}`;
  if (type === 'authorized_payment') return `/authorized_payments/${encodeURIComponent(id)}`;
  if (type === 'payment') return `/v1/payments/${encodeURIComponent(id)}`;
  return '';
}

Deno.serve(secureEdge(async (req) => {
  if (req.method !== 'POST') return response(405, { ok: false, error: 'method_not_allowed' });

  const expectedSecret = envString(Deno.env, 'BILLING_CRON_SECRET');
  const suppliedSecret = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!expectedSecret || !suppliedSecret || !timingSafeEqual(expectedSecret, suppliedSecret)) {
    return response(401, { ok: false, error: 'unauthorized' });
  }

  const supabaseUrl = envString(Deno.env, 'SUPABASE_URL');
  const serviceRoleKey = envString(Deno.env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return response(500, { ok: false, error: 'server_misconfigured' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const results = { processed: 0, failed: 0, ignored: 0 };

  try {
    const { data: lifecycle, error: lifecycleError } = await admin.rpc(
      'apply_platform_billing_lifecycle'
    );
    if (lifecycleError) throw lifecycleError;

    const dueAt = new Date().toISOString();
    const { data: dueEvents, error: eventsError } = await admin
      .from('platform_billing_webhook_events')
      .select('id,connection_id,resource_type,resource_id,status,attempts')
      .in('status', ['received', 'retryable_failed'])
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${dueAt}`)
      .order('received_at', { ascending: true })
      .limit(50);
    if (eventsError) throw eventsError;

    for (const event of dueEvents ?? []) {
      const path = resourcePath(asString(event.resource_type), asString(event.resource_id));
      if (!path) {
        await admin
          .from('platform_billing_webhook_events')
          .update({
            status: 'ignored',
            error_code: 'unsupported_resource_type',
            updated_at: new Date().toISOString(),
          })
          .eq('id', event.id);
        results.ignored += 1;
        continue;
      }

      const { data: connection } = await admin
        .from('platform_billing_connections')
        .select('id,access_token_ciphertext,access_token_iv')
        .eq('id', event.connection_id)
        .maybeSingle();
      if (!connection) {
        results.failed += 1;
        continue;
      }

      const accessToken = await decryptMercadoPagoToken(
        Deno.env,
        connection.access_token_ciphertext,
        connection.access_token_iv
      );
      const providerResponse = await mercadoPagoFetchWithAccessToken(Deno.env, accessToken, path);
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
            updated_at: new Date().toISOString(),
          })
          .eq('id', event.id);
        results.failed += 1;
        continue;
      }

      if (event.resource_type === 'preapproval_plan') {
        const providerPlan = asRecord(providerResponse.data);
        await admin
          .from('platform_plan_prices')
          .update({
            provider_status: asString(providerPlan.status) === 'cancelled' ? 'retired' : 'active',
            provider_last_synced_at: new Date().toISOString(),
            provider_error_code: null,
          })
          .eq('provider_plan_id', event.resource_id);
        await admin
          .from('platform_billing_webhook_events')
          .update({
            status: 'processed',
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', event.id);
      } else {
        const { data: projection, error: projectionError } = await admin.rpc(
          'apply_platform_mercadopago_event',
          {
            p_event_id: event.id,
            p_resource: { ...asRecord(providerResponse.data), type: event.resource_type },
          }
        );
        if (projectionError || asString(asRecord(projection).status) === 'retryable_failed') {
          results.failed += 1;
          continue;
        }
      }
      results.processed += 1;
    }

    await admin
      .from('platform_billing_connections')
      .update({ last_reconciled_at: new Date().toISOString() })
      .eq('status', 'active');

    return response(200, { ok: true, data: { lifecycle, events: results } });
  } catch (error) {
    console.error('[mercadopago-billing-reconcile] failed', {
      message: safeErrorMessage(error).slice(0, 160),
    });
    return response(500, { ok: false, error: 'reconciliation_failed' });
  }
}, "mercadopago-billing-reconcile"));
