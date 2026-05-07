'use client';

import React from 'react';
import { Smartphone, MessageSquare, BarChart2, BookOpen, Users, Bell, Video, Utensils } from 'lucide-react';
import type { ProgramBuilderDraft } from '@/domain/types';

interface Props {
  draft: ProgramBuilderDraft;
  onChange: (patch: Partial<ProgramBuilderDraft>) => void;
}

const entitlementIcons: Record<string, React.ElementType> = {
  chat:            MessageSquare,
  plano_alimentar: Utensils,
  checkin:         BarChart2,
  comunidade:      Users,
  receitas:        BookOpen,
  progresso:       BarChart2,
  notificacoes:    Bell,
  telemedicina:    Video,
};

export default function StepEntitlements({ draft, onChange }: Props) {
  const entitlements = draft.appEntitlements;

  const toggle = (key: string) => {
    onChange({
      appEntitlements: entitlements.map((e) =>
        e.key === key ? { ...e, enabled: !e.enabled } : e
      ),
    });
  };

  const enabledCount = entitlements.filter((e) => e.enabled).length;

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="card p-4 flex items-center gap-4 bg-primary/5 border-primary/20">
        <Smartphone size={20} className="text-primary flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            {enabledCount} de {entitlements.length} funcionalidades ativas
          </p>
          <p className="text-xs text-muted-foreground">
            Estas funcionalidades serão liberadas no app do paciente ao ingressar neste programa.
          </p>
        </div>
      </div>

      {/* Entitlement toggles */}
      <div className="card divide-y divide-border">
        {entitlements.map((ent) => {
          const IconComp = entitlementIcons[ent.key] ?? Smartphone;
          return (
            <div key={ent.key} className="flex items-center gap-4 px-5 py-3.5">
              <div className={[
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                ent.enabled ? 'bg-primary/10' : 'bg-muted',
              ].join(' ')}>
                <IconComp size={16} className={ent.enabled ? 'text-primary' : 'text-muted-foreground'} />
              </div>
              <span className={['text-sm font-medium flex-1', ent.enabled ? 'text-foreground' : 'text-muted-foreground'].join(' ')}>
                {ent.label}
              </span>
              {/* Toggle */}
              <button
                onClick={() => toggle(ent.key)}
                className={[
                  'relative w-10 h-5 rounded-full transition-all duration-200 flex-shrink-0',
                  ent.enabled ? 'bg-primary' : 'bg-muted-foreground/30',
                ].join(' ')}
                role="switch"
                aria-checked={ent.enabled}
              >
                <span
                  className={[
                    'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200',
                    ent.enabled ? 'left-5' : 'left-0.5',
                  ].join(' ')}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
