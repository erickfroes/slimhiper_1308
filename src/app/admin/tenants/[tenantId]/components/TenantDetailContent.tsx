'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Ban,
  Building2,
  ClipboardList,
  Clock,
  CreditCard,
  Headphones,
  Key,
  Layers,
  Link2,
  Mail,
  MapPin,
  Phone,
  Shield,
  Unlock,
  User,
  Users,
  Webhook,
} from 'lucide-react';
import AdminShell from '@/app/admin/components/AdminShell';
import { useAdminPermissions } from '@/app/admin/components/adminPermissions';
import Dialog from '@/components/ui/Dialog';
import DataState from '@/components/ui/DataState';
import {
  decidePlatformBreakGlass,
  endPlatformSupportSession,
  getTenantDetail,
  getTenantEntitlements,
  invitePlatformTenantUser,
  listTenantWebhookSummaries,
  listWebhookReprocessJobs,
  listPlatformPlans,
  requestPlatformBreakGlass,
  requestPlatformSupportSession,
  requestWebhookReprocess,
  resendPlatformTenantInvite,
  revokePlatformBreakGlass,
  saveTenantEntitlements,
  updatePlatformTenantIntegrationState,
  updatePlatformTenantConfig,
  updatePlatformTenantMembership,
  upsertPlatformTenantUnit,
  type AdminPlatformPlan,
  type AdminBreakGlassRequest,
  type AdminSupportSession,
  type AdminTenantDetail,
  type AdminTenantEntitlementsState,
  type AdminTenantRow,
  type AdminIntegrationOperationalState,
  type AdminIntegrationProvider,
  type AdminWebhookEventSummary,
  type AdminWebhookReprocessJob,
} from '@/services/adminApi';
import {
  PLAN_MODULE_CATALOG,
  countPlanEntitlements,
  setPlanModuleEnabled,
  setPlanPartEnabled,
  type PlanEntitlements,
} from '@/services/planEntitlements';

type TenantTab =
  | 'overview'
  | 'users'
  | 'units'
  | 'billing'
  | 'integrations'
  | 'audit'
  | 'webhooks'
  | 'support'
  | 'breakglass';

type AuditCategory = AdminTenantDetail['auditLogs'][number]['category'];

const ADMIN_MUTABLE_ROLES = [
  'tenant_owner',
  'clinic_admin',
  'receptionist',
  'physician',
  'nutritionist',
  'fitness_professional',
  'financial_user',
  'external_professional',
] as const;

const ADMIN_MUTABLE_STATUSES = ['active', 'invited', 'suspended', 'revoked'] as const;

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

function StateBadge({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode;
  tone?: 'emerald' | 'blue' | 'amber' | 'red' | 'slate';
}) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-slate-100 text-slate-600',
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function badgeLabel(badge: string) {
  const labels: Record<string, string> = {
    required: 'obrigatorio',
    sensitive: 'sensivel',
    provider: 'provider',
    beta: 'beta',
  };
  return labels[badge] ?? badge;
}

function UsageBar({ used, limit, unit = '' }: { used: number; limit: number; unit?: string }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-400' : 'bg-teal-500';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground">
          {used}
          {unit}
        </span>
        <span className="text-muted-foreground">
          / {limit}
          {unit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct.toFixed(0)}% utilizado</span>
    </div>
  );
}

function webhookStatusTone(
  status: AdminWebhookEventSummary['status']
): 'emerald' | 'blue' | 'amber' | 'red' | 'slate' {
  if (status === 'processed') return 'emerald';
  if (status === 'dead_letter' || status === 'failed') return 'red';
  if (status === 'retrying') return 'amber';
  return 'blue';
}

function isWebhookReprocessable(status: AdminWebhookEventSummary['status']) {
  return (
    status === 'failed' || status === 'dead_letter' || status === 'retrying' || status === 'pending'
  );
}

function countTenantDoctors(users: AdminTenantDetail['users']) {
  return users.filter(
    (user) =>
      user.role === 'physician' &&
      (user.membershipStatus === 'active' || user.membershipStatus === 'invited')
  ).length;
}

function countPendingInvites(users: AdminTenantDetail['users']) {
  return users.filter((user) => user.membershipStatus === 'invited').length;
}

function membershipStatusTone(status: string): 'emerald' | 'blue' | 'amber' | 'red' | 'slate' {
  if (status === 'active') return 'emerald';
  if (status === 'invited') return 'blue';
  if (status === 'suspended') return 'amber';
  if (status === 'revoked') return 'red';
  return 'slate';
}

function integrationStateTone(
  state: AdminIntegrationOperationalState
): 'emerald' | 'blue' | 'amber' | 'red' | 'slate' {
  if (state === 'investigating') return 'amber';
  if (state === 'resolved') return 'blue';
  return 'emerald';
}

function SectionCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="card-base p-5">
      <div className="mb-4 flex items-center justify-between">
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

function TenantConfigPanel({
  detail,
  onReload,
}: {
  detail: AdminTenantDetail;
  onReload: () => void;
}) {
  const adminPermissions = useAdminPermissions();
  const tenant = detail.tenant;
  const [plans, setPlans] = useState<AdminPlatformPlan[]>([]);
  const [status, setStatus] = useState<'active' | 'suspended' | 'cancelled'>(
    tenant.status === 'trial' ? 'active' : tenant.status
  );
  const [planCode, setPlanCode] = useState(tenant.plan);
  const [doctorsLimit, setDoctorsLimit] = useState(String(tenant.doctorsLimit));
  const [featureFlagKey, setFeatureFlagKey] = useState('');
  const [featureFlagEnabled, setFeatureFlagEnabled] = useState(true);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const normalizedDoctorsLimit = Number(doctorsLimit);

  useEffect(() => {
    listPlatformPlans().then(({ data }) => setPlans(data));
  }, []);

  useEffect(() => {
    setStatus(tenant.status === 'trial' ? 'active' : tenant.status);
    setPlanCode(tenant.plan);
    setDoctorsLimit(String(tenant.doctorsLimit));
  }, [tenant.doctorsLimit, tenant.plan, tenant.status]);

  const saveConfig = async () => {
    setIsSaving(true);
    const { error } = await updatePlatformTenantConfig({
      tenantId: tenant.id,
      status,
      planCode,
      usage: {
        doctorsLimit: Number(doctorsLimit),
      },
      featureFlags: featureFlagKey.trim() ? { [featureFlagKey.trim()]: featureFlagEnabled } : {},
      reason,
    });
    setIsSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Tenant atualizado com auditoria.');
    setReason('');
    setFeatureFlagKey('');
    onReload();
  };

  return (
    <SectionCard title="Configuracao auditada" icon={Shield}>
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Alteracoes sao locais e auditadas. O plano limita apenas medicos; storage, API e D4Sign
        ficam como telemetria/estado operacional e esta tela nao chama providers.
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label>
          <span className="text-xs font-semibold text-foreground">Status tenant</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as 'active' | 'suspended' | 'cancelled')
            }
            className="input-base mt-1 text-sm"
          >
            <option value="active">Ativo</option>
            <option value="suspended">Suspenso</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </label>
        <label>
          <span className="text-xs font-semibold text-foreground">Plano local</span>
          <select
            value={planCode}
            onChange={(event) => setPlanCode(event.target.value as AdminTenantRow['plan'])}
            className="input-base mt-1 text-sm"
          >
            {plans.length === 0 ? <option value={tenant.plan}>{tenant.plan}</option> : null}
            {plans.map((plan) => (
              <option key={plan.id} value={plan.code}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-semibold text-foreground">Limite de medicos</span>
          <input
            type="number"
            min={1}
            max={10000}
            value={doctorsLimit}
            onChange={(event) => setDoctorsLimit(event.target.value)}
            className="input-base mt-1 text-sm"
          />
        </label>
        <label>
          <span className="text-xs font-semibold text-foreground">Feature flag opcional</span>
          <div className="mt-1 flex gap-2">
            <input
              value={featureFlagKey}
              onChange={(event) => setFeatureFlagKey(event.target.value)}
              placeholder="ex: billing.reconciliation"
              className="input-base text-sm"
            />
            <label className="flex items-center gap-1 rounded-lg border border-border px-2 text-xs">
              <input
                type="checkbox"
                checked={featureFlagEnabled}
                onChange={(event) => setFeatureFlagEnabled(event.target.checked)}
              />
              on
            </label>
          </div>
        </label>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo auditavel. Minimo de 16 caracteres."
          className="input-base text-sm"
        />
        <button
          type="button"
          onClick={saveConfig}
          disabled={
            !adminPermissions.canManageTenantConfig ||
            isSaving ||
            reason.trim().length < 16 ||
            !Number.isFinite(normalizedDoctorsLimit) ||
            normalizedDoctorsLimit < 1
          }
          className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
          title={
            adminPermissions.canManageTenantConfig
              ? undefined
              : 'Apenas owner/admin podem alterar configuracao.'
          }
        >
          Salvar configuracao
        </button>
      </div>
    </SectionCard>
  );
}

function TenantEntitlementsPanel({
  tenantId,
  onReload,
}: {
  tenantId: string;
  onReload: () => void;
}) {
  const adminPermissions = useAdminPermissions();
  const [state, setState] = useState<AdminTenantEntitlementsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<'sync' | 'override' | null>(null);
  const [draft, setDraft] = useState<PlanEntitlements | null>(null);
  const [selectedModuleKey, setSelectedModuleKey] = useState(PLAN_MODULE_CATALOG[1].key);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadEntitlements = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    getTenantEntitlements(tenantId).then(({ data, error }) => {
      setState(data);
      setLoadError(error?.message ?? null);
      setIsLoading(false);
    });
  }, [tenantId]);

  useEffect(() => {
    loadEntitlements();
  }, [loadEntitlements]);

  const currentSummary = state ? countPlanEntitlements(state.currentEntitlements) : null;
  const planSummary = state ? countPlanEntitlements(state.planEntitlements) : null;
  const selectedModule =
    PLAN_MODULE_CATALOG.find((module) => module.key === selectedModuleKey) ??
    PLAN_MODULE_CATALOG[0];
  const draftModuleState = draft?.modules[selectedModule.key];

  const closeDialog = () => {
    setDialogMode(null);
    setDraft(null);
    setReason('');
  };

  const submit = async () => {
    if (!dialogMode) return;
    setIsSaving(true);
    const { data, error } = await saveTenantEntitlements({
      tenantId,
      reason,
      entitlements: dialogMode === 'override' ? (draft ?? undefined) : undefined,
    });
    setIsSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data) setState(data);
    toast.success(
      dialogMode === 'override'
        ? 'Override de modulos salvo com auditoria.'
        : 'Modulos sincronizados com o plano.'
    );
    closeDialog();
    onReload();
    loadEntitlements();
  };

  const updateDraftModule = (moduleKey: string, enabled: boolean) => {
    setDraft((current) => (current ? setPlanModuleEnabled(current, moduleKey, enabled) : current));
  };

  const updateDraftPart = (moduleKey: string, partKey: string, enabled: boolean) => {
    setDraft((current) =>
      current ? setPlanPartEnabled(current, moduleKey, partKey, enabled) : current
    );
  };

  return (
    <SectionCard
      title="Modulos e entitlements"
      icon={Layers}
      action={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setDialogMode('sync');
              setReason('');
            }}
            disabled={!adminPermissions.canManageTenantConfig || isLoading || !state}
            className="btn-secondary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sincronizar com plano
          </button>
          <button
            type="button"
            onClick={() => {
              if (!state) return;
              setDraft(state.currentEntitlements);
              setDialogMode('override');
              setReason('');
            }}
            disabled={!adminPermissions.canManageTenantConfig || isLoading || !state}
            className="btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Override do tenant
          </button>
        </div>
      }
    >
      {isLoading ? (
        <DataState
          kind="loading"
          title="Carregando modulos"
          description="Buscando snapshot aplicado e plano atual."
          className="min-h-40 border-0 bg-transparent"
        />
      ) : loadError ? (
        <DataState
          kind="degraded"
          title="Snapshot de modulos indisponivel"
          description={loadError}
          className="min-h-40 border-0 bg-transparent"
        />
      ) : state && currentSummary && planSummary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Origem</p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {state.source === 'tenant_override' ? 'Override do tenant' : 'Snapshot do plano'}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Plano</p>
              <p className="mt-1 text-sm font-bold text-foreground">{state.planCode}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Modulos ativos</p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {currentSummary.enabledModules}/{currentSummary.totalModules}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="mt-1">
                <StateBadge tone={state.isOutOfSync ? 'amber' : 'emerald'}>
                  {state.isOutOfSync ? 'fora de sync' : 'em sync'}
                </StateBadge>
              </div>
            </div>
          </div>

          {state.isOutOfSync ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Este tenant nao muda automaticamente quando o plano e editado. Use sincronizacao
              manual para aplicar o plano atual com auditoria.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {PLAN_MODULE_CATALOG.map((module) => {
              const moduleState = state.currentEntitlements.modules[module.key];
              const enabledParts = module.parts.filter((part) => moduleState?.parts?.[part.key]);
              return (
                <div key={module.key} className="rounded-xl border border-border p-3 text-xs">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{module.label}</span>
                    <StateBadge tone={moduleState?.enabled ? 'emerald' : 'slate'}>
                      {moduleState?.enabled ? 'ativo' : 'bloqueado'}
                    </StateBadge>
                  </div>
                  <p className="line-clamp-2 text-muted-foreground">{module.description}</p>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    {enabledParts.length}/{module.parts.length} partes
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <DataState
          kind="empty"
          title="Sem snapshot modular"
          description="Ainda nao ha entitlements aplicados para este tenant."
          className="min-h-40 border-0 bg-transparent"
        />
      )}

      {dialogMode ? (
        <Dialog
          open
          title={dialogMode === 'override' ? 'Override de modulos' : 'Sincronizar com plano'}
          description={
            dialogMode === 'override'
              ? 'Salva um snapshot especifico para este tenant, sem alterar o plano global.'
              : 'Aplica manualmente os modulos do plano atual neste tenant.'
          }
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={closeDialog} className="btn-ghost px-4 py-2 text-xs">
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={isSaving || reason.trim().length < 16}
                className="btn-primary px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {dialogMode === 'sync' ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                A sincronizacao atualiza `tenants.settings`, `feature_flags` e permissões RBAC
                gerenciadas pelo catalogo. Nenhum provider externo sera chamado.
              </div>
            ) : draft ? (
              <div className="rounded-xl border border-border">
                <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr]">
                  <div className="border-b border-border p-2 md:border-b-0 md:border-r">
                    {PLAN_MODULE_CATALOG.map((module) => {
                      const moduleState = draft.modules[module.key];
                      return (
                        <button
                          key={module.key}
                          type="button"
                          onClick={() => setSelectedModuleKey(module.key)}
                          className={[
                            'mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs',
                            selectedModule.key === module.key
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted',
                          ].join(' ')}
                        >
                          <span className="truncate font-semibold">{module.label}</span>
                          <span
                            className={[
                              'h-2.5 w-2.5 rounded-full',
                              moduleState?.enabled ? 'bg-emerald-500' : 'bg-slate-300',
                            ].join(' ')}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-foreground">
                            {selectedModule.label}
                          </h4>
                          {selectedModule.badges?.map((badge) => (
                            <StateBadge
                              key={badge}
                              tone={
                                badge === 'provider'
                                  ? 'amber'
                                  : badge === 'required'
                                    ? 'blue'
                                    : badge === 'sensitive'
                                      ? 'red'
                                      : 'slate'
                              }
                            >
                              {badgeLabel(badge)}
                            </StateBadge>
                          ))}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedModule.description}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold">
                        <input
                          type="checkbox"
                          checked={draftModuleState?.enabled === true}
                          disabled={selectedModule.required}
                          onChange={(event) =>
                            updateDraftModule(selectedModule.key, event.target.checked)
                          }
                        />
                        Ativo
                      </label>
                    </div>

                    <div className="space-y-2">
                      {selectedModule.parts.map((part) => (
                        <label
                          key={part.key}
                          className="flex items-start gap-3 rounded-lg border border-border p-3"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={draftModuleState?.parts?.[part.key] === true}
                            disabled={!draftModuleState?.enabled}
                            onChange={(event) =>
                              updateDraftPart(selectedModule.key, part.key, event.target.checked)
                            }
                          />
                          <span className="min-w-0">
                            <span className="text-xs font-semibold text-foreground">
                              {part.label}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {part.description}
                            </span>
                          </span>
                        </label>
                      ))}
                      {selectedModule.parts.length === 0 ? (
                        <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                          Modulo core sem partes configuraveis.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <label className="block">
              <span className="text-xs font-semibold text-foreground">Motivo auditavel</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explique a sincronizacao ou override. Minimo de 16 caracteres."
                className="input-base mt-1 min-h-24 text-sm"
              />
            </label>
          </div>
        </Dialog>
      ) : null}
    </SectionCard>
  );
}

function OverviewTab({ detail, onReload }: { detail: AdminTenantDetail; onReload: () => void }) {
  const tenant = detail.tenant;
  const doctorsUsed = countTenantDoctors(detail.users);
  const pendingInvites = countPendingInvites(detail.users);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard title="Perfil do Tenant" icon={Building2}>
          <div className="space-y-3">
            {[
              { icon: User, label: 'Owner', value: tenant.owner },
              { icon: Mail, label: 'Email', value: tenant.email },
              { icon: Phone, label: 'Telefone', value: tenant.phone || 'N/D' },
              { icon: Building2, label: 'CNPJ', value: tenant.cnpj || 'N/D' },
              { icon: Clock, label: 'Criado em', value: formatDate(tenant.createdAt) },
              { icon: Activity, label: 'Atividade', value: formatDate(tenant.lastActivityAt) },
            ].map(({ icon: FieldIcon, label, value }) => (
              <div key={label} className="flex items-center gap-2.5">
                <FieldIcon size={13} className="flex-shrink-0 text-muted-foreground" />
                <span className="w-24 flex-shrink-0 text-xs text-muted-foreground">{label}</span>
                <span className="truncate text-xs font-medium text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Faturamento SaaS" icon={CreditCard}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <StateBadge tone={tenant.saasSubscriptionStatus === 'past_due' ? 'red' : 'emerald'}>
                {tenant.saasSubscriptionStatus}
              </StateBadge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Plano</span>
              <StateBadge tone="blue">{tenant.plan}</StateBadge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">MRR</span>
              <span className="text-sm font-bold text-foreground">{currency(tenant.mrr)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Medicos no plano</span>
              <span className="text-xs font-semibold text-foreground">
                {doctorsUsed}/{tenant.doctorsLimit}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Proxima cobranca</span>
              <span className="text-xs font-medium text-foreground">
                {formatDate(tenant.nextBillingDate)}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Integracoes" icon={Link2}>
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Asaas</span>
                <StateBadge tone={tenant.asaasSubaccountStatus === 'active' ? 'emerald' : 'amber'}>
                  {tenant.asaasSubaccountStatus}
                </StateBadge>
              </div>
              <p className="text-xs text-muted-foreground">
                Conta redigida:{' '}
                <span className="font-mono text-foreground">{tenant.asaasAccountId || 'N/D'}</span>
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">D4Sign</span>
                <StateBadge tone={tenant.d4signStatus === 'active' ? 'emerald' : 'amber'}>
                  {tenant.d4signStatus}
                </StateBadge>
              </div>
              <p className="text-xs text-muted-foreground">
                Estado local sanitizado. Acoes provider-related ficam bloqueadas por contrato.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Metricas operacionais" icon={Activity}>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Users size={11} /> Medicos
            </p>
            <UsageBar used={doctorsUsed} limit={tenant.doctorsLimit} />
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Mail size={11} /> Convites pendentes
            </p>
            <p className="text-2xl font-bold tabular-nums text-foreground">{pendingInvites}</p>
            <p className="text-xs text-muted-foreground">{tenant.users} usuarios totais</p>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Activity size={11} /> API no mes
            </p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {tenant.apiCallsThisMonth}
            </p>
            <p className="text-xs text-muted-foreground">Telemetria read-only</p>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Activity size={11} /> Agendamentos mes
            </p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {tenant.appointmentsThisMonth}
            </p>
            <p className="text-xs text-muted-foreground">{tenant.patients} pacientes</p>
          </div>
        </div>
      </SectionCard>

      <TenantConfigPanel detail={detail} onReload={onReload} />
      <TenantEntitlementsPanel tenantId={tenant.id} onReload={onReload} />
    </div>
  );
}

function BillingTab({ detail, onReload }: { detail: AdminTenantDetail; onReload: () => void }) {
  const tenant = detail.tenant;
  const doctorsUsed = countTenantDoctors(detail.users);
  const billingAudit = detail.auditLogs.filter(
    (entry) =>
      entry.category === 'billing' ||
      entry.action.includes('billing') ||
      entry.action.includes('subscription') ||
      entry.action.includes('plan')
  );
  const asaasWebhookErrors = detail.webhookErrors.filter((webhook) =>
    webhook.event.toLowerCase().includes('asaas')
  );
  const hasBillingRisk =
    tenant.saasSubscriptionStatus === 'past_due' ||
    tenant.status === 'suspended' ||
    tenant.asaasSubaccountStatus === 'error' ||
    asaasWebhookErrors.length > 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SectionCard title="Assinatura local" icon={CreditCard}>
          <div className="space-y-3 text-xs">
            {[
              ['Plano', tenant.plan],
              ['Status assinatura', tenant.saasSubscriptionStatus],
              ['MRR', currency(tenant.mrr)],
              ['Medicos no plano', `${doctorsUsed}/${tenant.doctorsLimit}`],
              ['Proxima cobranca', formatDate(tenant.nextBillingDate)],
              ['Metodo', tenant.paymentMethod || 'not_configured'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Divergencias e conciliacao" icon={AlertTriangle}>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Risco financeiro</span>
              <StateBadge tone={hasBillingRisk ? 'amber' : 'emerald'}>
                {hasBillingRisk ? 'Atencao' : 'OK'}
              </StateBadge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Asaas local</span>
              <StateBadge tone={tenant.asaasSubaccountStatus === 'active' ? 'emerald' : 'amber'}>
                {tenant.asaasSubaccountStatus}
              </StateBadge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Webhooks Asaas com erro</span>
              <span className="font-semibold text-foreground">{asaasWebhookErrors.length}</span>
            </div>
            <a href="#configuracao-auditada" className="btn-secondary mt-2 text-xs">
              Ajustar plano/status local
            </a>
          </div>
        </SectionCard>
      </div>

      <div id="configuracao-auditada">
        <TenantConfigPanel detail={detail} onReload={onReload} />
      </div>

      <TenantEntitlementsPanel tenantId={tenant.id} onReload={onReload} />

      <SectionCard title="Historico financeiro auditado" icon={ClipboardList}>
        {billingAudit.length === 0 ? (
          <DataState
            kind="empty"
            title="Sem eventos financeiros auditados"
            description="Alteracoes de plano, status ou billing local aparecerao aqui."
            className="min-h-40 border-0 bg-transparent"
          />
        ) : (
          <div className="space-y-2">
            {billingAudit.slice(0, 12).map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-foreground">{entry.action}</span>
                  <span className="text-muted-foreground">{formatDate(entry.timestamp)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {entry.description} por {entry.admin}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function IntegrationsTab({
  detail,
  onReload,
}: {
  detail: AdminTenantDetail;
  onReload: () => void;
}) {
  const adminPermissions = useAdminPermissions();
  const tenant = detail.tenant;
  const openWebhooks = detail.webhookErrors.filter((webhook) => webhook.status !== 'resolved');
  const integrationAudit = detail.auditLogs.filter(
    (entry) => entry.category === 'integration' || entry.action.includes('webhook')
  );
  const [actionTarget, setActionTarget] = useState<{
    provider: AdminIntegrationProvider;
    state: AdminIntegrationOperationalState;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const closeActionDialog = () => {
    if (isSaving) return;
    setActionTarget(null);
    setReason('');
  };

  const submitIntegrationAction = async () => {
    if (!actionTarget) return;
    setIsSaving(true);
    const { error } = await updatePlatformTenantIntegrationState({
      tenantId: tenant.id,
      provider: actionTarget.provider,
      state: actionTarget.state,
      reason,
    });
    setIsSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Estado local da integracao atualizado com auditoria.');
    closeActionDialog();
    onReload();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <SectionCard title="Asaas" icon={CreditCard}>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status local</span>
              <StateBadge tone={tenant.asaasSubaccountStatus === 'active' ? 'emerald' : 'amber'}>
                {tenant.asaasSubaccountStatus}
              </StateBadge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Operacao admin</span>
              <StateBadge tone={integrationStateTone(tenant.integrationOperations.asaas.state)}>
                {tenant.integrationOperations.asaas.state}
              </StateBadge>
            </div>
            <div>
              <p className="text-muted-foreground">Conta redigida</p>
              <p className="mt-1 break-all font-mono text-foreground">
                {tenant.asaasAccountId || 'N/D'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {(['investigating', 'resolved', 'normal'] as const).map((state) => (
                <button
                  key={`asaas-${state}`}
                  type="button"
                  onClick={() => setActionTarget({ provider: 'asaas', state })}
                  disabled={!adminPermissions.canManageTenantConfig || isSaving}
                  className="btn-ghost px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {state === 'investigating'
                    ? 'Investigar'
                    : state === 'resolved'
                      ? 'Resolver localmente'
                      : 'Normalizar'}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="D4Sign" icon={Link2}>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status local</span>
              <StateBadge tone={tenant.d4signStatus === 'active' ? 'emerald' : 'amber'}>
                {tenant.d4signStatus}
              </StateBadge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Operacao admin</span>
              <StateBadge tone={integrationStateTone(tenant.integrationOperations.d4sign.state)}>
                {tenant.integrationOperations.d4sign.state}
              </StateBadge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Docs processados</span>
              <span className="font-semibold text-foreground">{tenant.d4signDocsUsed}</span>
            </div>
            <p className="rounded-lg border border-border bg-muted/30 p-3 text-muted-foreground">
              Provider-related: exibicao sanitizada, sem chamada real a D4Sign pela UI.
            </p>
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {(['investigating', 'resolved', 'normal'] as const).map((state) => (
                <button
                  key={`d4sign-${state}`}
                  type="button"
                  onClick={() => setActionTarget({ provider: 'd4sign', state })}
                  disabled={!adminPermissions.canManageTenantConfig || isSaving}
                  className="btn-ghost px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {state === 'investigating'
                    ? 'Investigar'
                    : state === 'resolved'
                      ? 'Resolver localmente'
                      : 'Normalizar'}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Operacoes locais" icon={Webhook}>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Webhooks abertos</span>
              <StateBadge tone={openWebhooks.length ? 'amber' : 'emerald'}>
                {openWebhooks.length}
              </StateBadge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/webhooks" className="btn-secondary px-3 py-1.5 text-xs">
                Monitor global
              </Link>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Auditoria de integracoes" icon={ClipboardList}>
        {integrationAudit.length === 0 ? (
          <DataState
            kind="empty"
            title="Sem eventos de integracao auditados"
            description="Reprocessos e alteracoes locais de integracao aparecerao aqui."
            className="min-h-40 border-0 bg-transparent"
          />
        ) : (
          <div className="space-y-2">
            {integrationAudit.slice(0, 12).map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-foreground">{entry.action}</span>
                  <span className="text-muted-foreground">{formatDate(entry.timestamp)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {entry.description} por {entry.admin}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      {actionTarget ? (
        <Dialog
          open
          title="Atualizar integracao local"
          description="Registra apenas estado operacional local. Nenhuma chamada sera enviada para Asaas ou D4Sign."
          onOpenChange={(open) => {
            if (!open) closeActionDialog();
          }}
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeActionDialog}
                disabled={isSaving}
                className="btn-ghost px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitIntegrationAction}
                disabled={
                  !adminPermissions.canManageTenantConfig || isSaving || reason.trim().length < 16
                }
                className="btn-primary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Salvando...' : 'Salvar estado local'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
              <p className="font-semibold text-foreground">
                {actionTarget.provider.toUpperCase()} {'>'} {actionTarget.state}
              </p>
              <p className="mt-1 text-muted-foreground">
                Estado local auditado para acompanhamento operacional.
              </p>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-foreground">Motivo auditavel</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explique a mudanca local de estado. Minimo de 16 caracteres."
                className="input-base mt-1 min-h-24 text-sm"
              />
            </label>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function UsersTab({ detail, onReload }: { detail: AdminTenantDetail; onReload: () => void }) {
  const adminPermissions = useAdminPermissions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [roleCode, setRoleCode] = useState('');
  const [status, setStatus] = useState('');
  const [unitId, setUnitId] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRoleCode, setInviteRoleCode] =
    useState<(typeof ADMIN_MUTABLE_ROLES)[number]>('receptionist');
  const [inviteUnitId, setInviteUnitId] = useState('');
  const [inviteReason, setInviteReason] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [resendTarget, setResendTarget] = useState<AdminTenantDetail['users'][number] | null>(null);
  const [resendReason, setResendReason] = useState('');
  const [isResending, setIsResending] = useState(false);

  const startEdit = (user: AdminTenantDetail['users'][number]) => {
    setEditingId(user.id);
    setRoleCode(user.role);
    setStatus(user.membershipStatus);
    setUnitId(user.unitId ?? '');
    setReason('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRoleCode('');
    setStatus('');
    setUnitId('');
    setReason('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setIsSaving(true);
    const { error } = await updatePlatformTenantMembership({
      tenantId: detail.tenant.id,
      membershipId: editingId,
      roleCode,
      status,
      unitId: unitId || null,
      reason,
    });
    setIsSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Usuario do tenant atualizado com auditoria.');
    cancelEdit();
    onReload();
  };

  const sendInvite = async () => {
    setIsInviting(true);
    const { error } = await invitePlatformTenantUser({
      tenantId: detail.tenant.id,
      email: inviteEmail,
      fullName: inviteName,
      roleCode: inviteRoleCode,
      unitId: inviteUnitId || null,
      reason: inviteReason,
    });
    setIsInviting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Convite registrado com Auth Admin e auditoria.');
    setInviteEmail('');
    setInviteName('');
    setInviteRoleCode('receptionist');
    setInviteUnitId('');
    setInviteReason('');
    onReload();
  };

  const closeResendDialog = () => {
    if (isResending) return;
    setResendTarget(null);
    setResendReason('');
  };

  const resendInvite = async () => {
    if (!resendTarget) return;
    setIsResending(true);
    const { data, error } = await resendPlatformTenantInvite({
      tenantId: detail.tenant.id,
      membershipId: resendTarget.id,
      reason: resendReason,
    });
    setIsResending(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Convite reenviado para ${data?.emailRedacted ?? 'usuario convidado'}.`);
    closeResendDialog();
    onReload();
  };

  return (
    <SectionCard
      title="Usuarios"
      icon={Users}
      action={<span className="text-xs text-muted-foreground">{detail.users.length} usuarios</span>}
    >
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Mail size={14} className="text-emerald-700" />
          <div>
            <p className="text-xs font-bold text-emerald-900">Convidar usuario via Auth Admin</p>
            <p className="text-xs text-emerald-800">
              O convite roda em rota server-side com service role, valida tenant/role/unidade e
              grava audit log com motivo obrigatorio.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_180px_180px]">
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="email@clinica.com"
            className="input-base text-xs"
          />
          <input
            value={inviteName}
            onChange={(event) => setInviteName(event.target.value)}
            placeholder="Nome opcional"
            className="input-base text-xs"
          />
          <select
            value={inviteRoleCode}
            onChange={(event) =>
              setInviteRoleCode(event.target.value as (typeof ADMIN_MUTABLE_ROLES)[number])
            }
            className="input-base text-xs"
          >
            {ADMIN_MUTABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <select
            value={inviteUnitId}
            onChange={(event) => setInviteUnitId(event.target.value)}
            className="input-base text-xs"
          >
            <option value="">Todas as unidades</option>
            {detail.units.map((unitOption) => (
              <option key={unitOption.id} value={unitOption.id}>
                {unitOption.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <input
            value={inviteReason}
            onChange={(event) => setInviteReason(event.target.value)}
            placeholder="Motivo auditavel do convite. Minimo de 16 caracteres."
            className="input-base text-xs"
          />
          <button
            type="button"
            onClick={sendInvite}
            disabled={
              !adminPermissions.canManageTenantUsers ||
              isInviting ||
              inviteReason.trim().length < 16 ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())
            }
            className="btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            title={
              adminPermissions.canManageTenantUsers
                ? undefined
                : 'Apenas owner/admin podem convidar usuarios.'
            }
          >
            Enviar convite
          </button>
        </div>
      </div>
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Alteracoes em usuarios ja vinculados continuam por RPC auditada, com motivo obrigatorio e
        sem writes diretos do browser em tabelas de RBAC.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {['Nome', 'Email', 'Papel', 'Status', 'Unidade', 'MFA', 'Criado em', 'Acoes'].map(
                (header) => (
                  <th
                    key={header}
                    scope="col"
                    className="px-3 py-2 text-left font-medium text-muted-foreground"
                  >
                    {header}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.users.map((user) => {
              const isEditing = editingId === user.id;
              const unit = detail.units.find((item) => item.id === user.unitId);
              return (
                <React.Fragment key={user.id}>
                  <tr className="hover:bg-muted/40">
                    <td className="px-3 py-2.5 font-medium text-foreground">{user.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{user.email}</td>
                    <td className="px-3 py-2.5">
                      <StateBadge tone="slate">{user.role}</StateBadge>
                    </td>
                    <td className="px-3 py-2.5">
                      <StateBadge tone={membershipStatusTone(user.membershipStatus)}>
                        {user.membershipStatus}
                      </StateBadge>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {unit?.name ?? (user.unitId ? 'Unidade vinculada' : 'Todas')}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {user.mfaEnabled ? 'Ativo' : 'N/D'}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(user)}
                          className="btn-ghost px-3 py-1.5 text-xs"
                        >
                          Editar
                        </button>
                        {user.membershipStatus === 'invited' ? (
                          <button
                            type="button"
                            onClick={() => setResendTarget(user)}
                            disabled={!adminPermissions.canManageTenantUsers || isResending}
                            className="btn-secondary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                              adminPermissions.canManageTenantUsers
                                ? undefined
                                : 'Apenas owner/admin podem reenviar convites.'
                            }
                          >
                            Reenviar convite
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {isEditing ? (
                    <tr>
                      <td colSpan={8} className="bg-muted/30 px-3 py-3">
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[180px_150px_180px_1fr_auto]">
                          <select
                            value={roleCode}
                            onChange={(event) => setRoleCode(event.target.value)}
                            className="input-base text-xs"
                          >
                            {ADMIN_MUTABLE_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                          <select
                            value={status}
                            onChange={(event) => setStatus(event.target.value)}
                            className="input-base text-xs"
                          >
                            {ADMIN_MUTABLE_STATUSES.map((statusOption) => (
                              <option key={statusOption} value={statusOption}>
                                {statusOption}
                              </option>
                            ))}
                          </select>
                          <select
                            value={unitId}
                            onChange={(event) => setUnitId(event.target.value)}
                            className="input-base text-xs"
                          >
                            <option value="">Todas as unidades</option>
                            {detail.units.map((unitOption) => (
                              <option key={unitOption.id} value={unitOption.id}>
                                {unitOption.name}
                              </option>
                            ))}
                          </select>
                          <input
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Motivo auditavel. Minimo de 16 caracteres."
                            className="input-base text-xs"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={
                                !adminPermissions.canManageTenantUsers ||
                                isSaving ||
                                reason.trim().length < 16
                              }
                              className="btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                              title={
                                adminPermissions.canManageTenantUsers
                                  ? undefined
                                  : 'Apenas owner/admin podem editar usuarios.'
                              }
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="btn-ghost px-3 py-1.5 text-xs"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {resendTarget ? (
        <Dialog
          open
          title="Reenviar convite"
          description="O convite sera reenviado pelo Auth Admin com redirecionamento para criacao de senha. O link nao sera exibido na UI."
          onOpenChange={(open) => {
            if (!open) closeResendDialog();
          }}
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeResendDialog}
                disabled={isResending}
                className="btn-ghost px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={resendInvite}
                disabled={
                  !adminPermissions.canManageTenantUsers ||
                  isResending ||
                  resendReason.trim().length < 16
                }
                className="btn-primary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isResending ? 'Reenviando...' : 'Reenviar convite'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
              <p className="font-semibold text-foreground">{resendTarget.name}</p>
              <p className="mt-1 text-muted-foreground">{resendTarget.email}</p>
              <p className="mt-1 text-muted-foreground">
                Papel: <span className="font-mono">{resendTarget.role}</span>
              </p>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-foreground">Motivo auditavel</span>
              <textarea
                value={resendReason}
                onChange={(event) => setResendReason(event.target.value)}
                placeholder="Explique por que o convite precisa ser reenviado. Minimo de 16 caracteres."
                className="input-base mt-1 min-h-24 text-sm"
              />
            </label>
          </div>
        </Dialog>
      ) : null}
    </SectionCard>
  );
}

function UnitsTab({ detail, onReload }: { detail: AdminTenantDetail; onReload: () => void }) {
  const adminPermissions = useAdminPermissions();
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [status, setStatus] = useState<AdminTenantDetail['units'][number]['status']>('active');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const startUnitEdit = (unit: AdminTenantDetail['units'][number]) => {
    setEditingUnitId(unit.id);
    setName(unit.name);
    setCode('');
    setCity(unit.city);
    setState(unit.state);
    setStatus(unit.status);
    setReason('');
  };

  const resetUnitDraft = () => {
    setEditingUnitId(null);
    setName('');
    setCode('');
    setCity('');
    setState('');
    setStatus('active');
    setReason('');
  };

  const saveUnit = async () => {
    setIsSaving(true);
    const { error } = await upsertPlatformTenantUnit({
      tenantId: detail.tenant.id,
      unitId: editingUnitId,
      name,
      code,
      city,
      state,
      status,
      reason,
    });
    setIsSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      editingUnitId ? 'Unidade atualizada com auditoria.' : 'Unidade criada com auditoria.'
    );
    resetUnitDraft();
    onReload();
  };

  return (
    <SectionCard
      title="Unidades"
      icon={MapPin}
      action={<span className="text-xs text-muted-foreground">{detail.units.length} unidades</span>}
    >
      <div className="mb-4 rounded-xl border border-border bg-muted/20 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_140px_1fr_80px_140px]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome da unidade"
            className="input-base text-xs"
          />
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={editingUnitId ? 'Codigo atual' : 'codigo'}
            className="input-base text-xs"
          />
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Cidade"
            className="input-base text-xs"
          />
          <input
            value={state}
            onChange={(event) => setState(event.target.value.toUpperCase().slice(0, 2))}
            placeholder="UF"
            className="input-base text-xs"
          />
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as AdminTenantDetail['units'][number]['status'])
            }
            className="input-base text-xs"
          >
            <option value="active">Ativa</option>
            <option value="inactive">Inativa</option>
            <option value="archived">Arquivada</option>
          </select>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto]">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Motivo auditavel. Minimo de 16 caracteres."
            className="input-base text-xs"
          />
          <button
            type="button"
            onClick={saveUnit}
            disabled={
              !adminPermissions.canManageTenantConfig ||
              isSaving ||
              !name.trim() ||
              reason.trim().length < 16
            }
            className="btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            title={
              adminPermissions.canManageTenantConfig
                ? undefined
                : 'Apenas owner/admin podem alterar unidades.'
            }
          >
            {editingUnitId ? 'Salvar unidade' : 'Criar unidade'}
          </button>
          {editingUnitId ? (
            <button
              type="button"
              onClick={resetUnitDraft}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {detail.units.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Nenhuma unidade cadastrada.
          </div>
        ) : (
          detail.units.map((unit) => (
            <div key={unit.id} className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{unit.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[unit.city, unit.state].filter(Boolean).join(', ') || 'Sem localizacao'}
                  </p>
                </div>
                <StateBadge tone={unit.status === 'active' ? 'emerald' : 'slate'}>
                  {unit.status}
                </StateBadge>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users size={11} /> {unit.users} usuarios
                </span>
                <span className="flex items-center gap-1">
                  <Activity size={11} /> {unit.patients} pacientes
                </span>
              </div>
              <button
                type="button"
                onClick={() => startUnitEdit(unit)}
                className="btn-ghost mt-3 px-3 py-1.5 text-xs"
              >
                Editar
              </button>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}

function AuditTab({ detail }: { detail: AdminTenantDetail }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | AuditCategory>('all');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredLogs = detail.auditLogs.filter((entry) => {
    const matchesCategory = category === 'all' || entry.category === category;
    const matchesQuery =
      !normalizedQuery ||
      [entry.action, entry.description, entry.admin]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });
  const selectedEntry = filteredLogs.find((entry) => entry.id === selectedEntryId) ?? null;

  return (
    <SectionCard title="Log de Auditoria" icon={ClipboardList}>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por acao, descricao ou ator"
          className="input-base text-xs"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as 'all' | AuditCategory)}
          className="input-base text-xs"
        >
          <option value="all">Todas categorias</option>
          <option value="billing">Billing</option>
          <option value="security">Seguranca</option>
          <option value="config">Config</option>
          <option value="support">Suporte</option>
          <option value="integration">Integracao</option>
        </select>
      </div>
      <div className="space-y-1">
        {filteredLogs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma acao auditada encontrada para este filtro.
          </div>
        ) : (
          filteredLogs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelectedEntryId(entry.id)}
              className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-muted/40"
            >
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                <ClipboardList size={13} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">{entry.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.action} por {entry.admin}
                </p>
              </div>
              <span className="flex-shrink-0 text-xs text-muted-foreground">
                {formatDate(entry.timestamp)}
              </span>
            </button>
          ))
        )}
      </div>
      {selectedEntry ? (
        <Dialog
          open
          title="Detalhe auditado"
          description="Visualizacao sanitizada. Payloads brutos e segredos nao sao exibidos."
          onOpenChange={(open) => {
            if (!open) setSelectedEntryId(null);
          }}
        >
          <div className="space-y-3 text-xs">
            {[
              ['Acao', selectedEntry.action],
              ['Categoria', selectedEntry.category],
              ['Ator', selectedEntry.admin],
              ['Horario', formatDate(selectedEntry.timestamp)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-muted-foreground">{label}</p>
                <p className="mt-1 break-words font-semibold text-foreground">{value}</p>
              </div>
            ))}
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-muted-foreground">Resumo redigido</p>
              <p className="mt-1 text-foreground">{selectedEntry.description}</p>
            </div>
          </div>
        </Dialog>
      ) : null}
    </SectionCard>
  );
}

function WebhooksTab({ detail }: { detail: AdminTenantDetail }) {
  const adminPermissions = useAdminPermissions();
  const [events, setEvents] = useState<AdminWebhookEventSummary[]>([]);
  const [jobs, setJobs] = useState<AdminWebhookReprocessJob[]>([]);
  const [providerFilter, setProviderFilter] = useState<
    'all' | AdminWebhookEventSummary['provider']
  >('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AdminWebhookEventSummary['status']>(
    'all'
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reprocessTarget, setReprocessTarget] = useState<AdminWebhookEventSummary | null>(null);
  const [detailTarget, setDetailTarget] = useState<AdminWebhookEventSummary | null>(null);
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState(
    `Tenant ${detail.tenant.clinicName}: reprocessar evento sanitizado pelo monitor admin`
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTenantWebhookOps = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    Promise.all([listTenantWebhookSummaries(detail.tenant.id, 100), listWebhookReprocessJobs(100)])
      .then(([eventsResult, jobsResult]) => {
        setEvents(eventsResult.data);
        setJobs(jobsResult.data.filter((job) => job.tenantId === detail.tenant.id));
        setLoadError(eventsResult.error?.message ?? jobsResult.error?.message ?? null);
      })
      .catch(() => {
        setEvents([]);
        setJobs([]);
        setLoadError('Falha ao carregar eventos e jobs de webhook do tenant.');
      })
      .finally(() => setIsLoading(false));
  }, [detail.tenant.id]);

  useEffect(() => {
    loadTenantWebhookOps();
  }, [loadTenantWebhookOps]);

  const visibleEvents = events.filter((event) => {
    const matchProvider = providerFilter === 'all' || event.provider === providerFilter;
    const matchStatus = statusFilter === 'all' || event.status === statusFilter;
    return matchProvider && matchStatus;
  });

  const latestJobByEvent = jobs.reduce<Record<string, AdminWebhookReprocessJob>>((acc, job) => {
    const current = acc[job.eventId];
    if (!current || new Date(job.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      acc[job.eventId] = job;
    }
    return acc;
  }, {});

  const jobsForDetail = detailTarget
    ? jobs
        .filter((job) => job.eventId === detailTarget.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  const submitReprocess = async () => {
    if (!reprocessTarget) return;
    setIsSubmitting(true);
    const { error } = await requestWebhookReprocess({
      provider: reprocessTarget.provider,
      eventId: reprocessTarget.id,
      reason,
      scope,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Job de reprocesso registrado com auditoria.');
    setReprocessTarget(null);
    setReason('');
    setScope(
      `Tenant ${detail.tenant.clinicName}: reprocessar evento sanitizado pelo monitor admin`
    );
    loadTenantWebhookOps();
  };

  return (
    <SectionCard title="Erros de Webhook" icon={Webhook}>
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Reprocessos criam jobs locais auditados. Esta tela nao executa replay direto nem chama Asaas
        ou D4Sign.
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={providerFilter}
          onChange={(event) =>
            setProviderFilter(event.target.value as 'all' | AdminWebhookEventSummary['provider'])
          }
          className="input-base w-auto text-xs"
        >
          <option value="all">Todos providers</option>
          <option value="Asaas">Asaas</option>
          <option value="D4Sign">D4Sign</option>
        </select>
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as 'all' | AdminWebhookEventSummary['status'])
          }
          className="input-base w-auto text-xs"
        >
          <option value="all">Todos status</option>
          <option value="pending">Pendentes</option>
          <option value="retrying">Retrying</option>
          <option value="failed">Falhos</option>
          <option value="dead_letter">Dead-letter</option>
          <option value="processed">Processados</option>
        </select>
        <button type="button" onClick={loadTenantWebhookOps} className="btn-secondary text-xs">
          Atualizar eventos
        </button>
      </div>

      {isLoading ? (
        <DataState
          kind="loading"
          title="Carregando webhooks do tenant"
          description="Buscando eventos sanitizados e jobs de reprocesso."
          className="min-h-40"
        />
      ) : loadError && events.length === 0 && detail.webhookErrors.length === 0 ? (
        <DataState
          kind="error"
          title="Webhooks indisponiveis"
          description={loadError}
          actionLabel="Tentar novamente"
          onAction={loadTenantWebhookOps}
          className="min-h-40"
        />
      ) : visibleEvents.length === 0 ? (
        <div className="space-y-3">
          {loadError ? (
            <DataState
              kind="degraded"
              title="Snapshot de webhooks degradado"
              description={loadError}
              actionLabel="Tentar novamente"
              onAction={loadTenantWebhookOps}
              className="min-h-40"
            />
          ) : (
            <DataState
              kind="empty"
              title="Nenhum webhook encontrado"
              description="Nao ha eventos no filtro atual para este tenant."
              className="min-h-40"
            />
          )}
          {detail.webhookErrors.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              O detalhe legado ainda reporta {detail.webhookErrors.length} erro(s), mas sem provider
              suficiente para reprocesso direto. Use o monitor global se precisar investigar.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-xs">
            <thead>
              <tr className="border-b border-border">
                {[
                  'Provider',
                  'Evento',
                  'Status',
                  'Tentativas',
                  'Job local',
                  'Erro sanitizado',
                  'Recebido',
                  'Acoes',
                ].map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className="px-3 py-2 text-left font-medium text-muted-foreground"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleEvents.map((webhook) => {
                const job = latestJobByEvent[webhook.id];
                const eligible = isWebhookReprocessable(webhook.status);
                return (
                  <tr key={webhook.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2.5 font-semibold text-foreground">
                      {webhook.provider}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-mono font-medium text-foreground">{webhook.eventType}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {webhook.externalId} / {webhook.idempotencyKey}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <StateBadge tone={webhookStatusTone(webhook.status)}>
                        {webhook.status}
                      </StateBadge>
                    </td>
                    <td className="px-3 py-2.5 text-center font-medium text-foreground">
                      {webhook.retryCount}
                    </td>
                    <td className="px-3 py-2.5">
                      {job ? (
                        <div>
                          <StateBadge
                            tone={
                              job.status === 'processed'
                                ? 'emerald'
                                : job.status === 'failed' || job.status === 'not_reprocessable'
                                  ? 'red'
                                  : 'amber'
                            }
                          >
                            {job.status}
                          </StateBadge>
                          <p className="mt-1 text-muted-foreground">{formatDate(job.createdAt)}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Sem job</span>
                      )}
                    </td>
                    <td className="max-w-[260px] truncate px-3 py-2.5 text-muted-foreground">
                      {webhook.errorSummary || 'Sem erro detalhado'}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {formatDate(webhook.receivedAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(webhook)}
                          className="btn-secondary px-3 py-1.5 text-xs"
                        >
                          Detalhes
                        </button>
                        <button
                          type="button"
                          onClick={() => setReprocessTarget(webhook)}
                          disabled={!adminPermissions.canReprocessWebhooks || !eligible}
                          className="btn-ghost px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            !adminPermissions.canReprocessWebhooks
                              ? 'Apenas owner/admin podem solicitar reprocesso.'
                              : !eligible
                                ? 'Evento nao elegivel para reprocesso.'
                                : undefined
                          }
                        >
                          Reprocessar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailTarget ? (
        <Dialog
          open
          title="Detalhe do webhook"
          description="Resumo sanitizado. Payload bruto, headers, secrets e URLs assinadas ficam ocultos."
          onOpenChange={(open) => {
            if (!open) setDetailTarget(null);
          }}
          placement="right"
        >
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StateBadge tone={webhookStatusTone(detailTarget.status)}>
                  {detailTarget.status}
                </StateBadge>
                <StateBadge tone="blue">{detailTarget.provider}</StateBadge>
              </div>
              <p className="font-mono font-semibold text-foreground">{detailTarget.eventType}</p>
              <p className="mt-1 text-muted-foreground">
                Recebido {formatDate(detailTarget.receivedAt)}; processado{' '}
                {formatDate(detailTarget.processedAt)}.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {[
                ['Tenant', detailTarget.tenant],
                ['Paciente ref', detailTarget.patientRef ?? 'N/D'],
                ['External ID redigido', detailTarget.externalId],
                ['Idempotency key redigida', detailTarget.idempotencyKey],
                ['Tentativas', String(detailTarget.retryCount)],
                ['Erro sanitizado', detailTarget.errorSummary ?? 'Sem erro detalhado'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border p-3">
                  <p className="text-muted-foreground">{label}</p>
                  <p className="mt-1 break-words font-medium text-foreground">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
              Payload bruto indisponivel nesta UI por seguranca. Use apenas o resumo sanitizado e os
              jobs locais auditados para operacao.
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold text-foreground">Timeline de jobs locais</h4>
              {jobsForDetail.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-muted-foreground">
                  Nenhum job local registrado para este evento.
                </p>
              ) : (
                <div className="space-y-2">
                  {jobsForDetail.map((job) => (
                    <div key={job.id} className="rounded-xl border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StateBadge
                          tone={
                            job.status === 'processed'
                              ? 'emerald'
                              : job.status === 'failed' || job.status === 'not_reprocessable'
                                ? 'red'
                                : 'amber'
                          }
                        >
                          {job.status}
                        </StateBadge>
                        <span className="text-muted-foreground">{formatDate(job.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-muted-foreground">Motivo: {job.reason}</p>
                      {job.errorMessage ? (
                        <p className="mt-1 text-red-700">Erro sanitizado: {job.errorMessage}</p>
                      ) : null}
                      <p className="mt-1 text-muted-foreground">
                        Processado: {formatDate(job.processedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Dialog>
      ) : null}

      {reprocessTarget ? (
        <Dialog
          open
          title="Solicitar reprocesso"
          description="Cria job local auditado sem executar provider call"
          onOpenChange={(open) => {
            if (!open) setReprocessTarget(null);
          }}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setReprocessTarget(null)}
                className="btn-ghost px-4 py-2 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitReprocess}
                disabled={
                  isSubmitting ||
                  reason.trim().length < 12 ||
                  scope.trim().length < 8 ||
                  !adminPermissions.canReprocessWebhooks
                }
                className="btn-primary px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                Registrar job
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
              <p className="font-semibold text-foreground">
                {reprocessTarget.provider} - {reprocessTarget.eventType}
              </p>
              <p className="mt-1 text-muted-foreground">
                Status {reprocessTarget.status}; recebido {formatDate(reprocessTarget.receivedAt)}.
              </p>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-foreground">Escopo operacional</span>
              <input
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                className="input-base mt-1 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-foreground">Motivo auditavel</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explique por que este evento deve entrar na fila local de reprocesso."
                className="input-base mt-1 min-h-24 text-sm"
              />
            </label>
          </div>
        </Dialog>
      ) : null}
    </SectionCard>
  );
}

function SupportTab({ detail, onReload }: { detail: AdminTenantDetail; onReload: () => void }) {
  const adminPermissions = useAdminPermissions();
  const [subject, setSubject] = useState('');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<AdminSupportSession['priority']>('medio');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);

  const submit = async () => {
    setIsSubmitting(true);
    const { error } = await requestPlatformSupportSession({
      tenantId: detail.tenant.id,
      subject,
      reason,
      priority,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Sessao de suporte registrada com auditoria.');
    setSubject('');
    setReason('');
    onReload();
  };

  const endSession = async (session: AdminSupportSession) => {
    setEndingId(session.id);
    const { error } = await endPlatformSupportSession(session.id);
    setEndingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Sessao de suporte encerrada com auditoria.');
    onReload();
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Nova Sessao de Suporte" icon={Headphones}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px]">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Assunto operacional"
            className="input-base text-sm"
          />
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as typeof priority)}
            className="input-base text-sm"
          >
            <option value="baixo">Baixo</option>
            <option value="medio">Medio</option>
            <option value="alto">Alto</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo auditavel. Minimo de 16 caracteres."
          className="input-base mt-3 min-h-24 w-full text-sm"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!adminPermissions.canManageSupport || isSubmitting || reason.trim().length < 16}
          className="btn-primary mt-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          title={
            adminPermissions.canManageSupport
              ? undefined
              : 'Apenas owner/admin podem registrar suporte.'
          }
        >
          Registrar suporte
        </button>
      </SectionCard>

      <SectionCard title="Sessoes Registradas" icon={Headphones}>
        <div className="space-y-3">
          {detail.supportSessions.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma sessao de suporte.</div>
          ) : (
            detail.supportSessions.map((session) => (
              <div key={session.id} className="rounded-xl border border-border p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{session.subject}</span>
                  <StateBadge tone={session.status === 'resolved' ? 'emerald' : 'amber'}>
                    {session.status}
                  </StateBadge>
                  <StateBadge tone="blue">{session.priority}</StateBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aberto em {formatDate(session.openedAt)} - ultima atividade{' '}
                  {formatDate(session.lastActivity)}
                </p>
                {session.reason ? (
                  <p className="mt-2 text-xs text-foreground">{session.reason}</p>
                ) : null}
                {session.status !== 'resolved' ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => endSession(session)}
                      disabled={!adminPermissions.canManageSupport || endingId === session.id}
                      className="btn-ghost px-3 py-1.5 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        adminPermissions.canManageSupport
                          ? undefined
                          : 'Apenas owner/admin podem encerrar suporte.'
                      }
                    >
                      Encerrar suporte
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function BreakGlassTab({ detail, onReload }: { detail: AdminTenantDetail; onReload: () => void }) {
  const adminPermissions = useAdminPermissions();
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState('Leitura de configuracoes e logs operacionais');
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revocationReasons, setRevocationReasons] = useState<Record<string, string>>({});

  const submit = async () => {
    setIsSubmitting(true);
    const { error } = await requestPlatformBreakGlass({
      tenantId: detail.tenant.id,
      reason,
      scope,
      durationMinutes,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Solicitacao break-glass registrada.');
    setReason('');
    onReload();
  };

  const decide = async (request: AdminBreakGlassRequest, decision: 'approved' | 'denied') => {
    setDecidingId(request.id);
    const { error } = await decidePlatformBreakGlass({ requestId: request.id, decision });
    setDecidingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Break-glass ${decision === 'approved' ? 'aprovado' : 'negado'}.`);
    onReload();
  };

  const revoke = async (request: AdminBreakGlassRequest) => {
    setRevokingId(request.id);
    const { error } = await revokePlatformBreakGlass({
      requestId: request.id,
      reason: revocationReasons[request.id] ?? '',
    });
    setRevokingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Break-glass revogado com auditoria.');
    setRevocationReasons((current) => {
      const next = { ...current };
      delete next[request.id];
      return next;
    });
    onReload();
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Nova Solicitacao Break-Glass" icon={Key}>
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800">
            Acesso temporario exige motivo, escopo e aprovacao de outro administrador. Aprovacao
            propria e bloqueada no RPC.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px]">
          <input
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="input-base text-sm"
            placeholder="Escopo permitido"
          />
          <input
            type="number"
            min={15}
            max={240}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
            className="input-base text-sm"
          />
        </div>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo auditavel. Minimo de 24 caracteres."
          className="input-base mt-3 min-h-24 w-full text-sm"
        />
        <button
          type="button"
          onClick={submit}
          disabled={
            !adminPermissions.canManageBreakGlass ||
            isSubmitting ||
            reason.trim().length < 24 ||
            scope.trim().length < 8
          }
          className="btn-primary mt-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          title={
            adminPermissions.canManageBreakGlass
              ? undefined
              : 'Apenas owner/admin podem operar break-glass.'
          }
        >
          Solicitar break-glass
        </button>
      </SectionCard>

      <SectionCard title="Solicitacoes" icon={Shield}>
        <div className="space-y-3">
          {detail.breakGlassRequests.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma solicitacao break-glass.</div>
          ) : (
            detail.breakGlassRequests.map((request) => (
              <div key={request.id} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                      {request.status === 'approved' ? (
                        <Unlock size={13} className="text-emerald-600" />
                      ) : request.status === 'pending' ? (
                        <Clock size={13} className="text-amber-600" />
                      ) : (
                        <Ban size={13} className="text-slate-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Solicitado por {request.requestedBy}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(request.requestedAt)}
                      </p>
                    </div>
                  </div>
                  <StateBadge
                    tone={
                      request.status === 'approved'
                        ? 'emerald'
                        : request.status === 'denied'
                          ? 'red'
                          : 'amber'
                    }
                  >
                    {request.status}
                  </StateBadge>
                </div>
                <div className="space-y-1.5 text-xs">
                  <p>
                    <span className="text-muted-foreground">Motivo: </span>
                    <span className="text-foreground">{request.reason}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Escopo: </span>
                    <span className="text-foreground">{request.scope}</span>
                  </p>
                  {request.approvedBy ? (
                    <p>
                      <span className="text-muted-foreground">Aprovado por: </span>
                      <span className="text-foreground">{request.approvedBy}</span>
                    </p>
                  ) : null}
                  {request.expiresAt ? (
                    <p>
                      <span className="text-muted-foreground">Expira em: </span>
                      <span className="text-foreground">{formatDate(request.expiresAt)}</span>
                    </p>
                  ) : null}
                </div>
                {request.status === 'pending' ? (
                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => decide(request, 'approved')}
                      disabled={!adminPermissions.canManageBreakGlass || decidingId === request.id}
                      className="btn-primary px-3 py-1.5 text-xs"
                      title={
                        adminPermissions.canManageBreakGlass
                          ? undefined
                          : 'Apenas owner/admin podem aprovar break-glass.'
                      }
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(request, 'denied')}
                      disabled={!adminPermissions.canManageBreakGlass || decidingId === request.id}
                      className="btn-ghost px-3 py-1.5 text-xs text-red-600"
                      title={
                        adminPermissions.canManageBreakGlass
                          ? undefined
                          : 'Apenas owner/admin podem negar break-glass.'
                      }
                    >
                      Negar
                    </button>
                  </div>
                ) : request.status === 'approved' ? (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <textarea
                      value={revocationReasons[request.id] ?? ''}
                      onChange={(event) =>
                        setRevocationReasons((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder="Motivo auditavel da revogacao. Minimo de 12 caracteres."
                      className="input-base min-h-20 w-full text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => revoke(request)}
                      disabled={
                        !adminPermissions.canManageBreakGlass ||
                        revokingId === request.id ||
                        (revocationReasons[request.id]?.trim().length ?? 0) < 12
                      }
                      className="btn-ghost px-3 py-1.5 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        adminPermissions.canManageBreakGlass
                          ? undefined
                          : 'Apenas owner/admin podem revogar break-glass.'
                      }
                    >
                      Revogar acesso
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function TabContent({
  activeTab,
  detail,
  onReload,
}: {
  activeTab: TenantTab;
  detail: AdminTenantDetail;
  onReload: () => void;
}) {
  if (activeTab === 'overview') return <OverviewTab detail={detail} onReload={onReload} />;
  if (activeTab === 'users') return <UsersTab detail={detail} onReload={onReload} />;
  if (activeTab === 'units') return <UnitsTab detail={detail} onReload={onReload} />;
  if (activeTab === 'billing') return <BillingTab detail={detail} onReload={onReload} />;
  if (activeTab === 'integrations') return <IntegrationsTab detail={detail} onReload={onReload} />;
  if (activeTab === 'audit') return <AuditTab detail={detail} />;
  if (activeTab === 'webhooks') return <WebhooksTab detail={detail} />;
  if (activeTab === 'support') return <SupportTab detail={detail} onReload={onReload} />;
  return <BreakGlassTab detail={detail} onReload={onReload} />;
}

export default function TenantDetailContent() {
  const params = useParams();
  const tenantId = params?.tenantId as string;
  const [activeTab, setActiveTab] = useState<TenantTab>('overview');
  const [detail, setDetail] = useState<AdminTenantDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDetail = useCallback(() => {
    if (!tenantId) return;
    setIsLoading(true);
    setLoadError(null);
    getTenantDetail(tenantId).then(({ data, error }) => {
      setDetail(data);
      setLoadError(error?.message ?? null);
      setIsLoading(false);
    });
  }, [tenantId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const tabs = useMemo(
    () =>
      detail
        ? [
            { key: 'overview', label: 'Visao Geral', icon: Activity },
            { key: 'users', label: 'Usuarios', icon: Users, count: detail.users.length },
            { key: 'units', label: 'Unidades', icon: MapPin, count: detail.units.length },
            {
              key: 'billing',
              label: 'Billing',
              icon: CreditCard,
              count: detail.auditLogs.filter(
                (entry) => entry.category === 'billing' || entry.action.includes('billing')
              ).length,
            },
            {
              key: 'integrations',
              label: 'Integracoes',
              icon: Link2,
              count: detail.webhookErrors.filter((item) => item.status !== 'resolved').length,
            },
            {
              key: 'audit',
              label: 'Auditoria',
              icon: ClipboardList,
              count: detail.auditLogs.length,
            },
            {
              key: 'webhooks',
              label: 'Webhooks',
              icon: Webhook,
              count: detail.webhookErrors.filter((item) => item.status !== 'resolved').length,
            },
            {
              key: 'support',
              label: 'Suporte',
              icon: Headphones,
              count: detail.supportSessions.filter((item) => item.status !== 'resolved').length,
            },
            {
              key: 'breakglass',
              label: 'Break-Glass',
              icon: Key,
              count: detail.breakGlassRequests.filter((item) => item.status === 'pending').length,
            },
          ]
        : [],
    [detail]
  );

  if (isLoading || loadError || !detail) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Link
          href="/admin/tenants"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Voltar para tenants
        </Link>
        <div className="card-base mt-6 max-w-xl p-8 text-center">
          {isLoading ? (
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <AlertTriangle size={28} className="mx-auto text-red-600" />
          )}
          <h1 className="mt-4 text-lg font-bold text-foreground">
            {isLoading ? 'Carregando tenant' : 'Tenant indisponivel'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isLoading ? 'Buscando dados reais do tenant.' : loadError}
          </p>
        </div>
      </div>
    );
  }

  const tenant = detail.tenant;

  return (
    <AdminShell
      activeSection="tenants"
      onRefresh={loadDetail}
      mainClassName="flex-1 overflow-y-auto scrollbar-thin"
      breadcrumbs={
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-primary">
            Admin
          </Link>
          <span>/</span>
          <Link href="/admin/tenants" className="hover:text-primary">
            Gestao de Tenants
          </Link>
          <span>/</span>
          <span className="font-medium text-foreground">{tenant.clinicName}</span>
        </div>
      }
    >
      <div className="border-b border-border bg-card px-6 pb-4 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Link
              href="/admin/tenants"
              className="mt-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <div className="mb-1.5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 size={20} className="text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">{tenant.clinicName}</h1>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{tenant.id}</span>
                    <TenantStatusBadge status={tenant.status} />
                    <StateBadge tone="blue">{tenant.plan}</StateBadge>
                  </div>
                </div>
              </div>
              <p className="ml-14 text-sm text-muted-foreground">
                {tenant.owner} - {tenant.email} - Criado em {formatDate(tenant.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <StateBadge tone={tenant.openSupportSessions > 0 ? 'amber' : 'slate'}>
              {tenant.openSupportSessions} suporte
            </StateBadge>
            <StateBadge tone={tenant.pendingBreakGlass > 0 ? 'red' : 'slate'}>
              {tenant.pendingBreakGlass} break-glass
            </StateBadge>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-1 overflow-x-auto scrollbar-thin">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.key;
            const count = 'count' in tab ? (tab.count ?? 0) : 0;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as TenantTab)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <TabIcon size={13} />
                {tab.label}
                {count > 0 ? (
                  <span
                    className={`min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-xs font-bold ${
                      isActive ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-5 p-6">
        <TabContent activeTab={activeTab} detail={detail} onReload={loadDetail} />
      </div>
    </AdminShell>
  );
}
