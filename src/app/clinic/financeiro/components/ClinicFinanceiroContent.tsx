'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDollarSign } from 'lucide-react';
import { getClinicFinanceOverview } from '@/services/billingApi';

function brl(v: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v); }

export default function ClinicFinanceiroContent() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getClinicFinanceOverview>>['data']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void (async () => { const r = await getClinicFinanceOverview(); setData(r.data); setError(r.error?.message ?? null); setLoading(false); })(); }, []);

  const metrics = data ? [
    { label: 'Receita do mês', value: brl(data.metrics.monthlyRevenue), icon: CircleDollarSign },
    { label: 'Recebimentos pendentes', value: brl(data.metrics.pendingReceivables), icon: CalendarClock },
    { label: 'Cobranças vencidas', value: brl(data.metrics.overdueReceivables), icon: AlertTriangle },
    { label: 'Assinaturas/pacotes ativos', value: String(data.metrics.activeSubscriptionsAndPackages), icon: CheckCircle2 },
  ] : [];

  return <div className="p-4 lg:p-6 space-y-6">
    <section className="bg-card border border-border rounded-2xl p-5 lg:p-6"><h1 className="text-2xl font-bold text-foreground">Financeiro da Clínica</h1></section>
    {loading && <section className="bg-card border rounded-2xl p-4 text-sm text-muted-foreground">Carregando...</section>}
    {error && <section className="bg-card border rounded-2xl p-4 text-sm text-red-600">{error}</section>}
    <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">{metrics.map((m) => <article key={m.label} className="bg-card border border-border rounded-2xl p-4"><p className="text-sm text-muted-foreground">{m.label}</p><p className="text-2xl font-semibold mt-2">{m.value}</p></article>)}</section>
    <section className="bg-card border rounded-2xl p-5">
      <h2 className="text-base font-semibold">Cobranças recentes</h2>
      <div className="mt-3 space-y-2">{(data?.recentCharges ?? []).map((c) => <div key={c.id} className="text-sm border rounded-lg p-2 flex justify-between"><span>{c.patientName} • {c.description}</span><span>{brl(c.amount)}</span></div>)}</div>
    </section>
  </div>;
}
