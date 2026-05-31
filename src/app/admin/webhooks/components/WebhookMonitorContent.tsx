'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  Filter,
  HardDrive,
  Headphones,
  Link2,
  LogOut,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  TrendingUp,
  User,
  Webhook,
  X,
  XCircle,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { listWebhookSummaries, type AdminWebhookEventSummary } from '@/services/adminApi';

type WebhookStatus = AdminWebhookEventSummary['status'];
type WebhookProvider = AdminWebhookEventSummary['provider'];

const navItems = [
  { key: 'overview', label: 'Visao Geral', icon: Activity, href: '/admin' },
  { key: 'tenants', label: 'Tenants', icon: Building2, href: '/admin/tenants' },
  { key: 'financial', label: 'Financeiro', icon: TrendingUp, href: '/admin/billing' },
  { key: 'usage', label: 'Uso e metricas', icon: Activity, href: '/admin' },
  { key: 'storage', label: 'Armazenamento', icon: HardDrive, href: '/admin' },
  { key: 'integrations', label: 'Integracoes', icon: Link2, href: '/admin/integrations' },
  { key: 'webhooks', label: 'Webhooks', icon: Webhook, href: '/admin/webhooks' },
  { key: 'security', label: 'Seguranca', icon: Shield, href: '/admin/security' },
  { key: 'support', label: 'Suporte', icon: Headphones, href: '/admin/support' },
  { key: 'audit', label: 'Auditoria', icon: ClipboardList, href: '/admin/audit' },
];

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
      : 'border-violet-200 bg-violet-50 text-violet-700';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${classes}`}>
      {provider}
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

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={`flex flex-shrink-0 flex-col border-r border-border bg-card transition-all ${collapsed ? 'w-16' : 'w-56'}`}
    >
      <div
        className={`flex items-center border-b border-border py-4 ${collapsed ? 'justify-center px-2' : 'gap-2 px-4'}`}
      >
        <AppLogo size={28} />
        {!collapsed && (
          <div className="flex flex-col leading-none">
            <span className="text-xs font-bold tracking-tight text-foreground">SlimHiper</span>
            <span className="text-xs font-semibold text-primary">Admin</span>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.key === 'webhooks';
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`group relative flex items-center rounded-lg text-sm transition-colors ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} />
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <ChevronDown
            size={16}
            className={`transition-transform ${collapsed ? '-rotate-90' : 'rotate-90'}`}
          />
        </button>
      </div>
    </aside>
  );
}

function EventDrawer({ event, onClose }: { event: AdminWebhookEventSummary; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-card shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Webhook sanitizado
            </p>
            <h2 className="text-lg font-semibold text-foreground">{event.eventType}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

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
            apenas o resumo operacional retornado pelo RPC de plataforma.
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
    </div>
  );
}

export default function WebhookMonitorContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | WebhookProvider>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | WebhookStatus>('all');
  const [selectedEvent, setSelectedEvent] = useState<AdminWebhookEventSummary | null>(null);
  const [events, setEvents] = useState<AdminWebhookEventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadEvents = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    listWebhookSummaries(100).then(({ data, error }) => {
      setEvents(data);
      setLoadError(error?.message ?? null);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

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
      return matchSearch && matchProvider && matchStatus;
    });
  }, [events, providerFilter, search, statusFilter]);

  const processed = events.filter((event) => event.status === 'processed').length;
  const failed = events.filter(
    (event) => event.status === 'failed' || event.status === 'dead_letter'
  ).length;
  const pending = events.filter(
    (event) => event.status === 'pending' || event.status === 'retrying'
  ).length;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex flex-shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/admin" className="hover:text-primary">
              Admin
            </Link>
            <ChevronRight size={12} />
            <span className="font-medium text-foreground">Webhooks</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadEvents}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <User size={14} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Platform Admin</span>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Operacoes de plataforma
              </p>
              <h1 className="text-2xl font-bold text-foreground">Monitor de webhooks</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Resumo sanitizado de eventos Asaas e D4Sign, com erros operacionais e idempotencia
                sem expor payloads brutos.
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
                onChange={(event) =>
                  setProviderFilter(event.target.value as 'all' | WebhookProvider)
                }
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">Todos providers</option>
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
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <StatCard icon={Webhook} label="Eventos" value={events.length} tone="slate" />
            <StatCard icon={CheckCircle} label="Processados" value={processed} tone="emerald" />
            <StatCard icon={Clock} label="Pendentes" value={pending} tone="amber" />
            <StatCard icon={XCircle} label="Falhas" value={failed} tone="red" />
          </div>

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
                    <th className="px-4 py-3 text-left">Evento</th>
                    <th className="px-4 py-3 text-left">Provider</th>
                    <th className="px-4 py-3 text-left">Tenant</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Recebido</th>
                    <th className="px-4 py-3 text-left">Processado</th>
                    <th className="px-4 py-3 text-right">Retry</th>
                    <th className="px-4 py-3 text-left">Erro</th>
                    <th className="px-4 py-3 text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        Carregando webhooks...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        Nenhum evento encontrado.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((event) => (
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
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedEvent(event)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                          >
                            <Eye size={13} />
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {selectedEvent && (
        <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
