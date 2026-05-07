'use client';

import React, { useState } from 'react';
import {
  Plus,
  BookOpen,
  Clock,
  Users,
  CheckSquare,
  Smartphone,
  FileText,
  CreditCard,
  Layers,
  Target,
  ChevronDown,
  ChevronUp,
  Copy,
  Archive,
  Edit2,
  Eye,
  Wrench,
  MoreHorizontal,
} from 'lucide-react';

import { mockClinicPrograms } from '@/data/mockData';
import type { ClinicProgram, ProgramStatus } from '@/domain/types';

// ─── COLOR MAP ────────────────────────────────────────────────────────────────

const colorMap: Record<string, { accent: string; badge: string; dot: string; icon: string }> = {
  teal:    { accent: 'border-l-teal-500',    badge: 'bg-teal-50 text-teal-700',    dot: 'bg-teal-500',    icon: 'text-teal-600' },
  violet:  { accent: 'border-l-violet-500',  badge: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500', icon: 'text-violet-600' },
  amber:   { accent: 'border-l-amber-500',   badge: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-500',  icon: 'text-amber-600' },
  blue:    { accent: 'border-l-blue-500',    badge: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-500',   icon: 'text-blue-600' },
  emerald: { accent: 'border-l-emerald-500', badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', icon: 'text-emerald-600' },
};

const paymentModelLabel: Record<string, string> = {
  parcelado:  'Parcelado',
  avista:     'À Vista',
  assinatura: 'Assinatura',
  hibrido:    'Híbrido',
};

const statusConfig: Record<ProgramStatus, { label: string; className: string }> = {
  ativo:     { label: 'Ativo',     className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  arquivado: { label: 'Arquivado', className: 'bg-gray-100 text-gray-500 border border-gray-200' },
  rascunho:  { label: 'Rascunho',  className: 'bg-amber-50 text-amber-700 border border-amber-200' },
};

// ─── PROGRAM CARD ─────────────────────────────────────────────────────────────

interface ProgramCardProps {
  program: ClinicProgram;
}

function ProgramCard({ program }: ProgramCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const colors = colorMap[program.color] ?? colorMap['teal'];
  const status = statusConfig[program.status];

  return (
    <div className={`bg-card border border-border rounded-2xl border-l-4 ${colors.accent} shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden`}>
      {/* Card Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.badge}`}>
              <BookOpen size={16} className={colors.icon} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground leading-tight">{program.name}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                  {status.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{program.objective}</p>
            </div>
          </div>

          {/* Actions menu */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]">
                <button
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <Edit2 size={13} className="text-muted-foreground" /> Editar
                </button>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <Copy size={13} className="text-muted-foreground" /> Duplicar
                </button>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <Eye size={13} className="text-muted-foreground" /> Ver pacientes
                </button>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <Wrench size={13} className="text-muted-foreground" /> Abrir builder
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-negative hover:bg-negative/5 transition-colors"
                >
                  <Archive size={13} /> Arquivar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Key metrics row */}
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
            <span className="text-xs font-medium text-foreground">{program.activePatients} pacientes</span>
          </div>
        </div>

        {/* Phases pills */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {program.phases.map((phase, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
              {phase.name} · {phase.durationWeeks}sem
            </span>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Summary info row */}
      <div className="px-5 py-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {/* Services */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <CheckSquare size={12} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Serviços</span>
          </div>
          <div className="space-y-0.5">
            {program.includedServices.slice(0, 3).map((svc, i) => (
              <div key={i} className="text-xs text-foreground">
                {svc.quantity}× {svc.label}
              </div>
            ))}
            {program.includedServices.length > 3 && (
              <div className="text-xs text-muted-foreground">+{program.includedServices.length - 3} mais</div>
            )}
          </div>
        </div>

        {/* Check-ins + Payment */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Target size={12} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Check-ins</span>
            </div>
            <div className="text-xs text-foreground">{program.checkInsTotal} · {program.checkInFrequency}</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <CreditCard size={12} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pagamento</span>
            </div>
            <div className="text-xs text-foreground">{paymentModelLabel[program.paymentModel]}</div>
          </div>
        </div>
      </div>

      {/* Expandable details */}
      {expanded && (
        <>
          <div className="border-t border-border" />
          <div className="px-5 py-4 space-y-4">
            {/* App entitlements */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Smartphone size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">App do Paciente</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {program.appEntitlements.map((ent) => (
                  <span
                    key={ent.key}
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      ent.enabled
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :'bg-muted text-muted-foreground border-border line-through'
                    }`}
                  >
                    {ent.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Required documents */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FileText size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Documentos Necessários</span>
              </div>
              <div className="space-y-1">
                {program.requiredDocuments.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-foreground">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${doc.required ? 'bg-negative' : 'bg-muted-foreground'}`} />
                    {doc.label}
                    {!doc.required && <span className="text-muted-foreground">(opcional)</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Payment description */}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <CreditCard size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Modelo de Pagamento</span>
              </div>
              <p className="text-xs text-foreground">{program.paymentDescription}</p>
            </div>

            {/* Phases detail */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Layers size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fases do Programa</span>
              </div>
              <div className="space-y-2">
                {program.phases.map((phase, i) => (
                  <div key={i} className="flex gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${colors.badge}`}>
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-foreground">{phase.name} <span className="text-muted-foreground font-normal">· {phase.durationWeeks} semanas</span></div>
                      <div className="text-xs text-muted-foreground">{phase.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Card footer: expand + quick actions */}
      <div className="border-t border-border px-5 py-3 flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? 'Recolher detalhes' : 'Ver detalhes completos'}
        </button>

        <div className="flex items-center gap-1">
          <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Eye size={12} /> Pacientes
          </button>
          <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Wrench size={12} /> Builder
          </button>
          <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
            <Edit2 size={12} /> Editar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN CONTENT ─────────────────────────────────────────────────────────────

export default function ProgramsContent() {
  const [filter, setFilter] = useState<ProgramStatus | 'todos'>('todos');

  const filtered = filter === 'todos'
    ? mockClinicPrograms
    : mockClinicPrograms.filter((p) => p.status === filter);

  const totalActive = mockClinicPrograms.filter((p) => p.status === 'ativo').length;
  const totalPatients = mockClinicPrograms.reduce((sum, p) => sum + p.activePatients, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Programas e Pacotes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Templates de programas clínicos e pacotes de atendimento da clínica.
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors flex-shrink-0">
          <Plus size={15} />
          Criar programa
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen size={15} className="text-primary" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{totalActive}</div>
            <div className="text-xs text-muted-foreground">Programas ativos</div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
            <Users size={15} className="text-teal-600" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{totalPatients}</div>
            <div className="text-xs text-muted-foreground">Pacientes em programas</div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
            <Layers size={15} className="text-violet-600" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{mockClinicPrograms.length}</div>
            <div className="text-xs text-muted-foreground">Templates cadastrados</div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-xl p-1 w-fit">
        {(['todos', 'ativo', 'rascunho', 'arquivado'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'todos' ? 'Todos' : f === 'ativo' ? 'Ativos' : f === 'rascunho' ? 'Rascunhos' : 'Arquivados'}
          </button>
        ))}
      </div>

      {/* Program cards grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <BookOpen size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum programa encontrado</p>
          <p className="text-xs text-muted-foreground mt-1">Tente outro filtro ou crie um novo programa.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}
    </div>
  );
}
