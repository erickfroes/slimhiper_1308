'use client';

import React from 'react';
import { BarChart2, Download, Plus, FileText } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import Icon from '@/components/ui/AppIcon';


const reportTemplates = [
  { key: 'report-evolucao', label: 'Relatório de Evolução Clínica', description: 'Progresso de peso, medidas e adesão ao longo do programa', icon: BarChart2 },
  { key: 'report-nutricao', label: 'Relatório Nutricional', description: 'Aderência ao plano alimentar e evolução nutricional', icon: FileText },
  { key: 'report-financeiro', label: 'Extrato Financeiro', description: 'Histórico de pagamentos e faturas do contrato', icon: FileText },
];

interface TabRelatoriosProps {
  patientName: string;
}

export default function TabRelatorios({ patientName }: TabRelatoriosProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Relatórios Disponíveis</p>
        <button className="btn-primary text-xs">
          <Plus size={13} />
          Gerar Relatório
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {reportTemplates.map((tmpl) => {
          const Icon = tmpl.icon;
          return (
            <div key={tmpl.key} className="card-base p-5 hover:card-shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Icon size={17} className="text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">{tmpl.label}</p>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{tmpl.description}</p>
              <button className="btn-secondary text-xs w-full gap-1.5">
                <Download size={12} />
                Gerar PDF
              </button>
            </div>
          );
        })}
      </div>

      <div className="card-base p-8">
        <EmptyState
          icon={BarChart2}
          title="Nenhum relatório gerado ainda"
          description={`Gere o primeiro relatório de ${patientName} usando os modelos acima.`}
        />
      </div>
    </div>
  );
}