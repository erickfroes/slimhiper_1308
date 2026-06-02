'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Search,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  Eye,
  MessageSquare,
  Flag,
  AlertTriangle,
  CheckCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  Phone,
  Pencil,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { SkeletonTableRow } from '@/components/LoadingSkeleton';
import {
  createPatient,
  getPatientFormSnapshot,
  getPatientListPage,
  updatePatient,
  type PatientMutationInput,
} from '@/services/patientsApi';
import type {
  PatientListRow,
  ProgramType,
  FinancialStatus,
  AdherenceLevel,
  PatientStatus,
} from '@/domain/types';

// ─── Types & helpers ──────────────────────────────────────────────────────────

type SortKey = keyof PatientListRow;
type SortDir = 'asc' | 'desc';

const programTypeLabel: Record<ProgramType, string> = {
  emagrecimento: 'Emagrecimento',
  hipertrofia: 'Hipertrofia',
  recomposicao: 'Recomposição',
  saude_metabolica: 'Saúde Metabólica',
  longevidade: 'Longevidade',
};

const programTypeColor: Record<ProgramType, string> = {
  emagrecimento: 'bg-teal-50 text-teal-700',
  hipertrofia: 'bg-indigo-50 text-indigo-700',
  recomposicao: 'bg-purple-50 text-purple-700',
  saude_metabolica: 'bg-blue-50 text-blue-700',
  longevidade: 'bg-amber-50 text-amber-700',
};

function adherenceBg(level: AdherenceLevel): string {
  return {
    excelente: 'text-emerald-700',
    bom: 'text-teal-700',
    regular: 'text-amber-700',
    critico: 'text-red-700',
  }[level];
}

// ─── Adherence Bar ────────────────────────────────────────────────────────────

function AdherenceBar({ value, level }: { value: number; level: AdherenceLevel }) {
  const color = {
    excelente: 'bg-emerald-500',
    bom: 'bg-teal-500',
    regular: 'bg-amber-400',
    critico: 'bg-red-500',
  }[level];

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-muted rounded-full h-1.5 flex-shrink-0">
        <div
          className={['rounded-full h-1.5 transition-all', color].join(' ')}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className={['text-xs font-semibold tabular-nums', adherenceBg(level)].join(' ')}>
        {value}%
      </span>
    </div>
  );
}

// ─── Sort Header ──────────────────────────────────────────────────────────────

type PatientFormState = {
  fullName: string;
  preferredName: string;
  email: string;
  phone: string;
  cpfMasked: string;
  birthDate: string;
  sexGender: string;
  status: PatientStatus;
};

function emptyPatientForm(): PatientFormState {
  return {
    fullName: '',
    preferredName: '',
    email: '',
    phone: '',
    cpfMasked: '',
    birthDate: '',
    sexGender: '',
    status: 'ativo',
  };
}

function toPatientMutationInput(form: PatientFormState): PatientMutationInput {
  return {
    fullName: form.fullName,
    preferredName: form.preferredName,
    email: form.email,
    phone: form.phone,
    cpfMasked: form.cpfMasked,
    birthDate: form.birthDate,
    sexGender: form.sexGender,
    status: form.status,
  };
}

function PatientFormModal({
  mode,
  form,
  error,
  submitting,
  loading,
  onChange,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  form: PatientFormState;
  error: string | null;
  submitting: boolean;
  loading: boolean;
  onChange: (patch: Partial<PatientFormState>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const title = mode === 'create' ? 'Novo paciente' : 'Editar paciente';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Dados sensiveis sao gravados em patient_pii e protegidos por RLS.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="space-y-4 px-5 py-5"
        >
          {loading ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              Carregando dados do paciente...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Nome completo
                  <input
                    value={form.fullName}
                    onChange={(event) => onChange({ fullName: event.target.value })}
                    className="input-base text-sm"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Nome social/apelido
                  <input
                    value={form.preferredName}
                    onChange={(event) => onChange({ preferredName: event.target.value })}
                    className="input-base text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => onChange({ email: event.target.value })}
                    className="input-base text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Telefone
                  <input
                    value={form.phone}
                    onChange={(event) => onChange({ phone: event.target.value })}
                    className="input-base text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  CPF mascarado
                  <input
                    value={form.cpfMasked}
                    onChange={(event) => onChange({ cpfMasked: event.target.value })}
                    className="input-base text-sm"
                    placeholder="***.***.***-**"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Nascimento
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={(event) => onChange({ birthDate: event.target.value })}
                    className="input-base text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Genero/sexo
                  <input
                    value={form.sexGender}
                    onChange={(event) => onChange({ sexGender: event.target.value })}
                    className="input-base text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => onChange({ status: event.target.value as PatientStatus })}
                    className="input-base text-sm"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="pausado">Pausado</option>
                    <option value="inativo">Inativo</option>
                    <option value="concluido">Concluido</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </label>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary text-sm disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || submitting}
              className="btn-primary text-sm disabled:opacity-60"
            >
              {submitting ? 'Salvando...' : mode === 'create' ? 'Cadastrar paciente' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none whitespace-nowrap"
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        <span
          className={['flex flex-col', active ? 'text-primary' : 'text-muted-foreground/40'].join(
            ' '
          )}
        >
          <ChevronUp size={10} className={active && currentDir === 'asc' ? 'text-primary' : ''} />
          <ChevronDown
            size={10}
            className={active && currentDir === 'desc' ? 'text-primary' : ''}
          />
        </span>
      </span>
    </th>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PAGE_SIZES = [10, 20, 50];
const DERIVED_FILTER_LOAD_LIMIT = 100;

export default function PatientListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') ?? '';
  const [patients, setPatients] = useState<PatientListRow[]>([]);
  const [totalPatients, setTotalPatients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [filterStatus, setFilterStatus] = useState<PatientStatus | ''>('');
  const [filterProgram, setFilterProgram] = useState<ProgramType | ''>('');
  const [filterFinancial, setFilterFinancial] = useState<FinancialStatus | ''>('');
  const [filterAdherence, setFilterAdherence] = useState<AdherenceLevel | ''>('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [patientFormMode, setPatientFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [patientForm, setPatientForm] = useState<PatientFormState>(() => emptyPatientForm());
  const [patientFormError, setPatientFormError] = useState<string | null>(null);
  const [patientFormLoading, setPatientFormLoading] = useState(false);
  const [patientFormSubmitting, setPatientFormSubmitting] = useState(false);
  const loadRequestIdRef = useRef(0);

  const hasDerivedFilters = Boolean(filterProgram || filterFinancial || filterAdherence);
  const usesServerPagination = !hasDerivedFilters;

  const loadPatients = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    setLoadError(null);

    const result = await getPatientListPage({
      search,
      status: filterStatus,
      page: usesServerPagination ? page : 1,
      pageSize: usesServerPagination ? pageSize : DERIVED_FILTER_LOAD_LIMIT,
    });

    if (loadRequestIdRef.current !== requestId) return;

    if (result.error || !result.data) {
      setPatients([]);
      setTotalPatients(0);
      setLoadError(result.error?.message ?? 'Falha ao carregar lista de pacientes.');
      setLoading(false);
      toast.error('Falha ao carregar lista de pacientes.');
      return;
    }

    setPatients(result.data.rows);
    setTotalPatients(result.data.total);
    setLoading(false);
  }, [filterStatus, page, pageSize, search, usesServerPagination]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    setSearch(initialSearch);
    setPage(1);
  }, [initialSearch]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    let result = [...patients];
    if (filterProgram) result = result.filter((p) => p.programType === filterProgram);
    if (filterFinancial) result = result.filter((p) => p.financialStatus === filterFinancial);
    if (filterAdherence) result = result.filter((p) => p.adherenceLevel === filterAdherence);
    if (sortKey) {
      result.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === 'number' && typeof bv === 'number')
          return sortDir === 'asc' ? av - bv : bv - av;
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv), 'pt-BR')
          : String(bv).localeCompare(String(av), 'pt-BR');
      });
    }
    return result;
  }, [patients, filterProgram, filterFinancial, filterAdherence, sortKey, sortDir]);

  const effectiveTotalPatients = usesServerPagination ? totalPatients : filtered.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotalPatients / pageSize));
  const paginated = usesServerPagination
    ? filtered
    : filtered.slice((page - 1) * pageSize, page * pageSize);
  const firstVisiblePatient = effectiveTotalPatients === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisiblePatient = usesServerPagination
    ? Math.min((page - 1) * pageSize + paginated.length, effectiveTotalPatients)
    : Math.min(page * pageSize, effectiveTotalPatients);
  const pageWindowStart = Math.max(1, Math.min(page - 2, Math.max(1, totalPages - 4)));
  const visiblePageNumbers = Array.from(
    { length: Math.min(5, totalPages - pageWindowStart + 1) },
    (_, index) => pageWindowStart + index
  );

  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === paginated.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginated.map((p) => p.id)));
  };

  const clearFilters = () => {
    setFilterStatus('');
    setFilterProgram('');
    setFilterFinancial('');
    setFilterAdherence('');
    setSearch('');
    setPage(1);
  };

  const closePatientForm = () => {
    if (patientFormSubmitting) return;
    setPatientFormMode(null);
    setEditingPatientId(null);
    setPatientForm(emptyPatientForm());
    setPatientFormError(null);
    setPatientFormLoading(false);
  };

  const openCreatePatient = () => {
    setPatientFormMode('create');
    setEditingPatientId(null);
    setPatientForm(emptyPatientForm());
    setPatientFormError(null);
    setPatientFormLoading(false);
  };

  const openEditPatient = async (patientId: string) => {
    setPatientFormMode('edit');
    setEditingPatientId(patientId);
    setPatientForm(emptyPatientForm());
    setPatientFormError(null);
    setPatientFormLoading(true);

    const result = await getPatientFormSnapshot(patientId);
    setPatientFormLoading(false);

    if (result.error || !result.data) {
      setPatientFormError(result.error?.message ?? 'Falha ao carregar paciente.');
      return;
    }

    setPatientForm({
      fullName: result.data.fullName,
      preferredName: result.data.preferredName,
      email: result.data.email,
      phone: result.data.phone,
      cpfMasked: result.data.cpfMasked,
      birthDate: result.data.birthDate,
      sexGender: result.data.sexGender,
      status: result.data.status,
    });
  };

  const handleSubmitPatientForm = async () => {
    setPatientFormSubmitting(true);
    setPatientFormError(null);

    const input = toPatientMutationInput(patientForm);
    const result =
      patientFormMode === 'edit' && editingPatientId
        ? await updatePatient(editingPatientId, input)
        : await createPatient(input);

    setPatientFormSubmitting(false);

    if (result.error || !result.data) {
      setPatientFormError(result.error?.message ?? 'Nao foi possivel salvar paciente.');
      return;
    }

    toast.success(patientFormMode === 'edit' ? 'Paciente atualizado.' : 'Paciente cadastrado.');
    closePatientForm();
    await loadPatients();
  };

  const activeFilters = [filterStatus, filterProgram, filterFinancial, filterAdherence].filter(
    Boolean
  ).length;

  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
      {patientFormMode && (
        <PatientFormModal
          mode={patientFormMode}
          form={patientForm}
          error={patientFormError}
          submitting={patientFormSubmitting}
          loading={patientFormLoading}
          onChange={(patch) => setPatientForm((current) => ({ ...current, ...patch }))}
          onClose={closePatientForm}
          onSubmit={handleSubmitPatientForm}
        />
      )}

      <PageHeader
        title="Pacientes"
        subtitle={`${totalPatients} pacientes no contrato real · ${patients.filter((p) => p.status === 'ativo').length} ativos nesta carga`}
        actions={
          <button type="button" onClick={openCreatePatient} className="btn-primary text-sm">
            <Users size={15} />
            Novo Paciente
          </button>
        }
      />

      {loadError ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <button type="button" onClick={loadPatients} className="btn-secondary text-xs">
              Tentar novamente
            </button>
          </div>
        </div>
      ) : null}

      {/* Search + Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Buscar por nome, documento, telefone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="input-base pl-9"
          />
        </div>

        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className={[
            'btn-secondary gap-2 text-sm',
            filterOpen || activeFilters > 0 ? 'border-primary text-primary' : '',
          ].join(' ')}
        >
          <SlidersHorizontal size={15} />
          Filtros
          {activeFilters > 0 && (
            <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 leading-none font-semibold">
              {activeFilters}
            </span>
          )}
        </button>

        {activeFilters > 0 && (
          <button onClick={clearFilters} className="btn-ghost text-sm gap-1.5 text-negative">
            <X size={14} />
            Limpar filtros
          </button>
        )}
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div className="card-base p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 fade-in">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Programa
            </label>
            <select
              value={filterProgram}
              onChange={(e) => {
                setFilterProgram(e.target.value as ProgramType | '');
                setPage(1);
              }}
              className="input-base text-sm"
            >
              <option value="">Todos os programas</option>
              {(Object.keys(programTypeLabel) as ProgramType[]).map((k) => (
                <option key={`prog-filter-${k}`} value={k}>
                  {programTypeLabel[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value as PatientStatus | '');
                setPage(1);
              }}
              className="input-base text-sm"
            >
              <option value="">Todos</option>
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
              <option value="inativo">Inativo</option>
              <option value="concluido">Concluido</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Status Financeiro
            </label>
            <select
              value={filterFinancial}
              onChange={(e) => {
                setFilterFinancial(e.target.value as FinancialStatus | '');
                setPage(1);
              }}
              className="input-base text-sm"
            >
              <option value="">Todos</option>
              <option value="em_dia">Em dia</option>
              <option value="pendente">Pendente</option>
              <option value="inadimplente">Inadimplente</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Adesão
            </label>
            <select
              value={filterAdherence}
              onChange={(e) => {
                setFilterAdherence(e.target.value as AdherenceLevel | '');
                setPage(1);
              }}
              className="input-base text-sm"
            >
              <option value="">Todas</option>
              <option value="excelente">Excelente (≥85%)</option>
              <option value="bom">Bom (70–84%)</option>
              <option value="regular">Regular (55–69%)</option>
              <option value="critico">Crítico (&lt;55%)</option>
            </select>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 mb-4 slide-up">
          <span className="text-sm font-semibold text-primary">
            {selectedIds.size} selecionado(s)
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              disabled
              title="Envio real de mensagens entra no módulo de chat/notificações."
              className="btn-secondary text-xs gap-1.5"
            >
              <MessageSquare size={13} />
              Enviar mensagem
            </button>
            <button
              type="button"
              disabled
              title="Marcação real de revisão depende de escrita segura em patientsApi."
              className="btn-secondary text-xs gap-1.5"
            >
              <Flag size={13} />
              Marcar para revisão
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="btn-ghost text-xs">
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card-base overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === paginated.length && paginated.length > 0}
                    onChange={toggleAll}
                    className="rounded border-input accent-primary cursor-pointer"
                    aria-label="Selecionar pacientes da pagina"
                  />
                </th>
                <SortableHeader
                  label="Paciente"
                  sortKey="name"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Idade"
                  sortKey="age"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Telefone
                </th>
                <SortableHeader
                  label="Programa"
                  sortKey="activePackage"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Semana"
                  sortKey="currentWeek"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Adesão"
                  sortKey="weeklyAdherence"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Próx. Consulta
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Alertas
                </th>
                <SortableHeader
                  label="Financeiro"
                  sortKey="financialStatus"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonTableRow key={`skel-row-${i}`} />)
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-0">
                    <EmptyState
                      icon={Users}
                      title="Nenhum paciente encontrado"
                      description="Tente ajustar os filtros ou o termo de busca para encontrar pacientes."
                      action={
                        <button onClick={clearFilters} className="btn-secondary text-sm">
                          Limpar filtros
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                paginated.map((patient, rowIndex) => (
                  <tr
                    key={patient.id}
                    className={[
                      'border-b border-border last:border-0 hover:bg-muted/40 transition-colors group',
                      rowIndex % 2 === 0 ? '' : 'bg-muted/20',
                      selectedIds.has(patient.id) ? 'bg-primary/5' : '',
                    ].join(' ')}
                    onClick={() => router.push(`/clinic/patients/${patient.id}`)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(patient.id)}
                        onChange={() => toggleSelect(patient.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-input accent-primary cursor-pointer"
                        aria-label={`Selecionar ${patient.name}`}
                      />
                    </td>

                    {/* Name + avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                          {patient.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate max-w-[140px]">
                            {patient.name}
                          </p>
                          <StatusBadge status={patient.status} size="xs" />
                        </div>
                      </div>
                    </td>

                    {/* Age */}
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                      {patient.age} anos
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone size={11} />
                        {patient.phone}
                      </span>
                    </td>

                    {/* Program */}
                    <td className="px-4 py-3">
                      <span
                        className={[
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          programTypeColor[patient.programType],
                        ].join(' ')}
                      >
                        {programTypeLabel[patient.programType]}
                      </span>
                    </td>

                    {/* Week */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary rounded-full h-1.5"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  (patient.currentWeek / Math.max(patient.totalWeeks, 1)) * 100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-foreground tabular-nums">
                          {patient.currentWeek}/{patient.totalWeeks}
                        </span>
                      </div>
                    </td>

                    {/* Adherence */}
                    <td className="px-4 py-3">
                      <AdherenceBar
                        value={patient.weeklyAdherence}
                        level={patient.adherenceLevel}
                      />
                    </td>

                    {/* Next appointment */}
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {patient.nextAppointment ?? (
                        <span className="text-amber-600 font-medium">Sem agendamento</span>
                      )}
                    </td>

                    {/* Alerts */}
                    <td className="px-4 py-3">
                      {patient.alertCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          <AlertTriangle size={11} />
                          {patient.alertCount}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle size={12} />
                          OK
                        </span>
                      )}
                    </td>

                    {/* Financial */}
                    <td className="px-4 py-3">
                      <StatusBadge status={patient.financialStatus} size="xs" />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/clinic/patients/${patient.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                          title="Abrir Paciente 360"
                        >
                          <Eye size={14} />
                        </Link>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openEditPatient(patient.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                          title="Editar paciente"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          disabled
                          className="p-1.5 rounded-lg text-muted-foreground opacity-50 cursor-not-allowed transition-colors"
                          title="Chat real ainda não está liberado no MVP clínico."
                        >
                          <MessageSquare size={14} />
                        </button>
                        <button
                          type="button"
                          disabled
                          className="p-1.5 rounded-lg text-muted-foreground opacity-50 cursor-not-allowed transition-colors"
                          title="Revisão real depende de escrita segura em patientsApi."
                        >
                          <Flag size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && effectiveTotalPatients > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Exibindo {firstVisiblePatient}–{lastVisiblePatient} de {effectiveTotalPatients}{' '}
                pacientes
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="ml-2 text-xs border border-input rounded-lg px-2 py-1 bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={`pagesize-${s}`} value={s}>
                    {s} por página
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Pagina anterior"
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              {pageWindowStart > 1 && <span className="text-xs text-muted-foreground px-1">…</span>}
              {visiblePageNumbers.map((pageNum) => (
                <button
                  key={`page-${pageNum}`}
                  type="button"
                  onClick={() => setPage(pageNum)}
                  aria-label={`Ir para pagina ${pageNum}`}
                  className={[
                    'w-7 h-7 rounded-lg text-xs font-semibold transition-colors',
                    page === pageNum
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border hover:bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {pageNum}
                </button>
              ))}
              {pageWindowStart + visiblePageNumbers.length - 1 < totalPages && (
                <span className="text-xs text-muted-foreground px-1">…</span>
              )}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Proxima pagina"
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
