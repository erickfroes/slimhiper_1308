'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CreditCard, ExternalLink, RefreshCw, ShieldCheck, Webhook } from 'lucide-react';
import DataState from '@/components/ui/DataState';
import MetricCard from '@/components/ui/MetricCard';
import {
  configurePlatformMercadoPago,
  getPlatformBillingSnapshot,
  managePlatformTenantSubscription,
  runPlatformBillingAction,
  syncPlatformPlanPrice,
  type PlatformBillingEnvironment,
  type PlatformBillingSnapshot,
} from '@/services/platformBillingApi';

function money(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function date(value: string | null) {
  if (!value) return 'N/D';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'N/D'
    : parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusClass(status: string) {
  if (['active', 'processed', 'authorized'].includes(status))
    return 'bg-emerald-100 text-emerald-800';
  if (['error', 'failed', 'dead_letter', 'past_due'].includes(status))
    return 'bg-red-100 text-red-800';
  if (['pending_authorization', 'trialing', 'grace', 'retryable_failed'].includes(status)) {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-slate-100 text-slate-700';
}

function Status({ value }: { value: string | null | undefined }) {
  const normalized = value || 'not_configured';
  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClass(normalized)}`}>
      {normalized}
    </span>
  );
}

export default function PlatformBillingMercadoPagoPanel({
  canMutate,
  canConfigureCredentials,
}: {
  canMutate: boolean;
  canConfigureCredentials: boolean;
}) {
  const [environment, setEnvironment] = useState<PlatformBillingEnvironment>('production');
  const [snapshot, setSnapshot] = useState<PlatformBillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState({
    applicationId: '',
    accessToken: '',
    webhookSecret: '',
    reason: '',
  });
  const [reason, setReason] = useState(
    'Operacao financeira autorizada pelo administrador da plataforma.'
  );
  const [payerEmails, setPayerEmails] = useState<Record<string, string>>({});
  const [priceRules, setPriceRules] = useState<
    Record<string, { trialDays: number; graceDays: number }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getPlatformBillingSnapshot(environment);
    setLoading(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? 'Controle financeiro indisponivel.');
      setSnapshot(null);
      return;
    }
    setSnapshot(result.data);
    setPriceRules(
      Object.fromEntries(
        result.data.prices.map((price) => [
          price.id,
          { trialDays: price.trialDays, graceDays: price.graceDays },
        ])
      )
    );
  }, [environment]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentPrices = useMemo(
    () => snapshot?.prices.filter((price) => price.isCurrent) ?? [],
    [snapshot]
  );

  const run = async (
    key: string,
    operation: () => Promise<{ error: { message: string } | null }>,
    success: string
  ) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    const result = await operation();
    setBusy(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setNotice(success);
    await load();
  };

  if (loading && !snapshot)
    return (
      <DataState
        kind="loading"
        title="Carregando Mercado Pago"
        description="Consultando configuracao e ledger SaaS."
      />
    );

  return (
    <div className="space-y-5">
      {error ? (
        <DataState
          kind="error"
          title="Falha no controle Mercado Pago"
          description={error}
          actionLabel="Tentar novamente"
          onAction={() => void load()}
        />
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="card-base p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Mercado Pago da plataforma</h2>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              Conta exclusiva da SlimHiper para cobrar tenants. Tokens ficam criptografados e nunca
              retornam ao navegador.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={environment}
              onChange={(event) => setEnvironment(event.target.value as PlatformBillingEnvironment)}
              className="input-base py-2 text-xs"
            >
              <option value="production">Producao</option>
              <option value="test">Teste</option>
            </select>
            <button
              type="button"
              onClick={() => setShowCredentials((value) => !value)}
              disabled={!canConfigureCredentials}
              className="btn-secondary text-xs disabled:opacity-50"
            >
              <ShieldCheck size={14} />{' '}
              {snapshot?.connection ? 'Rotacionar credenciais' : 'Configurar conta'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="mt-2">
              <Status value={snapshot?.connection?.status} />
            </div>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">Conta</p>
            <p className="mt-2 text-sm font-semibold">
              {snapshot?.connection?.providerUserId || 'Nao validada'}
            </p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">Ultimo webhook</p>
            <p className="mt-2 text-sm font-semibold">
              {date(snapshot?.connection?.lastWebhookAt ?? null)}
            </p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">Ultima conciliacao</p>
            <p className="mt-2 text-sm font-semibold">
              {date(snapshot?.connection?.lastReconciledAt ?? null)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canMutate || busy !== null || !snapshot?.connection}
            onClick={() =>
              void run(
                'test',
                () => runPlatformBillingAction({ action: 'test', environment, reason }),
                'Conexao validada no Mercado Pago.'
              )
            }
            className="btn-secondary text-xs disabled:opacity-50"
          >
            <Activity size={14} /> Testar conexao
          </button>
          <button
            type="button"
            disabled={!canMutate || busy !== null || !snapshot?.connection}
            onClick={() =>
              void run(
                'reconcile',
                () => runPlatformBillingAction({ action: 'reconcile', environment, reason }),
                'Ciclo financeiro reconciliado.'
              )
            }
            className="btn-secondary text-xs disabled:opacity-50"
          >
            <RefreshCw size={14} className={busy === 'reconcile' ? 'animate-spin' : ''} />{' '}
            Reconciliar agora
          </button>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="input-base min-w-[280px] flex-1 py-2 text-xs"
            aria-label="Motivo auditavel"
          />
        </div>

        {showCredentials ? (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 md:grid-cols-2">
            <label className="text-xs font-semibold">
              Application ID
              <input
                value={credentials.applicationId}
                onChange={(event) =>
                  setCredentials((value) => ({ ...value, applicationId: event.target.value }))
                }
                className="input-base mt-1 text-sm"
              />
            </label>
            <label className="text-xs font-semibold">
              Motivo auditavel
              <input
                value={credentials.reason}
                onChange={(event) =>
                  setCredentials((value) => ({ ...value, reason: event.target.value }))
                }
                className="input-base mt-1 text-sm"
              />
            </label>
            <label className="text-xs font-semibold">
              Access token
              <input
                type="password"
                autoComplete="off"
                value={credentials.accessToken}
                onChange={(event) =>
                  setCredentials((value) => ({ ...value, accessToken: event.target.value }))
                }
                className="input-base mt-1 text-sm"
              />
            </label>
            <label className="text-xs font-semibold">
              Webhook secret
              <input
                type="password"
                autoComplete="off"
                value={credentials.webhookSecret}
                onChange={(event) =>
                  setCredentials((value) => ({ ...value, webhookSecret: event.target.value }))
                }
                className="input-base mt-1 text-sm"
              />
            </label>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="button"
                disabled={
                  !canConfigureCredentials ||
                  busy !== null ||
                  credentials.reason.trim().length < 16 ||
                  credentials.accessToken.length < 24 ||
                  credentials.webhookSecret.length < 24
                }
                onClick={() =>
                  void run(
                    'configure',
                    () => configurePlatformMercadoPago({ environment, ...credentials }),
                    'Conta configurada e validada.'
                  )
                }
                className="btn-primary text-xs disabled:opacity-50"
              >
                Salvar e validar
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {snapshot ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricCard
            icon={CreditCard}
            label="MRR normalizado"
            value={money(snapshot.metrics.normalizedMrrCents)}
            tone="success"
          />
          <MetricCard
            icon={Activity}
            label="Assinaturas ativas"
            value={snapshot.metrics.activeSubscriptions}
            tone="success"
          />
          <MetricCard icon={RefreshCw} label="Trials" value={snapshot.metrics.trials} tone="info" />
          <MetricCard
            icon={Webhook}
            label="Caixa recebido no mes"
            value={money(snapshot.metrics.cashReceivedThisMonthCents)}
            tone="default"
          />
        </div>
      ) : null}

      <div className="card-base overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold">Versoes comerciais e sincronizacao</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada alteracao de preco cria uma versao; contratos existentes mantem a versao original.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                {['Plano', 'Preco', 'Ciclo', 'Trial', 'Grace', 'Mercado Pago', 'Acao'].map(
                  (item) => (
                    <th key={item} className="px-4 py-3 text-left">
                      {item}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {currentPrices.map((price) => {
                const rules = priceRules[price.id] ?? {
                  trialDays: price.trialDays,
                  graceDays: price.graceDays,
                };
                return (
                  <tr key={price.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{price.planName}</p>
                      <p className="font-mono text-muted-foreground">
                        {price.planCode} v{price.version}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-semibold">{money(price.amountCents)}</td>
                    <td className="px-4 py-3">{price.billingCycle}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={rules.trialDays}
                        onChange={(event) =>
                          setPriceRules((value) => ({
                            ...value,
                            [price.id]: { ...rules, trialDays: Number(event.target.value) },
                          }))
                        }
                        className="input-base w-20 py-1 text-xs"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        max={90}
                        value={rules.graceDays}
                        onChange={(event) =>
                          setPriceRules((value) => ({
                            ...value,
                            [price.id]: { ...rules, graceDays: Number(event.target.value) },
                          }))
                        }
                        className="input-base w-20 py-1 text-xs"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Status value={price.providerStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={
                          !canMutate || busy !== null || snapshot?.connection?.status !== 'active'
                        }
                        onClick={() =>
                          void run(
                            `price:${price.id}`,
                            () =>
                              syncPlatformPlanPrice({
                                priceId: price.id,
                                environment,
                                trialDays: rules.trialDays,
                                graceDays: rules.graceDays,
                                reason,
                              }),
                            'Versao sincronizada no Mercado Pago.'
                          )
                        }
                        className="text-xs font-semibold text-primary disabled:opacity-40"
                      >
                        Sincronizar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {currentPrices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma versao de preco disponivel.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold">Assinaturas dos tenants</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Crie o checkout, acompanhe o provider e execute operacoes auditadas.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-xs">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                {[
                  'Tenant',
                  'Plano',
                  'Status',
                  'Pagador',
                  'Proxima cobranca',
                  'Checkout',
                  'Acoes',
                ].map((item) => (
                  <th key={item} className="px-4 py-3 text-left">
                    {item}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(snapshot?.subscriptions ?? []).map((subscription) => (
                <tr key={subscription.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{subscription.tenantName}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {subscription.tenantId}
                    </p>
                  </td>
                  <td className="px-4 py-3">{subscription.planName}</td>
                  <td className="px-4 py-3">
                    <Status value={subscription.status} />
                  </td>
                  <td className="px-4 py-3">
                    {subscription.providerSubscriptionId ? (
                      subscription.payerEmailMasked || 'Configurado'
                    ) : (
                      <input
                        type="email"
                        value={payerEmails[subscription.tenantId] ?? ''}
                        onChange={(event) =>
                          setPayerEmails((value) => ({
                            ...value,
                            [subscription.tenantId]: event.target.value,
                          }))
                        }
                        placeholder="financeiro@clinica.com"
                        className="input-base min-w-52 py-1 text-xs"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">{date(subscription.nextPaymentAt)}</td>
                  <td className="px-4 py-3">
                    {subscription.checkoutUrl ? (
                      <a
                        href={subscription.checkoutUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-primary"
                      >
                        Abrir <ExternalLink size={12} />
                      </a>
                    ) : (
                      'N/D'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {!subscription.providerSubscriptionId ? (
                        <button
                          type="button"
                          disabled={
                            !canMutate || busy !== null || !payerEmails[subscription.tenantId]
                          }
                          onClick={() =>
                            void run(
                              `create:${subscription.id}`,
                              () =>
                                managePlatformTenantSubscription({
                                  action: 'create',
                                  tenantId: subscription.tenantId,
                                  priceId: subscription.priceId,
                                  payerEmail: payerEmails[subscription.tenantId],
                                  environment,
                                  reason,
                                }),
                              'Checkout de assinatura criado.'
                            )
                          }
                          className="font-semibold text-primary disabled:opacity-40"
                        >
                          Criar checkout
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={!canMutate || busy !== null}
                            onClick={() =>
                              void run(
                                `sync:${subscription.id}`,
                                () =>
                                  managePlatformTenantSubscription({
                                    action: 'sync',
                                    tenantId: subscription.tenantId,
                                    environment,
                                    reason,
                                  }),
                                'Assinatura sincronizada.'
                              )
                            }
                            className="font-semibold text-primary"
                          >
                            Sincronizar
                          </button>
                          {subscription.status === 'paused' ? (
                            <button
                              type="button"
                              disabled={!canMutate || busy !== null}
                              onClick={() =>
                                void run(
                                  `reactivate:${subscription.id}`,
                                  () =>
                                    managePlatformTenantSubscription({
                                      action: 'reactivate',
                                      tenantId: subscription.tenantId,
                                      environment,
                                      reason,
                                    }),
                                  'Assinatura reativada.'
                                )
                              }
                              className="font-semibold text-emerald-700"
                            >
                              Reativar
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!canMutate || busy !== null}
                              onClick={() =>
                                void run(
                                  `pause:${subscription.id}`,
                                  () =>
                                    managePlatformTenantSubscription({
                                      action: 'pause',
                                      tenantId: subscription.tenantId,
                                      environment,
                                      reason,
                                    }),
                                  'Assinatura pausada.'
                                )
                              }
                              className="font-semibold text-amber-700"
                            >
                              Pausar
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!canMutate || busy !== null}
                            onClick={() => {
                              if (window.confirm('Cancelar esta assinatura no Mercado Pago?'))
                                void run(
                                  `cancel:${subscription.id}`,
                                  () =>
                                    managePlatformTenantSubscription({
                                      action: 'cancel',
                                      tenantId: subscription.tenantId,
                                      environment,
                                      reason,
                                    }),
                                  'Assinatura cancelada.'
                                );
                            }}
                            className="font-semibold text-red-700"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!snapshot?.subscriptions.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma assinatura cadastrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold">Webhooks recentes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                {['Evento', 'Recurso', 'Status', 'Tentativas', 'Recebido', 'Erro'].map((item) => (
                  <th key={item} className="px-4 py-3 text-left">
                    {item}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(snapshot?.events ?? []).map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3 font-semibold">{event.eventType}</td>
                  <td className="px-4 py-3 font-mono">
                    {event.resourceType}:{event.resourceId.slice(-10)}
                  </td>
                  <td className="px-4 py-3">
                    <Status value={event.status} />
                  </td>
                  <td className="px-4 py-3">{event.attempts}</td>
                  <td className="px-4 py-3">{date(event.receivedAt)}</td>
                  <td className="px-4 py-3 text-red-700">{event.errorCode || '—'}</td>
                </tr>
              ))}
              {!snapshot?.events.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum webhook recebido.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
