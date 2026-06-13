import type {
  PatientChatAttachment,
  PatientChatMessage,
  PatientChatShortcut,
  PatientChatSummary,
  PatientChatThread,
} from '@/domain/types';
import { isMockDataEnabled } from '@/lib/mockMode';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

export const CHAT_ATTACHMENT_BUCKET = 'chat-attachments';
export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

export interface ChatSendOptions {
  attachment?: File | null;
}

type ChatThreadRow = {
  id: string;
  tenant_id: string;
  patient_id: string;
  status: string | null;
  assigned_to?: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

type ChatMessageRow = {
  id: string;
  sender_user_id: string | null;
  sender_label: string | null;
  body: string;
  metadata: unknown;
  moderation_status?: string | null;
  archived_at?: string | null;
  created_at: string;
};

type ChatAttachmentRow = {
  id: string;
  message_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  status: string | null;
  created_at: string;
};

type PatientTenantRow = {
  tenant_id: string;
};

type PreparedAttachment = {
  id: string;
  bucket: string;
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

const isMockEnabled = () => isMockDataEnabled();
const getSupabaseClient = () => createBrowserSupabaseClient();

async function getMockPatient360(patientId: string) {
  const { getPatient360 } = await import('@/services/mockApi');
  return getPatient360(patientId);
}

function safeErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code = value
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, 80);
  return code || undefined;
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) {
    return { message: fallback, code: safeErrorCode(error.name) };
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const record = error as { code?: unknown; name?: unknown };
    return { message: fallback, code: safeErrorCode(record.code) ?? safeErrorCode(record.name) };
  }
  return { message: fallback };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asAttachmentStatus(value: unknown): PatientChatAttachment['status'] {
  const status = asString(value, 'uploaded');
  if (status === 'pending' || status === 'failed' || status === 'deleted') return status;
  return 'uploaded';
}

function attachmentKind(mimeType: string): PatientChatAttachment['kind'] {
  return mimeType.startsWith('image/') ? 'image' : 'file';
}

function asShortcut(value: unknown): PatientChatShortcut | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const text = asString(record.text);
  if (!id || !text) return null;
  return {
    id,
    title: asString(record.title) || undefined,
    text,
    category: asString(record.category) || undefined,
  };
}

function asResponsibleMember(value: unknown): PatientChatSummary['responsibleTeamMember'] {
  const record = asRecord(value);
  const name = asString(record.name);
  const role = asString(record.role);
  return name || role ? { name: name || 'Equipe', role } : undefined;
}

function asServiceHours(value: unknown): PatientChatSummary['serviceHours'] {
  const record = asRecord(value);
  const days = asString(record.days);
  const start = asString(record.start);
  const end = asString(record.end);
  return days || start || end
    ? {
        days,
        start,
        end,
        timezone: asString(record.timezone) || undefined,
        isAvailable: typeof record.isAvailable === 'boolean' ? record.isAvailable : undefined,
        unavailableMessage: asString(record.unavailableMessage) || undefined,
      }
    : undefined;
}

function asSla(value: unknown): PatientChatSummary['slaExpected'] {
  const record = asRecord(value);
  const label = asString(record.label);
  const note = asString(record.note);
  const status = asString(record.status);
  return label || note
    ? {
        label,
        note,
        status:
          status === 'warning' || status === 'breached'
            ? status
            : status === 'ok'
              ? 'ok'
              : undefined,
        dueAt: asString(record.dueAt) || undefined,
        minutesRemaining:
          typeof record.minutesRemaining === 'number' && Number.isFinite(record.minutesRemaining)
            ? record.minutesRemaining
            : undefined,
      }
    : undefined;
}

function senderType(row: ChatMessageRow): PatientChatMessage['from'] {
  const metadata = asRecord(row.metadata);
  const value = String(metadata.sender_type ?? metadata.from ?? '').toLowerCase();
  return value === 'patient' ? 'patient' : 'staff';
}

function senderLabel(row: ChatMessageRow, from: PatientChatMessage['from']): string {
  const metadata = asRecord(row.metadata);
  return asString(
    row.sender_label,
    asString(metadata.sender_label, from === 'patient' ? 'Paciente' : 'Equipe')
  );
}

function isMessageModerated(row: ChatMessageRow) {
  return row.moderation_status === 'pending_review' || row.moderation_status === 'removed';
}

function visibleMessageText(row: ChatMessageRow) {
  return isMessageModerated(row) ? 'Conteúdo removido ou sob revisão de moderação.' : row.body;
}

function mapAttachment(row: ChatAttachmentRow): PatientChatAttachment {
  const mimeType = asString(row.mime_type, 'application/octet-stream');
  return {
    id: row.id,
    fileName: asString(row.file_name, 'Anexo'),
    mimeType,
    sizeBytes: Math.max(0, Number(row.size_bytes ?? 0)),
    status: asAttachmentStatus(row.status),
    kind: attachmentKind(mimeType),
  };
}

function mapAttachmentsByMessage(rows: ChatAttachmentRow[]) {
  const byMessage = new Map<string, PatientChatAttachment[]>();
  rows.forEach((row) => {
    if (!row.message_id) return;
    const current = byMessage.get(row.message_id) ?? [];
    current.push(mapAttachment(row));
    byMessage.set(row.message_id, current);
  });
  return byMessage;
}

function mapMessages(
  rows: ChatMessageRow[],
  unreadCount: number,
  attachmentRows: ChatAttachmentRow[]
): PatientChatMessage[] {
  const unreadPatientIds = new Set(
    rows
      .filter((row) => senderType(row) === 'patient')
      .slice(Math.max(0, rows.filter((row) => senderType(row) === 'patient').length - unreadCount))
      .map((row) => row.id)
  );
  const attachmentsByMessage = mapAttachmentsByMessage(attachmentRows);

  return rows.map((row) => {
    const from = senderType(row);
    const metadata = asRecord(row.metadata);
    const explicitRead = typeof metadata.read === 'boolean' ? metadata.read : undefined;

    return {
      id: row.id,
      from,
      text: visibleMessageText(row),
      time: row.created_at,
      read: explicitRead ?? (from === 'patient' ? !unreadPatientIds.has(row.id) : true),
      deliveryStatus: 'sent',
      isAutomated: asBoolean(metadata.automated) || asBoolean(metadata.auto_reply),
      attachments: attachmentsByMessage.get(row.id) ?? [],
    };
  });
}

function mapChat(
  thread: ChatThreadRow,
  messageRows: ChatMessageRow[],
  attachmentRows: ChatAttachmentRow[] = [],
  extras: Partial<Pick<PatientChatSummary, 'shortcuts' | 'serviceHours' | 'slaExpected'>> = {}
): PatientChatSummary {
  const unreadCount = Math.max(0, Number(thread.unread_count ?? 0));
  const messages = mapMessages(messageRows, unreadCount, attachmentRows);
  const latestMessage = messageRows.at(-1);
  const metadata = asRecord(thread.metadata);
  const threadSummary: PatientChatThread = {
    id: thread.id,
    date: thread.created_at,
    summary: latestMessage ? visibleMessageText(latestMessage) : 'Conversa sem mensagens.',
    messageCount: messageRows.length,
  };

  return {
    id: thread.id,
    patientId: thread.patient_id,
    lastMessageAt: latestMessage?.created_at ?? thread.last_message_at ?? thread.updated_at,
    lastMessagePreview: latestMessage
      ? visibleMessageText(latestMessage)
      : 'Sem mensagens recentes.',
    lastMessageFrom: latestMessage
      ? senderLabel(latestMessage, senderType(latestMessage))
      : 'Equipe',
    unreadCount,
    isOpen: thread.status === 'open',
    messages,
    shortcuts:
      extras.shortcuts ??
      (Array.isArray(metadata.shortcuts)
        ? metadata.shortcuts
            .map(asShortcut)
            .filter((item): item is PatientChatShortcut => Boolean(item))
        : []),
    threads: [threadSummary],
    responsibleTeamMember: asResponsibleMember(metadata.responsibleTeamMember),
    serviceHours: extras.serviceHours ?? asServiceHours(metadata.serviceHours),
    slaExpected: extras.slaExpected ?? asSla(metadata.slaExpected),
  };
}

async function fetchChatShortcuts(
  supabase: ReturnType<typeof getSupabaseClient>,
  tenantId: string
): Promise<PatientChatShortcut[]> {
  const { data, error } = await supabase
    .from('chat_shortcuts')
    .select('id,title,text,category')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(12);

  if (error || !Array.isArray(data)) return [];
  return data.map(asShortcut).filter((item): item is PatientChatShortcut => Boolean(item));
}

function weekdayLabel(day: number) {
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][day] ?? 'Dia';
}

async function fetchChatServiceHours(
  supabase: ReturnType<typeof getSupabaseClient>,
  tenantId: string
): Promise<PatientChatSummary['serviceHours']> {
  const { data, error } = await supabase
    .from('chat_service_hours')
    .select('weekday,opens_at,closes_at,is_enabled,timezone,auto_reply')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true)
    .order('weekday', { ascending: true });

  if (error || !Array.isArray(data) || data.length === 0) return undefined;

  const rows = data.map(asRecord);
  const days = rows.map((row) => weekdayLabel(asNumber(row.weekday))).join(', ');
  const start =
    rows
      .map((row) => asString(row.opens_at))
      .filter(Boolean)
      .sort()[0] ?? '';
  const end =
    rows
      .map((row) => asString(row.closes_at))
      .filter(Boolean)
      .sort()
      .at(-1) ?? '';
  const timezone = asString(rows[0]?.timezone, 'America/Sao_Paulo');
  const now = new Date();
  const currentWeekday = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const today = rows.find((row) => asNumber(row.weekday, -1) === currentWeekday);
  const [openHour = 0, openMinute = 0] = asString(today?.opens_at, '00:00').split(':').map(Number);
  const [closeHour = 23, closeMinute = 59] = asString(today?.closes_at, '23:59')
    .split(':')
    .map(Number);
  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute;

  return {
    days,
    start,
    end,
    timezone,
    isAvailable: Boolean(today) && currentMinutes >= openMinutes && currentMinutes <= closeMinutes,
    unavailableMessage: asString(today?.auto_reply) || asString(rows[0]?.auto_reply) || undefined,
  };
}

async function fetchChatSlaPolicy(
  supabase: ReturnType<typeof getSupabaseClient>,
  tenantId: string,
  latestMessageAt?: string
): Promise<PatientChatSummary['slaExpected']> {
  const { data, error } = await supabase
    .from('chat_sla_policies')
    .select('name,first_response_minutes,breach_notification_minutes')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return undefined;
  const record = asRecord(data);
  const minutes = Math.max(1, asNumber(record.first_response_minutes, 240));
  const warningMinutes = Math.max(1, asNumber(record.breach_notification_minutes, 30));
  const dueAt = latestMessageAt
    ? new Date(new Date(latestMessageAt).getTime() + minutes * 60 * 1000)
    : null;
  const minutesRemaining = dueAt ? Math.ceil((dueAt.getTime() - Date.now()) / 60000) : undefined;
  const status =
    typeof minutesRemaining !== 'number'
      ? 'ok'
      : minutesRemaining < 0
        ? 'breached'
        : minutesRemaining <= warningMinutes
          ? 'warning'
          : 'ok';

  return {
    label: asString(record.name, `Responder em ${minutes} min`),
    note: `Primeira resposta em ate ${minutes} min`,
    status,
    dueAt: dueAt?.toISOString(),
    minutesRemaining,
  };
}

async function fetchChatFromSupabase(
  patientId: string
): Promise<{ data: PatientChatSummary | null; error: SafeServiceError | null }> {
  const supabase = getSupabaseClient();

  const { data: threadData, error: threadError } = await supabase
    .from('patient_chat_threads')
    .select(
      'id,tenant_id,patient_id,status,assigned_to,last_message_at,unread_count,metadata,created_at,updated_at'
    )
    .eq('patient_id', patientId)
    .maybeSingle();

  if (threadError) {
    return {
      data: null,
      error: safeError(threadError, 'Nao foi possivel carregar o chat.'),
    };
  }

  if (!threadData) return { data: null, error: null };

  const thread = threadData as ChatThreadRow;
  const { data: messageData, error: messageError } = await supabase
    .from('patient_chat_messages')
    .select('id,sender_user_id,sender_label,body,metadata,moderation_status,archived_at,created_at')
    .eq('tenant_id', thread.tenant_id)
    .eq('thread_id', thread.id)
    .eq('patient_id', patientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (messageError) {
    return {
      data: null,
      error: safeError(messageError, 'Nao foi possivel carregar mensagens do chat.'),
    };
  }

  const rows = ((messageData ?? []) as ChatMessageRow[]).reverse();
  const messageIds = rows.map((row) => row.id);
  const attachmentRows =
    messageIds.length > 0
      ? await supabase
          .from('chat_attachments')
          .select('id,message_id,file_name,mime_type,size_bytes,status,created_at')
          .eq('tenant_id', thread.tenant_id)
          .eq('thread_id', thread.id)
          .eq('patient_id', patientId)
          .in('message_id', messageIds)
          .neq('status', 'deleted')
          .is('archived_at', null)
          .order('created_at', { ascending: true })
      : { data: [], error: null };

  const latestMessageAt = rows.at(-1)?.created_at ?? thread.last_message_at ?? thread.updated_at;
  const [shortcuts, serviceHours, slaExpected] = await Promise.all([
    fetchChatShortcuts(supabase, thread.tenant_id),
    fetchChatServiceHours(supabase, thread.tenant_id),
    fetchChatSlaPolicy(supabase, thread.tenant_id, latestMessageAt),
  ]);

  return {
    data: mapChat(
      thread,
      rows,
      attachmentRows.error ? [] : ((attachmentRows.data ?? []) as ChatAttachmentRow[]),
      {
        shortcuts,
        serviceHours,
        slaExpected,
      }
    ),
    error: null,
  };
}

function normalizePreparedAttachment(value: unknown): PreparedAttachment | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const bucket = asString(record.bucket, CHAT_ATTACHMENT_BUCKET);
  const path = asString(record.path);
  if (!id || !bucket || !path) return null;
  return {
    id,
    bucket,
    path,
    fileName: asString(record.fileName, 'Anexo'),
    mimeType: asString(record.mimeType, 'application/octet-stream'),
    sizeBytes: Math.max(0, asNumber(record.sizeBytes)),
  };
}

export function validateChatAttachmentFile(file: File | null | undefined): SafeServiceError | null {
  if (!file) return null;
  if (file.size <= 0 || file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return {
      message: 'O anexo precisa ter ate 10 MB.',
      code: 'invalid_attachment_size',
    };
  }
  if (!(CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      message: 'Use imagem JPG, PNG, WebP, HEIC ou PDF.',
      code: 'invalid_attachment_type',
    };
  }
  return null;
}

async function prepareChatAttachment(
  threadId: string,
  messageId: string,
  file: File
): Promise<{ data: PreparedAttachment | null; error: SafeServiceError | null }> {
  const validationError = validateChatAttachmentFile(file);
  if (validationError) return { data: null, error: validationError };

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('prepare_chat_attachment', {
    p_thread_id: threadId,
    p_message_id: messageId,
    p_file_name: file.name,
    p_mime_type: file.type,
    p_size_bytes: file.size,
  });

  if (error) return { data: null, error: safeError(error, 'Nao foi possivel preparar o anexo.') };
  const prepared = normalizePreparedAttachment(data);
  return {
    data: prepared,
    error: prepared ? null : { message: 'Contrato invalido ao preparar anexo.' },
  };
}

async function completeChatAttachmentUpload(attachmentId: string, status: 'uploaded' | 'failed') {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('complete_chat_attachment_upload', {
    p_attachment_id: attachmentId,
    p_status: status,
  });
  return {
    error: error ? safeError(error, 'Nao foi possivel atualizar o status do anexo.') : null,
  };
}

export async function uploadChatAttachmentForMessage(
  threadId: string,
  messageId: string,
  file: File
): Promise<{ data: PatientChatAttachment | null; error: SafeServiceError | null }> {
  try {
    const preparedResult = await prepareChatAttachment(threadId, messageId, file);
    if (preparedResult.error || !preparedResult.data) {
      return { data: null, error: preparedResult.error };
    }

    const prepared = preparedResult.data;
    const supabase = getSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from(prepared.bucket)
      .upload(prepared.path, file, {
        contentType: prepared.mimeType,
        upsert: false,
      });

    if (uploadError) {
      await completeChatAttachmentUpload(prepared.id, 'failed');
      return {
        data: {
          id: prepared.id,
          fileName: prepared.fileName,
          mimeType: prepared.mimeType,
          sizeBytes: prepared.sizeBytes,
          status: 'failed',
          kind: attachmentKind(prepared.mimeType),
        },
        error: safeError(uploadError, 'Mensagem enviada, mas o anexo falhou.'),
      };
    }

    const completeResult = await completeChatAttachmentUpload(prepared.id, 'uploaded');
    if (completeResult.error) {
      return {
        data: null,
        error: completeResult.error,
      };
    }

    return {
      data: {
        id: prepared.id,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        sizeBytes: prepared.sizeBytes,
        status: 'uploaded',
        kind: attachmentKind(prepared.mimeType),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel enviar o anexo.') };
  }
}

export async function getChatAttachmentSignedUrl(
  attachmentId: string,
  expiresInSeconds = 300
): Promise<{
  data: { url: string; expiresInSeconds: number } | null;
  error: SafeServiceError | null;
}> {
  if (!attachmentId.trim()) {
    return { data: null, error: { message: 'Anexo invalido para download.' } };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('get_chat_attachment_download', {
      p_attachment_id: attachmentId,
      p_expires_in: expiresInSeconds,
    });
    if (error) return { data: null, error: safeError(error, 'Nao foi possivel abrir o anexo.') };

    const record = asRecord(data);
    const bucket = asString(record.bucket, CHAT_ATTACHMENT_BUCKET);
    const path = asString(record.path);
    const expiresIn = Math.max(60, Math.min(600, asNumber(record.expiresInSeconds, 300)));
    if (!path) return { data: null, error: { message: 'Anexo sem caminho privado valido.' } };

    const signed = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (signed.error || !signed.data?.signedUrl) {
      return {
        data: null,
        error: safeError(signed.error, 'Nao foi possivel gerar link temporario do anexo.'),
      };
    }

    return { data: { url: signed.data.signedUrl, expiresInSeconds: expiresIn }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel abrir o anexo.') };
  }
}

export async function getPatientChat(
  patientId: string
): Promise<{ data: PatientChatSummary | null; error: SafeServiceError | null }> {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para carregar chat.' } };
  }

  try {
    if (isMockEnabled()) {
      const patient = await getMockPatient360(patientId);
      return { data: patient?.chat ?? null, error: null };
    }

    return await fetchChatFromSupabase(patientId);
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel carregar o chat.') };
  }
}

export async function openPatientChatThread(
  patientId: string
): Promise<{ data: PatientChatSummary | null; error: SafeServiceError | null }> {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para abrir chat.' } };
  }

  try {
    if (isMockEnabled()) {
      const patient = await getMockPatient360(patientId);
      return { data: patient?.chat ?? null, error: null };
    }

    const supabase = getSupabaseClient();
    const { data: existingThread, error: existingError } = await supabase
      .from('patient_chat_threads')
      .select('id,status')
      .eq('patient_id', patientId)
      .maybeSingle();

    if (existingError) {
      return { data: null, error: safeError(existingError, 'Nao foi possivel abrir o chat.') };
    }

    if (existingThread?.id) {
      const { error } = await supabase
        .from('patient_chat_threads')
        .update({ status: 'open', archived_at: null })
        .eq('id', existingThread.id)
        .eq('patient_id', patientId);
      if (error) return { data: null, error: safeError(error, 'Nao foi possivel abrir o chat.') };
      return await fetchChatFromSupabase(patientId);
    }

    const { data: patientRow, error: patientError } = await supabase
      .from('patients')
      .select('tenant_id')
      .eq('id', patientId)
      .maybeSingle();

    if (patientError) {
      return {
        data: null,
        error: safeError(patientError, 'Nao foi possivel validar o paciente do chat.'),
      };
    }

    const tenantId = (patientRow as PatientTenantRow | null)?.tenant_id;
    if (!tenantId) {
      return { data: null, error: { message: 'Paciente nao encontrado para abrir chat.' } };
    }

    const { error: insertError } = await supabase.from('patient_chat_threads').insert({
      tenant_id: tenantId,
      patient_id: patientId,
      status: 'open',
      last_message_at: new Date().toISOString(),
      retention_until: new Date(Date.now() + 6 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (insertError) {
      return { data: null, error: safeError(insertError, 'Nao foi possivel criar o chat.') };
    }

    return await fetchChatFromSupabase(patientId);
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel abrir o chat.') };
  }
}

export async function sendPatientChatMessage(
  patientId: string,
  threadId: string,
  body: string,
  clientMessageId?: string,
  options: ChatSendOptions = {}
): Promise<{ data: PatientChatSummary | null; error: SafeServiceError | null }> {
  const message = body.trim();
  const attachment = options.attachment ?? null;
  const attachmentError = validateChatAttachmentFile(attachment);
  if (attachmentError) return { data: null, error: attachmentError };

  if (!patientId.trim() || !threadId.trim() || (!message && !attachment)) {
    return { data: null, error: { message: 'Mensagem invalida para envio.' } };
  }

  try {
    if (isMockEnabled()) {
      const patient = await getMockPatient360(patientId);
      if (!patient?.chat) return { data: null, error: null };
      return {
        data: {
          ...patient.chat,
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: message || attachment?.name || 'Anexo enviado.',
          lastMessageFrom: 'Equipe',
          messages: [
            ...(patient.chat.messages ?? []),
            {
              id: `mock-message-${Date.now()}`,
              from: 'staff',
              text: message || 'Anexo enviado.',
              time: new Date().toISOString(),
              read: true,
              deliveryStatus: 'sent',
              attachments: attachment
                ? [
                    {
                      id: `mock-attachment-${Date.now()}`,
                      fileName: attachment.name,
                      mimeType: attachment.type,
                      sizeBytes: attachment.size,
                      status: 'uploaded',
                      kind: attachmentKind(attachment.type),
                    },
                  ]
                : [],
            },
          ],
        },
        error: null,
      };
    }

    const supabase = getSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError)
      return {
        data: null,
        error: safeError(userError, 'Sessao invalida para envio do chat.'),
      };
    if (!user) return { data: null, error: { message: 'Sessao expirada para envio do chat.' } };

    const { data: threadData, error: threadError } = await supabase
      .from('patient_chat_threads')
      .select('id,tenant_id,patient_id')
      .eq('id', threadId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (threadError)
      return {
        data: null,
        error: safeError(threadError, 'Nao foi possivel validar a conversa.'),
      };

    const thread = threadData as Pick<ChatThreadRow, 'id' | 'tenant_id' | 'patient_id'> | null;
    if (!thread) {
      return {
        data: null,
        error: { message: 'Thread de chat nao encontrada para este paciente.' },
      };
    }

    const safeClientMessageId = clientMessageId?.trim().slice(0, 80);
    if (safeClientMessageId) {
      const { data: duplicateMessage, error: duplicateError } = await supabase
        .from('patient_chat_messages')
        .select('id')
        .eq('tenant_id', thread.tenant_id)
        .eq('thread_id', thread.id)
        .eq('patient_id', patientId)
        .eq('sender_user_id', user.id)
        .eq('metadata->>client_message_id', safeClientMessageId)
        .maybeSingle();

      if (duplicateError) {
        return {
          data: null,
          error: safeError(duplicateError, 'Nao foi possivel validar duplicidade da mensagem.'),
        };
      }

      if (duplicateMessage?.id) {
        return await fetchChatFromSupabase(patientId);
      }
    }

    const now = new Date().toISOString();
    const { data: insertedMessage, error: insertError } = await supabase
      .from('patient_chat_messages')
      .insert({
        tenant_id: thread.tenant_id,
        thread_id: thread.id,
        patient_id: patientId,
        sender_user_id: user.id,
        sender_label: 'Equipe',
        body: message || 'Anexo enviado.',
        metadata: {
          sender_type: 'staff',
          has_attachment: Boolean(attachment),
          ...(safeClientMessageId ? { client_message_id: safeClientMessageId } : {}),
        },
        moderation_status: 'approved',
        retention_until: new Date(Date.now() + 6 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: now,
      })
      .select('id')
      .single();

    if (insertError) {
      return { data: null, error: safeError(insertError, 'Nao foi possivel enviar a mensagem.') };
    }

    const { error: updateError } = await supabase
      .from('patient_chat_threads')
      .update({
        status: 'open',
        archived_at: null,
        last_message_at: now,
        retention_until: new Date(Date.now() + 6 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', thread.id)
      .eq('patient_id', patientId);

    if (updateError) {
      return { data: null, error: safeError(updateError, 'Nao foi possivel atualizar o chat.') };
    }

    if (attachment && insertedMessage?.id) {
      const uploadResult = await uploadChatAttachmentForMessage(
        thread.id,
        insertedMessage.id,
        attachment
      );
      const refreshed = await fetchChatFromSupabase(patientId);
      if (uploadResult.error) {
        return {
          data: refreshed.data,
          error: uploadResult.error,
        };
      }
      return refreshed;
    }

    return await fetchChatFromSupabase(patientId);
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel enviar a mensagem.') };
  }
}

export async function markPatientChatAsAnswered(
  patientId: string,
  threadId: string
): Promise<{ data: PatientChatSummary | null; error: SafeServiceError | null }> {
  if (!patientId.trim() || !threadId.trim()) {
    return { data: null, error: { message: 'Thread invalida para atualizar chat.' } };
  }

  try {
    if (isMockEnabled()) {
      const patient = await getMockPatient360(patientId);
      return {
        data: patient?.chat ? { ...patient.chat, unreadCount: 0 } : null,
        error: null,
      };
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc('mark_thread_read', { p_thread_id: threadId });

    if (error) {
      return {
        data: null,
        error: safeError(error, 'Nao foi possivel marcar o chat como respondido.'),
      };
    }

    return await fetchChatFromSupabase(patientId);
  } catch (error) {
    return {
      data: null,
      error: safeError(error, 'Nao foi possivel marcar o chat como respondido.'),
    };
  }
}
