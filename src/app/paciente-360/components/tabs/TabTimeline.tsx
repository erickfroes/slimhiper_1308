'use client';

import React, { useState } from 'react';
import type { PatientTimelineEvent, TimelineEventType } from '@/domain/types';
import TimelineEventCard from '@/components/TimelineEventCard';
import EmptyState from '@/components/EmptyState';
import { Clock } from 'lucide-react';

const typeFilterOptions: { key: string; label: string; value: TimelineEventType | '' }[] = [
  { key: 'tf-todos', label: 'Todos', value: '' },
  { key: 'tf-consulta', label: 'Consultas', value: 'consulta' },
  { key: 'tf-nutricao', label: 'Nutrição', value: 'nutricao' },
  { key: 'tf-medida', label: 'Medidas', value: 'medida' },
  { key: 'tf-alerta', label: 'Alertas', value: 'alerta' },
  { key: 'tf-documento', label: 'Documentos', value: 'documento' },
  { key: 'tf-pagamento', label: 'Pagamentos', value: 'pagamento' },
];

interface TabTimelineProps {
  events: PatientTimelineEvent[];
}

export default function TabTimeline({ events }: TabTimelineProps) {
  const [filter, setFilter] = useState<TimelineEventType | ''>('');

  const filtered = filter ? events.filter((e) => e.type === filter) : events;

  return (
    <div>
      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {typeFilterOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.value)}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150',
              filter === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="card-base p-5">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Nenhum evento na timeline"
            description="Eventos clínicos, nutricionais e financeiros aparecerão aqui conforme o programa avança."
          />
        ) : (
          <div>
            {filtered.map((event, i) => (
              <TimelineEventCard
                key={event.id}
                event={event}
                isLast={i === filtered.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}