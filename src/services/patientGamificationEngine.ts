import {
  Activity,
  ClipboardCheck,
  CreditCard,
  FileText,
  HeartPulse,
  MessageSquare,
  RefreshCw,
  Bell,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { PatientDailySnapshot } from '@/services/patientDailyApi';
import type { PatientJourneySnapshot, PatientPortalSnapshot } from '@/services/patientPortalApi';

export type GamificationPortalTab =
  | 'resumo'
  | 'diario'
  | 'jornada'
  | 'beneficios'
  | 'comunidade'
  | 'documentos'
  | 'financeiro'
  | 'chat'
  | 'notificacoes'
  | 'checkins';

export interface GamificationTabShortcut {
  id: GamificationPortalTab;
  label: string;
  shortLabel: string;
}

type GamificationStatus = 'bloqueado' | 'disponivel' | 'andamento' | 'concluido';

interface Tab {
  id: GamificationPortalTab;
  label: string;
}

export interface GamificationAction {
  id: string;
  title: string;
  description: string;
  value: number;
  target: number;
  cta: string;
  tab: GamificationPortalTab;
}

export interface GamificationLevel {
  key: string;
  label: string;
  description: string;
  progress: number;
  status: GamificationStatus;
}

export interface GamificationBadge {
  name: string;
  detail: string;
  unlocked: boolean;
}

export type GamificationNextActionIconKey =
  | 'activity'
  | 'bell'
  | 'clipboard'
  | 'credit-card'
  | 'file'
  | 'heart'
  | 'message'
  | 'refresh';

export interface GamificationNextAction {
  tab: GamificationPortalTab;
  title: string;
  detail: string;
  iconKey: GamificationNextActionIconKey;
  icon: ComponentType<{ className?: string; ['aria-hidden']?: boolean }>;
}

export interface GamificationEvent {
  kind: string;
  score: number;
  key: string;
  reason: string;
  atLabel?: string;
  blockedReason?: string;
  isBlocked?: boolean;
  occurredAt?: number;
}

export interface GamificationSummary {
  today: {
    dateLabel: string;
    waterPercent: number;
    mealPercent: number;
    workoutPercent: number;
    progressPercent: number;
    checkinDone: boolean;
  };
  openInvoices: number;
  openDocuments: number;
  pendingCheckins: number;
  unreadTeamMessages: number;
  unreadNotifications: number;
  weeklyDone: number;
  weeklyTotal: number;
  weeklyProgress: number;
  streakDays: number;
  xp: number;
  energyScore: number;
  levels: GamificationLevel[];
  missions: GamificationAction[];
  badges: GamificationBadge[];
  nextAction: GamificationNextAction;
  nextLevelLabel: string;
  habitCompletedCount: number;
  weeklyWindowKey: string;
  events: GamificationEvent[];
  isPaused: boolean;
  pauseReason?: string;
  fallbackReasons: string[];
}

interface CriticalSummaryOptions {
  title: string;
  detail: string;
}

interface EngineInput {
  snapshot: PatientPortalSnapshot | null;
  journey: PatientJourneySnapshot | null;
  dailySnapshot: PatientDailySnapshot | null;
  tabItems: Tab[];
  dailyLoading: boolean;
  dailyError: string | null;
  now?: Date | string;
}

type RewardSignalKind = 'checkin' | 'document' | 'chat' | 'payment' | 'admin' | 'habit' | 'hygiene';
type RewardRule = {
  score: number;
  cooldownMs: number;
};
type RewardSignal = {
  kind: RewardSignalKind;
  sourceKey: string;
  cooldownBucket: string;
  reason: string;
  at: number;
};

const rewardRules: Record<RewardSignalKind, RewardRule> = {
  checkin: { score: 10, cooldownMs: 6 * 60 * 60 * 1000 },
  document: { score: 8, cooldownMs: 10 * 60 * 1000 },
  chat: { score: 5, cooldownMs: 45 * 60 * 1000 },
  payment: { score: 5, cooldownMs: 4 * 60 * 60 * 1000 },
  admin: { score: 15, cooldownMs: 6 * 60 * 60 * 1000 },
  habit: { score: 10, cooldownMs: 2 * 60 * 60 * 1000 },
  hygiene: { score: 6, cooldownMs: 12 * 60 * 60 * 1000 },
};

const MAX_EVENT_RETENTION = 8;

function isOpenInvoiceStatus(status: string) {
  return !['pago', 'paid', 'confirmed', 'received', 'cancelado', 'cancelled'].includes(
    status.toLowerCase()
  );
}

function isOpenDocumentStatus(status: string) {
  return !['liberado', 'released', 'available', 'aprovado', 'approved'].includes(
    status.toLowerCase()
  );
}

function isRecent(value: string | null | undefined, now: Date, days: number) {
  if (!value) return false;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return false;
  return at >= new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function isOpenNotification(status: string) {
  return status === 'unread';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function getWeekWindowKey(now: Date) {
  const year = now.getFullYear();
  const day = now.getDay();
  const first = new Date(now.getTime());
  first.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
  const weekStart = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  return `${year}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
}

function resolveTab(tab: GamificationPortalTab, tabItems: Tab[]) {
  return tabItems.find((item) => item.id === tab)?.id ?? tabItems[0]?.id ?? 'resumo';
}

function hasCriticalCode(value?: string | null) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return ['critical', 'risk', 'urgente', 'emergencia', 'red', 'alert', 'sos'].some((term) =>
    normalized.includes(term)
  );
}

function isCriticalSnapshot(snapshot: PatientPortalSnapshot | null) {
  if (!snapshot) return false;
  if (hasCriticalCode(snapshot.patient.status)) return true;
  return snapshot.warnings.some(
    (warning) => hasCriticalCode(warning.code) || hasCriticalCode(warning.message)
  );
}

function getCriticalSummary(snapshot: PatientPortalSnapshot): CriticalSummaryOptions {
  const criticalWarning = snapshot.warnings.find(
    (warning) => hasCriticalCode(warning.code) || hasCriticalCode(warning.message)
  );
  if (criticalWarning?.message) {
    return {
      title: 'Atencao clinica prioritaria',
      detail: `Foco em seguranca do atendimento: ${criticalWarning.message}`,
    };
  }

  return {
    title: 'Atencao clinica prioritaria',
    detail:
      'Existem fatores de risco ativos no momento. O progresso da jornada fica em pausa para protecao.',
  };
}

function toDateKey(value?: string | null, now = new Date()) {
  const date = value ? new Date(value) : now;
  if (Number.isNaN(date.getTime()))
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function toDateTimeLabel(value?: number | string | null, now = new Date()) {
  if (!value)
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);
  const parsed = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function toEpoch(value?: string | null): number {
  if (!value) return NaN;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? NaN : date.getTime();
}

function evaluateRewardSignals(signals: RewardSignal[], now: Date) {
  const awardedBySource = new Set<string>();
  const lastByCooldown = new Map<string, number>();
  const nowMs = now.getTime();
  const accepted: GamificationEvent[] = [];
  const blocked: GamificationEvent[] = [];

  signals
    .sort((a, b) => a.at - b.at)
    .forEach((signal) => {
      const rule = rewardRules[signal.kind];
      const sourceKey = signal.sourceKey;
      const eventDate = new Date(signal.at);
      if (!Number.isFinite(signal.at) || Number.isNaN(eventDate.getTime())) {
        blocked.push({
          kind: signal.kind,
          score: 0,
          key: `${sourceKey}-invalid-${signal.at}`,
          reason: signal.reason,
          blockedReason: 'Dado de evento invalido.',
          isBlocked: true,
          atLabel: '',
          occurredAt: nowMs,
        });
        return;
      }

      if (awardedBySource.has(sourceKey)) {
        blocked.push({
          kind: signal.kind,
          score: 0,
          key: `${sourceKey}-blocked-${signal.at}`,
          reason: signal.reason,
          blockedReason: 'Evento duplicado por fonte. So vai uma vez.',
          isBlocked: true,
          atLabel: toDateTimeLabel(signal.at, now),
          occurredAt: signal.at,
        });
        return;
      }

      const lastAward = lastByCooldown.get(signal.cooldownBucket);
      if (typeof lastAward === 'number' && signal.at - lastAward < rule.cooldownMs) {
        blocked.push({
          kind: signal.kind,
          score: 0,
          key: `${sourceKey}-cooldown-${signal.at}`,
          reason: signal.reason,
          blockedReason: 'Ponto bloqueado por cooldown curto.',
          isBlocked: true,
          atLabel: toDateTimeLabel(signal.at, now),
          occurredAt: signal.at,
        });
        return;
      }

      awardedBySource.add(sourceKey);
      lastByCooldown.set(signal.cooldownBucket, signal.at);
      accepted.push({
        kind: signal.kind,
        score: rule.score,
        key: sourceKey,
        reason: signal.reason,
        atLabel: toDateTimeLabel(signal.at, now),
        occurredAt: signal.at,
      });
    });

  const events = [...accepted, ...blocked]
    .sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0))
    .slice(0, MAX_EVENT_RETENTION);

  return {
    events,
    xp: accepted.reduce((sum, event) => sum + event.score, 0),
  };
}

function levelStatus(progress: number, isPreviousDone: boolean) {
  if (progress >= 100) return 'concluido';
  if (!isPreviousDone && progress === 0) return 'bloqueado';
  if (progress > 0) return 'andamento';
  return 'disponivel';
}

function asPercent(numerator: number, divisor: number) {
  if (!divisor) return 0;
  return clamp((numerator / divisor) * 100, 0, 100);
}

function getNowDate(value?: Date | string) {
  return value ? new Date(value) : new Date();
}

export function resolveGamificationNextActionIcon(iconKey?: GamificationNextActionIconKey) {
  switch (iconKey) {
    case 'activity':
      return Activity;
    case 'bell':
      return Bell;
    case 'clipboard':
      return ClipboardCheck;
    case 'credit-card':
      return CreditCard;
    case 'file':
      return FileText;
    case 'heart':
      return HeartPulse;
    case 'message':
      return MessageSquare;
    default:
      return RefreshCw;
  }
}

function getNextAction(args: {
  dailyLoading: boolean;
  dailyError: string | null;
  journey: PatientJourneySnapshot | null;
  dailySnapshot: PatientDailySnapshot | null;
  snapshot: PatientPortalSnapshot | null;
  now: Date;
  openInvoices: number;
  openDocuments: number;
  hasUnreadTeamMessage: boolean;
  hasUnreadNotification: boolean;
  pendingCheckin: boolean;
  tabItems: Tab[];
}) {
  if (args.dailyLoading) {
    return {
      tab: resolveTab('diario', args.tabItems),
      title: 'Sincronizando dados',
      detail: 'Aguarde um instante para atualizarmos sua proxima acao.',
      iconKey: 'refresh',
      icon: RefreshCw,
    } as GamificationNextAction;
  }

  if (args.dailyError) {
    return {
      tab: resolveTab('diario', args.tabItems),
      title: 'Continuar plano do dia',
      detail: 'Atualize para recalcular sua jornada pessoal.',
      iconKey: 'activity',
      icon: Activity,
    } as GamificationNextAction;
  }

  if (
    args.journey?.onboarding.status !== 'completed' &&
    args.journey?.onboarding.status !== undefined
  ) {
    return {
      tab: resolveTab('jornada', args.tabItems),
      title: 'Completar onboarding',
      detail: 'Finalize o fluxo inicial para acessar orientacoes completas.',
      iconKey: 'clipboard',
      icon: ClipboardCheck,
    } as GamificationNextAction;
  }

  if (args.pendingCheckin) {
    return {
      tab: resolveTab('diario', args.tabItems),
      title: 'Fechar rotina diaria',
      detail: 'Registre agua, refeicao e treino para manter a consistencia.',
      iconKey: 'activity',
      icon: Activity,
    } as GamificationNextAction;
  }

  if (args.openInvoices > 0) {
    return {
      tab: resolveTab('financeiro', args.tabItems),
      title: 'Ajustar pendencias financeiras',
      detail: 'Existem faturas em aberto no painel financeiro.',
      iconKey: 'credit-card',
      icon: CreditCard,
    } as GamificationNextAction;
  }

  if (args.openDocuments > 0) {
    return {
      tab: resolveTab('documentos', args.tabItems),
      title: 'Concluir etapa documental',
      detail: 'Revisar documentos pendentes para manter sua jornada no rumo.',
      iconKey: 'file',
      icon: FileText,
    } as GamificationNextAction;
  }

  if (args.hasUnreadTeamMessage) {
    return {
      tab: resolveTab('chat', args.tabItems),
      title: 'Responder equipe',
      detail: 'Voce recebeu atualizacao recente da sua equipe.',
      iconKey: 'message',
      icon: MessageSquare,
    } as GamificationNextAction;
  }

  if (args.hasUnreadNotification) {
    return {
      tab: resolveTab('notificacoes', args.tabItems),
      title: 'Ler aviso',
      detail: 'Existem avisos importantes no painel.',
      iconKey: 'bell',
      icon: Bell,
    } as GamificationNextAction;
  }

  return {
    tab: resolveTab('resumo', args.tabItems),
    title: 'Ir para resumo',
    detail: 'Sem pendencias criticas no momento. Continue no ritmo.',
    iconKey: 'heart',
    icon: HeartPulse,
  } as GamificationNextAction;
}

function buildEvents({
  snapshot,
  journey,
  dailySnapshot,
  now,
  weeklyWindowKey,
}: {
  snapshot: PatientPortalSnapshot | null;
  journey: PatientJourneySnapshot | null;
  dailySnapshot: PatientDailySnapshot | null;
  now: Date;
  weeklyWindowKey: string;
}) {
  const todayWater = Math.min(
    dailySnapshot?.habits.find((habit) => habit.kind === 'water')?.progressPercent ?? 0,
    100
  );
  const todayMeal = Math.min(
    dailySnapshot?.habits.find((habit) => habit.kind === 'meal')?.progressPercent ?? 0,
    100
  );
  const todayWorkout = Math.min(
    dailySnapshot?.habits.find((habit) => habit.kind === 'workout')?.progressPercent ?? 0,
    100
  );
  const habitDone = [todayWater, todayMeal, todayWorkout].filter((value) => value >= 50).length;
  const streakDays = Math.min(dailySnapshot?.streakDays ?? 0, 14);
  const checkinDone = Boolean(dailySnapshot?.checkinDone);

  const todayKey = toDateKey(now.toISOString(), now);
  const documentsToday =
    snapshot?.documents.filter(
      (document) =>
        typeof document.generatedAt === 'string' &&
        toDateKey(document.generatedAt, now) === todayKey
    ) ?? [];
  const paymentsThisWeek =
    snapshot?.invoices.filter((invoice) => invoice.paidAt && isRecent(invoice.paidAt, now, 7)) ??
    [];
  const hasTeamMessage = snapshot?.chat.messages
    .filter((message) => !message.isOwn && typeof message.createdAt === 'string')
    .filter((message) => isRecent(message.createdAt, now, 7))
    .sort((a, b) => {
      const atA = toEpoch(a.createdAt);
      const atB = toEpoch(b.createdAt);
      if (!Number.isFinite(atA) || !Number.isFinite(atB)) return 0;
      return atB - atA;
    })[0];
  const openInvoice =
    snapshot?.invoices.filter((invoice) => isOpenInvoiceStatus(invoice.status)).length ?? 0;
  const signals: RewardSignal[] = [];
  const nowMs = now.getTime();

  if (checkinDone) {
    signals.push({
      kind: 'checkin',
      sourceKey: `checkin:${todayKey}`,
      cooldownBucket: `checkin:${todayKey}`,
      reason: 'Check-in diario concluido',
      at: nowMs,
    });
  }

  documentsToday.forEach((document) => {
    const at = toEpoch(document.generatedAt) || nowMs;
    signals.push({
      kind: 'document',
      sourceKey: `document:${document.id}`,
      cooldownBucket: `document:${toDateKey(document.generatedAt, now)}:${document.id}`,
      reason: `Documento registrado: ${document.name}`,
      at,
    });
  });

  if (hasTeamMessage?.createdAt) {
    signals.push({
      kind: 'chat',
      sourceKey: `chat:${hasTeamMessage.id}`,
      cooldownBucket: `chat:${toDateKey(hasTeamMessage.createdAt, now)}`,
      reason: 'Interacao recente com a equipe',
      at: toEpoch(hasTeamMessage.createdAt) || nowMs,
    });
  }

  paymentsThisWeek.forEach((invoice) => {
    const at = toEpoch(invoice.paidAt);
    signals.push({
      kind: 'payment',
      sourceKey: `payment:${invoice.id}`,
      cooldownBucket: `payment:${weeklyWindowKey}`,
      reason: 'Pagamento em dia',
      at: Number.isFinite(at) ? at : nowMs,
    });
  });

  if (openInvoice === 0) {
    signals.push({
      kind: 'admin',
      sourceKey: `admin:${todayKey}`,
      cooldownBucket: `admin:${todayKey}`,
      reason: 'Documento e financeiro em dia',
      at: nowMs,
    });
  }

  if (habitDone >= 2) {
    signals.push({
      kind: 'habit',
      sourceKey: `habit:${todayKey}:${habitDone}`,
      cooldownBucket: `habit:${todayKey}`,
      reason: '2+ habitos do dia completos',
      at: nowMs,
    });
  }

  if (journey?.onboarding.status === 'completed' && snapshot?.notifications.length === 0) {
    signals.push({
      kind: 'hygiene',
      sourceKey: `hygiene:${weeklyWindowKey}`,
      cooldownBucket: `hygiene:${weeklyWindowKey}`,
      reason: 'Status de rotina e notificacoes equilibrado',
      at: nowMs,
    });
  }

  const evaluated = evaluateRewardSignals(signals, now);

  return {
    events: evaluated.events,
    streakDays,
    documentsToday: documentsToday.length,
    habitDone,
    paymentsThisWeek: paymentsThisWeek.length,
    hasReadMessage: Boolean(hasTeamMessage),
    xpFromSignals: evaluated.xp,
  };
}

function clampLevelProgress(value: number) {
  return clamp(value, 0, 100);
}

export function buildPatientGamificationState(input: EngineInput): GamificationSummary {
  const now = getNowDate(input.now);
  const snapshot = input.snapshot;
  const journey = input.journey;
  const dailySnapshot = input.dailySnapshot;
  const weeklyWindowKey = getWeekWindowKey(now);
  const fallbackReasons = [
    input.dailyError ? 'Diario temporariamente indisponivel.' : null,
    snapshot && !dailySnapshot ? 'Resumo diario calculado com dados parciais.' : null,
    snapshot && !journey ? 'Jornada calculada sem snapshot completo de onboarding.' : null,
    (journey?.onboarding.pendingReviewCount ?? 0) > 0
      ? 'Alguns dados do perfil ainda aguardam revisao da equipe.'
      : null,
    ...(snapshot?.warnings.map((warning) => warning.message) ?? []),
  ].filter((reason): reason is string => Boolean(reason));

  if (!snapshot) {
    return {
      today: {
        dateLabel: '',
        waterPercent: 0,
        mealPercent: 0,
        workoutPercent: 0,
        progressPercent: 0,
        checkinDone: false,
      },
      openInvoices: 0,
      openDocuments: 0,
      pendingCheckins: 0,
      unreadTeamMessages: 0,
      unreadNotifications: 0,
      weeklyDone: 0,
      weeklyTotal: 0,
      weeklyProgress: 0,
      streakDays: 0,
      xp: 0,
      energyScore: 0,
      levels: [],
      missions: [],
      badges: [],
      nextAction: {
        tab: 'resumo',
        title: 'Iniciar portal',
        detail: 'Aguardando dados do paciente.',
        iconKey: 'refresh',
        icon: RefreshCw,
      },
      nextLevelLabel: 'Inicio',
      habitCompletedCount: 0,
      weeklyWindowKey,
      events: [],
      isPaused: false,
      fallbackReasons,
    };
  }

  if (isCriticalSnapshot(snapshot)) {
    const critical = getCriticalSummary(snapshot);
    return {
      today: {
        dateLabel: '',
        waterPercent: 0,
        mealPercent: 0,
        workoutPercent: 0,
        progressPercent: 0,
        checkinDone: false,
      },
      openInvoices: 0,
      openDocuments: 0,
      pendingCheckins: 0,
      unreadTeamMessages: 0,
      unreadNotifications: 0,
      weeklyDone: 0,
      weeklyTotal: 0,
      weeklyProgress: 0,
      streakDays: 0,
      xp: 0,
      energyScore: 0,
      levels: [
        {
          key: 'inicio',
          label: 'Inicio',
          description: critical.title,
          progress: 0,
          status: 'bloqueado',
        },
      ],
      missions: [
        {
          id: 'mission-critical',
          title: 'Atencao clinica',
          description: critical.detail,
          value: 0,
          target: 1,
          cta: 'Acompanhar comunicacao',
          tab: resolveTab('chat', input.tabItems),
        },
      ],
      badges: [],
      nextAction: {
        tab: resolveTab('chat', input.tabItems),
        title: 'Atencao prioritaria',
        detail: critical.detail,
        iconKey: 'message',
        icon: MessageSquare,
      },
      nextLevelLabel: 'Pausa por seguranca',
      habitCompletedCount: 0,
      weeklyWindowKey,
      events: [],
      isPaused: true,
      pauseReason: critical.detail,
      fallbackReasons,
    };
  }

  const openInvoices = snapshot.invoices.filter((invoice) =>
    isOpenInvoiceStatus(invoice.status)
  ).length;
  const openDocuments = snapshot.documents.filter((document) =>
    isOpenDocumentStatus(document.status)
  ).length;
  const unreadNotifications = snapshot.notifications.filter((notification) =>
    isOpenNotification(notification.status)
  ).length;
  const unreadTeamMessages = snapshot.chat.messages.filter(
    (message) => !message.isOwn && isRecent(message.createdAt, now, 7)
  ).length;
  const pendingCheckins = snapshot.checkins.filter(
    (checkin) => checkin.status !== 'completed' && checkin.status !== 'canceled'
  ).length;

  const todayWaterPercent =
    dailySnapshot?.habits.find((habit) => habit.kind === 'water')?.progressPercent ?? 0;
  const todayMealPercent =
    dailySnapshot?.habits.find((habit) => habit.kind === 'meal')?.progressPercent ?? 0;
  const todayWorkoutPercent =
    dailySnapshot?.habits.find((habit) => habit.kind === 'workout')?.progressPercent ?? 0;
  const habitCompletedCount = [todayWaterPercent, todayMealPercent, todayWorkoutPercent].filter(
    (value) => value >= 50
  ).length;

  const weeklyDone = dailySnapshot?.week.filter((day) => day.status === 'done').length ?? 0;
  const weeklyTotal = dailySnapshot?.week.length ?? 0;
  const weeklyProgress = weeklyTotal > 0 ? clamp((weeklyDone / weeklyTotal) * 100, 0, 100) : 0;
  const streakDays = Math.min(dailySnapshot?.streakDays ?? 0, 14);

  const checkinRate =
    snapshot.checkins.length > 0
      ? Math.round(
          (snapshot.checkins.filter((checkin) => checkin.status === 'completed').length /
            snapshot.checkins.length) *
            100
        )
      : 95;
  const habitScore = Math.round((todayWaterPercent + todayMealPercent + todayWorkoutPercent) / 3);
  const adherenceScore = clamp(
    habitScore * 0.45 + weeklyProgress * 0.25 + Math.min(14, streakDays) * 1.8 + checkinRate * 0.15,
    0,
    100
  );
  const energyScore = clamp(
    adherenceScore * 0.55 +
      Math.max(0, 100 - openInvoices * 12) * 0.3 +
      (unreadNotifications ? 5 : 20),
    0,
    100
  );

  const built = buildEvents({
    snapshot,
    journey,
    dailySnapshot,
    now,
    weeklyWindowKey,
  });

  let xp = streakDays * 2 + (built.xpFromSignals ?? 0);
  xp = clamp(xp, 0, 100);

  const onboardingProgress =
    journey?.onboarding.status === 'completed' ? 100 : (journey?.onboarding.progressPercent ?? 0);
  const routineProgress = Math.round(
    ((habitCompletedCount + (dailySnapshot?.checkinDone ? 1 : 0)) / 4) * 100
  );
  const connectionProgress = clamp(
    100 -
      openDocuments * 10 -
      openInvoices * 12 +
      (unreadTeamMessages ? 30 : 0) +
      (unreadNotifications > 0 ? -15 : 20),
    0,
    100
  );
  const adherenceTarget = clamp(adherenceScore * 0.9 + checkinRate * 0.1, 0, 100);
  const evolutionProgress = clamp(
    20 + (journey?.history?.length ?? 0) * 4 + (journey?.medicationReminders?.length ?? 0) * 5,
    0,
    100
  );

  const level2Unlocked = onboardingProgress >= 35 || onboardingProgress >= 100;
  const level3Unlocked = level2Unlocked && connectionProgress > 0;
  const level4Unlocked = level3Unlocked && adherenceTarget > 0;
  const level5Unlocked = level4Unlocked && evolutionProgress > 0;

  const levels: GamificationLevel[] = [
    {
      key: 'inicio',
      label: 'Inicio',
      description: 'Onboarding do paciente concluido.',
      progress: onboardingProgress,
      status: levelStatus(onboardingProgress, true),
    },
    {
      key: 'rotina',
      label: 'Rotina',
      description: 'Check-ins e rotina diaria.',
      progress: clampLevelProgress(routineProgress),
      status: levelStatus(routineProgress, level2Unlocked),
    },
    {
      key: 'conexao',
      label: 'Conexao',
      description: 'Comunicacao ativa com a equipe.',
      progress: connectionProgress,
      status: levelStatus(connectionProgress, level3Unlocked),
    },
    {
      key: 'adesao',
      label: 'Adesao',
      description: 'Meta semanal sustentada.',
      progress: adherenceTarget,
      status: levelStatus(adherenceTarget, level4Unlocked),
    },
    {
      key: 'evolucao',
      label: 'Evolucao',
      description: 'Progresso com base em atividades.',
      progress: evolutionProgress,
      status: levelStatus(evolutionProgress, level5Unlocked),
    },
  ];

  const missions: GamificationAction[] = [
    {
      id: 'mission-habits',
      title: 'Missao rotina',
      description: 'Concluir 2 dos 3 habitos diarios.',
      value: habitCompletedCount,
      target: 2,
      cta: 'Completar rotina',
      tab: resolveTab('diario', input.tabItems),
    },
    {
      id: 'mission-admin',
      title: 'Missao administrativa',
      description:
        openInvoices > 0
          ? 'Ajustar faturas pendentes para manter financeiro em dia.'
          : 'Carteira e notificacoes administrativas em ordem.',
      value: openInvoices === 0 ? 1 : 0,
      target: 1,
      cta: 'Revisar financeiro',
      tab: resolveTab('financeiro', input.tabItems),
    },
    {
      id: 'mission-well',
      title: 'Missao bem-estar',
      description:
        unreadTeamMessages > 0
          ? 'Conexao ativa com equipe marcada.'
          : 'Abrir o chat e registrar mensagem no plano.',
      value: unreadTeamMessages > 0 ? 1 : 0,
      target: 1,
      cta: 'Abrir chat',
      tab: resolveTab('chat', input.tabItems),
    },
  ];

  const badges: GamificationBadge[] = [
    { name: 'Primeira semana', detail: '7 dias consecutivos', unlocked: streakDays >= 7 },
    { name: 'Constante', detail: '3 dias de consistencia', unlocked: streakDays >= 3 },
    {
      name: 'Respira melhor',
      detail: 'Habito de agua e refeicao em dia',
      unlocked: todayWaterPercent >= 70 && todayMealPercent >= 50,
    },
    {
      name: 'Agenda em dia',
      detail: 'Financeiro e avisos sem pendencia',
      unlocked:
        openInvoices === 0 &&
        unreadNotifications === 0 &&
        snapshot.notifications.every((n) => n.status !== 'unread'),
    },
    {
      name: 'Equipe alinhada',
      detail: 'Interacao recente com a equipe',
      unlocked: unreadTeamMessages > 0 && (journey?.onboarding?.pendingReviewCount ?? 0) === 0,
    },
  ];

  const nextAction = getNextAction({
    dailyLoading: input.dailyLoading,
    dailyError: input.dailyError,
    journey,
    dailySnapshot,
    snapshot,
    now,
    openInvoices,
    openDocuments,
    hasUnreadTeamMessage: unreadTeamMessages > 0,
    hasUnreadNotification: unreadNotifications > 0,
    pendingCheckin:
      !dailySnapshot?.checkinDone &&
      (dailySnapshot?.checkinRequired ||
        snapshot?.checkins.some(
          (checkin) => checkin.status !== 'completed' && checkin.status !== 'canceled'
        )),
    tabItems: input.tabItems,
  });

  return {
    today: {
      dateLabel: dailySnapshot?.dateLabel ?? now.toLocaleDateString('pt-BR'),
      waterPercent: todayWaterPercent,
      mealPercent: todayMealPercent,
      workoutPercent: todayWorkoutPercent,
      progressPercent: dailySnapshot?.progressPercent ?? 0,
      checkinDone: dailySnapshot?.checkinDone ?? false,
    },
    openInvoices,
    openDocuments,
    pendingCheckins,
    unreadTeamMessages,
    unreadNotifications,
    weeklyDone,
    weeklyTotal,
    weeklyProgress: asPercent(weeklyDone, weeklyTotal),
    streakDays,
    xp,
    energyScore,
    levels,
    missions,
    badges,
    nextAction,
    nextLevelLabel:
      levels.find((level) => level.status !== 'concluido')?.label ?? 'Conquista completa',
    habitCompletedCount,
    weeklyWindowKey,
    events: built.events,
    isPaused: false,
    fallbackReasons,
  };
}
