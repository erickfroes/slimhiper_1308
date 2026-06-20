'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Filter,
  RotateCcw,
  Search,
  Webhook,
  XCircle,
} from 'lucide-react';
import AdminShell from '@/app/admin/components/AdminShell';
import { useAdminPermissions } from '@/app/admin/components/adminPermissions';
import Dialog from '@/components/ui/Dialog';
import DataState from '@/components/ui/DataState';
import {
  listWebhookReprocessJobs,
  listWebhookSummaries,
  requestWebhookReprocess,
  type AdminWebhookReprocessJob,
  type AdminWebhookEventSummary,
} from '@/services/adminApi';

type WebhookStatus = AdminWebhookEventSummary['status'];
type WebhookProvider = AdminWebhookEventSummary['provider'];

function formatDate(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusLabel(status: WebhookStatus) {
  const labels: Record<WebhookStatus, string> = {
    processed: 'Processado',
    pending: 'Pendente',
    failed: 'Falhou',
    dead_letter: 'Dead letter',
    retrying: 'Retry',
  };
  return labels[status];
}

function StatusBadge({ status }: { status: WebhookStatus }) {
  const config: Record<WebhookStatus, { icon: React.ElementType; classes: string }> = {
    processed: {
      icon: CheckCircle,
      classes: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    pending: {
      icon: Clock,
      classes: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    failed: {
      icon: XCircle,
      classes: 'border-red-200 bg-red-50 text-red-700',
    },
    dead_letter: {
      icon: AlertTriangle,
      classes: 'border-red-200 bg-red-50 text-red-700',
    },
    retrying: {
      icon: RotateCcw,
      classes: 'border-amber-200 bg-amber-50 text-amber-700',
    },
  };
  const item = config[status];
  const Icon = item.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${item.classes}`}
    >
      <Icon size={11} />
      {statusLabel(status)}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: WebhookProvider }) {
  const classes =
    provider === 'Asaas'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : provider === 'Mercado Pago'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-violet-200 bg-violet-50 text-violet-700';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${classes}`}>
      {provider}
    </span>
  );
}

function isReprocessableStatus(status: WebhookStatus) {
  return (
    status === 'failed' || status === 'dead_letter' || status === 'retrying' || status === 'pending'
  );
}

function JobStatusBadge({ status }: { status: AdminWebhookReprocessJob['status'] }) {
  const tone =
    status === 'queued' || status === 'processing'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : status === 'processed'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-red-200 bg-red-50 text-red-700';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'slate',
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  tone?: 'emerald' | 'blue' | 'amber' | 'red' | 'slate';
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg border p-2 ${tones[tone]}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

function EventDrawer({ event, onClose }: { event: AdminWebhookEventSummary; onClose: () => void }) {
  return (
    <Dialog
      open
      title={event.eventType}
      description="Webhook sanitizado"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="right"
    >
      <div className="-m-5">
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <StatusBadge status={event.status} />
            </div>
            <ProviderBadge provider={event.provider} />
          </div>

          {[
            ['Evento', event.id],
            ['Tenant', `${event.tenant} (${event.tenantId})`],
            ['Paciente', event.patientRef ?? 'N/D'],
            ['ID externo', event.externalId || 'N/D'],
            ['Idempotencia', event.idempotencyKey || 'N/D'],
            ['Recebido em', formatDate(event.receivedAt)],
            ['Processado em', formatDate(event.processedAt)],
            ['Tentativas', String(event.retryCount)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 break-all text-sm font-medium text-foreground">{value}</p>
            </div>
          ))}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Payload bruto, headers e assinaturas nao sao exibidos neste painel. A tela consome
            apenas o resumo operacional retornado pelo RPC de plataforma. Identificadores externos e
            chaves de idempotencia chegam redigidos pelo servico de frontend.
          </div>

          {event.errorSummary && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-red-700">
                Erro resumido
              </p>
              <p className="mt-1 text-sm text-red-700">{event.errorSummary}</p>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function ReprocessDialog({
  event,
  open,
  canReprocess,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  event: AdminWebhookEventSummary | null;
  open: boolean;
  canReprocess: boolean;
  isSubmitting: boolean;
  onSubmit: (input: { reason: string; scope: string }) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState('Reprocessar evento idempotente sem payload bruto');

  useEffect(() => {
    if (!open) return;
    setReason('');
    setScope('Reprocessar evento idempotente sem payload bruto');
  }, [open, event?.id]);

  if (!open || !event) return null;

  const eligible = isReprocessableStatus(event.status);
  const disabled =
    !canReprocess ||
    !eligible ||
    isSubmitting ||
    reason.trim().length < 12 ||
    scope.trim().length < 8;

  return (
    <Dialog
      open
      title="Solicitar reprocesso"
      description="Cria um job local auditado; nao chama provedores externos."
      onOpenChange={(dialogOpen) => {
        if (!dialogOpen) onClose();
      }}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost px-3 py-2 text-xs">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ reason, scope })}
            disabled={disabled}
            className="btn-primary px-3 py-2 text-xs"
          >
            {isSubmitting ? 'Solicitando...' : 'Registrar job'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-semibold text-foreground">{event.eventType}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {event.provider} - {event.tenant} - status {event.status}
          </p>
        </div>
        {!eligible ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Apenas eventos failed, dead_letter, retrying ou pending podem solicitar reprocesso.
          </div>
        ) : null}
        {!canReprocess ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Seu papel atual possui acesso de leitura para webhooks.
          </div>
        ) : null}
        <label className="block">
          <span className="text-xs font-semibold text-foreground">Motivo auditavel</span>
          <textarea
            value={reason}
            onChange={(eventChange) => setReason(eventChange.target.value)}
            className="input-base mt-1 min-h-24 text-sm"
            maxLength={500}
            placeholder="Explique a causa operacional e evidencia. Minimo de 12 caracteres."
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-foreground">Escopo</span>
          <input
            value={scope}
            onChange={(eventChange) => setScope(eventChange.target.value)}
            className="input-base mt-1 text-sm"
            maxLength={240}
          />
        </label>
      </div>
    </Dialog>
  );
}

export default function WebhookMonitorContent() {
  const permissions = useAdminPermissions();
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | WebhookProvider>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | WebhookStatus>('all');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [retryFilter, setRetryFilter] = useState<'all' | 'has_retry' | 'eligible'>('all');
  const [selectedEvent, setSelectedEvent] = useState<AdminWebhookEventSummary | null>(null);
  const [reprocessTarget, setReprocessTarget] = useState<AdminWebhookEventSummary | null>(null);
  const [events, setEvents] = useState<AdminWebhookEventSummary[]>([]);
  const [jobs, setJobs] = useState<AdminWebhookReprocessJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reprocessingEventId, setReprocessingEventId] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);

  const loadEvents = useCallback(() => {
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;
    setIsLoading(true);
    setLoadError(null);
    Promise.all([listWebhookSummaries(100), listWebhookReprocessJobs(75)])
      .then(([eventsResult, jobsResult]) => {
        if (loadSequenceRef.current !== sequence) return;
        setEvents(eventsResult.data);
        setJobs(jobsResult.data);
        setLoadError(eventsResult.error?.message ?? jobsResult.error?.message ?? null);
      })
      .finally(() => {
        if (loadSequenceRef.current === sequence) setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleReprocess = async (
    event: AdminWebhookEventSummary,
    input: { reason: string; scope: string }
  ) => {
    setActionNotice(null);
    setActionError(null);
    setReprocessingEventId(event.id);
    try {
      const { data, error } = await requestWebhookReprocess({
        provider: event.provider,
        eventId: event.id,
        reason: input.reason,
        scope: input.scope,
      });
      if (error) {
        setActionError(error.message);
        return;
      }
      setActionNotice(`Job de reprocesso ${data?.status ?? 'queued'} registrado.`);
      setReprocessTarget(null);
      loadEvents();
    } finally {
      setReprocessingEventId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((event) => {
      const matchSearch =
        !q ||
        event.id.toLowerCase().includes(q) ||
        event.eventType.toLowerCase().includes(q) ||
        event.tenant.toLowerCase().includes(q) ||
        event.externalId.toLowerCase().includes(q) ||
        event.idempotencyKey.toLowerCase().includes(q) ||
        (event.patientRef?.toLowerCase().includes(q) ?? false);
      const matchProvider = providerFilter === 'all' || event.provider === providerFilter;
      const matchStatus = statusFilter === 'all' || event.status === statusFilter;
      const matchTenant = tenantFilter === 'all' || event.tenantId === tenantFilter;
      const matchRetry =
        retryFilter === 'all' ||
        (retryFilter === 'has_retry' && event.retryCount > 0) ||
        (retryFilter === 'eligible' && isReprocessableStatus(event.status));
      return matchSearch && matchProvider && matchStatus && matchTenant && matchRetry;
    });
  }, [events, providerFilter, retryFilter, search, statusFilter, tenantFilter]);

  const tenantOptions = useMemo(
    () =>
      Array.from(new Map(events.map((event) => [event.tenantId, event.tenant])).entries()).sort(
        (a, b) => a[1].localeCompare(b[1])
      ),
    [events]
  );

  const providerCounts = events.reduce<Record<WebhookProvider, number>>(
    (acc, event) => {
      acc[event.provider] += 1;
      return acc;
    },
    { Asaas: 0, 'Mercado Pago': 0, D4Sign: 0 }
  );

  const processed = events.filter((event) => event.status === 'processed').length;
  const failed = events.filter(
    (event) => event.status === 'failed' || event.status === 'dead_letter'
  ).length;
  const pending = events.filter(
    (event) => event.status === 'pending' || event.status === 'retrying'
  ).length;
  const eligible = events.filter((event) => isReprocessableStatus(event.status)).length;

  return (
    <AdminShell activeSection="webhooks" onRefresh={loadEvents}>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Operacoes de plataforma
          </p>
          <h1 className="text-2xl font-bold text-foreground">Monitor de webhooks</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Resumo sanitizado de eventos dos provedores, com erros operacionais, filtros por
            provider/status e idempotencia redigida sem expor payloads brutos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar evento, tenant ou id"
              className="h-10 w-72 rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value as 'all' | WebhookProvider)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos providers</option>
            <option value="Mercado Pago">Mercado Pago</option>
            <option value="Asaas">Asaas</option>
            <option value="D4Sign">D4Sign</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | WebhookStatus)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos status</option>
            <option value="processed">Processados</option>
            <option value="pending">Pendentes</option>
            <option value="retrying">Retry</option>
            <option value="failed">Falhas</option>
            <option value="dead_letter">Dead letter</option>
          </select>
          <select
            value={tenantFilter}
            onChange={(event) => setTenantFilter(event.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos tenants</option>
            {tenantOptions.map(([tenantId, tenantName]) => (
              <option key={tenantId} value={tenantId}>
                {tenantName}
              </option>
            ))}
          </select>
          <select
            value={retryFilter}
            onChange={(event) => setRetryFilter(event.target.value as typeof retryFilter)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos retries</option>
            <option value="has_retry">Com tentativa</option>
            <option value="eligible">Elegiveis</option>
          </select>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-5">
        <StatCard
          icon={Webhook}
          label="Eventos"
          value={`${events.length} (${providerCounts['Mercado Pago']} MP / ${providerCounts.Asaas} Asaas / ${providerCounts.D4Sign} D4Sign)`}
          tone="slate"
        />
        <StatCard icon={CheckCircle} label="Processados" value={processed} tone="emerald" />
        <StatCard icon={Clock} label="Pendentes" value={pending} tone="amber" />
        <StatCard icon={XCircle} label="Falhas" value={failed} tone="red" />
        <StatCard icon={RotateCcw} label="Elegiveis" value={eligible} tone="blue" />
      </div>

      {actionNotice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {actionNotice}
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Eventos recentes</h2>
            <p className="text-xs text-muted-foreground">
              {filtered.length} de {events.length} eventos listados
            </p>
          </div>
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Filter size={14} />
            Filtros ativos
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left">
                  Evento
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Provider
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Tenant
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Recebido
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Processado
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Retry
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Erro
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Job
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6">
                    <DataState
                      kind="loading"
                      title="Carregando webhooks"
                      description="Buscando eventos sanitizados autorizados para a plataforma."
                      className="min-h-40 border-0 bg-transparent"
                    />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6">
                    <DataState
                      kind="empty"
                      title="Nenhum evento encontrado"
                      description="Ajuste filtros ou atualize para revalidar os ultimos eventos."
                      className="min-h-40 border-0 bg-transparent"
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((event) => {
                  const latestJob = jobs.find(
                    (job) =>
                      job.eventId === event.id &&
                      job.provider ===
                        (event.provider === 'Asaas'
                          ? 'asaas'
                          : event.provider === 'Mercado Pago'
                            ? 'mercadopago'
                            : 'd4sign')
                  );
                  const eligibleForReprocess = isReprocessableStatus(event.status);
                  return (
                    <tr key={event.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{event.eventType}</div>
                        <div className="max-w-[240px] truncate font-mono text-xs text-muted-foreground">
                          {event.idempotencyKey || event.id}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ProviderBadge provider={event.provider} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/tenants/${event.tenantId}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {event.tenant}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">
                          {event.tenantId}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={event.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(event.receivedAt)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(event.processedAt)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {event.retryCount}
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        {event.errorSummary ? (
                          <span className="line-clamp-2 text-red-600">{event.errorSummary}</span>
                        ) : (
                          <span className="text-muted-foreground/60">N/D</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {latestJob ? (
                          <div className="space-y-1">
                            <JobStatusBadge status={latestJob.status} />
                            <p className="text-xs text-muted-foreground">
                              {formatDate(latestJob.processedAt ?? latestJob.createdAt)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">Sem job</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedEvent(event)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                        >
                          <Eye size={13} />
                          Ver
                        </button>
                        <button
                          type="button"
                          className="ml-2 inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            reprocessingEventId !== null ||
                            !permissions.canReprocessWebhooks ||
                            !eligibleForReprocess
                          }
                          title={
                            !permissions.canReprocessWebhooks
                              ? 'Apenas owner/admin podem solicitar reprocesso.'
                              : !eligibleForReprocess
                                ? 'Evento nao elegivel para reprocesso.'
                                : undefined
                          }
                          onClick={() => setReprocessTarget(event)}
                        >
                          <RotateCcw size={13} />
                          {reprocessingEventId === event.id ? 'Solicitando...' : 'Reprocessar'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selectedEvent && (
        <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
      <ReprocessDialog
        event={reprocessTarget}
        open={Boolean(reprocessTarget)}
        canReprocess={permissions.canReprocessWebhooks}
        isSubmitting={Boolean(reprocessingEventId)}
        onClose={() => setReprocessTarget(null)}
        onSubmit={(input) => {
          if (reprocessTarget) void handleReprocess(reprocessTarget, input);
        }}
      />
    </AdminShell>
  );
}
