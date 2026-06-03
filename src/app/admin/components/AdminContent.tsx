'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle,
  ClipboardList,
  CreditCard,
  Database,
  HardDrive,
  LifeBuoy,
  Link2,
  Shield,
  Users,
  Webhook,
  XCircle,
} from 'lucide-react';
import AdminShell from '@/app/admin/components/AdminShell';
import {
  getPlatformAdminSnapshot,
  type AdminAuditEntry,
  type AdminTenantRow,
  type AdminWebhookEventSummary,
  type PlatformAdminSupportSummary,
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

function SupportList({ sessions }: { sessions: PlatformAdminSupportSummary[] }) {
  return (
    <div className="card-base overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-bold text-foreground">Solicitacoes reais de suporte</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Dados vindos do detalhe operacional dos tenants, sem payload bruto.
        </p>
      </div>
      <div className="divide-y divide-border">
        {sessions.length === 0 ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            Nenhuma solicitacao de suporte aberta no snapshot administrativo.
          </div>
        ) : (
          sessions.slice(0, 10).map((session) => (
            <div key={session.id} className="flex items-start gap-3 px-5 py-3">
              <LifeBuoy size={15} className="mt-0.5 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{session.subject}</span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {session.priority}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {session.status}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {session.tenantName} - ultima atividade {formatDate(session.lastActivity)}
                </p>
              </div>
              <Link
                href={`/admin/tenants/${session.tenantId}`}
                className="text-xs font-semibold text-primary"
              >
                Abrir tenant
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AuditList({ audit }: { audit: AdminAuditEntry[] }) {
  return (
    <div className="card-base p-5">
      <h2 className="mb-1 text-sm font-bold text-foreground">Auditoria recente real</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Eventos sanitizados de audit log agregados dos tenants com atividade operacional.
      </p>
      <div className="space-y-2">
        {audit.length === 0 ? (
          <div className="rounded-xl bg-muted/40 px-3 py-8 text-center text-sm text-muted-foreground">
            Nenhum evento de auditoria retornado pelo contrato admin.
          </div>
        ) : (
          audit.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-muted/30"
            >
              <ClipboardList size={14} className="mt-0.5 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">{entry.description}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.admin} - {entry.category}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{formatDate(entry.timestamp)}</span>
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
      supportOpen: snapshot.support.filter((session) => session.status !== 'resolved').length,
      auditEvents: snapshot.audit.length,
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
        <StatCard
          icon={LifeBuoy}
          label="Suportes abertos"
          value={stats.supportOpen}
          tone={stats.supportOpen ? 'amber' : 'slate'}
        />
        <StatCard
          icon={ClipboardList}
          label="Auditoria real"
          value={stats.auditEvents}
          tone="blue"
        />
      </div>
      {snapshot.warnings.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Snapshot parcialmente degradado: {snapshot.warnings.join(' ')}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.85fr]">
        <TenantsTable tenants={snapshot.tenants} />
        <WebhookList webhooks={snapshot.webhooks} />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SupportList sessions={snapshot.support} />
        <AuditList audit={snapshot.audit.slice(0, 8)} />
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
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Abertura e aprovacao continuam no detalhe do tenant para manter contexto, motivo e
          auditoria obrigatoria por tenant.
        </div>
        <SupportList sessions={snapshot.support} />
        <TenantsTable tenants={supportTenants.length ? supportTenants : snapshot.tenants} />
      </div>
    );
  }

  if (section === 'audit') return <AuditList audit={snapshot.audit} />;

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
          value={snapshot.audit.length}
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
  const [snapshot, setSnapshot] = useState<PlatformAdminSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestIdRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSnapshot = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setLoadError(null);
    getPlatformAdminSnapshot().then(({ data, error }) => {
      if (requestIdRef.current !== requestId) return;
      setSnapshot(data);
      setLoadError(error?.message ?? null);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  return (
    <AdminShell
      activeSection={activeSection}
      title={sectionTitles[activeSection]}
      description="Dados sanitizados via RPCs de plataforma, sem payload bruto nem provider secrets."
      onRefresh={loadSnapshot}
    >
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
    </AdminShell>
  );
}
