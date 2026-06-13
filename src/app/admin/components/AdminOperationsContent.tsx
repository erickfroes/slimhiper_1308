'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle,
  ClipboardList,
  CreditCard,
  Database,
  Download,
  Eye,
  Filter,
  HardDrive,
  Headphones,
  Key,
  Link2,
  Pencil,
  Plus,
  Search,
  Shield,
  Users,
  Webhook,
} from 'lucide-react';
import AdminShell, { type AdminShellSection } from './AdminShell';
import { useAdminPermissions, type AdminPermissions } from './adminPermissions';
import Dialog from '@/components/ui/Dialog';
import DataState from '@/components/ui/DataState';
import MetricCard from '@/components/ui/MetricCard';
import {
  endPlatformSupportSession,
  getPlatformAdminSnapshot,
  listPlatformPlans,
  requestPlatformSupportSession,
  savePlatformPlan,
  type AdminAuditEntry,
  type AdminPlatformPlan,
  type AdminProviderStatus,
  type AdminSupportSession,
  type AdminTenantRow,
  type PlatformAdminSnapshot,
  type SavePlatformPlanInput,
} from '@/services/adminApi';

type AdminOperationsSection =
  | 'billing'
  | 'usage'
  | 'storage'
  | 'integrations'
  | 'security'
  | 'support'
  | 'audit';

const sectionConfig: Record<
  AdminOperationsSection,
  { active: AdminShellSection; title: string; description: string }
> = {
  billing: {
    active: 'financial',
    title: 'Financeiro SaaS',
    description: 'MRR, assinaturas, trials, inadimplencia e reconciliacao local sem provider call.',
  },
  usage: {
    active: 'usage',
    title: 'Uso e metricas',
    description: 'Consumo por tenant, limites e alertas de quota a partir do contrato admin.',
  },
  storage: {
    active: 'storage',
    title: 'Armazenamento',
    description: 'Storage, documentos D4Sign e tenants proximos do limite.',
  },
  integrations: {
    active: 'integrations',
    title: 'Integracoes',
    description: 'Estado sanitizado de Asaas, D4Sign e webhooks sem chamar provedores.',
  },
  security: {
    active: 'security',
    title: 'Seguranca operacional',
    description: 'Break-glass, usuarios privilegiados, compliance e riscos RBAC.',
  },
  support: {
    active: 'support',
    title: 'Suporte plataforma',
    description: 'Fila global de suporte com contexto de tenant e acoes auditadas.',
  },
  audit: {
    active: 'audit',
    title: 'Auditoria',
    description: 'Consulta sanitizada por categoria, ator, tenant e acao.',
  },
};

function formatDate(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPlanPrice(plan: Pick<AdminPlatformPlan, 'amountCents' | 'currency'>) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: plan.currency || 'BRL',
  }).format(plan.amountCents / 100);
}

function compact(value: number) {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  );
}

function ratio(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min((used / limit) * 100, 999);
}

function statusTone(status: string) {
  if (['active', 'processed', 'ok', 'resolved', 'approved'].includes(status)) return 'emerald';
  if (['trial', 'pending', 'queued', 'retrying'].includes(status)) return 'blue';
  if (['past_due', 'watch', 'open', 'processing'].includes(status)) return 'amber';
  if (['suspended', 'failed', 'dead_letter', 'critical', 'denied'].includes(status)) return 'red';
  return 'slate';
}

function StatusPill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: string }) {
  const classes: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-slate-100 text-slate-600',
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
        classes[tone] ?? classes.slate
      }`}
    >
      {children}
    </span>
  );
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label?: string }) {
  const pct = ratio(used, limit);
  const color = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-400' : 'bg-teal-500';
  return (
    <div className="min-w-[9rem]">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold tabular-nums text-foreground">{label ?? compact(used)}</span>
        <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function ProviderStatus({ status }: { status: AdminProviderStatus }) {
  return <StatusPill tone={statusTone(status)}>{status}</StatusPill>;
}

type PlanDraft = SavePlatformPlanInput;

function getPlanFeatureNumber(plan: AdminPlatformPlan, snakeKey: string, camelKey: string) {
  const value = Number(plan.features[snakeKey] ?? plan.features[camelKey]);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function createEmptyPlanDraft(): PlanDraft {
  return {
    code: '',
    name: '',
    billingCycle: 'monthly',
    amountCents: 0,
    currency: 'BRL',
    active: true,
    features: {
      usersLimit: 8,
      storageGb: 20,
      apiLimitMonthly: 30000,
      d4signDocsLimit: 100,
    },
    reason: '',
  };
}

function draftFromPlan(plan: AdminPlatformPlan): PlanDraft {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    billingCycle:
      plan.billingCycle === 'quarterly' || plan.billingCycle === 'yearly'
        ? plan.billingCycle
        : 'monthly',
    amountCents: plan.amountCents,
    currency: plan.currency || 'BRL',
    active: plan.active,
    features: {
      usersLimit: getPlanFeatureNumber(plan, 'users_limit', 'usersLimit'),
      storageGb: getPlanFeatureNumber(plan, 'storage_gb', 'storageGb'),
      apiLimitMonthly: getPlanFeatureNumber(plan, 'api_limit_monthly', 'apiLimitMonthly'),
      d4signDocsLimit: getPlanFeatureNumber(plan, 'd4sign_docs_limit', 'd4signDocsLimit'),
    },
    reason: '',
  };
}

function PlatformPlansPanel() {
  const permissions = useAdminPermissions();
  const [plans, setPlans] = useState<AdminPlatformPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadPlans = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    listPlatformPlans({ includeInactive: true }).then(({ data, error }) => {
      setPlans(data);
      setLoadError(error?.message ?? null);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const updateDraft = <Key extends keyof PlanDraft>(key: Key, value: PlanDraft[Key]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateFeature = (key: keyof PlanDraft['features'], value: number) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            features: {
              ...current.features,
              [key]: value,
            },
          }
        : current
    );
  };

  const submit = async () => {
    if (!draft) return;
    setIsSaving(true);
    setNotice(null);
    setFormError(null);
    const { error } = await savePlatformPlan(draft);
    setIsSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setNotice(draft.id ? 'Plano atualizado com auditoria.' : 'Plano criado com auditoria.');
    setDraft(null);
    loadPlans();
  };

  return (
    <div className="card-base overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-foreground">Planos da plataforma</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Catalogo local usado na criacao/alteracao de tenants. Nenhuma chamada Asaas e executada.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(createEmptyPlanDraft())}
          disabled={!permissions.canManageTenantConfig}
          className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
          title={
            permissions.canManageTenantConfig ? undefined : 'Apenas owner/admin podem criar planos.'
          }
        >
          <Plus size={13} />
          Novo plano
        </button>
      </div>

      {notice ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}
      {loadError ? (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          {loadError}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-xs">
          <thead className="border-b border-border bg-muted/40 text-muted-foreground">
            <tr>
              {['Plano', 'Preco', 'Ciclo', 'Limites', 'Status', 'Acoes'].map((header) => (
                <th key={header} scope="col" className="px-4 py-3 text-left font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando planos da plataforma...
                </td>
              </tr>
            ) : plans.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum plano configurado. Crie um plano antes de criar tenants.
                </td>
              </tr>
            ) : (
              plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{plan.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{plan.code}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                    {formatPlanPrice(plan)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{plan.billingCycle}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {getPlanFeatureNumber(plan, 'users_limit', 'usersLimit')} usuarios /{' '}
                    {getPlanFeatureNumber(plan, 'storage_gb', 'storageGb')} GB /{' '}
                    {compact(getPlanFeatureNumber(plan, 'api_limit_monthly', 'apiLimitMonthly'))}{' '}
                    API
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={plan.active ? 'emerald' : 'slate'}>
                      {plan.active ? 'ativo' : 'inativo'}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setDraft(draftFromPlan(plan))}
                      disabled={!permissions.canManageTenantConfig}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Pencil size={13} />
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {draft ? (
        <Dialog
          open
          title={draft.id ? 'Editar plano' : 'Criar plano'}
          description="Mudanca local auditada; o codigo fica imutavel apos criacao."
          onOpenChange={(open) => {
            if (!open) {
              setDraft(null);
              setFormError(null);
            }
          }}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="btn-ghost px-4 py-2 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={isSaving || draft.reason.trim().length < 16}
                className="btn-primary px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                Salvar plano
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-sm">
            {formError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>
                <span className="text-xs font-semibold text-foreground">Codigo</span>
                <input
                  value={draft.code}
                  onChange={(event) => updateDraft('code', event.target.value.toLowerCase())}
                  disabled={Boolean(draft.id)}
                  placeholder="ex: scale"
                  className="input-base mt-1 text-sm disabled:bg-muted"
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-foreground">Nome</span>
                <input
                  value={draft.name}
                  onChange={(event) => updateDraft('name', event.target.value)}
                  placeholder="Plano Scale"
                  className="input-base mt-1 text-sm"
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-foreground">Preco em centavos</span>
                <input
                  type="number"
                  min={0}
                  value={draft.amountCents}
                  onChange={(event) => updateDraft('amountCents', Number(event.target.value))}
                  className="input-base mt-1 text-sm"
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-foreground">Ciclo</span>
                <select
                  value={draft.billingCycle}
                  onChange={(event) =>
                    updateDraft('billingCycle', event.target.value as PlanDraft['billingCycle'])
                  }
                  className="input-base mt-1 text-sm"
                >
                  <option value="monthly">Mensal</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="yearly">Anual</option>
                </select>
              </label>
              <label>
                <span className="text-xs font-semibold text-foreground">Moeda</span>
                <input
                  value={draft.currency}
                  onChange={(event) => updateDraft('currency', event.target.value.toUpperCase())}
                  className="input-base mt-1 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 pt-6 text-xs font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => updateDraft('active', event.target.checked)}
                />
                Plano ativo para novos tenants
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ['usersLimit', 'Limite usuarios'],
                ['storageGb', 'Storage GB'],
                ['apiLimitMonthly', 'API mensal'],
                ['d4signDocsLimit', 'Documentos D4Sign'],
              ].map(([key, label]) => (
                <label key={key}>
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.features[key as keyof PlanDraft['features']]}
                    onChange={(event) =>
                      updateFeature(key as keyof PlanDraft['features'], Number(event.target.value))
                    }
                    className="input-base mt-1 text-sm"
                  />
                </label>
              ))}
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-foreground">Motivo auditavel</span>
              <textarea
                value={draft.reason}
                onChange={(event) => updateDraft('reason', event.target.value)}
                placeholder="Explique a criacao ou alteracao do plano."
                className="input-base mt-1 min-h-24 text-sm"
              />
            </label>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function matchesTenantSearch(tenant: AdminTenantRow, search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [tenant.clinicName, tenant.owner, tenant.email, tenant.id, tenant.cnpj]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function WarningPanel({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <div className="flex items-start gap-2">
        <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Snapshot parcialmente degradado</p>
          <p className="mt-1">{warnings.join(' ')}</p>
        </div>
      </div>
    </div>
  );
}

function PermissionModeBanner({ permissions }: { permissions: AdminPermissions }) {
  if (permissions.canMutatePlatform) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <div className="flex items-start gap-2">
        <Shield size={15} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">{permissions.roleLabel}</p>
          <p className="mt-1">
            Esta sessao pode consultar snapshots sanitizados. Acoes sensiveis ficam bloqueadas na UI
            e continuam negadas pelas rotas/RPCs.
          </p>
        </div>
      </div>
    </div>
  );
}

function Toolbar({
  search,
  onSearch,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="card-base p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar por tenant, ator, evento ou identificador"
            className="input-base pl-8 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-muted-foreground" />
          {children}
        </div>
      </div>
    </div>
  );
}

function BillingSection({ snapshot, search }: { snapshot: PlatformAdminSnapshot; search: string }) {
  const tenants = snapshot.tenants.filter((tenant) => matchesTenantSearch(tenant, search));
  const asaasIssues = snapshot.webhooks.filter(
    (event) =>
      event.provider === 'Asaas' && ['failed', 'dead_letter', 'retrying'].includes(event.status)
  );
  const suspended = tenants.filter((tenant) => tenant.status === 'suspended');
  const pastDue = tenants.filter((tenant) => tenant.saasSubscriptionStatus === 'past_due');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          icon={CreditCard}
          label="MRR"
          value={currency(tenants.reduce((sum, tenant) => sum + tenant.mrr, 0))}
          tone="success"
        />
        <MetricCard
          icon={CheckCircle}
          label="Assinaturas ativas"
          value={tenants.filter((tenant) => tenant.saasSubscriptionStatus === 'active').length}
          tone="success"
        />
        <MetricCard
          icon={Activity}
          label="Trials"
          value={tenants.filter((tenant) => tenant.status === 'trial').length}
          tone="info"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Atencao financeira"
          value={pastDue.length + suspended.length + asaasIssues.length}
          tone={pastDue.length || suspended.length || asaasIssues.length ? 'warning' : 'default'}
        />
      </div>

      <PlatformPlansPanel />

      <div className="card-base overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold text-foreground">Assinaturas e reconciliacao local</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Acoes provider permanecem fora da UI; divergencias apontam para investigacao e runbook.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-xs">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                {[
                  'Tenant',
                  'Plano',
                  'Assinatura',
                  'MRR',
                  'Proxima cobranca',
                  'Pagamento',
                  'Asaas',
                  'Risco',
                  'Acoes',
                ].map((header) => (
                  <th key={header} scope="col" className="px-4 py-3 text-left font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum tenant financeiro encontrado.
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => {
                  const risk =
                    tenant.saasSubscriptionStatus === 'past_due' || tenant.status === 'suspended'
                      ? 'Atencao'
                      : tenant.asaasSubaccountStatus === 'error'
                        ? 'Provider'
                        : 'OK';
                  return (
                    <tr key={tenant.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/tenants/${tenant.id}`}
                          className="font-semibold text-foreground hover:text-primary"
                        >
                          {tenant.clinicName}
                        </Link>
                        <p className="font-mono text-[11px] text-muted-foreground">{tenant.id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone="blue">{tenant.plan}</StatusPill>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone={statusTone(tenant.saasSubscriptionStatus)}>
                          {tenant.saasSubscriptionStatus}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                        {currency(tenant.mrr)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(tenant.nextBillingDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {tenant.paymentMethod || 'not_configured'}
                      </td>
                      <td className="px-4 py-3">
                        <ProviderStatus status={tenant.asaasSubaccountStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone={risk === 'OK' ? 'emerald' : 'amber'}>{risk}</StatusPill>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/tenants/${tenant.id}`}
                          className="text-xs font-semibold text-primary"
                        >
                          Abrir tenant
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UsageSection({ snapshot, search }: { snapshot: PlatformAdminSnapshot; search: string }) {
  const tenants = snapshot.tenants
    .filter((tenant) => matchesTenantSearch(tenant, search))
    .sort(
      (a, b) =>
        ratio(b.apiCallsThisMonth, b.apiLimitMonthly) -
        ratio(a.apiCallsThisMonth, a.apiLimitMonthly)
    );
  const quotaRisks = tenants.filter(
    (tenant) =>
      ratio(tenant.apiCallsThisMonth, tenant.apiLimitMonthly) >= 80 ||
      ratio(tenant.users, tenant.usersLimit) >= 80
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="Chamadas API"
          value={compact(tenants.reduce((sum, tenant) => sum + tenant.apiCallsThisMonth, 0))}
          tone="info"
        />
        <MetricCard
          icon={Users}
          label="Usuarios"
          value={compact(tenants.reduce((sum, tenant) => sum + tenant.users, 0))}
        />
        <MetricCard
          icon={Database}
          label="Pacientes"
          value={compact(tenants.reduce((sum, tenant) => sum + tenant.patients, 0))}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Risco de quota"
          value={quotaRisks.length}
          tone={quotaRisks.length ? 'warning' : 'success'}
        />
      </div>

      <div className="card-base overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold text-foreground">Consumo por tenant</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                {['Tenant', 'Usuarios', 'Pacientes', 'API mes', 'Agendamentos', 'Alerta'].map(
                  (header) => (
                    <th key={header} scope="col" className="px-4 py-3 text-left font-semibold">
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.map((tenant) => {
                const apiPct = ratio(tenant.apiCallsThisMonth, tenant.apiLimitMonthly);
                const usersPct = ratio(tenant.users, tenant.usersLimit);
                const alert =
                  apiPct >= 90 || usersPct >= 90
                    ? 'Critico'
                    : apiPct >= 75 || usersPct >= 75
                      ? 'Atencao'
                      : 'OK';
                return (
                  <tr key={tenant.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/tenants/${tenant.id}`}
                        className="font-semibold text-foreground hover:text-primary"
                      >
                        {tenant.clinicName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <UsageBar
                        used={tenant.users}
                        limit={tenant.usersLimit}
                        label={`${tenant.users}/${tenant.usersLimit}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                      {tenant.patients}
                    </td>
                    <td className="px-4 py-3">
                      <UsageBar
                        used={tenant.apiCallsThisMonth}
                        limit={tenant.apiLimitMonthly}
                        label={`${compact(tenant.apiCallsThisMonth)}/${compact(tenant.apiLimitMonthly)}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                      {tenant.appointmentsThisMonth}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill
                        tone={alert === 'OK' ? 'emerald' : alert === 'Critico' ? 'red' : 'amber'}
                      >
                        {alert}
                      </StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StorageSection({ snapshot, search }: { snapshot: PlatformAdminSnapshot; search: string }) {
  const tenants = snapshot.tenants
    .filter((tenant) => matchesTenantSearch(tenant, search))
    .sort(
      (a, b) =>
        ratio(b.storageUsedGb, b.storageCapacityGb) - ratio(a.storageUsedGb, a.storageCapacityGb)
    );
  const totalUsed = tenants.reduce((sum, tenant) => sum + tenant.storageUsedGb, 0);
  const totalCapacity = tenants.reduce((sum, tenant) => sum + tenant.storageCapacityGb, 0);
  const nearLimit = tenants.filter(
    (tenant) => ratio(tenant.storageUsedGb, tenant.storageCapacityGb) >= 80
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard icon={HardDrive} label="Storage usado" value={`${totalUsed.toFixed(1)} GB`} />
        <MetricCard icon={Database} label="Capacidade" value={`${totalCapacity.toFixed(0)} GB`} />
        <MetricCard
          icon={AlertTriangle}
          label="Proximos do limite"
          value={nearLimit.length}
          tone={nearLimit.length ? 'warning' : 'success'}
        />
        <MetricCard
          icon={ClipboardList}
          label="Docs D4Sign"
          value={compact(tenants.reduce((sum, tenant) => sum + tenant.d4signDocsUsed, 0))}
          tone="info"
        />
      </div>

      <div className="card-base overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold text-foreground">Armazenamento e documentos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                {['Tenant', 'Storage', 'D4Sign docs', 'Status D4Sign', 'Investigacao'].map(
                  (header) => (
                    <th key={header} scope="col" className="px-4 py-3 text-left font-semibold">
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/tenants/${tenant.id}`}
                      className="font-semibold text-foreground hover:text-primary"
                    >
                      {tenant.clinicName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <UsageBar
                      used={tenant.storageUsedGb}
                      limit={tenant.storageCapacityGb}
                      label={`${tenant.storageUsedGb.toFixed(1)}/${tenant.storageCapacityGb} GB`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <UsageBar
                      used={tenant.d4signDocsUsed}
                      limit={tenant.d4signDocsLimit}
                      label={`${tenant.d4signDocsUsed}/${tenant.d4signDocsLimit}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <ProviderStatus status={tenant.d4signStatus} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Signed URLs e payloads ficam fora da UI admin.
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

function IntegrationsSection({
  snapshot,
  search,
}: {
  snapshot: PlatformAdminSnapshot;
  search: string;
}) {
  const tenants = snapshot.tenants.filter((tenant) => matchesTenantSearch(tenant, search));
  const integrationIssues = tenants.filter(
    (tenant) =>
      ['error', 'blocked', 'quota_exceeded'].includes(tenant.asaasSubaccountStatus) ||
      ['error', 'blocked', 'quota_exceeded'].includes(tenant.d4signStatus)
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          icon={Link2}
          label="Asaas ativo"
          value={tenants.filter((tenant) => tenant.asaasSubaccountStatus === 'active').length}
          tone="success"
        />
        <MetricCard
          icon={ClipboardList}
          label="D4Sign ativo"
          value={tenants.filter((tenant) => tenant.d4signStatus === 'active').length}
          tone="info"
        />
        <MetricCard
          icon={Webhook}
          label="Webhooks com atencao"
          value={
            snapshot.webhooks.filter((event) =>
              ['failed', 'dead_letter', 'retrying'].includes(event.status)
            ).length
          }
          tone="warning"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Integracoes com erro"
          value={integrationIssues.length}
          tone={integrationIssues.length ? 'danger' : 'success'}
        />
      </div>

      <div className="card-base overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold text-foreground">Estado por tenant</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A UI nao provisiona nem chama providers; use apenas investigacao e reprocesso local.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-xs">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                {['Tenant', 'Asaas', 'Conta', 'D4Sign', 'Docs', 'Webhooks', 'Acoes'].map(
                  (header) => (
                    <th key={header} scope="col" className="px-4 py-3 text-left font-semibold">
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.map((tenant) => {
                const tenantWebhookIssues = snapshot.webhooks.filter(
                  (event) => event.tenantId === tenant.id && event.status !== 'processed'
                ).length;
                return (
                  <tr key={tenant.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/tenants/${tenant.id}`}
                        className="font-semibold text-foreground hover:text-primary"
                      >
                        {tenant.clinicName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <ProviderStatus status={tenant.asaasSubaccountStatus} />
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {tenant.asaasAccountId || 'N/D'}
                    </td>
                    <td className="px-4 py-3">
                      <ProviderStatus status={tenant.d4signStatus} />
                    </td>
                    <td className="px-4 py-3">
                      {tenant.d4signDocsUsed}/{tenant.d4signDocsLimit}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={tenantWebhookIssues ? 'amber' : 'emerald'}>
                        {tenantWebhookIssues} pendentes
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3">
                      <Link href="/admin/webhooks" className="text-xs font-semibold text-primary">
                        Monitorar webhooks
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SecuritySection({ snapshot }: { snapshot: PlatformAdminSnapshot }) {
  const pendingBreakGlass = snapshot.breakGlass.filter((request) => request.status === 'pending');
  const activeBreakGlass = snapshot.breakGlass.filter((request) => request.status === 'approved');
  const openCompliance = snapshot.complianceGaps.filter((gap) => gap.status === 'open');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          icon={Key}
          label="Break-glass pendente"
          value={pendingBreakGlass.length}
          tone={pendingBreakGlass.length ? 'warning' : 'success'}
        />
        <MetricCard
          icon={Shield}
          label="Break-glass ativo"
          value={activeBreakGlass.length}
          tone={activeBreakGlass.length ? 'danger' : 'success'}
        />
        <MetricCard
          icon={Users}
          label="Usuarios privilegiados"
          value={snapshot.privilegedUsers.length}
          tone="info"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Compliance aberto"
          value={openCompliance.length}
          tone={openCompliance.length ? 'warning' : 'success'}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="card-base overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-bold text-foreground">Break-glass global</h2>
          </div>
          <div className="divide-y divide-border">
            {snapshot.breakGlass.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">Nenhuma solicitacao encontrada.</p>
            ) : (
              snapshot.breakGlass.slice(0, 10).map((request) => (
                <div key={request.id} className="p-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{request.tenantName}</p>
                      <p className="mt-1 text-muted-foreground">{request.scope}</p>
                    </div>
                    <StatusPill tone={statusTone(request.status)}>{request.status}</StatusPill>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    {request.requestedBy} - {formatDate(request.requestedAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card-base overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-bold text-foreground">Usuarios privilegiados</h2>
          </div>
          <div className="divide-y divide-border">
            {snapshot.privilegedUsers.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                Nenhum usuario privilegiado retornado pelos detalhes operacionais.
              </p>
            ) : (
              snapshot.privilegedUsers.slice(0, 12).map((user) => (
                <div
                  key={`${user.tenantId}-${user.id}`}
                  className="grid gap-2 p-4 text-xs sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-semibold text-foreground">{user.name}</p>
                    <p className="mt-1 text-muted-foreground">
                      {user.tenantName} - {user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone="blue">{user.role}</StatusPill>
                    <StatusPill tone={user.mfaEnabled ? 'emerald' : 'amber'}>
                      MFA {user.mfaEnabled ? 'ativo' : 'N/D'}
                    </StatusPill>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold text-foreground">Compliance gaps</h2>
        </div>
        <div className="divide-y divide-border">
          {snapshot.complianceGaps.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              Nenhuma lacuna de compliance aberta.
            </p>
          ) : (
            snapshot.complianceGaps.slice(0, 12).map((gap) => (
              <div key={gap.id} className="grid gap-3 p-4 text-xs lg:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-semibold text-foreground">{gap.title}</p>
                  <p className="mt-1 text-muted-foreground">
                    {gap.tenantName} - {gap.area} - {gap.remediation || gap.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill
                    tone={gap.severity === 'critical' || gap.severity === 'high' ? 'red' : 'amber'}
                  >
                    {gap.severity}
                  </StatusPill>
                  <StatusPill tone={gap.status === 'open' ? 'amber' : 'emerald'}>
                    {gap.status}
                  </StatusPill>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SupportSection({
  snapshot,
  reload,
}: {
  snapshot: PlatformAdminSnapshot;
  reload: () => void;
}) {
  const permissions = useAdminPermissions();
  const [tenantId, setTenantId] = useState(snapshot.tenants[0]?.id ?? '');
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState<AdminSupportSession['priority']>('medio');
  const [reason, setReason] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AdminSupportSession['status']>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId && snapshot.tenants[0]) setTenantId(snapshot.tenants[0].id);
  }, [snapshot.tenants, tenantId]);

  const sessions = snapshot.support.filter(
    (session) => statusFilter === 'all' || session.status === statusFilter
  );

  const submit = async () => {
    setNotice(null);
    setError(null);
    setIsSubmitting(true);
    const { error: submitError } = await requestPlatformSupportSession({
      tenantId,
      subject,
      priority,
      reason,
    });
    setIsSubmitting(false);
    if (submitError) {
      setError(submitError.message);
      return;
    }
    setNotice('Suporte registrado com auditoria.');
    setSubject('');
    setReason('');
    reload();
  };

  const endSession = async (session: PlatformAdminSnapshot['support'][number]) => {
    setNotice(null);
    setError(null);
    setEndingId(session.id);
    const { error: endError } = await endPlatformSupportSession(session.id);
    setEndingId(null);
    if (endError) {
      setError(endError.message);
      return;
    }
    setNotice('Suporte encerrado com auditoria.');
    reload();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          icon={Headphones}
          label="Sessoes abertas"
          value={snapshot.support.filter((session) => session.status !== 'resolved').length}
          tone="warning"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Urgentes"
          value={snapshot.support.filter((session) => session.priority === 'urgente').length}
          tone="danger"
        />
        <MetricCard
          icon={Building2}
          label="Tenants com suporte"
          value={new Set(snapshot.support.map((session) => session.tenantId)).size}
          tone="info"
        />
        <MetricCard icon={Shield} label="Modo de acesso" value={permissions.roleLabel} />
      </div>

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="card-base p-5">
        <h2 className="mb-3 text-sm font-bold text-foreground">Abrir suporte por tenant</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_150px]">
          <select
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            className="input-base text-sm"
          >
            {snapshot.tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.clinicName}
              </option>
            ))}
          </select>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Assunto operacional"
            className="input-base text-sm"
          />
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as AdminSupportSession['priority'])}
            className="input-base text-sm"
          >
            <option value="baixo">Baixo</option>
            <option value="medio">Medio</option>
            <option value="alto">Alto</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Motivo auditavel. Minimo de 16 caracteres."
            className="input-base text-sm"
          />
          <button
            type="button"
            onClick={submit}
            disabled={
              !permissions.canManageSupport ||
              isSubmitting ||
              reason.trim().length < 16 ||
              subject.trim().length < 4
            }
            className="btn-primary text-xs"
            title={
              !permissions.canManageSupport
                ? 'Apenas owner/admin podem abrir suporte global.'
                : undefined
            }
          >
            Registrar suporte
          </button>
        </div>
      </div>

      <div className="card-base p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="input-base w-auto text-xs"
          >
            <option value="all">Todos os status</option>
            <option value="open">Abertos</option>
            <option value="pending">Pendentes</option>
            <option value="resolved">Resolvidos</option>
          </select>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="divide-y divide-border">
          {sessions.length === 0 ? (
            <DataState
              kind="empty"
              title="Nenhum suporte encontrado"
              className="border-0 bg-transparent"
            />
          ) : (
            sessions.map((session) => (
              <article key={session.id} className="grid gap-3 p-4 text-xs lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{session.subject}</span>
                    <StatusPill tone={statusTone(session.status)}>{session.status}</StatusPill>
                    <StatusPill tone={session.priority === 'urgente' ? 'red' : 'blue'}>
                      {session.priority}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {session.tenantName} - ultima atividade {formatDate(session.lastActivity)}
                  </p>
                  {session.reason ? <p className="mt-2 text-foreground">{session.reason}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/tenants/${session.tenantId}`}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    Tenant
                  </Link>
                  {session.status !== 'resolved' ? (
                    <button
                      type="button"
                      onClick={() => void endSession(session)}
                      disabled={!permissions.canManageSupport || endingId === session.id}
                      className="btn-ghost px-3 py-1.5 text-xs text-red-600"
                    >
                      Encerrar
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AuditSection({ snapshot, search }: { snapshot: PlatformAdminSnapshot; search: string }) {
  const [category, setCategory] = useState<'all' | AdminAuditEntry['category']>('all');
  const [selectedAudit, setSelectedAudit] = useState<AdminAuditEntry | null>(null);
  const entries = snapshot.audit.filter((entry) => {
    const matchCategory = category === 'all' || entry.category === category;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      [entry.action, entry.description, entry.admin, entry.category, entry.tenantName ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    return matchCategory && matchSearch;
  });

  const exportAudit = () => {
    const payload = entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      category: entry.category,
      tenantName: entry.tenantName ?? null,
      admin: entry.admin,
      timestamp: entry.timestamp,
      description: entry.description,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'admin-audit-redacted.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard icon={ClipboardList} label="Eventos" value={entries.length} tone="info" />
        <MetricCard
          icon={Shield}
          label="Seguranca"
          value={entries.filter((entry) => entry.category === 'security').length}
          tone="warning"
        />
        <MetricCard
          icon={CreditCard}
          label="Billing"
          value={entries.filter((entry) => entry.category === 'billing').length}
        />
        <MetricCard
          icon={Headphones}
          label="Suporte"
          value={entries.filter((entry) => entry.category === 'support').length}
        />
      </div>

      <div className="card-base p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-muted-foreground" />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
            className="input-base w-auto text-xs"
          >
            <option value="all">Todas categorias</option>
            <option value="billing">Billing</option>
            <option value="security">Seguranca</option>
            <option value="config">Config</option>
            <option value="support">Suporte</option>
            <option value="integration">Integracao</option>
          </select>
          <button type="button" onClick={exportAudit} className="btn-secondary px-3 py-2 text-xs">
            <Download size={13} />
            Export redigido
          </button>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-xs">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                {['Data', 'Categoria', 'Tenant', 'Ator', 'Acao', 'Detalhe'].map((header) => (
                  <th key={header} scope="col" className="px-4 py-3 text-left font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum evento auditado encontrado.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={entry.category === 'security' ? 'amber' : 'blue'}>
                        {entry.category}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3 text-foreground">{entry.tenantName ?? 'N/D'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{entry.admin}</td>
                    <td className="px-4 py-3 font-mono text-foreground">{entry.action}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedAudit(entry)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
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

      {selectedAudit ? (
        <Dialog
          open
          title="Evento de auditoria"
          description="Resumo redigido sem payload sensivel"
          placement="right"
          onOpenChange={(open) => {
            if (!open) setSelectedAudit(null);
          }}
        >
          <div className="space-y-3 text-sm">
            {[
              ['Acao', selectedAudit.action],
              ['Categoria', selectedAudit.category],
              ['Tenant', selectedAudit.tenantName ?? 'N/D'],
              ['Ator', selectedAudit.admin],
              ['Data', formatDate(selectedAudit.timestamp)],
              ['Descricao', selectedAudit.description],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 break-words text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function SectionContent({
  section,
  snapshot,
  search,
  reload,
}: {
  section: AdminOperationsSection;
  snapshot: PlatformAdminSnapshot;
  search: string;
  reload: () => void;
}) {
  if (section === 'billing') return <BillingSection snapshot={snapshot} search={search} />;
  if (section === 'usage') return <UsageSection snapshot={snapshot} search={search} />;
  if (section === 'storage') return <StorageSection snapshot={snapshot} search={search} />;
  if (section === 'integrations')
    return <IntegrationsSection snapshot={snapshot} search={search} />;
  if (section === 'security') return <SecuritySection snapshot={snapshot} />;
  if (section === 'support') return <SupportSection snapshot={snapshot} reload={reload} />;
  return <AuditSection snapshot={snapshot} search={search} />;
}

export default function AdminOperationsContent({ section }: { section: AdminOperationsSection }) {
  const config = sectionConfig[section];
  const permissions = useAdminPermissions();
  const [snapshot, setSnapshot] = useState<PlatformAdminSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadSnapshot = useCallback(() => {
    if (permissions.isLoading) return;
    if (!permissions.canAccessAdmin) {
      setSnapshot(null);
      setIsLoading(false);
      setLoadError(null);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    getPlatformAdminSnapshot().then(({ data, error }) => {
      setSnapshot(data);
      setLoadError(error?.message ?? null);
      setIsLoading(false);
    });
  }, [permissions.canAccessAdmin, permissions.isLoading]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  return (
    <AdminShell
      activeSection={config.active}
      title={config.title}
      description={config.description}
      onRefresh={loadSnapshot}
    >
      <div className="space-y-5">
        {permissions.isLoading ? (
          <DataState
            kind="loading"
            title="Confirmando permissoes administrativas"
            description="Validando sessao e papel antes de carregar dados operacionais."
          />
        ) : permissions.error ? (
          <DataState
            kind="error"
            title="Nao foi possivel confirmar a sessao"
            description={permissions.error}
            actionLabel="Tentar novamente"
            onAction={permissions.reload}
          />
        ) : !permissions.canAccessAdmin ? (
          <DataState
            kind="forbidden"
            title="Acesso admin indisponivel"
            description="Esta conta nao possui permissao para consultar o console operacional."
          />
        ) : (
          <>
            <PermissionModeBanner permissions={permissions} />

            {section !== 'support' && section !== 'security' && (
              <Toolbar search={search} onSearch={setSearch} />
            )}

            {isLoading ? (
              <DataState
                kind="loading"
                title="Carregando operacao administrativa"
                description="Buscando snapshot sanitizado e contratos relacionados."
              />
            ) : loadError ? (
              <DataState
                kind="error"
                title="Nao foi possivel carregar a operacao"
                description={loadError}
                actionLabel="Tentar novamente"
                onAction={loadSnapshot}
              />
            ) : snapshot ? (
              <>
                <WarningPanel warnings={snapshot.warnings} />
                <SectionContent
                  section={section}
                  snapshot={snapshot}
                  search={search}
                  reload={loadSnapshot}
                />
              </>
            ) : null}
          </>
        )}
      </div>
    </AdminShell>
  );
}
