import type {
  PatientBillingRefund,
  PatientBillingSubscription,
  PatientFinancialSummary,
  PatientPaymentReceipt,
} from '@/domain/types';
import { isMockDataEnabled } from '@/lib/mockMode';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { asSafePaymentUrl } from '@/lib/safeExternalUrl';
import { requireClientFeatureFlag } from '@/services/clientEntitlementGuard';

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
  provider?: BillingProvider;
  idempotencyKey?: string;
  sourceModule?: string;
  programId?: string | null;
  packageId?: string | null;
  enrollmentId?: string | null;
  serviceId?: string | null;
}

export interface PatientFinancialLocalActionResult {
  id: string;
  status: string;
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

export interface ClinicFinanceM13ReceiptQueueItem extends PatientPaymentReceipt {
  patientId: string;
  patientName: string;
  invoiceId: string | null;
}

export interface ClinicFinanceM13SubscriptionItem extends PatientBillingSubscription {
  patientId: string;
  patientName: string;
}

export interface ClinicFinanceM13RefundItem extends PatientBillingRefund {
  patientId: string;
  patientName: string;
  errorCode: string | null;
}

export interface ClinicFinanceM13SyncJob {
  id: string;
  invoiceId: string;
  status: string;
  source: string;
  reason: string;
  requestedAt: string | null;
  processedAt: string | null;
  errorCode: string | null;
}

export interface ClinicFinanceM13Dashboard {
  receiptQueue: ClinicFinanceM13ReceiptQueueItem[];
  recurrence: {
    active: number;
    paused: number;
    cancelled: number;
    upcoming: ClinicFinanceM13SubscriptionItem[];
  };
  refunds: ClinicFinanceM13RefundItem[];
  syncJobs: ClinicFinanceM13SyncJob[];
  lastRun?: {
    id: string;
    source: string;
    status: string;
    checkedInvoiceCount: number;
    queuedSyncCount: number;
    pendingReceiptCount: number;
    divergenceCount: number;
    startedAt?: string | null;
    finishedAt?: string | null;
  } | null;
  generatedAt?: string | null;
}

interface PatientFinanceM13Payload {
  paymentReceipts: PatientPaymentReceipt[];
  subscriptions: PatientBillingSubscription[];
  refunds: PatientBillingRefund[];
}

export const PAYMENT_RECEIPT_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

export const PAYMENT_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export type BillingProvider = 'asaas' | 'mercadopago';

export const ACTIVE_BILLING_PROVIDER: BillingProvider = 'mercadopago';

const PAYMENT_PROVIDER_DISABLED_MESSAGE =
  'Provedor de pagamento nao esta habilitado no plano deste tenant.';
const BILLING_PROVIDER_FEATURE_FLAGS = ['financial.mercadopago', 'financial.asaas'] as const;
const BILLING_EDGE_FUNCTIONS = {
  asaas: {
    customer: 'asaas-create-patient-customer',
    charge: 'asaas-create-patient-invoice',
    subscription: 'asaas-create-patient-subscription',
    refund: 'asaas-refund-payment',
    sync: 'asaas-sync-payment',
  },
  mercadopago: {
    customer: 'mercadopago-create-patient-customer',
    charge: 'mercadopago-create-patient-invoice',
    subscription: 'mercadopago-create-patient-subscription',
    refund: 'mercadopago-refund-payment',
    sync: 'mercadopago-sync-payment',
  },
} satisfies Record<
  BillingProvider,
  Record<'customer' | 'charge' | 'subscription' | 'refund' | 'sync', string>
>;

function isMockEnabled() {
  return isMockDataEnabled();
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
  const paymentLink = asSafePaymentUrl(r.payment_link) ?? asSafePaymentUrl(r.invoice_url);
  const invoiceUrl = asSafePaymentUrl(r.invoice_url);

  return {
    id,
    status: typeof r.status === 'string' ? r.status : undefined,
    paymentLink,
    invoiceUrl,
  };
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

function centsToAmount(value: unknown) {
  const cents =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : 0;
  return Number.isFinite(cents) ? Math.round((cents / 100) * 100) / 100 : 0;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeIdempotencyKey(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length <= 120 ? normalized : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function billingContextPayload(options?: BillingActionOptions): Record<string, string> {
  const context: Record<string, string> = {};
  if (options?.sourceModule?.trim()) context.source_module = options.sourceModule.trim();
  if (options?.programId?.trim()) context.program_id = options.programId.trim();
  if (options?.packageId?.trim()) context.package_id = options.packageId.trim();
  if (options?.enrollmentId?.trim()) context.enrollment_id = options.enrollmentId.trim();
  if (options?.serviceId?.trim()) context.service_id = options.serviceId.trim();
  return context;
}

function normalizePaymentReceipt(value: unknown): PatientPaymentReceipt | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    invoiceId: asNullableString(record.invoiceId),
    paymentId: asNullableString(record.paymentId),
    amountCents: Math.max(0, asNumber(record.amountCents)),
    status: asString(record.status, 'pending_review'),
    submittedAt: asNullableString(record.submittedAt),
    uploadedAt: asNullableString(record.uploadedAt),
    reviewedAt: asNullableString(record.reviewedAt),
    reviewNote: asNullableString(record.reviewNote),
    rejectionReason: asNullableString(record.rejectionReason),
    fileName: asNullableString(record.fileName),
    mimeType: asNullableString(record.mimeType),
    sizeBytes: asNumber(record.sizeBytes) || null,
    sourceModule: asNullableString(record.sourceModule),
    programId: asNullableString(record.programId),
    packageId: asNullableString(record.packageId),
    enrollmentId: asNullableString(record.enrollmentId),
    serviceId: asNullableString(record.serviceId),
  };
}

function normalizeSubscription(value: unknown): PatientBillingSubscription | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    status: asString(record.status, 'active'),
    cycle: asString(record.cycle, 'monthly'),
    amountCents: Math.max(0, asNumber(record.amountCents)),
    nextDueDate: asNullableString(record.nextDueDate),
    description: asNullableString(record.description),
    createdAt: asNullableString(record.createdAt),
    sourceModule: asNullableString(record.sourceModule),
    programId: asNullableString(record.programId),
    packageId: asNullableString(record.packageId),
    enrollmentId: asNullableString(record.enrollmentId),
    serviceId: asNullableString(record.serviceId),
  };
}

function normalizeRefund(value: unknown): PatientBillingRefund | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    invoiceId: asNullableString(record.invoiceId),
    paymentId: asNullableString(record.paymentId),
    status: asString(record.status, 'requested'),
    amountCents: Math.max(0, asNumber(record.amountCents)),
    reason: asString(record.reason, 'Estorno financeiro'),
    requestedAt: asNullableString(record.requestedAt),
    processedAt: asNullableString(record.processedAt),
  };
}

function normalizePatientFinanceM13(value: unknown): PatientFinanceM13Payload {
  const record = asRecord(value);
  return {
    paymentReceipts: Array.isArray(record.paymentReceipts)
      ? record.paymentReceipts
          .map(normalizePaymentReceipt)
          .filter((item): item is PatientPaymentReceipt => Boolean(item))
      : [],
    subscriptions: Array.isArray(record.subscriptions)
      ? record.subscriptions
          .map(normalizeSubscription)
          .filter((item): item is PatientBillingSubscription => Boolean(item))
      : [],
    refunds: Array.isArray(record.refunds)
      ? record.refunds
          .map(normalizeRefund)
          .filter((item): item is PatientBillingRefund => Boolean(item))
      : [],
  };
}

function isIgnorableLocalFinancialReadError(error: { code?: string } | null) {
  return Boolean(
    error && (error.code === '42P01' || error.code === '42703' || error.code === '42883')
  );
}

async function hydrateLocalFinancialRecords(
  patientId: string,
  summary: PatientFinancialSummary
): Promise<PatientFinancialSummary> {
  const invoices = Array.isArray(summary.invoices) ? summary.invoices : [];
  const paymentHistory = Array.isArray(summary.paymentHistory) ? summary.paymentHistory : [];
  const baseCharges =
    summary.charges && summary.charges.length > 0
      ? summary.charges
      : invoices.map((invoice) => ({
          id: invoice.id,
          description: invoice.description,
          amount: invoice.amount,
          issuedAt: invoice.dueDate,
          dueDate: invoice.dueDate,
          status: invoice.status,
          chargeType: 'link_pagamento' as const,
          sentAt: invoice.dueDate,
        }));

  const supabase = createBrowserSupabaseClient();
  const [receiptsRes, negotiationsRes, m13Res] = await Promise.all([
    supabase
      .from('patient_receipts')
      .select('id, description, amount_cents, issued_at, payment_date, receipt_number, payment_id')
      .eq('patient_id', patientId)
      .order('issued_at', { ascending: false }),
    supabase
      .from('billing_negotiations')
      .select(
        'id, description, original_amount_cents, negotiated_amount_cents, installments, status, notes, created_at'
      )
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false }),
    supabase.rpc('get_patient_finance_m13', {
      p_patient_id: patientId,
    }),
  ]);

  const receipts =
    receiptsRes.error && !isIgnorableLocalFinancialReadError(receiptsRes.error)
      ? summary.receipts
      : (receiptsRes.data ?? []).map((row: Record<string, unknown>) => ({
          id: asString(row.id),
          description: asString(row.description, 'Recibo'),
          amount: centsToAmount(row.amount_cents),
          issuedAt: asString(row.issued_at).slice(0, 10),
          paymentDate: asString(row.payment_date).slice(0, 10),
          issuedBy: 'Equipe',
          receiptNumber: asString(row.receipt_number, 'REC'),
          paymentId: asString(row.payment_id) || undefined,
        }));

  const negotiations =
    negotiationsRes.error && !isIgnorableLocalFinancialReadError(negotiationsRes.error)
      ? summary.negotiations
      : (negotiationsRes.data ?? []).map((row: Record<string, unknown>) => ({
          id: asString(row.id),
          description: asString(row.description, 'Renegociacao'),
          originalAmount: centsToAmount(row.original_amount_cents),
          negotiatedAmount: centsToAmount(row.negotiated_amount_cents),
          installments: Math.max(1, asNumber(row.installments, 1)),
          status: asString(row.status, 'ativa') as NonNullable<
            PatientFinancialSummary['negotiations']
          >[number]['status'],
          createdAt: asString(row.created_at).slice(0, 10),
          createdBy: 'Equipe',
          notes: asString(row.notes) || undefined,
        }));

  const hydratedReceipts = receipts ?? summary.receipts ?? [];
  const receiptIdByPaymentId = new Map(
    hydratedReceipts
      .filter((receipt) => receipt.paymentId)
      .map((receipt) => [receipt.paymentId as string, receipt.id])
  );
  const enrichedPaymentHistory = paymentHistory.map((payment) => ({
    ...payment,
    receiptId: payment.receiptId ?? receiptIdByPaymentId.get(payment.id),
  }));
  const m13 =
    m13Res.error && !isIgnorableLocalFinancialReadError(m13Res.error)
      ? { paymentReceipts: [], subscriptions: [], refunds: [] }
      : normalizePatientFinanceM13(m13Res.data);

  return {
    ...summary,
    charges: baseCharges,
    paymentHistory: enrichedPaymentHistory,
    receipts: hydratedReceipts,
    negotiations: negotiations ?? summary.negotiations ?? [],
    paymentReceipts: m13.paymentReceipts,
    subscriptions: m13.subscriptions,
    refunds: m13.refunds,
  };
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
  const summary = (data as PatientFinancialSummary) ?? null;
  if (!summary) {
    return { data: null as PatientFinancialSummary | null, error: null as SafeServiceError | null };
  }
  const hydrated = await hydrateLocalFinancialRecords(patientId, summary);
  return {
    data: hydrated,
    error: null as SafeServiceError | null,
  };
}

export async function getPatientFinanceM13(patientId: string): Promise<{
  data: PatientFinanceM13Payload | null;
  error: SafeServiceError | null;
}> {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para carregar financeiro.' } };
  }
  if (isMockEnabled()) {
    return {
      data: { paymentReceipts: [], subscriptions: [], refunds: [] },
      error: null,
    };
  }

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('get_patient_finance_m13', {
    p_patient_id: patientId,
  });
  if (error) return { data: null, error: { message: error.message, code: error.code } };
  return { data: normalizePatientFinanceM13(data), error: null };
}

function normalizePreparedPaymentReceipt(value: unknown): {
  id: string;
  bucket: string;
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
} | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const bucket = asString(record.bucket, 'payment-receipts');
  const path = asString(record.path);
  if (!id || bucket !== 'payment-receipts' || !path) return null;
  return {
    id,
    bucket,
    path,
    fileName: asString(record.fileName, 'comprovante.pdf'),
    mimeType: asString(record.mimeType, 'application/pdf'),
    sizeBytes: Math.max(0, asNumber(record.sizeBytes)),
    status: asString(record.status, 'pending_upload'),
  };
}

function inferPaymentReceiptMimeType(file: File) {
  if ((PAYMENT_RECEIPT_ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return file.type;
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  return file.type || 'application/octet-stream';
}

export function validatePaymentReceiptFile(file: File | null | undefined): SafeServiceError | null {
  if (!file) return { message: 'Selecione um comprovante para enviar.', code: 'missing_file' };
  if (file.size <= 0 || file.size > PAYMENT_RECEIPT_MAX_BYTES) {
    return { message: 'O comprovante precisa ter ate 10 MB.', code: 'invalid_receipt_size' };
  }
  const mimeType = inferPaymentReceiptMimeType(file);
  if (!(PAYMENT_RECEIPT_ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return {
      message: 'Use PDF ou imagem JPG, PNG, WebP, HEIC ou HEIF.',
      code: 'invalid_receipt_type',
    };
  }
  return null;
}

export async function uploadPatientPaymentReceipt(input: {
  patientId: string;
  invoiceId?: string | null;
  amountCents: number;
  file: File;
  note?: string;
}): Promise<{ data: PatientPaymentReceipt | null; error: SafeServiceError | null }> {
  const fileError = validatePaymentReceiptFile(input.file);
  if (fileError) return { data: null, error: fileError };
  if (!input.patientId.trim() || !Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { data: null, error: { message: 'Dados invalidos para enviar comprovante.' } };
  }
  if (isMockEnabled()) {
    return {
      data: {
        id: `mock-payment-receipt-${Date.now()}`,
        invoiceId: input.invoiceId ?? null,
        amountCents: input.amountCents,
        status: 'pending_review',
        submittedAt: new Date().toISOString(),
        uploadedAt: new Date().toISOString(),
        fileName: input.file.name,
        mimeType: inferPaymentReceiptMimeType(input.file),
        sizeBytes: input.file.size,
      },
      error: null,
    };
  }

  const supabase = createBrowserSupabaseClient();
  const mimeType = inferPaymentReceiptMimeType(input.file);
  const { data: preparedPayload, error: prepareError } = await supabase.rpc(
    'prepare_payment_receipt_upload',
    {
      p_patient_id: input.patientId,
      p_invoice_id: input.invoiceId ?? null,
      p_amount_cents: Math.round(input.amountCents),
      p_file_name: input.file.name,
      p_mime_type: mimeType,
      p_size_bytes: input.file.size,
      p_note: input.note ?? null,
    }
  );

  if (prepareError) {
    return {
      data: null,
      error: { message: 'Nao foi possivel preparar o comprovante.', code: prepareError.code },
    };
  }
  const prepared = normalizePreparedPaymentReceipt(preparedPayload);
  if (!prepared) return { data: null, error: { message: 'Contrato invalido do comprovante.' } };

  const { error: uploadError } = await supabase.storage
    .from(prepared.bucket)
    .upload(prepared.path, input.file, { contentType: prepared.mimeType, upsert: false });

  if (uploadError) {
    await supabase.rpc('complete_payment_receipt_upload', {
      p_receipt_id: prepared.id,
      p_status: 'failed',
    });
    return { data: null, error: { message: 'Comprovante criado, mas upload falhou.' } };
  }

  const { data: completed, error: completeError } = await supabase.rpc(
    'complete_payment_receipt_upload',
    {
      p_receipt_id: prepared.id,
      p_status: 'pending_review',
    }
  );
  if (completeError) {
    return {
      data: null,
      error: {
        message: 'Upload enviado, mas status nao foi atualizado.',
        code: completeError.code,
      },
    };
  }

  return {
    data:
      normalizePaymentReceipt({
        ...asRecord(completed),
        id: prepared.id,
        invoiceId: input.invoiceId ?? null,
        amountCents: input.amountCents,
        status: 'pending_review',
        submittedAt: new Date().toISOString(),
        uploadedAt: new Date().toISOString(),
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        sizeBytes: prepared.sizeBytes,
      }) ?? null,
    error: null,
  };
}

export async function getPaymentReceiptSignedUrl(
  receiptId: string,
  expiresInSeconds = 300
): Promise<{
  data: { url: string; expiresInSeconds: number } | null;
  error: SafeServiceError | null;
}> {
  if (!receiptId.trim()) return { data: null, error: { message: 'Comprovante invalido.' } };
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('get_payment_receipt_download', {
    p_receipt_id: receiptId,
    p_expires_in: expiresInSeconds,
  });
  if (error) {
    return {
      data: null,
      error: { message: 'Nao foi possivel abrir o comprovante.', code: error.code },
    };
  }

  const record = asRecord(data);
  const bucket = asString(record.bucket, 'payment-receipts');
  const path = asString(record.path);
  const expiresIn = Math.max(60, Math.min(600, asNumber(record.expiresInSeconds, 300)));
  if (bucket !== 'payment-receipts' || !path) {
    return { data: null, error: { message: 'Contrato privado do comprovante invalido.' } };
  }

  const signed = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (signed.error || !signed.data?.signedUrl) {
    return { data: null, error: { message: 'Nao foi possivel gerar link temporario.' } };
  }
  return { data: { url: signed.data.signedUrl, expiresInSeconds: expiresIn }, error: null };
}

async function createLocalFinancialAction(
  patientId: string,
  action: 'reminder' | 'receipt' | 'payment' | 'contract' | 'negotiation',
  payload: Record<string, unknown>
): Promise<{
  data: PatientFinancialLocalActionResult | null;
  error: SafeServiceError | null;
}> {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para acao financeira.' } };
  }
  if (isMockEnabled()) {
    return { data: { id: `mock-${action}-${Date.now()}`, status: 'created' }, error: null };
  }
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('create_patient_financial_local_action', {
    p_patient_id: patientId,
    p_action: action,
    p_payload: payload,
  });
  if (error) return { data: null, error: { message: error.message, code: error.code } };
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return {
    data: {
      id: asString(record.id),
      status: asString(record.status, 'created'),
    },
    error: null,
  };
}

export async function sendPaymentReminder(patientId: string, invoiceId?: string) {
  return createLocalFinancialAction(patientId, 'reminder', {
    channel: 'manual',
    invoiceId: invoiceId?.trim() || null,
  });
}

export async function createPatientReceipt(
  patientId: string,
  amount: number,
  description: string,
  paymentId?: string
) {
  const amountCents = validateAmountCents(amount);
  if (!amountCents) {
    return { data: null, error: { message: 'Valor invalido para recibo.' } };
  }
  if (!description.trim()) {
    return { data: null, error: { message: 'Descricao obrigatoria para recibo.' } };
  }
  return createLocalFinancialAction(patientId, 'receipt', {
    amountCents,
    description: description.trim(),
    paymentId: paymentId?.trim() || null,
  });
}

export async function registerPatientManualPayment(
  patientId: string,
  amount: number,
  description: string,
  method: 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'transferencia',
  invoiceId?: string
) {
  const amountCents = validateAmountCents(amount);
  if (!amountCents) {
    return { data: null, error: { message: 'Valor invalido para pagamento.' } };
  }
  if (!description.trim()) {
    return { data: null, error: { message: 'Descricao obrigatoria para pagamento.' } };
  }
  return createLocalFinancialAction(patientId, 'payment', {
    amountCents,
    description: description.trim(),
    method,
    invoiceId: invoiceId?.trim() || null,
    paidAt: new Date().toISOString(),
  });
}

export async function createPatientFinancialContract(
  patientId: string,
  amount: number,
  title: string
) {
  const amountCents = validateAmountCents(amount);
  if (!amountCents) {
    return { data: null, error: { message: 'Valor invalido para contrato.' } };
  }
  if (!title.trim()) {
    return { data: null, error: { message: 'Titulo obrigatorio para contrato.' } };
  }
  return createLocalFinancialAction(patientId, 'contract', {
    amountCents,
    title: title.trim(),
  });
}

export async function createBillingNegotiation(
  patientId: string,
  originalAmount: number,
  negotiatedAmount: number,
  installments: number,
  notes?: string
) {
  const originalAmountCents = validateAmountCents(originalAmount);
  const negotiatedAmountCents = validateAmountCents(negotiatedAmount);
  if (!originalAmountCents || !negotiatedAmountCents) {
    return { data: null, error: { message: 'Valores invalidos para renegociacao.' } };
  }
  if (!Number.isFinite(installments) || installments < 1 || installments > 60) {
    return { data: null, error: { message: 'Parcelas invalidas para renegociacao.' } };
  }
  return createLocalFinancialAction(patientId, 'negotiation', {
    originalAmountCents,
    negotiatedAmountCents,
    installments: Math.round(installments),
    notes: notes?.trim() || null,
  });
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

async function requireBillingProviderFeatureFlag() {
  let entitlementCheckFailed: SafeServiceError | null = null;

  for (const featureFlag of BILLING_PROVIDER_FEATURE_FLAGS) {
    const error = await requireClientFeatureFlag(featureFlag, PAYMENT_PROVIDER_DISABLED_MESSAGE);
    if (!error) return null;
    if (error.code === 'entitlement_check_failed') entitlementCheckFailed = error;
  }

  return entitlementCheckFailed ?? { message: PAYMENT_PROVIDER_DISABLED_MESSAGE };
}

function billingEdgeFunction(
  action: keyof (typeof BILLING_EDGE_FUNCTIONS)[BillingProvider],
  provider: BillingProvider = ACTIVE_BILLING_PROVIDER
) {
  return BILLING_EDGE_FUNCTIONS[provider][action];
}

export async function createBillingCustomer(
  patientId: string,
  billingIdentity?: PatientBillingIdentityInput,
  provider: BillingProvider = ACTIVE_BILLING_PROVIDER
) {
  if (!patientId.trim()) {
    return { data: null, error: { message: 'Paciente invalido para preparar cobranca.' } };
  }
  if (isMockEnabled())
    return { data: { id: `mock-customer-${patientId}` }, error: null as SafeServiceError | null };
  const entitlementError = await requireBillingProviderFeatureFlag();
  if (entitlementError) return { data: null, error: entitlementError };
  return invoke<{ id: string; status?: string }>(billingEdgeFunction('customer', provider), {
    patient_id: patientId,
    ...(billingIdentity?.cpfCnpj ? { cpf_cnpj: billingIdentity.cpfCnpj } : {}),
  });
}

export async function createPatientCustomer(
  patientId: string,
  billingIdentity?: PatientBillingIdentityInput
) {
  return createBillingCustomer(patientId, billingIdentity, 'asaas');
}

export async function createPatientCharge(
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

  const provider = options?.provider ?? ACTIVE_BILLING_PROVIDER;
  const entitlementError = await requireBillingProviderFeatureFlag();
  if (entitlementError) return { data: null, error: entitlementError };

  if (provider === 'asaas') {
    const customer = await createBillingCustomer(patientId, billingIdentity, provider);
    if (customer.error) return { data: null, error: customer.error };
  }

  const idempotencyKey = normalizeIdempotencyKey(options?.idempotencyKey);
  const payload = {
    patient_id: patientId,
    amount_cents: amountCents,
    description: description.trim(),
    due_date: dueDate,
    ...billingContextPayload(options),
    ...(billingIdentity?.cpfCnpj ? { cpf_cnpj: billingIdentity.cpfCnpj } : {}),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  };
  const res = await invoke<unknown>(billingEdgeFunction('charge', provider), payload);
  if (res.error) return { data: null, error: res.error };
  const charge = asChargeResult(res.data);
  return {
    data: charge,
    error: charge
      ? null
      : { message: 'Contrato invalido retornado pela Edge Function de cobranca.' },
  };
}

export async function createPatientInvoice(
  patientId: string,
  amount: number,
  description: string,
  dueDate: string,
  billingIdentity?: PatientBillingIdentityInput,
  options?: BillingActionOptions
) {
  return createPatientCharge(patientId, amount, description, dueDate, billingIdentity, options);
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
        status: 'active',
        paymentLink: null,
        invoiceUrl: null,
      },
      error: null as SafeServiceError | null,
    };

  const provider = options?.provider ?? ACTIVE_BILLING_PROVIDER;
  const entitlementError = await requireBillingProviderFeatureFlag();
  if (entitlementError) return { data: null, error: entitlementError };

  if (provider === 'asaas') {
    const customer = await createBillingCustomer(patientId, billingIdentity, provider);
    if (customer.error) return { data: null, error: customer.error };
  }

  const idempotencyKey = normalizeIdempotencyKey(options?.idempotencyKey);
  const payload = {
    patient_id: patientId,
    package_id: packageId,
    amount_cents: amountCents,
    cycle: interval,
    next_due_date: new Date().toISOString().slice(0, 10),
    ...billingContextPayload(options),
    ...(billingIdentity?.cpfCnpj ? { cpf_cnpj: billingIdentity.cpfCnpj } : {}),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  };
  const res = await invoke<unknown>(billingEdgeFunction('subscription', provider), payload);
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
            patientName: 'Webhook provedor',
            invoiceId: null,
            paymentId: null,
            description: 'Evento do provedor de pagamento exige revisao operacional.',
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

function normalizeClinicM13Dashboard(value: unknown): ClinicFinanceM13Dashboard {
  const record = asRecord(value);
  const recurrenceRecord = asRecord(record.recurrence);
  const lastRunRecord = asRecord(record.lastRun);
  return {
    receiptQueue: Array.isArray(record.receiptQueue)
      ? record.receiptQueue
          .map((item) => {
            const receipt = normalizePaymentReceipt(item);
            const source = asRecord(item);
            if (!receipt) return null;
            return {
              ...receipt,
              patientId: asString(source.patientId),
              patientName: asString(source.patientName, 'Paciente'),
              invoiceId: asNullableString(source.invoiceId),
            };
          })
          .filter((item): item is ClinicFinanceM13ReceiptQueueItem => Boolean(item))
      : [],
    recurrence: {
      active: asNumber(recurrenceRecord.active),
      paused: asNumber(recurrenceRecord.paused),
      cancelled: asNumber(recurrenceRecord.cancelled),
      upcoming: Array.isArray(recurrenceRecord.upcoming)
        ? recurrenceRecord.upcoming
            .map((item) => {
              const subscription = normalizeSubscription(item);
              const source = asRecord(item);
              if (!subscription) return null;
              return {
                ...subscription,
                patientId: asString(source.patientId),
                patientName: asString(source.patientName, 'Paciente'),
              };
            })
            .filter((item): item is ClinicFinanceM13SubscriptionItem => Boolean(item))
        : [],
    },
    refunds: Array.isArray(record.refunds)
      ? record.refunds
          .map((item) => {
            const refund = normalizeRefund(item);
            const source = asRecord(item);
            if (!refund) return null;
            return {
              ...refund,
              patientId: asString(source.patientId),
              patientName: asString(source.patientName, 'Paciente'),
              errorCode: asNullableString(source.errorCode),
            };
          })
          .filter((item): item is ClinicFinanceM13RefundItem => Boolean(item))
      : [],
    syncJobs: Array.isArray(record.syncJobs)
      ? record.syncJobs
          .map((item) => {
            const source = asRecord(item);
            const id = asString(source.id);
            const invoiceId = asString(source.invoiceId);
            if (!id || !invoiceId) return null;
            return {
              id,
              invoiceId,
              status: asString(source.status, 'queued'),
              source: asString(source.source, 'manual'),
              reason: asString(source.reason, 'sync'),
              requestedAt: asNullableString(source.requestedAt),
              processedAt: asNullableString(source.processedAt),
              errorCode: asNullableString(source.errorCode),
            };
          })
          .filter((item): item is ClinicFinanceM13SyncJob => Boolean(item))
      : [],
    lastRun: lastRunRecord.id
      ? {
          id: asString(lastRunRecord.id),
          source: asString(lastRunRecord.source, 'cron'),
          status: asString(lastRunRecord.status, 'completed'),
          checkedInvoiceCount: asNumber(lastRunRecord.checkedInvoiceCount),
          queuedSyncCount: asNumber(lastRunRecord.queuedSyncCount),
          pendingReceiptCount: asNumber(lastRunRecord.pendingReceiptCount),
          divergenceCount: asNumber(lastRunRecord.divergenceCount),
          startedAt: asNullableString(lastRunRecord.startedAt),
          finishedAt: asNullableString(lastRunRecord.finishedAt),
        }
      : null,
    generatedAt: asNullableString(record.generatedAt),
  };
}

export async function getClinicFinanceM13Dashboard() {
  if (isMockEnabled()) {
    return {
      data: {
        receiptQueue: [],
        recurrence: { active: 12, paused: 1, cancelled: 2, upcoming: [] },
        refunds: [],
        syncJobs: [],
        lastRun: null,
        generatedAt: new Date().toISOString(),
      } as ClinicFinanceM13Dashboard,
      error: null as SafeServiceError | null,
    };
  }

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('get_clinic_finance_m13_dashboard');
  if (error)
    return {
      data: null as ClinicFinanceM13Dashboard | null,
      error: { message: error.message, code: error.code },
    };
  return {
    data: normalizeClinicM13Dashboard(data),
    error: null as SafeServiceError | null,
  };
}

export async function reviewPaymentReceipt(
  receiptId: string,
  decision: 'approve' | 'reject',
  reason?: string
) {
  if (!receiptId.trim()) return { data: null, error: { message: 'Comprovante invalido.' } };
  if (decision === 'reject' && !reason?.trim()) {
    return { data: null, error: { message: 'Informe o motivo da rejeicao.' } };
  }
  if (isMockEnabled()) {
    return {
      data: { id: receiptId, status: decision === 'approve' ? 'approved' : 'rejected' },
      error: null as SafeServiceError | null,
    };
  }
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('review_payment_receipt', {
    p_receipt_id: receiptId,
    p_decision: decision,
    p_reason: reason?.trim() || null,
  });
  if (error) return { data: null, error: { message: error.message, code: error.code } };
  const record = asRecord(data);
  return {
    data: { id: asString(record.id, receiptId), status: asString(record.status) },
    error: null as SafeServiceError | null,
  };
}

export async function refundProviderPayment(input: {
  paymentId?: string | null;
  invoiceId?: string | null;
  amountCents: number;
  reason: string;
  idempotencyKey?: string;
  provider?: BillingProvider;
}) {
  if (!input.paymentId?.trim() && !input.invoiceId?.trim()) {
    return { data: null, error: { message: 'Pagamento ou cobranca obrigatoria para estorno.' } };
  }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { data: null, error: { message: 'Valor invalido para estorno.' } };
  }
  if (input.reason.trim().length < 10) {
    return {
      data: null,
      error: { message: 'Informe um motivo de estorno com pelo menos 10 caracteres.' },
    };
  }
  if (isMockEnabled()) {
    return {
      data: {
        id: `mock-refund-${Date.now()}`,
        status: 'succeeded',
        amountCents: input.amountCents,
      },
      error: null as SafeServiceError | null,
    };
  }
  const provider = input.provider ?? ACTIVE_BILLING_PROVIDER;
  const entitlementError = await requireBillingProviderFeatureFlag();
  if (entitlementError) return { data: null, error: entitlementError };
  const res = await invoke<unknown>(billingEdgeFunction('refund', provider), {
    payment_id: input.paymentId ?? null,
    invoice_id: input.invoiceId ?? null,
    amount_cents: Math.round(input.amountCents),
    reason: input.reason.trim(),
    idempotency_key: normalizeIdempotencyKey(input.idempotencyKey) ?? undefined,
  });
  if (res.error) return { data: null, error: res.error };
  const record = asRecord(res.data);
  return {
    data: {
      id: asString(record.id),
      status: asString(record.status),
      amountCents: asNumber(record.amount_cents, input.amountCents),
    },
    error: null as SafeServiceError | null,
  };
}

export async function refundPatientPayment(input: {
  paymentId?: string | null;
  invoiceId?: string | null;
  amountCents: number;
  reason: string;
  idempotencyKey?: string;
}) {
  return refundProviderPayment(input);
}

export async function syncProviderPayment(
  invoiceId: string,
  reason = 'manual_sync',
  provider: BillingProvider = ACTIVE_BILLING_PROVIDER
) {
  if (!invoiceId.trim()) return { data: null, error: { message: 'Cobranca invalida para sync.' } };
  if (isMockEnabled()) {
    return {
      data: { id: invoiceId, status: 'paid', syncedAt: new Date().toISOString() },
      error: null as SafeServiceError | null,
    };
  }
  const entitlementError = await requireBillingProviderFeatureFlag();
  if (entitlementError) return { data: null, error: entitlementError };
  const res = await invoke<unknown>(billingEdgeFunction('sync', provider), {
    invoice_id: invoiceId,
    reason,
  });
  if (res.error) return { data: null, error: res.error };
  const record = asRecord(res.data);
  return {
    data: {
      id: asString(record.id, invoiceId),
      status: asString(record.status),
      syncedAt: asNullableString(record.synced_at),
    },
    error: null as SafeServiceError | null,
  };
}

export async function syncAsaasPayment(invoiceId: string, reason = 'manual_sync') {
  return syncProviderPayment(invoiceId, reason, 'asaas');
}
