'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Camera,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Dumbbell,
  Droplets,
  Flame,
  MessageSquare,
  Minus,
  Plus,
  RotateCcw,
  Utensils,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import DataState from '@/components/ui/DataState';
import Dialog from '@/components/ui/Dialog';
import { cx } from '@/components/ui/utils';
import {
  buildPatientDailySnapshot,
  createPatientDailyLocalEntry,
  type PatientDailyAction,
  type PatientDailyEntry,
  type PatientDailyEntryKind,
  type PatientDailyHabit,
} from '@/services/patientDailyApi';
import type { PatientPortalSnapshot } from '@/services/patientPortalApi';

interface DailyPortalSectionProps {
  snapshot: PatientPortalSnapshot;
  initialAction?: PatientDailyAction | null;
  onInitialActionConsumed?: () => void;
  onOpenChat: () => void;
  onOpenCheckins: () => void;
  onActionMessage: (message: string) => void;
}

const habitIcons: Record<PatientDailyEntryKind, LucideIcon> = {
  water: Droplets,
  meal: Utensils,
  workout: Dumbbell,
  checkin: ClipboardCheck,
};

const quickActions: Array<{
  id: PatientDailyAction;
  label: string;
  description: string;
  icon: LucideIcon;
  className: string;
}> = [
  {
    id: 'water',
    label: 'Agua',
    description: '+250 ml agora',
    icon: Droplets,
    className: 'bg-blue-50 text-blue-700',
  },
  {
    id: 'meal',
    label: 'Refeicao',
    description: 'Foto opcional',
    icon: Utensils,
    className: 'bg-emerald-50 text-emerald-700',
  },
  {
    id: 'workout',
    label: 'Treino',
    description: 'Curto e direto',
    icon: Dumbbell,
    className: 'bg-slate-100 text-slate-700',
  },
  {
    id: 'checkin',
    label: 'Check-in',
    description: 'Escala 1 a 5',
    icon: ClipboardCheck,
    className: 'bg-amber-50 text-amber-700',
  },
  {
    id: 'message',
    label: 'Mensagem',
    description: 'Abrir chat',
    icon: MessageSquare,
    className: 'bg-primary/10 text-primary',
  },
];

const mealTypes = ['Cafe', 'Almoco', 'Jantar', 'Lanche'];
const scaleOptions = [
  { value: 1, label: '1 baixo' },
  { value: 2, label: '2 leve' },
  { value: 3, label: '3 medio' },
  { value: 4, label: '4 bom' },
  { value: 5, label: '5 alto' },
];

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Agora';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function getStatusLabel(status: PatientDailyEntry['status']) {
  if (status === 'pending') return 'Pendente de sincronizacao';
  if (status === 'failed') return 'Falhou';
  return 'Do programa';
}

function getHabitStatusClass(habit: PatientDailyHabit) {
  if (habit.status === 'done') return 'bg-positive text-white';
  if (habit.status === 'partial') return 'bg-primary/10 text-primary';
  if (habit.status === 'pending') return 'bg-warning/10 text-warning';
  if (habit.status === 'not_configured') return 'bg-muted text-muted-foreground';
  return 'bg-muted text-muted-foreground';
}

function HabitRow({
  habit,
  onAction,
}: {
  habit: PatientDailyHabit;
  onAction: (kind: PatientDailyEntryKind) => void;
}) {
  const Icon = habitIcons[habit.kind];

  return (
    <button
      type="button"
      onClick={() => onAction(habit.kind)}
      className="flex min-h-16 w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          getHabitStatusClass(habit)
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-foreground">{habit.label}</span>
          <span className="text-sm font-bold tabular-nums text-foreground">{habit.value}</span>
        </span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-primary"
            style={{ width: `${habit.progressPercent}%` }}
          />
        </span>
        <span className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate">{habit.helper}</span>
          <span className="shrink-0">{habit.target}</span>
        </span>
      </span>
    </button>
  );
}

export default function DailyPortalSection({
  snapshot,
  initialAction,
  onInitialActionConsumed,
  onOpenChat,
  onOpenCheckins,
  onActionMessage,
}: DailyPortalSectionProps) {
  const [localEntries, setLocalEntries] = useState<PatientDailyEntry[]>([]);
  const [activeAction, setActiveAction] = useState<PatientDailyAction | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [waterAmount, setWaterAmount] = useState(250);
  const [mealType, setMealType] = useState(mealTypes[0]);
  const [mealNotes, setMealNotes] = useState('');
  const [mealPhotoName, setMealPhotoName] = useState('');
  const [workoutTitle, setWorkoutTitle] = useState('');
  const [workoutMinutes, setWorkoutMinutes] = useState(30);
  const [workoutIntensity, setWorkoutIntensity] = useState('Moderado');
  const [checkinMood, setCheckinMood] = useState(3);
  const [checkinEnergy, setCheckinEnergy] = useState(3);
  const [checkinSymptoms, setCheckinSymptoms] = useState('');

  const daily = useMemo(
    () => buildPatientDailySnapshot(snapshot, localEntries),
    [snapshot, localEntries]
  );
  const lastWorkout = useMemo(
    () =>
      [...localEntries]
        .reverse()
        .find((entry) => entry.kind === 'workout' && entry.metadata?.workoutTitle),
    [localEntries]
  );
  const hasActiveProgram = ['active', 'ativo'].includes(snapshot.patient.status.toLowerCase());

  useEffect(() => {
    if (typeof navigator === 'undefined') return;

    const updateOnline = () => setIsOnline(navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!initialAction) return;
    if (initialAction === 'message') {
      onOpenChat();
    } else {
      setActiveAction(initialAction);
    }
    onInitialActionConsumed?.();
  }, [initialAction, onInitialActionConsumed, onOpenChat]);

  function resetMealForm() {
    setMealType(mealTypes[0]);
    setMealNotes('');
    setMealPhotoName('');
  }

  function resetWorkoutForm() {
    setWorkoutTitle('');
    setWorkoutMinutes(30);
    setWorkoutIntensity('Moderado');
  }

  function resetCheckinForm() {
    setCheckinMood(3);
    setCheckinEnergy(3);
    setCheckinSymptoms('');
  }

  function addLocalEntry(kind: PatientDailyEntryKind, input = {}) {
    const entry = createPatientDailyLocalEntry(kind, input);
    setLocalEntries((current) => [...current, entry]);
    setActiveAction(null);
    onActionMessage(
      `${entry.title} registrado localmente. Sincronizacao real depende do contrato backend M01.`
    );

    if (kind === 'meal') resetMealForm();
    if (kind === 'workout') resetWorkoutForm();
    if (kind === 'checkin') resetCheckinForm();
  }

  function handleQuickAction(action: PatientDailyAction) {
    if (action === 'message') {
      onOpenChat();
      return;
    }

    if (action === 'water') {
      addLocalEntry('water', { amountMl: 250 });
      return;
    }

    setActiveAction(action);
  }

  function handleUndoEntry(entryId: string) {
    setLocalEntries((current) => current.filter((entry) => entry.id !== entryId));
    onActionMessage('Registro local desfeito antes da sincronizacao.');
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Diario de hoje
            </p>
            <h2 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">
              {daily.dateLabel}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Agua, refeicoes, treino e check-in em uma rotina curta para celular.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(var(--primary) ${daily.progressPercent}%, var(--muted) 0)`,
              }}
              role="progressbar"
              aria-valuenow={daily.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso do diario"
            >
              <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-card">
                <span className="text-xl font-bold tabular-nums text-foreground">
                  {daily.progressPercent}%
                </span>
                <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                  hoje
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-warning" aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">
                  {daily.streakDays} dia{daily.streakDays === 1 ? '' : 's'} em sequencia
                </p>
              </div>
              <div className="mt-2 flex gap-1.5" aria-label="Resumo semanal">
                {daily.week.map((day) => (
                  <span
                    key={day.isoDate}
                    className={cx(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold uppercase',
                      day.status === 'done'
                        ? 'bg-positive text-white'
                        : day.status === 'partial'
                          ? 'bg-primary/10 text-primary'
                          : day.status === 'today'
                            ? 'bg-muted text-foreground'
                            : 'bg-muted/60 text-muted-foreground'
                    )}
                    title={day.isoDate}
                  >
                    {day.label.slice(0, 3)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {!hasActiveProgram ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="font-semibold">Sem plano ativo confirmado</p>
            <p className="mt-1 text-muted-foreground">
              O diario continua visivel, mas metas reais precisam vir do programa ativo.
            </p>
          </div>
        </div>
      ) : null}

      {!isOnline ? (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-semibold">Sem internet agora</p>
            <p className="mt-1 text-muted-foreground">
              Os registros locais podem ser desfeitos. A sincronizacao real depende do backend M01.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Hoje</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Metas default ate o contrato de habitos trazer metas por programa.
              </p>
            </div>
            <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-4 divide-y divide-border">
            {daily.habits.map((habit) => (
              <HabitRow key={habit.kind} habit={habit} onAction={(kind) => setActiveAction(kind)} />
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Acoes rapidas</h3>
              <p className="mt-1 text-sm text-muted-foreground">Fluxos comuns em poucos toques.</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-positive" aria-hidden="true" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleQuickAction(action.id)}
                  className="min-h-24 rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${action.label}: ${action.description}`}
                >
                  <span
                    className={cx(
                      'flex h-10 w-10 items-center justify-center rounded-lg',
                      action.className
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="mt-3 block text-sm font-semibold text-foreground">
                    {action.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {action.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Timeline diaria</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Ordem cronologica do que foi registrado hoje.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            Pendente de backend
          </span>
        </div>

        {!daily.checkinRequired ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
            Nenhum check-in do programa foi configurado para este vinculo.
          </div>
        ) : null}

        {daily.timeline.length === 0 ? (
          <DataState
            kind="empty"
            title="Nada no diario ainda"
            description="Comece por agua em um toque ou registre refeicao, treino e check-in quando fizer sentido."
            className="mt-4 bg-background"
          />
        ) : (
          <div className="mt-4 divide-y divide-border">
            {daily.timeline.map((entry) => {
              const Icon = habitIcons[entry.kind];
              return (
                <article key={entry.id} className="flex gap-3 py-3">
                  <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {entry.title}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{entry.detail}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatTime(entry.occurredAt)}</span>
                        <span className="rounded-lg bg-muted px-2 py-1 font-semibold">
                          {getStatusLabel(entry.status)}
                        </span>
                      </div>
                    </div>
                    {entry.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => handleUndoEntry(entry.id)}
                        className="btn-ghost mt-2 min-h-9 px-2 py-1.5 text-xs"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Desfazer
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Dialog
        open={activeAction === 'water'}
        title="Ajustar agua"
        description="Agua rapida soma 250 ml; use este ajuste quando precisar corrigir."
        onOpenChange={(open) => setActiveAction(open ? 'water' : null)}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary justify-center"
              onClick={() => setActiveAction(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary justify-center"
              onClick={() => addLocalEntry('water', { amountMl: waterAmount })}
            >
              <Droplets className="h-4 w-4" aria-hidden="true" />
              Salvar agua
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              className="btn-secondary h-11 w-11 justify-center p-0"
              onClick={() => setWaterAmount((current) => Math.max(50, current - 50))}
              aria-label="Diminuir agua"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <label className="min-w-36 text-center text-sm font-medium text-foreground">
              Mililitros
              <input
                type="number"
                min={50}
                max={3000}
                step={50}
                value={waterAmount}
                onChange={(event) => setWaterAmount(Number(event.target.value))}
                className="input-base mt-2 text-center text-lg font-bold"
              />
            </label>
            <button
              type="button"
              className="btn-secondary h-11 w-11 justify-center p-0"
              onClick={() => setWaterAmount((current) => Math.min(3000, current + 50))}
              aria-label="Aumentar agua"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[250, 500, 750].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setWaterAmount(amount)}
                className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
              >
                {amount} ml
              </button>
            ))}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={activeAction === 'meal'}
        title="Registrar refeicao"
        description="A foto e opcional neste corte; upload privado entra no backend M01."
        onOpenChange={(open) => setActiveAction(open ? 'meal' : null)}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary justify-center"
              onClick={() => setActiveAction(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary justify-center"
              onClick={() =>
                addLocalEntry('meal', {
                  mealType,
                  notes: mealNotes,
                  photoName: mealPhotoName,
                })
              }
            >
              <Utensils className="h-4 w-4" aria-hidden="true" />
              Salvar refeicao
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground">Tipo</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {mealTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMealType(type)}
                  className={cx(
                    'min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold',
                    mealType === type
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  )}
                  aria-pressed={mealType === type}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm font-medium text-foreground">
            Observacao curta
            <textarea
              value={mealNotes}
              onChange={(event) => setMealNotes(event.target.value)}
              rows={3}
              maxLength={180}
              className="input-base mt-2 min-h-24"
              placeholder="Ex.: prato completo, fome controlada, sem beliscar."
            />
          </label>
          <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-background p-3 text-sm text-foreground">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Camera className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Foto opcional</span>
              <span className="block truncate text-muted-foreground">
                {mealPhotoName || 'Usa camera no mobile quando suportado.'}
              </span>
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(event) => setMealPhotoName(event.target.files?.[0]?.name ?? '')}
            />
          </label>
        </div>
      </Dialog>

      <Dialog
        open={activeAction === 'workout'}
        title="Registrar treino"
        description="Formulario curto para nao travar a rotina no celular."
        onOpenChange={(open) => setActiveAction(open ? 'workout' : null)}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary justify-center"
              onClick={() => setActiveAction(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary justify-center"
              onClick={() =>
                addLocalEntry('workout', {
                  workoutTitle,
                  durationMinutes: workoutMinutes,
                  intensity: workoutIntensity,
                })
              }
            >
              <Dumbbell className="h-4 w-4" aria-hidden="true" />
              Salvar treino
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {lastWorkout ? (
            <button
              type="button"
              className="btn-secondary w-full justify-center"
              onClick={() =>
                addLocalEntry('workout', {
                  workoutTitle: String(lastWorkout.metadata?.workoutTitle ?? lastWorkout.title),
                  durationMinutes: Number(lastWorkout.metadata?.durationMinutes ?? 30),
                  intensity: String(lastWorkout.metadata?.intensity ?? 'Moderado'),
                })
              }
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Repetir ultimo treino
            </button>
          ) : null}
          <label className="block text-sm font-medium text-foreground">
            Treino
            <input
              type="text"
              value={workoutTitle}
              onChange={(event) => setWorkoutTitle(event.target.value)}
              maxLength={80}
              className="input-base mt-2"
              placeholder="Ex.: musculacao A, caminhada, funcional"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-foreground">
              Minutos
              <input
                type="number"
                min={1}
                max={360}
                value={workoutMinutes}
                onChange={(event) => setWorkoutMinutes(Number(event.target.value))}
                className="input-base mt-2"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Intensidade
              <select
                value={workoutIntensity}
                onChange={(event) => setWorkoutIntensity(event.target.value)}
                className="input-base mt-2"
              >
                <option>Leve</option>
                <option>Moderado</option>
                <option>Intenso</option>
              </select>
            </label>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={activeAction === 'checkin'}
        title="Check-in diario"
        description="Escalas com texto para nao depender apenas de cor."
        onOpenChange={(open) => setActiveAction(open ? 'checkin' : null)}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary justify-center"
              onClick={() => {
                setActiveAction(null);
                onOpenCheckins();
              }}
            >
              Responder programa
            </button>
            <button
              type="button"
              className="btn-primary justify-center"
              onClick={() =>
                addLocalEntry('checkin', {
                  mood: checkinMood,
                  energy: checkinEnergy,
                  symptoms: checkinSymptoms,
                })
              }
            >
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Salvar check-in
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm font-medium text-foreground">Humor</legend>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {scaleOptions.map((option) => (
                <label
                  key={option.value}
                  className={cx(
                    'flex min-h-12 cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-xs font-semibold',
                    checkinMood === option.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground'
                  )}
                >
                  <input
                    type="radio"
                    name="daily-mood"
                    value={option.value}
                    checked={checkinMood === option.value}
                    onChange={() => setCheckinMood(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium text-foreground">Energia</legend>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {scaleOptions.map((option) => (
                <label
                  key={option.value}
                  className={cx(
                    'flex min-h-12 cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-xs font-semibold',
                    checkinEnergy === option.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground'
                  )}
                >
                  <input
                    type="radio"
                    name="daily-energy"
                    value={option.value}
                    checked={checkinEnergy === option.value}
                    onChange={() => setCheckinEnergy(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-medium text-foreground">
            Sintomas ou observacao
            <textarea
              value={checkinSymptoms}
              onChange={(event) => setCheckinSymptoms(event.target.value)}
              rows={3}
              maxLength={180}
              className="input-base mt-2 min-h-24"
              placeholder="Opcional. Evite detalhes sensiveis sem necessidade."
            />
          </label>
        </div>
      </Dialog>
    </div>
  );
}
