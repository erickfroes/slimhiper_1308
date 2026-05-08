import React from 'react';
import { CreditCard, AlertCircle, CheckCircle } from 'lucide-react';
import type { PatientFinancialSummary } from '@/domain/types';
import StatusBadge from './StatusBadge';

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface FinancialStatusCardProps {
  financial: PatientFinancialSummary;
}

export default function FinancialStatusCard({ financial }: FinancialStatusCardProps) {
  const paidPercent = Math.round((financial.totalPaid / financial.totalContractValue) * 100);

  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <CreditCard size={16} className="text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">Status Financeiro</span>
        </div>
        <StatusBadge status={financial.status} />
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>Pago</span>
          <span>
            {paidPercent}% — {formatBRL(financial.totalPaid)} de{' '}
            {formatBRL(financial.totalContractValue)}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-positive rounded-full h-2 transition-all duration-500"
            style={{ width: `${paidPercent}%` }}
          />
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-muted rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Valor total</p>
          <p className="text-base font-bold text-foreground tabular-nums">
            {formatBRL(financial.totalContractValue)}
          </p>
        </div>
        <div className="bg-muted rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Pendente</p>
          <p className="text-base font-bold text-foreground tabular-nums">
            {formatBRL(financial.totalPending)}
          </p>
        </div>
      </div>

      {/* Next due */}
      {financial.nextDueDate && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
          <AlertCircle size={13} />
          <span>
            Próx. vencimento: <strong>{financial.nextDueDate}</strong> —{' '}
            {formatBRL(financial.nextDueAmount ?? 0)}
          </span>
        </div>
      )}

      {/* Last payment */}
      {financial.lastPaymentDate && (
        <div className="flex items-center gap-2 mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
          <CheckCircle size={13} />
          <span>
            Último pagamento: <strong>{financial.lastPaymentDate}</strong> —{' '}
            {formatBRL(financial.lastPaymentAmount ?? 0)}
          </span>
        </div>
      )}
    </div>
  );
}
