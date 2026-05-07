'use client';

import React from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { ProgramBuilderDraft, ProgramPhase } from '@/domain/types';

interface Props {
  draft: ProgramBuilderDraft;
  onChange: (patch: Partial<ProgramBuilderDraft>) => void;
}

export default function StepFases({ draft, onChange }: Props) {
  const phases = draft.phases;

  const addPhase = () => {
    const newPhase: ProgramPhase = {
      name: `Fase ${phases.length + 1}`,
      durationWeeks: 2,
      description: '',
    };
    onChange({ phases: [...phases, newPhase] });
  };

  const updatePhase = (idx: number, patch: Partial<ProgramPhase>) => {
    const updated = phases.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange({ phases: updated });
  };

  const removePhase = (idx: number) => {
    onChange({ phases: phases.filter((_, i) => i !== idx) });
  };

  const totalPhaseWeeks = phases.reduce((sum, p) => sum + p.durationWeeks, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="card p-4 flex items-center gap-6 bg-primary/5 border-primary/20">
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">{phases.length}</p>
          <p className="text-xs text-muted-foreground">Fases</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{totalPhaseWeeks}</p>
          <p className="text-xs text-muted-foreground">Semanas totais</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{draft.durationWeeks}</p>
          <p className="text-xs text-muted-foreground">Duração do programa</p>
        </div>
        {totalPhaseWeeks !== draft.durationWeeks && (
          <span className="ml-auto text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
            ⚠ Fases ({totalPhaseWeeks}s) ≠ Duração ({draft.durationWeeks}s)
          </span>
        )}
      </div>

      {/* Phase list */}
      <div className="space-y-3">
        {phases.map((phase, idx) => (
          <div key={idx} className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <GripVertical size={16} className="text-muted-foreground/40 flex-shrink-0" />
              <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                Fase {idx + 1}
              </span>
              <button
                onClick={() => removePhase(idx)}
                className="ml-auto p-1 rounded-lg text-muted-foreground hover:text-negative hover:bg-negative/10 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nome da fase</label>
                <input
                  type="text"
                  value={phase.name}
                  onChange={(e) => updatePhase(idx, { name: e.target.value })}
                  className="input-base w-full"
                  placeholder="Ex: Avaliação inicial"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Semanas</label>
                <input
                  type="number"
                  min={1}
                  value={phase.durationWeeks}
                  onChange={(e) => updatePhase(idx, { durationWeeks: Number(e.target.value) })}
                  className="input-base w-full"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Descrição</label>
              <textarea
                value={phase.description}
                onChange={(e) => updatePhase(idx, { description: e.target.value })}
                rows={2}
                className="input-base w-full resize-none"
                placeholder="Descreva os objetivos e atividades desta fase..."
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addPhase}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
      >
        <Plus size={16} />
        Adicionar fase
      </button>
    </div>
  );
}
