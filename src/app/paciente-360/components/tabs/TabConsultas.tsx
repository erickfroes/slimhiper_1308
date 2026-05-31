'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { AppointmentSummary } from '@/domain/types';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { getPatientAppointments } from '@/services/agendaApi';
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  User,
  Video,
  XCircle,
} from 'lucide-react';

const apptTypeLabel: Record<string, string> = {
  consulta_medica: 'Consulta medica',
  retorno: 'Retorno',
  nutricao: 'Nutricao',
  avaliacao_inicial: 'Avaliacao inicial',
  bioimpedancia: 'Bioimpedancia',
  checkup: 'Check-up',
};

interface TabConsultasProps {
  patientId: string;
  initialAppointments: AppointmentSummary[];
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace('.', '');
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('pt-BR', { day: '2-digit' });
}

function formatMonth(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

function isOverdueReturn(recommendedReturn: string) {
  return new Date(recommendedReturn) < new Date();
}

function DisabledActionButton({
  children,
  variant = 'secondary',
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'link' | 'icon';
}) {
  const className = {
    primary: 'btn-primary text-xs flex items-center gap-1.5',
    secondary: 'btn-secondary text-xs flex items-center gap-1.5',
    danger:
      'text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600',
    link: 'mt-2 text-xs font-medium text-amber-700 underline underline-offset-2 flex items-center gap-1',
    icon: 'p-1.5 rounded-lg text-muted-foreground',
  }[variant];

  return (
    <button
      type="button"
      disabled
      title="Acao bloqueada ate contrato real de criar, editar ou cancelar consulta."
      className={`${className} cursor-not-allowed opacity-55`}
    >
      {children}
    </button>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card-base p-5 space-y-3">
      <div
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
      >
        <RefreshCw size={14} />
        Tentar novamente
      </button>
    </div>
  );
}

function AppointmentDateBadge({ scheduledAt }: { scheduledAt: string }) {
  return (
    <div className="w-12 h-12 rounded-xl bg-primary/10 flex flex-col items-center justify-center flex-shrink-0">
      <span className="text-sm font-bold text-primary">{formatDay(scheduledAt)}</span>
      <span className="text-xs text-primary font-medium capitalize">
        {formatMonth(scheduledAt)}
      </span>
    </div>
  );
}

function UpcomingCard({ appt }: { appt: AppointmentSummary }) {
  return (
    <div className="card-base p-4 flex items-center gap-4">
      <AppointmentDateBadge scheduledAt={appt.scheduledAt} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">
            {apptTypeLabel[appt.type] ?? appt.type}
          </span>
          <StatusBadge status={appt.status} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          <Clock size={11} className="inline mr-1" />
          {formatTime(appt.scheduledAt)}
          {' - '}
          <User size={11} className="inline mr-1" />
          {appt.professionalName}
          {appt.roomName && (
            <>
              <MapPin size={11} className="inline mx-1" />
              {appt.roomName}
            </>
          )}
        </p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {appt.attendanceLink && (
          <a
            href={appt.attendanceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
            title="Link para atendimento"
          >
            <Video size={14} />
          </a>
        )}
        <DisabledActionButton variant="icon">
          <RefreshCw size={14} />
        </DisabledActionButton>
        <DisabledActionButton variant="icon">
          <XCircle size={14} />
        </DisabledActionButton>
      </div>
    </div>
  );
}

function PastCard({ appt }: { appt: AppointmentSummary }) {
  const isCancelled = appt.status === 'cancelado';
  const isNoShow = appt.status === 'falta';

  return (
    <div
      className={`card-base p-4 flex items-start gap-4 ${
        isCancelled || isNoShow ? 'opacity-75' : 'opacity-90'
      }`}
    >
      <AppointmentDateBadge scheduledAt={appt.scheduledAt} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-semibold text-foreground">
            {apptTypeLabel[appt.type] ?? appt.type}
          </span>
          <StatusBadge status={appt.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          <User size={11} className="inline mr-1" />
          {appt.professionalName} ({appt.professionalRole})
          {appt.roomName && (
            <>
              <MapPin size={11} className="inline mx-1" />
              {appt.roomName}
            </>
          )}
        </p>
        {appt.notes && <p className="text-xs text-muted-foreground mt-1 italic">{appt.notes}</p>}
        {appt.recommendedReturn && (
          <p
            className={`text-xs mt-1 flex items-center gap-1 ${
              isOverdueReturn(appt.recommendedReturn)
                ? 'text-amber-600 font-medium'
                : 'text-muted-foreground'
            }`}
          >
            <RotateCcw size={11} />
            Retorno recomendado: {formatDate(appt.recommendedReturn)}
            {isOverdueReturn(appt.recommendedReturn) && ' - em atraso'}
          </p>
        )}
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <DisabledActionButton variant="icon">
          <Eye size={14} />
        </DisabledActionButton>
        <DisabledActionButton variant="icon">
          <RotateCcw size={14} />
        </DisabledActionButton>
      </div>
    </div>
  );
}

export default function TabConsultas({ patientId, initialAppointments }: TabConsultasProps) {
  const [showAllPast, setShowAllPast] = useState(false);
  const [appointments, setAppointments] = useState<AppointmentSummary[]>(initialAppointments);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await getPatientAppointments(patientId);
      if (error) {
        setAppointments([]);
        setLoadError(error.message);
        return;
      }
      setAppointments(data);
    } catch (error) {
      setAppointments([]);
      setLoadError(
        error instanceof Error ? error.message : 'Falha inesperada ao carregar consultas.'
      );
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  if (loading) {
    return (
      <div className="card-base p-5">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin text-primary" />
          Carregando consultas do paciente...
        </div>
      </div>
    );
  }

  if (loadError) {
    return <LoadError message={loadError} onRetry={() => void loadAppointments()} />;
  }

  const upcoming = appointments
    .filter((appointment) => ['agendado', 'chegou', 'triagem'].includes(appointment.status))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const past = appointments
    .filter((appointment) => ['concluido', 'falta', 'cancelado'].includes(appointment.status))
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  const noShows = past.filter((appointment) => appointment.status === 'falta');
  const cancellations = past.filter((appointment) => appointment.status === 'cancelado');
  const overdueReturns = appointments.filter(
    (appointment) =>
      appointment.recommendedReturn &&
      isOverdueReturn(appointment.recommendedReturn) &&
      appointment.status !== 'agendado'
  );
  const nextAppt = upcoming[0];
  const visiblePast = showAllPast ? past : past.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Consultas</h3>
        <DisabledActionButton variant="primary">
          <Plus size={13} />
          Novo agendamento
        </DisabledActionButton>
      </div>

      {overdueReturns.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Paciente com retorno atrasado</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {overdueReturns.length === 1
                ? `Retorno recomendado para ${formatDate(
                    overdueReturns[0].recommendedReturn!
                  )} nao foi agendado.`
                : `${overdueReturns.length} retornos recomendados estao em atraso.`}
            </p>
            <DisabledActionButton variant="link">
              <RotateCcw size={12} />
              Criar retorno
            </DisabledActionButton>
          </div>
        </div>
      )}

      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Proxima consulta
        </p>

        {!nextAppt ? (
          <EmptyState
            icon={CalendarDays}
            title="Sem consultas futuras"
            description="Nenhuma consulta agendada. Agende a proxima para manter o acompanhamento em dia."
            action={
              <DisabledActionButton variant="primary">
                <Plus size={14} />
                Novo agendamento
              </DisabledActionButton>
            }
          />
        ) : (
          <div className="card-base p-5 border-l-4 border-l-primary">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-primary leading-none">
                  {formatDay(nextAppt.scheduledAt)}
                </span>
                <span className="text-xs text-primary font-medium capitalize">
                  {formatMonth(nextAppt.scheduledAt)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-foreground">
                    {apptTypeLabel[nextAppt.type] ?? nextAppt.type}
                  </span>
                  <StatusBadge status={nextAppt.status} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {formatTime(nextAppt.scheduledAt)} - {nextAppt.durationMinutes} min
                  </span>
                  <span className="flex items-center gap-1">
                    <User size={12} />
                    {nextAppt.professionalName} ({nextAppt.professionalRole})
                  </span>
                  {nextAppt.roomName && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} />
                      {nextAppt.roomName}
                    </span>
                  )}
                </div>
                {nextAppt.notes && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{nextAppt.notes}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
              {nextAppt.attendanceLink && (
                <a
                  href={nextAppt.attendanceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary text-xs flex items-center gap-1.5"
                >
                  <Video size={13} />
                  Link para atendimento
                </a>
              )}
              <DisabledActionButton>
                <RefreshCw size={13} />
                Reagendar
              </DisabledActionButton>
              <DisabledActionButton variant="danger">
                <XCircle size={13} />
                Cancelar
              </DisabledActionButton>
              <DisabledActionButton>
                <RotateCcw size={13} />
                Criar retorno
              </DisabledActionButton>
            </div>
          </div>
        )}
      </section>

      {upcoming.length > 1 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Proximas consultas ({upcoming.length - 1})
          </p>
          <div className="space-y-2">
            {upcoming.slice(1).map((appt) => (
              <UpcomingCard key={appt.id} appt={appt} />
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Consultas passadas ({past.length})
        </p>

        {past.length === 0 ? (
          <div className="card-base p-6 text-center">
            <Calendar size={28} className="mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma consulta registrada</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {visiblePast.map((appt) => (
                <PastCard key={appt.id} appt={appt} />
              ))}
            </div>
            {past.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllPast((value) => !value)}
                className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors"
              >
                {showAllPast ? (
                  <>
                    <ChevronUp size={14} /> Mostrar menos
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} /> Ver todas ({past.length - 3} mais)
                  </>
                )}
              </button>
            )}
          </>
        )}
      </section>

      {(noShows.length > 0 || cancellations.length > 0) && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Faltas e cancelamentos
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="card-base p-4 text-center">
              <p className="text-2xl font-bold text-red-500">{noShows.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Faltas</p>
            </div>
            <div className="card-base p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{cancellations.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Cancelamentos</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
