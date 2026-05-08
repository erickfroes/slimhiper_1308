'use client';

import React from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDollarSign, FileText, Link2, RefreshCw, UserRound, Wallet } from 'lucide-react';

interface MetricCard {
  label: string;
  value: string;
  helper: string;
  icon: React.ElementType;
}

const metrics: MetricCard[] = [
  {
    label: 'Receita do mês',
    value: 'R$ 184.320',
    helper: '+12,8% vs mês anterior',
    icon: CircleDollarSign,
  },
  {
    label: 'Recebimentos pendentes',
    value: 'R$ 41.980',
    helper: '37 cobranças aguardando pagamento',
    icon: CalendarClock,
  },
  {
    label: 'Cobranças vencidas',
    value: 'R$ 14.760',
    helper: '19 pacientes em atraso',
    icon: AlertTriangle,
  },
  {
    label: 'Assinaturas/pacotes ativos',
    value: '126',
    helper: '89 assinaturas e 37 pacotes',
    icon: CheckCircle2,
  },
];

const sections = [
  'Visão geral',
  'Cobranças de pacientes',
  'Assinaturas de pacientes',
  'Pacotes vendidos',
  'Inadimplência',
  'Recibos',
  'Asaas placeholder status',
];

const actions = [
  'Gerar cobrança',
  'Criar assinatura',
  'Enviar lembrete',
  'Ver Paciente 360',
  'Registrar pagamento manual',
  'Exportar',
];

const operationalItems = [
  { title: 'Pagamentos por paciente', value: 'Top 5 representam 28% da receita', icon: UserRound },
  { title: 'Links de pagamento', value: '14 links ativos, 3 expiram hoje', icon: Link2 },
  { title: 'Cobranças recorrentes', value: '89 ciclos mensais em processamento', icon: RefreshCw },
  { title: 'Conciliação', value: '97% conciliado nas últimas 48h', icon: Wallet },
];

export default function ClinicFinanceiroContent() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <section className="bg-card border border-border rounded-2xl p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Financeiro da Clínica</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Operação financeira clínica: cobranças, recebimentos, assinaturas, pacotes, inadimplência e conciliação.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 text-xs font-medium">
            <FileText size={13} />
            Escopo: financeiro operacional da clínica (não SaaS billing)
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action}
              className="px-3 py-1.5 rounded-xl text-sm font-medium border border-border bg-background hover:bg-muted transition-colors"
              type="button"
            >
              {action}
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Icon size={16} />
                </div>
              </div>
              <p className="text-2xl font-semibold text-foreground mt-2">{metric.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{metric.helper}</p>
            </article>
          );
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <article className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-base font-semibold text-foreground">Seções da tela</h2>
          <ul className="mt-3 space-y-2">
            {sections.map((section) => (
              <li key={section} className="text-sm text-foreground bg-background border border-border rounded-lg px-3 py-2">
                {section}
              </li>
            ))}
          </ul>
        </article>

        <article className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-base font-semibold text-foreground">Blocos operacionais</h2>
          <div className="mt-3 space-y-2">
            {operationalItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-3 bg-background border border-border rounded-lg px-3 py-2.5">
                  <div className="mt-0.5 w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Icon size={14} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="bg-card border border-dashed border-border rounded-2xl p-5">
        <h2 className="text-base font-semibold text-foreground">Asaas placeholder status</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Integração com Asaas ainda não acionada nesta tela. Somente layout e indicadores mockados.
        </p>
      </section>
    </div>
  );
}
