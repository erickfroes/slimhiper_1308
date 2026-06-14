'use client';

import React from 'react';
import { Check, User, UserPlus, X } from 'lucide-react';
import type {
  ProfessionalType,
  ProgramBuilderDraft,
  ProgramBuilderTeamMember,
} from '@/domain/types';

interface Props {
  draft: ProgramBuilderDraft;
  teamMembers: ProgramBuilderTeamMember[];
  onChange: (patch: Partial<ProgramBuilderDraft>) => void;
}

const roleColors: Record<string, string> = {
  Medica: 'bg-blue-50 text-blue-700',
  Medico: 'bg-blue-50 text-blue-700',
  Nutricionista: 'bg-emerald-50 text-emerald-700',
  Coordenacao: 'bg-violet-50 text-violet-700',
  Coordenadora: 'bg-violet-50 text-violet-700',
  Psicologa: 'bg-amber-50 text-amber-700',
  'Profissional fitness': 'bg-amber-50 text-amber-700',
  'Profissional externo': 'bg-slate-100 text-slate-700',
};

const PROFESSIONAL_TYPE_LABELS: Record<ProfessionalType, string> = {
  physician: 'Medico',
  nutritionist: 'Nutricionista',
  fitness_professional: 'Profissional fitness',
  external_professional: 'Profissional externo',
};

function professionalTypeLabel(member: ProgramBuilderTeamMember) {
  return member.professionalType ? PROFESSIONAL_TYPE_LABELS[member.professionalType] : member.role;
}

function statusLabel(member: ProgramBuilderTeamMember) {
  if (member.source === 'legacy_role') return 'Fallback legado';
  if (member.isActive === false || member.status === 'inactive') return 'Inativo';
  return 'Ativo';
}

function statusClass(member: ProgramBuilderTeamMember) {
  if (member.source === 'legacy_role') return 'bg-amber-50 text-amber-700';
  if (member.isActive === false || member.status === 'inactive') {
    return 'bg-muted text-muted-foreground';
  }
  return 'bg-emerald-50 text-emerald-700';
}

function secondaryLine(member: ProgramBuilderTeamMember) {
  return [member.specialty, member.unitName ?? 'Sem unidade'].filter(Boolean).join(' / ');
}

function licenseLine(member: ProgramBuilderTeamMember) {
  return [member.licenseNumber, member.licenseState ? `UF ${member.licenseState}` : null]
    .filter(Boolean)
    .join(' - ');
}

export default function StepEquipe({ draft, teamMembers, onChange }: Props) {
  const selectedIds = draft.team.map((member) => member.id);

  const toggleMember = (member: ProgramBuilderTeamMember) => {
    const isSelected = selectedIds.includes(member.id);
    onChange({
      team: isSelected
        ? draft.team.filter((selectedMember) => selectedMember.id !== member.id)
        : [...draft.team, member],
    });
  };

  return (
    <div className="space-y-5">
      {draft.team.length > 0 && (
        <div className="card-base p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Equipe selecionada ({draft.team.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {draft.team.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5"
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20">
                  <User size={11} className="text-primary" />
                </div>
                <span className="text-xs font-semibold text-primary">{member.name}</span>
                <button
                  type="button"
                  aria-label={`Remover ${member.name}`}
                  onClick={() => toggleMember(member)}
                  className="text-primary/60 transition-colors hover:text-primary"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Profissionais disponiveis</h3>
        {teamMembers.map((member) => {
          const selected = selectedIds.includes(member.id);
          const typeLabel = professionalTypeLabel(member);
          const roleColor = roleColors[typeLabel] ?? 'bg-muted text-muted-foreground';
          const license = licenseLine(member);

          return (
            <button
              key={member.id}
              type="button"
              onClick={() => toggleMember(member)}
              className={[
                'card-base flex w-full items-center gap-4 p-4 text-left transition-all',
                selected ? 'border-primary/40 bg-primary/5' : 'hover:border-border/80',
              ].join(' ')}
            >
              <div
                className={[
                  'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full',
                  selected ? 'bg-primary/20' : 'bg-muted',
                ].join(' ')}
              >
                <User size={16} className={selected ? 'text-primary' : 'text-muted-foreground'} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{member.name}</p>
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      statusClass(member),
                    ].join(' ')}
                  >
                    {statusLabel(member)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{secondaryLine(member)}</p>
                {license ? <p className="text-xs text-muted-foreground">{license}</p> : null}
              </div>

              <span
                className={['rounded-full px-2.5 py-1 text-xs font-semibold', roleColor].join(' ')}
              >
                {typeLabel}
              </span>

              <span
                className={[
                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-all',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                ].join(' ')}
              >
                {selected ? <Check size={12} strokeWidth={3} /> : null}
              </span>
            </button>
          );
        })}

        {teamMembers.length === 0 && (
          <div className="card-base p-4 text-xs text-muted-foreground">
            Nenhum profissional ativo com permissao foi retornado para este tenant.
          </div>
        )}
      </div>

      {draft.team.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <UserPlus size={28} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Selecione os profissionais responsaveis pelo programa
          </p>
        </div>
      )}
    </div>
  );
}
