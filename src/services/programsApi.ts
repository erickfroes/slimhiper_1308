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
  ProgramRequiredDocument,
  ProgramService,
  ProgramStatus,
  ProgramType,
} from '@/domain/types';
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
  status?: ProgramStatus | 'ativo';
  published?: boolean;
  checkinsCreated?: number;
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
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
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
    if (!draft.name.trim()) {
      return { data: null, error: { message: 'Nome do programa obrigatorio.' } };
    }
    if (!draft.programType) {
      return { data: null, error: { message: 'Tipo de programa obrigatorio.' } };
    }

    if (isMockEnabled()) {
      return {
        data: {
          id: draft.id ?? `mock-program-${Date.now()}`,
          status: publish ? 'ativo' : draft.status,
          published: publish,
        },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('upsert_program_from_builder', {
      p_draft: draft,
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
        checkinsCreated: asNumber(result.checkinsCreated),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao matricular paciente.') };
  }
}
