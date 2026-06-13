import { isMockDataEnabled } from '@/lib/mockMode';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export type ServiceEnvelope<T> = Promise<{ data: T | null; error: SafeServiceError | null }>;

export type SafeServiceError = {
  message: string;
  code?: string;
};

export type CrmLeadStatus = 'open' | 'converted' | 'lost' | 'archived';
export type CrmTaskStatus = 'open' | 'done' | 'cancelled' | 'overdue';

export type CrmStage = {
  id: string;
  code: string;
  label: string;
  position: number;
  isTerminal: boolean;
};

export type CrmLead = {
  id: string;
  status: CrmLeadStatus;
  stageId: string | null;
  stageLabel: string | null;
  unitId: string | null;
  source: string | null;
  campaign: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  ownerUserId: string | null;
  convertedPatientId?: string | null;
  contactPreference?: string | null;
  contactConsent: boolean;
  consentPurpose?: string | null;
  optOutAt?: string | null;
  retentionExpiresAt?: string | null;
  nextFollowUpAt: string | null;
  lostReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmActivity = {
  id: string;
  activityType: string;
  title: string;
  description: string | null;
  actorUserId: string | null;
  occurredAt: string;
};

export type CrmTask = {
  id: string;
  assignedTo: string | null;
  title: string;
  dueAt: string | null;
  status: CrmTaskStatus;
  completedAt: string | null;
  createdAt: string;
};

export type CrmConsent = {
  id: string;
  channel: string;
  purpose: string;
  status: string;
  legalBasis: string | null;
  capturedAt: string;
  expiresAt: string | null;
};

export type CrmLeadDetail = {
  lead: CrmLead;
  activities: CrmActivity[];
  tasks: CrmTask[];
  consents: CrmConsent[];
  attachments: unknown[];
};

export type CrmPipeline = {
  stages: CrmStage[];
  leads: CrmLead[];
  limit: number;
};

export type CreateCrmLeadInput = {
  fullName: string;
  email?: string;
  phone?: string;
  source?: string;
  campaign?: string;
  contactPreference?: string;
  contactConsent?: boolean;
  consentPurpose?: string;
  nextFollowUpAt?: string;
  stageCode?: string;
};

export type UpdateCrmLeadInput = Partial<CreateCrmLeadInput> & {
  ownerUserId?: string;
};

export type ConvertCrmLeadInput = {
  createAppointment?: boolean;
  scheduledAt?: string;
  appointmentType?: string;
  location?: string;
};

export type ConvertCrmLeadResult = {
  leadId: string;
  patientId: string | null;
  appointmentId: string | null;
  idempotent: boolean;
  status: 'converted' | 'failed';
  reason?: string;
};

const MOCK_STAGES: CrmStage[] = [
  { id: 'mock-stage-novo', code: 'novo', label: 'Novo', position: 10, isTerminal: false },
  { id: 'mock-stage-contato', code: 'contato', label: 'Contato', position: 20, isTerminal: false },
  {
    id: 'mock-stage-qualificado',
    code: 'qualificado',
    label: 'Qualificado',
    position: 30,
    isTerminal: false,
  },
  {
    id: 'mock-stage-convertido',
    code: 'convertido',
    label: 'Convertido',
    position: 90,
    isTerminal: true,
  },
];

const MOCK_LEADS: CrmLead[] = [
  {
    id: 'mock-lead-1',
    status: 'open',
    stageId: 'mock-stage-novo',
    stageLabel: 'Novo',
    unitId: null,
    source: 'Instagram',
    campaign: 'Junho saudável',
    fullName: 'Lead Demonstração',
    email: 'lead.demo@example.test',
    phone: '(11) 90000-0000',
    ownerUserId: null,
    contactConsent: true,
    consentPurpose: 'Contato comercial sobre avaliacao inicial',
    nextFollowUpAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const SEARCH_WILDCARDS = /[%_]/g;

function removeControlCharacters(value: string): string {
  return Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('');
}

function cleanText(value: unknown, maxLength = 160): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = removeControlCharacters(value).replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function cleanSearchTerm(value: unknown): string | undefined {
  const cleaned = cleanText(value, 80)?.replace(SEARCH_WILDCARDS, '');
  return cleaned || undefined;
}

function cleanDateTime(value: unknown): string | undefined {
  const cleaned = cleanText(value, 80);
  if (!cleaned) return undefined;
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function cleanUuid(value: unknown): string | undefined {
  const cleaned = cleanText(value, 80);
  return cleaned &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
    ? cleaned
    : undefined;
}

function compactPayload<T extends Record<string, unknown>>(payload: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined && value !== null && value !== ''
    )
  ) as Partial<T>;
}

function normalizeLeadPayload(input: CreateCrmLeadInput | UpdateCrmLeadInput) {
  return compactPayload({
    fullName: cleanText(input.fullName, 120),
    email: cleanText(input.email, 160),
    phone: cleanText(input.phone, 40),
    source: cleanText(input.source, 80),
    campaign: cleanText(input.campaign, 120),
    contactPreference: cleanText(input.contactPreference, 40),
    contactConsent: typeof input.contactConsent === 'boolean' ? input.contactConsent : undefined,
    consentPurpose: cleanText(input.consentPurpose, 180),
    nextFollowUpAt: cleanDateTime(input.nextFollowUpAt),
    stageCode: 'stageCode' in input ? cleanText(input.stageCode, 40) : undefined,
    ownerUserId: 'ownerUserId' in input ? cleanUuid(input.ownerUserId) : undefined,
  });
}

function isMockExplicitlyEnabled() {
  return isMockDataEnabled();
}

function asServiceError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) return { message: error.message || fallback };
  if (error && typeof error === 'object' && 'message' in error) {
    return {
      message: String((error as { message?: unknown }).message ?? fallback),
      code:
        'code' in error && typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : undefined,
    };
  }
  return { message: fallback };
}

function normalizeStages(rows: unknown[]): CrmStage[] {
  return rows
    .map((row) => {
      const stage = row as Record<string, unknown>;
      return {
        id: String(stage.id),
        code: String(stage.code ?? ''),
        label: String(stage.label ?? ''),
        position: Number(stage.position ?? 0),
        isTerminal: Boolean(stage.is_terminal),
      };
    })
    .sort((a, b) => a.position - b.position);
}

async function getStages(): Promise<CrmStage[]> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('crm_pipeline_stages')
    .select('id, code, label, position, is_terminal')
    .eq('status', 'active')
    .order('position', { ascending: true });

  if (error) throw error;
  return normalizeStages(data ?? []);
}

export async function getCrmPipeline(filters?: {
  status?: string;
  stageId?: string;
  search?: string;
}): ServiceEnvelope<CrmPipeline> {
  if (isMockExplicitlyEnabled()) {
    return { data: { stages: MOCK_STAGES, leads: MOCK_LEADS, limit: 50 }, error: null };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const [{ data: rpcData, error }, stages] = await Promise.all([
      supabase.rpc('list_crm_leads', {
        p_status: cleanText(filters?.status, 30) || null,
        p_stage_id: cleanUuid(filters?.stageId) || null,
        p_search: cleanSearchTerm(filters?.search) || null,
        p_limit: 100,
      }),
      getStages(),
    ]);

    if (error) throw error;
    const payload = (rpcData ?? {}) as { leads?: CrmLead[]; limit?: number };
    return {
      data: { stages, leads: payload.leads ?? [], limit: payload.limit ?? 100 },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel carregar o CRM.') };
  }
}

export async function getCrmLeadDetail(leadId: string): ServiceEnvelope<CrmLeadDetail> {
  if (isMockExplicitlyEnabled()) {
    const lead = MOCK_LEADS.find((item) => item.id === leadId) ?? MOCK_LEADS[0];
    return {
      data: {
        lead,
        activities: [
          {
            id: 'mock-activity-1',
            activityType: 'note',
            title: 'Lead criado',
            description: 'Registro demonstrativo sem dados sensiveis reais.',
            actorUserId: null,
            occurredAt: lead.createdAt,
          },
        ],
        tasks: [],
        consents: [
          {
            id: 'mock-consent-1',
            channel: 'whatsapp',
            purpose: 'Contato comercial sobre avaliacao inicial',
            status: 'granted',
            legalBasis: 'consentimento',
            capturedAt: lead.createdAt,
            expiresAt: null,
          },
        ],
        attachments: [],
      },
      error: null,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_crm_lead_detail', { p_lead_id: leadId });
    if (error) throw error;
    return { data: data as CrmLeadDetail, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel carregar o lead.') };
  }
}

export async function createCrmLead(input: CreateCrmLeadInput): ServiceEnvelope<{ id: string }> {
  if (isMockExplicitlyEnabled()) return { data: { id: 'mock-lead-created' }, error: null };

  try {
    const supabase = createBrowserSupabaseClient();
    const payload = normalizeLeadPayload(input);
    const { data, error } = await supabase.rpc('create_crm_lead', { p_payload: payload });
    if (error) throw error;
    return { data: data as { id: string }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel criar o lead.') };
  }
}

export async function updateCrmLead(
  leadId: string,
  input: UpdateCrmLeadInput
): ServiceEnvelope<{ id: string }> {
  if (isMockExplicitlyEnabled()) return { data: { id: leadId }, error: null };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('update_crm_lead', {
      p_lead_id: leadId,
      p_payload: normalizeLeadPayload(input),
    });
    if (error) throw error;
    return { data: data as { id: string }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel atualizar o lead.') };
  }
}

export async function moveCrmLeadStage(
  leadId: string,
  stageId: string,
  status?: CrmLeadStatus
): ServiceEnvelope<{ id: string }> {
  if (isMockExplicitlyEnabled()) return { data: { id: leadId }, error: null };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('move_crm_lead_stage', {
      p_lead_id: leadId,
      p_stage_id: stageId,
      p_status: status ?? null,
    });
    if (error) throw error;
    return { data: data as { id: string }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel mover o lead.') };
  }
}

export async function recordCrmLeadActivity(
  leadId: string,
  title: string,
  description?: string
): ServiceEnvelope<{ id: string }> {
  if (isMockExplicitlyEnabled()) return { data: { id: 'mock-activity-created' }, error: null };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('record_crm_lead_activity', {
      p_lead_id: leadId,
      p_activity_type: 'note',
      p_title: cleanText(title, 160) || 'Atividade registrada',
      p_description: cleanText(description, 1000) || null,
      p_metadata: {},
    });
    if (error) throw error;
    return { data: data as { id: string }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel registrar atividade.') };
  }
}

export async function createCrmLeadTask(
  leadId: string,
  input: { title: string; dueAt?: string }
): ServiceEnvelope<{ id: string }> {
  if (isMockExplicitlyEnabled()) return { data: { id: 'mock-task-created' }, error: null };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('create_crm_lead_task', {
      p_lead_id: leadId,
      p_payload: compactPayload({
        title: cleanText(input.title, 160),
        dueAt: cleanDateTime(input.dueAt),
      }),
    });
    if (error) throw error;
    return { data: data as { id: string }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel criar tarefa.') };
  }
}

export async function convertCrmLeadToPatient(
  leadId: string,
  input: ConvertCrmLeadInput
): ServiceEnvelope<ConvertCrmLeadResult> {
  if (isMockExplicitlyEnabled()) {
    return {
      data: {
        leadId,
        patientId: 'mock-patient-from-lead',
        appointmentId: input.createAppointment ? 'mock-appointment-from-lead' : null,
        idempotent: false,
        status: 'converted',
      },
      error: null,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('convert_crm_lead_to_patient', {
      p_lead_id: leadId,
      p_payload: compactPayload({
        createAppointment: input.createAppointment === true,
        scheduledAt: cleanDateTime(input.scheduledAt),
        appointmentType: cleanText(input.appointmentType, 80),
        location: cleanText(input.location, 120),
      }),
    });
    if (error) throw error;
    return { data: data as ConvertCrmLeadResult, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel converter o lead.') };
  }
}

export async function emitCrmOperationalNotifications(): ServiceEnvelope<{
  overdueTasks: number;
  stalledLeads: number;
}> {
  if (isMockExplicitlyEnabled()) return { data: { overdueTasks: 0, stalledLeads: 0 }, error: null };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('emit_crm_operational_notifications');
    if (error) throw error;
    return { data: data as { overdueTasks: number; stalledLeads: number }, error: null };
  } catch (error) {
    return {
      data: null,
      error: asServiceError(error, 'Nao foi possivel atualizar alertas do CRM.'),
    };
  }
}
