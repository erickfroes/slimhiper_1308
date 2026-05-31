'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  Users,
  Filter,
  Plus,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import type {
  AppointmentStatus,
  AppointmentSummary,
  AppointmentType,
  WaitingQueueEntry,
} from '@/domain/types';
import {
  getAgendaDay,
  getNextAppointmentStatus,
  updateAppointmentStatus,
} from '@/services/agendaApi';

// ─── WORKFLOW STAGES ──────────────────────────────────────────────────────────

interface WorkflowStage {
  key: AppointmentStatus;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
}

const workflowStages: WorkflowStage[] = [
  {
    key: 'agendado',
    label: 'Agendado',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    dotColor: 'bg-blue-500',
  },
  {
    key: 'chegou',
    label: 'Chegou',
    color: 'text-sky-700',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
    dotColor: 'bg-sky-500',
  },
  {
    key: 'triagem',
    label: 'Triagem',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    dotColor: 'bg-amber-500',
  },
  {
    key: 'medidas',
    label: 'Medidas',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    dotColor: 'bg-orange-500',
  },
  {
    key: 'bioimpedancia',
    label: 'Bioimpedância',
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
    dotColor: 'bg-cyan-500',
  },
  {
    key: 'aguardando_medico',
    label: 'Aguardando médico',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    dotColor: 'bg-purple-500',
  },
  {
    key: 'em_consulta',
    label: 'Consulta',
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    dotColor: 'bg-teal-500',
  },
  {
    key: 'checkout',
    label: 'Checkout',
    color: 'text-lime-700',
    bgColor: 'bg-lime-50',
    borderColor: 'border-lime-200',
    dotColor: 'bg-lime-500',
  },
  {
    key: 'concluido',
    label: 'Concluído',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
];

// ─── APPOINTMENT TYPE LABELS ──────────────────────────────────────────────────

const appointmentTypeLabel: Record<AppointmentType, string> = {
  consulta_medica: 'Consulta Médica',
  retorno: 'Retorno',
  nutricao: 'Nutrição',
  avaliacao_inicial: 'Avaliação Inicial',
  bioimpedancia: 'Bioimpedância',
  checkup: 'Checkup',
};

// ─── CALENDAR HELPERS ─────────────────────────────────────────────────────────

const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  agendado: 'Agendado',
  chegou: 'Chegou',
  triagem: 'Triagem',
  medidas: 'Medidas',
  bioimpedancia: 'Bioimpedância',
  aguardando_medico: 'Aguardando médico',
  em_consulta: 'Consulta',
  checkout: 'Checkout',
  concluido: 'Concluído',
  falta: 'Falta',
  cancelado: 'Cancelado',
};

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── MOCK CALENDAR EVENTS (days with appointments) ────────────────────────────

// ─── MINI CALENDAR ────────────────────────────────────────────────────────────

interface MiniCalendarProps {
  selectedDate: string;
  calendarEvents: Record<string, number>;
  onSelectDate: (date: string) => void;
}

function MiniCalendar({ selectedDate, calendarEvents, onSelectDate }: MiniCalendarProps) {
  const [selectedYear, selectedMonth] = selectedDate.split('-').map(Number);
  const [viewYear, setViewYear] = useState(selectedYear);
  const [viewMonth, setViewMonth] = useState(selectedMonth - 1);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const today = getLocalDateValue();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-foreground">
          {MONTHS_PT[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_PT.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const hasEvents = !!calendarEvents[dateStr];

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={[
                'relative flex flex-col items-center justify-center rounded-lg py-1 text-xs font-medium transition-all duration-150',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : isToday
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-foreground hover:bg-muted',
              ].join(' ')}
            >
              {day}
              {hasEvents && !isSelected && (
                <span
                  className={[
                    'w-1 h-1 rounded-full mt-0.5',
                    isToday ? 'bg-primary' : 'bg-muted-foreground/50',
                  ].join(' ')}
                />
              )}
              {hasEvents && isSelected && (
                <span className="w-1 h-1 rounded-full mt-0.5 bg-primary-foreground/60" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-primary/20 inline-block" />
          Hoje
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 inline-block" />
          Com consultas
        </span>
      </div>
    </div>
  );
}

// ─── WORKFLOW KANBAN COLUMN ───────────────────────────────────────────────────

interface KanbanColumnProps {
  stage: WorkflowStage;
  appointments: AppointmentSummary[];
  transitioningId: string | null;
  onAdvanceStatus: (appointment: AppointmentSummary) => void;
}

function KanbanColumn({
  stage,
  appointments,
  transitioningId,
  onAdvanceStatus,
}: KanbanColumnProps) {
  const items = appointments.filter((a) => a.status === stage.key);

  return (
    <div className="flex flex-col min-w-[200px] flex-1">
      {/* Column header */}
      <div
        className={[
          'flex items-center gap-2 px-3 py-2 rounded-xl border mb-2',
          stage.bgColor,
          stage.borderColor,
        ].join(' ')}
      >
        <span className={['w-2 h-2 rounded-full flex-shrink-0', stage.dotColor].join(' ')} />
        <span className={['text-xs font-semibold flex-1', stage.color].join(' ')}>
          {stage.label}
        </span>
        <span className={['text-xs font-bold tabular-nums', stage.color].join(' ')}>
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1">
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-6 rounded-xl border border-dashed border-border bg-muted/30">
            <span className="text-xs text-muted-foreground">Nenhum paciente</span>
          </div>
        ) : (
          items.map((appt) => {
            const nextStatus = getNextAppointmentStatus(appt.status);
            const isTransitioning = transitioningId === appt.id;

            return (
              <div
                key={appt.id}
                className="bg-card rounded-xl border border-border p-3 shadow-sm transition-all duration-150 group"
              >
                <Link
                  href={`/clinic/patients/${appt.patientId}/encounter`}
                  className="block hover:text-primary"
                >
                  {/* Patient name */}
                  <div className="flex items-start justify-between gap-1 mb-1.5">
                    <span className="text-xs font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                      {appt.patientName}
                    </span>
                    <ArrowRight
                      size={12}
                      className="text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>

                  {/* Type */}
                  <p className="text-xs text-muted-foreground mb-2 leading-tight">
                    {appointmentTypeLabel[appt.type]}
                  </p>

                  {/* Time + professional */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Clock size={10} className="flex-shrink-0" />
                    <span>
                      {new Date(appt.scheduledAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {appt.professionalName}
                  </div>

                  {/* Room */}
                  {appt.roomName && (
                    <div className="mt-1.5 text-xs text-muted-foreground/70 truncate">
                      {appt.roomName}
                    </div>
                  )}
                </Link>

                {nextStatus ? (
                  <button
                    type="button"
                    onClick={() => onAdvanceStatus(appt)}
                    disabled={isTransitioning}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    title={`Avançar para ${appointmentStatusLabel[nextStatus]}`}
                  >
                    <ArrowRight size={12} />
                    {isTransitioning
                      ? 'Atualizando...'
                      : `Avançar para ${appointmentStatusLabel[nextStatus]}`}
                  </button>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
                    Sem próxima etapa
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── DAY SCHEDULE LIST ────────────────────────────────────────────────────────

interface DayScheduleProps {
  appointments: AppointmentSummary[];
}

function DaySchedule({ appointments }: DayScheduleProps) {
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Agenda do Dia</span>
        </div>
        <span className="text-xs text-muted-foreground">{sorted.length} consultas</span>
      </div>

      <div className="divide-y divide-border">
        {sorted.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground">Nenhuma consulta para esta data.</p>
          </div>
        ) : (
          sorted.map((appt) => {
            const time = new Date(appt.scheduledAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <Link
                key={appt.id}
                href={`/clinic/patients/${appt.patientId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer group"
              >
                {/* Time */}
                <div className="w-12 flex-shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                  {time}
                </div>

                {/* Color bar */}
                <div className="w-0.5 h-8 rounded-full bg-primary/30 flex-shrink-0" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {appt.patientName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {appointmentTypeLabel[appt.type]} · {appt.professionalName}
                  </p>
                </div>

                {/* Status badge */}
                <StatusBadge status={appt.status} size="xs" />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── WAITING QUEUE PANEL ──────────────────────────────────────────────────────

interface WaitingQueuePanelProps {
  queue: WaitingQueueEntry[];
  isLoading: boolean;
  onRefresh: () => void;
}

function WaitingQueuePanel({ queue, isLoading, onRefresh }: WaitingQueuePanelProps) {
  const activeStatuses: AppointmentStatus[] = [
    'triagem',
    'medidas',
    'bioimpedancia',
    'aguardando_medico',
    'em_consulta',
    'checkout',
  ];
  const activeQueue = queue.filter((entry) => activeStatuses.includes(entry.status));
  const waiting = queue.filter((entry) => entry.status === 'agendado' || entry.status === 'chegou');

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Fila de Espera</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
            {activeQueue.length} ativos
          </span>
          <button
            onClick={onRefresh}
            className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : undefined} />
          </button>
        </div>
      </div>

      {/* Active patients */}
      {activeQueue.length > 0 && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Em atendimento
          </p>
          <div className="flex flex-col gap-2">
            {activeQueue.map((entry) => (
              <Link
                key={entry.id}
                href={`/clinic/patients/${entry.patientId}/encounter`}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border hover:border-primary/30 transition-colors cursor-pointer"
              >
                {/* Avatar placeholder */}
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {entry.patientName
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {entry.patientName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{entry.professionalName}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={entry.status} size="xs" />
                  {entry.waitingMinutes > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {entry.waitingMinutes}min
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Waiting / scheduled */}
      {waiting.length > 0 && (
        <div className="px-4 pt-3 pb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Aguardando chegada
          </p>
          <div className="flex flex-col gap-2">
            {waiting.map((entry) => (
              <Link
                key={entry.id}
                href={`/clinic/patients/${entry.patientId}`}
                className="flex items-center gap-3 p-2.5 rounded-xl border border-dashed border-border hover:border-primary/30 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-muted-foreground">
                    {entry.patientName
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {entry.patientName}
                  </p>
                  <p className="text-xs text-muted-foreground">{entry.scheduledTime}</p>
                </div>
                <StatusBadge status={entry.status} size="xs" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {!isLoading && activeQueue.length === 0 && waiting.length === 0 && (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-muted-foreground">Nenhum paciente na fila.</p>
        </div>
      )}
    </div>
  );
}

// ─── WORKFLOW PROGRESS BAR ────────────────────────────────────────────────────

function WorkflowProgressBar({ appointments }: { appointments: AppointmentSummary[] }) {
  const total = appointments.length;
  const concluded = appointments.filter((a) => a.status === 'concluido').length;
  const inProgress = appointments.filter((a) =>
    [
      'chegou',
      'triagem',
      'medidas',
      'bioimpedancia',
      'aguardando_medico',
      'em_consulta',
      'checkout',
    ].includes(a.status)
  ).length;
  const scheduled = appointments.filter((a) => a.status === 'agendado').length;
  const absent = appointments.filter((a) => ['falta', 'cancelado'].includes(a.status)).length;
  const percent = (value: number) => (total > 0 ? `${(value / total) * 100}%` : '0%');

  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">Progresso do Dia</span>
        <span className="text-xs text-muted-foreground">
          {concluded}/{total} concluídas
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted gap-0.5 mb-3">
        {total === 0 ? <div className="w-full bg-muted" /> : null}
        {concluded > 0 && (
          <div
            className="bg-emerald-500 rounded-full transition-all"
            style={{ width: percent(concluded) }}
          />
        )}
        {inProgress > 0 && (
          <div
            className="bg-teal-400 rounded-full transition-all"
            style={{ width: percent(inProgress) }}
          />
        )}
        {scheduled > 0 && (
          <div
            className="bg-blue-300 rounded-full transition-all"
            style={{ width: percent(scheduled) }}
          />
        )}
        {absent > 0 && (
          <div
            className="bg-red-400 rounded-full transition-all"
            style={{ width: percent(absent) }}
          />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Concluídas', value: concluded, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Em andamento', value: inProgress, color: 'text-teal-600', bg: 'bg-teal-50' },
          { label: 'Agendadas', value: scheduled, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Faltas/Cancel.', value: absent, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((stat) => (
          <div key={stat.label} className={['rounded-xl p-2 text-center', stat.bg].join(' ')}>
            <p className={['text-lg font-bold tabular-nums', stat.color].join(' ')}>{stat.value}</p>
            <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN CONTENT ─────────────────────────────────────────────────────────────

export default function AgendaContent() {
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateValue());
  const [activeView, setActiveView] = useState<'kanban' | 'lista'>('kanban');
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [waitingQueue, setWaitingQueue] = useState<WaitingQueueEntry[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  const loadAgenda = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await getAgendaDay(selectedDate);
      setAppointments(data.appointments);
      setWaitingQueue(data.waitingQueue);
      setCalendarEvents(data.calendarEvents);
    } catch (error) {
      setAppointments([]);
      setWaitingQueue([]);
      setCalendarEvents({});
      setLoadError(error instanceof Error ? error.message : 'Erro ao carregar agenda.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadAgenda();
  }, [loadAgenda]);

  const handleAdvanceStatus = useCallback(
    async (appointment: AppointmentSummary) => {
      const nextStatus = getNextAppointmentStatus(appointment.status);
      if (!nextStatus) return;

      setTransitioningId(appointment.id);
      setLoadError(null);

      try {
        await updateAppointmentStatus(appointment.id, nextStatus);
        await loadAgenda();
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível atualizar o status da consulta.'
        );
      } finally {
        setTransitioningId(null);
      }
    },
    [loadAgenda]
  );

  const formattedDate = (() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  })();

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Page header */}
      <PageHeader
        title="Agenda e Fila"
        subtitle={
          isLoading
            ? `${formattedDate} - carregando`
            : `${formattedDate} - ${appointments.length} consultas`
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              title="Filtros avançados entram junto do contrato real de agenda."
              className="btn-ghost flex items-center gap-1.5 text-sm px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Filter size={14} />
              Filtrar
            </button>
            <button
              type="button"
              disabled
              title="Criação de consulta depende do service real de CRUD."
              className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5"
            >
              <Plus size={14} />
              Nova Consulta
            </button>
          </div>
        }
      />

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Não foi possível concluir a operação da agenda. {loadError}</span>
            <button
              type="button"
              onClick={loadAgenda}
              disabled={isLoading}
              className="btn-secondary text-xs disabled:opacity-60"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : undefined} />
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex gap-5 items-start">
        {/* LEFT COLUMN: Calendar + Queue */}
        <div className="flex flex-col gap-4 w-64 flex-shrink-0">
          <MiniCalendar
            selectedDate={selectedDate}
            calendarEvents={calendarEvents}
            onSelectDate={setSelectedDate}
          />
          <WaitingQueuePanel queue={waitingQueue} isLoading={isLoading} onRefresh={loadAgenda} />
        </div>

        {/* RIGHT COLUMN: Workflow + Schedule */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Progress bar */}
          <WorkflowProgressBar appointments={appointments} />

          {/* View toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
              <button
                onClick={() => setActiveView('kanban')}
                className={[
                  'text-xs font-medium px-3 py-1.5 rounded-lg transition-all',
                  activeView === 'kanban'
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                Fluxo Clínico
              </button>
              <button
                onClick={() => setActiveView('lista')}
                className={[
                  'text-xs font-medium px-3 py-1.5 rounded-lg transition-all',
                  activeView === 'lista'
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                Lista do Dia
              </button>
            </div>

            {/* Stage legend */}
            <div className="hidden xl:flex items-center gap-2 flex-wrap">
              {workflowStages.map((stage, i) => (
                <React.Fragment key={stage.key}>
                  <span
                    className={[
                      'flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border',
                      stage.bgColor,
                      stage.color,
                      stage.borderColor,
                    ].join(' ')}
                  >
                    <span className={['w-1.5 h-1.5 rounded-full', stage.dotColor].join(' ')} />
                    {stage.label}
                  </span>
                  {i < workflowStages.length - 1 && (
                    <ArrowRight size={10} className="text-muted-foreground/40 flex-shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Kanban / List view */}
          {activeView === 'kanban' ? (
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3 min-w-max">
                {workflowStages.map((stage) => (
                  <KanbanColumn
                    key={stage.key}
                    stage={stage}
                    appointments={appointments}
                    transitioningId={transitioningId}
                    onAdvanceStatus={handleAdvanceStatus}
                  />
                ))}
              </div>
            </div>
          ) : (
            <DaySchedule appointments={appointments} />
          )}
        </div>
      </div>
    </div>
  );
}
