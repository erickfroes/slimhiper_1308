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
import {
  decidePlatformBreakGlass,
  endPlatformSupportSession,
  getTenantDetail,
  invitePlatformTenantUser,
  listPlatformPlans,
  requestPlatformBreakGlass,
  requestPlatformSupportSession,
  revokePlatformBreakGlass,
  updatePlatformTenantConfig,
  updatePlatformTenantMembership,
  upsertPlatformTenantUnit,
  type AdminPlatformPlan,
  type AdminBreakGlassRequest,
  type AdminSupportSession,
  type AdminTenantDetail,
  type AdminTenantRow,
} from '@/services/adminApi';

type TenantTab = 'overview' | 'users' | 'units' | 'audit' | 'webhooks' | 'support' | 'breakglass';

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
  const [usersLimit, setUsersLimit] = useState(String(tenant.usersLimit));
  const [storageCapacityGb, setStorageCapacityGb] = useState(String(tenant.storageCapacityGb));
  const [apiLimitMonthly, setApiLimitMonthly] = useState(String(tenant.apiLimitMonthly));
  const [featureFlagKey, setFeatureFlagKey] = useState('');
  const [featureFlagEnabled, setFeatureFlagEnabled] = useState(true);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listPlatformPlans().then(({ data }) => setPlans(data));
  }, []);

  const saveConfig = async () => {
    setIsSaving(true);
    const { error } = await updatePlatformTenantConfig({
      tenantId: tenant.id,
      status,
      planCode,
      usage: {
        usersLimit: Number(usersLimit),
        storageCapacityGb: Number(storageCapacityGb),
        apiLimitMonthly: Number(apiLimitMonthly),
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
        Alteracoes sao locais e auditadas. Esta tela nao chama Asaas ou D4Sign.
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
          <span className="text-xs font-semibold text-foreground">Limite usuarios</span>
          <input
            type="number"
            min={1}
            value={usersLimit}
            onChange={(event) => setUsersLimit(event.target.value)}
            className="input-base mt-1 text-sm"
          />
        </label>
        <label>
          <span className="text-xs font-semibold text-foreground">Storage GB</span>
          <input
            type="number"
            min={1}
            value={storageCapacityGb}
            onChange={(event) => setStorageCapacityGb(event.target.value)}
            className="input-base mt-1 text-sm"
          />
        </label>
        <label>
          <span className="text-xs font-semibold text-foreground">API mensal</span>
          <input
            type="number"
            min={1}
            value={apiLimitMonthly}
            onChange={(event) => setApiLimitMonthly(event.target.value)}
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
            !adminPermissions.canManageTenantConfig || isSaving || reason.trim().length < 16
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

function OverviewTab({ detail, onReload }: { detail: AdminTenantDetail; onReload: () => void }) {
  const tenant = detail.tenant;
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
                Conta:{' '}
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
              <UsageBar used={tenant.d4signDocsUsed} limit={tenant.d4signDocsLimit} unit=" docs" />
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Metricas de Uso" icon={Activity}>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <UsageBar used={tenant.users} limit={tenant.usersLimit} />
          <UsageBar
            used={Number(tenant.storageUsedGb.toFixed(1))}
            limit={tenant.storageCapacityGb}
            unit=" GB"
          />
          <UsageBar used={tenant.apiCallsThisMonth} limit={tenant.apiLimitMonthly} />
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
                      <StateBadge tone={user.status === 'active' ? 'emerald' : 'slate'}>
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
                      <button
                        type="button"
                        onClick={() => startEdit(user)}
                        className="btn-ghost px-3 py-1.5 text-xs"
                      >
                        Editar
                      </button>
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
  return (
    <SectionCard title="Log de Auditoria" icon={ClipboardList}>
      <div className="space-y-1">
        {detail.auditLogs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma acao auditada para este tenant.
          </div>
        ) : (
          detail.auditLogs.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 rounded-xl p-3 hover:bg-muted/40">
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
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}

function WebhooksTab({ detail }: { detail: AdminTenantDetail }) {
  return (
    <SectionCard title="Erros de Webhook" icon={Webhook}>
      {detail.webhookErrors.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Nenhum erro de webhook registrado.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Evento', 'Erro', 'Severidade', 'Tentativas', 'Status', 'Timestamp'].map(
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
              {detail.webhookErrors.map((webhook) => (
                <tr key={webhook.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2.5 font-mono font-medium text-foreground">
                    {webhook.event}
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-muted-foreground">
                    {webhook.error || 'Sem erro detalhado'}
                  </td>
                  <td className="px-3 py-2.5">
                    <StateBadge tone={webhook.severity === 'critico' ? 'red' : 'amber'}>
                      {webhook.severity}
                    </StateBadge>
                  </td>
                  <td className="px-3 py-2.5 text-center font-medium text-foreground">
                    {webhook.retries}
                  </td>
                  <td className="px-3 py-2.5">
                    <StateBadge tone={webhook.status === 'resolved' ? 'emerald' : 'amber'}>
                      {webhook.status}
                    </StateBadge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatDate(webhook.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
