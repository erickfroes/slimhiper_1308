'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Copy,
  CreditCard,
  Edit2,
  MessageSquare,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  XCircle,
} from 'lucide-react';

import type {
  CommercialPackage,
  CommercialPackageStatus,
  CommercialProgramOption,
  CommercialService,
  CommercialServiceStatus,
  PatientListRow,
  UpgradeRequest,
} from '@/domain/types';
import DataState from '@/components/ui/DataState';
import Dialog from '@/components/ui/Dialog';
import SectionPanel from '@/components/ui/SectionPanel';
import {
  cloneCommercialPackage,
  cloneCommercialService,
  createClinicUpgradeRequest,
  decideUpgradeRequest,
  generateUpgradeInvoice,
  getClinicCommercialCatalog,
  packageToDraft,
  quoteUpgradeRequest,
  saveCommercialPackage,
  saveCommercialService,
  serviceToDraft,
  setCommercialPackageStatus,
  setCommercialServiceStatus,
  type ClinicCommercialPayload,
  type CommercialPackageDraft,
  type CommercialServiceDraft,
} from '@/services/commercialApi';
import { getPatientListPage } from '@/services/patientsApi';

export type CommercialCatalogTab = 'services' | 'packages' | 'upgrades';

const emptyCatalog: ClinicCommercialPayload = {
  services: [],
  packages: [],
  programs: [],
  upgradeRequests: [],
  summary: {
    services: 0,
    packages: 0,
    upgradesOpen: 0,
    upgradeRevenuePendingCents: 0,
  },
  lastCheckedAt: null,
};

const serviceStatusLabel: Record<CommercialServiceStatus, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  arquivado: 'Arquivado',
};

const packageStatusLabel: Record<CommercialPackageStatus, string> = {
  rascunho: 'Rascunho',
  ativo: 'Ativo',
  inativo: 'Inativo',
  arquivado: 'Arquivado',
};

const upgradeStatusLabel: Record<string, string> = {
  solicitado: 'Solicitado',
  cotado: 'Cotado',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  cancelado: 'Cancelado',
  cobranca_pendente: 'Cobranca pendente',
  concluido: 'Concluido',
};

const packageSteps = ['dados', 'composicao', 'programas'] as const;
type PackageStep = (typeof packageSteps)[number];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseMoneyToCents(value: string) {
  const normalized = value
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function moneyInputValue(cents: number) {
  return cents > 0 ? String((cents / 100).toFixed(2)).replace('.', ',') : '';
}

function linesToList(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToLines(values: string[]) {
  return values.join('\n');
}

function limitsToLines(values: Array<{ label: string; value: string }>) {
  return values.map((item) => `${item.label}: ${item.value}`).join('\n');
}

function linesToLimits(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => {
      const [label = '', ...rest] = line.split(':');
      const limitValue = rest.join(':').trim();
      return { label: label.trim(), value: limitValue || 'Nao informado' };
    })
    .filter((item) => item.label || item.value);
}

function statusBadge(status: string) {
  if (status === 'ativo' || status === 'aprovado' || status === 'concluido') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (status === 'cotado' || status === 'cobranca_pendente' || status === 'rascunho') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (status === 'rejeitado' || status === 'cancelado') {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  return 'border-border bg-muted text-muted-foreground';
}

function createEmptyServiceDraft(): CommercialServiceDraft {
  return {
    name: '',
    category: 'clinico',
    description: '',
    status: 'ativo',
    basePriceCents: 0,
    durationMinutes: 45,
    unit: 'sessao',
    deliveryMode: 'presencial',
  };
}

function createEmptyPackageDraft(): CommercialPackageDraft {
  return {
    name: '',
    description: '',
    status: 'rascunho',
    priceCents: 0,
    durationWeeks: 12,
    renewalPolicy: 'manual',
    communityAccess: false,
    priorityChat: false,
    benefits: [],
    usageLimits: [],
    services: [],
    programLinks: [],
  };
}

interface CommercialCatalogContentProps {
  activeTab: CommercialCatalogTab;
}

export default function CommercialCatalogContent({ activeTab }: CommercialCatalogContentProps) {
  const [catalog, setCatalog] = useState<ClinicCommercialPayload>(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [serviceDraft, setServiceDraft] = useState<CommercialServiceDraft | null>(null);
  const [servicePriceInput, setServicePriceInput] = useState('');
  const [packageDraft, setPackageDraft] = useState<CommercialPackageDraft | null>(null);
  const [packagePriceInput, setPackagePriceInput] = useState('');
  const [packageBenefitsInput, setPackageBenefitsInput] = useState('');
  const [packageLimitsInput, setPackageLimitsInput] = useState('');
  const [packageStep, setPackageStep] = useState<PackageStep>('dados');
  const [upgradeSearch, setUpgradeSearch] = useState('');
  const [upgradePatients, setUpgradePatients] = useState<PatientListRow[]>([]);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [upgradePatientId, setUpgradePatientId] = useState('');
  const [upgradePackageId, setUpgradePackageId] = useState('');
  const [upgradeReason, setUpgradeReason] = useState('');
  const [quoteRequest, setQuoteRequest] = useState<UpgradeRequest | null>(null);
  const [quoteAmountInput, setQuoteAmountInput] = useState('');
  const [quoteDueDate, setQuoteDueDate] = useState(todayIsoDate);
  const [quoteNotes, setQuoteNotes] = useState('');

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await getClinicCommercialCatalog();
    if (response.error || !response.data) {
      setCatalog(emptyCatalog);
      setError(response.error?.message ?? 'Nao foi possivel carregar comercial.');
    } else {
      setCatalog(response.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const activePackages = useMemo(
    () => catalog.packages.filter((pkg) => pkg.status === 'ativo'),
    [catalog.packages]
  );

  async function runMutation(
    key: string,
    action: () => Promise<{ error: { message: string } | null }>
  ) {
    setBusyKey(key);
    setMessage(null);
    const response = await action();
    if (response.error) {
      setMessage(response.error.message);
    } else {
      setMessage('Alteracao salva.');
      await loadCatalog();
    }
    setBusyKey(null);
  }

  function openServiceDialog(service?: CommercialService) {
    const draft = service ? serviceToDraft(service) : createEmptyServiceDraft();
    setServiceDraft(draft);
    setServicePriceInput(moneyInputValue(draft.basePriceCents));
  }

  function openPackageDialog(pkg?: CommercialPackage) {
    const draft = pkg ? packageToDraft(pkg) : createEmptyPackageDraft();
    setPackageDraft(draft);
    setPackagePriceInput(moneyInputValue(draft.priceCents));
    setPackageBenefitsInput(listToLines(draft.benefits));
    setPackageLimitsInput(limitsToLines(draft.usageLimits));
    setPackageStep('dados');
  }

  function closePackageDialog() {
    setPackageDraft(null);
    setPackageStep('dados');
  }

  async function submitService() {
    if (!serviceDraft || busyKey === 'service-save') return;
    const draft = {
      ...serviceDraft,
      basePriceCents: parseMoneyToCents(servicePriceInput),
    };
    await runMutation('service-save', () => saveCommercialService(draft));
    setServiceDraft(null);
  }

  async function submitPackage() {
    if (!packageDraft || busyKey === 'package-save') return;
    const draft = {
      ...packageDraft,
      priceCents: parseMoneyToCents(packagePriceInput),
      benefits: linesToList(packageBenefitsInput),
      usageLimits: linesToLimits(packageLimitsInput),
    };
    await runMutation('package-save', () => saveCommercialPackage(draft));
    closePackageDialog();
  }

  async function loadUpgradePatients(search = upgradeSearch) {
    setBusyKey('patients-search');
    setMessage(null);
    const response = await getPatientListPage({ page: 1, pageSize: 25, search, status: 'ativo' });
    if (response.error) {
      setUpgradePatients([]);
      setMessage(response.error.message);
    } else {
      setUpgradePatients(response.data?.rows ?? []);
    }
    setBusyKey(null);
  }

  function openUpgradeDialog() {
    setUpgradeDialogOpen(true);
    setUpgradePatientId('');
    setUpgradePackageId(activePackages[0]?.id ?? '');
    setUpgradeReason('');
    setUpgradeSearch('');
    void loadUpgradePatients('');
  }

  async function submitUpgradeRequest() {
    if (!upgradePatientId || !upgradePackageId || busyKey === 'upgrade-create') return;
    await runMutation('upgrade-create', () =>
      createClinicUpgradeRequest({
        patientId: upgradePatientId,
        targetPackageId: upgradePackageId,
        reason: upgradeReason,
      })
    );
    setUpgradeDialogOpen(false);
  }

  function openQuoteDialog(request: UpgradeRequest) {
    setQuoteRequest(request);
    setQuoteAmountInput(moneyInputValue(request.quoteAmountCents ?? 0));
    setQuoteDueDate(request.quoteDueDate ?? todayIsoDate());
    setQuoteNotes(request.quoteNotes);
  }

  async function submitQuote() {
    if (!quoteRequest || busyKey === 'quote-save') return;
    await runMutation('quote-save', () =>
      quoteUpgradeRequest({
        requestId: quoteRequest.id,
        amountCents: parseMoneyToCents(quoteAmountInput),
        dueDate: quoteDueDate,
        notes: quoteNotes,
      })
    );
    setQuoteRequest(null);
  }

  if (loading) {
    return (
      <DataState
        kind="loading"
        title="Carregando comercial"
        description="Buscando catalogo, pacotes e upgrades do tenant ativo."
      />
    );
  }

  if (error) {
    return (
      <DataState
        kind="error"
        title="Comercial indisponivel"
        description={error}
        actionLabel="Tentar novamente"
        onAction={() => void loadCatalog()}
      />
    );
  }

  return (
    <div className="space-y-5">
      {message ? (
        <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          {message}
        </div>
      ) : null}

      {activeTab === 'services' ? (
        <ServicesPanel
          services={catalog.services}
          busyKey={busyKey}
          onCreate={() => openServiceDialog()}
          onEdit={openServiceDialog}
          onClone={(service) =>
            void runMutation(`service-clone-${service.id}`, () =>
              cloneCommercialService(service.id)
            )
          }
          onStatus={(service, status) =>
            void runMutation(`service-status-${service.id}`, () =>
              setCommercialServiceStatus(service.id, status)
            )
          }
        />
      ) : null}

      {activeTab === 'packages' ? (
        <PackagesPanel
          packages={catalog.packages}
          busyKey={busyKey}
          onCreate={() => openPackageDialog()}
          onEdit={openPackageDialog}
          onClone={(pkg) =>
            void runMutation(`package-clone-${pkg.id}`, () => cloneCommercialPackage(pkg.id))
          }
          onStatus={(pkg, status) =>
            void runMutation(`package-status-${pkg.id}`, () =>
              setCommercialPackageStatus(pkg.id, status)
            )
          }
        />
      ) : null}

      {activeTab === 'upgrades' ? (
        <UpgradesPanel
          upgrades={catalog.upgradeRequests}
          packages={activePackages}
          summary={catalog.summary}
          busyKey={busyKey}
          onCreate={openUpgradeDialog}
          onQuote={openQuoteDialog}
          onApprove={(request) =>
            void runMutation(`upgrade-approve-${request.id}`, () =>
              decideUpgradeRequest({ requestId: request.id, decision: 'approve' })
            )
          }
          onReject={(request) =>
            void runMutation(`upgrade-reject-${request.id}`, () =>
              decideUpgradeRequest({ requestId: request.id, decision: 'reject' })
            )
          }
          onInvoice={(request) =>
            void runMutation(`upgrade-invoice-${request.id}`, () =>
              generateUpgradeInvoice(request.id, request.quoteDueDate ?? todayIsoDate())
            )
          }
        />
      ) : null}

      {serviceDraft ? (
        <ServiceDialog
          draft={serviceDraft}
          priceInput={servicePriceInput}
          busy={busyKey === 'service-save'}
          onDraftChange={setServiceDraft}
          onPriceInputChange={setServicePriceInput}
          onClose={() => setServiceDraft(null)}
          onSubmit={() => void submitService()}
        />
      ) : null}

      {packageDraft ? (
        <PackageDialog
          draft={packageDraft}
          services={catalog.services}
          programs={catalog.programs}
          step={packageStep}
          priceInput={packagePriceInput}
          benefitsInput={packageBenefitsInput}
          limitsInput={packageLimitsInput}
          busy={busyKey === 'package-save'}
          onDraftChange={setPackageDraft}
          onStepChange={setPackageStep}
          onPriceInputChange={setPackagePriceInput}
          onBenefitsInputChange={setPackageBenefitsInput}
          onLimitsInputChange={setPackageLimitsInput}
          onClose={closePackageDialog}
          onSubmit={() => void submitPackage()}
        />
      ) : null}

      {upgradeDialogOpen ? (
        <Dialog
          open
          title="Solicitar upgrade"
          description="Cria uma pendencia comercial auditada para o paciente selecionado."
          onOpenChange={(open) => {
            if (!open) setUpgradeDialogOpen(false);
          }}
          placement="center"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setUpgradeDialogOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!upgradePatientId || !upgradePackageId || busyKey === 'upgrade-create'}
                onClick={() => void submitUpgradeRequest()}
              >
                {busyKey === 'upgrade-create' ? 'Salvando...' : 'Solicitar'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Buscar paciente</span>
                <input
                  type="search"
                  value={upgradeSearch}
                  onChange={(event) => setUpgradeSearch(event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Nome, telefone ou documento"
                />
              </label>
              <button
                type="button"
                className="btn-secondary self-end"
                disabled={busyKey === 'patients-search'}
                onClick={() => void loadUpgradePatients()}
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Buscar
              </button>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Paciente</span>
              <select
                value={upgradePatientId}
                onChange={(event) => setUpgradePatientId(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Selecione</option>
                {upgradePatients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} - {patient.phone} - {patient.activePackage}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Pacote alvo</span>
              <select
                value={upgradePackageId}
                onChange={(event) => setUpgradePackageId(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Selecione</option>
                {activePackages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} - {formatCurrency(pkg.priceCents)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Motivo</span>
              <textarea
                value={upgradeReason}
                onChange={(event) => setUpgradeReason(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
        </Dialog>
      ) : null}

      {quoteRequest ? (
        <Dialog
          open
          title="Cotar upgrade"
          description={`Proposta para ${quoteRequest.patientName} migrar para ${quoteRequest.targetPackageName}.`}
          onOpenChange={(open) => {
            if (!open) setQuoteRequest(null);
          }}
          placement="center"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setQuoteRequest(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busyKey === 'quote-save'}
                onClick={() => void submitQuote()}
              >
                {busyKey === 'quote-save' ? 'Salvando...' : 'Salvar cotacao'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Valor</span>
              <input
                value={quoteAmountInput}
                onChange={(event) => setQuoteAmountInput(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                inputMode="decimal"
                placeholder="590,00"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Vencimento</span>
              <input
                type="date"
                value={quoteDueDate}
                onChange={(event) => setQuoteDueDate(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Notas comerciais</span>
              <textarea
                value={quoteNotes}
                onChange={(event) => setQuoteNotes(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

interface ServicesPanelProps {
  services: CommercialService[];
  busyKey: string | null;
  onCreate: () => void;
  onEdit: (service: CommercialService) => void;
  onClone: (service: CommercialService) => void;
  onStatus: (service: CommercialService, status: CommercialServiceStatus) => void;
}

function ServicesPanel({
  services,
  busyKey,
  onCreate,
  onEdit,
  onClone,
  onStatus,
}: ServicesPanelProps) {
  return (
    <SectionPanel
      title="Servicos"
      description="Catalogo operacional usado em pacotes e programas."
      actions={
        <button type="button" className="btn-primary" onClick={onCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo servico
        </button>
      }
    >
      {services.length === 0 ? (
        <DataState
          kind="empty"
          title="Nenhum servico cadastrado"
          description="Crie servicos para compor pacotes comerciais."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <article key={service.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{service.name}</h3>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(service.status)}`}
                    >
                      {serviceStatusLabel[service.status]}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {service.description || 'Sem descricao.'}
                  </p>
                </div>
                <Stethoscope className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Preco base</dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    {formatCurrency(service.basePriceCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Duracao</dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    {service.durationMinutes ? `${service.durationMinutes} min` : 'Livre'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Entrega</dt>
                  <dd className="mt-1 font-semibold text-foreground">{service.deliveryMode}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pacotes</dt>
                  <dd className="mt-1 font-semibold text-foreground">{service.packagesCount}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary h-9 px-3 text-xs"
                  onClick={() => onEdit(service)}
                >
                  <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Editar
                </button>
                <button
                  type="button"
                  className="btn-secondary h-9 px-3 text-xs"
                  disabled={busyKey === `service-clone-${service.id}`}
                  onClick={() => onClone(service)}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Duplicar
                </button>
                <button
                  type="button"
                  className="btn-secondary h-9 px-3 text-xs"
                  disabled={busyKey === `service-status-${service.id}`}
                  onClick={() =>
                    onStatus(service, service.status === 'ativo' ? 'inativo' : 'ativo')
                  }
                >
                  {service.status === 'ativo' ? (
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {service.status === 'ativo' ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </SectionPanel>
  );
}

interface PackagesPanelProps {
  packages: CommercialPackage[];
  busyKey: string | null;
  onCreate: () => void;
  onEdit: (pkg: CommercialPackage) => void;
  onClone: (pkg: CommercialPackage) => void;
  onStatus: (pkg: CommercialPackage, status: CommercialPackageStatus) => void;
}

function PackagesPanel({
  packages,
  busyKey,
  onCreate,
  onEdit,
  onClone,
  onStatus,
}: PackagesPanelProps) {
  return (
    <SectionPanel
      title="Pacotes"
      description="Composicao de servicos, beneficios, limites e vinculo com programas."
      actions={
        <button type="button" className="btn-primary" onClick={onCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo pacote
        </button>
      }
    >
      {packages.length === 0 ? (
        <DataState
          kind="empty"
          title="Nenhum pacote cadastrado"
          description="Monte pacotes para liberar beneficios e upgrades."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {packages.map((pkg) => (
            <article key={pkg.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{pkg.name}</h3>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(pkg.status)}`}
                    >
                      {packageStatusLabel[pkg.status]}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {pkg.description || 'Sem descricao.'}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-lg font-bold text-foreground">
                    {formatCurrency(pkg.priceCents)}
                  </p>
                  <p className="text-xs text-muted-foreground">{pkg.durationWeeks} semanas</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetricMini
                  icon={Stethoscope}
                  label="Servicos"
                  value={String(pkg.services.length)}
                />
                <MetricMini icon={Users} label="Pacientes" value={String(pkg.activePatients)} />
                <MetricMini
                  icon={MessageSquare}
                  label="Chat"
                  value={pkg.priorityChat ? 'Prioritario' : 'Padrao'}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {pkg.benefits.slice(0, 5).map((benefit) => (
                  <span
                    key={benefit}
                    className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                  >
                    {benefit}
                  </span>
                ))}
                {pkg.communityAccess ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                    Comunidade
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary h-9 px-3 text-xs"
                  onClick={() => onEdit(pkg)}
                >
                  <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Editar
                </button>
                <button
                  type="button"
                  className="btn-secondary h-9 px-3 text-xs"
                  disabled={busyKey === `package-clone-${pkg.id}`}
                  onClick={() => onClone(pkg)}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Duplicar
                </button>
                <button
                  type="button"
                  className="btn-secondary h-9 px-3 text-xs"
                  disabled={busyKey === `package-status-${pkg.id}`}
                  onClick={() => onStatus(pkg, pkg.status === 'ativo' ? 'inativo' : 'ativo')}
                >
                  {pkg.status === 'ativo' ? (
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {pkg.status === 'ativo' ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </SectionPanel>
  );
}

interface UpgradesPanelProps {
  upgrades: UpgradeRequest[];
  packages: CommercialPackage[];
  summary: ClinicCommercialPayload['summary'];
  busyKey: string | null;
  onCreate: () => void;
  onQuote: (request: UpgradeRequest) => void;
  onApprove: (request: UpgradeRequest) => void;
  onReject: (request: UpgradeRequest) => void;
  onInvoice: (request: UpgradeRequest) => void;
}

function UpgradesPanel({
  upgrades,
  packages,
  summary,
  busyKey,
  onCreate,
  onQuote,
  onApprove,
  onReject,
  onInvoice,
}: UpgradesPanelProps) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricMini icon={Sparkles} label="Upgrades abertos" value={String(summary.upgradesOpen)} />
        <MetricMini
          icon={CreditCard}
          label="Receita pendente"
          value={formatCurrency(summary.upgradeRevenuePendingCents)}
        />
        <MetricMini icon={PackageCheck} label="Pacotes ativos" value={String(packages.length)} />
      </section>

      <SectionPanel
        title="Upgrades"
        description="Solicitacoes, cotacoes, decisoes e cobrancas locais de upgrade."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={onCreate}
            disabled={packages.length === 0}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo upgrade
          </button>
        }
      >
        {upgrades.length === 0 ? (
          <DataState
            kind="empty"
            title="Nenhum upgrade em andamento"
            description="Solicitacoes de paciente ou da equipe aparecem aqui."
          />
        ) : (
          <div className="space-y-3">
            {upgrades.map((request) => (
              <article
                key={request.id}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {request.patientName}
                      </h3>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(request.status)}`}
                      >
                        {upgradeStatusLabel[request.status] ?? request.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {request.currentPackageName ?? 'Pacote atual'} para{' '}
                      {request.targetPackageName}
                    </p>
                    {request.reason ? (
                      <p className="mt-2 text-sm text-foreground">{request.reason}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-left lg:text-right">
                    <p className="text-base font-bold text-foreground">
                      {request.quoteAmountCents
                        ? formatCurrency(request.quoteAmountCents)
                        : 'Sem cotacao'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {request.quoteDueDate ? `vence ${request.quoteDueDate}` : 'sem vencimento'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary h-9 px-3 text-xs"
                    onClick={() => onQuote(request)}
                  >
                    <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Cotar
                  </button>
                  <button
                    type="button"
                    className="btn-secondary h-9 px-3 text-xs"
                    disabled={
                      busyKey === `upgrade-invoice-${request.id}` || !request.quoteAmountCents
                    }
                    onClick={() => onInvoice(request)}
                  >
                    <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                    Gerar cobranca
                  </button>
                  <button
                    type="button"
                    className="btn-secondary h-9 px-3 text-xs"
                    disabled={busyKey === `upgrade-approve-${request.id}`}
                    onClick={() => onApprove(request)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Aprovar
                  </button>
                  <button
                    type="button"
                    className="btn-secondary h-9 px-3 text-xs text-negative"
                    disabled={busyKey === `upgrade-reject-${request.id}`}
                    onClick={() => onReject(request)}
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Rejeitar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

function MetricMini({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden={true} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

interface ServiceDialogProps {
  draft: CommercialServiceDraft;
  priceInput: string;
  busy: boolean;
  onDraftChange: (draft: CommercialServiceDraft) => void;
  onPriceInputChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function ServiceDialog({
  draft,
  priceInput,
  busy,
  onDraftChange,
  onPriceInputChange,
  onClose,
  onSubmit,
}: ServiceDialogProps) {
  return (
    <Dialog
      open
      title={draft.id ? 'Editar servico' : 'Novo servico'}
      description="Dados operacionais para composicao de pacotes."
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="center"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !draft.name.trim()}
            onClick={onSubmit}
          >
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      }
    >
      <div className="grid gap-4">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Nome</span>
          <input
            value={draft.name}
            onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Descricao</span>
          <textarea
            value={draft.description}
            onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Categoria</span>
            <select
              value={draft.category}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  category: event.target.value as CommercialServiceDraft['category'],
                })
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="clinico">Clinico</option>
              <option value="nutricao">Nutricao</option>
              <option value="fitness">Fitness</option>
              <option value="exame">Exame</option>
              <option value="documento">Documento</option>
              <option value="suporte">Suporte</option>
              <option value="outro">Outro</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <select
              value={draft.status}
              onChange={(event) =>
                onDraftChange({ ...draft, status: event.target.value as CommercialServiceStatus })
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Preco base</span>
            <input
              value={priceInput}
              onChange={(event) => onPriceInputChange(event.target.value)}
              inputMode="decimal"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Duracao em minutos</span>
            <input
              type="number"
              min={1}
              value={draft.durationMinutes ?? ''}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  durationMinutes: event.target.value ? Number(event.target.value) : null,
                })
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Unidade</span>
            <input
              value={draft.unit}
              onChange={(event) => onDraftChange({ ...draft, unit: event.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Entrega</span>
            <select
              value={draft.deliveryMode}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  deliveryMode: event.target.value as CommercialServiceDraft['deliveryMode'],
                })
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="presencial">Presencial</option>
              <option value="online">Online</option>
              <option value="hibrido">Hibrido</option>
              <option value="interno">Interno</option>
            </select>
          </label>
        </div>
      </div>
    </Dialog>
  );
}

interface PackageDialogProps {
  draft: CommercialPackageDraft;
  services: CommercialService[];
  programs: CommercialProgramOption[];
  step: PackageStep;
  priceInput: string;
  benefitsInput: string;
  limitsInput: string;
  busy: boolean;
  onDraftChange: (draft: CommercialPackageDraft) => void;
  onStepChange: (step: PackageStep) => void;
  onPriceInputChange: (value: string) => void;
  onBenefitsInputChange: (value: string) => void;
  onLimitsInputChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function PackageDialog({
  draft,
  services,
  programs,
  step,
  priceInput,
  benefitsInput,
  limitsInput,
  busy,
  onDraftChange,
  onStepChange,
  onPriceInputChange,
  onBenefitsInputChange,
  onLimitsInputChange,
  onClose,
  onSubmit,
}: PackageDialogProps) {
  function toggleService(service: CommercialService, enabled: boolean) {
    if (!enabled) {
      onDraftChange({
        ...draft,
        services: draft.services.filter((item) => item.serviceId !== service.id),
      });
      return;
    }
    onDraftChange({
      ...draft,
      services: [
        ...draft.services,
        {
          serviceId: service.id,
          quantity: 1,
          unit: service.unit,
          limitPerPeriod: null,
        },
      ],
    });
  }

  function updateService(
    serviceId: string,
    patch: Partial<CommercialPackageDraft['services'][number]>
  ) {
    onDraftChange({
      ...draft,
      services: draft.services.map((item) =>
        item.serviceId === serviceId ? { ...item, ...patch } : item
      ),
    });
  }

  function toggleProgram(program: CommercialProgramOption, enabled: boolean) {
    if (!enabled) {
      onDraftChange({
        ...draft,
        programLinks: draft.programLinks.filter((item) => item.programId !== program.id),
      });
      return;
    }
    onDraftChange({
      ...draft,
      programLinks: [...draft.programLinks, { programId: program.id, isDefault: false }],
    });
  }

  function setDefaultProgram(programId: string) {
    onDraftChange({
      ...draft,
      programLinks: draft.programLinks.map((item) => ({
        ...item,
        isDefault: item.programId === programId,
      })),
    });
  }

  return (
    <Dialog
      open
      title={draft.id ? 'Editar pacote' : 'Novo pacote'}
      description="Pacote comercial com beneficios e limites aplicados ao enrollment."
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="right"
      mobileFullscreen
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1">
            {packageSteps.map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  step === item
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
                onClick={() => onStepChange(item)}
              >
                {item === 'dados' ? 'Dados' : item === 'composicao' ? 'Composicao' : 'Programas'}
              </button>
            ))}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !draft.name.trim()}
              onClick={onSubmit}
            >
              {busy ? 'Salvando...' : 'Salvar pacote'}
            </button>
          </div>
        </div>
      }
    >
      {step === 'dados' ? (
        <div className="grid gap-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Nome</span>
            <input
              value={draft.name}
              onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Descricao</span>
            <textarea
              value={draft.description}
              onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Preco</span>
              <input
                value={priceInput}
                onChange={(event) => onPriceInputChange(event.target.value)}
                inputMode="decimal"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Duracao em semanas</span>
              <input
                type="number"
                min={0}
                value={draft.durationWeeks}
                onChange={(event) =>
                  onDraftChange({ ...draft, durationWeeks: Number(event.target.value) })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <select
                value={draft.status}
                onChange={(event) =>
                  onDraftChange({ ...draft, status: event.target.value as CommercialPackageStatus })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="rascunho">Rascunho</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="arquivado">Arquivado</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Renovacao</span>
              <select
                value={draft.renewalPolicy}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    renewalPolicy: event.target.value as CommercialPackageDraft['renewalPolicy'],
                  })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="manual">Manual</option>
                <option value="automatico">Automatico</option>
                <option value="sem_renovacao">Sem renovacao</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={draft.communityAccess}
                onChange={(event) =>
                  onDraftChange({ ...draft, communityAccess: event.target.checked })
                }
              />
              Comunidade liberada
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={draft.priorityChat}
                onChange={(event) =>
                  onDraftChange({ ...draft, priorityChat: event.target.checked })
                }
              />
              Chat prioritario
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Beneficios</span>
            <textarea
              value={benefitsInput}
              onChange={(event) => onBenefitsInputChange(event.target.value)}
              rows={5}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Um beneficio por linha"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Limites</span>
            <textarea
              value={limitsInput}
              onChange={(event) => onLimitsInputChange(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Consultas: 4 sessoes"
            />
          </label>
        </div>
      ) : null}

      {step === 'composicao' ? (
        <div className="space-y-3">
          {services.length === 0 ? (
            <DataState
              kind="empty"
              title="Sem servicos ativos"
              description="Cadastre servicos antes de montar o pacote."
            />
          ) : (
            services.map((service) => {
              const selected = draft.services.find((item) => item.serviceId === service.id);
              return (
                <div key={service.id} className="rounded-lg border border-border bg-background p-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(selected)}
                      onChange={(event) => toggleService(service, event.target.checked)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{service.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {service.category} - {formatCurrency(service.basePriceCents)}
                      </p>
                    </div>
                  </label>
                  {selected ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">Qtd.</span>
                        <input
                          type="number"
                          min={0}
                          value={selected.quantity}
                          onChange={(event) =>
                            updateService(service.id, { quantity: Number(event.target.value) })
                          }
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">Unidade</span>
                        <input
                          value={selected.unit}
                          onChange={(event) =>
                            updateService(service.id, { unit: event.target.value })
                          }
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">Limite periodo</span>
                        <input
                          type="number"
                          min={0}
                          value={selected.limitPerPeriod ?? ''}
                          onChange={(event) =>
                            updateService(service.id, {
                              limitPerPeriod: event.target.value
                                ? Number(event.target.value)
                                : null,
                            })
                          }
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {step === 'programas' ? (
        <div className="space-y-3">
          {programs.length === 0 ? (
            <DataState
              kind="empty"
              title="Sem programas"
              description="Crie programas no builder antes de vincular pacotes."
            />
          ) : (
            programs.map((program) => {
              const selected = draft.programLinks.find((item) => item.programId === program.id);
              return (
                <div
                  key={program.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(selected)}
                      onChange={(event) => toggleProgram(program, event.target.checked)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{program.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {program.programType} - {program.status}
                      </p>
                    </div>
                  </label>
                  <button
                    type="button"
                    disabled={!selected}
                    onClick={() => setDefaultProgram(program.id)}
                    className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold ${
                      selected?.isDefault
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground disabled:opacity-50'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Padrao
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
