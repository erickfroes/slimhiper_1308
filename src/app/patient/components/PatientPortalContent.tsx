'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, CreditCard, FileText, RefreshCw, Send, UserRound } from 'lucide-react';
import { getDocumentSignedUrl } from '@/services/documentsApi';
import {
  getPatientPortalSnapshot,
  markPatientPortalNotificationRead,
  sendPatientPortalMessage,
  submitPatientPortalCheckin,
  type PatientPortalSnapshot,
} from '@/services/patientPortalApi';

type PortalTab = 'resumo' | 'documentos' | 'financeiro' | 'chat' | 'notificacoes' | 'checkins';

const tabs: Array<{ id: PortalTab; label: string }> = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'chat', label: 'Chat' },
  { id: 'notificacoes', label: 'Notificacoes' },
  { id: 'checkins', label: 'Check-ins' },
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export default function PatientPortalContent() {
  const [snapshot, setSnapshot] = useState<PatientPortalSnapshot | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<PortalTab>('resumo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
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

  async function handlePatientChange(patientId: string) {
    setSelectedPatientId(patientId);
    await loadPortal(patientId);
  }

  async function handleSendMessage() {
    if (!snapshot || !message.trim()) return;
    setBusyKey('chat');
    setActionMessage(null);
    const result = await sendPatientPortalMessage(snapshot.selectedPatientId, message.trim());
    if (result.error) {
      setActionMessage(result.error.message);
    } else {
      setMessage('');
      setActionMessage('Mensagem enviada para a equipe.');
      await loadPortal(snapshot.selectedPatientId);
    }
    setBusyKey(null);
  }

  async function handleOpenDocument(documentId: string) {
    if (!snapshot) return;
    setBusyKey(documentId);
    setActionMessage(null);
    const result = await getDocumentSignedUrl(documentId, snapshot.selectedPatientId);
    if (result.error || !result.data?.url) {
      setActionMessage(result.error?.message ?? 'Nao foi possivel gerar o link temporario.');
    } else {
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
      setActionMessage(`Link temporario gerado por ${result.data.expiresInSeconds} segundos.`);
    }
    setBusyKey(null);
  }

  async function handleCompleteCheckin(checkinId: string) {
    setBusyKey(checkinId);
    setActionMessage(null);
    const result = await submitPatientPortalCheckin(checkinId, {
      submittedFrom: 'patient_portal',
      submittedAt: new Date().toISOString(),
    });
    if (result.error) {
      setActionMessage(result.error.message);
    } else {
      setActionMessage('Check-in enviado com seguranca.');
      await loadPortal(snapshot?.selectedPatientId);
    }
    setBusyKey(null);
  }

  async function handleReadNotification(notificationId: string) {
    setBusyKey(notificationId);
    setActionMessage(null);
    const result = await markPatientPortalNotificationRead(notificationId);
    if (result.error) {
      setActionMessage(result.error.message);
    } else {
      await loadPortal(snapshot?.selectedPatientId);
    }
    setBusyKey(null);
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

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Portal SlimHiper</p>
              <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
                Ola, {snapshot.patient.preferredName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Consulte documentos liberados, financeiro, mensagens, notificacoes e check-ins do
                seu programa.
              </p>
            </div>

            {snapshot.patients.length > 1 ? (
              <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
                Paciente vinculado
                <select
                  value={selectedPatientId}
                  onChange={(event) => void handlePatientChange(event.target.value)}
                  className="min-w-64 rounded-xl border border-border bg-background px-3 py-2 text-sm"
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
          </div>
        </header>

        {actionMessage ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
            {actionMessage}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            icon={FileText}
            label="Documentos"
            value={String(snapshot.documents.length)}
          />
          <MetricCard
            icon={CreditCard}
            label="Cobrancas"
            value={String(snapshot.invoices.length)}
          />
          <MetricCard icon={Bell} label="Notificacoes unread" value={String(unreadNotifications)} />
        </section>

        <nav
          className="flex gap-2 overflow-x-auto rounded-2xl border border-border bg-card p-2 shadow-sm"
          aria-label="Abas do portal"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
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
                snapshot.checkins.map((checkin) => (
                  <article
                    key={checkin.id}
                    className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <h3 className="font-semibold text-foreground">{checkin.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        Prazo {formatDate(checkin.dueDate)} · {checkin.status}
                      </p>
                    </div>
                    {checkin.status !== 'completed' && checkin.status !== 'canceled' ? (
                      <button
                        type="button"
                        onClick={() => void handleCompleteCheckin(checkin.id)}
                        disabled={busyKey === checkin.id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Enviar check-in
                      </button>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
