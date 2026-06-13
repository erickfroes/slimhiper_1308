import type { PatientPrescriptionSummary } from '@/domain/types';
import { isMockDataEnabled } from '@/lib/mockMode';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface SafeServiceError {
  message: string;
  code?: string;
}

export type PrescriptionItemMutationInput = {
  id?: string;
  label: string;
  itemType?: NonNullable<PatientPrescriptionSummary['items']>[number]['itemType'];
  dosage?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  quantity?: string;
  instructions?: string;
  startDate?: string;
  endDate?: string;
  scheduleTimes?: string[];
  reminderEnabled?: boolean;
};

export type PrescriptionMutationInput = {
  patientId: string;
  prescriptionId?: string | null;
  encounterId?: string | null;
  category: NonNullable<PatientPrescriptionSummary['category']>;
  title?: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  instructions?: string;
  startDate?: string;
  endDate?: string;
  patientVisible?: boolean;
  items?: PrescriptionItemMutationInput[];
  finalize?: boolean;
};

export type PrescriptionPdfResult = {
  artifact: {
    id: string;
    status: string;
    versionNumber: number;
    generatedAt?: string;
    url: string;
    expiresInSeconds: number;
  };
  signature: {
    requirement: string;
    status: string;
  };
};

function isMockEnabled() {
  return isMockDataEnabled();
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

function normalizeItems(input: PrescriptionMutationInput) {
  const items = input.items?.filter((item) => item.label.trim()) ?? [];
  if (items.length > 0) {
    return items.map((item) => ({
      id: item.id,
      label: item.label.trim(),
      itemType: item.itemType,
      dosage: item.dosage?.trim() ?? '',
      route: item.route?.trim() ?? '',
      frequency: item.frequency?.trim() ?? '',
      duration: item.duration?.trim() ?? '',
      quantity: item.quantity?.trim() ?? '',
      instructions: item.instructions?.trim() ?? '',
      startDate: item.startDate ?? input.startDate ?? new Date().toISOString().slice(0, 10),
      endDate: item.endDate ?? input.endDate ?? null,
      scheduleTimes: item.scheduleTimes?.filter(Boolean) ?? [],
      reminderEnabled: item.reminderEnabled ?? false,
    }));
  }

  return [
    {
      label: input.medicationName.trim() || input.title?.trim() || 'Registro clinico',
      dosage: input.dosage.trim(),
      frequency: input.frequency.trim(),
      instructions: input.instructions?.trim() ?? '',
      startDate: input.startDate ?? new Date().toISOString().slice(0, 10),
      endDate: input.endDate ?? null,
      scheduleTimes: [],
      reminderEnabled: false,
    },
  ];
}

async function invokePrescriptionFunction<T>(fn: string, body: Record<string, unknown>) {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) return { data: null, error: safeError(error, `Falha ao chamar ${fn}.`) };

    const envelope = data as { ok?: boolean; data?: T; error?: SafeServiceError } | T | null;
    if (
      envelope &&
      typeof envelope === 'object' &&
      'ok' in envelope &&
      (envelope as { ok?: boolean }).ok === false
    ) {
      const err = (envelope as { error?: SafeServiceError }).error;
      return { data: null, error: err ?? { message: `Falha ao chamar ${fn}.` } };
    }

    const payload =
      envelope && typeof envelope === 'object' && 'data' in envelope
        ? ((envelope as { data?: T }).data ?? null)
        : (envelope as T | null);

    return { data: payload, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, `Falha ao chamar ${fn}.`) };
  }
}

export async function savePatientPrescription(input: PrescriptionMutationInput) {
  const invalid = assertPatientId(input.patientId);
  if (invalid) return invalid;

  const normalizedItems = normalizeItems(input);
  const hasStructuredItem = input.items?.some((item) => item.label.trim()) ?? false;
  if (
    !hasStructuredItem &&
    !input.medicationName.trim() &&
    !input.title?.trim() &&
    !input.instructions?.trim()
  ) {
    return { data: null, error: { message: 'Informe prescricao ou orientacao.' } };
  }

  if (isMockEnabled()) {
    return {
      data: {
        id: input.prescriptionId ?? `mock-prescription-${Date.now()}`,
        status: input.finalize === false ? 'draft' : 'issued',
        version: 1,
        signatureRequirement:
          input.category === 'prescricao_medica' ? 'qualified_or_icp_required' : 'none',
      },
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
        title: input.title ?? input.medicationName,
        medicationName: input.medicationName,
        dosage: input.dosage,
        frequency: input.frequency,
        instructions: input.instructions ?? '',
        notes: input.instructions ?? '',
        startDate: input.startDate ?? new Date().toISOString().slice(0, 10),
        endDate: input.endDate ?? null,
        patientVisible: input.patientVisible ?? true,
        items: normalizedItems,
      },
    });
    if (error) return { data: null, error: safeError(error, 'Falha ao salvar prescricao.') };
    return {
      data: data as {
        id: string;
        status: string;
        version?: number;
        signatureRequirement?: string;
      },
      error: null,
    };
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

export async function generatePatientPrescriptionPdf(prescriptionId: string, patientId: string) {
  if (!prescriptionId.trim() || !patientId.trim()) {
    return { data: null, error: { message: 'Prescricao e paciente sao obrigatorios.' } };
  }
  if (isMockEnabled()) {
    return {
      data: {
        artifact: {
          id: `mock-prescription-pdf-${Date.now()}`,
          status: 'generated',
          versionNumber: 1,
          url: '#',
          expiresInSeconds: 300,
        },
        signature: {
          requirement: 'none',
          status: 'not_required',
        },
      } satisfies PrescriptionPdfResult,
      error: null,
    };
  }

  return invokePrescriptionFunction<PrescriptionPdfResult>('generate-prescription-pdf', {
    prescription_id: prescriptionId,
    patient_id: patientId,
  });
}

export async function getPatientPrescriptionPdfSignedUrl(
  prescriptionPdfArtifactId: string,
  patientId: string
) {
  if (!prescriptionPdfArtifactId.trim() || !patientId.trim()) {
    return { data: null, error: { message: 'PDF e paciente sao obrigatorios.' } };
  }
  if (isMockEnabled()) {
    return {
      data: {
        url: '#',
        expiresInSeconds: 300,
        artifactId: prescriptionPdfArtifactId,
      },
      error: null,
    };
  }

  return invokePrescriptionFunction<{
    url: string;
    expiresInSeconds: number;
    artifactId: string;
    prescriptionId?: string;
  }>('prescription-pdf-signed-url', {
    prescription_pdf_artifact_id: prescriptionPdfArtifactId,
    patient_id: patientId,
  });
}
