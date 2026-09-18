'use client';

export type PlatformBillingEnvironment = 'test' | 'production';

export type PlatformBillingConnection = {
  id: string;
  environment: PlatformBillingEnvironment;
  status: string;
  applicationId: string | null;
  providerUserId: string | null;
  configuredAt: string | null;
  lastValidatedAt: string | null;
  lastWebhookAt: string | null;
  lastReconciledAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  hasAccessToken: boolean;
  hasWebhookSecret: boolean;
};

export type PlatformBillingPrice = {
  id: string;
  platformPlanId: string;
  planCode: string;
  planName: string;
  version: number;
  amountCents: number;
  currency: string;
  billingCycle: string;
  trialDays: number;
  graceDays: number;
  providerPlanId: string | null;
  providerStatus: string;
  providerLastSyncedAt: string | null;
  providerErrorCode: string | null;
  isCurrent: boolean;
};

export type PlatformTenantSubscription = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  planName: string;
  planCode: string;
  priceId: string | null;
  status: string;
  providerStatus: string | null;
  providerSubscriptionId: string | null;
  checkoutUrl: string | null;
  payerEmailMasked: string | null;
  nextPaymentAt: string | null;
  graceEndsAt: string | null;
  lastProviderSyncAt: string | null;
  providerErrorCode: string | null;
};

export type PlatformBillingEvent = {
  id: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  status: string;
  attempts: number;
  errorCode: string | null;
  receivedAt: string | null;
  processedAt: string | null;
};

export type PlatformBillingSnapshot = {
  environment: PlatformBillingEnvironment;
  connection: PlatformBillingConnection | null;
  prices: PlatformBillingPrice[];
  subscriptions: PlatformTenantSubscription[];
  events: PlatformBillingEvent[];
  metrics: {
    normalizedMrrCents: number;
    activeSubscriptions: number;
    trials: number;
    attention: number;
    cashReceivedThisMonthCents: number;
  };
};

type ServiceError = { message: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function asNullableString(value: unknown) {
  return asString(value) || null;
}

function relationRecord(value: unknown) {
  return Array.isArray(value) ? asRecord(value[0]) : asRecord(value);
}

function serviceError(value: unknown, fallback: string): ServiceError {
  const record = asRecord(value);
  return { message: asString(record.message) || fallback };
}

async function request<T>(url: string, init?: RequestInit) {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
    const payload = asRecord(await response.json().catch(() => null));
    if (!response.ok || payload.error) {
      return {
        data: null as T | null,
        error: serviceError(payload.error, 'Operacao financeira indisponivel.'),
      };
    }
    return { data: payload.data as T, error: null as ServiceError | null };
  } catch {
    return {
      data: null as T | null,
      error: { message: 'Falha de rede ao acessar o controle financeiro.' },
    };
  }
}

export async function getPlatformBillingSnapshot(environment: PlatformBillingEnvironment) {
  const result = await request<Record<string, unknown>>(
    `/api/admin/billing/mercadopago?environment=${environment}`
  );
  if (!result.data) return { data: null, error: result.error };
  const raw = result.data;
  const connectionRaw = asRecord(raw.connection);
  const metrics = asRecord(raw.metrics);

  return {
    data: {
      environment,
      connection: connectionRaw.id
        ? {
            id: asString(connectionRaw.id),
            environment,
            status: asString(connectionRaw.status) || 'not_configured',
            applicationId: asNullableString(connectionRaw.applicationId),
            providerUserId: asNullableString(connectionRaw.providerUserId),
            configuredAt: asNullableString(connectionRaw.configuredAt),
            lastValidatedAt: asNullableString(connectionRaw.lastValidatedAt),
            lastWebhookAt: asNullableString(connectionRaw.lastWebhookAt),
            lastReconciledAt: asNullableString(connectionRaw.lastReconciledAt),
            errorCode: asNullableString(connectionRaw.errorCode),
            errorMessage: asNullableString(connectionRaw.errorMessage),
            hasAccessToken: connectionRaw.hasAccessToken === true,
            hasWebhookSecret: connectionRaw.hasWebhookSecret === true,
          }
        : null,
      prices: (Array.isArray(raw.prices) ? raw.prices : []).map((value) => {
        const row = asRecord(value);
        const plan = relationRecord(row.platform_plans);
        return {
          id: asString(row.id),
          platformPlanId: asString(row.platform_plan_id),
          planCode: asString(plan.code),
          planName: asString(plan.name),
          version: Number(row.version ?? 0),
          amountCents: Number(row.amount_cents ?? 0),
          currency: asString(row.currency) || 'BRL',
          billingCycle: asString(row.billing_cycle) || 'monthly',
          trialDays: Number(row.trial_days ?? 0),
          graceDays: Number(row.grace_days ?? 0),
          providerPlanId: asNullableString(row.provider_plan_id),
          providerStatus: asString(row.provider_status) || 'not_synced',
          providerLastSyncedAt: asNullableString(row.provider_last_synced_at),
          providerErrorCode: asNullableString(row.provider_error_code),
          isCurrent: row.is_current === true,
        };
      }),
      subscriptions: (Array.isArray(raw.subscriptions) ? raw.subscriptions : []).map((value) => {
        const row = asRecord(value);
        const tenant = relationRecord(row.tenants);
        const plan = relationRecord(row.platform_plans);
        return {
          id: asString(row.id),
          tenantId: asString(row.tenant_id),
          tenantName: asString(tenant.name),
          tenantStatus: asString(tenant.status),
          planName: asString(plan.name),
          planCode: asString(plan.code),
          priceId: asNullableString(row.platform_plan_price_id),
          status: asString(row.status),
          providerStatus: asNullableString(row.provider_status),
          providerSubscriptionId: asNullableString(row.provider_subscription_id),
          checkoutUrl: asNullableString(row.checkout_url),
          payerEmailMasked: asNullableString(row.payer_email_masked),
          nextPaymentAt: asNullableString(row.next_payment_at),
          graceEndsAt: asNullableString(row.grace_ends_at),
          lastProviderSyncAt: asNullableString(row.last_provider_sync_at),
          providerErrorCode: asNullableString(row.provider_error_code),
        };
      }),
      events: (Array.isArray(raw.events) ? raw.events : []).map((value) => {
        const row = asRecord(value);
        return {
          id: asString(row.id),
          eventType: asString(row.event_type),
          resourceType: asString(row.resource_type),
          resourceId: asString(row.resource_id),
          status: asString(row.status),
          attempts: Number(row.attempts ?? 0),
          errorCode: asNullableString(row.error_code),
          receivedAt: asNullableString(row.received_at),
          processedAt: asNullableString(row.processed_at),
        };
      }),
      metrics: {
        normalizedMrrCents: Number(metrics.normalizedMrrCents ?? 0),
        activeSubscriptions: Number(metrics.activeSubscriptions ?? 0),
        trials: Number(metrics.trials ?? 0),
        attention: Number(metrics.attention ?? 0),
        cashReceivedThisMonthCents: Number(metrics.cashReceivedThisMonthCents ?? 0),
      },
    } satisfies PlatformBillingSnapshot,
    error: null,
  };
}

export function configurePlatformMercadoPago(input: {
  environment: PlatformBillingEnvironment;
  applicationId: string;
  accessToken: string;
  webhookSecret: string;
  reason: string;
}) {
  return request('/api/admin/billing/mercadopago', {
    method: 'POST',
    body: JSON.stringify({ action: 'configure', ...input }),
  });
}

export function runPlatformBillingAction(input: {
  action: 'test' | 'reconcile';
  environment: PlatformBillingEnvironment;
  reason: string;
}) {
  return request('/api/admin/billing/mercadopago', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function syncPlatformPlanPrice(input: {
  priceId: string;
  environment: PlatformBillingEnvironment;
  trialDays: number;
  graceDays: number;
  reason: string;
}) {
  return request('/api/admin/billing/mercadopago/plans', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function managePlatformTenantSubscription(input: {
  action: 'create' | 'sync' | 'pause' | 'reactivate' | 'cancel';
  tenantId: string;
  environment: PlatformBillingEnvironment;
  reason: string;
  payerEmail?: string;
  priceId?: string | null;
}) {
  return request<{ checkoutUrl?: string | null; providerStatus?: string }>(
    '/api/admin/billing/mercadopago/subscriptions',
    { method: 'POST', body: JSON.stringify(input) }
  );
}
