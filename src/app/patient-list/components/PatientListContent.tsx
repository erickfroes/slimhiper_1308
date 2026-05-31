'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { SkeletonTableRow } from '@/components/LoadingSkeleton';
import { getPatientList } from '@/services/patientsApi';
import type { PatientListRow, ProgramType, FinancialStatus, AdherenceLevel } from '@/domain/types';

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
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={['text-xs font-semibold tabular-nums', adherenceBg(level)].join(' ')}>
        {value}%
      </span>
    </div>
  );
}

// ─── Sort Header ──────────────────────────────────────────────────────────────

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

export default function PatientListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') ?? '';
  const [patients, setPatients] = useState<PatientListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [filterProgram, setFilterProgram] = useState<ProgramType | ''>('');
  const [filterFinancial, setFilterFinancial] = useState<FinancialStatus | ''>('');
  const [filterAdherence, setFilterAdherence] = useState<AdherenceLevel | ''>('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await getPatientList();
      setPatients(rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao carregar lista de pacientes.';
      setPatients([]);
      setLoadError(message);
      toast.error('Falha ao carregar lista de pacientes.');
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          p.activePackage.toLowerCase().includes(q)
      );
    }
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
  }, [patients, search, filterProgram, filterFinancial, filterAdherence, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

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
    setFilterProgram('');
    setFilterFinancial('');
    setFilterAdherence('');
    setSearch('');
    setPage(1);
  };

  const activeFilters = [filterProgram, filterFinancial, filterAdherence].filter(Boolean).length;

  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
      <PageHeader
        title="Pacientes"
        subtitle={`${patients.length} pacientes cadastrados · ${patients.filter((p) => p.status === 'ativo').length} ativos`}
        actions={
          <button
            type="button"
            disabled
            title="Criação de paciente depende do service real com validação de PII."
            className="btn-primary text-sm"
          >
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
            placeholder="Buscar por nome, telefone, programa..."
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
        <div className="card-base p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4 fade-in">
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

                    {/* Actions (visible on row hover) */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Exibindo {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} de{' '}
                {filtered.length} pacientes
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
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={`page-${pageNum}`}
                    onClick={() => setPage(pageNum)}
                    className={[
                      'w-7 h-7 rounded-lg text-xs font-semibold transition-colors',
                      page === pageNum
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border hover:bg-muted text-muted-foreground',
                    ].join(' ')}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && <span className="text-xs text-muted-foreground px-1">…</span>}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
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
