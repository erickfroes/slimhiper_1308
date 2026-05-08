'use client';

import React, { useState } from 'react';
import type { PatientChatSummary } from '@/domain/types';
import {
  MessageCircle,
  Send,
  CheckCheck,
  History,
  Clock,
  User,
  ShieldCheck,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react';

interface TabChatProps {
  chat: PatientChatSummary;
  patientName: string;
}

export default function TabChat({ chat, patientName }: TabChatProps) {
  const [quickMessage, setQuickMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [markedAnswered, setMarkedAnswered] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const messages = chat.messages ?? [];
  const shortcuts = chat.shortcuts ?? [];
  const responsible = chat.responsibleTeamMember;
  const serviceHours = chat.serviceHours;
  const sla = chat.slaExpected;

  const handleSend = () => {
    if (!quickMessage.trim()) return;
    setSent(true);
    setQuickMessage('');
    setTimeout(() => setSent(false), 3000);
  };

  const handleMarkAnswered = () => {
    setMarkedAnswered(true);
  };

  const unreadMessages = messages.filter((m) => m.from === 'patient' && !m.read);
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  return (
    <div className="space-y-4">
      {/* Info row: responsável + horário + SLA */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card-base p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User size={15} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Responsável</p>
            <p className="text-sm font-semibold text-foreground">{responsible?.name ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{responsible?.role ?? ''}</p>
          </div>
        </div>

        <div className="card-base p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <Clock size={15} className="text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Horário de atendimento</p>
            <p className="text-sm font-semibold text-foreground">{serviceHours?.days ?? '—'}</p>
            <p className="text-xs text-muted-foreground">
              {serviceHours ? `${serviceHours.start} – ${serviceHours.end}` : ''}
            </p>
          </div>
        </div>

        <div className="card-base p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <AlertCircle size={15} className="text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">SLA esperado</p>
            <p className="text-sm font-semibold text-foreground">{sla?.label ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{sla?.note ?? ''}</p>
          </div>
        </div>
      </div>

      {/* Últimas mensagens + status de leitura */}
      <div className="card-base overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageCircle size={15} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Últimas mensagens</span>
          </div>
          <div className="flex items-center gap-2">
            {unreadMessages.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                <AlertCircle size={11} />
                {unreadMessages.length} não {unreadMessages.length === 1 ? 'lida' : 'lidas'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-positive bg-positive/10 rounded-full px-2 py-0.5">
                <CheckCircle2 size={11} />
                Todas lidas
              </span>
            )}
            <div
              className={[
                'w-2 h-2 rounded-full flex-shrink-0',
                chat.isOpen ? 'bg-positive' : 'bg-muted-foreground',
              ].join(' ')}
            />
          </div>
        </div>

        <div className="divide-y divide-border">
          {messages.slice(-4).map((msg) => (
            <div key={msg.id} className="flex items-start gap-3 px-4 py-3">
              <div
                className={[
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5',
                  msg.from === 'staff'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground',
                ].join(' ')}
              >
                {msg.from === 'staff' ? (responsible?.name?.[0] ?? 'A') : patientName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-foreground">
                    {msg.from === 'staff' ? (responsible?.name ?? 'Equipe') : patientName}
                  </span>
                  <span className="text-xs text-muted-foreground">{msg.time}</span>
                  {msg.from === 'staff' && (
                    <CheckCheck
                      size={12}
                      className={msg.read ? 'text-blue-500' : 'text-muted-foreground'}
                    />
                  )}
                  {msg.from === 'patient' && !msg.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Last message summary */}
        {lastMessage && (
          <div className="px-4 py-2 bg-muted/20 border-t border-border flex items-center gap-2">
            <Clock size={12} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Última mensagem: {lastMessage.time} —{' '}
              {lastMessage.from === 'patient' ? patientName : (responsible?.name ?? 'Equipe')}
            </span>
          </div>
        )}
      </div>

      {/* Atalhos */}
      {shortcuts.length > 0 && (
        <div className="card-base p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Atalhos</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {shortcuts.map((sc) => (
              <button
                key={sc.id}
                onClick={() => setQuickMessage(sc.text)}
                className="flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors group"
              >
                <ChevronRight
                  size={13}
                  className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0"
                />
                <span className="text-xs text-foreground truncate">{sc.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Enviar mensagem rápida */}
      <div className="card-base p-4">
        <p className="text-sm font-semibold text-foreground mb-3">Enviar mensagem</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={quickMessage}
            onChange={(e) => setQuickMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Digite uma mensagem rápida..."
            className="input-base flex-1 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={!quickMessage.trim()}
            className="btn-primary px-4 flex items-center gap-2 disabled:opacity-50"
          >
            <Send size={14} />
            <span className="text-sm">Enviar</span>
          </button>
        </div>
        {sent && (
          <p className="text-xs text-positive mt-2 flex items-center gap-1">
            <CheckCircle2 size={12} /> Mensagem enviada com sucesso.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button className="btn-primary flex items-center justify-center gap-2 py-2.5 text-sm">
          <MessageCircle size={15} />
          Abrir chat
        </button>

        <button
          onClick={handleMarkAnswered}
          disabled={markedAnswered}
          className={[
            'flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg border font-medium transition-colors',
            markedAnswered
              ? 'bg-positive/10 border-positive/30 text-positive cursor-default'
              : 'btn-secondary',
          ].join(' ')}
        >
          <CheckCheck size={15} />
          {markedAnswered ? 'Respondido' : 'Marcar como respondido'}
        </button>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className="btn-secondary flex items-center justify-center gap-2 py-2.5 text-sm"
        >
          <History size={15} />
          Ver histórico
        </button>

        <button className="btn-secondary flex items-center justify-center gap-2 py-2.5 text-sm">
          <Send size={15} />
          Enviar mensagem
        </button>
      </div>

      {/* Histórico expandido */}
      {showHistory && (
        <div className="card-base p-4">
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <History size={14} className="text-primary" />
            Histórico de conversas
          </p>
          <div className="space-y-2">
            {[
              {
                date: '28/04/2025',
                summary: 'Dúvida sobre Metformina — respondida por Dra. Ana Lima',
                msgs: 6,
              },
              {
                date: '15/04/2025',
                summary: 'Confirmação de consulta e ajuste de horário',
                msgs: 4,
              },
              { date: '02/04/2025', summary: 'Orientações pós-consulta enviadas', msgs: 3 },
            ].map((h, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/30 border border-border"
              >
                <div>
                  <p className="text-xs font-medium text-foreground">{h.summary}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {h.date} · {h.msgs} mensagens
                  </p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security notice */}
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/30 border border-border">
        <ShieldCheck size={14} className="text-muted-foreground flex-shrink-0" />
        <p className="text-xs text-muted-foreground">Mensagens protegidas em ambiente seguro.</p>
      </div>
    </div>
  );
}
