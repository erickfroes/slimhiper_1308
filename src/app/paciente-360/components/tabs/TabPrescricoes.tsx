'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  Leaf,
  ListChecks,
  Pill,
  Plus,
  Salad,
  Send,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { PatientPrescriptionSummary } from '@/domain/types';
import {
  cancelPatientPrescription,
  duplicatePatientPrescription,
  generatePatientPrescriptionPdf,
  getPatientPrescriptionPdfSignedUrl,
  linkPatientPrescriptionDocument,
  savePatientPrescription,
  type PrescriptionItemMutationInput,
} from '@/services/prescriptionsApi';
import {
  generatePatientDocument,
  listActiveDocumentTemplates,
  sendDocumentForSignature,
  type ActiveDocumentTemplate,
} from '@/services/documentsApi';

interface TabPrescricoesProps {
  patientId: string;
  prescriptions: PatientPrescriptionSummary[];
  canViewMedicalPrescriptions: boolean;
  currentRole: string | null;
}

type PrescCategory = NonNullable<PatientPrescriptionSummary['category']>;
type WizardStep = 'dados' | 'itens' | 'posologia' | 'orientacoes' | 'revisao';

type DraftItem = {
  id: string;
  label: string;
  itemType: NonNullable<PatientPrescriptionSummary['items']>[number]['itemType'];
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
  scheduleTimesText: string;
  reminderEnabled: boolean;
};

type DraftForm = {
  prescriptionId?: string;
  category: PrescCategory;
  title: string;
  issueDate: string;
  validUntil: string;
  summary: string;
  patientVisible: boolean;
  items: DraftItem[];
};

type CategoryConfig = {
  key: PrescCategory;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
};

const CATEGORIES: CategoryConfig[] = [
  {
    key: 'prescricao_medica',
    label: 'Prescricao medica',
    icon: Stethoscope,
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
  },
  {
    key: 'suplementacao',
    label: 'Suplementacao',
    icon: Leaf,
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  {
    key: 'orientacoes_nutricionais',
    label: 'Orientacoes nutricionais',
    icon: Salad,
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
  },
  {
    key: 'plano_alimentar',
    label: 'Plano alimentar',
    icon: ClipboardCheck,
    color: 'text-sky-700',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
  },
  {
    key: 'orientacoes_gerais',
    label: 'Orientacoes gerais',
    icon: BookOpen,
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
];

const STEPS: Array<{ key: WizardStep; label: string; icon: React.ElementType }> = [
  { key: 'dados', label: 'Dados', icon: FileText },
  { key: 'itens', label: 'Itens', icon: ListChecks },
  { key: 'posologia', label: 'Posologia', icon: BellRing },
  { key: 'orientacoes', label: 'Orientacoes', icon: BookOpen },
  { key: 'revisao', label: 'Revisao', icon: ShieldCheck },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultValidUntil(category: PrescCategory, issueDate: string) {
  if (category === 'orientacoes_gerais' || category === 'orientacoes_nutricionais') return '';
  const date = new Date(`${issueDate}T00:00:00`);
  date.setDate(date.getDate() + (category === 'prescricao_medica' ? 30 : 90));
  return date.toISOString().slice(0, 10);
}

function itemTypeForCategory(category: PrescCategory): DraftItem['itemType'] {
  if (category === 'suplementacao') return 'suplemento';
  if (category === 'plano_alimentar') return 'plano_alimentar';
  if (category === 'orientacoes_gerais' || category === 'orientacoes_nutricionais') {
    return 'orientacao';
  }
  return 'medicamento';
}

function createDraftItem(category: PrescCategory, label = ''): DraftItem {
  return {
    id: `draft-item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label,
    itemType: itemTypeForCategory(category),
    dosage: '',
    route: '',
    frequency: '',
    duration: '',
    quantity: '',
    instructions: '',
    scheduleTimesText: '',
    reminderEnabled: false,
  };
}

function createDraftForm(
  category: PrescCategory,
  prescription?: PatientPrescriptionSummary
): DraftForm {
  const issueDate = prescription?.issueDate?.slice(0, 10) ?? todayIso();
  const sourceItems =
    prescription?.items && prescription.items.length > 0
      ? prescription.items.map((item) => ({
          id: item.id,
          label: item.label,
          itemType: item.itemType,
          dosage: item.dosage ?? '',
          route: item.route ?? '',
          frequency: item.frequency ?? '',
          duration: item.duration ?? '',
          quantity: item.quantity ?? '',
          instructions: item.instructions ?? '',
          scheduleTimesText: item.scheduleTimes?.join(', ') ?? '',
          reminderEnabled: item.reminderEnabled ?? false,
        }))
      : [
          {
            ...createDraftItem(category, prescription?.medicationName ?? ''),
            dosage: prescription?.dosage === '-' ? '' : (prescription?.dosage ?? ''),
            frequency: prescription?.frequency === '-' ? '' : (prescription?.frequency ?? ''),
            instructions: prescription?.notes ?? '',
          },
        ];

  return {
    prescriptionId: prescription?.id,
    category,
    title: prescription?.medicationName ?? '',
    issueDate,
    validUntil: prescription?.validity?.slice(0, 10) ?? defaultValidUntil(category, issueDate),
    summary: prescription?.notes ?? '',
    patientVisible: prescription?.patientVisible ?? true,
    items: sourceItems,
  };
}

function splitScheduleTimes(value: string) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(part));
}

function mapRpcStatus(status: string): PatientPrescriptionSummary['status'] {
  if (status === 'issued' || status === 'final') return 'ativo';
  if (status === 'cancelled') return 'cancelado';
  return 'rascunho';
}

function signatureRequirementForCategory(category: PrescCategory) {
  if (category === 'prescricao_medica') return 'qualified_or_icp_required' as const;
  if (category === 'suplementacao') return 'd4sign_optional' as const;
  return 'none' as const;
}

function normalizeSignatureRequirement(value: string | undefined, category: PrescCategory) {
  if (value === 'none' || value === 'd4sign_optional' || value === 'qualified_or_icp_required') {
    return value;
  }
  return signatureRequirementForCategory(category);
}

function signatureStatusForRequirement(requirement?: string) {
  if (requirement === 'qualified_or_icp_required') return 'nao_configurado' as const;
  return 'nao_requerido' as const;
}

function categoryConfig(category?: PatientPrescriptionSummary['category']) {
  return CATEGORIES.find((item) => item.key === category) ?? CATEGORIES[0];
}

function buildPrescriptionDocumentVariables(
  prescription: PatientPrescriptionSummary,
  template: ActiveDocumentTemplate
) {
  const candidates: Record<string, string> = {
    prescription_title: prescription.medicationName,
    medication_name: prescription.medicationName,
    dosage: prescription.dosage,
    frequency: prescription.frequency,
    instructions: prescription.notes ?? '',
    category: prescription.category ?? 'prescricao_medica',
    issue_date: prescription.issueDate ?? prescription.startDate ?? '',
    validity: prescription.validity ?? prescription.endDate ?? '',
  };
  const allowed = new Set(template.allowedVariables);
  return Object.fromEntries(Object.entries(candidates).filter(([key]) => allowed.has(key)));
}

function StatusBadge({ status }: { status?: PatientPrescriptionSummary['status'] }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    ativo: {
      label: 'Ativo',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2,
    },
    expirado: {
      label: 'Expirado',
      cls: 'bg-slate-100 text-slate-600 border-slate-200',
      icon: CalendarDays,
    },
    cancelado: {
      label: 'Cancelado',
      cls: 'bg-red-50 text-red-700 border-red-200',
      icon: XCircle,
    },
    pendente_assinatura: {
      label: 'Assinatura',
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: AlertCircle,
    },
    rascunho: {
      label: 'Rascunho',
      cls: 'bg-slate-100 text-slate-600 border-slate-200',
      icon: FileText,
    },
  };
  const cfg = map[status ?? ''] ?? map.rascunho;
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function SignatureBadge({ prescription }: { prescription: PatientPrescriptionSummary }) {
  const requirement =
    prescription.signatureRequirement ?? prescription.regulatory?.signatureRequirement;
  const status = prescription.signatureStatus;
  if (requirement === 'qualified_or_icp_required') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
        <ShieldAlert size={12} />
        ICP/qualificada pendente
      </span>
    );
  }
  if (status === 'assinado') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 size={12} />
        Assinado
      </span>
    );
  }
  if (status === 'pendente') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
        <FileSignature size={12} />
        Pendente
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Nao requerida</span>;
}

function DraftEditor({
  form,
  step,
  loading,
  canIssueMedical,
  onStepChange,
  onFormChange,
  onSave,
  onCancel,
}: {
  form: DraftForm;
  step: WizardStep;
  loading: boolean;
  canIssueMedical: boolean;
  onStepChange: (step: WizardStep) => void;
  onFormChange: (form: DraftForm) => void;
  onSave: (finalize: boolean) => void;
  onCancel: () => void;
}) {
  const allowedCategories = canIssueMedical
    ? CATEGORIES
    : CATEGORIES.filter((category) => category.key !== 'prescricao_medica');
  const activeIndex = STEPS.findIndex((item) => item.key === step);
  const legalRequirement = signatureRequirementForCategory(form.category);
  const hasValidItem = form.items.some((item) => item.label.trim());

  const updateItem = (itemId: string, update: Partial<DraftItem>) => {
    onFormChange({
      ...form,
      items: form.items.map((item) => (item.id === itemId ? { ...item, ...update } : item)),
    });
  };

  const addItem = () => {
    onFormChange({ ...form, items: [...form.items, createDraftItem(form.category)] });
  };

  const removeItem = (itemId: string) => {
    if (form.items.length === 1) return;
    onFormChange({ ...form, items: form.items.filter((item) => item.id !== itemId) });
  };

  return (
    <div className="card-base p-4 space-y-4" role="dialog" aria-label="Editor de prescricao">
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((wizardStep, index) => {
          const Icon = wizardStep.icon;
          const active = wizardStep.key === step;
          return (
            <button
              key={wizardStep.key}
              type="button"
              disabled={loading}
              onClick={() => onStepChange(wizardStep.key)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                active
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <Icon size={13} />
              {index + 1}. {wizardStep.label}
            </button>
          );
        })}
      </div>

      {step === 'dados' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="space-y-1 text-xs md:col-span-2">
            <span className="font-medium text-muted-foreground">Tipo</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={form.category}
              disabled={loading}
              onChange={(event) => {
                const category = event.target.value as PrescCategory;
                onFormChange({
                  ...form,
                  category,
                  validUntil: defaultValidUntil(category, form.issueDate),
                  items: form.items.map((item) => ({
                    ...item,
                    itemType: itemTypeForCategory(category),
                  })),
                });
              }}
            >
              {allowedCategories.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs md:col-span-2">
            <span className="font-medium text-muted-foreground">Titulo</span>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={form.title}
              disabled={loading}
              onChange={(event) => onFormChange({ ...form, title: event.target.value })}
              placeholder="Ex.: Protocolo medicamentoso"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Emissao</span>
            <input
              type="date"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={form.issueDate}
              disabled={loading}
              onChange={(event) =>
                onFormChange({
                  ...form,
                  issueDate: event.target.value,
                  validUntil: defaultValidUntil(form.category, event.target.value),
                })
              }
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Validade</span>
            <input
              type="date"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={form.validUntil}
              disabled={loading}
              onChange={(event) => onFormChange({ ...form, validUntil: event.target.value })}
            />
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs md:col-span-2">
            <input
              type="checkbox"
              checked={form.patientVisible}
              disabled={loading}
              onChange={(event) => onFormChange({ ...form, patientVisible: event.target.checked })}
            />
            Liberar registro emitido no portal do paciente
          </label>
        </div>
      )}

      {step === 'itens' && (
        <div className="space-y-3">
          {form.items.map((item, index) => (
            <div key={item.id} className="rounded-lg border border-border p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">Item {index + 1}</p>
                <button
                  type="button"
                  disabled={loading || form.items.length === 1}
                  onClick={() => removeItem(item.id)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  Remover
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <label className="space-y-1 text-xs md:col-span-2">
                  <span className="font-medium text-muted-foreground">Nome do item</span>
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    value={item.label}
                    disabled={loading}
                    onChange={(event) => updateItem(item.id, { label: event.target.value })}
                    placeholder="Medicamento, suplemento ou orientacao"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium text-muted-foreground">Dose</span>
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    value={item.dosage}
                    disabled={loading}
                    onChange={(event) => updateItem(item.id, { dosage: event.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium text-muted-foreground">Via</span>
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    value={item.route}
                    disabled={loading}
                    onChange={(event) => updateItem(item.id, { route: event.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs md:col-span-2">
                  <span className="font-medium text-muted-foreground">Frequencia</span>
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    value={item.frequency}
                    disabled={loading}
                    onChange={(event) => updateItem(item.id, { frequency: event.target.value })}
                    placeholder="Ex.: 1x ao dia apos o jantar"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium text-muted-foreground">Quantidade</span>
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    value={item.quantity}
                    disabled={loading}
                    onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium text-muted-foreground">Duracao</span>
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    value={item.duration}
                    disabled={loading}
                    onChange={(event) => updateItem(item.id, { duration: event.target.value })}
                  />
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={loading}
            onClick={addItem}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={13} />
            Adicionar item
          </button>
        </div>
      )}

      {step === 'posologia' && (
        <div className="space-y-3">
          {form.items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 md:grid-cols-3"
            >
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {item.label || 'Item sem nome'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Horarios no formato HH:mm separados por virgula.
                </p>
              </div>
              <label className="space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">Horarios</span>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                  value={item.scheduleTimesText}
                  disabled={loading}
                  onChange={(event) =>
                    updateItem(item.id, { scheduleTimesText: event.target.value })
                  }
                  placeholder="08:00, 20:00"
                />
              </label>
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs">
                <input
                  type="checkbox"
                  checked={item.reminderEnabled}
                  disabled={loading}
                  onChange={(event) =>
                    updateItem(item.id, { reminderEnabled: event.target.checked })
                  }
                />
                Criar lembrete no portal
              </label>
            </div>
          ))}
        </div>
      )}

      {step === 'orientacoes' && (
        <div className="space-y-3">
          <label className="block space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Orientacoes gerais</span>
            <textarea
              className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2"
              value={form.summary}
              disabled={loading}
              onChange={(event) => onFormChange({ ...form, summary: event.target.value })}
            />
          </label>
          {form.items.map((item) => (
            <label key={item.id} className="block space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">
                Orientacao do item: {item.label || 'sem nome'}
              </span>
              <textarea
                className="min-h-16 w-full rounded-lg border border-border bg-background px-3 py-2"
                value={item.instructions}
                disabled={loading}
                onChange={(event) => updateItem(item.id, { instructions: event.target.value })}
              />
            </label>
          ))}
        </div>
      )}

      {step === 'revisao' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm font-semibold text-foreground">{form.title || 'Sem titulo'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {form.items.length} item(ns) - emissao {form.issueDate || '-'} - validade{' '}
              {form.validUntil || 'sem validade definida'}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
              <span className="rounded-lg border border-border bg-background px-3 py-2">
                Status apos emitir: ativo
              </span>
              <span className="rounded-lg border border-border bg-background px-3 py-2">
                Assinatura: {legalRequirement}
              </span>
              <span className="rounded-lg border border-border bg-background px-3 py-2">
                Portal paciente: {form.patientVisible ? 'liberado' : 'oculto'}
              </span>
            </div>
          </div>
          {legalRequirement === 'qualified_or_icp_required' && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <ShieldAlert size={16} className="mt-0.5 flex-shrink-0" />
              <p>
                Prescricao medica nao usa D4Sign simples. O PDF fica privado e a assinatura
                qualificada/ICP permanece marcada como pendente de provedor legal.
              </p>
            </div>
          )}
          {!hasValidItem && (
            <p className="text-xs text-red-600" role="alert">
              Inclua pelo menos um item antes de salvar.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading || activeIndex === 0}
            onClick={() => onStepChange(STEPS[Math.max(0, activeIndex - 1)].key)}
            className="btn-secondary min-h-10 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={loading || activeIndex === STEPS.length - 1}
            onClick={() => onStepChange(STEPS[Math.min(STEPS.length - 1, activeIndex + 1)].key)}
            className="btn-secondary min-h-10 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            Avancar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="btn-secondary min-h-10 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={loading || !hasValidItem}
            onClick={() => onSave(false)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileText size={13} />
            Salvar rascunho
          </button>
          <button
            type="button"
            disabled={loading || !hasValidItem}
            onClick={() => onSave(true)}
            className="btn-primary min-h-10 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Salvando...' : 'Emitir'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PrescriptionCard({
  prescription,
  loadingAction,
  templates,
  selectedTemplateId,
  cancelReason,
  onTemplateChange,
  onGenerateDocument,
  onSendSignature,
  onDuplicate,
  onCancelStart,
  onCancelReasonChange,
  onCancelConfirm,
  onReview,
  onGeneratePdf,
  onOpenPdf,
}: {
  prescription: PatientPrescriptionSummary;
  loadingAction: string | null;
  templates: ActiveDocumentTemplate[];
  selectedTemplateId: string;
  cancelReason?: string;
  onTemplateChange: (prescriptionId: string, templateId: string) => void;
  onGenerateDocument: (prescription: PatientPrescriptionSummary) => void;
  onSendSignature: (prescription: PatientPrescriptionSummary) => void;
  onDuplicate: (prescription: PatientPrescriptionSummary) => void;
  onCancelStart: (prescriptionId: string) => void;
  onCancelReasonChange: (prescriptionId: string, reason: string) => void;
  onCancelConfirm: (prescription: PatientPrescriptionSummary) => void;
  onReview: (prescription: PatientPrescriptionSummary) => void;
  onGeneratePdf: (prescription: PatientPrescriptionSummary) => void;
  onOpenPdf: (prescription: PatientPrescriptionSummary) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = categoryConfig(prescription.category);
  const Icon = config.icon;
  const isMedical = prescription.category === 'prescricao_medica';
  const canSendSignature =
    Boolean(prescription.linkedDocumentId) && !isMedical && prescription.status !== 'cancelado';
  const canGeneratePdf = prescription.status === 'ativo';
  const isDraft = prescription.status === 'rascunho';

  return (
    <div className="card-base overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${config.bgColor}`}
        >
          <Icon size={16} className={config.color} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-foreground">
                {prescription.medicationName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {prescription.dosage} - {prescription.frequency}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {prescription.requiresReview && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Revisao obrigatoria
                </span>
              )}
              <StatusBadge status={prescription.status} />
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="min-h-9 rounded-lg p-2 text-muted-foreground hover:bg-muted"
          aria-label={expanded ? 'Recolher prescricao' : 'Expandir prescricao'}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-border bg-muted/20 p-4">
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div>
              <p className="font-medium text-muted-foreground">Emissao</p>
              <p className="text-foreground">
                {prescription.issueDate ?? prescription.startDate ?? '-'}
              </p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Validade</p>
              <p className="text-foreground">
                {prescription.validity ?? prescription.endDate ?? '-'}
              </p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Versao</p>
              <p className="text-foreground">{prescription.version ?? '-'}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Profissional</p>
              <p className="text-foreground">{prescription.prescribedBy}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Assinatura</p>
              <SignatureBadge prescription={prescription} />
            </div>
            <div>
              <p className="font-medium text-muted-foreground">PDF</p>
              <p className="text-foreground">
                {prescription.pdfArtifact?.status === 'generated' ? 'Gerado' : 'Pendente'}
              </p>
            </div>
          </div>

          {prescription.items && prescription.items.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              {prescription.items.map((item, index) => (
                <div
                  key={item.id || `${prescription.id}-${index}`}
                  className="rounded-lg border border-border bg-background p-3 text-xs"
                >
                  <p className="font-semibold text-foreground">
                    {index + 1}. {item.label}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {[item.dosage, item.route, item.frequency, item.duration, item.quantity]
                      .filter(Boolean)
                      .join(' - ') || 'Conforme orientacao'}
                  </p>
                  {item.instructions && (
                    <p className="mt-1 text-muted-foreground">{item.instructions}</p>
                  )}
                  {item.scheduleTimes && item.scheduleTimes.length > 0 && (
                    <p className="mt-1 text-muted-foreground">
                      Lembretes: {item.scheduleTimes.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {prescription.notes && (
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              {prescription.notes}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {isDraft && (
              <button
                type="button"
                disabled={loadingAction !== null}
                onClick={() => onReview(prescription)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ClipboardCheck size={13} />
                Revisar e emitir
              </button>
            )}
            <button
              type="button"
              disabled={loadingAction !== null || !canGeneratePdf}
              onClick={() => onGeneratePdf(prescription)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={13} />
              {loadingAction === `pdf:${prescription.id}` ? 'Gerando...' : 'Gerar PDF'}
            </button>
            <button
              type="button"
              disabled={loadingAction !== null || !prescription.pdfArtifact?.id}
              onClick={() => onOpenPdf(prescription)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ExternalLink size={13} />
              Abrir PDF
            </button>
            {!isMedical && (
              <>
                <select
                  className="min-h-10 rounded-lg border border-border bg-background px-2 text-xs"
                  value={selectedTemplateId}
                  disabled={loadingAction !== null || templates.length === 0}
                  onChange={(event) => onTemplateChange(prescription.id, event.target.value)}
                  aria-label="Template do documento"
                >
                  <option value="">Template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={loadingAction !== null || !selectedTemplateId}
                  onClick={() => onGenerateDocument(prescription)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FileText size={13} />
                  Documento
                </button>
                <button
                  type="button"
                  disabled={loadingAction !== null || !canSendSignature}
                  onClick={() => onSendSignature(prescription)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send size={13} />
                  D4Sign
                </button>
              </>
            )}
            {isMedical && (
              <span className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-700">
                <ShieldAlert size={13} />
                D4Sign bloqueado
              </span>
            )}
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => onDuplicate(prescription)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy size={13} />
              {loadingAction === `duplicate:${prescription.id}` ? 'Duplicando...' : 'Duplicar'}
            </button>
            <button
              type="button"
              disabled={loadingAction !== null || prescription.status === 'cancelado'}
              onClick={() => onCancelStart(prescription.id)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle size={13} />
              Cancelar
            </button>
          </div>

          {cancelReason !== undefined && (
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-red-200 bg-red-50 p-3 md:grid-cols-[1fr_auto]">
              <label className="space-y-1 text-xs">
                <span className="font-medium text-red-800">Motivo do cancelamento</span>
                <input
                  className="w-full rounded-lg border border-red-200 bg-background px-3 py-2"
                  value={cancelReason}
                  disabled={loadingAction === `cancel:${prescription.id}`}
                  onChange={(event) => onCancelReasonChange(prescription.id, event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={loadingAction !== null || !cancelReason.trim()}
                onClick={() => onCancelConfirm(prescription)}
                className="btn-primary min-h-10 self-end text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirmar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategorySection({
  config,
  items,
  isRestricted,
  loadingAction,
  templates,
  selectedTemplateByPrescription,
  cancelReasonByPrescription,
  onTemplateChange,
  onGenerateDocument,
  onSendSignature,
  onDuplicate,
  onCancelStart,
  onCancelReasonChange,
  onCancelConfirm,
  onReview,
  onGeneratePdf,
  onOpenPdf,
}: {
  config: CategoryConfig;
  items: PatientPrescriptionSummary[];
  isRestricted: boolean;
  loadingAction: string | null;
  templates: ActiveDocumentTemplate[];
  selectedTemplateByPrescription: Record<string, string>;
  cancelReasonByPrescription: Record<string, string | undefined>;
  onTemplateChange: (prescriptionId: string, templateId: string) => void;
  onGenerateDocument: (prescription: PatientPrescriptionSummary) => void;
  onSendSignature: (prescription: PatientPrescriptionSummary) => void;
  onDuplicate: (prescription: PatientPrescriptionSummary) => void;
  onCancelStart: (prescriptionId: string) => void;
  onCancelReasonChange: (prescriptionId: string, reason: string) => void;
  onCancelConfirm: (prescription: PatientPrescriptionSummary) => void;
  onReview: (prescription: PatientPrescriptionSummary) => void;
  onGeneratePdf: (prescription: PatientPrescriptionSummary) => void;
  onOpenPdf: (prescription: PatientPrescriptionSummary) => void;
}) {
  const Icon = config.icon;

  return (
    <section className="space-y-3">
      <div
        className={`flex items-center justify-between rounded-lg border px-3 py-2 ${config.bgColor} ${config.borderColor}`}
      >
        <div className="flex items-center gap-2">
          <Icon size={15} className={config.color} />
          <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
          <span
            className={`rounded-full border px-1.5 py-0.5 text-xs font-medium ${config.borderColor} ${config.color}`}
          >
            {items.length}
          </span>
        </div>
      </div>

      {isRestricted ? (
        <div className="card-base flex items-start gap-3 border-amber-200 bg-amber-50/50 p-4">
          <ShieldAlert size={18} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Acesso restrito ao escopo profissional
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              Prescricoes medicas exigem profissional autorizado e permissao de prescricoes.
            </p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="card-base p-4 text-center text-sm text-muted-foreground">
          Nenhum registro nesta categoria.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((prescription) => (
            <PrescriptionCard
              key={prescription.id}
              prescription={prescription}
              loadingAction={loadingAction}
              templates={templates}
              selectedTemplateId={selectedTemplateByPrescription[prescription.id] ?? ''}
              cancelReason={cancelReasonByPrescription[prescription.id]}
              onTemplateChange={onTemplateChange}
              onGenerateDocument={onGenerateDocument}
              onSendSignature={onSendSignature}
              onDuplicate={onDuplicate}
              onCancelStart={onCancelStart}
              onCancelReasonChange={onCancelReasonChange}
              onCancelConfirm={onCancelConfirm}
              onReview={onReview}
              onGeneratePdf={onGeneratePdf}
              onOpenPdf={onOpenPdf}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function TabPrescricoes({
  patientId,
  prescriptions,
  canViewMedicalPrescriptions,
  currentRole,
}: TabPrescricoesProps) {
  const [items, setItems] = useState(prescriptions);
  const [draftForm, setDraftForm] = useState<DraftForm | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>('dados');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [documentTemplates, setDocumentTemplates] = useState<ActiveDocumentTemplate[]>([]);
  const [selectedTemplateByPrescription, setSelectedTemplateByPrescription] = useState<
    Record<string, string>
  >({});
  const [cancelReasonByPrescription, setCancelReasonByPrescription] = useState<
    Record<string, string | undefined>
  >({});

  const normalizedRole = currentRole?.trim().toLowerCase() ?? null;
  const isNutritionist = normalizedRole === 'nutritionist';
  const canIssueMedical = canViewMedicalPrescriptions && !isNutritionist;

  useEffect(() => {
    setItems(prescriptions);
  }, [prescriptions]);

  useEffect(() => {
    let active = true;
    void listActiveDocumentTemplates().then((result) => {
      if (!active) return;
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setDocumentTemplates(result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  const resetFeedback = () => {
    setNotice(null);
    setError(null);
  };

  const byCategory = useMemo(() => {
    const grouped = new Map<PrescCategory, PatientPrescriptionSummary[]>();
    for (const category of CATEGORIES) grouped.set(category.key, []);
    for (const prescription of items) {
      const category = prescription.category ?? 'prescricao_medica';
      grouped.set(category, [...(grouped.get(category) ?? []), prescription]);
    }
    return grouped;
  }, [items]);

  const counts = useMemo(
    () => ({
      active: items.filter((item) => item.status === 'ativo').length,
      drafts: items.filter((item) => item.status === 'rascunho' || item.requiresReview).length,
      pdfs: items.filter((item) => item.pdfArtifact?.status === 'generated').length,
      reminders: items.reduce((total, item) => total + (item.medicationReminders?.length ?? 0), 0),
    }),
    [items]
  );

  const openCreateForm = (category: PrescCategory) => {
    resetFeedback();
    setDraftForm(createDraftForm(category));
    setWizardStep('dados');
  };

  const openReviewForm = (prescription: PatientPrescriptionSummary) => {
    resetFeedback();
    setDraftForm(createDraftForm(prescription.category ?? 'prescricao_medica', prescription));
    setWizardStep('dados');
  };

  const buildMutationItems = (form: DraftForm): PrescriptionItemMutationInput[] =>
    form.items
      .filter((item) => item.label.trim())
      .map((item) => ({
        label: item.label.trim(),
        itemType: item.itemType,
        dosage: item.dosage.trim(),
        route: item.route.trim(),
        frequency: item.frequency.trim(),
        duration: item.duration.trim(),
        quantity: item.quantity.trim(),
        instructions: item.instructions.trim(),
        startDate: form.issueDate,
        endDate: form.validUntil || undefined,
        scheduleTimes: splitScheduleTimes(item.scheduleTimesText),
        reminderEnabled: item.reminderEnabled,
      }));

  const handleSaveDraftForm = async (finalize: boolean) => {
    if (!draftForm) return;
    resetFeedback();
    setLoadingAction('save');
    try {
      const mutationItems = buildMutationItems(draftForm);
      const firstItem = mutationItems[0];
      const result = await savePatientPrescription({
        patientId,
        prescriptionId: draftForm.prescriptionId,
        category: draftForm.category,
        title: draftForm.title.trim(),
        medicationName: draftForm.title.trim() || firstItem?.label || '',
        dosage: firstItem?.dosage ?? '',
        frequency: firstItem?.frequency ?? '',
        instructions: draftForm.summary.trim(),
        startDate: draftForm.issueDate,
        endDate: draftForm.validUntil || undefined,
        patientVisible: draftForm.patientVisible,
        items: mutationItems,
        finalize,
      });

      if (result.error || !result.data) {
        setError(result.error?.message ?? 'Falha ao salvar prescricao.');
        return;
      }

      const signatureRequirement = normalizeSignatureRequirement(
        result.data.signatureRequirement,
        draftForm.category
      );
      const nextItem: PatientPrescriptionSummary = {
        id: result.data.id,
        patientId,
        category: draftForm.category,
        medicationName: draftForm.title.trim() || firstItem?.label || 'Registro clinico',
        dosage: firstItem?.dosage || '-',
        frequency: firstItem?.frequency || '-',
        startDate: draftForm.issueDate,
        endDate: draftForm.validUntil || undefined,
        prescribedBy: 'Equipe clinica',
        isActive: finalize,
        notes: draftForm.summary.trim() || undefined,
        status: mapRpcStatus(result.data.status),
        issueDate: finalize ? draftForm.issueDate : undefined,
        validity: draftForm.validUntil || undefined,
        signatureRequirement,
        signatureStatus: signatureStatusForRequirement(signatureRequirement),
        version: String(result.data.version ?? 1),
        requiresReview: false,
        patientVisible: draftForm.patientVisible,
        items: mutationItems.map((item, index) => ({
          id: `${result.data!.id}-item-${index + 1}`,
          label: item.label,
          itemType: item.itemType ?? itemTypeForCategory(draftForm.category),
          dosage: item.dosage || undefined,
          route: item.route || undefined,
          frequency: item.frequency || undefined,
          duration: item.duration || undefined,
          quantity: item.quantity || undefined,
          instructions: item.instructions || undefined,
          startDate: item.startDate,
          endDate: item.endDate,
          scheduleTimes: item.scheduleTimes,
          reminderEnabled: item.reminderEnabled,
        })),
        medicationReminders: mutationItems
          .filter(
            (item) => item.reminderEnabled && item.scheduleTimes && item.scheduleTimes.length > 0
          )
          .map((item, index) => ({
            id: `${result.data!.id}-reminder-${index + 1}`,
            title: 'Lembrete do tratamento',
            medicationLabel: item.label,
            dosage: item.dosage || undefined,
            instructions: item.instructions || undefined,
            scheduleTimes: item.scheduleTimes ?? [],
            status: 'active',
          })),
      };

      setItems((current) => {
        const withoutCurrent = current.filter((item) => item.id !== result.data!.id);
        return [nextItem, ...withoutCurrent];
      });
      setNotice(
        finalize ? 'Prescricao emitida com versionamento.' : 'Rascunho salvo para revisao.'
      );
      setDraftForm(null);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDuplicate = async (prescription: PatientPrescriptionSummary) => {
    resetFeedback();
    setLoadingAction(`duplicate:${prescription.id}`);
    try {
      const result = await duplicatePatientPrescription(prescription.id);
      if (result.error || !result.data) {
        setError(result.error?.message ?? 'Falha ao duplicar prescricao.');
        return;
      }
      setItems((current) => [
        {
          ...prescription,
          id: result.data!.id,
          status: 'rascunho',
          isActive: false,
          requiresReview: true,
          pdfArtifact: undefined,
          linkedDocumentId: undefined,
          linkedDocument: undefined,
          signatureStatus: signatureStatusForRequirement(prescription.signatureRequirement),
        },
        ...current,
      ]);
      setNotice('Registro duplicado como rascunho com revisao obrigatoria.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancelConfirm = async (prescription: PatientPrescriptionSummary) => {
    const reason = cancelReasonByPrescription[prescription.id]?.trim();
    if (!reason) return;
    resetFeedback();
    setLoadingAction(`cancel:${prescription.id}`);
    try {
      const result = await cancelPatientPrescription(prescription.id, reason);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === prescription.id ? { ...item, status: 'cancelado', isActive: false } : item
        )
      );
      setCancelReasonByPrescription((current) => ({ ...current, [prescription.id]: undefined }));
      setNotice('Prescricao cancelada com motivo auditado.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGeneratePdf = async (prescription: PatientPrescriptionSummary) => {
    resetFeedback();
    setLoadingAction(`pdf:${prescription.id}`);
    try {
      const result = await generatePatientPrescriptionPdf(prescription.id, patientId);
      if (result.error || !result.data) {
        setError(result.error?.message ?? 'Falha ao gerar PDF.');
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === prescription.id
            ? {
                ...item,
                pdfArtifact: {
                  id: result.data!.artifact.id,
                  status: 'generated',
                  versionNumber: result.data!.artifact.versionNumber,
                  generatedAt: result.data!.artifact.generatedAt,
                  releasedToPatient: true,
                },
                signatureRequirement: result.data!.signature
                  .requirement as PatientPrescriptionSummary['signatureRequirement'],
                signatureStatus: signatureStatusForRequirement(result.data!.signature.requirement),
              }
            : item
        )
      );
      if (result.data.artifact.url && result.data.artifact.url !== '#') {
        window.open(result.data.artifact.url, '_blank', 'noopener,noreferrer');
      }
      setNotice('PDF regulatorio gerado em armazenamento privado.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleOpenPdf = async (prescription: PatientPrescriptionSummary) => {
    if (!prescription.pdfArtifact?.id) return;
    resetFeedback();
    setLoadingAction(`open-pdf:${prescription.id}`);
    try {
      const result = await getPatientPrescriptionPdfSignedUrl(
        prescription.pdfArtifact.id,
        patientId
      );
      if (result.error || !result.data?.url) {
        setError(result.error?.message ?? 'Falha ao abrir PDF.');
        return;
      }
      if (result.data.url !== '#') window.open(result.data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGenerateDocument = async (prescription: PatientPrescriptionSummary) => {
    resetFeedback();
    const templateId = selectedTemplateByPrescription[prescription.id];
    const template = documentTemplates.find((item) => item.id === templateId);
    if (!template) {
      setError('Selecione um template ativo para gerar o documento.');
      return;
    }

    setLoadingAction(`document:${prescription.id}`);
    try {
      const generated = await generatePatientDocument(
        patientId,
        template.id,
        buildPrescriptionDocumentVariables(prescription, template)
      );
      if (generated.error || !generated.data?.generatedDocumentId) {
        setError(generated.error?.message ?? 'Falha ao gerar documento.');
        return;
      }
      const linked = await linkPatientPrescriptionDocument(
        prescription.id,
        generated.data.generatedDocumentId
      );
      if (linked.error || !linked.data) {
        setError(linked.error?.message ?? 'Documento gerado, mas nao foi vinculado.');
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === prescription.id
            ? {
                ...item,
                linkedDocumentId: linked.data!.documentId,
                linkedDocument: linked.data!.documentName || linked.data!.documentId,
              }
            : item
        )
      );
      setNotice('Documento nao-medico gerado e vinculado.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSendSignature = async (prescription: PatientPrescriptionSummary) => {
    resetFeedback();
    if (!prescription.linkedDocumentId) {
      setError('Gere e vincule um documento antes de enviar para assinatura.');
      return;
    }
    if (prescription.category === 'prescricao_medica') {
      setError('D4Sign nao e usado para prescricao medica.');
      return;
    }

    setLoadingAction(`signature:${prescription.id}`);
    try {
      const result = await sendDocumentForSignature(prescription.linkedDocumentId, patientId);
      if (result.error || !result.data) {
        setError(result.error?.message ?? 'Falha ao enviar para assinatura.');
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === prescription.id
            ? { ...item, signatureStatus: 'pendente', status: 'pendente_assinatura' }
            : item
        )
      );
      setNotice('Documento enviado para assinatura D4Sign.');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Prescricoes regulatorias</p>
          <p className="text-xs text-muted-foreground">
            {items.length} registro(s), {counts.active} ativo(s), {counts.drafts} rascunho(s),{' '}
            {counts.pdfs} PDF(s), {counts.reminders} lembrete(s)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canIssueMedical && (
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => openCreateForm('prescricao_medica')}
              className="btn-primary min-h-10 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={13} />
              Nova prescricao
            </button>
          )}
          <button
            type="button"
            disabled={loadingAction !== null}
            onClick={() => openCreateForm('orientacoes_gerais')}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Pill size={13} />
            Novo registro
          </button>
        </div>
      </div>

      {notice && (
        <p className="text-xs text-emerald-700" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      {draftForm && (
        <DraftEditor
          form={draftForm}
          step={wizardStep}
          loading={loadingAction === 'save'}
          canIssueMedical={canIssueMedical}
          onStepChange={setWizardStep}
          onFormChange={setDraftForm}
          onSave={(finalize) => void handleSaveDraftForm(finalize)}
          onCancel={() => setDraftForm(null)}
        />
      )}

      {CATEGORIES.map((category) => (
        <CategorySection
          key={category.key}
          config={category}
          items={
            category.key === 'prescricao_medica' && !canIssueMedical
              ? []
              : (byCategory.get(category.key) ?? [])
          }
          isRestricted={category.key === 'prescricao_medica' && !canIssueMedical}
          loadingAction={loadingAction}
          templates={documentTemplates}
          selectedTemplateByPrescription={selectedTemplateByPrescription}
          cancelReasonByPrescription={cancelReasonByPrescription}
          onTemplateChange={(prescriptionId, templateId) =>
            setSelectedTemplateByPrescription((current) => ({
              ...current,
              [prescriptionId]: templateId,
            }))
          }
          onGenerateDocument={(prescription) => void handleGenerateDocument(prescription)}
          onSendSignature={(prescription) => void handleSendSignature(prescription)}
          onDuplicate={(prescription) => void handleDuplicate(prescription)}
          onCancelStart={(prescriptionId) =>
            setCancelReasonByPrescription((current) => ({ ...current, [prescriptionId]: '' }))
          }
          onCancelReasonChange={(prescriptionId, reason) =>
            setCancelReasonByPrescription((current) => ({ ...current, [prescriptionId]: reason }))
          }
          onCancelConfirm={(prescription) => void handleCancelConfirm(prescription)}
          onReview={openReviewForm}
          onGeneratePdf={(prescription) => void handleGeneratePdf(prescription)}
          onOpenPdf={(prescription) => void handleOpenPdf(prescription)}
        />
      ))}
    </div>
  );
}
