'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BellRing,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Flag,
  HeartPulse,
  LockKeyhole,
  Pill,
  RefreshCw,
  ShieldCheck,
  Target,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import DataState from '@/components/ui/DataState';
import { cx } from '@/components/ui/utils';
import type {
  PatientJourneyPlanItem,
  PatientJourneySnapshot,
  PatientOnboardingStep,
  PatientPortalSnapshot,
  SafeServiceError,
} from '@/services/patientPortalApi';

type JourneyActionTab = 'diario' | 'checkins' | 'documentos' | 'financeiro' | 'chat' | 'jornada';

interface PatientJourneySectionProps {
  snapshot: PatientPortalSnapshot;
  journey: PatientJourneySnapshot | null;
  loading: boolean;
  error: SafeServiceError | null;
  busy: boolean;
  onReload: () => void;
  onSaveStep: (
    step: PatientOnboardingStep,
    payload: Record<string, unknown>,
    finish?: boolean
  ) => Promise<boolean>;
  onOpenTab: (tab: JourneyActionTab) => void;
}

interface ProfileForm {
  preferredName: string;
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
}

interface GoalForm {
  waterGoalMl: number;
  mealsGoal: number;
  workoutsGoal: number;
  sleepGoalHours: number;
  programGoal: string;
}

interface RoutineForm {
  trainingWindow: string;
  sleepWindow: string;
  contactWindow: string;
}

interface ReminderForm {
  reminderId: string;
  title: string;
  medicationLabel: string;
  dosage: string;
  instructions: string;
  scheduleTimes: string[];
  externalNotificationConsent: boolean;
  status: 'active' | 'paused';
}

interface ConsentForm {
  reviewQueueAcknowledged: boolean;
  genericReminderConsent: boolean;
}

const steps: Array<{
  id: PatientOnboardingStep;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: 'profile',
    label: 'Perfil',
    description: 'Dados de contato',
    icon: UserRound,
  },
  {
    id: 'goals',
    label: 'Metas',
    description: 'Rotina diaria',
    icon: Target,
  },
  {
    id: 'routine',
    label: 'Rotina',
    description: 'Janelas e preferencias',
    icon: CalendarCheck,
  },
  {
    id: 'reminders',
    label: 'Lembretes',
    description: 'Horarios simples',
    icon: Pill,
  },
  {
    id: 'consent',
    label: 'Revisao',
    description: 'Finalizacao segura',
    icon: ShieldCheck,
  },
];

const defaultProfileForm: ProfileForm = {
  preferredName: '',
  fullName: '',
  email: '',
  phone: '',
  birthDate: '',
};

const defaultGoalForm: GoalForm = {
  waterGoalMl: 2000,
  mealsGoal: 4,
  workoutsGoal: 1,
  sleepGoalHours: 8,
  programGoal: '',
};

const defaultRoutineForm: RoutineForm = {
  trainingWindow: 'manha',
  sleepWindow: '22:30',
  contactWindow: 'manha',
};

const defaultReminderForm: ReminderForm = {
  reminderId: '',
  title: 'Lembrete do tratamento',
  medicationLabel: '',
  dosage: '',
  instructions: '',
  scheduleTimes: ['08:00'],
  externalNotificationConsent: false,
  status: 'active',
};

const defaultConsentForm: ConsentForm = {
  reviewQueueAcknowledged: true,
  genericReminderConsent: false,
};

function formatDate(value?: string | null) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

function formatPlanAction(item: PatientJourneyPlanItem) {
  if (item.kind === 'checkin') return 'Responder';
  if (item.kind === 'medication') return 'Ajustar';
  if (item.kind === 'daily') return 'Abrir diario';
  return 'Abrir';
}

function getStepIndex(step: string) {
  const index = steps.findIndex((item) => item.id === step);
  return index >= 0 ? index : 0;
}

function getNextStep(step: PatientOnboardingStep) {
  return steps[Math.min(getStepIndex(step) + 1, steps.length - 1)].id;
}

function isTime(value: string) {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

function sanitizeScheduleTimes(times: string[]) {
  return Array.from(new Set(times.map((time) => time.trim()).filter(isTime))).slice(0, 8);
}

function CollapsibleSection({
  title,
  description,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="rounded-lg border border-border bg-background" open={defaultOpen}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">{title}</span>
            {description ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {description}
              </span>
            ) : null}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}

function StepButton({
  step,
  active,
  completed,
  onClick,
}: {
  step: (typeof steps)[number];
  active: boolean;
  completed: boolean;
  onClick: () => void;
}) {
  const Icon = step.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex min-h-16 min-w-40 items-center gap-3 rounded-lg border px-3 py-2 text-left transition',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:bg-muted/70'
      )}
    >
      <span
        className={cx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'
        )}
      >
        {completed ? (
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Icon className="h-4 w-4" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{step.label}</span>
        <span className={cx('block text-xs', active ? 'opacity-85' : 'text-muted-foreground')}>
          {step.description}
        </span>
      </span>
    </button>
  );
}

function PlanCard({
  item,
  onOpenTab,
}: {
  item: PatientJourneyPlanItem;
  onOpenTab: (tab: JourneyActionTab) => void;
}) {
  const Icon = item.kind === 'medication' ? Pill : item.kind === 'checkin' ? ClipboardList : Flag;
  const actionTab = (item.actionTab as JourneyActionTab | null) ?? 'jornada';

  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-foreground">{item.title}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{item.detail ?? item.status}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {formatDate(item.dueDate)}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onOpenTab(actionTab)}
        className="btn-secondary mt-4 w-full justify-center"
      >
        {formatPlanAction(item)}
      </button>
    </article>
  );
}

export default function PatientJourneySection({
  snapshot,
  journey,
  loading,
  error,
  busy,
  onReload,
  onSaveStep,
  onOpenTab,
}: PatientJourneySectionProps) {
  const [activeStep, setActiveStep] = useState<PatientOnboardingStep>('profile');
  const [profileForm, setProfileForm] = useState<ProfileForm>(defaultProfileForm);
  const [goalForm, setGoalForm] = useState<GoalForm>(defaultGoalForm);
  const [routineForm, setRoutineForm] = useState<RoutineForm>(defaultRoutineForm);
  const [reminderForm, setReminderForm] = useState<ReminderForm>(defaultReminderForm);
  const [consentForm, setConsentForm] = useState<ConsentForm>(defaultConsentForm);
  const [validation, setValidation] = useState<string | null>(null);

  useEffect(() => {
    if (!journey) return;
    setActiveStep((journey.onboarding.currentStep as PatientOnboardingStep) || 'profile');
    setProfileForm({
      preferredName: journey.profile.preferredName || snapshot.patient.preferredName,
      fullName: journey.profile.fullName ?? snapshot.patient.fullName ?? '',
      email: journey.profile.email ?? snapshot.patient.email ?? '',
      phone: journey.profile.phone ?? snapshot.patient.phone ?? '',
      birthDate: journey.profile.birthDate ?? '',
    });
    setGoalForm({
      waterGoalMl: journey.goals.waterGoalMl,
      mealsGoal: journey.goals.mealsGoal,
      workoutsGoal: journey.goals.workoutsGoal,
      sleepGoalHours: journey.goals.sleepGoalHours,
      programGoal: journey.goals.programGoal ?? '',
    });
    const firstReminder = journey.medicationReminders[0];
    setReminderForm(
      firstReminder
        ? {
            reminderId: firstReminder.id,
            title: firstReminder.title,
            medicationLabel: firstReminder.medicationLabel ?? '',
            dosage: firstReminder.dosage ?? '',
            instructions: firstReminder.instructions ?? '',
            scheduleTimes: firstReminder.scheduleTimes.length
              ? firstReminder.scheduleTimes
              : ['08:00'],
            externalNotificationConsent: firstReminder.externalNotificationConsent,
            status: firstReminder.status === 'paused' ? 'paused' : 'active',
          }
        : defaultReminderForm
    );
  }, [journey, snapshot.patient]);

  const completedSteps = useMemo(
    () => new Set(journey?.onboarding.completedSteps ?? []),
    [journey?.onboarding.completedSteps]
  );
  const onboardingDone = journey?.onboarding.status === 'completed';

  function validateStep(step: PatientOnboardingStep) {
    if (step === 'profile' && profileForm.preferredName.trim().length < 2) {
      return 'Informe como voce prefere ser chamado.';
    }
    if (step === 'goals') {
      if (goalForm.waterGoalMl < 250 || goalForm.waterGoalMl > 10000) {
        return 'A meta de agua precisa ficar entre 250 e 10000 ml.';
      }
      if (goalForm.mealsGoal < 1 || goalForm.mealsGoal > 12) {
        return 'A meta de refeicoes precisa ficar entre 1 e 12.';
      }
      if (goalForm.sleepGoalHours < 0 || goalForm.sleepGoalHours > 24) {
        return 'A meta de sono precisa ficar entre 0 e 24 horas.';
      }
    }
    if (step === 'reminders') {
      const hasReminderText =
        reminderForm.medicationLabel.trim() ||
        reminderForm.dosage.trim() ||
        reminderForm.instructions.trim();
      const validTimes = sanitizeScheduleTimes(reminderForm.scheduleTimes);
      if (hasReminderText && validTimes.length === 0) {
        return 'Inclua pelo menos um horario valido para o lembrete.';
      }
    }
    if (step === 'consent' && !consentForm.reviewQueueAcknowledged) {
      return 'Confirme que alteracoes sensiveis podem ir para revisao da equipe.';
    }
    return null;
  }

  function payloadForStep(step: PatientOnboardingStep): Record<string, unknown> {
    if (step === 'profile') return { ...profileForm };
    if (step === 'goals') return { ...goalForm };
    if (step === 'routine') return { ...routineForm };
    if (step === 'reminders') {
      return {
        ...reminderForm,
        scheduleTimes: sanitizeScheduleTimes(reminderForm.scheduleTimes),
      };
    }
    return { ...consentForm };
  }

  async function handleSaveStep(step: PatientOnboardingStep) {
    const stepValidation = validateStep(step);
    setValidation(stepValidation);
    if (stepValidation) return;

    const finish = step === 'consent';
    const saved = await onSaveStep(step, payloadForStep(step), finish);
    if (!saved) return;

    setValidation(null);
    if (finish) {
      onOpenTab('diario');
    } else {
      setActiveStep(getNextStep(step));
    }
  }

  function updateReminderTime(index: number, value: string) {
    setReminderForm((current) => ({
      ...current,
      scheduleTimes: current.scheduleTimes.map((time, timeIndex) =>
        timeIndex === index ? value : time
      ),
    }));
  }

  if (loading && !journey) {
    return (
      <DataState
        kind="loading"
        title="Carregando jornada"
        description="Buscando perfil, metas, programa e plano de hoje."
        className="bg-background"
      />
    );
  }

  if (error || !journey) {
    return (
      <DataState
        kind="error"
        title="Jornada indisponivel"
        description={error?.message ?? 'Nao foi possivel abrir os dados de jornada.'}
        actionLabel="Tentar novamente"
        onAction={onReload}
        className="bg-background"
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Minha jornada
            </p>
            <h2 className="mt-1 text-xl font-bold text-foreground">
              Perfil, metas e plano do paciente
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Dados permitidos do portal, com revisao da equipe quando necessario.
            </p>
          </div>
          <button type="button" onClick={onReload} className="btn-secondary justify-center">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Atualizar jornada
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {onboardingDone ? 'Onboarding concluido' : 'Onboarding em andamento'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {journey.onboarding.pendingReviewCount} atualizacao em revisao
                </p>
              </div>
              <HeartPulse className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${journey.onboarding.progressPercent}%` }}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Programa
            </p>
            <p className="mt-1 text-sm font-bold text-foreground">
              {journey.program.name ?? 'Sem programa ativo'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Semana {journey.program.currentWeek || 0} de {journey.program.totalWeeks || 0}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">
              {onboardingDone ? 'Atualizar jornada' : 'Onboarding assistencial'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Etapas curtas, salvas separadamente.
            </p>
          </div>
          <span className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">
            {journey.onboarding.progressPercent}%
          </span>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {steps.map((step) => (
            <StepButton
              key={step.id}
              step={step}
              active={activeStep === step.id}
              completed={completedSteps.has(step.id)}
              onClick={() => setActiveStep(step.id)}
            />
          ))}
        </div>

        {validation ? (
          <div className="mt-4 rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
            {validation}
          </div>
        ) : null}

        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          {activeStep === 'profile' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-foreground">
                Nome de uso
                <input
                  value={profileForm.preferredName}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      preferredName: event.target.value,
                    }))
                  }
                  className="input-base mt-2"
                  maxLength={80}
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Nome completo
                <input
                  value={profileForm.fullName}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                  className="input-base mt-2"
                  maxLength={160}
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                E-mail
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, email: event.target.value }))
                  }
                  className="input-base mt-2"
                  maxLength={180}
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Telefone
                <input
                  value={profileForm.phone}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, phone: event.target.value }))
                  }
                  className="input-base mt-2"
                  maxLength={40}
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Data de nascimento
                <input
                  type="date"
                  value={profileForm.birthDate}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      birthDate: event.target.value,
                    }))
                  }
                  className="input-base mt-2"
                />
              </label>
            </div>
          ) : null}

          {activeStep === 'goals' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm font-medium text-foreground">
                Agua diaria (ml)
                <input
                  type="number"
                  min={250}
                  max={10000}
                  step={50}
                  value={goalForm.waterGoalMl}
                  onChange={(event) =>
                    setGoalForm((current) => ({
                      ...current,
                      waterGoalMl: Number(event.target.value),
                    }))
                  }
                  className="input-base mt-2"
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Refeicoes
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={goalForm.mealsGoal}
                  onChange={(event) =>
                    setGoalForm((current) => ({
                      ...current,
                      mealsGoal: Number(event.target.value),
                    }))
                  }
                  className="input-base mt-2"
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Treinos
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={goalForm.workoutsGoal}
                  onChange={(event) =>
                    setGoalForm((current) => ({
                      ...current,
                      workoutsGoal: Number(event.target.value),
                    }))
                  }
                  className="input-base mt-2"
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Sono (horas)
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={goalForm.sleepGoalHours}
                  onChange={(event) =>
                    setGoalForm((current) => ({
                      ...current,
                      sleepGoalHours: Number(event.target.value),
                    }))
                  }
                  className="input-base mt-2"
                />
              </label>
              <label className="block text-sm font-medium text-foreground sm:col-span-2 lg:col-span-4">
                Meta principal
                <textarea
                  value={goalForm.programGoal}
                  onChange={(event) =>
                    setGoalForm((current) => ({ ...current, programGoal: event.target.value }))
                  }
                  className="input-base mt-2 min-h-20"
                  maxLength={240}
                />
              </label>
            </div>
          ) : null}

          {activeStep === 'routine' ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium text-foreground">
                Janela de treino
                <select
                  value={routineForm.trainingWindow}
                  onChange={(event) =>
                    setRoutineForm((current) => ({
                      ...current,
                      trainingWindow: event.target.value,
                    }))
                  }
                  className="input-base mt-2"
                >
                  <option value="manha">Manha</option>
                  <option value="tarde">Tarde</option>
                  <option value="noite">Noite</option>
                  <option value="variavel">Variavel</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-foreground">
                Horario de dormir
                <input
                  type="time"
                  value={routineForm.sleepWindow}
                  onChange={(event) =>
                    setRoutineForm((current) => ({
                      ...current,
                      sleepWindow: event.target.value,
                    }))
                  }
                  className="input-base mt-2"
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Melhor contato
                <select
                  value={routineForm.contactWindow}
                  onChange={(event) =>
                    setRoutineForm((current) => ({
                      ...current,
                      contactWindow: event.target.value,
                    }))
                  }
                  className="input-base mt-2"
                >
                  <option value="manha">Manha</option>
                  <option value="tarde">Tarde</option>
                  <option value="noite">Noite</option>
                </select>
              </label>
            </div>
          ) : null}

          {activeStep === 'reminders' ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-foreground">
                  Lembrete
                  <input
                    value={reminderForm.medicationLabel}
                    onChange={(event) =>
                      setReminderForm((current) => ({
                        ...current,
                        medicationLabel: event.target.value,
                      }))
                    }
                    className="input-base mt-2"
                    maxLength={120}
                  />
                </label>
                <label className="block text-sm font-medium text-foreground">
                  Dose ou detalhe
                  <input
                    value={reminderForm.dosage}
                    onChange={(event) =>
                      setReminderForm((current) => ({ ...current, dosage: event.target.value }))
                    }
                    className="input-base mt-2"
                    maxLength={80}
                  />
                </label>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Horarios</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {reminderForm.scheduleTimes.map((time, index) => (
                    <input
                      key={`${index}-${time}`}
                      type="time"
                      value={time}
                      onChange={(event) => updateReminderTime(index, event.target.value)}
                      className="input-base"
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setReminderForm((current) => ({
                        ...current,
                        scheduleTimes: [...current.scheduleTimes, '20:00'].slice(0, 8),
                      }))
                    }
                    className="btn-secondary justify-center"
                  >
                    Adicionar horario
                  </button>
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={reminderForm.externalNotificationConsent}
                  onChange={(event) =>
                    setReminderForm((current) => ({
                      ...current,
                      externalNotificationConsent: event.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold">Permitir lembrete externo generico</span>
                  <span className="mt-1 block text-muted-foreground">
                    A notificacao externa nao mostra nome de medicamento.
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          {activeStep === 'consent' ? (
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={consentForm.reviewQueueAcknowledged}
                  onChange={(event) =>
                    setConsentForm((current) => ({
                      ...current,
                      reviewQueueAcknowledged: event.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold">Revisao da equipe</span>
                  <span className="mt-1 block text-muted-foreground">
                    Nome completo, contato, nascimento e endereco entram em fila de revisao.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={consentForm.genericReminderConsent}
                  onChange={(event) =>
                    setConsentForm((current) => ({
                      ...current,
                      genericReminderConsent: event.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold">Lembretes genericos</span>
                  <span className="mt-1 block text-muted-foreground">
                    Avisos externos usam texto generico.
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSaveStep(activeStep)}
              className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {activeStep === 'consent' ? 'Concluir onboarding' : 'Salvar etapa'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <h3 className="text-base font-bold text-foreground">O que fazer hoje</h3>
          {journey.planToday.length === 0 ? (
            <DataState
              kind="empty"
              title="Plano do dia livre"
              description="Quando houver check-ins, lembretes ou acoes de rotina, eles aparecem aqui."
              className="bg-background"
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {journey.planToday.map((item) => (
                <PlanCard key={item.id} item={item} onOpenTab={onOpenTab} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-bold text-foreground">Pendencias acionaveis</h3>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => onOpenTab('documentos')}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-4 text-left"
            >
              <span className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-bold text-foreground">Documentos</span>
                  <span className="text-sm text-muted-foreground">
                    {snapshot.documents.length} liberado(s)
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onOpenTab('financeiro')}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-4 text-left"
            >
              <span className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-bold text-foreground">Financeiro</span>
                  <span className="text-sm text-muted-foreground">
                    {snapshot.invoices.length} cobranca(s)
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <div className="space-y-3">
        <CollapsibleSection
          title="Dados pessoais"
          description={`${journey.profile.pendingReviews.length} em revisao`}
          icon={UserRound}
          defaultOpen
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-muted-foreground">Nome de uso</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {journey.profile.preferredName}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {journey.profile.email ?? 'Nao informado'}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-muted-foreground">Telefone</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {journey.profile.phone ?? 'Nao informado'}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-muted-foreground">Nascimento</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {formatDate(journey.profile.birthDate)}
              </dd>
            </div>
          </dl>
          {journey.profile.pendingReviews.length > 0 ? (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
              <LockKeyhole className="mr-2 inline h-4 w-4 text-warning" aria-hidden="true" />
              Atualizacoes sensiveis aguardam revisao da equipe.
            </div>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection
          title="Programa e metas"
          description={journey.program.name ?? 'Sem programa ativo'}
          icon={Target}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Agua</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {journey.goals.waterGoalMl} ml
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Refeicoes</p>
              <p className="mt-1 text-lg font-bold text-foreground">{journey.goals.mealsGoal}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Treinos</p>
              <p className="mt-1 text-lg font-bold text-foreground">{journey.goals.workoutsGoal}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Sono</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {journey.goals.sleepGoalHours}h
              </p>
            </div>
          </div>
          {journey.program.phases.length > 0 ? (
            <div className="mt-4 space-y-2">
              {journey.program.phases.slice(0, 3).map((phase) => (
                <div key={phase.name} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-semibold text-foreground">{phase.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {phase.durationWeeks} semana(s) - {phase.description ?? 'Sem descricao'}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection
          title="Medicacoes e lembretes"
          description={`${journey.medicationReminders.length} lembrete(s)`}
          icon={BellRing}
        >
          {journey.medicationReminders.length === 0 ? (
            <DataState
              kind="empty"
              title="Nenhum lembrete ativo"
              description="Lembretes cadastrados pela equipe ou pelo paciente aparecem aqui."
              className="bg-background"
            />
          ) : (
            <div className="space-y-2">
              {journey.medicationReminders.map((reminder) => (
                <article key={reminder.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {reminder.medicationLabel || reminder.title}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {reminder.scheduleTimes.join(', ') || 'Sem horario definido'}
                      </p>
                    </div>
                    {reminder.patientEditable ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReminderForm({
                            reminderId: reminder.id,
                            title: reminder.title,
                            medicationLabel: reminder.medicationLabel ?? '',
                            dosage: reminder.dosage ?? '',
                            instructions: reminder.instructions ?? '',
                            scheduleTimes: reminder.scheduleTimes.length
                              ? reminder.scheduleTimes
                              : ['08:00'],
                            externalNotificationConsent: reminder.externalNotificationConsent,
                            status: reminder.status === 'paused' ? 'paused' : 'active',
                          });
                          setActiveStep('reminders');
                        }}
                        className="btn-secondary justify-center text-xs"
                      >
                        Editar horarios
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Historico recente"
          description="Eventos seguros do portal"
          icon={ClipboardList}
        >
          {journey.history.length === 0 ? (
            <DataState
              kind="empty"
              title="Sem historico de jornada"
              description="Check-ins enviados e revisoes aparecem aqui."
              className="bg-background"
            />
          ) : (
            <div className="divide-y divide-border">
              {journey.history.map((item) => (
                <article key={item.id} className="py-3">
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.detail ?? item.kind} - {formatDate(item.occurredAt)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
