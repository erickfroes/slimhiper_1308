'use client';

import { CheckCircle2, Send } from 'lucide-react';
import DataState from '@/components/ui/DataState';
import type { PatientPortalSnapshot } from '@/services/patientPortalApi';

type BusyKey = string | null;
type CheckinAnswers = Record<string, Record<string, string>>;

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

export function getCheckinQuestions(questions: unknown[]) {
  return questions
    .map((question) => (typeof question === 'string' ? question.trim() : ''))
    .filter(Boolean)
    .slice(0, 20);
}

export function isCheckinAnswered(questions: string[], answers?: Record<string, string>) {
  if (questions.length === 0) return true;
  return questions.every((_, index) => answers?.[String(index)]?.trim());
}

interface SnapshotProps {
  snapshot: PatientPortalSnapshot;
}

export function PortalSummarySection({ snapshot }: SnapshotProps) {
  return (
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
          Este portal mostra somente dados do vinculo ativo selecionado. Responsaveis com mais de um
          vinculo podem alternar pacientes pelo seletor acima.
        </p>
      </div>
    </div>
  );
}

interface PortalDocumentsSectionProps extends SnapshotProps {
  busyKey: BusyKey;
  onOpenDocument: (documentId: string) => void;
}

export function PortalDocumentsSection({
  snapshot,
  busyKey,
  onOpenDocument,
}: PortalDocumentsSectionProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">Documentos liberados</h2>
      {snapshot.documents.length === 0 ? (
        <DataState
          kind="empty"
          title="Nenhum documento liberado"
          description="Quando a equipe liberar um documento para este vinculo, ele aparece aqui."
          className="bg-background"
        />
      ) : (
        snapshot.documents.map((document) => (
          <article
            key={document.id}
            className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3 className="font-semibold text-foreground">{document.name}</h3>
              <p className="text-sm text-muted-foreground">
                {document.category} - {document.status} - {formatDate(document.generatedAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenDocument(document.id)}
              disabled={busyKey === document.id}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Abrir link temporario
            </button>
          </article>
        ))
      )}
    </div>
  );
}

export function PortalFinanceSection({ snapshot }: SnapshotProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">Financeiro proprio</h2>
      {snapshot.invoices.length === 0 ? (
        <DataState
          kind="empty"
          title="Nenhuma cobranca encontrada"
          description="As cobrancas vinculadas a este paciente aparecem aqui quando forem liberadas."
          className="bg-background"
        />
      ) : (
        snapshot.invoices.map((invoice) => (
          <article key={invoice.id} className="rounded-2xl border border-border p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-foreground">
                  {invoice.description ?? 'Cobranca'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Vencimento {formatDate(invoice.dueDate)} - {invoice.status}
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
  );
}

interface PortalChatSectionProps extends SnapshotProps {
  busyKey: BusyKey;
  message: string;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void;
}

export function PortalChatSection({
  snapshot,
  busyKey,
  message,
  onMessageChange,
  onSendMessage,
}: PortalChatSectionProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">Chat com a equipe</h2>
      <div className="max-h-96 space-y-3 overflow-y-auto rounded-2xl bg-muted/40 p-4">
        {snapshot.chat.messages.length === 0 ? (
          <DataState
            kind="empty"
            title="Nenhuma mensagem ainda"
            description="Envie uma duvida para iniciar o atendimento com a equipe."
            className="min-h-40 bg-background"
          />
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
          onChange={(event) => onMessageChange(event.target.value)}
          rows={2}
          maxLength={2000}
          className="min-h-20 flex-1 rounded-2xl border border-border bg-background px-3 py-2 text-sm"
          placeholder="Escreva sua mensagem..."
        />
        <button
          type="button"
          onClick={onSendMessage}
          disabled={busyKey === 'chat' || !message.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Enviar
        </button>
      </div>
    </div>
  );
}

interface PortalNotificationsSectionProps extends SnapshotProps {
  busyKey: BusyKey;
  onReadNotification: (notificationId: string) => void;
}

export function PortalNotificationsSection({
  snapshot,
  busyKey,
  onReadNotification,
}: PortalNotificationsSectionProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">Notificacoes</h2>
      {snapshot.notifications.length === 0 ? (
        <DataState
          kind="empty"
          title="Nenhuma notificacao"
          description="Avisos da equipe e atualizacoes do programa aparecem aqui."
          className="bg-background"
        />
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
                  onClick={() => onReadNotification(notification.id)}
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
  );
}

interface PortalCheckinsSectionProps extends SnapshotProps {
  busyKey: BusyKey;
  checkinAnswers: CheckinAnswers;
  onAnswerChange: (checkinId: string, index: number, value: string) => void;
  onCompleteCheckin: (checkinId: string) => void;
}

export function PortalCheckinsSection({
  snapshot,
  busyKey,
  checkinAnswers,
  onAnswerChange,
  onCompleteCheckin,
}: PortalCheckinsSectionProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">Check-ins do programa</h2>
      {snapshot.checkins.length === 0 ? (
        <DataState
          kind="empty"
          title="Nenhum check-in atribuido"
          description="Quando a equipe solicitar um check-in, voce podera responder por aqui."
          className="bg-background"
        />
      ) : (
        snapshot.checkins.map((checkin) => {
          const questions = getCheckinQuestions(checkin.questions);
          const answers = checkinAnswers[checkin.id] ?? {};
          const canSubmit = isCheckinAnswered(questions, answers);
          const isClosed = checkin.status === 'completed' || checkin.status === 'canceled';

          return (
            <article key={checkin.id} className="space-y-4 rounded-2xl border border-border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{checkin.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    Prazo {formatDate(checkin.dueDate)} - {checkin.status}
                  </p>
                </div>
                {!isClosed ? (
                  <button
                    type="button"
                    onClick={() => onCompleteCheckin(checkin.id)}
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
                        onChange={(event) => onAnswerChange(checkin.id, index, event.target.value)}
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
  );
}
