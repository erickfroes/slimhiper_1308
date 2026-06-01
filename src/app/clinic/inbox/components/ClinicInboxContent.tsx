'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Archive,
  Bell,
  Check,
  Filter,
  Inbox,
  MessageSquare,
  RefreshCcw,
  UserCheck,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import {
  archiveNotification,
  assignThreadToMe,
  listClinicInbox,
  markNotificationRead,
  markThreadRead,
  setThreadStatus,
  type ClinicInboxPayload,
  type InboxConversation,
  type InboxTab,
} from '@/services/notificationsApi';

const tabs: Array<{ key: InboxTab; label: string; icon: React.ElementType }> = [
  { key: 'conversas', label: 'Conversas', icon: MessageSquare },
  { key: 'notificacoes', label: 'Notificações', icon: Bell },
  { key: 'atribuidas', label: 'Atribuídas a mim', icon: UserCheck },
];

function formatDateTime(value: string) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function severityClass(severity: string) {
  if (severity === 'critical' || severity === 'high') return 'bg-red-50 text-red-700';
  if (severity === 'low') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-50 text-amber-700';
}

function moderationLabel(status?: 'approved' | 'pending_review' | 'removed') {
  if (status === 'pending_review') return 'Sob revisão';
  if (status === 'removed') return 'Conteúdo removido';
  return null;
}

function statusLabel(status: InboxConversation['status']) {
  if (status === 'closed') return 'Fechada';
  if (status === 'archived') return 'Arquivada';
  return 'Aberta';
}

export default function ClinicInboxContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as InboxTab | null) ?? 'conversas';
  const [activeTab, setActiveTab] = useState<InboxTab>(
    tabs.some((tab) => tab.key === initialTab) ? initialTab : 'conversas'
  );
  const [unreadOnly, setUnreadOnly] = useState(searchParams.get('unread') === '1');
  const [patientId, setPatientId] = useState('');
  const [category, setCategory] = useState('');
  const [payload, setPayload] = useState<ClinicInboxPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const conversations = useMemo(() => payload?.conversations ?? [], [payload]);
  const notifications = useMemo(() => payload?.notifications ?? [], [payload]);
  const unreadConversationCount = useMemo(
    () => conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
    [conversations]
  );
  const unreadNotificationCount = notifications.filter(
    (notification) => notification.status === 'unread'
  ).length;

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listClinicInbox({
      tab: activeTab,
      unreadOnly,
      patientId: patientId.trim() || undefined,
      category: category.trim() || undefined,
      limit: 75,
    });

    if (result.error) {
      setError(result.error.message);
      setPayload(null);
    } else {
      setPayload(result.data);
    }
    setLoading(false);
  }, [activeTab, category, patientId, unreadOnly]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  async function runAction(id: string, action: () => Promise<unknown>) {
    setActionId(id);
    await action();
    await loadInbox();
    setActionId(null);
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <PageHeader
        title="Inbox clínico"
        subtitle="Conversas, notificações operacionais e filas atribuídas com contadores reais e mutators auditados."
        actions={
          <button type="button" onClick={() => void loadInbox()} className="btn-secondary gap-2">
            <RefreshCcw size={15} /> Atualizar
          </button>
        }
      />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="card-base p-4">
          <p className="text-xs font-medium text-muted-foreground">Mensagens não lidas</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{unreadConversationCount}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs font-medium text-muted-foreground">Notificações unread</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{unreadNotificationCount}</p>
        </div>
        <div className="card-base p-4">
          <p className="text-xs font-medium text-muted-foreground">Escopo</p>
          <p className="mt-2 text-sm font-semibold text-foreground">Tenant ativo + permissões</p>
          <p className="mt-1 text-xs text-muted-foreground">Sem push/email/WhatsApp nesta fase.</p>
        </div>
      </section>

      <section className="card-base overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Abas do inbox">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.key)}
                    className={[
                      'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    ].join(' ')}
                  >
                    <Icon size={15} /> {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(160px,0.8fr)_auto] xl:min-w-[560px]">
              <input
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
                className="input-base py-2 text-sm"
                placeholder="Filtrar por UUID do paciente"
                aria-label="Filtrar por paciente"
              />
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="input-base py-2 text-sm"
                placeholder="Categoria"
                aria-label="Filtrar por categoria"
              />
              <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(event) => setUnreadOnly(event.target.checked)}
                />
                <Filter size={13} /> Não lidas
              </label>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-4" aria-label="Carregando inbox">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <div
              role="alert"
              className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Inbox indisponível</p>
                  <p className="mt-1">{error}</p>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'notificacoes' ? (
          notifications.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Bell}
                title="Nenhuma notificação encontrada"
                description="Eventos operacionais autorizados aparecerão aqui quando forem gerados."
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <article
                  key={notification.id}
                  className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground">
                        {notification.title}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${severityClass(notification.severity)}`}
                      >
                        {notification.severity}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {notification.status}
                      </span>
                      {moderationLabel(notification.moderationStatus) && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          {moderationLabel(notification.moderationStatus)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {notification.body || 'Notificação operacional sem corpo sensível.'}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(notification.createdAt)} · {notification.category}
                      {notification.patientName ? ` · ${notification.patientName}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={notification.href} className="btn-secondary py-1.5 text-xs">
                      Abrir
                    </Link>
                    {notification.status === 'unread' && (
                      <button
                        type="button"
                        disabled={actionId === notification.id}
                        onClick={() =>
                          void runAction(notification.id, () =>
                            markNotificationRead(notification.notificationId)
                          )
                        }
                        className="btn-secondary py-1.5 text-xs disabled:opacity-60"
                      >
                        <Check size={13} /> Lida
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={actionId === notification.id}
                      onClick={() =>
                        void runAction(notification.id, () =>
                          archiveNotification(notification.notificationId)
                        )
                      }
                      className="btn-secondary py-1.5 text-xs disabled:opacity-60"
                    >
                      <Archive size={13} /> Arquivar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : conversations.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Inbox}
              title="Nenhuma conversa encontrada"
              description="As mensagens de pacientes aparecem aqui com contadores e atribuição segura."
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {conversations.map((conversation) => (
              <article
                key={conversation.id}
                className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">
                      {conversation.patientName}
                    </h2>
                    {conversation.unreadCount > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                        {conversation.unreadCount} não lidas
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {statusLabel(conversation.status)}
                    </span>
                    {moderationLabel(conversation.moderationStatus) && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        {moderationLabel(conversation.moderationStatus)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {conversation.lastMessageFrom}:
                    </span>{' '}
                    {conversation.lastMessagePreview}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDateTime(conversation.lastMessageAt)} · {conversation.sla} ·{' '}
                    {conversation.assignedToName
                      ? `Resp. ${conversation.assignedToName}`
                      : 'Sem responsável'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={conversation.href} className="btn-secondary py-1.5 text-xs">
                    Abrir paciente
                  </Link>
                  {conversation.unreadCount > 0 && (
                    <button
                      type="button"
                      disabled={actionId === conversation.id}
                      onClick={() =>
                        void runAction(conversation.id, () => markThreadRead(conversation.threadId))
                      }
                      className="btn-secondary py-1.5 text-xs disabled:opacity-60"
                    >
                      <Check size={13} /> Lida
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={actionId === conversation.id}
                    onClick={() =>
                      void runAction(conversation.id, () => assignThreadToMe(conversation.threadId))
                    }
                    className="btn-secondary py-1.5 text-xs disabled:opacity-60"
                  >
                    <UserCheck size={13} /> Assumir
                  </button>
                  <button
                    type="button"
                    disabled={actionId === conversation.id}
                    onClick={() =>
                      void runAction(conversation.id, () =>
                        setThreadStatus(
                          conversation.threadId,
                          conversation.status === 'closed' ? 'open' : 'closed'
                        )
                      )
                    }
                    className="btn-secondary py-1.5 text-xs disabled:opacity-60"
                  >
                    {conversation.status === 'closed' ? 'Reabrir' : 'Fechar'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
