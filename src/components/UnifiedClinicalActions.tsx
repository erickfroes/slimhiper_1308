'use client';

import React, { useEffect, useState } from 'react';
import { ClipboardList, FlaskConical, Pill, UserPlus } from 'lucide-react';
import { createLabOrder } from '@/services/clinicalRecordsApi';
import { savePatientPrescription } from '@/services/prescriptionsApi';
import { upsertPatientTask } from '@/services/patientTasksApi';

export type UnifiedClinicalAction = 'lab' | 'prescription' | 'task';

type Props = {
  patientId: string;
  encounterId?: string | null;
  appointmentId?: string | null;
  sourceModule: 'encounter' | 'patient360' | 'agenda' | 'attendance_queue';
  initialAction?: UnifiedClinicalAction | null;
  onActionChange?: (action: UnifiedClinicalAction | null) => void;
  onSuccess?: (message: string) => void | Promise<void>;
  disabled?: boolean;
};

type LabForm = { panelName: string; tests: string; urgency: string; note: string };
type PrescriptionForm = {
  category:
    | 'prescricao_medica'
    | 'suplementacao'
    | 'orientacoes_nutricionais'
    | 'plano_alimentar'
    | 'orientacoes_gerais';
  title: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  instructions: string;
  patientVisible: boolean;
};
type TaskForm = {
  title: string;
  details: string;
  category: 'clinico' | 'financeiro' | 'documento' | 'comunicacao';
  priority: 'alta' | 'media' | 'baixa';
  dueAt: string;
  assignedTo: string;
};

const emptyLab = (): LabForm => ({ panelName: '', tests: '', urgency: 'routine', note: '' });
const emptyPrescription = (): PrescriptionForm => ({
  category: 'prescricao_medica',
  title: '',
  medicationName: '',
  dosage: '',
  frequency: '',
  instructions: '',
  patientVisible: true,
});
const emptyTask = (): TaskForm => ({
  title: '',
  details: '',
  category: 'clinico',
  priority: 'media',
  dueAt: '',
  assignedTo: '',
});

export default function UnifiedClinicalActions({
  patientId,
  encounterId,
  appointmentId,
  sourceModule,
  initialAction = null,
  onActionChange,
  onSuccess,
  disabled = false,
}: Props) {
  const [action, setAction] = useState<UnifiedClinicalAction | null>(initialAction);
  const [lab, setLab] = useState<LabForm>(() => emptyLab());
  const [prescription, setPrescription] = useState<PrescriptionForm>(() => emptyPrescription());
  const [task, setTask] = useState<TaskForm>(() => emptyTask());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAction(initialAction);
  }, [initialAction]);

  const chooseAction = (next: UnifiedClinicalAction) => {
    setAction(next);
    setMessage(null);
    setError(null);
    onActionChange?.(next);
  };

  const submitLab = async () => {
    const tests = lab.tests
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!lab.panelName.trim() || tests.length === 0)
      throw new Error('Informe o painel e ao menos um exame.');
    const result = await createLabOrder({
      patientId,
      encounterId: encounterId ?? null,
      panelName: lab.panelName,
      tests,
      urgency: lab.urgency,
      note: lab.note,
      appointmentId: appointmentId ?? null,
      sourceModule,
    });
    if (result.error || !result.data)
      throw new Error(result.error?.message ?? 'Não foi possível solicitar exames.');
    setLab(emptyLab());
    return 'Exames solicitados e registrados na timeline.';
  };

  const submitPrescription = async () => {
    const result = await savePatientPrescription({
      patientId,
      encounterId: encounterId ?? null,
      category: prescription.category,
      title: prescription.title || prescription.medicationName,
      medicationName: prescription.medicationName,
      dosage: prescription.dosage,
      frequency: prescription.frequency,
      instructions: prescription.instructions,
      patientVisible: prescription.patientVisible,
      finalize: true,
    });
    if (result.error || !result.data)
      throw new Error(result.error?.message ?? 'Não foi possível criar prescrição.');
    setPrescription(emptyPrescription());
    return 'Prescrição emitida e vinculada ao paciente.';
  };

  const submitTask = async () => {
    const result = await upsertPatientTask({
      patientId,
      title: task.title,
      details: task.details,
      category: task.category,
      priority: task.priority,
      dueAt: task.dueAt ? new Date(`${task.dueAt}T23:59:00`).toISOString() : null,
      assignedTo: task.assignedTo || null,
      sourceModule,
      encounterId: encounterId ?? null,
      appointmentId: appointmentId ?? null,
    });
    if (result.error || !result.data)
      throw new Error(result.error?.message ?? 'Não foi possível atribuir tarefa.');
    setTask(emptyTask());
    return 'Tarefa atribuida e registrada na timeline.';
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!action) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const success =
        action === 'lab'
          ? await submitLab()
          : action === 'prescription'
            ? await submitPrescription()
            : await submitTask();
      setMessage(success);
      await onSuccess?.(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Ações clínicas unificadas</h3>
          <p className="text-xs text-muted-foreground">
            Solicite exames, emita prescrições e atribua tarefas com origem auditável.
          </p>
        </div>
        {saving && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Salvando...
          </span>
        )}
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {[
          ['lab', 'Solicitar exames', FlaskConical],
          ['prescription', 'Criar prescrição', Pill],
          ['task', 'Atribuir tarefa', UserPlus],
        ].map(([key, label, Icon]) => (
          <button
            key={key as string}
            type="button"
            disabled={disabled || saving}
            onClick={() => chooseAction(key as UnifiedClinicalAction)}
            aria-pressed={action === key}
            className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 ${action === key ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary active:scale-95'}`}
          >
            <Icon size={14} />
            {label as string}
          </button>
        ))}
      </div>
      {error && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative"
        >
          {error}
        </div>
      )}
      {message && (
        <div
          role="status"
          className="mb-3 rounded-xl border border-positive/30 bg-positive/10 px-3 py-2 text-xs text-positive"
        >
          {message}
        </div>
      )}
      {action && (
        <form onSubmit={handleSubmit} className="space-y-3">
          {action === 'lab' && (
            <div className="grid gap-2 md:grid-cols-2">
              <input
                className="input-base text-sm"
                placeholder="Painel"
                value={lab.panelName}
                onChange={(e) => setLab((c) => ({ ...c, panelName: e.target.value }))}
              />
              <input
                className="input-base text-sm"
                placeholder="Exames separados por virgula"
                value={lab.tests}
                onChange={(e) => setLab((c) => ({ ...c, tests: e.target.value }))}
              />
              <select
                className="input-base text-sm"
                value={lab.urgency}
                onChange={(e) => setLab((c) => ({ ...c, urgency: e.target.value }))}
              >
                <option value="routine">Rotina</option>
                <option value="priority">Prioritario</option>
              </select>
              <input
                className="input-base text-sm"
                placeholder="Observação"
                value={lab.note}
                onChange={(e) => setLab((c) => ({ ...c, note: e.target.value }))}
              />
            </div>
          )}
          {action === 'prescription' && (
            <div className="grid gap-2 md:grid-cols-2">
              <select
                className="input-base text-sm"
                value={prescription.category}
                onChange={(e) =>
                  setPrescription((c) => ({
                    ...c,
                    category: e.target.value as PrescriptionForm['category'],
                  }))
                }
              >
                <option value="prescricao_medica">Prescrição médica</option>
                <option value="suplementacao">Suplementação</option>
                <option value="orientacoes_nutricionais">Orientações nutricionais</option>
                <option value="plano_alimentar">Plano alimentar</option>
                <option value="orientacoes_gerais">Orientações gerais</option>
              </select>
              <input
                className="input-base text-sm"
                placeholder="Titulo"
                value={prescription.title}
                onChange={(e) => setPrescription((c) => ({ ...c, title: e.target.value }))}
              />
              <input
                className="input-base text-sm"
                placeholder="Medicamento/item"
                value={prescription.medicationName}
                onChange={(e) => setPrescription((c) => ({ ...c, medicationName: e.target.value }))}
              />
              <input
                className="input-base text-sm"
                placeholder="Dose"
                value={prescription.dosage}
                onChange={(e) => setPrescription((c) => ({ ...c, dosage: e.target.value }))}
              />
              <input
                className="input-base text-sm"
                placeholder="Frequencia"
                value={prescription.frequency}
                onChange={(e) => setPrescription((c) => ({ ...c, frequency: e.target.value }))}
              />
              <input
                className="input-base text-sm"
                placeholder="Orientações"
                value={prescription.instructions}
                onChange={(e) => setPrescription((c) => ({ ...c, instructions: e.target.value }))}
              />
            </div>
          )}
          {action === 'task' && (
            <div className="grid gap-2 md:grid-cols-2">
              <input
                className="input-base text-sm"
                required
                placeholder="Titulo da tarefa"
                value={task.title}
                onChange={(e) => setTask((c) => ({ ...c, title: e.target.value }))}
              />
              <input
                className="input-base text-sm"
                placeholder="Responsável (UUID opcional)"
                value={task.assignedTo}
                onChange={(e) => setTask((c) => ({ ...c, assignedTo: e.target.value }))}
              />
              <select
                className="input-base text-sm"
                value={task.category}
                onChange={(e) =>
                  setTask((c) => ({ ...c, category: e.target.value as TaskForm['category'] }))
                }
              >
                <option value="clinico">Clinico</option>
                <option value="financeiro">Financeiro</option>
                <option value="documento">Documento</option>
                <option value="comunicacao">Comunicação</option>
              </select>
              <select
                className="input-base text-sm"
                value={task.priority}
                onChange={(e) =>
                  setTask((c) => ({ ...c, priority: e.target.value as TaskForm['priority'] }))
                }
              >
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
              <input
                className="input-base text-sm"
                type="date"
                value={task.dueAt}
                onChange={(e) => setTask((c) => ({ ...c, dueAt: e.target.value }))}
              />
              <input
                className="input-base text-sm"
                placeholder="Detalhes"
                value={task.details}
                onChange={(e) => setTask((c) => ({ ...c, details: e.target.value }))}
              />
            </div>
          )}
          <button
            type="submit"
            disabled={disabled || saving}
            className="btn-primary justify-center px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            aria-busy={saving}
          >
            <ClipboardList size={14} />
            {saving ? 'Salvando...' : 'Registrar ação'}
          </button>
        </form>
      )}
    </div>
  );
}
