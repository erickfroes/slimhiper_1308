'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  Users,
  AlertTriangle,
  MessageSquare,
  FileText,
  CreditCard,
  Clock,
  ChevronRight,
  Activity,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

import StatusBadge from '@/components/StatusBadge';
import AlertPanel from '@/components/AlertPanel';
import QuickActionsCard from '@/components/QuickActionsCard';
import { SkeletonCard } from '@/components/LoadingSkeleton';
import {
  getDashboardStats,
  getWaitingQueue,
  getTodayAppointments,
  getDashboardAlerts,
  getPatientsNeedingReview,
} from '@/services/mockApi';
import type {
  DashboardStats,
  WaitingQueueEntry,
  AppointmentSummary,
  DashboardAlert,
  PatientReviewItem,
} from '@/domain/types';
import dynamic from 'next/dynamic';
import Icon from '@/components/ui/AppIcon';

const OccupancyChart = dynamic(() => import('@/components/charts/OccupancyChart'), { ssr: false });

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  accent?: 'default' | 'warning' | 'danger' | 'success';
  large?: boolean;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  trendLabel,
  accent = 'default',
  large = false,
}: StatCardProps) {
  const accentConfig = {
    default: { icon: 'bg-primary/10 text-primary', border: '' },
    warning: { icon: 'bg-amber-100 text-amber-600', border: 'border-amber-200 bg-amber-50/50' },
    danger: { icon: 'bg-red-100 text-red-600', border: 'border-red-200 bg-red-50/50' },
    success: { icon: 'bg-emerald-100 text-emerald-600', border: '' },
  };
  const cfg = accentConfig[accent];

  return (
    <div className={['card-base p-5 flex flex-col gap-3', cfg.border].join(' ')}>
      <div className="flex items-center justify-between">
        <div
          className={['w-9 h-9 rounded-xl flex items-center justify-center', cfg.icon].join(' ')}
        >
          <Icon size={17} />
        </div>
        {trend && (
          <span
            className={[
              'text-xs font-semibold flex items-center gap-0.5',
              trend === 'up'
                ? 'text-positive'
                : trend === 'down'
                  ? 'text-negative'
                  : 'text-muted-foreground',
            ].join(' ')}
          >
            {trendLabel}
          </span>
        )}
      </div>
      <div>
        <p
          className={[
            'font-bold text-foreground tabular-nums leading-none',
            large ? 'text-3xl' : 'text-2xl',
          ].join(' ')}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-1 font-medium tracking-wide uppercase">
          {label}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Appointment Type Label ───────────────────────────────────────────────────

const apptTypeLabel: Record<string, string> = {
  consulta_medica: 'Consulta Médica',
  retorno: 'Retorno',
  nutricao: 'Nutrição',
  avaliacao_inicial: 'Avaliação Inicial',
  bioimpedancia: 'Bioimpedância',
  checkup: 'Check-up',
};

// ─── Main Dashboard Content ───────────────────────────────────────────────────

export default function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queue, setQueue] = useState<WaitingQueueEntry[]>([]);
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [clinicAlerts, setClinicAlerts] = useState<DashboardAlert[]>([]);
  const [reviewPatients, setReviewPatients] = useState<PatientReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      // Backend integration point: replace with Supabase calls via getDashboardStats(), getWaitingQueue(), getTodayAppointments()
      const [s, q, a, alerts, review] = await Promise.all([
        getDashboardStats(),
        getWaitingQueue(),
        getTodayAppointments(),
        getDashboardAlerts(),
        getPatientsNeedingReview(),
      ]);
      setStats(s);
      setQueue(q);
      setAppointments(a);
      setClinicAlerts(alerts);
      setReviewPatients(review);
      if (isRefresh) toast.success('Dados atualizados');
    } catch {
      toast.error('Falha ao carregar dados do dashboard. Tente novamente.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="p-6 xl:p-8 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div className="h-7 bg-muted rounded-xl w-48 animate-pulse" />
          <div className="h-8 bg-muted rounded-xl w-28 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={`skel-stat-${i}`} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 card-base p-5 h-64 animate-pulse" />
          <div className="card-base p-5 h-64 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const completedToday = appointments.filter((a) => a.status === 'concluido').length;
  const remainingToday = appointments.filter((a) =>
    [
      'agendado',
      'chegou',
      'triagem',
      'medidas',
      'bioimpedancia',
      'aguardando_medico',
      'em_consulta',
      'checkout',
    ].includes(a.status)
  ).length;

  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Bom dia, Ana 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Quinta-feira, 07 de maio de 2026 · Clínica SlimCenter SP
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="btn-ghost text-xs gap-1.5"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <Link href="/clinic/patients" className="btn-primary text-xs">
            <Users size={14} />
            Ver Pacientes
          </Link>
        </div>
      </div>

      {/* KPI Bento Grid — 6 cards: 3+3 across two breakpoints */}
      {/* Grid plan: 6 cards → grid-cols-2 md:grid-cols-3 xl:grid-cols-6 */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          icon={CalendarDays}
          label="Consultas Hoje"
          value={stats.consultasHoje}
          sub={`${completedToday} concluídas · ${remainingToday} restantes`}
          accent="default"
          large
        />
        <StatCard
          icon={Clock}
          label="Fila de Espera"
          value={stats.filaEspera}
          sub="pacientes aguardando"
          accent={stats.filaEspera > 4 ? 'warning' : 'default'}
        />
        <StatCard
          icon={Activity}
          label="Programas Ativos"
          value={stats.programasAtivos}
          sub="pacientes em programa"
          accent="success"
        />
        <StatCard
          icon={AlertTriangle}
          label="Alertas Clínicos"
          value={stats.alertasClinicos}
          sub="requerem atenção"
          accent={stats.alertasClinicos > 5 ? 'danger' : 'warning'}
        />
        <StatCard
          icon={MessageSquare}
          label="Mensagens"
          value={stats.mensagensNaoLidas}
          sub="não lidas"
          accent={stats.mensagensNaoLidas > 10 ? 'warning' : 'default'}
        />
        <StatCard
          icon={CreditCard}
          label="Inadimplentes"
          value={stats.inadimplentes}
          sub="pacientes"
          accent={stats.inadimplentes > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Second row: Queue + Schedule + Occupancy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-3 gap-4">
        {/* Waiting Queue */}
        <div className="lg:col-span-1 card-base p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock size={14} className="text-amber-600" />
              </div>
              <span className="text-sm font-semibold text-foreground">Fila de Espera</span>
            </div>
            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
              {queue.length} pacientes
            </span>
          </div>
          <div className="space-y-2">
            {queue.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted transition-colors cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                  {entry.patientName
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')}
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
                    <span className="text-xs text-amber-600 font-medium">
                      {entry.waitingMinutes}min
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="lg:col-span-1 card-base p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarDays size={14} className="text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">Agenda de Hoje</span>
            </div>
            <Link
              href="/clinic/agenda"
              className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
            >
              Ver tudo <ChevronRight size={12} />
            </Link>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
            {appointments.map((appt) => (
              <div
                key={appt.id}
                className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-muted transition-colors group"
              >
                <span className="text-xs font-mono font-semibold text-muted-foreground w-10 flex-shrink-0">
                  {new Date(appt.scheduledAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {appt.patientName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {apptTypeLabel[appt.type]}
                  </p>
                </div>
                <StatusBadge status={appt.status} size="xs" />
              </div>
            ))}
          </div>
        </div>

        {/* Occupancy + docs + messages */}
        <div className="lg:col-span-1 space-y-4">
          {/* Occupancy radial */}
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
                <Activity size={14} className="text-teal-600" />
              </div>
              <span className="text-sm font-semibold text-foreground">Taxa de Ocupação</span>
            </div>
            <OccupancyChart percent={stats.taxaOcupacao} label="hoje" />
            <p className="text-xs text-center text-muted-foreground mt-1">
              {completedToday}/{stats.consultasHoje} consultas concluídas
            </p>
          </div>

          {/* Pending docs + messages */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card-base p-4 flex flex-col gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                <FileText size={13} className="text-slate-600" />
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {stats.documentosPendentes}
              </p>
              <p className="text-xs text-muted-foreground font-medium">Docs Pendentes</p>
            </div>
            <div className="card-base p-4 flex flex-col gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center">
                <MessageSquare size={13} className="text-sky-600" />
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {stats.mensagensNaoLidas}
              </p>
              <p className="text-xs text-muted-foreground font-medium">Mensagens</p>
            </div>
          </div>
        </div>
      </div>

      {/* Third row: Alerts + Quick Actions + Patients needing review */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Protocol alerts */}
        <div className="lg:col-span-1 card-base p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertTriangle size={14} className="text-red-600" />
              </div>
              <span className="text-sm font-semibold text-foreground">Alertas Ativos</span>
            </div>
            <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold">
              {clinicAlerts.length}
            </span>
          </div>
          <AlertPanel alerts={clinicAlerts} compact />
        </div>

        {/* Quick Actions */}
        <div className="lg:col-span-1">
          <QuickActionsCard />
        </div>

        {/* Patients needing review */}
        <div className="lg:col-span-1 card-base p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Users size={14} className="text-indigo-600" />
              </div>
              <span className="text-sm font-semibold text-foreground">Requerem Revisão</span>
            </div>
            <Link
              href="/clinic/patients"
              className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
            >
              Ver lista <ChevronRight size={12} />
            </Link>
          </div>
          <div className="space-y-2">
            {reviewPatients.map((p) => (
              <Link
                key={p.id}
                href={`/clinic/patients/${p.id}`}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted transition-colors group"
              >
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                  {p.name
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.issue}</p>
                </div>
                <ChevronRight
                  size={13}
                  className="text-muted-foreground group-hover:text-primary transition-colors"
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
