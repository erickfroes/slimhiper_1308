import { isMockDataEnabled } from '@/lib/mockMode';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

export type InboxTab = 'conversas' | 'notificacoes' | 'atribuidas';
export type InboxSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface HeaderMessageItem {
  id: string;
  threadId: string;
  patientId: string;
  patientName: string;
  title: string;
  body: string;
  category: string;
  severity: InboxSeverity;
  unreadCount: number;
  assignedTo?: string | null;
  status: string;
  moderationStatus?: 'approved' | 'pending_review' | 'removed';
  createdAt: string;
  href: string;
  patientHref: string;
}

export interface HeaderNotificationItem {
  id: string;
  notificationId: string;
  patientId?: string | null;
  patientName?: string | null;
  title: string;
  body: string;
  category: string;
  severity: InboxSeverity;
  status: 'unread' | 'read' | 'archived';
  moderationStatus?: 'approved' | 'pending_review' | 'removed';
  createdAt: string;
  href: string;
  patientHref?: string | null;
}

export interface CommunicationsSummary {
  unreadMessages: number;
  unreadNotifications: number;
  messages: HeaderMessageItem[];
  notifications: HeaderNotificationItem[];
}

export interface InboxConversation {
  id: string;
  threadId: string;
  patientId: string;
  patientName: string;
  lastMessagePreview: string;
  lastMessageFrom: string;
  lastMessageAt: string;
  unreadCount: number;
  status: 'open' | 'closed' | 'archived';
  moderationStatus?: 'approved' | 'pending_review' | 'removed';
  assignedTo?: string | null;
  assignedToName?: string | null;
  sla: string;
  slaStatus?: 'ok' | 'warning' | 'breached';
  slaDueAt?: string | null;
  serviceAvailable?: boolean | null;
  category: string;
  href: string;
}

export interface ClinicInboxPayload {
  conversations: InboxConversation[];
  notifications: HeaderNotificationItem[];
}

export interface ClinicInboxFilters {
  tab?: InboxTab;
  unreadOnly?: boolean;
  patientId?: string;
  assignedTo?: string;
  category?: string;
  limit?: number;
}

const isMockEnabled = () => isMockDataEnabled();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code = value
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, 80);
  return code || undefined;
}

function asModerationStatus(value: unknown): 'approved' | 'pending_review' | 'removed' {
  const status = asString(value, 'approved');
  return status === 'pending_review' || status === 'removed' ? status : 'approved';
}

function isModerated(value: { moderationStatus?: string }) {
  return value.moderationStatus === 'pending_review' || value.moderationStatus === 'removed';
}

function asSeverity(value: unknown): InboxSeverity {
  const severity = asString(value, 'medium').toLowerCase();
  if (severity === 'critical' || severity === 'high' || severity === 'low') return severity;
  return 'medium';
}

function serviceError(error: unknown, fallback: string): SafeServiceError {
  if (error && typeof error === 'object') {
    const record = error as {
      code?: unknown;
      name?: unknown;
    };
    return {
      message: fallback,
      code: safeErrorCode(record.code) ?? safeErrorCode(record.name),
    };
  }
  return { message: fallback };
}

function normalizeMessage(value: unknown): HeaderMessageItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const threadId = asString(record.threadId, id);
  const patientId = asString(record.patientId);
  if (!id || !threadId || !patientId) return null;

  const moderationStatus = asModerationStatus(record.moderationStatus);
  const moderated = isModerated({ moderationStatus });

  return {
    id,
    threadId,
    patientId,
    patientName: asString(record.patientName, 'Paciente'),
    title: asString(record.title, 'Conversa'),
    body: moderated
      ? 'Conteúdo sob revisão de moderação.'
      : asString(record.body, 'Conversa sem mensagens recentes.'),
    category: asString(record.category, 'chat'),
    severity: asSeverity(record.severity),
    unreadCount: Math.max(0, asNumber(record.unreadCount)),
    assignedTo: asString(record.assignedTo) || null,
    status: asString(record.status, 'open'),
    moderationStatus,
    createdAt: asString(record.createdAt),
    href: asString(record.href, `/clinic/inbox?tab=conversas&thread=${threadId}`),
    patientHref: asString(record.patientHref, `/clinic/patients/${patientId}?tab=chat`),
  };
}

function normalizeNotification(value: unknown): HeaderNotificationItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const notificationId = asString(record.notificationId, id);
  const title = asString(record.title);
  if (!id || !notificationId || !title) return null;

  const status = asString(record.status, 'unread');
  const moderationStatus = asModerationStatus(record.moderationStatus);
  const moderated = isModerated({ moderationStatus });

  return {
    id,
    notificationId,
    patientId: asString(record.patientId) || null,
    patientName: asString(record.patientName) || null,
    title: moderated ? 'Notificação sob revisão' : title,
    body: moderated ? 'Conteúdo removido ou sob revisão de moderação.' : asString(record.body),
    category: asString(record.category, 'operacional'),
    severity: asSeverity(record.severity),
    status: status === 'read' || status === 'archived' ? status : 'unread',
    moderationStatus,
    createdAt: asString(record.createdAt),
    href: asString(record.href, `/clinic/inbox?tab=notificacoes&notification=${notificationId}`),
    patientHref: asString(record.patientHref) || null,
  };
}

function normalizeConversation(value: unknown): InboxConversation | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const threadId = asString(record.threadId, id);
  const patientId = asString(record.patientId);
  if (!id || !threadId || !patientId) return null;

  const status = asString(record.status, 'open');
  const moderationStatus = asModerationStatus(record.moderationStatus);
  const moderated = isModerated({ moderationStatus });
  return {
    id,
    threadId,
    patientId,
    patientName: asString(record.patientName, 'Paciente'),
    lastMessagePreview: moderated
      ? 'Conteúdo sob revisão de moderação.'
      : asString(record.lastMessagePreview, 'Conversa sem mensagens recentes.'),
    lastMessageFrom: moderated ? 'Moderação' : asString(record.lastMessageFrom, 'Equipe'),
    lastMessageAt: asString(record.lastMessageAt),
    unreadCount: Math.max(0, asNumber(record.unreadCount)),
    status: status === 'closed' || status === 'archived' ? status : 'open',
    moderationStatus,
    assignedTo: asString(record.assignedTo) || null,
    assignedToName: asString(record.assignedToName) || null,
    sla: asString(record.sla, 'SLA padrao'),
    slaStatus:
      asString(record.slaStatus) === 'warning' || asString(record.slaStatus) === 'breached'
        ? (asString(record.slaStatus) as 'warning' | 'breached')
        : asString(record.slaStatus) === 'ok'
          ? 'ok'
          : undefined,
    slaDueAt: asString(record.slaDueAt) || null,
    serviceAvailable: typeof record.serviceAvailable === 'boolean' ? record.serviceAvailable : null,
    category: asString(record.category, 'chat'),
    href: asString(record.href, `/clinic/patients/${patientId}?tab=chat`),
  };
}

function normalizeSummary(value: unknown): CommunicationsSummary {
  const record = asRecord(value);
  const messages = Array.isArray(record.messages)
    ? record.messages
        .map(normalizeMessage)
        .filter((item): item is HeaderMessageItem => Boolean(item))
    : [];
  const notifications = Array.isArray(record.notifications)
    ? record.notifications
        .map(normalizeNotification)
        .filter((item): item is HeaderNotificationItem => Boolean(item))
    : [];

  return {
    unreadMessages: Math.max(0, asNumber(record.unreadMessages)),
    unreadNotifications: Math.max(0, asNumber(record.unreadNotifications)),
    messages,
    notifications,
  };
}

function normalizeInbox(value: unknown): ClinicInboxPayload {
  const record = asRecord(value);
  return {
    conversations: Array.isArray(record.conversations)
      ? record.conversations
          .map(normalizeConversation)
          .filter((item): item is InboxConversation => Boolean(item))
      : [],
    notifications: Array.isArray(record.notifications)
      ? record.notifications
          .map(normalizeNotification)
          .filter((item): item is HeaderNotificationItem => Boolean(item))
      : [],
  };
}

function mockSummary(): CommunicationsSummary {
  return {
    unreadMessages: 2,
    unreadNotifications: 1,
    messages: [
      {
        id: 'mock-thread-1',
        threadId: 'mock-thread-1',
        patientId: 'mock-patient-1',
        patientName: 'Paciente exemplo',
        title: 'Paciente exemplo',
        body: 'Dúvida sobre preparo para consulta.',
        category: 'chat',
        severity: 'medium',
        unreadCount: 2,
        assignedTo: null,
        status: 'open',
        moderationStatus: 'approved',
        createdAt: new Date().toISOString(),
        href: '/clinic/inbox?tab=conversas&thread=mock-thread-1',
        patientHref: '/clinic/patients/mock-patient-1?tab=chat',
      },
    ],
    notifications: [
      {
        id: 'mock-notification-1',
        notificationId: 'mock-notification-1',
        patientId: 'mock-patient-1',
        patientName: 'Paciente exemplo',
        title: 'Documento pendente de assinatura',
        body: 'Acompanhe a assinatura no módulo de documentos.',
        category: 'documentos',
        severity: 'high',
        status: 'unread',
        moderationStatus: 'approved',
        createdAt: new Date().toISOString(),
        href: '/clinic/documents',
        patientHref: '/clinic/patients/mock-patient-1',
      },
    ],
  };
}

export async function getCommunicationsSummary(): Promise<{
  data: CommunicationsSummary | null;
  error: SafeServiceError | null;
}> {
  try {
    if (isMockEnabled()) return { data: mockSummary(), error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_clinic_communications_summary', {
      p_limit: 5,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao carregar notificacoes.') };

    return { data: normalizeSummary(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao carregar notificacoes.') };
  }
}

export async function listClinicInbox(filters: ClinicInboxFilters = {}): Promise<{
  data: ClinicInboxPayload | null;
  error: SafeServiceError | null;
}> {
  try {
    if (isMockEnabled()) {
      const summary = mockSummary();
      return {
        data: {
          conversations: summary.messages.map((message) => ({
            id: message.id,
            threadId: message.threadId,
            patientId: message.patientId,
            patientName: message.patientName,
            lastMessagePreview: message.body,
            lastMessageFrom: 'Paciente',
            lastMessageAt: message.createdAt,
            unreadCount: message.unreadCount,
            status: 'open',
            moderationStatus: 'approved',
            assignedTo: null,
            assignedToName: null,
            sla: 'Responder ate hoje',
            slaStatus: 'ok',
            slaDueAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            serviceAvailable: true,
            category: 'chat',
            href: message.patientHref,
          })),
          notifications: summary.notifications,
        },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('list_clinic_inbox', {
      p_tab: filters.tab ?? 'conversas',
      p_unread_only: filters.unreadOnly ?? false,
      p_patient_id: filters.patientId || null,
      p_assigned_to: filters.assignedTo || null,
      p_category: filters.category || null,
      p_limit: filters.limit ?? 50,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao carregar inbox.') };

    return { data: normalizeInbox(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao carregar inbox.') };
  }
}

export async function markNotificationRead(notificationId: string) {
  try {
    if (isMockEnabled()) return { data: mockSummary(), error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('mark_notification_read', {
      p_notification_id: notificationId,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao ler notificacao.') };
    return { data: normalizeSummary(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao ler notificacao.') };
  }
}

export async function archiveNotification(notificationId: string) {
  try {
    if (isMockEnabled()) return { data: mockSummary(), error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('archive_notification', {
      p_notification_id: notificationId,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao arquivar notificacao.') };
    return { data: normalizeSummary(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao arquivar notificacao.') };
  }
}

export async function markThreadRead(threadId: string) {
  try {
    if (isMockEnabled()) return { data: mockSummary(), error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('mark_thread_read', { p_thread_id: threadId });
    if (error) return { data: null, error: serviceError(error, 'Falha ao marcar conversa.') };
    return { data: normalizeSummary(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao marcar conversa.') };
  }
}

export async function assignThreadToMe(threadId: string) {
  try {
    if (isMockEnabled()) return { data: mockSummary(), error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('assign_chat_thread', {
      p_thread_id: threadId,
      p_assigned_to: null,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao atribuir conversa.') };
    return { data: normalizeInbox(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao atribuir conversa.') };
  }
}

export async function setThreadStatus(threadId: string, status: 'open' | 'closed') {
  try {
    if (isMockEnabled()) return { data: mockSummary(), error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('set_chat_thread_status', {
      p_thread_id: threadId,
      p_status: status,
    });
    if (error) return { data: null, error: serviceError(error, 'Falha ao alterar conversa.') };
    return { data: normalizeInbox(data), error: null };
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao alterar conversa.') };
  }
}

export async function archiveChatThread(threadId: string) {
  try {
    if (isMockEnabled()) return { data: mockSummary(), error: null };

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from('patient_chat_threads')
      .update({
        status: 'archived',
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId);

    if (error) return { data: null, error: serviceError(error, 'Falha ao arquivar conversa.') };
    return await listClinicInbox({ tab: 'conversas', limit: 50 });
  } catch (error) {
    return { data: null, error: serviceError(error, 'Falha ao arquivar conversa.') };
  }
}
