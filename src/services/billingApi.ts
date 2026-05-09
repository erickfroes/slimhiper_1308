import type { PatientFinancialSummary } from '@/domain/types';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getPatient360 } from '@/services/mockApi';

export interface SafeServiceError { message: string; code?: string; details?: string }

type EdgeResponseEnvelope<T> = { ok: boolean; data?: T; error?: { message?: string; code?: string; details?: string } };

export interface ChargeActionResult {
  id: string;
  status?: string;
  paymentLink?: string | null;
  invoiceUrl?: string | null;
}

export interface ClinicFinanceOverview {
  metrics: {
    monthlyRevenue: number;
    pendingReceivables: number;
    overdueReceivables: number;
    activeSubscriptionsAndPackages: number;
  };
  recentCharges: Array<{ id: string; patientName: string; description: string; amount: number; dueDate: string; status: 'pendente' | 'pago' | 'vencido' | 'cancelado' }>;
}

function isMockEnabled() { return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'; }

function unwrap<T>(response: unknown): { data: T | null; error: SafeServiceError | null } {
  if (response && typeof response === 'object' && 'ok' in response) {
    const e = response as EdgeResponseEnvelope<T>;
    if (e.ok) return { data: (e.data ?? null) as T | null, error: null };
    return { data: null, error: { message: e.error?.message ?? e.error?.code ?? 'Edge function request failed.', code: e.error?.code, details: e.error?.details } };
  }
  return { data: response as T, error: null };
}

function asChargeResult(payload: unknown): ChargeActionResult {
  const r = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? r.invoice_id ?? r.subscription_id ?? crypto.randomUUID()),
    status: typeof r.status === 'string' ? r.status : undefined,
    paymentLink: typeof r.payment_link === 'string' ? r.payment_link : typeof r.invoice_url === 'string' ? r.invoice_url : null,
    invoiceUrl: typeof r.invoice_url === 'string' ? r.invoice_url : null,
  };
}

export async function getPatientFinancialSummary(patientId: string) {
  if (isMockEnabled()) {
    const p = await getPatient360(patientId);
    return { data: p?.financial ?? null, error: null as SafeServiceError | null };
  }
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('get_patient_financial_summary', { p_patient_id: patientId });
  if (error) return { data: null as PatientFinancialSummary | null, error: { message: error.message, code: error.code } };
  return { data: (data as PatientFinancialSummary) ?? null, error: null as SafeServiceError | null };
}

async function invoke<T>(fn: string, body: Record<string, unknown>) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) return { data: null as T | null, error: { message: error.message, code: error.name } as SafeServiceError };
  return unwrap<T>(data);
}

export async function createPatientCustomer(patientId: string) {
  if (isMockEnabled()) return { data: { id: `mock-customer-${patientId}` }, error: null as SafeServiceError | null };
  return invoke<{ id: string }>('asaas-create-patient-customer', { patient_id: patientId });
}

export async function createPatientInvoice(patientId: string, amount: number, description: string, dueDate: string) {
  if (isMockEnabled()) return { data: { id: `mock-invoice-${Date.now()}`, paymentLink: `https://mock.pay/${patientId}` }, error: null as SafeServiceError | null };
  const payload = { patient_id: patientId, amount_cents: Math.round(amount * 100), description, due_date: dueDate };
  const res = await invoke<unknown>('asaas-create-patient-invoice', payload);
  return { data: res.data ? asChargeResult(res.data) : null, error: res.error };
}

export async function createPatientSubscription(patientId: string, packageId: string, amount: number, interval: string) {
  if (isMockEnabled()) return { data: { id: `mock-sub-${Date.now()}`, paymentLink: `https://mock.pay/sub/${patientId}` }, error: null as SafeServiceError | null };
  const payload = { patient_id: patientId, package_id: packageId, amount_cents: Math.round(amount * 100), cycle: interval, next_due_date: new Date().toISOString().slice(0, 10) };
  const res = await invoke<unknown>('asaas-create-patient-subscription', payload);
  return { data: res.data ? asChargeResult(res.data) : null, error: res.error };
}

export async function getClinicFinanceOverview() {
  if (isMockEnabled()) {
    return {
      data: {
        metrics: { monthlyRevenue: 184320, pendingReceivables: 41980, overdueReceivables: 14760, activeSubscriptionsAndPackages: 126 },
        recentCharges: [
          { id: 'c1', patientName: 'Juliana Pereira', description: 'Parcela mensal', amount: 400, dueDate: '2026-06-01', status: 'pendente' },
          { id: 'c2', patientName: 'Bruno Costa', description: 'Pacote trimestral', amount: 1200, dueDate: '2026-05-02', status: 'pago' },
        ],
      } as ClinicFinanceOverview,
      error: null as SafeServiceError | null,
    };
  }
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('get_clinic_finance_overview');
  if (error) return { data: null as ClinicFinanceOverview | null, error: { message: error.message, code: error.code } };
  return { data: data as ClinicFinanceOverview, error: null as SafeServiceError | null };
}
