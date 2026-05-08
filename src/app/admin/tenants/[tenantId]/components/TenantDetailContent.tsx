'use client';

import React, { useState, useEffect } from 'react';
import { Building2, User, LogOut, Bell, ChevronRight, ArrowLeft, CheckCircle, XCircle, Clock, Ban, CreditCard, Activity, Users, MapPin, Webhook, Shield, Headphones, ClipboardList, RefreshCw, Link2, AlertTriangle, ExternalLink, ToggleLeft, ToggleRight, Key, Zap, HardDrive, BarChart2, Calendar, Mail, Phone, Globe, Hash, AlertCircle, Lock, Unlock, MessageSquare, Info } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { useParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';


// ─── MOCK DATA ────────────────────────────────────────────────────────────────

interface TenantDetail {
  id: string;
  clinicName: string;
  owner: string;
  email: string;
  phone: string;
  website: string;
  cnpj: string;
  plan: 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'trial' | 'suspended' | 'cancelled';
  createdAt: string;
  lastActivityAt: string;
  trialEndsAt?: string;
  // Billing
  saasSubscriptionStatus: 'active' | 'trial' | 'past_due' | 'cancelled' | 'paused';
  mrr: number;
  nextBillingDate: string;
  paymentMethod: string;
  // Integrations
  asaasSubaccountStatus: 'active' | 'pending' | 'blocked' | 'not_configured';
  asaasAccountId: string;
  d4signStatus: 'active' | 'quota_exceeded' | 'error' | 'not_configured';
  d4signDocsUsed: number;
  d4signDocsLimit: number;
  // Usage
  users: number;
  usersLimit: number;
  patients: number;
  storageUsedGb: number;
  storageCapacityGb: number;
  apiCallsThisMonth: number;
  apiLimitMonthly: number;
  appointmentsThisMonth: number;
  // Features
  featureFlags: {
    programs: boolean;
    builder: boolean;
    whatsapp: boolean;
    aiAssistant: boolean;
    customDomain: boolean;
    advancedReports: boolean;
    multiUnit: boolean;
    apiAccess: boolean;
  };
}

interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  lastLogin: string;
  mfaEnabled: boolean;
}

interface TenantUnit {
  id: string;
  name: string;
  city: string;
  state: string;
  status: 'active' | 'inactive';
  users: number;
  patients: number;
}

interface AuditEntry {
  id: string;
  action: string;
  description: string;
  admin: string;
  timestamp: string;
  category: 'billing' | 'security' | 'config' | 'support' | 'integration';
}

interface WebhookError {
  id: string;
  event: string;
  error: string;
  severity: 'critico' | 'alto' | 'medio';
  timestamp: string;
  retries: number;
  status: 'pending' | 'dead_letter' | 'resolved';
}

interface SupportSession {
  id: string;
  status: 'open' | 'pending' | 'resolved';
  priority: 'urgente' | 'alto' | 'medio' | 'baixo';
  subject: string;
  assignedTo: string | null;
  openedAt: string;
  lastActivity: string;
}

interface BreakGlassRequest {
  id: string;
  requestedBy: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  requestedAt: string;
  approvedBy?: string;
  expiresAt?: string;
  scope: string;
}

// ─── MOCK TENANT DATA ─────────────────────────────────────────────────────────

const mockTenantDetails: Record<string, TenantDetail> = {
  T001: {
    id: 'T001', clinicName: 'Clínica Corpo & Saúde', owner: 'Dr. Ricardo Alves',
    email: 'ricardo@corposaude.com.br', phone: '+55 11 99234-5678',
    website: 'corposaude.com.br', cnpj: '12.345.678/0001-90',
    plan: 'enterprise', status: 'active', createdAt: '2025-01-15', lastActivityAt: '2026-05-07',
    saasSubscriptionStatus: 'active', mrr: 1490, nextBillingDate: '2026-06-15', paymentMethod: 'Cartão •••• 4242',
    asaasSubaccountStatus: 'active', asaasAccountId: 'ASS-00123',
    d4signStatus: 'active', d4signDocsUsed: 48, d4signDocsLimit: 200,
    users: 28, usersLimit: 50, patients: 412,
    storageUsedGb: 42.3, storageCapacityGb: 100,
    apiCallsThisMonth: 84200, apiLimitMonthly: 200000, appointmentsThisMonth: 318,
    featureFlags: { programs: true, builder: true, whatsapp: true, aiAssistant: true, customDomain: true, advancedReports: true, multiUnit: true, apiAccess: true },
  },
  T002: {
    id: 'T002', clinicName: 'NutriVita Clínicas', owner: 'Dra. Camila Torres',
    email: 'camila@nutrivita.com.br', phone: '+55 21 98765-4321',
    website: 'nutrivita.com.br', cnpj: '98.765.432/0001-10',
    plan: 'professional', status: 'active', createdAt: '2025-03-20', lastActivityAt: '2026-05-07',
    saasSubscriptionStatus: 'active', mrr: 790, nextBillingDate: '2026-06-20', paymentMethod: 'Boleto',
    asaasSubaccountStatus: 'active', asaasAccountId: 'ASS-00456',
    d4signStatus: 'quota_exceeded', d4signDocsUsed: 100, d4signDocsLimit: 100,
    users: 14, usersLimit: 25, patients: 198,
    storageUsedGb: 18.7, storageCapacityGb: 50,
    apiCallsThisMonth: 38100, apiLimitMonthly: 100000, appointmentsThisMonth: 156,
    featureFlags: { programs: true, builder: false, whatsapp: true, aiAssistant: false, customDomain: false, advancedReports: true, multiUnit: true, apiAccess: false },
  },
  T004: {
    id: 'T004', clinicName: 'Metabolic Health SP', owner: 'Dra. Ana Rodrigues',
    email: 'ana@metabolichealth.com.br', phone: '+55 11 97654-3210',
    website: 'metabolichealth.com.br', cnpj: '45.678.901/0001-23',
    plan: 'starter', status: 'active', createdAt: '2025-06-10', lastActivityAt: '2026-05-05',
    saasSubscriptionStatus: 'past_due', mrr: 290, nextBillingDate: '2026-05-10', paymentMethod: 'Cartão •••• 1234',
    asaasSubaccountStatus: 'blocked', asaasAccountId: 'ASS-00789',
    d4signStatus: 'error', d4signDocsUsed: 12, d4signDocsLimit: 30,
    users: 5, usersLimit: 10, patients: 67,
    storageUsedGb: 7.1, storageCapacityGb: 20,
    apiCallsThisMonth: 9200, apiLimitMonthly: 30000, appointmentsThisMonth: 42,
    featureFlags: { programs: false, builder: false, whatsapp: false, aiAssistant: false, customDomain: false, advancedReports: false, multiUnit: false, apiAccess: false },
  },
};

const defaultTenant: TenantDetail = mockTenantDetails['T001'];

const mockUsers: TenantUser[] = [
  { id: 'U001', name: 'Dr. Ricardo Alves', email: 'ricardo@corposaude.com.br', role: 'Administrador', status: 'active', lastLogin: '2026-05-07 19:30', mfaEnabled: true },
  { id: 'U002', name: 'Dra. Fernanda Lima', email: 'fernanda@corposaude.com.br', role: 'Médico', status: 'active', lastLogin: '2026-05-07 18:45', mfaEnabled: true },
  { id: 'U003', name: 'Nutr. Juliana Pires', email: 'juliana@corposaude.com.br', role: 'Nutricionista', status: 'active', lastLogin: '2026-05-07 17:00', mfaEnabled: false },
  { id: 'U004', name: 'Carlos Mendes', email: 'carlos@corposaude.com.br', role: 'Recepcionista', status: 'active', lastLogin: '2026-05-07 16:20', mfaEnabled: false },
  { id: 'U005', name: 'Patrícia Souza', email: 'patricia@corposaude.com.br', role: 'Coordenador', status: 'inactive', lastLogin: '2026-04-30 10:00', mfaEnabled: false },
];

const mockUnits: TenantUnit[] = [
  { id: 'UN001', name: 'Unidade Centro', city: 'São Paulo', state: 'SP', status: 'active', users: 12, patients: 180 },
  { id: 'UN002', name: 'Unidade Pinheiros', city: 'São Paulo', state: 'SP', status: 'active', users: 10, patients: 142 },
  { id: 'UN003', name: 'Unidade Moema', city: 'São Paulo', state: 'SP', status: 'active', users: 6, patients: 90 },
];

const mockAuditLogs: AuditEntry[] = [
  { id: 'A001', action: 'plan_changed', description: 'Plano migrado de Professional para Enterprise', admin: 'Admin Carlos', timestamp: '2026-05-02 14:30', category: 'billing' },
  { id: 'A002', action: 'feature_enabled', description: 'Feature "Builder de Programas" habilitada', admin: 'Admin Maria', timestamp: '2026-05-03 09:15', category: 'config' },
  { id: 'A003', action: 'support_opened', description: 'Sessão de suporte iniciada por Admin Carlos', admin: 'Admin Carlos', timestamp: '2026-05-04 11:00', category: 'support' },
  { id: 'A004', action: 'integration_reconnected', description: 'Integração Asaas reconectada com sucesso', admin: 'Admin Maria', timestamp: '2026-05-05 16:45', category: 'integration' },
  { id: 'A005', action: 'billing_updated', description: 'Fatura de Maio/2026 gerada — R$ 1.490,00', admin: 'Admin Sistema', timestamp: '2026-05-01 00:00', category: 'billing' },
  { id: 'A006', action: 'security_reviewed', description: 'Revisão de segurança: IP suspeito bloqueado', admin: 'Admin Carlos', timestamp: '2026-04-28 20:10', category: 'security' },
];

const mockWebhookErrors: WebhookError[] = [
  { id: 'WH001', event: 'payment.confirmed', error: 'Connection timeout após 30s', severity: 'alto', timestamp: '2026-05-07 19:42', retries: 2, status: 'pending' },
  { id: 'WH002', event: 'appointment.created', error: 'HTTP 502 Bad Gateway', severity: 'critico', timestamp: '2026-05-07 18:15', retries: 3, status: 'dead_letter' },
  { id: 'WH003', event: 'document.signed', error: 'Invalid payload schema', severity: 'medio', timestamp: '2026-05-06 17:30', retries: 1, status: 'resolved' },
];

const mockSupportSessions: SupportSession[] = [
  { id: 'SUP001', status: 'open', priority: 'alto', subject: 'Integração Asaas com falha intermitente', assignedTo: 'Admin Carlos', openedAt: '2026-05-07 14:00', lastActivity: '2026-05-07 20:05' },
  { id: 'SUP002', status: 'resolved', priority: 'medio', subject: 'Configuração de domínio personalizado', assignedTo: 'Admin Maria', openedAt: '2026-05-03 10:00', lastActivity: '2026-05-04 09:30' },
];

const mockBreakGlass: BreakGlassRequest[] = [
  { id: 'BG001', requestedBy: 'Admin Carlos', reason: 'Investigar falha crítica de integração reportada pelo cliente', status: 'approved', requestedAt: '2026-05-07 14:30', approvedBy: 'Admin Maria', expiresAt: '2026-05-07 16:30', scope: 'Leitura de logs e configurações de integração' },
  { id: 'BG002', requestedBy: 'Admin Maria', reason: 'Verificar configuração de faturamento após reclamação', status: 'expired', requestedAt: '2026-05-04 09:00', approvedBy: 'Admin Carlos', expiresAt: '2026-05-04 11:00', scope: 'Leitura de dados financeiros do tenant' },
  { id: 'BG003', requestedBy: 'Admin Carlos', reason: 'Diagnóstico de performance — usuário reportou lentidão', status: 'pending', requestedAt: '2026-05-08 08:00', scope: 'Leitura de métricas de uso e logs de API' },
];

// ─── BADGE COMPONENTS ─────────────────────────────────────────────────────────

function TenantStatusBadge({ status }: { status: TenantDetail['status'] }) {
  const config: Record<string, { label: string; classes: string; icon: React.ElementType }> = {
    active: { label: 'Ativo', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle },
    trial: { label: 'Trial', classes: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
    suspended: { label: 'Suspenso', classes: 'bg-red-50 text-red-700 border-red-200', icon: Ban },
    cancelled: { label: 'Cancelado', classes: 'bg-slate-100 text-slate-600 border-slate-200', icon: XCircle },
  };
  const c = config[status] ?? config.active;
  const IconComp = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border text-xs font-medium px-2.5 py-1 ${c.classes}`}>
      <IconComp size={11} />
      {c.label}
    </span>
  );
}

function PlanBadge({ plan }: { plan: TenantDetail['plan'] }) {
  const config: Record<string, { label: string; classes: string }> = {
    starter: { label: 'Starter', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
    professional: { label: 'Professional', classes: 'bg-violet-50 text-violet-700 border-violet-200' },
    enterprise: { label: 'Enterprise', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  };
  const c = config[plan] ?? config.starter;
  return <span className={`inline-flex items-center rounded-full border text-xs font-semibold px-2.5 py-1 ${c.classes}`}>{c.label}</span>;
}

function SaasBadge({ status }: { status: TenantDetail['saasSubscriptionStatus'] }) {
  const config: Record<string, { label: string; classes: string }> = {
    active: { label: 'Ativo', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    trial: { label: 'Trial', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
    past_due: { label: 'Vencido', classes: 'bg-red-50 text-red-700 border-red-200' },
    cancelled: { label: 'Cancelado', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
    paused: { label: 'Pausado', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  };
  const c = config[status] ?? config.active;
  return <span className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${c.classes}`}>{c.label}</span>;
}

function IntegrationStatusBadge({ status, label }: { status: string; label: string }) {
  const config: Record<string, { dot: string; text: string }> = {
    active: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
    pending: { dot: 'bg-amber-400', text: 'text-amber-700' },
    blocked: { dot: 'bg-red-500', text: 'text-red-700' },
    not_configured: { dot: 'bg-slate-300', text: 'text-slate-500' },
    quota_exceeded: { dot: 'bg-orange-500', text: 'text-orange-700' },
    error: { dot: 'bg-red-500', text: 'text-red-700' },
  };
  const c = config[status] ?? { dot: 'bg-slate-300', text: 'text-slate-500' };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
      <span className={`text-xs font-medium ${c.text}`}>{label}</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, string> = {
    critico: 'bg-red-50 text-red-700 border-red-200',
    alto: 'bg-orange-50 text-orange-700 border-orange-200',
    medio: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  const labels: Record<string, string> = { critico: 'Crítico', alto: 'Alto', medio: 'Médio' };
  return (
    <span className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${config[severity] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {labels[severity] ?? severity}
    </span>
  );
}

function UsageBar({ used, capacity, unit = '' }: { used: number; capacity: number; unit?: string }) {
  const pct = Math.min((used / capacity) * 100, 100);
  const color = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-400' : 'bg-teal-500';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground">{used}{unit}</span>
        <span className="text-muted-foreground">/ {capacity}{unit}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct.toFixed(0)}% utilizado</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, action }: { title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

const auditCategoryConfig: Record<string, { icon: React.ElementType; color: string }> = {
  billing: { icon: CreditCard, color: 'text-emerald-600' },
  security: { icon: Shield, color: 'text-red-500' },
  config: { icon: ToggleRight, color: 'text-blue-500' },
  support: { icon: Headphones, color: 'text-teal-500' },
  integration: { icon: Link2, color: 'text-violet-500' },
};

const breakGlassStatusConfig: Record<string, { label: string; classes: string }> = {
  pending: { label: 'Pendente', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Aprovado', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  denied: { label: 'Negado', classes: 'bg-red-50 text-red-700 border-red-200' },
  expired: { label: 'Expirado', classes: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const featureFlagMeta: { key: keyof TenantDetail['featureFlags']; label: string; icon: React.ElementType }[] = [
  { key: 'programs', label: 'Programas', icon: BarChart2 },
  { key: 'builder', label: 'Builder', icon: Zap },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { key: 'aiAssistant', label: 'IA Assistente', icon: Activity },
  { key: 'customDomain', label: 'Domínio Próprio', icon: Globe },
  { key: 'advancedReports', label: 'Relatórios Avançados', icon: BarChart2 },
  { key: 'multiUnit', label: 'Multi-Unidade', icon: MapPin },
  { key: 'apiAccess', label: 'Acesso à API', icon: Key },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function TenantDetailContent() {
  const params = useParams();
  const tenantId = params?.tenantId as string;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'units' | 'audit' | 'webhooks' | 'support' | 'breakglass'>('overview');

  const tenant = mockTenantDetails[tenantId] ?? defaultTenant;

  const navItems = [
    { key: 'overview', label: 'Visão Geral', href: '/admin', icon: Building2 },
    { key: 'tenants', label: 'Gestão de Tenants', href: '/admin/tenants', icon: Users },
  ];

  const tabs = [
    { key: 'overview', label: 'Visão Geral', icon: Activity },
    { key: 'users', label: 'Usuários', icon: Users, count: mockUsers.length },
    { key: 'units', label: 'Unidades', icon: MapPin, count: mockUnits.length },
    { key: 'audit', label: 'Auditoria', icon: ClipboardList, count: mockAuditLogs.length },
    { key: 'webhooks', label: 'Webhook Errors', icon: Webhook, count: mockWebhookErrors.filter(w => w.status !== 'resolved').length },
    { key: 'support', label: 'Suporte', icon: Headphones, count: mockSupportSessions.filter(s => s.status === 'open').length },
    { key: 'breakglass', label: 'Break-Glass', icon: Key, count: mockBreakGlass.filter(b => b.status === 'pending').length },
  ] as const;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={`flex flex-col bg-card border-r border-border flex-shrink-0 sidebar-transition ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
        <div className={`flex items-center border-b border-border py-4 ${sidebarCollapsed ? 'justify-center px-2' : 'gap-2 px-4'}`}>
          <AppLogo size={28} />
          {!sidebarCollapsed && (
            <div className="flex flex-col leading-none">
              <span className="font-bold text-xs text-foreground tracking-tight">SlimHiper</span>
              <span className="text-xs text-primary font-semibold">Admin</span>
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-0.5">
          {navItems.map(item => {
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
                {!sidebarCollapsed && <span className={`text-xs ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>}
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
            {sidebarCollapsed ? <ChevronRight size={14} /> : <><ChevronRight size={14} className="rotate-180" /> Recolher</>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center gap-3 px-6 py-3 bg-card border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <a href="/admin" className="hover:text-primary transition-colors">Admin</a>
            <ChevronRight size={12} />
            <a href="/admin/tenants" className="hover:text-primary transition-colors">Gestão de Tenants</a>
            <ChevronRight size={12} />
            <span className="text-foreground font-medium">{tenant.clinicName}</span>
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
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Page Header */}
          <div className="px-6 pt-6 pb-4 border-b border-border bg-card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <a href="/admin/tenants" className="mt-1 p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft size={16} />
                </a>
                <div>
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Building2 size={20} className="text-primary" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-foreground">{tenant.clinicName}</h1>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono">{tenant.id}</span>
                        <span className="text-muted-foreground">·</span>
                        <TenantStatusBadge status={tenant.status} />
                        <PlanBadge plan={tenant.plan} />
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground ml-14">
                    {tenant.owner} · {tenant.email} · Criado em {new Date(tenant.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-2">
                  <Ban size={13} className="text-red-500" />
                  Suspender
                </button>
                <button className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-2">
                  <CreditCard size={13} className="text-violet-600" />
                  Gerenciar Plano
                </button>
                <button className="btn-primary text-xs flex items-center gap-1.5 px-3 py-2">
                  <ExternalLink size={13} />
                  Abrir Tenant
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mt-5 overflow-x-auto scrollbar-thin">
              {tabs.map(tab => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as typeof activeTab)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                  >
                    <TabIcon size={13} />
                    {tab.label}
                    {'count' in tab && tab.count !== undefined && tab.count > 0 && (
                      <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${isActive ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && (
              <>
                {/* Profile + Plan + Billing row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Tenant Profile */}
                  <SectionCard title="Perfil do Tenant" icon={Building2}>
                    <div className="space-y-3">
                      {[
                        { icon: User, label: 'Proprietário', value: tenant.owner },
                        { icon: Mail, label: 'E-mail', value: tenant.email },
                        { icon: Phone, label: 'Telefone', value: tenant.phone },
                        { icon: Globe, label: 'Website', value: tenant.website },
                        { icon: Hash, label: 'CNPJ', value: tenant.cnpj },
                        { icon: Calendar, label: 'Criado em', value: new Date(tenant.createdAt).toLocaleDateString('pt-BR') },
                        { icon: Activity, label: 'Última atividade', value: new Date(tenant.lastActivityAt).toLocaleDateString('pt-BR') },
                      ].map(({ icon: FieldIcon, label, value }) => (
                        <div key={label} className="flex items-center gap-2.5">
                          {React.createElement(FieldIcon, { size: 13, className: "text-muted-foreground flex-shrink-0" })}
                          <span className="text-xs text-muted-foreground w-28 flex-shrink-0">{label}</span>
                          <span className="text-xs font-medium text-foreground truncate">{value}</span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  {/* SaaS Billing */}
                  <SectionCard title="Faturamento SaaS" icon={CreditCard}>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Status da assinatura</span>
                        <SaasBadge status={tenant.saasSubscriptionStatus} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Plano atual</span>
                        <PlanBadge plan={tenant.plan} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">MRR</span>
                        <span className="text-sm font-bold text-foreground">
                          {tenant.mrr > 0 ? `R$ ${tenant.mrr.toLocaleString('pt-BR')},00` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Próxima cobrança</span>
                        <span className="text-xs font-medium text-foreground">{new Date(tenant.nextBillingDate).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Forma de pagamento</span>
                        <span className="text-xs font-medium text-foreground">{tenant.paymentMethod}</span>
                      </div>
                      {tenant.saasSubscriptionStatus === 'past_due' && (
                        <div className="flex items-start gap-2 p-2.5 bg-red-50 rounded-lg border border-red-100">
                          <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-700">Fatura vencida. Acesso pode ser suspenso em breve.</p>
                        </div>
                      )}
                    </div>
                  </SectionCard>

                  {/* Integrations Status */}
                  <SectionCard title="Status das Integrações" icon={Link2}>
                    <div className="space-y-4">
                      {/* Asaas */}
                      <div className="p-3 rounded-xl border border-border bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-foreground">Asaas (Pagamentos)</span>
                          <IntegrationStatusBadge
                            status={tenant.asaasSubaccountStatus}
                            label={{ active: 'Ativo', pending: 'Pendente', blocked: 'Bloqueado', not_configured: 'Não configurado' }[tenant.asaasSubaccountStatus] ?? tenant.asaasSubaccountStatus}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Subconta: <span className="font-mono text-foreground">{tenant.asaasAccountId}</span></p>
                        {tenant.asaasSubaccountStatus === 'blocked' && (
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertCircle size={11} /> Subconta bloqueada — verificar API key</p>
                        )}
                      </div>
                      {/* D4Sign */}
                      <div className="p-3 rounded-xl border border-border bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-foreground">D4Sign (Documentos)</span>
                          <IntegrationStatusBadge
                            status={tenant.d4signStatus}
                            label={{ active: 'Ativo', quota_exceeded: 'Cota excedida', error: 'Erro', not_configured: 'Não configurado' }[tenant.d4signStatus] ?? tenant.d4signStatus}
                          />
                        </div>
                        <UsageBar used={tenant.d4signDocsUsed} capacity={tenant.d4signDocsLimit} unit=" docs" />
                        {tenant.d4signStatus === 'quota_exceeded' && (
                          <p className="text-xs text-orange-600 mt-1 flex items-center gap-1"><AlertCircle size={11} /> Cota mensal esgotada</p>
                        )}
                      </div>
                    </div>
                  </SectionCard>
                </div>

                {/* Usage Metrics */}
                <SectionCard title="Métricas de Uso" icon={Activity}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Users size={11} /> Usuários</p>
                      <UsageBar used={tenant.users} capacity={tenant.usersLimit} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><HardDrive size={11} /> Armazenamento</p>
                      <UsageBar used={parseFloat(tenant.storageUsedGb.toFixed(1))} capacity={tenant.storageCapacityGb} unit=" GB" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Zap size={11} /> Chamadas de API</p>
                      <UsageBar used={Math.round(tenant.apiCallsThisMonth / 1000)} capacity={Math.round(tenant.apiLimitMonthly / 1000)} unit="k" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Calendar size={11} /> Agendamentos (mês)</p>
                      <div className="flex flex-col gap-1">
                        <p className="text-2xl font-bold text-foreground tabular-nums">{tenant.appointmentsThisMonth}</p>
                        <p className="text-xs text-muted-foreground">{tenant.patients} pacientes cadastrados</p>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                {/* Feature Flags */}
                <SectionCard title="Features Habilitadas" icon={ToggleRight} action={
                  <button className="text-xs text-primary hover:underline font-medium">Gerenciar</button>
                }>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {featureFlagMeta.map(({ key, label, icon: FlagIcon }) => {
                      const enabled = tenant.featureFlags[key];
                      return (
                        <div
                          key={key}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all ${enabled ? 'bg-teal-50 border-teal-200' : 'bg-muted/40 border-border opacity-60'}`}
                        >
                          {React.createElement(FlagIcon, { size: 14, className: enabled ? 'text-teal-600' : 'text-muted-foreground' })}
                          <span className={`text-xs font-medium ${enabled ? 'text-teal-700' : 'text-muted-foreground'}`}>{label}</span>
                          <div className="ml-auto">
                            {enabled
                              ? <ToggleRight size={16} className="text-teal-500" />
                              : <ToggleLeft size={16} className="text-muted-foreground" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              </>
            )}

            {/* ── USERS TAB ── */}
            {activeTab === 'users' && (
              <SectionCard title="Usuários do Tenant" icon={Users} action={
                <span className="text-xs text-muted-foreground">{mockUsers.length} de {tenant.usersLimit} usuários</span>
              }>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {['Nome', 'E-mail', 'Papel', 'Status', 'MFA', 'Último login'].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {mockUsers.map(u => (
                        <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-foreground">{u.name}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{u.email}</td>
                          <td className="py-2.5 px-3">
                            <span className="bg-muted text-foreground rounded-full px-2 py-0.5 text-xs font-medium">{u.role}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center gap-1 rounded-full border text-xs font-medium px-2 py-0.5 ${u.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                              {u.status === 'active' ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {u.mfaEnabled
                              ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle size={12} /> Ativo</span>
                              : <span className="flex items-center gap-1 text-muted-foreground"><XCircle size={12} /> Inativo</span>}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">{u.lastLogin}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* ── UNITS TAB ── */}
            {activeTab === 'units' && (
              <SectionCard title="Unidades" icon={MapPin} action={
                <span className="text-xs text-muted-foreground">{mockUnits.length} unidade(s)</span>
              }>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {mockUnits.map(unit => (
                    <div key={unit.id} className="p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{unit.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{unit.city}, {unit.state}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${unit.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {unit.status === 'active' ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users size={11} /> {unit.users} usuários</span>
                        <span className="flex items-center gap-1"><Activity size={11} /> {unit.patients} pacientes</span>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* ── AUDIT TAB ── */}
            {activeTab === 'audit' && (
              <SectionCard title="Log de Auditoria" icon={ClipboardList} action={
                <button className="btn-ghost text-xs flex items-center gap-1.5 px-2 py-1.5">
                  <ExternalLink size={12} /> Exportar
                </button>
              }>
                <div className="space-y-1">
                  {mockAuditLogs.map(entry => {
                    const catConfig = auditCategoryConfig[entry.category] ?? { icon: Info, color: 'text-muted-foreground' };
                    const CatIcon = catConfig.icon;
                    return (
                      <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/40 transition-colors">
                        <div className={`w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <CatIcon size={13} className={catConfig.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground">{entry.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">por {entry.admin}</p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">{entry.timestamp}</span>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {/* ── WEBHOOKS TAB ── */}
            {activeTab === 'webhooks' && (
              <SectionCard title="Erros de Webhook" icon={Webhook} action={
                <button className="btn-ghost text-xs flex items-center gap-1.5 px-2 py-1.5">
                  <RefreshCw size={12} /> Reenviar todos
                </button>
              }>
                {mockWebhookErrors.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Nenhum erro de webhook registrado</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          {['Evento', 'Erro', 'Severidade', 'Tentativas', 'Status', 'Timestamp', 'Ação'].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {mockWebhookErrors.map(wh => (
                          <tr key={wh.id} className="hover:bg-muted/40 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-medium text-foreground">{wh.event}</td>
                            <td className="py-2.5 px-3 text-muted-foreground max-w-[200px] truncate">{wh.error}</td>
                            <td className="py-2.5 px-3"><SeverityBadge severity={wh.severity} /></td>
                            <td className="py-2.5 px-3 text-center text-foreground font-medium">{wh.retries}</td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${wh.status === 'resolved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : wh.status === 'dead_letter' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                {wh.status === 'resolved' ? 'Resolvido' : wh.status === 'dead_letter' ? 'Dead Letter' : 'Pendente'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{wh.timestamp}</td>
                            <td className="py-2.5 px-3">
                              {wh.status !== 'resolved' && (
                                <button className="text-xs text-primary hover:underline flex items-center gap-1">
                                  <RefreshCw size={11} /> Reenviar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            )}

            {/* ── SUPPORT TAB ── */}
            {activeTab === 'support' && (
              <SectionCard title="Sessões de Suporte" icon={Headphones} action={
                <button className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5">
                  <MessageSquare size={12} /> Nova sessão
                </button>
              }>
                <div className="space-y-3">
                  {mockSupportSessions.map(session => (
                    <div key={session.id} className="p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{session.subject}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Aberto em {session.openedAt} · Última atividade: {session.lastActivity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${
                            { urgente: 'bg-red-50 text-red-700 border-red-200', alto: 'bg-orange-50 text-orange-700 border-orange-200', medio: 'bg-amber-50 text-amber-700 border-amber-200', baixo: 'bg-blue-50 text-blue-700 border-blue-200' }[session.priority]
                          }`}>
                            {{ urgente: 'Urgente', alto: 'Alto', medio: 'Médio', baixo: 'Baixo' }[session.priority]}
                          </span>
                          <span className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${
                            session.status === 'open' ? 'bg-teal-50 text-teal-700 border-teal-200' : session.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}>
                            {session.status === 'open' ? 'Aberto' : session.status === 'pending' ? 'Pendente' : 'Resolvido'}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {session.assignedTo ? `Atribuído a: ${session.assignedTo}` : 'Não atribuído'}
                      </p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* ── BREAK-GLASS TAB ── */}
            {activeTab === 'breakglass' && (
              <SectionCard title="Solicitações Break-Glass" icon={Key} action={
                <button className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5">
                  <Unlock size={12} /> Nova solicitação
                </button>
              }>
                <div className="mb-4 flex items-start gap-2.5 p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Solicitações break-glass concedem acesso temporário e auditado ao tenant. Todo acesso é registrado e requer aprovação de outro administrador.
                  </p>
                </div>
                <div className="space-y-3">
                  {mockBreakGlass.map(bg => {
                    const statusCfg = breakGlassStatusConfig[bg.status];
                    return (
                      <div key={bg.id} className="p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg.status === 'approved' ? 'bg-emerald-50' : bg.status === 'pending' ? 'bg-amber-50' : 'bg-slate-100'}`}>
                              {bg.status === 'approved' ? <Unlock size={13} className="text-emerald-600" /> : bg.status === 'pending' ? <Clock size={13} className="text-amber-600" /> : <Lock size={13} className="text-slate-500" />}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-foreground">Solicitado por {bg.requestedBy}</p>
                              <p className="text-xs text-muted-foreground">{bg.requestedAt}</p>
                            </div>
                          </div>
                          <span className={`inline-flex items-center rounded-full border text-xs font-medium px-2 py-0.5 ${statusCfg.classes}`}>
                            {statusCfg.label}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Motivo:</span>
                            <span className="text-xs text-foreground">{bg.reason}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Escopo:</span>
                            <span className="text-xs text-foreground">{bg.scope}</span>
                          </div>
                          {bg.approvedBy && (
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Aprovado por:</span>
                              <span className="text-xs text-foreground">{bg.approvedBy}</span>
                            </div>
                          )}
                          {bg.expiresAt && (
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Expira em:</span>
                              <span className="text-xs text-foreground">{bg.expiresAt}</span>
                            </div>
                          )}
                        </div>
                        {bg.status === 'pending' && (
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                            <button className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5">
                              <CheckCircle size={12} /> Aprovar
                            </button>
                            <button className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 text-red-600">
                              <XCircle size={12} /> Negar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
