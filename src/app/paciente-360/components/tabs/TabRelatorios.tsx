'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
  AlertTriangle,
} from 'lucide-react';
import type { PatientReportDefinition } from '@/domain/types';
import EmptyState from '@/components/EmptyState';
import { getPatientReportDefinitions } from '@/services/reportsApi';
import { createClinicReportRun, downloadClinicReportExport } from '@/services/clinicReportsApi';

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
  patientId: string;
  patientName: string;
}

export default function TabRelatorios({ patientId, patientName }: TabRelatoriosProps) {
  const [reports, setReports] = useState<PatientReportDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await getPatientReportDefinitions(patientId);
      setReports(data);
      setLoadError(error?.message ?? null);
    } catch (error) {
      setReports([]);
      setLoadError(
        error instanceof Error ? error.message : 'Falha inesperada ao carregar relatórios.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  async function runPatientReport(reportKey: string, exportFormat: 'csv' | 'pdf') {
    setRunningAction(`${reportKey}:${exportFormat}`);
    setActionMessage(null);

    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - 90);

    const runResult = await createClinicReportRun({
      reportKey,
      exportFormat,
      patientId,
      filters: {
        from: from.toISOString().slice(0, 10),
        to: today.toISOString().slice(0, 10),
        patientId,
      },
    });

    if (runResult.error || !runResult.data) {
      setActionMessage(runResult.error?.message ?? 'Falha ao executar relatorio do paciente.');
      setRunningAction(null);
      return;
    }

    const downloadResult = await downloadClinicReportExport(runResult.data);
    if (downloadResult.error || !downloadResult.data) {
      setActionMessage(downloadResult.error?.message ?? 'Relatorio gerado, mas o download falhou.');
      setRunningAction(null);
      return;
    }

    const url = URL.createObjectURL(downloadResult.data.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadResult.data.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    setActionMessage('Exportacao segura gerada e auditada. O link expira em poucos minutos.');
    setRunningAction(null);
  }

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
          {reports.length} relatórios disponíveis
        </span>
      </div>

      {actionMessage && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
          {actionMessage}
        </div>
      )}

      {/* Report Cards Grid */}
      {isLoading ? (
        <div className="card-base p-8 text-sm text-muted-foreground">Carregando relatórios...</div>
      ) : loadError ? (
        <div className="card-base p-8 text-center">
          <AlertTriangle size={24} className="mx-auto text-amber-600" />
          <p className="mt-3 text-sm font-semibold text-foreground">Relatórios indisponíveis</p>
          <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
          <button type="button" onClick={() => void loadReports()} className="btn-secondary mt-4">
            Tentar novamente
          </button>
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum relatório disponível"
          description="Nenhum relatório clínico foi disponibilizado para este paciente."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {reports.map((card) => {
            const IconComp = iconMap[card.iconKey] ?? FileText;
            const { iconBg, iconColor } = iconStyleMap[card.iconKey] ?? {
              iconBg: 'bg-gray-50',
              iconColor: 'text-gray-600',
            };
            const disabledReason = card.exportImplemented
              ? 'Exportacao segura disponivel para este relatorio.'
              : 'Relatorio cadastrado sem exportacao habilitada.';
            const pdfRunning = runningAction === `${card.key}:pdf`;
            const csvRunning = runningAction === `${card.key}:csv`;
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
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {card.description}
                  </p>
                </div>

                {/* Divider */}
                <div className="border-t border-border" />

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  {/* Primary action */}
                  <button
                    type="button"
                    disabled={!card.exportImplemented || runningAction !== null}
                    title={disabledReason}
                    onClick={() => void runPatientReport(card.key, 'csv')}
                    className="btn-primary text-xs w-full gap-1.5 justify-center disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <Eye size={13} />
                    {csvRunning ? 'Gerando relatório...' : 'Ver relatório completo'}
                  </button>

                  {/* Secondary actions */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      disabled={!card.exportImplemented || runningAction !== null}
                      onClick={() => void runPatientReport(card.key, 'pdf')}
                      className="btn-secondary text-[11px] gap-1 justify-center px-2 py-1.5 disabled:cursor-not-allowed disabled:opacity-55"
                      title={disabledReason}
                    >
                      <FileDown size={12} />
                      {pdfRunning ? '...' : 'PDF'}
                    </button>
                    <button
                      type="button"
                      disabled={!card.exportImplemented || runningAction !== null}
                      onClick={() => void runPatientReport(card.key, 'csv')}
                      className="btn-secondary text-[11px] gap-1 justify-center px-2 py-1.5 disabled:cursor-not-allowed disabled:opacity-55"
                      title={disabledReason}
                    >
                      <Table2 size={12} />
                      CSV
                    </button>
                    <button
                      type="button"
                      disabled={!card.exportImplemented || runningAction !== null}
                      onClick={() => void runPatientReport(card.key, 'pdf')}
                      className="btn-secondary text-[11px] gap-1 justify-center px-2 py-1.5 disabled:cursor-not-allowed disabled:opacity-55"
                      title={disabledReason}
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
      )}
    </div>
  );
}
