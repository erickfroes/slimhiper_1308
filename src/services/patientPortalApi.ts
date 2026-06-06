import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

export interface PatientPortalLinkedPatient {
  tenantId: string;
  patientId: string;
  linkageType: 'patient' | 'guardian';
  relationship?: string | null;
  displayName: string;
  status: string;
}

export interface PatientPortalPatientSummary {
  id: string;
  tenantId: string;
  preferredName: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  tags: string[];
  createdAt?: string | null;
}

export interface PatientPortalDocument {
  id: string;
  name: string;
  category: string;
  status: string;
  generatedAt?: string | null;
  releasedToPatient: boolean;
}

export interface PatientPortalInvoice {
  id: string;
  status: string;
  amountCents: number;
  dueDate?: string | null;
  paidAt?: string | null;
  description?: string | null;
  paymentLink?: string | null;
}

export interface PatientPortalMessage {
  id: string;
  senderLabel: string;
  isOwn: boolean;
  body: string;
  createdAt?: string | null;
}

export interface PatientPortalChat {
  threadId?: string | null;
  status: string;
  lastMessageAt?: string | null;
  messages: PatientPortalMessage[];
}

export interface PatientPortalNotification {
  id: string;
  title: string;
  body?: string | null;
  category?: string | null;
  status: 'unread' | 'read' | 'archived' | string;
  createdAt?: string | null;
}

export interface PatientPortalCheckin {
  id: string;
  title: string;
  status: 'scheduled' | 'sent' | 'completed' | 'overdue' | 'canceled' | string;
  channel?: string | null;
  dueDate?: string | null;
  questions: unknown[];
  responses: Record<string, unknown>;
  completedAt?: string | null;
}

export interface PatientPortalSnapshot {
  selectedPatientId: string;
  patients: PatientPortalLinkedPatient[];
  patient: PatientPortalPatientSummary;
  documents: PatientPortalDocument[];
  invoices: PatientPortalInvoice[];
  chat: PatientPortalChat;
  notifications: PatientPortalNotification[];
  checkins: PatientPortalCheckin[];
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

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('')
    .trim()
    .slice(0, maxLength);
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

function asSafeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeLinkedPatient(value: unknown): PatientPortalLinkedPatient | null {
  const record = asRecord(value);
  const patientId = asString(record.patientId);
  const tenantId = asString(record.tenantId);
  if (!patientId || !tenantId) return null;

  const linkageType =
    asString(record.linkageType, 'patient') === 'guardian' ? 'guardian' : 'patient';

  return {
    tenantId,
    patientId,
    linkageType,
    relationship: asNullableString(record.relationship),
    displayName: asString(record.displayName, 'Paciente'),
    status: asString(record.status, 'active'),
  };
}

function normalizePatient(value: unknown): PatientPortalPatientSummary {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    tenantId: asString(record.tenantId),
    preferredName: asString(record.preferredName, 'Paciente'),
    fullName: asNullableString(record.fullName),
    email: asNullableString(record.email),
    phone: asNullableString(record.phone),
    status: asString(record.status, 'active'),
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    createdAt: asNullableString(record.createdAt),
  };
}

function normalizeDocument(value: unknown): PatientPortalDocument | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    name: asString(record.name, 'Documento'),
    category: asString(record.category, 'documento'),
    status: asString(record.status, 'generated'),
    generatedAt: asNullableString(record.generatedAt),
    releasedToPatient: asBoolean(record.releasedToPatient, true),
  };
}

function normalizeInvoice(value: unknown): PatientPortalInvoice | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    status: asString(record.status, 'pending'),
    amountCents: asNumber(record.amountCents),
    dueDate: asNullableString(record.dueDate),
    paidAt: asNullableString(record.paidAt),
    description: asNullableString(record.description),
    paymentLink: asSafeExternalUrl(record.paymentLink),
  };
}

function normalizeMessage(value: unknown): PatientPortalMessage | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    senderLabel: asString(record.senderLabel, 'Mensagem'),
    isOwn: asBoolean(record.isOwn),
    body: asString(record.body),
    createdAt: asNullableString(record.createdAt),
  };
}

function normalizeNotification(value: unknown): PatientPortalNotification | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    title: asString(record.title, 'Notificacao'),
    body: asNullableString(record.body),
    category: asNullableString(record.category),
    status: asString(record.status, 'unread'),
    createdAt: asNullableString(record.createdAt),
  };
}

function normalizeCheckin(value: unknown): PatientPortalCheckin | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    title: asString(record.title, 'Check-in'),
    status: asString(record.status, 'scheduled'),
    channel: asNullableString(record.channel),
    dueDate: asNullableString(record.dueDate),
    questions: Array.isArray(record.questions) ? record.questions : [],
    responses: asRecord(record.responses),
    completedAt: asNullableString(record.completedAt),
  };
}

function normalizeSnapshot(value: unknown): PatientPortalSnapshot | null {
  const record = asRecord(value);
  const selectedPatientId = asString(record.selectedPatientId);
  const patients = Array.isArray(record.patients)
    ? record.patients
        .map(normalizeLinkedPatient)
        .filter((item): item is PatientPortalLinkedPatient => Boolean(item))
    : [];
  const patient = normalizePatient(record.patient);

  if (!selectedPatientId || patients.length === 0 || !patient.id) return null;

  const chatRecord = asRecord(record.chat);
  const messages = Array.isArray(chatRecord.messages)
    ? chatRecord.messages
        .map(normalizeMessage)
        .filter((item): item is PatientPortalMessage => Boolean(item))
    : [];

  return {
    selectedPatientId,
    patients,
    patient,
    documents: Array.isArray(record.documents)
      ? record.documents
          .map(normalizeDocument)
          .filter((item): item is PatientPortalDocument => Boolean(item))
      : [],
    invoices: Array.isArray(record.invoices)
      ? record.invoices
          .map(normalizeInvoice)
          .filter((item): item is PatientPortalInvoice => Boolean(item))
      : [],
    chat: {
      threadId: asNullableString(chatRecord.threadId),
      status: asString(chatRecord.status, 'open'),
      lastMessageAt: asNullableString(chatRecord.lastMessageAt),
      messages,
    },
    notifications: Array.isArray(record.notifications)
      ? record.notifications
          .map(normalizeNotification)
          .filter((item): item is PatientPortalNotification => Boolean(item))
      : [],
    checkins: Array.isArray(record.checkins)
      ? record.checkins
          .map(normalizeCheckin)
          .filter((item): item is PatientPortalCheckin => Boolean(item))
      : [],
  };
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  const record = asRecord(error);
  return {
    message: fallback,
    code: asNullableString(record.code) ?? undefined,
  };
}

function logDevelopmentDiagnostic(scope: string, error: unknown) {
  if (process.env.NODE_ENV === 'production') return;

  const record = asRecord(error);
  const diagnostic = {
    code: asNullableString(record.code),
    message: sanitizeText(record.message, 160) || undefined,
    name: asNullableString(record.name),
    status: asNumber(record.status, 0) || undefined,
  };
  console.warn(`[patientPortalApi] ${scope} ${JSON.stringify(diagnostic)}`);
}

function sanitizeResponseValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return sanitizeText(value, depth === 0 ? 4000 : 1000);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value) && depth < 2) {
    return value
      .slice(0, 25)
      .map((item) => sanitizeResponseValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && depth < 2) {
    const nested: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>)
      .slice(0, 20)
      .forEach(([key, nestedValue]) => {
        const safeKey = sanitizeText(key, 80);
        const safeValue = sanitizeResponseValue(nestedValue, depth + 1);
        if (safeKey && safeValue !== undefined) nested[safeKey] = safeValue;
      });
    return nested;
  }
  return undefined;
}

function normalizeCheckinResponses(responses: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  Object.entries(asRecord(responses))
    .slice(0, 50)
    .forEach(([key, value]) => {
      const safeKey = sanitizeText(key, 80);
      const safeValue = sanitizeResponseValue(value);
      if (safeKey && safeValue !== undefined) normalized[safeKey] = safeValue;
    });
  return normalized;
}

export async function getPatientPortalSnapshot(patientId?: string): Promise<{
  data: PatientPortalSnapshot | null;
  error: SafeServiceError | null;
}> {
  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_portal_snapshot', {
      p_patient_id: asUuid(patientId) ?? null,
    });
    if (error) {
      logDevelopmentDiagnostic('getPatientPortalSnapshot.rpc', error);
      return { data: null, error: safeError(error, 'Nao foi possivel carregar o portal.') };
    }

    const snapshot = normalizeSnapshot(data);
    if (!snapshot) {
      logDevelopmentDiagnostic('getPatientPortalSnapshot.contract', {
        code: 'invalid_contract',
      });
      return {
        data: null,
        error: { message: 'Contrato invalido do portal do paciente.', code: 'invalid_contract' },
      };
    }

    return { data: snapshot, error: null };
  } catch (error) {
    logDevelopmentDiagnostic('getPatientPortalSnapshot.catch', error);
    return { data: null, error: safeError(error, 'Nao foi possivel carregar o portal.') };
  }
}

export async function sendPatientPortalMessage(
  patientId: string,
  body: string
): Promise<{
  data: { id: string; threadId: string } | null;
  error: SafeServiceError | null;
}> {
  const safePatientId = asUuid(patientId);
  const safeBody = sanitizeText(body, 2000);
  if (!safePatientId || !safeBody) {
    return {
      data: null,
      error: { message: 'Informe uma mensagem valida para enviar ao time.', code: 'invalid_input' },
    };
  }

  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('send_patient_portal_message', {
      p_patient_id: safePatientId,
      p_body: safeBody,
    });
    if (error) return { data: null, error: safeError(error, 'Nao foi possivel enviar mensagem.') };

    const record = asRecord(data);
    return {
      data: { id: asString(record.id), threadId: asString(record.threadId) },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel enviar mensagem.') };
  }
}

export async function submitPatientPortalCheckin(
  checkinId: string,
  responses: Record<string, unknown>
): Promise<{ data: { id: string; status: string } | null; error: SafeServiceError | null }> {
  const safeCheckinId = asUuid(checkinId);
  if (!safeCheckinId) {
    return {
      data: null,
      error: { message: 'Check-in invalido para envio.', code: 'invalid_input' },
    };
  }

  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('submit_patient_portal_checkin', {
      p_checkin_id: safeCheckinId,
      p_responses: normalizeCheckinResponses(responses),
    });
    if (error)
      return { data: null, error: safeError(error, 'Nao foi possivel concluir check-in.') };

    const record = asRecord(data);
    return { data: { id: asString(record.id), status: asString(record.status) }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel concluir check-in.') };
  }
}

export async function markPatientPortalNotificationRead(
  notificationId: string
): Promise<{ data: { id: string; status: string } | null; error: SafeServiceError | null }> {
  const safeNotificationId = asUuid(notificationId);
  if (!safeNotificationId) {
    return {
      data: null,
      error: { message: 'Notificacao invalida para atualizacao.', code: 'invalid_input' },
    };
  }

  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('mark_patient_portal_notification_read', {
      p_notification_id: safeNotificationId,
    });
    if (error)
      return { data: null, error: safeError(error, 'Nao foi possivel atualizar notificacao.') };

    const record = asRecord(data);
    return { data: { id: asString(record.id), status: asString(record.status) }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel atualizar notificacao.') };
  }
}
