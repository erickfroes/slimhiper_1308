'use client';

import React from 'react';
import type { PatientDocumentSummary } from '@/domain/types';
import DocumentStatusBadge from '@/components/DocumentStatusBadge';
import EmptyState from '@/components/EmptyState';
import { FileText, Plus, Download, Eye } from 'lucide-react';

const docTypeLabel: Record<string, string> = {
  contrato: 'Contrato',
  consentimento: 'Consentimento',
  exame: 'Exame',
  prescricao: 'Prescrição',
  relatorio: 'Relatório',
  outros: 'Outros',
};

interface TabDocumentosProps {
  documents: PatientDocumentSummary[];
}

export default function TabDocumentos({ documents }: TabDocumentosProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Documentos ({documents.length})</p>
        <button className="btn-primary text-xs">
          <Plus size={13} />
          Enviar Documento
        </button>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum documento"
          description="Contratos, consentimentos e exames do paciente aparecerão aqui."
          action={<button className="btn-primary text-sm"><Plus size={14} /> Enviar Documento</button>}
        />
      ) : (
        <div className="card-base overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Documento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Criado em</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Enviado por</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc, i) => (
                <tr key={doc.id} className={['border-b border-border last:border-0 hover:bg-muted/30 transition-colors group', i % 2 === 1 ? 'bg-muted/10' : ''].join(' ')}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium text-foreground">{doc.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{docTypeLabel[doc.type]}</td>
                  <td className="px-4 py-3">
                    <DocumentStatusBadge status={doc.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{doc.createdAt}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{doc.uploadedBy}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Visualizar">
                        <Eye size={13} />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Baixar">
                        <Download size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}