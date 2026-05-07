import React from 'react';
import {
  Stethoscope,
  Apple,
  Pill,
  Ruler,
  FileText,
  CreditCard,
  AlertTriangle,
  MessageSquare,
  PlayCircle,
  Trophy,
} from 'lucide-react';
import type { PatientTimelineEvent, TimelineEventType } from '@/domain/types';
import Icon from '@/components/ui/AppIcon';


const eventConfig: Record<TimelineEventType, { icon: React.ElementType; color: string; bg: string }> = {
  consulta: { icon: Stethoscope, color: 'text-teal-600', bg: 'bg-teal-50' },
  nutricao: { icon: Apple, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  medicamento: { icon: Pill, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  medida: { icon: Ruler, color: 'text-blue-600', bg: 'bg-blue-50' },
  documento: { icon: FileText, color: 'text-slate-600', bg: 'bg-slate-50' },
  pagamento: { icon: CreditCard, color: 'text-violet-600', bg: 'bg-violet-50' },
  alerta: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  mensagem: { icon: MessageSquare, color: 'text-sky-600', bg: 'bg-sky-50' },
  inicio_programa: { icon: PlayCircle, color: 'text-primary', bg: 'bg-primary/10' },
  meta_atingida: { icon: Trophy, color: 'text-amber-600', bg: 'bg-amber-50' },
};

interface TimelineEventCardProps {
  event: PatientTimelineEvent;
  isLast?: boolean;
}

export default function TimelineEventCard({ event, isLast = false }: TimelineEventCardProps) {
  const { icon: Icon, color, bg } = eventConfig[event.type] ?? eventConfig.consulta;

  return (
    <div className="flex gap-3 group">
      {/* Timeline line */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={['w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', bg].join(' ')}>
          <Icon size={15} className={color} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-2 min-h-4" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-foreground leading-snug">{event.title}</p>
          <span className="text-xs text-muted-foreground flex-shrink-0 font-medium">{event.date}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{event.description}</p>
        {event.professional && (
          <p className="text-xs text-muted-foreground mt-1 font-medium">{event.professional}</p>
        )}
      </div>
    </div>
  );
}