import { withSecureRoute } from '@/lib/security/route';
import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  asRecord,
  asString,
  getPlatformBillingConnection,
  platformMercadoPagoFetch,
  safeMercadoPagoUrl,
} from '@/lib/mercadopago/platformBilling';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function maskEmail(value: string) {
  const [local, domain] = value.split('@');
  if (!domain) return '';
  return `${local.slice(0, 2)}***@${domain}`;
}

function localSubscriptionStatus(providerStatus: string) {
  if (providerStatus === 'authorized') return 'active';
  if (providerStatus === 'paused') return 'paused';
  if (providerStatus === 'cancelled' || providerStatus === 'canceled') return 'canceled';
  if (providerStatus === 'rejected') return 'past_due';
  return 'pending_authorization';
}

async function handlePOST(request: Request) {
  const session = await getCurrentAppSession();
  if (!session) return jsonError('Sessao obrigatoria.', 401);
  if (
    !canAccessPlatformAdminFromSession(session) ||
    (!isPlatformOwnerRole(session.platformRole) && !isPlatformAdminRole(session.platformRole))
  ) {
    return jsonError('Apenas administradores podem gerenciar assinaturas.', 403);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError('Payload JSON invalido.', 400);
  const action = asString(body.action).toLowerCase();
  const tenantId = asString(body.tenantId);
  const environment = body.environment === 'test' ? 'test' : 'production';
  const reason = asString(body.reason).slice(0, 500);
  if (!isUuid(tenantId)) return jsonError('Tenant invalido.', 400);
  if (reason.length < 16) return jsonError('Informe um motivo auditavel.', 400);

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado.', 503);
  const connection = await getPlatformBillingConnection(admin, environment).catch(() => null);
  if (!connection || connection.status !== 'active') {
    return jsonError('Conexao Mercado Pago da plataforma nao esta ativa.', 409);
  }

  const { data: subscription, error: subscriptionError } = await admin
    .from('tenant_subscriptions')
    .select(
      'id,tenant_id,platform_plan_id,platform_plan_price_id,status,provider_subscription_id,provider_external_reference,platform_plans!inner(code,name)'
    )
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (subscriptionError || !subscription)
    return jsonError('Assinatura do tenant nao encontrada.', 404);

  if (action === 'create') {
    if (subscription.provider_subscription_id) {
      return jsonError('Tenant ja possui assinatura vinculada ao Mercado Pago.', 409);
    }
    const payerEmail = asString(body.payerEmail).toLowerCase();
    if (!isEmail(payerEmail)) return jsonError('E-mail do pagador invalido.', 400);

    let priceId = asString(body.priceId) || asString(subscription.platform_plan_price_id);
    if (!isUuid(priceId)) {
      const { data: currentPrice } = await admin
        .from('platform_plan_prices')
        .select('id')
        .eq('platform_plan_id', subscription.platform_plan_id)
        .eq('is_current', true)
        .maybeSingle();
      priceId = asString(currentPrice?.id);
    }
    if (!isUuid(priceId)) return jsonError('Versao comercial do plano nao encontrada.', 409);

    const { data: price, error: priceError } = await admin
      .from('platform_plan_prices')
      .select('id,provider_plan_id,provider_status,trial_days,grace_days')
      .eq('id', priceId)
      .maybeSingle();
    if (priceError || !price || price.provider_status !== 'active' || !price.provider_plan_id) {
      return jsonError('Sincronize a versao do plano antes de criar a assinatura.', 409);
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').replace(
      /\/+$/,
      ''
    );
    const supabaseUrl = (
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      ''
    ).replace(/\/+$/, '');
    if (!siteUrl.startsWith('https://') || !supabaseUrl.startsWith('https://')) {
      return jsonError('SITE_URL e SUPABASE_URL HTTPS sao obrigatorias.', 503);
    }

    const externalReference = `shr_tsub_${crypto.randomUUID().replaceAll('-', '')}`;
    const creatingUpdate = await admin
      .from('tenant_subscriptions')
      .update({
        platform_plan_price_id: priceId,
        provider: 'mercadopago',
        provider_external_reference: externalReference,
        provider_status: 'creating',
        status: 'pending_authorization',
        payer_email_masked: maskEmail(payerEmail),
        provider_error_code: null,
      })
      .eq('id', subscription.id);
    if (creatingUpdate.error) return jsonError('Falha ao preparar assinatura local.', 500);

    const providerResponse = await platformMercadoPagoFetch(connection, '/preapproval', {
      method: 'POST',
      idempotencyKey: `tenant-subscription:${subscription.id}:${priceId}`,
      body: JSON.stringify({
        preapproval_plan_id: price.provider_plan_id,
        reason: asString(asRecord(subscription.platform_plans).name).slice(0, 120),
        external_reference: externalReference,
        payer_email: payerEmail,
        status: 'pending',
        back_url: `${siteUrl}/admin/tenants/${tenantId}?billing=return`,
        notification_url: `${supabaseUrl}/functions/v1/webhook-mercadopago-platform?source_news=webhooks`,
      }),
    });
    const providerData = asRecord(providerResponse.data);
    const providerSubscriptionId = asString(providerData.id);
    const checkoutUrl = safeMercadoPagoUrl(providerData.init_point);
    if (!providerResponse.ok || !providerSubscriptionId) {
      await admin
        .from('tenant_subscriptions')
        .update({
          provider_status: 'error',
          provider_error_code: providerResponse.errorCode || 'mercadopago_invalid_response',
        })
        .eq('id', subscription.id);
      return jsonError('Mercado Pago recusou a criacao da assinatura.', 502);
    }

    const now = new Date().toISOString();
    const providerStatus = asString(providerData.status).toLowerCase() || 'pending';
    const createdUpdate = await admin
      .from('tenant_subscriptions')
      .update({
        provider_subscription_id: providerSubscriptionId,
        provider_status: providerStatus,
        checkout_url: checkoutUrl,
        status: localSubscriptionStatus(providerStatus),
        next_payment_at: asString(providerData.next_payment_date) || null,
        last_provider_sync_at: now,
        provider_error_code: null,
      })
      .eq('id', subscription.id);
    if (createdUpdate.error) {
      return jsonError('Assinatura criada no provedor, mas a persistencia local falhou.', 500);
    }
    await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: session.userId,
      action: 'platform_billing.subscription_created',
      entity_type: 'tenant_subscription',
      entity_id: subscription.id,
      metadata: { reason, environment, priceId, providerStatus },
    });

    return NextResponse.json({
      data: {
        subscriptionId: subscription.id,
        providerStatus,
        checkoutUrl,
        updatedAt: now,
      },
      error: null,
    });
  }

  const providerSubscriptionId = asString(subscription.provider_subscription_id);
  if (!providerSubscriptionId)
    return jsonError('Assinatura ainda nao vinculada ao Mercado Pago.', 409);

  if (action === 'sync') {
    const providerResponse = await platformMercadoPagoFetch(
      connection,
      `/preapproval/${encodeURIComponent(providerSubscriptionId)}`
    );
    if (!providerResponse.ok)
      return jsonError('Falha ao consultar assinatura no Mercado Pago.', 502);
    const providerData = asRecord(providerResponse.data);
    const providerStatus = asString(providerData.status).toLowerCase() || 'pending';
    const localStatus = localSubscriptionStatus(providerStatus);
    const now = new Date().toISOString();
    const syncUpdate = await admin
      .from('tenant_subscriptions')
      .update({
        provider_status: providerStatus,
        status: localStatus,
        checkout_url: safeMercadoPagoUrl(providerData.init_point),
        next_payment_at: asString(providerData.next_payment_date) || null,
        last_provider_sync_at: now,
        provider_error_code: null,
      })
      .eq('id', subscription.id);
    if (syncUpdate.error) return jsonError('Falha ao persistir sincronizacao local.', 500);
    if (localStatus === 'active') {
      const { data: tenant } = await admin
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .maybeSingle();
      const settings = asRecord(tenant?.settings);
      if (asString(settings.billingSuspensionSource) === 'mercadopago_lifecycle') {
        const {
          billingSuspendedAt: _suspendedAt,
          billingSuspensionSource: _source,
          ...rest
        } = settings;
        await admin
          .from('tenants')
          .update({
            status: 'active',
            settings: { ...rest, billingReactivatedAt: now },
          })
          .eq('id', tenantId);
      }
    }
    return NextResponse.json({ data: { providerStatus, updatedAt: now }, error: null });
  }

  const requestedStatus =
    action === 'pause'
      ? 'paused'
      : action === 'reactivate'
        ? 'authorized'
        : action === 'cancel'
          ? 'cancelled'
          : '';
  if (!requestedStatus) return jsonError('Acao nao suportada.', 400);

  const providerResponse = await platformMercadoPagoFetch(
    connection,
    `/preapproval/${encodeURIComponent(providerSubscriptionId)}`,
    { method: 'PUT', body: JSON.stringify({ status: requestedStatus }) }
  );
  if (!providerResponse.ok)
    return jsonError('Mercado Pago recusou a alteracao da assinatura.', 502);
  const providerData = asRecord(providerResponse.data);
  const providerStatus = asString(providerData.status).toLowerCase() || requestedStatus;
  const localStatus = localSubscriptionStatus(providerStatus);
  const now = new Date().toISOString();
  const statusUpdate = await admin
    .from('tenant_subscriptions')
    .update({
      provider_status: providerStatus,
      status: localStatus,
      last_provider_sync_at: now,
      provider_error_code: null,
    })
    .eq('id', subscription.id);
  if (statusUpdate.error) return jsonError('Falha ao persistir status local.', 500);
  if (localStatus === 'active') {
    const { data: tenant } = await admin
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();
    const settings = asRecord(tenant?.settings);
    if (asString(settings.billingSuspensionSource) === 'mercadopago_lifecycle') {
      const {
        billingSuspendedAt: _suspendedAt,
        billingSuspensionSource: _source,
        ...rest
      } = settings;
      await admin
        .from('tenants')
        .update({ status: 'active', settings: { ...rest, billingReactivatedAt: now } })
        .eq('id', tenantId);
    }
  }
  await admin.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: session.userId,
    action: `platform_billing.subscription_${action}`,
    entity_type: 'tenant_subscription',
    entity_id: subscription.id,
    metadata: { reason, environment, providerStatus },
  });

  return NextResponse.json({ data: { providerStatus, updatedAt: now }, error: null });
}

export const POST = withSecureRoute(handlePOST, {
  scope: 'api/admin/billing/mercadopago/subscriptions',
  limit: 30,
});
