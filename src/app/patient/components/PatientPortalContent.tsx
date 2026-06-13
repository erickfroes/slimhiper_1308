'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileText,
  Home,
  LogOut,
  MessageSquare,
  RefreshCw,
  Sparkles,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { asSafeDocumentUrl } from '@/lib/safeExternalUrl';
import { redirectToLogin, signOutFromApp } from '@/lib/auth/clientLogout';
import DataState from '@/components/ui/DataState';
import MetricCard from '@/components/ui/MetricCard';
import SectionPanel from '@/components/ui/SectionPanel';
import Tabs from '@/components/ui/Tabs';
import { getDocumentSignedUrl } from '@/services/documentsApi';
import DailyPortalSection from './daily/DailyPortalSection';
import PatientCommercialSection from './PatientCommercialSection';
import PatientCommunitySection from './PatientCommunitySection';
import PatientJourneySection from './PatientJourneySection';
import {
  PortalChatSection,
  PortalCheckinsSection,
  PortalDocumentsSection,
  PortalFinanceSection,
  PortalNotificationsSection,
  PortalSummarySection,
  getCheckinQuestions,
  isCheckinAnswered,
} from './PatientPortalSections';
import {
  completePatientOnboarding,
  getPatientJourneySnapshot,
  getPatientPortalSnapshot,
  markPatientPortalNotificationRead,
  sendPatientPortalMessage,
  submitPatientPortalCheckin,
  type PatientJourneySnapshot,
  type PatientOnboardingStep,
  type PatientPortalSnapshot,
  type SafeServiceError,
} from '@/services/patientPortalApi';
import { isPatientDailyAction, type PatientDailyAction } from '@/services/patientDailyApi';

type PortalTab =
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

const tabs: Array<{ id: PortalTab; label: string; shortLabel: string; icon: LucideIcon }> = [
  { id: 'resumo', label: 'Resumo', shortLabel: 'Inicio', icon: Home },
  { id: 'diario', label: 'Diario', shortLabel: 'Hoje', icon: Activity },
  { id: 'jornada', label: 'Minha jornada', shortLabel: 'Jornada', icon: UserRound },
  { id: 'beneficios', label: 'Beneficios', shortLabel: 'Planos', icon: Sparkles },
  { id: 'comunidade', label: 'Comunidade', shortLabel: 'Grupo', icon: UsersRound },
  { id: 'documentos', label: 'Documentos', shortLabel: 'Docs', icon: FileText },
  { id: 'financeiro', label: 'Financeiro', shortLabel: 'Pagar', icon: CreditCard },
  { id: 'chat', label: 'Chat', shortLabel: 'Chat', icon: MessageSquare },
  { id: 'notificacoes', label: 'Notificacoes', shortLabel: 'Avisos', icon: Bell },
  { id: 'checkins', label: 'Check-ins', shortLabel: 'Check', icon: ClipboardCheck },
];

function isPortalTab(value: string | null): value is PortalTab {
  return typeof value === 'string' && tabs.some((tab) => tab.id === value);
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

export default function PatientPortalContent() {
  const searchParams = useSearchParams();
  const [snapshot, setSnapshot] = useState<PatientPortalSnapshot | null>(null);
  const [journey, setJourney] = useState<PatientJourneySnapshot | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<PortalTab>('resumo');
  const [dailyInitialAction, setDailyInitialAction] = useState<PatientDailyAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [journeyError, setJourneyError] = useState<SafeServiceError | null>(null);
  const [message, setMessage] = useState('');
  const [chatAttachment, setChatAttachment] = useState<File | null>(null);
  const [checkinAnswers, setCheckinAnswers] = useState<Record<string, Record<string, string>>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  async function loadJourney(patientId = selectedPatientId) {
    if (!patientId) {
      setJourney(null);
      setJourneyLoading(false);
      return;
    }

    setJourneyLoading(true);
    setJourneyError(null);
    const result = await getPatientJourneySnapshot(patientId);
    if (result.error || !result.data) {
      setJourney(null);
      setJourneyError(result.error ?? { message: 'Nao foi possivel carregar a jornada.' });
    } else {
      setJourney(result.data);
      if (
        result.data.onboarding.status !== 'completed' &&
        !searchParams.get('tab') &&
        !searchParams.get('action')
      ) {
        setActiveTab('jornada');
      }
    }
    setJourneyLoading(false);
  }

  async function loadPortal(patientId = selectedPatientId) {
    setLoading(true);
    setError(null);
    const result = await getPatientPortalSnapshot(patientId);
    if (result.error || !result.data) {
      setSnapshot(null);
      setJourney(null);
      setError(result.error?.message ?? 'Nao foi possivel carregar o portal.');
    } else {
      setSnapshot(result.data);
      setSelectedPatientId(result.data.selectedPatientId);
      await loadJourney(result.data.selectedPatientId);
    }
    setLoading(false);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await signOutFromApp();
    redirectToLogin();
  }

  useEffect(() => {
    void loadPortal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const action = searchParams.get('action');

    if (isPortalTab(tab)) setActiveTab(tab);
    if (isPatientDailyAction(action)) {
      setActiveTab('diario');
      setDailyInitialAction(action);
    }
  }, [searchParams]);

  const unreadNotifications = useMemo(
    () =>
      snapshot?.notifications.filter((notification) => notification.status === 'unread').length ??
      0,
    [snapshot]
  );

  const portalCockpit = useMemo(() => {
    if (!snapshot) return null;

    const pendingCheckins = snapshot.checkins
      .filter((checkin) => checkin.status !== 'completed' && checkin.status !== 'canceled')
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
    const openInvoices = snapshot.invoices
      .filter((invoice) => !['paid', 'pago', 'CONFIRMED', 'RECEIVED'].includes(invoice.status))
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
    const completedCheckins = snapshot.checkins.filter(
      (checkin) => checkin.status === 'completed'
    ).length;
    const progress =
      snapshot.checkins.length > 0
        ? Math.round((completedCheckins / snapshot.checkins.length) * 100)
        : snapshot.documents.length > 0 || snapshot.invoices.length > 0
          ? 25
          : 0;
    const firstUnreadNotification = snapshot.notifications.find(
      (notification) => notification.status === 'unread'
    );

    if (journey && journey.onboarding.status !== 'completed') {
      return {
        progress: journey.onboarding.progressPercent,
        pendingCheckins,
        openInvoices,
        nextAction: {
          tab: 'jornada' as PortalTab,
          title: 'Concluir onboarding',
          detail: `${journey.onboarding.progressPercent}% preenchido`,
          icon: UserRound,
        },
      };
    }

    if (pendingCheckins[0]) {
      return {
        progress,
        pendingCheckins,
        openInvoices,
        nextAction: {
          tab: 'checkins' as PortalTab,
          title: 'Responder check-in',
          detail: `Prazo ${formatDate(pendingCheckins[0].dueDate)}`,
          icon: ClipboardCheck,
        },
      };
    }

    if (openInvoices[0]) {
      return {
        progress,
        pendingCheckins,
        openInvoices,
        nextAction: {
          tab: 'financeiro' as PortalTab,
          title: 'Revisar cobranca',
          detail: `${formatCurrency(openInvoices[0].amountCents)} ate ${formatDate(openInvoices[0].dueDate)}`,
          icon: CreditCard,
        },
      };
    }

    if (firstUnreadNotification) {
      return {
        progress,
        pendingCheckins,
        openInvoices,
        nextAction: {
          tab: 'notificacoes' as PortalTab,
          title: 'Ler notificacao',
          detail: firstUnreadNotification.title,
          icon: Bell,
        },
      };
    }

    return {
      progress,
      pendingCheckins,
      openInvoices,
      nextAction: {
        tab: 'chat' as PortalTab,
        title: 'Falar com a equipe',
        detail: 'Envie uma mensagem quando precisar.',
        icon: MessageSquare,
      },
    };
  }, [journey, snapshot]);

  async function handlePatientChange(patientId: string) {
    setSelectedPatientId(patientId);
    await loadPortal(patientId);
  }

  async function handleSendMessage() {
    if (!snapshot || busyKey === 'chat' || (!message.trim() && !chatAttachment)) return;
    setBusyKey('chat');
    setActionMessage(null);
    try {
      const result = await sendPatientPortalMessage(
        snapshot.selectedPatientId,
        message,
        chatAttachment
      );
      if (result.data) {
        setMessage('');
        setChatAttachment(null);
        setActionMessage(result.error?.message ?? 'Mensagem enviada para a equipe.');
        await loadPortal(snapshot.selectedPatientId);
      } else if (result.error) {
        setActionMessage(result.error.message);
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function handleOpenDocument(documentId: string) {
    if (!snapshot) return;
    setBusyKey(documentId);
    setActionMessage(null);
    const result = await getDocumentSignedUrl(documentId, snapshot.selectedPatientId);
    if (result.error || !result.data?.url) {
      setActionMessage(result.error?.message ?? 'Nao foi possivel gerar o link temporario.');
    } else {
      const safeUrl = asSafeDocumentUrl(result.data.url);
      if (!safeUrl) {
        setActionMessage('O link gerado nao passou na validacao de seguranca.');
        setBusyKey(null);
        return;
      }
      window.open(safeUrl, '_blank', 'noopener,noreferrer');
      setActionMessage(`Link temporario gerado por ${result.data.expiresInSeconds} segundos.`);
    }
    setBusyKey(null);
  }

  async function handleCompleteCheckin(checkinId: string) {
    const checkin = snapshot?.checkins.find((item) => item.id === checkinId);
    const questions = getCheckinQuestions(checkin?.questions ?? []);
    const answers = checkinAnswers[checkinId] ?? {};
    if (!isCheckinAnswered(questions, answers)) {
      setActionMessage('Preencha todas as perguntas do check-in antes de enviar.');
      return;
    }

    setBusyKey(checkinId);
    setActionMessage(null);
    try {
      const result = await submitPatientPortalCheckin(checkinId, {
        submittedFrom: 'patient_portal',
        submittedAt: new Date().toISOString(),
        answers: questions.map((question, index) => ({
          question,
          answer: answers[String(index)]?.trim() ?? '',
        })),
      });
      if (result.error) {
        setActionMessage(result.error.message);
      } else {
        setActionMessage('Check-in enviado com seguranca.');
        setCheckinAnswers((current) => {
          const next = { ...current };
          delete next[checkinId];
          return next;
        });
        await loadPortal(snapshot?.selectedPatientId);
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function handleReadNotification(notificationId: string) {
    setBusyKey(notificationId);
    setActionMessage(null);
    try {
      const result = await markPatientPortalNotificationRead(notificationId);
      if (result.error) {
        setActionMessage(result.error.message);
      } else {
        await loadPortal(snapshot?.selectedPatientId);
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSaveOnboardingStep(
    step: PatientOnboardingStep,
    payload: Record<string, unknown>,
    finish = false
  ) {
    if (!snapshot || busyKey?.startsWith('onboarding-')) return false;

    setBusyKey(`onboarding-${step}`);
    setActionMessage(null);
    try {
      const result = await completePatientOnboarding(
        snapshot.selectedPatientId,
        step,
        payload,
        finish
      );
      if (result.error) {
        setActionMessage(result.error.message);
        return false;
      }

      setActionMessage(finish ? 'Onboarding concluido. Diario aberto.' : 'Etapa salva.');
      await loadJourney(snapshot.selectedPatientId);
      if (finish) setActiveTab('diario');
      return true;
    } finally {
      setBusyKey(null);
    }
  }

  function handleCheckinAnswerChange(checkinId: string, index: number, value: string) {
    setCheckinAnswers((current) => ({
      ...current,
      [checkinId]: {
        ...(current[checkinId] ?? {}),
        [String(index)]: value,
      },
    }));
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-4">
          <DataState
            kind="loading"
            title="Carregando portal"
            description="Buscando seus dados, check-ins, documentos e diario do dia."
          />
        </div>
      </main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <DataState
          kind="error"
          title="Portal indisponivel"
          description={error ?? 'Nao encontramos um vinculo ativo para este acesso.'}
          actionLabel="Tentar novamente"
          onAction={() => void loadPortal()}
          className="w-full max-w-lg"
        />
      </main>
    );
  }

  const nextAction = portalCockpit?.nextAction;
  const NextActionIcon = nextAction?.icon ?? MessageSquare;
  const tabItems = tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    badge:
      tab.id === 'notificacoes' && unreadNotifications > 0 ? (
        <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[10px]">
          {unreadNotifications}
        </span>
      ) : tab.id === 'jornada' &&
        journey &&
        (journey.onboarding.status !== 'completed' || journey.onboarding.pendingReviewCount > 0) ? (
        <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[10px]">
          {journey.onboarding.status !== 'completed'
            ? `${journey.onboarding.progressPercent}%`
            : journey.onboarding.pendingReviewCount}
        </span>
      ) : undefined,
  }));

  return (
    <main className="min-h-screen bg-background px-4 py-4 pb-32 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Portal SlimHiper
                </p>
                <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {snapshot.patient.status}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
                Ola, {snapshot.patient.preferredName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Acompanhe proximas acoes, check-ins, comunidade, documentos, cobrancas e conversas
                do seu programa em um so lugar.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end lg:items-center">
              {snapshot.patients.length > 1 ? (
                <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
                  Paciente vinculado
                  <select
                    value={selectedPatientId}
                    onChange={(event) => void handlePatientChange(event.target.value)}
                    className="min-w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {snapshot.patients.map((patient) => (
                      <option key={patient.patientId} value={patient.patientId}>
                        {patient.displayName} (
                        {patient.linkageType === 'guardian' ? 'responsavel' : 'paciente'})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => void loadPortal(snapshot.selectedPatientId)}
                className="btn-secondary justify-center"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {loggingOut ? 'Saindo...' : 'Sair'}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <button
              type="button"
              onClick={() => nextAction && setActiveTab(nextAction.tab)}
              className="group flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/10 p-4 text-left transition hover:bg-primary/15"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <NextActionIcon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Proxima acao
                  </p>
                  <p className="mt-1 truncate text-base font-bold text-foreground">
                    {nextAction?.title}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{nextAction?.detail}</p>
                </div>
              </div>
              <ChevronRight
                className="h-5 w-5 shrink-0 text-primary transition group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Progresso do programa
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {portalCockpit?.progress ?? 0}%
                  </p>
                </div>
                <CalendarDays className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <div className="mt-3 h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${portalCockpit?.progress ?? 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Baseado nos check-ins atribuidos para este vinculo.
              </p>
            </div>
          </div>
        </header>

        {actionMessage ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
            {actionMessage}
          </div>
        ) : null}

        {snapshot.warnings.length > 0 ? (
          <div
            role="status"
            className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Alguns dados estao temporariamente parciais</p>
                <ul className="mt-1 space-y-1">
                  {snapshot.warnings.map((warning, index) => (
                    <li key={`${warning.code ?? 'warning'}-${index}`}>{warning.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={FileText}
            label="Documentos"
            value={String(snapshot.documents.length)}
          />
          <MetricCard
            icon={CreditCard}
            label="Cobrancas"
            value={String(snapshot.invoices.length)}
            tone={portalCockpit?.openInvoices.length ? 'warning' : 'default'}
          />
          <MetricCard
            icon={ClipboardCheck}
            label="Check-ins pendentes"
            value={String(portalCockpit?.pendingCheckins.length ?? 0)}
            tone={portalCockpit?.pendingCheckins.length ? 'success' : 'default'}
          />
          <MetricCard
            icon={Bell}
            label="Notificacoes nao lidas"
            value={String(unreadNotifications)}
            tone={unreadNotifications ? 'info' : 'default'}
          />
        </section>

        <Tabs
          items={tabItems}
          value={activeTab}
          onValueChange={setActiveTab}
          label="Abas do portal"
          className="hidden sm:flex"
        />

        {activeTab === 'diario' ? (
          <DailyPortalSection
            snapshot={snapshot}
            initialAction={dailyInitialAction}
            onInitialActionConsumed={() => setDailyInitialAction(null)}
            onOpenChat={() => setActiveTab('chat')}
            onOpenCheckins={() => setActiveTab('checkins')}
            onActionMessage={setActionMessage}
          />
        ) : (
          <SectionPanel contentClassName="p-5 sm:p-6">
            {activeTab === 'resumo' ? <PortalSummarySection snapshot={snapshot} /> : null}

            {activeTab === 'jornada' ? (
              <PatientJourneySection
                snapshot={snapshot}
                journey={journey}
                loading={journeyLoading}
                error={journeyError}
                busy={busyKey?.startsWith('onboarding-') ?? false}
                onReload={() => void loadJourney(snapshot.selectedPatientId)}
                onSaveStep={handleSaveOnboardingStep}
                onOpenTab={(tab) => setActiveTab(tab)}
              />
            ) : null}

            {activeTab === 'beneficios' ? (
              <PatientCommercialSection snapshot={snapshot} onActionMessage={setActionMessage} />
            ) : null}

            {activeTab === 'comunidade' ? (
              <PatientCommunitySection snapshot={snapshot} onActionMessage={setActionMessage} />
            ) : null}

            {activeTab === 'documentos' ? (
              <PortalDocumentsSection
                snapshot={snapshot}
                busyKey={busyKey}
                onOpenDocument={(documentId) => void handleOpenDocument(documentId)}
              />
            ) : null}

            {activeTab === 'financeiro' ? <PortalFinanceSection snapshot={snapshot} /> : null}

            {activeTab === 'chat' ? (
              <PortalChatSection
                snapshot={snapshot}
                busyKey={busyKey}
                message={message}
                selectedFile={chatAttachment}
                onMessageChange={setMessage}
                onFileSelect={setChatAttachment}
                onClearFile={() => setChatAttachment(null)}
                onSendMessage={() => void handleSendMessage()}
              />
            ) : null}

            {activeTab === 'notificacoes' ? (
              <PortalNotificationsSection
                snapshot={snapshot}
                busyKey={busyKey}
                onReadNotification={(notificationId) => void handleReadNotification(notificationId)}
              />
            ) : null}

            {activeTab === 'checkins' ? (
              <PortalCheckinsSection
                snapshot={snapshot}
                busyKey={busyKey}
                checkinAnswers={checkinAnswers}
                onAnswerChange={handleCheckinAnswerChange}
                onCompleteCheckin={(checkinId) => void handleCompleteCheckin(checkinId)}
              />
            ) : null}
          </SectionPanel>
        )}
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pt-2 shadow-lg backdrop-blur safe-bottom sm:hidden"
        aria-label="Navegacao do portal"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold transition',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                ].join(' ')}
              >
                <span className="relative">
                  <TabIcon className="h-4 w-4" aria-hidden="true" />
                  {tab.id === 'notificacoes' && unreadNotifications > 0 ? (
                    <span className="absolute -right-2 -top-2 h-4 min-w-4 rounded-full bg-negative px-1 text-[9px] leading-4 text-white">
                      {unreadNotifications}
                    </span>
                  ) : null}
                </span>
                <span>{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
