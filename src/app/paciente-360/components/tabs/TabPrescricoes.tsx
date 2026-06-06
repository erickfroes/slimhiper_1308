'use client';

import React, { useEffect, useState } from 'react';
import type { PatientPrescriptionSummary } from '@/domain/types';
import {
  cancelPatientPrescription,
  duplicatePatientPrescription,
  linkPatientPrescriptionDocument,
  savePatientPrescription,
} from '@/services/prescriptionsApi';
import {
  generatePatientDocument,
  listActiveDocumentTemplates,
  sendDocumentForSignature,
  type ActiveDocumentTemplate,
} from '@/services/documentsApi';
import {
  Plus,
  FileText,
  Send,
  XCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Leaf,
  Salad,
  BookOpen,
  ShieldAlert,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSignature,
} from 'lucide-react';

interface TabPrescricoesProps {
  patientId: string;
  prescriptions: PatientPrescriptionSummary[];
  canViewMedicalPrescriptions: boolean;
  currentRole: string | null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PrescCategory =
  | 'prescricao_medica'
  | 'suplementacao'
  | 'orientacoes_nutricionais'
  | 'orientacoes_gerais';

interface CategoryConfig {
  key: PrescCategory;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: 'prescricao_medica',
    label: 'Prescrição Médica',
    icon: Stethoscope,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
  },
  {
    key: 'suplementacao',
    label: 'Suplementação',
    icon: Leaf,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  {
    key: 'orientacoes_nutricionais',
    label: 'Orientações Nutricionais',
    icon: Salad,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
  },
  {
    key: 'orientacoes_gerais',
    label: 'Orientações Gerais',
    icon: BookOpen,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
];

function buildPrescriptionDocumentVariables(
  presc: PatientPrescriptionSummary,
  template: ActiveDocumentTemplate
) {
  const candidates: Record<string, string> = {
    prescription_title: presc.medicationName,
    medication_name: presc.medicationName,
    dosage: presc.dosage,
    frequency: presc.frequency,
    instructions: presc.notes ?? '',
    category: presc.category ?? 'prescricao_medica',
    issue_date: presc.issueDate ?? presc.startDate ?? '',
    validity: presc.validity ?? presc.endDate ?? '',
  };
  const allowed = new Set(template.allowedVariables);
  return Object.fromEntries(Object.entries(candidates).filter(([key]) => allowed.has(key)));
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    ativo: {
      label: 'Ativo',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2,
    },
    expirado: { label: 'Expirado', cls: 'bg-gray-100 text-gray-500 border-gray-200', icon: Clock },
    cancelado: { label: 'Cancelado', cls: 'bg-red-50 text-red-600 border-red-200', icon: XCircle },
    pendente_assinatura: {
      label: 'Pend. Assinatura',
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: Clock,
    },
    rascunho: {
      label: 'Rascunho',
      cls: 'bg-slate-100 text-slate-500 border-slate-200',
      icon: FileText,
    },
  };
  const cfg = map[status ?? ''] ?? {
    label: status ?? '—',
    cls: 'bg-gray-100 text-gray-500 border-gray-200',
    icon: AlertCircle,
  };
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.cls}`}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

// ─── Signature Badge ──────────────────────────────────────────────────────────

function SignatureBadge({ sig }: { sig?: string }) {
  if (!sig || sig === 'nao_requerido')
    return <span className="text-xs text-muted-foreground">—</span>;
  if (sig === 'assinado')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <CheckCircle2 size={11} />
        Assinado
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
      <Clock size={11} />
      Pendente
    </span>
  );
}

// ─── Prescription Card ────────────────────────────────────────────────────────

function PrescriptionCard({
  presc,
  catConfig,
  loadingAction,
  templates,
  selectedTemplateId,
  onTemplateChange,
  onGenerateDocument,
  onSendSignature,
  onDuplicate,
  onCancel,
}: {
  presc: PatientPrescriptionSummary;
  catConfig: CategoryConfig;
  loadingAction: string | null;
  templates: ActiveDocumentTemplate[];
  selectedTemplateId: string;
  onTemplateChange: (prescriptionId: string, templateId: string) => void;
  onGenerateDocument: (prescription: PatientPrescriptionSummary) => void;
  onSendSignature: (prescription: PatientPrescriptionSummary) => void;
  onDuplicate: (prescription: PatientPrescriptionSummary) => void;
  onCancel: (prescription: PatientPrescriptionSummary) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = catConfig.icon;
  const canSendSignature =
    Boolean(presc.linkedDocumentId) && presc.category !== 'prescricao_medica';

  return (
    <div className="card-base overflow-hidden">
      {/* Header row */}
      <div className="p-4 flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-xl ${catConfig.bgColor} flex items-center justify-center flex-shrink-0`}
        >
          <Icon size={16} className={catConfig.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm font-bold text-foreground leading-snug">{presc.medicationName}</p>
            <StatusBadge status={presc.status} />
          </div>
          {presc.dosage !== '—' && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {presc.dosage} · {presc.frequency}
            </p>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
          aria-label={expanded ? 'Recolher' : 'Expandir'}
        >
          {expanded ? (
            <ChevronUp size={15} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={15} className="text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Detail grid */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-muted/30 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
            <div>
              <p className="text-muted-foreground font-medium mb-0.5">Data de emissão</p>
              <p className="text-foreground">{presc.issueDate ?? presc.startDate ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium mb-0.5">Validade</p>
              <p className="text-foreground">{presc.validity ?? presc.endDate ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium mb-0.5">Versão</p>
              <p className="text-foreground">{presc.version ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium mb-0.5">Profissional responsável</p>
              <p className="text-foreground">{presc.prescribedBy}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium mb-0.5">Documento vinculado</p>
              <p className="text-foreground">{presc.linkedDocument ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium mb-0.5">Assinatura</p>
              <SignatureBadge sig={presc.signatureStatus} />
            </div>
          </div>
          {presc.notes && (
            <p className="text-xs text-muted-foreground italic border-t border-border pt-2">
              {presc.notes}
            </p>
          )}
          {/* Per-card actions */}
          <div className="flex flex-wrap gap-2 border-t border-border pt-2">
            <select
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
              value={selectedTemplateId}
              disabled={loadingAction !== null || templates.length === 0}
              onChange={(event) => onTemplateChange(presc.id, event.target.value)}
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
              disabled={
                loadingAction !== null || !selectedTemplateId || presc.status === 'cancelado'
              }
              title={
                templates.length === 0
                  ? 'Cadastre um template ativo em documentos.'
                  : 'Gerar documento a partir da prescricao.'
              }
              onClick={() => onGenerateDocument(presc)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText size={12} />
              {loadingAction === `document:${presc.id}` ? 'Gerando...' : 'Gerar documento'}
            </button>
            <button
              type="button"
              disabled={loadingAction !== null || !canSendSignature || presc.status === 'cancelado'}
              title={
                presc.category === 'prescricao_medica'
                  ? 'D4Sign nao e usado para prescricao medica.'
                  : presc.linkedDocumentId
                    ? 'Enviar documento vinculado para assinatura.'
                    : 'Gere e vincule um documento antes de enviar.'
              }
              onClick={() => onSendSignature(presc)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={12} />
              {loadingAction === `signature:${presc.id}` ? 'Enviando...' : 'Enviar para assinatura'}
            </button>
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => onDuplicate(presc)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy size={12} />
              {loadingAction === `duplicate:${presc.id}` ? 'Duplicando...' : 'Duplicar'}
            </button>
            <button
              type="button"
              disabled={loadingAction !== null || presc.status === 'cancelado'}
              onClick={() => onCancel(presc)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle size={12} />
              {loadingAction === `cancel:${presc.id}` ? 'Cancelando...' : 'Cancelar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({
  config,
  items,
  isRestricted,
  loadingAction,
  templates,
  selectedTemplateByPrescription,
  onTemplateChange,
  onGenerateDocument,
  onSendSignature,
  onDuplicate,
  onCancel,
}: {
  config: CategoryConfig;
  items: PatientPrescriptionSummary[];
  isRestricted: boolean;
  loadingAction: string | null;
  templates: ActiveDocumentTemplate[];
  selectedTemplateByPrescription: Record<string, string>;
  onTemplateChange: (prescriptionId: string, templateId: string) => void;
  onGenerateDocument: (prescription: PatientPrescriptionSummary) => void;
  onSendSignature: (prescription: PatientPrescriptionSummary) => void;
  onDuplicate: (prescription: PatientPrescriptionSummary) => void;
  onCancel: (prescription: PatientPrescriptionSummary) => void;
}) {
  const Icon = config.icon;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-xl ${config.bgColor} border ${config.borderColor}`}
      >
        <div className="flex items-center gap-2">
          <Icon size={15} className={config.color} />
          <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
          <span
            className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${config.bgColor} ${config.color} border ${config.borderColor}`}
          >
            {items.length}
          </span>
        </div>
      </div>

      {/* Restricted state for medical prescriptions when nutritionist */}
      {isRestricted ? (
        <div className="card-base p-5 flex items-start gap-3 border-amber-200 bg-amber-50/40">
          <ShieldAlert size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Acesso restrito ao escopo profissional
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Prescrições médicas de medicamentos são de responsabilidade exclusiva do médico. Como
              nutricionista, você não tem permissão para visualizar, criar ou editar este tipo de
              prescrição.
            </p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="card-base p-4 text-center">
          <p className="text-sm text-muted-foreground">Nenhum registro nesta categoria.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((presc) => (
            <PrescriptionCard
              key={presc.id}
              presc={presc}
              catConfig={config}
              loadingAction={loadingAction}
              templates={templates}
              selectedTemplateId={selectedTemplateByPrescription[presc.id] ?? ''}
              onTemplateChange={onTemplateChange}
              onGenerateDocument={onGenerateDocument}
              onSendSignature={onSendSignature}
              onDuplicate={onDuplicate}
              onCancel={onCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TabPrescricoes({
  patientId,
  prescriptions,
  canViewMedicalPrescriptions,
  currentRole,
}: TabPrescricoesProps) {
  const [items, setItems] = useState(prescriptions);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<PrescCategory | null>(null);
  const [newMedication, setNewMedication] = useState('');
  const [newDosage, setNewDosage] = useState('');
  const [newFrequency, setNewFrequency] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [documentTemplates, setDocumentTemplates] = useState<ActiveDocumentTemplate[]>([]);
  const [selectedTemplateByPrescription, setSelectedTemplateByPrescription] = useState<
    Record<string, string>
  >({});
  const normalizedRole = currentRole?.trim().toLowerCase() ?? null;
  const isNutritionist = normalizedRole === 'nutritionist';
  const canViewMedical = canViewMedicalPrescriptions;

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

  const openCreateForm = (category: PrescCategory) => {
    resetFeedback();
    setNewCategory(category);
    setNewMedication('');
    setNewDosage('');
    setNewFrequency('');
    setNewInstructions('');
  };

  const handleSaveNew = async () => {
    if (!newCategory) return;
    resetFeedback();
    setLoadingAction('create');
    try {
      const result = await savePatientPrescription({
        patientId,
        category: newCategory,
        medicationName: newMedication.trim(),
        dosage: newDosage.trim(),
        frequency: newFrequency.trim(),
        instructions: newInstructions.trim(),
        finalize: true,
      });
      if (result.error || !result.data) {
        setError(result.error?.message ?? 'Falha ao salvar prescricao.');
        return;
      }
      const now = new Date().toISOString().slice(0, 10);
      setItems((current) => [
        {
          id: result.data!.id,
          patientId,
          category: newCategory,
          medicationName:
            newMedication.trim() ||
            (newCategory === 'prescricao_medica' ? 'Prescricao' : 'Orientacao'),
          dosage: newDosage.trim() || '-',
          frequency: newFrequency.trim() || '-',
          startDate: now,
          prescribedBy: 'Equipe',
          isActive: true,
          notes: newInstructions.trim() || undefined,
          status: 'ativo',
          issueDate: now,
          signatureStatus: 'nao_requerido',
          version: '1',
        },
        ...current,
      ]);
      setNotice('Registro salvo com auditoria clinica.');
      setNewCategory(null);
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
          version: 'rascunho',
        },
        ...current,
      ]);
      setNotice('Registro duplicado como rascunho.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancel = async (prescription: PatientPrescriptionSummary) => {
    resetFeedback();
    setLoadingAction(`cancel:${prescription.id}`);
    try {
      const result = await cancelPatientPrescription(
        prescription.id,
        'Cancelamento solicitado pela equipe.'
      );
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === prescription.id ? { ...item, status: 'cancelado', isActive: false } : item
        )
      );
      setNotice('Registro cancelado com auditoria clinica.');
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
                signatureStatus: 'nao_requerido',
              }
            : item
        )
      );
      setNotice('Documento gerado e vinculado a prescricao.');
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
      setNotice('Documento enviado para assinatura.');
    } finally {
      setLoadingAction(null);
    }
  };

  const byCategory = (cat: PrescCategory) =>
    items.filter((p) => (p.category ?? 'prescricao_medica') === cat);

  return (
    <div className="space-y-6">
      {/* Global action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          Prescrições &amp; Orientações
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            ({items.length} registros)
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {!isNutritionist && (
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => openCreateForm('prescricao_medica')}
              className="btn-primary text-xs flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={13} />
              Nova prescrição
            </button>
          )}
          <button
            type="button"
            disabled={loadingAction !== null}
            onClick={() => openCreateForm('orientacoes_gerais')}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-background transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileSignature size={13} />
            Nova orientação
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
      {newCategory && (
        <div className="card-base p-4 space-y-3" role="dialog" aria-label="Nova prescricao">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">Prescricao/orientacao</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                value={newMedication}
                disabled={loadingAction === 'create'}
                onChange={(event) => setNewMedication(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">Dose</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                value={newDosage}
                disabled={loadingAction === 'create'}
                onChange={(event) => setNewDosage(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">Frequencia</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                value={newFrequency}
                disabled={loadingAction === 'create'}
                onChange={(event) => setNewFrequency(event.target.value)}
              />
            </label>
          </div>
          <label className="space-y-1 text-xs block">
            <span className="font-medium text-muted-foreground">Instrucoes</span>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 min-h-20"
              value={newInstructions}
              disabled={loadingAction === 'create'}
              onChange={(event) => setNewInstructions(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={loadingAction === 'create'}
              onClick={() => void handleSaveNew()}
            >
              {loadingAction === 'create' ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={loadingAction === 'create'}
              onClick={() => setNewCategory(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Category sections */}
      {CATEGORIES.map((cat) => (
        <CategorySection
          key={cat.key}
          config={cat}
          items={
            cat.key === 'prescricao_medica' && (!canViewMedical || isNutritionist)
              ? []
              : byCategory(cat.key)
          }
          isRestricted={cat.key === 'prescricao_medica' && (!canViewMedical || isNutritionist)}
          loadingAction={loadingAction}
          templates={documentTemplates}
          selectedTemplateByPrescription={selectedTemplateByPrescription}
          onTemplateChange={(prescriptionId, templateId) =>
            setSelectedTemplateByPrescription((current) => ({
              ...current,
              [prescriptionId]: templateId,
            }))
          }
          onGenerateDocument={(prescription) => void handleGenerateDocument(prescription)}
          onSendSignature={(prescription) => void handleSendSignature(prescription)}
          onDuplicate={(prescription) => void handleDuplicate(prescription)}
          onCancel={(prescription) => void handleCancel(prescription)}
        />
      ))}
    </div>
  );
}
