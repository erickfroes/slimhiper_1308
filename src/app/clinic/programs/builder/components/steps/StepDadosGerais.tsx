'use client';

import React from 'react';
import type { ProgramBuilderDraft, ProgramType } from '@/domain/types';

interface Props {
  draft: ProgramBuilderDraft;
  onChange: (patch: Partial<ProgramBuilderDraft>) => void;
}

const programTypes: { value: ProgramType; label: string }[] = [
  { value: 'emagrecimento',    label: 'Emagrecimento' },
  { value: 'hipertrofia',      label: 'Hipertrofia' },
  { value: 'recomposicao',     label: 'Recomposição Corporal' },
  { value: 'saude_metabolica', label: 'Saúde Metabólica' },
  { value: 'longevidade',      label: 'Longevidade Preventiva' },
];

const colorOptions = [
  { value: 'teal',    label: 'Teal',    cls: 'bg-teal-500' },
  { value: 'violet',  label: 'Violeta', cls: 'bg-violet-500' },
  { value: 'amber',   label: 'Âmbar',   cls: 'bg-amber-500' },
  { value: 'blue',    label: 'Azul',    cls: 'bg-blue-500' },
  { value: 'emerald', label: 'Esmeralda', cls: 'bg-emerald-500' },
];

export default function StepDadosGerais({ draft, onChange }: Props) {
  return (
    <div className="space-y-6">
      {/* Name */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Identificação</h3>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nome do programa *</label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Ex: Emagrecimento 12 Semanas"
            className="input-base w-full"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Objetivo clínico *</label>
          <textarea
            value={draft.objective}
            onChange={(e) => onChange({ objective: e.target.value })}
            placeholder="Descreva o objetivo principal do programa..."
            rows={3}
            className="input-base w-full resize-none"
          />
        </div>
      </div>

      {/* Type + Duration */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Configurações</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo de programa *</label>
            <select
              value={draft.programType}
              onChange={(e) => onChange({ programType: e.target.value as ProgramType })}
              className="input-base w-full"
            >
              <option value="">Selecione...</option>
              {programTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Duração (semanas) *</label>
            <input
              type="number"
              min={1}
              max={104}
              value={draft.durationWeeks}
              onChange={(e) => onChange({ durationWeeks: Number(e.target.value) })}
              className="input-base w-full"
            />
          </div>
        </div>

        {/* Status */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status inicial</label>
          <div className="flex gap-2">
            {(['rascunho', 'ativo'] as const).map((s) => (
              <button
                key={s}
                onClick={() => onChange({ status: s })}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                  draft.status === s
                    ? s === 'ativo' ?'bg-emerald-50 text-emerald-700 border-emerald-300' :'bg-amber-50 text-amber-700 border-amber-300' :'bg-muted text-muted-foreground border-border hover:bg-muted/80',
                ].join(' ')}
              >
                {s === 'rascunho' ? 'Rascunho' : 'Ativo'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Color */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Cor de identificação</h3>
        <div className="flex gap-3">
          {colorOptions.map((c) => (
            <button
              key={c.value}
              onClick={() => onChange({ color: c.value })}
              title={c.label}
              className={[
                'w-8 h-8 rounded-full transition-all',
                c.cls,
                draft.color === c.value ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'opacity-70 hover:opacity-100',
              ].join(' ')}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
