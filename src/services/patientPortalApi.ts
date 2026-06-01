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
    paymentLink: asNullableString(record.paymentLink),
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
    message: asString(record.message, fallback),
    code: asNullableString(record.code) ?? undefined,
    details: asNullableString(record.details) ?? undefined,
  };
}

export async function getPatientPortalSnapshot(patientId?: string): Promise<{
  data: PatientPortalSnapshot | null;
  error: SafeServiceError | null;
}> {
  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_portal_snapshot', {
      p_patient_id: patientId || null,
    });
    if (error)
      return { data: null, error: safeError(error, 'Nao foi possivel carregar o portal.') };

    const snapshot = normalizeSnapshot(data);
    if (!snapshot) {
      return {
        data: null,
        error: { message: 'Contrato invalido do portal do paciente.', code: 'invalid_contract' },
      };
    }

    return { data: snapshot, error: null };
  } catch (error) {
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
  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('send_patient_portal_message', {
      p_patient_id: patientId,
      p_body: body,
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
  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('submit_patient_portal_checkin', {
      p_checkin_id: checkinId,
      p_responses: responses,
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
  try {
    const supabase = await createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('mark_patient_portal_notification_read', {
      p_notification_id: notificationId,
    });
    if (error)
      return { data: null, error: safeError(error, 'Nao foi possivel atualizar notificacao.') };

    const record = asRecord(data);
    return { data: { id: asString(record.id), status: asString(record.status) }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel atualizar notificacao.') };
  }
}
