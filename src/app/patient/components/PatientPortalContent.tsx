'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileText,
  Home,
  MessageSquare,
  RefreshCw,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { asSafeDocumentUrl } from '@/lib/safeExternalUrl';
import MetricCard from '@/components/ui/MetricCard';
import Tabs from '@/components/ui/Tabs';
import { getDocumentSignedUrl } from '@/services/documentsApi';
import {
  getPatientPortalSnapshot,
  markPatientPortalNotificationRead,
  sendPatientPortalMessage,
  submitPatientPortalCheckin,
  type PatientPortalSnapshot,
} from '@/services/patientPortalApi';

type PortalTab = 'resumo' | 'documentos' | 'financeiro' | 'chat' | 'notificacoes' | 'checkins';

const tabs: Array<{ id: PortalTab; label: string; shortLabel: string; icon: LucideIcon }> = [
  { id: 'resumo', label: 'Resumo', shortLabel: 'Inicio', icon: Home },
  { id: 'documentos', label: 'Documentos', shortLabel: 'Docs', icon: FileText },
  { id: 'financeiro', label: 'Financeiro', shortLabel: 'Pagar', icon: CreditCard },
  { id: 'chat', label: 'Chat', shortLabel: 'Chat', icon: MessageSquare },
  { id: 'notificacoes', label: 'Notificacoes', shortLabel: 'Avisos', icon: Bell },
  { id: 'checkins', label: 'Check-ins', shortLabel: 'Check', icon: ClipboardCheck },
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

function getCheckinQuestions(questions: unknown[]) {
  return questions
    .map((question) => (typeof question === 'string' ? question.trim() : ''))
    .filter(Boolean)
    .slice(0, 20);
}

function isCheckinAnswered(questions: string[], answers?: Record<string, string>) {
  if (questions.length === 0) return true;
  return questions.every((_, index) => answers?.[String(index)]?.trim());
}

export default function PatientPortalContent() {
  const [snapshot, setSnapshot] = useState<PatientPortalSnapshot | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<PortalTab>('resumo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [checkinAnswers, setCheckinAnswers] = useState<Record<string, Record<string, string>>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function loadPortal(patientId = selectedPatientId) {
    setLoading(true);
    setError(null);
    const result = await getPatientPortalSnapshot(patientId);
    if (result.error || !result.data) {
      setSnapshot(null);
      setError(result.error?.message ?? 'Nao foi possivel carregar o portal.');
    } else {
      setSnapshot(result.data);
      setSelectedPatientId(result.data.selectedPatientId);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadPortal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [snapshot]);

  async function handlePatientChange(patientId: string) {
    setSelectedPatientId(patientId);
    await loadPortal(patientId);
  }

  async function handleSendMessage() {
    if (!snapshot || !message.trim() || busyKey === 'chat') return;
    setBusyKey('chat');
    setActionMessage(null);
    try {
      const result = await sendPatientPortalMessage(snapshot.selectedPatientId, message);
      if (result.error) {
        setActionMessage(result.error.message);
      } else {
        setMessage('');
        setActionMessage('Mensagem enviada para a equipe.');
        await loadPortal(snapshot.selectedPatientId);
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

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-28 animate-pulse rounded-3xl bg-muted" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-32 animate-pulse rounded-2xl bg-muted" />
            <div className="h-32 animate-pulse rounded-2xl bg-muted" />
            <div className="h-32 animate-pulse rounded-2xl bg-muted" />
          </div>
          <div className="h-80 animate-pulse rounded-3xl bg-muted" />
        </div>
      </main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <section className="max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-foreground">Portal indisponivel</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? 'Nao encontramos um vinculo ativo para este acesso.'}
          </p>
          <button
            type="button"
            onClick={() => loadPortal()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
        </section>
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
      ) : undefined,
  }));

  return (
    <main className="min-h-screen bg-background px-4 py-4 pb-24 sm:px-6 sm:py-6 lg:px-8">
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
                Acompanhe proximas acoes, check-ins, documentos, cobrancas e conversas do seu
                programa em um so lugar.
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

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
          {activeTab === 'resumo' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h2 className="text-lg font-bold text-foreground">Resumo do paciente</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4 rounded-xl bg-muted/50 p-3">
                    <dt className="text-muted-foreground">Nome completo</dt>
                    <dd className="font-medium text-foreground">
                      {snapshot.patient.fullName ?? snapshot.patient.preferredName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 rounded-xl bg-muted/50 p-3">
                    <dt className="text-muted-foreground">E-mail</dt>
                    <dd className="font-medium text-foreground">
                      {snapshot.patient.email ?? 'Nao informado'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 rounded-xl bg-muted/50 p-3">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-medium text-foreground">{snapshot.patient.status}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-2xl border border-dashed border-border p-4">
                <h3 className="font-semibold text-foreground">Escopo seguro</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Este portal mostra somente dados do vinculo ativo selecionado. Responsaveis com
                  mais de um vinculo podem alternar pacientes pelo seletor acima.
                </p>
              </div>
            </div>
          ) : null}

          {activeTab === 'documentos' ? (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-foreground">Documentos liberados</h2>
              {snapshot.documents.length === 0 ? (
                <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
                  Nenhum documento liberado para o portal.
                </p>
              ) : (
                snapshot.documents.map((document) => (
                  <article
                    key={document.id}
                    className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <h3 className="font-semibold text-foreground">{document.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {document.category} · {document.status} · {formatDate(document.generatedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleOpenDocument(document.id)}
                      disabled={busyKey === document.id}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      Abrir link temporario
                    </button>
                  </article>
                ))
              )}
            </div>
          ) : null}

          {activeTab === 'financeiro' ? (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-foreground">Financeiro proprio</h2>
              {snapshot.invoices.length === 0 ? (
                <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
                  Nenhuma cobranca encontrada para este vinculo.
                </p>
              ) : (
                snapshot.invoices.map((invoice) => (
                  <article key={invoice.id} className="rounded-2xl border border-border p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-foreground">
                          {invoice.description ?? 'Cobranca'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Vencimento {formatDate(invoice.dueDate)} · {invoice.status}
                        </p>
                      </div>
                      <strong className="text-lg text-foreground">
                        {formatCurrency(invoice.amountCents)}
                      </strong>
                    </div>
                    {invoice.paymentLink ? (
                      <a
                        className="mt-3 inline-flex rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
                        href={invoice.paymentLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir link de pagamento
                      </a>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          ) : null}

          {activeTab === 'chat' ? (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-foreground">Chat com a equipe</h2>
              <div className="max-h-96 space-y-3 overflow-y-auto rounded-2xl bg-muted/40 p-4">
                {snapshot.chat.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma mensagem ainda. Envie uma duvida para iniciar o atendimento.
                  </p>
                ) : (
                  snapshot.chat.messages.map((chatMessage) => (
                    <div
                      key={chatMessage.id}
                      className={`rounded-2xl p-3 ${chatMessage.isOwn ? 'ml-auto bg-primary text-primary-foreground' : 'mr-auto bg-card text-foreground'} max-w-[85%]`}
                    >
                      <p className="text-xs font-semibold opacity-80">{chatMessage.senderLabel}</p>
                      <p className="mt-1 text-sm">{chatMessage.body}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={2}
                  maxLength={2000}
                  className="min-h-20 flex-1 rounded-2xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Escreva sua mensagem..."
                />
                <button
                  type="button"
                  onClick={() => void handleSendMessage()}
                  disabled={busyKey === 'chat' || !message.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Enviar
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === 'notificacoes' ? (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-foreground">Notificacoes</h2>
              {snapshot.notifications.length === 0 ? (
                <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
                  Nenhuma notificacao no momento.
                </p>
              ) : (
                snapshot.notifications.map((notification) => (
                  <article key={notification.id} className="rounded-2xl border border-border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-foreground">{notification.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {notification.body ?? notification.category ?? 'Atualizacao do portal'}
                        </p>
                      </div>
                      {notification.status === 'unread' ? (
                        <button
                          type="button"
                          onClick={() => void handleReadNotification(notification.id)}
                          disabled={busyKey === notification.id}
                          className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
                        >
                          Marcar lida
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : null}

          {activeTab === 'checkins' ? (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-foreground">Check-ins do programa</h2>
              {snapshot.checkins.length === 0 ? (
                <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
                  Nenhum check-in atribuido.
                </p>
              ) : (
                snapshot.checkins.map((checkin) => {
                  const questions = getCheckinQuestions(checkin.questions);
                  const answers = checkinAnswers[checkin.id] ?? {};
                  const canSubmit = isCheckinAnswered(questions, answers);
                  const isClosed = checkin.status === 'completed' || checkin.status === 'canceled';

                  return (
                    <article
                      key={checkin.id}
                      className="space-y-4 rounded-2xl border border-border p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="font-semibold text-foreground">{checkin.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            Prazo {formatDate(checkin.dueDate)} · {checkin.status}
                          </p>
                        </div>
                        {!isClosed ? (
                          <button
                            type="button"
                            onClick={() => void handleCompleteCheckin(checkin.id)}
                            disabled={busyKey === checkin.id || !canSubmit}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            Enviar check-in
                          </button>
                        ) : null}
                      </div>

                      {questions.length > 0 ? (
                        <div className="space-y-3 rounded-2xl bg-muted/40 p-3">
                          {questions.map((question, index) => (
                            <label
                              key={`${checkin.id}-${index}`}
                              className="block text-sm font-medium text-foreground"
                            >
                              {question}
                              <textarea
                                value={answers[String(index)] ?? ''}
                                onChange={(event) =>
                                  setCheckinAnswers((current) => ({
                                    ...current,
                                    [checkin.id]: {
                                      ...(current[checkin.id] ?? {}),
                                      [String(index)]: event.target.value,
                                    },
                                  }))
                                }
                                disabled={isClosed || busyKey === checkin.id}
                                maxLength={4000}
                                rows={2}
                                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
                                placeholder="Responda de forma objetiva para a equipe acompanhar seu progresso."
                              />
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          ) : null}
        </section>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pt-2 shadow-lg backdrop-blur safe-bottom sm:hidden"
        aria-label="Navegacao do portal"
      >
        <div className="mx-auto grid max-w-lg grid-cols-6 gap-1">
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
