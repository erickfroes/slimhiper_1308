'use client';

import React, { useState } from 'react';
import type { AppointmentSummary } from '@/domain/types';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import {
  CalendarDays,
  Plus,
  Clock,
  User,
  MapPin,
  Video,
  RefreshCw,
  XCircle,
  Eye,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Calendar,
} from 'lucide-react';

const apptTypeLabel: Record<string, string> = {
  consulta_medica: 'Consulta Médica',
  retorno: 'Retorno',
  nutricao: 'Nutrição',
  avaliacao_inicial: 'Avaliação Inicial',
  bioimpedancia: 'Bioimpedância',
  checkup: 'Check-up',
};

interface TabConsultasProps {
  appointments: AppointmentSummary[];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit' });
}

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

export default function TabConsultas({ appointments }: TabConsultasProps) {
  const [showAllPast, setShowAllPast] = useState(false);

  const upcoming = appointments
    .filter((a) => ['agendado', 'chegou', 'triagem'].includes(a.status))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const past = appointments
    .filter((a) => ['concluido', 'falta', 'cancelado'].includes(a.status))
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  const noShows = past.filter((a) => a.status === 'falta');
  const cancellations = past.filter((a) => a.status === 'cancelado');

  const overdueReturns = appointments.filter(
    (a) => a.recommendedReturn && isOverdueReturn(a.recommendedReturn) && a.status !== 'agendado'
  );

  const nextAppt = upcoming[0];
  const visiblePast = showAllPast ? past : past.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Consultas</h3>
        <button className="btn-primary text-xs flex items-center gap-1.5">
          <Plus size={13} />
          Novo agendamento
        </button>
      </div>

      {/* ── Alerta: retorno atrasado ────────────────────────────────────── */}
      {overdueReturns.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20 p-4 flex gap-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Paciente com retorno atrasado
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {overdueReturns.length === 1
                ? `Retorno recomendado para ${formatDate(overdueReturns[0].recommendedReturn!)} não foi agendado.`
                : `${overdueReturns.length} retornos recomendados estão em atraso.`}
            </p>
            <button className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300 underline underline-offset-2 hover:no-underline flex items-center gap-1">
              <RotateCcw size={12} />
              Criar retorno
            </button>
          </div>
        </div>
      )}

      {/* ── Próxima consulta ────────────────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Próxima consulta
        </p>

        {!nextAppt ? (
          <EmptyState
            icon={CalendarDays}
            title="Sem consultas futuras"
            description="Nenhuma consulta agendada. Agende a próxima para manter o acompanhamento em dia."
            action={
              <button className="btn-primary text-sm flex items-center gap-1.5">
                <Plus size={14} />
                Novo agendamento
              </button>
            }
          />
        ) : (
          <div className="card-base p-5 border-l-4 border-l-primary">
            <div className="flex items-start gap-4">
              {/* Date badge */}
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-primary leading-none">{formatDay(nextAppt.scheduledAt)}</span>
                <span className="text-xs text-primary font-medium capitalize">{formatMonth(nextAppt.scheduledAt)}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-foreground">{apptTypeLabel[nextAppt.type]}</span>
                  <StatusBadge status={nextAppt.status} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock size={12} />{formatTime(nextAppt.scheduledAt)} · {nextAppt.durationMinutes} min</span>
                  <span className="flex items-center gap-1"><User size={12} />{nextAppt.professionalName} ({nextAppt.professionalRole})</span>
                  {nextAppt.roomName && (
                    <span className="flex items-center gap-1"><MapPin size={12} />{nextAppt.roomName}</span>
                  )}
                </div>
                {nextAppt.recommendedReturn && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <RotateCcw size={11} />
                    Retorno recomendado: {formatDate(nextAppt.recommendedReturn)}
                  </p>
                )}
                {nextAppt.notes && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{nextAppt.notes}</p>
                )}
              </div>
            </div>

            {/* Actions */}
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
              <button className="btn-secondary text-xs flex items-center gap-1.5">
                <RefreshCw size={13} />
                Reagendar
              </button>
              <button className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors">
                <XCircle size={13} />
                Cancelar
              </button>
              <button className="btn-secondary text-xs flex items-center gap-1.5">
                <RotateCcw size={13} />
                Criar retorno
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Outras consultas agendadas ──────────────────────────────────── */}
      {upcoming.length > 1 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Próximas consultas ({upcoming.length - 1})
          </p>
          <div className="space-y-2">
            {upcoming.slice(1).map((appt) => (
              <UpcomingCard key={appt.id} appt={appt} />
            ))}
          </div>
        </section>
      )}

      {/* ── Consultas passadas ──────────────────────────────────────────── */}
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
                onClick={() => setShowAllPast((v) => !v)}
                className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors"
              >
                {showAllPast ? (
                  <><ChevronUp size={14} /> Mostrar menos</>
                ) : (
                  <><ChevronDown size={14} /> Ver todas ({past.length - 3} mais)</>
                )}
              </button>
            )}
          </>
        )}
      </section>

      {/* ── No-shows & Cancelamentos ────────────────────────────────────── */}
      {(noShows.length > 0 || cancellations.length > 0) && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            No-shows &amp; Cancelamentos
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="card-base p-4 text-center">
              <p className="text-2xl font-bold text-red-500">{noShows.length}</p>
              <p className="text-xs text-muted-foreground mt-1">No-show(s)</p>
            </div>
            <div className="card-base p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{cancellations.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Cancelamento(s)</p>
            </div>
          </div>
          {noShows.length > 0 && (
            <div className="mt-2 space-y-1">
              {noShows.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                  <span>{formatDate(a.scheduledAt)} — {apptTypeLabel[a.type]} com {a.professionalName}</span>
                  {a.notes && <span className="italic truncate">· {a.notes}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function UpcomingCard({ appt }: { appt: AppointmentSummary }) {
  return (
    <div className="card-base p-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex flex-col items-center justify-center flex-shrink-0">
        <span className="text-sm font-bold text-primary">{formatDay(appt.scheduledAt)}</span>
        <span className="text-xs text-primary font-medium capitalize">{formatMonth(appt.scheduledAt)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{apptTypeLabel[appt.type]}</span>
          <StatusBadge status={appt.status} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          <Clock size={11} className="inline mr-1" />{formatTime(appt.scheduledAt)}
          {' · '}<User size={11} className="inline mr-1" />{appt.professionalName}
          {appt.roomName && <><MapPin size={11} className="inline mx-1" />{appt.roomName}</>}
        </p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {appt.attendanceLink && (
          <a href={appt.attendanceLink} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors" title="Link para atendimento">
            <Video size={14} />
          </a>
        )}
        <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" title="Reagendar">
          <RefreshCw size={14} />
        </button>
        <button className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors" title="Cancelar">
          <XCircle size={14} />
        </button>
      </div>
    </div>
  );
}

function PastCard({ appt }: { appt: AppointmentSummary }) {
  const isCancelled = appt.status === 'cancelado';
  const isNoShow = appt.status === 'falta';

  return (
    <div className={`card-base p-4 flex items-start gap-4 ${isCancelled || isNoShow ? 'opacity-75' : 'opacity-90'}`}>
      <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
        isCancelled ? 'bg-amber-100 dark:bg-amber-900/30' : isNoShow ?'bg-red-100 dark:bg-red-900/30': 'bg-muted'
      }`}>
        <span className={`text-sm font-bold ${
          isCancelled ? 'text-amber-600 dark:text-amber-400' : isNoShow ?'text-red-600 dark:text-red-400': 'text-muted-foreground'
        }`}>{formatDay(appt.scheduledAt)}</span>
        <span className={`text-xs font-medium capitalize ${
          isCancelled ? 'text-amber-500 dark:text-amber-400' : isNoShow ?'text-red-500 dark:text-red-400': 'text-muted-foreground'
        }`}>{formatMonth(appt.scheduledAt)}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-semibold text-foreground">{apptTypeLabel[appt.type]}</span>
          <StatusBadge status={appt.status} />
          {isCancelled && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">
              Consulta cancelada
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          <User size={11} className="inline mr-1" />{appt.professionalName} ({appt.professionalRole})
          {appt.roomName && <><MapPin size={11} className="inline mx-1" />{appt.roomName}</>}
        </p>
        {appt.notes && <p className="text-xs text-muted-foreground mt-1 italic">{appt.notes}</p>}
        {appt.recommendedReturn && (
          <p className={`text-xs mt-1 flex items-center gap-1 ${
            isOverdueReturn(appt.recommendedReturn)
              ? 'text-amber-600 dark:text-amber-400 font-medium' :'text-muted-foreground'
          }`}>
            <RotateCcw size={11} />
            Retorno recomendado: {formatDate(appt.recommendedReturn)}
            {isOverdueReturn(appt.recommendedReturn) && ' · Em atraso'}
          </p>
        )}
      </div>

      <div className="flex gap-1.5 flex-shrink-0">
        <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" title="Ver atendimento">
          <Eye size={14} />
        </button>
        <button className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors" title="Criar retorno">
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
}

function isOverdueReturn(recommendedReturn: string) {
  return new Date(recommendedReturn) < new Date();
}
