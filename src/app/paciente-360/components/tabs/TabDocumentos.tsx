'use client';

import React, { useState } from 'react';
import type { PatientDocumentSummary } from '@/domain/types';
import EmptyState from '@/components/EmptyState';
import { FileText, Download, Eye, Info, ShieldCheck, Package, Send, ChevronDown, ChevronUp, CheckCircle2, Clock, AlertCircle, XCircle, Search,  } from 'lucide-react';

// ─── Extended document type for Documentos tab ───────────────────────────────

type DocCategory =
  | 'relatorio' |'prescricao' |'termo' |'contrato' |'consentimento' |'orientacao' |'pacote_evidencia' |'assinado' |'pendente';

interface ExtendedDocument {
  id: string;
  name: string;
  category: DocCategory;
  tipo: string;
  status: 'assinado' | 'pendente_assinatura' | 'em_analise' | 'vencido' | 'cancelado' | 'disponivel';
  assinatura: 'assinado' | 'pendente' | 'nao_requerido';
  emitidoEm: string;
  ultimoAcesso?: string;
  emitidoPor: string;
  hasEvidencePackage?: boolean;
}

// ─── Mock extended documents ─────────────────────────────────────────────────

const extendedDocuments: ExtendedDocument[] = [
  // Relatórios
  {
    id: 'doc-r-001',
    name: 'Relatório de Avaliação Inicial',
    category: 'relatorio',
    tipo: 'Relatório',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '10/04/2026',
    ultimoAcesso: '05/05/2026',
    emitidoPor: 'Dra. Fernanda Lima',
    hasEvidencePackage: true,
  },
  {
    id: 'doc-r-002',
    name: 'Relatório de Evolução — Semana 4',
    category: 'relatorio',
    tipo: 'Relatório',
    status: 'disponivel',
    assinatura: 'nao_requerido',
    emitidoEm: '05/05/2026',
    ultimoAcesso: '06/05/2026',
    emitidoPor: 'Dra. Fernanda Lima',
  },
  // Prescrições
  {
    id: 'doc-p-001',
    name: 'Prescrição — Metformina 500mg',
    category: 'prescricao',
    tipo: 'Prescrição Médica',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '10/04/2026',
    ultimoAcesso: '28/04/2026',
    emitidoPor: 'Dra. Fernanda Lima',
    hasEvidencePackage: false,
  },
  {
    id: 'doc-p-002',
    name: 'Prescrição — Vitamina D3 2000 UI',
    category: 'prescricao',
    tipo: 'Prescrição Médica',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '28/04/2026',
    ultimoAcesso: '02/05/2026',
    emitidoPor: 'Dra. Fernanda Lima',
  },
  // Termos
  {
    id: 'doc-t-001',
    name: 'Termo de Responsabilidade — Uso de Medicamento',
    category: 'termo',
    tipo: 'Termo',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '10/04/2026',
    ultimoAcesso: '10/04/2026',
    emitidoPor: 'Coord. Ana Souza',
    hasEvidencePackage: true,
  },
  // Contratos
  {
    id: 'doc-c-001',
    name: 'Contrato de Prestação de Serviços',
    category: 'contrato',
    tipo: 'Contrato',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '08/04/2026',
    ultimoAcesso: '09/04/2026',
    emitidoPor: 'Coord. Ana Souza',
    hasEvidencePackage: true,
  },
  // Consentimentos
  {
    id: 'doc-co-001',
    name: 'Termo de Consentimento Livre e Esclarecido',
    category: 'consentimento',
    tipo: 'Consentimento',
    status: 'pendente_assinatura',
    assinatura: 'pendente',
    emitidoEm: '02/05/2026',
    emitidoPor: 'Dra. Fernanda Lima',
  },
  {
    id: 'doc-co-002',
    name: 'Consentimento para Uso de Imagem',
    category: 'consentimento',
    tipo: 'Consentimento',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '08/04/2026',
    ultimoAcesso: '09/04/2026',
    emitidoPor: 'Coord. Ana Souza',
  },
  // Orientações
  {
    id: 'doc-or-001',
    name: 'Orientações Nutricionais — Fase 1',
    category: 'orientacao',
    tipo: 'Orientação',
    status: 'disponivel',
    assinatura: 'nao_requerido',
    emitidoEm: '10/04/2026',
    ultimoAcesso: '24/04/2026',
    emitidoPor: 'Nutr. Carlos Mendes',
  },
  {
    id: 'doc-or-002',
    name: 'Orientações Gerais de Estilo de Vida',
    category: 'orientacao',
    tipo: 'Orientação',
    status: 'disponivel',
    assinatura: 'nao_requerido',
    emitidoEm: '10/04/2026',
    ultimoAcesso: '15/04/2026',
    emitidoPor: 'Dra. Fernanda Lima',
  },
  // Pacotes de evidência
  {
    id: 'doc-pe-001',
    name: 'Pacote de Evidência — Contrato Inicial',
    category: 'pacote_evidencia',
    tipo: 'Pacote de Evidência',
    status: 'disponivel',
    assinatura: 'nao_requerido',
    emitidoEm: '09/04/2026',
    ultimoAcesso: '01/05/2026',
    emitidoPor: 'Sistema',
    hasEvidencePackage: true,
  },
];

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES: { key: DocCategory | 'todos'; label: string; count?: number }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'relatorio', label: 'Relatórios' },
  { key: 'prescricao', label: 'Prescrições' },
  { key: 'termo', label: 'Termos' },
  { key: 'contrato', label: 'Contratos' },
  { key: 'consentimento', label: 'Consentimentos' },
  { key: 'orientacao', label: 'Orientações' },
  { key: 'pacote_evidencia', label: 'Pacotes de Evidência' },
  { key: 'assinado', label: 'Documentos Assinados' },
  { key: 'pendente', label: 'Documentos Pendentes' },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ExtendedDocument['status'] }) {
  const map: Record<ExtendedDocument['status'], { label: string; icon: React.ReactNode; cls: string }> = {
    assinado: { label: 'Assinado', icon: <CheckCircle2 size={11} />, cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    pendente_assinatura: { label: 'Pendente assinatura', icon: <Clock size={11} />, cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
    em_analise: { label: 'Em análise', icon: <AlertCircle size={11} />, cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
    vencido: { label: 'Vencido', icon: <XCircle size={11} />, cls: 'bg-red-50 text-red-700 border border-red-200' },
    cancelado: { label: 'Cancelado', icon: <XCircle size={11} />, cls: 'bg-gray-100 text-gray-500 border border-gray-200' },
    disponivel: { label: 'Disponível', icon: <CheckCircle2 size={11} />, cls: 'bg-sky-50 text-sky-700 border border-sky-200' },
  };
  const cfg = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function AssinaturaBadge({ assinatura }: { assinatura: ExtendedDocument['assinatura'] }) {
  if (assinatura === 'assinado') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <ShieldCheck size={12} className="text-emerald-600" />
        Assinado
      </span>
    );
  }
  if (assinatura === 'pendente') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
        <Clock size={12} className="text-amber-600" />
        Pendente
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

// ─── Row actions ──────────────────────────────────────────────────────────────

interface RowActionsProps {
  doc: ExtendedDocument;
}

function RowActions({ doc }: RowActionsProps) {
  const [open, setOpen] = useState(false);

  const actions = [
    { label: 'Abrir', icon: <Eye size={13} />, always: true },
    { label: 'Baixar', icon: <Download size={13} />, always: true },
    { label: 'Ver detalhes', icon: <Info size={13} />, always: true },
    { label: 'Ver evidência', icon: <ShieldCheck size={13} />, always: true },
    { label: 'Baixar pacote de evidência', icon: <Package size={13} />, always: doc.hasEvidencePackage === true },
    { label: 'Enviar para assinatura', icon: <Send size={13} />, always: doc.assinatura === 'pendente' || doc.assinatura === 'nao_requerido' },
  ].filter((a) => a.always);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors"
      >
        Ações
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-background border border-border rounded-xl shadow-lg py-1 min-w-[200px]">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                // Security: never expose storageObjectPath or raw file paths
                // All file access goes through audited temporary links
                alert(`Ação: ${action.label}\nAcesso via: link temporário auditado`);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-muted/60 transition-colors text-left"
            >
              <span className="text-muted-foreground">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TabDocumentosProps {
  documents: PatientDocumentSummary[];
}

export default function TabDocumentos({ documents: _documents }: TabDocumentosProps) {
  const [activeCategory, setActiveCategory] = useState<DocCategory | 'todos'>('todos');
  const [search, setSearch] = useState('');

  const filtered = extendedDocuments.filter((doc) => {
    const matchesCategory =
      activeCategory === 'todos'
        ? true
        : activeCategory === 'assinado'
        ? doc.assinatura === 'assinado'
        : activeCategory === 'pendente'
        ? doc.assinatura === 'pendente'
        : doc.category === activeCategory;

    const matchesSearch =
      search.trim() === '' ||
      doc.name.toLowerCase().includes(search.toLowerCase()) ||
      doc.tipo.toLowerCase().includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  const categoriesWithCount = CATEGORIES.map((cat) => ({
    ...cat,
    count:
      cat.key === 'todos'
        ? extendedDocuments.length
        : cat.key === 'assinado'
        ? extendedDocuments.filter((d) => d.assinatura === 'assinado').length
        : cat.key === 'pendente'
        ? extendedDocuments.filter((d) => d.assinatura === 'pendente').length
        : extendedDocuments.filter((d) => d.category === cat.key).length,
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-foreground">
          Documentos ({extendedDocuments.length})
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar documento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-48"
            />
          </div>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {categoriesWithCount.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              activeCategory === cat.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted/60',
            ].join(' ')}
          >
            {cat.label}
            <span
              className={[
                'inline-flex items-center justify-center rounded-full text-[10px] font-semibold w-4 h-4',
                activeCategory === cat.key
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              ].join(' ')}
            >
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <ShieldCheck size={13} className="mt-0.5 flex-shrink-0 text-amber-600" />
        <span>
          Por segurança, os arquivos são acessados exclusivamente via <strong>link temporário auditado</strong>. Caminhos de armazenamento não são expostos.
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum documento encontrado"
          description="Nenhum documento corresponde ao filtro selecionado."
        />
      ) : (
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['Documento', 'Tipo', 'Status', 'Assinatura', 'Emitido em', 'Último acesso', 'Ações'].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc, i) => (
                  <tr
                    key={doc.id}
                    className={[
                      'border-b border-border last:border-0 hover:bg-muted/30 transition-colors',
                      i % 2 === 1 ? 'bg-muted/10' : '',
                    ].join(' ')}
                  >
                    {/* Documento */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground leading-tight">{doc.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Emitido por {doc.emitidoPor}</p>
                        </div>
                      </div>
                    </td>

                    {/* Tipo */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{doc.tipo}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={doc.status} />
                    </td>

                    {/* Assinatura */}
                    <td className="px-4 py-3">
                      <AssinaturaBadge assinatura={doc.assinatura} />
                    </td>

                    {/* Emitido em */}
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {doc.emitidoEm}
                    </td>

                    {/* Último acesso */}
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {doc.ultimoAcesso ?? '—'}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3">
                      <RowActions doc={doc} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}