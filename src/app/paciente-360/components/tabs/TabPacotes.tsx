'use client';

import React from 'react';
import type { PatientPackageSummary } from '@/domain/types';
import PackageProgressCard from '@/components/PackageProgressCard';
import { Package } from 'lucide-react';

interface TabPacotesProps {
  pkg: PatientPackageSummary;
}

export default function TabPacotes({ pkg }: TabPacotesProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Pacotes do Paciente</p>
        <button className="btn-secondary text-xs">
          <Package size={13} />
          Adicionar Pacote
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PackageProgressCard pkg={pkg} />

        {/* Package detail card */}
        <div className="card-base p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Uso de Sessões</p>
          <div className="space-y-4">
            {[
              {
                key: 'sess-consultas',
                label: 'Consultas Médicas',
                used: pkg.usedConsultations,
                total: pkg.totalConsultations,
                color: 'bg-teal-500',
              },
              {
                key: 'sess-nutricao',
                label: 'Sessões de Nutrição',
                used: pkg.usedNutritionSessions,
                total: pkg.totalNutritionSessions,
                color: 'bg-emerald-500',
              },
            ].map((item) => (
              <div key={item.key}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground font-medium">{item.label}</span>
                  <span className="font-semibold text-foreground tabular-nums">{item.used}/{item.total} utilizadas</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3 relative overflow-hidden">
                  <div
                    className={['rounded-full h-3 transition-all', item.color].join(' ')}
                    style={{ width: `${Math.round((item.used / item.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{item.total - item.used} restantes</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}