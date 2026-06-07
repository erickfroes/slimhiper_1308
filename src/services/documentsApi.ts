import type { PatientDocument360Item, PatientDocumentSignatureStatus } from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}
interface DocumentSigner {
  name: string;
  email: string;
  role?: string;
}
interface GeneratedDocumentResult {
  generatedDocumentId: string;
  status: string;
}
interface SendForSignatureResult {
  requestId: string;
  status: string;
}
export interface DocumentEvidenceResult {
  id: string;
  documentId: string;
  documentName: string;
  status: string;
  summary: Record<string, unknown>;
  hasPackage: boolean;
  createdAt: string;
}
export interface ActiveDocumentTemplate {
  id: string;
  name: string;
  category: string;
  d4signEnabled: boolean;
  allowedVariables: string[];
}

const isMockEnabled = () => process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
const getSupabaseClient = () => createBrowserSupabaseClient();
const safeError = (error: unknown, fallback: string): SafeServiceError =>
  error instanceof Error ? { message: error.message || fallback } : { message: fallback };
const publicDocumentErrorMessage = (message: unknown, fallback: string) =>
  String(message ?? fallback).replace(/d4sign/gi, 'assinatura digital');

function getAllowedVariableKeys(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>);
}

async function getMockPatientDocuments360(patientId: string) {
  const { getPatientDocuments360 } = await import('@/services/mockApi');
  return getPatientDocuments360(patientId);
}

async function invokeSafe<T>(
  fn: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; meta?: Record<string, unknown>; error: SafeServiceError | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error)
    return {
      data: null,
      error: {
        message: 'Falha na operação de documentos.',
        code: error.name,
        details: error.message,
      },
    };
  if (data?.ok === false)
    return {
      data: null,
      error: {
        message: publicDocumentErrorMessage(data?.error?.message, 'Falha na operacao.'),
        code: String(data?.error?.code ?? 'unknown'),
      },
    };
  return {
    data: (data?.data ?? null) as T,
    meta: data?.meta as Record<string, unknown> | undefined,
    error: null,
  };
}

export async function getPatientDocuments(
  patientId: string
): Promise<{ data: PatientDocument360Item[]; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) return { data: await getMockPatientDocuments360(patientId), error: null };
    const res = await invokeSafe<{ documents: PatientDocument360Item[] }>('patient-documents', {
      patient_id: patientId,
    });
    return {
      data: Array.isArray(res.data?.documents) ? res.data!.documents : [],
      error: res.error,
    };
  } catch (error) {
    return {
      data: [],
      error: safeError(error, 'Não foi possível carregar documentos no momento.'),
    };
  }
}

export async function generatePatientDocument(
  patientId: string,
  templateId: string,
  variables: Record<string, unknown> = {}
): Promise<{ data: GeneratedDocumentResult | null; error: SafeServiceError | null }> {
  try {
    const res = await invokeSafe<{ generatedDocument: { id: string; status: string } }>(
      'generate-document',
      { patient_id: patientId, template_id: templateId, variables }
    );
    if (res.error) return { data: null, error: res.error };
    return {
      data: {
        generatedDocumentId: String(res.data?.generatedDocument?.id ?? ''),
        status: String(res.data?.generatedDocument?.status ?? 'draft'),
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: safeError(error, 'Não foi possível gerar o documento no momento.'),
    };
  }
}

export async function listActiveDocumentTemplates(categories?: string[]): Promise<{
  data: ActiveDocumentTemplate[];
  error: SafeServiceError | null;
}> {
  if (isMockEnabled()) {
    return {
      data: [
        {
          id: 'mock-template-prescricao',
          name: 'Prescricao / orientacao',
          category: 'prescricao',
          d4signEnabled: false,
          allowedVariables: [
            'prescription_title',
            'medication_name',
            'dosage',
            'frequency',
            'instructions',
            'category',
            'issue_date',
            'validity',
          ],
        },
      ],
      error: null,
    };
  }

  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('document_templates')
      .select('id,name,category,d4sign_enabled,variables')
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (categories && categories.length > 0) {
      query = query.in('category', categories);
    }

    const { data, error } = await query;
    if (error) return { data: [], error: { message: error.message, code: error.code } };
    return {
      data: (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id ?? ''),
        name: String(row.name ?? 'Template'),
        category: String(row.category ?? 'outros'),
        d4signEnabled: row.d4sign_enabled === true,
        allowedVariables: getAllowedVariableKeys(row.variables),
      })),
      error: null,
    };
  } catch (error) {
    return { data: [], error: safeError(error, 'Nao foi possivel carregar templates.') };
  }
}

export async function sendDocumentForSignature(
  generatedDocumentId: string,
  patientId: string,
  signers: Array<{
    name: string;
    email: string;
    role?: string;
    assinatura?: PatientDocumentSignatureStatus;
  }> = []
): Promise<{ data: SendForSignatureResult | null; error: SafeServiceError | null }> {
  try {
    const normalizedSigners: DocumentSigner[] = signers.map(({ name, email, role }) => ({
      name,
      email,
      role,
    }));
    const body: Record<string, unknown> = {
      generated_document_id: generatedDocumentId,
      patient_id: patientId,
    };
    if (normalizedSigners.length > 0) body.signers = normalizedSigners;
    const res = await invokeSafe<{
      signature_request_id: string;
      status: string;
    }>('d4sign-send-document', body);
    if (res.error) return { data: null, error: res.error };
    return {
      data: {
        requestId: String(res.data?.signature_request_id ?? ''),
        status: String(res.data?.status ?? 'sent'),
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: safeError(error, 'Não foi possível enviar para assinatura no momento.'),
    };
  }
}

export async function getDocumentSignedUrl(
  generatedDocumentId: string,
  patientId: string
): Promise<{
  data: { url: string; expiresInSeconds: number } | null;
  error: SafeServiceError | null;
}> {
  try {
    const res = await invokeSafe<{ url: string; expiresInSeconds: number }>('document-signed-url', {
      generated_document_id: generatedDocumentId,
      patient_id: patientId,
    });
    if (res.error) return { data: null, error: res.error };
    return { data: res.data, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Não foi possível gerar link temporário.') };
  }
}
export async function getPatientDocumentEvidence(
  generatedDocumentId: string,
  patientId: string
): Promise<{ data: DocumentEvidenceResult | null; error: SafeServiceError | null }> {
  if (!generatedDocumentId.trim() || !patientId.trim()) {
    return { data: null, error: { message: 'Documento e paciente sao obrigatorios.' } };
  }
  if (isMockEnabled()) {
    return {
      data: {
        id: `mock-evidence-${generatedDocumentId}`,
        documentId: generatedDocumentId,
        documentName: 'Documento',
        status: 'available',
        summary: { signatureRequests: [] },
        hasPackage: false,
        createdAt: new Date().toISOString(),
      },
      error: null,
    };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_document_evidence', {
      p_generated_document_id: generatedDocumentId,
      p_patient_id: patientId,
    });
    if (error) return { data: null, error: { message: error.message, code: error.code } };
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    return {
      data: {
        id: String(record.id ?? ''),
        documentId: String(record.documentId ?? generatedDocumentId),
        documentName: String(record.documentName ?? 'Documento'),
        status: String(record.status ?? 'available'),
        summary:
          record.summary && typeof record.summary === 'object'
            ? (record.summary as Record<string, unknown>)
            : {},
        hasPackage: record.hasPackage === true,
        createdAt: String(record.createdAt ?? ''),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel carregar evidencias.') };
  }
}
