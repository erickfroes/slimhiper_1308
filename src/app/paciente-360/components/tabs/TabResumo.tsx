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
  ShieldOff,
  Droplets,
  Utensils,
  Dumbbell,
} from 'lucide-react';
import type { Patient360Summary } from '@/domain/types';
import AlertPanel from '@/components/AlertPanel';

import PackageProgressCard from '@/components/PackageProgressCard';
import StatusBadge from '@/components/StatusBadge';

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
  canViewDocuments?: boolean;
  canViewFinancial?: boolean;
  canViewChat?: boolean;
}

function RestrictedSummaryCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-800">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldOff size={14} />
        <span>{label} restrito</span>
      </div>
      <p className="mt-1">Seu perfil não possui permissão para visualizar este resumo.</p>
    </div>
  );
}

export default function TabResumo({
  data,
  canViewDocuments = false,
  canViewFinancial = false,
  canViewChat = false,
}: TabResumoProps) {
  const {
    clinicalStatus,
    alerts,
    tasks,
    upcomingAppointments,
    financial,
    activePackage,
    documents,
    chat,
    dailyAdherence,
  } = data;

  const pendingTasks = tasks.filter((t) => !t.isCompleted);
  // KPI derived values
  if (!clinicalStatus) {
    return (
      <div className="card-base p-5">
        <p className="text-sm text-muted-foreground">Status clínico não disponível.</p>
      </div>
    );
  }

  const visibleDocuments = canViewDocuments ? documents : [];
  const visibleFinancial = canViewFinancial ? financial : null;
  const visibleChat = canViewChat ? chat : null;

  const pendingDocs = visibleDocuments.filter(
    (d) => d.status === 'pendente_assinatura' || d.status === 'em_analise'
  ).length;
  const docsAwaitingSignature = visibleDocuments.filter((d) => d.status === 'pendente_assinatura');
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
  const financialStatus = visibleFinancial?.status;
  const financialColor =
    financialStatus === 'em_dia'
      ? 'text-positive'
      : financialStatus === 'inadimplente'
        ? 'text-negative'
        : 'text-amber-600';
  const financialBg =
    financialStatus === 'em_dia'
      ? 'bg-emerald-50'
      : financialStatus === 'inadimplente'
        ? 'bg-red-50'
        : 'bg-amber-50';
  const financialLabel = !canViewFinancial
    ? 'Restrito'
    : !visibleFinancial
      ? 'Não disponível'
      : financialStatus === 'em_dia'
        ? 'Em dia'
        : financialStatus === 'inadimplente'
          ? 'Inadimplente'
          : 'Pendente';
  const saldoAberto = visibleFinancial
    ? visibleFinancial.totalPending + visibleFinancial.totalOverdue
    : 0;
  const programProgressLabel = activePackage
    ? `Sem. ${activePackage.currentWeek} / ${activePackage.totalWeeks}`
    : 'Sem pacote ativo';

  const nextAppointments = upcomingAppointments.filter((a) => a.status === 'agendado');
  const recentAppointments = upcomingAppointments.filter((a) => a.status === 'concluido');
  const dailyStatusColor =
    !dailyAdherence || dailyAdherence.progressPercent < 40
      ? 'text-red-600'
      : dailyAdherence.progressPercent < 60
        ? 'text-amber-600'
        : dailyAdherence.progressPercent < 80
          ? 'text-primary'
          : 'text-positive';
  const dailyStatusBg =
    !dailyAdherence || dailyAdherence.progressPercent < 40
      ? 'bg-red-50'
      : dailyAdherence.progressPercent < 60
        ? 'bg-amber-50'
        : dailyAdherence.progressPercent < 80
          ? 'bg-primary/10'
          : 'bg-emerald-50';
  const dailySignalLabel = dailyAdherence?.lastSignalAt
    ? new Date(dailyAdherence.lastSignalAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Sem sinais hoje';

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
      <div className="card-base p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <SectionHeader
              icon={Activity}
              label="Diario do paciente hoje"
              iconBg={dailyStatusBg}
              iconColor={dailyStatusColor}
              badge={
                dailyAdherence ? (
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-xs font-semibold',
                      dailyStatusBg,
                      dailyStatusColor,
                    ].join(' ')}
                  >
                    {dailyAdherence.progressPercent}%
                  </span>
                ) : undefined
              }
            />
            <p className="text-sm text-muted-foreground">
              Ultimo sinal: {dailySignalLabel}. Fotos disponiveis:{' '}
              {dailyAdherence?.mealPhotos.length ?? 0}.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Droplets size={13} />
                Agua
              </div>
              <p className="mt-1 text-sm font-bold text-foreground tabular-nums">
                {dailyAdherence?.waterMl ?? 0}/{dailyAdherence?.waterGoalMl ?? 2000} ml
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Utensils size={13} />
                Refeicoes
              </div>
              <p className="mt-1 text-sm font-bold text-foreground tabular-nums">
                {dailyAdherence?.mealsCount ?? 0}/{dailyAdherence?.mealsGoal ?? 4}
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Dumbbell size={13} />
                Treino
              </div>
              <p className="mt-1 text-sm font-bold text-foreground tabular-nums">
                {dailyAdherence?.workoutsCount ?? 0}/{dailyAdherence?.workoutsGoal ?? 1}
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <ClipboardList size={13} />
                Check-in
              </div>
              <p className="mt-1 text-sm font-bold text-foreground">
                {dailyAdherence?.checkinDone
                  ? 'feito'
                  : dailyAdherence?.checkinRequired
                    ? 'pendente'
                    : 'sem agenda'}
              </p>
            </div>
          </div>
        </div>
      </div>

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
            {!canViewDocuments ? (
              <RestrictedSummaryCard label="Documentos" />
            ) : visibleDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum documento encontrado.</p>
            ) : (
              <div className="space-y-2">
                {visibleDocuments.slice(0, 5).map((doc) => (
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
            {!canViewDocuments ? (
              <RestrictedSummaryCard label="Documentos" />
            ) : docsAwaitingSignature.length === 0 ? (
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
            {!canViewFinancial ? (
              <RestrictedSummaryCard label="Financeiro" />
            ) : visibleFinancial ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <span className="text-xs text-muted-foreground">Saldo em aberto</span>
                  <span className={['text-sm font-bold tabular-nums', financialColor].join(' ')}>
                    R$ {saldoAberto.toLocaleString('pt-BR')}
                  </span>
                </div>
                {visibleFinancial.nextDueDate && (
                  <div className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50">
                    <span className="text-xs text-amber-700">Próx. vencimento</span>
                    <span className="text-xs font-semibold text-amber-800">
                      {visibleFinancial.nextDueDate}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>Status</span>
                  <StatusBadge status={visibleFinancial.status} size="xs" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Financeiro não disponível.</p>
            )}
          </div>

          {/* Chat não respondido */}
          <div className="card-base p-4">
            <SectionHeader
              icon={MessageCircle}
              label="Chat"
              iconBg={
                visibleChat?.unreadCount && visibleChat.unreadCount > 0
                  ? 'bg-red-50'
                  : 'bg-slate-50'
              }
              iconColor={
                visibleChat?.unreadCount && visibleChat.unreadCount > 0
                  ? 'text-red-500'
                  : 'text-slate-500'
              }
              badge={
                visibleChat?.unreadCount && visibleChat.unreadCount > 0 ? (
                  <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-semibold">
                    {visibleChat.unreadCount} não lida{visibleChat.unreadCount > 1 ? 's' : ''}
                  </span>
                ) : undefined
              }
            />
            {!canViewChat ? (
              <RestrictedSummaryCard label="Chat" />
            ) : !visibleChat ? (
              <p className="text-sm text-muted-foreground">Sem mensagens.</p>
            ) : (
              <div
                className={[
                  'p-3 rounded-xl border',
                  visibleChat.unreadCount > 0
                    ? 'border-red-200 bg-red-50'
                    : 'border-border bg-muted/30',
                ].join(' ')}
              >
                <p
                  className={[
                    'text-xs font-medium mb-1',
                    visibleChat.unreadCount > 0 ? 'text-red-700' : 'text-foreground',
                  ].join(' ')}
                >
                  {visibleChat.lastMessageFrom}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2 italic">
                  &quot;{visibleChat.lastMessagePreview}&quot;
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {new Date(visibleChat.lastMessageAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                  {' às '}
                  {new Date(visibleChat.lastMessageAt).toLocaleTimeString('pt-BR', {
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
