import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  generatePatientDocument,
  getDocumentSignedUrl,
  sendDocumentForSignature,
} from '@/services/documentsApi';

export interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

export interface ClinicDocumentTemplate {
  id: string;
  name: string;
  category: string;
  status: string;
  d4signEnabled: boolean;
  allowedVariables: string[];
}

export interface ClinicDocumentPatient {
  id: string;
  name: string;
}

export interface ClinicDocumentRow {
  id: string;
  name: string;
  patientId: string;
  patientName: string;
  category: string;
  status: string;
  signatureStatus: string;
  releasedToPatient: boolean;
  generatedAt: string;
  updatedAt: string;
  canRequestSignature: boolean;
  d4signEnabled: boolean;
}

export interface ClinicDocumentMonitorEvent {
  id: string;
  title: string;
  status: 'pending' | 'failed' | 'signed' | 'processed';
  createdAt: string;
  patientId?: string;
  documentId?: string;
  error?: string | null;
}

export interface ClinicDocumentsWorkspace {
  templates: ClinicDocumentTemplate[];
  patients: ClinicDocumentPatient[];
  documents: ClinicDocumentRow[];
  monitorEvents: ClinicDocumentMonitorEvent[];
  metrics: {
    templates: number;
    generated: number;
    pendingSignature: number;
    signed: number;
    failed: number;
  };
}

type TemplateRow = {
  id: string;
  name: string | null;
  category: string | null;
  status: string | null;
  d4sign_enabled: boolean | null;
  variables: unknown;
};

type GeneratedDocumentRow = {
  id: string;
  patient_id: string;
  name: string | null;
  category: string | null;
  status: string | null;
  released_to_patient: boolean | null;
  document_templates?:
    | {
        d4sign_enabled: boolean | null;
      }
    | Array<{
        d4sign_enabled: boolean | null;
      }>
    | null;
  generated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  signature_requests?: Array<{
    id: string;
    status: string | null;
    created_at: string | null;
  }> | null;
};

type PatientRow = {
  id: string;
  preferred_name: string | null;
};

type PatientPiiRow = {
  patient_id: string;
  full_name: string | null;
};

type D4SignEventRow = {
  id: string;
  event_type: string | null;
  status: string | null;
  retry_count: number | null;
  error_message: string | null;
  created_at: string | null;
  processed_at: string | null;
  payload_summary: unknown;
};

const PROTECTED_TEMPLATE_VARIABLES = new Set([
  'patient_id',
  'patient_name',
  'patient_email',
  'patient_phone',
  'patient_cpf_masked',
  'patient_birth_date',
  'patient_sex_gender',
  'clinic_name',
  'date',
  'generated_at',
  'generated_by_user_id',
  'professional_name',
]);

const SIGNATURE_PENDING_STATUSES = new Set(['pending', 'sent', 'viewed']);
const DOCUMENT_FAILED_STATUSES = new Set(['failed', 'expired', 'cancelled', 'canceled']);

function safeError(error: unknown, fallback: string): SafeServiceError {
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

function getAllowedVariables(value: unknown): string[] {
  return Object.keys(asRecord(value))
    .filter((key) => !PROTECTED_TEMPLATE_VARIABLES.has(key))
    .sort((a, b) => a.localeCompare(b));
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function getDocumentTemplate(row: GeneratedDocumentRow) {
  const template = row.document_templates;
  return Array.isArray(template) ? (template[0] ?? null) : (template ?? null);
}

function isD4SignEnabled(row: GeneratedDocumentRow) {
  return getDocumentTemplate(row)?.d4sign_enabled === true;
}

function mapSignatureStatus(row: GeneratedDocumentRow) {
  const signature = row.signature_requests?.[0] ?? null;
  if (!signature) return 'nao_requerido';
  const status = String(signature.status ?? '').toLowerCase();
  if (status === 'signed') return 'assinado';
  if (status === 'rejected' || status === 'canceled' || status === 'cancelled') return 'recusado';
  if (status === 'expired') return 'expirado';
  if (status === 'failed' || status === 'error') return 'falhou';
  return 'pendente';
}

function canRequestSignature(row: GeneratedDocumentRow) {
  const status = String(row.status ?? '').toLowerCase();
  if (!isD4SignEnabled(row)) return false;
  const signature = row.signature_requests?.[0] ?? null;
  const signatureStatus = String(signature?.status ?? '').toLowerCase();
  if (
    status === 'signed' ||
    status === 'cancelled' ||
    status === 'expired' ||
    status === 'failed'
  ) {
    return false;
  }
  if (signature && SIGNATURE_PENDING_STATUSES.has(signatureStatus)) return false;
  return true;
}

function mapDocument(
  row: GeneratedDocumentRow,
  patientNameById: Map<string, string>
): ClinicDocumentRow {
  return {
    id: row.id,
    name: row.name ?? 'Documento',
    patientId: row.patient_id,
    patientName: patientNameById.get(row.patient_id) ?? `Paciente ${row.patient_id.slice(0, 8)}`,
    category: row.category ?? 'outros',
    status: row.status ?? 'generated',
    signatureStatus: mapSignatureStatus(row),
    releasedToPatient: row.released_to_patient === true,
    generatedAt: formatDate(row.generated_at ?? row.created_at),
    updatedAt: formatDate(row.updated_at ?? row.created_at),
    canRequestSignature: canRequestSignature(row),
    d4signEnabled: isD4SignEnabled(row),
  };
}

function mapTemplate(row: TemplateRow): ClinicDocumentTemplate {
  return {
    id: row.id,
    name: row.name ?? 'Template',
    category: row.category ?? 'outros',
    status: row.status ?? 'draft',
    d4signEnabled: row.d4sign_enabled === true,
    allowedVariables: getAllowedVariables(row.variables),
  };
}

function getEventSummary(row: D4SignEventRow): ClinicDocumentMonitorEvent {
  const payload = asRecord(row.payload_summary);
  const status = String(row.status ?? '').toLowerCase();
  const normalizedStatus = String(payload.status ?? '').toLowerCase();
  const failed = status === 'failed' || normalizedStatus === 'error';
  const signed = normalizedStatus === 'signed';
  const pending = ['pending', 'sent', 'viewed'].includes(normalizedStatus);

  return {
    id: row.id,
    title: row.event_type ?? 'd4sign.event',
    status: failed ? 'failed' : signed ? 'signed' : pending ? 'pending' : 'processed',
    createdAt: formatDate(row.created_at),
    error: row.error_message,
  };
}

export async function getClinicDocumentsWorkspace(): Promise<{
  data: ClinicDocumentsWorkspace | null;
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const [templatesRes, documentsRes, patientsRes, eventsRes] = await Promise.all([
      supabase
        .from('document_templates')
        .select('id,name,category,status,d4sign_enabled,variables')
        .order('name', { ascending: true }),
      supabase
        .from('generated_documents')
        .select(
          'id,patient_id,name,category,status,released_to_patient,generated_at,created_at,updated_at,document_templates!generated_documents_template_same_tenant(d4sign_enabled),signature_requests(id,status,created_at)'
        )
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('patients')
        .select('id,preferred_name')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('d4sign_events')
        .select(
          'id,event_type,status,retry_count,error_message,created_at,processed_at,payload_summary'
        )
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (templatesRes.error)
      return { data: null, error: safeError(templatesRes.error, 'Templates indisponiveis.') };
    if (documentsRes.error)
      return { data: null, error: safeError(documentsRes.error, 'Documentos indisponiveis.') };

    const documentRows = (documentsRes.data ?? []) as GeneratedDocumentRow[];
    const patientRows = patientsRes.error ? [] : ((patientsRes.data ?? []) as PatientRow[]);
    const patientIds = [
      ...new Set([
        ...documentRows.map((row) => row.patient_id),
        ...patientRows.map((row) => row.id),
      ]),
    ];

    let piiRows: PatientPiiRow[] = [];
    if (patientIds.length > 0) {
      const { data: piiData } = await supabase
        .from('patient_pii')
        .select('patient_id,full_name')
        .in('patient_id', patientIds);
      piiRows = (piiData ?? []) as PatientPiiRow[];
    }

    const patientNameById = new Map<string, string>();
    for (const patient of patientRows) {
      patientNameById.set(
        patient.id,
        patient.preferred_name ?? `Paciente ${patient.id.slice(0, 8)}`
      );
    }
    for (const pii of piiRows) {
      if (pii.full_name) patientNameById.set(pii.patient_id, pii.full_name);
    }

    const templates = ((templatesRes.data ?? []) as TemplateRow[]).map(mapTemplate);
    const documents = documentRows.map((row) => mapDocument(row, patientNameById));
    const monitorEvents = [
      ...documents
        .filter(
          (doc) => doc.signatureStatus === 'pendente' || DOCUMENT_FAILED_STATUSES.has(doc.status)
        )
        .map((doc) => ({
          id: `doc-${doc.id}`,
          title: `${doc.name} - ${doc.patientName}`,
          status: DOCUMENT_FAILED_STATUSES.has(doc.status)
            ? ('failed' as const)
            : ('pending' as const),
          createdAt: doc.updatedAt,
          patientId: doc.patientId,
          documentId: doc.id,
          error: DOCUMENT_FAILED_STATUSES.has(doc.status)
            ? `Documento em status ${doc.status}`
            : null,
        })),
      ...((eventsRes.data ?? []) as D4SignEventRow[]).map(getEventSummary),
    ].slice(0, 25);

    const patients = patientRows.map((patient) => ({
      id: patient.id,
      name:
        patientNameById.get(patient.id) ??
        patient.preferred_name ??
        `Paciente ${patient.id.slice(0, 8)}`,
    }));

    return {
      data: {
        templates,
        patients,
        documents,
        monitorEvents,
        metrics: {
          templates: templates.filter((template) => template.status === 'active').length,
          generated: documents.length,
          pendingSignature: documents.filter((doc) => doc.signatureStatus === 'pendente').length,
          signed: documents.filter((doc) => doc.signatureStatus === 'assinado').length,
          failed: documents.filter((doc) => DOCUMENT_FAILED_STATUSES.has(doc.status)).length,
        },
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel carregar documentos.') };
  }
}

export async function generateClinicDocument(
  patientId: string,
  templateId: string,
  variables: Record<string, string>
) {
  return generatePatientDocument(patientId, templateId, variables);
}

export async function requestClinicDocumentSignature(documentId: string, patientId: string) {
  return sendDocumentForSignature(documentId, patientId);
}

export async function getClinicDocumentSignedUrl(documentId: string, patientId: string) {
  return getDocumentSignedUrl(documentId, patientId);
}

export async function setClinicDocumentPatientRelease(
  documentId: string,
  patientId: string,
  releasedToPatient: boolean
): Promise<{
  data: { id: string; releasedToPatient: boolean } | null;
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('generated_documents')
      .update({ released_to_patient: releasedToPatient })
      .eq('id', documentId)
      .eq('patient_id', patientId)
      .select('id,released_to_patient')
      .single();

    if (error)
      return { data: null, error: safeError(error, 'Nao foi possivel atualizar liberacao.') };

    return {
      data: { id: data.id as string, releasedToPatient: data.released_to_patient === true },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel atualizar liberacao.') };
  }
}
