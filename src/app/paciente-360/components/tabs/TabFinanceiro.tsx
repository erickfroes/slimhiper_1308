'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { PatientFinancialSummary } from '@/domain/types';
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
  Undo2,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import Dialog from '@/components/ui/Dialog';
import {
  createBillingNegotiation,
  createPatientFinancialContract,
  createPatientInvoice,
  createPatientReceipt,
  createPatientSubscription,
  getPaymentReceiptSignedUrl,
  getPatientFinancialSummary,
  refundPatientPayment,
  registerPatientManualPayment,
  sendPaymentReminder,
  syncAsaasPayment,
} from '@/services/billingApi';
import { asSafePaymentUrl } from '@/lib/safeExternalUrl';

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatBRLCents(value: number) {
  return formatBRL(value / 100);
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr || '-';
  return `${d}/${m}/${y}`;
}

function createBillingActionKey(prefix: 'invoice' | 'subscription', patientId?: string) {
  const randomId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${patientId ?? 'unknown'}:${randomId}`;
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
  patientId?: string;
  financial?: PatientFinancialSummary | null;
  canViewFinancial: boolean;
  currentRole: string | null;
  permissions?: string[];
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
        Seu perfil não tem acesso às informações financeiras do paciente. Entre em contato com o
        administrador da clínica para solicitar permissão.
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
          <p className="text-xs text-green-700">
            Todas as parcelas pagas estão em ordem. Nenhuma pendência.
          </p>
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
          <p className="text-xs text-red-700">
            Há parcelas vencidas. Contate o paciente para regularização.
          </p>
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
        type="button"
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
        {open ? (
          <ChevronUp size={16} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={16} className="text-muted-foreground" />
        )}
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
    active: { label: 'Ativa', cls: 'bg-blue-100 text-blue-700' },
    paused: { label: 'Pausada', cls: 'bg-amber-100 text-amber-700' },
    cancelled: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500' },
    concluida: { label: 'Concluída', cls: 'bg-green-100 text-green-700' },
    pendente_aprovacao: { label: 'Pend. Aprovação', cls: 'bg-amber-100 text-amber-700' },
    pending_review: { label: 'Em analise', cls: 'bg-amber-100 text-amber-700' },
    approved: { label: 'Aprovado', cls: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rejeitado', cls: 'bg-red-100 text-red-700' },
    requested: { label: 'Solicitado', cls: 'bg-amber-100 text-amber-700' },
    processing: { label: 'Processando', cls: 'bg-blue-100 text-blue-700' },
    succeeded: { label: 'Concluido', cls: 'bg-green-100 text-green-700' },
    failed: { label: 'Falhou', cls: 'bg-red-100 text-red-700' },
  };
  const entry = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${entry.cls}`}
    >
      {entry.label}
    </span>
  );
}

function parseCurrencyAmount(value: string) {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return null;

  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  let normalized = compact;

  if (lastComma > -1 && lastDot > -1) {
    normalized =
      lastComma > lastDot
        ? compact.replace(/\./g, '').replace(',', '.')
        : compact.replace(/,/g, '');
  } else if (lastComma > -1) {
    normalized = compact.replace(',', '.');
  }

  const numeric = Number(normalized.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100) / 100;
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeBillingDocument(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 11 || digits.length === 14 ? digits : false;
}

function asSafePaymentLink(value: string | null) {
  return asSafePaymentUrl(value);
}

function compactId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : null;
}

function CommercialContextLine({
  item,
}: {
  item: {
    sourceModule?: string | null;
    programId?: string | null;
    packageId?: string | null;
    enrollmentId?: string | null;
    serviceId?: string | null;
  };
}) {
  const parts = [
    item.sourceModule ? item.sourceModule : null,
    item.enrollmentId ? `matricula ${compactId(item.enrollmentId)}` : null,
    item.programId ? `programa ${compactId(item.programId)}` : null,
    item.packageId ? `pacote ${compactId(item.packageId)}` : null,
    item.serviceId ? `servico ${compactId(item.serviceId)}` : null,
  ].filter(Boolean);

  if (parts.length === 0) return null;
  return <p className="mt-1 text-[11px] text-muted-foreground">{parts.join(' - ')}</p>;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TabFinanceiro({
  patientId,
  financial,
  canViewFinancial,
  permissions = [],
}: TabFinanceiroProps) {
  const [liveFinancial, setLiveFinancial] = useState<PatientFinancialSummary | null>(
    financial ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [creationNotice, setCreationNotice] = useState<string | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [creatingSubscription, setCreatingSubscription] = useState(false);
  const [localActionLoading, setLocalActionLoading] = useState<string | null>(null);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [subModal, setSubModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [amount, setAmount] = useState('400');
  const [description, setDescription] = useState('Cobrança avulsa');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [billingDocument, setBillingDocument] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<
    'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'transferencia'
  >('pix');
  const [refundModal, setRefundModal] = useState<{
    paymentId?: string | null;
    invoiceId?: string | null;
    label: string;
  } | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [invoiceActionKey, setInvoiceActionKey] = useState(() =>
    createBillingActionKey('invoice', patientId)
  );
  const [subscriptionActionKey, setSubscriptionActionKey] = useState(() =>
    createBillingActionKey('subscription', patientId)
  );
  const canWriteFinancial = permissions.includes('financial.write');
  const creatingCharge = creatingInvoice || creatingSubscription;
  const isLocalActionLoading = localActionLoading !== null;

  const resetCreationFeedback = () => {
    setCreationError(null);
    setCreationNotice(null);
    setPaymentLink(null);
  };

  const getValidatedAmount = () => {
    const parsedAmount = parseCurrencyAmount(amount);
    if (parsedAmount === null) {
      setCreationError('Informe um valor maior que zero para continuar.');
      return null;
    }
    return parsedAmount;
  };

  const getBillingIdentity = () => {
    const normalized = normalizeBillingDocument(billingDocument);
    if (normalized === false) {
      setCreationError('Informe CPF com 11 digitos ou CNPJ com 14 digitos.');
      return false;
    }
    return normalized ? { cpfCnpj: normalized } : undefined;
  };

  const handleOpenInvoiceModal = () => {
    resetCreationFeedback();
    setInvoiceActionKey(createBillingActionKey('invoice', patientId));
    setSubModal(false);
    setPaymentModal(false);
    setInvoiceModal(true);
  };

  const handleOpenSubscriptionModal = () => {
    resetCreationFeedback();
    setSubscriptionActionKey(createBillingActionKey('subscription', patientId));
    setInvoiceModal(false);
    setPaymentModal(false);
    setSubModal(true);
  };

  const handleOpenPaymentModal = () => {
    resetCreationFeedback();
    setInvoiceModal(false);
    setSubModal(false);
    setPaymentModal(true);
  };

  const handleCreateInvoice = async () => {
    resetCreationFeedback();
    if (!patientId) {
      setCreationError('Paciente nao identificado para gerar cobranca.');
      return;
    }
    const parsedAmount = getValidatedAmount();
    if (parsedAmount === null) return;
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setCreationError('Informe a descricao da cobranca.');
      return;
    }
    if (!isValidDateInput(dueDate)) {
      setCreationError('Informe uma data de vencimento valida.');
      return;
    }
    const billingIdentity = getBillingIdentity();
    if (billingIdentity === false) return;

    setCreatingInvoice(true);
    try {
      const result = await createPatientInvoice(
        patientId,
        parsedAmount,
        trimmedDescription,
        dueDate,
        billingIdentity,
        { idempotencyKey: invoiceActionKey }
      );
      if (result.error) {
        setCreationError(`Falha na Edge Function: ${result.error.message}`);
        return;
      }
      if (!result.data) {
        setCreationError('A Edge Function respondeu sem dados da cobranca.');
        return;
      }
      setPaymentLink(result.data.paymentLink ?? result.data.invoiceUrl ?? null);
      setCreationNotice(
        result.data.paymentLink || result.data.invoiceUrl
          ? 'Cobranca criada. Link de pagamento disponivel abaixo.'
          : `Cobranca criada (${result.data.id}), mas sem link retornado pela Edge Function.`
      );
      setInvoiceActionKey(createBillingActionKey('invoice', patientId));
      setInvoiceModal(false);
    } catch (err) {
      setCreationError(
        err instanceof Error ? err.message : 'Falha inesperada ao acionar a Edge Function.'
      );
    } finally {
      setCreatingInvoice(false);
    }
  };

  const handleCreateSubscription = async () => {
    resetCreationFeedback();
    if (!patientId) {
      setCreationError('Paciente nao identificado para criar assinatura.');
      return;
    }
    const parsedAmount = getValidatedAmount();
    if (parsedAmount === null) return;
    const billingIdentity = getBillingIdentity();
    if (billingIdentity === false) return;

    setCreatingSubscription(true);
    try {
      const result = await createPatientSubscription(
        patientId,
        'default-package',
        parsedAmount,
        'monthly',
        billingIdentity,
        { idempotencyKey: subscriptionActionKey }
      );
      if (result.error) {
        setCreationError(`Falha na Edge Function: ${result.error.message}`);
        return;
      }
      if (!result.data) {
        setCreationError('A Edge Function respondeu sem dados da assinatura.');
        return;
      }
      setPaymentLink(null);
      setCreationNotice(
        `Assinatura criada (${result.data.id}) com status ${result.data.status ?? 'registrado'}. A Edge Function de assinatura nao retorna link de pagamento.`
      );
      setSubscriptionActionKey(createBillingActionKey('subscription', patientId));
      setSubModal(false);
    } catch (err) {
      setCreationError(
        err instanceof Error ? err.message : 'Falha inesperada ao acionar a Edge Function.'
      );
    } finally {
      setCreatingSubscription(false);
    }
  };

  const loadFinancial = useCallback(async () => {
    if (!patientId || !canViewFinancial) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getPatientFinancialSummary(patientId);
      if (res.error) setError(res.error.message);
      if (res.data) setLiveFinancial(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado ao carregar financeiro.');
    } finally {
      setLoading(false);
    }
  }, [patientId, canViewFinancial]);

  const refreshAfterLocalAction = async (message: string) => {
    setCreationNotice(message);
    await loadFinancial();
  };

  const handleSendReminder = async () => {
    resetCreationFeedback();
    if (!patientId) {
      setCreationError('Paciente nao identificado para enviar lembrete.');
      return;
    }
    const pendingInvoice = liveFinancial?.invoices.find((invoice) => invoice.status !== 'pago');
    setLocalActionLoading('reminder');
    try {
      const result = await sendPaymentReminder(patientId, pendingInvoice?.id);
      if (result.error) {
        setCreationError(result.error.message);
        return;
      }
      await refreshAfterLocalAction('Lembrete financeiro registrado para acompanhamento.');
    } finally {
      setLocalActionLoading(null);
    }
  };

  const handleCreateReceipt = async () => {
    resetCreationFeedback();
    if (!patientId) {
      setCreationError('Paciente nao identificado para gerar recibo.');
      return;
    }
    const receiptAmount =
      liveFinancial?.lastPaymentAmount ?? liveFinancial?.nextDueAmount ?? getValidatedAmount() ?? 0;
    if (receiptAmount <= 0) return;
    setLocalActionLoading('receipt');
    try {
      const result = await createPatientReceipt(
        patientId,
        receiptAmount,
        description.trim() || 'Recibo financeiro'
      );
      if (result.error) {
        setCreationError(result.error.message);
        return;
      }
      await refreshAfterLocalAction('Recibo local registrado no financeiro do paciente.');
    } finally {
      setLocalActionLoading(null);
    }
  };

  const handleCreateFinancialContract = async () => {
    resetCreationFeedback();
    if (!patientId) {
      setCreationError('Paciente nao identificado para gerar contrato.');
      return;
    }
    const contractAmount =
      liveFinancial?.totalContractValue ||
      liveFinancial?.nextDueAmount ||
      getValidatedAmount() ||
      0;
    if (contractAmount <= 0) return;
    setLocalActionLoading('contract');
    try {
      const result = await createPatientFinancialContract(
        patientId,
        contractAmount,
        description.trim() || 'Contrato financeiro do paciente'
      );
      if (result.error) {
        setCreationError(result.error.message);
        return;
      }
      await refreshAfterLocalAction('Contrato financeiro local registrado.');
    } finally {
      setLocalActionLoading(null);
    }
  };

  const handleCreateNegotiation = async () => {
    resetCreationFeedback();
    if (!patientId) {
      setCreationError('Paciente nao identificado para renegociar.');
      return;
    }
    const originalAmount =
      liveFinancial?.totalOverdue ||
      liveFinancial?.totalPending ||
      liveFinancial?.nextDueAmount ||
      getValidatedAmount() ||
      0;
    if (originalAmount <= 0) return;
    setLocalActionLoading('negotiation');
    try {
      const result = await createBillingNegotiation(
        patientId,
        originalAmount,
        originalAmount,
        1,
        'Renegociacao iniciada pela equipe.'
      );
      if (result.error) {
        setCreationError(result.error.message);
        return;
      }
      await refreshAfterLocalAction('Renegociacao local registrada para acompanhamento.');
    } finally {
      setLocalActionLoading(null);
    }
  };

  const handleRegisterManualPayment = async () => {
    resetCreationFeedback();
    if (!patientId) {
      setCreationError('Paciente nao identificado para registrar pagamento.');
      return;
    }
    const parsedAmount = getValidatedAmount();
    if (parsedAmount === null) return;
    const pendingInvoice = liveFinancial?.invoices.find((invoice) => invoice.status !== 'pago');
    setLocalActionLoading('payment');
    try {
      const result = await registerPatientManualPayment(
        patientId,
        parsedAmount,
        description.trim() || 'Pagamento manual',
        paymentMethod,
        pendingInvoice?.id
      );
      if (result.error) {
        setCreationError(result.error.message);
        return;
      }
      setPaymentModal(false);
      await refreshAfterLocalAction('Pagamento manual registrado com recibo local.');
    } finally {
      setLocalActionLoading(null);
    }
  };

  const handleOpenRefundModal = (
    payment: NonNullable<PatientFinancialSummary['paymentHistory']>[number]
  ) => {
    resetCreationFeedback();
    setRefundModal({
      paymentId: payment.id,
      label: payment.description,
    });
    setRefundAmount(String(payment.amount).replace('.', ','));
    setRefundReason('');
  };

  const handleConfirmRefund = async () => {
    resetCreationFeedback();
    if (!refundModal) return;
    const parsedAmount = parseCurrencyAmount(refundAmount);
    if (parsedAmount === null) {
      setCreationError('Informe um valor valido para estorno.');
      return;
    }
    if (refundReason.trim().length < 10) {
      setCreationError('Informe um motivo de estorno com pelo menos 10 caracteres.');
      return;
    }

    setLocalActionLoading('refund');
    try {
      const result = await refundPatientPayment({
        paymentId: refundModal.paymentId,
        invoiceId: refundModal.invoiceId,
        amountCents: Math.round(parsedAmount * 100),
        reason: refundReason.trim(),
        idempotencyKey: `refund:${refundModal.paymentId ?? refundModal.invoiceId}:${Date.now()}`,
      });
      if (result.error) {
        setCreationError(result.error.message);
        return;
      }
      setRefundModal(null);
      await refreshAfterLocalAction('Estorno solicitado e registrado para conciliacao.');
    } finally {
      setLocalActionLoading(null);
    }
  };

  const handleSyncCharge = async (invoiceId: string) => {
    resetCreationFeedback();
    setLocalActionLoading(`sync:${invoiceId}`);
    try {
      const result = await syncAsaasPayment(invoiceId, 'patient_360_manual_sync');
      if (result.error) {
        setCreationError(result.error.message);
        return;
      }
      await refreshAfterLocalAction('Sincronizacao da cobranca solicitada.');
    } finally {
      setLocalActionLoading(null);
    }
  };

  const handleOpenPaymentReceipt = async (receiptId: string) => {
    resetCreationFeedback();
    setLocalActionLoading(`payment-receipt:${receiptId}`);
    try {
      const result = await getPaymentReceiptSignedUrl(receiptId);
      if (result.error || !result.data?.url) {
        setCreationError(result.error?.message ?? 'Nao foi possivel abrir o comprovante.');
        return;
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setLocalActionLoading(null);
    }
  };

  useEffect(() => {
    void loadFinancial();
  }, [loadFinancial]);
  // Permission gate
  if (!canViewFinancial) {
    return <SemPermissaoFinanceira />;
  }

  if (loading)
    return (
      <div className="card-base p-5 text-sm text-muted-foreground">Carregando financeiro...</div>
    );
  if (error)
    return (
      <div className="card-base p-5 space-y-3">
        <p className="text-sm text-red-600">Erro ao carregar financeiro: {error}</p>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => void loadFinancial()}
        >
          Tentar novamente
        </button>
      </div>
    );
  if (!liveFinancial) {
    return (
      <div className="card-base p-5">
        <EmptyState
          icon={CreditCard}
          title="Financeiro indisponível"
          description="Financeiro não disponível"
        />
      </div>
    );
  }

  const paymentHistory = liveFinancial.paymentHistory ?? [];
  const charges = liveFinancial.charges ?? [];
  const receipts = liveFinancial.receipts ?? [];
  const negotiations = liveFinancial.negotiations ?? [];
  const paymentReceipts = liveFinancial.paymentReceipts ?? [];
  const subscriptions = liveFinancial.subscriptions ?? [];
  const refunds = liveFinancial.refunds ?? [];
  const futureParcelas = liveFinancial.futureParcelas ?? 0;
  const futureParcelasAmount = liveFinancial.futureParcelasAmount ?? 0;
  const overdueParcelasCount = liveFinancial.overdueParcelasCount ?? 0;
  const safePaymentLink = asSafePaymentLink(paymentLink);
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]));
  const downloadReceipt = (receipt: (typeof receipts)[number]) => {
    downloadTextFile(
      `${receipt.receiptNumber || receipt.id}.txt`,
      [
        'Recibo SlimHiper',
        `Numero: ${receipt.receiptNumber}`,
        `Descricao: ${receipt.description}`,
        `Valor: ${formatBRL(receipt.amount)}`,
        `Pagamento: ${formatDate(receipt.paymentDate)}`,
        `Emissao: ${formatDate(receipt.issuedAt)}`,
        `Emitido por: ${receipt.issuedBy}`,
      ].join('\n')
    );
  };

  return (
    <div className="space-y-5">
      {/* Scope disclaimer */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-100">
        <CreditCard size={14} className="text-blue-500 shrink-0" />
        <p className="text-xs text-blue-700">
          <strong>Financeiro do paciente</strong> — Esta aba refere-se exclusivamente ao contrato e
          pagamentos do paciente. Não está relacionada à cobrança SaaS da clínica.
        </p>
      </div>

      {/* Financial state banner */}
      {liveFinancial.financialState && (
        <FinancialStateBanner state={liveFinancial.financialState} />
      )}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          {
            label: 'Total contratado',
            value: formatBRL(liveFinancial.totalContractValue),
            color: 'text-foreground',
            bg: 'bg-muted/40',
          },
          {
            label: 'Total pago',
            value: formatBRL(liveFinancial.totalPaid),
            color: 'text-green-700',
            bg: 'bg-green-50',
          },
          {
            label: 'Em aberto',
            value: formatBRL(liveFinancial.totalPending),
            color: 'text-amber-700',
            bg: 'bg-amber-50',
          },
          {
            label: `Parcelas futuras (${futureParcelas})`,
            value: formatBRL(futureParcelasAmount),
            color: 'text-blue-700',
            bg: 'bg-blue-50',
          },
          {
            label: `Parcelas em atraso (${overdueParcelasCount})`,
            value: formatBRL(liveFinancial.totalOverdue),
            color: liveFinancial.totalOverdue > 0 ? 'text-red-700' : 'text-muted-foreground',
            bg: liveFinancial.totalOverdue > 0 ? 'bg-red-50' : 'bg-muted/40',
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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Ações
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1.5"
            disabled={!canWriteFinancial || creatingCharge || isLocalActionLoading}
            onClick={handleOpenPaymentModal}
          >
            <Plus size={13} />
            Registrar pagamento
          </button>
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1.5"
            disabled={!canWriteFinancial || creatingCharge || isLocalActionLoading}
            onClick={handleOpenInvoiceModal}
          >
            <CreditCard size={13} />
            Gerar cobrança
          </button>
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1.5"
            disabled={!canWriteFinancial || creatingCharge || isLocalActionLoading}
            onClick={handleOpenSubscriptionModal}
          >
            <RefreshCw size={13} />
            Criar assinatura
          </button>
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1.5"
            disabled={!canWriteFinancial || creatingCharge || isLocalActionLoading}
            onClick={() => void handleSendReminder()}
          >
            <Bell size={13} />
            {localActionLoading === 'reminder' ? 'Registrando...' : 'Enviar lembrete'}
          </button>
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1.5"
            disabled={!canWriteFinancial || creatingCharge || isLocalActionLoading}
            onClick={() => void handleCreateReceipt()}
          >
            <Receipt size={13} />
            {localActionLoading === 'receipt' ? 'Gerando...' : 'Gerar recibo'}
          </button>
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1.5"
            disabled={!canWriteFinancial || creatingCharge || isLocalActionLoading}
            onClick={() => void handleCreateFinancialContract()}
          >
            <FileSignature size={13} />
            {localActionLoading === 'contract' ? 'Gerando...' : 'Gerar contrato'}
          </button>
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1.5"
            disabled={!canWriteFinancial || creatingCharge || isLocalActionLoading}
            onClick={() => void handleCreateNegotiation()}
          >
            <RefreshCw size={13} />
            {localActionLoading === 'negotiation' ? 'Registrando...' : 'Renegociar'}
          </button>
        </div>
      </div>
      {!canWriteFinancial && (
        <p className="text-xs text-amber-700">
          Sem permissão financial.write para criar cobranças/assinaturas.
        </p>
      )}
      {creationNotice && (
        <p className="text-xs text-green-700" role="status">
          {creationNotice}
        </p>
      )}
      {creationError && (
        <div
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          role="alert"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{creationError}</span>
        </div>
      )}
      {safePaymentLink && (
        <p className="text-xs text-green-700">
          Link de pagamento:{' '}
          <a className="underline" href={safePaymentLink} target="_blank" rel="noreferrer">
            abrir
          </a>
        </p>
      )}
      {paymentLink && !safePaymentLink && (
        <p className="text-xs text-amber-700" role="status">
          Link de pagamento retornado em formato nao permitido e bloqueado por seguranca.
        </p>
      )}
      {paymentModal && (
        <Dialog
          open
          title="Registrar pagamento"
          description="Registro local auditado sem chamar provider externo."
          onOpenChange={(open) => {
            if (!open && localActionLoading !== 'payment') setPaymentModal(false);
          }}
        >
          <div className="space-y-3 text-sm" aria-busy={localActionLoading === 'payment'}>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Descricao</span>
              <input
                className="border rounded px-2 py-1 w-full"
                value={description}
                disabled={localActionLoading === 'payment'}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Valor pago</span>
              <input
                className="border rounded px-2 py-1 w-full"
                inputMode="decimal"
                value={amount}
                disabled={localActionLoading === 'payment'}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Metodo</span>
              <select
                className="border rounded px-2 py-1 w-full"
                value={paymentMethod}
                disabled={localActionLoading === 'payment'}
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value as
                      | 'pix'
                      | 'cartao_credito'
                      | 'cartao_debito'
                      | 'boleto'
                      | 'dinheiro'
                      | 'transferencia'
                  )
                }
              >
                {Object.entries(METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              Registro local auditado: cria pagamento e recibo vinculados ao paciente sem chamar
              provider externo.
            </p>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={localActionLoading === 'payment'}
              onClick={() => void handleRegisterManualPayment()}
            >
              {localActionLoading === 'payment' ? 'Registrando...' : 'Confirmar pagamento'}
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={localActionLoading === 'payment'}
              onClick={() => setPaymentModal(false)}
            >
              Cancelar
            </button>
          </div>
        </Dialog>
      )}
      {invoiceModal && (
        <Dialog
          open
          title="Gerar cobranca"
          description="Cria cobranca com contratos locais e provider atras da Edge Function."
          onOpenChange={(open) => {
            if (!open && !creatingInvoice) setInvoiceModal(false);
          }}
        >
          <div className="space-y-3 text-sm" aria-busy={creatingInvoice}>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Descricao</span>
              <input
                className="border rounded px-2 py-1 w-full"
                value={description}
                disabled={creatingInvoice}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Valor</span>
              <input
                className="border rounded px-2 py-1 w-full"
                inputMode="decimal"
                value={amount}
                disabled={creatingInvoice}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Vencimento</span>
              <input
                type="date"
                className="border rounded px-2 py-1 w-full"
                value={dueDate}
                disabled={creatingInvoice}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                CPF/CNPJ para novo customer Asaas
              </span>
              <input
                className="border rounded px-2 py-1 w-full"
                inputMode="numeric"
                value={billingDocument}
                disabled={creatingInvoice}
                onChange={(e) => setBillingDocument(e.target.value)}
                placeholder="Somente numeros"
              />
            </label>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={creatingInvoice}
              onClick={handleCreateInvoice}
            >
              {creatingInvoice ? 'Gerando...' : 'Confirmar cobranca'}
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={creatingInvoice}
              onClick={() => setInvoiceModal(false)}
            >
              Cancelar
            </button>
          </div>
        </Dialog>
      )}
      {subModal && (
        <Dialog
          open
          title="Criar assinatura"
          description="Contrato local seguro com idempotencia por tentativa."
          onOpenChange={(open) => {
            if (!open && !creatingSubscription) setSubModal(false);
          }}
        >
          <div className="space-y-3 text-sm" aria-busy={creatingSubscription}>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Valor mensal</span>
              <input
                className="border rounded px-2 py-1 w-full"
                inputMode="decimal"
                value={amount}
                disabled={creatingSubscription}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Contrato local seguro: pacote padrao, ciclo mensal e chave de idempotencia por
              tentativa; provider Asaas permanece atras da Edge Function.
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                CPF/CNPJ para novo customer Asaas
              </span>
              <input
                className="border rounded px-2 py-1 w-full"
                inputMode="numeric"
                value={billingDocument}
                disabled={creatingSubscription}
                onChange={(e) => setBillingDocument(e.target.value)}
                placeholder="Somente numeros"
              />
            </label>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={creatingSubscription}
              onClick={handleCreateSubscription}
            >
              {creatingSubscription ? 'Criando...' : 'Confirmar assinatura'}
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={creatingSubscription}
              onClick={() => setSubModal(false)}
            >
              Cancelar
            </button>
          </div>
        </Dialog>
      )}
      {refundModal && (
        <Dialog
          open
          title="Solicitar estorno"
          description="Estorno auditado via Edge Function. Confirme valor e motivo antes de enviar."
          onOpenChange={(open) => {
            if (!open && localActionLoading !== 'refund') setRefundModal(null);
          }}
        >
          <div className="space-y-3 text-sm" aria-busy={localActionLoading === 'refund'}>
            <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              Pagamento: <span className="font-semibold text-foreground">{refundModal.label}</span>
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Valor do estorno</span>
              <input
                className="w-full rounded border px-2 py-1"
                inputMode="decimal"
                value={refundAmount}
                disabled={localActionLoading === 'refund'}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Motivo</span>
              <textarea
                className="min-h-24 w-full rounded border px-2 py-1"
                value={refundReason}
                disabled={localActionLoading === 'refund'}
                onChange={(event) => setRefundReason(event.target.value)}
                placeholder="Descreva o motivo operacional do estorno"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={localActionLoading === 'refund'}
                onClick={() => void handleConfirmRefund()}
              >
                {localActionLoading === 'refund' ? 'Solicitando...' : 'Confirmar estorno'}
              </button>
              <button
                type="button"
                className="btn-secondary text-xs"
                disabled={localActionLoading === 'refund'}
                onClick={() => setRefundModal(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* ── Histórico de pagamentos ── */}
      <Section
        title="Histórico de pagamentos"
        icon={<FileText size={16} />}
        count={paymentHistory.length}
      >
        {paymentHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum pagamento registrado.
          </p>
        ) : (
          <>
            <div className="space-y-3 sm:hidden">
              {paymentHistory.map((p) => (
                <article key={p.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {p.description}
                      </p>
                      <CommercialContextLine item={p} />
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(p.paidAt)}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-green-700">
                      {formatBRL(p.amount)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <span className="text-muted-foreground">Metodo</span>
                      <p className="mt-1 font-semibold text-foreground">
                        {METHOD_LABELS[p.method] ?? p.method}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <span className="text-muted-foreground">Registrado por</span>
                      <p className="mt-1 truncate font-semibold text-foreground">
                        {p.registeredBy}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {p.receiptId ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!receiptById.has(p.receiptId)}
                        onClick={() => {
                          const receipt = receiptById.get(p.receiptId!);
                          if (receipt) downloadReceipt(receipt);
                        }}
                      >
                        <Eye size={12} /> Ver recibo
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem recibo</span>
                    )}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!canWriteFinancial || isLocalActionLoading}
                      onClick={() => handleOpenRefundModal(p)}
                    >
                      <Undo2 size={12} /> Estornar
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Descrição
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Valor
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Data
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Forma
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Registrado por
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Recibo
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Estorno
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="py-2.5 text-foreground">
                        {p.description}
                        <CommercialContextLine item={p} />
                      </td>
                      <td className="py-2.5 font-semibold text-green-700 tabular-nums">
                        {formatBRL(p.amount)}
                      </td>
                      <td className="py-2.5 text-muted-foreground">{formatDate(p.paidAt)}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {METHOD_LABELS[p.method] ?? p.method}
                      </td>
                      <td className="py-2.5 text-muted-foreground">{p.registeredBy}</td>
                      <td className="py-2.5">
                        {p.receiptId ? (
                          <button
                            type="button"
                            className="text-xs text-primary flex items-center gap-1 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={!receiptById.has(p.receiptId)}
                            onClick={() => {
                              const receipt = receiptById.get(p.receiptId!);
                              if (receipt) downloadReceipt(receipt);
                            }}
                          >
                            <Eye size={12} /> Ver
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!canWriteFinancial || isLocalActionLoading}
                          onClick={() => handleOpenRefundModal(p)}
                        >
                          <Undo2 size={12} /> Estornar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {/* ── Cobranças ── */}
      <Section
        title="Cobranças"
        icon={<CreditCard size={16} />}
        count={charges.length}
        defaultOpen={false}
      >
        {charges.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma cobrança gerada.</p>
        ) : (
          <>
            <div className="space-y-3 sm:hidden">
              {charges.map((c) => (
                <article key={c.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {c.description}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Vence em {formatDate(c.dueDate)}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-foreground">
                      {formatBRL(c.amount)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <span className="text-muted-foreground">Tipo</span>
                      <p className="mt-1 font-semibold text-foreground">
                        {CHARGE_TYPE_LABELS[c.chargeType] ?? c.chargeType}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <span className="text-muted-foreground">Enviada em</span>
                      <p className="mt-1 font-semibold text-foreground">
                        {c.sentAt ? formatDate(c.sentAt) : 'Nao enviada'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <StatusPill status={c.status} />
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!canWriteFinancial || isLocalActionLoading}
                      onClick={() => void handleSyncCharge(c.id)}
                    >
                      <RefreshCw size={12} /> Sync
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Descrição
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Valor
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Vencimento
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Tipo
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Enviada em
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Sync
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="py-2.5 text-foreground">{c.description}</td>
                      <td className="py-2.5 font-semibold tabular-nums text-foreground">
                        {formatBRL(c.amount)}
                      </td>
                      <td className="py-2.5 text-muted-foreground">{formatDate(c.dueDate)}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {CHARGE_TYPE_LABELS[c.chargeType] ?? c.chargeType}
                      </td>
                      <td className="py-2.5">
                        <StatusPill status={c.status} />
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {c.sentAt ? formatDate(c.sentAt) : '—'}
                      </td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!canWriteFinancial || isLocalActionLoading}
                          onClick={() => void handleSyncCharge(c.id)}
                        >
                          <RefreshCw size={12} /> Sync
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      <Section
        title="Comprovantes enviados"
        icon={<Receipt size={16} />}
        count={paymentReceipts.length}
        defaultOpen={paymentReceipts.some((receipt) => receipt.status === 'pending_review')}
      >
        {paymentReceipts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum comprovante enviado pelo paciente.
          </p>
        ) : (
          <div className="space-y-2">
            {paymentReceipts.map((receipt) => (
              <article
                key={receipt.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {receipt.fileName ?? 'Comprovante'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatBRLCents(receipt.amountCents)} - enviado em{' '}
                    {formatDate((receipt.uploadedAt ?? receipt.submittedAt ?? '').slice(0, 10))}
                  </p>
                  {receipt.rejectionReason ? (
                    <p className="mt-1 text-xs text-red-600">Motivo: {receipt.rejectionReason}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={receipt.status} />
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isLocalActionLoading}
                    onClick={() => void handleOpenPaymentReceipt(receipt.id)}
                  >
                    <Eye size={12} /> Abrir
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Recorrencia"
        icon={<RefreshCw size={16} />}
        count={subscriptions.length}
        defaultOpen={subscriptions.length > 0}
      >
        {subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma assinatura recorrente vinculada.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {subscriptions.map((subscription) => (
              <article key={subscription.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {subscription.description ?? 'Assinatura'}
                    </p>
                    <CommercialContextLine item={subscription} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {subscription.cycle} - proxima em{' '}
                      {formatDate((subscription.nextDueDate ?? '').slice(0, 10))}
                    </p>
                  </div>
                  <StatusPill status={subscription.status} />
                </div>
                <p className="mt-3 text-sm font-bold tabular-nums text-foreground">
                  {formatBRLCents(subscription.amountCents)}
                </p>
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Estornos"
        icon={<Undo2 size={16} />}
        count={refunds.length}
        defaultOpen={refunds.length > 0}
      >
        {refunds.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum estorno registrado.
          </p>
        ) : (
          <div className="space-y-2">
            {refunds.map((refund) => (
              <article
                key={refund.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {formatBRLCents(refund.amountCents)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Solicitado em {formatDate((refund.requestedAt ?? '').slice(0, 10))} -{' '}
                    {refund.reason}
                  </p>
                </div>
                <StatusPill status={refund.status} />
              </article>
            ))}
          </div>
        )}
      </Section>

      {/* ── Recibos ── */}
      <Section
        title="Recibos"
        icon={<Receipt size={16} />}
        count={receipts.length}
        defaultOpen={false}
      >
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum recibo emitido.</p>
        ) : (
          <div className="space-y-2">
            {receipts.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/30 border border-border"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{r.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.receiptNumber} · Emitido em {formatDate(r.issuedAt)} · por {r.issuedBy}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-green-700 tabular-nums">
                    {formatBRL(r.amount)}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-primary flex items-center gap-1 hover:underline"
                    onClick={() => downloadReceipt(r)}
                  >
                    <Download size={12} /> Baixar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Negociações ── */}
      <Section
        title="Negociações"
        icon={<HandshakeIcon size={16} />}
        count={negotiations.length}
        defaultOpen={false}
      >
        {negotiations.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Nenhuma negociação registrada.</p>
            <button
              type="button"
              className="mt-3 btn-secondary text-xs flex items-center gap-1.5 mx-auto opacity-60 cursor-not-allowed"
              disabled
              title="Renegociacao fica pos-MVP ate existir servico real e auditavel."
            >
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
                    {n.notes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{n.notes}</p>
                    )}
                  </div>
                  <StatusPill status={n.status} />
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Valor original</p>
                    <p className="text-sm font-semibold text-foreground tabular-nums">
                      {formatBRL(n.originalAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor negociado</p>
                    <p className="text-sm font-semibold text-blue-700 tabular-nums">
                      {formatBRL(n.negotiatedAmount)}
                    </p>
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
