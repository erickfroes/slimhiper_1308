'use client';

import React from 'react';
import type { PatientFinancialSummary } from '@/domain/types';
import FinancialStatusCard from '@/components/FinancialStatusCard';
import StatusBadge from '@/components/StatusBadge';
import { CreditCard } from 'lucide-react';

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface TabFinanceiroProps {
  financial: PatientFinancialSummary;
}

export default function TabFinanceiro({ financial }: TabFinanceiroProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <FinancialStatusCard financial={financial} />

        {/* Summary stats */}
        <div className="card-base p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Resumo Financeiro</p>
          <div className="space-y-3">
            {[
              { label: 'Valor total do contrato', value: financial.totalContractValue, color: 'text-foreground' },
              { label: 'Total pago', value: financial.totalPaid, color: 'text-positive' },
              { label: 'Pendente', value: financial.totalPending, color: 'text-amber-600' },
              { label: 'Em atraso', value: financial.totalOverdue, color: financial.totalOverdue > 0 ? 'text-negative' : 'text-muted-foreground' },
            ].map((item) => (
              <div key={`fin-row-${item.label}`} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className={['text-sm font-bold tabular-nums', item.color].join(' ')}>{formatBRL(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Invoice list */}
      <div className="card-base overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Faturas ({financial.invoices.length})</p>
          <button className="btn-secondary text-xs">
            <CreditCard size={13} />
            Gerar Cobrança
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descrição</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valor</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vencimento</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pago em</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {financial.invoices.map((inv, i) => (
              <tr key={inv.id} className={['border-b border-border last:border-0 hover:bg-muted/30 transition-colors', i % 2 === 1 ? 'bg-muted/10' : ''].join(' ')}>
                <td className="px-4 py-3 text-sm text-foreground">{inv.description}</td>
                <td className="px-4 py-3 text-sm font-semibold text-foreground tabular-nums">{formatBRL(inv.amount)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{inv.dueDate}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{inv.paidAt ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={inv.status} size="xs" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}