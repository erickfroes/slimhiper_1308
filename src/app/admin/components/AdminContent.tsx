'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  TrendingUp,
  AlertTriangle,
  Activity,
  Database,
  Webhook,
  Shield,
  Headphones,
  ClipboardList,
  RefreshCw,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Ban,
  MessageSquare,
  BarChart2,
  Link2,
  Bell,
  LogOut,
  User,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  HardDrive,
  Globe,
  CreditCard,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Play,
  Pause,
  AlertCircle,
  Info,
  ChevronRight,
  Download,
  ExternalLink,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import Icon from '@/components/ui/AppIcon';

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const mockTenants = [
  {
    id: 'T001',
    name: 'Clínica Corpo & Saúde',
    owner: 'Dr. Ricardo Alves',
    email: 'ricardo@corposaude.com.br',
    plan: 'enterprise',
    status: 'active',
    clinics: 3,
    users: 28,
    mrr: 1490,
    storage: 42.3,
    lastActivity: '2026-05-07',
    createdAt: '2025-01-15',
    billing: 'em_dia',
    webhookErrors: 0,
    integrationErrors: 0,
  },
  {
    id: 'T002',
    name: 'NutriVita Clínicas',
    owner: 'Dra. Camila Torres',
    email: 'camila@nutrivita.com.br',
    plan: 'professional',
    status: 'active',
    clinics: 2,
    users: 14,
    mrr: 790,
    storage: 18.7,
    lastActivity: '2026-05-07',
    createdAt: '2025-03-20',
    billing: 'em_dia',
    webhookErrors: 2,
    integrationErrors: 1,
  },
  {
    id: 'T003',
    name: 'SlimCenter Premium',
    owner: 'Dr. Paulo Mendes',
    email: 'paulo@slimcenter.com.br',
    plan: 'professional',
    status: 'trial',
    clinics: 1,
    users: 6,
    mrr: 0,
    storage: 3.2,
    lastActivity: '2026-05-06',
    createdAt: '2026-04-22',
    billing: 'trial',
    webhookErrors: 0,
    integrationErrors: 0,
  },
  {
    id: 'T004',
    name: 'Metabolic Health SP',
    owner: 'Dra. Ana Rodrigues',
    email: 'ana@metabolichealth.com.br',
    plan: 'starter',
    status: 'active',
    clinics: 1,
    users: 5,
    mrr: 290,
    storage: 7.1,
    lastActivity: '2026-05-05',
    createdAt: '2025-06-10',
    billing: 'pendente',
    webhookErrors: 5,
    integrationErrors: 3,
  },
  {
    id: 'T005',
    name: 'Longevidade Clínica',
    owner: 'Dr. Marcos Faria',
    email: 'marcos@longevidade.com.br',
    plan: 'enterprise',
    status: 'active',
    clinics: 4,
    users: 35,
    mrr: 1490,
    storage: 67.8,
    lastActivity: '2026-05-07',
    createdAt: '2024-11-05',
    billing: 'em_dia',
    webhookErrors: 0,
    integrationErrors: 0,
  },
  {
    id: 'T006',
    name: 'Forma & Vida',
    owner: 'Nutr. Beatriz Costa',
    email: 'beatriz@formavida.com.br',
    plan: 'starter',
    status: 'suspended',
    clinics: 1,
    users: 3,
    mrr: 0,
    storage: 5.4,
    lastActivity: '2026-04-15',
    createdAt: '2025-09-01',
    billing: 'inadimplente',
    webhookErrors: 0,
    integrationErrors: 0,
  },
  {
    id: 'T007',
    name: 'BodyTransform RJ',
    owner: 'Dr. Felipe Souza',
    email: 'felipe@bodytransform.com.br',
    plan: 'professional',
    status: 'trial',
    clinics: 1,
    users: 8,
    mrr: 0,
    storage: 2.1,
    lastActivity: '2026-05-04',
    createdAt: '2026-04-28',
    billing: 'trial',
    webhookErrors: 1,
    integrationErrors: 0,
  },
  {
    id: 'T008',
    name: 'Clínica Emagrecimento Total',
    owner: 'Dra. Lucia Ferreira',
    email: 'lucia@emagrecimentototal.com.br',
    plan: 'professional',
    status: 'cancelled',
    clinics: 0,
    users: 0,
    mrr: 0,
    storage: 1.2,
    lastActivity: '2026-03-01',
    createdAt: '2025-02-14',
    billing: 'cancelado',
    webhookErrors: 0,
    integrationErrors: 0,
  },
];

const mrrGrowthData = [
  { month: 'Nov', mrr: 3200 },
  { month: 'Dez', mrr: 3800 },
  { month: 'Jan', mrr: 4200 },
  { month: 'Fev', mrr: 4900 },
  { month: 'Mar', mrr: 5400 },
  { month: 'Abr', mrr: 5850 },
  { month: 'Mai', mrr: 6350 },
];

const revenueByPlanData = [
  { name: 'Enterprise', value: 5960, color: '#0d9488' },
  { name: 'Professional', value: 1580, color: '#059669' },
  { name: 'Starter', value: 580, color: '#6ee7b7' },
];

const apiRequestsData = [
  { day: 'Seg', requests: 12400 },
  { day: 'Ter', requests: 15200 },
  { day: 'Qua', requests: 13800 },
  { day: 'Qui', requests: 16900 },
  { day: 'Sex', requests: 14300 },
  { day: 'Sáb', requests: 8200 },
  { day: 'Dom', requests: 6100 },
];

const webhookErrors = [
  {
    id: 'WH001',
    tenant: 'NutriVita Clínicas',
    event: 'payment.confirmed',
    error: 'Connection timeout após 30s',
    severity: 'alto',
    timestamp: '2026-05-07 19:42',
    retries: 2,
    status: 'pending',
  },
  {
    id: 'WH002',
    tenant: 'Metabolic Health SP',
    event: 'appointment.created',
    error: 'HTTP 502 Bad Gateway',
    severity: 'critico',
    timestamp: '2026-05-07 18:15',
    retries: 3,
    status: 'dead_letter',
  },
  {
    id: 'WH003',
    tenant: 'BodyTransform RJ',
    event: 'document.signed',
    error: 'Invalid payload schema',
    severity: 'medio',
    timestamp: '2026-05-07 17:30',
    retries: 1,
    status: 'pending',
  },
  {
    id: 'WH004',
    tenant: 'Metabolic Health SP',
    event: 'user.created',
    error: 'Authentication failed 401',
    severity: 'alto',
    timestamp: '2026-05-07 16:55',
    retries: 3,
    status: 'dead_letter',
  },
  {
    id: 'WH005',
    tenant: 'NutriVita Clínicas',
    event: 'invoice.overdue',
    error: 'DNS resolution failed',
    severity: 'medio',
    timestamp: '2026-05-07 14:20',
    retries: 2,
    status: 'pending',
  },
];

const integrationErrors = [
  {
    id: 'INT001',
    tenant: 'Metabolic Health SP',
    integration: 'Asaas (Pagamentos)',
    error: 'API key inválida',
    severity: 'critico',
    lastSync: '2026-05-05 10:00',
    status: 'error',
  },
  {
    id: 'INT002',
    tenant: 'NutriVita Clínicas',
    integration: 'D4Sign (Documentos)',
    error: 'Cota de requisições excedida',
    severity: 'alto',
    lastSync: '2026-05-07 08:30',
    status: 'error',
  },
  {
    id: 'INT003',
    tenant: 'Metabolic Health SP',
    integration: 'WhatsApp Business',
    error: 'Token expirado',
    severity: 'alto',
    lastSync: '2026-05-06 22:00',
    status: 'error',
  },
  {
    id: 'INT004',
    tenant: 'BodyTransform RJ',
    integration: 'Google Calendar',
    error: 'Permissão revogada',
    severity: 'medio',
    lastSync: '2026-05-07 12:00',
    status: 'warning',
  },
];

const securityAlerts = [
  {
    id: 'SEC001',
    type: 'failed_login',
    description: '47 tentativas de login falhas em 10 min',
    tenant: 'Metabolic Health SP',
    severity: 'critico',
    timestamp: '2026-05-07 20:01',
    resolved: false,
  },
  {
    id: 'SEC002',
    type: 'api_abuse',
    description: '8.200 req/min — limite é 1.000/min',
    tenant: 'NutriVita Clínicas',
    severity: 'alto',
    timestamp: '2026-05-07 19:30',
    resolved: false,
  },
  {
    id: 'SEC003',
    type: 'suspicious_access',
    description: 'Acesso de IP não reconhecido (Rússia)',
    tenant: 'Longevidade Clínica',
    severity: 'alto',
    timestamp: '2026-05-07 18:45',
    resolved: false,
  },
  {
    id: 'SEC004',
    type: 'permission_escalation',
    description: 'Tentativa de escalada de privilégio bloqueada',
    tenant: 'SlimCenter Premium',
    severity: 'medio',
    timestamp: '2026-05-07 16:20',
    resolved: true,
  },
];

const supportSessions = [
  {
    id: 'SUP001',
    tenant: 'Metabolic Health SP',
    status: 'open',
    priority: 'urgente',
    assignedTo: 'Admin Carlos',
    lastActivity: '2026-05-07 20:05',
    subject: 'Integração Asaas não funciona',
  },
  {
    id: 'SUP002',
    tenant: 'NutriVita Clínicas',
    status: 'open',
    priority: 'alto',
    assignedTo: 'Admin Maria',
    lastActivity: '2026-05-07 19:00',
    subject: 'Webhooks falhando repetidamente',
  },
  {
    id: 'SUP003',
    tenant: 'BodyTransform RJ',
    status: 'pending',
    priority: 'medio',
    assignedTo: null,
    lastActivity: '2026-05-07 15:30',
    subject: 'Dúvida sobre limites de armazenamento',
  },
  {
    id: 'SUP004',
    tenant: 'SlimCenter Premium',
    status: 'resolved',
    priority: 'baixo',
    assignedTo: 'Admin Carlos',
    lastActivity: '2026-05-07 14:00',
    subject: 'Configuração de domínio personalizado',
  },
];

const auditLog = [
  {
    id: 'AUD001',
    action: 'tenant_suspended',
    description: 'Tenant "Forma & Vida" suspenso por inadimplência',
    admin: 'Admin Sistema',
    timestamp: '2026-04-15 09:00',
  },
  {
    id: 'AUD002',
    action: 'plan_changed',
    description: 'Tenant "Longevidade Clínica" migrado de Professional para Enterprise',
    admin: 'Admin Carlos',
    timestamp: '2026-05-02 14:30',
  },
  {
    id: 'AUD003',
    action: 'webhook_retried',
    description: 'Webhook WH002 reenviado manualmente para "Metabolic Health SP"',
    admin: 'Admin Maria',
    timestamp: '2026-05-07 18:20',
  },
  {
    id: 'AUD004',
    action: 'security_reviewed',
    description: 'Alerta SEC001 revisado — IP bloqueado temporariamente',
    admin: 'Admin Carlos',
    timestamp: '2026-05-07 20:03',
  },
  {
    id: 'AUD005',
    action: 'support_opened',
    description: 'Sessão de suporte aberta para "Metabolic Health SP"',
    admin: 'Admin Carlos',
    timestamp: '2026-05-07 20:05',
  },
  {
    id: 'AUD006',
    action: 'billing_updated',
    description: 'Fatura de "NutriVita Clínicas" atualizada manualmente',
    admin: 'Admin Maria',
    timestamp: '2026-05-06 11:15',
  },
];

const storageByType = [
  { type: 'Documentos', gb: 48.2, color: '#0d9488' },
  { type: 'Imagens', gb: 32.6, color: '#059669' },
  { type: 'Exportações', gb: 18.4, color: '#6ee7b7' },
  { type: 'Logs', gb: 12.1, color: '#a7f3d0' },
  { type: 'Anexos', gb: 9.8, color: '#d1fae5' },
];

// ─── HELPER COMPONENTS ────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, string> = {
    critico: 'bg-red-50 text-red-700 border-red-200',
    alto: 'bg-orange-50 text-orange-700 border-orange-200',
    medio: 'bg-amber-50 text-amber-700 border-amber-200',
    baixo: 'bg-blue-50 text-blue-700 border-blue-200',
  };
  const labels: Record<string, string> = {
    critico: 'Crítico',
    alto: 'Alto',
    medio: 'Médio',
    baixo: 'Baixo',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border text-xs font-medium px-2 py-0.5 ${config[severity] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}
    >
      {labels[severity] ?? severity}
    </span>
  );
}

function TenantStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    active: { label: 'Ativo', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    trial: { label: 'Trial', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
    suspended: { label: 'Suspenso', classes: 'bg-red-50 text-red-700 border-red-200' },
    cancelled: { label: 'Cancelado', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
  };
  const c = config[status] ?? {
    label: status,
    classes: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${c.classes}`}
    >
      {c.label}
    </span>
  );
}

function BillingBadge({ billing }: { billing: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    em_dia: { label: 'Em dia', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    pendente: { label: 'Pendente', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
    inadimplente: { label: 'Inadimplente', classes: 'bg-red-50 text-red-700 border-red-200' },
    trial: { label: 'Trial', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
    cancelado: { label: 'Cancelado', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
  };
  const c = config[billing] ?? {
    label: billing,
    classes: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${c.classes}`}
    >
      {c.label}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  color = 'teal',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  trend?: { value: string; up: boolean | null };
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="stat-card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorMap[color] ?? colorMap.teal}`}
        >
          <Icon size={18} />
        </div>
        {trend && (
          <span
            className={`flex items-center gap-0.5 text-xs font-semibold ${trend.up === true ? 'text-emerald-600' : trend.up === false ? 'text-red-500' : 'text-muted-foreground'}`}
          >
            {trend.up === true ? (
              <ArrowUpRight size={13} />
            ) : trend.up === false ? (
              <ArrowDownRight size={13} />
            ) : (
              <Minus size={13} />
            )}
            {trend.value}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  icon: Icon,
  count,
  action,
}: {
  title: string;
  icon: React.ElementType;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-primary" />
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {count !== undefined && (
          <span className="text-xs font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

const auditActionConfig: Record<string, { label: string; icon: React.ElementType; color: string }> =
  {
    tenant_suspended: { label: 'Tenant suspenso', icon: Ban, color: 'text-red-500' },
    plan_changed: { label: 'Plano alterado', icon: CreditCard, color: 'text-blue-500' },
    webhook_retried: { label: 'Webhook reenviado', icon: RefreshCw, color: 'text-amber-500' },
    security_reviewed: { label: 'Alerta revisado', icon: Shield, color: 'text-purple-500' },
    support_opened: { label: 'Suporte aberto', icon: Headphones, color: 'text-teal-500' },
    billing_updated: { label: 'Cobrança atualizada', icon: CreditCard, color: 'text-emerald-500' },
    tenant_created: { label: 'Tenant criado', icon: Building2, color: 'text-emerald-500' },
    integration_reconnected: {
      label: 'Integração reconectada',
      icon: Link2,
      color: 'text-blue-500',
    },
  };

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function AdminContent({ initialSection = 'overview' }: { initialSection?: string }) {
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(initialSection);
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantStatusFilter, setTenantStatusFilter] = useState('all');
  const [tenantPlanFilter, setTenantPlanFilter] = useState('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(t);
  }, []);

  const filteredTenants = mockTenants.filter((t) => {
    const matchSearch =
      !tenantSearch ||
      t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.owner.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.email.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.id.toLowerCase().includes(tenantSearch.toLowerCase());
    const matchStatus = tenantStatusFilter === 'all' || t.status === tenantStatusFilter;
    const matchPlan = tenantPlanFilter === 'all' || t.plan === tenantPlanFilter;
    return matchSearch && matchStatus && matchPlan;
  });

  const totalMrr = mockTenants.reduce((s, t) => s + t.mrr, 0);
  const activeTenants = mockTenants.filter((t) => t.status === 'active').length;
  const trialTenants = mockTenants.filter((t) => t.status === 'trial').length;
  const suspendedTenants = mockTenants.filter((t) => t.status === 'suspended').length;
  const totalStorage = mockTenants.reduce((s, t) => s + t.storage, 0);

  const navItems = [
    { key: 'overview', label: 'Visão Geral', icon: LayoutDashboardIcon },
    { key: 'tenants', label: 'Tenants', icon: Building2, href: '/admin/tenants' },
    { key: 'financial', label: 'Financeiro', icon: TrendingUp, href: '/admin/billing' },
    { key: 'usage', label: 'Uso & Métricas', icon: Activity },
    { key: 'storage', label: 'Armazenamento', icon: HardDrive },
    { key: 'integrations', label: 'Integrações', icon: Link2, href: '/admin/integrations' },
    { key: 'webhooks', label: 'Webhooks', icon: Webhook, href: '/admin/webhooks' },
    { key: 'security', label: 'Segurança', icon: Shield, href: '/admin/security' },
    { key: 'support', label: 'Suporte', icon: Headphones, href: '/admin/support' },
    { key: 'audit', label: 'Auditoria', icon: ClipboardList, href: '/admin/audit' },
  ];

  if (loading) {
    return (
      <div className="flex h-screen bg-background">
        <div className="w-56 bg-card border-r border-border flex-shrink-0" />
        <div className="flex-1 p-8">
          <div className="h-8 w-64 bg-muted rounded-xl animate-pulse mb-8" />
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-muted rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Admin Sidebar */}
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
            const active = activeSection === item.key;
            const itemHref = (item as { href?: string }).href;
            const sharedClass = `relative w-full flex items-center rounded-xl transition-all duration-150 group ${sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-primary/8 hover:text-primary'}`;
            const inner = (
              <>
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
              </>
            );
            return itemHref ? (
              <a
                key={item.key}
                href={itemHref}
                title={sidebarCollapsed ? item.label : undefined}
                className={sharedClass}
              >
                {inner}
              </a>
            ) : (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                title={sidebarCollapsed ? item.label : undefined}
                className={sharedClass}
              >
                {inner}
              </button>
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
          <div>
            <h1 className="text-base font-bold text-foreground">SaaS Owner Dashboard</h1>
            <p className="text-xs text-muted-foreground">Painel de controle da plataforma</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
              {new Date().toLocaleDateString('pt-BR', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
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
          {activeSection === 'overview' && (
            <OverviewSection
              totalMrr={totalMrr}
              activeTenants={activeTenants}
              trialTenants={trialTenants}
              suspendedTenants={suspendedTenants}
              totalStorage={totalStorage}
            />
          )}
          {activeSection === 'tenants' && (
            <TenantsSection
              tenants={filteredTenants}
              search={tenantSearch}
              setSearch={setTenantSearch}
              statusFilter={tenantStatusFilter}
              setStatusFilter={setTenantStatusFilter}
              planFilter={tenantPlanFilter}
              setPlanFilter={setTenantPlanFilter}
            />
          )}
          {activeSection === 'financial' && <FinancialSection totalMrr={totalMrr} />}
          {activeSection === 'usage' && <UsageSection />}
          {activeSection === 'storage' && <StorageSection totalStorage={totalStorage} />}
          {activeSection === 'integrations' && <IntegrationsSection />}
          {activeSection === 'webhooks' && <WebhooksSection />}
          {activeSection === 'security' && <SecuritySection />}
          {activeSection === 'support' && <SupportSection />}
          {activeSection === 'audit' && <AuditSection />}
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

// ─── OVERVIEW SECTION ─────────────────────────────────────────────────────────

function OverviewSection({
  totalMrr,
  activeTenants,
  trialTenants,
  suspendedTenants,
  totalStorage,
}: {
  totalMrr: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  totalStorage: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Visão Geral da Plataforma</h2>
        <p className="text-sm text-muted-foreground">Resumo operacional e financeiro do SaaS</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={Building2}
          label="Total de Tenants"
          value={String(mockTenants.length)}
          sub="Todas as contas"
          color="teal"
        />
        <KpiCard
          icon={CheckCircle}
          label="Clínicas Ativas"
          value={String(activeTenants)}
          trend={{ value: '+2 este mês', up: true }}
          color="emerald"
        />
        <KpiCard
          icon={Clock}
          label="Em Trial"
          value={String(trialTenants)}
          sub="Conversão pendente"
          color="blue"
        />
        <KpiCard
          icon={Ban}
          label="Suspensos"
          value={String(suspendedTenants)}
          sub="Requer atenção"
          color="red"
        />
        <KpiCard
          icon={TrendingUp}
          label="MRR"
          value={`R$ ${totalMrr.toLocaleString('pt-BR')}`}
          trend={{ value: '+8,5%', up: true }}
          color="teal"
        />
        <KpiCard
          icon={BarChart2}
          label="ARR Estimado"
          value={`R$ ${(totalMrr * 12).toLocaleString('pt-BR')}`}
          sub="Projeção anual"
          color="emerald"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Risco de Churn"
          value="2"
          sub="Inadimplentes + inativos"
          color="amber"
        />
        <KpiCard
          icon={Users}
          label="Novos este mês"
          value="2"
          trend={{ value: 'vs 1 mês ant.', up: true }}
          color="purple"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-base p-5">
          <SectionHeader title="Crescimento MRR" icon={TrendingUp} />
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={mrrGrowthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR')}`, 'MRR']} />
              <Line
                type="monotone"
                dataKey="mrr"
                stroke="#0d9488"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#0d9488' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card-base p-5">
          <SectionHeader title="Receita por Plano" icon={CreditCard} />
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={revenueByPlanData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                paddingAngle={3}
              >
                {revenueByPlanData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR')}`, '']} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alerts summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-base p-5">
          <SectionHeader
            title="Alertas de Segurança"
            icon={Shield}
            count={securityAlerts.filter((a) => !a.resolved).length}
          />
          <div className="space-y-2">
            {securityAlerts
              .filter((a) => !a.resolved)
              .slice(0, 3)
              .map((alert) => (
                <div key={alert.id} className="flex items-start gap-2 p-2 rounded-xl bg-muted/50">
                  <AlertTriangle size={13} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {alert.description}
                    </p>
                    <p className="text-xs text-muted-foreground">{alert.tenant}</p>
                  </div>
                  <SeverityBadge severity={alert.severity} />
                </div>
              ))}
          </div>
        </div>
        <div className="card-base p-5">
          <SectionHeader title="Erros de Webhook" icon={Webhook} count={webhookErrors.length} />
          <div className="space-y-2">
            {webhookErrors.slice(0, 3).map((wh) => (
              <div key={wh.id} className="flex items-start gap-2 p-2 rounded-xl bg-muted/50">
                <XCircle size={13} className="text-red-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{wh.event}</p>
                  <p className="text-xs text-muted-foreground truncate">{wh.tenant}</p>
                </div>
                <SeverityBadge severity={wh.severity} />
              </div>
            ))}
          </div>
        </div>
        <div className="card-base p-5">
          <SectionHeader
            title="Suporte Ativo"
            icon={Headphones}
            count={supportSessions.filter((s) => s.status === 'open').length}
          />
          <div className="space-y-2">
            {supportSessions
              .filter((s) => s.status === 'open')
              .map((s) => (
                <div key={s.id} className="flex items-start gap-2 p-2 rounded-xl bg-muted/50">
                  <MessageSquare size={13} className="text-primary mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{s.subject}</p>
                    <p className="text-xs text-muted-foreground">{s.tenant}</p>
                  </div>
                  <span
                    className={`text-xs font-medium px-1.5 py-0.5 rounded-full border ${s.priority === 'urgente' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
                  >
                    {s.priority}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Recently suspended */}
      <div className="card-base p-5">
        <SectionHeader title="Tenants Recentemente Suspensos" icon={Ban} />
        {mockTenants.filter((t) => t.status === 'suspended' || t.status === 'cancelled').length ===
        0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum tenant suspenso recentemente.
          </p>
        ) : (
          <div className="space-y-2">
            {mockTenants
              .filter((t) => t.status === 'suspended' || t.status === 'cancelled')
              .map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                  <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Building2 size={14} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.owner} · {t.email}
                    </p>
                  </div>
                  <TenantStatusBadge status={t.status} />
                  <BillingBadge billing={t.billing} />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TENANTS SECTION ──────────────────────────────────────────────────────────

function TenantsSection({
  tenants,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  planFilter,
  setPlanFilter,
}: {
  tenants: typeof mockTenants;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  planFilter: string;
  setPlanFilter: (v: string) => void;
}) {
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Gerenciamento de Tenants</h2>
        <p className="text-sm text-muted-foreground">{tenants.length} tenant(s) encontrado(s)</p>
      </div>

      {/* Filters */}
      <div className="card-base p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Buscar por nome, email, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-8 py-1.5 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-base py-1.5 text-sm w-auto min-w-32"
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspenso</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="input-base py-1.5 text-sm w-auto min-w-32"
        >
          <option value="all">Todos os planos</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <button className="btn-secondary py-1.5 text-xs gap-1.5">
          <Filter size={13} /> Mais filtros
        </button>
      </div>

      {/* Table */}
      <div className="card-base overflow-hidden">
        {tenants.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 size={32} className="text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum tenant encontrado</p>
            <p className="text-xs text-muted-foreground">Tente ajustar os filtros de busca</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {[
                    'Tenant',
                    'Plano',
                    'Status',
                    'Clínicas',
                    'Usuários',
                    'MRR',
                    'Storage',
                    'Cobrança',
                    'Última Atividade',
                    'Ações',
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 size={13} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate max-w-36">
                            {t.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-36">
                            {t.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium capitalize text-foreground">
                        {t.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TenantStatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-center font-medium text-foreground">
                      {t.clinics}
                    </td>
                    <td className="px-4 py-3 text-xs text-center font-medium text-foreground">
                      {t.users}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-foreground tabular-nums">
                      {t.mrr > 0 ? `R$ ${t.mrr.toLocaleString('pt-BR')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                      {t.storage.toFixed(1)} GB
                    </td>
                    <td className="px-4 py-3">
                      <BillingBadge billing={t.billing} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {t.lastActivity}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <button
                          onClick={() => setActionMenu(actionMenu === t.id ? null : t.id)}
                          className="btn-ghost p-1.5"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {actionMenu === t.id && (
                          <div className="absolute right-0 top-full mt-1 w-52 bg-card border border-border rounded-xl shadow-lg z-20 py-1">
                            {[
                              { icon: Eye, label: 'Ver tenant', color: 'text-foreground' },
                              {
                                icon: t.status === 'suspended' ? Play : Pause,
                                label: t.status === 'suspended' ? 'Reativar' : 'Suspender',
                                color:
                                  t.status === 'suspended' ? 'text-emerald-600' : 'text-red-500',
                              },
                              { icon: Headphones, label: 'Abrir suporte', color: 'text-primary' },
                              { icon: BarChart2, label: 'Ver uso', color: 'text-blue-500' },
                              { icon: Link2, label: 'Ver integrações', color: 'text-purple-500' },
                            ].map((action) => (
                              <button
                                key={action.label}
                                onClick={() => setActionMenu(null)}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-muted transition-colors ${action.color}`}
                              >
                                <action.icon size={13} />
                                {action.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FINANCIAL SECTION ────────────────────────────────────────────────────────

function FinancialSection({ totalMrr }: { totalMrr: number }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Métricas Financeiras</h2>
        <p className="text-sm text-muted-foreground">
          Receita, assinaturas e saúde financeira do SaaS
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={TrendingUp}
          label="MRR"
          value={`R$ ${totalMrr.toLocaleString('pt-BR')}`}
          trend={{ value: '+8,5%', up: true }}
          color="teal"
        />
        <KpiCard
          icon={BarChart2}
          label="ARR"
          value={`R$ ${(totalMrr * 12).toLocaleString('pt-BR')}`}
          sub="Projeção anual"
          color="emerald"
        />
        <KpiCard
          icon={CheckCircle}
          label="Assinaturas Ativas"
          value="5"
          trend={{ value: '+1 este mês', up: true }}
          color="blue"
        />
        <KpiCard
          icon={Activity}
          label="Conversão Trial"
          value="67%"
          sub="2 de 3 trials"
          color="purple"
        />
        <KpiCard icon={XCircle} label="Pagamentos Falhos" value="1" sub="Último mês" color="red" />
        <KpiCard
          icon={AlertTriangle}
          label="Faturas Vencidas"
          value="1"
          sub="R$ 290 em aberto"
          color="amber"
        />
        <KpiCard icon={Ban} label="Cancelamentos" value="1" sub="Último trimestre" color="slate" />
        <KpiCard
          icon={ArrowUpRight}
          label="Crescimento MoM"
          value="+8,5%"
          trend={{ value: 'vs 6,2% mês ant.', up: true }}
          color="teal"
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-base p-5">
          <SectionHeader title="Crescimento MRR — 7 meses" icon={TrendingUp} />
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={mrrGrowthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR')}`, 'MRR']} />
              <Line
                type="monotone"
                dataKey="mrr"
                stroke="#0d9488"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#0d9488' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card-base p-5">
          <SectionHeader title="Receita por Plano" icon={CreditCard} />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueByPlanData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v) => `R$${v}`}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: '#64748b' }}
                width={80}
              />
              <Tooltip formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR')}`, 'MRR']} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {revenueByPlanData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── USAGE SECTION ────────────────────────────────────────────────────────────

function UsageSection() {
  const usageMetrics = [
    { icon: Globe, label: 'Requisições API (hoje)', value: '86.900', color: 'teal' },
    { icon: Users, label: 'Usuários Ativos', value: '91', color: 'emerald' },
    { icon: Activity, label: 'Consultas Criadas (mês)', value: '1.240', color: 'blue' },
    { icon: FileText, label: 'Documentos Gerados (mês)', value: '387', color: 'purple' },
    { icon: MessageSquare, label: 'Mensagens Enviadas (mês)', value: '4.820', color: 'teal' },
    { icon: Webhook, label: 'Eventos Webhook (mês)', value: '12.450', color: 'amber' },
    { icon: Link2, label: 'Integrações Conectadas', value: '23', color: 'emerald' },
    { icon: HardDrive, label: 'Storage Total', value: '148,1 GB', color: 'slate' },
  ];

  const usageByTenant = mockTenants
    .filter((t) => t.status === 'active')
    .map((t) => ({
      name: t.name.length > 20 ? t.name.slice(0, 20) + '…' : t.name,
      requests: Math.floor(Math.random() * 20000 + 5000),
      users: t.users,
      storage: t.storage,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Métricas de Uso da Plataforma</h2>
        <p className="text-sm text-muted-foreground">
          Dados agregados de uso — sem informações clínicas de pacientes
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {usageMetrics.map((m) => (
          <KpiCard
            key={m.label}
            icon={m.icon}
            label={m.label}
            value={m.value}
            color={m.color as 'teal' | 'emerald' | 'blue' | 'purple' | 'amber' | 'slate'}
          />
        ))}
      </div>
      <div className="card-base p-5">
        <SectionHeader title="Requisições API — Últimos 7 dias" icon={Globe} />
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={apiRequestsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip formatter={(v: number) => [v.toLocaleString('pt-BR'), 'Requisições']} />
            <Bar dataKey="requests" fill="#0d9488" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card-base p-5">
        <SectionHeader title="Uso por Tenant" icon={Building2} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Tenant', 'Usuários', 'Storage (GB)', 'Status'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-muted-foreground px-3 py-2"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mockTenants.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 text-xs font-medium text-foreground">{t.name}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{t.users}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full max-w-24">
                        <div
                          className="h-1.5 bg-primary rounded-full"
                          style={{ width: `${Math.min((t.storage / 100) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {t.storage.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <TenantStatusBadge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── STORAGE SECTION ──────────────────────────────────────────────────────────

function StorageSection({ totalStorage }: { totalStorage: number }) {
  const storageLimit = 500;
  const usagePercent = (totalStorage / storageLimit) * 100;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Monitoramento de Armazenamento</h2>
        <p className="text-sm text-muted-foreground">
          Uso de storage por tenant e por tipo — sem conteúdo de documentos
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={HardDrive}
          label="Storage Total Usado"
          value={`${totalStorage.toFixed(1)} GB`}
          sub={`de ${storageLimit} GB`}
          color="teal"
        />
        <KpiCard
          icon={Activity}
          label="Uso da Plataforma"
          value={`${usagePercent.toFixed(1)}%`}
          sub="Capacidade total"
          color={usagePercent > 80 ? 'red' : 'emerald'}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Próximos do Limite"
          value="1"
          sub="Longevidade Clínica"
          color="amber"
        />
        <KpiCard
          icon={AlertCircle}
          label="Crescimento Anormal"
          value="0"
          sub="Nenhum alerta"
          color="emerald"
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-base p-5">
          <SectionHeader title="Storage por Tipo" icon={Database} />
          <div className="space-y-3 mt-2">
            {storageByType.map((s) => (
              <div key={s.type} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24 flex-shrink-0">{s.type}</span>
                <div className="flex-1 h-2 bg-muted rounded-full">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${(s.gb / totalStorage) * 100}%`, backgroundColor: s.color }}
                  />
                </div>
                <span className="text-xs font-semibold text-foreground tabular-nums w-16 text-right">
                  {s.gb.toFixed(1)} GB
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card-base p-5">
          <SectionHeader title="Storage por Tenant" icon={Building2} />
          <div className="space-y-3 mt-2">
            {mockTenants
              .filter((t) => t.storage > 0)
              .sort((a, b) => b.storage - a.storage)
              .map((t) => {
                const pct = (t.storage / 100) * 100;
                const isHigh = t.storage > 60;
                return (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground truncate w-36 flex-shrink-0">
                      {t.name}
                    </span>
                    <div className="flex-1 h-2 bg-muted rounded-full">
                      <div
                        className={`h-2 rounded-full transition-all ${isHigh ? 'bg-amber-400' : 'bg-primary'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-foreground tabular-nums w-16 text-right">
                      {t.storage.toFixed(1)} GB
                    </span>
                    {isHigh && <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── INTEGRATIONS SECTION ─────────────────────────────────────────────────────

function IntegrationsSection() {
  const integrations = [
    { name: 'Asaas (Pagamentos)', icon: CreditCard, tenants: 5, errors: 1, status: 'partial' },
    { name: 'D4Sign (Documentos)', icon: FileText, tenants: 4, errors: 1, status: 'partial' },
    { name: 'WhatsApp Business', icon: MessageSquare, tenants: 6, errors: 1, status: 'partial' },
    { name: 'Google Calendar', icon: Activity, tenants: 3, errors: 1, status: 'partial' },
    { name: 'AWS S3 (Storage)', icon: HardDrive, tenants: 8, errors: 0, status: 'ok' },
    { name: 'SendGrid (Email)', icon: Globe, tenants: 8, errors: 0, status: 'ok' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Saúde das Integrações</h2>
        <p className="text-sm text-muted-foreground">
          Status de conectores por tenant e erros de sincronização
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((intg) => (
          <div key={intg.name} className="card-base p-4">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${intg.status === 'ok' ? 'bg-emerald-50' : 'bg-amber-50'}`}
              >
                <intg.icon
                  size={16}
                  className={intg.status === 'ok' ? 'text-emerald-600' : 'text-amber-600'}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{intg.name}</p>
                <p className="text-xs text-muted-foreground">{intg.tenants} tenants conectados</p>
              </div>
              {intg.status === 'ok' ? (
                <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
              ) : (
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
              )}
            </div>
            {intg.errors > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5">
                <XCircle size={12} />
                {intg.errors} erro(s) ativo(s)
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="card-base p-5">
        <SectionHeader
          title="Erros de Integração Ativos"
          icon={AlertTriangle}
          count={integrationErrors.length}
        />
        {integrationErrors.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <CheckCircle size={28} className="text-emerald-400" />
            <p className="text-sm text-muted-foreground">Nenhum erro de integração ativo</p>
          </div>
        ) : (
          <div className="space-y-3">
            {integrationErrors.map((err) => (
              <div
                key={err.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border"
              >
                <AlertCircle
                  size={15}
                  className={
                    err.severity === 'critico' ? 'text-red-500 mt-0.5' : 'text-amber-500 mt-0.5'
                  }
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">{err.integration}</span>
                    <SeverityBadge severity={err.severity} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{err.error}</p>
                  <p className="text-xs text-muted-foreground">
                    Tenant: {err.tenant} · Último sync: {err.lastSync}
                  </p>
                </div>
                <button className="btn-ghost p-1.5 text-xs gap-1">
                  <RefreshCw size={12} /> Retry
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WEBHOOKS SECTION ─────────────────────────────────────────────────────────

function WebhooksSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Monitoramento de Webhooks</h2>
        <p className="text-sm text-muted-foreground">
          Eventos, falhas, retentativas e dead-letters
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Zap} label="Total de Eventos (mês)" value="12.450" color="teal" />
        <KpiCard
          icon={CheckCircle}
          label="Eventos com Sucesso"
          value="12.445"
          trend={{ value: '99,96%', up: true }}
          color="emerald"
        />
        <KpiCard icon={XCircle} label="Eventos Falhos" value="5" color="red" />
        <KpiCard icon={Clock} label="Retentativas Pendentes" value="3" color="amber" />
        <KpiCard
          icon={Ban}
          label="Dead-lettered"
          value="2"
          sub="Sem mais retentativas"
          color="red"
        />
        <KpiCard
          icon={Activity}
          label="Taxa de Erro"
          value="0,04%"
          trend={{ value: 'vs 0,12% mês ant.', up: true }}
          color="emerald"
        />
        <KpiCard
          icon={RefreshCw}
          label="Fila de Retry"
          value="3"
          sub="Próxima em 5 min"
          color="blue"
        />
        <KpiCard icon={Globe} label="Endpoints Ativos" value="18" color="teal" />
      </div>
      <div className="card-base p-5">
        <SectionHeader
          title="Falhas Recentes de Webhook"
          icon={XCircle}
          count={webhookErrors.length}
        />
        {webhookErrors.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <CheckCircle size={28} className="text-emerald-400" />
            <p className="text-sm text-muted-foreground">Nenhuma falha de webhook</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {[
                    'ID',
                    'Tenant',
                    'Evento',
                    'Erro',
                    'Severidade',
                    'Retentativas',
                    'Status',
                    'Timestamp',
                    'Ação',
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {webhookErrors.map((wh) => (
                  <tr
                    key={wh.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{wh.id}</td>
                    <td className="px-3 py-2.5 text-xs font-medium text-foreground whitespace-nowrap">
                      {wh.tenant}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-primary">{wh.event}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-48 truncate">
                      {wh.error}
                    </td>
                    <td className="px-3 py-2.5">
                      <SeverityBadge severity={wh.severity} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-center text-muted-foreground">
                      {wh.retries}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border ${wh.status === 'dead_letter' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
                      >
                        {wh.status === 'dead_letter' ? 'Dead Letter' : 'Pendente'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {wh.timestamp}
                    </td>
                    <td className="px-3 py-2.5">
                      <button className="btn-ghost p-1.5 text-xs gap-1">
                        <RefreshCw size={11} /> Retry
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SECURITY SECTION ─────────────────────────────────────────────────────────

function SecuritySection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Segurança e Conformidade</h2>
        <p className="text-sm text-muted-foreground">
          Alertas de segurança, acessos suspeitos e ações administrativas
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={XCircle}
          label="Logins Falhos (24h)"
          value="52"
          trend={{ value: '+47 em 10min', up: false }}
          color="red"
        />
        <KpiCard icon={AlertTriangle} label="Acessos Suspeitos" value="1" color="amber" />
        <KpiCard icon={Shield} label="Escaladas Bloqueadas" value="1" color="purple" />
        <KpiCard
          icon={Ban}
          label="Requisições Bloqueadas"
          value="8.200"
          sub="Abuso de API"
          color="red"
        />
      </div>
      <div className="card-base p-5">
        <SectionHeader
          title="Alertas de Segurança Ativos"
          icon={Shield}
          count={securityAlerts.filter((a) => !a.resolved).length}
        />
        {securityAlerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <CheckCircle size={28} className="text-emerald-400" />
            <p className="text-sm text-muted-foreground">Nenhum alerta de segurança ativo</p>
          </div>
        ) : (
          <div className="space-y-3">
            {securityAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-3 p-3 rounded-xl border ${alert.resolved ? 'bg-muted/20 border-border opacity-60' : 'bg-red-50/30 border-red-100'}`}
              >
                <AlertTriangle
                  size={15}
                  className={`mt-0.5 flex-shrink-0 ${alert.resolved ? 'text-muted-foreground' : 'text-red-500'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">
                      {alert.description}
                    </span>
                    <SeverityBadge severity={alert.severity} />
                    {alert.resolved && (
                      <span className="text-xs text-emerald-600 font-medium">Resolvido</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tenant: {alert.tenant} · {alert.timestamp}
                  </p>
                </div>
                {!alert.resolved && (
                  <button className="btn-ghost p-1.5 text-xs gap-1 flex-shrink-0">
                    <CheckCircle size={12} /> Revisar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card-base p-5">
        <SectionHeader title="Atalhos de Auditoria" icon={ClipboardList} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Log de Acessos Admin', icon: User },
            { label: 'Ações em Tenants', icon: Building2 },
            { label: 'Alterações de Plano', icon: CreditCard },
            { label: 'Eventos de Segurança', icon: Shield },
          ].map((item) => (
            <button
              key={item.label}
              className="flex items-center gap-2 p-3 rounded-xl border border-border hover:bg-muted transition-colors text-left"
            >
              <item.icon size={14} className="text-primary flex-shrink-0" />
              <span className="text-xs font-medium text-foreground">{item.label}</span>
              <ExternalLink size={11} className="ml-auto text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SUPPORT SECTION ──────────────────────────────────────────────────────────

function SupportSection() {
  const statusConfig: Record<string, { label: string; classes: string }> = {
    open: { label: 'Aberto', classes: 'bg-red-50 text-red-700 border-red-200' },
    pending: { label: 'Pendente', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
    resolved: { label: 'Resolvido', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Sessões de Suporte</h2>
        <p className="text-sm text-muted-foreground">Atendimentos ativos e histórico recente</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={Headphones}
          label="Sessões Ativas"
          value={String(supportSessions.filter((s) => s.status === 'open').length)}
          color="red"
        />
        <KpiCard
          icon={Clock}
          label="Pendentes"
          value={String(supportSessions.filter((s) => s.status === 'pending').length)}
          color="amber"
        />
        <KpiCard
          icon={CheckCircle}
          label="Resolvidas (mês)"
          value={String(supportSessions.filter((s) => s.status === 'resolved').length)}
          color="emerald"
        />
        <KpiCard icon={Users} label="Admins de Suporte" value="2" color="blue" />
      </div>
      <div className="card-base p-5">
        <SectionHeader
          title="Todas as Sessões"
          icon={Headphones}
          count={supportSessions.length}
          action={
            <button className="btn-primary py-1.5 text-xs gap-1.5">
              <Play size={12} /> Nova Sessão
            </button>
          }
        />
        <div className="space-y-3">
          {supportSessions.map((session) => {
            const sc = statusConfig[session.status] ?? {
              label: session.status,
              classes: 'bg-slate-100 text-slate-600 border-slate-200',
            };
            return (
              <div
                key={session.id}
                className="flex items-start gap-3 p-4 rounded-xl border border-border hover:bg-muted/20 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Headphones size={15} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{session.subject}</span>
                    <span
                      className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${sc.classes}`}
                    >
                      {sc.label}
                    </span>
                    <span
                      className={`text-xs font-medium px-1.5 py-0.5 rounded-full border ${session.priority === 'urgente' ? 'bg-red-50 text-red-700 border-red-200' : session.priority === 'alto' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}
                    >
                      {session.priority}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {session.tenant} ·{' '}
                    {session.assignedTo ? `Atribuído: ${session.assignedTo}` : 'Sem atribuição'} ·
                    Última atividade: {session.lastActivity}
                  </p>
                </div>
                {session.status !== 'resolved' && (
                  <button className="btn-primary py-1.5 text-xs gap-1 flex-shrink-0">
                    <MessageSquare size={12} /> Abrir
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── AUDIT SECTION ────────────────────────────────────────────────────────────

function AuditSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Log de Auditoria</h2>
        <p className="text-sm text-muted-foreground">
          Ações recentes realizadas por administradores da plataforma
        </p>
      </div>
      <div className="card-base p-5">
        <SectionHeader
          title="Ações Recentes"
          icon={ClipboardList}
          count={auditLog.length}
          action={
            <button className="btn-secondary py-1.5 text-xs gap-1.5">
              <Download size={12} /> Exportar
            </button>
          }
        />
        {auditLog.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <ClipboardList size={28} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhuma ação registrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {auditLog.map((entry) => {
              const cfg = auditActionConfig[entry.action] ?? {
                label: entry.action,
                icon: Info,
                color: 'text-muted-foreground',
              };
              const EntryIcon = cfg.icon;
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/30 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    <EntryIcon size={13} className={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{cfg.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-muted-foreground">{entry.admin}</p>
                    <p className="text-xs text-muted-foreground">{entry.timestamp}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
