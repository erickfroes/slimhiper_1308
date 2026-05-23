'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Save, Send, ChevronRight } from 'lucide-react';
import { BUILDER_STEPS, initialBuilderDraft } from '@/data/mockBuilderData';
import type { ProgramBuilderDraft, BuilderStepKey } from '@/domain/types';
import StepDadosGerais from './steps/StepDadosGerais';
import StepFases from './steps/StepFases';
import StepServicos from './steps/StepServicos';
import StepEntitlements from './steps/StepEntitlements';
import StepCheckins from './steps/StepCheckins';
import StepDocumentos from './steps/StepDocumentos';
import StepFinanceiro from './steps/StepFinanceiro';
import StepEquipe from './steps/StepEquipe';
import StepRevisao from './steps/StepRevisao';

// ─── STEP RENDERER ────────────────────────────────────────────────────────────

function renderStep(
  stepKey: BuilderStepKey,
  draft: ProgramBuilderDraft,
  onChange: (patch: Partial<ProgramBuilderDraft>) => void
) {
  switch (stepKey) {
    case 'dados_gerais':
      return <StepDadosGerais draft={draft} onChange={onChange} />;
    case 'fases':
      return <StepFases draft={draft} onChange={onChange} />;
    case 'servicos':
      return <StepServicos draft={draft} onChange={onChange} />;
    case 'entitlements':
      return <StepEntitlements draft={draft} onChange={onChange} />;
    case 'checkins':
      return <StepCheckins draft={draft} onChange={onChange} />;
    case 'documentos':
      return <StepDocumentos draft={draft} onChange={onChange} />;
    case 'financeiro':
      return <StepFinanceiro draft={draft} onChange={onChange} />;
    case 'equipe':
      return <StepEquipe draft={draft} onChange={onChange} />;
    case 'revisao':
      return <StepRevisao draft={draft} />;
    default:
      return null;
  }
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function ProgramBuilderContent() {
  const [currentStep, setCurrentStep] = useState(0);
  const [draft, setDraft] = useState<ProgramBuilderDraft>(initialBuilderDraft);
  const [savedDraft, setSavedDraft] = useState(false);

  const totalSteps = BUILDER_STEPS.length;
  const step = BUILDER_STEPS[currentStep];

  const handleChange = (patch: Partial<ProgramBuilderDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setSavedDraft(false);
  };

  const handleSaveDraft = () => {
    setSavedDraft(true);
    setTimeout(() => setSavedDraft(false), 2500);
  };

  const handlePrev = () => setCurrentStep((s) => Math.max(0, s - 1));
  const handleNext = () => setCurrentStep((s) => Math.min(totalSteps - 1, s + 1));

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      {/* ── Page header ── */}
      <div className="flex items-center gap-3 px-6 py-4 bg-card border-b border-border">
        <Link
          href="/clinic/programs"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} />
          Programas
        </Link>
        <ChevronRight size={14} className="text-muted-foreground/50" />
        <span className="text-sm font-semibold text-foreground">Builder de Programa</span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleSaveDraft}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <Save size={14} />
            {savedDraft ? 'Rascunho salvo!' : 'Salvar rascunho'}
          </button>
          {currentStep === totalSteps - 1 && (
            <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">
              <Send size={14} />
              Publicar programa
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar stepper ── */}
        <aside className="w-64 flex-shrink-0 bg-card border-r border-border overflow-y-auto py-6 px-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-4">
            Etapas
          </p>
          <ol className="space-y-0.5">
            {BUILDER_STEPS.map((s, idx) => {
              const isCompleted = idx < currentStep;
              const isActive = idx === currentStep;
              return (
                <li key={s.key}>
                  <button
                    onClick={() => setCurrentStep(idx)}
                    className={[
                      'w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : isCompleted
                          ? 'text-foreground hover:bg-muted'
                          : 'text-muted-foreground hover:bg-muted/60',
                    ].join(' ')}
                  >
                    {/* Step indicator */}
                    <span
                      className={[
                        'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : isCompleted
                            ? 'bg-emerald-500 text-white' :'bg-muted text-muted-foreground',
                      ].join(' ')}
                    >
                      {isCompleted ? <Check size={12} strokeWidth={3} /> : idx + 1}
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span
                        className={[
                          'text-sm leading-tight',
                          isActive ? 'font-semibold' : 'font-medium',
                        ].join(' ')}
                      >
                        {s.label}
                      </span>
                      <span className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">
                        {s.description}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Progress bar */}
          <div className="mt-6 px-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">Progresso</span>
              <span className="text-xs font-semibold text-foreground">
                {currentStep + 1}/{totalSteps}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        </aside>

        {/* ── Step content ── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {/* Step header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Etapa {currentStep + 1} de {totalSteps}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-foreground">{step.label}</h1>
              <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
            </div>

            {/* Step body */}
            <div className="space-y-6">{renderStep(step.key, draft, handleChange)}</div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
              <button
                onClick={handlePrev}
                disabled={currentStep === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowLeft size={15} />
                Anterior
              </button>

              {currentStep < totalSteps - 1 ? (
                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all"
                >
                  Próxima etapa
                  <ArrowRight size={15} />
                </button>
              ) : (
                <button className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">
                  <Send size={15} />
                  Publicar programa
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
