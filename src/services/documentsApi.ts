import type { PatientDocument360Item, PatientDocumentSignatureStatus } from '@/domain/types';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getPatientDocuments360 } from '@/services/mockApi';

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

function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function getSupabaseClient() {
  return createBrowserSupabaseClient();
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) {
    return { message: error.message || fallback };
  }
  return { message: fallback };
}

export async function getPatientDocuments(
  patientId: string,
): Promise<{ data: PatientDocument360Item[]; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) {
      const docs = await getPatientDocuments360(patientId);
      return { data: docs, error: null };
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('generate-document', {
      body: { patient_id: patientId, action: 'list_documents' },
    });

    if (error) {
      return { data: [], error: { message: 'Falha ao carregar documentos.', code: error.name, details: error.message } };
    }

    const documents = Array.isArray(data?.documents) ? (data.documents as PatientDocument360Item[]) : [];
    return { data: documents, error: null };
  } catch (error) {
    return { data: [], error: safeError(error, 'Não foi possível carregar documentos no momento.') };
  }
}

export async function generatePatientDocument(
  patientId: string,
  templateId: string,
): Promise<{ data: GeneratedDocumentResult | null; error: SafeServiceError | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('generate-document', {
      body: { patient_id: patientId, template_id: templateId },
    });

    if (error) {
      return { data: null, error: { message: 'Falha ao gerar documento.', code: error.name, details: error.message } };
    }

    return {
      data: {
        generatedDocumentId: String(data?.generated_document_id ?? ''),
        status: String(data?.status ?? 'gerado'),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Não foi possível gerar o documento no momento.') };
  }
}

export async function sendDocumentForSignature(
  generatedDocumentId: string,
  patientId: string,
  signers: Array<{ name: string; email: string; role?: string; assinatura?: PatientDocumentSignatureStatus }>,
): Promise<{ data: SendForSignatureResult | null; error: SafeServiceError | null }> {
  try {
    const normalizedSigners: DocumentSigner[] = signers.map((signer) => ({
      name: signer.name,
      email: signer.email,
      role: signer.role,
    }));

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('d4sign-send-document', {
      body: {
        generated_document_id: generatedDocumentId,
        patient_id: patientId,
        signers: normalizedSigners,
      },
    });

    if (error) {
      return {
        data: null,
        error: { message: 'Falha ao enviar documento para assinatura.', code: error.name, details: error.message },
      };
    }

    return {
      data: {
        requestId: String(data?.request_id ?? ''),
        status: String(data?.status ?? 'enviado'),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Não foi possível enviar para assinatura no momento.') };
  }
}
