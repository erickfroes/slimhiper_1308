'use client';

import React from 'react';
import {
  CheckCircle,
  AlertCircle,
  BookOpen,
  Layers,
  Wrench,
  Smartphone,
  CheckSquare,
  FileText,
  CreditCard,
  Users,
} from 'lucide-react';
import type { ProgramBuilderDraft } from '@/domain/types';

interface Props {
  draft: ProgramBuilderDraft;
}

const programTypeLabel: Record<string, string> = {
  emagrecimento: 'Emagrecimento',
  hipertrofia: 'Hipertrofia',
  recomposicao: 'Recomposição Corporal',
  saude_metabolica: 'Saúde Metabólica',
  longevidade: 'Longevidade Preventiva',
  '': '—',
};

const paymentModelLabel: Record<string, string> = {
  parcelado: 'Parcelado',
  avista: 'À Vista',
  assinatura: 'Assinatura',
  hibrido: 'Híbrido',
};

interface ReviewSectionProps {
  icon: React.ElementType;
  title: string;
  isComplete: boolean;
  children: React.ReactNode;
}

function ReviewSection({ icon: Icon, title, isComplete, children }: ReviewSectionProps) {
  return (
    <div className="card-base p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div
          className={[
            'w-8 h-8 rounded-lg flex items-center justify-center',
            isComplete ? 'bg-emerald-50' : 'bg-amber-50',
          ].join(' ')}
        >
          <Icon size={16} className={isComplete ? 'text-emerald-600' : 'text-amber-600'} />
        </div>
        <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
        {isComplete ? (
          <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
        ) : (
          <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
        )}
      </div>
      <div className="text-sm text-muted-foreground space-y-1 pl-11">{children}</div>
    </div>
  );
}

export default function StepRevisao({ draft }: Props) {
  const checks = {
    dadosGerais: !!draft.name && !!draft.programType && draft.durationWeeks > 0,
    fases: draft.phases.length > 0,
    servicos: draft.includedServices.length > 0,
    entitlements: draft.appEntitlements.some((e) => e.enabled),
    checkins: draft.checkInsTotal > 0,
    documentos: draft.requiredDocuments.length > 0,
    financeiro: draft.financial.basePrice > 0,
    equipe: draft.team.length > 0,
  };

  const completedCount = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.keys(checks).length;
  const allComplete = completedCount === totalChecks;

  return (
    <div className="space-y-5">
      {/* Overall status */}
      <div
        className={[
          'card-base p-5 flex items-center gap-4',
          allComplete ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200',
        ].join(' ')}
      >
        {allComplete ? (
          <CheckCircle size={24} className="text-emerald-500 flex-shrink-0" />
        ) : (
          <AlertCircle size={24} className="text-amber-500 flex-shrink-0" />
        )}
        <div>
          <p
            className={[
              'text-sm font-bold',
              allComplete ? 'text-emerald-700' : 'text-amber-700',
            ].join(' ')}
          >
            {allComplete
              ? 'Programa pronto para publicar!'
              : `${completedCount} de ${totalChecks} etapas completas`}
          </p>
          <p className={['text-xs', allComplete ? 'text-emerald-600' : 'text-amber-600'].join(' ')}>
            {allComplete
              ? 'Todas as etapas foram preenchidas. Revise os detalhes e publique.'
              : 'Complete as etapas pendentes antes de publicar o programa.'}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p
            className={[
              'text-2xl font-bold',
              allComplete ? 'text-emerald-600' : 'text-amber-600',
            ].join(' ')}
          >
            {Math.round((completedCount / totalChecks) * 100)}%
          </p>
          <p className="text-xs text-muted-foreground">completo</p>
        </div>
      </div>

      {/* Section reviews */}
      <ReviewSection icon={BookOpen} title="Dados gerais" isComplete={checks.dadosGerais}>
        {draft.name ? (
          <p>
            <strong>Nome:</strong> {draft.name}
          </p>
        ) : (
          <p className="text-amber-600">Nome não preenchido</p>
        )}
        {draft.programType ? (
          <p>
            <strong>Tipo:</strong> {programTypeLabel[draft.programType]}
          </p>
        ) : (
          <p className="text-amber-600">Tipo não selecionado</p>
        )}
        <p>
          <strong>Duração:</strong> {draft.durationWeeks} semanas · Status: {draft.status}
        </p>
      </ReviewSection>

      <ReviewSection icon={Layers} title="Fases" isComplete={checks.fases}>
        {draft.phases.length > 0 ? (
          draft.phases.map((p, i) => (
            <p key={i}>
              <strong>Fase {i + 1}:</strong> {p.name} — {p.durationWeeks} semanas
            </p>
          ))
        ) : (
          <p className="text-amber-600">Nenhuma fase configurada</p>
        )}
      </ReviewSection>

      <ReviewSection icon={Wrench} title="Serviços incluídos" isComplete={checks.servicos}>
        {draft.includedServices.length > 0 ? (
          draft.includedServices.map((s, i) => (
            <p key={i}>
              {s.quantity}x {s.label}
            </p>
          ))
        ) : (
          <p className="text-amber-600">Nenhum serviço adicionado</p>
        )}
      </ReviewSection>

      <ReviewSection icon={Smartphone} title="Entitlements do app" isComplete={checks.entitlements}>
        {draft.appEntitlements
          .filter((e) => e.enabled)
          .map((e) => (
            <p key={e.key}>✓ {e.label}</p>
          ))}
        {!checks.entitlements && <p className="text-amber-600">Nenhum entitlement ativo</p>}
      </ReviewSection>

      <ReviewSection icon={CheckSquare} title="Check-ins" isComplete={checks.checkins}>
        <p>
          <strong>Total:</strong> {draft.checkInsTotal} check-ins · {draft.checkInFrequency}
        </p>
        {draft.checkinTemplates.length > 0 && (
          <p>
            <strong>Templates:</strong> {draft.checkinTemplates.map((t) => t.label).join(', ')}
          </p>
        )}
      </ReviewSection>

      <ReviewSection icon={FileText} title="Documentos" isComplete={checks.documentos}>
        {draft.requiredDocuments.length > 0 ? (
          draft.requiredDocuments.map((d, i) => (
            <p key={i}>
              {d.required ? '🔴' : '⚪'} {d.label}
            </p>
          ))
        ) : (
          <p className="text-amber-600">Nenhum documento configurado</p>
        )}
      </ReviewSection>

      <ReviewSection icon={CreditCard} title="Financeiro" isComplete={checks.financeiro}>
        <p>
          <strong>Modelo:</strong> {paymentModelLabel[draft.financial.paymentModel]}
        </p>
        <p>
          <strong>Valor base:</strong> R${' '}
          {draft.financial.basePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
        {draft.financial.discountPercent ? (
          <p>
            <strong>Desconto à vista:</strong> {draft.financial.discountPercent}%
          </p>
        ) : null}
        {draft.financial.description && <p className="italic">{draft.financial.description}</p>}
      </ReviewSection>

      <ReviewSection icon={Users} title="Equipe" isComplete={checks.equipe}>
        {draft.team.length > 0 ? (
          draft.team.map((m) => (
            <p key={m.id}>
              {m.name} — {m.role}
            </p>
          ))
        ) : (
          <p className="text-amber-600">Nenhum profissional selecionado</p>
        )}
      </ReviewSection>
    </div>
  );
}
