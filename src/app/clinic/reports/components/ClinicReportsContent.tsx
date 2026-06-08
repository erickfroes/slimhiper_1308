'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Briefcase,
  CalendarClock,
  Clock,
  DollarSign,
  Download,
  GitBranch,
  FileCheck,
  FileText,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Target,
  Timer,
  Users,
  PackageSearch,
  Coins,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import {
  createClinicReportRun,
  downloadClinicReportExport,
  getClinicReportRun,
  listClinicReportDefinitions,
  listClinicReportRuns,
  type ClinicReportArtifactStatus,
  type ClinicReportDefinition,
  type ClinicReportFilters,
  type ClinicReportRun,
} from '@/services/clinicReportsApi';

const iconMap: Record<string, React.ElementType> = {
  FileText,
  DollarSign,
  ShoppingBag,
  FileCheck,
  Target,
  Clock,
  Bell,
  Users,
  GitBranch,
  Timer,
  Briefcase,
  PackageSearch,
  RotateCcw,
  CalendarClock,
  AlertTriangle,
  Coins,
};

function isoDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return new Intl.NumberFormat('pt-BR').format(value);
  if (typeof value === 'boolean') return value ? 'Sim' : 'Nao';
  return String(value);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatDateTime(value?: string): string {
  if (!value) return '---';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '---';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getRunDisplayStatus(
  run: ClinicReportRun
): ClinicReportArtifactStatus | ClinicReportRun['status'] {
  const status = run.artifactStatus ?? run.artifact?.status ?? run.status;
  const expiresAt = run.artifactExpiresAt ?? run.artifact?.expiresAt;

  if (status === 'ready' && expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return 'expired';
  }

  return status;
}

function statusLabel(status: ClinicReportArtifactStatus | ClinicReportRun['status']): string {
  const labels: Record<string, string> = {
    pending: 'Pendente',
    running: 'Executando',
    ready: 'Pronto',
    completed: 'Concluido',
    failed: 'Falhou',
    cancelled: 'Cancelado',
    expired: 'Expirado',
    deleted: 'Removido',
  };

  return labels[status] ?? status;
}

function statusClass(status: ClinicReportArtifactStatus | ClinicReportRun['status']): string {
  const classes: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-700',
    running: 'bg-sky-100 text-sky-700',
    ready: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-slate-100 text-slate-700',
    expired: 'bg-amber-100 text-amber-700',
    deleted: 'bg-slate-100 text-slate-600',
  };

  return classes[status] ?? 'bg-muted text-muted-foreground';
}

export default function ClinicReportsContent() {
  const [definitions, setDefinitions] = useState<ClinicReportDefinition[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [filters, setFilters] = useState<ClinicReportFilters>({
    from: isoDate(30),
    to: isoDate(0),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<'csv' | 'pdf' | null>(null);
  const [lastRun, setLastRun] = useState<ClinicReportRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<string | null>(null);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [history, setHistory] = useState<ClinicReportRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyReportKey, setHistoryReportKey] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [downloadingRunId, setDownloadingRunId] = useState<string | null>(null);

  const selectedDefinition = useMemo(
    () => definitions.find((definition) => definition.key === selectedKey) ?? null,
    [definitions, selectedKey]
  );

  const loadDefinitions = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await listClinicReportDefinitions();
    setDefinitions(result.data);
    setSelectedKey((current) => current || result.data[0]?.key || '');
    setError(result.error?.message ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDefinitions();
  }, [loadDefinitions]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);

    const result = await listClinicReportRuns({
      reportKey: historyReportKey || undefined,
      status: historyStatus as ClinicReportArtifactStatus | undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      limit: 18,
    });

    setHistory(result.data);
    setHistoryError(result.error?.message ?? null);
    setHistoryLoading(false);
  }, [filters.from, filters.to, historyReportKey, historyStatus]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleRun(format: 'csv' | 'pdf') {
    if (!selectedDefinition) return;

    setRunning(format);
    setRunError(null);
    setDownloadState(null);

    const result = await createClinicReportRun({
      reportKey: selectedDefinition.key,
      filters,
      exportFormat: format,
      patientId: filters.patientId?.trim() || undefined,
    });

    setRunning(null);
    if (result.error || !result.data) {
      setLastRun(null);
      setRunError(result.error?.message ?? 'Falha ao executar relatorio.');
      return;
    }

    setLastRun(result.data);
    void loadHistory();
  }

  async function handleRefreshRun() {
    if (!lastRun) return;

    setStatusRefreshing(true);
    setRunError(null);
    const result = await getClinicReportRun(lastRun.id);
    setStatusRefreshing(false);

    if (result.error || !result.data) {
      setRunError(result.error?.message ?? 'Nao foi possivel consultar o status do relatorio.');
      return;
    }

    setLastRun(result.data);
    void loadHistory();
  }

  async function handleDownload(run: ClinicReportRun) {
    if (!run.artifactId && !run.artifact?.id) {
      setDownloadState('Exportacao indisponivel ou expirada para este run.');
      return;
    }

    setDownloadingRunId(run.id);
    setDownloadState('Preparando exportacao segura...');
    const result = await downloadClinicReportExport(run);
    setDownloadingRunId(null);

    if (result.error || !result.data) {
      setDownloadState(result.error?.message ?? 'Nao foi possivel baixar a exportacao.');
      return;
    }

    triggerBlobDownload(result.data.blob, result.data.filename);
    setDownloadState('Exportacao baixada por URL assinada curta e acesso auditado.');
    void loadHistory();
  }

  const resultColumns = lastRun?.rows.length
    ? Array.from(new Set(lastRun.rows.flatMap((row) => Object.keys(row))))
    : [];
  const summaryEntries = lastRun
    ? Object.entries(lastRun.resultSummary).filter(
        ([key, value]) =>
          [
            'rowCount',
            'minimized',
            'containsPii',
            'requiresFinancialRead',
            'requiresSensitiveRead',
          ].includes(key) && typeof value !== 'object'
      )
    : [];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageHeader
        title="Relatorios clinicos"
        subtitle="Executor allowlist com filtros minimizados, permissao explicita e export auditado."
        actions={
          <button
            type="button"
            onClick={() => void loadDefinitions()}
            className="btn-secondary gap-2"
          >
            <RefreshCcw size={15} /> Atualizar
          </button>
        }
      />

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)] gap-5">
        <div className="card-base p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Catalogo seguro</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Somente chaves de relatorio aprovadas no backend podem gerar runs/export.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              <ShieldCheck size={13} /> reports.read
            </span>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">
              Carregando definicoes de relatorio...
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Relatorios indisponiveis</p>
                  <p className="mt-1">{error}</p>
                </div>
              </div>
            </div>
          ) : definitions.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhuma definicao disponivel"
              description="Cadastre report_definitions ativas ou valide a permissao reports.read."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {definitions.map((definition) => {
                const Icon = iconMap[definition.iconKey] ?? FileText;
                const active = definition.key === selectedKey;
                return (
                  <button
                    key={definition.key}
                    type="button"
                    onClick={() => setSelectedKey(definition.key)}
                    className={[
                      'rounded-2xl border p-4 text-left transition-colors',
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:bg-muted/50',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {definition.label}
                          </span>
                          {definition.badge && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${definition.badgeColor ?? 'bg-muted text-muted-foreground'}`}
                            >
                              {definition.badge}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {definition.description}
                        </span>
                        {!definition.exportEnabled && (
                          <span className="mt-2 block text-xs font-medium text-slate-600">
                            Exportacao desabilitada no cadastro ativo.
                          </span>
                        )}
                        {!definition.canRun && (
                          <span className="mt-2 block text-xs font-medium text-amber-700">
                            {definition.disabledReason ?? 'Permissao insuficiente.'}
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="card-base p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Filtros do run</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Filtros sao salvos no report_run para auditoria; dados sensiveis ficam minimizados.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Inicio
              <input
                type="date"
                value={filters.from}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, from: event.target.value }))
                }
                className="input-base text-sm"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Fim
              <input
                type="date"
                value={filters.to}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, to: event.target.value }))
                }
                className="input-base text-sm"
              />
            </label>
          </div>

          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Paciente (UUID opcional)
            <input
              type="text"
              value={filters.patientId ?? ''}
              onChange={(event) =>
                setFilters((current) => ({ ...current, patientId: event.target.value }))
              }
              placeholder="Escopo patient para Paciente 360"
              className="input-base text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            {[
              ['unitId', 'Unidade'],
              ['practitionerId', 'Profissional'],
              ['programId', 'Programa'],
              ['financialStatus', 'Status financeiro'],
              ['documentStatus', 'Status documental'],
            ].map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs font-medium text-muted-foreground">
                {label}
                <input
                  type="text"
                  value={String(filters[key as keyof ClinicReportFilters] ?? '')}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, [key]: event.target.value }))
                  }
                  placeholder="Opcional"
                  className="input-base text-sm"
                />
              </label>
            ))}
          </div>

          <label className="flex items-start gap-2 rounded-2xl border border-border p-3 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={filters.detail === true}
              onChange={(event) =>
                setFilters((current) => ({ ...current, detail: event.target.checked }))
              }
              className="mt-0.5"
            />
            <span>
              Solicitar detalhamento sensivel quando a definicao permitir. Exige permissao adicional
              e pode ser recusado pelo backend.
            </span>
          </label>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              disabled={
                !selectedDefinition?.canRun ||
                !selectedDefinition?.exportEnabled ||
                running !== null
              }
              onClick={() => void handleRun('csv')}
              className="btn-primary justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={15} /> {running === 'csv' ? 'Gerando CSV...' : 'Executar e gerar CSV'}
            </button>
            <button
              type="button"
              disabled={
                !selectedDefinition?.canRun ||
                !selectedDefinition?.exportEnabled ||
                running !== null
              }
              onClick={() => void handleRun('pdf')}
              className="btn-secondary justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText size={15} /> {running === 'pdf' ? 'Gerando PDF...' : 'Executar e gerar PDF'}
            </button>
          </div>

          {runError && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            >
              {runError}
            </p>
          )}
        </aside>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Historico de exports</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Artefatos persistentes no bucket privado report-exports, com expiracao e signed URL.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,0.7fr)_auto]">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Tipo
              <select
                value={historyReportKey}
                onChange={(event) => setHistoryReportKey(event.target.value)}
                className="input-base text-sm"
              >
                <option value="">Todos</option>
                {definitions.map((definition) => (
                  <option key={definition.key} value={definition.key}>
                    {definition.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Status
              <select
                value={historyStatus}
                onChange={(event) => setHistoryStatus(event.target.value)}
                className="input-base text-sm"
              >
                <option value="">Todos</option>
                <option value="pending">Pendente</option>
                <option value="running">Executando</option>
                <option value="ready">Pronto</option>
                <option value="failed">Falhou</option>
                <option value="expired">Expirado</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => void loadHistory()}
              className="btn-secondary mt-5 justify-center gap-2"
            >
              <RefreshCcw size={15} /> Atualizar
            </button>
          </div>
        </div>

        {historyLoading ? (
          <div className="rounded-2xl border border-border p-5 text-sm text-muted-foreground">
            Carregando historico de exports...
          </div>
        ) : historyError ? (
          <div
            role="alert"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Historico indisponivel</p>
                <p className="mt-1">{historyError}</p>
              </div>
            </div>
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhum export persistente"
            description="Execute um relatorio com export habilitado para criar o primeiro artefato."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {history.map((run) => {
              const status = getRunDisplayStatus(run);
              const artifact = run.artifact;
              const canDownload = status === 'ready' && Boolean(run.artifactId ?? artifact?.id);

              return (
                <article key={run.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {run.reportKey}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(run.createdAt)} - {run.scope}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(status)}`}
                    >
                      {statusLabel(status)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Formato</p>
                      <p className="mt-1 font-semibold uppercase text-foreground">
                        {artifact?.format ?? run.exportFormat ?? 'csv'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Linhas</p>
                      <p className="mt-1 font-semibold text-foreground">
                        {artifact?.rowCount ?? run.rows.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Expira</p>
                      <p className="mt-1 font-semibold text-foreground">
                        {formatDateTime(run.artifactExpiresAt ?? artifact?.expiresAt)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs text-muted-foreground">
                      {artifact?.filename ?? 'Artefato legado sem arquivo persistente'}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleDownload(run)}
                      disabled={!canDownload || downloadingRunId === run.id}
                      className="btn-secondary shrink-0 gap-1.5 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Download size={13} />
                      {downloadingRunId === run.id ? 'Assinando...' : 'Baixar'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card-base p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Resultado do ultimo run</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Prévia sanitizada do resultado persistido em report_runs.
            </p>
          </div>
          {lastRun && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleRefreshRun()}
                disabled={statusRefreshing}
                className="btn-secondary gap-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw size={15} /> {statusRefreshing ? 'Consultando...' : 'Consultar status'}
              </button>
              <button
                type="button"
                onClick={() => void handleDownload(lastRun)}
                disabled={
                  downloadingRunId === lastRun.id ||
                  getRunDisplayStatus(lastRun) !== 'ready' ||
                  (!lastRun.artifactId && !lastRun.artifact?.id)
                }
                className="btn-secondary gap-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={15} />
                {downloadingRunId === lastRun.id ? 'Assinando...' : 'Baixar export seguro'}
              </button>
            </div>
          )}
        </div>

        {!lastRun ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nenhum run executado"
            description="Selecione uma definicao, ajuste filtros e gere CSV ou PDF."
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {statusLabel(getRunDisplayStatus(lastRun))}
                </p>
              </div>
              <div className="rounded-2xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Linhas</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{lastRun.rows.length}</p>
              </div>
              <div className="rounded-2xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Escopo</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{lastRun.scope}</p>
              </div>
              <div className="rounded-2xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Expira em</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatDateTime(lastRun.artifactExpiresAt ?? lastRun.exportExpiresAt)}
                </p>
              </div>
            </div>

            {summaryEntries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {summaryEntries.map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {key}: {formatValue(value)}
                  </span>
                ))}
              </div>
            )}

            {downloadState && <p className="text-xs text-muted-foreground">{downloadState}</p>}

            {runError && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              >
                {runError}
              </p>
            )}

            {resultColumns.length === 0 ? (
              <div className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
                Relatorio executado sem linhas para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      {resultColumns.map((column) => (
                        <th
                          key={column}
                          scope="col"
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {lastRun.rows.map((row, index) => (
                      <tr key={`row-${index}`}>
                        {resultColumns.map((column) => (
                          <td key={column} className="px-3 py-2 text-muted-foreground">
                            {formatValue(row[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
