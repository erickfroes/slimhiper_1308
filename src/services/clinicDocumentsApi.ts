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
  signatureLabel: string;
  templateBody: string;
  allowedVariables: string[];
  currentVersion: number;
  updatedAt: string;
  generatedCount: number;
}

export interface ClinicDocumentCategory {
  id: string;
  label: string;
  templates: number;
  activeTemplates: number;
  documents: number;
}

export interface ClinicDocumentPatient {
  id: string;
  name: string;
}

export interface ClinicDocumentRow {
  id: string;
  displayCode: string;
  name: string;
  patientId: string;
  patientName: string;
  templateId: string | null;
  templateName: string | null;
  category: string;
  status: string;
  statusKind: 'draft' | 'available' | 'pending_signature' | 'signed' | 'failed' | 'restricted';
  signatureStatus: string;
  releasedToPatient: boolean;
  generatedAt: string;
  updatedAt: string;
  canRequestSignature: boolean;
  signatureEnabled: boolean;
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

export interface ClinicDocumentAuditEvent {
  id: string;
  action: string;
  title: string;
  createdAt: string;
  patientId?: string;
  documentId?: string;
  templateId?: string;
}

export interface ClinicDocumentsWorkspace {
  templates: ClinicDocumentTemplate[];
  categories: ClinicDocumentCategory[];
  patients: ClinicDocumentPatient[];
  documents: ClinicDocumentRow[];
  monitorEvents: ClinicDocumentMonitorEvent[];
  auditEvents: ClinicDocumentAuditEvent[];
  warnings: SafeServiceError[];
  metrics: {
    templates: number;
    generated: number;
    pendingSignature: number;
    signed: number;
    failed: number;
    released: number;
  };
}

type TemplateRow = {
  id: string;
  name: string | null;
  category: string | null;
  status: string | null;
  d4sign_enabled: boolean | null;
  variables: unknown;
  template_body: string | null;
  current_version?: number | null;
  updated_at: string | null;
};

type GeneratedDocumentRow = {
  id: string;
  patient_id: string;
  template_id: string | null;
  name: string | null;
  category: string | null;
  status: string | null;
  released_to_patient: boolean | null;
  document_templates?:
    | {
        name: string | null;
        d4sign_enabled: boolean | null;
      }
    | Array<{
        name: string | null;
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

type ProviderEventRow = {
  id: string;
  event_type: string | null;
  status: string | null;
  retry_count: number | null;
  error_message: string | null;
  created_at: string | null;
  processed_at: string | null;
  payload_summary: unknown;
};

type AuditEventRow = {
  id: string;
  action: string | null;
  created_at: string | null;
  patient_id: string | null;
  generated_document_id: string | null;
  template_id: string | null;
  summary: unknown;
};

export const PROTECTED_TEMPLATE_VARIABLES = new Set([
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
const TEMPLATE_VARIABLE_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g;

const DOCUMENT_FAILED_STATUSES = new Set(['failed', 'expired', 'cancelled', 'canceled']);

const CATEGORY_LABELS: Record<string, string> = {
  consent: 'Consentimento',
  consentimento: 'Consentimento',
  contract: 'Contrato',
  contrato: 'Contrato',
  termo: 'Termo',
  orientacao: 'Orientacao',
  orientation: 'Orientacao',
  prescricao: 'Prescricao',
  prescription: 'Prescricao',
  outros: 'Outros',
};

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

export function getAllowedVariables(value: unknown): string[] {
  return Object.keys(asRecord(value))
    .filter((key) => !PROTECTED_TEMPLATE_VARIABLES.has(key))
    .sort((a, b) => a.localeCompare(b));
}

function normalizeCategory(value: string | null | undefined) {
  const normalized = String(value ?? 'outros')
    .trim()
    .toLowerCase();
  return normalized || 'outros';
}

function getCategoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
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

function isSignatureEnabled(row: GeneratedDocumentRow) {
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

function getStatusKind(
  status: string,
  signatureStatus: string,
  releasedToPatient: boolean
): ClinicDocumentRow['statusKind'] {
  const normalized = status.toLowerCase();
  if (signatureStatus === 'assinado' || normalized === 'signed') return 'signed';
  if (signatureStatus === 'pendente' || normalized === 'sent_for_signature') {
    return 'pending_signature';
  }
  if (DOCUMENT_FAILED_STATUSES.has(normalized) || signatureStatus === 'falhou') return 'failed';
  if (normalized === 'draft') return 'draft';
  if (!releasedToPatient) return 'restricted';
  return 'available';
}

function canRequestSignature(row: GeneratedDocumentRow) {
  const status = String(row.status ?? '').toLowerCase();
  if (!isSignatureEnabled(row)) return false;
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

function shortCode(id: string) {
  return id ? id.slice(0, 8).toUpperCase() : '-';
}

function mapDocument(
  row: GeneratedDocumentRow,
  patientNameById: Map<string, string>
): ClinicDocumentRow {
  const template = getDocumentTemplate(row);
  const signatureStatus = mapSignatureStatus(row);
  const status = row.status ?? 'generated';
  const releasedToPatient = row.released_to_patient === true;

  return {
    id: row.id,
    displayCode: shortCode(row.id),
    name: row.name ?? 'Documento',
    patientId: row.patient_id,
    patientName: patientNameById.get(row.patient_id) ?? `Paciente ${shortCode(row.patient_id)}`,
    templateId: row.template_id,
    templateName: template?.name ?? null,
    category: normalizeCategory(row.category),
    status,
    statusKind: getStatusKind(status, signatureStatus, releasedToPatient),
    signatureStatus,
    releasedToPatient,
    generatedAt: formatDate(row.generated_at ?? row.created_at),
    updatedAt: formatDate(row.updated_at ?? row.created_at),
    canRequestSignature: canRequestSignature(row),
    signatureEnabled: isSignatureEnabled(row),
  };
}

function mapTemplate(row: TemplateRow, generatedCount: number): ClinicDocumentTemplate {
  return {
    id: row.id,
    name: row.name ?? 'Template',
    category: normalizeCategory(row.category),
    status: row.status ?? 'draft',
    d4signEnabled: row.d4sign_enabled === true,
    signatureLabel: row.d4sign_enabled === true ? 'Assinatura digital' : 'Sem assinatura',
    templateBody: row.template_body ?? '',
    allowedVariables: getAllowedVariables(row.variables),
    currentVersion: Number(row.current_version ?? 1),
    updatedAt: formatDate(row.updated_at),
    generatedCount,
  };
}

function getProviderEventSummary(row: ProviderEventRow): ClinicDocumentMonitorEvent {
  const payload = asRecord(row.payload_summary);
  const status = String(row.status ?? '').toLowerCase();
  const normalizedStatus = String(payload.status ?? '').toLowerCase();
  const failed = status === 'failed' || normalizedStatus === 'error';
  const signed = normalizedStatus === 'signed';
  const pending = ['pending', 'sent', 'viewed'].includes(normalizedStatus);

  return {
    id: row.id,
    title: `Evento de assinatura digital: ${row.event_type ?? 'status'}`,
    status: failed ? 'failed' : signed ? 'signed' : pending ? 'pending' : 'processed',
    createdAt: formatDate(row.created_at),
    error: row.error_message ? row.error_message.slice(0, 180) : null,
  };
}

function mapAuditEvent(row: AuditEventRow): ClinicDocumentAuditEvent {
  const action = row.action ?? 'document.event';
  const labels: Record<string, string> = {
    'document.generated': 'Documento gerado',
    'document.status_changed': 'Status do documento atualizado',
    'document.signature_requested': 'Assinatura digital solicitada',
    'document.signature_status_changed': 'Status de assinatura atualizado',
    'document.released_to_patient': 'Documento liberado ao paciente',
    'document.hidden_from_patient': 'Documento ocultado do paciente',
    'document_template.duplicated': 'Template duplicado',
    'document_template.created': 'Template criado',
    'document_template.updated': 'Template atualizado',
    'document_template.archived': 'Template arquivado',
    'document_template.restored': 'Template restaurado',
    'document_template.published': 'Template publicado',
  };

  return {
    id: row.id,
    action,
    title: labels[action] ?? action.replace(/\./g, ' '),
    createdAt: formatDate(row.created_at),
    patientId: row.patient_id ?? undefined,
    documentId: row.generated_document_id ?? undefined,
    templateId: row.template_id ?? undefined,
  };
}

function buildCategories(
  templates: ClinicDocumentTemplate[],
  documents: ClinicDocumentRow[]
): ClinicDocumentCategory[] {
  const categories = new Map<string, ClinicDocumentCategory>();

  for (const template of templates) {
    const current = categories.get(template.category) ?? {
      id: template.category,
      label: getCategoryLabel(template.category),
      templates: 0,
      activeTemplates: 0,
      documents: 0,
    };
    current.templates += 1;
    if (template.status === 'active') current.activeTemplates += 1;
    categories.set(template.category, current);
  }

  for (const document of documents) {
    const current = categories.get(document.category) ?? {
      id: document.category,
      label: getCategoryLabel(document.category),
      templates: 0,
      activeTemplates: 0,
      documents: 0,
    };
    current.documents += 1;
    categories.set(document.category, current);
  }

  return [...categories.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export async function getClinicDocumentsWorkspace(): Promise<{
  data: ClinicDocumentsWorkspace | null;
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const [templatesRes, documentsRes, patientsRes, eventsRes, auditRes] = await Promise.all([
      supabase
        .from('document_templates')
        .select(
          'id,name,category,status,d4sign_enabled,variables,template_body,current_version,updated_at'
        )
        .order('name', { ascending: true }),
      supabase
        .from('generated_documents')
        .select(
          'id,patient_id,template_id,name,category,status,released_to_patient,generated_at,created_at,updated_at,document_templates!generated_documents_template_same_tenant(name,d4sign_enabled),signature_requests(id,status,created_at)'
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
      supabase
        .from('document_audit_events')
        .select('id,action,created_at,patient_id,generated_document_id,template_id,summary')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (templatesRes.error)
      return { data: null, error: safeError(templatesRes.error, 'Templates indisponiveis.') };
    if (documentsRes.error)
      return { data: null, error: safeError(documentsRes.error, 'Documentos indisponiveis.') };

    const warnings: SafeServiceError[] = [];
    if (patientsRes.error) {
      warnings.push(safeError(patientsRes.error, 'Lista de pacientes indisponivel.'));
    }
    if (eventsRes.error) {
      warnings.push(safeError(eventsRes.error, 'Monitor de assinatura indisponivel.'));
    }
    if (auditRes.error) {
      warnings.push(safeError(auditRes.error, 'Auditoria documental indisponivel.'));
    }

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
      const { data: piiData, error: piiError } = await supabase
        .from('patient_pii')
        .select('patient_id,full_name')
        .in('patient_id', patientIds);
      if (piiError) {
        warnings.push(safeError(piiError, 'Identificacao completa de pacientes indisponivel.'));
      }
      piiRows = (piiData ?? []) as PatientPiiRow[];
    }

    const patientNameById = new Map<string, string>();
    for (const patient of patientRows) {
      patientNameById.set(
        patient.id,
        patient.preferred_name ?? `Paciente ${shortCode(patient.id)}`
      );
    }
    for (const pii of piiRows) {
      if (pii.full_name) patientNameById.set(pii.patient_id, pii.full_name);
    }

    const generatedCountByTemplate = new Map<string, number>();
    for (const row of documentRows) {
      if (!row.template_id) continue;
      generatedCountByTemplate.set(
        row.template_id,
        (generatedCountByTemplate.get(row.template_id) ?? 0) + 1
      );
    }

    const templates = ((templatesRes.data ?? []) as TemplateRow[]).map((row) =>
      mapTemplate(row, generatedCountByTemplate.get(row.id) ?? 0)
    );
    const documents = documentRows.map((row) => mapDocument(row, patientNameById));
    const categories = buildCategories(templates, documents);

    const monitorEvents = [
      ...documents
        .filter(
          (doc) =>
            doc.signatureStatus === 'pendente' ||
            DOCUMENT_FAILED_STATUSES.has(doc.status.toLowerCase())
        )
        .map((doc) => ({
          id: `doc-${doc.id}`,
          title: `${doc.name} - ${doc.patientName}`,
          status: DOCUMENT_FAILED_STATUSES.has(doc.status.toLowerCase())
            ? ('failed' as const)
            : ('pending' as const),
          createdAt: doc.updatedAt,
          patientId: doc.patientId,
          documentId: doc.id,
          error: DOCUMENT_FAILED_STATUSES.has(doc.status.toLowerCase())
            ? `Documento em status ${doc.status}`
            : null,
        })),
      ...((eventsRes.data ?? []) as ProviderEventRow[]).map(getProviderEventSummary),
    ].slice(0, 25);

    const patients = patientRows.map((patient) => ({
      id: patient.id,
      name:
        patientNameById.get(patient.id) ??
        patient.preferred_name ??
        `Paciente ${shortCode(patient.id)}`,
    }));

    const auditEvents = auditRes.error
      ? []
      : ((auditRes.data ?? []) as AuditEventRow[]).map(mapAuditEvent);

    return {
      data: {
        templates,
        categories,
        patients,
        documents,
        monitorEvents,
        auditEvents,
        warnings,
        metrics: {
          templates: templates.filter((template) => template.status === 'active').length,
          generated: documents.length,
          pendingSignature: documents.filter((doc) => doc.signatureStatus === 'pendente').length,
          signed: documents.filter((doc) => doc.signatureStatus === 'assinado').length,
          failed: documents.filter((doc) => DOCUMENT_FAILED_STATUSES.has(doc.status.toLowerCase()))
            .length,
          released: documents.filter((doc) => doc.releasedToPatient).length,
        },
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel carregar documentos.') };
  }
}

export interface ClinicDocumentTemplatePayload {
  name: string;
  category: string;
  templateBody: string;
  status: 'draft' | 'active' | 'archived';
  d4signEnabled: boolean;
  allowedVariables: string[];
}

function extractTemplateVariables(templateBody: string) {
  return [...templateBody.matchAll(TEMPLATE_VARIABLE_PATTERN)].map((match) => match[1] ?? '');
}

export function validateTemplateVariables(
  templateBody: string,
  allowedVariables: string[]
): SafeServiceError | null {
  const uniqueAllowed = new Set(allowedVariables.map((item) => item.trim()).filter(Boolean));
  for (const variable of uniqueAllowed) {
    if (PROTECTED_TEMPLATE_VARIABLES.has(variable)) {
      return { message: `A variavel protegida ${variable} nao pode ser editada diretamente.` };
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(variable)) {
      return { message: `Variavel invalida: ${variable}. Use apenas letras, numeros e _.` };
    }
  }

  for (const variable of extractTemplateVariables(templateBody)) {
    if (PROTECTED_TEMPLATE_VARIABLES.has(variable)) continue;
    if (!uniqueAllowed.has(variable)) {
      return { message: `Inclua ${variable} nas variaveis permitidas antes de salvar.` };
    }
  }

  return null;
}

function buildVariablesJson(allowedVariables: string[]) {
  return Object.fromEntries(
    [...new Set(allowedVariables.map((item) => item.trim()).filter(Boolean))].map((key) => [
      key,
      { source: 'manual' },
    ])
  );
}

function mapTemplateMutationResult(data: unknown) {
  const record = asRecord(data);
  return {
    id: String(record.id ?? ''),
    name: String(record.name ?? 'Template'),
    status: String(record.status ?? 'draft'),
    currentVersion: Number(record.currentVersion ?? 1),
  };
}

export async function createClinicDocumentTemplate(
  payload: ClinicDocumentTemplatePayload
): Promise<{
  data: { id: string; name: string; status: string; currentVersion: number } | null;
  error: SafeServiceError | null;
}> {
  const validationError = validateTemplateVariables(payload.templateBody, payload.allowedVariables);
  if (validationError) return { data: null, error: validationError };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('create_document_template', {
      p_name: payload.name,
      p_category: payload.category,
      p_template_body: payload.templateBody,
      p_variables: buildVariablesJson(payload.allowedVariables),
      p_d4sign_enabled: payload.d4signEnabled,
      p_status: payload.status,
    });

    if (error) return { data: null, error: safeError(error, 'Nao foi possivel criar template.') };
    return { data: mapTemplateMutationResult(data), error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel criar template.') };
  }
}

export async function updateClinicDocumentTemplate(
  templateId: string,
  payload: ClinicDocumentTemplatePayload
): Promise<{
  data: { id: string; name: string; status: string; currentVersion: number } | null;
  error: SafeServiceError | null;
}> {
  const validationError = validateTemplateVariables(payload.templateBody, payload.allowedVariables);
  if (validationError) return { data: null, error: validationError };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('update_document_template', {
      p_template_id: templateId,
      p_name: payload.name,
      p_category: payload.category,
      p_template_body: payload.templateBody,
      p_variables: buildVariablesJson(payload.allowedVariables),
      p_d4sign_enabled: payload.d4signEnabled,
      p_status: payload.status,
    });

    if (error)
      return { data: null, error: safeError(error, 'Nao foi possivel atualizar template.') };
    return { data: mapTemplateMutationResult(data), error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel atualizar template.') };
  }
}

export async function archiveClinicDocumentTemplate(templateId: string, archived: boolean) {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('archive_document_template', {
      p_template_id: templateId,
      p_archived: archived,
    });

    if (error)
      return { data: null, error: safeError(error, 'Nao foi possivel arquivar/restaurar.') };
    return { data: mapTemplateMutationResult(data), error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel arquivar/restaurar.') };
  }
}

export async function publishClinicDocumentTemplate(templateId: string) {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('publish_document_template', {
      p_template_id: templateId,
    });

    if (error) return { data: null, error: safeError(error, 'Nao foi possivel publicar.') };
    return { data: mapTemplateMutationResult(data), error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel publicar.') };
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

export async function duplicateClinicDocumentTemplate(
  templateId: string,
  name?: string
): Promise<{
  data: { id: string; name: string; status: string; currentVersion: number } | null;
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('duplicate_document_template', {
      p_template_id: templateId,
      p_name: name ?? null,
    });

    if (error) return { data: null, error: safeError(error, 'Nao foi possivel duplicar.') };

    const record = asRecord(data);
    return {
      data: {
        id: String(record.id ?? ''),
        name: String(record.name ?? 'Template'),
        status: String(record.status ?? 'draft'),
        currentVersion: Number(record.currentVersion ?? 1),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel duplicar.') };
  }
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
    const { data, error } = await supabase.rpc('set_generated_document_patient_release', {
      p_generated_document_id: documentId,
      p_patient_id: patientId,
      p_released_to_patient: releasedToPatient,
      p_reason: releasedToPatient
        ? 'released_from_clinic_documents'
        : 'hidden_from_clinic_documents',
    });

    if (error)
      return { data: null, error: safeError(error, 'Nao foi possivel atualizar liberacao.') };

    const record = asRecord(data);
    return {
      data: {
        id: String(record.id ?? documentId),
        releasedToPatient: record.releasedToPatient === true,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel atualizar liberacao.') };
  }
}
