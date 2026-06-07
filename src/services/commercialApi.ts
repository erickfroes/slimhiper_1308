import type {
  CommercialDeliveryMode,
  CommercialPackage,
  CommercialPackageService,
  CommercialPackageStatus,
  CommercialProgramOption,
  CommercialRenewalPolicy,
  CommercialService,
  CommercialServiceCategory,
  CommercialServiceStatus,
  PatientCommercialContext,
  PatientCommercialPackage,
  PatientUpgradeRequest,
  UpgradeRequest,
  UpgradeRequestStatus,
} from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { SafeServiceError } from '@/services/billingApi';

export interface ClinicCommercialSummary {
  services: number;
  packages: number;
  upgradesOpen: number;
  upgradeRevenuePendingCents: number;
}

export interface ClinicCommercialPayload {
  services: CommercialService[];
  packages: CommercialPackage[];
  programs: CommercialProgramOption[];
  upgradeRequests: UpgradeRequest[];
  summary: ClinicCommercialSummary;
  lastCheckedAt?: string | null;
}

export interface CommercialMutationResult {
  id: string;
  status?: string;
  invoiceId?: string | null;
}

export interface CommercialServiceDraft {
  id?: string;
  name: string;
  category: CommercialServiceCategory;
  description: string;
  status: CommercialServiceStatus;
  basePriceCents: number;
  durationMinutes?: number | null;
  unit: string;
  deliveryMode: CommercialDeliveryMode;
}

export interface CommercialPackageDraft {
  id?: string;
  name: string;
  description: string;
  status: CommercialPackageStatus;
  priceCents: number;
  durationWeeks: number;
  renewalPolicy: CommercialRenewalPolicy;
  communityAccess: boolean;
  priorityChat: boolean;
  benefits: string[];
  usageLimits: Array<{ label: string; value: string }>;
  services: Array<{
    serviceId: string;
    quantity: number;
    unit: string;
    limitPerPeriod?: number | null;
  }>;
  programLinks: Array<{
    programId: string;
    isDefault: boolean;
  }>;
}

const serviceCategories: CommercialServiceCategory[] = [
  'clinico',
  'nutricao',
  'fitness',
  'exame',
  'documento',
  'suporte',
  'outro',
];

const serviceStatuses: CommercialServiceStatus[] = ['ativo', 'inativo', 'arquivado'];
const packageStatuses: CommercialPackageStatus[] = ['rascunho', 'ativo', 'inativo', 'arquivado'];
const renewalPolicies: CommercialRenewalPolicy[] = ['manual', 'automatico', 'sem_renovacao'];
const deliveryModes: CommercialDeliveryMode[] = ['presencial', 'online', 'hibrido', 'interno'];
const upgradeStatuses: UpgradeRequestStatus[] = [
  'solicitado',
  'cotado',
  'aprovado',
  'rejeitado',
  'cancelado',
  'cobranca_pendente',
  'concluido',
];

function isMockEnabled() {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asInteger(value: unknown, fallback = 0): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

function asUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized
  )
    ? normalized
    : null;
}

function sanitizeText(value: unknown, maxLength = 240): string {
  if (typeof value !== 'string') return '';
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function sanitizeTextList(values: string[], maxItems = 12): string[] {
  return values
    .map((value) => sanitizeText(value, 160))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return sanitizeText(item, 160);
      const record = asRecord(item);
      return sanitizeText(record.label ?? record.value ?? record.name, 160);
    })
    .filter(Boolean);
}

function normalizeUsageLimit(value: unknown): { label: string; value: string } | null {
  const record = asRecord(value);
  const label = sanitizeText(record.label, 120);
  const limitValue = sanitizeText(record.value, 120);
  if (!label && !limitValue) return null;
  return { label: label || 'Limite', value: limitValue || 'Nao informado' };
}

function normalizeUsageLimits(value: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeUsageLimit)
    .filter((item): item is { label: string; value: string } => Boolean(item));
}

function normalizePackageService(value: unknown): CommercialPackageService | null {
  const record = asRecord(value);
  const serviceId = asString(record.serviceId);
  const serviceName = asString(record.serviceName, asString(record.name));
  if (!serviceId && !serviceName) return null;
  return {
    id: asNullableString(record.id) ?? undefined,
    serviceId,
    serviceName: serviceName || 'Servico',
    category: asString(record.category),
    quantity: asNumber(record.quantity),
    unit: asString(record.unit, 'unidade'),
    limitPerPeriod:
      record.limitPerPeriod === null || record.limitPerPeriod === undefined
        ? null
        : asInteger(record.limitPerPeriod),
    position: asInteger(record.position),
  };
}

function normalizeProgramLink(value: unknown): CommercialPackage['programLinks'][number] | null {
  const record = asRecord(value);
  const programId = asString(record.programId);
  if (!programId) return null;
  return {
    programId,
    programName: asString(record.programName, 'Programa'),
    isDefault: asBoolean(record.isDefault),
    status: asString(record.status, 'ativo'),
  };
}

function normalizeService(value: unknown): CommercialService | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    name: asString(record.name, 'Servico'),
    category: asEnum(record.category, serviceCategories, 'clinico'),
    description: asString(record.description),
    status: asEnum(record.status, serviceStatuses, 'ativo'),
    basePriceCents: asInteger(record.basePriceCents),
    durationMinutes:
      record.durationMinutes === null || record.durationMinutes === undefined
        ? null
        : asInteger(record.durationMinutes),
    unit: asString(record.unit, 'unidade'),
    deliveryMode: asEnum(record.deliveryMode, deliveryModes, 'presencial'),
    packagesCount: asInteger(record.packagesCount),
    createdAt: asNullableString(record.createdAt),
    updatedAt: asNullableString(record.updatedAt),
  };
}

function normalizePackage(value: unknown): CommercialPackage | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    name: asString(record.name, 'Pacote'),
    description: asString(record.description),
    status: asEnum(record.status, packageStatuses, 'rascunho'),
    priceCents: asInteger(record.priceCents),
    durationWeeks: asInteger(record.durationWeeks),
    renewalPolicy: asEnum(record.renewalPolicy, renewalPolicies, 'manual'),
    communityAccess: asBoolean(record.communityAccess),
    priorityChat: asBoolean(record.priorityChat),
    benefits: normalizeStringList(record.benefits),
    usageLimits: normalizeUsageLimits(record.usageLimits),
    services: Array.isArray(record.services)
      ? record.services
          .map(normalizePackageService)
          .filter((item): item is CommercialPackageService => Boolean(item))
      : [],
    programLinks: Array.isArray(record.programLinks)
      ? record.programLinks
          .map(normalizeProgramLink)
          .filter((item): item is CommercialPackage['programLinks'][number] => Boolean(item))
      : [],
    activePatients: asInteger(record.activePatients),
    createdAt: asNullableString(record.createdAt),
    updatedAt: asNullableString(record.updatedAt),
  };
}

function normalizeProgram(value: unknown): CommercialProgramOption | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    name: asString(record.name, 'Programa'),
    status: asEnum(record.status, ['ativo', 'arquivado', 'rascunho'] as const, 'rascunho'),
    programType: asEnum(
      record.programType,
      ['emagrecimento', 'hipertrofia', 'recomposicao', 'saude_metabolica', 'longevidade'] as const,
      'saude_metabolica'
    ),
  };
}

function normalizeUpgrade(value: unknown): UpgradeRequest | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const patientId = asString(record.patientId);
  const targetPackageId = asString(record.targetPackageId);
  if (!id || !patientId || !targetPackageId) return null;
  return {
    id,
    patientId,
    patientName: asString(record.patientName, 'Paciente'),
    enrollmentId: asNullableString(record.enrollmentId),
    currentPackageId: asNullableString(record.currentPackageId),
    currentPackageName: asNullableString(record.currentPackageName),
    targetPackageId,
    targetPackageName: asString(record.targetPackageName, 'Pacote'),
    targetProgramId: asNullableString(record.targetProgramId),
    status: asEnum(record.status, upgradeStatuses, 'solicitado'),
    requestedByRole: asEnum(
      record.requestedByRole,
      ['patient', 'guardian', 'staff', 'system'] as const,
      'staff'
    ),
    reason: asString(record.reason),
    quoteAmountCents:
      record.quoteAmountCents === null || record.quoteAmountCents === undefined
        ? null
        : asInteger(record.quoteAmountCents),
    quoteCurrency: asString(record.quoteCurrency, 'BRL'),
    quoteNotes: asString(record.quoteNotes),
    quoteDueDate: asNullableString(record.quoteDueDate),
    invoiceId: asNullableString(record.invoiceId),
    invoiceStatus: asNullableString(record.invoiceStatus),
    createdAt: asNullableString(record.createdAt),
    updatedAt: asNullableString(record.updatedAt),
    decidedAt: asNullableString(record.decidedAt),
  };
}

function normalizeSummary(value: unknown): ClinicCommercialSummary {
  const record = asRecord(value);
  return {
    services: asInteger(record.services),
    packages: asInteger(record.packages),
    upgradesOpen: asInteger(record.upgradesOpen),
    upgradeRevenuePendingCents: asInteger(record.upgradeRevenuePendingCents),
  };
}

function normalizeClinicCatalog(value: unknown): ClinicCommercialPayload {
  const record = asRecord(value);
  return {
    services: Array.isArray(record.services)
      ? record.services
          .map(normalizeService)
          .filter((item): item is CommercialService => Boolean(item))
      : [],
    packages: Array.isArray(record.packages)
      ? record.packages
          .map(normalizePackage)
          .filter((item): item is CommercialPackage => Boolean(item))
      : [],
    programs: Array.isArray(record.programs)
      ? record.programs
          .map(normalizeProgram)
          .filter((item): item is CommercialProgramOption => Boolean(item))
      : [],
    upgradeRequests: Array.isArray(record.upgradeRequests)
      ? record.upgradeRequests
          .map(normalizeUpgrade)
          .filter((item): item is UpgradeRequest => Boolean(item))
      : [],
    summary: normalizeSummary(record.summary),
    lastCheckedAt: asNullableString(record.lastCheckedAt),
  };
}

function normalizePatientPackageService(
  value: unknown
): PatientCommercialPackage['services'][number] | null {
  const normalized = normalizePackageService(value);
  if (!normalized) return null;
  return {
    serviceId: normalized.serviceId || undefined,
    serviceName: normalized.serviceName,
    quantity: normalized.quantity,
    unit: normalized.unit,
    limitPerPeriod: normalized.limitPerPeriod,
  };
}

function normalizePatientPackage(value: unknown): PatientCommercialPackage | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    name: asString(record.name, 'Pacote'),
    description: asString(record.description),
    priceCents: asInteger(record.priceCents),
    durationWeeks: asInteger(record.durationWeeks),
    renewalPolicy: asEnum(record.renewalPolicy, renewalPolicies, 'manual'),
    communityAccess: asBoolean(record.communityAccess),
    priorityChat: asBoolean(record.priorityChat),
    benefits: normalizeStringList(record.benefits),
    usageLimits: normalizeUsageLimits(record.usageLimits),
    services: Array.isArray(record.services)
      ? record.services
          .map(normalizePatientPackageService)
          .filter((item): item is PatientCommercialPackage['services'][number] => Boolean(item))
      : [],
    programName: asNullableString(record.programName),
    currentWeek: asInteger(record.currentWeek),
    status: asString(record.status),
  };
}

function normalizePatientUpgrade(value: unknown): PatientUpgradeRequest | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const targetPackageId = asString(record.targetPackageId);
  if (!id || !targetPackageId) return null;
  return {
    id,
    targetPackageId,
    targetPackageName: asString(record.targetPackageName, 'Pacote'),
    status: asEnum(record.status, upgradeStatuses, 'solicitado'),
    reason: asString(record.reason),
    quoteAmountCents:
      record.quoteAmountCents === null || record.quoteAmountCents === undefined
        ? null
        : asInteger(record.quoteAmountCents),
    quoteCurrency: asString(record.quoteCurrency, 'BRL'),
    quoteNotes: asString(record.quoteNotes),
    quoteDueDate: asNullableString(record.quoteDueDate),
    invoiceStatus: asNullableString(record.invoiceStatus),
    createdAt: asNullableString(record.createdAt),
    updatedAt: asNullableString(record.updatedAt),
  };
}

function normalizePatientCommercial(value: unknown): PatientCommercialContext | null {
  const record = asRecord(value);
  const selectedPatientId = asString(record.selectedPatientId);
  if (!selectedPatientId) return null;
  return {
    selectedPatientId,
    activeEnrollmentId: asNullableString(record.activeEnrollmentId),
    activePackage: normalizePatientPackage(record.activePackage),
    upgradeOptions: Array.isArray(record.upgradeOptions)
      ? record.upgradeOptions
          .map(normalizePatientPackage)
          .filter((item): item is PatientCommercialPackage => Boolean(item))
      : [],
    upgradeRequests: Array.isArray(record.upgradeRequests)
      ? record.upgradeRequests
          .map(normalizePatientUpgrade)
          .filter((item): item is PatientUpgradeRequest => Boolean(item))
      : [],
    lastCheckedAt: asNullableString(record.lastCheckedAt),
  };
}

function serviceError(error: unknown, fallback: string): SafeServiceError {
  const record = asRecord(error);
  return {
    message: asString(record.message, fallback),
    code: asNullableString(record.code) ?? undefined,
    details: asNullableString(record.details) ?? undefined,
  };
}

function normalizeMutation(value: unknown): CommercialMutationResult | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    status: asNullableString(record.status) ?? undefined,
    invoiceId: asNullableString(record.invoiceId),
  };
}

function sanitizeServiceDraft(draft: CommercialServiceDraft): CommercialServiceDraft {
  return {
    ...draft,
    id: asUuid(draft.id) ?? undefined,
    name: sanitizeText(draft.name, 160),
    category: serviceCategories.includes(draft.category) ? draft.category : 'clinico',
    description: sanitizeText(draft.description, 1000),
    status: serviceStatuses.includes(draft.status) ? draft.status : 'ativo',
    basePriceCents: Math.max(0, Math.round(draft.basePriceCents || 0)),
    durationMinutes:
      draft.durationMinutes === null || draft.durationMinutes === undefined
        ? null
        : Math.min(1440, Math.max(1, Math.round(draft.durationMinutes))),
    unit: sanitizeText(draft.unit, 40) || 'unidade',
    deliveryMode: deliveryModes.includes(draft.deliveryMode) ? draft.deliveryMode : 'presencial',
  };
}

function sanitizePackageDraft(draft: CommercialPackageDraft): CommercialPackageDraft {
  const services = draft.services
    .map((service) => ({
      serviceId: asUuid(service.serviceId) ?? service.serviceId,
      quantity: Math.max(0, Number(service.quantity) || 0),
      unit: sanitizeText(service.unit, 40) || 'unidade',
      limitPerPeriod:
        service.limitPerPeriod === null || service.limitPerPeriod === undefined
          ? null
          : Math.max(0, Math.round(service.limitPerPeriod)),
    }))
    .filter((service) => service.serviceId && service.quantity > 0);

  const programLinks = draft.programLinks
    .map((link) => ({
      programId: asUuid(link.programId) ?? link.programId,
      isDefault: Boolean(link.isDefault),
    }))
    .filter((link) => link.programId);

  return {
    ...draft,
    id: asUuid(draft.id) ?? undefined,
    name: sanitizeText(draft.name, 160),
    description: sanitizeText(draft.description, 1000),
    status: packageStatuses.includes(draft.status) ? draft.status : 'rascunho',
    priceCents: Math.max(0, Math.round(draft.priceCents || 0)),
    durationWeeks: Math.max(0, Math.round(draft.durationWeeks || 0)),
    renewalPolicy: renewalPolicies.includes(draft.renewalPolicy) ? draft.renewalPolicy : 'manual',
    communityAccess: Boolean(draft.communityAccess),
    priorityChat: Boolean(draft.priorityChat),
    benefits: sanitizeTextList(draft.benefits),
    usageLimits: draft.usageLimits
      .map((limit) => ({
        label: sanitizeText(limit.label, 120),
        value: sanitizeText(limit.value, 120),
      }))
      .filter((limit) => limit.label || limit.value)
      .slice(0, 12),
    services,
    programLinks,
  };
}

export function serviceToDraft(service?: CommercialService | null): CommercialServiceDraft {
  return {
    id: service?.id,
    name: service?.name ?? '',
    category: service?.category ?? 'clinico',
    description: service?.description ?? '',
    status: service?.status ?? 'ativo',
    basePriceCents: service?.basePriceCents ?? 0,
    durationMinutes: service?.durationMinutes ?? null,
    unit: service?.unit ?? 'unidade',
    deliveryMode: service?.deliveryMode ?? 'presencial',
  };
}

export function packageToDraft(pkg?: CommercialPackage | null): CommercialPackageDraft {
  return {
    id: pkg?.id,
    name: pkg?.name ?? '',
    description: pkg?.description ?? '',
    status: pkg?.status ?? 'rascunho',
    priceCents: pkg?.priceCents ?? 0,
    durationWeeks: pkg?.durationWeeks ?? 12,
    renewalPolicy: pkg?.renewalPolicy ?? 'manual',
    communityAccess: pkg?.communityAccess ?? false,
    priorityChat: pkg?.priorityChat ?? false,
    benefits: pkg?.benefits ?? [],
    usageLimits: pkg?.usageLimits ?? [],
    services:
      pkg?.services.map((service) => ({
        serviceId: service.serviceId,
        quantity: service.quantity,
        unit: service.unit,
        limitPerPeriod: service.limitPerPeriod,
      })) ?? [],
    programLinks:
      pkg?.programLinks.map((link) => ({
        programId: link.programId,
        isDefault: link.isDefault,
      })) ?? [],
  };
}

export async function getClinicCommercialCatalog(): Promise<{
  data: ClinicCommercialPayload | null;
  error: SafeServiceError | null;
}> {
  try {
    if (isMockEnabled()) {
      const { mockClinicCommercialCatalog } = await import('@/data/mockCommercialData');
      return { data: normalizeClinicCatalog(mockClinicCommercialCatalog), error: null };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_clinic_commercial_catalog');
    if (error)
      return { data: null, error: serviceError(error, 'Falha ao carregar catalogo comercial.') };

    return { data: normalizeClinicCatalog(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao carregar catalogo comercial.') };
  }
}

export async function saveCommercialService(
  draft: CommercialServiceDraft
): Promise<{ data: CommercialMutationResult | null; error: SafeServiceError | null }> {
  const sanitized = sanitizeServiceDraft(draft);
  if (!sanitized.name) return { data: null, error: { message: 'Informe o nome do servico.' } };

  try {
    if (isMockEnabled()) {
      return {
        data: { id: sanitized.id ?? `mock-service-${Date.now()}`, status: sanitized.status },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('upsert_commercial_service', {
      p_service: sanitized,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao salvar servico.') };

    return { data: normalizeMutation(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao salvar servico.') };
  }
}

export async function setCommercialServiceStatus(
  serviceId: string,
  status: CommercialServiceStatus
): Promise<{ data: CommercialMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) return { data: { id: serviceId, status }, error: null };
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('set_commercial_service_status', {
      p_service_id: serviceId,
      p_status: status,
    });
    if (error)
      return { data: null, error: serviceError(error, 'Falha ao alterar status do servico.') };
    return { data: normalizeMutation(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao alterar status do servico.') };
  }
}

export async function cloneCommercialService(
  serviceId: string
): Promise<{ data: CommercialMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled())
      return { data: { id: `mock-service-clone-${Date.now()}`, status: 'inativo' }, error: null };
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('clone_commercial_service', {
      p_service_id: serviceId,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao duplicar servico.') };
    return { data: normalizeMutation(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao duplicar servico.') };
  }
}

export async function saveCommercialPackage(
  draft: CommercialPackageDraft
): Promise<{ data: CommercialMutationResult | null; error: SafeServiceError | null }> {
  const sanitized = sanitizePackageDraft(draft);
  if (!sanitized.name) return { data: null, error: { message: 'Informe o nome do pacote.' } };

  try {
    if (isMockEnabled()) {
      return {
        data: { id: sanitized.id ?? `mock-package-${Date.now()}`, status: sanitized.status },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('upsert_commercial_package', {
      p_package: sanitized,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao salvar pacote.') };
    return { data: normalizeMutation(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao salvar pacote.') };
  }
}

export async function setCommercialPackageStatus(
  packageId: string,
  status: CommercialPackageStatus
): Promise<{ data: CommercialMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) return { data: { id: packageId, status }, error: null };
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('set_commercial_package_status', {
      p_package_id: packageId,
      p_status: status,
    });
    if (error)
      return { data: null, error: serviceError(error, 'Falha ao alterar status do pacote.') };
    return { data: normalizeMutation(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao alterar status do pacote.') };
  }
}

export async function cloneCommercialPackage(
  packageId: string
): Promise<{ data: CommercialMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled())
      return { data: { id: `mock-package-clone-${Date.now()}`, status: 'rascunho' }, error: null };
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('clone_commercial_package', {
      p_package_id: packageId,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao duplicar pacote.') };
    return { data: normalizeMutation(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao duplicar pacote.') };
  }
}

export async function createClinicUpgradeRequest(input: {
  patientId: string;
  targetPackageId: string;
  reason?: string;
  enrollmentId?: string | null;
}): Promise<{ data: CommercialMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled())
      return { data: { id: `mock-upgrade-${Date.now()}`, status: 'solicitado' }, error: null };
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('create_upgrade_request', {
      p_patient_id: input.patientId,
      p_target_package_id: input.targetPackageId,
      p_reason: sanitizeText(input.reason, 1000) || null,
      p_enrollment_id: input.enrollmentId || null,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao solicitar upgrade.') };
    return { data: normalizeMutation(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao solicitar upgrade.') };
  }
}

export async function quoteUpgradeRequest(input: {
  requestId: string;
  amountCents: number;
  notes?: string;
  dueDate?: string | null;
}): Promise<{ data: CommercialMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) return { data: { id: input.requestId, status: 'cotado' }, error: null };
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('quote_upgrade_request', {
      p_request_id: input.requestId,
      p_quote_amount_cents: Math.max(0, Math.round(input.amountCents || 0)),
      p_quote_notes: sanitizeText(input.notes, 1000) || null,
      p_due_date: input.dueDate || null,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao cotar upgrade.') };
    return { data: normalizeMutation(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao cotar upgrade.') };
  }
}

export async function decideUpgradeRequest(input: {
  requestId: string;
  decision: 'approve' | 'reject' | 'cancel';
  notes?: string;
}): Promise<{ data: CommercialMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled())
      return {
        data: {
          id: input.requestId,
          status:
            input.decision === 'approve'
              ? 'aprovado'
              : input.decision === 'reject'
                ? 'rejeitado'
                : 'cancelado',
        },
        error: null,
      };
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('decide_upgrade_request', {
      p_request_id: input.requestId,
      p_decision: input.decision,
      p_notes: sanitizeText(input.notes, 1000) || null,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao decidir upgrade.') };
    return { data: normalizeMutation(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao decidir upgrade.') };
  }
}

export async function generateUpgradeInvoice(
  requestId: string,
  dueDate?: string | null
): Promise<{ data: CommercialMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled())
      return {
        data: {
          id: requestId,
          status: 'cobranca_pendente',
          invoiceId: `mock-invoice-${Date.now()}`,
        },
        error: null,
      };
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('generate_upgrade_invoice', {
      p_request_id: requestId,
      p_due_date: dueDate || null,
    });
    if (error)
      return { data: null, error: serviceError(error, 'Falha ao gerar cobranca de upgrade.') };
    return { data: normalizeMutation(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao gerar cobranca de upgrade.') };
  }
}

export async function getPatientCommercialData(patientId?: string): Promise<{
  data: PatientCommercialContext | null;
  error: SafeServiceError | null;
}> {
  try {
    if (isMockEnabled()) {
      const { mockPatientCommercialData } = await import('@/data/mockCommercialData');
      return { data: normalizePatientCommercial(mockPatientCommercialData), error: null };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_commercial_data', {
      p_patient_id: asUuid(patientId) ?? null,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao carregar beneficios.') };

    const normalized = normalizePatientCommercial(data);
    return {
      data: normalized,
      error: normalized ? null : { message: 'Contrato comercial do paciente indisponivel.' },
    };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao carregar beneficios.') };
  }
}

export async function requestPatientUpgrade(input: {
  patientId?: string;
  targetPackageId: string;
  reason?: string;
}): Promise<{ data: CommercialMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled())
      return {
        data: { id: `mock-patient-upgrade-${Date.now()}`, status: 'solicitado' },
        error: null,
      };
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('request_patient_upgrade', {
      p_patient_id: asUuid(input.patientId) ?? null,
      p_target_package_id: input.targetPackageId,
      p_reason: sanitizeText(input.reason, 1000) || null,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao solicitar upgrade.') };
    return { data: normalizeMutation(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao solicitar upgrade.') };
  }
}
