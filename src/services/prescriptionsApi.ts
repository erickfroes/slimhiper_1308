import type { PatientPrescriptionSummary } from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface SafeServiceError {
  message: string;
  code?: string;
}

export type PrescriptionMutationInput = {
  patientId: string;
  prescriptionId?: string | null;
  encounterId?: string | null;
  category: NonNullable<PatientPrescriptionSummary['category']>;
  medicationName: string;
  dosage: string;
  frequency: string;
  instructions?: string;
  startDate?: string;
  endDate?: string;
  finalize?: boolean;
};

function isMockEnabled() {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; code?: unknown; name?: unknown };
    return {
      message: typeof record.message === 'string' ? record.message : fallback,
      code:
        typeof record.code === 'string'
          ? record.code
          : typeof record.name === 'string'
            ? record.name
            : undefined,
    };
  }
  return { message: fallback };
}

function assertPatientId(patientId: string) {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para prescricoes.' } };
  }
  return null;
}

export async function savePatientPrescription(input: PrescriptionMutationInput) {
  const invalid = assertPatientId(input.patientId);
  if (invalid) return invalid;

  if (!input.medicationName.trim() && !input.instructions?.trim()) {
    return { data: null, error: { message: 'Informe prescricao ou orientacao.' } };
  }

  if (isMockEnabled()) {
    return {
      data: { id: input.prescriptionId ?? `mock-prescription-${Date.now()}`, status: 'final' },
      error: null,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('upsert_patient_prescription', {
      p_patient_id: input.patientId,
      p_prescription_id: input.prescriptionId ?? null,
      p_encounter_id: input.encounterId ?? null,
      p_finalize: input.finalize ?? true,
      p_payload: {
        category: input.category,
        medicationName: input.medicationName,
        dosage: input.dosage,
        frequency: input.frequency,
        instructions: input.instructions ?? '',
        notes: input.instructions ?? '',
        startDate: input.startDate ?? new Date().toISOString().slice(0, 10),
        endDate: input.endDate ?? null,
      },
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao salvar prescricao.') };
    return { data: data as { id: string; status: string }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao salvar prescricao.') };
  }
}

export async function duplicatePatientPrescription(prescriptionId: string) {
  if (!prescriptionId.trim()) {
    return { data: null, error: { message: 'Prescricao invalida para duplicar.' } };
  }
  if (isMockEnabled()) {
    return { data: { id: `mock-prescription-copy-${Date.now()}`, status: 'draft' }, error: null };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('duplicate_patient_prescription', {
      p_prescription_id: prescriptionId,
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao duplicar prescricao.') };
    return { data: data as { id: string; status: string }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao duplicar prescricao.') };
  }
}

export async function cancelPatientPrescription(prescriptionId: string, reason?: string) {
  if (!prescriptionId.trim()) {
    return { data: null, error: { message: 'Prescricao invalida para cancelar.' } };
  }
  if (isMockEnabled()) {
    return { data: { id: prescriptionId, status: 'cancelled' }, error: null };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('cancel_patient_prescription', {
      p_prescription_id: prescriptionId,
      p_reason: reason ?? null,
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao cancelar prescricao.') };
    return { data: data as { id: string; status: string }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao cancelar prescricao.') };
  }
}

export async function linkPatientPrescriptionDocument(
  prescriptionId: string,
  generatedDocumentId: string
) {
  if (!prescriptionId.trim() || !generatedDocumentId.trim()) {
    return { data: null, error: { message: 'Prescricao e documento sao obrigatorios.' } };
  }
  if (isMockEnabled()) {
    return {
      data: {
        id: prescriptionId,
        documentId: generatedDocumentId,
        documentName: `Documento ${generatedDocumentId.slice(0, 8)}`,
        status: 'draft',
      },
      error: null,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('link_patient_prescription_document', {
      p_prescription_id: prescriptionId,
      p_generated_document_id: generatedDocumentId,
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao vincular documento.') };
    return {
      data: data as {
        id: string;
        documentId: string;
        documentName: string;
        status: string;
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao vincular documento.') };
  }
}
