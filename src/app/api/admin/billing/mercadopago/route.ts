import { withSecureRoute } from '@/lib/security/route';
import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { encryptMercadoPagoToken } from '@/lib/mercadopago/tokenCrypto';
import {
  asRecord,
  asString,
  getPlatformBillingConnection,
  validatePlatformAccessToken,
  validatePlatformBillingConnection,
} from '@/lib/mercadopago/platformBilling';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import {
  isPlatformAdminRole,
  isPlatformOwnerRole,
  isPlatformSupportRole,
} from '@/services/session/roles';

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function normalizeText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function sanitizeConnection(connection: Awaited<ReturnType<typeof getPlatformBillingConnection>>) {
  if (!connection) return null;
  return {
    id: connection.id,
    provider: 'mercadopago',
    environment: connection.environment,
    status: connection.status,
    applicationId: connection.application_id,
    providerUserId: connection.account_ref_masked,
    configuredAt: connection.configured_at,
    lastValidatedAt: connection.last_validated_at,
    lastWebhookAt: connection.last_webhook_at,
    lastReconciledAt: connection.last_reconciled_at,
    errorCode: connection.error_code,
    errorMessage: connection.error_message,
    hasAccessToken: Boolean(connection.access_token_ciphertext && connection.access_token_iv),
    hasWebhookSecret: Boolean(connection.webhook_secret_ciphertext && connection.webhook_secret_iv),
  };
}

async function getAuthorizedSession({ allowSupport = false } = {}) {
  const session = await getCurrentAppSession();
  if (!session) return { session: null, response: jsonError('Sessao obrigatoria.', 401) };

  const roleAllowed =
    isPlatformOwnerRole(session.platformRole) ||
    isPlatformAdminRole(session.platformRole) ||
    (allowSupport && isPlatformSupportRole(session.platformRole));
  if (!canAccessPlatformAdminFromSession(session) || !roleAllowed) {
    return { session: null, response: jsonError('Acesso financeiro da plataforma negado.', 403) };
  }
  return { session, response: null };
}

export async function GET(request: Request) {
  const { session, response } = await getAuthorizedSession({ allowSupport: true });
  if (!session) return response;

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado.', 503);

  const url = new URL(request.url);
  const environment = url.searchParams.get('environment') === 'test' ? 'test' : 'production';

  try {
    const [connection, pricesResult, subscriptionsResult, paymentsResult, eventsResult] =
      await Promise.all([
        getPlatformBillingConnection(admin, environment),
        admin
          .from('platform_plan_prices')
          .select(
            'id,platform_plan_id,version,amount_cents,currency,billing_cycle,frequency,frequency_type,trial_days,grace_days,provider_plan_id,provider_status,provider_last_synced_at,provider_error_code,is_current,platform_plans!inner(code,name,active)'
          )
          .order('created_at', { ascending: false }),
        admin
          .from('tenant_subscriptions')
          .select(
            'id,tenant_id,platform_plan_id,platform_plan_price_id,status,provider_status,provider_subscription_id,checkout_url,payer_email_masked,next_payment_at,grace_ends_at,last_provider_sync_at,provider_error_code,tenants!inner(name,status),platform_plans!inner(code,name)'
          )
          .order('updated_at', { ascending: false })
          .limit(250),
        admin
          .from('platform_subscription_payments')
          .select('amount_cents,status,paid_at')
          .eq('status', 'paid')
          .gte(
            'paid_at',
            new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
          ),
        admin
          .from('platform_billing_webhook_events')
          .select(
            'id,event_type,resource_type,resource_id,status,attempts,error_code,received_at,processed_at'
          )
          .order('received_at', { ascending: false })
          .limit(50),
      ]);

    const firstError =
      pricesResult.error || subscriptionsResult.error || paymentsResult.error || eventsResult.error;
    if (firstError) return jsonError('Falha ao carregar controle financeiro da plataforma.', 500);

    const subscriptions = subscriptionsResult.data ?? [];
    const activeStatuses = new Set(['active', 'trialing']);
    const currentPrices = new Map(
      (pricesResult.data ?? []).map((row) => [String(row.id), Number(row.amount_cents ?? 0)])
    );
    const normalizedMrrCents = subscriptions.reduce((total, row) => {
      if (!activeStatuses.has(String(row.status))) return total;
      const price = currentPrices.get(String(row.platform_plan_price_id)) ?? 0;
      const priceRow = (pricesResult.data ?? []).find(
        (candidate) => String(candidate.id) === String(row.platform_plan_price_id)
      );
      const cycle = String(priceRow?.billing_cycle ?? 'monthly');
      const normalized =
        cycle === 'yearly' ? price / 12 : cycle === 'quarterly' ? price / 3 : price;
      return total + normalized;
    }, 0);

    return NextResponse.json({
      data: {
        environment,
        connection: sanitizeConnection(connection),
        prices: pricesResult.data ?? [],
        subscriptions,
        events: eventsResult.data ?? [],
        metrics: {
          normalizedMrrCents: Math.round(normalizedMrrCents),
          activeSubscriptions: subscriptions.filter((row) => row.status === 'active').length,
          trials: subscriptions.filter((row) => row.status === 'trialing').length,
          attention: subscriptions.filter((row) =>
            ['past_due', 'grace', 'pending_authorization'].includes(String(row.status))
          ).length,
          cashReceivedThisMonthCents: (paymentsResult.data ?? []).reduce(
            (sum, row) => sum + Number(row.amount_cents ?? 0),
            0
          ),
        },
      },
      error: null,
    });
  } catch {
    return jsonError('Falha ao carregar controle financeiro da plataforma.', 500);
  }
}

async function handlePOST(request: Request) {
  const { session, response } = await getAuthorizedSession();
  if (!session) return response;

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado.', 503);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError('Payload JSON invalido.', 400);
  const action = normalizeText(body.action, 40).toLowerCase();
  const environment = body.environment === 'test' ? 'test' : 'production';
  const reason = normalizeText(body.reason, 500);
  if (reason.length < 16) {
    return jsonError('Informe um motivo auditavel com pelo menos 16 caracteres.', 400);
  }

  if (action === 'configure') {
    if (!isPlatformOwnerRole(session.platformRole)) {
      return jsonError('Somente o platform owner pode configurar credenciais.', 403);
    }
    const accessToken = asString(body.accessToken);
    const webhookSecret = asString(body.webhookSecret);
    const applicationId = normalizeText(body.applicationId, 120);
    if (accessToken.length < 24 || webhookSecret.length < 24) {
      return jsonError('Access token e webhook secret validos sao obrigatorios.', 400);
    }

    try {
      const validation = await validatePlatformAccessToken(accessToken);
      if (!validation.ok) {
        return jsonError(
          'Mercado Pago recusou a credencial; configuracao anterior preservada.',
          502
        );
      }
      const [encryptedToken, encryptedWebhookSecret] = await Promise.all([
        encryptMercadoPagoToken(accessToken),
        encryptMercadoPagoToken(webhookSecret),
      ]);
      const now = new Date().toISOString();
      const { data: connection, error } = await admin
        .from('platform_billing_connections')
        .upsert(
          {
            provider: 'mercadopago',
            environment,
            status: 'active',
            application_id: applicationId || null,
            provider_user_id: validation.providerUserId,
            account_ref_masked: validation.accountRef,
            access_token_ciphertext: encryptedToken.ciphertext,
            access_token_iv: encryptedToken.iv,
            webhook_secret_ciphertext: encryptedWebhookSecret.ciphertext,
            webhook_secret_iv: encryptedWebhookSecret.iv,
            configured_by: session.userId,
            configured_at: now,
            last_validated_at: now,
            error_code: null,
            error_message: null,
            metadata: { source: 'platform_admin_console' },
          },
          { onConflict: 'provider,environment' }
        )
        .select(
          'id,environment,status,application_id,provider_user_id,account_ref_masked,access_token_ciphertext,access_token_iv,webhook_secret_ciphertext,webhook_secret_iv,configured_at,last_validated_at,last_webhook_at,last_reconciled_at,error_code,error_message,metadata'
        )
        .single();
      if (error || !connection) return jsonError('Falha ao armazenar configuracao segura.', 500);

      await admin.from('audit_logs').insert({
        tenant_id: null,
        user_id: session.userId,
        action: 'platform_billing.mercadopago_configured',
        entity_type: 'platform_billing_connection',
        entity_id: connection.id,
        metadata: {
          reason,
          environment,
          applicationId: applicationId || null,
          validation: 'active',
        },
      });

      const refreshed = await getPlatformBillingConnection(admin, environment);
      return NextResponse.json({
        data: { connection: sanitizeConnection(refreshed), validation },
        error: null,
      });
    } catch {
      return jsonError('Criptografia da configuracao Mercado Pago indisponivel.', 503);
    }
  }

  const connection = await getPlatformBillingConnection(admin, environment).catch(() => null);
  if (!connection) return jsonError('Conta Mercado Pago da plataforma nao configurada.', 409);

  if (action === 'test') {
    const validation = await validatePlatformBillingConnection(admin, connection);
    await admin.from('audit_logs').insert({
      tenant_id: null,
      user_id: session.userId,
      action: 'platform_billing.connection_tested',
      entity_type: 'platform_billing_connection',
      entity_id: connection.id,
      metadata: { reason, environment, result: validation.ok ? 'active' : 'degraded' },
    });
    if (!validation.ok) return jsonError('Mercado Pago recusou a validacao da conta.', 502);
    return NextResponse.json({ data: validation, error: null });
  }

  if (action === 'reconcile') {
    const { data, error } = await admin.rpc('apply_platform_billing_lifecycle');
    if (error) return jsonError('Falha ao reconciliar ciclo de assinaturas.', 500);
    await admin
      .from('platform_billing_connections')
      .update({ last_reconciled_at: new Date().toISOString() })
      .eq('id', connection.id);
    await admin.from('audit_logs').insert({
      tenant_id: null,
      user_id: session.userId,
      action: 'platform_billing.lifecycle_reconciled',
      entity_type: 'platform_billing_connection',
      entity_id: connection.id,
      metadata: { reason, environment, result: asRecord(data) },
    });
    return NextResponse.json({ data, error: null });
  }

  return jsonError('Acao nao suportada.', 400);
}

export const POST = withSecureRoute(handlePOST, {
  scope: 'api/admin/billing/mercadopago',
  limit: 30,
});
