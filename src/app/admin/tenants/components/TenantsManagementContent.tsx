'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Ban,
  Building2,
  CheckCircle,
  ChevronRight,
  Clock,
  CreditCard,
  Filter,
  HardDrive,
  LogOut,
  RefreshCw,
  Search,
  User,
  Users,
  Webhook,
  X,
  XCircle,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { listTenants, type AdminTenantRow } from '@/services/adminApi';

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatK(value: number) {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
}

function TenantStatusBadge({ status }: { status: AdminTenantRow['status'] }) {
  const config = {
    active: {
      label: 'Ativo',
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle,
    },
    trial: {
      label: 'Trial',
      classes: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: Clock,
    },
    suspended: {
      label: 'Suspenso',
      classes: 'bg-red-50 text-red-700 border-red-200',
      icon: Ban,
    },
    cancelled: {
      label: 'Cancelado',
      classes: 'bg-slate-100 text-slate-600 border-slate-200',
      icon: XCircle,
    },
  };
  const item = config[status];
  const Icon = item.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${item.classes}`}
    >
      <Icon size={10} />
      {item.label}
    </span>
  );
}

function PlanBadge({ plan }: { plan: AdminTenantRow['plan'] }) {
  const config = {
    starter: 'border-slate-200 bg-slate-100 text-slate-600',
    professional: 'border-violet-200 bg-violet-50 text-violet-700',
    enterprise: 'border-amber-200 bg-amber-50 text-amber-700',
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${config[plan]}`}>
      {plan}
    </span>
  );
}

function IntegrationStatusDot({ status, label }: { status: string; label: string }) {
  const dotColor: Record<string, string> = {
    active: 'bg-emerald-500',
    pending: 'bg-amber-400',
    blocked: 'bg-red-500',
    error: 'bg-red-500',
    quota_exceeded: 'bg-orange-500',
    not_configured: 'bg-slate-300',
  };
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor[status] ?? 'bg-slate-300'}`}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-400' : 'bg-blue-500';
  return (
    <div className="flex min-w-[92px] flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{formatK(used)}</span>
        <span className="text-muted-foreground">{formatK(limit)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navItems = [
    { key: 'overview', label: 'Visao Geral', href: '/admin', icon: Activity },
    { key: 'tenants', label: 'Gestao de Tenants', href: '/admin/tenants', icon: Building2 },
    { key: 'webhooks', label: 'Webhooks', href: '/admin/webhooks', icon: Webhook },
  ];

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
          const active = item.key === 'tenants';
          return (
            <Link
              key={item.key}
              href={item.href}
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
              ) : null}
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

export default function TenantsManagementContent() {
  const [search, setSearch] = useState('');
  const [tenantRows, setTenantRows] = useState<AdminTenantRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | AdminTenantRow['status']>('all');
  const [planFilter, setPlanFilter] = useState<'all' | AdminTenantRow['plan']>('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const loadRows = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    listTenants().then(({ data, error }) => {
      setTenantRows(data);
      setLoadError(error?.message ?? null);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenantRows.filter((tenant) => {
      const matchSearch =
        !q ||
        tenant.clinicName.toLowerCase().includes(q) ||
        tenant.owner.toLowerCase().includes(q) ||
        tenant.email.toLowerCase().includes(q) ||
        tenant.id.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || tenant.status === statusFilter;
      const matchPlan = planFilter === 'all' || tenant.plan === planFilter;
      return matchSearch && matchStatus && matchPlan;
    });
  }, [tenantRows, search, statusFilter, planFilter]);

  const stats = useMemo(
    () => ({
      total: tenantRows.length,
      active: tenantRows.filter((tenant) => tenant.status === 'active').length,
      trial: tenantRows.filter((tenant) => tenant.status === 'trial').length,
      suspended: tenantRows.filter((tenant) => tenant.status === 'suspended').length,
      totalUsers: tenantRows.reduce((sum, tenant) => sum + tenant.users, 0),
    }),
    [tenantRows]
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
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
            <span className="font-medium text-foreground">Gestao de Tenants</span>
          </div>
          <button
            type="button"
            onClick={loadRows}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <RefreshCw size={12} />
            Atualizar
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="mb-6">
            <div className="mb-1 flex items-center gap-2">
              <Building2 size={20} className="text-primary" />
              <h1 className="text-xl font-bold text-foreground">Gestao de Tenants</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Dados reais via RPC sanitizada de plataforma. Payloads e identificadores sensiveis
              ficam redigidos.
            </p>
          </div>

          {isLoading ? (
            <div className="card-base mb-4 p-4 text-sm text-muted-foreground">
              Carregando tenants...
            </div>
          ) : null}

          {loadError ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : null}

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              {
                label: 'Total de Tenants',
                value: stats.total,
                icon: Building2,
                color: 'bg-teal-50 text-teal-600',
              },
              {
                label: 'Ativos',
                value: stats.active,
                icon: CheckCircle,
                color: 'bg-emerald-50 text-emerald-600',
              },
              {
                label: 'Em Trial',
                value: stats.trial,
                icon: Clock,
                color: 'bg-blue-50 text-blue-600',
              },
              {
                label: 'Suspensos',
                value: stats.suspended,
                icon: Ban,
                color: 'bg-red-50 text-red-600',
              },
              {
                label: 'Usuarios',
                value: stats.totalUsers,
                icon: Users,
                color: 'bg-violet-50 text-violet-600',
              },
            ].map((kpi) => {
              const KpiIcon = kpi.icon;
              return (
                <div key={kpi.label} className="stat-card flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${kpi.color}`}
                  >
                    <KpiIcon size={16} />
                  </div>
                  <div>
                    <p className="text-xl font-bold tabular-nums text-foreground">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card-base mb-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="Buscar por clinica, owner, ID ou email..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="input-base w-full pl-8 text-sm"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Filter size={13} className="text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  className="input-base text-xs"
                >
                  <option value="all">Todos os status</option>
                  <option value="active">Ativo</option>
                  <option value="trial">Trial</option>
                  <option value="suspended">Suspenso</option>
                  <option value="cancelled">Cancelado</option>
                </select>
                <select
                  value={planFilter}
                  onChange={(event) => setPlanFilter(event.target.value as typeof planFilter)}
                  className="input-base text-xs"
                >
                  <option value="all">Todos os planos</option>
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {filtered.length} tenant{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Clinica / ID
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Owner
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Plano
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Usuarios
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Pacientes
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Storage
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      API mes
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">MRR</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Asaas
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      D4Sign
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                        <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="font-medium">Nenhum tenant encontrado</p>
                        <p className="mt-1 text-xs">Tente ajustar os filtros de busca</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((tenant, index) => (
                      <tr
                        key={tenant.id}
                        className={`border-b border-border transition-colors last:border-0 hover:bg-muted/30 ${index % 2 ? 'bg-muted/10' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/tenants/${tenant.id}`}
                            className="group flex flex-col gap-0.5"
                          >
                            <span className="font-semibold text-foreground transition-colors group-hover:text-primary">
                              {tenant.clinicName}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {tenant.id}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">{tenant.owner}</span>
                            <span className="max-w-[160px] truncate text-muted-foreground">
                              {tenant.email}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <PlanBadge plan={tenant.plan} />
                        </td>
                        <td className="px-4 py-3">
                          <TenantStatusBadge status={tenant.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Users size={12} className="text-muted-foreground" />
                            <span className="font-medium text-foreground">{tenant.users}</span>
                            <span className="text-muted-foreground">/ {tenant.usersLimit}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Activity size={12} className="text-muted-foreground" />
                            <span className="font-medium text-foreground">{tenant.patients}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <HardDrive size={12} className="text-muted-foreground" />
                            <UsageBar
                              used={tenant.storageUsedGb}
                              limit={tenant.storageCapacityGb}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <UsageBar
                            used={tenant.apiCallsThisMonth}
                            limit={tenant.apiLimitMonthly}
                          />
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                          <div className="flex items-center gap-1.5">
                            <CreditCard size={12} className="text-muted-foreground" />
                            {currency(tenant.mrr)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <IntegrationStatusDot
                            status={tenant.asaasSubaccountStatus}
                            label={tenant.asaasSubaccountStatus}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <IntegrationStatusDot
                            status={tenant.d4signStatus}
                            label={tenant.d4signStatus}
                          />
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
        </main>
      </div>
    </div>
  );
}
