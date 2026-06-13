'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Activity,
  Ban,
  Building2,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  CreditCard,
  Filter,
  HardDrive,
  Loader2,
  Mail,
  MapPin,
  Plus,
  Search,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import AdminShell from '@/app/admin/components/AdminShell';
import { useAdminPermissions } from '@/app/admin/components/adminPermissions';
import {
  createTenant,
  listPlatformPlans,
  listTenants,
  type AdminPlatformPlan,
  type AdminTenantRow,
  type CreateTenantInput,
} from '@/services/adminApi';

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

type CreateTenantStep = 'clinic' | 'owner' | 'plan';
type TenantDraftErrors = Partial<Record<keyof CreateTenantInput | 'plans', string>>;

const CREATE_TENANT_STEPS: Array<{
  key: CreateTenantStep;
  label: string;
  icon: React.ElementType;
}> = [
  { key: 'clinic', label: 'Clinica', icon: Building2 },
  { key: 'owner', label: 'Owner', icon: Mail },
  { key: 'plan', label: 'Plano', icon: MapPin },
];

function createEmptyTenantDraft(): CreateTenantInput {
  return {
    clinicName: '',
    slug: '',
    cnpj: '',
    phone: '',
    website: '',
    ownerName: '',
    ownerEmail: '',
    reason: '',
    planCode: '',
    unitName: 'Matriz',
    unitCode: 'matriz',
    city: '',
    state: '',
  };
}

function slugifyTenant(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

function isSafeSlug(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(value);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatPlanPrice(plan: AdminPlatformPlan) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: plan.currency || 'BRL',
    maximumFractionDigits: 0,
  }).format(plan.amountCents / 100);
}

function planFeatureText(plan: AdminPlatformPlan) {
  const usersLimit = Number(plan.features.users_limit ?? plan.features.usersLimit);
  const storageGb = Number(plan.features.storage_gb ?? plan.features.storageGb);
  const parts = [
    Number.isFinite(usersLimit) && usersLimit > 0 ? `${usersLimit} usuarios` : null,
    Number.isFinite(storageGb) && storageGb > 0 ? `${storageGb} GB` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : 'Limites padrao do plano';
}

function validateTenantDraft(
  draft: CreateTenantInput,
  step: CreateTenantStep,
  plans: AdminPlatformPlan[]
): TenantDraftErrors {
  const errors: TenantDraftErrors = {};

  if (step === 'clinic') {
    if (draft.clinicName.trim().length < 3) errors.clinicName = 'Informe a clinica.';
    if (!isSafeSlug(draft.slug.trim())) errors.slug = 'Use 3 a 60 caracteres, letras, numeros e -.';
  }

  if (step === 'owner') {
    if (!draft.ownerName.trim()) errors.ownerName = 'Informe o owner.';
    if (!isEmail(draft.ownerEmail)) errors.ownerEmail = 'Informe um e-mail valido.';
    if (draft.reason.trim().length < 16) {
      errors.reason = 'Motivo auditavel deve ter pelo menos 16 caracteres.';
    }
  }

  if (step === 'plan') {
    if (plans.length === 0) errors.plans = 'Nenhum plano ativo configurado.';
    if (!draft.planCode || !plans.some((plan) => plan.code === draft.planCode)) {
      errors.planCode = 'Selecione um plano ativo.';
    }
    if (!draft.unitName.trim()) errors.unitName = 'Informe a unidade padrao.';
    if (draft.unitCode && !isSafeSlug(draft.unitCode.trim())) {
      errors.unitCode = 'Use letras, numeros e - no codigo.';
    }
    const uf = (draft.state ?? '').trim();
    if (uf && !/^[A-Za-z]{2}$/.test(uf)) errors.state = 'UF deve ter 2 letras.';
  }

  return errors;
}

function getAllTenantDraftErrors(
  draft: CreateTenantInput,
  plans: AdminPlatformPlan[]
): TenantDraftErrors {
  return {
    ...validateTenantDraft(draft, 'clinic', plans),
    ...validateTenantDraft(draft, 'owner', plans),
    ...validateTenantDraft(draft, 'plan', plans),
  };
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs font-medium text-red-600">{message}</p> : null;
}

function CreateTenantModal({
  open,
  plans,
  plansLoading,
  plansError,
  onClose,
  onRetryPlans,
  onCreated,
}: {
  open: boolean;
  plans: AdminPlatformPlan[];
  plansLoading: boolean;
  plansError: string | null;
  onClose: () => void;
  onRetryPlans: () => void;
  onCreated: (tenantId: string) => void;
}) {
  const [activeStep, setActiveStep] = useState<CreateTenantStep>('clinic');
  const [draft, setDraft] = useState<CreateTenantInput>(() => createEmptyTenantDraft());
  const [slugTouched, setSlugTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActiveStep('clinic');
    setDraft(createEmptyTenantDraft());
    setSlugTouched(false);
    setShowErrors(false);
    setSubmitError(null);
  }, [open]);

  useEffect(() => {
    if (!open || draft.planCode || plans.length === 0) return;
    setDraft((current) => ({ ...current, planCode: plans[0].code }));
  }, [draft.planCode, open, plans]);

  const stepIndex = CREATE_TENANT_STEPS.findIndex((step) => step.key === activeStep);
  const currentErrors = useMemo(
    () => validateTenantDraft(draft, activeStep, plans),
    [activeStep, draft, plans]
  );
  const visibleErrors = showErrors ? currentErrors : {};

  const updateDraft = useCallback(
    (field: keyof CreateTenantInput, value: string) => {
      setDraft((current) => {
        const next = { ...current, [field]: value };
        if (field === 'clinicName' && !slugTouched) next.slug = slugifyTenant(value);
        if (field === 'slug') next.slug = slugifyTenant(value);
        if (field === 'unitCode') next.unitCode = slugifyTenant(value);
        if (field === 'state') next.state = value.toUpperCase().slice(0, 2);
        return next;
      });
    },
    [slugTouched]
  );

  const moveStep = (direction: 1 | -1) => {
    if (direction === 1 && Object.keys(currentErrors).length > 0) {
      setShowErrors(true);
      return;
    }

    setShowErrors(false);
    setSubmitError(null);
    const nextStep = CREATE_TENANT_STEPS[stepIndex + direction]?.key;
    if (nextStep) setActiveStep(nextStep);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    if (activeStep !== 'plan') {
      moveStep(1);
      return;
    }

    const allErrors = getAllTenantDraftErrors(draft, plans);
    if (Object.keys(allErrors).length > 0) {
      setShowErrors(true);
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await createTenant(draft);
    setIsSubmitting(false);

    if (error || !data) {
      setSubmitError(error?.message ?? 'Falha ao criar tenant.');
      toast.error(error?.message ?? 'Falha ao criar tenant.');
      return;
    }

    toast.success('Tenant criado e owner convidado.');
    onCreated(data.tenantId);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-tenant-title"
    >
      <form
        onSubmit={submit}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="create-tenant-title" className="text-base font-bold text-foreground">
              Novo tenant
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Criacao operacional com RBAC, plano local e owner ativo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-ghost h-8 w-8 justify-center p-0 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Fechar cadastro de tenant"
          >
            <X size={15} />
          </button>
        </div>

        <div className="border-b border-border px-5 py-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-thin">
            {CREATE_TENANT_STEPS.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = step.key === activeStep;
              const isDone = index < stepIndex;
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => {
                    if (index <= stepIndex) {
                      setActiveStep(step.key);
                      setShowErrors(false);
                    }
                  }}
                  className={`flex min-w-[120px] items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : isDone
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-border bg-muted/30 text-muted-foreground'
                  }`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <StepIcon size={13} />
                  {step.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
          {submitError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          {activeStep === 'clinic' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="text-xs font-semibold text-foreground">Nome da clinica</span>
                <input
                  value={draft.clinicName}
                  onChange={(event) => updateDraft('clinicName', event.target.value)}
                  className="input-base mt-1 w-full text-sm"
                  maxLength={160}
                  autoFocus
                />
                <FieldError message={visibleErrors.clinicName} />
              </label>
              <label>
                <span className="text-xs font-semibold text-foreground">Slug</span>
                <input
                  value={draft.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    updateDraft('slug', event.target.value);
                  }}
                  className="input-base mt-1 w-full font-mono text-sm"
                  maxLength={60}
                />
                <FieldError message={visibleErrors.slug} />
              </label>
              <label>
                <span className="text-xs font-semibold text-foreground">CNPJ</span>
                <input
                  value={draft.cnpj}
                  onChange={(event) => updateDraft('cnpj', event.target.value)}
                  className="input-base mt-1 w-full text-sm"
                  maxLength={32}
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-foreground">Telefone</span>
                <input
                  value={draft.phone}
                  onChange={(event) => updateDraft('phone', event.target.value)}
                  className="input-base mt-1 w-full text-sm"
                  maxLength={32}
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-foreground">Site</span>
                <input
                  value={draft.website}
                  onChange={(event) => updateDraft('website', event.target.value)}
                  className="input-base mt-1 w-full text-sm"
                  maxLength={160}
                />
              </label>
            </div>
          ) : null}

          {activeStep === 'owner' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="text-xs font-semibold text-foreground">Nome do owner</span>
                <input
                  value={draft.ownerName}
                  onChange={(event) => updateDraft('ownerName', event.target.value)}
                  className="input-base mt-1 w-full text-sm"
                  maxLength={160}
                  autoFocus
                />
                <FieldError message={visibleErrors.ownerName} />
              </label>
              <label>
                <span className="text-xs font-semibold text-foreground">E-mail do owner</span>
                <input
                  value={draft.ownerEmail}
                  onChange={(event) => updateDraft('ownerEmail', event.target.value)}
                  className="input-base mt-1 w-full text-sm"
                  maxLength={254}
                  inputMode="email"
                />
                <FieldError message={visibleErrors.ownerEmail} />
              </label>
              <label className="md:col-span-2">
                <span className="text-xs font-semibold text-foreground">Motivo auditavel</span>
                <textarea
                  value={draft.reason}
                  onChange={(event) => updateDraft('reason', event.target.value)}
                  className="input-base mt-1 min-h-24 w-full text-sm"
                  maxLength={500}
                />
                <FieldError message={visibleErrors.reason} />
              </label>
            </div>
          ) : null}

          {activeStep === 'plan' ? (
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-foreground">Plano</span>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    Trial 14 dias
                  </span>
                </div>

                {plansLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                    <Loader2 size={15} className="animate-spin" />
                    Carregando planos...
                  </div>
                ) : plansError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                    <p>{plansError}</p>
                    <button
                      type="button"
                      onClick={onRetryPlans}
                      className="mt-2 text-xs font-semibold text-red-700 underline"
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : plans.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                    Nenhum plano ativo configurado.
                  </div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-3">
                    {plans.map((plan) => (
                      <label
                        key={plan.id}
                        className={`cursor-pointer rounded-lg border px-3 py-3 transition-colors ${
                          draft.planCode === plan.code
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-background hover:bg-muted/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="planCode"
                          value={plan.code}
                          checked={draft.planCode === plan.code}
                          onChange={(event) => updateDraft('planCode', event.target.value)}
                          className="sr-only"
                        />
                        <span className="block text-sm font-bold text-foreground">{plan.name}</span>
                        <span className="mt-1 block text-xs font-semibold text-primary">
                          {formatPlanPrice(plan)}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {planFeatureText(plan)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <FieldError message={visibleErrors.plans ?? visibleErrors.planCode} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <span className="text-xs font-semibold text-foreground">Unidade padrao</span>
                  <input
                    value={draft.unitName}
                    onChange={(event) => updateDraft('unitName', event.target.value)}
                    className="input-base mt-1 w-full text-sm"
                    maxLength={120}
                  />
                  <FieldError message={visibleErrors.unitName} />
                </label>
                <label>
                  <span className="text-xs font-semibold text-foreground">Codigo da unidade</span>
                  <input
                    value={draft.unitCode}
                    onChange={(event) => updateDraft('unitCode', event.target.value)}
                    className="input-base mt-1 w-full font-mono text-sm"
                    maxLength={60}
                  />
                  <FieldError message={visibleErrors.unitCode} />
                </label>
                <label>
                  <span className="text-xs font-semibold text-foreground">Cidade</span>
                  <input
                    value={draft.city}
                    onChange={(event) => updateDraft('city', event.target.value)}
                    className="input-base mt-1 w-full text-sm"
                    maxLength={120}
                  />
                </label>
                <label>
                  <span className="text-xs font-semibold text-foreground">UF</span>
                  <input
                    value={draft.state}
                    onChange={(event) => updateDraft('state', event.target.value)}
                    className="input-base mt-1 w-full text-sm"
                    maxLength={2}
                  />
                  <FieldError message={visibleErrors.state} />
                </label>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => moveStep(-1)}
            disabled={stepIndex === 0 || isSubmitting}
            className="btn-ghost px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft size={13} />
            Voltar
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-ghost px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (activeStep === 'plan' && plansLoading)}
              className="btn-primary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : null}
              {activeStep === 'plan' ? 'Criar tenant' : 'Continuar'}
              {activeStep !== 'plan' ? <ChevronRight size={13} /> : null}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function TenantsManagementContent() {
  const router = useRouter();
  const adminPermissions = useAdminPermissions();
  const [search, setSearch] = useState('');
  const [tenantRows, setTenantRows] = useState<AdminTenantRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | AdminTenantRow['status']>('all');
  const [planFilter, setPlanFilter] = useState<'all' | AdminTenantRow['plan']>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [plans, setPlans] = useState<AdminPlatformPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);

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

  const loadPlans = useCallback(() => {
    setPlansLoading(true);
    setPlansError(null);
    listPlatformPlans().then(({ data, error }) => {
      setPlans(data);
      setPlansError(error?.message ?? null);
      setPlansLoading(false);
    });
  }, []);

  useEffect(() => {
    if (createModalOpen) loadPlans();
  }, [createModalOpen, loadPlans]);

  const handleTenantCreated = useCallback(
    (tenantId: string) => {
      setCreateModalOpen(false);
      loadRows();
      router.push(`/admin/tenants/${tenantId}`);
    },
    [loadRows, router]
  );

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
    <AdminShell
      activeSection="tenants"
      title="Gestao de Tenants"
      description="Dados reais via RPC sanitizada de plataforma. Payloads e identificadores sensiveis ficam redigidos."
      onRefresh={loadRows}
    >
      <CreateTenantModal
        open={createModalOpen}
        plans={plans}
        plansLoading={plansLoading}
        plansError={plansError}
        onClose={() => setCreateModalOpen(false)}
        onRetryPlans={loadPlans}
        onCreated={handleTenantCreated}
      />

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (adminPermissions.canCreateTenant) setCreateModalOpen(true);
          }}
          disabled={!adminPermissions.canCreateTenant}
          title={
            adminPermissions.canCreateTenant ? undefined : 'Apenas owner/admin podem criar tenants.'
          }
          className="btn-primary px-3 py-2 text-xs"
        >
          <Plus size={14} />
          Novo tenant
        </button>
      </div>

      {!adminPermissions.canCreateTenant ? (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {adminPermissions.roleLabel} possui acesso de leitura para tenants. A criacao permanece
          bloqueada no frontend e no endpoint server-side.
        </div>
      ) : null}

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
        <div className="divide-y divide-border lg:hidden">
          {filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-muted-foreground">
              <Building2 size={32} className="mx-auto mb-2 opacity-30" />
              <p className="font-medium">Nenhum tenant encontrado</p>
              <p className="mt-1 text-xs">Tente ajustar os filtros de busca</p>
            </div>
          ) : (
            filtered.map((tenant) => (
              <article key={tenant.id} className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/tenants/${tenant.id}`}
                      className="block truncate text-sm font-semibold text-foreground"
                    >
                      {tenant.clinicName}
                    </Link>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{tenant.owner}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {tenant.id}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <TenantStatusBadge status={tenant.status} />
                    <PlanBadge plan={tenant.plan} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <span className="text-muted-foreground">Usuarios</span>
                    <p className="mt-1 font-semibold text-foreground">
                      {tenant.users}/{tenant.usersLimit}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <span className="text-muted-foreground">Pacientes</span>
                    <p className="mt-1 font-semibold text-foreground">{tenant.patients}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <span className="text-muted-foreground">MRR</span>
                    <p className="mt-1 font-semibold tabular-nums text-foreground">
                      {currency(tenant.mrr)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <span className="text-muted-foreground">API mes</span>
                    <p className="mt-1 font-semibold text-foreground">
                      {formatK(tenant.apiCallsThisMonth)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 text-xs">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Storage</span>
                      <span className="font-semibold text-foreground">
                        {tenant.storageUsedGb}/{tenant.storageCapacityGb} GB
                      </span>
                    </div>
                    <UsageBar used={tenant.storageUsedGb} limit={tenant.storageCapacityGb} />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                    <span className="text-muted-foreground">Integracoes</span>
                    <span className="flex items-center gap-2">
                      <IntegrationStatusDot
                        status={tenant.asaasSubaccountStatus}
                        label={tenant.asaasSubaccountStatus}
                      />
                      <IntegrationStatusDot
                        status={tenant.d4signStatus}
                        label={tenant.d4signStatus}
                      />
                    </span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Link
                    href={`/admin/tenants/${tenant.id}`}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    Abrir tenant
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Clinica / ID
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Owner
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Plano
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Usuarios
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Pacientes
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Storage
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  API mes
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  MRR
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Asaas
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  D4Sign
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right font-semibold text-muted-foreground"
                >
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
                        <span className="font-mono text-xs text-muted-foreground">{tenant.id}</span>
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
                        <UsageBar used={tenant.storageUsedGb} limit={tenant.storageCapacityGb} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <UsageBar used={tenant.apiCallsThisMonth} limit={tenant.apiLimitMonthly} />
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
    </AdminShell>
  );
}
