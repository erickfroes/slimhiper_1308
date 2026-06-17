import React from 'react';
import Link from 'next/link';
import {
  CalendarPlus,
  ClipboardList,
  CreditCard,
  FileText,
  MessageSquare,
  Plus,
} from 'lucide-react';

interface QuickAction {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  href?: string;
  disabledReason?: string;
}

const defaultActions: QuickAction[] = [
  {
    key: 'qa-nova-consulta',
    label: 'Nova Consulta',
    icon: CalendarPlus,
    color: 'text-teal-700',
    bg: 'bg-teal-50 hover:bg-teal-100 border-teal-200',
    href: '/clinic/agenda',
  },
  {
    key: 'qa-novo-paciente',
    label: 'Novo Paciente',
    icon: Plus,
    color: 'text-indigo-700',
    bg: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200',
    href: '/clinic/patients',
  },
  {
    key: 'qa-enviar-mensagem',
    label: 'Enviar Mensagem',
    icon: MessageSquare,
    color: 'text-sky-700',
    bg: 'bg-sky-50 hover:bg-sky-100 border-sky-200',
    href: '/clinic/inbox?tab=conversas',
    disabledReason: 'Chat ainda não está liberado no MVP clínico.',
  },
  {
    key: 'qa-novo-documento',
    label: 'Novo Documento',
    icon: FileText,
    color: 'text-slate-700',
    bg: 'bg-slate-50 hover:bg-slate-100 border-slate-200',
    href: '/clinic/documents',
  },
  {
    key: 'qa-cobrar',
    label: 'Gerar Cobrança',
    icon: CreditCard,
    color: 'text-violet-700',
    bg: 'bg-violet-50 hover:bg-violet-100 border-violet-200',
    href: '/clinic/financeiro',
  },
  {
    key: 'qa-protocolo',
    label: 'Novo Protocolo',
    icon: ClipboardList,
    color: 'text-amber-700',
    bg: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
    href: '/clinic/programs/builder',
  },
];

interface QuickActionsCardProps {
  actions?: QuickAction[];
}

export default function QuickActionsCard({ actions = defaultActions }: QuickActionsCardProps) {
  const focusRingClasses =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  return (
    <div className="card-base p-5">
      <p className="mb-3 text-sm font-semibold text-foreground">Ações Rápidas</p>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          const disabled = Boolean(action.disabledReason);
          const className = [
            'group flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all duration-150',
            disabled
              ? 'cursor-not-allowed opacity-55 disabled:hover:brightness-100 disabled:active:scale-100'
              : 'active:scale-95 hover:brightness-95',
            action.color,
            action.bg,
            focusRingClasses,
          ].join(' ');

          if (action.href && !disabled) {
            return (
              <Link key={action.key} href={action.href} className={className}>
                <Icon size={14} />
                {action.label}
              </Link>
            );
          }

          return (
            <button
              key={action.key}
              type="button"
              disabled={disabled}
              aria-disabled={disabled ? 'true' : undefined}
              title={action.disabledReason}
              aria-label={
                action.disabledReason ? `${action.label}: ${action.disabledReason}` : action.label
              }
              onClick={(event) => disabled && event.preventDefault()}
              className={className}
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
