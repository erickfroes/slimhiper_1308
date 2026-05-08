'use client';

import React from 'react';
import { CheckSquare, Plus } from 'lucide-react';
import type { ProgramBuilderDraft } from '@/domain/types';
import { mockCheckinTemplates } from '@/data/mockBuilderData';

interface Props {
  draft: ProgramBuilderDraft;
  onChange: (patch: Partial<ProgramBuilderDraft>) => void;
}

const channelLabel: Record<string, string> = {
  app: 'App',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  presencial: 'Presencial',
};

const frequencyOptions = [
  'Semanal via app',
  'Quinzenal via app',
  'Mensal via app',
  'Semanal via WhatsApp',
  'Quinzenal via WhatsApp',
];

export default function StepCheckins({ draft, onChange }: Props) {
  const selectedTemplateIds = draft.checkinTemplates.map((t) => t.id);

  const toggleTemplate = (id: string) => {
    const template = mockCheckinTemplates.find((t) => t.id === id);
    if (!template) return;
    const isSelected = selectedTemplateIds.includes(id);
    onChange({
      checkinTemplates: isSelected
        ? draft.checkinTemplates.filter((t) => t.id !== id)
        : [...draft.checkinTemplates, template],
    });
  };

  return (
    <div className="space-y-5">
      {/* Config */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Configuração geral</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Total de check-ins</label>
            <input
              type="number"
              min={0}
              value={draft.checkInsTotal}
              onChange={(e) => onChange({ checkInsTotal: Number(e.target.value) })}
              className="input-base w-full"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Frequência</label>
            <select
              value={draft.checkInFrequency}
              onChange={(e) => onChange({ checkInFrequency: e.target.value })}
              className="input-base w-full"
            >
              {frequencyOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Templates */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Templates de check-in</h3>
          <span className="text-xs text-muted-foreground">
            {selectedTemplateIds.length} selecionado{selectedTemplateIds.length !== 1 ? 's' : ''}
          </span>
        </div>

        {mockCheckinTemplates.map((template) => {
          const selected = selectedTemplateIds.includes(template.id);
          return (
            <div
              key={template.id}
              onClick={() => toggleTemplate(template.id)}
              className={[
                'card p-4 cursor-pointer transition-all',
                selected ? 'border-primary/40 bg-primary/5' : 'hover:border-border/80',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                <div
                  className={[
                    'w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border transition-all',
                    selected ? 'bg-primary border-primary' : 'border-border',
                  ].join(' ')}
                >
                  {selected && (
                    <CheckSquare size={12} className="text-primary-foreground" strokeWidth={3} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground">{template.label}</span>
                    <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      {template.frequency}
                    </span>
                    <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      {channelLabel[template.channel]}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {template.questions.map((q, i) => (
                      <li
                        key={i}
                        className="text-xs text-muted-foreground flex items-start gap-1.5"
                      >
                        <span className="text-primary/60 font-bold mt-0.5">·</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}

        <button className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all">
          <Plus size={16} />
          Criar template personalizado
        </button>
      </div>
    </div>
  );
}
