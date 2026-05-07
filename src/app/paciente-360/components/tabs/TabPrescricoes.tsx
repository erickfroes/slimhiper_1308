'use client';

import React from 'react';
import type { PatientPrescriptionSummary } from '@/domain/types';
import { Pill, Plus, Calendar, User } from 'lucide-react';
import EmptyState from '@/components/EmptyState';

interface TabPrescricoesProps {
  prescriptions: PatientPrescriptionSummary[];
}

export default function TabPrescricoes({ prescriptions }: TabPrescricoesProps) {
  const active = prescriptions.filter((p) => p.isActive);
  const inactive = prescriptions.filter((p) => !p.isActive);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Prescrições Ativas ({active.length})</p>
        <button className="btn-primary text-xs">
          <Plus size={13} />
          Nova Prescrição
        </button>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={Pill}
          title="Nenhuma prescrição ativa"
          description="Prescrições de medicamentos e suplementos aparecerão aqui."
          action={<button className="btn-primary text-sm"><Plus size={14} /> Nova Prescrição</button>}
        />
      ) : (
        <div className="space-y-3">
          {active.map((presc) => (
            <div key={presc.id} className="card-base p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <Pill size={16} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-foreground">{presc.medicationName}</p>
                    <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium">Ativo</span>
                  </div>
                  <p className="text-sm text-foreground mt-0.5">{presc.dosage} · {presc.frequency}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar size={11} />Início: {presc.startDate}</span>
                    <span className="flex items-center gap-1"><User size={11} />{presc.prescribedBy}</span>
                  </div>
                  {presc.notes && <p className="text-xs text-muted-foreground mt-1.5 italic">{presc.notes}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <>
          <p className="text-sm font-semibold text-muted-foreground mt-2">Encerradas ({inactive.length})</p>
          <div className="space-y-2 opacity-60">
            {inactive.map((presc) => (
              <div key={presc.id} className="card-base p-3 flex items-center gap-3">
                <Pill size={14} className="text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-muted-foreground">{presc.medicationName} — {presc.dosage}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}