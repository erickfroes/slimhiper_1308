'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Filter,
  MessageSquare,
  PackageSearch,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';

import AlertPanel from '@/components/AlertPanel';
import { SkeletonCard } from '@/components/LoadingSkeleton';
import QuickActionsCard from '@/components/QuickActionsCard';
import StatusBadge from '@/components/StatusBadge';
import { getDashboardSnapshot } from '@/services/dashboardApi';
import type {
  AppointmentSummary,
  DashboardAccess,
  DashboardActionCategory,
  DashboardActionItem,
  DashboardAlert,
  DashboardDegradedSection,
  DashboardOperationalSections,
  DashboardSectionEnvelope,
  DashboardStats,
  PatientReviewItem,
  WaitingQueueEntry,
} from '@/domain/types';

const OccupancyChart = dynamic(() => import('@/components/charts/OccupancyChart'), { ssr: false });

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: 'default' | 'warning' | 'danger' | 'success' | 'info';
  large?: boolean;
}

const accentConfig = {
  default: { icon: 'bg-primary/10 text-primary', border: '' },
  warning: { icon: 'bg-amber-100 text-amber-700', border: 'border-amber-200 bg-amber-50/50' },
  danger: { icon: 'bg-red-100 text-red-700', border: 'border-red-200 bg-red-50/50' },
  success: { icon: 'bg-emerald-100 text-emerald-700', border: '' },
  info: { icon: 'bg-sky-100 text-sky-700', border: '' },
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'default',
  large = false,
}: StatCardProps) {
  const cfg = accentConfig[accent];

  return (
    <div className={['card-base flex flex-col gap-3 p-5', cfg.border].join(' ')}>
      <div className="flex items-center justify-between">
        <div
          className={['flex h-9 w-9 items-center justify-center rounded-xl', cfg.icon].join(' ')}
        >
          <Icon size={17} />
        </div>
      </div>
      <div>
        <p
          className={[
            'font-bold leading-none text-foreground tabular-nums',
            large ? 'text-3xl' : 'text-2xl',
          ].join(' ')}
        >
          {value}
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}

const defaultAccess: DashboardAccess = {
  patients: false,
  agenda: false,
  documents: false,
  financial: false,
  chat: false,
  crm: false,
  inventory: false,
};

const dashboardDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const apptTypeLabel: Record<string, string> = {
  consulta_medica: 'Consulta medica',
  retorno: 'Retorno',
  nutricao: 'Nutricao',
  avaliacao_inicial: 'Avaliacao inicial',
  bioimpedancia: 'Bioimpedancia',
  checkup: 'Check-up',
};

const categoryConfig: Record<
  DashboardActionCategory,
  { label: string; icon: React.ElementType; className: string }
> = {
  fila: {
    label: 'Fila',
    icon: Clock,
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  adesao: {
    label: 'Adesao',
    icon: Activity,
    className: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  clinico: {
    label: 'Clinico',
    icon: AlertTriangle,
    className: 'bg-red-50 text-red-800 border-red-200',
  },
  financeiro: {
    label: 'Financeiro',
    icon: CreditCard,
    className: 'bg-violet-50 text-violet-800 border-violet-200',
  },
  documento: {
    label: 'Documento',
    icon: FileText,
    className: 'bg-slate-50 text-slate-800 border-slate-200',
  },
  mensagem: {
    label: 'Mensagem',
    icon: MessageSquare,
    className: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  renovacao: {
    label: 'Renovacao',
    icon: TrendingUp,
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  comercial: {
    label: 'Comercial',
    icon: UserPlus,
    className: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  estoque: {
    label: 'Estoque',
    icon: PackageSearch,
    className: 'bg-orange-50 text-orange-800 border-orange-200',
  },
};

const priorityConfig = {
  critico: 'bg-red-600 text-white',
  alto: 'bg-orange-100 text-orange-800',
  medio: 'bg-amber-100 text-amber-800',
  baixo: 'bg-blue-100 text-blue-800',
};

function restrictedValue(canRead: boolean, value: React.ReactNode) {
  return canRead ? value : <span className="text-base font-semibold">Restrito</span>;
}

function restrictedSub(canRead: boolean, fallback: string, permission: string) {
  return canRead ? fallback : `Exige ${permission}`;
}

function sectionCount<T>(section: DashboardSectionEnvelope<T[]> | undefined) {
  if (!section?.canRead) return null;
  return section.data.length;
}

function formatTime(value: string | undefined) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 5);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function SectionAccessState({
  section,
  emptyLabel,
}: {
  section?: DashboardSectionEnvelope<unknown[]>;
  emptyLabel: string;
}) {
  if (!section?.canRead) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Restrito.</span>{' '}
        {section?.error ?? 'Sem permissao para ler esta secao.'}
      </div>
    );
  }

  if (section.data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-xs font-medium text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return null;
}

function ActionQueuePanel({ actions }: { actions: DashboardActionItem[] }) {
  const [selectedCategory, setSelectedCategory] = useState<DashboardActionCategory | 'todos'>(
    'todos'
  );
  const categories = useMemo(() => {
    const counts = new Map<DashboardActionCategory, number>();
    actions.forEach((action) =>
      counts.set(action.category, (counts.get(action.category) ?? 0) + 1)
    );
    return Array.from(counts.entries());
  }, [actions]);
  const filteredActions =
    selectedCategory === 'todos'
      ? actions
      : actions.filter((action) => action.category === selectedCategory);

  return (
    <section className="card-base p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldAlert size={17} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Quem precisa de acao hoje</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Itens priorizados por fila, adesao, financeiro, documentos, mensagens e renovacoes.
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          <Filter size={13} />
          {filteredActions.length} itens
        </span>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setSelectedCategory('todos')}
          className={[
            'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
            selectedCategory === 'todos'
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:bg-muted',
          ].join(' ')}
        >
          Todos {actions.length}
        </button>
        {categories.map(([category, count]) => {
          const config = categoryConfig[category];
          return (
            <button
              type="button"
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={[
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                selectedCategory === category
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted',
              ].join(' ')}
            >
              {config.label} {count}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {filteredActions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-8 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Nenhuma acao pendente neste filtro.
            </p>
          </div>
        ) : (
          filteredActions.map((action) => {
            const config = categoryConfig[action.category];
            const Icon = config.icon;
            return (
              <div
                key={action.id}
                className="rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/30"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div
                      className={[
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                        config.className,
                      ].join(' ')}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            'rounded-full px-2 py-0.5 text-[11px] font-bold uppercase',
                            priorityConfig[action.priority],
                          ].join(' ')}
                        >
                          {action.priority}
                        </span>
                        {action.metricLabel ? (
                          <span className="text-xs font-semibold text-muted-foreground">
                            {action.metricLabel}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-foreground">{action.title}</p>
                      {action.patientName ? (
                        <p className="mt-0.5 truncate text-sm text-foreground">
                          {action.patientName}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-muted-foreground">{action.reason}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>Dono: {action.owner}</span>
                        <span>SLA: {action.slaLabel}</span>
                      </div>
                    </div>
                  </div>
                  <Link
                    href={action.href}
                    className="btn-secondary justify-center text-xs sm:min-w-36"
                  >
                    {action.ctaLabel}
                    <ChevronRight size={13} />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function SectionSignalCard({
  title,
  icon: Icon,
  section,
  count,
  href,
  children,
}: {
  title: string;
  icon: React.ElementType;
  section?: DashboardSectionEnvelope<unknown[]>;
  count: number | null;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon size={15} />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">
              {count === null ? 'Acesso restrito' : `${count} pendencias`}
            </p>
          </div>
        </div>
        <Link href={href} className="text-xs font-semibold text-primary hover:underline">
          Abrir
        </Link>
      </div>
      <SectionAccessState section={section} emptyLabel="Nada pendente nesta secao." />
      {section?.canRead && section.data.length > 0 ? children : null}
    </div>
  );
}

function OperationalSignalsPanel({ sections }: { sections: DashboardOperationalSections | null }) {
  const lowAdherence = sections?.lowAdherence;
  const financial = sections?.financialPendencies;
  const documents = sections?.documentPendencies;
  const messages = sections?.recentMessages;
  const renewals = sections?.renewalPipeline;
  const cohorts = sections?.cohortPanel;

  return (
    <section className="card-base p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Sinais operacionais</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Leitura por modulo com permissao e erro parcial por secao.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SectionSignalCard
          title="Baixa adesao"
          icon={Activity}
          section={lowAdherence}
          count={sectionCount(lowAdherence)}
          href="/clinic/patients"
        >
          <div className="space-y-2">
            {lowAdherence?.data.slice(0, 2).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-lg bg-muted/40 px-3 py-2 text-xs hover:bg-muted"
              >
                <span className="font-semibold text-foreground">{item.patientName}</span>
                <span className="mt-0.5 block text-muted-foreground">
                  {item.adherencePercent}% hoje
                </span>
              </Link>
            ))}
          </div>
        </SectionSignalCard>

        <SectionSignalCard
          title="Financeiro"
          icon={CreditCard}
          section={financial}
          count={sectionCount(financial)}
          href="/clinic/financeiro"
        >
          <div className="space-y-2">
            {financial?.data.slice(0, 2).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-lg bg-muted/40 px-3 py-2 text-xs hover:bg-muted"
              >
                <span className="font-semibold text-foreground">{item.patientName}</span>
                <span className="mt-0.5 block text-muted-foreground">
                  {item.daysOverdue ? `${item.daysOverdue} dias vencida` : item.status}
                </span>
              </Link>
            ))}
          </div>
        </SectionSignalCard>

        <SectionSignalCard
          title="Documentos"
          icon={FileText}
          section={documents}
          count={sectionCount(documents)}
          href="/clinic/documents"
        >
          <div className="space-y-2">
            {documents?.data.slice(0, 2).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-lg bg-muted/40 px-3 py-2 text-xs hover:bg-muted"
              >
                <span className="font-semibold text-foreground">{item.name}</span>
                <span className="mt-0.5 block text-muted-foreground">{item.patientName}</span>
              </Link>
            ))}
          </div>
        </SectionSignalCard>

        <SectionSignalCard
          title="Mensagens"
          icon={MessageSquare}
          section={messages}
          count={sectionCount(messages)}
          href="/clinic/inbox"
        >
          <div className="space-y-2">
            {messages?.data.slice(0, 2).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-lg bg-muted/40 px-3 py-2 text-xs hover:bg-muted"
              >
                <span className="font-semibold text-foreground">{item.patientName}</span>
                <span className="mt-0.5 block text-muted-foreground">
                  {item.unreadCount} nao lidas
                </span>
              </Link>
            ))}
          </div>
        </SectionSignalCard>

        <SectionSignalCard
          title="Renovacoes"
          icon={TrendingUp}
          section={renewals}
          count={sectionCount(renewals)}
          href="/clinic/programs"
        >
          <div className="space-y-2">
            {renewals?.data.slice(0, 2).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-lg bg-muted/40 px-3 py-2 text-xs hover:bg-muted"
              >
                <span className="font-semibold text-foreground">{item.patientName}</span>
                <span className="mt-0.5 block text-muted-foreground">
                  {item.daysToEnd ?? 0} dias restantes
                </span>
              </Link>
            ))}
          </div>
        </SectionSignalCard>

        <SectionSignalCard
          title="Coortes"
          icon={Users}
          section={cohorts}
          count={sectionCount(cohorts)}
          href="/clinic/programs"
        >
          <div className="space-y-2">
            {cohorts?.data.slice(0, 2).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-lg bg-muted/40 px-3 py-2 text-xs hover:bg-muted"
              >
                <span className="font-semibold text-foreground">{item.label}</span>
                <span className="mt-0.5 block text-muted-foreground">
                  {item.activePatients} ativos - {item.lowAdherenceCount} baixa adesao
                </span>
              </Link>
            ))}
          </div>
        </SectionSignalCard>
      </div>
    </section>
  );
}

export default function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [access, setAccess] = useState<DashboardAccess>(defaultAccess);
  const [queue, setQueue] = useState<WaitingQueueEntry[]>([]);
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [clinicAlerts, setClinicAlerts] = useState<DashboardAlert[]>([]);
  const [reviewPatients, setReviewPatients] = useState<PatientReviewItem[]>([]);
  const [actionableQueue, setActionableQueue] = useState<DashboardActionItem[]>([]);
  const [operationalSections, setOperationalSections] =
    useState<DashboardOperationalSections | null>(null);
  const [degradedSections, setDegradedSections] = useState<DashboardDegradedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);

  const loadData = async (isRefresh = false) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const snapshot = await getDashboardSnapshot();
      if (requestId !== loadRequestIdRef.current) return;

      setStats(snapshot.stats);
      setAccess(snapshot.access ?? defaultAccess);
      setQueue(snapshot.waitingQueue);
      setAppointments(snapshot.todayAppointments);
      setClinicAlerts(snapshot.alerts);
      setReviewPatients(snapshot.patientsNeedingReview);
      setActionableQueue(snapshot.actionableQueue ?? snapshot.sections?.actionableQueue.data ?? []);
      setOperationalSections(snapshot.sections ?? null);
      setDegradedSections(snapshot.degradedSections ?? []);
      if (isRefresh) toast.success('Dados atualizados');
    } catch {
      if (requestId !== loadRequestIdRef.current) return;

      console.error('[DashboardContent] load error: dashboard_snapshot_failed');
      setStats(null);
      setAccess(defaultAccess);
      setQueue([]);
      setAppointments([]);
      setClinicAlerts([]);
      setReviewPatients([]);
      setActionableQueue([]);
      setOperationalSections(null);
      setDegradedSections([]);
      setLoadError('Nao foi possivel validar o snapshot operacional do dashboard.');
      toast.error('Falha ao carregar dados do dashboard. Tente novamente.');
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 p-6 xl:p-8">
        <div className="mb-2 flex items-center justify-between">
          <div className="h-7 w-48 animate-pulse rounded-xl bg-muted" />
          <div className="h-8 w-28 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={`skel-stat-${i}`} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="card-base h-96 animate-pulse p-5 xl:col-span-2" />
          <div className="card-base h-96 animate-pulse p-5" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6 xl:p-8">
        <div className="card-base mx-auto max-w-xl p-8 text-center">
          <AlertTriangle size={28} className="mx-auto text-red-600" />
          <h1 className="mt-3 text-lg font-bold text-foreground">Dashboard indisponivel</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {loadError ?? 'Nao foi possivel carregar os indicadores da clinica.'}
          </p>
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="btn-primary mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const completedToday = stats.consultasConcluidas;
  const remainingToday = Math.max(0, stats.consultasHoje - stats.consultasConcluidas);
  const formattedToday = dashboardDateFormatter.format(new Date());
  const hasOperationalData =
    stats.consultasHoje > 0 ||
    stats.filaEspera > 0 ||
    stats.programasAtivos > 0 ||
    stats.alertasClinicos > 0 ||
    stats.mensagensNaoLidas > 0 ||
    stats.documentosPendentes > 0 ||
    stats.inadimplentes > 0 ||
    actionableQueue.length > 0 ||
    appointments.length > 0 ||
    clinicAlerts.length > 0 ||
    reviewPatients.length > 0;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 p-6 xl:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Dashboard operacional
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formattedToday} - snapshot acionavel do tenant ativo
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="btn-ghost gap-1.5 text-xs"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <Link href="/clinic/patients" className="btn-primary text-xs">
            <Users size={14} />
            Ver pacientes
          </Link>
        </div>
      </div>

      {degradedSections.length > 0 ? (
        <div className="card-base border-amber-200 bg-amber-50/70 p-4" role="status">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <AlertTriangle size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  Dashboard carregado com leitura parcial
                </p>
                <p className="mt-1 text-sm text-amber-900">
                  Os dados autorizados foram mantidos e secoes bloqueadas ou indisponiveis ficaram
                  isoladas.
                </p>
              </div>
            </div>
            <ul className="grid gap-1 text-xs text-amber-900 md:min-w-72">
              {degradedSections.slice(0, 4).map((section) => (
                <li key={section.key} className="rounded-md bg-amber-100/70 px-2 py-1">
                  <span className="font-semibold">{section.label}</span>: {section.error}
                </li>
              ))}
              {degradedSections.length > 4 ? (
                <li className="px-2 py-1 font-semibold">
                  +{degradedSections.length - 4} outras secoes
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {!hasOperationalData && degradedSections.length === 0 ? (
        <div className="card-base border-dashed border-border bg-muted/30 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Sem movimentos para hoje</p>
              <p className="mt-1 text-sm text-muted-foreground">
                O snapshot real carregou sem agenda, fila, alertas, documentos, mensagens ou
                revisoes para o tenant ativo.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={CalendarDays}
          label="Consultas hoje"
          value={restrictedValue(access.agenda, stats.consultasHoje)}
          sub={restrictedSub(
            access.agenda,
            `${completedToday} concluidas - ${remainingToday} restantes`,
            'agenda.read'
          )}
          accent="default"
          large
        />
        <StatCard
          icon={Clock}
          label="Fila de espera"
          value={restrictedValue(access.agenda, stats.filaEspera)}
          sub={restrictedSub(access.agenda, 'pacientes aguardando', 'agenda.read')}
          accent={access.agenda && stats.filaEspera > 4 ? 'warning' : 'default'}
        />
        <StatCard
          icon={Activity}
          label="Baixa adesao"
          value={restrictedValue(access.patients, stats.baixaAdesao ?? 0)}
          sub={restrictedSub(access.patients, 'habitos diarios', 'patients.read')}
          accent={access.patients && (stats.baixaAdesao ?? 0) > 0 ? 'warning' : 'success'}
        />
        <StatCard
          icon={AlertTriangle}
          label="Alertas clinicos"
          value={restrictedValue(access.patients, stats.alertasClinicos)}
          sub={restrictedSub(access.patients, 'requerem atencao', 'patients.read')}
          accent={access.patients && stats.alertasClinicos > 5 ? 'danger' : 'warning'}
        />
        <StatCard
          icon={MessageSquare}
          label="Mensagens"
          value={restrictedValue(access.chat, stats.mensagensNaoLidas)}
          sub={restrictedSub(access.chat, 'nao lidas', 'chat.read')}
          accent={access.chat && stats.mensagensNaoLidas > 10 ? 'warning' : 'default'}
        />
        <StatCard
          icon={CreditCard}
          label="Inadimplentes"
          value={restrictedValue(access.financial, stats.inadimplentes)}
          sub={restrictedSub(access.financial, 'pacientes', 'financial.read')}
          accent={access.financial && stats.inadimplentes > 0 ? 'danger' : 'success'}
        />
      </div>

      {stats.operationalInsights &&
      (stats.operationalInsights.crm.canRead || stats.operationalInsights.inventory.canRead) ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {stats.operationalInsights.crm.canRead ? (
            <Link
              href={stats.operationalInsights.crm.href}
              className="card-base border-sky-100 bg-sky-50/40 p-5 transition-colors hover:bg-sky-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                    <UserPlus size={18} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                      CRM operacional
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {stats.operationalInsights.crm.openLeads} leads pendentes
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {stats.operationalInsights.crm.overdueTasks} tarefas comerciais vencidas
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="mt-1 text-sky-700" />
              </div>
            </Link>
          ) : null}

          {stats.operationalInsights.inventory.canRead ? (
            <Link
              href={stats.operationalInsights.inventory.href}
              className="card-base border-orange-100 bg-orange-50/40 p-5 transition-colors hover:bg-orange-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                    <PackageSearch size={18} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                      Estoque critico
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {stats.operationalInsights.inventory.criticalStockItems} itens abaixo do
                      minimo
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {stats.operationalInsights.inventory.expiringLots} lotes vencidos ou a vencer
                      em {stats.operationalInsights.inventory.daysToExpiry} dias
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="mt-1 text-orange-700" />
              </div>
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ActionQueuePanel actions={actionableQueue} />
        </div>
        <div className="space-y-4">
          <div className="card-base p-5">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50">
                <Activity size={14} className="text-teal-700" />
              </div>
              <span className="text-sm font-semibold text-foreground">Taxa de ocupacao</span>
            </div>
            {access.agenda ? (
              <>
                <OccupancyChart percent={stats.taxaOcupacao} label="hoje" />
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  {completedToday}/{stats.consultasHoje} consultas concluidas
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-sm text-muted-foreground">
                Exige agenda.read
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="card-base flex flex-col gap-2 p-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                <FileText size={13} className="text-slate-700" />
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {restrictedValue(access.documents, stats.documentosPendentes)}
              </p>
              <p className="text-xs font-medium text-muted-foreground">Docs pendentes</p>
            </div>
            <div className="card-base flex flex-col gap-2 p-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
                <TrendingUp size={13} className="text-emerald-700" />
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {restrictedValue(access.patients, stats.renovacoesPendentes ?? 0)}
              </p>
              <p className="text-xs font-medium text-muted-foreground">Renovacoes</p>
            </div>
          </div>
        </div>
      </div>

      <OperationalSignalsPanel sections={operationalSections} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card-base p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100">
                <Clock size={14} className="text-amber-700" />
              </div>
              <span className="text-sm font-semibold text-foreground">Fila de espera</span>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {queue.length} pacientes
            </span>
          </div>
          <div className="space-y-2">
            {!access.agenda ? (
              <SectionAccessState
                section={{ canRead: false, data: [], error: 'Sem permissao agenda.read.' }}
                emptyLabel=""
              />
            ) : queue.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-6 text-center">
                <p className="text-xs font-medium text-muted-foreground">
                  Nenhum paciente aguardando.
                </p>
              </div>
            ) : (
              queue.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/clinic/patients/${entry.patientId}/encounter`}
                  className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                    {getInitials(entry.patientName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {entry.patientName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.professionalName}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={entry.status} size="xs" />
                    {entry.waitingMinutes > 0 ? (
                      <span className="text-xs font-medium text-amber-700">
                        {entry.waitingMinutes}min
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="card-base p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <CalendarDays size={14} className="text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">Agenda de hoje</span>
            </div>
            <Link
              href="/clinic/agenda"
              className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
            >
              Ver tudo <ChevronRight size={12} />
            </Link>
          </div>
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
            {!access.agenda ? (
              <SectionAccessState
                section={{ canRead: false, data: [], error: 'Sem permissao agenda.read.' }}
                emptyLabel=""
              />
            ) : appointments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-6 text-center">
                <p className="text-xs font-medium text-muted-foreground">
                  Nenhuma consulta para hoje.
                </p>
              </div>
            ) : (
              appointments.map((appt) => (
                <Link
                  key={appt.id}
                  href={`/clinic/patients/${appt.patientId}`}
                  className="group flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-muted"
                >
                  <span className="w-10 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                    {formatTime(appt.scheduledAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {appt.patientName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {apptTypeLabel[appt.type]}
                    </p>
                  </div>
                  <StatusBadge status={appt.status} size="xs" />
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-base p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100">
                  <AlertTriangle size={14} className="text-red-700" />
                </div>
                <span className="text-sm font-semibold text-foreground">Alertas ativos</span>
              </div>
              <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
                {clinicAlerts.length}
              </span>
            </div>
            {!access.patients ? (
              <SectionAccessState
                section={{ canRead: false, data: [], error: 'Sem permissao patients.read.' }}
                emptyLabel=""
              />
            ) : (
              <AlertPanel
                alerts={clinicAlerts}
                compact
                getAlertHref={(alert) => `/clinic/patients/${alert.patientId}`}
              />
            )}
          </div>

          <QuickActionsCard />
        </div>
      </div>

      <div className="card-base p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
              <Users size={14} className="text-indigo-700" />
            </div>
            <span className="text-sm font-semibold text-foreground">Requerem revisao</span>
          </div>
          <Link
            href="/clinic/patients"
            className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
          >
            Ver lista <ChevronRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {!access.patients ? (
            <SectionAccessState
              section={{ canRead: false, data: [], error: 'Sem permissao patients.read.' }}
              emptyLabel=""
            />
          ) : reviewPatients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-6 text-center md:col-span-2 xl:col-span-3">
              <p className="text-xs font-medium text-muted-foreground">
                Nenhum paciente em revisao.
              </p>
            </div>
          ) : (
            reviewPatients.map((patient) => (
              <Link
                key={`${patient.id}-${patient.issue}`}
                href={`/clinic/patients/${patient.id}`}
                className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                  {getInitials(patient.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{patient.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{patient.issue}</p>
                </div>
                <ChevronRight
                  size={13}
                  className="text-muted-foreground transition-colors group-hover:text-primary"
                />
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
