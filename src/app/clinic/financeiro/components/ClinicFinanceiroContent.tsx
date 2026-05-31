'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import { getClinicFinanceOverview, getClinicFinanceReconciliation } from '@/services/billingApi';
import type { ClinicFinanceDivergence } from '@/services/billingApi';

type FinanceOverviewResult = Awaited<ReturnType<typeof getClinicFinanceOverview>>['data'];
type FinanceReconciliationResult = Awaited<
  ReturnType<typeof getClinicFinanceReconciliation>
>['data'];

function brl(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Erro inesperado ao carregar financeiro.';
}

const chargeStatusClass = {
  pendente: 'border-amber-200 bg-amber-50 text-amber-700',
  pago: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  vencido: 'border-red-200 bg-red-50 text-red-700',
  cancelado: 'border-slate-200 bg-slate-50 text-slate-600',
};

const eventStatusClass = {
  received: 'border-blue-200 bg-blue-50 text-blue-700',
  processed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  ignored: 'border-amber-200 bg-amber-50 text-amber-700',
};

const severityClass = {
  high: 'border-red-200 bg-red-50 text-red-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-slate-200 bg-slate-50 text-slate-600',
};

const divergenceLabels: Record<ClinicFinanceDivergence['kind'], string> = {
  amount_mismatch: 'Valor divergente',
  paid_invoice_without_paid_payment: 'Cobranca sem pagamento pago',
  paid_payment_unpaid_invoice: 'Pagamento pago sem baixa',
  overdue_invoice_without_overdue_payment: 'Vencimento sem reflexo',
  orphan_payment: 'Pagamento sem vinculo',
  webhook_unresolved: 'Webhook pendente',
};

function AmountPair({ divergence }: { divergence: ClinicFinanceDivergence }) {
  if (divergence.expectedAmount === null && divergence.actualAmount === null) {
    return <span className="text-muted-foreground">Sem valor</span>;
  }

  return (
    <span>
      {divergence.expectedAmount !== null ? brl(divergence.expectedAmount) : 'Sem esperado'}
      <span className="mx-1 text-muted-foreground">/</span>
      {divergence.actualAmount !== null ? brl(divergence.actualAmount) : 'Sem atual'}
    </span>
  );
}

export default function ClinicFinanceiroContent() {
  const [data, setData] = useState<FinanceOverviewResult>(null);
  const [reconciliation, setReconciliation] = useState<FinanceReconciliationResult>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);

  const loadFinanceOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReconciliationError(null);

    try {
      const [overviewResult, reconciliationResult] = await Promise.all([
        getClinicFinanceOverview(),
        getClinicFinanceReconciliation(),
      ]);
      setData(overviewResult.data);
      setReconciliation(reconciliationResult.data);
      setError(overviewResult.error?.message ?? null);
      setReconciliationError(reconciliationResult.error?.message ?? null);
    } catch (requestError) {
      setData(null);
      setReconciliation(null);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
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
  const reconciliationCards = reconciliation
    ? [
        {
          label: 'Divergencias',
          value: String(reconciliation.summary.divergences),
          hint: `${reconciliation.summary.highSeverity} criticas`,
        },
        {
          label: 'Webhooks falhos',
          value: String(reconciliation.summary.failedWebhookEvents),
          hint: `${reconciliation.summary.mediumSeverity} medias`,
        },
        {
          label: 'Pendentes',
          value: String(reconciliation.summary.pendingInvoices),
          hint: 'cobrancas abertas',
        },
        {
          label: 'Sem vinculo',
          value: String(reconciliation.summary.unmatchedPayments),
          hint: `${reconciliation.summary.overdueInvoices} vencidas`,
        },
      ]
    : [];
  const hasDivergences = (reconciliation?.divergences.length ?? 0) > 0;
  const hasRecentEvents = (reconciliation?.recentEvents.length ?? 0) > 0;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <section className="bg-card border border-border rounded-2xl p-5 lg:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Financeiro da Clinica</h1>
            {reconciliation?.summary.lastCheckedAt ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Conciliacao atualizada em {dateLabel(reconciliation.summary.lastCheckedAt)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void loadFinanceOverview()}
            className="btn-secondary inline-flex items-center gap-2 text-xs"
          >
            <RefreshCcw size={14} />
            Atualizar
          </button>
        </div>
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
              <div
                key={charge.id}
                className="text-sm border rounded-lg p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="font-medium">{charge.patientName}</span>
                  <span className="text-muted-foreground"> - {charge.description}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{brl(charge.amount)}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${chargeStatusClass[charge.status]}`}
                  >
                    {charge.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{dateLabel(charge.dueDate)}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma cobranca recente encontrada para o tenant ativo.
          </p>
        )}
      </section>

      <section className="bg-card border rounded-2xl p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Conciliacao e divergencias</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Conferencia local entre cobrancas, pagamentos e eventos Asaas.
            </p>
          </div>
          <ReceiptText size={18} className="text-muted-foreground" />
        </div>

        {reconciliationError ? (
          <div
            role="alert"
            className="mt-4 border border-red-200 rounded-lg p-3 text-sm text-red-700"
          >
            <p className="font-semibold">Conciliacao indisponivel</p>
            <p className="mt-1 text-red-600">{reconciliationError}</p>
          </div>
        ) : reconciliation ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {reconciliationCards.map((card) => (
                <article key={card.label} className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="mt-1 text-xl font-semibold">{card.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                </article>
              ))}
            </div>

            {hasDivergences ? (
              <div className="space-y-2">
                {reconciliation.divergences.map((divergence) => (
                  <article key={divergence.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs ${severityClass[divergence.severity]}`}
                          >
                            {divergence.severity}
                          </span>
                          <p className="font-semibold">
                            {divergenceLabels[divergence.kind]} - {divergence.patientName}
                          </p>
                        </div>
                        <p className="mt-2 text-muted-foreground">{divergence.description}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:min-w-72">
                        <span>Esperado</span>
                        <span className="text-foreground">{divergence.expectedStatus ?? '-'}</span>
                        <span>Atual</span>
                        <span className="text-foreground">{divergence.actualStatus ?? '-'}</span>
                        <span>Valor</span>
                        <span className="text-foreground">
                          <AmountPair divergence={divergence} />
                        </span>
                        <span>Vencimento</span>
                        <span className="text-foreground">{dateLabel(divergence.dueDate)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 text-sm text-emerald-700 flex items-start gap-3">
                <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Nenhuma divergencia encontrada</p>
                  <p className="mt-1 text-emerald-700">
                    O tenant ativo nao possui inconsistencias locais de cobranca, pagamento ou
                    evento.
                  </p>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold">Eventos Asaas recentes</h3>
              {hasRecentEvents ? (
                <div className="mt-2 space-y-2">
                  {reconciliation.recentEvents.map((event) => (
                    <div
                      key={event.id}
                      className="border rounded-lg p-3 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{event.eventType}</span>
                        {event.errorMessage ? (
                          <span className="text-red-600"> - {event.errorMessage}</span>
                        ) : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${eventStatusClass[event.status]}`}
                        >
                          {event.status}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {dateLabel(event.createdAt)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhum evento Asaas recente encontrado para o tenant ativo.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhum contrato de conciliacao foi retornado.
          </p>
        )}
      </section>
    </div>
  );
}
