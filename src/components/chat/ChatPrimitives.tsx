'use client';

import React, { useId, useRef, useState } from 'react';
import NextImage from 'next/image';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  PatientChatAttachment,
  PatientChatServiceHours,
  PatientChatShortcut,
} from '@/domain/types';
import type { InboxConversation } from '@/services/notificationsApi';

function formatDateTime(value?: string | null) {
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

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function slaTone(status?: InboxConversation['slaStatus']) {
  if (status === 'breached') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

interface ChatAvailabilityStatusProps {
  serviceHours?: PatientChatServiceHours | null;
  compact?: boolean;
}

export function ChatAvailabilityStatus({
  serviceHours,
  compact = false,
}: ChatAvailabilityStatusProps) {
  const available = serviceHours?.isAvailable !== false;
  const label = available ? 'Atendimento disponivel' : 'Fora do horario';
  const detail = serviceHours
    ? `${serviceHours.days || 'Dias uteis'} ${serviceHours.start || '--'}-${serviceHours.end || '--'}`
    : 'Horario nao informado';

  return (
    <div
      className={[
        'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold',
        available
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700',
        compact ? 'py-1.5' : '',
      ].join(' ')}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label}</span>
      {!compact ? <span className="font-medium opacity-75">{detail}</span> : null}
    </div>
  );
}

interface ChatQuickRepliesProps {
  shortcuts: PatientChatShortcut[];
  disabled?: boolean;
  onSelect: (text: string) => void;
}

export function ChatQuickReplies({ shortcuts, disabled, onSelect }: ChatQuickRepliesProps) {
  if (shortcuts.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" aria-label="Respostas rapidas">
      {shortcuts.map((shortcut) => (
        <button
          key={shortcut.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(shortcut.text)}
          className="shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-left text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          title={shortcut.title ?? shortcut.text}
        >
          {shortcut.title ?? shortcut.text}
        </button>
      ))}
    </div>
  );
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
  selectedFile?: File | null;
  onFileSelect?: (file: File | null) => void;
  onClearFile?: () => void;
  sendLabel?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  busy,
  placeholder = 'Digite uma mensagem...',
  selectedFile,
  onFileSelect,
  onClearFile,
  sendLabel = 'Enviar',
}: ChatInputProps) {
  const inputId = useId();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const canSend = Boolean(value.trim() || selectedFile) && !disabled && !busy;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    onFileSelect?.(event.target.files?.[0] ?? null);
    event.target.value = '';
    setMenuOpen(false);
  }

  return (
    <div className="space-y-2">
      {selectedFile ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
          <div className="flex min-w-0 items-center gap-2">
            {selectedFile.type.startsWith('image/') ? (
              <ImageIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            )}
            <span className="truncate font-semibold">{selectedFile.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {formatFileSize(selectedFile.size)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClearFile}
            className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Remover anexo"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <div className="relative">
          <button
            type="button"
            disabled={disabled || busy || !onFileSelect}
            onClick={() => setMenuOpen((current) => !current)}
            className="btn-secondary h-11 w-11 justify-center px-0 disabled:opacity-50"
            aria-label="Adicionar anexo"
            aria-expanded={menuOpen}
            aria-controls={`${inputId}-attachment-menu`}
          >
            <Paperclip className="h-4 w-4" aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div
              id={`${inputId}-attachment-menu`}
              className="absolute bottom-12 left-0 z-20 w-44 rounded-lg border border-border bg-card p-1 shadow-lg"
            >
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted"
              >
                <ImageIcon className="h-4 w-4" aria-hidden="true" /> Imagem
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted"
              >
                <FileText className="h-4 w-4" aria-hidden="true" /> PDF
              </button>
            </div>
          ) : null}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSend();
          }}
          rows={2}
          maxLength={2000}
          disabled={disabled || busy}
          className="input-base min-h-11 flex-1 resize-none bg-background py-2 text-sm"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="btn-primary h-11 justify-center px-4 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{busy ? 'Enviando' : sendLabel}</span>
        </button>
      </div>
    </div>
  );
}

interface ChatImageViewerProps {
  attachment: PatientChatAttachment;
  url?: string | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onRetry?: () => void;
}

export function ChatImageViewer({
  attachment,
  url,
  loading,
  error,
  onClose,
  onRetry,
}: ChatImageViewerProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{attachment.fileName}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost h-9 w-9 justify-center px-0"
            aria-label="Fechar visualizador"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex min-h-80 items-center justify-center bg-muted/30 p-4">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          ) : error ? (
            <div className="space-y-3 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{error}</p>
              {onRetry ? (
                <button type="button" onClick={onRetry} className="btn-secondary justify-center">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
                </button>
              ) : null}
            </div>
          ) : url ? (
            <div className="relative h-[72vh] w-full">
              <NextImage
                src={url}
                alt={attachment.fileName}
                fill
                sizes="90vw"
                className="rounded-lg object-contain"
                unoptimized
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface RoomListItemProps {
  conversation: InboxConversation;
  selected?: boolean;
  actionBusy?: boolean;
  onOpen: () => void;
  onAssign: () => void;
}

export function RoomListItem({
  conversation,
  selected,
  actionBusy,
  onOpen,
  onAssign,
}: RoomListItemProps) {
  return (
    <article
      className={[
        'border-b border-border p-3 transition last:border-b-0',
        selected ? 'bg-primary/10' : 'bg-card hover:bg-muted/30',
      ].join(' ')}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {conversation.patientName}
              </h2>
              {conversation.unreadCount > 0 ? (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {conversation.unreadCount}
                </span>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {conversation.lastMessageFrom}:{' '}
              </span>
              {conversation.lastMessagePreview}
            </p>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatDateTime(conversation.lastMessageAt)}
          </span>
        </div>
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${slaTone(conversation.slaStatus)}`}
        >
          {conversation.sla}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          <UserCheck className="h-3 w-3" aria-hidden="true" />
          {conversation.assignedToName ?? 'Sem dono'}
        </span>
        {conversation.serviceAvailable === false ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            Fora do horario
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onAssign}
        disabled={actionBusy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Assumir
      </button>
    </article>
  );
}
