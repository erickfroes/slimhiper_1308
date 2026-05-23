'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ProgramBuilderDraft, ProgramService } from '@/domain/types';

interface Props {
  draft: ProgramBuilderDraft;
  onChange: (patch: Partial<ProgramBuilderDraft>) => void;
}

const servicePresets: ProgramService[] = [
  { label: 'Consultas médicas', quantity: 4, unit: 'sessões' },
  { label: 'Sessões de nutrição', quantity: 4, unit: 'sessões' },
  { label: 'Bioimpedância', quantity: 2, unit: 'avaliações' },
  { label: 'Painéis laboratoriais', quantity: 2, unit: 'painéis' },
  { label: 'Avaliação de sono', quantity: 1, unit: 'avaliação' },
  { label: 'Consulta de psicologia', quantity: 2, unit: 'sessões' },
];

export default function StepServicos({ draft, onChange }: Props) {
  const services = draft.includedServices;

  const addService = () => {
    onChange({ includedServices: [...services, { label: '', quantity: 1, unit: 'sessões' }] });
  };

  const addPreset = (preset: ProgramService) => {
    const exists = services.some((s) => s.label === preset.label);
    if (!exists) onChange({ includedServices: [...services, { ...preset }] });
  };

  const updateService = (idx: number, patch: Partial<ProgramService>) => {
    onChange({ includedServices: services.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  };

  const removeService = (idx: number) => {
    onChange({ includedServices: services.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-5">
      {/* Presets */}
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Adicionar serviço rápido</h3>
        <div className="flex flex-wrap gap-2">
          {servicePresets.map((p) => {
            const added = services.some((s) => s.label === p.label);
            return (
              <button
                key={p.label}
                onClick={() => addPreset(p)}
                disabled={added}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  added
                    ? 'bg-primary/10 text-primary border-primary/30 cursor-default' :'bg-muted text-muted-foreground border-border hover:bg-primary/5 hover:text-primary hover:border-primary/30',
                ].join(' ')}
              >
                {added ? '✓ ' : '+ '}
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Service list */}
      <div className="space-y-3">
        {services.map((svc, idx) => (
          <div key={idx} className="card p-4">
            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-6 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Serviço</label>
                <input
                  type="text"
                  value={svc.label}
                  onChange={(e) => updateService(idx, { label: e.target.value })}
                  className="input-base w-full"
                  placeholder="Nome do serviço"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Qtd.</label>
                <input
                  type="number"
                  min={1}
                  value={svc.quantity}
                  onChange={(e) => updateService(idx, { quantity: Number(e.target.value) })}
                  className="input-base w-full"
                />
              </div>
              <div className="col-span-3 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Unidade</label>
                <select
                  value={svc.unit}
                  onChange={(e) => updateService(idx, { unit: e.target.value })}
                  className="input-base w-full"
                >
                  <option>sessões</option>
                  <option>avaliações</option>
                  <option>painéis</option>
                  <option>avaliação</option>
                  <option>consultas</option>
                </select>
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  onClick={() => removeService(idx)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-negative hover:bg-negative/10 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addService}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
      >
        <Plus size={16} />
        Adicionar serviço personalizado
      </button>
    </div>
  );
}
