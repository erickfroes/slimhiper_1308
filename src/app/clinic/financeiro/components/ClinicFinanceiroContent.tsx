'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDollarSign } from 'lucide-react';
import { getClinicFinanceOverview } from '@/services/billingApi';

type FinanceOverviewResult = Awaited<ReturnType<typeof getClinicFinanceOverview>>['data'];

function brl(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function ClinicFinanceiroContent() {
  const [data, setData] = useState<FinanceOverviewResult>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFinanceOverview = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await getClinicFinanceOverview();
    setData(result.data);
    setError(result.error?.message ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFinanceOverview();
  }, [loadFinanceOverview]);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <section className="bg-card border border-border rounded-2xl p-5 lg:p-6">
          <h1 className="text-2xl font-bold text-foreground">Financeiro da Clinica</h1>
        </section>
        <section className="bg-card border border-border rounded-2xl p-5 text-sm text-muted-foreground">
          Carregando financeiro da clinica...
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <section className="bg-card border border-border rounded-2xl p-5 lg:p-6">
          <h1 className="text-2xl font-bold text-foreground">Financeiro da Clinica</h1>
        </section>
        <section
          role="alert"
          className="bg-card border border-red-200 rounded-2xl p-5 text-sm text-red-700"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Financeiro indisponivel</p>
              <p className="mt-1 text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => void loadFinanceOverview()}
                className="btn-secondary mt-4 text-xs"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <section className="bg-card border border-border rounded-2xl p-5 lg:p-6">
          <h1 className="text-2xl font-bold text-foreground">Financeiro da Clinica</h1>
        </section>
        <section className="bg-card border border-border rounded-2xl p-5 text-sm text-muted-foreground">
          Nenhum resumo financeiro foi retornado.
        </section>
      </div>
    );
  }

  const metrics = [
    {
      label: 'Receita do mes',
      value: brl(data.metrics.monthlyRevenue),
      icon: CircleDollarSign,
    },
    {
      label: 'Recebimentos pendentes',
      value: brl(data.metrics.pendingReceivables),
      icon: CalendarClock,
    },
    {
      label: 'Cobrancas vencidas',
      value: brl(data.metrics.overdueReceivables),
      icon: AlertTriangle,
    },
    {
      label: 'Assinaturas/pacotes ativos',
      value: String(data.metrics.activeSubscriptionsAndPackages),
      icon: CheckCircle2,
    },
  ];
  const hasRecentCharges = data.recentCharges.length > 0;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <section className="bg-card border border-border rounded-2xl p-5 lg:p-6">
        <h1 className="text-2xl font-bold text-foreground">Financeiro da Clinica</h1>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon size={16} />
                <p>{metric.label}</p>
              </div>
              <p className="text-2xl font-semibold mt-2">{metric.value}</p>
            </article>
          );
        })}
      </section>

      <section className="bg-card border rounded-2xl p-5">
        <h2 className="text-base font-semibold">Cobrancas recentes</h2>
        {hasRecentCharges ? (
          <div className="mt-3 space-y-2">
            {data.recentCharges.map((charge) => (
              <div key={charge.id} className="text-sm border rounded-lg p-3 flex justify-between">
                <span>
                  {charge.patientName} - {charge.description}
                </span>
                <span className="font-medium">{brl(charge.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma cobranca recente encontrada para o tenant ativo.
          </p>
        )}
      </section>
    </div>
  );
}
