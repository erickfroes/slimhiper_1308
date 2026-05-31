'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpen,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  CreditCard,
  Edit2,
  Eye,
  FileText,
  Layers,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Smartphone,
  Target,
  Users,
  Wrench,
} from 'lucide-react';

import type { ClinicProgram, ProgramStatus } from '@/domain/types';
import {
  cloneProgram,
  getClinicPrograms,
  setProgramStatus,
  type ClinicProgramsSummary,
} from '@/services/programsApi';

const colorMap: Record<string, { accent: string; badge: string; dot: string; icon: string }> = {
  teal: {
    accent: 'border-l-teal-500',
    badge: 'bg-teal-50 text-teal-700',
    dot: 'bg-teal-500',
    icon: 'text-teal-600',
  },
  violet: {
    accent: 'border-l-violet-500',
    badge: 'bg-violet-50 text-violet-700',
    dot: 'bg-violet-500',
    icon: 'text-violet-600',
  },
  amber: {
    accent: 'border-l-amber-500',
    badge: 'bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
    icon: 'text-amber-600',
  },
  blue: {
    accent: 'border-l-blue-500',
    badge: 'bg-blue-50 text-blue-700',
    dot: 'bg-blue-500',
    icon: 'text-blue-600',
  },
  emerald: {
    accent: 'border-l-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
    icon: 'text-emerald-600',
  },
};

const paymentModelLabel: Record<string, string> = {
  parcelado: 'Parcelado',
  avista: 'A vista',
  assinatura: 'Assinatura',
  hibrido: 'Hibrido',
};

const statusConfig: Record<ProgramStatus, { label: string; className: string }> = {
  ativo: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  arquivado: { label: 'Arquivado', className: 'bg-gray-100 text-gray-500 border border-gray-200' },
  rascunho: { label: 'Rascunho', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
};

const emptySummary: ClinicProgramsSummary = {
  total: 0,
  active: 0,
  draft: 0,
  archived: 0,
  activePatients: 0,
};

interface ProgramCardProps {
  program: ClinicProgram;
  busy: boolean;
  onArchive: (program: ClinicProgram) => void;
  onPublish: (program: ClinicProgram) => void;
  onClone: (program: ClinicProgram) => void;
}

function ProgramCard({ program, busy, onArchive, onPublish, onClone }: ProgramCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const colors = colorMap[program.color] ?? colorMap['teal'];
  const status = statusConfig[program.status];

  const closeAndRun = (callback: () => void) => {
    setMenuOpen(false);
    callback();
  };

  return (
    <div
      className={`bg-card border border-border rounded-xl border-l-4 ${colors.accent} shadow-sm overflow-hidden`}
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.badge}`}
            >
              <BookOpen size={16} className={colors.icon} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground leading-tight">
                  {program.name}
                </h3>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}
                >
                  {status.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                {program.objective || 'Sem objetivo registrado.'}
              </p>
            </div>
          </div>

          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              disabled={busy}
              aria-label="Abrir acoes do programa"
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              {busy ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <MoreHorizontal size={16} />
              )}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[170px]">
                <Link
                  href={`/clinic/programs/builder?programId=${program.id}`}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <Edit2 size={13} className="text-muted-foreground" /> Editar
                </Link>
                <button
                  type="button"
                  onClick={() => closeAndRun(() => onClone(program))}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <Copy size={13} className="text-muted-foreground" /> Duplicar
                </button>
                {program.status !== 'ativo' && (
                  <button
                    type="button"
                    onClick={() => closeAndRun(() => onPublish(program))}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                  >
                    <Send size={13} className="text-muted-foreground" /> Publicar
                  </button>
                )}
                <Link
                  href={`/clinic/patients?programId=${program.id}`}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <Eye size={13} className="text-muted-foreground" /> Ver pacientes
                </Link>
                <div className="border-t border-border my-1" />
                <button
                  type="button"
                  onClick={() => closeAndRun(() => onArchive(program))}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-negative hover:bg-negative/5 transition-colors"
                >
                  <Archive size={13} /> Arquivar
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="flex items-center gap-1.5">
            <Clock size={13} className="text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground">{program.durationWeeks} semanas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Layers size={13} className="text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground">{program.phases.length} fases</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={13} className="text-muted-foreground flex-shrink-0" />
            <Link
              href={`/clinic/patients?programId=${program.id}`}
              className="text-xs font-medium text-foreground hover:underline"
            >
              {program.activePatients} pacientes
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {program.phases.slice(0, 4).map((phase) => (
            <span
              key={`${program.id}-${phase.name}`}
              className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
              {phase.name} - {phase.durationWeeks}sem
            </span>
          ))}
          {program.phases.length === 0 && (
            <span className="text-xs text-muted-foreground">Sem fases cadastradas</span>
          )}
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="px-5 py-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <CheckSquare size={12} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Servicos
            </span>
          </div>
          <div className="space-y-0.5">
            {program.includedServices.slice(0, 3).map((svc) => (
              <div key={`${program.id}-${svc.label}`} className="text-xs text-foreground">
                {svc.quantity}x {svc.label}
              </div>
            ))}
            {program.includedServices.length === 0 && (
              <div className="text-xs text-muted-foreground">Sem servicos</div>
            )}
            {program.includedServices.length > 3 && (
              <div className="text-xs text-muted-foreground">
                +{program.includedServices.length - 3} mais
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Target size={12} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Check-ins
              </span>
            </div>
            <div className="text-xs text-foreground">
              {program.checkInsTotal} - {program.checkInFrequency}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <CreditCard size={12} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Pagamento
              </span>
            </div>
            <div className="text-xs text-foreground">{paymentModelLabel[program.paymentModel]}</div>
          </div>
        </div>
      </div>

      {expanded && (
        <>
          <div className="border-t border-border" />
          <div className="px-5 py-4 space-y-4">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Smartphone size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  App do paciente
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {program.appEntitlements.map((ent) => (
                  <span
                    key={ent.key}
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      ent.enabled
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-muted text-muted-foreground border-border line-through'
                    }`}
                  >
                    {ent.label}
                  </span>
                ))}
                {program.appEntitlements.length === 0 && (
                  <span className="text-xs text-muted-foreground">Sem entitlements</span>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FileText size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Documentos obrigatorios
                </span>
              </div>
              <div className="space-y-1">
                {program.requiredDocuments.map((doc) => (
                  <div key={doc.label} className="flex items-center gap-2 text-xs text-foreground">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${doc.required ? 'bg-negative' : 'bg-muted-foreground'}`}
                    />
                    {doc.label}
                    {!doc.required && <span className="text-muted-foreground">(opcional)</span>}
                  </div>
                ))}
                {program.requiredDocuments.length === 0 && (
                  <div className="text-xs text-muted-foreground">Sem documentos vinculados</div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <CreditCard size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Modelo financeiro
                </span>
              </div>
              <p className="text-xs text-foreground">
                {program.paymentDescription || 'Sem descricao financeira.'}
              </p>
            </div>
          </div>
        </>
      )}

      <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? 'Recolher detalhes' : 'Ver detalhes'}
        </button>

        <div className="flex items-center gap-1">
          <Link
            href={`/clinic/patients?programId=${program.id}`}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Eye size={12} /> Pacientes
          </Link>
          <Link
            href={`/clinic/programs/builder?programId=${program.id}`}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
          >
            <Wrench size={12} /> Builder
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ProgramsContent() {
  const [filter, setFilter] = useState<ProgramStatus | 'todos'>('todos');
  const [programs, setPrograms] = useState<ClinicProgram[]>([]);
  const [summary, setSummary] = useState<ClinicProgramsSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyProgramId, setBusyProgramId] = useState<string | null>(null);

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await getClinicPrograms();
    if (response.error) {
      setPrograms([]);
      setSummary(emptySummary);
      setError(response.error.message);
    } else {
      setPrograms(response.data?.programs ?? []);
      setSummary(response.data?.summary ?? emptySummary);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  const filtered = useMemo(
    () => (filter === 'todos' ? programs : programs.filter((program) => program.status === filter)),
    [filter, programs]
  );

  const runProgramAction = async (
    program: ClinicProgram,
    action: 'archive' | 'publish' | 'clone'
  ) => {
    setBusyProgramId(program.id);
    setError(null);
    const result =
      action === 'clone'
        ? await cloneProgram(program.id)
        : await setProgramStatus(program.id, action === 'archive' ? 'arquivado' : 'ativo');
    if (result.error) {
      setError(result.error.message);
    } else {
      await loadPrograms();
    }
    setBusyProgramId(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Programas e Pacotes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Templates clinicos persistidos, enrollment e check-ins por paciente.
          </p>
        </div>
        <Link
          href="/clinic/programs/builder"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          <Plus size={15} />
          Criar programa
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen size={15} className="text-primary" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{summary.active}</div>
            <div className="text-xs text-muted-foreground">Programas ativos</div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
            <Users size={15} className="text-teal-600" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{summary.activePatients}</div>
            <div className="text-xs text-muted-foreground">Pacientes em programas</div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
            <Layers size={15} className="text-violet-600" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{summary.total}</div>
            <div className="text-xs text-muted-foreground">Templates cadastrados</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadPrograms()}
            className="text-xs font-semibold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {(['todos', 'ativo', 'rascunho', 'arquivado'] as const).map((statusFilter) => (
          <button
            key={statusFilter}
            type="button"
            onClick={() => setFilter(statusFilter)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === statusFilter
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {statusFilter === 'todos'
              ? 'Todos'
              : statusFilter === 'ativo'
                ? 'Ativos'
                : statusFilter === 'rascunho'
                  ? 'Rascunhos'
                  : 'Arquivados'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-64 rounded-lg border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-3">
            <BookOpen size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum programa encontrado</p>
          <p className="text-xs text-muted-foreground mt-1">
            Crie um programa ou ajuste o filtro selecionado.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              busy={busyProgramId === program.id}
              onArchive={(item) => void runProgramAction(item, 'archive')}
              onPublish={(item) => void runProgramAction(item, 'publish')}
              onClone={(item) => void runProgramAction(item, 'clone')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
