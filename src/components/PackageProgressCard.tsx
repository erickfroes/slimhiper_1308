import React from 'react';
import { Package, Calendar } from 'lucide-react';
import type { PatientPackageSummary } from '@/domain/types';
import StatusBadge from './StatusBadge';

interface PackageProgressCardProps {
  pkg: PatientPackageSummary;
}

const programTypeLabel: Record<string, string> = {
  emagrecimento: 'Emagrecimento',
  hipertrofia: 'Hipertrofia',
  recomposicao: 'Recomposição',
  saude_metabolica: 'Saúde Metabólica',
  longevidade: 'Longevidade',
};

export default function PackageProgressCard({ pkg }: PackageProgressCardProps) {
  const weekPercent = Math.round((pkg.currentWeek / pkg.totalWeeks) * 100);
  const consultPercent = Math.round((pkg.usedConsultations / pkg.totalConsultations) * 100);
  const nutriPercent = Math.round((pkg.usedNutritionSessions / pkg.totalNutritionSessions) * 100);

  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{pkg.programName}</p>
            <p className="text-xs text-muted-foreground">{programTypeLabel[pkg.programType]}</p>
          </div>
        </div>
        <StatusBadge status={pkg.status} />
      </div>

      {/* Week progress */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">Progresso semanal</span>
          <span className="font-semibold text-primary">
            Sem {pkg.currentWeek}/{pkg.totalWeeks}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-primary rounded-full h-2 transition-all"
            style={{ width: `${weekPercent}%` }}
          />
        </div>
      </div>

      {/* Consultation usage */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">Consultas médicas</span>
          <span className="font-medium text-foreground">
            {pkg.usedConsultations}/{pkg.totalConsultations}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div className="bg-teal-400 rounded-full h-1.5" style={{ width: `${consultPercent}%` }} />
        </div>
      </div>

      {/* Nutrition sessions */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">Sessões de nutrição</span>
          <span className="font-medium text-foreground">
            {pkg.usedNutritionSessions}/{pkg.totalNutritionSessions}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className="bg-emerald-400 rounded-full h-1.5"
            style={{ width: `${nutriPercent}%` }}
          />
        </div>
      </div>

      {/* Dates */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
        <Calendar size={12} />
        <span>
          {pkg.startDate} → {pkg.endDate}
        </span>
      </div>
    </div>
  );
}
