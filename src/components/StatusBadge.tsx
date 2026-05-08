import React from 'react';
import type {
  AppointmentStatus,
  PatientStatus,
  FinancialStatus,
  PackageStatus,
  AdherenceLevel,
} from '@/domain/types';

type BadgeVariant =
  | AppointmentStatus
  | PatientStatus
  | FinancialStatus
  | PackageStatus
  | AdherenceLevel
  | 'pago'
  | 'pendente'
  | 'vencido'
  | 'cancelado'
  | 'em_analise'
  | 'pendente_assinatura'
  | 'assinado';

const badgeConfig: Record<string, { label: string; classes: string }> = {
  // Appointment statuses
  agendado: { label: 'Agendado', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  chegou: { label: 'Chegou', classes: 'bg-purple-50 text-purple-700 border-purple-200' },
  triagem: { label: 'Triagem', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  medidas: { label: 'Medidas', classes: 'bg-orange-50 text-orange-700 border-orange-200' },
  bioimpedancia: { label: 'Bioimpedância', classes: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  aguardando_medico: {
    label: 'Aguard. Médico',
    classes: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  em_consulta: { label: 'Em Consulta', classes: 'bg-teal-50 text-teal-700 border-teal-200' },
  checkout: { label: 'Checkout', classes: 'bg-lime-50 text-lime-700 border-lime-200' },
  concluido: { label: 'Concluído', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  falta: { label: 'Falta', classes: 'bg-red-50 text-red-700 border-red-200' },
  cancelado: { label: 'Cancelado', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
  // Patient statuses
  ativo: { label: 'Ativo', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  inativo: { label: 'Inativo', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
  pausado: { label: 'Pausado', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  // Financial statuses
  em_dia: { label: 'Em dia', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pendente: { label: 'Pendente', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  inadimplente: { label: 'Inadimplente', classes: 'bg-red-50 text-red-700 border-red-200' },
  isento: { label: 'Isento', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  // Invoice statuses
  pago: { label: 'Pago', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  vencido: { label: 'Vencido', classes: 'bg-red-50 text-red-700 border-red-200' },
  // Document statuses
  pendente_assinatura: {
    label: 'Pend. Assinatura',
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  assinado: { label: 'Assinado', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  em_analise: { label: 'Em Análise', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  // Adherence
  excelente: { label: 'Excelente', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  bom: { label: 'Bom', classes: 'bg-teal-50 text-teal-700 border-teal-200' },
  regular: { label: 'Regular', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  critico: { label: 'Crítico', classes: 'bg-red-50 text-red-700 border-red-200' },
  // Package
  aguardando: { label: 'Aguardando', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
};

interface StatusBadgeProps {
  status: BadgeVariant;
  size?: 'xs' | 'sm' | 'md';
  dot?: boolean;
}

export default function StatusBadge({ status, size = 'sm', dot = false }: StatusBadgeProps) {
  const config = badgeConfig[status] ?? {
    label: status,
    classes: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  const sizeClasses = {
    xs: 'text-xs px-1.5 py-0.5',
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  };

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border font-medium',
        config.classes,
        sizeClasses[size],
      ].join(' ')}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
      {config.label}
    </span>
  );
}
