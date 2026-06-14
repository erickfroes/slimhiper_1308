import { isMockDataEnabled } from '@/lib/mockMode';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface SafeServiceError {
  message: string;
  code?: string;
}

export type PatientTaskMutationInput = {
  patientId: string;
  taskId?: string | null;
  title: string;
  details?: string;
  assignedTo?: string | null;
  dueAt?: string | null;
  category?: 'clinico' | 'financeiro' | 'documento' | 'comunicacao';
  priority?: 'alta' | 'media' | 'baixa';
  sourceModule?: 'encounter' | 'patient360' | 'agenda' | 'attendance_queue' | 'programs';
  encounterId?: string | null;
  appointmentId?: string | null;
};

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

export async function upsertPatientTask(
  input: PatientTaskMutationInput
): Promise<{ data: { id: string; status: string } | null; error: SafeServiceError | null }> {
  if (!input.patientId.trim() || !input.title.trim()) {
    return { data: null, error: { message: 'Paciente e titulo da tarefa sao obrigatorios.' } };
  }
  if (isMockDataEnabled()) {
    return { data: { id: input.taskId ?? `mock-task-${Date.now()}`, status: 'open' }, error: null };
  }
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('upsert_patient_clinical_task', {
      p_payload: {
        patientId: input.patientId,
        taskId: input.taskId ?? null,
        title: input.title,
        details: input.details ?? null,
        assignedTo: input.assignedTo ?? null,
        dueAt: input.dueAt ?? null,
        category: input.category ?? 'clinico',
        priority: input.priority ?? 'media',
        sourceModule: input.sourceModule ?? 'patient360',
        encounterId: input.encounterId ?? null,
        appointmentId: input.appointmentId ?? null,
      },
    });
    if (error) throw error;
    const record = data as { id?: string; status?: string } | null;
    if (!record?.id) throw new Error('invalid_patient_task_contract');
    return { data: { id: record.id, status: record.status ?? 'open' }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao salvar tarefa clinica.') };
  }
}

export async function setPatientTaskStatus(input: {
  patientId: string;
  taskId: string;
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  sourceModule?: string;
  reason?: string;
}): Promise<{ data: { id: string; status: string } | null; error: SafeServiceError | null }> {
  if (isMockDataEnabled()) return { data: { id: input.taskId, status: input.status }, error: null };
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('set_patient_clinical_task_status', {
      p_patient_id: input.patientId,
      p_task_id: input.taskId,
      p_status: input.status,
      p_source_module: input.sourceModule ?? 'patient360',
      p_reason: input.reason ?? null,
    });
    if (error) throw error;
    const record = data as { id?: string; status?: string } | null;
    if (!record?.id) throw new Error('invalid_patient_task_status_contract');
    return { data: { id: record.id, status: record.status ?? input.status }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Falha ao atualizar tarefa clinica.') };
  }
}
