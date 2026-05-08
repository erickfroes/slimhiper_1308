'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import {
  Scale,
  Target,
  Activity,
  CheckSquare,
  Clock,
  Calendar,
  FileText,
  DollarSign,
  Stethoscope,
  TrendingUp,
  MessageCircle,
  ChevronRight,
  Pen,
  Bell,
  ClipboardList,
  CreditCard,
} from 'lucide-react';
import type { Patient360Summary } from '@/domain/types';
import AlertPanel from '@/components/AlertPanel';

import PackageProgressCard from '@/components/PackageProgressCard';
import StatusBadge from '@/components/StatusBadge';
import Icon from '@/components/ui/AppIcon';

const WeightEvolutionChart = dynamic(() => import('@/components/charts/WeightEvolutionChart'), {
  ssr: false,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  iconBg,
  iconColor,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  iconBg: string;
  iconColor: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div
        className={[
          'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
          iconBg,
        ].join(' ')}
      >
        <Icon size={14} className={iconColor} />
      </div>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {badge && <span className="ml-auto">{badge}</span>}
    </div>
  );
}

const apptTypeLabel: Record<string, string> = {
  consulta_medica: 'Consulta Médica',
  retorno: 'Retorno',
  nutricao: 'Nutrição',
  avaliacao_inicial: 'Avaliação Inicial',
  bioimpedancia: 'Bioimpedância',
  checkup: 'Check-up',
};

const docTypeLabel: Record<string, string> = {
  contrato: 'Contrato',
  consentimento: 'Consentimento',
  exame: 'Exame',
  prescricao: 'Prescrição',
  relatorio: 'Relatório',
  outros: 'Outros',
};

const docStatusColor: Record<string, string> = {
  pendente_assinatura: 'text-amber-600 bg-amber-50 border-amber-200',
  em_analise: 'text-sky-600 bg-sky-50 border-sky-200',
  assinado: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  vencido: 'text-red-600 bg-red-50 border-red-200',
  cancelado: 'text-slate-500 bg-slate-50 border-slate-200',
};

const docStatusLabel: Record<string, string> = {
  pendente_assinatura: 'Aguardando assinatura',
  em_analise: 'Em análise',
  assinado: 'Assinado',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
};

// ─── Task item ────────────────────────────────────────────────────────────────

function TaskItem({ task }: { task: Patient360Summary['tasks'][0] }) {
  const priorityColor = {
    alta: 'bg-red-50 border-red-200 text-red-700',
    media: 'bg-amber-50 border-amber-200 text-amber-700',
    baixa: 'bg-slate-50 border-slate-200 text-slate-600',
  }[task.priority];

  return (
    <div
      className={[
        'flex items-start gap-3 p-3 rounded-xl border',
        task.isCompleted ? 'opacity-50 bg-muted/30' : 'bg-card border-border',
      ].join(' ')}
    >
      <div
        className={[
          'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5',
          task.isCompleted ? 'bg-positive border-positive' : 'border-border',
        ].join(' ')}
      />
      <div className="flex-1 min-w-0">
        <p
          className={[
            'text-sm font-medium',
            task.isCompleted ? 'line-through text-muted-foreground' : 'text-foreground',
          ].join(' ')}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span
            className={[
              'text-xs font-medium px-1.5 py-0.5 rounded-full border',
              priorityColor,
            ].join(' ')}
          >
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

// ─── Main Tab ─────────────────────────────────────────────────────────────────

interface TabResumoProps {
  data: Patient360Summary;
}

export default function TabResumo({ data }: TabResumoProps) {
  const {
    clinicalStatus,
    alerts,
    tasks,
    upcomingAppointments,
    financial,
    activePackage,
    documents,
    chat,
  } = data;

  const pendingTasks = tasks.filter((t) => !t.isCompleted);
  const completedTasks = tasks.filter((t) => t.isCompleted);

  // KPI derived values
  const pendingDocs = documents.filter(
    (d) => d.status === 'pendente_assinatura' || d.status === 'em_analise'
  ).length;
  const docsAwaitingSignature = documents.filter((d) => d.status === 'pendente_assinatura');
  const bmiCategory =
    clinicalStatus.currentBmi < 18.5
      ? 'Abaixo do peso'
      : clinicalStatus.currentBmi < 25
        ? 'Normal'
        : clinicalStatus.currentBmi < 30
          ? 'Sobrepeso'
          : 'Obesidade';
  const adherenceColor =
    clinicalStatus.adherenceLevel === 'critico'
      ? 'text-negative'
      : clinicalStatus.adherenceLevel === 'excelente'
        ? 'text-positive'
        : clinicalStatus.adherenceLevel === 'bom'
          ? 'text-teal-600'
          : 'text-amber-600';
  const adherenceBg =
    clinicalStatus.adherenceLevel === 'critico'
      ? 'bg-red-50'
      : clinicalStatus.adherenceLevel === 'excelente'
        ? 'bg-emerald-50'
        : clinicalStatus.adherenceLevel === 'bom'
          ? 'bg-teal-50'
          : 'bg-amber-50';
  const financialColor =
    financial.status === 'em_dia'
      ? 'text-positive'
      : financial.status === 'inadimplente'
        ? 'text-negative'
        : 'text-amber-600';
  const financialBg =
    financial.status === 'em_dia'
      ? 'bg-emerald-50'
      : financial.status === 'inadimplente'
        ? 'bg-red-50'
        : 'bg-amber-50';
  const financialLabel =
    financial.status === 'em_dia'
      ? 'Em dia'
      : financial.status === 'inadimplente'
        ? 'Inadimplente'
        : 'Pendente';
  const saldoAberto = financial.totalPending + financial.totalOverdue;
  const programProgressLabel = `Sem. ${activePackage.currentWeek} / ${activePackage.totalWeeks}`;

  const nextAppointments = upcomingAppointments.filter((a) => a.status === 'agendado');
  const recentAppointments = upcomingAppointments.filter((a) => a.status === 'concluido');

  return (
    <div className="space-y-5">
      {/* ── Row 1: 8 compact KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Peso atual */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Scale size={12} className="text-primary" />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">
              Peso Atual
            </p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
            {clinicalStatus.currentWeightKg}{' '}
            <span className="text-xs font-normal text-muted-foreground">kg</span>
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            ↓ {clinicalStatus.weightLostKg} kg perdidos
          </p>
        </div>

        {/* Meta de peso */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <Target size={12} className="text-indigo-600" />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">
              Meta Peso
            </p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
            {clinicalStatus.goalWeightKg}{' '}
            <span className="text-xs font-normal text-muted-foreground">kg</span>
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Faltam {clinicalStatus.weightToGoKg} kg
          </p>
        </div>

        {/* Evolução no programa */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={12} className="text-teal-600" />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">
              Evolução
            </p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
            {clinicalStatus.progressPercent}
            <span className="text-xs font-normal text-muted-foreground">%</span>
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {programProgressLabel} do programa
          </p>
        </div>

        {/* IMC */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
              <Activity size={12} className="text-violet-600" />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">
              IMC
            </p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
            {clinicalStatus.currentBmi}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">{bmiCategory}</p>
        </div>

        {/* Adesão semanal */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div
              className={[
                'w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0',
                adherenceBg,
              ].join(' ')}
            >
              <CheckSquare size={12} className={adherenceColor} />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">
              Adesão
            </p>
          </div>
          <p className={['text-lg font-bold tabular-nums leading-tight', adherenceColor].join(' ')}>
            {clinicalStatus.weeklyAdherencePercent}
            <span className="text-xs font-normal text-muted-foreground">%</span>
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight capitalize">
            {clinicalStatus.adherenceLevel} · meta 80%
          </p>
        </div>

        {/* Consultas realizadas */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-sky-50 flex items-center justify-center flex-shrink-0">
              <Stethoscope size={12} className="text-sky-600" />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">
              Consultas
            </p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
            {activePackage.usedConsultations}
            <span className="text-xs font-normal text-muted-foreground">
              /{activePackage.totalConsultations}
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {activePackage.totalConsultations - activePackage.usedConsultations} restantes
          </p>
        </div>

        {/* Documentos pendentes */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div
              className={[
                'w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0',
                pendingDocs > 0 ? 'bg-amber-50' : 'bg-slate-50',
              ].join(' ')}
            >
              <FileText
                size={12}
                className={pendingDocs > 0 ? 'text-amber-600' : 'text-slate-500'}
              />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">
              Documentos
            </p>
          </div>
          <p
            className={[
              'text-lg font-bold tabular-nums leading-tight',
              pendingDocs > 0 ? 'text-amber-600' : 'text-foreground',
            ].join(' ')}
          >
            {pendingDocs}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {pendingDocs > 0 ? 'Aguardando ação' : 'Nenhum pendente'}
          </p>
        </div>

        {/* Saldo em aberto */}
        <div className="card-base p-3 flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div
              className={[
                'w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0',
                financialBg,
              ].join(' ')}
            >
              <DollarSign size={12} className={financialColor} />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">
              Saldo Aberto
            </p>
          </div>
          <p className={['text-lg font-bold tabular-nums leading-tight', financialColor].join(' ')}>
            R$ {saldoAberto.toLocaleString('pt-BR')}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">{financialLabel}</p>
        </div>
      </div>

      {/* ── Two-column summary layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
        {/* ══ MAIN COLUMN ══ */}
        <div className="space-y-5">
          {/* Evolução clínica — weight trend chart */}
          <div className="card-base p-5">
            <SectionHeader
              icon={TrendingUp}
              label="Evolução Clínica"
              iconBg="bg-teal-50"
              iconColor="text-teal-600"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Peso inicial</p>
                <p className="text-base font-bold text-foreground tabular-nums">
                  {clinicalStatus.startWeightKg} kg
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Peso atual</p>
                <p className="text-base font-bold text-primary tabular-nums">
                  {clinicalStatus.currentWeightKg} kg
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Meta</p>
                <p className="text-base font-bold text-foreground tabular-nums">
                  {clinicalStatus.goalWeightKg} kg
                </p>
              </div>
            </div>
            <WeightEvolutionChart
              data={clinicalStatus.weightHistory}
              goalWeightKg={clinicalStatus.goalWeightKg}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Última medição: {clinicalStatus.lastMeasuredAt} · Progresso:{' '}
              {clinicalStatus.progressPercent}% da meta · Perdeu {clinicalStatus.weightLostKg} kg
            </p>
          </div>

          {/* Últimos atendimentos */}
          <div className="card-base p-5">
            <SectionHeader
              icon={Stethoscope}
              label="Últimos Atendimentos"
              iconBg="bg-sky-50"
              iconColor="text-sky-600"
            />
            {recentAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum atendimento registrado.</p>
            ) : (
              <div className="space-y-2">
                {recentAppointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Stethoscope size={14} className="text-sky-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">
                          {apptTypeLabel[appt.type] ?? appt.type}
                        </p>
                        <StatusBadge status={appt.status} size="xs" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {appt.professionalName} · {appt.professionalRole}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(appt.scheduledAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                        {' às '}
                        {new Date(appt.scheduledAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {appt.roomName ? ` · ${appt.roomName}` : ''}
                      </p>
                      {appt.notes && (
                        <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">
                          {appt.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Plano atual */}
          <PackageProgressCard pkg={activePackage} />

          {/* Últimos documentos */}
          <div className="card-base p-5">
            <SectionHeader
              icon={FileText}
              label="Últimos Documentos"
              iconBg="bg-violet-50"
              iconColor="text-violet-600"
            />
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum documento encontrado.</p>
            ) : (
              <div className="space-y-2">
                {documents.slice(0, 5).map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                      <FileText size={14} className="text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {docTypeLabel[doc.type] ?? doc.type} · {doc.createdAt}
                      </p>
                    </div>
                    <span
                      className={[
                        'text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0',
                        docStatusColor[doc.status] ?? 'text-slate-500 bg-slate-50 border-slate-200',
                      ].join(' ')}
                    >
                      {docStatusLabel[doc.status] ?? doc.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ══ RIGHT COLUMN ══ */}
        <div className="space-y-4">
          {/* Alertas */}
          <div className="card-base p-4">
            <SectionHeader
              icon={Bell}
              label="Alertas"
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
              badge={
                alerts.filter((a) => !a.isResolved).length > 0 ? (
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">
                    {alerts.filter((a) => !a.isResolved).length}
                  </span>
                ) : undefined
              }
            />
            <AlertPanel alerts={alerts} compact />
          </div>

          {/* Pendências */}
          <div className="card-base p-4">
            <SectionHeader
              icon={ClipboardList}
              label="Pendências"
              iconBg="bg-indigo-50"
              iconColor="text-indigo-600"
              badge={
                pendingTasks.length > 0 ? (
                  <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full font-semibold">
                    {pendingTasks.length}
                  </span>
                ) : undefined
              }
            />
            <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin pr-0.5">
              {pendingTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
              ) : (
                pendingTasks.map((task) => <TaskItem key={task.id} task={task} />)
              )}
            </div>
          </div>

          {/* Próximas ações (upcoming appointments) */}
          <div className="card-base p-4">
            <SectionHeader
              icon={Calendar}
              label="Próximas Ações"
              iconBg="bg-teal-50"
              iconColor="text-teal-600"
            />
            {nextAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma consulta agendada.</p>
            ) : (
              <div className="space-y-2">
                {nextAppointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground">
                        {new Date(appt.scheduledAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                        })}
                        {' às '}
                        {new Date(appt.scheduledAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <StatusBadge status={appt.status} size="xs" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {apptTypeLabel[appt.type] ?? appt.type}
                    </p>
                    <p className="text-xs text-muted-foreground">{appt.professionalName}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Documentos aguardando assinatura */}
          <div className="card-base p-4">
            <SectionHeader
              icon={Pen}
              label="Aguardando Assinatura"
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
              badge={
                docsAwaitingSignature.length > 0 ? (
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">
                    {docsAwaitingSignature.length}
                  </span>
                ) : undefined
              }
            />
            {docsAwaitingSignature.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum documento pendente.</p>
            ) : (
              <div className="space-y-2">
                {docsAwaitingSignature.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50"
                  >
                    <FileText size={14} className="text-amber-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-amber-800 truncate">{doc.name}</p>
                      <p className="text-[10px] text-amber-600">
                        {docTypeLabel[doc.type]} · {doc.createdAt}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-amber-500 flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Financeiro em aberto */}
          <div className="card-base p-4">
            <SectionHeader
              icon={CreditCard}
              label="Financeiro em Aberto"
              iconBg={financialBg}
              iconColor={financialColor}
            />
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <span className="text-xs text-muted-foreground">Saldo em aberto</span>
                <span className={['text-sm font-bold tabular-nums', financialColor].join(' ')}>
                  R$ {saldoAberto.toLocaleString('pt-BR')}
                </span>
              </div>
              {financial.nextDueDate && (
                <div className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50">
                  <span className="text-xs text-amber-700">Próx. vencimento</span>
                  <span className="text-xs font-semibold text-amber-800">
                    {financial.nextDueDate}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>Status</span>
                <StatusBadge status={financial.status} size="xs" />
              </div>
            </div>
          </div>

          {/* Chat não respondido */}
          <div className="card-base p-4">
            <SectionHeader
              icon={MessageCircle}
              label="Chat"
              iconBg={chat?.unreadCount && chat.unreadCount > 0 ? 'bg-red-50' : 'bg-slate-50'}
              iconColor={
                chat?.unreadCount && chat.unreadCount > 0 ? 'text-red-500' : 'text-slate-500'
              }
              badge={
                chat?.unreadCount && chat.unreadCount > 0 ? (
                  <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-semibold">
                    {chat.unreadCount} não lida{chat.unreadCount > 1 ? 's' : ''}
                  </span>
                ) : undefined
              }
            />
            {!chat ? (
              <p className="text-sm text-muted-foreground">Sem mensagens.</p>
            ) : (
              <div
                className={[
                  'p-3 rounded-xl border',
                  chat.unreadCount > 0 ? 'border-red-200 bg-red-50' : 'border-border bg-muted/30',
                ].join(' ')}
              >
                <p
                  className={[
                    'text-xs font-medium mb-1',
                    chat.unreadCount > 0 ? 'text-red-700' : 'text-foreground',
                  ].join(' ')}
                >
                  {chat.lastMessageFrom}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2 italic">
                  &quot;{chat.lastMessagePreview}&quot;
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {new Date(chat.lastMessageAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                  {' às '}
                  {new Date(chat.lastMessageAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
