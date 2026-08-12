'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  Filter,
  KanbanSquare,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import Dialog from '@/components/ui/Dialog';
import {
  convertCrmLeadToPatient,
  createCrmLead,
  createCrmLeadTask,
  emitCrmOperationalNotifications,
  getCrmLeadDetail,
  getCrmPipeline,
  moveCrmLeadStage,
  recordCrmLeadActivity,
  updateCrmLead,
  type CrmLead,
  type CrmLeadDetail,
  type CrmStage,
} from '@/services/crmApi';

type LeadFormState = {
  fullName: string;
  email: string;
  phone: string;
  source: string;
  campaign: string;
  contactPreference: string;
  contactConsent: boolean;
  consentPurpose: string;
  nextFollowUpAt: string;
};

const emptyLeadForm: LeadFormState = {
  fullName: '',
  email: '',
  phone: '',
  source: '',
  campaign: '',
  contactPreference: 'whatsapp',
  contactConsent: true,
  consentPurpose: 'Contato comercial sobre avaliacao inicial',
  nextFollowUpAt: '',
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function isOverdue(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function leadToForm(lead: CrmLead): LeadFormState {
  return {
    fullName: lead.fullName ?? '',
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    source: lead.source ?? '',
    campaign: lead.campaign ?? '',
    contactPreference: lead.contactPreference ?? 'whatsapp',
    contactConsent: lead.contactConsent,
    consentPurpose: lead.consentPurpose ?? 'Contato comercial sobre avaliacao inicial',
    nextFollowUpAt: toDateTimeLocal(lead.nextFollowUpAt),
  };
}

function contactLabel(lead: CrmLead) {
  return lead.phone || lead.email || 'Sem contato visivel';
}

function LeadCard({
  lead,
  selected,
  onSelect,
}: {
  lead: CrmLead;
  selected: boolean;
  onSelect: () => void;
}) {
  const overdue = isOverdue(lead.nextFollowUpAt);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full rounded-lg border bg-card p-3 text-left card-shadow transition-colors hover:border-primary/50 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary bg-selected ring-2 ring-primary/10' : 'border-border',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm text-foreground">{lead.fullName}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Phone size={12} /> {contactLabel(lead)}
          </p>
        </div>
        {lead.status === 'converted' ? (
          <span className="rounded-full border border-positive-border bg-positive-bg px-2 py-0.5 text-[11px] font-semibold text-positive-foreground">
            Convertido
          </span>
        ) : overdue ? (
          <span className="rounded-full border border-negative-border bg-negative-bg px-2 py-0.5 text-[11px] font-semibold text-negative-foreground">
            SLA vencido
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        <span className="rounded-full bg-surface-subtle px-2 py-0.5">
          {lead.source || 'Origem nao informada'}
        </span>
        <span className="rounded-full bg-surface-subtle px-2 py-0.5">
          {lead.campaign || 'Sem campanha'}
        </span>
      </div>
      <p className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Clock3 size={12} /> Próximo contato: {formatDateTime(lead.nextFollowUpAt)}
      </p>
    </button>
  );
}

function CreateLeadModal({
  form,
  submitting,
  onChange,
  onClose,
  mode = 'create',
  onSubmit,
}: {
  form: LeadFormState;
  submitting: boolean;
  mode?: 'create' | 'edit';
  onChange: (patch: Partial<LeadFormState>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog
      open
      title={mode === 'edit' ? 'Editar lead' : 'Novo lead'}
      description="PII comercial com consentimento e retencao LGPD."
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      placement="center"
    >
      <div className="-m-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="w-full"
        >
          <div className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-2">
            <label className="text-xs font-semibold text-foreground">
              Nome completo
              <input
                className="input-base mt-1 text-sm"
                value={form.fullName}
                onChange={(event) => onChange({ fullName: event.target.value })}
                required
              />
            </label>
            <label className="text-xs font-semibold text-foreground">
              Telefone
              <input
                className="input-base mt-1 text-sm"
                value={form.phone}
                onChange={(event) => onChange({ phone: event.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-foreground">
              Email
              <input
                type="email"
                className="input-base mt-1 text-sm"
                value={form.email}
                onChange={(event) => onChange({ email: event.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-foreground">
              Origem
              <input
                className="input-base mt-1 text-sm"
                value={form.source}
                onChange={(event) => onChange({ source: event.target.value })}
                placeholder="Instagram, indicação..."
              />
            </label>
            <label className="text-xs font-semibold text-foreground">
              Campanha
              <input
                className="input-base mt-1 text-sm"
                value={form.campaign}
                onChange={(event) => onChange({ campaign: event.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-foreground">
              Proximo contato
              <input
                type="datetime-local"
                className="input-base mt-1 text-sm"
                value={form.nextFollowUpAt}
                onChange={(event) => onChange({ nextFollowUpAt: event.target.value })}
              />
            </label>
            <label className="md:col-span-2 text-xs font-semibold text-foreground">
              Finalidade/base do contato
              <input
                className="input-base mt-1 text-sm"
                value={form.consentPurpose}
                onChange={(event) => onChange({ consentPurpose: event.target.value })}
              />
            </label>
            <label className="md:col-span-2 flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={form.contactConsent}
                onChange={(event) => onChange({ contactConsent: event.target.checked })}
                className="mt-0.5"
              />
              Confirmo que ha consentimento/base legal para contato comercial e que dados sensiveis
              nao serao inseridos em notas livres.
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : mode === 'edit' ? (
                <Pencil size={16} />
              ) : (
                <Plus size={16} />
              )}{' '}
              {mode === 'edit' ? 'Salvar lead' : 'Criar lead'}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}

function LeadDetailPanel({
  detail,
  stages,
  loading,
  actionLoading,
  onClose,
  onMove,
  onRefresh,
  onEdit,
  onConvert,
  onAddNote,
  onAddTask,
}: {
  detail: CrmLeadDetail | null;
  stages: CrmStage[];
  loading: boolean;
  actionLoading: boolean;
  onClose: () => void;
  onMove: (stageId: string) => void;
  onRefresh: () => void;
  onEdit: () => void;
  onConvert: (createAppointment: boolean) => void;
  onAddNote: (title: string, description: string) => void;
  onAddTask: (title: string, dueAt: string) => void;
}) {
  const [noteTitle, setNoteTitle] = useState('Contato realizado');
  const [noteDescription, setNoteDescription] = useState('');
  const [taskTitle, setTaskTitle] = useState('Retornar contato');
  const [taskDueAt, setTaskDueAt] = useState('');

  if (!detail && !loading) return null;

  return (
    <Dialog
      open={Boolean(detail || loading)}
      title="Detalhe do lead"
      description="Timeline comercial, tarefas e conversao auditada."
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="right"
    >
      <div className="-m-5">
        {loading || !detail ? (
          <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 animate-spin" size={16} /> Carregando lead...
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <section className="rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">{detail.lead.fullName}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{contactLabel(detail.lead)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {detail.lead.stageLabel || detail.lead.status}
                  </span>
                  <button
                    type="button"
                    onClick={onEdit}
                    disabled={actionLoading || detail.lead.status === 'converted'}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <Pencil size={13} /> Editar
                  </button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/50 p-2">
                  <span className="text-muted-foreground">Origem</span>
                  <p className="font-semibold">{detail.lead.source || 'N/A'}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <span className="text-muted-foreground">Campanha</span>
                  <p className="font-semibold">{detail.lead.campaign || 'N/A'}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <span className="text-muted-foreground">SLA</span>
                  <p className="font-semibold">{formatDateTime(detail.lead.nextFollowUpAt)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <span className="text-muted-foreground">Consentimento</span>
                  <p className="font-semibold">
                    {detail.lead.contactConsent ? 'Ativo' : 'Pendente'}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <select
                  disabled={actionLoading || detail.lead.status === 'converted'}
                  value={detail.lead.stageId ?? ''}
                  onChange={(event) => onMove(event.target.value)}
                  className="input-base text-sm"
                >
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={actionLoading || detail.lead.status === 'converted'}
                  onClick={() => onConvert(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <UserCheck size={15} /> Converter
                </button>
                <button
                  type="button"
                  disabled={actionLoading || detail.lead.status === 'converted'}
                  onClick={() => onConvert(true)}
                  className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <CalendarPlus size={15} /> Converter e criar consulta inicial
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-border p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck size={15} /> Consentimentos
              </h4>
              <div className="mt-3 space-y-2">
                {detail.consents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sem registros granulares; conversao exige consentimento ativo no lead.
                  </p>
                ) : (
                  detail.consents.map((consent) => (
                    <div key={consent.id} className="rounded-lg bg-muted/40 p-2 text-xs">
                      <p className="font-semibold">
                        {consent.channel} · {consent.status}
                      </p>
                      <p className="text-muted-foreground">{consent.purpose}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border p-4">
              <h4 className="text-sm font-semibold text-foreground">Nova nota segura</h4>
              <input
                className="input-base mt-3 text-sm"
                value={noteTitle}
                onChange={(event) => setNoteTitle(event.target.value)}
              />
              <textarea
                className="input-base mt-2 min-h-20 text-sm"
                value={noteDescription}
                onChange={(event) => setNoteDescription(event.target.value)}
                placeholder="Evite dados clinicos/sensiveis em nota comercial."
              />
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onAddNote(noteTitle, noteDescription)}
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
              >
                <MessageSquarePlus size={15} /> Registrar nota
              </button>
            </section>

            <section className="rounded-2xl border border-border p-4">
              <h4 className="text-sm font-semibold text-foreground">Tarefas</h4>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_150px]">
                <input
                  className="input-base text-sm"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                />
                <input
                  type="datetime-local"
                  className="input-base text-sm"
                  value={taskDueAt}
                  onChange={(event) => setTaskDueAt(event.target.value)}
                />
              </div>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onAddTask(taskTitle, taskDueAt)}
                className="mt-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
              >
                Criar tarefa
              </button>
              <div className="mt-3 space-y-2">
                {detail.tasks.map((task) => (
                  <div key={task.id} className="rounded-lg bg-muted/40 p-2 text-xs">
                    <p className="font-semibold">{task.title}</p>
                    <p
                      className={
                        task.status === 'overdue' ? 'text-red-700' : 'text-muted-foreground'
                      }
                    >
                      {task.status} · {formatDateTime(task.dueAt)}
                    </p>
                  </div>
                ))}
                {detail.tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma tarefa comercial.</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Timeline comercial</h4>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="rounded-lg p-1.5 hover:bg-muted"
                  aria-label="Atualizar timeline"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {detail.activities.map((activity) => (
                  <div key={activity.id} className="border-l-2 border-primary/30 pl-3 text-xs">
                    <p className="font-semibold text-foreground">{activity.title}</p>
                    <p className="text-muted-foreground">
                      {formatDateTime(activity.occurredAt)} · {activity.activityType}
                    </p>
                    {activity.description ? (
                      <p className="mt-1 text-muted-foreground">{activity.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default function CrmPipelineContent() {
  const searchParams = useSearchParams();
  const initialLeadId = searchParams.get('leadId');
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('open');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialLeadId);
  const [detail, setDetail] = useState<CrmLeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [leadForm, setLeadForm] = useState<LeadFormState>(emptyLeadForm);

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    const result = await getCrmPipeline({
      status: status || undefined,
      search: search || undefined,
    });
    if (result.error) {
      setError(result.error.code === '42501' ? 'forbidden' : result.error.message);
      setStages([]);
      setLeads([]);
    } else {
      setError(null);
      setStages(result.data?.stages ?? []);
      setLeads(result.data?.leads ?? []);
    }
    setLoading(false);
  }, [search, status]);

  const loadDetail = useCallback(async (leadId: string) => {
    setDetailLoading(true);
    const result = await getCrmLeadDetail(leadId);
    if (result.error) {
      toast.error(result.error.message);
      setDetail(null);
    } else {
      setDetail(result.data);
    }
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline]);

  useEffect(() => {
    if (selectedLeadId) void loadDetail(selectedLeadId);
  }, [loadDetail, selectedLeadId]);

  const filteredLeads = useMemo(() => {
    return leads.filter(
      (lead) => !source || lead.source?.toLowerCase().includes(source.toLowerCase())
    );
  }, [leads, source]);

  const sources = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.source).filter(Boolean))) as string[],
    [leads]
  );
  const overdueCount = filteredLeads.filter(
    (lead) => isOverdue(lead.nextFollowUpAt) && lead.status === 'open'
  ).length;
  const convertedCount = filteredLeads.filter((lead) => lead.status === 'converted').length;

  async function handleCreateLead() {
    if (!leadForm.fullName.trim() || (!leadForm.email.trim() && !leadForm.phone.trim())) {
      toast.error('Informe nome e ao menos um contato para criar o lead.');
      return;
    }
    setActionLoading(true);
    const result = await createCrmLead({
      ...leadForm,
      nextFollowUpAt: leadForm.nextFollowUpAt
        ? new Date(leadForm.nextFollowUpAt).toISOString()
        : undefined,
    });
    setActionLoading(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Lead criado com auditoria.');
    setCreateOpen(false);
    setLeadForm(emptyLeadForm);
    await loadPipeline();
    if (result.data?.id) setSelectedLeadId(result.data.id);
  }

  async function handleUpdateLead() {
    if (!selectedLeadId) return;
    if (!leadForm.fullName.trim() || (!leadForm.email.trim() && !leadForm.phone.trim())) {
      toast.error('Informe nome e ao menos um contato para salvar o lead.');
      return;
    }
    setActionLoading(true);
    const result = await updateCrmLead(selectedLeadId, {
      ...leadForm,
      nextFollowUpAt: leadForm.nextFollowUpAt
        ? new Date(leadForm.nextFollowUpAt).toISOString()
        : undefined,
    });
    setActionLoading(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Lead atualizado com auditoria.');
    setEditOpen(false);
    await Promise.all([loadPipeline(), loadDetail(selectedLeadId)]);
  }

  function handleOpenEdit() {
    if (!detail) return;
    setLeadForm(leadToForm(detail.lead));
    setEditOpen(true);
  }

  async function handleMove(stageId: string) {
    if (!selectedLeadId) return;
    setActionLoading(true);
    const result = await moveCrmLeadStage(selectedLeadId, stageId);
    setActionLoading(false);
    if (result.error) toast.error(result.error.message);
    else {
      toast.success('Lead movido no funil.');
      await Promise.all([loadPipeline(), loadDetail(selectedLeadId)]);
    }
  }

  async function handleConvert(createAppointment: boolean) {
    if (!selectedLeadId) return;
    setActionLoading(true);
    const scheduledAt = createAppointment
      ? new Date(Date.now() + 86400000).toISOString()
      : undefined;
    const result = await convertCrmLeadToPatient(selectedLeadId, {
      createAppointment,
      scheduledAt,
      appointmentType: 'avaliacao_inicial',
    });
    setActionLoading(false);
    if (result.error) toast.error(result.error.message);
    else if (result.data?.status === 'failed') {
      toast.error('Conversao bloqueada: revise consentimento/base legal do lead.');
      await loadDetail(selectedLeadId);
    } else {
      toast.success(
        result.data?.idempotent ? 'Lead ja estava convertido.' : 'Lead convertido em paciente.'
      );
      await Promise.all([loadPipeline(), loadDetail(selectedLeadId)]);
    }
  }

  async function handleAddNote(title: string, description: string) {
    if (!selectedLeadId) return;
    setActionLoading(true);
    const result = await recordCrmLeadActivity(selectedLeadId, title, description);
    setActionLoading(false);
    if (result.error) toast.error(result.error.message);
    else {
      toast.success('Nota registrada.');
      await loadDetail(selectedLeadId);
    }
  }

  async function handleAddTask(title: string, dueAt: string) {
    if (!selectedLeadId) return;
    setActionLoading(true);
    const result = await createCrmLeadTask(selectedLeadId, {
      title,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
    });
    setActionLoading(false);
    if (result.error) toast.error(result.error.message);
    else {
      toast.success('Tarefa criada e notificada.');
      await loadDetail(selectedLeadId);
    }
  }

  async function handleEmitNotifications() {
    const result = await emitCrmOperationalNotifications();
    if (result.error) toast.error(result.error.message);
    else
      toast.success(
        `Alertas atualizados: ${result.data?.overdueTasks ?? 0} tarefas vencidas e ${result.data?.stalledLeads ?? 0} leads parados.`
      );
  }

  const leadsByStage = useMemo(() => {
    return stages.map((stage) => ({
      stage,
      leads: filteredLeads.filter((lead) => lead.stageId === stage.id),
    }));
  }, [filteredLeads, stages]);

  if (error === 'forbidden') {
    return (
      <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
        <EmptyState
          icon={AlertTriangle}
          title="Acesso ao CRM bloqueado"
          description="Seu usuario nao possui permissao crm.read para visualizar leads deste workspace."
        />
      </div>
    );
  }

  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto space-y-6">
      <PageHeader
        title="CRM operacional"
        subtitle="Funil comercial com consentimento LGPD, tarefas, atividades e conversao auditada lead -> paciente."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleEmitNotifications}
              className="btn-secondary min-h-11 gap-2 px-3 text-sm"
            >
              <AlertTriangle size={16} /> Atualizar alertas
            </button>
            <button
              type="button"
              onClick={() => {
                setLeadForm(emptyLeadForm);
                setCreateOpen(true);
              }}
              className="btn-primary min-h-11 gap-2 px-3 text-sm"
            >
              <Plus size={16} /> Novo lead
            </button>
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="card-base p-4">
          <p className="text-xs font-medium text-muted-foreground">Leads filtrados</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{filteredLeads.length}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs font-medium text-muted-foreground">SLA/tarefas vencidas</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-negative-foreground">
            {overdueCount}
          </p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs font-medium text-muted-foreground">Convertidos</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-positive-foreground">
            {convertedCount}
          </p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs text-muted-foreground">Contrato</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 size={16} className="text-emerald-600" /> RPC/RLS auditado
          </p>
        </div>
      </section>

      <section className="card-base p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
          <label className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input-base pl-9 text-sm"
              placeholder="Buscar por nome, e-mail ou telefone"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="input-base text-sm"
            aria-label="Status do lead"
          >
            <option value="open">Abertos</option>
            <option value="converted">Convertidos</option>
            <option value="lost">Perdidos</option>
            <option value="">Todos</option>
          </select>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="input-base text-sm"
            aria-label="Origem"
          >
            <option value="">Todas origens</option>
            {sources.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadPipeline}
            className="btn-secondary min-h-11 gap-2 px-3 text-sm"
          >
            <Filter size={16} /> Filtrar
          </button>
        </div>
      </section>

      {error ? (
        <EmptyState icon={AlertTriangle} title="CRM indisponivel" description={error} />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-72 rounded-xl bg-surface-subtle animate-pulse" />
          ))}
        </div>
      ) : filteredLeads.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="Nenhum lead encontrado"
          description="Crie um lead com consentimento ou ajuste os filtros do funil."
        />
      ) : (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          {leadsByStage.map(({ stage, leads: stageLeads }) => (
            <div key={stage.id} className="rounded-xl border border-border bg-surface-subtle p-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">{stage.label}</h2>
                <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                  {stageLeads.length}
                </span>
              </div>
              <div className="space-y-3">
                {stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    selected={selectedLeadId === lead.id}
                    onSelect={() => setSelectedLeadId(lead.id)}
                  />
                ))}
                {stageLeads.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Sem leads nesta etapa.
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
        Conversao nao chama financeiro nem providers externos. Pacientes convertidos ficam
        disponiveis em{' '}
        <Link className="font-semibold text-primary" href="/clinic/patients">
          Pacientes
        </Link>{' '}
        e podem receber consulta inicial opcional pela RPC auditada.
      </div>

      <LeadDetailPanel
        detail={detail}
        stages={stages}
        loading={detailLoading}
        actionLoading={actionLoading}
        onClose={() => {
          setSelectedLeadId(null);
          setDetail(null);
        }}
        onMove={handleMove}
        onRefresh={() => selectedLeadId && loadDetail(selectedLeadId)}
        onEdit={handleOpenEdit}
        onConvert={handleConvert}
        onAddNote={handleAddNote}
        onAddTask={handleAddTask}
      />

      {createOpen ? (
        <CreateLeadModal
          form={leadForm}
          submitting={actionLoading}
          mode="create"
          onChange={(patch) => setLeadForm((current) => ({ ...current, ...patch }))}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreateLead}
        />
      ) : null}

      {editOpen ? (
        <CreateLeadModal
          form={leadForm}
          submitting={actionLoading}
          mode="edit"
          onChange={(patch) => setLeadForm((current) => ({ ...current, ...patch }))}
          onClose={() => setEditOpen(false)}
          onSubmit={handleUpdateLead}
        />
      ) : null}
    </div>
  );
}
