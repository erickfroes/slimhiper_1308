'use client';

import React, { useState } from 'react';
import {
  Webhook, Search, Filter, RefreshCw, Eye, EyeOff, ChevronRight,
  LogOut, User, Bell, CheckCircle, XCircle, Clock, AlertTriangle,
  AlertCircle, RotateCcw, ChevronDown, ChevronUp, Copy, X,
  Activity, Building2, TrendingUp, HardDrive, Link2, Shield,
  Headphones, ClipboardList, LayoutDashboard
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';


// ─── TYPES ────────────────────────────────────────────────────────────────────

type WebhookStatus = 'processed' | 'pending' | 'failed' | 'dead_letter' | 'retrying';
type WebhookProvider = 'Asaas' | 'D4Sign';

interface WebhookEvent {
  id: string;
  provider: WebhookProvider;
  eventType: string;
  tenant: string;
  tenantId: string;
  patientRef: string | null;
  externalId: string;
  idempotencyKey: string;
  receivedAt: string;
  processedAt: string | null;
  status: WebhookStatus;
  retryCount: number;
  errorSummary: string | null;
  sensitivePayload: {
    rawBody: string;
    headers: Record<string, string>;
    signature: string;
  };
}

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const mockWebhookEvents: WebhookEvent[] = [
  {
    id: 'WH-2026-001',
    provider: 'Asaas',
    eventType: 'PAYMENT_CONFIRMED',
    tenant: 'Clínica Corpo & Saúde',
    tenantId: 'T001',
    patientRef: 'PAC-4821',
    externalId: 'pay_8f3a2c1d9e4b',
    idempotencyKey: 'idem_T001_pay_8f3a2c1d9e4b_1746643200',
    receivedAt: '2026-05-08 00:42:17',
    processedAt: '2026-05-08 00:42:18',
    status: 'processed',
    retryCount: 0,
    errorSummary: null,
    sensitivePayload: {
      rawBody: '{"event":"PAYMENT_CONFIRMED","payment":{"id":"pay_8f3a2c1d9e4b","value":350.00,"customer":"cus_xxx"}}',
      headers: { 'asaas-access-token': 'sk_live_***', 'content-type': 'application/json' },
      signature: 'sha256=a1b2c3d4e5f6...',
    },
  },
  {
    id: 'WH-2026-002',
    provider: 'D4Sign',
    eventType: 'DOCUMENT_SIGNED',
    tenant: 'NutriVita Clínicas',
    tenantId: 'T002',
    patientRef: 'PAC-1193',
    externalId: 'doc_d4s_7c9e1a3f',
    idempotencyKey: 'idem_T002_doc_d4s_7c9e1a3f_1746640800',
    receivedAt: '2026-05-08 00:00:00',
    processedAt: '2026-05-08 00:00:01',
    status: 'processed',
    retryCount: 0,
    errorSummary: null,
    sensitivePayload: {
      rawBody: '{"event":"DOCUMENT_SIGNED","document":{"uuid":"doc_d4s_7c9e1a3f","signatories":["email@example.com"]}}',
      headers: { 'x-d4sign-token': 'tok_live_***', 'content-type': 'application/json' },
      signature: 'hmac_sha256=b2c3d4e5f6a1...',
    },
  },
  {
    id: 'WH-2026-003',
    provider: 'Asaas',
    eventType: 'PAYMENT_OVERDUE',
    tenant: 'Metabolic Health SP',
    tenantId: 'T004',
    patientRef: 'PAC-0087',
    externalId: 'pay_2b4d6f8a0c2e',
    idempotencyKey: 'idem_T004_pay_2b4d6f8a0c2e_1746637200',
    receivedAt: '2026-05-07 23:00:05',
    processedAt: null,
    status: 'failed',
    retryCount: 3,
    errorSummary: 'HTTP 502 Bad Gateway — endpoint do tenant não respondeu',
    sensitivePayload: {
      rawBody: '{"event":"PAYMENT_OVERDUE","payment":{"id":"pay_2b4d6f8a0c2e","value":290.00,"dueDate":"2026-05-07"}}',
      headers: { 'asaas-access-token': 'sk_live_***', 'content-type': 'application/json' },
      signature: 'sha256=c3d4e5f6a1b2...',
    },
  },
  {
    id: 'WH-2026-004',
    provider: 'D4Sign',
    eventType: 'DOCUMENT_CANCELLED',
    tenant: 'Metabolic Health SP',
    tenantId: 'T004',
    patientRef: null,
    externalId: 'doc_d4s_1a3c5e7g',
    idempotencyKey: 'idem_T004_doc_d4s_1a3c5e7g_1746633600',
    receivedAt: '2026-05-07 22:00:12',
    processedAt: null,
    status: 'dead_letter',
    retryCount: 5,
    errorSummary: 'Máximo de tentativas atingido — autenticação falhou (401 Unauthorized)',
    sensitivePayload: {
      rawBody: '{"event":"DOCUMENT_CANCELLED","document":{"uuid":"doc_d4s_1a3c5e7g","reason":"expired"}}',
      headers: { 'x-d4sign-token': 'tok_live_***', 'content-type': 'application/json' },
      signature: 'hmac_sha256=d4e5f6a1b2c3...',
    },
  },
  {
    id: 'WH-2026-005',
    provider: 'Asaas',
    eventType: 'SUBSCRIPTION_CREATED',
    tenant: 'Longevidade Clínica',
    tenantId: 'T005',
    patientRef: 'PAC-3344',
    externalId: 'sub_9e1c3a5b7d9f',
    idempotencyKey: 'idem_T005_sub_9e1c3a5b7d9f_1746630000',
    receivedAt: '2026-05-07 21:00:33',
    processedAt: '2026-05-07 21:00:34',
    status: 'processed',
    retryCount: 0,
    errorSummary: null,
    sensitivePayload: {
      rawBody: '{"event":"SUBSCRIPTION_CREATED","subscription":{"id":"sub_9e1c3a5b7d9f","value":490.00,"cycle":"MONTHLY"}}',
      headers: { 'asaas-access-token': 'sk_live_***', 'content-type': 'application/json' },
      signature: 'sha256=e5f6a1b2c3d4...',
    },
  },
  {
    id: 'WH-2026-006',
    provider: 'D4Sign',
    eventType: 'DOCUMENT_VIEWED',
    tenant: 'SlimCenter Premium',
    tenantId: 'T003',
    patientRef: 'PAC-0512',
    externalId: 'doc_d4s_2b4d6f8h',
    idempotencyKey: 'idem_T003_doc_d4s_2b4d6f8h_1746626400',
    receivedAt: '2026-05-07 20:00:44',
    processedAt: '2026-05-07 20:00:45',
    status: 'processed',
    retryCount: 0,
    errorSummary: null,
    sensitivePayload: {
      rawBody: '{"event":"DOCUMENT_VIEWED","document":{"uuid":"doc_d4s_2b4d6f8h","viewedBy":"email@example.com"}}',
      headers: { 'x-d4sign-token': 'tok_live_***', 'content-type': 'application/json' },
      signature: 'hmac_sha256=f6a1b2c3d4e5...',
    },
  },
  {
    id: 'WH-2026-007',
    provider: 'Asaas',
    eventType: 'PAYMENT_REFUNDED',
    tenant: 'NutriVita Clínicas',
    tenantId: 'T002',
    patientRef: 'PAC-2271',
    externalId: 'pay_3c5e7g9i1k3m',
    idempotencyKey: 'idem_T002_pay_3c5e7g9i1k3m_1746622800',
    receivedAt: '2026-05-07 19:00:55',
    processedAt: null,
    status: 'retrying',
    retryCount: 2,
    errorSummary: 'Connection timeout após 30s — tentativa 2/5',
    sensitivePayload: {
      rawBody: '{"event":"PAYMENT_REFUNDED","payment":{"id":"pay_3c5e7g9i1k3m","value":150.00,"refundedAt":"2026-05-07"}}',
      headers: { 'asaas-access-token': 'sk_live_***', 'content-type': 'application/json' },
      signature: 'sha256=a1b2c3d4e5f6...',
    },
  },
  {
    id: 'WH-2026-008',
    provider: 'D4Sign',
    eventType: 'DOCUMENT_SIGNED',
    tenant: 'BodyTransform RJ',
    tenantId: 'T007',
    patientRef: 'PAC-0099',
    externalId: 'doc_d4s_3c5e7g9i',
    idempotencyKey: 'idem_T007_doc_d4s_3c5e7g9i_1746619200',
    receivedAt: '2026-05-07 18:00:01',
    processedAt: null,
    status: 'pending',
    retryCount: 0,
    errorSummary: null,
    sensitivePayload: {
      rawBody: '{"event":"DOCUMENT_SIGNED","document":{"uuid":"doc_d4s_3c5e7g9i","signatories":["patient@email.com"]}}',
      headers: { 'x-d4sign-token': 'tok_live_***', 'content-type': 'application/json' },
      signature: 'hmac_sha256=b2c3d4e5f6a1...',
    },
  },
  {
    id: 'WH-2026-009',
    provider: 'Asaas',
    eventType: 'INVOICE_CREATED',
    tenant: 'Longevidade Clínica',
    tenantId: 'T005',
    patientRef: 'PAC-4102',
    externalId: 'inv_4d6f8h0j2l4n',
    idempotencyKey: 'idem_T005_inv_4d6f8h0j2l4n_1746615600',
    receivedAt: '2026-05-07 17:00:22',
    processedAt: '2026-05-07 17:00:23',
    status: 'processed',
    retryCount: 0,
    errorSummary: null,
    sensitivePayload: {
      rawBody: '{"event":"INVOICE_CREATED","invoice":{"id":"inv_4d6f8h0j2l4n","value":890.00,"dueDate":"2026-05-15"}}',
      headers: { 'asaas-access-token': 'sk_live_***', 'content-type': 'application/json' },
      signature: 'sha256=c3d4e5f6a1b2...',
    },
  },
  {
    id: 'WH-2026-010',
    provider: 'D4Sign',
    eventType: 'DOCUMENT_EXPIRED',
    tenant: 'Clínica Corpo & Saúde',
    tenantId: 'T001',
    patientRef: null,
    externalId: 'doc_d4s_4d6f8h0j',
    idempotencyKey: 'idem_T001_doc_d4s_4d6f8h0j_1746612000',
    receivedAt: '2026-05-07 16:00:09',
    processedAt: '2026-05-07 16:00:10',
    status: 'processed',
    retryCount: 0,
    errorSummary: null,
    sensitivePayload: {
      rawBody: '{"event":"DOCUMENT_EXPIRED","document":{"uuid":"doc_d4s_4d6f8h0j","expiredAt":"2026-05-07"}}',
      headers: { 'x-d4sign-token': 'tok_live_***', 'content-type': 'application/json' },
      signature: 'hmac_sha256=d4e5f6a1b2c3...',
    },
  },
  {
    id: 'WH-2026-011',
    provider: 'Asaas',
    eventType: 'PAYMENT_RECEIVED',
    tenant: 'Metabolic Health SP',
    tenantId: 'T004',
    patientRef: 'PAC-0312',
    externalId: 'pay_5e7g9i1k3m5o',
    idempotencyKey: 'idem_T004_pay_5e7g9i1k3m5o_1746608400',
    receivedAt: '2026-05-07 15:00:18',
    processedAt: null,
    status: 'failed',
    retryCount: 3,
    errorSummary: 'DNS resolution failed — host do tenant inacessível',
    sensitivePayload: {
      rawBody: '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_5e7g9i1k3m5o","value":290.00,"billingType":"PIX"}}',
      headers: { 'asaas-access-token': 'sk_live_***', 'content-type': 'application/json' },
      signature: 'sha256=e5f6a1b2c3d4...',
    },
  },
  {
    id: 'WH-2026-012',
    provider: 'D4Sign',
    eventType: 'DOCUMENT_SIGNED',
    tenant: 'NutriVita Clínicas',
    tenantId: 'T002',
    patientRef: 'PAC-1887',
    externalId: 'doc_d4s_5e7g9i1k',
    idempotencyKey: 'idem_T002_doc_d4s_5e7g9i1k_1746604800',
    receivedAt: '2026-05-07 14:00:30',
    processedAt: '2026-05-07 14:00:31',
    status: 'processed',
    retryCount: 0,
    errorSummary: null,
    sensitivePayload: {
      rawBody: '{"event":"DOCUMENT_SIGNED","document":{"uuid":"doc_d4s_5e7g9i1k","signatories":["patient2@email.com"]}}',
      headers: { 'x-d4sign-token': 'tok_live_***', 'content-type': 'application/json' },
      signature: 'hmac_sha256=f6a1b2c3d4e5...',
    },
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WebhookStatus }) {
  const config: Record<WebhookStatus, { label: string; classes: string; icon: React.ElementType }> = {
    processed: { label: 'Processado', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle },
    pending: { label: 'Pendente', classes: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
    failed: { label: 'Falhou', classes: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
    dead_letter: { label: 'Dead Letter', classes: 'bg-slate-100 text-slate-600 border-slate-300', icon: AlertCircle },
    retrying: { label: 'Reprocessando', classes: 'bg-amber-50 text-amber-700 border-amber-200', icon: RotateCcw },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border text-xs font-medium px-2 py-0.5 ${c.classes}`}>
      <Icon size={10} />
      {c.label}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: WebhookProvider }) {
  const config: Record<WebhookProvider, { classes: string }> = {
    Asaas: { classes: 'bg-teal-50 text-teal-700 border-teal-200' },
    D4Sign: { classes: 'bg-purple-50 text-purple-700 border-purple-200' },
  };
  return (
    <span className={`inline-flex items-center rounded-full border text-xs font-semibold px-2 py-0.5 ${config[provider].classes}`}>
      {provider}
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, color = 'teal' }: {
  icon: React.ElementType; label: string; value: string | number; color?: string;
}) {
  const colorMap: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-500',
    blue: 'bg-blue-50 text-blue-600',
  };
  return (
    <div className="stat-card flex flex-col gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorMap[color] ?? colorMap.teal}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function MaskedText({ value }: { value: string }) {
  return (
    <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded select-none tracking-widest">
      {'•'.repeat(Math.min(value.length, 16))}
    </span>
  );
}

// ─── PAYLOAD DRAWER ───────────────────────────────────────────────────────────

function PayloadDrawer({ event, onClose }: { event: WebhookEvent; onClose: () => void }) {
  const [showSensitive, setShowSensitive] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-card border-l border-border h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Webhook size={16} className="text-primary" />
            <span className="text-sm font-bold text-foreground">{event.id}</span>
            <ProviderBadge provider={event.provider} />
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Tipo de Evento', value: event.eventType },
              { label: 'Status', value: <StatusBadge status={event.status} /> },
              { label: 'Tenant', value: event.tenant },
              { label: 'Tenant ID', value: event.tenantId },
              { label: 'Ref. Paciente', value: event.patientRef ?? '—' },
              { label: 'Tentativas', value: String(event.retryCount) },
              { label: 'Recebido em', value: event.receivedAt },
              { label: 'Processado em', value: event.processedAt ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted/50 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <div className="text-xs font-semibold text-foreground">{value}</div>
              </div>
            ))}
          </div>

          {/* IDs */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Identificadores</p>
            <div className="bg-muted/50 rounded-xl p-3 space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">External ID</p>
                <p className="text-xs font-mono text-foreground mt-0.5">{event.externalId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Idempotency Key</p>
                <p className="text-xs font-mono text-foreground mt-0.5 break-all">{event.idempotencyKey}</p>
              </div>
            </div>
          </div>

          {/* Error */}
          {event.errorSummary && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle size={13} className="text-red-600" />
                <p className="text-xs font-semibold text-red-700">Resumo do Erro</p>
              </div>
              <p className="text-xs text-red-600">{event.errorSummary}</p>
            </div>
          )}

          {/* Sensitive Payload */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payload Sensível</p>
              <button
                onClick={() => setShowSensitive(!showSensitive)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {showSensitive ? <EyeOff size={13} /> : <Eye size={13} />}
                {showSensitive ? 'Ocultar' : 'Revelar'}
              </button>
            </div>

            {showSensitive ? (
              <div className="space-y-3">
                <div className="bg-slate-900 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-400 font-medium">Raw Body</p>
                    <button
                      onClick={() => handleCopy(event.sensitivePayload.rawBody)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <Copy size={11} />
                      {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap break-all leading-relaxed">
                    {JSON.stringify(JSON.parse(event.sensitivePayload.rawBody), null, 2)}
                  </pre>
                </div>
                <div className="bg-slate-900 rounded-xl p-3">
                  <p className="text-xs text-slate-400 font-medium mb-2">Headers</p>
                  {Object.entries(event.sensitivePayload.headers).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs font-mono">
                      <span className="text-blue-400">{k}:</span>
                      <span className="text-amber-300">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-slate-900 rounded-xl p-3">
                  <p className="text-xs text-slate-400 font-medium mb-1">Assinatura</p>
                  <p className="text-xs font-mono text-purple-400 break-all">{event.sensitivePayload.signature}</p>
                </div>
              </div>
            ) : (
              <div className="bg-muted/50 border border-border rounded-xl p-4 flex flex-col items-center gap-2">
                <EyeOff size={20} className="text-muted-foreground" />
                <p className="text-xs text-muted-foreground text-center">
                  Payload oculto por padrão para proteger dados sensíveis.<br />
                  Clique em <strong>Revelar</strong> para visualizar.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── NAV ITEMS ────────────────────────────────────────────────────────────────

const navItems = [
  { key: 'overview', label: 'Visão Geral', icon: LayoutDashboard, href: '/admin' },
  { key: 'tenants', label: 'Tenants', icon: Building2, href: '/admin/tenants' },
  { key: 'financial', label: 'Financeiro', icon: TrendingUp, href: '/admin' },
  { key: 'usage', label: 'Uso & Métricas', icon: Activity, href: '/admin' },
  { key: 'storage', label: 'Armazenamento', icon: HardDrive, href: '/admin' },
  { key: 'integrations', label: 'Integrações', icon: Link2, href: '/admin' },
  { key: 'webhooks', label: 'Webhooks', icon: Webhook, href: '/admin/webhooks' },
  { key: 'security', label: 'Segurança', icon: Shield, href: '/admin' },
  { key: 'support', label: 'Suporte', icon: Headphones, href: '/admin' },
  { key: 'audit', label: 'Auditoria', icon: ClipboardList, href: '/admin' },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function WebhookMonitorContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | WebhookProvider>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | WebhookStatus>('all');
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const filtered = mockWebhookEvents.filter(e => {
    const matchSearch = !search ||
      e.id.toLowerCase().includes(search.toLowerCase()) ||
      e.eventType.toLowerCase().includes(search.toLowerCase()) ||
      e.tenant.toLowerCase().includes(search.toLowerCase()) ||
      e.externalId.toLowerCase().includes(search.toLowerCase()) ||
      (e.patientRef?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchProvider = providerFilter === 'all' || e.provider === providerFilter;
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchSearch && matchProvider && matchStatus;
  });

  const total = mockWebhookEvents.length;
  const processed = mockWebhookEvents.filter(e => e.status === 'processed').length;
  const failed = mockWebhookEvents.filter(e => e.status === 'failed' || e.status === 'dead_letter').length;
  const pending = mockWebhookEvents.filter(e => e.status === 'pending' || e.status === 'retrying').length;
  const asaasCount = mockWebhookEvents.filter(e => e.provider === 'Asaas').length;
  const d4signCount = mockWebhookEvents.filter(e => e.provider === 'D4Sign').length;

  function toggleRow(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

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
            const active = item.key === 'webhooks';
            const sharedClass = `relative w-full flex items-center rounded-xl transition-all duration-150 group ${sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-primary/8 hover:text-primary'}`;
            return (
              <a key={item.key} href={item.href} className={sharedClass}>
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
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <a href="/admin" className="hover:text-primary transition-colors">Admin</a>
            <ChevronRight size={12} />
            <span className="text-foreground font-semibold">Monitor de Webhooks</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-lg transition-colors">
              <RefreshCw size={12} />
              Atualizar
            </button>
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
        <main className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
          {/* Page Title */}
          <div>
            <h1 className="text-lg font-bold text-foreground">Monitor de Webhooks</h1>
            <p className="text-sm text-muted-foreground">Eventos recebidos de Asaas e D4Sign em todos os tenants</p>
          </div>

          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard icon={Webhook} label="Total de Eventos" value={total} color="teal" />
            <KpiCard icon={CheckCircle} label="Processados" value={processed} color="emerald" />
            <KpiCard icon={XCircle} label="Com Falha" value={failed} color="red" />
            <KpiCard icon={Clock} label="Pendentes" value={pending} color="amber" />
            <KpiCard icon={Activity} label="Asaas" value={asaasCount} color="teal" />
            <KpiCard icon={Activity} label="D4Sign" value={d4signCount} color="blue" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por ID, evento, tenant, paciente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-muted-foreground" />
              <select
                value={providerFilter}
                onChange={e => setProviderFilter(e.target.value as typeof providerFilter)}
                className="text-xs bg-card border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              >
                <option value="all">Todos os provedores</option>
                <option value="Asaas">Asaas</option>
                <option value="D4Sign">D4Sign</option>
              </select>
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="text-xs bg-card border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            >
              <option value="all">Todos os status</option>
              <option value="processed">Processado</option>
              <option value="pending">Pendente</option>
              <option value="retrying">Reprocessando</option>
              <option value="failed">Falhou</option>
              <option value="dead_letter">Dead Letter</option>
            </select>
            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length} de {total} eventos
            </span>
          </div>

          {/* Table */}
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground w-8"></th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Provedor</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Tipo de Evento</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Tenant</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Ref. Paciente</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">External ID</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Idempotency Key</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Recebido em</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Processado em</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Tentativas</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Resumo do Erro</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">
                        <Webhook size={28} className="mx-auto mb-2 opacity-30" />
                        <p className="font-medium">Nenhum evento encontrado</p>
                        <p className="text-xs mt-1 opacity-70">Tente ajustar os filtros de busca</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map(event => {
                      const expanded = expandedRows.has(event.id);
                      return (
                        <React.Fragment key={event.id}>
                          <tr className={`hover:bg-muted/30 transition-colors ${expanded ? 'bg-muted/20' : ''}`}>
                            {/* Expand toggle */}
                            <td className="px-4 py-3">
                              <button
                                onClick={() => toggleRow(event.id)}
                                className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                            </td>
                            {/* Provider */}
                            <td className="px-4 py-3">
                              <ProviderBadge provider={event.provider} />
                            </td>
                            {/* Event Type */}
                            <td className="px-4 py-3">
                              <span className="font-mono font-medium text-foreground whitespace-nowrap">{event.eventType}</span>
                            </td>
                            {/* Tenant */}
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground whitespace-nowrap">{event.tenant}</span>
                                <span className="text-muted-foreground">{event.tenantId}</span>
                              </div>
                            </td>
                            {/* Patient Ref */}
                            <td className="px-4 py-3">
                              {event.patientRef ? (
                                <span className="font-mono text-foreground">{event.patientRef}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            {/* External ID */}
                            <td className="px-4 py-3">
                              <span className="font-mono text-foreground whitespace-nowrap">{event.externalId}</span>
                            </td>
                            {/* Idempotency Key */}
                            <td className="px-4 py-3 max-w-[160px]">
                              <MaskedText value={event.idempotencyKey} />
                            </td>
                            {/* Received At */}
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{event.receivedAt}</td>
                            {/* Processed At */}
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                              {event.processedAt ?? <span className="text-muted-foreground/50">—</span>}
                            </td>
                            {/* Status */}
                            <td className="px-4 py-3">
                              <StatusBadge status={event.status} />
                            </td>
                            {/* Retry Count */}
                            <td className="px-4 py-3 text-center">
                              <span className={`font-semibold tabular-nums ${event.retryCount > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                {event.retryCount}
                              </span>
                            </td>
                            {/* Error Summary */}
                            <td className="px-4 py-3 max-w-[200px]">
                              {event.errorSummary ? (
                                <span className="text-red-600 line-clamp-2 leading-relaxed">{event.errorSummary}</span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                            {/* Payload action */}
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setSelectedEvent(event)}
                                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                              >
                                <Eye size={12} />
                                Ver
                              </button>
                            </td>
                          </tr>
                          {/* Expanded row */}
                          {expanded && (
                            <tr className="bg-muted/20">
                              <td colSpan={13} className="px-6 py-4">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1">ID do Evento</p>
                                    <p className="text-xs font-mono font-semibold text-foreground">{event.id}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1">Idempotency Key (completa)</p>
                                    <p className="text-xs font-mono text-foreground break-all">{event.idempotencyKey}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1">Payload Sensível</p>
                                    <div className="flex items-center gap-2">
                                      <EyeOff size={12} className="text-muted-foreground" />
                                      <span className="text-xs text-muted-foreground">Oculto por padrão</span>
                                      <button
                                        onClick={() => setSelectedEvent(event)}
                                        className="text-xs font-medium text-primary hover:underline"
                                      >
                                        Revelar no painel →
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Payload Drawer */}
      {selectedEvent && (
        <PayloadDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
