'use client';

import React from 'react';
import type { AppointmentSummary } from '@/domain/types';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { CalendarDays, Plus } from 'lucide-react';

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

export default function TabConsultas({ appointments }: TabConsultasProps) {
  const upcoming = appointments.filter((a) => ['agendado', 'chegou', 'triagem'].includes(a.status));
  const past = appointments.filter((a) => ['concluido', 'falta', 'cancelado'].includes(a.status));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Consultas Agendadas ({upcoming.length})</p>
        <button className="btn-primary text-xs">
          <Plus size={13} />
          Agendar Consulta
        </button>
      </div>

      {upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhuma consulta agendada"
          description="Agende a próxima consulta para manter o acompanhamento do paciente em dia."
          action={<button className="btn-primary text-sm"><Plus size={14} /> Agendar Consulta</button>}
        />
      ) : (
        <div className="space-y-3">
          {upcoming.map((appt) => (
            <div key={appt.id} className="card-base p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">
                  {new Date(appt.scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit' })}
                </span>
                <span className="text-xs text-primary font-medium">
                  {new Date(appt.scheduledAt).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{apptTypeLabel[appt.type]}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(appt.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' · '}{appt.professionalName} · {appt.roomName}
                </p>
                {appt.notes && <p className="text-xs text-muted-foreground mt-1 italic">{appt.notes}</p>}
              </div>
              <StatusBadge status={appt.status} />
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <p className="text-sm font-semibold text-foreground mt-4">Histórico ({past.length})</p>
          <div className="space-y-2">
            {past.map((appt) => (
              <div key={appt.id} className="card-base p-4 flex items-center gap-4 opacity-80">
                <div className="w-12 h-12 rounded-xl bg-muted flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-muted-foreground">
                    {new Date(appt.scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit' })}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    {new Date(appt.scheduledAt).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{apptTypeLabel[appt.type]}</p>
                  <p className="text-xs text-muted-foreground">{appt.professionalName} · {appt.roomName}</p>
                  {appt.notes && <p className="text-xs text-muted-foreground mt-1 italic">{appt.notes}</p>}
                </div>
                <StatusBadge status={appt.status} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}