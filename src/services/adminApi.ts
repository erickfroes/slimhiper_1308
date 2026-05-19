import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { SafeServiceError } from '@/services/billingApi';

export interface AdminTenantRow {
  id: string;
  clinicName: string;
  owner: string;
  email: string;
  plan: 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'trial' | 'suspended' | 'cancelled';
  users: number;
  patients: number;
  storageUsedGb: number;
  storageCapacityGb: number;
  apiCallsThisMonth: number;
  apiLimitMonthly: number;
  saasSubscriptionStatus: 'active' | 'trial' | 'past_due' | 'cancelled' | 'paused';
  asaasSubaccountStatus: 'active' | 'pending' | 'blocked' | 'not_configured';
  d4signStatus: 'active' | 'quota_exceeded' | 'error' | 'not_configured';
  featureFlags: Record<string, boolean>;
  createdAt: string;
  lastActivityAt: string;
}
export interface AdminTenantDetail extends AdminTenantRow {
  phone: string;
  website: string;
  cnpj: string;
  mrr: number;
  nextBillingDate: string;
  paymentMethod: string;
  asaasAccountId: string;
  d4signDocsUsed: number;
  d4signDocsLimit: number;
  usersLimit: number;
  appointmentsThisMonth: number;
}
export interface AdminWebhookEventSummary {
  id: string;
  provider: 'Asaas' | 'D4Sign';
  eventType: string;
  tenant: string;
  tenantId: string;
  externalId: string;
  idempotencyKey: string;
  receivedAt: string;
  processedAt: string | null;
  status: 'processed' | 'pending' | 'failed' | 'dead_letter' | 'retrying';
  retryCount: number;
  errorSummary: string | null;
}

function isMockEnabled() {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}
const fallbackError = (message: string): SafeServiceError => ({ message });

function mapTenant(t: any): AdminTenantRow {
  const md = (t.settings ?? {}) as Record<string, any>;
  const usage = (md.usage ?? {}) as Record<string, any>;
  return {
    id: t.id,
    clinicName: t.name ?? 'Tenant',
    owner: md.owner ?? 'N/A',
    email: md.email ?? 'N/A',
    plan: md.plan ?? 'starter',
    status: t.status ?? 'active',
    users: Number(usage.users ?? 0),
    patients: Number(usage.patients ?? 0),
    storageUsedGb: Number(usage.storageUsedGb ?? 0),
    storageCapacityGb: Number(usage.storageCapacityGb ?? 20),
    apiCallsThisMonth: Number(usage.apiCallsThisMonth ?? 0),
    apiLimitMonthly: Number(usage.apiLimitMonthly ?? 30000),
    saasSubscriptionStatus: md.saasSubscriptionStatus ?? 'active',
    asaasSubaccountStatus: md.asaasSubaccountStatus ?? 'not_configured',
    d4signStatus: md.d4signStatus ?? 'not_configured',
    featureFlags: md.featureFlags ?? {},
    createdAt: t.created_at,
    lastActivityAt: t.updated_at ?? t.created_at,
  };
}

export async function listTenants(mockData: AdminTenantRow[]) {
  if (isMockEnabled()) return { data: mockData, error: null as SafeServiceError | null };
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('tenants')
      .select('id,name,status,settings,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (error) return { data: mockData, error: fallbackError(error.message) };
    return { data: (data ?? []).map(mapTenant), error: null as SafeServiceError | null };
  } catch {
    return {
      data: mockData,
      error: fallbackError('Failed to load tenants from backend, using mock fallback.'),
    };
  }
}

export async function getTenantDetail(tenantId: string, fallback: AdminTenantDetail) {
  if (isMockEnabled()) return { data: fallback, error: null as SafeServiceError | null };
  try {
    const supabase = createBrowserSupabaseClient();
    const [
      { data: tenant, error: tErr },
      { count: userCount },
      { count: ffCount },
      { count: supportCount },
      { count: bgCount },
      { count: d4Count },
      { count: asaasCount },
    ] = await Promise.all([
      supabase
        .from('tenants')
        .select('id,name,status,settings,created_at,updated_at')
        .eq('id', tenantId)
        .single(),
      supabase
        .from('tenant_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      supabase
        .from('feature_flags')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('enabled', true),
      supabase
        .from('support_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      supabase
        .from('break_glass_requests')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      supabase
        .from('d4sign_events')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      supabase
        .from('asaas_events')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
    ]);
    if (tErr || !tenant)
      return { data: fallback, error: fallbackError(tErr?.message ?? 'Tenant not found') };
    const base = mapTenant(tenant);
    return {
      data: {
        ...fallback,
        ...base,
        users: userCount ?? fallback.users,
        d4signDocsUsed: d4Count ?? fallback.d4signDocsUsed,
        d4signDocsLimit: Math.max(100, d4Count ?? 0),
        appointmentsThisMonth: asaasCount ?? fallback.appointmentsThisMonth,
        apiCallsThisMonth: supportCount ?? base.apiCallsThisMonth,
        patients: bgCount ?? base.patients,
        featureFlags: { ...fallback.featureFlags, enabledFlags: Boolean(ffCount) },
      },
      error: null as SafeServiceError | null,
    };
  } catch {
    return {
      data: fallback,
      error: fallbackError('Failed to load tenant detail from backend, using fallback.'),
    };
  }
}

export async function listWebhookSummaries(mockData: AdminWebhookEventSummary[]) {
  if (isMockEnabled()) return { data: mockData, error: null as SafeServiceError | null };
  try {
    const supabase = createBrowserSupabaseClient();
    const [{ data: asaas }, { data: d4 }] = await Promise.all([
      supabase
        .from('asaas_events')
        .select(
          'id,tenant_id,event_type,asaas_event_id,idempotency_key,status,retry_count,error_message,created_at,processed_at'
        )
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('d4sign_events')
        .select(
          'id,tenant_id,event_type,provider_event_id,idempotency_key,status,retry_count,error_message,created_at,processed_at'
        )
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    const tenants = await supabase.from('tenants').select('id,name');
    const byId = new Map((tenants.data ?? []).map((t: any) => [t.id, t.name]));
    const mapped: AdminWebhookEventSummary[] = [
      ...(asaas ?? []).map((e: any) => ({
        id: e.id,
        provider: 'Asaas' as const,
        eventType: e.event_type ?? 'unknown',
        tenant: byId.get(e.tenant_id) ?? 'N/A',
        tenantId: e.tenant_id ?? 'N/A',
        externalId: e.asaas_event_id ?? e.id,
        idempotencyKey: e.idempotency_key ?? e.id,
        receivedAt: e.created_at,
        processedAt: e.processed_at,
        status: e.status ?? 'processed',
        retryCount: e.retry_count ?? 0,
        errorSummary: e.error_message ?? null,
      })),
      ...(d4 ?? []).map((e: any) => ({
        id: e.id,
        provider: 'D4Sign' as const,
        eventType: e.event_type ?? 'unknown',
        tenant: byId.get(e.tenant_id) ?? 'N/A',
        tenantId: e.tenant_id ?? 'N/A',
        externalId: e.provider_event_id ?? e.id,
        idempotencyKey: e.idempotency_key ?? e.id,
        receivedAt: e.created_at,
        processedAt: e.processed_at,
        status: e.status ?? 'processed',
        retryCount: e.retry_count ?? 0,
        errorSummary: e.error_message ?? null,
      })),
    ].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return { data: mapped.length ? mapped : mockData, error: null as SafeServiceError | null };
  } catch {
    return {
      data: mockData,
      error: fallbackError('Failed to load webhook summaries from backend, using mock fallback.'),
    };
  }
}
