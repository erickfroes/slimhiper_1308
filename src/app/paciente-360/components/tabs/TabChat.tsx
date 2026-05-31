'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PatientChatMessage, PatientChatSummary } from '@/domain/types';
import {
  AlertCircle,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Send,
  ShieldCheck,
  User,
  Zap,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import {
  getPatientChat,
  markPatientChatAsAnswered,
  openPatientChatThread,
  sendPatientChatMessage,
} from '@/services/chatApi';

interface TabChatProps {
  patientId: string;
  chat?: PatientChatSummary | null;
  patientName: string;
  canWriteChat: boolean;
}

function formatChatTime(value?: string) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function countUnread(messages: PatientChatMessage[], fallback: number) {
  if (fallback > 0) return fallback;
  return messages.filter((message) => message.from === 'patient' && !message.read).length;
}

function InlineError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export default function TabChat({
  patientId,
  chat: initialChat,
  patientName,
  canWriteChat,
}: TabChatProps) {
  const [chat, setChat] = useState<PatientChatSummary | null>(initialChat ?? null);
  const [quickMessage, setQuickMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState(false);
  const [markingAnswered, setMarkingAnswered] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const loadChat = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await getPatientChat(patientId);
      if (error) {
        setChat(null);
        setLoadError(error.message);
        return;
      }
      setChat(data);
    } catch (error) {
      setChat(null);
      setLoadError(error instanceof Error ? error.message : 'Falha inesperada ao carregar chat.');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void loadChat();
  }, [loadChat]);

  const messages = useMemo(() => chat?.messages ?? [], [chat?.messages]);
  const unreadCount = countUnread(messages, chat?.unreadCount ?? 0);
  const latestMessage = messages.at(-1);
  const responsible = chat?.responsibleTeamMember;
  const serviceHours = chat?.serviceHours;
  const sla = chat?.slaExpected;
  const shortcuts = chat?.shortcuts ?? [];
  const canSend = canWriteChat && Boolean(chat?.id) && chat?.isOpen === true;

  const handleOpenThread = async () => {
    if (!canWriteChat) return;
    setOpening(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const { data, error } = await openPatientChatThread(patientId);
      if (error) {
        setActionError(error.message);
        return;
      }
      setChat(data);
      setActionSuccess('Chat aberto para atendimento.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha inesperada ao abrir chat.');
    } finally {
      setOpening(false);
    }
  };

  const handleSend = async () => {
    if (!quickMessage.trim() || !chat?.id || !canSend) return;
    setSending(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const { data, error } = await sendPatientChatMessage(patientId, chat.id, quickMessage);
      if (error) {
        setActionError(error.message);
        return;
      }
      setChat(data);
      setQuickMessage('');
      setActionSuccess('Mensagem registrada no chat.');
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Falha inesperada ao enviar mensagem.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleMarkAnswered = async () => {
    if (!chat?.id || unreadCount === 0 || !canWriteChat) return;
    setMarkingAnswered(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const { data, error } = await markPatientChatAsAnswered(patientId, chat.id);
      if (error) {
        setActionError(error.message);
        return;
      }
      setChat(data);
      setActionSuccess('Chat marcado como respondido.');
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Falha inesperada ao atualizar leitura do chat.'
      );
    } finally {
      setMarkingAnswered(false);
    }
  };

  if (loading) {
    return (
      <div className="card-base p-5">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin text-primary" />
          Carregando chat do paciente...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card-base p-5 space-y-4">
        <InlineError message={loadError} />
        <button
          type="button"
          onClick={() => void loadChat()}
          className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
        >
          <RefreshCcw size={14} />
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="space-y-4">
        <div className="card-base p-5">
          <EmptyState
            icon={MessageCircle}
            title="Chat sem conversa ativa"
            description="Nenhuma thread de atendimento foi encontrada para este paciente."
          />
        </div>
        {actionError && <InlineError message={actionError} />}
        {canWriteChat ? (
          <button
            type="button"
            onClick={() => void handleOpenThread()}
            disabled={opening}
            className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
          >
            {opening ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
            Ativar conversa
          </button>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Permissao de escrita em chat necessaria para ativar conversa.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card-base flex items-start gap-3 p-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <User size={15} className="text-primary" />
          </div>
          <div>
            <p className="mb-0.5 text-xs text-muted-foreground">Responsavel</p>
            <p className="text-sm font-semibold text-foreground">{responsible?.name ?? 'Equipe'}</p>
            <p className="text-xs text-muted-foreground">{responsible?.role ?? 'Chat clinico'}</p>
          </div>
        </div>

        <div className="card-base flex items-start gap-3 p-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Clock size={15} className="text-blue-500" />
          </div>
          <div>
            <p className="mb-0.5 text-xs text-muted-foreground">Horario de atendimento</p>
            <p className="text-sm font-semibold text-foreground">{serviceHours?.days ?? '--'}</p>
            <p className="text-xs text-muted-foreground">
              {serviceHours ? `${serviceHours.start} - ${serviceHours.end}` : 'Nao informado'}
            </p>
          </div>
        </div>

        <div className="card-base flex items-start gap-3 p-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
            <AlertCircle size={15} className="text-amber-500" />
          </div>
          <div>
            <p className="mb-0.5 text-xs text-muted-foreground">SLA esperado</p>
            <p className="text-sm font-semibold text-foreground">{sla?.label ?? '--'}</p>
            <p className="text-xs text-muted-foreground">{sla?.note ?? 'Nao informado'}</p>
          </div>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={15} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Ultimas mensagens</span>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                <AlertCircle size={11} />
                {unreadCount} nao {unreadCount === 1 ? 'lida' : 'lidas'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive">
                <CheckCircle2 size={11} />
                Todas lidas
              </span>
            )}
            <div
              className={[
                'h-2 w-2 flex-shrink-0 rounded-full',
                chat.isOpen ? 'bg-positive' : 'bg-muted-foreground',
              ].join(' ')}
            />
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={MessageCircle}
              title="Sem mensagens"
              description="A thread existe, mas ainda nao possui mensagens."
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {messages.slice(-4).map((message) => (
              <div key={message.id} className="flex items-start gap-3 px-4 py-3">
                <div
                  className={[
                    'mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    message.from === 'staff'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {message.from === 'staff' ? (responsible?.name?.[0] ?? 'E') : patientName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {message.from === 'staff' ? (responsible?.name ?? 'Equipe') : patientName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatChatTime(message.time)}
                    </span>
                    {message.from === 'staff' && (
                      <CheckCheck
                        size={12}
                        className={message.read ? 'text-blue-500' : 'text-muted-foreground'}
                      />
                    )}
                    {message.from === 'patient' && !message.read && (
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{message.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {latestMessage && (
          <div className="flex items-center gap-2 border-t border-border bg-muted/20 px-4 py-2">
            <Clock size={12} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Ultima mensagem: {formatChatTime(latestMessage.time)} -{' '}
              {latestMessage.from === 'patient' ? patientName : (responsible?.name ?? 'Equipe')}
            </span>
          </div>
        )}
      </div>

      {shortcuts.length > 0 && (
        <div className="card-base p-4">
          <div className="mb-3 flex items-center gap-2">
            <Zap size={14} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Atalhos</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shortcuts.map((shortcut) => (
              <button
                key={shortcut.id}
                type="button"
                onClick={() => setQuickMessage(shortcut.text)}
                disabled={!canSend}
                className="group flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronRight
                  size={13}
                  className="flex-shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                />
                <span className="truncate text-xs text-foreground">{shortcut.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card-base p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Enviar mensagem</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={quickMessage}
            onChange={(event) => setQuickMessage(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void handleSend()}
            placeholder={canSend ? 'Digite uma mensagem...' : 'Chat indisponivel para envio'}
            disabled={!canSend || sending}
            className="input-base flex-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!quickMessage.trim() || !canSend || sending}
            className="btn-primary flex items-center gap-2 px-4 disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            <span className="text-sm">Enviar</span>
          </button>
        </div>
        {actionError && (
          <div className="mt-3">
            <InlineError message={actionError} />
          </div>
        )}
        {actionSuccess && (
          <p className="mt-2 flex items-center gap-1 text-xs text-positive">
            <CheckCircle2 size={12} /> {actionSuccess}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => void handleOpenThread()}
          disabled={!canWriteChat || opening || chat.isOpen}
          className="btn-primary flex items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-50"
        >
          {opening ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
          {chat.isOpen ? 'Chat aberto' : 'Reabrir chat'}
        </button>

        <button
          type="button"
          onClick={() => void handleMarkAnswered()}
          disabled={!canWriteChat || unreadCount === 0 || markingAnswered}
          className="btn-secondary flex items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-50"
        >
          {markingAnswered ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <CheckCheck size={15} />
          )}
          Marcar como respondido
        </button>

        <button
          type="button"
          onClick={() => setShowHistory((value) => !value)}
          className="btn-secondary flex items-center justify-center gap-2 py-2.5 text-sm"
        >
          <History size={15} />
          Ver historico
        </button>
      </div>

      {showHistory && (
        <div className="card-base p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <History size={14} className="text-primary" />
            Historico de conversas
          </p>
          {chat.threads?.length ? (
            <div className="space-y-2">
              {chat.threads.map((thread) => (
                <div
                  key={thread.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5"
                >
                  <div>
                    <p className="text-xs font-medium text-foreground">{thread.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatChatTime(thread.date)} - {thread.messageCount} mensagens
                    </p>
                  </div>
                  <ChevronRight size={14} className="flex-shrink-0 text-muted-foreground" />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={History}
              title="Historico vazio"
              description="Nenhuma thread anterior foi retornada pelo backend."
            />
          )}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <ShieldCheck size={14} className="flex-shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Mensagens protegidas em ambiente seguro.</p>
      </div>
    </div>
  );
}
