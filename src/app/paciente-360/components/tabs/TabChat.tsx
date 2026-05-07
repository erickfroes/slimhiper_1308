'use client';

import React, { useState } from 'react';
import type { PatientChatSummary } from '@/domain/types';
import { Send, Paperclip } from 'lucide-react';

interface TabChatProps {
  chat: PatientChatSummary;
  patientName: string;
}

interface MockMessage {
  id: string;
  from: 'patient' | 'staff';
  text: string;
  time: string;
}

const mockMessages: MockMessage[] = [
  { id: 'msg-001', from: 'patient', text: 'Oi! Tudo bem? Tenho uma dúvida sobre o remédio.', time: '09:45' },
  { id: 'msg-002', from: 'staff', text: 'Olá Juliana! Pode perguntar, estou aqui.', time: '09:52' },
  { id: 'msg-003', from: 'patient', text: 'Posso tomar a Metformina em horário diferente hoje? Tive um jantar tardio.', time: '10:15' },
  { id: 'msg-004', from: 'staff', text: 'Sim, pode tomar junto com a próxima refeição principal. Só não pule a dose!', time: '10:22' },
  { id: 'msg-005', from: 'patient', text: 'Dra, posso tomar o remédio em outro horário hoje?', time: '10:22' },
];

export default function TabChat({ chat, patientName }: TabChatProps) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<MockMessage[]>(mockMessages);

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: `msg-${Date.now()}`, from: 'staff', text: message.trim(), time: 'agora' },
    ]);
    setMessage('');
  };

  return (
    <div className="card-base overflow-hidden flex flex-col" style={{ height: '520px' }}>
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
          {patientName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{patientName}</p>
          <p className="text-xs text-muted-foreground">
            {chat.unreadCount > 0 ? `${chat.unreadCount} mensagens não lidas` : 'Chat ativo'}
          </p>
        </div>
        <div className={['ml-auto w-2 h-2 rounded-full', chat.isOpen ? 'bg-positive' : 'bg-muted-foreground'].join(' ')} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={['flex', msg.from === 'staff' ? 'justify-end' : 'justify-start'].join(' ')}
          >
            <div
              className={[
                'max-w-xs px-3 py-2 rounded-2xl text-sm',
                msg.from === 'staff' ?'bg-primary text-primary-foreground rounded-br-sm' :'bg-muted text-foreground rounded-bl-sm',
              ].join(' ')}
            >
              <p>{msg.text}</p>
              <p className={['text-xs mt-1', msg.from === 'staff' ? 'text-primary-foreground/70' : 'text-muted-foreground'].join(' ')}>
                {msg.time}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border flex items-center gap-2">
        <button className="btn-ghost p-2 flex-shrink-0">
          <Paperclip size={15} />
        </button>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Digite uma mensagem..."
          className="input-base flex-1 text-sm"
        />
        <button
          onClick={sendMessage}
          disabled={!message.trim()}
          className="btn-primary p-2 flex-shrink-0 disabled:opacity-50"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}