'use client';

import React, { useState } from 'react';
import type { PatientPrescriptionSummary, UserRole } from '@/domain/types';
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
import Icon from '@/components/ui/AppIcon';
import { canViewMedicalPrescriptions, mockSession } from '@/services/mockSession';

interface TabPrescricoesProps {
  prescriptions: PatientPrescriptionSummary[];
  currentRole?: UserRole;
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
}: {
  presc: PatientPrescriptionSummary;
  catConfig: CategoryConfig;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = catConfig.icon;

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
            <button className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
              <FileText size={12} />
              Gerar documento
            </button>
            <button className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
              <Send size={12} />
              Enviar para assinatura
            </button>
            <button className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
              <Copy size={12} />
              Duplicar
            </button>
            <button className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
              <XCircle size={12} />
              Cancelar
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
}: {
  config: CategoryConfig;
  items: PatientPrescriptionSummary[];
  isRestricted: boolean;
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
            <PrescriptionCard key={presc.id} presc={presc} catConfig={config} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TabPrescricoes({
  prescriptions,
  currentRole = mockSession.currentRole,
}: TabPrescricoesProps) {
  const isNutritionist = currentRole === 'nutritionist';
  const canViewMedical = canViewMedicalPrescriptions(currentRole);

  const byCategory = (cat: PrescCategory) =>
    prescriptions.filter((p) => (p.category ?? 'prescricao_medica') === cat);

  return (
    <div className="space-y-6">
      {/* Global action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          Prescrições &amp; Orientações
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            ({prescriptions.length} registros)
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {!isNutritionist && (
            <button className="btn-primary text-xs flex items-center gap-1.5">
              <Plus size={13} />
              Nova prescrição
            </button>
          )}
          <button className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors">
            <FileSignature size={13} />
            Nova orientação
          </button>
        </div>
      </div>

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
        />
      ))}
    </div>
  );
}
