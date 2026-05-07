import React from 'react';
import { Plus, CalendarPlus, FileText, MessageSquare, CreditCard, ClipboardList } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface QuickAction {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  onClick?: () => void;
}

const defaultActions: QuickAction[] = [
  { key: 'qa-nova-consulta', label: 'Nova Consulta', icon: CalendarPlus, color: 'text-teal-700', bg: 'bg-teal-50 hover:bg-teal-100 border-teal-200' },
  { key: 'qa-novo-paciente', label: 'Novo Paciente', icon: Plus, color: 'text-indigo-700', bg: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200' },
  { key: 'qa-enviar-mensagem', label: 'Enviar Mensagem', icon: MessageSquare, color: 'text-sky-700', bg: 'bg-sky-50 hover:bg-sky-100 border-sky-200' },
  { key: 'qa-novo-documento', label: 'Novo Documento', icon: FileText, color: 'text-slate-700', bg: 'bg-slate-50 hover:bg-slate-100 border-slate-200' },
  { key: 'qa-cobrar', label: 'Gerar Cobrança', icon: CreditCard, color: 'text-violet-700', bg: 'bg-violet-50 hover:bg-violet-100 border-violet-200' },
  { key: 'qa-protocolo', label: 'Novo Protocolo', icon: ClipboardList, color: 'text-amber-700', bg: 'bg-amber-50 hover:bg-amber-100 border-amber-200' },
];

interface QuickActionsCardProps {
  actions?: QuickAction[];
}

export default function QuickActionsCard({ actions = defaultActions }: QuickActionsCardProps) {
  return (
    <div className="card-base p-5">
      <p className="text-sm font-semibold text-foreground mb-3">Ações Rápidas</p>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              onClick={action.onClick}
              className={['flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all duration-150 active:scale-95', action.color, action.bg].join(' ')}
            >
              <Icon size={14} />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}