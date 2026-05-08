'use client';

import React from 'react';
import { Plus, Trash2, FileText } from 'lucide-react';
import type { ProgramBuilderDraft, ProgramRequiredDocument } from '@/domain/types';

interface Props {
  draft: ProgramBuilderDraft;
  onChange: (patch: Partial<ProgramBuilderDraft>) => void;
}

const documentPresets = [
  'Contrato de prestação de serviços',
  'Termo de consentimento informado',
  'Anamnese clínica',
  'Exames pré-tratamento',
  'Declaração de saúde',
  'Questionário de estilo de vida',
  'Termo de responsabilidade',
  'Autorização de uso de imagem',
];

export default function StepDocumentos({ draft, onChange }: Props) {
  const docs = draft.requiredDocuments;

  const addDoc = (label?: string) => {
    const newDoc: ProgramRequiredDocument = { label: label ?? '', required: true };
    onChange({ requiredDocuments: [...docs, newDoc] });
  };

  const updateDoc = (idx: number, patch: Partial<ProgramRequiredDocument>) => {
    onChange({ requiredDocuments: docs.map((d, i) => (i === idx ? { ...d, ...patch } : d)) });
  };

  const removeDoc = (idx: number) => {
    onChange({ requiredDocuments: docs.filter((_, i) => i !== idx) });
  };

  const addPreset = (label: string) => {
    if (!docs.some((d) => d.label === label)) addDoc(label);
  };

  const requiredCount = docs.filter((d) => d.required).length;
  const optionalCount = docs.length - requiredCount;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="card p-4 flex items-center gap-6 bg-primary/5 border-primary/20">
        <FileText size={20} className="text-primary flex-shrink-0" />
        <div className="flex gap-6">
          <div>
            <p className="text-xl font-bold text-foreground">{requiredCount}</p>
            <p className="text-xs text-muted-foreground">Obrigatórios</p>
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{optionalCount}</p>
            <p className="text-xs text-muted-foreground">Opcionais</p>
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Adicionar documento rápido</h3>
        <div className="flex flex-wrap gap-2">
          {documentPresets.map((p) => {
            const added = docs.some((d) => d.label === p);
            return (
              <button
                key={p}
                onClick={() => addPreset(p)}
                disabled={added}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  added
                    ? 'bg-primary/10 text-primary border-primary/30 cursor-default'
                    : 'bg-muted text-muted-foreground border-border hover:bg-primary/5 hover:text-primary hover:border-primary/30',
                ].join(' ')}
              >
                {added ? '✓ ' : '+ '}
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Document list */}
      <div className="space-y-2">
        {docs.map((doc, idx) => (
          <div key={idx} className="card p-3 flex items-center gap-3">
            <FileText size={15} className="text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              value={doc.label}
              onChange={(e) => updateDoc(idx, { label: e.target.value })}
              className="input-base flex-1 text-sm"
              placeholder="Nome do documento"
            />
            <button
              onClick={() => updateDoc(idx, { required: !doc.required })}
              className={[
                'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all flex-shrink-0',
                doc.required
                  ? 'bg-negative/10 text-negative border-negative/30'
                  : 'bg-muted text-muted-foreground border-border hover:bg-muted/80',
              ].join(' ')}
            >
              {doc.required ? 'Obrigatório' : 'Opcional'}
            </button>
            <button
              onClick={() => removeDoc(idx)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-negative hover:bg-negative/10 transition-all flex-shrink-0"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => addDoc()}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
      >
        <Plus size={16} />
        Adicionar documento personalizado
      </button>
    </div>
  );
}
