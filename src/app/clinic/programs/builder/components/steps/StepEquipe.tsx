'use client';

import React from 'react';
import { UserPlus, X, User } from 'lucide-react';
import type { ProgramBuilderDraft, ProgramBuilderTeamMember } from '@/domain/types';
import { mockBuilderTeamMembers } from '@/data/mockBuilderData';

interface Props {
  draft: ProgramBuilderDraft;
  onChange: (patch: Partial<ProgramBuilderDraft>) => void;
}

const roleColors: Record<string, string> = {
  Médica: 'bg-blue-50 text-blue-700',
  Médico: 'bg-blue-50 text-blue-700',
  Nutricionista: 'bg-emerald-50 text-emerald-700',
  Coordenadora: 'bg-violet-50 text-violet-700',
  Psicóloga: 'bg-amber-50 text-amber-700',
};

export default function StepEquipe({ draft, onChange }: Props) {
  const selectedIds = draft.team.map((m) => m.id);

  const toggleMember = (member: ProgramBuilderTeamMember) => {
    const isSelected = selectedIds.includes(member.id);
    onChange({
      team: isSelected ? draft.team.filter((m) => m.id !== member.id) : [...draft.team, member],
    });
  };

  return (
    <div className="space-y-5">
      {/* Selected team */}
      {draft.team.length > 0 && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Equipe selecionada ({draft.team.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {draft.team.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20"
              >
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <User size={11} className="text-primary" />
                </div>
                <span className="text-xs font-semibold text-primary">{m.name}</span>
                <button
                  onClick={() => toggleMember(m)}
                  className="text-primary/60 hover:text-primary transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available members */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Profissionais disponíveis</h3>
        {mockBuilderTeamMembers.map((member) => {
          const selected = selectedIds.includes(member.id);
          const roleColor = roleColors[member.role] ?? 'bg-muted text-muted-foreground';
          return (
            <div
              key={member.id}
              onClick={() => toggleMember(member)}
              className={[
                'card p-4 flex items-center gap-4 cursor-pointer transition-all',
                selected ? 'border-primary/40 bg-primary/5' : 'hover:border-border/80',
              ].join(' ')}
            >
              <div
                className={[
                  'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                  selected ? 'bg-primary/20' : 'bg-muted',
                ].join(' ')}
              >
                <User size={16} className={selected ? 'text-primary' : 'text-muted-foreground'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{member.name}</p>
                <p className="text-xs text-muted-foreground">{member.specialty}</p>
              </div>
              <span
                className={['text-xs font-semibold px-2.5 py-1 rounded-full', roleColor].join(' ')}
              >
                {member.role}
              </span>
              <div
                className={[
                  'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                  selected ? 'bg-primary border-primary' : 'border-border',
                ].join(' ')}
              >
                {selected && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {draft.team.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <UserPlus size={28} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Selecione os profissionais responsáveis pelo programa
          </p>
        </div>
      )}
    </div>
  );
}
