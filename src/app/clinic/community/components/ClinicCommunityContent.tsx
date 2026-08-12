'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Flag,
  Megaphone,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  UsersRound,
  XCircle,
} from 'lucide-react';
import DataState from '@/components/ui/DataState';
import Dialog from '@/components/ui/Dialog';
import MetricCard from '@/components/ui/MetricCard';
import {
  getClinicCommunityModeration,
  moderateCommunityItem,
  upsertWeeklyPrompt,
  type ClinicCommunityFilter,
  type ClinicCommunityModerationItem,
  type ClinicCommunityModerationPayload,
  type CommunityModerationAction,
} from '@/services/communityApi';

type ModerationTarget = {
  item: ClinicCommunityModerationItem;
  action: Exclude<CommunityModerationAction, 'approve'>;
} | null;

const filters: Array<{ id: ClinicCommunityFilter; label: string }> = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'rejected', label: 'Rejeitados' },
  { id: 'reported', label: 'Denunciados' },
];

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'Pendente',
    className: 'border-warning-border bg-warning-bg text-warning-foreground',
  },
  approved: {
    label: 'Aprovado',
    className: 'border-positive-border bg-positive-bg text-positive-foreground',
  },
  rejected: {
    label: 'Rejeitado',
    className: 'border-negative-border bg-negative-bg text-negative-foreground',
  },
  hidden: {
    label: 'Oculto',
    className: 'border-border bg-surface-subtle text-muted-foreground',
  },
  removed: {
    label: 'Removido',
    className: 'border-border bg-surface-subtle text-muted-foreground',
  },
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(status: string) {
  return statusConfig[status] ?? statusConfig.pending;
}

function initials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function ClinicCommunityContent() {
  const [payload, setPayload] = useState<ClinicCommunityModerationPayload | null>(null);
  const [filter, setFilter] = useState<ClinicCommunityFilter>('pending');
  const [programId, setProgramId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [moderationTarget, setModerationTarget] = useState<ModerationTarget>(null);
  const [moderationReason, setModerationReason] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptProgramId, setPromptProgramId] = useState('');
  const [promptTitle, setPromptTitle] = useState('');
  const [promptBody, setPromptBody] = useState('');
  const [promptStartsOn, setPromptStartsOn] = useState(todayIsoDate);
  const [promptEndsOn, setPromptEndsOn] = useState('');

  const communityPrograms = useMemo(
    () => payload?.programs.filter((program) => program.communityEnabled) ?? [],
    [payload?.programs]
  );

  const loadModeration = useCallback(
    async (nextFilter: ClinicCommunityFilter, nextProgramId: string) => {
      setLoading(true);
      setError(null);
      const response = await getClinicCommunityModeration(nextFilter, nextProgramId || null);
      if (response.error || !response.data) {
        setPayload(null);
        setError(response.error?.message ?? 'Nao foi possivel carregar a moderacao.');
      } else {
        setPayload(response.data);
      }
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    void loadModeration(filter, programId);
  }, [filter, loadModeration, programId]);

  function handleFilterChange(nextFilter: ClinicCommunityFilter) {
    setFilter(nextFilter);
  }

  function handleProgramChange(nextProgramId: string) {
    setProgramId(nextProgramId);
  }

  async function runModeration(
    item: ClinicCommunityModerationItem,
    action: CommunityModerationAction,
    reason?: string
  ) {
    setBusyKey(`${action}-${item.id}`);
    setActionMessage(null);
    const response = await moderateCommunityItem(item.itemType, item.id, action, reason);
    if (response.error) {
      setActionMessage(response.error.message);
    } else {
      setActionMessage('Moderacao registrada com auditoria.');
      await loadModeration(filter, programId);
    }
    setBusyKey(null);
  }

  async function confirmModerationWithReason() {
    if (!moderationTarget || !moderationReason.trim()) return;
    await runModeration(moderationTarget.item, moderationTarget.action, moderationReason);
    setModerationTarget(null);
    setModerationReason('');
  }

  async function handleSavePrompt() {
    setBusyKey('prompt');
    setActionMessage(null);
    const response = await upsertWeeklyPrompt({
      programId: promptProgramId || null,
      title: promptTitle,
      body: promptBody,
      startsOn: promptStartsOn,
      endsOn: promptEndsOn || null,
    });
    if (response.error) {
      setActionMessage(response.error.message);
    } else {
      setPromptOpen(false);
      setPromptTitle('');
      setPromptBody('');
      setPromptStartsOn(todayIsoDate());
      setPromptEndsOn('');
      setActionMessage('Prompt semanal salvo.');
      await loadModeration(filter, programId);
    }
    setBusyKey(null);
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Comunidade</p>
          <h1 className="mt-1 text-xl font-bold text-foreground">Moderacao por programa</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Conteudos de pacientes ficam ligados ao programa ativo e passam por fila de moderacao
            antes de aparecer no portal.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setPromptOpen(true)}
            className="btn-primary justify-center"
          >
            <Megaphone className="h-4 w-4" aria-hidden="true" />
            Prompt semanal
          </button>
          <button
            type="button"
            onClick={() => void loadModeration(filter, programId)}
            className="btn-secondary justify-center"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Atualizar
          </button>
        </div>
      </div>

      {actionMessage ? (
        <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          {actionMessage}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard
          icon={ShieldCheck}
          label="Pendentes"
          value={payload?.summary.pending ?? 0}
          tone={(payload?.summary.pending ?? 0) > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Aprovados hoje"
          value={payload?.summary.approvedToday ?? 0}
          tone="success"
        />
        <MetricCard
          icon={Flag}
          label="Denuncias abertas"
          value={payload?.summary.reported ?? 0}
          tone={(payload?.summary.reported ?? 0) > 0 ? 'danger' : 'default'}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 card-shadow sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-subtle p-1 scrollbar-thin">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void handleFilterChange(item.id)}
              className={[
                'min-h-9 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition',
                filter === item.id
                  ? 'bg-card text-brand-deep card-shadow'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground sm:min-w-64">
          Programa
          <select
            value={programId}
            onChange={(event) => handleProgramChange(event.target.value)}
            className="input-base min-h-11 text-sm"
          >
            <option value="">Todos os programas</option>
            {payload?.programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
                {program.communityEnabled ? '' : ' - sem comunidade'}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loading ? (
        <DataState
          kind="loading"
          title="Carregando fila"
          description="Buscando posts, comentarios e denuncias."
        />
      ) : error ? (
        <DataState
          kind="error"
          title="Fila indisponivel"
          description={error}
          actionLabel="Tentar novamente"
          onAction={() => void loadModeration(filter, programId)}
        />
      ) : payload?.items.length === 0 ? (
        <DataState
          kind="empty"
          title="Nenhum item neste filtro"
          description="A fila esta limpa para a combinacao selecionada."
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {payload?.items.map((item) => {
            const status = statusLabel(item.status);
            const busyApprove = busyKey === `approve-${item.id}`;
            return (
              <article
                key={`${item.itemType}-${item.id}`}
                className="rounded-xl border border-border bg-card p-4 card-shadow"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                      aria-hidden="true"
                    >
                      {initials(item.authorLabel)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                          {item.itemType === 'comment' ? (
                            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {item.itemType === 'comment' ? 'Comentario' : 'Post'}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}
                        >
                          {status.label}
                        </span>
                        {item.reportCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-negative-border bg-negative-bg px-2.5 py-1 text-xs font-semibold text-negative-foreground">
                            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                            {item.reportCount}
                          </span>
                        ) : null}
                        {item.riskFlag ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning-foreground">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            Triagem
                          </span>
                        ) : null}
                      </div>
                      <h2 className="mt-3 text-sm font-semibold text-foreground">
                        {item.authorLabel} em {item.programName}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>

                {item.parentBody ? (
                  <blockquote className="mt-4 rounded-lg border-l-4 border-primary/30 bg-surface-subtle px-3 py-2 text-xs text-muted-foreground">
                    {item.parentBody}
                  </blockquote>
                ) : null}

                <p className="mt-4 whitespace-pre-line text-sm leading-6 text-foreground">
                  {item.body}
                </p>

                {item.moderationReason ? (
                  <p className="mt-3 rounded-lg border border-negative-border bg-negative-bg px-3 py-2 text-xs text-negative-foreground">
                    {item.moderationReason}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {item.status !== 'approved' ? (
                    <button
                      type="button"
                      onClick={() => void runModeration(item, 'approve')}
                      disabled={busyApprove}
                      className="btn-primary min-h-10 justify-center"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Aprovar
                    </button>
                  ) : null}
                  {item.status !== 'rejected' ? (
                    <button
                      type="button"
                      onClick={() => setModerationTarget({ item, action: 'reject' })}
                      className="btn-secondary min-h-10 justify-center"
                    >
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      Rejeitar
                    </button>
                  ) : null}
                  {item.status === 'approved' || item.reportCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setModerationTarget({ item, action: 'hide' })}
                      className="btn-secondary min-h-10 justify-center"
                    >
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                      Ocultar
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {payload?.prompts.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Prompts ativos</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {payload.prompts.map((prompt) => (
              <article
                key={prompt.id}
                className="rounded-xl border border-border bg-card p-4 card-shadow"
              >
                <div className="flex items-start gap-3">
                  <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{prompt.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{prompt.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {prompt.programName ?? 'Todos os programas'} - inicio {prompt.startsOn}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <Dialog
        open={Boolean(moderationTarget)}
        title={moderationTarget?.action === 'hide' ? 'Ocultar conteudo' : 'Rejeitar conteudo'}
        description="O motivo fica visivel para o paciente quando aplicavel e entra na auditoria."
        onOpenChange={(open) => {
          if (!open) {
            setModerationTarget(null);
            setModerationReason('');
          }
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setModerationTarget(null);
                setModerationReason('');
              }}
              className="btn-secondary justify-center"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmModerationWithReason()}
              disabled={
                !moderationReason.trim() || busyKey?.startsWith(moderationTarget?.action ?? '')
              }
              className="btn-primary justify-center"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Confirmar
            </button>
          </div>
        }
      >
        <label className="block text-sm font-medium text-foreground">
          Motivo
          <textarea
            value={moderationReason}
            onChange={(event) => setModerationReason(event.target.value.slice(0, 500))}
            rows={4}
            className="input-base mt-2"
            placeholder="Informe uma explicacao objetiva."
          />
        </label>
      </Dialog>

      <Dialog
        open={promptOpen}
        title="Prompt semanal"
        description="Crie uma provocacao curta para orientar o feed do programa."
        onOpenChange={(open) => setPromptOpen(open)}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setPromptOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSavePrompt()}
              disabled={!promptTitle.trim() || !promptBody.trim() || busyKey === 'prompt'}
              className="btn-primary justify-center"
            >
              <Megaphone className="h-4 w-4" aria-hidden="true" />
              Salvar prompt
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-foreground">
            Programa
            <select
              value={promptProgramId}
              onChange={(event) => setPromptProgramId(event.target.value)}
              className="input-base mt-2"
            >
              <option value="">Todos os programas</option>
              {communityPrograms.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground">
            Titulo
            <input
              value={promptTitle}
              onChange={(event) => setPromptTitle(event.target.value.slice(0, 140))}
              className="input-base mt-2"
              placeholder="Tema da semana"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Texto
            <textarea
              value={promptBody}
              onChange={(event) => setPromptBody(event.target.value.slice(0, 800))}
              rows={4}
              className="input-base mt-2"
              placeholder="Pergunta ou convite para os participantes."
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-foreground">
              Inicio
              <input
                type="date"
                value={promptStartsOn}
                onChange={(event) => setPromptStartsOn(event.target.value)}
                className="input-base mt-2"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Fim
              <input
                type="date"
                value={promptEndsOn}
                onChange={(event) => setPromptEndsOn(event.target.value)}
                className="input-base mt-2"
              />
            </label>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
