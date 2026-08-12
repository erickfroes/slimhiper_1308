'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';

import type { ClinicProgram, PatientListRow, ProgramStatus } from '@/domain/types';
import {
  cloneProgram,
  enrollPatientInProgram,
  formatProgramEnrollmentConflictMessage,
  getClinicPrograms,
  getPatientProgramEnrollmentConflict,
  setProgramStatus,
  type ClinicProgramsSummary,
  type ProgramEnrollmentConflict,
} from '@/services/programsApi';
import { getPatientListPage } from '@/services/patientsApi';
import Dialog from '@/components/ui/Dialog';
import DataState from '@/components/ui/DataState';
import Tabs from '@/components/ui/Tabs';
import CommercialCatalogContent, { type CommercialCatalogTab } from './CommercialCatalogContent';
import { SkeletonCard } from '@/components/LoadingSkeleton';

const statusConfig: Record<ProgramStatus, { label: string; className: string }> = {
  ativo: {
    label: 'Ativo',
    className: 'border border-positive-border bg-positive-bg text-positive-foreground',
  },
  arquivado: {
    label: 'Arquivado',
    className: 'border border-border bg-surface-subtle text-muted-foreground',
  },
  rascunho: {
    label: 'Rascunho',
    className: 'border border-warning-border bg-warning-bg text-warning-foreground',
  },
};

const emptySummary: ClinicProgramsSummary = {
  total: 0,
  active: 0,
  draft: 0,
  archived: 0,
  activePatients: 0,
};

const focusClasses = 'focus-visible:outline-none focus-visible:focus-ring';
const inputClass = 'input-base';
const actionButtonClass =
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-60';
const menuItemClass =
  'w-full flex items-center gap-2.5 text-xs text-foreground transition-all hover:bg-muted focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none focus-visible:focus-ring px-3 py-2';
const menuDangerClass =
  'w-full flex items-center gap-2.5 text-xs text-negative transition-all hover:bg-negative/10 focus-visible:bg-negative/10 focus-visible:focus-ring focus-visible:outline-none px-3 py-2';
const secondaryText = 'text-xs font-medium text-muted-foreground uppercase tracking-wide';

type ProgramsSurfaceTab = CommercialCatalogTab | 'programs';

const surfaceTabs: Array<{ id: ProgramsSurfaceTab; label: string }> = [
  { id: 'services', label: 'Serviços' },
  { id: 'packages', label: 'Pacotes' },
  { id: 'programs', label: 'Programas' },
  { id: 'upgrades', label: 'Upgrades' },
];

function isSurfaceTab(value: string | null): value is ProgramsSurfaceTab {
  return typeof value === 'string' && surfaceTabs.some((tab) => tab.id === value);
}

type EnrollmentResult = {
  programName: string;
  patientName: string;
  checkinsCreated: number;
  documentTasksCreated: number;
  appointmentId?: string;
  invoiceId?: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

interface ProgramCardProps {
  program: ClinicProgram;
  busy: boolean;
  onArchive: (program: ClinicProgram) => void;
  onPublish: (program: ClinicProgram) => void;
  onClone: (program: ClinicProgram) => void;
  onEnroll: (program: ClinicProgram) => void;
}

function ProgramCard({ program, busy, onArchive, onPublish, onClone, onEnroll }: ProgramCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const status = statusConfig[program.status];
  const closeAndRun = (callback: () => void) => {
    setMenuOpen(false);
    callback();
  };

  return (
    <div className="card-base overflow-hidden transition-shadow duration-200 hover:card-shadow-md focus-within:card-shadow-md">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen size={16} />
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
              aria-label="Abrir ações do programa"
              aria-expanded={menuOpen}
              aria-controls={`program-menu-${program.id}`}
              className={`p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 ${focusClasses}`}
            >
              {busy ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <MoreHorizontal size={16} />
              )}
            </button>
            {menuOpen && (
              <div
                id={`program-menu-${program.id}`}
                role="menu"
                className="absolute right-0 top-8 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[170px]"
              >
                <Link
                  href={`/clinic/programs/builder?programId=${program.id}`}
                  role="menuitem"
                  className={menuItemClass}
                >
                  <Edit2 size={13} className="text-muted-foreground" /> Editar
                </Link>
                <button
                  type="button"
                  onClick={() => closeAndRun(() => onClone(program))}
                  role="menuitem"
                  className={menuItemClass}
                >
                  <Copy size={13} className="text-muted-foreground" /> Duplicar
                </button>
                {program.status !== 'ativo' && (
                  <button
                    type="button"
                    onClick={() => closeAndRun(() => onPublish(program))}
                    role="menuitem"
                    className={menuItemClass}
                  >
                    <Send size={13} className="text-muted-foreground" /> Publicar
                  </button>
                )}
                <Link
                  href={`/clinic/patients?programId=${program.id}`}
                  role="menuitem"
                  className={menuItemClass}
                >
                  <Eye size={13} className="text-muted-foreground" /> Ver pacientes
                </Link>
                <div className="border-t border-border my-1" />
                <button
                  type="button"
                  onClick={() => closeAndRun(() => onArchive(program))}
                  role="menuitem"
                  className={menuDangerClass}
                >
                  <Archive size={13} /> Arquivar
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-border bg-surface-subtle p-3">
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

        <div className="mt-3">
          <p className={secondaryText}>Estrutura de tratamento</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {program.phases.slice(0, 4).map((phase) => (
              <span
                key={`${program.id}-${phase.name}`}
                className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-xs text-muted-foreground"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {phase.name} · {phase.durationWeeks} sem
              </span>
            ))}
            {program.phases.length === 0 && (
              <span className="text-xs text-muted-foreground">Sem fases cadastradas</span>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="grid grid-cols-1 gap-4 px-5 py-3 sm:grid-cols-2">
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <CheckSquare size={12} className="text-muted-foreground" />
            <span className={secondaryText}>Serviços</span>
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
              <span className={secondaryText}>Acompanhamento previsto</span>
            </div>
            <div className="text-xs text-foreground">
              {program.checkInsTotal} - {program.checkInFrequency}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <UserRound size={12} className="text-muted-foreground" />
              <span className={secondaryText}>Equipe responsável</span>
            </div>
            <div className="text-xs text-foreground">
              {program.team?.length
                ? program.team
                    .slice(0, 2)
                    .map((member) => member.name)
                    .join(', ')
                : 'Equipe não informada'}
            </div>
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
                <span className={secondaryText}>App do paciente</span>
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
                <span className={secondaryText}>Documentos obrigatórios</span>
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
                <span className={secondaryText}>Modelo financeiro</span>
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
          className={`${actionButtonClass} text-muted-foreground hover:text-foreground ${focusClasses}`}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? 'Recolher detalhes' : 'Ver detalhes'}
        </button>

        <div className="flex items-center gap-1">
          <Link
            href={`/clinic/patients?programId=${program.id}`}
            className={`${actionButtonClass} text-muted-foreground hover:bg-muted hover:text-foreground ${focusClasses}`}
          >
            <Eye size={12} /> Pacientes
          </Link>
          <button
            type="button"
            onClick={() => onEnroll(program)}
            disabled={busy || program.status !== 'ativo'}
            title={
              program.status === 'ativo'
                ? 'Matricular paciente'
                : 'Publique o programa antes da matrícula'
            }
            className={`${actionButtonClass} text-muted-foreground hover:bg-muted hover:text-foreground ${focusClasses}`}
          >
            <CheckSquare size={12} /> Matricular
          </button>
          <Link
            href={`/clinic/programs/builder?programId=${program.id}`}
            className={`${actionButtonClass} bg-primary/10 text-primary hover:bg-primary/20 font-medium ${focusClasses}`}
          >
            <Wrench size={12} /> Builder
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ProgramsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [surfaceTab, setSurfaceTab] = useState<ProgramsSurfaceTab>('programs');
  const [filter, setFilter] = useState<ProgramStatus | 'todos'>('todos');
  const [programs, setPrograms] = useState<ClinicProgram[]>([]);
  const [summary, setSummary] = useState<ClinicProgramsSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyProgramId, setBusyProgramId] = useState<string | null>(null);
  const [enrollmentProgram, setEnrollmentProgram] = useState<ClinicProgram | null>(null);
  const [enrollmentPatients, setEnrollmentPatients] = useState<PatientListRow[]>([]);
  const [enrollmentPatientId, setEnrollmentPatientId] = useState('');
  const [enrollmentSearch, setEnrollmentSearch] = useState('');
  const [enrollmentStartDate, setEnrollmentStartDate] = useState(todayIsoDate);
  const [enrollmentLoadingPatients, setEnrollmentLoadingPatients] = useState(false);
  const [enrollmentSubmitting, setEnrollmentSubmitting] = useState(false);
  const [enrollmentCheckingConflict, setEnrollmentCheckingConflict] = useState(false);
  const [enrollmentConflict, setEnrollmentConflict] = useState<ProgramEnrollmentConflict | null>(
    null
  );
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [enrollmentResult, setEnrollmentResult] = useState<EnrollmentResult | null>(null);

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

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (isSurfaceTab(tab)) setSurfaceTab(tab);
  }, [searchParams]);

  const handleSurfaceTabChange = (tab: ProgramsSurfaceTab) => {
    setSurfaceTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'programs') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const query = params.toString();
    router.replace(query ? `/clinic/programs?${query}` : '/clinic/programs');
  };

  const filtered = useMemo(
    () => (filter === 'todos' ? programs : programs.filter((program) => program.status === filter)),
    [filter, programs]
  );
  const selectedEnrollmentPatient = useMemo(
    () => enrollmentPatients.find((item) => item.id === enrollmentPatientId),
    [enrollmentPatientId, enrollmentPatients]
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

  const loadEnrollmentPatients = useCallback(async (search: string) => {
    setEnrollmentLoadingPatients(true);
    setEnrollmentError(null);
    setEnrollmentConflict(null);
    const response = await getPatientListPage({ page: 1, pageSize: 25, search, status: 'ativo' });
    if (response.error) {
      setEnrollmentPatients([]);
      setEnrollmentPatientId('');
      setEnrollmentError(response.error.message);
    } else {
      const rows = response.data?.rows ?? [];
      setEnrollmentPatients(rows);
      setEnrollmentPatientId((current) => (rows.some((row) => row.id === current) ? current : ''));
    }
    setEnrollmentLoadingPatients(false);
  }, []);

  useEffect(() => {
    if (!enrollmentProgram || !enrollmentPatientId || !enrollmentStartDate) {
      setEnrollmentCheckingConflict(false);
      setEnrollmentConflict(null);
      return;
    }

    let cancelled = false;
    setEnrollmentCheckingConflict(true);
    setEnrollmentConflict(null);

    const checkEnrollmentConflict = async () => {
      const response = await getPatientProgramEnrollmentConflict(
        enrollmentPatientId,
        enrollmentProgram.id,
        enrollmentStartDate
      );

      if (cancelled) return;

      if (response.error) {
        setEnrollmentError(response.error.message);
        setEnrollmentConflict(null);
      } else {
        setEnrollmentConflict(response.data);
        setEnrollmentError(null);
      }
      setEnrollmentCheckingConflict(false);
    };

    void checkEnrollmentConflict();

    return () => {
      cancelled = true;
    };
  }, [enrollmentPatientId, enrollmentProgram, enrollmentStartDate]);

  const openEnrollment = (program: ClinicProgram) => {
    setEnrollmentProgram(program);
    setEnrollmentSearch('');
    setEnrollmentPatientId('');
    setEnrollmentStartDate(todayIsoDate());
    setEnrollmentCheckingConflict(false);
    setEnrollmentConflict(null);
    setEnrollmentResult(null);
    setEnrollmentError(null);
    void loadEnrollmentPatients('');
  };

  const submitEnrollment = async () => {
    if (
      !enrollmentProgram ||
      !enrollmentPatientId ||
      enrollmentSubmitting ||
      enrollmentCheckingConflict
    ) {
      return;
    }
    if (enrollmentConflict) {
      setEnrollmentError(formatProgramEnrollmentConflictMessage(enrollmentConflict));
      return;
    }

    setEnrollmentSubmitting(true);
    setEnrollmentError(null);
    const response = await enrollPatientInProgram(
      enrollmentPatientId,
      enrollmentProgram.id,
      enrollmentStartDate
    );
    if (response.error) {
      setEnrollmentError(response.error.message);
    } else {
      setEnrollmentResult({
        programName: enrollmentProgram.name,
        patientName: selectedEnrollmentPatient?.name ?? 'Paciente selecionado',
        checkinsCreated: response.data?.checkinsCreated ?? 0,
        documentTasksCreated: response.data?.documentTasksCreated ?? 0,
        appointmentId: response.data?.appointmentId,
        invoiceId: response.data?.invoiceId,
      });
      setEnrollmentPatientId('');
      await loadPrograms();
    }
    setEnrollmentSubmitting(false);
  };

  return (
    <div className="app-page-padding space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Comercial</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Serviços, pacotes, programas, benefícios e upgrades auditados.
          </p>
        </div>
        <Link href="/clinic/programs/builder" className="btn-primary flex-shrink-0">
          <Plus size={15} />
          Criar programa
        </Link>
      </div>

      <Tabs
        items={surfaceTabs}
        value={surfaceTab}
        onValueChange={handleSurfaceTabChange}
        label="Abas comerciais"
      />

      {surfaceTab === 'programs' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="stat-card">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <BookOpen size={15} className="text-primary" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{summary.active}</div>
                <div className="text-xs text-muted-foreground">Programas ativos</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <Users size={15} className="text-teal-600" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{summary.activePatients}</div>
                <div className="text-xs text-muted-foreground">Pacientes em programas</div>
              </div>
            </div>
            <div className="stat-card">
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
            <DataState
              kind="error"
              title="Não foi possível carregar os programas"
              description={error}
              actionLabel="Tentar novamente"
              onAction={() => void loadPrograms()}
            />
          )}

          <div
            className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit"
            role="tablist"
            aria-label="Filtrar programas por status"
          >
            {(['todos', 'ativo', 'rascunho', 'arquivado'] as const).map((statusFilter) => (
              <button
                key={statusFilter}
                type="button"
                onClick={() => setFilter(statusFilter)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all focus-visible:outline-none focus-visible:focus-ring ${
                  filter === statusFilter
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={filter === statusFilter}
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
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonCard key={`program-skeleton-${index}`} className="h-64" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <DataState
              kind="empty"
              title="Nenhum programa encontrado"
              description="Crie um programa novo ou ajuste o filtro selecionado."
            />
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
                  onEnroll={openEnrollment}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <CommercialCatalogContent activeTab={surfaceTab} />
      )}

      {surfaceTab === 'programs' && enrollmentProgram && (
        <Dialog
          open
          title="Matricular paciente"
          description={`Matricule um paciente no programa ${enrollmentProgram.name}, com reflexos operacionais gerados pela RPC do tenant ativo.`}
          onOpenChange={(open) => {
            if (!open && !enrollmentSubmitting) setEnrollmentProgram(null);
          }}
          placement="center"
        >
          <div className="-m-5">
            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                <label className="space-y-1" htmlFor={`search-patient-${enrollmentProgram.id}`}>
                  <span className="text-xs font-medium text-muted-foreground">
                    Buscar paciente ativo
                  </span>
                  <input
                    id={`search-patient-${enrollmentProgram.id}`}
                    type="search"
                    value={enrollmentSearch}
                    onChange={(event) => setEnrollmentSearch(event.target.value)}
                    placeholder="Nome, telefone ou documento mascarado"
                    className={`${inputClass} ${focusClasses}`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void loadEnrollmentPatients(enrollmentSearch)}
                  disabled={enrollmentLoadingPatients}
                  className={`self-end ${actionButtonClass} text-foreground btn-secondary`}
                >
                  {enrollmentLoadingPatients ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              <label className="space-y-1 block" htmlFor={`patient-${enrollmentProgram.id}`}>
                <span className="text-xs font-medium text-muted-foreground">Paciente</span>
                <select
                  id={`patient-${enrollmentProgram.id}`}
                  value={enrollmentPatientId}
                  onChange={(event) => setEnrollmentPatientId(event.target.value)}
                  disabled={enrollmentLoadingPatients || enrollmentPatients.length === 0}
                  className={`${inputClass} ${focusClasses} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <option value="">Selecione um paciente ativo</option>
                  {enrollmentPatients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name} - {patient.phone} - {patient.activePackage}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 block" htmlFor={`start-date-${enrollmentProgram.id}`}>
                <span className="text-xs font-medium text-muted-foreground">Data de início</span>
                <input
                  id={`start-date-${enrollmentProgram.id}`}
                  type="date"
                  value={enrollmentStartDate}
                  onChange={(event) => setEnrollmentStartDate(event.target.value)}
                  className={`${inputClass} ${focusClasses} sm:w-56`}
                />
              </label>

              {enrollmentCheckingConflict && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  Verificando matrículas vigentes neste programa...
                </div>
              )}

              {enrollmentConflict && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {formatProgramEnrollmentConflictMessage(enrollmentConflict)}
                </div>
              )}

              {enrollmentError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {enrollmentError}
                </div>
              )}

              {enrollmentResult && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                  <p className="font-semibold">
                    {enrollmentResult.patientName} matriculado em {enrollmentResult.programName}.
                  </p>
                  <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                    <li>Check-ins criados: {enrollmentResult.checkinsCreated}</li>
                    <li>Tarefas documentais: {enrollmentResult.documentTasksCreated}</li>
                    <li>Agenda: {enrollmentResult.appointmentId ? 'criada' : 'não gerada'}</li>
                    <li>
                      Financeiro: {enrollmentResult.invoiceId ? 'invoice criada' : 'sem invoice'}
                    </li>
                  </ul>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEnrollmentProgram(null)}
                className={`btn-secondary ${actionButtonClass}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitEnrollment()}
                disabled={
                  !enrollmentPatientId ||
                  enrollmentSubmitting ||
                  enrollmentCheckingConflict ||
                  Boolean(enrollmentConflict)
                }
                className={`btn-primary ${actionButtonClass} disabled:opacity-60`}
              >
                {enrollmentSubmitting ? 'Matriculando...' : 'Confirmar matrícula'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
