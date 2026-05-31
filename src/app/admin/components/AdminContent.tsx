'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Database,
  Headphones,
  HardDrive,
  Link2,
  LogOut,
  RefreshCw,
  Shield,
  TrendingUp,
  User,
  Users,
  Webhook,
  XCircle,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import {
  getPlatformAdminSnapshot,
  type AdminTenantRow,
  type AdminWebhookEventSummary,
  type PlatformAdminSnapshot,
} from '@/services/adminApi';

type AdminSection =
  | 'overview'
  | 'tenants'
  | 'financial'
  | 'usage'
  | 'storage'
  | 'integrations'
  | 'webhooks'
  | 'security'
  | 'support'
  | 'audit';

const sectionTitles: Record<AdminSection, string> = {
  overview: 'Visao geral',
  tenants: 'Tenants',
  financial: 'Financeiro SaaS',
  usage: 'Uso e metricas',
  storage: 'Armazenamento',
  integrations: 'Integracoes',
  webhooks: 'Webhooks',
  security: 'Seguranca',
  support: 'Suporte',
  audit: 'Auditoria',
};

const navItems: Array<{ key: AdminSection; label: string; href: string; icon: React.ElementType }> =
  [
    { key: 'overview', label: 'Visao Geral', href: '/admin', icon: Activity },
    { key: 'tenants', label: 'Tenants', href: '/admin/tenants', icon: Building2 },
    { key: 'financial', label: 'Financeiro', href: '/admin/billing', icon: TrendingUp },
    { key: 'integrations', label: 'Integracoes', href: '/admin/integrations', icon: Link2 },
    { key: 'webhooks', label: 'Webhooks', href: '/admin/webhooks', icon: Webhook },
    { key: 'security', label: 'Seguranca', href: '/admin/security', icon: Shield },
    { key: 'support', label: 'Suporte', href: '/admin/support', icon: Headphones },
    { key: 'audit', label: 'Auditoria', href: '/admin/audit', icon: ClipboardList },
  ];

function formatDate(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleDateString('pt-BR');
}

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'teal',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'teal' | 'emerald' | 'blue' | 'amber' | 'red' | 'slate';
}) {
  const tones = {
    teal: 'bg-teal-50 text-teal-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="stat-card flex flex-col gap-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</p>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}

function TenantStatusBadge({ status }: { status: AdminTenantRow['status'] }) {
  const config = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    trial: 'border-blue-200 bg-blue-50 text-blue-700',
    suspended: 'border-red-200 bg-red-50 text-red-700',
    cancelled: 'border-slate-200 bg-slate-100 text-slate-600',
  };
  const label = {
    active: 'Ativo',
    trial: 'Trial',
    suspended: 'Suspenso',
    cancelled: 'Cancelado',
  };

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${config[status]}`}>
      {label[status]}
    </span>
  );
}

function WebhookStatusBadge({ status }: { status: AdminWebhookEventSummary['status'] }) {
  const tone =
    status === 'processed'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'pending' || status === 'retrying'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-red-200 bg-red-50 text-red-700';

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>
  );
}

function Sidebar({
  activeSection,
  collapsed,
  onToggle,
}: {
  activeSection: AdminSection;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={`flex flex-shrink-0 flex-col border-r border-border bg-card sidebar-transition ${collapsed ? 'w-16' : 'w-56'}`}
    >
      <div
        className={`flex items-center border-b border-border py-4 ${collapsed ? 'justify-center px-2' : 'gap-2 px-4'}`}
      >
        <AppLogo size={28} />
        {!collapsed ? (
          <div className="flex flex-col leading-none">
            <span className="text-xs font-bold tracking-tight text-foreground">SlimHiper</span>
            <span className="text-xs font-semibold text-primary">Admin</span>
          </div>
        ) : null}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 scrollbar-thin">
        {navItems.map((item) => {
          const ItemIcon = item.icon;
          const active = item.key === activeSection;
          return (
            <Link
              key={item.key}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`group relative flex w-full items-center rounded-xl transition-all ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
              }`}
            >
              <ItemIcon size={16} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
              {!collapsed ? (
                <span className={`text-xs ${active ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              ) : (
                <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 transition-opacity group-hover:opacity-100">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        {!collapsed ? (
          <div className="mb-1 flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 hover:bg-muted">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
              <User size={12} className="text-primary" />
            </div>
            <div className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-xs font-semibold text-foreground">Platform Admin</span>
              <span className="text-xs text-muted-foreground">Operacoes</span>
            </div>
            <LogOut size={12} className="ml-auto text-muted-foreground" />
          </div>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
        >
          <ChevronRight size={14} className={collapsed ? '' : 'rotate-180'} />
          {!collapsed ? 'Recolher' : null}
        </button>
      </div>
    </aside>
  );
}

function TenantsTable({ tenants }: { tenants: AdminTenantRow[] }) {
  return (
    <div className="card-base overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-bold text-foreground">Tenants recentes</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Clinica</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Owner</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Usuarios</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Pacientes</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">MRR</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  Nenhum tenant retornado pelo contrato admin.
                </td>
              </tr>
            ) : (
              tenants.slice(0, 8).map((tenant) => (
                <tr
                  key={tenant.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{tenant.clinicName}</div>
                    <div className="font-mono text-muted-foreground">{tenant.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{tenant.owner}</div>
                    <div className="max-w-44 truncate text-muted-foreground">{tenant.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <TenantStatusBadge status={tenant.status} />
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                    {tenant.users}
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                    {tenant.patients}
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                    {currency(tenant.mrr)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/tenants/${tenant.id}`}
                      className="text-xs font-semibold text-primary"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WebhookList({ webhooks }: { webhooks: AdminWebhookEventSummary[] }) {
  return (
    <div className="card-base overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-bold text-foreground">Eventos de webhook</h2>
      </div>
      <div className="divide-y divide-border">
        {webhooks.length === 0 ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">Nenhum evento recente.</div>
        ) : (
          webhooks.slice(0, 8).map((event) => (
            <div key={event.id} className="flex items-start gap-3 px-5 py-3">
              <Webhook size={15} className="mt-0.5 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {event.eventType}
                  </span>
                  <WebhookStatusBadge status={event.status} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {event.tenant} - {formatDate(event.receivedAt)}
                </p>
                {event.errorSummary ? (
                  <p className="mt-1 text-xs text-red-600">{event.errorSummary}</p>
                ) : null}
              </div>
              <span className="text-xs font-semibold text-muted-foreground">{event.provider}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Overview({ snapshot }: { snapshot: PlatformAdminSnapshot }) {
  const stats = useMemo(() => {
    const tenants = snapshot.tenants;
    const failedWebhooks = snapshot.webhooks.filter((event) =>
      ['failed', 'dead_letter', 'retrying'].includes(event.status)
    ).length;
    return {
      totalTenants: tenants.length,
      activeTenants: tenants.filter((tenant) => tenant.status === 'active').length,
      trialTenants: tenants.filter((tenant) => tenant.status === 'trial').length,
      totalUsers: tenants.reduce((sum, tenant) => sum + tenant.users, 0),
      totalPatients: tenants.reduce((sum, tenant) => sum + tenant.patients, 0),
      totalMrr: tenants.reduce((sum, tenant) => sum + tenant.mrr, 0),
      failedWebhooks,
      pendingBreakGlass: tenants.reduce((sum, tenant) => sum + tenant.pendingBreakGlass, 0),
    };
  }, [snapshot]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={Building2} label="Tenants" value={stats.totalTenants} />
        <StatCard icon={CheckCircle} label="Ativos" value={stats.activeTenants} tone="emerald" />
        <StatCard icon={Users} label="Usuarios" value={stats.totalUsers} tone="blue" />
        <StatCard icon={Activity} label="Pacientes" value={stats.totalPatients} tone="slate" />
        <StatCard icon={CreditCard} label="MRR" value={currency(stats.totalMrr)} tone="emerald" />
        <StatCard icon={Database} label="Trials" value={stats.trialTenants} tone="blue" />
        <StatCard
          icon={Webhook}
          label="Webhooks com atencao"
          value={stats.failedWebhooks}
          tone={stats.failedWebhooks ? 'red' : 'emerald'}
        />
        <StatCard
          icon={Shield}
          label="Break-glass pendente"
          value={stats.pendingBreakGlass}
          tone={stats.pendingBreakGlass ? 'amber' : 'slate'}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.85fr]">
        <TenantsTable tenants={snapshot.tenants} />
        <WebhookList webhooks={snapshot.webhooks} />
      </div>
    </div>
  );
}

function SectionFromSnapshot({
  section,
  snapshot,
}: {
  section: AdminSection;
  snapshot: PlatformAdminSnapshot;
}) {
  if (section === 'overview') return <Overview snapshot={snapshot} />;
  if (section === 'webhooks') return <WebhookList webhooks={snapshot.webhooks} />;
  if (section === 'tenants') return <TenantsTable tenants={snapshot.tenants} />;

  const failedWebhooks = snapshot.webhooks.filter((event) =>
    ['failed', 'dead_letter', 'retrying'].includes(event.status)
  );
  const supportTenants = snapshot.tenants.filter(
    (tenant) => tenant.openSupportSessions > 0 || tenant.pendingBreakGlass > 0
  );

  if (section === 'support') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Abertura e aprovacao de suporte ficam no detalhe do tenant para preservar contexto e
          auditoria por tenant.
        </div>
        <TenantsTable tenants={supportTenants.length ? supportTenants : snapshot.tenants} />
      </div>
    );
  }

  if (section === 'audit') {
    return (
      <div className="card-base p-5">
        <h2 className="mb-4 text-sm font-bold text-foreground">Auditoria recente</h2>
        <div className="space-y-2">
          {snapshot.audit.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-muted/30"
            >
              <ClipboardList size={14} className="mt-0.5 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">{entry.description}</p>
                <p className="text-xs text-muted-foreground">{entry.admin}</p>
              </div>
              <span className="text-xs text-muted-foreground">{formatDate(entry.timestamp)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section === 'security') {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          icon={Shield}
          label="Break-glass pendente"
          value={snapshot.tenants.reduce((sum, tenant) => sum + tenant.pendingBreakGlass, 0)}
          tone="amber"
        />
        <StatCard
          icon={XCircle}
          label="Webhooks falhos"
          value={failedWebhooks.length}
          tone={failedWebhooks.length ? 'red' : 'emerald'}
        />
        <StatCard
          icon={ClipboardList}
          label="Eventos auditaveis"
          value={snapshot.tenants.reduce((sum, tenant) => sum + tenant.auditEvents, 0)}
          tone="blue"
        />
      </div>
    );
  }

  if (section === 'financial') {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          icon={CreditCard}
          label="MRR total"
          value={currency(snapshot.tenants.reduce((sum, tenant) => sum + tenant.mrr, 0))}
          tone="emerald"
        />
        <StatCard
          icon={AlertTriangle}
          label="Tenants suspensos"
          value={snapshot.tenants.filter((tenant) => tenant.status === 'suspended').length}
          tone="red"
        />
        <StatCard
          icon={Building2}
          label="Trials"
          value={snapshot.tenants.filter((tenant) => tenant.status === 'trial').length}
          tone="blue"
        />
      </div>
    );
  }

  if (section === 'integrations') {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          icon={Link2}
          label="Asaas ativos"
          value={
            snapshot.tenants.filter((tenant) => tenant.asaasSubaccountStatus === 'active').length
          }
          tone="emerald"
        />
        <StatCard
          icon={Link2}
          label="D4Sign ativos"
          value={snapshot.tenants.filter((tenant) => tenant.d4signStatus === 'active').length}
          tone="blue"
        />
        <StatCard
          icon={AlertTriangle}
          label="Integracoes com erro"
          value={
            snapshot.tenants.filter(
              (tenant) =>
                tenant.asaasSubaccountStatus === 'error' || tenant.d4signStatus === 'error'
            ).length
          }
          tone="amber"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <StatCard
        icon={Activity}
        label="Chamadas no mes"
        value={snapshot.tenants.reduce((sum, tenant) => sum + tenant.apiCallsThisMonth, 0)}
        tone="blue"
      />
      <StatCard
        icon={HardDrive}
        label="Storage usado"
        value={`${snapshot.tenants.reduce((sum, tenant) => sum + tenant.storageUsedGb, 0).toFixed(1)} GB`}
        tone="slate"
      />
      <StatCard icon={Database} label="Tenants monitorados" value={snapshot.tenants.length} />
    </div>
  );
}

export default function AdminContent({ initialSection = 'overview' }: { initialSection?: string }) {
  const activeSection = (
    sectionTitles[initialSection as AdminSection] ? initialSection : 'overview'
  ) as AdminSection;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [snapshot, setSnapshot] = useState<PlatformAdminSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSnapshot = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    getPlatformAdminSnapshot().then(({ data, error }) => {
      setSnapshot(data);
      setLoadError(error?.message ?? null);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        activeSection={activeSection}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/admin" className="hover:text-primary">
              Admin
            </Link>
            <ChevronRight size={12} />
            <span className="font-medium text-foreground">{sectionTitles[activeSection]}</span>
          </div>
          <button
            type="button"
            onClick={loadSnapshot}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <RefreshCw size={12} />
            Atualizar
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-foreground">{sectionTitles[activeSection]}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Dados sanitizados via RPCs de plataforma, sem payload bruto nem provider secrets.
            </p>
          </div>

          {isLoading ? (
            <div className="card-base p-8 text-center text-sm text-muted-foreground">
              Carregando dados administrativos...
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : snapshot ? (
            <SectionFromSnapshot section={activeSection} snapshot={snapshot} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
