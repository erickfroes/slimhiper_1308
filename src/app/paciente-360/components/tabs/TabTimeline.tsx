'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type {
  PatientTimelineEvent,
  TimelineEventCategory,
  TimelineEventType,
} from '@/domain/types';
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
  UserPlus,
  UserCheck,
  ShoppingBag,
  FileSignature,
  ClipboardList,
  CalendarPlus,
  LogIn,
  Activity,
  CheckCircle2,
  ClipboardEdit,
  NotebookPen,
  Scale,
  Utensils,
  FilePlus,
  PenLine,
  Banknote,
  Clock,
  Send,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { getPatientTimeline } from '@/services/patient360Api';

type CategoryFilter = TimelineEventCategory | 'all';

const PAGE_SIZE = 10;

const categoryFilters: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'clinical', label: 'Clínico' },
  { key: 'financial', label: 'Financeiro' },
  { key: 'documents', label: 'Documentos' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'communication', label: 'Comunicação' },
  { key: 'patient_app', label: 'App do paciente' },
  { key: 'commercial', label: 'Comercial' },
];
interface EventConfig {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  label: string;
}
const eventTypeConfig: Record<TimelineEventType, EventConfig> = {
  consulta: {
    icon: Stethoscope,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-50',
    label: 'Consulta',
  },
  nutricao: {
    icon: Apple,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    label: 'Nutrição',
  },
  medicamento: {
    icon: Pill,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    label: 'Medicamento',
  },
  medida: { icon: Ruler, iconColor: 'text-blue-600', iconBg: 'bg-blue-50', label: 'Medida' },
  documento: {
    icon: FileText,
    iconColor: 'text-slate-600',
    iconBg: 'bg-slate-50',
    label: 'Documento',
  },
  pagamento: {
    icon: CreditCard,
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-50',
    label: 'Pagamento',
  },
  alerta: {
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
    label: 'Alerta',
  },
  mensagem: {
    icon: MessageSquare,
    iconColor: 'text-sky-600',
    iconBg: 'bg-sky-50',
    label: 'Mensagem',
  },
  inicio_programa: {
    icon: PlayCircle,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10',
    label: 'Início de programa',
  },
  meta_atingida: {
    icon: Trophy,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
    label: 'Meta atingida',
  },
  lead_criado: {
    icon: UserPlus,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-50',
    label: 'Lead criado',
  },
  lead_convertido: {
    icon: UserCheck,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-50',
    label: 'Lead convertido',
  },
  pacote_vendido: {
    icon: ShoppingBag,
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-50',
    label: 'Pacote vendido',
  },
  contrato_assinado: {
    icon: FileSignature,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    label: 'Contrato assinado',
  },
  paciente_cadastrado: {
    icon: ClipboardList,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-50',
    label: 'Paciente cadastrado',
  },
  consulta_agendada: {
    icon: CalendarPlus,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    label: 'Consulta agendada',
  },
  checkin_realizado: {
    icon: LogIn,
    iconColor: 'text-cyan-600',
    iconBg: 'bg-cyan-50',
    label: 'Check-in realizado',
  },
  atendimento_iniciado: {
    icon: Activity,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    label: 'Atendimento iniciado',
  },
  atendimento_concluido: {
    icon: CheckCircle2,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-50',
    label: 'Atendimento concluído',
  },
  anamnese_preenchida: {
    icon: ClipboardEdit,
    iconColor: 'text-sky-600',
    iconBg: 'bg-sky-50',
    label: 'Anamnese preenchida',
  },
  soap_atualizado: {
    icon: NotebookPen,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-50',
    label: 'SOAP atualizado',
  },
  medida_registrada: {
    icon: Scale,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    label: 'Medida registrada',
  },
  plano_alimentar_publicado: {
    icon: Utensils,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    label: 'Plano alimentar publicado',
  },
  prescricao_emitida: {
    icon: FilePlus,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    label: 'Prescrição emitida',
  },
  documento_gerado: {
    icon: FileText,
    iconColor: 'text-slate-600',
    iconBg: 'bg-slate-50',
    label: 'Documento gerado',
  },
  documento_assinado: {
    icon: PenLine,
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-50',
    label: 'Documento assinado',
  },
  pagamento_recebido: {
    icon: Banknote,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-50',
    label: 'Pagamento recebido',
  },
  pagamento_atrasado: {
    icon: Clock,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-50',
    label: 'Pagamento atrasado',
  },
  mensagem_enviada: {
    icon: Send,
    iconColor: 'text-sky-600',
    iconBg: 'bg-sky-50',
    label: 'Mensagem enviada',
  },
  checkin_semanal_enviado: {
    icon: Smartphone,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-50',
    label: 'Check-in semanal',
  },
};
const categoryBadgeConfig: Record<TimelineEventCategory, { label: string; className: string }> = {
  clinical: { label: 'Clínico', className: 'bg-teal-50 text-teal-700 border border-teal-200' },
  financial: {
    label: 'Financeiro',
    className: 'bg-violet-50 text-violet-700 border border-violet-200',
  },
  documents: {
    label: 'Documentos',
    className: 'bg-slate-100 text-slate-700 border border-slate-200',
  },
  agenda: { label: 'Agenda', className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  communication: {
    label: 'Comunicação',
    className: 'bg-sky-50 text-sky-700 border border-sky-200',
  },
  patient_app: {
    label: 'App do paciente',
    className: 'bg-purple-50 text-purple-700 border border-purple-200',
  },
  commercial: {
    label: 'Comercial',
    className: 'bg-orange-50 text-orange-700 border border-orange-200',
  },
};

function getStatusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (
    [
      'concluído',
      'concluido',
      'pago',
      'assinado',
      'confirmado',
      'convertido',
      'registrado',
      'preenchida',
      'publicado',
      'emitida',
      'gerado',
      'respondido',
      'cadastrado',
      'vendido',
      'criado',
    ].some((k) => s.includes(k))
  )
    return 'bg-green-50 text-green-700 border border-green-200';
  if (['pendente', 'atrasado', 'não respondida', 'nao respondida'].some((k) => s.includes(k)))
    return 'bg-red-50 text-red-700 border border-red-200';
  if (['em andamento', 'ativo', 'agendado'].some((k) => s.includes(k)))
    return 'bg-blue-50 text-blue-700 border border-blue-200';
  return 'bg-slate-100 text-slate-600 border border-slate-200';
}
function resolveDetailsHref(event: PatientTimelineEvent): string | undefined {
  if (event.category === 'agenda') return `/clinic/agenda?appointmentId=${event.id}`;
  if (event.type === 'soap_atualizado')
    return `/clinic/patients/${event.patientId}/encounters/${event.id}`;
  if (event.category === 'documents') return `/clinic/patients/${event.patientId}?tab=documentos`;
  if (event.category === 'financial') return `/clinic/patients/${event.patientId}?tab=financeiro`;
  return event.detailsHref;
}
function groupByDate(
  events: PatientTimelineEvent[]
): { label: string; events: PatientTimelineEvent[] }[] {
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));
  const map = new Map<string, PatientTimelineEvent[]>();
  for (const ev of sorted) {
    const existing = map.get(ev.date) ?? [];
    existing.push(ev);
    map.set(ev.date, existing);
  }
  return Array.from(map.entries()).map(([date, evs]) => ({ label: date, events: evs }));
}
function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ];
  return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
}

function EventCard({ event, isLast }: { event: PatientTimelineEvent; isLast: boolean }) {
  const cfg = eventTypeConfig[event.type] ?? eventTypeConfig.consulta;
  const IconComp = cfg.icon;
  const catCfg = event.category ? categoryBadgeConfig[event.category] : null;
  const resolvedHref = resolveDetailsHref(event);
  return (
    <div className="flex gap-3 group">
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className={[
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm',
            cfg.iconBg,
          ].join(' ')}
        >
          <IconComp size={16} className={cfg.iconColor} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-2 min-h-[20px]" />}
      </div>
      <div className={['flex-1 min-w-0', isLast ? 'pb-0' : 'pb-4'].join(' ')}>
        <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow duration-150">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {cfg.label}
            </span>
            <span className="text-[11px] text-muted-foreground font-medium flex-shrink-0">
              {formatDateLabel(event.date)}
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug mb-1.5">{event.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-2.5 line-clamp-2">
            {event.description}
          </p>
          <div className="flex items-center flex-wrap gap-1.5 mb-2.5">
            {catCfg && (
              <span
                className={[
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  catCfg.className,
                ].join(' ')}
              >
                {catCfg.label}
              </span>
            )}
            {event.statusLabel && (
              <span
                className={[
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  getStatusBadgeClass(event.statusLabel),
                ].join(' ')}
              >
                {event.statusLabel}
              </span>
            )}
            {event.actorName && (
              <span className="text-[10px] text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-muted border border-border">
                {event.actorName}
              </span>
            )}
          </div>
          {resolvedHref && event.actionLabel && (
            <a
              href={resolvedHref}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink size={11} />
              {event.actionLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

interface TabTimelineProps {
  events: PatientTimelineEvent[];
  patientId: string;
}
const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

export default function TabTimeline({ events, patientId }: TabTimelineProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [timelineEvents, setTimelineEvents] = useState<PatientTimelineEvent[]>(events);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory]);

  useEffect(() => {
    if (isMockMode) {
      setTimelineEvents(events);
      setError(null);
      return;
    }

    const category = activeCategory === 'all' ? undefined : activeCategory;
    let isActive = true;
    setIsLoading(true);
    setError(null);

    void getPatientTimeline(patientId, { category }).then(({ data, error: timelineError }) => {
      if (!isActive) return;
      if (timelineError) {
        setTimelineEvents([]);
        setError('Falha ao carregar timeline. Tente novamente.');
      } else {
        setTimelineEvents(data);
      }
      setIsLoading(false);
    });

    return () => {
      isActive = false;
    };
  }, [activeCategory, events, patientId]);

  const filtered = useMemo(
    () =>
      isMockMode && activeCategory !== 'all'
        ? timelineEvents.filter((e) => e.category === activeCategory)
        : timelineEvents,
    [activeCategory, timelineEvents]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const groups = groupByDate(paginated);

  return (
    <div>
      {/* content */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {categoryFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveCategory(f.key)}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150',
              activeCategory === f.key
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground mb-4 font-medium">
          {filtered.length} evento{filtered.length !== 1 ? 's' : ''} encontrado
          {filtered.length !== 1 ? 's' : ''}
        </p>
      )}
      {isLoading ? (
        <div className="card-base p-5">
          <p className="text-sm text-muted-foreground">Carregando timeline...</p>
        </div>
      ) : error ? (
        <div className="card-base p-5">
          <EmptyState icon={AlertTriangle} title="Erro ao carregar timeline" description={error} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-base p-5">
          <EmptyState
            icon={Clock}
            title="Nenhum evento nesta categoria"
            description="Selecione outra categoria ou aguarde novos eventos serem registrados."
          />
        </div>
      ) : (
        <div className="space-y-0">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-0.5 bg-muted rounded-full border border-border">
                  {formatDateLabel(group.label)}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="pl-1">
                {group.events.map((ev, i) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    isLast={i === group.events.length - 1 && group === groups[groups.length - 1]}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {!isLoading && !error && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-xs text-muted-foreground">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
