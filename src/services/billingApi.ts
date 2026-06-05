import type { PatientFinancialSummary } from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

type EdgeResponseEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { message?: string; code?: string; details?: string };
};

export interface ChargeActionResult {
  id: string;
  status?: string;
  paymentLink?: string | null;
  invoiceUrl?: string | null;
}

export interface PatientBillingIdentityInput {
  cpfCnpj?: string;
}

export interface BillingActionOptions {
  idempotencyKey?: string;
}

export interface ClinicFinanceOverview {
  metrics: {
    monthlyRevenue: number;
    pendingReceivables: number;
    overdueReceivables: number;
    activeSubscriptionsAndPackages: number;
  };
  recentCharges: Array<{
    id: string;
    patientName: string;
    description: string;
    amount: number;
    dueDate: string;
    status: 'pendente' | 'pago' | 'vencido' | 'cancelado';
  }>;
}

export interface ClinicFinanceDivergence {
  id: string;
  kind:
    | 'amount_mismatch'
    | 'paid_invoice_without_paid_payment'
    | 'paid_payment_unpaid_invoice'
    | 'overdue_invoice_without_overdue_payment'
    | 'orphan_payment'
    | 'webhook_unresolved';
  severity: 'high' | 'medium' | 'low';
  patientId: string | null;
  patientName: string;
  invoiceId: string | null;
  paymentId: string | null;
  description: string;
  expectedStatus: string | null;
  actualStatus: string | null;
  expectedAmount: number | null;
  actualAmount: number | null;
  dueDate: string | null;
  createdAt: string;
}

export interface ClinicFinanceEvent {
  id: string;
  eventType: string;
  status: 'received' | 'processed' | 'failed' | 'ignored';
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface ClinicFinanceReconciliation {
  summary: {
    divergences: number;
    highSeverity: number;
    mediumSeverity: number;
    failedWebhookEvents: number;
    pendingInvoices: number;
    overdueInvoices: number;
    unmatchedPayments: number;
    lastCheckedAt: string;
  };
  divergences: ClinicFinanceDivergence[];
  recentEvents: ClinicFinanceEvent[];
}

function isMockEnabled() {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

async function getMockPatient360(patientId: string) {
  const { getPatient360 } = await import('@/services/mockApi');
  return getPatient360(patientId);
}

function unwrap<T>(response: unknown): { data: T | null; error: SafeServiceError | null } {
  if (response && typeof response === 'object' && 'ok' in response) {
    const e = response as EdgeResponseEnvelope<T>;
    if (e.ok) return { data: (e.data ?? null) as T | null, error: null };
    return {
      data: null,
      error: {
        message: e.error?.message ?? e.error?.code ?? 'Edge function request failed.',
        code: e.error?.code,
        details: e.error?.details,
      },
    };
  }
  return { data: response as T, error: null };
}

function asChargeResult(payload: unknown): ChargeActionResult | null {
  const r = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id.trim() ? r.id : null;
  if (!id) return null;
  const paymentLink = asSafeExternalUrl(r.payment_link) ?? asSafeExternalUrl(r.invoice_url);
  const invoiceUrl = asSafeExternalUrl(r.invoice_url);

  return {
    id,
    status: typeof r.status === 'string' ? r.status : undefined,
    paymentLink,
    invoiceUrl,
  };
}

function asSafeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime());
}

function validateAmountCents(amount: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function normalizeIdempotencyKey(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length <= 120 ? normalized : undefined;
}

export async function getPatientFinancialSummary(patientId: string) {
  if (!patientId.trim()) {
    return {
      data: null as PatientFinancialSummary | null,
      error: { message: 'Paciente invalido para carregar financeiro.' },
    };
  }

  if (isMockEnabled()) {
    const p = await getMockPatient360(patientId);
    return { data: p?.financial ?? null, error: null as SafeServiceError | null };
  }
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('get_patient_financial_summary', {
    p_patient_id: patientId,
  });
  if (error)
    return {
      data: null as PatientFinancialSummary | null,
      error: { message: error.message, code: error.code },
    };
  return {
    data: (data as PatientFinancialSummary) ?? null,
    error: null as SafeServiceError | null,
  };
}

async function invoke<T>(fn: string, body: Record<string, unknown>) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error)
    return {
      data: null as T | null,
      error: { message: error.message, code: error.name } as SafeServiceError,
    };
  return unwrap<T>(data);
}

export async function createPatientCustomer(
  patientId: string,
  billingIdentity?: PatientBillingIdentityInput
) {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para criar customer.' } };
  }
  if (isMockEnabled())
    return { data: { id: `mock-customer-${patientId}` }, error: null as SafeServiceError | null };
  return invoke<{ id: string }>('asaas-create-patient-customer', {
    patient_id: patientId,
    ...(billingIdentity?.cpfCnpj ? { cpf_cnpj: billingIdentity.cpfCnpj } : {}),
  });
}

export async function createPatientInvoice(
  patientId: string,
  amount: number,
  description: string,
  dueDate: string,
  billingIdentity?: PatientBillingIdentityInput,
  options?: BillingActionOptions
) {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para criar cobranca.' } };
  }
  const amountCents = validateAmountCents(amount);
  if (!amountCents) {
    return { data: null, error: { message: 'Valor invalido para criar cobranca.' } };
  }
  if (!description.trim()) {
    return { data: null, error: { message: 'Descricao obrigatoria para criar cobranca.' } };
  }
  if (!isValidDateInput(dueDate)) {
    return { data: null, error: { message: 'Data de vencimento invalida.' } };
  }

  if (isMockEnabled())
    return {
      data: {
        id: `mock-invoice-${Date.now()}`,
        paymentLink: `https://mock.pay/${patientId}`,
        invoiceUrl: null,
      },
      error: null as SafeServiceError | null,
    };

  const customer = await createPatientCustomer(patientId, billingIdentity);
  if (customer.error) return { data: null, error: customer.error };

  const idempotencyKey = normalizeIdempotencyKey(options?.idempotencyKey);
  const payload = {
    patient_id: patientId,
    amount_cents: amountCents,
    description: description.trim(),
    due_date: dueDate,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  };
  const res = await invoke<unknown>('asaas-create-patient-invoice', payload);
  if (res.error) return { data: null, error: res.error };
  const charge = asChargeResult(res.data);
  return {
    data: charge,
    error: charge
      ? null
      : { message: 'Contrato invalido retornado pela Edge Function de cobranca.' },
  };
}

export async function createPatientSubscription(
  patientId: string,
  packageId: string,
  amount: number,
  interval: string,
  billingIdentity?: PatientBillingIdentityInput,
  options?: BillingActionOptions
) {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para criar assinatura.' } };
  }
  const amountCents = validateAmountCents(amount);
  if (!amountCents) {
    return { data: null, error: { message: 'Valor invalido para criar assinatura.' } };
  }

  if (isMockEnabled())
    return {
      data: {
        id: `mock-sub-${Date.now()}`,
        paymentLink: `https://mock.pay/sub/${patientId}`,
        invoiceUrl: null,
      },
      error: null as SafeServiceError | null,
    };

  const customer = await createPatientCustomer(patientId, billingIdentity);
  if (customer.error) return { data: null, error: customer.error };

  const idempotencyKey = normalizeIdempotencyKey(options?.idempotencyKey);
  const payload = {
    patient_id: patientId,
    package_id: packageId,
    amount_cents: amountCents,
    cycle: interval,
    next_due_date: new Date().toISOString().slice(0, 10),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  };
  const res = await invoke<unknown>('asaas-create-patient-subscription', payload);
  if (res.error) return { data: null, error: res.error };
  const charge = asChargeResult(res.data);
  return {
    data: charge,
    error: charge
      ? null
      : { message: 'Contrato invalido retornado pela Edge Function de assinatura.' },
  };
}

export async function getClinicFinanceOverview() {
  if (isMockEnabled()) {
    return {
      data: {
        metrics: {
          monthlyRevenue: 184320,
          pendingReceivables: 41980,
          overdueReceivables: 14760,
          activeSubscriptionsAndPackages: 126,
        },
        recentCharges: [
          {
            id: 'c1',
            patientName: 'Juliana Pereira',
            description: 'Parcela mensal',
            amount: 400,
            dueDate: '2026-06-01',
            status: 'pendente',
          },
          {
            id: 'c2',
            patientName: 'Bruno Costa',
            description: 'Pacote trimestral',
            amount: 1200,
            dueDate: '2026-05-02',
            status: 'pago',
          },
        ],
      } as ClinicFinanceOverview,
      error: null as SafeServiceError | null,
    };
  }
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('get_clinic_finance_overview');
  if (error)
    return {
      data: null as ClinicFinanceOverview | null,
      error: { message: error.message, code: error.code },
    };
  return { data: data as ClinicFinanceOverview, error: null as SafeServiceError | null };
}

export async function getClinicFinanceReconciliation() {
  if (isMockEnabled()) {
    return {
      data: {
        summary: {
          divergences: 2,
          highSeverity: 1,
          mediumSeverity: 1,
          failedWebhookEvents: 1,
          pendingInvoices: 4,
          overdueInvoices: 2,
          unmatchedPayments: 1,
          lastCheckedAt: new Date().toISOString(),
        },
        divergences: [
          {
            id: 'mock-amount-mismatch',
            kind: 'amount_mismatch',
            severity: 'high',
            patientId: 'mock-patient-1',
            patientName: 'Juliana Pereira',
            invoiceId: 'mock-invoice-1',
            paymentId: 'mock-payment-1',
            description: 'Valor do pagamento conciliado difere da cobranca local.',
            expectedStatus: 'pendente',
            actualStatus: 'pending',
            expectedAmount: 400,
            actualAmount: 390,
            dueDate: '2026-06-01',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'mock-webhook-unresolved',
            kind: 'webhook_unresolved',
            severity: 'medium',
            patientId: null,
            patientName: 'Webhook Asaas',
            invoiceId: null,
            paymentId: null,
            description: 'Evento Asaas exige revisao operacional.',
            expectedStatus: 'processed',
            actualStatus: 'ignored',
            expectedAmount: null,
            actualAmount: null,
            dueDate: null,
            createdAt: new Date().toISOString(),
          },
        ],
        recentEvents: [
          {
            id: 'mock-event-1',
            eventType: 'PAYMENT_CONFIRMED',
            status: 'processed',
            errorMessage: null,
            createdAt: new Date().toISOString(),
            processedAt: new Date().toISOString(),
          },
        ],
      } as ClinicFinanceReconciliation,
      error: null as SafeServiceError | null,
    };
  }

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('get_clinic_finance_reconciliation');
  if (error)
    return {
      data: null as ClinicFinanceReconciliation | null,
      error: { message: error.message, code: error.code },
    };
  return {
    data: data as ClinicFinanceReconciliation,
    error: null as SafeServiceError | null,
  };
}
