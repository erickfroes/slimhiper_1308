'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileClock,
  FilePlus2,
  FileSearch,
  Archive,
  FileText,
  FileX,
  Filter,
  LayoutTemplate,
  Lock,
  PenSquare,
  RotateCcw,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UploadCloud,
  Unlock,
} from 'lucide-react';
import {
  acknowledgeClinicD4SignEventFailure,
  archiveClinicDocumentTemplate,
  createClinicDocumentTemplate,
  duplicateClinicDocumentTemplate,
  generateClinicDocument,
  getClinicDocumentSignedUrl,
  getClinicDocumentAuditEvents,
  getClinicDocumentsWorkspace,
  getTemplatePlaceholders,
  publishClinicDocumentTemplate,
  PROTECTED_TEMPLATE_VARIABLES,
  requestClinicD4SignEventReprocess,
  requestClinicDocumentSignature,
  setClinicDocumentPatientRelease,
  type ClinicDocumentMonitorEvent,
  type ClinicDocumentAuditEvent,
  type ClinicDocumentCategory,
  type ClinicDocumentRow,
  type ClinicDocumentSigner,
  type ClinicDocumentTemplate,
  updateClinicDocumentSignatureStatus,
  updateClinicDocumentTemplate,
  validateTemplateVariables,
  type ClinicDocumentsWorkspace,
  type ClinicDocumentsWorkspaceFilters,
} from '@/services/clinicDocumentsApi';
import { getDocumentCategoryLabel } from '@/services/documentPresentation';
import { getPatientDocumentEvidence, type DocumentEvidenceResult } from '@/services/documentsApi';
import { asSafeDocumentUrl } from '@/lib/safeExternalUrl';
import DataState from '@/components/ui/DataState';
import Dialog from '@/components/ui/Dialog';
import DocumentAuditTimeline from './DocumentAuditTimeline';

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

const PREVIEW_PROTECTED_VALUES: Record<string, string> = {
  patient_id: 'paciente-mock-seguro',
  patient_name: 'Paciente Exemplo',
  patient_email: 'paciente@example.invalid',
  patient_phone: '(00) 00000-0000',
  patient_cpf_masked: '***.***.***-00',
  patient_birth_date: '1990-01-01',
  patient_sex_gender: 'Nao informado',
  clinic_name: 'Clinica Exemplo',
  date: '2026-06-14',
  generated_at: '2026-06-14T12:00:00Z',
  generated_by_user_id: 'usuario-mock-seguro',
  professional_name: 'Profissional Exemplo',
};

function renderTemplatePreview(templateBody: string, allowedVariables: string[]) {
  const manualValues = Object.fromEntries(
    allowedVariables.map((key) => [key, `Exemplo de ${key}`])
  );
  return templateBody.replace(/{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g, (_match, key: string) => {
    if (key in PREVIEW_PROTECTED_VALUES) return PREVIEW_PROTECTED_VALUES[key];
    return manualValues[key] ?? `{{${key}}}`;
  });
}

const DOCUMENT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function readDocumentFilters(searchParams: URLSearchParams): ClinicDocumentsWorkspaceFilters {
  const released = searchParams.get('portal');
  return {
    page: Number(searchParams.get('page') || 1),
    pageSize: Number(searchParams.get('pageSize') || 25),
    search: searchParams.get('q') || undefined,
    category: searchParams.get('category') || undefined,
    status: searchParams.get('status') || undefined,
    patientId: searchParams.get('patient') || undefined,
    periodStart: searchParams.get('from') || undefined,
    periodEnd: searchParams.get('to') || undefined,
    signature: searchParams.get('signature') || undefined,
    releasedToPatient:
      released === 'released' ? true : released === 'restricted' ? false : undefined,
  };
}

function writeFilterParam(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined
) {
  const nextValue = String(value ?? '').trim();
  if (!nextValue || nextValue === 'all') params.delete(key);
  else params.set(key, nextValue);
}

const wizardSteps = [
  'Paciente',
  'Categoria',
  'Template',
  'Variaveis',
  'Revisao',
  'Acesso',
] as const;

const statusConfig = {
  draft: {
    label: 'Rascunho',
    icon: FileSearch,
    classes: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  available: {
    label: 'Disponivel',
    icon: CheckCircle2,
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  pending_signature: {
    label: 'Pendente assinatura',
    icon: FileClock,
    classes: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  signed: {
    label: 'Assinado',
    icon: ShieldCheck,
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  failed: {
    label: 'Falha operacional',
    icon: FileX,
    classes: 'border-red-200 bg-red-50 text-red-700',
  },
  restricted: {
    label: 'Restrito',
    icon: Lock,
    classes: 'border-slate-200 bg-slate-100 text-slate-700',
  },
};

function Pill({
  icon: Icon,
  label,
  classes,
}: {
  icon: React.ElementType;
  label: string;
  classes: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

function DocumentStatusPill({ document }: { document: ClinicDocumentRow }) {
  const config = statusConfig[document.statusKind] ?? statusConfig.available;
  return <Pill icon={config.icon} label={config.label} classes={config.classes} />;
}

function SignaturePill({ document }: { document: ClinicDocumentRow }) {
  if (document.signatureStatus === 'assinado') {
    return (
      <Pill
        icon={ShieldCheck}
        label="Assinado"
        classes="border-emerald-200 bg-emerald-50 text-emerald-700"
      />
    );
  }
  if (document.signatureStatus === 'pendente') {
    return (
      <Pill
        icon={PenSquare}
        label="Assinatura pendente"
        classes="border-amber-200 bg-amber-50 text-amber-700"
      />
    );
  }
  if (
    document.signatureStatus === 'falhou' ||
    document.signatureStatus === 'recusado' ||
    document.signatureStatus === 'expirado'
  ) {
    return (
      <Pill
        icon={AlertTriangle}
        label="Falha assinatura"
        classes="border-red-200 bg-red-50 text-red-700"
      />
    );
  }
  return (
    <Pill
      icon={FileText}
      label={document.signatureEnabled ? 'Assinatura disponivel' : 'Sem assinatura'}
      classes="border-slate-200 bg-slate-100 text-slate-700"
    />
  );
}

function ReleasePill({ released }: { released: boolean }) {
  return released ? (
    <Pill
      icon={Unlock}
      label="Liberado"
      classes="border-emerald-200 bg-emerald-50 text-emerald-700"
    />
  ) : (
    <Pill icon={Lock} label="Restrito" classes="border-slate-200 bg-slate-100 text-slate-700" />
  );
}

function TemplateStatusPill({ template }: { template: ClinicDocumentTemplate }) {
  if (template.status === 'active') {
    return (
      <Pill
        icon={CheckCircle2}
        label="Ativo"
        classes="border-emerald-200 bg-emerald-50 text-emerald-700"
      />
    );
  }
  if (template.status === 'archived') {
    return (
      <Pill icon={Lock} label="Arquivado" classes="border-slate-200 bg-slate-100 text-slate-700" />
    );
  }
  return (
    <Pill icon={FileSearch} label="Rascunho" classes="border-blue-200 bg-blue-50 text-blue-700" />
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon size={16} aria-hidden="true" />
        <p>{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </article>
  );
}

function categoryLabel(category: ClinicDocumentCategory | string) {
  if (typeof category !== 'string') return category.label;
  return getDocumentCategoryLabel(category);
}

function TemplateLibrary({
  templates,
  categories,
  selectedCategory,
  statusFilter,
  search,
  busyAction,
  onCategoryChange,
  onStatusChange,
  onSearchChange,
  onDuplicate,
  onPickTemplate,
  onEditTemplate,
  onArchiveTemplate,
  onPublishTemplate,
}: {
  templates: ClinicDocumentTemplate[];
  categories: ClinicDocumentCategory[];
  selectedCategory: string;
  statusFilter: string;
  search: string;
  busyAction: string | null;
  onCategoryChange: (category: string) => void;
  onStatusChange: (status: string) => void;
  onSearchChange: (value: string) => void;
  onDuplicate: (template: ClinicDocumentTemplate) => void;
  onPickTemplate: (template: ClinicDocumentTemplate) => void;
  onEditTemplate: (template: ClinicDocumentTemplate) => void;
  onArchiveTemplate: (template: ClinicDocumentTemplate) => void;
  onPublishTemplate: (template: ClinicDocumentTemplate) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <LayoutTemplate size={16} aria-hidden="true" />
            Biblioteca de templates
          </h2>
          <span className="text-xs text-muted-foreground">{templates.length} itens</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="relative block">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">Buscar template</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar"
              className="h-10 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground"
            />
          </label>
          <label className="block">
            <span className="sr-only">Categoria</span>
            <select
              value={selectedCategory}
              onChange={(event) => onCategoryChange(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground sm:w-44"
            >
              <option value="all">Todas categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => onStatusChange(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground sm:w-36"
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="draft">Rascunhos</option>
              <option value="archived">Arquivados</option>
            </select>
          </label>
        </div>
      </div>
      <div className="max-h-[560px] overflow-y-auto p-3">
        {templates.length === 0 ? (
          <DataState
            kind="empty"
            title="Nenhum template encontrado"
            description="Ajuste os filtros ou duplique um template existente para criar uma nova base."
            className="min-h-40 border-0 bg-transparent"
          />
        ) : (
          <div className="space-y-2">
            {templates.map((template) => (
              <article key={template.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onPickTemplate(template)}
                      className="text-left text-sm font-semibold text-foreground hover:underline"
                    >
                      {template.name}
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {categoryLabel(template.category)} · v{template.currentVersion} ·{' '}
                      {template.generatedCount} gerados
                    </p>
                  </div>
                  <TemplateStatusPill template={template} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Pill
                    icon={PenSquare}
                    label={template.signatureLabel}
                    classes={
                      template.d4signEnabled
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-100 text-slate-700'
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {template.allowedVariables.length} variaveis livres
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onEditTemplate(template)}
                    className="btn-secondary min-h-10 justify-center text-xs"
                  >
                    <PenSquare size={14} aria-hidden="true" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicate(template)}
                    disabled={busyAction === `duplicate-${template.id}`}
                    className="btn-secondary min-h-10 justify-center text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Copy size={14} aria-hidden="true" />
                    {busyAction === `duplicate-${template.id}` ? 'Duplicando...' : 'Duplicar'}
                  </button>
                  {template.status === 'draft' ? (
                    <button
                      type="button"
                      onClick={() => onPublishTemplate(template)}
                      disabled={busyAction === `publish-${template.id}`}
                      className="btn-primary min-h-10 justify-center text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <UploadCloud size={14} aria-hidden="true" />
                      Publicar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onArchiveTemplate(template)}
                    disabled={busyAction === `archive-${template.id}`}
                    className="btn-secondary min-h-10 justify-center text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Archive size={14} aria-hidden="true" />
                    {template.status === 'archived' ? 'Restaurar' : 'Arquivar'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DocumentActions({
  document,
  busyAction,
  compact = false,
  showDetails = true,
  onDetails,
  onDownload,
  onSetRelease,
  onSignature,
  onUpdateSignatureStatus,
  canCreateSignedUrls,
  canRequestD4Sign,
}: {
  document: ClinicDocumentRow;
  busyAction: string | null;
  compact?: boolean;
  showDetails?: boolean;
  onDetails: (document: ClinicDocumentRow) => void;
  onDownload: (document: ClinicDocumentRow) => void;
  onSetRelease: (document: ClinicDocumentRow, released: boolean) => void;
  onSignature: (document: ClinicDocumentRow) => void;
  onUpdateSignatureStatus: (document: ClinicDocumentRow) => void;
  canCreateSignedUrls: boolean;
  canRequestD4Sign: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? '' : 'justify-start'}`}>
      {showDetails ? (
        <button type="button" onClick={() => onDetails(document)} className="btn-secondary text-xs">
          <Eye size={13} aria-hidden="true" />
          Detalhes
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onDownload(document)}
        disabled={!canCreateSignedUrls || busyAction === `download-${document.id}`}
        title={canCreateSignedUrls ? undefined : 'Signed URLs indisponiveis no plano deste tenant'}
        className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Download size={13} aria-hidden="true" />
        Link
      </button>
      <button
        type="button"
        onClick={() => onSetRelease(document, !document.releasedToPatient)}
        disabled={busyAction === `release-${document.id}`}
        className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
      >
        {document.releasedToPatient ? (
          <Lock size={13} aria-hidden="true" />
        ) : (
          <Unlock size={13} aria-hidden="true" />
        )}
        {document.releasedToPatient ? 'Ocultar' : 'Liberar'}
      </button>
      <button
        type="button"
        onClick={() => onSignature(document)}
        disabled={
          !canRequestD4Sign || !document.canRequestSignature || busyAction === `sign-${document.id}`
        }
        title={
          !canRequestD4Sign
            ? 'Envio D4Sign indisponivel no plano deste tenant'
            : document.canRequestSignature
              ? undefined
              : document.signatureEnabled
                ? 'Assinatura indisponivel neste status'
                : 'Template sem assinatura digital'
        }
        className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
      >
        <PenSquare size={13} aria-hidden="true" />
        {documentSignatureActionLabel(document)}
      </button>
      <button
        type="button"
        onClick={() => onUpdateSignatureStatus(document)}
        disabled={!document.signatureEnabled || busyAction === `status-${document.id}`}
        title={document.signatureEnabled ? undefined : 'Documento sem assinatura digital'}
        className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw size={13} aria-hidden="true" />
        Atualizar status
      </button>
    </div>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SignatureRequestDraft = ClinicDocumentSigner & { id: string };

function makeSignatureDraft(signer?: Partial<ClinicDocumentSigner>): SignatureRequestDraft {
  return {
    id: `signer-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: signer?.name ?? '',
    email: signer?.email ?? '',
    role: signer?.role ?? '',
  };
}

function validateSignatureDrafts(signers: SignatureRequestDraft[]) {
  const normalized = signers.map((signer) => ({
    ...signer,
    name: signer.name.trim(),
    email: signer.email.trim().toLowerCase(),
    role: signer.role?.trim() ?? '',
  }));
  if (normalized.length === 0) return 'Informe ao menos um signatario.';
  if (normalized.some((signer) => !signer.name || !signer.email)) {
    return 'Preencha nome e email de todos os signatarios.';
  }
  if (normalized.some((signer) => !EMAIL_PATTERN.test(signer.email))) {
    return 'Informe emails validos para os signatarios.';
  }
  const emails = normalized.map((signer) => signer.email);
  if (new Set(emails).size !== emails.length) {
    return 'Remova emails duplicados antes de enviar para assinatura digital.';
  }
  return null;
}

function SignatureRequestDialog({
  document,
  workspace,
  busyAction,
  onClose,
  onSubmit,
}: {
  document: ClinicDocumentRow;
  workspace: ClinicDocumentsWorkspace;
  busyAction: string | null;
  onClose: () => void;
  onSubmit: (document: ClinicDocumentRow, signers: ClinicDocumentSigner[]) => void;
}) {
  const suggestedSigners = useMemo(() => {
    const patient = workspace.patients.find((item) => item.id === document.patientId);
    const suggestions: ClinicDocumentSigner[] = [];
    if (patient?.email) {
      suggestions.push({ name: patient.name, email: patient.email, role: 'Paciente' });
    }
    if (patient?.guardianEmail) {
      suggestions.push({
        name: patient.guardianName || `Responsavel de ${patient.name}`,
        email: patient.guardianEmail,
        role: 'Responsavel',
      });
    }
    for (const professional of workspace.professionalSigners) {
      suggestions.push({
        name: professional.name,
        email: professional.email,
        role: professional.role || 'Profissional',
      });
    }
    const seen = new Set<string>();
    return suggestions.filter((signer) => {
      const email = signer.email.trim().toLowerCase();
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  }, [document.patientId, workspace.patients, workspace.professionalSigners]);

  const [signers, setSigners] = useState<SignatureRequestDraft[]>(() =>
    suggestedSigners.length > 0
      ? suggestedSigners.slice(0, 2).map(makeSignatureDraft)
      : [makeSignatureDraft()]
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const isSending = busyAction === `sign-${document.id}`;

  function addSigner(signer?: ClinicDocumentSigner) {
    setSigners((current) => [...current, makeSignatureDraft(signer)]);
    setValidationError(null);
  }

  function updateSigner(id: string, field: keyof ClinicDocumentSigner, value: string) {
    setSigners((current) =>
      current.map((signer) => (signer.id === id ? { ...signer, [field]: value } : signer))
    );
    setValidationError(null);
  }

  function removeSigner(id: string) {
    setSigners((current) => current.filter((signer) => signer.id !== id));
    setValidationError(null);
  }

  function submit() {
    const validation = validateSignatureDrafts(signers);
    if (validation) {
      setValidationError(validation);
      return;
    }
    onSubmit(
      document,
      signers.map((signer) => ({
        name: signer.name.trim(),
        email: signer.email.trim().toLowerCase(),
        role: signer.role?.trim() || undefined,
      }))
    );
  }

  return (
    <Dialog
      open
      title="Enviar para assinatura digital"
      description={`Revise os signatarios de ${document.displayCode} antes do envio.`}
      onOpenChange={(open) => {
        if (!open && !isSending) onClose();
      }}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="btn-secondary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isSending}
            className="btn-primary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send size={16} aria-hidden="true" />
            {isSending ? 'Enviando...' : 'Enviar para assinatura'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Selecione paciente, responsavel ou profissional quando disponiveis, ou adicione outro
          signatario manualmente.
        </div>

        {suggestedSigners.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sugestoes disponiveis
            </h3>
            <div className="flex flex-wrap gap-2">
              {suggestedSigners.map((signer) => (
                <button
                  key={`${signer.email}-${signer.role ?? 'signer'}`}
                  type="button"
                  onClick={() => addSigner(signer)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
                >
                  {signer.role}: {signer.name}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="space-y-3">
          {signers.map((signer, index) => (
            <div key={signer.id} className="rounded-lg border border-border p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Signatario {index + 1}</p>
                <button
                  type="button"
                  onClick={() => removeSigner(signer.id)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Remover
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-medium text-muted-foreground sm:col-span-1">
                  Nome
                  <input
                    value={signer.name}
                    onChange={(event) => updateSigner(signer.id, 'name', event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                  />
                </label>
                <label className="text-xs font-medium text-muted-foreground sm:col-span-1">
                  Email
                  <input
                    value={signer.email}
                    type="email"
                    onChange={(event) => updateSigner(signer.id, 'email', event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                  />
                </label>
                <label className="text-xs font-medium text-muted-foreground sm:col-span-1">
                  Papel
                  <input
                    value={signer.role ?? ''}
                    onChange={(event) => updateSigner(signer.id, 'role', event.target.value)}
                    placeholder="Paciente, responsavel..."
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => addSigner()} className="btn-secondary text-sm">
          <FilePlus2 size={16} aria-hidden="true" />
          Adicionar signatario
        </button>

        {validationError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {validationError}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function documentSignatureActionLabel(document: ClinicDocumentRow) {
  return ['falhou', 'recusado', 'expirado'].includes(document.signatureStatus)
    ? 'Reenviar assinatura'
    : 'Enviar assinatura';
}

function DetailField({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value || '-'}</dd>
    </div>
  );
}

function EvidenceSummary({ evidence }: { evidence: DocumentEvidenceResult }) {
  const safeSummaryKeyPattern =
    /(payload|raw|body|storage|path|url|token|secret|key|signed|cookie|authorization|provider)/i;
  const entries = Object.entries(evidence.summary ?? {}).filter(
    ([key, value]) =>
      !safeSummaryKeyPattern.test(key) &&
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
  );
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DetailField
          label="Pacote de evidencias"
          value={evidence.hasPackage ? 'Disponivel' : 'Nao disponivel'}
        />
        <DetailField label="Status da evidencia" value={evidence.status} />
        <DetailField label="Criada em" value={evidence.createdAt || '-'} />
        <DetailField label="Documento" value={evidence.documentName || evidence.documentId} />
      </dl>
      {entries.length === 0 ? (
        <DataState
          kind="empty"
          title="Resumo de evidencias vazio"
          description="A consulta foi permitida, mas nao retornou detalhes auditaveis adicionais."
          className="min-h-32"
        />
      ) : (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Resumo tecnico
          </h4>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            {entries.map(([key, value]) => (
              <div key={key} className="rounded bg-card px-2 py-1.5">
                <dt className="font-medium text-muted-foreground">{key}</dt>
                <dd className="mt-1 break-words text-foreground">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function DocumentDetailDialog({
  document,
  templates,
  busyAction,
  onClose,
  onDownload,
  onSetRelease,
  onSignature,
  onUpdateSignatureStatus,
  canCreateSignedUrls,
  canRequestD4Sign,
}: {
  document: ClinicDocumentRow;
  templates: ClinicDocumentTemplate[];
  busyAction: string | null;
  onClose: () => void;
  onDownload: (document: ClinicDocumentRow) => void;
  onSetRelease: (document: ClinicDocumentRow, released: boolean) => void;
  onSignature: (document: ClinicDocumentRow) => void;
  onUpdateSignatureStatus: (document: ClinicDocumentRow) => void;
  canCreateSignedUrls: boolean;
  canRequestD4Sign: boolean;
}) {
  const [evidence, setEvidence] = useState<DocumentEvidenceResult | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<ClinicDocumentAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const auditSectionId = `document-audit-${document.id}`;
  const template = templates.find((item) => item.id === document.templateId);

  const loadEvidence = useCallback(async () => {
    setEvidenceLoading(true);
    setEvidenceError(null);
    const result = await getPatientDocumentEvidence(document.id, document.patientId);
    setEvidence(result.data);
    setEvidenceError(result.error?.message ?? null);
    setEvidenceLoading(false);
  }, [document.id, document.patientId]);

  const loadAuditEvents = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    const result = await getClinicDocumentAuditEvents({
      documentId: document.id,
      patientId: document.patientId,
      templateId: document.templateId,
    });
    setAuditEvents(result.data);
    setAuditError(result.error?.message ?? null);
    setAuditLoading(false);
  }, [document.id, document.patientId, document.templateId]);

  useEffect(() => {
    setEvidence(null);
    setAuditEvents([]);
    void loadEvidence();
    void loadAuditEvents();
  }, [loadEvidence, loadAuditEvents]);

  const canRequestSignatureNow = canRequestD4Sign && document.canRequestSignature;

  return (
    <Dialog
      open
      title="Detalhes do documento"
      description={`${document.name} · Codigo ${document.displayCode}`}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="right"
      mobileFullscreen
      footer={
        <div className="flex flex-col gap-2">
          <DocumentActions
            document={document}
            busyAction={busyAction}
            compact
            showDetails={false}
            onDetails={() => undefined}
            onDownload={onDownload}
            onSetRelease={onSetRelease}
            onSignature={onSignature}
            onUpdateSignatureStatus={onUpdateSignatureStatus}
            canCreateSignedUrls={canCreateSignedUrls}
            canRequestD4Sign={canRequestD4Sign}
          />
          <button
            type="button"
            onClick={() =>
              globalThis.document
                .getElementById(auditSectionId)
                ?.scrollIntoView({ behavior: 'smooth' })
            }
            className="btn-secondary justify-center text-xs"
          >
            <Activity size={13} aria-hidden="true" />
            Visualizar auditoria
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap gap-2">
            <DocumentStatusPill document={document} />
            <SignaturePill document={document} />
            <ReleasePill released={document.releasedToPatient} />
          </div>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailField
              label="Identificacao"
              value={`${document.displayCode || document.id} · ${document.name}`}
            />
            <DetailField label="Paciente" value={document.patientName} />
            <DetailField
              label="Template e versao"
              value={
                document.templateName
                  ? `${document.templateName} · v${template?.currentVersion ?? 'nao informada'}`
                  : 'Sem template vinculado'
              }
            />
            <DetailField label="Status interno" value={document.status} />
            <DetailField
              label="Status de assinatura"
              value={
                document.signatureStatus ||
                (document.signatureEnabled ? 'disponivel' : 'sem assinatura')
              }
            />
            <DetailField
              label="Liberacao ao paciente"
              value={
                document.releasedToPatient
                  ? 'Liberado ao portal do paciente/responsavel'
                  : 'Oculto do portal do paciente/responsavel'
              }
            />
            <DetailField label="Gerado em" value={document.generatedAt} />
            <DetailField label="Atualizado em" value={document.updatedAt} />
          </dl>
        </section>

        <section className="rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Acoes contextuais</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Signed URL, liberacao ao paciente e assinatura respeitam permissoes e status atuais.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p>
              {canCreateSignedUrls ? 'Signed URL disponivel.' : 'Signed URL bloqueada pelo plano.'}
            </p>
            <p>
              {canRequestSignatureNow
                ? `${documentSignatureActionLabel(document)} permitido.`
                : 'Assinatura indisponivel neste contexto.'}
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Evidencias sob demanda</h3>
            <button
              type="button"
              onClick={() => void loadEvidence()}
              className="btn-secondary text-xs"
              disabled={evidenceLoading}
            >
              <RefreshCw
                size={13}
                className={evidenceLoading ? 'animate-spin' : undefined}
                aria-hidden="true"
              />
              Recarregar
            </button>
          </div>
          <div className="mt-3">
            {evidenceLoading ? (
              <DataState
                kind="loading"
                title="Carregando evidencias"
                description="Buscando pacote auditavel do documento."
                className="min-h-32"
              />
            ) : evidenceError ? (
              <DataState
                kind={
                  /permiss|permission|forbidden|rls|acesso|unauthorized/i.test(evidenceError)
                    ? 'forbidden'
                    : 'error'
                }
                title="Nao foi possivel carregar evidencias"
                description={evidenceError}
                actionLabel="Tentar novamente"
                onAction={() => void loadEvidence()}
                className="min-h-32"
              />
            ) : evidence ? (
              <EvidenceSummary evidence={evidence} />
            ) : (
              <DataState
                kind="empty"
                title="Sem evidencias"
                description="Nenhuma evidencia foi retornada para este documento."
                className="min-h-32"
              />
            )}
          </div>
        </section>

        <section id={auditSectionId} className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Auditoria do documento</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Eventos carregados por documento selecionado, com retornos de assinatura e template
                vinculado.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadAuditEvents()}
              className="btn-secondary text-xs"
              disabled={auditLoading}
            >
              <RefreshCw
                size={13}
                className={auditLoading ? 'animate-spin' : undefined}
                aria-hidden="true"
              />
              Recarregar
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {auditLoading ? (
              <DataState
                kind="loading"
                title="Carregando auditoria"
                description="Buscando eventos auditaveis do documento selecionado."
                className="min-h-32"
              />
            ) : auditError ? (
              <DataState
                kind="error"
                title="Nao foi possivel carregar auditoria"
                description={auditError}
                actionLabel="Tentar novamente"
                onAction={() => void loadAuditEvents()}
                className="min-h-32"
              />
            ) : (
              <DocumentAuditTimeline events={auditEvents} />
            )}
          </div>
        </section>
      </div>
    </Dialog>
  );
}

function getMissingRequiredVariables(
  template: ClinicDocumentTemplate | null | undefined,
  variables: Record<string, string>
) {
  return (template?.allowedVariables ?? []).filter((key) => !variables[key]?.trim());
}

function buildDocumentPreview(
  template: ClinicDocumentTemplate | null | undefined,
  variables: Record<string, string>
) {
  if (!template) return '';
  return template.templateBody.replace(
    /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g,
    (_match, key: string) => {
      if (key in PREVIEW_PROTECTED_VALUES) return PREVIEW_PROTECTED_VALUES[key];
      return variables[key]?.trim() || `{{${key}}}`;
    }
  );
}

function WizardProgress({ step }: { step: WizardStep }) {
  return (
    <ol className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
      {wizardSteps.map((label, index) => (
        <li
          key={label}
          className={`rounded-lg border px-2 py-2 text-center ${
            index === step
              ? 'border-primary bg-primary/10 text-primary'
              : index < step
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-border bg-muted/40 text-muted-foreground'
          }`}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}

function DocumentPatientStep({
  patients,
  selectedPatientId,
  onPatientChange,
}: {
  patients: ClinicDocumentsWorkspace['patients'];
  selectedPatientId: string;
  onPatientChange: (patientId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Selecione o paciente</h3>
      <label className="block">
        <span className="sr-only">Paciente</span>
        <select
          value={selectedPatientId}
          onChange={(event) => onPatientChange(event.target.value)}
          className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
        >
          <option value="">Selecione</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function DocumentCategoryStep({
  categories,
  activeTemplatesCount,
  selectedCategoryId,
  onCategoryChange,
}: {
  categories: ClinicDocumentCategory[];
  activeTemplatesCount: number;
  selectedCategoryId: string;
  onCategoryChange: (categoryId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Escolha a categoria</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onCategoryChange('all')}
          className={`rounded-lg border px-3 py-3 text-left text-sm ${
            selectedCategoryId === 'all'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-foreground'
          }`}
        >
          Todas categorias
          <span className="mt-1 block text-xs text-muted-foreground">
            {activeTemplatesCount} templates ativos
          </span>
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onCategoryChange(category.id)}
            className={`rounded-lg border px-3 py-3 text-left text-sm ${
              selectedCategoryId === category.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-foreground'
            }`}
          >
            {category.label}
            <span className="mt-1 block text-xs text-muted-foreground">
              {category.activeTemplates} ativos
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DocumentTemplateStep({
  templates,
  selectedTemplateId,
  onTemplateChange,
}: {
  templates: ClinicDocumentTemplate[];
  selectedTemplateId: string;
  onTemplateChange: (templateId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Selecione o template</h3>
      {templates.length === 0 ? (
        <DataState
          kind="empty"
          title="Nenhum template ativo"
          description="Escolha outra categoria ou ative um template da biblioteca."
          className="min-h-40"
        />
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onTemplateChange(template.id)}
              className={`w-full rounded-lg border px-3 py-3 text-left ${
                selectedTemplateId === template.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border'
              }`}
            >
              <span className="text-sm font-semibold text-foreground">{template.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {categoryLabel(template.category)} · v{template.currentVersion} ·{' '}
                {template.signatureLabel}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentVariablesStep({
  template,
  variables,
  missingRequiredVariables,
  onVariableChange,
}: {
  template: ClinicDocumentTemplate | null | undefined;
  variables: Record<string, string>;
  missingRequiredVariables: string[];
  onVariableChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Variaveis do template</h3>
      {missingRequiredVariables.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Preencha os campos obrigatorios: {missingRequiredVariables.join(', ')}.
        </div>
      ) : null}
      {template?.allowedVariables.length ? (
        template.allowedVariables.map((key) => (
          <label key={key} className="block text-xs font-medium text-muted-foreground">
            {key} <span className="text-red-600">*</span>
            <input
              value={variables[key] ?? ''}
              onChange={(event) => onVariableChange(key, event.target.value)}
              required
              className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              maxLength={160}
            />
          </label>
        ))
      ) : (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          Este template usa apenas variaveis protegidas preenchidas pelo sistema.
        </div>
      )}
    </div>
  );
}

function DocumentReviewStep({
  patientName,
  template,
  variables,
  missingRequiredVariables,
  preview,
}: {
  patientName: string;
  template: ClinicDocumentTemplate | null | undefined;
  variables: Record<string, string>;
  missingRequiredVariables: string[];
  preview: string;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Revisao</h3>
      {missingRequiredVariables.length ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          Complete os campos obrigatorios antes de gerar: {missingRequiredVariables.join(', ')}.
        </div>
      ) : null}
      <dl className="grid gap-3 text-sm">
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">Paciente</dt>
          <dd className="mt-1 font-medium text-foreground">{patientName || '-'}</dd>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">Template</dt>
          <dd className="mt-1 font-medium text-foreground">{template?.name ?? '-'}</dd>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">Variaveis livres</dt>
          <dd className="mt-1 text-foreground">
            {template?.allowedVariables.length
              ? template.allowedVariables
                  .map((key) => `${key}: ${variables[key] || '-'}`)
                  .join(' | ')
              : 'Sem variaveis livres'}
          </dd>
        </div>
      </dl>
      <section className="rounded-lg border border-border bg-muted/30 p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preview do documento
        </h4>
        <pre className="mt-2 max-h-80 whitespace-pre-wrap rounded-md bg-card p-3 text-sm text-foreground">
          {preview || 'Selecione um template para montar o preview antes da geracao.'}
        </pre>
      </section>
    </div>
  );
}

function DocumentAccessStep({
  document,
  busyAction,
  canCreateSignedUrls,
  canRequestD4Sign,
  onDownload,
  onSetRelease,
  onSignature,
  onCopyIdentifier,
  onBackToList,
}: {
  document: ClinicDocumentRow | null;
  busyAction: string | null;
  canCreateSignedUrls: boolean;
  canRequestD4Sign: boolean;
  onDownload: (document: ClinicDocumentRow) => void;
  onSetRelease: (document: ClinicDocumentRow, released: boolean) => void;
  onSignature: (document: ClinicDocumentRow) => void;
  onCopyIdentifier: (document: ClinicDocumentRow) => void;
  onBackToList: (document: ClinicDocumentRow) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Documento gerado. Use as acoes imediatas abaixo para abrir, liberar ao portal, enviar para
        assinatura ou voltar para a lista filtrada.
      </div>
      {document ? (
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm font-semibold text-foreground">{document.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Codigo {document.displayCode} · {document.patientName}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <DocumentStatusPill document={document} />
            <SignaturePill document={document} />
            <ReleasePill released={document.releasedToPatient} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onDownload(document)}
              disabled={!canCreateSignedUrls || busyAction === `download-${document.id}`}
              className="btn-secondary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={16} aria-hidden="true" />
              Abrir/download
            </button>
            <button
              type="button"
              onClick={() => onSetRelease(document, !document.releasedToPatient)}
              disabled={busyAction === `release-${document.id}`}
              className="btn-secondary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {document.releasedToPatient ? (
                <Lock size={16} aria-hidden="true" />
              ) : (
                <Unlock size={16} aria-hidden="true" />
              )}
              {document.releasedToPatient ? 'Ocultar do portal' : 'Liberar ao portal'}
            </button>
            <button
              type="button"
              onClick={() => onSignature(document)}
              disabled={
                !canRequestD4Sign ||
                !document.canRequestSignature ||
                busyAction === `sign-${document.id}`
              }
              className="btn-secondary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={16} aria-hidden="true" />
              Enviar para assinatura
            </button>
            <button
              type="button"
              onClick={() => onCopyIdentifier(document)}
              className="btn-secondary justify-center text-sm"
            >
              <Copy size={16} aria-hidden="true" />
              Copiar identificador
            </button>
            <button
              type="button"
              onClick={() => onBackToList(document)}
              className="btn-primary justify-center text-sm sm:col-span-2"
            >
              <FileSearch size={16} aria-hidden="true" />
              Voltar a lista filtrada
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Atualize a lista caso o documento ainda nao apareca no workspace.
        </p>
      )}
    </div>
  );
}

function DocumentWizard({
  open,
  workspace,
  step,
  selectedPatientId,
  selectedCategoryId,
  selectedTemplateId,
  variables,
  busyAction,
  generatedDocument,
  onClose,
  onStepChange,
  onPatientChange,
  onCategoryChange,
  onTemplateChange,
  onVariableChange,
  onGenerate,
  onSetRelease,
  onSignature,
  onDownload,
  onCopyIdentifier,
  onBackToList,
  canRequestD4Sign,
  canCreateSignedUrls,
}: {
  open: boolean;
  workspace: ClinicDocumentsWorkspace;
  step: WizardStep;
  selectedPatientId: string;
  selectedCategoryId: string;
  selectedTemplateId: string;
  variables: Record<string, string>;
  busyAction: string | null;
  generatedDocument: ClinicDocumentRow | null;
  onClose: () => void;
  onStepChange: (step: WizardStep) => void;
  onPatientChange: (patientId: string) => void;
  onCategoryChange: (categoryId: string) => void;
  onTemplateChange: (templateId: string) => void;
  onVariableChange: (key: string, value: string) => void;
  onGenerate: () => void;
  onSetRelease: (document: ClinicDocumentRow, released: boolean) => void;
  onSignature: (document: ClinicDocumentRow) => void;
  onDownload: (document: ClinicDocumentRow) => void;
  onCopyIdentifier: (document: ClinicDocumentRow) => void;
  onBackToList: (document: ClinicDocumentRow) => void;
  canRequestD4Sign: boolean;
  canCreateSignedUrls: boolean;
}) {
  const activeTemplates = workspace.templates.filter((template) => template.status === 'active');
  const templatesByCategory = activeTemplates.filter(
    (template) => selectedCategoryId === 'all' || template.category === selectedCategoryId
  );
  const selectedPatient = workspace.patients.find((patient) => patient.id === selectedPatientId);
  const selectedTemplate = activeTemplates.find((template) => template.id === selectedTemplateId);
  const missingRequiredVariables = getMissingRequiredVariables(selectedTemplate, variables);
  const preview = buildDocumentPreview(selectedTemplate, variables);
  const canGoNext =
    (step === 0 && Boolean(selectedPatientId)) ||
    (step === 1 && Boolean(selectedCategoryId)) ||
    (step === 2 && Boolean(selectedTemplateId)) ||
    (step === 3 && missingRequiredVariables.length === 0) ||
    step === 4 ||
    step === 5;
  const canGenerate =
    Boolean(selectedPatientId && selectedTemplateId) && missingRequiredVariables.length === 0;

  function nextStep() {
    if (step < 5) onStepChange((step + 1) as WizardStep);
  }

  function previousStep() {
    if (step > 0) onStepChange((step - 1) as WizardStep);
  }

  return (
    <Dialog
      open={open}
      title="Novo documento"
      description="Wizard: paciente, categoria, template, variaveis, revisao e acesso."
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      placement="right"
      mobileFullscreen
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={previousStep}
            disabled={step === 0 || busyAction === 'generate'}
            className="btn-secondary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Voltar
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            {step < 4 ? (
              <button
                type="button"
                onClick={nextStep}
                disabled={!canGoNext}
                className="btn-primary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Continuar
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ) : null}
            {step === 4 ? (
              <button
                type="button"
                onClick={onGenerate}
                disabled={!canGenerate || busyAction === 'generate'}
                className="btn-primary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FilePlus2 size={16} aria-hidden="true" />
                {busyAction === 'generate' ? 'Gerando...' : 'Gerar documento'}
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <WizardProgress step={step} />
        {step === 0 ? (
          <DocumentPatientStep
            patients={workspace.patients}
            selectedPatientId={selectedPatientId}
            onPatientChange={onPatientChange}
          />
        ) : null}
        {step === 1 ? (
          <DocumentCategoryStep
            categories={workspace.categories}
            activeTemplatesCount={activeTemplates.length}
            selectedCategoryId={selectedCategoryId}
            onCategoryChange={onCategoryChange}
          />
        ) : null}
        {step === 2 ? (
          <DocumentTemplateStep
            templates={templatesByCategory}
            selectedTemplateId={selectedTemplateId}
            onTemplateChange={onTemplateChange}
          />
        ) : null}
        {step === 3 ? (
          <DocumentVariablesStep
            template={selectedTemplate}
            variables={variables}
            missingRequiredVariables={missingRequiredVariables}
            onVariableChange={onVariableChange}
          />
        ) : null}
        {step === 4 ? (
          <DocumentReviewStep
            patientName={selectedPatient?.name ?? ''}
            template={selectedTemplate}
            variables={variables}
            missingRequiredVariables={missingRequiredVariables}
            preview={preview}
          />
        ) : null}
        {step === 5 ? (
          <DocumentAccessStep
            document={generatedDocument}
            busyAction={busyAction}
            canCreateSignedUrls={canCreateSignedUrls}
            canRequestD4Sign={canRequestD4Sign}
            onDownload={onDownload}
            onSetRelease={onSetRelease}
            onSignature={onSignature}
            onCopyIdentifier={onCopyIdentifier}
            onBackToList={onBackToList}
          />
        ) : null}
      </div>
    </Dialog>
  );
}

type TemplateEditorForm = {
  name: string;
  category: string;
  templateBody: string;
  status: 'draft' | 'active' | 'archived';
  d4signEnabled: boolean;
  allowedVariablesText: string;
};

function templateToForm(template?: ClinicDocumentTemplate): TemplateEditorForm {
  return {
    name: template?.name ?? '',
    category: template?.category ?? 'outros',
    templateBody: template?.templateBody ?? '',
    status: (template?.status as TemplateEditorForm['status']) ?? 'draft',
    d4signEnabled: template?.d4signEnabled ?? false,
    allowedVariablesText: template?.allowedVariables.join('\n') ?? '',
  };
}

function TemplateEditorDialog({
  template,
  form,
  busyAction,
  onClose,
  onChange,
  onSave,
}: {
  template: ClinicDocumentTemplate | null;
  form: TemplateEditorForm;
  busyAction: string | null;
  onClose: () => void;
  onChange: (form: TemplateEditorForm) => void;
  onSave: () => void;
}) {
  const allowedVariables = form.allowedVariablesText
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const protectedVariables = [...PROTECTED_TEMPLATE_VARIABLES].sort((a, b) => a.localeCompare(b));
  const placeholders = getTemplatePlaceholders(form.templateBody);
  const protectedPlaceholders = placeholders.filter((key) => PROTECTED_TEMPLATE_VARIABLES.has(key));
  const freePlaceholders = placeholders.filter((key) => !PROTECTED_TEMPLATE_VARIABLES.has(key));
  const validationError = validateTemplateVariables(form.templateBody, allowedVariables, {
    name: form.name,
    category: form.category,
    status: form.status,
  })?.message;
  const preview = renderTemplatePreview(form.templateBody, allowedVariables);
  const saving = busyAction === 'template-save';

  return (
    <Dialog
      open
      title={template ? 'Editar template' : 'Novo template'}
      description="Configure nome, categoria, modelo, status e assinatura digital."
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      placement="right"
      mobileFullscreen
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-secondary justify-center text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={
              saving || Boolean(validationError) || !form.name.trim() || !form.category.trim()
            }
            className="btn-primary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            {saving ? 'Salvando...' : 'Salvar template'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block text-xs font-medium text-muted-foreground">
          Nome
          <input
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
            maxLength={200}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-muted-foreground">
            Categoria
            <input
              value={form.category}
              onChange={(event) => onChange({ ...form, category: event.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              maxLength={80}
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Status
            <select
              value={form.status}
              onChange={(event) =>
                onChange({ ...form, status: event.target.value as TemplateEditorForm['status'] })
              }
              className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
            >
              <option value="draft">Rascunho</option>
              <option value="active">Ativo</option>
              <option value="archived">Arquivado</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={form.d4signEnabled}
            onChange={(event) => onChange({ ...form, d4signEnabled: event.target.checked })}
          />
          Exigir assinatura digital D4Sign para documentos gerados deste template
        </label>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <label className="block text-xs font-medium text-muted-foreground">
              Conteudo/modelo
              <textarea
                value={form.templateBody}
                onChange={(event) => onChange({ ...form, templateBody: event.target.value })}
                className="mt-1 min-h-64 w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground"
                placeholder="Use {{patient_name}}, {{date}}, {{professional_name}} e variaveis livres como {{observacoes}}."
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Variaveis livres permitidas (uma por linha ou separadas por virgula)
              <textarea
                value={form.allowedVariablesText}
                onChange={(event) =>
                  onChange({ ...form, allowedVariablesText: event.target.value })
                }
                className="mt-1 min-h-28 w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground"
                placeholder="exames_solicitados\nobservacoes"
              />
            </label>
            <section className="rounded-lg border border-border bg-muted/30 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Preview seguro
              </h3>
              <pre className="mt-2 max-h-72 whitespace-pre-wrap rounded-md bg-card p-3 text-sm text-foreground">
                {preview || 'O preview aparece aqui com dados mockados e sem PII real.'}
              </pre>
            </section>
          </div>
          <aside className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Lock size={13} aria-hidden="true" />
                Variaveis protegidas
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use no conteudo, mas nao cadastre como entrada manual. Sao preenchidas pelo sistema.
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {protectedVariables.map((variable) => (
                  <code
                    key={variable}
                    className="rounded bg-card px-1.5 py-1 text-[11px] text-foreground"
                  >
                    {`{{${variable}}}`}
                  </code>
                ))}
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Detectadas no conteudo
              </h3>
              <p className="mt-2 text-xs text-muted-foreground">
                Protegidas:{' '}
                {protectedPlaceholders.length ? protectedPlaceholders.join(', ') : 'nenhuma'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Livres: {freePlaceholders.length ? freePlaceholders.join(', ') : 'nenhuma'}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Placeholders desconhecidos precisam estar na lista de variaveis livres antes de
              salvar.
            </div>
          </aside>
        </div>
        {validationError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {validationError}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function MonitorStatusPill({ event }: { event: ClinicDocumentMonitorEvent }) {
  const failed = event.status === 'failed';
  const acknowledged = event.status === 'acknowledged';
  return (
    <Pill
      icon={failed ? AlertTriangle : acknowledged ? CheckCircle2 : Activity}
      label={`${event.severity} · ${event.status}`}
      classes={
        failed
          ? 'border-red-200 bg-red-50 text-red-700'
          : event.severity === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-blue-200 bg-blue-50 text-blue-700'
      }
    />
  );
}

function OperationalMonitor({
  events,
  busyAction,
  onAcknowledge,
  onReprocess,
}: {
  events: ClinicDocumentMonitorEvent[];
  busyAction: string | null;
  onAcknowledge: (event: ClinicDocumentMonitorEvent) => void;
  onReprocess: (event: ClinicDocumentMonitorEvent) => void;
}) {
  const bySeverity = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.severity] = (acc[event.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Activity size={16} aria-hidden="true" />
            Monitor operacional de documentos
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Eventos agrupados por severidade com vinculo de documento/paciente quando disponivel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-red-700">
            Criticos {bySeverity.critical ?? 0}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
            Alertas {bySeverity.warning ?? 0}
          </span>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">
            Info {bySeverity.info ?? 0}
          </span>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {events.length === 0 ? (
          <DataState
            kind="empty"
            title="Monitor sem eventos"
            description="Nenhum documento pendente/falhado ou evento D4Sign recente."
            className="min-h-32 border-0 bg-transparent"
          />
        ) : (
          events.map((event) => (
            <article key={event.id} className="rounded-lg border border-border px-3 py-3 text-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{event.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.createdAt} · tipo {event.eventType ?? 'status'} · tentativas{' '}
                    {event.retryCount}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Documento: {event.documentName ?? event.documentId ?? 'nao vinculado'} ·
                    Paciente: {event.patientName ?? event.patientId ?? 'nao vinculado'}
                  </p>
                  {event.acknowledgedAt ? (
                    <p className="mt-1 text-xs text-emerald-700">
                      Reconhecido em {event.acknowledgedAt}
                    </p>
                  ) : null}
                  {event.error ? <p className="mt-1 text-xs text-red-600">{event.error}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <MonitorStatusPill event={event} />
                  {event.status === 'failed' ? (
                    <button
                      type="button"
                      onClick={() => onAcknowledge(event)}
                      disabled={busyAction === `ack-${event.id}`}
                      className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <CheckCircle2 size={13} aria-hidden="true" />
                      Reconhecer
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onReprocess(event)}
                    disabled={busyAction === `reprocess-${event.id}` || event.id.startsWith('doc-')}
                    title={
                      event.id.startsWith('doc-')
                        ? 'Reprocesso disponivel apenas para eventos D4Sign'
                        : undefined
                    }
                    className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    Reprocessar
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default function ClinicDocumentsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const documentFilters = useMemo(() => readDocumentFilters(searchParams), [searchParams]);

  const [workspace, setWorkspace] = useState<ClinicDocumentsWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategory, setTemplateCategory] = useState('all');
  const [templateStatus, setTemplateStatus] = useState('all');
  const [documentFilterId, setDocumentFilterId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(0);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [wizardGeneratedDocumentId, setWizardGeneratedDocumentId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<ClinicDocumentRow | null>(null);
  const [signatureDocument, setSignatureDocument] = useState<ClinicDocumentRow | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ClinicDocumentTemplate | null>(null);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateEditorForm, setTemplateEditorForm] = useState<TemplateEditorForm>(() =>
    templateToForm()
  );
  const [featureFlags, setFeatureFlags] = useState<Set<string>>(() => new Set());
  const canRequestD4Sign = featureFlags.has('documents.d4sign_send');
  const canCreateSignedUrls = featureFlags.has('documents.signed_urls');

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getClinicDocumentsWorkspace(documentFilters);
    setWorkspace(result.data);
    setError(result.error?.message ?? null);
    setLoading(false);
    return result.data;
  }, [documentFilters]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    let mounted = true;

    async function loadFeatureFlags() {
      try {
        const response = await fetch('/api/auth/app-session');
        const payload = (await response.json().catch(() => null)) as {
          featureFlags?: string[];
        } | null;
        if (mounted && response.ok) setFeatureFlags(new Set(payload?.featureFlags ?? []));
      } catch {
        if (mounted) setFeatureFlags(new Set());
      }
    }

    void loadFeatureFlags();

    return () => {
      mounted = false;
    };
  }, []);

  const activeTemplates = useMemo(
    () => workspace?.templates.filter((template) => template.status === 'active') ?? [],
    [workspace?.templates]
  );

  const filteredTemplates = useMemo(() => {
    const search = templateSearch.trim().toLowerCase();
    return (workspace?.templates ?? []).filter((template) => {
      if (templateCategory !== 'all' && template.category !== templateCategory) return false;
      if (templateStatus !== 'all' && template.status !== templateStatus) return false;
      if (search && !template.name.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [templateCategory, templateSearch, templateStatus, workspace?.templates]);

  const selectedTemplate = useMemo(
    () => activeTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [activeTemplates, selectedTemplateId]
  );

  const filteredDocuments = useMemo(
    () =>
      documentFilterId
        ? (workspace?.documents ?? []).filter((document) => document.id === documentFilterId)
        : (workspace?.documents ?? []),
    [documentFilterId, workspace?.documents]
  );

  const updateDocumentFilters = useCallback(
    (nextFilters: Partial<ClinicDocumentsWorkspaceFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...documentFilters, ...nextFilters };
      writeFilterParam(params, 'page', merged.page && merged.page > 1 ? merged.page : undefined);
      writeFilterParam(params, 'pageSize', merged.pageSize);
      writeFilterParam(params, 'q', merged.search);
      writeFilterParam(params, 'category', merged.category);
      writeFilterParam(params, 'status', merged.status);
      writeFilterParam(params, 'patient', merged.patientId);
      writeFilterParam(params, 'from', merged.periodStart);
      writeFilterParam(params, 'to', merged.periodEnd);
      writeFilterParam(params, 'signature', merged.signature);
      writeFilterParam(
        params,
        'portal',
        merged.releasedToPatient === true
          ? 'released'
          : merged.releasedToPatient === false
            ? 'restricted'
            : undefined
      );
      router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, {
        scroll: false,
      });
    },
    [documentFilters, pathname, router, searchParams]
  );

  useEffect(() => {
    if (!selectedDocument || !workspace) return;
    const refreshedDocument = workspace.documents.find(
      (document) => document.id === selectedDocument.id
    );
    if (refreshedDocument && refreshedDocument !== selectedDocument) {
      setSelectedDocument(refreshedDocument);
    }
  }, [selectedDocument, workspace]);

  const wizardGeneratedDocument = useMemo(
    () =>
      workspace?.documents.find((document) => document.id === wizardGeneratedDocumentId) ?? null,
    [wizardGeneratedDocumentId, workspace?.documents]
  );

  useEffect(() => {
    if (!workspace) return;
    const requestedPatientId = searchParams.get('patientId');
    const hasRequestedPatient = workspace.patients.some(
      (patient) => patient.id === requestedPatientId
    );
    setSelectedPatientId((current) =>
      hasRequestedPatient ? requestedPatientId! : current || workspace.patients[0]?.id || ''
    );
    setSelectedTemplateId((current) =>
      activeTemplates.some((template) => template.id === current)
        ? current
        : activeTemplates[0]?.id || ''
    );
  }, [activeTemplates, searchParams, workspace]);

  useEffect(() => {
    const allowed = selectedTemplate?.allowedVariables ?? [];
    setVariables(
      (current) =>
        Object.fromEntries(allowed.map((key) => [key, current[key] ?? ''])) as Record<
          string,
          string
        >
    );
  }, [selectedTemplate]);

  useEffect(() => {
    if (!workspace) return;
    if (searchParams.get('newDocument') !== '1') return;
    const requestedPatientId = searchParams.get('patientId');
    if (!requestedPatientId) return;
    if (!workspace.patients.some((patient) => patient.id === requestedPatientId)) return;
    setSelectedPatientId(requestedPatientId);
    setWizardGeneratedDocumentId(null);
    setActionError(null);
    setActionMessage(null);
    setWizardStep(1);
    setWizardOpen(true);
  }, [searchParams, workspace]);

  function openWizard(template?: ClinicDocumentTemplate) {
    setWizardGeneratedDocumentId(null);
    setActionError(null);
    setActionMessage(null);
    setWizardStep(0);
    if (template) {
      setSelectedTemplateId(template.id);
      setSelectedCategoryId(template.category);
      setWizardStep(2);
    }
    setWizardOpen(true);
  }

  async function handleGenerateDocument() {
    if (!selectedPatientId || !selectedTemplateId) {
      setActionError('Selecione paciente e template para gerar o documento.');
      return;
    }

    setBusyAction('generate');
    setActionError(null);
    setActionMessage(null);
    const missingRequiredVariables = getMissingRequiredVariables(selectedTemplate, variables);
    if (missingRequiredVariables.length > 0) {
      setActionError(`Preencha os campos obrigatorios: ${missingRequiredVariables.join(', ')}.`);
      return;
    }

    const result = await generateClinicDocument(selectedPatientId, selectedTemplateId, variables);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel gerar o documento.');
      return;
    }

    const generatedDocumentId = result.data.generatedDocumentId;
    const refreshedWorkspace = await loadWorkspace();
    const refreshedDocument = refreshedWorkspace?.documents.find(
      (document) => document.id === generatedDocumentId
    );

    setWizardGeneratedDocumentId(generatedDocumentId);
    setWizardStep(5);
    setActionMessage(
      refreshedDocument
        ? 'Documento gerado com sucesso.'
        : 'Documento gerado; atualize caso ele ainda nao apareca na lista.'
    );
  }

  async function handleSignature(document: ClinicDocumentRow) {
    if (!canRequestD4Sign) {
      setActionError('Assinatura digital indisponivel no plano deste tenant.');
      return;
    }
    setSignatureDocument(document);
  }

  async function submitSignatureRequest(
    document: ClinicDocumentRow,
    signers: ClinicDocumentSigner[]
  ) {
    const validation = validateSignatureDrafts(signers.map(makeSignatureDraft));
    if (validation) {
      setActionError(validation);
      return;
    }
    setBusyAction(`sign-${document.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await requestClinicDocumentSignature(document.id, document.patientId, signers);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel enviar para assinatura digital.');
      return;
    }

    setActionMessage('Documento enviado para assinatura digital.');
    setSignatureDocument(null);
    await loadWorkspace();
  }

  async function handleUpdateSignatureStatus(document: ClinicDocumentRow) {
    const status = window.prompt(
      'Informe o status seguro (pending, sent, viewed, signed, rejected, canceled, expired, failed):',
      document.signatureStatus === 'assinado' ? 'signed' : 'sent'
    );
    if (!status) return;
    const reason = window.prompt('Justificativa de reconciliacao (minimo 8 caracteres):');
    if (!reason) return;

    setBusyAction(`status-${document.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await updateClinicDocumentSignatureStatus(
      document.id,
      document.patientId,
      status,
      reason
    );
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel atualizar status de assinatura.');
      return;
    }

    setActionMessage('Status de assinatura reconciliado com auditoria local.');
    await loadWorkspace();
  }

  async function handleAcknowledgeD4SignEvent(event: ClinicDocumentMonitorEvent) {
    const note = window.prompt('Nota de reconhecimento (opcional, sem dados sensiveis):') ?? '';
    setBusyAction(`ack-${event.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await acknowledgeClinicD4SignEventFailure(event.id, note);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel reconhecer falha.');
      return;
    }

    setActionMessage('Falha D4Sign reconhecida com auditoria.');
    await loadWorkspace();
  }

  async function handleReprocessD4SignEvent(event: ClinicDocumentMonitorEvent) {
    const reason = window.prompt(
      'Justificativa para reprocessamento local (minimo 12 caracteres; nao chama D4Sign):'
    );
    if (!reason) return;
    setBusyAction(`reprocess-${event.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await requestClinicD4SignEventReprocess(event.id, reason);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel solicitar reprocesso.');
      return;
    }

    setActionMessage('Reprocessamento local enfileirado sem chamada automatica ao D4Sign.');
    await loadWorkspace();
  }

  async function handlePatientRelease(document: ClinicDocumentRow, releasedToPatient: boolean) {
    setBusyAction(`release-${document.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await setClinicDocumentPatientRelease(
      document.id,
      document.patientId,
      releasedToPatient
    );
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel atualizar liberacao.');
      return;
    }

    setActionMessage(
      releasedToPatient
        ? 'Documento liberado para paciente/guardian.'
        : 'Documento removido do acesso paciente/guardian.'
    );
    await loadWorkspace();
  }

  async function handleDownload(document: ClinicDocumentRow) {
    if (!canCreateSignedUrls) {
      setActionError('Signed URLs indisponiveis no plano deste tenant.');
      return;
    }
    setBusyAction(`download-${document.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await getClinicDocumentSignedUrl(document.id, document.patientId);
    setBusyAction(null);

    if (result.error || !result.data?.url) {
      setActionError(result.error?.message ?? 'Nao foi possivel gerar link temporario.');
      return;
    }

    const safeUrl = asSafeDocumentUrl(result.data.url);
    if (!safeUrl) {
      setActionError('O link gerado nao passou na validacao de seguranca.');
      return;
    }

    window.open(safeUrl, '_blank', 'noopener,noreferrer');
    setActionMessage('Link temporario gerado.');
  }

  async function handleCopyDocumentIdentifier(document: ClinicDocumentRow) {
    const identifier = document.displayCode || document.id;
    try {
      await navigator.clipboard.writeText(identifier);
      setActionError(null);
      setActionMessage('Identificador copiado.');
    } catch {
      setActionError('Nao foi possivel copiar o identificador automaticamente.');
    }
  }

  function handleBackToFilteredDocumentList(document: ClinicDocumentRow) {
    setDocumentFilterId(document.id);
    setWizardOpen(false);
    setActionError(null);
    setActionMessage(`Lista filtrada pelo documento ${document.displayCode}.`);
  }

  function openTemplateEditor(template: ClinicDocumentTemplate) {
    setEditingTemplate(template);
    setTemplateEditorForm(templateToForm(template));
    setActionError(null);
    setActionMessage(null);
    setTemplateEditorOpen(true);
  }

  function getTemplatePayload() {
    return {
      name: templateEditorForm.name.trim(),
      category: templateEditorForm.category.trim().toLowerCase() || 'outros',
      templateBody: templateEditorForm.templateBody,
      status: templateEditorForm.status,
      d4signEnabled: templateEditorForm.d4signEnabled,
      allowedVariables: templateEditorForm.allowedVariablesText
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }

  async function handleSaveTemplate() {
    const payload = getTemplatePayload();
    setBusyAction('template-save');
    setActionError(null);
    setActionMessage(null);
    const result = editingTemplate
      ? await updateClinicDocumentTemplate(editingTemplate.id, payload)
      : await createClinicDocumentTemplate(payload);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel salvar template.');
      return;
    }

    setTemplateEditorOpen(false);
    setEditingTemplate(null);
    setActionMessage(editingTemplate ? 'Template atualizado.' : 'Template criado.');
    await loadWorkspace();
  }

  async function handleArchiveTemplate(template: ClinicDocumentTemplate) {
    const archived = template.status !== 'archived';
    setBusyAction(`archive-${template.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await archiveClinicDocumentTemplate(template.id, archived);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel arquivar/restaurar template.');
      return;
    }

    setActionMessage(archived ? 'Template arquivado.' : 'Template restaurado como rascunho.');
    await loadWorkspace();
  }

  async function handlePublishTemplate(template: ClinicDocumentTemplate) {
    setBusyAction(`publish-${template.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await publishClinicDocumentTemplate(template.id);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel publicar template.');
      return;
    }

    setActionMessage('Rascunho publicado como template ativo.');
    await loadWorkspace();
  }

  async function handleDuplicateTemplate(template: ClinicDocumentTemplate) {
    setBusyAction(`duplicate-${template.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await duplicateClinicDocumentTemplate(template.id);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel duplicar template.');
      return;
    }

    setActionMessage(`Template duplicado como "${result.data.name}".`);
    await loadWorkspace();
  }

  if (loading) {
    return (
      <div className="space-y-6 p-4 lg:p-6">
        <section className="rounded-lg border border-border bg-card p-5 lg:p-6">
          <h1 className="text-2xl font-bold text-foreground">Documentos da Clinica</h1>
        </section>
        <section className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
          Carregando biblioteca, documentos e assinaturas...
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 p-4 lg:p-6">
        <section className="rounded-lg border border-border bg-card p-5 lg:p-6">
          <h1 className="text-2xl font-bold text-foreground">Documentos da Clinica</h1>
        </section>
        <section
          role="alert"
          className="rounded-lg border border-red-200 bg-card p-5 text-sm text-red-700"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Documentos indisponiveis</p>
              <p className="mt-1 text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => void loadWorkspace()}
                className="btn-secondary mt-4 text-xs"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="space-y-6 p-4 lg:p-6">
        <section className="rounded-lg border border-border bg-card p-5 lg:p-6">
          <h1 className="text-2xl font-bold text-foreground">Documentos da Clinica</h1>
        </section>
        <DataState
          kind="empty"
          title="Workspace documental vazio"
          description="O contrato de documentos nao retornou dados para o tenant ativo."
          actionLabel="Tentar novamente"
          onAction={() => void loadWorkspace()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <section className="rounded-lg border border-border bg-card p-5 lg:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Documentos da Clinica</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Biblioteca de templates, wizard de emissao, assinatura digital e auditoria.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void loadWorkspace()}
              className="btn-secondary text-xs"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingTemplate(null);
                setTemplateEditorForm(templateToForm());
                setTemplateEditorOpen(true);
              }}
              className="btn-secondary text-xs"
            >
              <LayoutTemplate size={14} aria-hidden="true" />
              Novo template
            </button>
            <button type="button" onClick={() => openWizard()} className="btn-primary text-xs">
              <FilePlus2 size={14} aria-hidden="true" />
              Novo documento
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          icon={LayoutTemplate}
          label="Templates ativos"
          value={workspace.metrics.templates}
        />
        <MetricCard icon={FileText} label="Documentos" value={workspace.metrics.generated} />
        <MetricCard
          icon={Send}
          label="Assinatura pendente"
          value={workspace.metrics.pendingSignature}
        />
        <MetricCard icon={ShieldCheck} label="Assinados" value={workspace.metrics.signed} />
        <MetricCard icon={Unlock} label="Liberados" value={workspace.metrics.released} />
        <MetricCard icon={AlertTriangle} label="Falhas" value={workspace.metrics.failed} />
      </section>

      {(actionMessage || actionError) && (
        <section
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            actionError
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {actionError ?? actionMessage}
        </section>
      )}

      {workspace.warnings.length > 0 ? (
        <section
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Dados parciais em documentos</p>
              <ul className="mt-1 space-y-1">
                {workspace.warnings.map((warning, index) => (
                  <li key={`${warning.code ?? 'warning'}-${index}`}>{warning.message}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <div className="space-y-4">
          <TemplateLibrary
            templates={filteredTemplates}
            categories={workspace.categories}
            selectedCategory={templateCategory}
            statusFilter={templateStatus}
            search={templateSearch}
            busyAction={busyAction}
            onCategoryChange={setTemplateCategory}
            onStatusChange={setTemplateStatus}
            onSearchChange={setTemplateSearch}
            onDuplicate={(template) => void handleDuplicateTemplate(template)}
            onPickTemplate={openWizard}
            onEditTemplate={openTemplateEditor}
            onArchiveTemplate={(template) => void handleArchiveTemplate(template)}
            onPublishTemplate={(template) => void handlePublishTemplate(template)}
          />

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Activity size={16} aria-hidden="true" />
              Auditoria recente
            </h2>
            <div className="mt-3 space-y-2">
              {workspace.auditEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum evento recente.</p>
              ) : (
                workspace.auditEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-lg border border-border px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{event.createdAt}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText size={16} aria-hidden="true" />
              Documentos emitidos
            </h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter size={14} aria-hidden="true" />
              {filteredDocuments.length} nesta pagina · {workspace.pagination.total} no total
            </div>
          </div>

          <div className="grid gap-3 border-b border-border bg-muted/20 px-4 py-3 md:grid-cols-3 xl:grid-cols-6">
            <label className="block text-xs font-medium text-muted-foreground md:col-span-2">
              Busca
              <input
                value={documentFilters.search ?? ''}
                onChange={(event) => updateDocumentFilters({ search: event.target.value, page: 1 })}
                placeholder="Documento, categoria ou status"
                className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Categoria
              <select
                value={documentFilters.category ?? 'all'}
                onChange={(event) =>
                  updateDocumentFilters({ category: event.target.value, page: 1 })
                }
                className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              >
                <option value="all">Todas</option>
                {workspace.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Status
              <select
                value={documentFilters.status ?? 'all'}
                onChange={(event) => updateDocumentFilters({ status: event.target.value, page: 1 })}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              >
                <option value="all">Todos</option>
                <option value="draft">Rascunho</option>
                <option value="generated">Gerado</option>
                <option value="sent_for_signature">Enviado para assinatura</option>
                <option value="signed">Assinado</option>
                <option value="failed">Falhou</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Paciente
              <select
                value={documentFilters.patientId ?? 'all'}
                onChange={(event) =>
                  updateDocumentFilters({ patientId: event.target.value, page: 1 })
                }
                className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              >
                <option value="all">Todos</option>
                {workspace.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Assinatura
              <select
                value={documentFilters.signature ?? 'all'}
                onChange={(event) =>
                  updateDocumentFilters({ signature: event.target.value, page: 1 })
                }
                className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              >
                <option value="all">Todas</option>
                <option value="pending">Pendente</option>
                <option value="sent">Enviada</option>
                <option value="viewed">Visualizada</option>
                <option value="signed">Assinada</option>
                <option value="failed">Falhou</option>
                <option value="expired">Expirada</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Portal
              <select
                value={
                  documentFilters.releasedToPatient === true
                    ? 'released'
                    : documentFilters.releasedToPatient === false
                      ? 'restricted'
                      : 'all'
                }
                onChange={(event) =>
                  updateDocumentFilters({
                    releasedToPatient:
                      event.target.value === 'released'
                        ? true
                        : event.target.value === 'restricted'
                          ? false
                          : undefined,
                    page: 1,
                  })
                }
                className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              >
                <option value="all">Todos</option>
                <option value="released">Liberados</option>
                <option value="restricted">Restritos</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              De
              <input
                type="date"
                value={documentFilters.periodStart ?? ''}
                onChange={(event) =>
                  updateDocumentFilters({ periodStart: event.target.value, page: 1 })
                }
                className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Ate
              <input
                type="date"
                value={documentFilters.periodEnd ?? ''}
                onChange={(event) =>
                  updateDocumentFilters({ periodEnd: event.target.value, page: 1 })
                }
                className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Tamanho
              <select
                value={documentFilters.pageSize ?? 25}
                onChange={(event) =>
                  updateDocumentFilters({ pageSize: Number(event.target.value), page: 1 })
                }
                className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              >
                {DOCUMENT_PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} por pagina
                  </option>
                ))}
              </select>
            </label>
          </div>

          {documentFilterId ? (
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              <span>Lista filtrada pelo documento criado.</span>
              <button
                type="button"
                onClick={() => setDocumentFilterId(null)}
                className="font-medium text-primary hover:underline"
              >
                Limpar filtro
              </button>
            </div>
          ) : null}

          {filteredDocuments.length === 0 ? (
            <DataState
              kind="empty"
              title={
                documentFilterId || workspace.pagination.total > 0
                  ? 'Nenhum documento neste filtro'
                  : 'Nenhum documento gerado'
              }
              description={
                documentFilterId
                  ? 'Limpe o filtro para ver todos os documentos emitidos.'
                  : workspace.pagination.total > 0
                    ? 'Ajuste busca, categoria, status, paciente, periodo, assinatura ou portal para ampliar os resultados.'
                    : 'Use o wizard para gerar um documento por template.'
              }
              className="min-h-64 border-0 bg-transparent"
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      {[
                        'Documento',
                        'Paciente',
                        'Categoria',
                        'Status',
                        'Assinatura',
                        'Portal',
                        'Atualizado',
                        'Acoes',
                      ].map((header) => (
                        <th key={header} scope="col" className="px-4 py-3 text-left font-medium">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((document) => (
                      <tr key={document.id} className="border-t border-border hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{document.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Codigo {document.displayCode}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/clinic/patients/${document.patientId}`}
                            className="text-foreground hover:underline"
                          >
                            {document.patientName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {categoryLabel(document.category)}
                        </td>
                        <td className="px-4 py-3">
                          <DocumentStatusPill document={document} />
                        </td>
                        <td className="px-4 py-3">
                          <SignaturePill document={document} />
                        </td>
                        <td className="px-4 py-3">
                          <ReleasePill released={document.releasedToPatient} />
                        </td>
                        <td className="px-4 py-3 text-foreground">{document.updatedAt}</td>
                        <td className="px-4 py-3">
                          <DocumentActions
                            document={document}
                            busyAction={busyAction}
                            onDetails={setSelectedDocument}
                            onDownload={(doc) => void handleDownload(doc)}
                            onSetRelease={(doc, released) =>
                              void handlePatientRelease(doc, released)
                            }
                            onSignature={(doc) => void handleSignature(doc)}
                            onUpdateSignatureStatus={(doc) => void handleUpdateSignatureStatus(doc)}
                            canCreateSignedUrls={canCreateSignedUrls}
                            canRequestD4Sign={canRequestD4Sign}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-3 md:hidden">
                {filteredDocuments.map((document) => (
                  <article key={document.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{document.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {document.patientName} · Codigo {document.displayCode}
                        </p>
                      </div>
                      <ReleasePill released={document.releasedToPatient} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <DocumentStatusPill document={document} />
                      <SignaturePill document={document} />
                    </div>
                    <div className="mt-3">
                      <DocumentActions
                        document={document}
                        busyAction={busyAction}
                        compact
                        onDetails={setSelectedDocument}
                        onDownload={(doc) => void handleDownload(doc)}
                        onSetRelease={(doc, released) => void handlePatientRelease(doc, released)}
                        onSignature={(doc) => void handleSignature(doc)}
                        onUpdateSignatureStatus={(doc) => void handleUpdateSignatureStatus(doc)}
                        canCreateSignedUrls={canCreateSignedUrls}
                        canRequestD4Sign={canRequestD4Sign}
                      />
                    </div>
                  </article>
                ))}
              </div>
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Pagina {workspace.pagination.page} de {workspace.pagination.totalPages} ·{' '}
                  {workspace.pagination.hasNextPage ? 'ha proxima pagina' : 'sem proxima pagina'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateDocumentFilters({ page: workspace.pagination.page - 1 })}
                    disabled={!workspace.pagination.hasPreviousPage}
                    className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ChevronLeft size={13} aria-hidden="true" />
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => updateDocumentFilters({ page: workspace.pagination.page + 1 })}
                    disabled={!workspace.pagination.hasNextPage}
                    className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Proxima
                    <ChevronRight size={13} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </section>

      <OperationalMonitor
        events={workspace.monitorEvents}
        busyAction={busyAction}
        onAcknowledge={(event) => void handleAcknowledgeD4SignEvent(event)}
        onReprocess={(event) => void handleReprocessD4SignEvent(event)}
      />

      <DocumentWizard
        open={wizardOpen}
        workspace={workspace}
        step={wizardStep}
        selectedPatientId={selectedPatientId}
        selectedCategoryId={selectedCategoryId}
        selectedTemplateId={selectedTemplateId}
        variables={variables}
        busyAction={busyAction}
        generatedDocument={wizardGeneratedDocument}
        onClose={() => setWizardOpen(false)}
        onStepChange={setWizardStep}
        onPatientChange={setSelectedPatientId}
        onCategoryChange={(category) => {
          setSelectedCategoryId(category);
          const nextTemplate = activeTemplates.find(
            (template) => category === 'all' || template.category === category
          );
          setSelectedTemplateId(nextTemplate?.id ?? '');
        }}
        onTemplateChange={setSelectedTemplateId}
        onVariableChange={(key, value) => setVariables((current) => ({ ...current, [key]: value }))}
        onGenerate={() => void handleGenerateDocument()}
        onSetRelease={(document, released) => void handlePatientRelease(document, released)}
        onSignature={(document) => void handleSignature(document)}
        onDownload={(document) => void handleDownload(document)}
        onCopyIdentifier={(document) => void handleCopyDocumentIdentifier(document)}
        onBackToList={handleBackToFilteredDocumentList}
        canRequestD4Sign={canRequestD4Sign}
        canCreateSignedUrls={canCreateSignedUrls}
      />

      {templateEditorOpen ? (
        <TemplateEditorDialog
          template={editingTemplate}
          form={templateEditorForm}
          busyAction={busyAction}
          onClose={() => {
            setTemplateEditorOpen(false);
            setEditingTemplate(null);
          }}
          onChange={setTemplateEditorForm}
          onSave={() => void handleSaveTemplate()}
        />
      ) : null}

      {signatureDocument ? (
        <SignatureRequestDialog
          document={signatureDocument}
          workspace={workspace}
          busyAction={busyAction}
          onClose={() => setSignatureDocument(null)}
          onSubmit={(document, signers) => void submitSignatureRequest(document, signers)}
        />
      ) : null}

      {selectedDocument ? (
        <DocumentDetailDialog
          document={selectedDocument}
          templates={workspace.templates}
          busyAction={busyAction}
          onClose={() => setSelectedDocument(null)}
          onDownload={(document) => void handleDownload(document)}
          onSetRelease={(document, released) => void handlePatientRelease(document, released)}
          onSignature={(document) => void handleSignature(document)}
          onUpdateSignatureStatus={(document) => void handleUpdateSignatureStatus(document)}
          canCreateSignedUrls={canCreateSignedUrls}
          canRequestD4Sign={canRequestD4Sign}
        />
      ) : null}
    </div>
  );
}
