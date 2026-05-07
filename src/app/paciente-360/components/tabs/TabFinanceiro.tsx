'use client';

import React, { useState } from 'react';
import type { PatientFinancialSummary, UserRole } from '@/domain/types';
import {
  ShieldOff,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CreditCard,
  FileText,
  Receipt,
  HandshakeIcon,
  ChevronDown,
  ChevronUp,
  Plus,
  Bell,
  FileSignature,
  RefreshCw,
  Eye,
  Download,
} from 'lucide-react';

// Roles that have access to patient financial data
const FINANCIAL_ALLOWED_ROLES: UserRole[] = ['clinic_admin', 'coordinator', 'receptionist', 'physician'];

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
};

const CHARGE_TYPE_LABELS: Record<string, string> = {
  boleto: 'Boleto',
  pix: 'PIX',
  link_pagamento: 'Link de Pagamento',
  cartao: 'Cartão',
};

interface TabFinanceiroProps {
  financial: PatientFinancialSummary;
  currentRole?: UserRole;
}

// ── No-permission state ───────────────────────────────────────────────────────
function SemPermissaoFinanceira() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <ShieldOff size={28} className="text-muted-foreground" />
      </div>
      <p className="text-base font-semibold text-foreground mb-1">Sem permissão financeira</p>
      <p className="text-sm text-muted-foreground max-w-sm">
        Seu perfil não tem acesso às informações financeiras do paciente. Entre em contato com o administrador da clínica para solicitar permissão.
      </p>
      <p className="mt-4 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
        Esta seção refere-se ao financeiro do paciente — não à cobrança SaaS da clínica.
      </p>
    </div>
  );
}

// ── Financial state banner ────────────────────────────────────────────────────
function FinancialStateBanner({ state }: { state: PatientFinancialSummary['financialState'] }) {
  if (state === 'em_dia') {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-green-50 border border-green-200">
        <CheckCircle2 size={18} className="text-green-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800">Financeiro em dia</p>
          <p className="text-xs text-green-700">Todas as parcelas pagas estão em ordem. Nenhuma pendência.</p>
        </div>
      </div>
    );
  }
  if (state === 'pagamento_atrasado') {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
        <AlertTriangle size={18} className="text-red-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-800">Pagamento atrasado</p>
          <p className="text-xs text-red-700">Há parcelas vencidas. Contate o paciente para regularização.</p>
        </div>
      </div>
    );
  }
  if (state === 'cobranca_pendente') {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
        <Clock size={18} className="text-amber-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Cobrança pendente</p>
          <p className="text-xs text-amber-700">Existe uma cobrança gerada aguardando pagamento.</p>
        </div>
      </div>
    );
  }
  return null;
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({
  title,
  icon,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card-base overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-border hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {count !== undefined && (
            <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-medium">
              {count}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pago: { label: 'Pago', cls: 'bg-green-100 text-green-700' },
    pendente: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700' },
    vencido: { label: 'Vencido', cls: 'bg-red-100 text-red-700' },
    cancelado: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500' },
    ativa: { label: 'Ativa', cls: 'bg-blue-100 text-blue-700' },
    concluida: { label: 'Concluída', cls: 'bg-green-100 text-green-700' },
    pendente_aprovacao: { label: 'Pend. Aprovação', cls: 'bg-amber-100 text-amber-700' },
  };
  const entry = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TabFinanceiro({ financial, currentRole = 'coordinator' }: TabFinanceiroProps) {
  // Permission gate
  if (!FINANCIAL_ALLOWED_ROLES.includes(currentRole)) {
    return <SemPermissaoFinanceira />;
  }

  const paymentHistory = financial.paymentHistory ?? [];
  const charges = financial.charges ?? [];
  const receipts = financial.receipts ?? [];
  const negotiations = financial.negotiations ?? [];
  const futureParcelas = financial.futureParcelas ?? 0;
  const futureParcelasAmount = financial.futureParcelasAmount ?? 0;
  const overdueParcelasCount = financial.overdueParcelasCount ?? 0;

  return (
    <div className="space-y-5">
      {/* Scope disclaimer */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-100">
        <CreditCard size={14} className="text-blue-500 shrink-0" />
        <p className="text-xs text-blue-700">
          <strong>Financeiro do paciente</strong> — Esta aba refere-se exclusivamente ao contrato e pagamentos do paciente. Não está relacionada à cobrança SaaS da clínica.
        </p>
      </div>

      {/* Financial state banner */}
      {financial.financialState && <FinancialStateBanner state={financial.financialState} />}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total contratado', value: formatBRL(financial.totalContractValue), color: 'text-foreground', bg: 'bg-muted/40' },
          { label: 'Total pago', value: formatBRL(financial.totalPaid), color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Em aberto', value: formatBRL(financial.totalPending), color: 'text-amber-700', bg: 'bg-amber-50' },
          {
            label: `Parcelas futuras (${futureParcelas})`,
            value: formatBRL(futureParcelasAmount),
            color: 'text-blue-700',
            bg: 'bg-blue-50',
          },
          {
            label: `Parcelas em atraso (${overdueParcelasCount})`,
            value: formatBRL(financial.totalOverdue),
            color: financial.totalOverdue > 0 ? 'text-red-700' : 'text-muted-foreground',
            bg: financial.totalOverdue > 0 ? 'bg-red-50' : 'bg-muted/40',
          },
        ].map((item) => (
          <div key={item.label} className={`rounded-lg p-3 ${item.bg} border border-border`}>
            <p className="text-xs text-muted-foreground mb-1 leading-tight">{item.label}</p>
            <p className={`text-sm font-bold tabular-nums ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* ── Actions bar ── */}
      <div className="card-base p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Ações</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary text-xs flex items-center gap-1.5">
            <Plus size={13} />
            Registrar pagamento
          </button>
          <button className="btn-secondary text-xs flex items-center gap-1.5">
            <CreditCard size={13} />
            Gerar cobrança
          </button>
          <button className="btn-secondary text-xs flex items-center gap-1.5">
            <Bell size={13} />
            Enviar lembrete
          </button>
          <button className="btn-secondary text-xs flex items-center gap-1.5">
            <Receipt size={13} />
            Gerar recibo
          </button>
          <button className="btn-secondary text-xs flex items-center gap-1.5">
            <FileSignature size={13} />
            Ver contrato
          </button>
          <button className="btn-secondary text-xs flex items-center gap-1.5">
            <RefreshCw size={13} />
            Renegociar
          </button>
        </div>
      </div>

      {/* ── Histórico de pagamentos ── */}
      <Section title="Histórico de pagamentos" icon={<FileText size={16} />} count={paymentHistory.length}>
        {paymentHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum pagamento registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descrição</th>
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valor</th>
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data</th>
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Forma</th>
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Registrado por</th>
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recibo</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 text-foreground">{p.description}</td>
                    <td className="py-2.5 font-semibold text-green-700 tabular-nums">{formatBRL(p.amount)}</td>
                    <td className="py-2.5 text-muted-foreground">{formatDate(p.paidAt)}</td>
                    <td className="py-2.5 text-muted-foreground">{METHOD_LABELS[p.method] ?? p.method}</td>
                    <td className="py-2.5 text-muted-foreground">{p.registeredBy}</td>
                    <td className="py-2.5">
                      {p.receiptId ? (
                        <button className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Eye size={12} /> Ver
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Cobranças ── */}
      <Section title="Cobranças" icon={<CreditCard size={16} />} count={charges.length} defaultOpen={false}>
        {charges.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma cobrança gerada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descrição</th>
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valor</th>
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vencimento</th>
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo</th>
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Enviada em</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 text-foreground">{c.description}</td>
                    <td className="py-2.5 font-semibold tabular-nums text-foreground">{formatBRL(c.amount)}</td>
                    <td className="py-2.5 text-muted-foreground">{formatDate(c.dueDate)}</td>
                    <td className="py-2.5 text-muted-foreground">{CHARGE_TYPE_LABELS[c.chargeType] ?? c.chargeType}</td>
                    <td className="py-2.5"><StatusPill status={c.status} /></td>
                    <td className="py-2.5 text-muted-foreground">{c.sentAt ? formatDate(c.sentAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Recibos ── */}
      <Section title="Recibos" icon={<Receipt size={16} />} count={receipts.length} defaultOpen={false}>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum recibo emitido.</p>
        ) : (
          <div className="space-y-2">
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/30 border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">{r.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.receiptNumber} · Emitido em {formatDate(r.issuedAt)} · por {r.issuedBy}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-green-700 tabular-nums">{formatBRL(r.amount)}</span>
                  <button className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Download size={12} /> Baixar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Negociações ── */}
      <Section title="Negociações" icon={<HandshakeIcon size={16} />} count={negotiations.length} defaultOpen={false}>
        {negotiations.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Nenhuma negociação registrada.</p>
            <button className="mt-3 btn-secondary text-xs flex items-center gap-1.5 mx-auto">
              <RefreshCw size={13} />
              Iniciar renegociação
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {negotiations.map((n) => (
              <div key={n.id} className="p-4 rounded-lg border border-border bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{n.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Criado em {formatDate(n.createdAt)} por {n.createdBy} · {n.installments}x
                    </p>
                    {n.notes && <p className="text-xs text-muted-foreground mt-1 italic">{n.notes}</p>}
                  </div>
                  <StatusPill status={n.status} />
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Valor original</p>
                    <p className="text-sm font-semibold text-foreground tabular-nums">{formatBRL(n.originalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor negociado</p>
                    <p className="text-sm font-semibold text-blue-700 tabular-nums">{formatBRL(n.negotiatedAmount)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}