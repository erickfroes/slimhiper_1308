'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Loader2,
  LockKeyhole,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  getClinicFinanceM13Dashboard,
  getClinicFinanceOverview,
  getClinicFinanceReconciliation,
  getPaymentReceiptSignedUrl,
  reviewPaymentReceipt,
  syncAsaasPayment,
} from '@/services/billingApi';
import type { ClinicFinanceDivergence } from '@/services/billingApi';
import Dialog from '@/components/ui/Dialog';

type FinanceOverviewResult = Awaited<ReturnType<typeof getClinicFinanceOverview>>['data'];
type FinanceReconciliationResult = Awaited<
  ReturnType<typeof getClinicFinanceReconciliation>
>['data'];
type FinanceM13Result = Awaited<ReturnType<typeof getClinicFinanceM13Dashboard>>['data'];

function brl(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function brlCents(value: number) {
  return brl(value / 100);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.toLowerCase().includes('network')) {
    return 'Nao foi possivel conectar ao financeiro. Tente novamente em instantes.';
  }
  return 'Erro inesperado ao carregar financeiro. Tente novamente sem recarregar a pagina.';
}

function safeServiceMessage(message: string | null | undefined) {
  if (!message) return null;
  const normalized = message.toLowerCase();
  if (
    normalized.includes('permission') ||
    normalized.includes('rls') ||
    normalized.includes('denied')
  ) {
    return 'Seu perfil nao possui permissao para consultar estes dados financeiros.';
  }
  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Nao foi possivel conectar ao financeiro. Tente novamente em instantes.';
  }
  return 'Contrato financeiro indisponivel no momento. Tente novamente ou acione suporte.';
}

function safeEventErrorMessage(message: string | null | undefined) {
  if (!message) return null;
  return 'Falha operacional registrada. Consulte auditoria autorizada para detalhes.';
}

function receiptStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending_review: 'Pendente',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    failed: 'Falhou',
  };
  return map[status] ?? status;
}

function compactDateTime(value: string | null | undefined) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

const chargeStatusLabel = {
  pendente: 'Pendentes',
  pago: 'Pagas',
  vencido: 'Vencidas',
  cancelado: 'Canceladas',
};

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
  const [m13, setM13] = useState<FinanceM13Result>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [m13Error, setM13Error] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewDialog, setReviewDialog] = useState<{
    receiptId: string;
    decision: 'approve' | 'reject';
  } | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const reviewReasonRef = useRef<HTMLTextAreaElement>(null);

  const loadFinanceOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReconciliationError(null);
    setM13Error(null);
    setActionError(null);

    try {
      const [overviewResult, reconciliationResult, m13Result] = await Promise.all([
        getClinicFinanceOverview(),
        getClinicFinanceReconciliation(),
        getClinicFinanceM13Dashboard(),
      ]);
      setData(overviewResult.data);
      setReconciliation(reconciliationResult.data);
      setM13(m13Result.data);
      setError(safeServiceMessage(overviewResult.error?.message) ?? null);
      setReconciliationError(safeServiceMessage(reconciliationResult.error?.message) ?? null);
      setM13Error(safeServiceMessage(m13Result.error?.message) ?? null);
    } catch (requestError) {
      setData(null);
      setReconciliation(null);
      setM13(null);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFinanceOverview();
  }, [loadFinanceOverview]);

  const openPaymentReceipt = async (receiptId: string) => {
    setActionLoading(`open:${receiptId}`);
    setActionError(null);
    const result = await getPaymentReceiptSignedUrl(receiptId);
    setActionLoading(null);
    if (result.error || !result.data?.url) {
      setActionError(result.error?.message ?? 'Nao foi possivel abrir o comprovante.');
      return;
    }
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  };

  const handleReceiptReview = (receiptId: string, decision: 'approve' | 'reject') => {
    setReviewDialog({ receiptId, decision });
    setReviewReason('');
    setReviewError(null);
    setActionMessage(null);
    setActionError(null);
  };

  const submitReceiptReview = async () => {
    if (!reviewDialog) return;
    const reason = reviewReason.trim();
    if (reviewDialog.decision === 'reject' && !reason) {
      setReviewError('Informe o motivo da rejeicao antes de confirmar.');
      reviewReasonRef.current?.focus();
      return;
    }

    setActionLoading(`${reviewDialog.decision}:${reviewDialog.receiptId}`);
    setActionMessage(null);
    setActionError(null);
    setReviewError(null);
    const result = await reviewPaymentReceipt(
      reviewDialog.receiptId,
      reviewDialog.decision,
      reason || undefined
    );
    setActionLoading(null);
    if (result.error) {
      setReviewError(result.error.message);
      return;
    }
    setActionMessage(
      reviewDialog.decision === 'approve'
        ? 'Comprovante aprovado e baixa registrada.'
        : 'Comprovante rejeitado.'
    );
    setReviewDialog(null);
    setReviewReason('');
    await loadFinanceOverview();
  };

  const handleSyncInvoice = async (invoiceId: string | null) => {
    if (!invoiceId) return;
    setActionLoading(`sync:${invoiceId}`);
    setActionMessage(null);
    setActionError(null);
    const result = await syncAsaasPayment(invoiceId, 'manual_clinic_reconciliation');
    setActionLoading(null);
    if (result.error) {
      setActionError(result.error.message);
      return;
    }
    setActionMessage('Sincronizacao solicitada para a cobranca.');
    await loadFinanceOverview();
  };

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
  const chargeStatusSummary = Object.keys(chargeStatusLabel).map((status) => {
    const charges = data.recentCharges.filter((charge) => charge.status === status);
    const total = charges.reduce((sum, charge) => sum + charge.amount, 0);
    return {
      status: status as keyof typeof chargeStatusLabel,
      label: chargeStatusLabel[status as keyof typeof chargeStatusLabel],
      count: charges.length,
      total,
    };
  });
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

      {actionMessage || actionError ? (
        <section
          role={actionError ? 'alert' : 'status'}
          className={`rounded-2xl border p-4 text-sm ${
            actionError
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {actionError ?? actionMessage}
        </section>
      ) : null}

      <section className="bg-card border rounded-2xl p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Cobrancas por status</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Visao operacional calculada sobre as cobrancas recentes retornadas pelo contrato real.
            </p>
          </div>
          <ReceiptText size={18} className="text-muted-foreground" />
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {chargeStatusSummary.map((item) => (
            <article
              key={item.status}
              className={`rounded-lg border p-3 ${chargeStatusClass[item.status]}`}
            >
              <p className="text-xs font-medium">{item.label}</p>
              <p className="mt-1 text-xl font-semibold">{item.count}</p>
              <p className="mt-1 text-xs">{brl(item.total)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-card border rounded-2xl p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Comprovantes, recorrencia e estornos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Fila financeira do M13 com revisao de comprovantes, recorrencias e syncs recentes.
            </p>
          </div>
          <ReceiptText size={18} className="text-muted-foreground" />
        </div>

        {m13Error ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 p-3 text-sm text-red-700"
          >
            <p className="font-semibold">Fila M13 indisponivel</p>
            <p className="mt-1 text-red-600">{m13Error}</p>
          </div>
        ) : m13 ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Comprovantes pendentes</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {m13.receiptQueue.length}
                </span>
              </div>
              {m13.receiptQueue.length === 0 ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  Nenhum comprovante aguardando revisao.
                </p>
              ) : (
                <div className="space-y-2">
                  {m13.receiptQueue.map((receipt) => (
                    <article key={receipt.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{receipt.patientName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {receipt.fileName ?? 'Comprovante'} - {brlCents(receipt.amountCents)} -
                            enviado em {compactDateTime(receipt.uploadedAt ?? receipt.submittedAt)}
                          </p>
                          <span className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                            {receiptStatusLabel(receipt.status)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-secondary inline-flex items-center gap-1 text-xs"
                            disabled={actionLoading === `open:${receipt.id}`}
                            onClick={() => void openPaymentReceipt(receipt.id)}
                          >
                            {actionLoading === `open:${receipt.id}` ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Eye size={13} />
                            )}
                            Abrir
                          </button>
                          <button
                            type="button"
                            className="btn-secondary inline-flex items-center gap-1 text-xs"
                            disabled={actionLoading === `approve:${receipt.id}`}
                            onClick={() => void handleReceiptReview(receipt.id, 'approve')}
                          >
                            <Check size={13} />
                            Aprovar
                          </button>
                          <button
                            type="button"
                            className="btn-secondary inline-flex items-center gap-1 text-xs"
                            disabled={actionLoading === `reject:${receipt.id}`}
                            onClick={() => void handleReceiptReview(receipt.id, 'reject')}
                          >
                            <XCircle size={13} />
                            Rejeitar
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Recorrencia</h3>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Ativas</p>
                    <p className="text-lg font-semibold">{m13.recurrence.active}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Pausadas</p>
                    <p className="text-lg font-semibold">{m13.recurrence.paused}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Canceladas</p>
                    <p className="text-lg font-semibold">{m13.recurrence.cancelled}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {m13.recurrence.upcoming.slice(0, 4).map((subscription) => (
                    <div
                      key={subscription.id}
                      className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground"
                    >
                      <p className="font-semibold text-foreground">{subscription.patientName}</p>
                      <p>
                        {brlCents(subscription.amountCents)} - proxima em{' '}
                        {dateLabel(subscription.nextDueDate)}
                      </p>
                    </div>
                  ))}
                  {m13.recurrence.upcoming.length === 0 ? (
                    <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                      Nenhuma recorrencia proxima encontrada.
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Estornos recentes</h3>
                <div className="mt-2 space-y-2">
                  {m13.refunds.slice(0, 4).map((refund) => (
                    <div key={refund.id} className="rounded-lg border p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-foreground">{refund.patientName}</p>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                          {refund.status}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {brlCents(refund.amountCents)} - {compactDateTime(refund.requestedAt)}
                      </p>
                    </div>
                  ))}
                  {m13.refunds.length === 0 ? (
                    <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                      Nenhum estorno recente.
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Syncs pendentes/recentes</h3>
                <div className="mt-2 space-y-2">
                  {m13.syncJobs.slice(0, 4).map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between gap-2 rounded-lg border p-3 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        {job.reason} - {compactDateTime(job.requestedAt)}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        {job.status}
                      </span>
                    </div>
                  ))}
                  {m13.syncJobs.length === 0 ? (
                    <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                      Nenhum sync pendente.
                    </p>
                  ) : null}
                </div>
              </div>

              {m13.lastRun ? (
                <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  Ultima reconciliacao M13: {m13.lastRun.status}, {m13.lastRun.queuedSyncCount}{' '}
                  syncs enfileirados e {m13.lastRun.pendingReceiptCount} comprovantes pendentes.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Nenhum contrato M13 foi retornado.</p>
        )}
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Operacoes Asaas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Criacao de customer, cobranca e assinatura permanece bloqueada neste painel. As acoes
              mutaveis exigem paciente validado, ambiente sandbox explicitamente autorizado e Edge
              Functions com idempotencia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Acoes Asaas bloqueadas">
            {['Criar customer', 'Gerar cobranca', 'Criar assinatura'].map((label) => (
              <button
                key={label}
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500"
                title="Acao bloqueada fora de fluxo autorizado com paciente validado."
              >
                <LockKeyhole size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
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
                        {divergence.invoiceId ? (
                          <>
                            <span>Acao</span>
                            <button
                              type="button"
                              className="inline-flex w-fit items-center gap-1 text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={actionLoading === `sync:${divergence.invoiceId}`}
                              onClick={() => void handleSyncInvoice(divergence.invoiceId)}
                            >
                              {actionLoading === `sync:${divergence.invoiceId}` ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <RefreshCcw size={12} />
                              )}
                              Sincronizar
                            </button>
                          </>
                        ) : null}
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
                          <span className="text-red-600">
                            {' '}
                            - {safeEventErrorMessage(event.errorMessage)}
                          </span>
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

      <Dialog
        open={reviewDialog !== null}
        title={reviewDialog?.decision === 'reject' ? 'Rejeitar comprovante' : 'Aprovar comprovante'}
        description={
          reviewDialog?.decision === 'reject'
            ? 'Registre um motivo claro para auditoria e retorno ao paciente.'
            : 'Adicione uma observacao opcional antes de registrar a baixa.'
        }
        onOpenChange={(open) => {
          if (open) return;
          setReviewDialog(null);
          setReviewReason('');
          setReviewError(null);
        }}
        initialFocusRef={reviewReasonRef}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary justify-center"
              disabled={actionLoading?.startsWith(`${reviewDialog?.decision}:`) ?? false}
              onClick={() => {
                setReviewDialog(null);
                setReviewReason('');
                setReviewError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
              disabled={actionLoading?.startsWith(`${reviewDialog?.decision}:`) ?? false}
              onClick={() => void submitReceiptReview()}
            >
              {actionLoading?.startsWith(`${reviewDialog?.decision}:`)
                ? 'Registrando...'
                : 'Confirmar'}
            </button>
          </div>
        }
      >
        <label className="block text-sm font-medium text-foreground">
          Observacao
          <textarea
            ref={reviewReasonRef}
            value={reviewReason}
            onChange={(event) => {
              setReviewReason(event.target.value);
              if (reviewError) setReviewError(null);
            }}
            rows={4}
            maxLength={500}
            placeholder={
              reviewDialog?.decision === 'reject' ? 'Motivo da rejeicao' : 'Observacao opcional'
            }
            className="mt-2 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        {reviewError ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {reviewError}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
