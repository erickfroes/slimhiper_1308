import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { SafeServiceError } from '@/services/billingApi';

export type ClinicUnitStatus = 'active' | 'inactive' | 'archived';
export type ProfessionalType =
  | 'physician'
  | 'nutritionist'
  | 'fitness_professional'
  | 'external_professional';

export interface ClinicSettingsTenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ClinicProfileSettings {
  cnpj: string;
  email: string;
  phone: string;
  website: string;
  timezone: string;
  specialties: string;
  logoUrl: string;
}

export interface ClinicBrandingSettings {
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
}

export interface ClinicPortalSettings {
  url: string;
  selfScheduling: boolean;
  allowPatientProfessionalChoice: boolean;
  allowAvulsoScheduling: boolean;
  requireAvulsoPaymentBeforeConfirmation: boolean;
  releaseProgramCreditOnPatientCancellation: boolean;
  consumeProgramCreditOnNoShow: boolean;
  blockSchedulingWithFinancialPending: boolean;
  guardianFinancialAccess: boolean;
  guardianEvolutionAccess: boolean;
  chatEnabled: boolean;
  documentsAccess: boolean;
  financialAccess: boolean;
  checkInReminder: boolean;
  npsEnabled: boolean;
}

export interface ClinicFinanceSettings {
  currency: string;
  defaultDueDay: number;
  lateFeePercent: number;
  monthlyInterestPercent: number;
  pixKey: string;
  autoInvoice: boolean;
  delinquencyAlerts: boolean;
  emailReceipts: boolean;
}

export interface ClinicLegalSettings {
  privacyPolicyUrl: string;
  termsUrl: string;
  consentFormVersion: string;
  dpoEmail: string;
  lgpdRequestEmail: string;
  dataRetentionYears: number;
  requirePatientConsent: boolean;
}

export interface ClinicPrivacyPolicy {
  id?: string;
  version?: number;
  status?: 'draft' | 'published' | 'superseded';
  dpoEmail: string;
  consentVersion: string;
  requestSlaDays: number;
  alertLeadDays: number;
  automationEnabled: boolean;
  allowNonclinicalAnonymization: boolean;
  retentionRules: Record<string, string>;
  optionalConsents: Record<string, { version?: string; enabled?: boolean }>;
  approvedOperators: string[];
  publishedAt?: string | null;
}

export interface ClinicPrivacyAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  status: string;
  dueAt: string | null;
  createdAt: string | null;
}
export interface ClinicPrivacyRequest {
  id: string;
  type: string;
  status: string;
  dueAt: string | null;
  assignedTo: string | null;
  createdAt: string | null;
}
export interface ClinicPrivacyGovernance {
  policy: ClinicPrivacyPolicy | null;
  alerts: ClinicPrivacyAlert[];
  requests: ClinicPrivacyRequest[];
}

export interface ClinicChatServiceHour {
  id?: string;
  weekday: number;
  opensAt: string;
  closesAt: string;
  timezone: string;
  autoReply: string;
  isEnabled: boolean;
  updatedAt: string | null;
}

export type AutoMessageChannel = 'chat' | 'portal' | 'email' | 'whatsapp' | 'sms';

export interface AutoMessageTemplate {
  id: string;
  code: string;
  name: string;
  channel: AutoMessageChannel;
  triggerEvent: string;
  body: string;
  isEnabled: boolean;
  sortOrder: number;
  updatedAt: string | null;
}

export type ComplianceGapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ComplianceGapStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export interface ComplianceGap {
  id: string;
  code: string;
  area: string;
  severity: ComplianceGapSeverity;
  status: ComplianceGapStatus;
  title: string;
  description: string;
  remediation: string;
  ownerRole: string | null;
  dueAt: string | null;
  detectedAt: string | null;
  resolvedAt: string | null;
  updatedAt: string | null;
}

export interface ComplianceSummary {
  open: number;
  acknowledged: number;
  resolved: number;
  criticalOpen: number;
  lastEvaluatedAt: string | null;
}

export interface ClinicUnit {
  id: string;
  code: string;
  name: string;
  status: ClinicUnitStatus;
  address: string;
  city: string;
  phone: string;
  isMain: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TeamMember {
  id: string;
  userId: string;
  tenantId: string;
  unitId: string | null;
  unitName: string | null;
  fullName: string;
  email: string;
  roleCode: string;
  status: string;
  isActive: boolean;
  initials: string;
  phone: string;
  avatarUrl: string | null;
  avatarPath: string | null;
  privateProfile: UserPrivateProfile;
  professionalProfile: ProfessionalProfile | null;
  createdAt: string | null;
}

export interface ProfessionalProfile {
  id: string;
  professionalType: ProfessionalType;
  licenseNumber: string;
  licenseState: string;
  specialty: string;
  isActive: boolean;
  countsAsDoctor: boolean;
  professionalAddress: ProfessionalAddress;
  attendanceUnitIds: string[];
  signatureFooter: string;
  publicProfile: ProfessionalPublicProfile;
}

export interface UserPrivateProfile {
  personalAddress: ProfessionalAddress;
  emergencyContact: string;
  privateNotes: string;
}

export interface ProfessionalAddress {
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  country: string;
}

export interface ProfessionalPublicProfile {
  bio: string;
  displayPhone: string;
}

export interface ProfessionalProfileInput {
  enabled: boolean;
  professionalType: ProfessionalType;
  licenseNumber?: string;
  licenseState?: string;
  specialty?: string;
  reason?: string;
}

export interface TeamMemberPersonalProfileInput {
  phone: string;
  avatarFile?: File | null;
  privateProfile: UserPrivateProfile;
  professionalAddress: ProfessionalAddress;
  attendanceUnitIds: string[];
  signatureFooter: string;
  publicProfile: ProfessionalPublicProfile;
  reason?: string;
}

export interface ClinicRole {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  membersCount: number;
}

export interface ClinicPermission {
  id: string;
  code: string;
  description: string;
}

export interface ClinicRolePermission {
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface ClinicFeatureFlag {
  key: string;
  enabled: boolean;
}

export interface ClinicIntegration {
  id: string;
  name: string;
  category: string;
  description: string;
  enabled: boolean;
  status: 'enabled' | 'disabled' | 'not_configured';
}

export interface ClinicProgramOption {
  id: string;
  name: string;
  status: string;
  programType: string;
  durationWeeks: number;
}

export interface ClinicSettingsSnapshot {
  tenant: ClinicSettingsTenant;
  profile: ClinicProfileSettings;
  branding: ClinicBrandingSettings;
  portal: ClinicPortalSettings;
  finance: ClinicFinanceSettings;
  legal: ClinicLegalSettings;
  chatServiceHours: ClinicChatServiceHour[];
  autoMessageTemplates: AutoMessageTemplate[];
  complianceGaps: ComplianceGap[];
  complianceSummary: ComplianceSummary;
  units: ClinicUnit[];
  team: TeamMember[];
  roles: ClinicRole[];
  permissions: ClinicPermission[];
  rolePermissions: ClinicRolePermission[];
  featureFlags: ClinicFeatureFlag[];
  integrations: ClinicIntegration[];
  programs: ClinicProgramOption[];
  defaultProgramIds: string[];
}

export type ClinicSettingsPatch = Partial<{
  profile: ClinicProfileSettings;
  branding: ClinicBrandingSettings;
  portal: ClinicPortalSettings;
  finance: ClinicFinanceSettings;
  legal: ClinicLegalSettings;
  defaultPrograms: { programIds: string[] };
  integrations: Record<string, { enabled: boolean; status?: string }>;
}>;

export interface SaveClinicUnitInput {
  id?: string;
  code: string;
  name: string;
  status: ClinicUnitStatus;
  address: string;
  city: string;
  phone: string;
  isMain: boolean;
}

export interface SaveAutoMessageTemplateInput {
  id?: string;
  code?: string;
  name: string;
  channel: AutoMessageChannel;
  triggerEvent: string;
  body: string;
  isEnabled: boolean;
  sortOrder: number;
}

const DEFAULT_PROFILE: ClinicProfileSettings = {
  cnpj: '',
  email: '',
  phone: '',
  website: '',
  timezone: 'America/Sao_Paulo',
  specialties: '',
  logoUrl: '',
};

const DEFAULT_BRANDING: ClinicBrandingSettings = {
  primaryColor: '#0d9488',
  accentColor: '#059669',
  fontFamily: 'Plus Jakarta Sans',
};

const DEFAULT_FINANCE: ClinicFinanceSettings = {
  currency: 'BRL',
  defaultDueDay: 10,
  lateFeePercent: 2,
  monthlyInterestPercent: 1,
  pixKey: '',
  autoInvoice: false,
  delinquencyAlerts: true,
  emailReceipts: true,
};

const DEFAULT_LEGAL: ClinicLegalSettings = {
  privacyPolicyUrl: '',
  termsUrl: '',
  consentFormVersion: '',
  dpoEmail: '',
  lgpdRequestEmail: '',
  dataRetentionYears: 6,
  requirePatientConsent: true,
};

const DEFAULT_COMPLIANCE_SUMMARY: ComplianceSummary = {
  open: 0,
  acknowledged: 0,
  resolved: 0,
  criticalOpen: 0,
  lastEvaluatedAt: null,
};

const DEFAULT_CHAT_HOURS: ClinicChatServiceHour[] = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  opensAt: '08:00',
  closesAt: '18:00',
  timezone: 'America/Sao_Paulo',
  autoReply:
    'Estamos fora do horario de atendimento. Sua mensagem fica registrada e sera respondida no proximo periodo util.',
  isEnabled: weekday >= 1 && weekday <= 5,
  updatedAt: null,
}));

const INTEGRATION_DEFINITIONS = [
  {
    id: 'asaas',
    name: 'Asaas',
    category: 'Financeiro',
    description: 'Cobrancas, assinaturas e conciliacao por Edge Functions.',
  },
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    category: 'Financeiro',
    description: 'Checkout Pro por conta OAuth conectada ao tenant.',
  },
  {
    id: 'd4sign',
    name: 'D4Sign',
    category: 'Documentos',
    description: 'Envio de documentos e webhook por Edge Functions.',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'Comunicacao',
    description: 'Preferencia operacional para notificacoes e mensagens.',
  },
  {
    id: 'google_calendar',
    name: 'Google Agenda',
    category: 'Agenda',
    description: 'Preferencia operacional para sincronizacao de agenda.',
  },
] as const;

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

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asInteger(value: unknown, fallback = 0): number {
  const numeric = asNumber(value, fallback);
  return Number.isInteger(numeric) ? numeric : Math.round(numeric);
}

function asServiceError(error: unknown, fallback: string): SafeServiceError {
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; code?: unknown; details?: unknown };
    return {
      message: asString(record.message, fallback),
      code: typeof record.code === 'string' ? record.code : undefined,
      details: typeof record.details === 'string' ? record.details : undefined,
    };
  }
  return { message: fallback };
}

function normalizeText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readTenantId(value: unknown) {
  const record = asRecord(value);
  const tenant = asRecord(record.tenant);
  return (
    asString(tenant.id) ||
    asString(tenant.tenantId) ||
    asString(tenant.tenant_id) ||
    asString(record.tenantId) ||
    asString(record.tenant_id)
  );
}

function readSessionTenantId(value: unknown) {
  const record = asRecord(value);
  const activeTenant = asRecord(record.activeTenant);
  const activeTenantMembership = asRecord(record.activeTenantMembership);
  const activeTenantId =
    asString(activeTenant.id) ||
    asString(record.activeTenantId) ||
    asString(record.active_tenant_id) ||
    asString(activeTenantMembership.tenantId) ||
    asString(activeTenantMembership.tenant_id);
  if (isUuid(activeTenantId)) return activeTenantId;

  const activeMembership = asArray(record.tenantMemberships)
    .map(asRecord)
    .find((membership) => asString(membership.status).toLowerCase() === 'active');
  return (
    asString(activeMembership?.tenantId) ||
    asString(activeMembership?.tenant_id) ||
    asString(asRecord(activeMembership?.tenant).id)
  );
}

async function resolveClinicTenantId(inputTenantId: string) {
  const normalizedTenantId = inputTenantId.trim();
  if (isUuid(normalizedTenantId)) {
    return { tenantId: normalizedTenantId, error: null as SafeServiceError | null };
  }

  let lastError: SafeServiceError | null = null;

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_clinic_settings_snapshot');
    if (error) {
      lastError = asServiceError(error, 'Nao foi possivel identificar a clinica atual.');
    } else {
      const tenantId = readTenantId(data);
      if (isUuid(tenantId)) return { tenantId, error: null as SafeServiceError | null };
    }

    const sessionResponse = await fetch('/api/auth/app-session', {
      headers: { Accept: 'application/json' },
    });
    const sessionPayload = (await sessionResponse.json().catch(() => null)) as unknown;
    if (sessionResponse.ok) {
      const tenantId = readSessionTenantId(sessionPayload);
      if (isUuid(tenantId)) return { tenantId, error: null as SafeServiceError | null };
    } else {
      lastError = {
        message: asString(
          asRecord(asRecord(sessionPayload).error).message,
          'Nao foi possivel identificar a sessao atual.'
        ),
      };
    }

    const profileResult = await supabase.rpc('get_current_user_profile');
    if (profileResult.error) {
      lastError = asServiceError(
        profileResult.error,
        'Nao foi possivel identificar o perfil atual.'
      );
    } else {
      const tenantId = readSessionTenantId(profileResult.data);
      if (isUuid(tenantId)) return { tenantId, error: null as SafeServiceError | null };
    }
  } catch (error) {
    lastError = asServiceError(error, 'Nao foi possivel identificar a clinica atual.');
  }

  return {
    tenantId: '',
    error: {
      message:
        lastError?.message ||
        'Nao foi possivel identificar a clinica atual. Recarregue a pagina e tente novamente.',
      code: lastError?.code,
      details: lastError?.details,
    },
  };
}

function initialsFrom(name: string, email: string) {
  const source = name.trim() || email.split('@')[0] || 'U';
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function mapAddress(value: unknown): ProfessionalAddress {
  const record = asRecord(value);
  return {
    zipCode: asString(record.zipCode),
    street: asString(record.street),
    number: asString(record.number),
    complement: asString(record.complement),
    district: asString(record.district),
    city: asString(record.city),
    state: asString(record.state),
    country: asString(record.country, 'Brasil'),
  };
}

function mapPrivateProfile(value: unknown): UserPrivateProfile {
  const record = asRecord(value);
  return {
    personalAddress: mapAddress(record.personalAddress),
    emergencyContact: asString(record.emergencyContact),
    privateNotes: asString(record.privateNotes),
  };
}

function mapPublicProfile(value: unknown): ProfessionalPublicProfile {
  const record = asRecord(value);
  return {
    bio: asString(record.bio),
    displayPhone: asString(record.displayPhone),
  };
}

function normalizeUnitStatus(value: unknown): ClinicUnitStatus {
  if (value === 'inactive' || value === 'archived') return value;
  return 'active';
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

function mapSettings(rawSettings: Record<string, unknown>, tenant: ClinicSettingsTenant) {
  const profileRecord = asRecord(rawSettings.profile);
  const brandingRecord = asRecord(rawSettings.branding);
  const portalRecord = asRecord(rawSettings.portal);
  const financeRecord = asRecord(rawSettings.finance);
  const legalRecord = asRecord(rawSettings.legal);
  const defaultProgramsRecord = asRecord(rawSettings.defaultPrograms);

  const profile: ClinicProfileSettings = {
    cnpj: asString(profileRecord.cnpj),
    email: asString(profileRecord.email),
    phone: asString(profileRecord.phone),
    website: asString(profileRecord.website),
    timezone: asString(profileRecord.timezone, DEFAULT_PROFILE.timezone),
    specialties: asString(profileRecord.specialties),
    logoUrl: asString(profileRecord.logoUrl),
  };

  const branding: ClinicBrandingSettings = {
    primaryColor: asString(brandingRecord.primaryColor, DEFAULT_BRANDING.primaryColor),
    accentColor: asString(brandingRecord.accentColor, DEFAULT_BRANDING.accentColor),
    fontFamily: asString(brandingRecord.fontFamily, DEFAULT_BRANDING.fontFamily),
  };

  const portal: ClinicPortalSettings = {
    url: asString(portalRecord.url, tenant.slug ? `/patient/${tenant.slug}` : ''),
    selfScheduling: asBoolean(portalRecord.selfScheduling),
    allowPatientProfessionalChoice: asBoolean(portalRecord.allowPatientProfessionalChoice),
    allowAvulsoScheduling: asBoolean(portalRecord.allowAvulsoScheduling),
    requireAvulsoPaymentBeforeConfirmation: asBoolean(
      portalRecord.requireAvulsoPaymentBeforeConfirmation
    ),
    releaseProgramCreditOnPatientCancellation: asBoolean(
      portalRecord.releaseProgramCreditOnPatientCancellation,
      true
    ),
    consumeProgramCreditOnNoShow: asBoolean(portalRecord.consumeProgramCreditOnNoShow),
    blockSchedulingWithFinancialPending: asBoolean(
      portalRecord.blockSchedulingWithFinancialPending
    ),
    guardianFinancialAccess: asBoolean(portalRecord.guardianFinancialAccess),
    guardianEvolutionAccess: asBoolean(portalRecord.guardianEvolutionAccess),
    chatEnabled: asBoolean(portalRecord.chatEnabled),
    documentsAccess: asBoolean(portalRecord.documentsAccess),
    financialAccess: asBoolean(portalRecord.financialAccess),
    checkInReminder: asBoolean(portalRecord.checkInReminder),
    npsEnabled: asBoolean(portalRecord.npsEnabled),
  };

  const finance: ClinicFinanceSettings = {
    currency: asString(financeRecord.currency, DEFAULT_FINANCE.currency),
    defaultDueDay: asInteger(financeRecord.defaultDueDay, DEFAULT_FINANCE.defaultDueDay),
    lateFeePercent: asNumber(financeRecord.lateFeePercent, DEFAULT_FINANCE.lateFeePercent),
    monthlyInterestPercent: asNumber(
      financeRecord.monthlyInterestPercent,
      DEFAULT_FINANCE.monthlyInterestPercent
    ),
    pixKey: asString(financeRecord.pixKey),
    autoInvoice: asBoolean(financeRecord.autoInvoice),
    delinquencyAlerts: asBoolean(
      financeRecord.delinquencyAlerts,
      DEFAULT_FINANCE.delinquencyAlerts
    ),
    emailReceipts: asBoolean(financeRecord.emailReceipts, DEFAULT_FINANCE.emailReceipts),
  };

  const legal: ClinicLegalSettings = {
    privacyPolicyUrl: asString(legalRecord.privacyPolicyUrl),
    termsUrl: asString(legalRecord.termsUrl),
    consentFormVersion: asString(legalRecord.consentFormVersion),
    dpoEmail: asString(legalRecord.dpoEmail),
    lgpdRequestEmail: asString(legalRecord.lgpdRequestEmail),
    dataRetentionYears: Math.max(
      1,
      Math.min(20, asInteger(legalRecord.dataRetentionYears, DEFAULT_LEGAL.dataRetentionYears))
    ),
    requirePatientConsent: asBoolean(
      legalRecord.requirePatientConsent,
      DEFAULT_LEGAL.requirePatientConsent
    ),
  };

  const defaultProgramIds = asArray(defaultProgramsRecord.programIds)
    .map((id) => asString(id))
    .filter(Boolean);

  return { profile, branding, portal, finance, legal, defaultProgramIds };
}

function mapUnit(value: unknown): ClinicUnit {
  const record = asRecord(value);
  const metadata = asRecord(record.metadata);
  return {
    id: asString(record.id),
    code: asString(record.code),
    name: asString(record.name, 'Unidade sem nome'),
    status: normalizeUnitStatus(record.status),
    address: asString(metadata.address),
    city: asString(metadata.city),
    phone: asString(metadata.phone),
    isMain: asBoolean(metadata.isMain),
    createdAt: asString(record.createdAt) || null,
    updatedAt: asString(record.updatedAt) || null,
  };
}

function mapTeamMember(value: unknown): TeamMember {
  const record = asRecord(value);
  const fullName = asString(record.fullName, 'Membro sem nome');
  const email = asString(record.email);
  const professionalProfile = mapProfessionalProfile(record.professionalProfile);
  return {
    id: asString(record.id),
    userId: asString(record.userId),
    tenantId: asString(record.tenantId),
    unitId: asString(record.unitId) || null,
    unitName: asString(record.unitName) || null,
    fullName,
    email,
    roleCode: asString(record.roleCode, 'receptionist'),
    status: asString(record.status, 'invited'),
    isActive: asBoolean(record.isActive),
    initials: initialsFrom(fullName, email),
    phone: asString(record.phone),
    avatarUrl: asString(record.avatarUrl) || null,
    avatarPath: asString(record.avatarPath) || null,
    privateProfile: mapPrivateProfile(record.privateProfile),
    professionalProfile,
    createdAt: asString(record.createdAt) || null,
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
    professionalAddress: mapAddress(record.professionalAddress),
    attendanceUnitIds: asArray(record.attendanceUnitIds)
      .map((id) => asString(id))
      .filter(Boolean),
    signatureFooter: asString(record.signatureFooter),
    publicProfile: mapPublicProfile(record.publicProfile),
  };
}

function mapRole(value: unknown): ClinicRole {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    name: asString(record.name),
    description: asString(record.description),
    isSystem: asBoolean(record.isSystem),
    membersCount: asInteger(record.membersCount),
  };
}

function mapPermission(value: unknown): ClinicPermission {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    code: asString(record.code),
    description: asString(record.description),
  };
}

function mapRolePermission(value: unknown): ClinicRolePermission {
  const record = asRecord(value);
  return {
    roleId: asString(record.roleId),
    roleName: asString(record.roleName),
    permissions: asArray(record.permissions)
      .map((code) => asString(code))
      .filter(Boolean),
  };
}

function mapFeatureFlag(value: unknown): ClinicFeatureFlag {
  const record = asRecord(value);
  return {
    key: asString(record.key),
    enabled: asBoolean(record.enabled),
  };
}

function mapProgram(value: unknown): ClinicProgramOption {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    name: asString(record.name, 'Programa sem nome'),
    status: asString(record.status, 'rascunho'),
    programType: asString(record.programType),
    durationWeeks: asInteger(record.durationWeeks),
  };
}

function normalizeTime(value: unknown, fallback: string) {
  const text = asString(value, fallback);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

function mapChatServiceHour(value: unknown): ClinicChatServiceHour {
  const record = asRecord(value);
  return {
    id: asString(record.id) || undefined,
    weekday: Math.max(0, Math.min(6, asInteger(record.weekday))),
    opensAt: normalizeTime(record.opensAt, '08:00'),
    closesAt: normalizeTime(record.closesAt, '18:00'),
    timezone: asString(record.timezone, 'America/Sao_Paulo'),
    autoReply: asString(record.autoReply),
    isEnabled: asBoolean(record.isEnabled, true),
    updatedAt: asString(record.updatedAt) || null,
  };
}

function normalizeChatHours(value: unknown): ClinicChatServiceHour[] {
  const mapped = asArray(value).map(mapChatServiceHour);
  const byWeekday = new Map(DEFAULT_CHAT_HOURS.map((hour) => [hour.weekday, { ...hour }]));

  mapped.forEach((hour) => {
    byWeekday.set(hour.weekday, {
      ...byWeekday.get(hour.weekday),
      ...hour,
    });
  });

  return Array.from(byWeekday.values()).sort((a, b) => a.weekday - b.weekday);
}

function normalizeAutoMessageChannel(value: unknown): AutoMessageChannel {
  const normalized = asString(value, 'chat');
  if (
    normalized === 'portal' ||
    normalized === 'email' ||
    normalized === 'whatsapp' ||
    normalized === 'sms'
  ) {
    return normalized;
  }
  return 'chat';
}

function mapAutoMessageTemplate(value: unknown): AutoMessageTemplate {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    code: asString(record.code),
    name: asString(record.name, 'Mensagem automatica'),
    channel: normalizeAutoMessageChannel(record.channel),
    triggerEvent: asString(record.triggerEvent, 'after_hours'),
    body: asString(record.body),
    isEnabled: asBoolean(record.isEnabled, true),
    sortOrder: asInteger(record.sortOrder),
    updatedAt: asString(record.updatedAt) || null,
  };
}

function normalizeComplianceSeverity(value: unknown): ComplianceGapSeverity {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'critical' || normalized === 'high' || normalized === 'low') {
    return normalized;
  }
  return 'medium';
}

function normalizeComplianceStatus(value: unknown): ComplianceGapStatus {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'acknowledged' || normalized === 'resolved' || normalized === 'dismissed') {
    return normalized;
  }
  return 'open';
}

function mapComplianceGap(value: unknown): ComplianceGap {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    code: asString(record.code),
    area: asString(record.area, 'operational'),
    severity: normalizeComplianceSeverity(record.severity),
    status: normalizeComplianceStatus(record.status),
    title: asString(record.title, 'Lacuna operacional'),
    description: asString(record.description),
    remediation: asString(record.remediation),
    ownerRole: asString(record.ownerRole) || null,
    dueAt: asString(record.dueAt) || null,
    detectedAt: asString(record.detectedAt) || null,
    resolvedAt: asString(record.resolvedAt) || null,
    updatedAt: asString(record.updatedAt) || null,
  };
}

function mapComplianceSummary(value: unknown): ComplianceSummary {
  const record = asRecord(value);
  return {
    open: asInteger(record.open),
    acknowledged: asInteger(record.acknowledged),
    resolved: asInteger(record.resolved),
    criticalOpen: asInteger(record.criticalOpen),
    lastEvaluatedAt: asString(record.lastEvaluatedAt) || null,
  };
}

function mapIntegrations(
  rawSettings: Record<string, unknown>,
  featureFlags: ClinicFeatureFlag[]
): ClinicIntegration[] {
  const integrationSettings = asRecord(rawSettings.integrations);
  const enabledFeatureFlags = new Set(
    featureFlags.filter((flag) => flag.enabled).map((flag) => flag.key)
  );

  return INTEGRATION_DEFINITIONS.map((definition) => {
    const item = asRecord(integrationSettings[definition.id]);
    const storedStatus = asString(item.status);
    const statusEnabled =
      storedStatus === 'enabled' || storedStatus === 'active' || storedStatus === 'connected';
    const enabled =
      asBoolean(item.enabled) ||
      statusEnabled ||
      enabledFeatureFlags.has(definition.id) ||
      enabledFeatureFlags.has(`integration.${definition.id}`);
    return {
      ...definition,
      enabled,
      status: enabled ? 'enabled' : storedStatus === 'disabled' ? 'disabled' : 'not_configured',
    };
  });
}

function mapSnapshot(value: unknown, operationalValue: unknown = null): ClinicSettingsSnapshot {
  const record = asRecord(value);
  const operationalRecord = asRecord(operationalValue);
  const rawTenant = asRecord(record.tenant);
  const tenantId = readTenantId(record);
  const tenant: ClinicSettingsTenant = {
    id: tenantId,
    slug: asString(rawTenant.slug),
    name: asString(rawTenant.name, 'Clinica'),
    status: asString(rawTenant.status, 'active'),
    createdAt: asString(rawTenant.createdAt) || null,
    updatedAt: asString(rawTenant.updatedAt) || null,
  };
  const rawSettings = {
    ...asRecord(record.settings),
    legal: asRecord(operationalRecord.legal),
  };
  const mappedSettings = mapSettings(rawSettings, tenant);
  const featureFlags = asArray(record.featureFlags).map(mapFeatureFlag);

  return {
    tenant,
    ...mappedSettings,
    chatServiceHours: normalizeChatHours(operationalRecord.chatServiceHours),
    autoMessageTemplates: asArray(operationalRecord.autoMessageTemplates)
      .map(mapAutoMessageTemplate)
      .filter((template) => template.id),
    complianceGaps: asArray(operationalRecord.complianceGaps)
      .map(mapComplianceGap)
      .filter((gap) => gap.id),
    complianceSummary: operationalRecord.complianceSummary
      ? mapComplianceSummary(operationalRecord.complianceSummary)
      : DEFAULT_COMPLIANCE_SUMMARY,
    units: asArray(record.units)
      .map(mapUnit)
      .filter((unit) => unit.id),
    team: asArray(record.team)
      .map(mapTeamMember)
      .filter((member) => member.id),
    roles: asArray(record.roles)
      .map(mapRole)
      .filter((role) => role.id),
    permissions: asArray(record.permissions)
      .map(mapPermission)
      .filter((permission) => permission.id),
    rolePermissions: asArray(record.rolePermissions)
      .map(mapRolePermission)
      .filter((rolePermission) => rolePermission.roleId),
    featureFlags,
    integrations: mapIntegrations(rawSettings, featureFlags),
    programs: asArray(record.programs)
      .map(mapProgram)
      .filter((program) => program.id),
  };
}

function mergeTeamPersonalProfiles(snapshotValue: unknown, teamPersonalValue: unknown) {
  const snapshot = asRecord(snapshotValue);
  const extrasByMembership = new Map(
    asArray(teamPersonalValue).map((item) => {
      const record = asRecord(item);
      return [asString(record.membershipId), record] as const;
    })
  );
  return {
    ...snapshot,
    team: asArray(snapshot.team).map((item) => {
      const member = asRecord(item);
      const extra = extrasByMembership.get(asString(member.id));
      if (!extra) return member;
      const professionalProfile = asRecord(member.professionalProfile);
      return {
        ...member,
        tenantId: extra.tenantId,
        phone: extra.phone,
        avatarPath: extra.avatarPath,
        privateProfile: extra.privateProfile,
        professionalProfile: professionalProfile.id
          ? {
              ...professionalProfile,
              professionalAddress: extra.professionalAddress,
              attendanceUnitIds: extra.attendanceUnitIds,
              signatureFooter: extra.signatureFooter,
              publicProfile: extra.publicProfile,
            }
          : member.professionalProfile,
      };
    }),
  };
}

async function hydrateTeamAvatars(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  snapshot: ClinicSettingsSnapshot
) {
  const team = await Promise.all(
    snapshot.team.map(async (member) => {
      if (!member.avatarPath) return member;
      const { data } = await supabase.storage
        .from('user-profile-avatars')
        .createSignedUrl(member.avatarPath, 300);
      return { ...member, avatarUrl: data?.signedUrl ?? null };
    })
  );
  return { ...snapshot, team };
}

export async function getClinicSettings() {
  try {
    const supabase = createBrowserSupabaseClient();
    const [baseResult, operationalResult, teamPersonalResult] = await Promise.all([
      supabase.rpc('get_clinic_settings_snapshot'),
      supabase.rpc('get_clinic_operational_settings_snapshot'),
      supabase.rpc('get_clinic_team_personal_profiles'),
    ]);

    if (baseResult.error || operationalResult.error || teamPersonalResult.error) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: asServiceError(
          baseResult.error ?? operationalResult.error ?? teamPersonalResult.error,
          'Nao foi possivel carregar configuracoes.'
        ),
      };
    }

    return {
      data: await hydrateTeamAvatars(
        supabase,
        mapSnapshot(
          mergeTeamPersonalProfiles(baseResult.data, teamPersonalResult.data),
          operationalResult.data
        )
      ),
      error: null as SafeServiceError | null,
    };
  } catch (error) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: asServiceError(error, 'Nao foi possivel carregar configuracoes.'),
    };
  }
}

export async function updateClinicSettings(name: string | null, patch: ClinicSettingsPatch) {
  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('update_clinic_settings', {
      p_name: name,
      p_settings_patch: patch,
    });

    if (error) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: asServiceError(error, 'Nao foi possivel salvar configuracoes.'),
      };
    }

    return getClinicSettings();
  } catch (error) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: asServiceError(error, 'Nao foi possivel salvar configuracoes.'),
    };
  }
}

function asPrivacyGovernance(value: unknown): ClinicPrivacyGovernance {
  const record = asRecord(value);
  const policyRecord = asRecord(record.policy);
  const policy =
    Object.keys(policyRecord).length === 0
      ? null
      : {
          id: asString(policyRecord.id) || undefined,
          version: asInteger(policyRecord.version, 1),
          status: asString(policyRecord.status) as ClinicPrivacyPolicy['status'],
          dpoEmail: asString(policyRecord.dpoEmail),
          consentVersion: asString(policyRecord.consentVersion),
          requestSlaDays: asInteger(policyRecord.requestSlaDays, 15),
          alertLeadDays: asInteger(policyRecord.alertLeadDays, 3),
          automationEnabled: asBoolean(policyRecord.automationEnabled),
          allowNonclinicalAnonymization: asBoolean(policyRecord.allowNonclinicalAnonymization),
          retentionRules: asRecord(policyRecord.retentionRules) as Record<string, string>,
          optionalConsents: asRecord(
            policyRecord.optionalConsents
          ) as ClinicPrivacyPolicy['optionalConsents'],
          approvedOperators: asArray(policyRecord.approvedOperators)
            .map((item) => asString(item))
            .filter(Boolean),
          publishedAt: asString(policyRecord.publishedAt) || null,
        };
  return {
    policy,
    alerts: asArray(record.alerts)
      .map((item) => {
        const row = asRecord(item);
        return {
          id: asString(row.id),
          type: asString(row.type),
          severity: asString(row.severity, 'medium') as ClinicPrivacyAlert['severity'],
          status: asString(row.status),
          dueAt: asString(row.dueAt) || null,
          createdAt: asString(row.createdAt) || null,
        };
      })
      .filter((item) => item.id),
    requests: asArray(record.requests)
      .map((item) => {
        const row = asRecord(item);
        return {
          id: asString(row.id),
          type: asString(row.type),
          status: asString(row.status),
          dueAt: asString(row.dueAt) || null,
          assignedTo: asString(row.assignedTo) || null,
          createdAt: asString(row.createdAt) || null,
        };
      })
      .filter((item) => item.id),
  };
}

export async function getClinicPrivacyGovernance(): Promise<{
  data: ClinicPrivacyGovernance | null;
  error: SafeServiceError | null;
}> {
  try {
    const { data, error } = await createBrowserSupabaseClient().rpc(
      'get_clinic_privacy_governance'
    );
    return error
      ? { data: null, error: asServiceError(error, 'Nao foi possivel carregar privacidade.') }
      : { data: asPrivacyGovernance(data), error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel carregar privacidade.') };
  }
}

export async function saveClinicPrivacyPolicy(policy: ClinicPrivacyPolicy): Promise<{
  data: { id: string; version: number; status: string } | null;
  error: SafeServiceError | null;
}> {
  try {
    const { data, error } = await createBrowserSupabaseClient().rpc('save_clinic_privacy_policy', {
      p_policy: policy,
    });
    return error
      ? { data: null, error: asServiceError(error, 'Nao foi possivel salvar politica.') }
      : { data: data as { id: string; version: number; status: string }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel salvar politica.') };
  }
}

export async function publishClinicPrivacyPolicy(
  policyId: string
): Promise<{ error: SafeServiceError | null }> {
  try {
    const { error } = await createBrowserSupabaseClient().rpc('publish_clinic_privacy_policy', {
      p_policy_id: policyId,
    });
    return { error: error ? asServiceError(error, 'Nao foi possivel publicar politica.') : null };
  } catch (error) {
    return { error: asServiceError(error, 'Nao foi possivel publicar politica.') };
  }
}

export async function startClinicMercadoPagoOAuth(tenantId: string): Promise<{
  data: { authorizationUrl: string } | null;
  error: SafeServiceError | null;
}> {
  const resolved = await resolveClinicTenantId(tenantId);
  if (resolved.error) return { data: null, error: resolved.error };

  try {
    const response = await fetch(
      `/api/admin/tenants/${resolved.tenantId}/mercadopago/oauth/start`,
      {
        method: 'POST',
        headers: { Accept: 'application/json' },
      }
    );
    const payload = (await response.json().catch(() => null)) as {
      data?: { authorizationUrl?: string } | null;
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error || !payload?.data?.authorizationUrl) {
      return {
        data: null,
        error: { message: payload?.error?.message ?? 'Nao foi possivel iniciar Mercado Pago.' },
      };
    }

    return { data: { authorizationUrl: payload.data.authorizationUrl }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel iniciar Mercado Pago.') };
  }
}

export async function disconnectClinicMercadoPagoOAuth(input: {
  tenantId: string;
  reason: string;
}): Promise<{ error: SafeServiceError | null }> {
  const resolved = await resolveClinicTenantId(input.tenantId);
  if (resolved.error) return { error: resolved.error };

  const reason = normalizeText(input.reason, 500);
  if (reason.length < 16) {
    return { error: { message: 'Informe um motivo auditavel com pelo menos 16 caracteres.' } };
  }

  try {
    const response = await fetch(
      `/api/admin/tenants/${resolved.tenantId}/mercadopago/oauth/disconnect`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }
    );
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string } | null;
    } | null;

    if (!response.ok || payload?.error) {
      return {
        error: { message: payload?.error?.message ?? 'Nao foi possivel desconectar Mercado Pago.' },
      };
    }

    return { error: null };
  } catch (error) {
    return { error: asServiceError(error, 'Nao foi possivel desconectar Mercado Pago.') };
  }
}

export async function saveChatServiceHours(hours: ClinicChatServiceHour[]) {
  if (hours.length === 0 || hours.length > 7) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'Informe ate sete dias de atendimento.' } as SafeServiceError,
    };
  }

  const payload = hours.map((hour) => ({
    weekday: Math.max(0, Math.min(6, Math.trunc(hour.weekday))),
    opensAt: normalizeTime(hour.opensAt, '08:00'),
    closesAt: normalizeTime(hour.closesAt, '18:00'),
    timezone: hour.timezone.trim() || 'America/Sao_Paulo',
    autoReply: hour.autoReply.trim(),
    isEnabled: hour.isEnabled,
  }));

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('upsert_chat_service_hours', {
      p_hours: payload,
    });

    if (error) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: asServiceError(error, 'Nao foi possivel salvar horario de chat.'),
      };
    }

    return getClinicSettings();
  } catch (error) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: asServiceError(error, 'Nao foi possivel salvar horario de chat.'),
    };
  }
}

export async function saveAutoMessageTemplate(input: SaveAutoMessageTemplateInput) {
  const name = input.name.trim();
  const body = input.body.trim();
  const triggerEvent = input.triggerEvent.trim() || 'after_hours';

  if (!name) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'Nome da mensagem automatica obrigatorio.' } as SafeServiceError,
    };
  }

  if (body.length < 8) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'Mensagem automatica muito curta.' } as SafeServiceError,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('upsert_auto_message_template', {
      p_template_id: input.id || null,
      p_code: input.code?.trim() || null,
      p_name: name,
      p_channel: input.channel,
      p_trigger_event: triggerEvent,
      p_body: body,
      p_is_enabled: input.isEnabled,
      p_sort_order: input.sortOrder,
      p_metadata: {},
    });

    if (error) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: asServiceError(error, 'Nao foi possivel salvar mensagem automatica.'),
      };
    }

    return getClinicSettings();
  } catch (error) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: asServiceError(error, 'Nao foi possivel salvar mensagem automatica.'),
    };
  }
}

export async function updateComplianceGapStatus(
  gapId: string,
  status: ComplianceGapStatus,
  note = ''
) {
  if (!gapId.trim()) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'Lacuna de compliance invalida.' } as SafeServiceError,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('update_compliance_gap_status', {
      p_gap_id: gapId,
      p_status: status,
      p_note: note.trim() || null,
    });

    if (error) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: asServiceError(error, 'Nao foi possivel atualizar compliance.'),
      };
    }

    return getClinicSettings();
  } catch (error) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: asServiceError(error, 'Nao foi possivel atualizar compliance.'),
    };
  }
}

export async function saveClinicUnit(input: SaveClinicUnitInput) {
  const name = input.name.trim();
  const code = input.code.trim();

  if (!name) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'Nome da unidade obrigatorio.' } as SafeServiceError,
    };
  }

  if (!code) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'Codigo da unidade obrigatorio.' } as SafeServiceError,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('upsert_clinic_unit', {
      p_unit_id: input.id || null,
      p_code: code,
      p_name: name,
      p_status: input.status,
      p_metadata: {
        address: input.address.trim(),
        city: input.city.trim(),
        phone: input.phone.trim(),
        isMain: input.isMain,
      },
    });

    if (error) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: asServiceError(error, 'Nao foi possivel salvar unidade.'),
      };
    }

    return getClinicSettings();
  } catch (error) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: asServiceError(error, 'Nao foi possivel salvar unidade.'),
    };
  }
}

export async function updateClinicMemberRole(membershipId: string, roleCode: string) {
  if (!membershipId.trim()) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'Membro invalido para alterar papel.' } as SafeServiceError,
    };
  }
  if (!roleCode.trim()) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'Papel obrigatorio.' } as SafeServiceError,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('update_clinic_member_role', {
      p_membership_id: membershipId,
      p_role_code: roleCode,
    });

    if (error) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: asServiceError(error, 'Nao foi possivel alterar papel do membro.'),
      };
    }

    return getClinicSettings();
  } catch (error) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: asServiceError(error, 'Nao foi possivel alterar papel do membro.'),
    };
  }
}

export async function updateClinicMemberProfessionalProfile(
  membershipId: string,
  input: ProfessionalProfileInput
) {
  const professionalType = input.professionalType;
  const licenseNumber = input.licenseNumber?.trim() ?? '';
  const licenseState = input.licenseState?.trim().toUpperCase().slice(0, 2) ?? '';
  const specialty = input.specialty?.trim() ?? '';
  const reason = input.reason?.trim() ?? '';

  if (!membershipId.trim()) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'Membro invalido para alterar perfil profissional.' } as SafeServiceError,
    };
  }

  if (input.enabled && professionalType === 'physician') {
    if (!licenseNumber) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: { message: 'Informe o CRM/registro do medico.' } as SafeServiceError,
      };
    }
    if (!licenseState || licenseState.length !== 2) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: { message: 'Informe a UF do CRM/registro do medico.' } as SafeServiceError,
      };
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
      p_is_active: input.enabled,
      p_reason: reason || null,
    });

    if (error) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: asServiceError(error, 'Nao foi possivel alterar perfil profissional.'),
      };
    }

    return getClinicSettings();
  } catch (error) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: asServiceError(error, 'Nao foi possivel alterar perfil profissional.'),
    };
  }
}

export async function inviteClinicMember(input: {
  email: string;
  fullName?: string;
  roleCode: string;
  unitId?: string | null;
  reason: string;
  professionalProfile?: ProfessionalProfileInput | null;
}) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName?.trim() ?? '';
  const roleCode = input.roleCode.trim();
  const unitId = input.unitId?.trim() || null;
  const reason = input.reason.trim();
  const professionalProfile =
    input.professionalProfile ??
    (roleCode === 'physician' ? { enabled: true, professionalType: 'physician' as const } : null);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'E-mail invalido.' } as SafeServiceError,
    };
  }
  if (!roleCode) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'Papel obrigatorio.' } as SafeServiceError,
    };
  }
  if (reason.length < 16) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: {
        message: 'Informe um motivo auditavel com pelo menos 16 caracteres.',
      } as SafeServiceError,
    };
  }
  if (professionalProfile?.enabled && professionalProfile.professionalType === 'physician') {
    if (!professionalProfile.licenseNumber?.trim()) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: { message: 'Informe o CRM/registro do medico.' } as SafeServiceError,
      };
    }
    const licenseState = professionalProfile.licenseState?.trim().toUpperCase() ?? '';
    if (!licenseState || licenseState.length !== 2) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: { message: 'Informe a UF do CRM/registro do medico.' } as SafeServiceError,
      };
    }
  }

  try {
    const response = await fetch('/api/clinic/invitations', {
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
        data: null as ClinicSettingsSnapshot | null,
        error: {
          message: payload?.error?.message ?? 'Nao foi possivel convidar membro.',
        } as SafeServiceError,
      };
    }

    return getClinicSettings();
  } catch (error) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: asServiceError(error, 'Nao foi possivel convidar membro.'),
    };
  }
}

function normalizeAddressPayload(address: ProfessionalAddress) {
  return {
    zipCode: address.zipCode.trim(),
    street: address.street.trim(),
    number: address.number.trim(),
    complement: address.complement.trim(),
    district: address.district.trim(),
    city: address.city.trim(),
    state: address.state.trim().toUpperCase().slice(0, 2),
    country: address.country.trim() || 'Brasil',
  };
}

export async function updateClinicMemberPersonalProfile(
  member: TeamMember,
  input: TeamMemberPersonalProfileInput
) {
  if (!member.id.trim()) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: { message: 'Membro invalido.' } as SafeServiceError,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    let avatar: { path: string; mimeType: string; sizeBytes: number } | null = null;

    if (input.avatarFile) {
      const extension =
        input.avatarFile.type === 'image/png'
          ? 'png'
          : input.avatarFile.type === 'image/webp'
            ? 'webp'
            : 'jpg';
      const path = `${member.tenantId}/${member.userId}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('user-profile-avatars')
        .upload(path, input.avatarFile, { upsert: true, contentType: input.avatarFile.type });
      if (uploadError) {
        return {
          data: null as ClinicSettingsSnapshot | null,
          error: asServiceError(uploadError, 'Nao foi possivel enviar avatar privado.'),
        };
      }
      avatar = { path, mimeType: input.avatarFile.type, sizeBytes: input.avatarFile.size };
    }

    const { error } = await supabase.rpc('update_clinic_member_personal_profile', {
      p_membership_id: member.id,
      p_payload: {
        phone: input.phone.trim(),
        avatar,
        privateProfile: {
          personalAddress: normalizeAddressPayload(input.privateProfile.personalAddress),
          emergencyContact: input.privateProfile.emergencyContact.trim(),
          privateNotes: input.privateProfile.privateNotes.trim(),
        },
        professionalAddress: normalizeAddressPayload(input.professionalAddress),
        attendanceUnitIds: input.attendanceUnitIds,
        signatureFooter: input.signatureFooter.trim(),
        publicProfile: {
          bio: input.publicProfile.bio.trim(),
          displayPhone: input.publicProfile.displayPhone.trim(),
        },
      },
      p_reason: input.reason?.trim() || null,
    });

    if (error) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: asServiceError(error, 'Nao foi possivel salvar dados pessoais/profissionais.'),
      };
    }

    return getClinicSettings();
  } catch (error) {
    return {
      data: null as ClinicSettingsSnapshot | null,
      error: asServiceError(error, 'Nao foi possivel salvar dados pessoais/profissionais.'),
    };
  }
}
