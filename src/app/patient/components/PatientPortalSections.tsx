'use client';

import { useState } from 'react';
import { CheckCircle2, FileText, Image as ImageIcon } from 'lucide-react';
import {
  ChatAvailabilityStatus,
  ChatImageViewer,
  ChatInput,
} from '@/components/chat/ChatPrimitives';
import DataState from '@/components/ui/DataState';
import type { PatientPortalSnapshot } from '@/services/patientPortalApi';
import { getChatAttachmentSignedUrl } from '@/services/chatApi';
import type { PatientChatAttachment } from '@/domain/types';

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
  selectedFile: File | null;
  onMessageChange: (value: string) => void;
  onFileSelect: (file: File | null) => void;
  onClearFile: () => void;
  onSendMessage: () => void;
}

export function PortalChatSection({
  snapshot,
  busyKey,
  message,
  selectedFile,
  onMessageChange,
  onFileSelect,
  onClearFile,
  onSendMessage,
}: PortalChatSectionProps) {
  const [viewer, setViewer] = useState<{
    attachment: PatientChatAttachment;
    url?: string | null;
    loading: boolean;
    error?: string | null;
  } | null>(null);

  async function openAttachment(attachment: PatientChatAttachment) {
    if (attachment.status !== 'uploaded') return;

    setViewer({ attachment, loading: true });
    const result = await getChatAttachmentSignedUrl(attachment.id);
    if (result.error || !result.data?.url) {
      setViewer({
        attachment,
        loading: false,
        error: result.error?.message ?? 'Nao foi possivel abrir o anexo.',
      });
      return;
    }

    if (attachment.kind === 'image') {
      setViewer({ attachment, url: result.data.url, loading: false });
      return;
    }

    window.open(result.data.url, '_blank', 'noopener,noreferrer');
    setViewer(null);
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
      <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Chat com a equipe</h2>
          <p className="text-sm text-muted-foreground">
            {snapshot.chat.status === 'closed' ? 'Conversa fechada' : 'Conversa aberta'}
          </p>
        </div>
        <ChatAvailabilityStatus serviceHours={snapshot.chat.serviceHours} />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/30 p-3 sm:p-4">
        {snapshot.chat.messages.length === 0 ? (
          <DataState
            kind="empty"
            title="Nenhuma mensagem ainda"
            description="Envie uma duvida para iniciar o atendimento com a equipe."
            className="min-h-64 bg-background"
          />
        ) : (
          snapshot.chat.messages.map((chatMessage) => (
            <div
              key={chatMessage.id}
              className={`rounded-lg p-3 ${chatMessage.isOwn ? 'ml-auto bg-primary text-primary-foreground' : 'mr-auto bg-card text-foreground'} max-w-[85%]`}
            >
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold opacity-80">{chatMessage.senderLabel}</p>
                {chatMessage.isAutomated ? (
                  <span className="rounded-full bg-background/20 px-2 py-0.5 text-[10px] font-semibold">
                    automatica
                  </span>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{chatMessage.body}</p>
              {chatMessage.attachments.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {chatMessage.attachments.map((attachment) => (
                    <button
                      key={attachment.id}
                      type="button"
                      onClick={() => void openAttachment(attachment)}
                      disabled={attachment.status !== 'uploaded'}
                      className="inline-flex max-w-full items-center gap-2 rounded-md border border-border/60 bg-background/90 px-2.5 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60"
                    >
                      {attachment.kind === 'image' ? (
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span className="truncate">{attachment.fileName}</span>
                      {attachment.status === 'failed' ? <span>falhou</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-card/95 p-3 safe-bottom">
        {snapshot.chat.serviceHours?.isAvailable === false &&
        snapshot.chat.serviceHours.unavailableMessage ? (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            {snapshot.chat.serviceHours.unavailableMessage}
          </p>
        ) : null}
        <ChatInput
          value={message}
          onChange={onMessageChange}
          selectedFile={selectedFile}
          onFileSelect={onFileSelect}
          onClearFile={onClearFile}
          onSend={onSendMessage}
          busy={busyKey === 'chat'}
          placeholder="Escreva sua mensagem..."
        />
      </div>

      {viewer ? (
        <ChatImageViewer
          attachment={viewer.attachment}
          url={viewer.url}
          loading={viewer.loading}
          error={viewer.error}
          onClose={() => setViewer(null)}
          onRetry={() => void openAttachment(viewer.attachment)}
        />
      ) : null}
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
