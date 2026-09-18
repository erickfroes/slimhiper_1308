import { withSecureRoute } from '@/lib/security/route';
import { NextResponse } from 'next/server';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  asRecord,
  asString,
  centsToAmount,
  getPlatformBillingConnection,
  platformMercadoPagoFetch,
} from '@/lib/mercadopago/platformBilling';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';

function jsonError(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeInteger(value: unknown, min: number, max: number) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

async function handlePOST(request: Request) {
  const session = await getCurrentAppSession();
  if (!session) return jsonError('Sessao obrigatoria.', 401);
  if (
    !canAccessPlatformAdminFromSession(session) ||
    (!isPlatformOwnerRole(session.platformRole) && !isPlatformAdminRole(session.platformRole))
  ) {
    return jsonError('Apenas administradores podem sincronizar planos.', 403);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError('Payload JSON invalido.', 400);
  const priceId = asString(body.priceId);
  const environment = body.environment === 'test' ? 'test' : 'production';
  const trialDays = normalizeInteger(body.trialDays, 0, 365);
  const graceDays = normalizeInteger(body.graceDays, 0, 90);
  const reason = asString(body.reason).slice(0, 500);
  if (!isUuid(priceId) || trialDays === null || graceDays === null) {
    return jsonError('Versao de preco, trial ou grace period invalidos.', 400);
  }
  if (reason.length < 16) return jsonError('Informe um motivo auditavel.', 400);

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonError('Supabase admin client nao configurado.', 503);

  const [connection, priceResult] = await Promise.all([
    getPlatformBillingConnection(admin, environment).catch(() => null),
    admin
      .from('platform_plan_prices')
      .select(
        'id,version,amount_cents,currency,billing_cycle,frequency,frequency_type,provider_plan_id,platform_plan_id,platform_plans!inner(code,name,active)'
      )
      .eq('id', priceId)
      .maybeSingle(),
  ]);
  if (!connection || connection.status !== 'active') {
    return jsonError('Conexao Mercado Pago da plataforma nao esta ativa.', 409);
  }
  if (priceResult.error || !priceResult.data)
    return jsonError('Versao de preco nao encontrada.', 404);

  const price = priceResult.data;
  const plan = asRecord(price.platform_plans);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').replace(
    /\/+$/,
    ''
  );
  if (!siteUrl.startsWith('https://')) {
    return jsonError('SITE_URL HTTPS e obrigatoria para sincronizar planos.', 503);
  }

  const syncingUpdate = await admin
    .from('platform_plan_prices')
    .update({
      trial_days: trialDays,
      grace_days: graceDays,
      provider_status: 'syncing',
      provider_error_code: null,
    })
    .eq('id', priceId);
  if (syncingUpdate.error) return jsonError('Falha ao preparar sincronizacao local.', 500);

  const payload = {
    reason: `${asString(plan.name)} v${price.version}`.slice(0, 120),
    auto_recurring: {
      frequency: Number(price.frequency),
      frequency_type: asString(price.frequency_type),
      transaction_amount: centsToAmount(Number(price.amount_cents)),
      currency_id: asString(price.currency) || 'BRL',
      ...(trialDays > 0 ? { free_trial: { frequency: trialDays, frequency_type: 'days' } } : {}),
    },
    back_url: `${siteUrl}/admin/billing?mercadopago=plan`,
  };
  const providerPlanId = asString(price.provider_plan_id);
  const providerResponse = await platformMercadoPagoFetch(
    connection,
    providerPlanId ? `/preapproval_plan/${providerPlanId}` : '/preapproval_plan',
    {
      method: providerPlanId ? 'PUT' : 'POST',
      idempotencyKey: `platform-plan-price:${priceId}`,
      body: JSON.stringify(payload),
    }
  );

  const providerData = asRecord(providerResponse.data);
  const resolvedProviderPlanId = asString(providerData.id) || providerPlanId;
  if (!providerResponse.ok || !resolvedProviderPlanId) {
    await admin
      .from('platform_plan_prices')
      .update({
        provider_status: 'error',
        provider_error_code: providerResponse.errorCode || 'mercadopago_invalid_response',
      })
      .eq('id', priceId);
    return jsonError('Mercado Pago recusou a sincronizacao do plano.', 502);
  }

  const now = new Date().toISOString();
  const syncedUpdate = await admin
    .from('platform_plan_prices')
    .update({
      provider_plan_id: resolvedProviderPlanId,
      provider_status: 'active',
      provider_last_synced_at: now,
      provider_error_code: null,
      metadata: {
        source: 'platform_admin_console',
        providerStatus: asString(providerData.status) || 'active',
      },
    })
    .eq('id', priceId);
  if (syncedUpdate.error) {
    return jsonError('Plano criado no provedor, mas a persistencia local falhou.', 500);
  }
  await admin.from('audit_logs').insert({
    tenant_id: null,
    user_id: session.userId,
    action: 'platform_billing.plan_synced',
    entity_type: 'platform_plan_price',
    entity_id: priceId,
    metadata: {
      reason,
      environment,
      planCode: asString(plan.code),
      version: price.version,
      providerPlanRef: resolvedProviderPlanId.slice(-8),
    },
  });

  return NextResponse.json({
    data: {
      priceId,
      providerPlanId: resolvedProviderPlanId,
      status: 'active',
      syncedAt: now,
    },
    error: null,
  });
}

export const POST = withSecureRoute(handlePOST, {
  scope: 'api/admin/billing/mercadopago/plans',
  limit: 30,
});
