import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { SafeServiceError } from '@/services/billingApi';
import {
  normalizePlanEntitlements,
  validatePlanEntitlementsInput,
  type PlanEntitlements,
} from '@/services/planEntitlements';

export type AdminPlan = 'starter' | 'professional' | 'enterprise' | (string & {});
export type AdminTenantStatus = 'active' | 'trial' | 'suspended' | 'cancelled';
export type AdminSubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled' | 'paused';
export type AdminProviderStatus =
  | 'active'
  | 'pending'
  | 'blocked'
  | 'quota_exceeded'
  | 'error'
  | 'not_configured';
export type AdminIntegrationProvider = 'asaas' | 'mercadopago' | 'd4sign';
export type AdminIntegrationOperationalState = 'normal' | 'investigating' | 'resolved';

export interface AdminIntegrationOperationState {
  state: AdminIntegrationOperationalState;
  updatedAt: string | null;
}

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
  mercadopagoStatus: AdminProviderStatus;
  mercadopagoAccountId: string;
  d4signStatus: AdminProviderStatus;
  d4signDocsUsed: number;
  d4signDocsLimit: number;
  usersLimit: number;
  doctorsLimit: number;
  integrationOperations: Record<AdminIntegrationProvider, AdminIntegrationOperationState>;
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
  professionalProfile: ProfessionalProfile | null;
  createdAt: string | null;
}

export type ProfessionalType =
  | 'physician'
  | 'nutritionist'
  | 'fitness_professional'
  | 'external_professional';

export interface ProfessionalProfile {
  id: string;
  professionalType: ProfessionalType;
  licenseNumber: string;
  licenseState: string;
  specialty: string;
  isActive: boolean;
  countsAsDoctor: boolean;
}

export interface ProfessionalProfileInput {
  enabled: boolean;
  professionalType: ProfessionalType;
  licenseNumber?: string;
  licenseState?: string;
  specialty?: string;
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
  tenantId?: string;
  tenantName?: string;
}

export interface AdminWebhookEventSummary {
  id: string;
  provider: 'Asaas' | 'Mercado Pago' | 'D4Sign';
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

export type AdminOperationalJobStatus = 'ok' | 'watch' | 'critical';

export interface AdminOperationalJobRun {
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  triggerSource: 'cron' | 'manual' | 'edge' | 'script' | 'migration' | 'admin';
  dryRun: boolean;
  requestedLimit: number;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  summary: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface AdminOperationalJobSummary {
  jobKey: string;
  displayName: string;
  category: string;
  executionKind: 'recurring' | 'one_shot' | 'admin_check';
  handlerName: string;
  enabled: boolean;
  cronEnabled: boolean;
  scheduleCron: string | null;
  timezone: string;
  cronJobName: string | null;
  defaultLimit: number;
  maxLimit: number;
  expectedMaxLagMinutes: number;
  dryRunSupported: boolean;
  serviceRoleOnly: boolean;
  description: string;
  runbookHref: string | null;
  currentStatus: AdminOperationalJobStatus;
  isStale: boolean;
  evidence: string;
  lastRun: AdminOperationalJobRun | null;
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

export interface PlatformAdminBreakGlassSummary extends AdminBreakGlassRequest {
  tenantId: string;
  tenantName: string;
}

export interface PlatformPrivilegedUserSummary extends AdminTenantUser {
  tenantId: string;
  tenantName: string;
}

export interface AdminWebhookReprocessJob {
  id: string;
  tenantId: string | null;
  provider: AdminIntegrationProvider;
  eventId: string;
  status: 'queued' | 'processing' | 'processed' | 'failed' | 'not_reprocessable';
  reason: string;
  requestedBy: string | null;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
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

export interface PlatformComplianceGap {
  id: string;
  tenantId: string;
  tenantName: string;
  code: string;
  area: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'acknowledged';
  title: string;
  description: string;
  remediation: string;
  ownerRole: string | null;
  detectedAt: string | null;
  updatedAt: string | null;
}

export interface PlatformAdminSnapshot {
  tenants: AdminTenantRow[];
  webhooks: AdminWebhookEventSummary[];
  audit: AdminAuditEntry[];
  support: PlatformAdminSupportSummary[];
  breakGlass: PlatformAdminBreakGlassSummary[];
  privilegedUsers: PlatformPrivilegedUserSummary[];
  reprocessJobs: AdminWebhookReprocessJob[];
  complianceGaps: PlatformComplianceGap[];
  warnings: string[];
}

export interface AdminPlatformPlan {
  id: string;
  code: string;
  name: string;
  billingCycle: string;
  amountCents: number;
  currency: string;
  active: boolean;
  features: Record<string, unknown>;
  entitlements: PlanEntitlements;
}

export interface CreateTenantInput {
  clinicName: string;
  slug: string;
  cnpj?: string;
  phone?: string;
  website?: string;
  ownerName: string;
  ownerEmail: string;
  reason: string;
  planCode: string;
  unitName: string;
  unitCode?: string;
  city?: string;
  state?: string;
  professionalProfile?: ProfessionalProfileInput | null;
}

export interface CreateTenantResult {
  tenantId: string;
  tenantSlug: string;
  unitId: string;
  ownerMembershipId: string;
  ownerInviteDelivery: 'existing_auth_user' | 'supabase_invite_sent' | 'password_setup_sent';
  subscriptionStatus: string;
  trialEndsAt: string | null;
}

export interface UpdateTenantConfigInput {
  tenantId: string;
  status?: AdminTenantStatus;
  planCode?: string;
  usage?: {
    doctorsLimit?: number;
  };
  featureFlags?: Record<string, boolean>;
  reason: string;
}

export interface UpsertTenantUnitInput {
  tenantId: string;
  unitId?: string | null;
  name: string;
  code?: string;
  city?: string;
  state?: string;
  status?: AdminTenantUnit['status'];
  reason: string;
}

export interface SavePlatformPlanInput {
  id?: string | null;
  code: string;
  name: string;
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  amountReais: number;
  currency: string;
  active: boolean;
  features: {
    doctorsLimit: number;
  };
  entitlements: PlanEntitlements;
  reason: string;
}

export interface AdminTenantEntitlementsState {
  tenantId: string;
  planCode: string;
  source: 'plan_snapshot' | 'tenant_override';
  isOutOfSync: boolean;
  currentEntitlements: PlanEntitlements;
  planEntitlements: PlanEntitlements;
  syncedAt: string | null;
}

export interface SaveTenantEntitlementsInput {
  tenantId: string;
  reason: string;
  entitlements?: PlanEntitlements;
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

function normalizeProfessionalType(value: unknown): ProfessionalType {
  if (
    value === 'nutritionist' ||
    value === 'fitness_professional' ||
    value === 'external_professional'
  ) {
    return value;
  }
  return 'physician';
}

function sanitizeProfessionalProfileInput(
  input: ProfessionalProfileInput | null | undefined,
  roleCode: string
): { profile: ProfessionalProfileInput | null; error: string | null } {
  const enabled = roleCode === 'physician' || input?.enabled === true;
  if (!enabled) return { profile: null, error: null };

  const professionalType = normalizeProfessionalType(input?.professionalType);
  const licenseNumber = normalizeText(input?.licenseNumber ?? '', 80);
  const licenseState = normalizeText(input?.licenseState ?? '', 2).toUpperCase();
  const specialty = normalizeText(input?.specialty ?? '', 160);

  if (professionalType === 'physician') {
    if (!licenseNumber) return { profile: null, error: 'Informe o CRM/registro do medico.' };
    if (!licenseState || licenseState.length !== 2) {
      return { profile: null, error: 'Informe a UF do CRM/registro do medico.' };
    }
  }

  return {
    profile: {
      enabled: true,
      professionalType,
      licenseNumber,
      licenseState,
      specialty,
    },
    error: null,
  };
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
  if (!normalized) return 'starter';
  if (normalized === 'enterprise') return 'enterprise';
  if (normalized === 'professional' || normalized === 'pro') return 'professional';
  if (normalized === 'starter') return 'starter';
  return normalized;
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

function normalizeOperationalJobStatus(value: unknown): AdminOperationalJobStatus {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'watch') return 'watch';
  return 'ok';
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
    mercadopagoStatus: normalizeProviderStatus(
      record.mercadopagoStatus ??
        (asString(record.paymentMethod).toLowerCase() === 'mercadopago' ? 'active' : undefined)
    ),
    mercadopagoAccountId: asString(record.mercadopagoAccountId),
    d4signStatus: normalizeProviderStatus(record.d4signStatus),
    d4signDocsUsed: asNumber(record.d4signDocsUsed),
    d4signDocsLimit: asNumber(record.d4signDocsLimit, 100),
    usersLimit: asNumber(record.usersLimit, 10),
    doctorsLimit: asNumber(record.doctorsLimit, asNumber(record.usersLimit, 1)),
    integrationOperations: {
      asaas: mapIntegrationOperationState(asRecord(record.integrationOperations).asaas),
      mercadopago: mapIntegrationOperationState(asRecord(record.integrationOperations).mercadopago),
      d4sign: mapIntegrationOperationState(asRecord(record.integrationOperations).d4sign),
    },
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
    professionalProfile: mapProfessionalProfile(record.professionalProfile),
    createdAt: asNullableString(record.createdAt),
  };
}

function mapProfessionalProfile(value: unknown): ProfessionalProfile | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;

  return {
    id,
    professionalType: normalizeProfessionalType(record.professionalType),
    licenseNumber: asString(record.licenseNumber),
    licenseState: asString(record.licenseState),
    specialty: asString(record.specialty),
    isActive: asBoolean(record.isActive),
    countsAsDoctor: asBoolean(record.countsAsDoctor),
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
  const provider = asString(record.provider).toLowerCase();
  return {
    id: asString(record.id),
    provider:
      provider === 'd4sign'
        ? 'D4Sign'
        : provider === 'mercado pago' || provider === 'mercadopago'
          ? 'Mercado Pago'
          : 'Asaas',
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

function mapOperationalJobRun(value: unknown): AdminOperationalJobRun | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;

  const status = asString(record.status);
  const triggerSource = asString(record.triggerSource);

  return {
    id,
    status:
      status === 'running' || status === 'failed' || status === 'skipped' ? status : 'succeeded',
    triggerSource:
      triggerSource === 'cron' ||
      triggerSource === 'edge' ||
      triggerSource === 'script' ||
      triggerSource === 'migration' ||
      triggerSource === 'admin'
        ? triggerSource
        : 'manual',
    dryRun: asBoolean(record.dryRun, true),
    requestedLimit: asNumber(record.requestedLimit),
    startedAt: asString(record.startedAt),
    finishedAt: asNullableString(record.finishedAt),
    durationMs:
      record.durationMs === null || record.durationMs === undefined
        ? null
        : asNumber(record.durationMs),
    processedCount: asNumber(record.processedCount),
    succeededCount: asNumber(record.succeededCount),
    failedCount: asNumber(record.failedCount),
    skippedCount: asNumber(record.skippedCount),
    summary: asRecord(record.summary),
    errorCode: asNullableString(record.errorCode),
    errorMessage: asNullableString(sanitizeOperationalText(record.errorMessage, '', 500)),
  };
}

function mapOperationalJob(value: unknown): AdminOperationalJobSummary {
  const record = asRecord(value);
  const executionKind = asString(record.executionKind);

  return {
    jobKey: asString(record.jobKey),
    displayName: sanitizeOperationalText(record.displayName, 'Job operacional', 160),
    category: sanitizeOperationalText(record.category, 'operational', 80),
    executionKind:
      executionKind === 'one_shot' || executionKind === 'admin_check' ? executionKind : 'recurring',
    handlerName: sanitizeOperationalText(record.handlerName, '', 200),
    enabled: asBoolean(record.enabled),
    cronEnabled: asBoolean(record.cronEnabled),
    scheduleCron: asNullableString(record.scheduleCron),
    timezone: sanitizeOperationalText(record.timezone, 'America/Sao_Paulo', 80),
    cronJobName: asNullableString(record.cronJobName),
    defaultLimit: asNumber(record.defaultLimit),
    maxLimit: asNumber(record.maxLimit),
    expectedMaxLagMinutes: asNumber(record.expectedMaxLagMinutes),
    dryRunSupported: asBoolean(record.dryRunSupported, true),
    serviceRoleOnly: asBoolean(record.serviceRoleOnly, true),
    description: sanitizeOperationalText(record.description, '', 320),
    runbookHref: asNullableString(record.runbookHref),
    currentStatus: normalizeOperationalJobStatus(record.currentStatus),
    isStale: asBoolean(record.isStale),
    evidence: sanitizeOperationalText(record.evidence, 'Sem evidencia recente.', 320),
    lastRun: mapOperationalJobRun(record.lastRun),
  };
}

function mapWebhookReprocessJob(value: unknown): AdminWebhookReprocessJob {
  const record = asRecord(value);
  const provider = asString(record.provider).toLowerCase();
  const status = asString(record.status).toLowerCase();
  return {
    id: asString(record.id),
    tenantId: asNullableString(record.tenant_id),
    provider: provider === 'd4sign' || provider === 'mercadopago' ? provider : 'asaas',
    eventId: asString(record.event_id),
    status:
      status === 'processing' ||
      status === 'processed' ||
      status === 'failed' ||
      status === 'not_reprocessable'
        ? status
        : 'queued',
    reason: sanitizeOperationalText(record.reason, '', 500),
    requestedBy: asNullableString(record.requested_by),
    errorMessage: asNullableString(sanitizeOperationalText(record.error_message, '', 500)),
    createdAt: asString(record.created_at),
    processedAt: asNullableString(record.processed_at),
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

function normalizeComplianceSeverity(value: unknown): PlatformComplianceGap['severity'] {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'critical' || normalized === 'high' || normalized === 'low') {
    return normalized;
  }
  return 'medium';
}

function normalizeComplianceStatus(value: unknown): PlatformComplianceGap['status'] {
  return asString(value).toLowerCase() === 'acknowledged' ? 'acknowledged' : 'open';
}

function mapPlatformComplianceGap(value: unknown): PlatformComplianceGap {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    tenantId: asString(record.tenantId),
    tenantName: sanitizeOperationalText(record.tenantName, 'Tenant', 160),
    code: asString(record.code),
    area: asString(record.area, 'operational'),
    severity: normalizeComplianceSeverity(record.severity),
    status: normalizeComplianceStatus(record.status),
    title: sanitizeOperationalText(record.title, 'Lacuna operacional', 180),
    description: sanitizeOperationalText(record.description, '', 320),
    remediation: sanitizeOperationalText(record.remediation, '', 320),
    ownerRole: asNullableString(record.ownerRole),
    detectedAt: asNullableString(record.detectedAt),
    updatedAt: asNullableString(record.updatedAt),
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

function mapTenantConfigSummary(value: unknown) {
  const record = asRecord(value);
  const integrationOperations = asRecord(record.integrationOperations);
  return {
    doctorsLimit: asNumber(record.doctorsLimit, 1),
    integrationOperations: {
      asaas: mapIntegrationOperationState(integrationOperations.asaas),
      mercadopago: mapIntegrationOperationState(integrationOperations.mercadopago),
      d4sign: mapIntegrationOperationState(integrationOperations.d4sign),
    },
  };
}

function mapIntegrationOperationState(value: unknown): AdminIntegrationOperationState {
  const record = asRecord(value);
  const state = asString(record.state);
  return {
    state:
      state === 'investigating' || state === 'resolved'
        ? state
        : ('normal' as AdminIntegrationOperationalState),
    updatedAt: asNullableString(record.updatedAt),
  };
}

function mapPlatformPlan(value: unknown): AdminPlatformPlan {
  const record = asRecord(value);
  const metadata = asRecord(record.metadata);
  return {
    id: asString(record.id),
    code: asString(record.code),
    name: asString(record.name, asString(record.code, 'Plano')),
    billingCycle: asString(record.billing_cycle, 'monthly'),
    amountCents: asNumber(record.amount_cents),
    currency: asString(record.currency, 'BRL'),
    active: asBoolean(record.active, true),
    features: asRecord(metadata.features),
    entitlements: normalizePlanEntitlements(metadata.entitlements),
  };
}

function mapTenantEntitlementsState(value: unknown): AdminTenantEntitlementsState | null {
  const record = asRecord(value);
  const tenantId = asString(record.tenantId);
  if (!tenantId) return null;
  const source =
    asString(record.source) === 'tenant_override' ? 'tenant_override' : 'plan_snapshot';

  return {
    tenantId,
    planCode: asString(record.planCode, 'starter'),
    source,
    isOutOfSync: asBoolean(record.isOutOfSync),
    currentEntitlements: normalizePlanEntitlements(record.currentEntitlements),
    planEntitlements: normalizePlanEntitlements(record.planEntitlements),
    syncedAt: asNullableString(record.syncedAt),
  };
}

function mapCreateTenantResult(value: unknown): CreateTenantResult | null {
  const record = asRecord(value);
  const tenantId = asString(record.tenantId);
  if (!tenantId) return null;

  const inviteDelivery = asString(record.ownerInviteDelivery);
  return {
    tenantId,
    tenantSlug: asString(record.tenantSlug),
    unitId: asString(record.unitId),
    ownerMembershipId: asString(record.ownerMembershipId),
    ownerInviteDelivery:
      inviteDelivery === 'supabase_invite_sent' || inviteDelivery === 'password_setup_sent'
        ? inviteDelivery
        : 'existing_auth_user',
    subscriptionStatus: asString(record.subscriptionStatus, 'trialing'),
    trialEndsAt: asNullableString(record.trialEndsAt),
  };
}

export async function listPlatformPlans(options?: { includeInactive?: boolean }): Promise<{
  data: AdminPlatformPlan[];
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    let query = supabase
      .from('platform_plans')
      .select('id,code,name,billing_cycle,amount_cents,currency,active,metadata')
      .order('amount_cents', { ascending: true });

    if (!options?.includeInactive) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;

    if (error) return { data: [], error: asServiceError(error, 'Falha ao carregar planos.') };

    return {
      data: asArray(data)
        .map(mapPlatformPlan)
        .filter((plan) => plan.id && plan.code),
      error: null,
    };
  } catch (error) {
    return { data: [], error: asServiceError(error, 'Falha ao carregar planos.') };
  }
}

export async function savePlatformPlan(input: SavePlatformPlanInput): Promise<{
  data: AdminPlatformPlan | null;
  error: SafeServiceError | null;
}> {
  const code = normalizeText(input.code, 80).toLowerCase();
  const name = normalizeText(input.name, 120);
  const currency = normalizeText(input.currency, 3).toUpperCase() || 'BRL';
  const reason = normalizeText(input.reason, 500);
  const amountReais = Number(input.amountReais);
  const amountCents = Math.round(amountReais * 100);
  const features = {
    doctorsLimit: Math.trunc(Number(input.features.doctorsLimit)),
  };
  const entitlementErrors = validatePlanEntitlementsInput(input.entitlements);

  if (!/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(code)) {
    return { data: null, error: { message: 'Codigo do plano invalido.' } };
  }
  if (name.length < 3) return { data: null, error: { message: 'Informe o nome do plano.' } };
  if (!['monthly', 'quarterly', 'yearly'].includes(input.billingCycle)) {
    return { data: null, error: { message: 'Ciclo de cobranca invalido.' } };
  }
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    return { data: null, error: { message: 'Valor do plano invalido.' } };
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { data: null, error: { message: 'Moeda invalida.' } };
  }
  if (!Number.isFinite(features.doctorsLimit) || features.doctorsLimit <= 0) {
    return { data: null, error: { message: 'Limite de medicos deve ser maior que zero.' } };
  }
  if (entitlementErrors.length > 0) {
    return { data: null, error: { message: entitlementErrors[0] } };
  }
  if (reason.length < 16) {
    return {
      data: null,
      error: { message: 'Informe um motivo auditavel com pelo menos 16 caracteres.' },
    };
  }

  try {
    const response = await fetch('/api/admin/platform-plans', {
      method: input.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: input.id,
        code,
        name,
        billingCycle: input.billingCycle,
        amountReais,
        currency,
        active: input.active,
        features,
        entitlements: normalizePlanEntitlements(input.entitlements),
        reason,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      data?: unknown;
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        data: null,
        error: {
          message: payload?.error?.message ?? 'Falha ao salvar plano.',
        },
      };
    }

    return { data: mapPlatformPlan(payload?.data), error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao salvar plano.') };
  }
}

export async function createTenant(input: CreateTenantInput): Promise<{
  data: CreateTenantResult | null;
  error: SafeServiceError | null;
}> {
  const clinicName = normalizeText(input.clinicName, 160);
  const slug = normalizeText(input.slug, 80).toLowerCase();
  const ownerName = normalizeText(input.ownerName, 160);
  const ownerEmail = normalizeText(input.ownerEmail, 254).toLowerCase();
  const reason = normalizeText(input.reason, 500);
  const planCode = normalizeText(input.planCode, 80).toLowerCase();
  const unitName = normalizeText(input.unitName, 120);
  const unitCode = normalizeText(input.unitCode ?? 'matriz', 80).toLowerCase();
  const professionalProfileResult = sanitizeProfessionalProfileInput(
    input.professionalProfile,
    'tenant_owner'
  );
  const professionalProfile = professionalProfileResult.profile;

  if (clinicName.length < 3) {
    const { error } = serviceValidationError('Informe o nome da clinica.');
    return { data: null, error };
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug)) {
    const { error } = serviceValidationError('Slug do tenant invalido.');
    return { data: null, error };
  }
  if (!ownerName) {
    const { error } = serviceValidationError('Informe o nome do owner.');
    return { data: null, error };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    const { error } = serviceValidationError('E-mail do owner invalido.');
    return { data: null, error };
  }
  if (!planCode) {
    const { error } = serviceValidationError('Selecione um plano ativo.');
    return { data: null, error };
  }
  if (!unitName) {
    const { error } = serviceValidationError('Informe a unidade padrao.');
    return { data: null, error };
  }
  if (reason.length < 16) {
    const { error } = serviceValidationError(
      'Informe um motivo auditavel com pelo menos 16 caracteres.'
    );
    return { data: null, error };
  }
  if (professionalProfileResult.error) {
    const { error } = serviceValidationError(professionalProfileResult.error);
    return { data: null, error };
  }

  try {
    const response = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinicName,
        slug,
        cnpj: normalizeText(input.cnpj ?? '', 32),
        phone: normalizeText(input.phone ?? '', 32),
        website: normalizeText(input.website ?? '', 160),
        ownerName,
        ownerEmail,
        reason,
        planCode,
        unitName,
        unitCode,
        city: normalizeText(input.city ?? '', 120),
        state: normalizeText(input.state ?? '', 2).toUpperCase(),
        professionalProfile,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      data?: unknown;
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        data: null,
        error: {
          message: payload?.error?.message ?? 'Falha ao criar tenant.',
        } satisfies SafeServiceError,
      };
    }

    const result = mapCreateTenantResult(payload?.data);
    if (!result) {
      return {
        data: null,
        error: { message: 'Resposta invalida ao criar tenant.' } satisfies SafeServiceError,
      };
    }

    return { data: result, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao criar tenant.') };
  }
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

export async function updatePlatformTenantConfig(input: UpdateTenantConfigInput) {
  const tenantId = input.tenantId.trim();
  const reason = normalizeText(input.reason, 500);

  if (!isUuid(tenantId)) return serviceValidationError('Tenant invalido.');
  if (reason.length < 16) {
    return serviceValidationError('Informe um motivo auditavel com pelo menos 16 caracteres.');
  }

  try {
    const response = await fetch(`/api/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: input.status,
        planCode: input.planCode ? normalizeText(input.planCode, 80).toLowerCase() : undefined,
        usage: input.usage,
        featureFlags: input.featureFlags,
        reason,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        error: {
          message: payload?.error?.message ?? 'Falha ao atualizar tenant.',
        } satisfies SafeServiceError,
      };
    }

    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao atualizar tenant.') };
  }
}

export async function getPlatformTenantConfig(tenantId: string): Promise<{
  data: {
    doctorsLimit: number;
    integrationOperations: Record<AdminIntegrationProvider, AdminIntegrationOperationState>;
  } | null;
  error: SafeServiceError | null;
}> {
  const normalizedTenantId = tenantId.trim();
  if (!isUuid(normalizedTenantId)) return { data: null, error: { message: 'Tenant invalido.' } };

  try {
    const response = await fetch(`/api/admin/tenants/${normalizedTenantId}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const payload = (await response.json().catch(() => null)) as {
      data?: unknown;
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        data: null,
        error: {
          message: payload?.error?.message ?? 'Falha ao carregar configuracao do tenant.',
        },
      };
    }

    return { data: mapTenantConfigSummary(payload?.data), error: null };
  } catch (error) {
    return {
      data: null,
      error: asServiceError(error, 'Falha ao carregar configuracao do tenant.'),
    };
  }
}

export async function getTenantEntitlements(tenantId: string): Promise<{
  data: AdminTenantEntitlementsState | null;
  error: SafeServiceError | null;
}> {
  const normalizedTenantId = tenantId.trim();
  if (!isUuid(normalizedTenantId)) {
    return { data: null, error: { message: 'Tenant invalido.' } };
  }

  try {
    const response = await fetch(`/api/admin/tenants/${normalizedTenantId}/entitlements`);
    const payload = (await response.json().catch(() => null)) as {
      data?: unknown;
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        data: null,
        error: {
          message: payload?.error?.message ?? 'Falha ao carregar modulos do tenant.',
        },
      };
    }

    const mapped = mapTenantEntitlementsState(payload?.data);
    if (!mapped) {
      return { data: null, error: { message: 'Resposta invalida dos modulos do tenant.' } };
    }

    return { data: mapped, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao carregar modulos do tenant.') };
  }
}

export async function saveTenantEntitlements(input: SaveTenantEntitlementsInput): Promise<{
  data: AdminTenantEntitlementsState | null;
  error: SafeServiceError | null;
}> {
  const tenantId = input.tenantId.trim();
  const reason = normalizeText(input.reason, 500);
  if (!isUuid(tenantId)) return { data: null, error: { message: 'Tenant invalido.' } };
  if (reason.length < 16) {
    return {
      data: null,
      error: { message: 'Informe um motivo auditavel com pelo menos 16 caracteres.' },
    };
  }

  const entitlementErrors = validatePlanEntitlementsInput(input.entitlements);
  if (entitlementErrors.length > 0) {
    return { data: null, error: { message: entitlementErrors[0] } };
  }

  try {
    const response = await fetch(`/api/admin/tenants/${tenantId}/entitlements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason,
        entitlements: input.entitlements
          ? normalizePlanEntitlements(input.entitlements)
          : undefined,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      data?: unknown;
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        data: null,
        error: {
          message: payload?.error?.message ?? 'Falha ao salvar modulos do tenant.',
        },
      };
    }

    return { data: mapTenantEntitlementsState(payload?.data), error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao salvar modulos do tenant.') };
  }
}

export async function upsertPlatformTenantUnit(input: UpsertTenantUnitInput) {
  const tenantId = input.tenantId.trim();
  const unitId = input.unitId?.trim() || null;
  const name = normalizeText(input.name, 120);
  const code = normalizeText(input.code ?? '', 80);
  const reason = normalizeText(input.reason, 500);

  if (!isUuid(tenantId)) return serviceValidationError('Tenant invalido.');
  if (unitId && !isUuid(unitId)) return serviceValidationError('Unidade invalida.');
  if (!name) return serviceValidationError('Informe o nome da unidade.');
  if (reason.length < 16) {
    return serviceValidationError('Informe um motivo auditavel com pelo menos 16 caracteres.');
  }

  try {
    const response = await fetch(`/api/admin/tenants/${tenantId}/units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unitId,
        name,
        code,
        city: normalizeText(input.city ?? '', 120),
        state: normalizeText(input.state ?? '', 2).toUpperCase(),
        status: input.status,
        reason,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        error: {
          message: payload?.error?.message ?? 'Falha ao salvar unidade.',
        } satisfies SafeServiceError,
      };
    }

    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao salvar unidade.') };
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

    const detail = mapTenantDetail(data);
    const configResult = await getPlatformTenantConfig(tenantId);
    if (configResult.data) {
      detail.tenant.doctorsLimit = configResult.data.doctorsLimit;
      detail.tenant.integrationOperations = configResult.data.integrationOperations;
    }

    return { data: detail, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao carregar tenant.') };
  }
}

export async function updatePlatformTenantIntegrationState(input: {
  tenantId: string;
  provider: AdminIntegrationProvider;
  state: AdminIntegrationOperationalState;
  reason: string;
}): Promise<{
  data: {
    provider: AdminIntegrationProvider;
    state: AdminIntegrationOperationalState;
    updatedAt: string;
  } | null;
  error: SafeServiceError | null;
}> {
  const tenantId = input.tenantId.trim();
  const reason = normalizeText(input.reason, 500);
  const provider =
    input.provider === 'mercadopago'
      ? 'mercadopago'
      : input.provider === 'asaas'
        ? 'asaas'
        : 'd4sign';
  const state =
    input.state === 'investigating' || input.state === 'resolved' ? input.state : 'normal';

  if (!isUuid(tenantId)) return { data: null, error: { message: 'Tenant invalido.' } };
  if (reason.length < 16) {
    return {
      data: null,
      error: { message: 'Informe um motivo auditavel com pelo menos 16 caracteres.' },
    };
  }

  try {
    const response = await fetch(`/api/admin/tenants/${tenantId}/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, state, reason }),
    });
    const payload = (await response.json().catch(() => null)) as {
      data?: unknown;
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        data: null,
        error: {
          message: payload?.error?.message ?? 'Falha ao atualizar integracao local.',
        },
      };
    }

    const record = asRecord(payload?.data);
    return {
      data: {
        provider,
        state,
        updatedAt: asString(record.updatedAt),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao atualizar integracao local.') };
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

export async function listTenantWebhookSummaries(
  tenantId: string,
  limit = 100
): Promise<{
  data: AdminWebhookEventSummary[];
  error: SafeServiceError | null;
}> {
  const normalizedTenantId = tenantId.trim();
  if (!isUuid(normalizedTenantId)) return { data: [], error: { message: 'Tenant invalido.' } };

  try {
    const response = await fetch(
      `/api/admin/tenants/${normalizedTenantId}/webhooks?limit=${Math.trunc(limit)}`
    );
    const payload = (await response.json().catch(() => null)) as {
      data?: unknown;
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        data: [],
        error: {
          message: payload?.error?.message ?? 'Falha ao carregar webhooks do tenant.',
        },
      };
    }

    return { data: asArray(payload?.data).map(mapWebhook), error: null };
  } catch (error) {
    return { data: [], error: asServiceError(error, 'Falha ao carregar webhooks do tenant.') };
  }
}

export async function listWebhookReprocessJobs(limit = 100): Promise<{
  data: AdminWebhookReprocessJob[];
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('webhook_reprocess_jobs')
      .select(
        'id,tenant_id,provider,event_id,status,reason,requested_by,error_message,created_at,processed_at'
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return {
        data: [],
        error: asServiceError(error, 'Falha ao carregar jobs de reprocesso.'),
      };
    }

    return { data: asArray(data).map(mapWebhookReprocessJob), error: null };
  } catch (error) {
    return { data: [], error: asServiceError(error, 'Falha ao carregar jobs de reprocesso.') };
  }
}

export async function listOperationalJobs(limit = 100): Promise<{
  data: AdminOperationalJobSummary[];
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('list_platform_operational_jobs', {
      p_limit: limit,
    });

    if (error) {
      return { data: [], error: asServiceError(error, 'Falha ao carregar jobs operacionais.') };
    }

    return {
      data: asArray(data)
        .map(mapOperationalJob)
        .filter((job) => job.jobKey),
      error: null,
    };
  } catch (error) {
    return { data: [], error: asServiceError(error, 'Falha ao carregar jobs operacionais.') };
  }
}

export async function listPlatformComplianceGaps(limit = 100): Promise<{
  data: PlatformComplianceGap[];
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('list_platform_compliance_gaps', {
      p_limit: limit,
    });

    if (error) {
      return { data: [], error: asServiceError(error, 'Falha ao carregar compliance.') };
    }

    return {
      data: asArray(data)
        .map(mapPlatformComplianceGap)
        .filter((gap) => gap.id && gap.tenantId),
      error: null,
    };
  } catch (error) {
    return { data: [], error: asServiceError(error, 'Falha ao carregar compliance.') };
  }
}

export async function getPlatformAdminSnapshot(): Promise<{
  data: PlatformAdminSnapshot | null;
  error: SafeServiceError | null;
}> {
  const [tenantsResult, webhooksResult, complianceResult, reprocessJobsResult] = await Promise.all([
    listTenants(),
    listWebhookSummaries(25),
    listPlatformComplianceGaps(60),
    listWebhookReprocessJobs(50),
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
  if (complianceResult.error) {
    warnings.push('Lacunas de compliance indisponiveis no snapshot administrativo.');
  }
  if (reprocessJobsResult.error) {
    warnings.push('Jobs de reprocesso indisponiveis no snapshot administrativo.');
  }

  const tenantDetails = detailResults.flatMap(({ result }) => (result.data ? [result.data] : []));

  const privilegedRoles = new Set(['tenant_owner', 'clinic_admin']);

  const audit = tenantDetails
    .flatMap((detail) =>
      detail.auditLogs.map((entry) => ({
        ...entry,
        tenantId: detail.tenant.id,
        tenantName: detail.tenant.clinicName,
      }))
    )
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

  const breakGlass = tenantDetails
    .flatMap((detail) =>
      detail.breakGlassRequests.map((request) => ({
        ...request,
        tenantId: detail.tenant.id,
        tenantName: detail.tenant.clinicName,
      }))
    )
    .filter((request) => request.id && request.requestedAt)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .slice(0, 30);

  const privilegedUsers = tenantDetails
    .flatMap((detail) =>
      detail.users
        .filter((user) => privilegedRoles.has(user.role))
        .map((user) => ({
          ...user,
          tenantId: detail.tenant.id,
          tenantName: detail.tenant.clinicName,
        }))
    )
    .sort((a, b) =>
      (b.lastLogin ?? b.createdAt ?? '').localeCompare(a.lastLogin ?? a.createdAt ?? '')
    )
    .slice(0, 40);

  return {
    data: {
      tenants: tenantsResult.data,
      webhooks: webhooksResult.data,
      audit,
      support,
      breakGlass,
      privilegedUsers,
      reprocessJobs: reprocessJobsResult.data,
      complianceGaps: complianceResult.data,
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
  professionalProfile?: ProfessionalProfileInput | null;
}) {
  const tenantId = input.tenantId.trim();
  const email = normalizeText(input.email, 254).toLowerCase();
  const fullName = normalizeText(input.fullName ?? '', 160);
  const roleCode = normalizeText(input.roleCode, 80);
  const unitId = input.unitId ? input.unitId.trim() : null;
  const reason = normalizeText(input.reason, 500);
  const professionalProfileResult = sanitizeProfessionalProfileInput(
    input.professionalProfile,
    roleCode
  );
  const professionalProfile = professionalProfileResult.profile;

  if (!isUuid(tenantId)) return serviceValidationError('Tenant invalido.');
  if (unitId && !isUuid(unitId)) return serviceValidationError('Unidade invalida.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return serviceValidationError('E-mail invalido.');
  }
  if (reason.length < 16) {
    return serviceValidationError('Informe um motivo auditavel com pelo menos 16 caracteres.');
  }
  if (professionalProfileResult.error) {
    return serviceValidationError(professionalProfileResult.error);
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
        professionalProfile,
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

export async function resendPlatformTenantInvite(input: {
  tenantId: string;
  membershipId: string;
  reason: string;
}): Promise<{
  data: {
    membershipId: string;
    status: 'invited';
    lastInviteSentAt: string;
    emailRedacted: string;
  } | null;
  error: SafeServiceError | null;
}> {
  const tenantId = input.tenantId.trim();
  const membershipId = input.membershipId.trim();
  const reason = normalizeText(input.reason, 500);

  if (!isUuid(tenantId)) return { data: null, error: { message: 'Tenant invalido.' } };
  if (!isUuid(membershipId)) return { data: null, error: { message: 'Vinculo invalido.' } };
  if (reason.length < 16) {
    return {
      data: null,
      error: { message: 'Informe um motivo auditavel com pelo menos 16 caracteres.' },
    };
  }

  try {
    const response = await fetch(
      `/api/admin/tenants/${tenantId}/invitations/${membershipId}/resend`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }
    );

    const payload = (await response.json().catch(() => null)) as {
      data?: unknown;
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        data: null,
        error: {
          message: payload?.error?.message ?? 'Falha ao reenviar convite.',
        },
      };
    }

    const record = asRecord(payload?.data);
    return {
      data: {
        membershipId: asString(record.membershipId),
        status: 'invited',
        lastInviteSentAt: asString(record.lastInviteSentAt),
        emailRedacted: asString(record.emailRedacted),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao reenviar convite.') };
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
    const response = await fetch(`/api/admin/tenants/${tenantId}/memberships/${membershipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roleCode: input.roleCode ? normalizeText(input.roleCode, 80) : null,
        status: input.status ? normalizeText(input.status, 40) : null,
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
          message: payload?.error?.message ?? 'Falha ao atualizar usuario do tenant.',
        } satisfies SafeServiceError,
      };
    }

    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao atualizar usuario do tenant.') };
  }
}

export async function updatePlatformTenantProfessionalProfile(input: {
  membershipId: string;
  professionalProfile: ProfessionalProfileInput;
  reason?: string;
}) {
  const membershipId = input.membershipId.trim();
  const professionalType = input.professionalProfile.professionalType;
  const licenseNumber = normalizeText(input.professionalProfile.licenseNumber ?? '', 80);
  const licenseState = normalizeText(input.professionalProfile.licenseState ?? '', 2).toUpperCase();
  const specialty = normalizeText(input.professionalProfile.specialty ?? '', 160);
  const reason = normalizeText(input.reason ?? '', 500);

  if (!isUuid(membershipId)) return serviceValidationError('Vinculo invalido.');
  if (input.professionalProfile.enabled && professionalType === 'physician') {
    if (!licenseNumber) return serviceValidationError('Informe o CRM/registro do medico.');
    if (!licenseState || licenseState.length !== 2) {
      return serviceValidationError('Informe a UF do CRM/registro do medico.');
    }
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('upsert_tenant_professional_profile', {
      p_membership_id: membershipId,
      p_professional_type: professionalType,
      p_license_number: licenseNumber || null,
      p_license_state: licenseState || null,
      p_specialty: specialty || null,
      p_is_active: input.professionalProfile.enabled,
      p_reason: reason || null,
    });

    if (error) {
      return {
        error: asServiceError(error, 'Falha ao atualizar perfil profissional.'),
      };
    }

    return { error: null as SafeServiceError | null };
  } catch (error) {
    return { error: asServiceError(error, 'Falha ao atualizar perfil profissional.') };
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

export async function requestWebhookReprocess(input: {
  provider: AdminWebhookEventSummary['provider'] | AdminIntegrationProvider;
  eventId: string;
  reason: string;
  scope: string;
}) {
  const eventId = input.eventId.trim();
  const reason = normalizeText(input.reason, 500);
  const scope = normalizeText(input.scope, 240);
  const providerInput = input.provider.toLowerCase();
  const provider =
    providerInput === 'mercadopago' || providerInput === 'mercado pago'
      ? 'mercadopago'
      : providerInput === 'asaas'
        ? 'asaas'
        : 'd4sign';

  if (!isUuid(eventId)) {
    return {
      data: null,
      error: { message: 'Evento de webhook invalido.' } satisfies SafeServiceError,
    };
  }
  if (reason.length < 12) {
    return {
      data: null,
      error: {
        message: 'Informe um motivo auditavel com pelo menos 12 caracteres.',
      } satisfies SafeServiceError,
    };
  }
  if (scope.length < 8) {
    return {
      data: null,
      error: {
        message: 'Informe um escopo operacional com pelo menos 8 caracteres.',
      } satisfies SafeServiceError,
    };
  }

  try {
    const response = await fetch('/api/admin/webhooks/reprocess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        eventId,
        reason,
        scope,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      data?: unknown;
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        data: null,
        error: {
          message: payload?.error?.message ?? 'Falha ao solicitar reprocesso.',
        } satisfies SafeServiceError,
      };
    }

    const record = asRecord(payload?.data);
    return {
      data: {
        id: asString(record.id),
        status: asString(record.status, 'queued'),
      },
      error: null as SafeServiceError | null,
    };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Falha ao solicitar reprocesso.') };
  }
}
