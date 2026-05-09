'use client';

import React, { useEffect, useState } from 'react';
import {
  Building2,
  Users,
  Search,
  Filter,
  MoreHorizontal,
  Ban,
  Play,
  CreditCard,
  FileText,
  Link2,
  ChevronRight,
  LogOut,
  User,
  Bell,
  CheckCircle,
  XCircle,
  Clock,
  X,
  ExternalLink,
  Activity,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { listTenants } from '@/services/adminApi';

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

interface TenantRow {
  id: string;
  clinicName: string;
  owner: string;
  email: string;
  plan: 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'trial' | 'suspended' | 'cancelled';
  users: number;
  patients: number;
  storageUsedGb: number;
  storageCapacityGb: number;
  apiCallsThisMonth: number;
  apiLimitMonthly: number;
  saasSubscriptionStatus: 'active' | 'trial' | 'past_due' | 'cancelled' | 'paused';
  asaasSubaccountStatus: 'active' | 'pending' | 'blocked' | 'not_configured';
  d4signStatus: 'active' | 'quota_exceeded' | 'error' | 'not_configured';
  featureFlags: {
    programs: boolean;
    builder: boolean;
    whatsapp: boolean;
    aiAssistant: boolean;
    customDomain: boolean;
    advancedReports: boolean;
  };
  createdAt: string;
  lastActivityAt: string;
}

const mockTenantRows: TenantRow[] = [
  {
    id: 'T001',
    clinicName: 'Clínica Corpo & Saúde',
    owner: 'Dr. Ricardo Alves',
    email: 'ricardo@corposaude.com.br',
    plan: 'enterprise',
    status: 'active',
    users: 28,
    patients: 412,
    storageUsedGb: 42.3,
    storageCapacityGb: 100,
    apiCallsThisMonth: 84200,
    apiLimitMonthly: 200000,
    saasSubscriptionStatus: 'active',
    asaasSubaccountStatus: 'active',
    d4signStatus: 'active',
    featureFlags: {
      programs: true,
      builder: true,
      whatsapp: true,
      aiAssistant: true,
      customDomain: true,
      advancedReports: true,
    },
    createdAt: '2025-01-15',
    lastActivityAt: '2026-05-07',
  },
  {
    id: 'T002',
    clinicName: 'NutriVita Clínicas',
    owner: 'Dra. Camila Torres',
    email: 'camila@nutrivita.com.br',
    plan: 'professional',
    status: 'active',
    users: 14,
    patients: 198,
    storageUsedGb: 18.7,
    storageCapacityGb: 50,
    apiCallsThisMonth: 38100,
    apiLimitMonthly: 100000,
    saasSubscriptionStatus: 'active',
    asaasSubaccountStatus: 'active',
    d4signStatus: 'quota_exceeded',
    featureFlags: {
      programs: true,
      builder: false,
      whatsapp: true,
      aiAssistant: false,
      customDomain: false,
      advancedReports: true,
    },
    createdAt: '2025-03-20',
    lastActivityAt: '2026-05-07',
  },
  {
    id: 'T003',
    clinicName: 'SlimCenter Premium',
    owner: 'Dr. Paulo Mendes',
    email: 'paulo@slimcenter.com.br',
    plan: 'professional',
    status: 'trial',
    users: 6,
    patients: 34,
    storageUsedGb: 3.2,
    storageCapacityGb: 50,
    apiCallsThisMonth: 4800,
    apiLimitMonthly: 100000,
    saasSubscriptionStatus: 'trial',
    asaasSubaccountStatus: 'pending',
    d4signStatus: 'not_configured',
    featureFlags: {
      programs: true,
      builder: false,
      whatsapp: false,
      aiAssistant: false,
      customDomain: false,
      advancedReports: false,
    },
    createdAt: '2026-04-22',
    lastActivityAt: '2026-05-06',
  },
  {
    id: 'T004',
    clinicName: 'Metabolic Health SP',
    owner: 'Dra. Ana Rodrigues',
    email: 'ana@metabolichealth.com.br',
    plan: 'starter',
    status: 'active',
    users: 5,
    patients: 67,
    storageUsedGb: 7.1,
    storageCapacityGb: 20,
    apiCallsThisMonth: 9200,
    apiLimitMonthly: 30000,
    saasSubscriptionStatus: 'past_due',
    asaasSubaccountStatus: 'blocked',
    d4signStatus: 'error',
    featureFlags: {
      programs: false,
      builder: false,
      whatsapp: false,
      aiAssistant: false,
      customDomain: false,
      advancedReports: false,
    },
    createdAt: '2025-06-10',
    lastActivityAt: '2026-05-05',
  },
  {
    id: 'T005',
    clinicName: 'Longevidade Clínica',
    owner: 'Dr. Marcos Faria',
    email: 'marcos@longevidade.com.br',
    plan: 'enterprise',
    status: 'active',
    users: 35,
    patients: 589,
    storageUsedGb: 67.8,
    storageCapacityGb: 100,
    apiCallsThisMonth: 142000,
    apiLimitMonthly: 200000,
    saasSubscriptionStatus: 'active',
    asaasSubaccountStatus: 'active',
    d4signStatus: 'active',
    featureFlags: {
      programs: true,
      builder: true,
      whatsapp: true,
      aiAssistant: true,
      customDomain: true,
      advancedReports: true,
    },
    createdAt: '2024-11-05',
    lastActivityAt: '2026-05-07',
  },
  {
    id: 'T006',
    clinicName: 'Forma & Vida',
    owner: 'Nutr. Beatriz Costa',
    email: 'beatriz@formavida.com.br',
    plan: 'starter',
    status: 'suspended',
    users: 3,
    patients: 41,
    storageUsedGb: 5.4,
    storageCapacityGb: 20,
    apiCallsThisMonth: 0,
    apiLimitMonthly: 30000,
    saasSubscriptionStatus: 'paused',
    asaasSubaccountStatus: 'blocked',
    d4signStatus: 'not_configured',
    featureFlags: {
      programs: false,
      builder: false,
      whatsapp: false,
      aiAssistant: false,
      customDomain: false,
      advancedReports: false,
    },
    createdAt: '2025-09-01',
    lastActivityAt: '2026-04-15',
  },
  {
    id: 'T007',
    clinicName: 'BodyTransform RJ',
    owner: 'Dr. Felipe Souza',
    email: 'felipe@bodytransform.com.br',
    plan: 'professional',
    status: 'trial',
    users: 8,
    patients: 52,
    storageUsedGb: 2.1,
    storageCapacityGb: 50,
    apiCallsThisMonth: 6300,
    apiLimitMonthly: 100000,
    saasSubscriptionStatus: 'trial',
    asaasSubaccountStatus: 'pending',
    d4signStatus: 'not_configured',
    featureFlags: {
      programs: true,
      builder: false,
      whatsapp: true,
      aiAssistant: false,
      customDomain: false,
      advancedReports: false,
    },
    createdAt: '2026-04-28',
    lastActivityAt: '2026-05-04',
  },
  {
    id: 'T008',
    clinicName: 'Clínica Emagrecimento Total',
    owner: 'Dra. Lucia Ferreira',
    email: 'lucia@emagrecimentototal.com.br',
    plan: 'professional',
    status: 'cancelled',
    users: 0,
    patients: 0,
    storageUsedGb: 1.2,
    storageCapacityGb: 50,
    apiCallsThisMonth: 0,
    apiLimitMonthly: 100000,
    saasSubscriptionStatus: 'cancelled',
    asaasSubaccountStatus: 'not_configured',
    d4signStatus: 'not_configured',
    featureFlags: {
      programs: false,
      builder: false,
      whatsapp: false,
      aiAssistant: false,
      customDomain: false,
      advancedReports: false,
    },
    createdAt: '2025-02-14',
    lastActivityAt: '2026-03-01',
  },
];

// ─── BADGE COMPONENTS ─────────────────────────────────────────────────────────

function TenantStatusBadge({ status }: { status: TenantRow['status'] }) {
  const config: Record<string, { label: string; classes: string; icon: React.ElementType }> = {
    active: {
      label: 'Ativo',
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle,
    },
    trial: { label: 'Trial', classes: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
    suspended: { label: 'Suspenso', classes: 'bg-red-50 text-red-700 border-red-200', icon: Ban },
    cancelled: {
      label: 'Cancelado',
      classes: 'bg-slate-100 text-slate-600 border-slate-200',
      icon: XCircle,
    },
  };
  const c = config[status] ?? config.active;
  const IconComp = c.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border text-xs font-medium px-2 py-0.5 ${c.classes}`}
    >
      <IconComp size={10} />
      {c.label}
    </span>
  );
}

function PlanBadge({ plan }: { plan: TenantRow['plan'] }) {
  const config: Record<string, { label: string; classes: string }> = {
    starter: { label: 'Starter', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
    professional: {
      label: 'Professional',
      classes: 'bg-violet-50 text-violet-700 border-violet-200',
    },
    enterprise: { label: 'Enterprise', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  };
  const c = config[plan] ?? config.starter;
  return (
    <span
      className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${c.classes}`}
    >
      {c.label}
    </span>
  );
}

function SaasSubBadge({ status }: { status: TenantRow['saasSubscriptionStatus'] }) {
  const config: Record<string, { label: string; classes: string }> = {
    active: { label: 'Ativo', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    trial: { label: 'Trial', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
    past_due: { label: 'Vencido', classes: 'bg-red-50 text-red-700 border-red-200' },
    cancelled: { label: 'Cancelado', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
    paused: { label: 'Pausado', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  };
  const c = config[status] ?? config.active;
  return (
    <span
      className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${c.classes}`}
    >
      {c.label}
    </span>
  );
}

function IntegrationStatusDot({ status, label }: { status: string; label: string }) {
  const dotColor: Record<string, string> = {
    active: 'bg-emerald-500',
    pending: 'bg-amber-400',
    blocked: 'bg-red-500',
    not_configured: 'bg-slate-300',
    quota_exceeded: 'bg-orange-500',
    error: 'bg-red-500',
  };
  const dot = dotColor[status] ?? 'bg-slate-300';
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function StorageBar({ used, capacity }: { used: number; capacity: number }) {
  const pct = Math.min((used / capacity) * 100, 100);
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-400' : 'bg-teal-500';
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{used.toFixed(1)} GB</span>
        <span className="text-xs text-muted-foreground">{capacity} GB</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ApiUsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-400' : 'bg-blue-500';
  const formatK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n));
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{formatK(used)}</span>
        <span className="text-xs text-muted-foreground">{formatK(limit)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── FEATURE FLAGS CELL ───────────────────────────────────────────────────────

const flagLabels: Record<string, string> = {
  programs: 'Programas',
  builder: 'Builder',
  whatsapp: 'WhatsApp',
  aiAssistant: 'IA',
  customDomain: 'Domínio',
  advancedReports: 'Relatórios+',
};

function FeatureFlagsCell({ flags }: { flags: TenantRow['featureFlags'] }) {
  const entries = Object.entries(flags) as [keyof TenantRow['featureFlags'], boolean][];
  const activeCount = entries.filter(([, v]) => v).length;
  return (
    <div className="flex flex-wrap gap-1 max-w-[160px]">
      {entries.map(([key, enabled]) => (
        <span
          key={key}
          className={`text-xs rounded px-1.5 py-0.5 font-medium border ${enabled ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through'}`}
        >
          {flagLabels[key]}
        </span>
      ))}
    </div>
  );
}

// ─── ACTION MENU ──────────────────────────────────────────────────────────────

function ActionMenu({ tenant, onClose }: { tenant: TenantRow; onClose: () => void }) {
  const actions = [
    {
      label: 'Abrir',
      icon: ExternalLink,
      color: 'text-foreground',
      onClick: () => {
        window.location.href = `/admin/tenants/${tenant.id}`;
        onClose();
      },
    },
    {
      label: 'Suspender',
      icon: Ban,
      color: 'text-red-600',
      disabled: tenant.status === 'suspended' || tenant.status === 'cancelled',
      onClick: () => {
        alert(`Suspendendo ${tenant.clinicName}`);
        onClose();
      },
    },
    {
      label: 'Reativar',
      icon: Play,
      color: 'text-emerald-600',
      disabled: tenant.status === 'active' || tenant.status === 'trial',
      onClick: () => {
        alert(`Reativando ${tenant.clinicName}`);
        onClose();
      },
    },
    {
      label: 'Gerenciar plano',
      icon: CreditCard,
      color: 'text-violet-600',
      onClick: () => {
        alert(`Gerenciando plano de ${tenant.clinicName}`);
        onClose();
      },
    },
    {
      label: 'Ver logs',
      icon: FileText,
      color: 'text-blue-600',
      onClick: () => {
        alert(`Logs de ${tenant.clinicName}`);
        onClose();
      },
    },
    {
      label: 'Ver integrações',
      icon: Link2,
      color: 'text-teal-600',
      onClick: () => {
        alert(`Integrações de ${tenant.clinicName}`);
        onClose();
      },
    },
  ];

  return (
    <div className="absolute right-0 top-8 z-50 w-48 bg-card border border-border rounded-xl shadow-lg py-1 overflow-hidden">
      {actions.map((action) => {
        const ActionIcon = action.icon;
        return (
          <button
            key={action.label}
            onClick={action.disabled ? undefined : action.onClick}
            disabled={action.disabled}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${action.disabled ? 'opacity-40 cursor-not-allowed text-muted-foreground' : `${action.color} hover:bg-muted`}`}
          >
            <ActionIcon size={13} />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function TenantsManagementContent() {
  const [search, setSearch] = useState('');
  const [tenantRows, setTenantRows] = useState<TenantRow[]>(mockTenantRows);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listTenants(mockTenantRows).then(({ data, error }) => {
      if (!mounted) return;
      setTenantRows((data ?? mockTenantRows) as TenantRow[]);
      setLoadError(error?.message ?? null);
      setIsLoading(false);
    });
    return () => { mounted = false; };
  }, []);
  const [statusFilter, setStatusFilter] = useState<'all' | TenantRow['status']>('all');
  const [planFilter, setPlanFilter] = useState<'all' | TenantRow['plan']>('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navItems = [
    { key: 'overview', label: 'Visão Geral', href: '/admin', icon: LayoutDashboardIcon },
    { key: 'tenants', label: 'Gestão de Tenants', href: '/admin/tenants', icon: Building2 },
  ];

  const filtered = tenantRows.filter((t) => {
    const matchSearch =
      !search ||
      t.clinicName.toLowerCase().includes(search.toLowerCase()) ||
      t.owner.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchPlan = planFilter === 'all' || t.plan === planFilter;
    return matchSearch && matchStatus && matchPlan;
  });

  const stats = {
    total: tenantRows.length,
    active: tenantRows.filter((t) => t.status === 'active').length,
    trial: tenantRows.filter((t) => t.status === 'trial').length,
    suspended: tenantRows.filter((t) => t.status === 'suspended').length,
    totalUsers: tenantRows.reduce((s, t) => s + t.users, 0),
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-card border-r border-border flex-shrink-0 sidebar-transition ${sidebarCollapsed ? 'w-16' : 'w-56'}`}
      >
        <div
          className={`flex items-center border-b border-border py-4 ${sidebarCollapsed ? 'justify-center px-2' : 'gap-2 px-4'}`}
        >
          <AppLogo size={28} />
          {!sidebarCollapsed && (
            <div className="flex flex-col leading-none">
              <span className="font-bold text-xs text-foreground tracking-tight">SlimHiper</span>
              <span className="text-xs text-primary font-semibold">Admin</span>
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const ItemIcon = item.icon;
            const active = item.key === 'tenants';
            return (
              <a
                key={item.key}
                href={item.href}
                title={sidebarCollapsed ? item.label : undefined}
                className={`relative w-full flex items-center rounded-xl transition-all duration-150 group ${sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-primary/8 hover:text-primary'}`}
              >
                <ItemIcon size={16} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
                {!sidebarCollapsed && (
                  <span className={`text-xs ${active ? 'font-semibold' : 'font-medium'}`}>
                    {item.label}
                  </span>
                )}
                {sidebarCollapsed && (
                  <span className="absolute left-full ml-2 px-2 py-1 bg-foreground text-background text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    {item.label}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
        <div className="border-t border-border p-2">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-muted cursor-pointer mb-1">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <User size={12} className="text-primary" />
              </div>
              <div className="flex flex-col leading-none min-w-0">
                <span className="text-xs font-semibold text-foreground truncate">Admin Carlos</span>
                <span className="text-xs text-muted-foreground">Platform Owner</span>
              </div>
              <LogOut size={12} className="ml-auto text-muted-foreground" />
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex items-center justify-center w-full py-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all text-xs font-medium gap-1"
          >
            {sidebarCollapsed ? (
              <ChevronRight size={14} />
            ) : (
              <>
                <ChevronRight size={14} className="rotate-180" /> Recolher
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center gap-3 px-6 py-3 bg-card border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <a href="/admin" className="hover:text-primary transition-colors">
              Admin
            </a>
            <ChevronRight size={12} />
            <span className="text-foreground font-medium">Gestão de Tenants</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="relative btn-ghost p-2">
              <Bell size={16} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
            </button>
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <User size={13} className="text-primary" />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-6">
          {/* Page Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={20} className="text-primary" />
              <h1 className="text-xl font-bold text-foreground">Gestão de Tenants</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Gerencie todas as clínicas cadastradas na plataforma
            </p>
          </div>

          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
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
                label: 'Total de Usuários',
                value: stats.totalUsers,
                icon: Users,
                color: 'bg-violet-50 text-violet-600',
              },
            ].map((kpi) => {
              const KpiIcon = kpi.icon;
              return (
                <div key={kpi.label} className="stat-card flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${kpi.color}`}
                  >
                    <KpiIcon size={16} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground tabular-nums">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Filters */}
          <div className="card-base p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="Buscar por clínica, owner, ID ou e-mail..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Filter size={13} className="text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="text-xs bg-muted border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-foreground"
                >
                  <option value="all">Todos os status</option>
                  <option value="active">Ativo</option>
                  <option value="trial">Trial</option>
                  <option value="suspended">Suspenso</option>
                  <option value="cancelled">Cancelado</option>
                </select>
                <select
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
                  className="text-xs bg-muted border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-foreground"
                >
                  <option value="all">Todos os planos</option>
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <span className="text-xs text-muted-foreground ml-auto">
                {filtered.length} tenant{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Clínica / Tenant ID
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Owner
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Plano
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Usuários
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Pacientes
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Armazenamento
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      API (mês)
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Assinatura SaaS
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Asaas
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      D4Sign
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Feature Flags
                    </th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="text-center py-12 text-muted-foreground">
                        <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="font-medium">Nenhum tenant encontrado</p>
                        <p className="text-xs mt-1">Tente ajustar os filtros de busca</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((tenant, idx) => (
                      <tr
                        key={tenant.id}
                        className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}
                      >
                        {/* Clinic + ID */}
                        <td className="px-4 py-3">
                          <a
                            href={`/admin/tenants/${tenant.id}`}
                            className="flex flex-col gap-0.5 group"
                          >
                            <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                              {tenant.clinicName}
                            </span>
                            <span className="text-muted-foreground font-mono text-xs">
                              {tenant.id}
                            </span>
                          </a>
                        </td>
                        {/* Owner */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">{tenant.owner}</span>
                            <span className="text-muted-foreground truncate max-w-[140px]">
                              {tenant.email}
                            </span>
                          </div>
                        </td>
                        {/* Plan */}
                        <td className="px-4 py-3">
                          <PlanBadge plan={tenant.plan} />
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <TenantStatusBadge status={tenant.status} />
                        </td>
                        {/* Users */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Users size={12} className="text-muted-foreground" />
                            <span className="font-medium text-foreground">{tenant.users}</span>
                          </div>
                        </td>
                        {/* Patients — count only, no clinical data */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Activity size={12} className="text-muted-foreground" />
                            <span className="font-medium text-foreground">{tenant.patients}</span>
                          </div>
                        </td>
                        {/* Storage */}
                        <td className="px-4 py-3">
                          <StorageBar
                            used={tenant.storageUsedGb}
                            capacity={tenant.storageCapacityGb}
                          />
                        </td>
                        {/* API Usage */}
                        <td className="px-4 py-3">
                          <ApiUsageBar
                            used={tenant.apiCallsThisMonth}
                            limit={tenant.apiLimitMonthly}
                          />
                        </td>
                        {/* SaaS Subscription */}
                        <td className="px-4 py-3">
                          <SaasSubBadge status={tenant.saasSubscriptionStatus} />
                        </td>
                        {/* Asaas */}
                        <td className="px-4 py-3">
                          <IntegrationStatusDot
                            status={tenant.asaasSubaccountStatus}
                            label={
                              tenant.asaasSubaccountStatus === 'active'
                                ? 'Ativo'
                                : tenant.asaasSubaccountStatus === 'pending'
                                  ? 'Pendente'
                                  : tenant.asaasSubaccountStatus === 'blocked'
                                    ? 'Bloqueado'
                                    : 'N/C'
                            }
                          />
                        </td>
                        {/* D4Sign */}
                        <td className="px-4 py-3">
                          <IntegrationStatusDot
                            status={tenant.d4signStatus}
                            label={
                              tenant.d4signStatus === 'active'
                                ? 'Ativo'
                                : tenant.d4signStatus === 'quota_exceeded'
                                  ? 'Cota'
                                  : tenant.d4signStatus === 'error'
                                    ? 'Erro'
                                    : 'N/C'
                            }
                          />
                        </td>
                        {/* Feature Flags */}
                        <td className="px-4 py-3">
                          <FeatureFlagsCell flags={tenant.featureFlags} />
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="relative inline-block">
                            <button
                              onClick={() =>
                                setOpenMenuId(openMenuId === tenant.id ? null : tenant.id)
                              }
                              className="btn-ghost p-1.5 rounded-lg"
                            >
                              <MoreHorizontal size={15} />
                            </button>
                            {openMenuId === tenant.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() => setOpenMenuId(null)}
                                />
                                <ActionMenu tenant={tenant} onClose={() => setOpenMenuId(null)} />
                              </>
                            )}
                          </div>
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

// Placeholder icon
function LayoutDashboardIcon(
  props: React.SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }
) {
  const { size = 16, strokeWidth = 2, ...rest } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}
