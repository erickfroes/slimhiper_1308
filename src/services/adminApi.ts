import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { SafeServiceError } from '@/services/billingApi';

export type AdminPlan = 'starter' | 'professional' | 'enterprise';
export type AdminTenantStatus = 'active' | 'trial' | 'suspended' | 'cancelled';
export type AdminSubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled' | 'paused';
export type AdminProviderStatus =
  | 'active'
  | 'pending'
  | 'blocked'
  | 'quota_exceeded'
  | 'error'
  | 'not_configured';

export interface AdminTenantRow {
  id: string;
  clinicName: string;
  owner: string;
  email: string;
  phone: string;
  website: string;
  cnpj: string;
  plan: AdminPlan;
  status: AdminTenantStatus;
  users: number;
  patients: number;
  units: number;
  storageUsedGb: number;
  storageCapacityGb: number;
  apiCallsThisMonth: number;
  apiLimitMonthly: number;
  saasSubscriptionStatus: AdminSubscriptionStatus;
  mrr: number;
  nextBillingDate: string | null;
  paymentMethod: string;
  asaasSubaccountStatus: AdminProviderStatus;
  asaasAccountId: string;
  d4signStatus: AdminProviderStatus;
  d4signDocsUsed: number;
  d4signDocsLimit: number;
  usersLimit: number;
  appointmentsThisMonth: number;
  featureFlags: Record<string, boolean>;
  openSupportSessions: number;
  pendingBreakGlass: number;
  auditEvents: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface AdminTenantUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  membershipStatus: string;
  unitId: string | null;
  mfaEnabled: boolean;
  lastLogin: string | null;
  createdAt: string | null;
}

export interface AdminTenantUnit {
  id: string;
  name: string;
  city: string;
  state: string;
  status: 'active' | 'inactive' | 'archived';
  users: number;
  patients: number;
  createdAt: string | null;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  description: string;
  admin: string;
  timestamp: string;
  category: 'billing' | 'security' | 'config' | 'support' | 'integration';
}

export interface AdminWebhookEventSummary {
  id: string;
  provider: 'Asaas' | 'D4Sign';
  eventType: string;
  tenant: string;
  tenantId: string;
  patientRef: string | null;
  externalId: string;
  idempotencyKey: string;
  receivedAt: string;
  processedAt: string | null;
  status: 'processed' | 'pending' | 'failed' | 'dead_letter' | 'retrying';
  retryCount: number;
  errorSummary: string | null;
}

export interface AdminTenantWebhookError {
  id: string;
  event: string;
  error: string;
  severity: 'critico' | 'alto' | 'medio';
  timestamp: string;
  retries: number;
  status: 'pending' | 'dead_letter' | 'resolved';
}

export interface AdminSupportSession {
  id: string;
  status: 'open' | 'pending' | 'resolved';
  priority: 'urgente' | 'alto' | 'medio' | 'baixo';
  subject: string;
  assignedTo: string | null;
  openedAt: string;
  lastActivity: string;
  reason: string | null;
}

export interface AdminBreakGlassRequest {
  id: string;
  requestedBy: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  requestedAt: string;
  approvedBy: string | null;
  expiresAt: string | null;
  scope: string;
}

export interface AdminTenantDetail {
  tenant: AdminTenantRow;
  users: AdminTenantUser[];
  units: AdminTenantUnit[];
  auditLogs: AdminAuditEntry[];
  webhookErrors: AdminTenantWebhookError[];
  supportSessions: AdminSupportSession[];
  breakGlassRequests: AdminBreakGlassRequest[];
}

export interface PlatformAdminSnapshot {
  tenants: AdminTenantRow[];
  webhooks: AdminWebhookEventSummary[];
  audit: AdminAuditEntry[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asServiceError(error: unknown, fallback: string): SafeServiceError {
  const record = asRecord(error);
  return {
    message: asString(record.message, fallback),
    code: asNullableString(record.code) ?? undefined,
    details: asNullableString(record.details) ?? undefined,
  };
}

function normalizePlan(value: unknown): AdminPlan {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'enterprise') return 'enterprise';
  if (normalized === 'professional' || normalized === 'pro') return 'professional';
  return 'starter';
}

function normalizeSubscription(value: unknown): AdminSubscriptionStatus {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'trial' || normalized === 'trialing') return 'trial';
  if (normalized === 'past_due') return 'past_due';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'paused') return 'paused';
  return 'active';
}

function normalizeTenantStatus(value: unknown, subscriptionStatus: AdminSubscriptionStatus) {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'suspended') return 'suspended';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'archived') {
    return 'cancelled';
  }
  if (subscriptionStatus === 'trial') return 'trial';
  return 'active';
}

function normalizeProviderStatus(value: unknown): AdminProviderStatus {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'active' || normalized === 'enabled') return 'active';
  if (normalized === 'pending') return 'pending';
  if (normalized === 'blocked' || normalized === 'restricted' || normalized === 'disabled') {
    return 'blocked';
  }
  if (normalized === 'quota_exceeded') return 'quota_exceeded';
  if (normalized === 'error' || normalized === 'failed') return 'error';
  return 'not_configured';
}

function normalizeWebhookStatus(
  value: unknown,
  retryCount: number
): AdminWebhookEventSummary['status'] {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'processed') return 'processed';
  if (normalized === 'failed') return retryCount >= 5 ? 'dead_letter' : 'failed';
  if (normalized === 'retrying') return 'retrying';
  if (normalized === 'ignored') return 'dead_letter';
  return 'pending';
}

function normalizeSupportStatus(value: unknown): AdminSupportSession['status'] {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'ended' || normalized === 'denied') return 'resolved';
  if (normalized === 'requested') return 'pending';
  return 'open';
}

function mapTenantRow(value: unknown): AdminTenantRow {
  const record = asRecord(value);
  const subscriptionStatus = normalizeSubscription(record.saasSubscriptionStatus);
  const flags = Object.entries(asRecord(record.featureFlags)).reduce<Record<string, boolean>>(
    (acc, [key, enabled]) => {
      acc[key] = asBoolean(enabled);
      return acc;
    },
    {}
  );

  return {
    id: asString(record.id),
    clinicName: asString(record.clinicName, 'Tenant'),
    owner: asString(record.owner, 'N/A'),
    email: asString(record.email, 'N/A'),
    phone: asString(record.phone),
    website: asString(record.website),
    cnpj: asString(record.cnpj),
    plan: normalizePlan(record.plan),
    status: normalizeTenantStatus(record.status, subscriptionStatus),
    users: asNumber(record.users),
    patients: asNumber(record.patients),
    units: asNumber(record.units),
    storageUsedGb: asNumber(record.storageUsedGb),
    storageCapacityGb: asNumber(record.storageCapacityGb, 20),
    apiCallsThisMonth: asNumber(record.apiCallsThisMonth),
    apiLimitMonthly: asNumber(record.apiLimitMonthly, 30000),
    saasSubscriptionStatus: subscriptionStatus,
    mrr: asNumber(record.mrr),
    nextBillingDate: asNullableString(record.nextBillingDate),
    paymentMethod: asString(record.paymentMethod, 'not_configured'),
    asaasSubaccountStatus: normalizeProviderStatus(record.asaasSubaccountStatus),
    asaasAccountId: asString(record.asaasAccountId),
    d4signStatus: normalizeProviderStatus(record.d4signStatus),
    d4signDocsUsed: asNumber(record.d4signDocsUsed),
    d4signDocsLimit: asNumber(record.d4signDocsLimit, 100),
    usersLimit: asNumber(record.usersLimit, 10),
    appointmentsThisMonth: asNumber(record.appointmentsThisMonth),
    featureFlags: flags,
    openSupportSessions: asNumber(record.openSupportSessions),
    pendingBreakGlass: asNumber(record.pendingBreakGlass),
    auditEvents: asNumber(record.auditEvents),
    createdAt: asString(record.createdAt),
    lastActivityAt: asString(record.lastActivityAt, asString(record.createdAt)),
  };
}

function mapUser(value: unknown): AdminTenantUser {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    name: asString(record.name, 'Usuario'),
    email: asString(record.email),
    role: asString(record.role, 'receptionist'),
    status: asString(record.status) === 'active' ? 'active' : 'inactive',
    membershipStatus: asString(record.membershipStatus, 'invited'),
    unitId: asNullableString(record.unitId),
    mfaEnabled: asBoolean(record.mfaEnabled),
    lastLogin: asNullableString(record.lastLogin),
    createdAt: asNullableString(record.createdAt),
  };
}

function mapUnit(value: unknown): AdminTenantUnit {
  const record = asRecord(value);
  const status = asString(record.status);
  return {
    id: asString(record.id),
    name: asString(record.name, 'Unidade'),
    city: asString(record.city),
    state: asString(record.state),
    status: status === 'inactive' || status === 'archived' ? status : 'active',
    users: asNumber(record.users),
    patients: asNumber(record.patients),
    createdAt: asNullableString(record.createdAt),
  };
}

function mapAudit(value: unknown): AdminAuditEntry {
  const record = asRecord(value);
  const category = asString(record.category);
  return {
    id: asString(record.id),
    action: asString(record.action, 'audit.event'),
    description: asString(record.description, asString(record.action, 'Evento auditado')),
    admin: asString(record.admin, 'Sistema'),
    timestamp: asString(record.timestamp),
    category:
      category === 'billing' ||
      category === 'security' ||
      category === 'support' ||
      category === 'integration'
        ? category
        : 'config',
  };
}

function mapWebhook(value: unknown): AdminWebhookEventSummary {
  const record = asRecord(value);
  const retryCount = asNumber(record.retryCount);
  return {
    id: asString(record.id),
    provider: asString(record.provider) === 'D4Sign' ? 'D4Sign' : 'Asaas',
    eventType: asString(record.eventType, 'unknown'),
    tenant: asString(record.tenant, 'N/A'),
    tenantId: asString(record.tenantId),
    patientRef: asNullableString(record.patientRef),
    externalId: asString(record.externalId, asString(record.id)),
    idempotencyKey: asString(record.idempotencyKey, asString(record.id)),
    receivedAt: asString(record.receivedAt),
    processedAt: asNullableString(record.processedAt),
    status: normalizeWebhookStatus(record.status, retryCount),
    retryCount,
    errorSummary: asNullableString(record.errorSummary),
  };
}

function mapTenantWebhookError(value: unknown): AdminTenantWebhookError {
  const record = asRecord(value);
  const severity = asString(record.severity);
  const status = asString(record.status);
  return {
    id: asString(record.id),
    event: asString(record.event, 'unknown'),
    error: asString(record.error),
    severity: severity === 'critico' || severity === 'alto' ? severity : 'medio',
    timestamp: asString(record.timestamp),
    retries: asNumber(record.retries),
    status: status === 'dead_letter' || status === 'resolved' ? status : 'pending',
  };
}

function mapSupport(value: unknown): AdminSupportSession {
  const record = asRecord(value);
  const priority = asString(record.priority);
  return {
    id: asString(record.id),
    status: normalizeSupportStatus(record.status),
    priority:
      priority === 'urgente' || priority === 'alto' || priority === 'baixo' ? priority : 'medio',
    subject: asString(record.subject, 'Suporte operacional'),
    assignedTo: asNullableString(record.assignedTo),
    openedAt: asString(record.openedAt),
    lastActivity: asString(record.lastActivity, asString(record.openedAt)),
    reason: asNullableString(record.reason),
  };
}

function mapBreakGlass(value: unknown): AdminBreakGlassRequest {
  const record = asRecord(value);
  const status = asString(record.status);
  return {
    id: asString(record.id),
    requestedBy: asString(record.requestedBy, 'Usuario'),
    reason: asString(record.reason),
    status:
      status === 'approved' || status === 'denied' || status === 'expired' ? status : 'pending',
    requestedAt: asString(record.requestedAt),
    approvedBy: asNullableString(record.approvedBy),
    expiresAt: asNullableString(record.expiresAt),
    scope: asString(record.scope, 'operational_support'),
  };
}

function mapTenantDetail(value: unknown): AdminTenantDetail {
  const record = asRecord(value);
  return {
    tenant: mapTenantRow(record.tenant),
    users: asArray(record.users).map(mapUser),
    units: asArray(record.units).map(mapUnit),
    auditLogs: asArray(record.auditLogs).map(mapAudit),
    webhookErrors: asArray(record.webhookErrors).map(mapTenantWebhookError),
    supportSessions: asArray(record.supportSessions).map(mapSupport),
    breakGlassRequests: asArray(record.breakGlassRequests).map(mapBreakGlass),
  };
}

export async function listTenants(): Promise<{
  data: AdminTenantRow[];
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('list_platform_tenants');

    if (error) return { data: [], error: asServiceError(error, 'Falha ao carregar tenants.') };

    return { data: asArray(data).map(mapTenantRow), error: null };
  } catch (error) {
    return { data: [], error: asServiceError(error, 'Falha ao carregar tenants.') };
  }
}

export async function getTenantDetail(tenantId: string): Promise<{
  data: AdminTenantDetail | null;
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_platform_tenant_detail', {
      p_tenant_id: tenantId,
    });

    if (error) {
      return { data: null, error: asServiceError(error, 'Falha ao carregar tenant.') };
    }

    return { data: mapTenantDetail(data), error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao carregar tenant.') };
  }
}

export async function listWebhookSummaries(limit = 100): Promise<{
  data: AdminWebhookEventSummary[];
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('list_platform_webhook_events', {
      p_limit: limit,
    });

    if (error) {
      return { data: [], error: asServiceError(error, 'Falha ao carregar webhooks.') };
    }

    return { data: asArray(data).map(mapWebhook), error: null };
  } catch (error) {
    return { data: [], error: asServiceError(error, 'Falha ao carregar webhooks.') };
  }
}

export async function getPlatformAdminSnapshot(): Promise<{
  data: PlatformAdminSnapshot | null;
  error: SafeServiceError | null;
}> {
  const [tenantsResult, webhooksResult] = await Promise.all([
    listTenants(),
    listWebhookSummaries(25),
  ]);

  const firstError = tenantsResult.error ?? webhooksResult.error;
  if (firstError) {
    return {
      data: null,
      error: firstError,
    };
  }

  const audit = tenantsResult.data
    .flatMap((tenant) => [
      {
        id: `${tenant.id}-last-activity`,
        action: 'tenant.activity',
        description: `${tenant.clinicName}: ultima atividade registrada`,
        admin: 'Sistema',
        timestamp: tenant.lastActivityAt,
        category: 'config' as const,
      },
    ])
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);

  return {
    data: {
      tenants: tenantsResult.data,
      webhooks: webhooksResult.data,
      audit,
    },
    error: null,
  };
}

export async function requestPlatformSupportSession(input: {
  tenantId: string;
  subject: string;
  reason: string;
  priority: AdminSupportSession['priority'];
}) {
  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('request_platform_support_session', {
      p_tenant_id: input.tenantId,
      p_subject: input.subject,
      p_reason: input.reason,
      p_priority: input.priority,
    });

    if (error) return { error: asServiceError(error, 'Falha ao abrir suporte.') };
    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao abrir suporte.') };
  }
}

export async function requestPlatformBreakGlass(input: {
  tenantId: string;
  reason: string;
  scope: string;
  durationMinutes: number;
}) {
  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('request_platform_break_glass', {
      p_tenant_id: input.tenantId,
      p_reason: input.reason,
      p_scope: input.scope,
      p_duration_minutes: input.durationMinutes,
    });

    if (error) return { error: asServiceError(error, 'Falha ao solicitar break-glass.') };
    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao solicitar break-glass.') };
  }
}

export async function decidePlatformBreakGlass(input: {
  requestId: string;
  decision: 'approved' | 'denied';
}) {
  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('decide_platform_break_glass', {
      p_request_id: input.requestId,
      p_decision: input.decision,
    });

    if (error) return { error: asServiceError(error, 'Falha ao decidir break-glass.') };
    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao decidir break-glass.') };
  }
}
