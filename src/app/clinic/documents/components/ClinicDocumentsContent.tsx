'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  FileText,
  FileX,
  Filter,
  LayoutTemplate,
  Lock,
  PenSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import {
  duplicateClinicDocumentTemplate,
  generateClinicDocument,
  getClinicDocumentSignedUrl,
  getClinicDocumentsWorkspace,
  requestClinicDocumentSignature,
  setClinicDocumentPatientRelease,
  type ClinicDocumentAuditEvent,
  type ClinicDocumentCategory,
  type ClinicDocumentRow,
  type ClinicDocumentTemplate,
  type ClinicDocumentsWorkspace,
} from '@/services/clinicDocumentsApi';
import { asSafeDocumentUrl } from '@/lib/safeExternalUrl';
import DataState from '@/components/ui/DataState';
import Dialog from '@/components/ui/Dialog';

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

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
  const labels: Record<string, string> = {
    consent: 'Consentimento',
    consentimento: 'Consentimento',
    contract: 'Contrato',
    contrato: 'Contrato',
    termo: 'Termo',
    orientacao: 'Orientacao',
    orientation: 'Orientacao',
    prescricao: 'Prescricao',
    prescription: 'Prescricao',
    outros: 'Outros',
  };
  return labels[category] ?? category.replace(/_/g, ' ');
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
                <button
                  type="button"
                  onClick={() => onDuplicate(template)}
                  disabled={busyAction === `duplicate-${template.id}`}
                  className="btn-secondary mt-3 min-h-10 w-full justify-center text-xs disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Copy size={14} aria-hidden="true" />
                  {busyAction === `duplicate-${template.id}` ? 'Duplicando...' : 'Duplicar'}
                </button>
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
        Assinar
      </button>
    </div>
  );
}

function DocumentDrawer({
  document,
  auditEvents,
  busyAction,
  onClose,
  onDownload,
  onSetRelease,
  onSignature,
  canCreateSignedUrls,
  canRequestD4Sign,
}: {
  document: ClinicDocumentRow;
  auditEvents: ClinicDocumentAuditEvent[];
  busyAction: string | null;
  onClose: () => void;
  onDownload: (document: ClinicDocumentRow) => void;
  onSetRelease: (document: ClinicDocumentRow, released: boolean) => void;
  onSignature: (document: ClinicDocumentRow) => void;
  canCreateSignedUrls: boolean;
  canRequestD4Sign: boolean;
}) {
  const relatedAudit = auditEvents.filter(
    (event) => event.documentId === document.id || event.templateId === document.templateId
  );

  return (
    <Dialog
      open
      title={document.name}
      description={`Codigo ${document.displayCode}`}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="right"
      mobileFullscreen
      footer={
        <DocumentActions
          document={document}
          busyAction={busyAction}
          compact
          showDetails={false}
          onDetails={() => undefined}
          onDownload={onDownload}
          onSetRelease={onSetRelease}
          onSignature={onSignature}
          canCreateSignedUrls={canCreateSignedUrls}
          canRequestD4Sign={canRequestD4Sign}
        />
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <DocumentStatusPill document={document} />
          <SignaturePill document={document} />
          <ReleasePill released={document.releasedToPatient} />
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Paciente</dt>
            <dd className="mt-1 text-foreground">{document.patientName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Categoria</dt>
            <dd className="mt-1 text-foreground">{categoryLabel(document.category)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Template</dt>
            <dd className="mt-1 text-foreground">{document.templateName ?? '-'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Atualizado</dt>
            <dd className="mt-1 text-foreground">{document.updatedAt}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Gerado em</dt>
            <dd className="mt-1 text-foreground">{document.generatedAt}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Assinatura digital</dt>
            <dd className="mt-1 text-foreground">
              {document.signatureEnabled ? 'Habilitada' : 'Nao habilitada'}
            </dd>
          </div>
        </dl>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">Auditoria recente</h3>
          <div className="mt-3 space-y-2">
            {relatedAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum evento de auditoria recente para este documento.
              </p>
            ) : (
              relatedAudit.slice(0, 8).map((event) => (
                <div key={event.id} className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{event.createdAt}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </Dialog>
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
  canRequestD4Sign,
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
  canRequestD4Sign: boolean;
}) {
  const activeTemplates = workspace.templates.filter((template) => template.status === 'active');
  const templatesByCategory = activeTemplates.filter(
    (template) => selectedCategoryId === 'all' || template.category === selectedCategoryId
  );
  const selectedPatient = workspace.patients.find((patient) => patient.id === selectedPatientId);
  const selectedTemplate = activeTemplates.find((template) => template.id === selectedTemplateId);
  const canGoNext =
    (step === 0 && Boolean(selectedPatientId)) ||
    (step === 1 && Boolean(selectedCategoryId)) ||
    (step === 2 && Boolean(selectedTemplateId)) ||
    step === 3 ||
    step === 4 ||
    step === 5;

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
                disabled={!selectedPatientId || !selectedTemplateId || busyAction === 'generate'}
                className="btn-primary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FilePlus2 size={16} aria-hidden="true" />
                {busyAction === 'generate' ? 'Gerando...' : 'Gerar documento'}
              </button>
            ) : null}
            {step === 5 && generatedDocument ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    onSetRelease(generatedDocument, !generatedDocument.releasedToPatient)
                  }
                  disabled={busyAction === `release-${generatedDocument.id}`}
                  className="btn-secondary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generatedDocument.releasedToPatient ? (
                    <Lock size={16} aria-hidden="true" />
                  ) : (
                    <Unlock size={16} aria-hidden="true" />
                  )}
                  {generatedDocument.releasedToPatient ? 'Ocultar' : 'Liberar'}
                </button>
                <button
                  type="button"
                  onClick={() => onSignature(generatedDocument)}
                  disabled={
                    !canRequestD4Sign ||
                    !generatedDocument.canRequestSignature ||
                    busyAction === `sign-${generatedDocument.id}`
                  }
                  title={
                    canRequestD4Sign ? undefined : 'Envio D4Sign indisponivel no plano deste tenant'
                  }
                  className="btn-primary justify-center text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send size={16} aria-hidden="true" />
                  Assinar
                </button>
              </>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <WizardProgress step={step} />

        {step === 0 ? (
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
                {workspace.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {step === 1 ? (
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
                  {activeTemplates.length} templates ativos
                </span>
              </button>
              {workspace.categories.map((category) => (
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
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Selecione o template</h3>
            {templatesByCategory.length === 0 ? (
              <DataState
                kind="empty"
                title="Nenhum template ativo"
                description="Escolha outra categoria ou ative um template da biblioteca."
                className="min-h-40"
              />
            ) : (
              <div className="space-y-2">
                {templatesByCategory.map((template) => (
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
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Variaveis do template</h3>
            {selectedTemplate?.allowedVariables.length ? (
              selectedTemplate.allowedVariables.map((key) => (
                <label key={key} className="block text-xs font-medium text-muted-foreground">
                  {key}
                  <input
                    value={variables[key] ?? ''}
                    onChange={(event) => onVariableChange(key, event.target.value)}
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
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Revisao</h3>
            <dl className="grid gap-3 text-sm">
              <div className="rounded-lg border border-border px-3 py-2">
                <dt className="text-xs text-muted-foreground">Paciente</dt>
                <dd className="mt-1 font-medium text-foreground">{selectedPatient?.name ?? '-'}</dd>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <dt className="text-xs text-muted-foreground">Template</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {selectedTemplate?.name ?? '-'}
                </dd>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <dt className="text-xs text-muted-foreground">Variaveis livres</dt>
                <dd className="mt-1 text-foreground">
                  {selectedTemplate?.allowedVariables.length
                    ? selectedTemplate.allowedVariables
                        .map((key) => `${key}: ${variables[key] || '-'}`)
                        .join(' | ')
                    : 'Sem variaveis livres'}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Documento gerado. Defina se ele sera liberado ao portal ou enviado para assinatura
              digital.
            </div>
            {generatedDocument ? (
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-semibold text-foreground">{generatedDocument.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Codigo {generatedDocument.displayCode} · {generatedDocument.patientName}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <DocumentStatusPill document={generatedDocument} />
                  <SignaturePill document={generatedDocument} />
                  <ReleasePill released={generatedDocument.releasedToPatient} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Atualize a lista caso o documento ainda nao apareca no workspace.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

export default function ClinicDocumentsContent() {
  const [workspace, setWorkspace] = useState<ClinicDocumentsWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategory, setTemplateCategory] = useState('all');
  const [templateStatus, setTemplateStatus] = useState('all');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(0);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [wizardGeneratedDocumentId, setWizardGeneratedDocumentId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<ClinicDocumentRow | null>(null);
  const [featureFlags, setFeatureFlags] = useState<Set<string>>(() => new Set());
  const canRequestD4Sign = featureFlags.has('documents.d4sign_send');
  const canCreateSignedUrls = featureFlags.has('documents.signed_urls');

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getClinicDocumentsWorkspace();
    setWorkspace(result.data);
    setError(result.error?.message ?? null);
    setLoading(false);
  }, []);

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

  const wizardGeneratedDocument = useMemo(
    () =>
      workspace?.documents.find((document) => document.id === wizardGeneratedDocumentId) ?? null,
    [wizardGeneratedDocumentId, workspace?.documents]
  );

  useEffect(() => {
    if (!workspace) return;
    setSelectedPatientId((current) => current || workspace.patients[0]?.id || '');
    setSelectedTemplateId((current) =>
      activeTemplates.some((template) => template.id === current)
        ? current
        : activeTemplates[0]?.id || ''
    );
  }, [activeTemplates, workspace]);

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
    const result = await generateClinicDocument(selectedPatientId, selectedTemplateId, variables);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel gerar o documento.');
      return;
    }

    setWizardGeneratedDocumentId(result.data.generatedDocumentId);
    setWizardStep(5);
    setActionMessage('Documento gerado com sucesso.');
    await loadWorkspace();
  }

  async function handleSignature(document: ClinicDocumentRow) {
    if (!canRequestD4Sign) {
      setActionError('Envio D4Sign indisponivel no plano deste tenant.');
      return;
    }
    setBusyAction(`sign-${document.id}`);
    setActionError(null);
    setActionMessage(null);
    const result = await requestClinicDocumentSignature(document.id, document.patientId);
    setBusyAction(null);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel enviar para assinatura digital.');
      return;
    }

    setActionMessage('Documento enviado para assinatura digital.');
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
              {workspace.documents.length} registros
            </div>
          </div>

          {workspace.documents.length === 0 ? (
            <DataState
              kind="empty"
              title="Nenhum documento gerado"
              description="Use o wizard para gerar um documento por template."
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
                    {workspace.documents.map((document) => (
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
                {workspace.documents.map((document) => (
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
                        canCreateSignedUrls={canCreateSignedUrls}
                        canRequestD4Sign={canRequestD4Sign}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Activity size={16} aria-hidden="true" />
          Monitor operacional de documentos
        </h2>
        <div className="mt-4 space-y-2">
          {workspace.monitorEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum documento pendente/falhado ou evento de assinatura recente.
            </p>
          ) : (
            workspace.monitorEvents.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{event.createdAt}</p>
                  {event.error ? <p className="mt-1 text-xs text-red-600">{event.error}</p> : null}
                </div>
                <Pill
                  icon={event.status === 'failed' ? AlertTriangle : Activity}
                  label={event.status}
                  classes={
                    event.status === 'failed'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-blue-200 bg-blue-50 text-blue-700'
                  }
                />
              </div>
            ))
          )}
        </div>
      </section>

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
        canRequestD4Sign={canRequestD4Sign}
      />

      {selectedDocument ? (
        <DocumentDrawer
          document={selectedDocument}
          auditEvents={workspace.auditEvents}
          busyAction={busyAction}
          onClose={() => setSelectedDocument(null)}
          onDownload={(document) => void handleDownload(document)}
          onSetRelease={(document, released) => void handlePatientRelease(document, released)}
          onSignature={(document) => void handleSignature(document)}
          canCreateSignedUrls={canCreateSignedUrls}
          canRequestD4Sign={canRequestD4Sign}
        />
      ) : null}
    </div>
  );
}
