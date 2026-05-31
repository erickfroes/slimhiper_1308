import type { PatientChatMessage, PatientChatSummary, PatientChatThread } from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getPatient360 } from '@/services/mockApi';

export interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
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
  created_at: string;
};

type PatientTenantRow = {
  tenant_id: string;
};

const isMockEnabled = () => process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
const getSupabaseClient = () => createBrowserSupabaseClient();

function safeError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) return { message: error.message || fallback };
  if (error && typeof error === 'object' && 'message' in error) {
    return { message: String((error as { message?: unknown }).message ?? fallback) };
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
  return days || start || end ? { days, start, end } : undefined;
}

function asSla(value: unknown): PatientChatSummary['slaExpected'] {
  const record = asRecord(value);
  const label = asString(record.label);
  const note = asString(record.note);
  return label || note ? { label, note } : undefined;
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

function mapMessages(rows: ChatMessageRow[], unreadCount: number): PatientChatMessage[] {
  const unreadPatientIds = new Set(
    rows
      .filter((row) => senderType(row) === 'patient')
      .slice(Math.max(0, rows.filter((row) => senderType(row) === 'patient').length - unreadCount))
      .map((row) => row.id)
  );

  return rows.map((row) => {
    const from = senderType(row);
    const metadata = asRecord(row.metadata);
    const explicitRead = typeof metadata.read === 'boolean' ? metadata.read : undefined;

    return {
      id: row.id,
      from,
      text: row.body,
      time: row.created_at,
      read: explicitRead ?? (from === 'patient' ? !unreadPatientIds.has(row.id) : true),
    };
  });
}

function mapChat(thread: ChatThreadRow, messageRows: ChatMessageRow[]): PatientChatSummary {
  const unreadCount = Math.max(0, Number(thread.unread_count ?? 0));
  const messages = mapMessages(messageRows, unreadCount);
  const latestMessage = messageRows.at(-1);
  const metadata = asRecord(thread.metadata);
  const threadSummary: PatientChatThread = {
    id: thread.id,
    date: thread.created_at,
    summary: latestMessage?.body ?? 'Conversa sem mensagens.',
    messageCount: messageRows.length,
  };

  return {
    id: thread.id,
    patientId: thread.patient_id,
    lastMessageAt: latestMessage?.created_at ?? thread.last_message_at ?? thread.updated_at,
    lastMessagePreview: latestMessage?.body ?? 'Sem mensagens recentes.',
    lastMessageFrom: latestMessage
      ? senderLabel(latestMessage, senderType(latestMessage))
      : 'Equipe',
    unreadCount,
    isOpen: thread.status === 'open',
    messages,
    shortcuts: Array.isArray(metadata.shortcuts)
      ? (metadata.shortcuts as PatientChatSummary['shortcuts'])
      : [],
    threads: [threadSummary],
    responsibleTeamMember: asResponsibleMember(metadata.responsibleTeamMember),
    serviceHours: asServiceHours(metadata.serviceHours),
    slaExpected: asSla(metadata.slaExpected),
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
      error: { message: threadError.message, code: threadError.code },
    };
  }

  if (!threadData) return { data: null, error: null };

  const thread = threadData as ChatThreadRow;
  const { data: messageData, error: messageError } = await supabase
    .from('patient_chat_messages')
    .select('id,sender_user_id,sender_label,body,metadata,created_at')
    .eq('tenant_id', thread.tenant_id)
    .eq('thread_id', thread.id)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (messageError) {
    return {
      data: null,
      error: { message: messageError.message, code: messageError.code },
    };
  }

  const rows = ((messageData ?? []) as ChatMessageRow[]).reverse();
  return { data: mapChat(thread, rows), error: null };
}

export async function getPatientChat(
  patientId: string
): Promise<{ data: PatientChatSummary | null; error: SafeServiceError | null }> {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para carregar chat.' } };
  }

  try {
    if (isMockEnabled()) {
      const patient = await getPatient360(patientId);
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
      const patient = await getPatient360(patientId);
      return { data: patient?.chat ?? null, error: null };
    }

    const supabase = getSupabaseClient();
    const { data: existingThread, error: existingError } = await supabase
      .from('patient_chat_threads')
      .select('id,status')
      .eq('patient_id', patientId)
      .maybeSingle();

    if (existingError) {
      return { data: null, error: { message: existingError.message, code: existingError.code } };
    }

    if (existingThread?.id) {
      const { error } = await supabase
        .from('patient_chat_threads')
        .update({ status: 'open' })
        .eq('id', existingThread.id)
        .eq('patient_id', patientId);
      if (error) return { data: null, error: { message: error.message, code: error.code } };
      return await fetchChatFromSupabase(patientId);
    }

    const { data: patientRow, error: patientError } = await supabase
      .from('patients')
      .select('tenant_id')
      .eq('id', patientId)
      .maybeSingle();

    if (patientError) {
      return { data: null, error: { message: patientError.message, code: patientError.code } };
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
    });

    if (insertError) {
      return { data: null, error: { message: insertError.message, code: insertError.code } };
    }

    return await fetchChatFromSupabase(patientId);
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel abrir o chat.') };
  }
}

export async function sendPatientChatMessage(
  patientId: string,
  threadId: string,
  body: string
): Promise<{ data: PatientChatSummary | null; error: SafeServiceError | null }> {
  const message = body.trim();
  if (!patientId.trim() || !threadId.trim() || !message) {
    return { data: null, error: { message: 'Mensagem invalida para envio.' } };
  }

  try {
    if (isMockEnabled()) {
      const patient = await getPatient360(patientId);
      if (!patient?.chat) return { data: null, error: null };
      return {
        data: {
          ...patient.chat,
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: message,
          lastMessageFrom: 'Equipe',
          messages: [
            ...(patient.chat.messages ?? []),
            {
              id: `mock-message-${Date.now()}`,
              from: 'staff',
              text: message,
              time: new Date().toISOString(),
              read: true,
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
      return { data: null, error: { message: userError.message, code: userError.name } };
    if (!user) return { data: null, error: { message: 'Sessao expirada para envio do chat.' } };

    const { data: threadData, error: threadError } = await supabase
      .from('patient_chat_threads')
      .select('id,tenant_id,patient_id')
      .eq('id', threadId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (threadError)
      return { data: null, error: { message: threadError.message, code: threadError.code } };

    const thread = threadData as Pick<ChatThreadRow, 'id' | 'tenant_id' | 'patient_id'> | null;
    if (!thread) {
      return {
        data: null,
        error: { message: 'Thread de chat nao encontrada para este paciente.' },
      };
    }

    const now = new Date().toISOString();
    const { error: insertError } = await supabase.from('patient_chat_messages').insert({
      tenant_id: thread.tenant_id,
      thread_id: thread.id,
      patient_id: patientId,
      sender_user_id: user.id,
      sender_label: 'Equipe',
      body: message,
      metadata: { sender_type: 'staff' },
      created_at: now,
    });

    if (insertError) {
      return { data: null, error: { message: insertError.message, code: insertError.code } };
    }

    const { error: updateError } = await supabase
      .from('patient_chat_threads')
      .update({ status: 'open', last_message_at: now })
      .eq('id', thread.id)
      .eq('patient_id', patientId);

    if (updateError) {
      return { data: null, error: { message: updateError.message, code: updateError.code } };
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
      const patient = await getPatient360(patientId);
      return {
        data: patient?.chat ? { ...patient.chat, unreadCount: 0 } : null,
        error: null,
      };
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('patient_chat_threads')
      .update({ unread_count: 0 })
      .eq('id', threadId)
      .eq('patient_id', patientId);

    if (error) return { data: null, error: { message: error.message, code: error.code } };

    return await fetchChatFromSupabase(patientId);
  } catch (error) {
    return {
      data: null,
      error: safeError(error, 'Nao foi possivel marcar o chat como respondido.'),
    };
  }
}
