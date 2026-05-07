'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Scale, Target, Activity, AlertTriangle, CheckSquare, Clock, Calendar, FileText, DollarSign, Stethoscope, TrendingUp,  } from 'lucide-react';
import type { Patient360Summary } from '@/domain/types';
import AlertPanel from '@/components/AlertPanel';
import TimelineEventCard from '@/components/TimelineEventCard';
import FinancialStatusCard from '@/components/FinancialStatusCard';
import PackageProgressCard from '@/components/PackageProgressCard';
import StatusBadge from '@/components/StatusBadge';
import Icon from '@/components/ui/AppIcon';


const WeightEvolutionChart = dynamic(() => import('@/components/charts/WeightEvolutionChart'), { ssr: false });
const AdherenceChart = dynamic(() => import('@/components/charts/AdherenceChart'), { ssr: false });

// ─── Metric mini card ─────────────────────────────────────────────────────────

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  bg?: string;
}

function MetricCard({ icon: Icon, label, value, sub, color = 'text-primary', bg = 'bg-primary/10' }: MetricCardProps) {
  return (
    <div className="card-base p-4 flex items-start gap-3">
      <div className={['w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', bg].join(' ')}>
        <Icon size={16} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-foreground tabular-nums mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Task item ────────────────────────────────────────────────────────────────

function TaskItem({ task }: { task: Patient360Summary['tasks'][0] }) {
  const priorityColor = {
    alta: 'bg-red-50 border-red-200 text-red-700',
    media: 'bg-amber-50 border-amber-200 text-amber-700',
    baixa: 'bg-slate-50 border-slate-200 text-slate-600',
  }[task.priority];

  return (
    <div className={['flex items-start gap-3 p-3 rounded-xl border', task.isCompleted ? 'opacity-50 bg-muted/30' : 'bg-card border-border'].join(' ')}>
      <div className={['w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5', task.isCompleted ? 'bg-positive border-positive' : 'border-border'].join(' ')} />
      <div className="flex-1 min-w-0">
        <p className={['text-sm font-medium', task.isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'].join(' ')}>
          {task.title}
        </p>
        {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
        <div className="flex items-center gap-2 mt-1.5">
          <span className={['text-xs font-medium px-1.5 py-0.5 rounded-full border', priorityColor].join(' ')}>
            {task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Média' : 'Baixa'}
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock size={10} />
            Vence {task.dueDate}
          </span>
          {task.assignedTo && (
            <span className="text-xs text-muted-foreground">· {task.assignedTo}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Appointment mini card ────────────────────────────────────────────────────

const apptTypeLabel: Record<string, string> = {
  consulta_medica: 'Consulta Médica',
  retorno: 'Retorno',
  nutricao: 'Nutrição',
  avaliacao_inicial: 'Avaliação Inicial',
  bioimpedancia: 'Bioimpedância',
  checkup: 'Check-up',
};

// ─── Main Tab ─────────────────────────────────────────────────────────────────

interface TabResumoProps {
  data: Patient360Summary;
}

export default function TabResumo({ data }: TabResumoProps) {
  const { clinicalStatus, alerts, tasks, upcomingAppointments, recentTimeline, financial, activePackage, documents } = data;

  const pendingTasks = tasks.filter((t) => !t.isCompleted);
  const completedTasks = tasks.filter((t) => t.isCompleted);

  // KPI derived values
  const pendingDocs = documents.filter((d) => d.status === 'pendente_assinatura' || d.status === 'em_analise').length;
  const completedConsultations = upcomingAppointments.filter((a) => a.status === 'concluido').length;
  const programProgressLabel = `Sem. ${activePackage.currentWeek} / ${activePackage.totalWeeks}`;
  const bmiCategory =
    clinicalStatus.currentBmi < 18.5
      ? 'Abaixo do peso'
      : clinicalStatus.currentBmi < 25
      ? 'Normal'
      : clinicalStatus.currentBmi < 30
      ? 'Sobrepeso' :'Obesidade';
  const adherenceColor =
    clinicalStatus.adherenceLevel === 'critico' ?'text-negative'
      : clinicalStatus.adherenceLevel === 'excelente' ?'text-positive'
      : clinicalStatus.adherenceLevel === 'bom' ?'text-teal-600' :'text-amber-600';
  const adherenceBg =
    clinicalStatus.adherenceLevel === 'critico' ?'bg-red-50'
      : clinicalStatus.adherenceLevel === 'excelente' ?'bg-emerald-50'
      : clinicalStatus.adherenceLevel === 'bom' ?'bg-teal-50' :'bg-amber-50';
  const financialColor =
    financial.status === 'em_dia' ?'text-positive'
      : financial.status === 'inadimplente' ?'text-negative' :'text-amber-600';
  const financialBg =
    financial.status === 'em_dia' ?'bg-emerald-50'
      : financial.status === 'inadimplente' ?'bg-red-50' :'bg-amber-50';
  const financialLabel =
    financial.status === 'em_dia' ? 'Em dia' : financial.status === 'inadimplente' ? 'Inadimplente' : 'Pendente';
  const saldoAberto = financial.totalPending + financial.totalOverdue;

  return (
    <div className="space-y-5">
      {/* Row 1: 8 compact KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Peso atual */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Scale size={12} className="text-primary" />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">Peso Atual</p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">{clinicalStatus.currentWeightKg} <span className="text-xs font-normal text-muted-foreground">kg</span></p>
          <p className="text-[10px] text-muted-foreground leading-tight">↓ {clinicalStatus.weightLostKg} kg perdidos</p>
        </div>

        {/* Meta de peso */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <Target size={12} className="text-indigo-600" />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">Meta Peso</p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">{clinicalStatus.goalWeightKg} <span className="text-xs font-normal text-muted-foreground">kg</span></p>
          <p className="text-[10px] text-muted-foreground leading-tight">Faltam {clinicalStatus.weightToGoKg} kg</p>
        </div>

        {/* Evolução no programa */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={12} className="text-teal-600" />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">Evolução</p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">{clinicalStatus.progressPercent}<span className="text-xs font-normal text-muted-foreground">%</span></p>
          <p className="text-[10px] text-muted-foreground leading-tight">{programProgressLabel} do programa</p>
        </div>

        {/* IMC */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
              <Activity size={12} className="text-violet-600" />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">IMC</p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">{clinicalStatus.currentBmi}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">{bmiCategory}</p>
        </div>

        {/* Adesão semanal */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className={['w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0', adherenceBg].join(' ')}>
              <CheckSquare size={12} className={adherenceColor} />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">Adesão</p>
          </div>
          <p className={['text-lg font-bold tabular-nums leading-tight', adherenceColor].join(' ')}>{clinicalStatus.weeklyAdherencePercent}<span className="text-xs font-normal text-muted-foreground">%</span></p>
          <p className="text-[10px] text-muted-foreground leading-tight capitalize">{clinicalStatus.adherenceLevel} · meta 80%</p>
        </div>

        {/* Consultas realizadas */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-sky-50 flex items-center justify-center flex-shrink-0">
              <Stethoscope size={12} className="text-sky-600" />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">Consultas</p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">{activePackage.usedConsultations}<span className="text-xs font-normal text-muted-foreground">/{activePackage.totalConsultations}</span></p>
          <p className="text-[10px] text-muted-foreground leading-tight">{activePackage.totalConsultations - activePackage.usedConsultations} restantes</p>
        </div>

        {/* Documentos pendentes */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className={['w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0', pendingDocs > 0 ? 'bg-amber-50' : 'bg-slate-50'].join(' ')}>
              <FileText size={12} className={pendingDocs > 0 ? 'text-amber-600' : 'text-slate-500'} />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">Documentos</p>
          </div>
          <p className={['text-lg font-bold tabular-nums leading-tight', pendingDocs > 0 ? 'text-amber-600' : 'text-foreground'].join(' ')}>{pendingDocs}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">{pendingDocs > 0 ? 'Aguardando ação' : 'Nenhum pendente'}</p>
        </div>

        {/* Saldo em aberto */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className={['w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0', financialBg].join(' ')}>
              <DollarSign size={12} className={financialColor} />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">Saldo Aberto</p>
          </div>
          <p className={['text-lg font-bold tabular-nums leading-tight', financialColor].join(' ')}>
            R$ {saldoAberto.toLocaleString('pt-BR')}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">{financialLabel}</p>
        </div>
      </div>

      {/* Row 2: Weight chart + Adherence chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-base p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">Evolução do Peso</p>
            <span className="text-xs text-muted-foreground">Semanas 1–{activePackage.currentWeek}</span>
          </div>
          <WeightEvolutionChart
            data={clinicalStatus.weightHistory}
            goalWeightKg={clinicalStatus.goalWeightKg}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Última medição: {clinicalStatus.lastMeasuredAt} · Progresso: {clinicalStatus.progressPercent}% da meta
          </p>
        </div>

        <div className="card-base p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">Adesão por Semana</p>
            <span className="text-xs text-muted-foreground">Meta: 80%</span>
          </div>
          <AdherenceChart data={clinicalStatus.adherenceHistory} />
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-1.5 rounded-full bg-positive inline-block" />
              Excelente ≥85%
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-1.5 rounded-full bg-warning inline-block" />
              Regular 55–69%
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-1.5 rounded-full bg-negative inline-block" />
              Crítico &lt;55%
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: Alerts + Tasks + Upcoming appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alerts */}
        <div className="card-base p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <AlertTriangle size={14} className="text-amber-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Alertas Ativos</p>
            {alerts.filter((a) => !a.isResolved).length > 0 && (
              <span className="ml-auto text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">
                {alerts.filter((a) => !a.isResolved).length}
              </span>
            )}
          </div>
          <AlertPanel alerts={alerts} />
        </div>

        {/* Tasks */}
        <div className="card-base p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
              <CheckSquare size={14} className="text-indigo-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Tarefas</p>
            <span className="ml-auto text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full font-semibold">
              {pendingTasks.length} pendentes
            </span>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
            {pendingTasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
            {completedTasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        </div>

        {/* Upcoming appointments */}
        <div className="card-base p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
              <Calendar size={14} className="text-teal-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Próximas Consultas</p>
          </div>
          <div className="space-y-2">
            {upcomingAppointments
              .filter((a) => a.status === 'agendado')
              .map((appt) => (
                <div key={appt.id} className="p-3 rounded-xl border border-border hover:bg-muted transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-foreground">
                      {new Date(appt.scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      {' às '}
                      {new Date(appt.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <StatusBadge status={appt.status} size="xs" />
                  </div>
                  <p className="text-xs text-muted-foreground">{apptTypeLabel[appt.type]}</p>
                  <p className="text-xs text-muted-foreground">{appt.professionalName} · {appt.roomName}</p>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Row 4: Financial + Package + Timeline preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <FinancialStatusCard financial={financial} />
        <PackageProgressCard pkg={activePackage} />

        {/* Timeline preview */}
        <div className="card-base p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Últimos Eventos</p>
          <div className="space-y-0">
            {recentTimeline.slice(0, 4).map((event, i) => (
              <TimelineEventCard
                key={event.id}
                event={event}
                isLast={i === Math.min(3, recentTimeline.length - 1)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}