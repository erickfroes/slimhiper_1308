import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { SafeServiceError } from '@/services/billingApi';

export type ClinicUnitStatus = 'active' | 'inactive' | 'archived';

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
  unitId: string | null;
  unitName: string | null;
  fullName: string;
  email: string;
  roleCode: string;
  status: string;
  isActive: boolean;
  initials: string;
  createdAt: string | null;
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

const INTEGRATION_DEFINITIONS = [
  {
    id: 'asaas',
    name: 'Asaas',
    category: 'Financeiro',
    description: 'Cobrancas, assinaturas e conciliacao por Edge Functions.',
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

function initialsFrom(name: string, email: string) {
  const source = name.trim() || email.split('@')[0] || 'U';
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function normalizeUnitStatus(value: unknown): ClinicUnitStatus {
  if (value === 'inactive' || value === 'archived') return value;
  return 'active';
}

function mapSettings(rawSettings: Record<string, unknown>, tenant: ClinicSettingsTenant) {
  const profileRecord = asRecord(rawSettings.profile);
  const brandingRecord = asRecord(rawSettings.branding);
  const portalRecord = asRecord(rawSettings.portal);
  const financeRecord = asRecord(rawSettings.finance);
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

  const defaultProgramIds = asArray(defaultProgramsRecord.programIds)
    .map((id) => asString(id))
    .filter(Boolean);

  return { profile, branding, portal, finance, defaultProgramIds };
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
  return {
    id: asString(record.id),
    userId: asString(record.userId),
    unitId: asString(record.unitId) || null,
    unitName: asString(record.unitName) || null,
    fullName,
    email,
    roleCode: asString(record.roleCode, 'receptionist'),
    status: asString(record.status, 'invited'),
    isActive: asBoolean(record.isActive),
    initials: initialsFrom(fullName, email),
    createdAt: asString(record.createdAt) || null,
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
    const enabled =
      asBoolean(item.enabled) ||
      enabledFeatureFlags.has(definition.id) ||
      enabledFeatureFlags.has(`integration.${definition.id}`);
    const storedStatus = asString(item.status);
    return {
      ...definition,
      enabled,
      status: enabled ? 'enabled' : storedStatus === 'disabled' ? 'disabled' : 'not_configured',
    };
  });
}

function mapSnapshot(value: unknown): ClinicSettingsSnapshot {
  const record = asRecord(value);
  const rawTenant = asRecord(record.tenant);
  const tenant: ClinicSettingsTenant = {
    id: asString(rawTenant.id),
    slug: asString(rawTenant.slug),
    name: asString(rawTenant.name, 'Clinica'),
    status: asString(rawTenant.status, 'active'),
    createdAt: asString(rawTenant.createdAt) || null,
    updatedAt: asString(rawTenant.updatedAt) || null,
  };
  const rawSettings = asRecord(record.settings);
  const mappedSettings = mapSettings(rawSettings, tenant);
  const featureFlags = asArray(record.featureFlags).map(mapFeatureFlag);

  return {
    tenant,
    ...mappedSettings,
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

export async function getClinicSettings() {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_clinic_settings_snapshot');

    if (error) {
      return {
        data: null as ClinicSettingsSnapshot | null,
        error: asServiceError(error, 'Nao foi possivel carregar configuracoes.'),
      };
    }

    return {
      data: mapSnapshot(data),
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

export async function inviteClinicMember(input: {
  email: string;
  fullName?: string;
  roleCode: string;
  unitId?: string | null;
  reason: string;
}) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName?.trim() ?? '';
  const roleCode = input.roleCode.trim();
  const unitId = input.unitId?.trim() || null;
  const reason = input.reason.trim();

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

  try {
    const response = await fetch('/api/clinic/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, fullName, roleCode, unitId, reason }),
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
