'use client';

import React from 'react';
import type { PatientNutritionPlanSummary } from '@/domain/types';
import { Flame, Beef, Wheat, Droplets } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface TabNutricaoProps {
  plan: PatientNutritionPlanSummary;
}

function MacroBar({ label, value, max, color, icon: Icon }: { label: string; value: number; max: number; color: string; icon: React.ElementType }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="card-base p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={['w-8 h-8 rounded-xl flex items-center justify-center', color.replace('text-', 'bg-').replace('-600', '-50')].join(' ')}>
          <Icon size={15} className={color} />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{value}g por dia</p>
        </div>
        <span className={['ml-auto text-sm font-bold tabular-nums', color].join(' ')}>{value}g</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div className={['rounded-full h-2 transition-all', color.replace('text-', 'bg-')].join(' ')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function TabNutricao({ plan }: TabNutricaoProps) {
  return (
    <div className="space-y-5">
      <div className="card-base p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-base font-bold text-foreground">{plan.planName}</p>
            <p className="text-sm text-muted-foreground">Nutricionista: {plan.nutritionistName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Criado em {plan.createdAt} · Atualizado em {plan.updatedAt}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
              Plano ativo
            </span>
            {plan.adherencePercent && (
              <span className="text-xs text-muted-foreground">Adesão: {plan.adherencePercent}%</span>
            )}
          </div>
        </div>

        {/* Calorie hero */}
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Flame size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{plan.targetCalories} kcal</p>
            <p className="text-xs text-muted-foreground">Meta calórica diária</p>
          </div>
        </div>

        {/* Macros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MacroBar label="Proteína" value={plan.targetProteinG} max={200} color="text-red-600" icon={Beef} />
          <MacroBar label="Carboidratos" value={plan.targetCarbsG} max={300} color="text-amber-600" icon={Wheat} />
          <MacroBar label="Gorduras" value={plan.targetFatG} max={100} color="text-blue-600" icon={Droplets} />
        </div>
      </div>

      {/* Macro distribution */}
      <div className="card-base p-5">
        <p className="text-sm font-semibold text-foreground mb-3">Distribuição de Macros</p>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-4 rounded-full overflow-hidden flex">
            <div
              className="bg-red-400 h-full transition-all"
              style={{ width: `${Math.round((plan.targetProteinG * 4 / plan.targetCalories) * 100)}%` }}
            />
            <div
              className="bg-amber-400 h-full transition-all"
              style={{ width: `${Math.round((plan.targetCarbsG * 4 / plan.targetCalories) * 100)}%` }}
            />
            <div
              className="bg-blue-400 h-full transition-all"
              style={{ width: `${Math.round((plan.targetFatG * 9 / plan.targetCalories) * 100)}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Proteína {Math.round((plan.targetProteinG * 4 / plan.targetCalories) * 100)}%</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Carbos {Math.round((plan.targetCarbsG * 4 / plan.targetCalories) * 100)}%</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />Gorduras {Math.round((plan.targetFatG * 9 / plan.targetCalories) * 100)}%</span>
        </div>
      </div>
    </div>
  );
}