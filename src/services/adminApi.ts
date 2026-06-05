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

export interface PlatformAdminSupportSummary extends AdminSupportSession {
  tenantId: string;
  tenantName: string;
}

export interface PlatformAdminSnapshot {
  tenants: AdminTenantRow[];
  webhooks: AdminWebhookEventSummary[];
  audit: AdminAuditEntry[];
  support: PlatformAdminSupportSummary[];
  warnings: string[];
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeText(value: string, maxLength = 500) {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : char;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function serviceValidationError(message: string) {
  return { error: { message } satisfies SafeServiceError };
}

function sanitizeOperationalText(value: unknown, fallback = '', maxLength = 240) {
  const normalized = normalizeText(asString(value, fallback), maxLength);
  return normalized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
}

function redactOperationalIdentifier(value: unknown, fallback = '') {
  const normalized = normalizeText(asString(value, fallback), 160);
  if (!normalized) return '';
  if (/^op_[0-9a-f]{12}$/i.test(normalized)) return normalized;
  if (normalized.length <= 10) return normalized;
  return `${normalized.slice(0, 4)}...${normalized.slice(-6)}`;
}

function asServiceError(error: unknown, fallback: string): SafeServiceError {
  const record = asRecord(error);
  return {
    message: fallback,
    code: asNullableString(record.code) ?? undefined,
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
    eventType: sanitizeOperationalText(record.eventType, 'unknown', 120),
    tenant: sanitizeOperationalText(record.tenant, 'N/A', 160),
    tenantId: asString(record.tenantId),
    patientRef: asNullableString(redactOperationalIdentifier(record.patientRef)),
    externalId: redactOperationalIdentifier(record.externalId, asString(record.id)),
    idempotencyKey: redactOperationalIdentifier(record.idempotencyKey, asString(record.id)),
    receivedAt: asString(record.receivedAt),
    processedAt: asNullableString(record.processedAt),
    status: normalizeWebhookStatus(record.status, retryCount),
    retryCount,
    errorSummary: asNullableString(sanitizeOperationalText(record.errorSummary, '', 240)),
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

  const tenantsForOperationalDetails = tenantsResult.data
    .filter(
      (tenant) =>
        tenant.auditEvents > 0 || tenant.openSupportSessions > 0 || tenant.pendingBreakGlass > 0
    )
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .slice(0, 20);

  const detailResults = await Promise.all(
    tenantsForOperationalDetails.map(async (tenant) => ({
      tenant,
      result: await getTenantDetail(tenant.id),
    }))
  );

  const warnings = detailResults
    .filter(({ result }) => result.error)
    .map(({ tenant }) => `Detalhes operacionais indisponiveis para ${tenant.clinicName}.`);

  const tenantDetails = detailResults.flatMap(({ result }) => (result.data ? [result.data] : []));

  const audit = tenantDetails
    .flatMap((detail) => detail.auditLogs)
    .filter((entry) => entry.id && entry.timestamp)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);

  const support = tenantDetails
    .flatMap((detail) =>
      detail.supportSessions.map((session) => ({
        ...session,
        tenantId: detail.tenant.id,
        tenantName: detail.tenant.clinicName,
      }))
    )
    .filter((session) => session.id && session.openedAt)
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
    .slice(0, 20);

  return {
    data: {
      tenants: tenantsResult.data,
      webhooks: webhooksResult.data,
      audit,
      support,
      warnings,
    },
    error: null,
  };
}

export async function invitePlatformTenantUser(input: {
  tenantId: string;
  email: string;
  fullName?: string;
  roleCode: string;
  unitId?: string | null;
  reason: string;
}) {
  const tenantId = input.tenantId.trim();
  const email = normalizeText(input.email, 254).toLowerCase();
  const fullName = normalizeText(input.fullName ?? '', 160);
  const roleCode = normalizeText(input.roleCode, 80);
  const unitId = input.unitId ? input.unitId.trim() : null;
  const reason = normalizeText(input.reason, 500);

  if (!isUuid(tenantId)) return serviceValidationError('Tenant invalido.');
  if (unitId && !isUuid(unitId)) return serviceValidationError('Unidade invalida.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return serviceValidationError('E-mail invalido.');
  }
  if (reason.length < 16) {
    return serviceValidationError('Informe um motivo auditavel com pelo menos 16 caracteres.');
  }

  try {
    const response = await fetch(`/api/admin/tenants/${tenantId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        fullName,
        roleCode,
        unitId,
        reason,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        error: {
          message: payload?.error?.message ?? 'Falha ao convidar usuario do tenant.',
        } satisfies SafeServiceError,
      };
    }

    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao convidar usuario do tenant.') };
  }
}

export async function updatePlatformTenantMembership(input: {
  tenantId: string;
  membershipId: string;
  roleCode?: string;
  status?: AdminTenantUser['membershipStatus'];
  unitId?: string | null;
  reason: string;
}) {
  const tenantId = input.tenantId.trim();
  const membershipId = input.membershipId.trim();
  const unitId = input.unitId ? input.unitId.trim() : null;
  const reason = normalizeText(input.reason, 500);

  if (!isUuid(tenantId)) return serviceValidationError('Tenant invalido.');
  if (!isUuid(membershipId)) return serviceValidationError('Vinculo invalido.');
  if (unitId && !isUuid(unitId)) return serviceValidationError('Unidade invalida.');
  if (reason.length < 16) {
    return serviceValidationError('Informe um motivo auditavel com pelo menos 16 caracteres.');
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('update_platform_tenant_membership', {
      p_tenant_id: tenantId,
      p_membership_id: membershipId,
      p_role_code: input.roleCode ? normalizeText(input.roleCode, 80) : null,
      p_status: input.status ? normalizeText(input.status, 40) : null,
      p_unit_id: unitId,
      p_reason: reason,
    });

    if (error) return { error: asServiceError(error, 'Falha ao atualizar usuario do tenant.') };
    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao atualizar usuario do tenant.') };
  }
}

export async function requestPlatformSupportSession(input: {
  tenantId: string;
  subject: string;
  reason: string;
  priority: AdminSupportSession['priority'];
}) {
  const tenantId = input.tenantId.trim();
  const subject = normalizeText(input.subject, 160);
  const reason = normalizeText(input.reason, 500);

  if (!isUuid(tenantId)) return serviceValidationError('Tenant invalido.');
  if (subject.length < 4) return serviceValidationError('Informe um assunto de suporte.');
  if (reason.length < 16) {
    return serviceValidationError('Informe um motivo auditavel com pelo menos 16 caracteres.');
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('request_platform_support_session', {
      p_tenant_id: tenantId,
      p_subject: subject,
      p_reason: reason,
      p_priority: input.priority,
    });

    if (error) return { error: asServiceError(error, 'Falha ao abrir suporte.') };
    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao abrir suporte.') };
  }
}

export async function endPlatformSupportSession(sessionId: string) {
  const normalizedSessionId = sessionId.trim();
  if (!isUuid(normalizedSessionId)) return serviceValidationError('Sessao de suporte invalida.');

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('end_platform_support_session', {
      p_session_id: normalizedSessionId,
    });

    if (error) return { error: asServiceError(error, 'Falha ao encerrar suporte.') };
    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao encerrar suporte.') };
  }
}

export async function requestPlatformBreakGlass(input: {
  tenantId: string;
  reason: string;
  scope: string;
  durationMinutes: number;
}) {
  const tenantId = input.tenantId.trim();
  const reason = normalizeText(input.reason, 500);
  const scope = normalizeText(input.scope, 240);
  const durationMinutes = Math.trunc(input.durationMinutes);

  if (!isUuid(tenantId)) return serviceValidationError('Tenant invalido.');
  if (scope.length < 8) return serviceValidationError('Informe o escopo do break-glass.');
  if (reason.length < 24) {
    return serviceValidationError('Informe um motivo auditavel com pelo menos 24 caracteres.');
  }
  if (durationMinutes < 15 || durationMinutes > 240) {
    return serviceValidationError('Duracao do break-glass deve ficar entre 15 e 240 minutos.');
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('request_platform_break_glass', {
      p_tenant_id: tenantId,
      p_reason: reason,
      p_scope: scope,
      p_duration_minutes: durationMinutes,
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
  const requestId = input.requestId.trim();
  if (!isUuid(requestId)) return serviceValidationError('Solicitacao break-glass invalida.');

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('decide_platform_break_glass', {
      p_request_id: requestId,
      p_decision: input.decision,
    });

    if (error) return { error: asServiceError(error, 'Falha ao decidir break-glass.') };
    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao decidir break-glass.') };
  }
}

export async function revokePlatformBreakGlass(input: { requestId: string; reason: string }) {
  const requestId = input.requestId.trim();
  const reason = normalizeText(input.reason, 500);

  if (!isUuid(requestId)) return serviceValidationError('Solicitacao break-glass invalida.');
  if (reason.length < 12) {
    return serviceValidationError('Informe um motivo de revogacao com pelo menos 12 caracteres.');
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('revoke_platform_break_glass', {
      p_request_id: requestId,
      p_reason: reason,
    });

    if (error) return { error: asServiceError(error, 'Falha ao revogar break-glass.') };
    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao revogar break-glass.') };
  }
}
