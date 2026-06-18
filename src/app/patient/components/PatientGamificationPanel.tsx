'use client';

import {
  Award,
  CalendarDays,
  ChevronRight,
  Flame,
  HeartPulse,
  MessageSquare,
  ListChecks,
  Sparkles,
  Target,
} from 'lucide-react';
import { cx } from '@/components/ui/utils';
import type { ReactNode } from 'react';
import type { PatientDailySnapshot } from '@/services/patientDailyApi';
import {
  resolveGamificationNextActionIcon,
  type GamificationAction,
  type GamificationBadge,
  type GamificationEvent,
  type GamificationLevel,
  type GamificationNextAction,
  type GamificationPortalTab,
  type GamificationSummary,
} from '@/services/patientGamificationEngine';

type TabShortcut = {
  id: GamificationPortalTab;
  label: string;
  shortLabel: string;
  badge?: ReactNode;
};

interface PatientGamificationPanelProps {
  summary: GamificationSummary;
  dailySnapshot: PatientDailySnapshot | null;
  onNavigate: (tab: GamificationPortalTab) => void;
  tabItems: TabShortcut[];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function formatDateLabel(value?: string | null) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

function getLevelProgressClass(status: GamificationLevel['status']) {
  switch (status) {
    case 'concluido':
      return 'bg-positive text-positive-foreground';
    case 'andamento':
      return 'bg-amber-100 text-amber-700';
    case 'disponivel':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function buildActionLabel(action: GamificationAction) {
  return `${action.value}/${action.target} ${action.cta}`.trim();
}

function ProgressBar({ value, total, label }: { value: number; total: number; label: string }) {
  const progress = clamp(total > 0 ? (value / total) * 100 : 0, 0, 100);
  return (
    <div
      className="mt-2 h-2 rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
    >
      <div
        className="h-2 rounded-full bg-primary transition-all"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function NextActionCard({
  nextAction,
  onNavigate,
}: {
  nextAction: GamificationNextAction;
  onNavigate: (tab: GamificationPortalTab) => void;
}) {
  const NextActionIcon = nextAction.icon ?? resolveGamificationNextActionIcon(nextAction.iconKey);

  return (
    <button
      type="button"
      onClick={() => onNavigate(nextAction.tab)}
      aria-label={`Abrir ${nextAction.title}`}
      className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-left transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        Proxima conquista
      </p>
      <p className="mt-1 text-sm font-bold text-foreground">Rota recomendada</p>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <NextActionIcon className="h-3.5 w-3.5" aria-hidden={true} />
          {nextAction.title}
        </span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{nextAction.detail}</p>
    </button>
  );
}

function EventTimeline({ events }: { events: GamificationEvent[] }) {
  if (events.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground">Sem eventos recentes para exibir.</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      {events.slice(0, 4).map((event) => (
        <div
          key={event.key}
          className={cx(
            'flex items-start gap-2 rounded-lg border px-2 py-2 text-xs',
            event.isBlocked ? 'border-warning/40 bg-warning/5' : 'border-border bg-card'
          )}
        >
          <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ListChecks className="h-3 w-3" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{event.reason}</p>
            <p className="text-muted-foreground">
              {event.isBlocked ? 'Bloqueado' : 'Pontuacao'}:{' '}
              <span
                className={
                  event.isBlocked ? 'font-semibold text-warning' : 'font-semibold text-foreground'
                }
              >
                {event.score > 0 ? `+${event.score}` : '+0'}
              </span>{' '}
              {event.atLabel ? `(${event.atLabel})` : null}
            </p>
            {event.blockedReason ? (
              <p className="mt-1 text-[11px] text-warning">{event.blockedReason}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function MissionCard({
  mission,
  onNavigate,
  tabLabel,
}: {
  mission: GamificationAction;
  onNavigate: (tab: GamificationPortalTab) => void;
  tabLabel: string;
}) {
  const reached = mission.value >= mission.target;

  return (
    <button
      type="button"
      onClick={() => onNavigate(mission.tab)}
      className="w-full rounded-lg border border-border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="text-sm font-semibold text-foreground">{mission.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{mission.description}</p>
      <p className="mt-2 text-xs font-semibold text-foreground">
        {buildActionLabel(mission)} - ir para {tabLabel}
      </p>
      <ProgressBar value={mission.value} total={mission.target} label={mission.title} />
      <p className="mt-2 flex items-center gap-1 text-xs">
        <span
          className={cx(
            'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
            reached
              ? 'border-positive/30 bg-positive/10 text-positive'
              : 'border-border bg-muted text-muted-foreground'
          )}
        >
          {reached ? 'Concluida' : 'Em andamento'}
        </span>
      </p>
    </button>
  );
}

function BadgeList({ badges }: { badges: GamificationBadge[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {badges
        .filter((badge) => badge.unlocked)
        .slice(0, 3)
        .map((badge) => (
          <span
            key={badge.name}
            className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700"
          >
            <Award className="mr-1 h-3 w-3" aria-hidden="true" />
            {badge.name}
          </span>
        ))}
    </div>
  );
}

export default function PatientGamificationPanel({
  summary,
  dailySnapshot,
  onNavigate,
  tabItems,
}: PatientGamificationPanelProps) {
  const nextAction = summary.nextAction;
  const weeklyBars = dailySnapshot?.week ?? [];
  const nextLevel = summary.levels.find((level) => level.status !== 'concluido') ?? null;
  const xpToNext = Math.max(0, 100 - summary.xp);
  const tabLabelById = new Map(tabItems.map((tab) => [tab.id, tab.label]));

  const todayProgress = clamp(summary.today.progressPercent, 0, 100);
  const todayCompletedHabitsLabel = `${formatDateLabel(summary.today.dateLabel)} - ${
    summary.habitCompletedCount
  } habitos ativos`;
  const fallbackReasons = summary.fallbackReasons.slice(0, 2);

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
        <article className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Mapa da jornada
              </p>
              <h2 className="mt-1 text-lg font-bold text-foreground">
                Acesso rapido e progressivo
              </h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Target className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Veja o passo mais importante do dia, a semana e as conquistas sem perder contexto.
          </p>

          {summary.isPaused ? (
            <div
              role="status"
              className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
            >
              <p className="font-semibold">Jornada em pausa clinica</p>
              <p className="mt-1 text-xs">
                {summary.pauseReason ??
                  'A equipe priorizou seguranca antes de pontuar novas acoes.'}
              </p>
            </div>
          ) : fallbackReasons.length > 0 ? (
            <div
              role="status"
              className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
            >
              <p className="font-semibold text-foreground">Dados parciais</p>
              <p className="mt-1">{fallbackReasons.join(' ')}</p>
            </div>
          ) : null}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <NextActionCard nextAction={nextAction} onNavigate={onNavigate} />

            <div className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Streak
                </p>
                <Flame className="h-4 w-4 text-warning" aria-hidden="true" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                {summary.streakDays}
                {summary.streakDays === 14 ? '+' : ''}
              </p>
              <p className="text-sm text-muted-foreground">
                {summary.streakDays === 14 ? 'Meta maxima visual no momento' : 'dias em sequencia'}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Proximos desafios
                </p>
                <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div className="mt-2 space-y-1 text-xs">
                {summary.missions.length === 0 ? (
                  <p className="text-muted-foreground">Sem desafios ativos no momento.</p>
                ) : (
                  summary.missions.slice(0, 2).map((mission) => (
                    <p key={mission.id} className="text-foreground">
                      {mission.title}
                    </p>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Hoje
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {todayCompletedHabitsLabel}
              </p>
              <div
                className="mt-2 h-2 rounded-full bg-muted"
                role="progressbar"
                aria-label="Progresso do plano diario"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={todayProgress}
              >
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${todayProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {todayProgress}% do plano de hoje.
              </p>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Progresso da semana
            </p>
            <div className="mt-2 flex items-end gap-1">
              {weeklyBars.length > 0 ? (
                weeklyBars.map((day) => (
                  <div key={day.isoDate} className="flex min-w-0 flex-1 flex-col items-center">
                    <div
                      className="flex h-16 w-full items-end rounded-md bg-muted/60 p-1 sm:h-20"
                      role="img"
                      aria-label={`${day.label}: ${day.progressPercent ?? 0}%`}
                    >
                      <div
                        className={cx(
                          'mx-auto w-full rounded-md',
                          day.status === 'done'
                            ? 'bg-positive'
                            : day.status === 'partial'
                              ? 'bg-primary'
                              : day.status === 'today'
                                ? 'bg-muted-foreground/20'
                                : 'bg-muted'
                        )}
                        style={{ height: `${Math.max(12, day.progressPercent ?? 0)}%` }}
                      />
                    </div>
                    <span className="mt-1 text-[10px] font-semibold text-muted-foreground">
                      {day.label}
                    </span>
                  </div>
                ))
              ) : (
                <p className="w-full text-xs text-muted-foreground">
                  Sem dados do diario para mostrar progresso semanal.
                </p>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.weeklyProgress}% da semana concluida
            </p>
          </div>
        </article>

        <aside className="space-y-3">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Energia de saude</h3>
              <HeartPulse className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div
              className="mt-2 h-2 rounded-full bg-muted"
              role="progressbar"
              aria-label="Energia de saude"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={summary.energyScore}
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${summary.energyScore}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{summary.energyScore}/100</p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  XP da jornada
                </p>
                <p className="mt-1 text-2xl font-bold text-foreground">{summary.xp}</p>
              </div>
              <div className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                {xpToNext} para o proximo alvo
              </div>
            </div>
            <div
              className="mt-3 h-2 rounded-full bg-muted"
              role="progressbar"
              aria-label="XP da jornada"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={summary.xp}
            >
              <div className="h-2 rounded-full bg-amber-500" style={{ width: `${summary.xp}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Conquistas ativas ajudam sua rotina.
            </p>
            <BadgeList badges={summary.badges} />
          </div>
        </aside>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Niveis da jornada</h3>
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-3 space-y-2">
            {summary.levels.map((level) => (
              <button
                type="button"
                key={level.key}
                className={cx(
                  'w-full rounded-lg border border-border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  level.status === 'bloqueado' ? 'opacity-70' : ''
                )}
                aria-label={`${level.label}: ${level.status}, ${level.progress}%`}
                onClick={() => onNavigate(nextAction.tab)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{level.label}</p>
                    <p className="text-xs text-muted-foreground">{level.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Status: {level.status}</p>
                  </div>
                  <span
                    className={cx(
                      'rounded-full px-2 py-1 text-[11px] font-semibold',
                      getLevelProgressClass(level.status)
                    )}
                  >
                    {level.progress}%
                  </span>
                </div>
                <div
                  className="mt-2 h-1.5 rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`Progresso do nivel ${level.label}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={level.progress}
                >
                  <div
                    className={cx(
                      'h-full rounded-full',
                      level.status === 'concluido'
                        ? 'bg-positive'
                        : level.status === 'andamento'
                          ? 'bg-primary'
                          : 'bg-muted-foreground/50'
                    )}
                    style={{ width: `${level.progress}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Proximo nivel: {nextLevel?.label ?? summary.nextLevelLabel}
          </p>
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Missoes semanais</h3>
            <Target className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-3 space-y-2">
            {summary.missions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                onNavigate={onNavigate}
                tabLabel={tabLabelById.get(mission.tab) ?? mission.tab}
              />
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Conquistas</h3>
            <Award className="h-4 w-4 text-amber-500" aria-hidden="true" />
          </div>
          <div className="mt-3 space-y-2">
            {summary.badges.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Acompanhe as conquistas conforme o plano avanca.
              </p>
            ) : null}
            {summary.badges.map((badge) => (
              <div key={badge.name} className="rounded-lg border border-border bg-card p-2">
                <p className="text-sm font-semibold text-foreground">
                  {badge.unlocked ? 'Desbloqueado: ' : 'Bloqueado: '} {badge.name}
                </p>
                <p className="text-xs text-muted-foreground">{badge.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background p-4 md:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Timeline de conquistas</h3>
            <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <EventTimeline events={summary.events} />
        </section>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => onNavigate(nextAction.tab)}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          Entrar na rotina
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
