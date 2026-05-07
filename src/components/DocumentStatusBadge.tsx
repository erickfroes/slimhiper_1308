import React from 'react';
import { FileCheck, FileClock, FileX, FileSearch, File } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


type DocStatus = 'pendente_assinatura' | 'assinado' | 'vencido' | 'cancelado' | 'em_analise';

const docStatusConfig: Record<DocStatus, { label: string; icon: React.ElementType; classes: string }> = {
  assinado: { label: 'Assinado', icon: FileCheck, classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pendente_assinatura: { label: 'Pend. Assinatura', icon: FileClock, classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  vencido: { label: 'Vencido', icon: FileX, classes: 'bg-red-50 text-red-700 border-red-200' },
  cancelado: { label: 'Cancelado', icon: FileX, classes: 'bg-slate-100 text-slate-600 border-slate-200' },
  em_analise: { label: 'Em Análise', icon: FileSearch, classes: 'bg-blue-50 text-blue-700 border-blue-200' },
};

interface DocumentStatusBadgeProps {
  status: DocStatus;
}

export default function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  const config = docStatusConfig[status] ?? { label: status, icon: File, classes: 'bg-slate-100 text-slate-600 border-slate-200' };
  const Icon = config.icon;
  return (
    <span className={['inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border', config.classes].join(' ')}>
      <Icon size={11} />
      {config.label}
    </span>
  );
}