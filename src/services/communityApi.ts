import { isMockDataEnabled } from '@/lib/mockMode';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export type CommunityModerationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'hidden'
  | 'removed'
  | string;

export interface SafeCommunityError {
  message: string;
  code?: string;
}

export interface PatientCommunityProgram {
  id: string;
  name: string;
  enrollmentId?: string | null;
  status: string;
  moderationEnabled: boolean;
  anonymousByDefault: boolean;
}

export interface CommunityWeeklyPrompt {
  id: string;
  programId?: string | null;
  programName?: string | null;
  title: string;
  body: string;
  startsOn?: string | null;
  endsOn?: string | null;
  status: string;
}

export interface PatientCommunityPost {
  id: string;
  programId: string;
  patientId?: string | null;
  authorLabel: string;
  body: string;
  status: CommunityModerationStatus;
  riskFlag: boolean;
  moderationReason?: string | null;
  isOwn: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  commentCount: number;
  reportCount: number;
}

export interface PatientCommunityComment {
  id: string;
  postId: string;
  programId: string;
  patientId?: string | null;
  authorLabel: string;
  body: string;
  status: CommunityModerationStatus;
  riskFlag: boolean;
  moderationReason?: string | null;
  isOwn: boolean;
  createdAt?: string | null;
}

export interface PatientCommunityFeed {
  accessStatus: 'enabled' | 'blocked' | string;
  selectedPatientId?: string | null;
  selectedProgramId?: string | null;
  programs: PatientCommunityProgram[];
  prompt?: CommunityWeeklyPrompt | null;
  posts: PatientCommunityPost[];
  guidelines: string[];
}

export interface ClinicCommunityProgram {
  id: string;
  name: string;
  status: string;
  communityEnabled: boolean;
}

export interface ClinicCommunitySummary {
  pending: number;
  approvedToday: number;
  reported: number;
}

export interface ClinicCommunityModerationItem {
  itemType: 'post' | 'comment';
  id: string;
  postId: string;
  programId: string;
  programName: string;
  patientId?: string | null;
  authorLabel: string;
  body: string;
  parentBody?: string | null;
  status: CommunityModerationStatus;
  riskFlag: boolean;
  moderationReason?: string | null;
  reportCount: number;
  createdAt?: string | null;
}

export interface ClinicCommunityModerationPayload {
  summary: ClinicCommunitySummary;
  programs: ClinicCommunityProgram[];
  items: ClinicCommunityModerationItem[];
  prompts: CommunityWeeklyPrompt[];
  statusFilter: string;
  selectedProgramId?: string | null;
}

export type ClinicCommunityFilter = 'pending' | 'approved' | 'rejected' | 'reported';
export type CommunityItemType = 'post' | 'comment';
export type CommunityModerationAction = 'approve' | 'reject' | 'hide' | 'remove';

const DEFAULT_GUIDELINES = [
  'Compartilhe experiencias gerais do programa.',
  'Nao publique dados sensiveis, urgencias medicas ou informacoes de terceiros.',
  'Conteudos podem passar por moderacao antes de aparecer.',
];

function isMockEnabled() {
  return isMockDataEnabled();
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

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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

function sanitizeText(value: string, maxLength: number): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : char;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function safeError(error: unknown, fallback: string): SafeCommunityError {
  const record = asRecord(error);
  const code = asNullableString(record.code) ?? undefined;
  if (code === '42501') return { message: 'Acesso nao autorizado para esta comunidade.', code };
  if (code === '22023') return { message: fallback, code };
  if (code === 'P0002') return { message: 'Conteudo nao encontrado ou indisponivel.', code };
  return { message: fallback, code };
}

function normalizeGuidelines(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_GUIDELINES;
  const normalized = value
    .map((item) => sanitizeText(String(item ?? ''), 180))
    .filter(Boolean)
    .slice(0, 5);
  return normalized.length > 0 ? normalized : DEFAULT_GUIDELINES;
}

function normalizeProgram(value: unknown): PatientCommunityProgram | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    name: asString(record.name, 'Programa'),
    enrollmentId: asNullableString(record.enrollmentId),
    status: asString(record.status, 'ativo'),
    moderationEnabled: asBoolean(record.moderationEnabled, true),
    anonymousByDefault: asBoolean(record.anonymousByDefault, false),
  };
}

function normalizePrompt(value: unknown): CommunityWeeklyPrompt | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    programId: asNullableString(record.programId),
    programName: asNullableString(record.programName),
    title: asString(record.title, 'Prompt da semana'),
    body: asString(record.body),
    startsOn: asNullableString(record.startsOn),
    endsOn: asNullableString(record.endsOn),
    status: asString(record.status, 'active'),
  };
}

function normalizePost(value: unknown): PatientCommunityPost | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const programId = asString(record.programId);
  if (!id || !programId) return null;
  return {
    id,
    programId,
    patientId: asNullableString(record.patientId),
    authorLabel: asString(record.authorLabel, 'Participante'),
    body: asString(record.body),
    status: asString(record.status, 'pending'),
    riskFlag: asBoolean(record.riskFlag),
    moderationReason: asNullableString(record.moderationReason),
    isOwn: asBoolean(record.isOwn),
    createdAt: asNullableString(record.createdAt),
    updatedAt: asNullableString(record.updatedAt),
    commentCount: asNumber(record.commentCount),
    reportCount: asNumber(record.reportCount),
  };
}

function normalizeComment(value: unknown): PatientCommunityComment | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const postId = asString(record.postId);
  const programId = asString(record.programId);
  if (!id || !postId || !programId) return null;
  return {
    id,
    postId,
    programId,
    patientId: asNullableString(record.patientId),
    authorLabel: asString(record.authorLabel, 'Participante'),
    body: asString(record.body),
    status: asString(record.status, 'pending'),
    riskFlag: asBoolean(record.riskFlag),
    moderationReason: asNullableString(record.moderationReason),
    isOwn: asBoolean(record.isOwn),
    createdAt: asNullableString(record.createdAt),
  };
}

function normalizeFeed(value: unknown): PatientCommunityFeed {
  const record = asRecord(value);
  return {
    accessStatus: asString(record.accessStatus, 'blocked'),
    selectedPatientId: asNullableString(record.selectedPatientId),
    selectedProgramId: asNullableString(record.selectedProgramId),
    programs: Array.isArray(record.programs)
      ? record.programs
          .map(normalizeProgram)
          .filter((item): item is PatientCommunityProgram => Boolean(item))
      : [],
    prompt: normalizePrompt(record.prompt),
    posts: Array.isArray(record.posts)
      ? record.posts
          .map(normalizePost)
          .filter((item): item is PatientCommunityPost => Boolean(item))
      : [],
    guidelines: normalizeGuidelines(record.guidelines),
  };
}

function normalizeClinicProgram(value: unknown): ClinicCommunityProgram | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    name: asString(record.name, 'Programa'),
    status: asString(record.status, 'ativo'),
    communityEnabled: asBoolean(record.communityEnabled),
  };
}

function normalizeModerationItem(value: unknown): ClinicCommunityModerationItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const itemType = asString(record.itemType) === 'comment' ? 'comment' : 'post';
  const postId = asString(record.postId, id);
  const programId = asString(record.programId);
  if (!id || !programId || !postId) return null;
  return {
    itemType,
    id,
    postId,
    programId,
    programName: asString(record.programName, 'Programa'),
    patientId: asNullableString(record.patientId),
    authorLabel: asString(record.authorLabel, 'Participante'),
    body: asString(record.body),
    parentBody: asNullableString(record.parentBody),
    status: asString(record.status, 'pending'),
    riskFlag: asBoolean(record.riskFlag),
    moderationReason: asNullableString(record.moderationReason),
    reportCount: asNumber(record.reportCount),
    createdAt: asNullableString(record.createdAt),
  };
}

function normalizeClinicPayload(value: unknown): ClinicCommunityModerationPayload {
  const record = asRecord(value);
  const summary = asRecord(record.summary);
  return {
    summary: {
      pending: asNumber(summary.pending),
      approvedToday: asNumber(summary.approvedToday),
      reported: asNumber(summary.reported),
    },
    programs: Array.isArray(record.programs)
      ? record.programs
          .map(normalizeClinicProgram)
          .filter((item): item is ClinicCommunityProgram => Boolean(item))
      : [],
    items: Array.isArray(record.items)
      ? record.items
          .map(normalizeModerationItem)
          .filter((item): item is ClinicCommunityModerationItem => Boolean(item))
      : [],
    prompts: Array.isArray(record.prompts)
      ? record.prompts
          .map(normalizePrompt)
          .filter((item): item is CommunityWeeklyPrompt => Boolean(item))
      : [],
    statusFilter: asString(record.statusFilter, 'pending'),
    selectedProgramId: asNullableString(record.selectedProgramId),
  };
}

function mockFeed(patientId?: string): PatientCommunityFeed {
  return {
    accessStatus: 'enabled',
    selectedPatientId: patientId ?? 'mock-patient',
    selectedProgramId: 'mock-program',
    programs: [
      {
        id: 'mock-program',
        name: 'Programa Metabolico',
        enrollmentId: 'mock-enrollment',
        status: 'ativo',
        moderationEnabled: true,
        anonymousByDefault: false,
      },
    ],
    prompt: {
      id: 'mock-prompt',
      programId: 'mock-program',
      title: 'Vitoria da semana',
      body: 'Qual pequena mudanca ajudou sua rotina nesta semana?',
      startsOn: new Date().toISOString().slice(0, 10),
      status: 'active',
    },
    posts: [
      {
        id: 'mock-post',
        programId: 'mock-program',
        patientId: patientId ?? 'mock-patient',
        authorLabel: 'Participante',
        body: 'Consegui manter os horarios das refeicoes por tres dias seguidos.',
        status: 'approved',
        riskFlag: false,
        isOwn: false,
        createdAt: new Date().toISOString(),
        commentCount: 2,
        reportCount: 0,
      },
    ],
    guidelines: DEFAULT_GUIDELINES,
  };
}

function mockClinicPayload(): ClinicCommunityModerationPayload {
  return {
    summary: { pending: 1, approvedToday: 2, reported: 0 },
    programs: [
      {
        id: 'mock-program',
        name: 'Programa Metabolico',
        status: 'ativo',
        communityEnabled: true,
      },
    ],
    items: [
      {
        itemType: 'post',
        id: 'mock-pending-post',
        postId: 'mock-pending-post',
        programId: 'mock-program',
        programName: 'Programa Metabolico',
        authorLabel: 'Participante',
        body: 'Gostaria de saber como voces organizam a agua ao longo do dia.',
        status: 'pending',
        riskFlag: false,
        reportCount: 0,
        createdAt: new Date().toISOString(),
      },
    ],
    prompts: [],
    statusFilter: 'pending',
  };
}

export async function getPatientCommunityFeed(
  patientId?: string,
  programId?: string | null
): Promise<{ data: PatientCommunityFeed | null; error: SafeCommunityError | null }> {
  try {
    if (isMockEnabled()) return { data: mockFeed(patientId), error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_community_feed', {
      p_patient_id: asUuid(patientId) ?? null,
      p_program_id: asUuid(programId) ?? null,
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao carregar comunidade.') };

    return { data: normalizeFeed(data), error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao carregar comunidade.') };
  }
}

export async function submitPatientCommunityPost(
  patientId: string,
  programId: string,
  body: string
): Promise<{ data: PatientCommunityPost | null; error: SafeCommunityError | null }> {
  const safeBody = sanitizeText(body, 1200);
  const safePatientId = asUuid(patientId);
  const safeProgramId = asUuid(programId);
  if (((!safePatientId || !safeProgramId) && !isMockEnabled()) || safeBody.length < 3) {
    return { data: null, error: { message: 'Escreva uma publicacao valida.' } };
  }

  try {
    if (isMockEnabled()) {
      return {
        data: {
          id: `mock-post-${Date.now()}`,
          programId,
          patientId,
          authorLabel: 'Participante',
          body: safeBody,
          status: 'pending',
          riskFlag: false,
          isOwn: true,
          createdAt: new Date().toISOString(),
          commentCount: 0,
          reportCount: 0,
        },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('submit_patient_community_post', {
      p_patient_id: safePatientId,
      p_program_id: safeProgramId,
      p_body: safeBody,
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao enviar publicacao.') };

    const post = normalizePost(data);
    return {
      data: post,
      error: post ? null : { message: 'Contrato invalido ao enviar publicacao.' },
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao enviar publicacao.') };
  }
}

export async function getPatientCommunityComments(
  postId: string
): Promise<{ data: PatientCommunityComment[] | null; error: SafeCommunityError | null }> {
  const safePostId = asUuid(postId);
  if (!safePostId && !isMockEnabled()) {
    return { data: null, error: { message: 'Publicacao invalida.' } };
  }

  try {
    if (isMockEnabled()) {
      return {
        data: [
          {
            id: 'mock-comment',
            postId,
            programId: 'mock-program',
            authorLabel: 'Participante',
            body: 'Tambem uso uma garrafa marcada por horarios.',
            status: 'approved',
            riskFlag: false,
            isOwn: false,
            createdAt: new Date().toISOString(),
          },
        ],
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_community_comments', {
      p_post_id: safePostId,
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao carregar comentarios.') };

    const payload = asRecord(data);
    const comments = Array.isArray(payload.comments)
      ? payload.comments
          .map(normalizeComment)
          .filter((item): item is PatientCommunityComment => Boolean(item))
      : [];
    return { data: comments, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao carregar comentarios.') };
  }
}

export async function submitPatientCommunityComment(
  postId: string,
  body: string
): Promise<{ data: PatientCommunityComment | null; error: SafeCommunityError | null }> {
  const safeBody = sanitizeText(body, 800);
  const safePostId = asUuid(postId);
  if ((!safePostId && !isMockEnabled()) || safeBody.length < 2) {
    return { data: null, error: { message: 'Escreva um comentario valido.' } };
  }

  try {
    if (isMockEnabled()) {
      return {
        data: {
          id: `mock-comment-${Date.now()}`,
          postId,
          programId: 'mock-program',
          authorLabel: 'Participante',
          body: safeBody,
          status: 'pending',
          riskFlag: false,
          isOwn: true,
          createdAt: new Date().toISOString(),
        },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('submit_patient_community_comment', {
      p_post_id: safePostId,
      p_body: safeBody,
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao enviar comentario.') };

    const comment = normalizeComment(data);
    return {
      data: comment,
      error: comment ? null : { message: 'Contrato invalido ao enviar comentario.' },
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao enviar comentario.') };
  }
}

export async function reportCommunityContent(
  itemType: CommunityItemType,
  itemId: string,
  reason: string
): Promise<{ data: { id: string; status: string } | null; error: SafeCommunityError | null }> {
  const safeReason = sanitizeText(reason, 500);
  const safeItemId = asUuid(itemId);
  if ((!safeItemId && !isMockEnabled()) || !safeReason) {
    return { data: null, error: { message: 'Informe um motivo para a denuncia.' } };
  }

  try {
    if (isMockEnabled()) return { data: { id: 'mock-report', status: 'open' }, error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('report_community_content', {
      p_item_type: itemType,
      p_item_id: safeItemId,
      p_reason: safeReason,
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao registrar denuncia.') };
    const record = asRecord(data);
    return {
      data: { id: asString(record.id), status: asString(record.status, 'open') },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao registrar denuncia.') };
  }
}

export async function getClinicCommunityModeration(
  statusFilter: ClinicCommunityFilter,
  programId?: string | null
): Promise<{ data: ClinicCommunityModerationPayload | null; error: SafeCommunityError | null }> {
  try {
    if (isMockEnabled()) return { data: mockClinicPayload(), error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_clinic_community_moderation', {
      p_status_filter: statusFilter,
      p_program_id: asUuid(programId) ?? null,
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao carregar moderacao.') };
    return { data: normalizeClinicPayload(data), error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao carregar moderacao.') };
  }
}

export async function moderateCommunityItem(
  itemType: CommunityItemType,
  itemId: string,
  action: CommunityModerationAction,
  reason?: string
): Promise<{ data: { id: string; status: string } | null; error: SafeCommunityError | null }> {
  const safeReason = sanitizeText(reason ?? '', 500);
  const safeItemId = asUuid(itemId);
  if (
    (!safeItemId && !isMockEnabled()) ||
    !['approve', 'reject', 'hide', 'remove'].includes(action)
  ) {
    return { data: null, error: { message: 'Acao de moderacao invalida.' } };
  }
  if (action !== 'approve' && !safeReason) {
    return { data: null, error: { message: 'Informe o motivo da moderacao.' } };
  }

  try {
    if (isMockEnabled()) return { data: { id: itemId, status: action }, error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('moderate_community_item', {
      p_item_type: itemType,
      p_item_id: safeItemId,
      p_action: action,
      p_reason: safeReason || null,
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao moderar conteudo.') };
    const record = asRecord(data);
    return {
      data: { id: asString(record.id, itemId), status: asString(record.status) },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao moderar conteudo.') };
  }
}

export async function upsertWeeklyPrompt(input: {
  promptId?: string | null;
  programId?: string | null;
  title: string;
  body: string;
  startsOn: string;
  endsOn?: string | null;
}): Promise<{ data: CommunityWeeklyPrompt | null; error: SafeCommunityError | null }> {
  const title = sanitizeText(input.title, 140);
  const body = sanitizeText(input.body, 800);
  if (!title || !body || Number.isNaN(Date.parse(input.startsOn))) {
    return { data: null, error: { message: 'Preencha o prompt da semana.' } };
  }
  if (input.endsOn && Number.isNaN(Date.parse(input.endsOn))) {
    return { data: null, error: { message: 'Data final invalida.' } };
  }

  try {
    if (isMockEnabled()) {
      return {
        data: {
          id: input.promptId ?? `mock-prompt-${Date.now()}`,
          programId: input.programId ?? null,
          title,
          body,
          startsOn: input.startsOn,
          endsOn: input.endsOn ?? null,
          status: 'active',
        },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const safePromptId = asUuid(input.promptId);
    const safeProgramId = asUuid(input.programId);
    const { data, error } = await supabase.rpc('upsert_weekly_prompt', {
      p_prompt_id: safePromptId ?? null,
      p_program_id: safeProgramId ?? null,
      p_title: title,
      p_body: body,
      p_starts_on: input.startsOn,
      p_ends_on: input.endsOn || null,
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao salvar prompt.') };
    const prompt = normalizePrompt(data);
    return {
      data: prompt,
      error: prompt ? null : { message: 'Contrato invalido ao salvar prompt.' },
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao salvar prompt.') };
  }
}
