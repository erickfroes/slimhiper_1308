'use client';

import React, { useState } from 'react';
import {
  FileText,
  DollarSign,
  ShoppingBag,
  FileCheck,
  Target,
  Clock,
  Bell,
  Eye,
  FileDown,
  Table2,
  Printer,
  X,
} from 'lucide-react';
import type { PatientReportDefinition } from '@/domain/types';
import { mockReportDefinitions } from '@/data/mockData';

// Map iconKey strings to Lucide components
const iconMap: Record<string, React.ElementType> = {
  FileText,
  DollarSign,
  ShoppingBag,
  FileCheck,
  Target,
  Clock,
  Bell,
};

// Derive icon styling from iconKey
const iconStyleMap: Record<string, { iconBg: string; iconColor: string }> = {
  FileText: { iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
  DollarSign: { iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  ShoppingBag: { iconBg: 'bg-violet-50', iconColor: 'text-violet-600' },
  FileCheck: { iconBg: 'bg-orange-50', iconColor: 'text-orange-600' },
  Target: { iconBg: 'bg-pink-50', iconColor: 'text-pink-600' },
  Clock: { iconBg: 'bg-cyan-50', iconColor: 'text-cyan-600' },
  Bell: { iconBg: 'bg-red-50', iconColor: 'text-red-600' },
};

interface TabRelatoriosProps {
  patientName: string;
}

export default function TabRelatorios({ patientName }: TabRelatoriosProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [viewingReport, setViewingReport] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleVerRelatorio = (label: string) => {
    setViewingReport(label);
  };

  const handleExportPDF = (card: PatientReportDefinition) => {
    if (!card.exportImplemented) {
      showToast('Exportação em breve');
    }
  };

  const handleExportExcel = (card: PatientReportDefinition) => {
    if (!card.exportImplemented) {
      showToast('Exportação em breve');
    }
  };

  const handleImprimir = (card: PatientReportDefinition) => {
    if (!card.exportImplemented) {
      showToast('Exportação em breve');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Relatórios — {patientName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Selecione um relatório para visualizar ou exportar
          </p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
          {mockReportDefinitions.length} relatórios disponíveis
        </span>
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {mockReportDefinitions.map((card) => {
          const IconComp = iconMap[card.iconKey] ?? FileText;
          const { iconBg, iconColor } = iconStyleMap[card.iconKey] ?? {
            iconBg: 'bg-gray-50',
            iconColor: 'text-gray-600',
          };
          return (
            <div
              key={card.key}
              className="card-base p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}
                >
                  <IconComp size={18} className={iconColor} />
                </div>
                {card.badge && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${card.badgeColor}`}
                  >
                    {card.badge}
                  </span>
                )}
              </div>

              {/* Card Body */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">{card.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {/* Primary action */}
                <button
                  onClick={() => handleVerRelatorio(card.label)}
                  className="btn-primary text-xs w-full gap-1.5 justify-center"
                >
                  <Eye size={13} />
                  Ver relatório completo
                </button>

                {/* Secondary actions */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleExportPDF(card)}
                    className="btn-secondary text-[11px] gap-1 justify-center px-2 py-1.5"
                    title="Exportar PDF"
                  >
                    <FileDown size={12} />
                    PDF
                  </button>
                  <button
                    onClick={() => handleExportExcel(card)}
                    className="btn-secondary text-[11px] gap-1 justify-center px-2 py-1.5"
                    title="Exportar Excel"
                  >
                    <Table2 size={12} />
                    Excel
                  </button>
                  <button
                    onClick={() => handleImprimir(card)}
                    className="btn-secondary text-[11px] gap-1 justify-center px-2 py-1.5"
                    title="Imprimir"
                  >
                    <Printer size={12} />
                    Imprimir
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Report Viewer Modal */}
      {viewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card-base w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{viewingReport}</p>
              <button
                onClick={() => setViewingReport(null)}
                className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
              >
                <X size={15} />
              </button>
            </div>
            <div className="bg-muted rounded-xl p-8 flex flex-col items-center gap-3 text-center">
              <FileText size={32} className="text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">Visualização em breve</p>
              <p className="text-xs text-muted-foreground">
                O relatório <span className="font-medium">{viewingReport}</span> de{' '}
                <span className="font-medium">{patientName}</span> estará disponível em breve.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setViewingReport(null)} className="btn-secondary text-xs">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-xs font-medium px-4 py-2.5 rounded-full shadow-lg fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
