'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Filter,
  HardDrive,
  ListChecks,
  ServerCog,
  ShieldAlert,
  Webhook,
} from 'lucide-react';
import AdminShell from '@/app/admin/components/AdminShell';
import {
  listOperationalJobs,
  listWebhookSummaries,
  type AdminOperationalJobSummary,
  type AdminWebhookEventSummary,
} from '@/services/adminApi';

type MonitorStatus = 'ok' | 'watch' | 'critical';
type HealthStatus = 'ok' | 'warn' | 'fail' | 'unknown';

type MonitorCard = {
  title: string;
  status: MonitorStatus;
  owner: string;
  target: string;
  signal: string;
  source: 'live' | 'static';
  evidence: string;
  icon: React.ElementType;
};

type HealthResponse = {
  status?: HealthStatus;
  environment?: string;
  checkedAt?: string;
  requestId?: string;
  components?: Record<string, { status?: HealthStatus; detail?: string }>;
};

const statusConfig = {
  ok: {
    label: 'OK',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  watch: {
    label: 'Atencao',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  critical: {
    label: 'Critico',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
};

const staticMonitorTemplates: Array<Omit<MonitorCard, 'source' | 'evidence'>> = [
  {
    title: 'Auth e sessoes SSR',
    status: 'watch',
    owner: 'Security on-call',
    target: '/api/auth/app-session e redirects fail-closed',
    signal: 'auth/session failures e denied spikes por ambiente',
    icon: ShieldAlert,
  },
  {
    title: 'Edge Functions clinicas',
    status: 'ok',
    owner: 'Backend on-call',
    target: 'Paciente 360, documentos, relatorios, nutricao e billing',
    signal: '5xx, envelope invalido, retries e latencia por funcao',
    icon: ServerCog,
  },
  {
    title: 'Banco e RPCs criticos',
    status: 'ok',
    owner: 'Data on-call',
    target: 'RPCs admin, reports, CRM, estoque, financeiro e Patient 360',
    signal: 'latencia p95, denied spikes, erro de contrato e RLS fail-closed',
    icon: Database,
  },
  {
    title: 'Storage assinado',
    status: 'ok',
    owner: 'Backend on-call',
    target: 'document-signed-url e buckets de documentos',
    signal: '403/404 esperados, assinatura curta e erro de bucket',
    icon: HardDrive,
  },
];

const alertRules = [
  [
    'S1',
    'Indisponibilidade geral, vazamento suspeito ou provider financeiro/documental em erro amplo',
    '15 min',
  ],
  ['S2', '5xx sustentado, webhook falhando, jobs atrasados ou conciliacao divergente', '30 min'],
  ['S3', 'Aumento de denied spikes, latencia p95 ou fila operacional acima do limite', '4 h uteis'],
  ['S4', 'Ruido, melhoria de dashboard, documentacao ou follow-up nao urgente', '2 dias uteis'],
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function mapHealthToMonitor(status: HealthStatus | undefined): MonitorStatus {
  if (status === 'fail') return 'critical';
  if (status === 'warn' || status === 'unknown' || !status) return 'watch';
  return 'ok';
}

function mapWebhookStatus(events: AdminWebhookEventSummary[]): MonitorStatus {
  if (events.some((event) => event.status === 'dead_letter')) return 'critical';
  if (events.some((event) => ['failed', 'retrying', 'pending'].includes(event.status))) {
    return 'watch';
  }
  return 'ok';
}

function mapJobsStatus(jobs: AdminOperationalJobSummary[]): MonitorStatus {
  if (jobs.some((job) => job.currentStatus === 'critical')) return 'critical';
  if (jobs.length === 0 || jobs.some((job) => job.currentStatus === 'watch')) return 'watch';
  return 'ok';
}

function formatJobKind(job: AdminOperationalJobSummary) {
  if (job.executionKind === 'one_shot') return 'One-shot';
  if (job.executionKind === 'admin_check') return 'Admin check';
  return job.cronEnabled ? (job.scheduleCron ?? 'Cron') : 'Recorrente';
}

function StatusBadge({ status }: { status: MonitorStatus }) {
  const config = statusConfig[status];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}

function SourceBadge({ source }: { source: MonitorCard['source'] }) {
  const classes =
    source === 'live'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${classes}`}>
      {source === 'live' ? 'Sinal real' : 'Catalogo estatico'}
    </span>
  );
}

export default function ObservabilityDashboardContent() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [webhooks, setWebhooks] = useState<AdminWebhookEventSummary[]>([]);
  const [jobs, setJobs] = useState<AdminOperationalJobSummary[]>([]);
  const [monitorFilter, setMonitorFilter] = useState<'all' | MonitorStatus>('all');
  const [jobStatusFilter, setJobStatusFilter] = useState<'all' | MonitorStatus>('all');
  const [jobQuery, setJobQuery] = useState('');
  const [acknowledgedMonitors, setAcknowledgedMonitors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadSequenceRef = useRef(0);

  const loadSignals = useCallback(() => {
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;
    setIsLoading(true);
    setLoadError(null);

    Promise.allSettled([
      fetch('/api/health', { cache: 'no-store' }).then(async (response) => {
        const body = (await response.json()) as HealthResponse;
        if (!response.ok && body.status !== 'fail') throw new Error('health_unavailable');
        return body;
      }),
      listWebhookSummaries(50),
      listOperationalJobs(100),
    ])
      .then(([healthResult, webhookResult, jobsResult]) => {
        if (loadSequenceRef.current !== sequence) return;
        const errors: string[] = [];

        if (healthResult.status === 'fulfilled') {
          setHealth(healthResult.value);
        } else {
          setHealth({ status: 'unknown' });
        }

        if (webhookResult.status === 'fulfilled') {
          setWebhooks(webhookResult.value.data);
          if (webhookResult.value.error?.message) errors.push(webhookResult.value.error.message);
        } else {
          setWebhooks([]);
          errors.push('Falha ao carregar sinais de webhook.');
        }

        if (jobsResult.status === 'fulfilled') {
          setJobs(jobsResult.value.data);
          if (jobsResult.value.error?.message) errors.push(jobsResult.value.error.message);
        } else {
          setJobs([]);
          errors.push('Falha ao carregar sinais de jobs.');
        }

        setLoadError(errors[0] ?? null);
      })
      .finally(() => {
        if (loadSequenceRef.current === sequence) setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadSignals();
  }, [loadSignals]);

  const monitors = useMemo<MonitorCard[]>(() => {
    const failedWebhooks = webhooks.filter((event) =>
      ['failed', 'dead_letter', 'retrying'].includes(event.status)
    );
    const criticalJobs = jobs.filter((job) => job.currentStatus === 'critical');
    const watchJobs = jobs.filter((job) => job.currentStatus === 'watch');

    return [
      {
        title: 'Frontend Next.js',
        status: mapHealthToMonitor(health?.status),
        owner: 'Platform on-call',
        target: '/api/health + rotas anonimas/protegidas',
        signal: '5xx, latencia p95, erro de hidratacao e falha de deploy',
        source: 'live',
        evidence: health
          ? `Health ${health.status ?? 'unknown'} em ${health.environment ?? 'ambiente desconhecido'}; request ${health.requestId ?? 'N/D'}.`
          : 'Aguardando resposta do healthcheck local.',
        icon: Activity,
      },
      {
        title: 'Webhooks de provedores',
        status: mapWebhookStatus(webhooks),
        owner: 'Integrations on-call',
        target: 'webhook-d4sign, webhook-asaas legado e webhook-mercadopago',
        signal: 'signature failures, idempotencia, dead-letter e divergencia',
        source: 'live',
        evidence: `${webhooks.length} eventos recentes via RPC; ${failedWebhooks.length} requerem atencao.`,
        icon: Webhook,
      },
      {
        title: 'Jobs operacionais M16',
        status: mapJobsStatus(jobs),
        owner: 'Operations on-call',
        target: 'Cron versionado, service role, dry-run e auditoria',
        signal: 'ultima execucao, falha, atraso, limite e modo dry-run',
        source: 'live',
        evidence: `${jobs.length} jobs catalogados; ${criticalJobs.length} criticos; ${watchJobs.length} em atencao.`,
        icon: ListChecks,
      },
      ...staticMonitorTemplates.map((monitor) => ({
        ...monitor,
        source: 'static' as const,
        evidence:
          'Monitor catalogado no runbook; conectar metricas externas/APM para trocar para sinal real.',
      })),
    ];
  }, [health, jobs, webhooks]);

  const healthComponents = Object.entries(health?.components ?? {});
  const visibleMonitors = monitors.filter(
    (monitor) => monitorFilter === 'all' || monitor.status === monitorFilter
  );
  const visibleJobs = jobs
    .filter((job) => jobStatusFilter === 'all' || job.currentStatus === jobStatusFilter)
    .filter((job) => {
      const query = jobQuery.trim().toLowerCase();
      if (!query) return true;
      return [job.jobKey, job.displayName, job.category, job.evidence]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  const openAcknowledgements = Object.keys(acknowledgedMonitors).length;
  const liveMonitorCount = monitors.filter((monitor) => monitor.source === 'live').length;
  const staticMonitorCount = monitors.length - liveMonitorCount;
  const degradedSignals = [
    loadError,
    health?.status === 'unknown' ? 'Healthcheck indisponivel.' : null,
  ].filter((message): message is string => Boolean(message));

  return (
    <AdminShell
      activeSection="observability"
      title="Observabilidade operacional"
      description="Painel de prontidao por ambiente, sem dados sensiveis, alinhado ao runbook da PR 10.2."
      onRefresh={loadSignals}
    >
      <div className="space-y-6">
        <div className="card-base p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Filter size={14} className="text-muted-foreground" />
            <select
              value={monitorFilter}
              onChange={(event) => setMonitorFilter(event.target.value as typeof monitorFilter)}
              className="input-base w-auto text-xs"
            >
              <option value="all">Todos monitores</option>
              <option value="ok">OK</option>
              <option value="watch">Atencao</option>
              <option value="critical">Critico</option>
            </select>
            <select
              value={jobStatusFilter}
              onChange={(event) => setJobStatusFilter(event.target.value as typeof jobStatusFilter)}
              className="input-base w-auto text-xs"
            >
              <option value="all">Todos jobs</option>
              <option value="ok">Jobs OK</option>
              <option value="watch">Jobs em atencao</option>
              <option value="critical">Jobs criticos</option>
            </select>
            <input
              value={jobQuery}
              onChange={(event) => setJobQuery(event.target.value)}
              placeholder="Buscar job, categoria ou evidencia"
              className="input-base min-w-[220px] flex-1 text-xs"
            />
            <span className="ml-auto rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
              {openAcknowledgements} ack local
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card-base p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
              <Activity size={16} className="text-emerald-600" /> Sinais reais
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{liveMonitorCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Health, webhooks e jobs carregados por API/RPC sanitizados.
            </p>
          </div>
          <div className="card-base p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
              <FileText size={16} className="text-primary" /> Catalogo pendente
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{staticMonitorCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Monitores documentados aguardando contrato de metrica real.
            </p>
          </div>
          <div className="card-base p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
              <AlertTriangle size={16} className="text-amber-600" /> Estado degradado
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {degradedSignals.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {degradedSignals[0] ?? 'Nenhuma falha parcial detectada no carregamento atual.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card-base p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <CheckCircle2 size={16} className="text-emerald-600" /> Health endpoint
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              `/api/health` retorna status seguro por ambiente, request id e componentes sem expor
              secrets, cookies, PII/PHI, payloads de provider ou URLs assinadas.
            </p>
            <p className="mt-3 text-xs font-semibold text-foreground">
              Estado atual: {health?.status ?? (isLoading ? 'carregando' : 'indisponivel')} ·{' '}
              {formatDate(health?.checkedAt)}
            </p>
          </div>
          <div className="card-base p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <Clock size={16} className="text-blue-600" /> Smoke pos-deploy
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              `node scripts/observability/post-deploy-smoke.mjs --base-url ...` valida rotas
              anonimas/protegidas e headers de correlacao em modo read-only.
            </p>
          </div>
          <div className="card-base p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <FileText size={16} className="text-primary" /> Runbook
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Canais, severidades, owners, metricas e criterios de escalonamento ficam em
              `docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md`.
            </p>
          </div>
        </div>

        {loadError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {loadError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visibleMonitors.map((monitor) => {
            const Icon = monitor.icon;
            const acknowledgedAt = acknowledgedMonitors[monitor.title];
            return (
              <div key={monitor.title} className="card-base p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-foreground">{monitor.title}</h2>
                      <p className="text-xs text-muted-foreground">{monitor.owner}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={monitor.status} />
                    <SourceBadge source={monitor.source} />
                  </div>
                </div>
                <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-muted-foreground">Alvo</dt>
                    <dd className="mt-1 text-foreground">{monitor.target}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-muted-foreground">Sinais monitorados</dt>
                    <dd className="mt-1 text-foreground">{monitor.signal}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-semibold text-muted-foreground">Evidencia atual</dt>
                    <dd className="mt-1 text-foreground">{monitor.evidence}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">
                    {acknowledgedAt
                      ? `Ack local em ${formatDate(acknowledgedAt)}`
                      : 'Sem ack local nesta sessao.'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAcknowledgedMonitors((current) => ({
                        ...current,
                        [monitor.title]: new Date().toISOString(),
                      }))
                    }
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Registrar ack local
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="card-base overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Activity size={16} className="text-emerald-600" /> Componentes do healthcheck
              </h2>
            </div>
            <div className="divide-y divide-border text-xs">
              {healthComponents.length === 0 ? (
                <p className="p-5 text-muted-foreground">Nenhum componente real carregado.</p>
              ) : (
                healthComponents.map(([name, component]) => (
                  <div key={name} className="flex items-start justify-between gap-4 p-4">
                    <div>
                      <p className="font-mono font-semibold text-foreground">{name}</p>
                      <p className="mt-1 text-muted-foreground">
                        {component.detail ?? 'Sem detalhe.'}
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-semibold text-foreground">
                      {component.status ?? 'unknown'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card-base overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Webhook size={16} className="text-amber-600" /> Sinais recentes de webhook
              </h2>
            </div>
            <div className="divide-y divide-border text-xs">
              {webhooks.length === 0 ? (
                <p className="p-5 text-muted-foreground">
                  Nenhum evento recente retornado pelo RPC.
                </p>
              ) : (
                webhooks.slice(0, 6).map((event) => (
                  <div key={event.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]">
                    <div>
                      <p className="font-semibold text-foreground">
                        {event.provider} · {event.eventType}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {event.tenant} · recebido {formatDate(event.receivedAt)}
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-semibold text-foreground">
                      {event.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="card-base overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <ListChecks size={16} className="text-blue-600" /> Jobs operacionais M16
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Job
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Agenda
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Ultima execucao
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Resultado
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Evidencia
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Acao
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-5 text-muted-foreground">
                      {isLoading
                        ? 'Carregando jobs operacionais.'
                        : 'Nenhum job retornado pelo filtro atual.'}
                    </td>
                  </tr>
                ) : (
                  visibleJobs.slice(0, 10).map((job) => (
                    <tr key={job.jobKey} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{job.displayName}</p>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {job.jobKey}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        <p>{formatJobKind(job)}</p>
                        <p className="mt-1 text-muted-foreground">limite {job.defaultLimit}</p>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {job.lastRun ? (
                          <>
                            <p>{formatDate(job.lastRun.finishedAt ?? job.lastRun.startedAt)}</p>
                            <p className="mt-1 text-muted-foreground">
                              {job.lastRun.triggerSource}
                              {job.lastRun.dryRun ? ' / dry-run' : ''}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Sem execucao</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={job.currentStatus} />
                        {job.lastRun && (
                          <p className="mt-2 text-muted-foreground">
                            {job.lastRun.succeededCount}/{job.lastRun.processedCount} processados
                          </p>
                        )}
                      </td>
                      <td className="max-w-[22rem] px-4 py-3 text-foreground">{job.evidence}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled
                          className="btn-ghost px-3 py-1.5 text-xs"
                          title="Sem contrato backend auditado para execucao manual deste job."
                        >
                          Dry-run indisponivel
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-base overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <AlertTriangle size={16} className="text-amber-600" /> Severidades e SLA de ack
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Severidade
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Criterio
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Ack maximo
                  </th>
                </tr>
              </thead>
              <tbody>
                {alertRules.map(([severity, criterion, ack]) => (
                  <tr key={severity} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono font-bold text-foreground">{severity}</td>
                    <td className="px-4 py-3 text-foreground">{criterion}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{ack}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
