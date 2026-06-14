import type {
  BuilderStep,
  ClinicProgram,
  ProgramAppEntitlement,
  ProgramBuilderCheckinTemplate,
  ProgramBuilderDraft,
  ProgramBuilderFinancialConfig,
  ProgramBuilderTeamMember,
  ProgramPaymentModel,
  ProgramPhase,
  ProfessionalType,
  ProgramRequiredDocument,
  ProgramService,
  ProgramStatus,
  ProgramType,
} from '@/domain/types';
import { isMockDataEnabled } from '@/lib/mockMode';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { SafeServiceError } from '@/services/billingApi';

export interface ClinicProgramsSummary {
  total: number;
  active: number;
  draft: number;
  archived: number;
  activePatients: number;
}

export interface ClinicProgramsPayload {
  programs: ClinicProgram[];
  summary: ClinicProgramsSummary;
  lastCheckedAt?: string;
}

export interface ProgramBuilderOptions {
  teamMembers: ProgramBuilderTeamMember[];
  checkinTemplates: ProgramBuilderCheckinTemplate[];
}

export interface ProgramMutationResult {
  id: string;
  status?: ProgramStatus | 'ativo' | 'pausado' | 'concluido' | 'cancelado';
  published?: boolean;
  checkinsCreated?: number;
  appointmentId?: string;
  invoiceId?: string;
  documentTasksCreated?: number;
}

export const BUILDER_STEPS: BuilderStep[] = [
  { key: 'dados_gerais', label: 'Dados gerais', description: 'Nome, objetivo, duracao e tipo' },
  { key: 'fases', label: 'Fases', description: 'Estrutura de fases e cronograma' },
  { key: 'servicos', label: 'Servicos incluidos', description: 'Consultas e avaliacoes' },
  { key: 'entitlements', label: 'App do paciente', description: 'Acessos liberados no app' },
  { key: 'checkins', label: 'Check-ins', description: 'Frequencia e questionarios' },
  { key: 'documentos', label: 'Documentos', description: 'Obrigatorios e opcionais' },
  { key: 'financeiro', label: 'Financeiro', description: 'Modelo de pagamento' },
  { key: 'equipe', label: 'Equipe', description: 'Responsaveis pelo programa' },
  { key: 'revisao', label: 'Revisao', description: 'Conferencia antes de publicar' },
];

function isMockEnabled() {
  return isMockDataEnabled();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asProgramType(value: unknown): ProgramType {
  const raw = asString(value, 'saude_metabolica');
  return [
    'emagrecimento',
    'hipertrofia',
    'recomposicao',
    'saude_metabolica',
    'longevidade',
  ].includes(raw)
    ? (raw as ProgramType)
    : 'saude_metabolica';
}

function asStatus(value: unknown): ProgramStatus {
  const raw = asString(value, 'rascunho');
  return raw === 'ativo' || raw === 'arquivado' || raw === 'rascunho' ? raw : 'rascunho';
}

function asPaymentModel(value: unknown): ProgramPaymentModel {
  const raw = asString(value, 'parcelado');
  return raw === 'avista' || raw === 'parcelado' || raw === 'assinatura' || raw === 'hibrido'
    ? raw
    : 'parcelado';
}

function asProfessionalType(value: unknown): ProfessionalType | null {
  const raw = asString(value);
  return raw === 'physician' ||
    raw === 'nutritionist' ||
    raw === 'fitness_professional' ||
    raw === 'external_professional'
    ? raw
    : null;
}

function normalizePhase(item: unknown): ProgramPhase {
  const raw = asRecord(item);
  return {
    name: asString(raw.name, 'Fase'),
    durationWeeks: asNumber(raw.durationWeeks),
    description: asString(raw.description),
  };
}

function normalizeService(item: unknown): ProgramService {
  const raw = asRecord(item);
  return {
    label: asString(raw.label, 'Servico'),
    quantity: asNumber(raw.quantity),
    unit: asString(raw.unit, 'unidade'),
  };
}

function normalizeEntitlement(item: unknown): ProgramAppEntitlement {
  const raw = asRecord(item);
  return {
    key: asString(raw.key, asString(raw.label, 'acesso')),
    label: asString(raw.label, asString(raw.key, 'Acesso')),
    enabled: asBoolean(raw.enabled, true),
  };
}

function normalizeRequiredDocument(item: unknown): ProgramRequiredDocument {
  const raw = asRecord(item);
  return {
    label: asString(raw.label, 'Documento'),
    required: asBoolean(raw.required, true),
  };
}

function normalizeCheckinTemplate(item: unknown): ProgramBuilderCheckinTemplate {
  const raw = asRecord(item);
  const channel = asString(raw.channel, 'app');
  return {
    id: asString(raw.id, `local-${asString(raw.label, 'checkin')}`),
    label: asString(raw.label, 'Check-in'),
    frequency: asString(raw.frequency),
    channel:
      channel === 'whatsapp' || channel === 'email' || channel === 'presencial' ? channel : 'app',
    questions: asStringArray(raw.questions),
  };
}

function normalizeTeamMember(item: unknown): ProgramBuilderTeamMember {
  const raw = asRecord(item);
  return {
    id: asString(raw.id),
    name: asString(raw.name, 'Profissional'),
    role: asString(raw.role, 'Equipe'),
    specialty: asString(raw.specialty),
    email: asNullableString(raw.email) ?? undefined,
    roleCode: asNullableString(raw.roleCode) ?? undefined,
    professionalProfileId: asNullableString(raw.professionalProfileId),
    professionalType: asProfessionalType(raw.professionalType),
    licenseNumber: asNullableString(raw.licenseNumber),
    licenseState: asNullableString(raw.licenseState),
    unitId: asNullableString(raw.unitId),
    unitName: asNullableString(raw.unitName),
    status: asString(raw.status, 'active'),
    membershipStatus: asNullableString(raw.membershipStatus) ?? undefined,
    profileStatus: asNullableString(raw.profileStatus) ?? undefined,
    isActive: asBoolean(raw.isActive, true),
    source: asNullableString(raw.source) ?? undefined,
    countsAsDoctor: asBoolean(raw.countsAsDoctor),
  };
}

function normalizeFinancialConfig(
  item: unknown,
  paymentModel: ProgramPaymentModel,
  paymentDescription: string
): ProgramBuilderFinancialConfig {
  const raw = asRecord(item);
  return {
    paymentModel: asPaymentModel(raw.paymentModel ?? paymentModel),
    basePrice: asNumber(raw.basePrice),
    installments: raw.installments === undefined ? undefined : asNumber(raw.installments),
    discountPercent: raw.discountPercent === undefined ? undefined : asNumber(raw.discountPercent),
    description: asString(raw.description, paymentDescription),
  };
}

export interface ProgramDraftValidationIssue {
  field: string;
  message: string;
  blockingForPublish: boolean;
}

function sanitizeText(value: string, maxLength = 240): string {
  const withoutControlCharacters = Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127 ? ' ' : char;
  }).join('');

  return withoutControlCharacters.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeOptionalText(value: string | undefined, maxLength = 500): string {
  return sanitizeText(value ?? '', maxLength);
}

function sanitizeDraft(draft: ProgramBuilderDraft): ProgramBuilderDraft {
  const phases = draft.phases
    .map((phase) => ({
      name: sanitizeText(phase.name, 120),
      durationWeeks: Math.max(0, Math.trunc(asNumber(phase.durationWeeks))),
      description: sanitizeOptionalText(phase.description, 500),
    }))
    .filter((phase) => phase.name !== '' || phase.durationWeeks > 0 || phase.description !== '');

  const includedServices = draft.includedServices
    .map((service) => ({
      label: sanitizeText(service.label, 120),
      quantity: Math.max(0, Math.trunc(asNumber(service.quantity))),
      unit: sanitizeText(service.unit || 'unidade', 40),
    }))
    .filter((service) => service.label !== '');

  const appEntitlements = draft.appEntitlements
    .map((entitlement) => {
      const label = sanitizeText(entitlement.label, 120);
      return {
        key: sanitizeText(entitlement.key || label, 80),
        label,
        enabled: entitlement.enabled,
      };
    })
    .filter((entitlement) => entitlement.key !== '' && entitlement.label !== '');

  const checkinTemplates = draft.checkinTemplates
    .map((template) => ({
      id: sanitizeText(template.id, 120),
      label: sanitizeText(template.label, 120),
      frequency: sanitizeOptionalText(template.frequency, 120),
      channel: template.channel,
      questions: template.questions
        .map((question) => sanitizeOptionalText(question, 240))
        .filter((question) => question !== ''),
    }))
    .filter((template) => template.label !== '');

  const requiredDocuments = draft.requiredDocuments
    .map((document) => ({
      label: sanitizeText(document.label, 160),
      required: document.required,
    }))
    .filter((document) => document.label !== '');

  const team = draft.team
    .map((member) => ({
      id: sanitizeText(member.id, 80),
      name: sanitizeText(member.name, 120),
      role: sanitizeOptionalText(member.role, 120),
      specialty: sanitizeOptionalText(member.specialty, 120),
      email: member.email ? sanitizeOptionalText(member.email, 160) : undefined,
      roleCode: member.roleCode ? sanitizeOptionalText(member.roleCode, 80) : undefined,
      professionalProfileId: member.professionalProfileId
        ? sanitizeText(member.professionalProfileId, 80)
        : null,
      professionalType: member.professionalType ?? null,
      licenseNumber: member.licenseNumber ? sanitizeOptionalText(member.licenseNumber, 80) : null,
      licenseState: member.licenseState ? sanitizeOptionalText(member.licenseState, 2) : null,
      unitId: member.unitId ? sanitizeText(member.unitId, 80) : null,
      unitName: member.unitName ? sanitizeOptionalText(member.unitName, 120) : null,
      status: member.status ? sanitizeOptionalText(member.status, 40) : undefined,
      membershipStatus: member.membershipStatus
        ? sanitizeOptionalText(member.membershipStatus, 40)
        : undefined,
      profileStatus: member.profileStatus
        ? sanitizeOptionalText(member.profileStatus, 40)
        : undefined,
      isActive: member.isActive,
      source: member.source ? sanitizeOptionalText(member.source, 80) : undefined,
      countsAsDoctor: member.countsAsDoctor,
    }))
    .filter((member) => member.id !== '' || member.name !== '');

  return {
    ...draft,
    name: sanitizeText(draft.name, 160),
    objective: sanitizeOptionalText(draft.objective, 1000),
    durationWeeks: Math.max(0, Math.trunc(asNumber(draft.durationWeeks))),
    phases,
    includedServices,
    appEntitlements,
    checkInsTotal: Math.max(0, Math.trunc(asNumber(draft.checkInsTotal))),
    checkInFrequency: sanitizeOptionalText(draft.checkInFrequency, 120),
    checkinTemplates,
    requiredDocuments,
    financial: {
      paymentModel: asPaymentModel(draft.financial.paymentModel),
      basePrice: Math.max(0, asNumber(draft.financial.basePrice)),
      installments:
        draft.financial.installments === undefined
          ? undefined
          : Math.max(0, Math.trunc(asNumber(draft.financial.installments))),
      discountPercent:
        draft.financial.discountPercent === undefined
          ? undefined
          : Math.min(100, Math.max(0, asNumber(draft.financial.discountPercent))),
      description: sanitizeOptionalText(draft.financial.description, 500),
    },
    team,
  };
}

export function validateProgramDraft(draft: ProgramBuilderDraft): ProgramDraftValidationIssue[] {
  const sanitized = sanitizeDraft(draft);
  const issues: ProgramDraftValidationIssue[] = [];

  if (!sanitized.name) {
    issues.push({
      field: 'name',
      message: 'Informe o nome do programa.',
      blockingForPublish: true,
    });
  }
  if (!sanitized.programType) {
    issues.push({
      field: 'programType',
      message: 'Selecione o tipo do programa.',
      blockingForPublish: true,
    });
  }
  if (sanitized.durationWeeks <= 0) {
    issues.push({
      field: 'durationWeeks',
      message: 'Informe uma duracao maior que zero.',
      blockingForPublish: true,
    });
  }
  if (sanitized.phases.length === 0) {
    issues.push({
      field: 'phases',
      message: 'Adicione ao menos uma fase antes de publicar.',
      blockingForPublish: true,
    });
  }
  if (sanitized.phases.some((phase) => !phase.name || phase.durationWeeks <= 0)) {
    issues.push({
      field: 'phases',
      message: 'Cada fase precisa de nome e duracao maior que zero.',
      blockingForPublish: true,
    });
  }
  if (sanitized.includedServices.length === 0) {
    issues.push({
      field: 'includedServices',
      message: 'Adicione ao menos um servico incluido.',
      blockingForPublish: true,
    });
  }
  if (sanitized.includedServices.some((service) => !service.label || service.quantity <= 0)) {
    issues.push({
      field: 'includedServices',
      message: 'Cada servico precisa de nome e quantidade maior que zero.',
      blockingForPublish: true,
    });
  }
  if (sanitized.checkInsTotal > 0 && !sanitized.checkInFrequency) {
    issues.push({
      field: 'checkInFrequency',
      message: 'Informe a frequencia dos check-ins configurados.',
      blockingForPublish: true,
    });
  }
  if (sanitized.financial.basePrice > 0 && sanitized.financial.paymentModel === 'parcelado') {
    const installments = sanitized.financial.installments ?? 0;
    if (installments <= 0) {
      issues.push({
        field: 'financial.installments',
        message: 'Informe parcelas para modelo parcelado.',
        blockingForPublish: true,
      });
    }
  }

  return issues;
}

function normalizeProgram(item: unknown): ClinicProgram {
  const raw = asRecord(item);
  const paymentModel = asPaymentModel(raw.paymentModel);
  const paymentDescription = asString(raw.paymentDescription);
  const checkinTemplates = Array.isArray(raw.checkinTemplates)
    ? raw.checkinTemplates.map(normalizeCheckinTemplate)
    : [];
  return {
    id: asString(raw.id),
    name: asString(raw.name, 'Programa'),
    programType: asProgramType(raw.programType),
    objective: asString(raw.objective),
    durationWeeks: asNumber(raw.durationWeeks),
    status: asStatus(raw.status),
    phases: Array.isArray(raw.phases) ? raw.phases.map(normalizePhase) : [],
    includedServices: Array.isArray(raw.includedServices)
      ? raw.includedServices.map(normalizeService)
      : [],
    checkInsTotal: asNumber(raw.checkInsTotal, checkinTemplates.length),
    checkInFrequency: asString(raw.checkInFrequency, 'Sem check-ins'),
    checkinTemplates,
    appEntitlements: Array.isArray(raw.appEntitlements)
      ? raw.appEntitlements.map(normalizeEntitlement)
      : [],
    requiredDocuments: Array.isArray(raw.requiredDocuments)
      ? raw.requiredDocuments.map(normalizeRequiredDocument)
      : [],
    team: Array.isArray(raw.team) ? raw.team.map(normalizeTeamMember) : [],
    paymentModel,
    paymentDescription,
    financialConfig: normalizeFinancialConfig(
      raw.financialConfig,
      paymentModel,
      paymentDescription
    ),
    activePatients: asNumber(raw.activePatients),
    createdAt: asString(raw.createdAt),
    updatedAt: asString(raw.updatedAt),
    color: asString(raw.color, 'teal'),
  };
}

function normalizeSummary(item: unknown, programs: ClinicProgram[]): ClinicProgramsSummary {
  const raw = asRecord(item);
  return {
    total: asNumber(raw.total, programs.length),
    active: asNumber(raw.active, programs.filter((program) => program.status === 'ativo').length),
    draft: asNumber(raw.draft, programs.filter((program) => program.status === 'rascunho').length),
    archived: asNumber(
      raw.archived,
      programs.filter((program) => program.status === 'arquivado').length
    ),
    activePatients: asNumber(
      raw.activePatients,
      programs.reduce((sum, program) => sum + program.activePatients, 0)
    ),
  };
}

function serviceError(error: unknown, fallback: string): SafeServiceError {
  const raw = asRecord(error);
  return {
    message: asString(raw.message, fallback),
    code: typeof raw.code === 'string' ? raw.code : undefined,
    details: typeof raw.details === 'string' ? raw.details : undefined,
  };
}

export function createInitialProgramBuilderDraft(): ProgramBuilderDraft {
  return {
    name: '',
    programType: '',
    objective: '',
    durationWeeks: 12,
    color: 'teal',
    status: 'rascunho',
    phases: [
      {
        name: 'Fase 1 - Avaliacao',
        durationWeeks: 2,
        description: 'Avaliacao inicial, exames e definicao de metas.',
      },
      {
        name: 'Fase 2 - Intervencao',
        durationWeeks: 8,
        description: 'Protocolo principal com acompanhamento intensivo.',
      },
      {
        name: 'Fase 3 - Consolidacao',
        durationWeeks: 2,
        description: 'Revisao de resultados e plano de manutencao.',
      },
    ],
    includedServices: [
      { label: 'Consultas medicas', quantity: 4, unit: 'sessoes' },
      { label: 'Sessoes de nutricao', quantity: 4, unit: 'sessoes' },
      { label: 'Bioimpedancia', quantity: 2, unit: 'avaliacoes' },
    ],
    appEntitlements: [
      { key: 'chat', label: 'Chat com equipe', enabled: true },
      { key: 'plano_alimentar', label: 'Plano alimentar digital', enabled: true },
      { key: 'checkin', label: 'Check-in semanal', enabled: true },
      { key: 'comunidade', label: 'Comunidade', enabled: false },
      { key: 'receitas', label: 'Biblioteca de receitas', enabled: false },
      { key: 'progresso', label: 'Graficos de progresso', enabled: true },
      { key: 'notificacoes', label: 'Notificacoes push', enabled: true },
      { key: 'telemedicina', label: 'Telemedicina', enabled: false },
    ],
    checkInsTotal: 12,
    checkInFrequency: 'Semanal via app',
    checkinTemplates: [],
    requiredDocuments: [
      { label: 'Contrato de prestacao de servicos', required: true },
      { label: 'Termo de consentimento informado', required: true },
      { label: 'Anamnese clinica', required: true },
      { label: 'Exames pre-tratamento', required: false },
    ],
    financial: {
      paymentModel: 'parcelado',
      basePrice: 0,
      installments: 12,
      discountPercent: 0,
      description: '',
    },
    team: [],
  };
}

export function programToBuilderDraft(program: ClinicProgram): ProgramBuilderDraft {
  return {
    id: program.id,
    name: program.name,
    programType: program.programType,
    objective: program.objective,
    durationWeeks: program.durationWeeks,
    color: program.color,
    status: program.status,
    phases: program.phases,
    includedServices: program.includedServices,
    appEntitlements: program.appEntitlements,
    checkInsTotal: program.checkInsTotal,
    checkInFrequency: program.checkInFrequency,
    checkinTemplates: program.checkinTemplates ?? [],
    requiredDocuments: program.requiredDocuments,
    financial:
      program.financialConfig ??
      normalizeFinancialConfig({}, program.paymentModel, program.paymentDescription),
    team: program.team ?? [],
  };
}

export async function getClinicPrograms(): Promise<{
  data: ClinicProgramsPayload | null;
  error: SafeServiceError | null;
}> {
  try {
    if (isMockEnabled()) {
      const { mockClinicPrograms } = await import('@/data/mockData');
      const programs = mockClinicPrograms.map(normalizeProgram);
      return {
        data: {
          programs,
          summary: normalizeSummary({}, programs),
          lastCheckedAt: new Date().toISOString(),
        },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_clinic_programs');
    if (error) return { data: null, error: serviceError(error, 'Falha ao carregar programas.') };

    const payload = asRecord(data);
    const programs = Array.isArray(payload.programs) ? payload.programs.map(normalizeProgram) : [];
    return {
      data: {
        programs,
        summary: normalizeSummary(payload.summary, programs),
        lastCheckedAt: asString(payload.lastCheckedAt),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao carregar programas.') };
  }
}

export async function getProgramBuilderOptions(): Promise<{
  data: ProgramBuilderOptions | null;
  error: SafeServiceError | null;
}> {
  try {
    if (isMockEnabled()) {
      const { mockBuilderTeamMembers, mockCheckinTemplates } =
        await import('@/data/mockBuilderData');
      return {
        data: {
          teamMembers: mockBuilderTeamMembers,
          checkinTemplates: mockCheckinTemplates,
        },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_program_builder_options');
    if (error)
      return { data: null, error: serviceError(error, 'Falha ao carregar opcoes do builder.') };

    const payload = asRecord(data);
    return {
      data: {
        teamMembers: Array.isArray(payload.teamMembers)
          ? payload.teamMembers.map(normalizeTeamMember)
          : [],
        checkinTemplates: Array.isArray(payload.checkinTemplates)
          ? payload.checkinTemplates.map(normalizeCheckinTemplate)
          : [],
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao carregar opcoes do builder.') };
  }
}

export async function saveProgramDraft(
  draft: ProgramBuilderDraft,
  publish = false
): Promise<{ data: ProgramMutationResult | null; error: SafeServiceError | null }> {
  try {
    const sanitizedDraft = sanitizeDraft(draft);
    const validationIssues = validateProgramDraft(sanitizedDraft);
    const blockingIssues = publish
      ? validationIssues.filter((issue) => issue.blockingForPublish)
      : validationIssues.filter((issue) => issue.field === 'name' || issue.field === 'programType');

    if (blockingIssues.length > 0) {
      return { data: null, error: { message: blockingIssues[0].message } };
    }

    if (isMockEnabled()) {
      return {
        data: {
          id: sanitizedDraft.id ?? `mock-program-${Date.now()}`,
          status: publish ? 'ativo' : sanitizedDraft.status,
          published: publish,
        },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('upsert_program_from_builder', {
      p_draft: sanitizedDraft,
      p_publish: publish,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao salvar programa.') };

    const result = asRecord(data);
    return {
      data: {
        id: asString(result.id),
        status: asStatus(result.status),
        published: asBoolean(result.published, publish),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao salvar programa.') };
  }
}

export async function setProgramStatus(
  programId: string,
  status: ProgramStatus
): Promise<{ data: ProgramMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (!programId.trim()) {
      return { data: null, error: { message: 'Programa obrigatorio.' } };
    }
    if (isMockEnabled()) {
      return { data: { id: programId, status }, error: null };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('update_program_status', {
      p_program_id: programId,
      p_status: status,
    });
    if (error)
      return { data: null, error: serviceError(error, 'Falha ao alterar status do programa.') };

    const result = asRecord(data);
    return { data: { id: asString(result.id, programId), status }, error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao alterar status do programa.') };
  }
}

export async function cloneProgram(
  programId: string
): Promise<{ data: ProgramMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (!programId.trim()) {
      return { data: null, error: { message: 'Programa obrigatorio.' } };
    }
    if (isMockEnabled()) {
      return { data: { id: `mock-program-clone-${Date.now()}`, status: 'rascunho' }, error: null };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('clone_program', { p_program_id: programId });
    if (error) return { data: null, error: serviceError(error, 'Falha ao clonar programa.') };

    const result = asRecord(data);
    return { data: { id: asString(result.id), status: 'rascunho' }, error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao clonar programa.') };
  }
}

export async function enrollPatientInProgram(
  patientId: string,
  programId: string,
  startDate?: string
): Promise<{ data: ProgramMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (!patientId.trim() || !programId.trim()) {
      return { data: null, error: { message: 'Paciente e programa sao obrigatorios.' } };
    }
    if (startDate && Number.isNaN(Date.parse(startDate))) {
      return { data: null, error: { message: 'Data de inicio invalida.' } };
    }
    if (isMockEnabled()) {
      return {
        data: {
          id: `mock-enrollment-${Date.now()}`,
          status: 'ativo',
          checkinsCreated: 0,
          documentTasksCreated: 0,
        },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('enroll_patient_in_program', {
      p_patient_id: patientId,
      p_program_id: programId,
      ...(startDate ? { p_start_date: startDate } : {}),
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao matricular paciente.') };

    const result = asRecord(data);
    return {
      data: {
        id: asString(result.id),
        status: 'ativo',
        checkinsCreated: asNumber(result.checkinsCreated, asNumber(result.checkins_created)),
        appointmentId: asString(result.appointmentId, asString(result.appointment_id)),
        invoiceId: asString(result.invoiceId, asString(result.invoice_id)),
        documentTasksCreated: asNumber(
          result.documentTasksCreated,
          asNumber(result.document_tasks_created)
        ),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao matricular paciente.') };
  }
}

export async function updatePatientPackageStatus(
  enrollmentId: string,
  status: 'ativo' | 'pausado' | 'concluido' | 'cancelado',
  reason?: string,
  extendWeeks = 0
): Promise<{ data: ProgramMutationResult | null; error: SafeServiceError | null }> {
  try {
    if (!enrollmentId.trim()) {
      return { data: null, error: { message: 'Pacote obrigatorio.' } };
    }
    if (!['ativo', 'pausado', 'concluido', 'cancelado'].includes(status)) {
      return { data: null, error: { message: 'Status de pacote invalido.' } };
    }
    if (!Number.isFinite(extendWeeks) || extendWeeks < 0 || extendWeeks > 104) {
      return { data: null, error: { message: 'Extensao do pacote invalida.' } };
    }
    if (isMockEnabled()) {
      return { data: { id: enrollmentId, status }, error: null };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('update_patient_package_status', {
      p_enrollment_id: enrollmentId,
      p_status: status,
      p_reason: reason?.trim() || null,
      p_extend_weeks: Math.round(extendWeeks),
    });
    if (error)
      return { data: null, error: serviceError(error, 'Falha ao atualizar pacote do paciente.') };

    const result = asRecord(data);
    const nextStatus = asString(result.status, status) as NonNullable<
      ProgramMutationResult['status']
    >;
    return {
      data: {
        id: asString(result.id, enrollmentId),
        status: nextStatus,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao atualizar pacote do paciente.') };
  }
}
