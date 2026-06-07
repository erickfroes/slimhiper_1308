import type { Patient360Summary } from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface MedicalRecordInfo {
  id: string;
  patientId: string;
  status: string;
  openedAt: string;
  lastAccessedAt: string | null;
  lastWrittenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalNoteSummary {
  id: string;
  type: 'encounter' | 'evolution' | 'team_note' | 'attachment_note' | 'system' | string;
  status: string;
  title: string;
  summary: string;
  body: string;
  encounterId: string | null;
  soapNoteId: string | null;
  authoredBy: string | null;
  authorName: string;
  authorRole: string;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordAttachmentSummary {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  status: string;
  clinicalNoteId: string | null;
  uploadedBy: string | null;
  uploadedByName: string;
  createdAt: string;
}

export interface PatientCareTeamMember {
  id: string;
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  roleCode: string;
  roleLabel: string | null;
  specialty: string | null;
  isPrimary: boolean;
  status: string;
  startsAt: string;
  createdAt: string;
}

export interface CareTeamCandidate {
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  roleCode: string;
  unitId: string | null;
  alreadyAssigned: boolean;
}

export interface RecordAuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  actorName: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface MedicalRecordSnapshot {
  record: MedicalRecordInfo;
  notes: ClinicalNoteSummary[];
  attachments: RecordAttachmentSummary[];
  careTeam: PatientCareTeamMember[];
  careTeamCandidates: CareTeamCandidate[];
  audit: RecordAuditEntry[];
  access: {
    canManageTeam: boolean;
    canViewAudit: boolean;
  };
}

interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

type EdgeResponseEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    message?: string;
    code?: string;
  };
};

function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value);
  return normalized || null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  if (error && typeof error === 'object') {
    const record = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      name?: unknown;
    };
    return {
      message: asString(record.message, fallback),
      code: asString(record.code ?? record.name) || undefined,
      details: asString(record.details) || undefined,
    };
  }
  return { message: fallback };
}

function unwrapEdgeResponse<T>(response: unknown): {
  data: T | null;
  error: SafeServiceError | null;
} {
  const envelope = asRecord(response) as EdgeResponseEnvelope<T>;
  if ('ok' in envelope) {
    if (envelope.ok === true) return { data: (envelope.data ?? null) as T | null, error: null };
    return {
      data: null,
      error: {
        message: envelope.error?.message ?? envelope.error?.code ?? 'Edge function request failed.',
        code: envelope.error?.code,
      },
    };
  }

  return { data: response as T, error: null };
}

function mapNote(value: unknown): ClinicalNoteSummary {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    type: asString(record.type, 'evolution'),
    status: asString(record.status, 'final'),
    title: asString(record.title, 'Registro clinico'),
    summary: asString(record.summary),
    body: asString(record.body),
    encounterId: asNullableString(record.encounterId),
    soapNoteId: asNullableString(record.soapNoteId),
    authoredBy: asNullableString(record.authoredBy),
    authorName: asString(record.authorName, 'Equipe clinica'),
    authorRole: asString(record.authorRole, 'profissional'),
    signedAt: asNullableString(record.signedAt),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  };
}

function mapAttachment(value: unknown): RecordAttachmentSummary {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    fileName: asString(record.fileName, 'Anexo'),
    mimeType: asNullableString(record.mimeType),
    sizeBytes: asNumber(record.sizeBytes),
    status: asString(record.status, 'uploaded'),
    clinicalNoteId: asNullableString(record.clinicalNoteId),
    uploadedBy: asNullableString(record.uploadedBy),
    uploadedByName: asString(record.uploadedByName, 'Equipe clinica'),
    createdAt: asString(record.createdAt),
  };
}

function mapCareTeamMember(value: unknown): PatientCareTeamMember {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    membershipId: asString(record.membershipId),
    userId: asString(record.userId),
    name: asString(record.name, 'Profissional'),
    email: asNullableString(record.email),
    roleCode: asString(record.roleCode, 'profissional'),
    roleLabel: asNullableString(record.roleLabel),
    specialty: asNullableString(record.specialty),
    isPrimary: asBoolean(record.isPrimary),
    status: asString(record.status, 'active'),
    startsAt: asString(record.startsAt),
    createdAt: asString(record.createdAt),
  };
}

function mapCandidate(value: unknown): CareTeamCandidate {
  const record = asRecord(value);
  return {
    membershipId: asString(record.membershipId),
    userId: asString(record.userId),
    name: asString(record.name, 'Profissional'),
    email: asNullableString(record.email),
    roleCode: asString(record.roleCode, 'profissional'),
    unitId: asNullableString(record.unitId),
    alreadyAssigned: asBoolean(record.alreadyAssigned),
  };
}

function mapAudit(value: unknown): RecordAuditEntry {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    action: asString(record.action),
    entityType: asNullableString(record.entityType),
    entityId: asNullableString(record.entityId),
    actorId: asNullableString(record.actorId),
    actorName: asString(record.actorName, 'Sistema'),
    metadata: asRecord(record.metadata) as Record<string, string | number | boolean | null>,
    createdAt: asString(record.createdAt),
  };
}

function mapSnapshot(value: unknown, patientId: string): MedicalRecordSnapshot {
  const raw = asRecord(value);
  const record = asRecord(raw.record);

  return {
    record: {
      id: asString(record.id),
      patientId: asString(record.patientId, patientId),
      status: asString(record.status, 'active'),
      openedAt: asString(record.openedAt),
      lastAccessedAt: asNullableString(record.lastAccessedAt),
      lastWrittenAt: asNullableString(record.lastWrittenAt),
      createdAt: asString(record.createdAt),
      updatedAt: asString(record.updatedAt),
    },
    notes: asArray(raw.notes)
      .map(mapNote)
      .filter((note) => note.id),
    attachments: asArray(raw.attachments)
      .map(mapAttachment)
      .filter((attachment) => attachment.id),
    careTeam: asArray(raw.careTeam)
      .map(mapCareTeamMember)
      .filter((member) => member.id),
    careTeamCandidates: asArray(raw.careTeamCandidates)
      .map(mapCandidate)
      .filter((candidate) => candidate.membershipId),
    audit: asArray(raw.audit)
      .map(mapAudit)
      .filter((entry) => entry.id),
    access: {
      canManageTeam: asBoolean(asRecord(raw.access).canManageTeam),
      canViewAudit: asBoolean(asRecord(raw.access).canViewAudit),
    },
  };
}

function mockSnapshot(summary: Patient360Summary, patientId: string): MedicalRecordSnapshot {
  const now = new Date().toISOString();
  const clinicalEvents = summary.recentTimeline.filter((event) => event.category === 'clinical');
  return {
    record: {
      id: `mock-record-${patientId}`,
      patientId,
      status: 'active',
      openedAt: summary.profile.createdAt || now,
      lastAccessedAt: now,
      lastWrittenAt: clinicalEvents[0]?.date ?? null,
      createdAt: summary.profile.createdAt || now,
      updatedAt: summary.lastUpdate ?? now,
    },
    notes: clinicalEvents.slice(0, 5).map((event) => ({
      id: `mock-note-${event.id}`,
      type: event.type === 'soap_atualizado' ? 'encounter' : 'evolution',
      status: 'final',
      title: event.title,
      summary: event.description,
      body: event.description,
      encounterId: null,
      soapNoteId: null,
      authoredBy: null,
      authorName: event.actorName ?? event.professional ?? 'Equipe clinica',
      authorRole: 'profissional',
      signedAt: event.date,
      createdAt: event.date,
      updatedAt: event.date,
    })),
    attachments: [],
    careTeam: summary.profile.careTeam.map((label, index) => ({
      id: `mock-team-${index}`,
      membershipId: `mock-membership-${index}`,
      userId: `mock-user-${index}`,
      name: label,
      email: null,
      roleCode: 'profissional',
      roleLabel: null,
      specialty: null,
      isPrimary: index === 0,
      status: 'active',
      startsAt: now,
      createdAt: now,
    })),
    careTeamCandidates: [],
    audit: [],
    access: { canManageTeam: false, canViewAudit: false },
  };
}

export async function getMedicalRecordSnapshot(
  patientId: string,
  includeAudit: boolean
): Promise<{ data: MedicalRecordSnapshot | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) {
      const { getPatient360 } = await import('@/services/mockApi');
      const summary = await getPatient360(patientId);
      if (!summary) {
        return { data: null, error: { message: 'Paciente mock nao encontrado.' } };
      }
      return { data: mockSnapshot(summary, patientId), error: null };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_medical_record_snapshot', {
      p_patient_id: patientId,
      p_include_audit: includeAudit,
    });

    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel carregar o prontuario.') };
    }

    return { data: mapSnapshot(data, patientId), error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel carregar o prontuario.') };
  }
}

export async function upsertPatientCareTeamMember(input: {
  patientId: string;
  membershipId: string;
  roleLabel?: string;
  specialty?: string;
  isPrimary?: boolean;
}): Promise<{ data: { id: string } | null; error: SafeServiceError | null }> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('upsert_patient_care_team_member', {
      p_patient_id: input.patientId,
      p_membership_id: input.membershipId,
      p_role_label: input.roleLabel ?? null,
      p_specialty: input.specialty ?? null,
      p_is_primary: input.isPrimary ?? false,
    });

    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel atualizar equipe.') };
    }

    return { data: { id: asString(asRecord(data).id) }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel atualizar equipe.') };
  }
}

export async function removePatientCareTeamMember(
  patientId: string,
  teamMemberId: string
): Promise<{ error: SafeServiceError | null }> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc('remove_patient_care_team_member', {
      p_patient_id: patientId,
      p_team_member_id: teamMemberId,
    });

    if (error) return { error: safeError(error, 'Nao foi possivel remover profissional.') };
    return { error: null };
  } catch (error) {
    return { error: safeError(error, 'Nao foi possivel remover profissional.') };
  }
}

export async function getRecordAttachmentSignedUrl(
  attachmentId: string,
  patientId: string
): Promise<{
  data: { url: string; expiresInSeconds: number } | null;
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.functions.invoke('record-attachment-signed-url', {
      body: {
        record_attachment_id: attachmentId,
        patient_id: patientId,
      },
    });

    if (error) {
      return { data: null, error: safeError(error, 'Nao foi possivel gerar link temporario.') };
    }

    const unwrapped = unwrapEdgeResponse<{ url: string; expiresInSeconds: number }>(data);
    if (unwrapped.error) return { data: null, error: unwrapped.error };
    return { data: unwrapped.data, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel gerar link temporario.') };
  }
}
