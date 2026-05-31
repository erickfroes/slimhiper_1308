#!/usr/bin/env node

/**
 * Local billing reconciliation smoke.
 *
 * Seeds deterministic local invoices, payments and Asaas event summaries,
 * signs in a real local financial user, and validates the safe reconciliation
 * RPC consumed by /clinic/financeiro.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { getRequiredServiceRoleKey, requireEnv } from './_shared/env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_BOOTSTRAP_PASSWORD',
];

const IDS = {
  patient: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  customer: '86000000-0000-4000-8000-000000000000',
  invoiceClean: '86000000-0000-4000-8000-000000000001',
  invoiceMismatch: '86000000-0000-4000-8000-000000000002',
  invoicePaidNoPayment: '86000000-0000-4000-8000-000000000003',
  invoicePaidPaymentUnpaid: '86000000-0000-4000-8000-000000000004',
  invoiceOverdue: '86000000-0000-4000-8000-000000000005',
  paymentClean: '87000000-0000-4000-8000-000000000001',
  paymentMismatch: '87000000-0000-4000-8000-000000000002',
  paymentPaidUnpaid: '87000000-0000-4000-8000-000000000003',
  paymentOrphan: '87000000-0000-4000-8000-000000000004',
  asaasFailedEvent: '88000000-0000-4000-8000-000000000001',
  asaasProcessedEvent: '88000000-0000-4000-8000-000000000002',
};

let admin;

try {
  requireEnv(requiredEnv);
  assertSafeTarget(process.env.SUPABASE_URL);
  admin = createClient(process.env.SUPABASE_URL, getRequiredServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function assertSafeTarget(url) {
  if (process.env.ALLOW_REMOTE_BILLING_RECONCILIATION_SMOKE === 'true') return;

  const parsed = new URL(url);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      'Refusing to run mutating billing reconciliation smoke outside localhost. Set ALLOW_REMOTE_BILLING_RECONCILIATION_SMOKE=true only for an approved sandbox.'
    );
  }
}

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function runNodeScript(scriptPath) {
  execFileSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

function assertNoProviderFields(value, pathLabel = 'root') {
  if (!value || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    if (/^asaas_.*_id$/i.test(key) || key === 'wallet_id') {
      throw new Error(`RPC exposed provider field ${pathLabel}.${key}`);
    }

    if (Array.isArray(nested)) {
      nested.forEach((item, index) => assertNoProviderFields(item, `${pathLabel}.${key}[${index}]`));
    } else {
      assertNoProviderFields(nested, `${pathLabel}.${key}`);
    }
  }
}

async function ensureTenant(slug) {
  const { data, error } = await admin.from('tenants').select('id, slug').eq('slug', slug).single();
  if (error) throw error;
  return data;
}

async function ensureAuthUserPassword(email) {
  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const existing = list.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw new Error(`Expected seeded auth user ${email}`);

  const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
    password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

async function signIn(email) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
  });
  if (error) throw error;
  ok(data.session?.access_token, `Expected session token for ${email}`);
  return client;
}

async function ensurePatientCustomer(tenantId) {
  const { data: existing, error: existingError } = await admin
    .from('patient_customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('patient_id', IDS.patient)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from('patient_customers')
    .insert({
      id: IDS.customer,
      tenant_id: tenantId,
      patient_id: IDS.patient,
      asaas_customer_id: 'smoke_customer_reconciliation',
      status: 'active',
      metadata: { seeded_by: 'test-billing-reconciliation-local-smoke' },
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function seedBillingReconciliationData(tenantId, patientCustomerId) {
  const invoiceRows = [
    {
      id: IDS.invoiceClean,
      tenant_id: tenantId,
      patient_id: IDS.patient,
      patient_customer_id: patientCustomerId,
      asaas_invoice_id: 'smoke_invoice_clean',
      status: 'pago',
      amount_cents: 10000,
      due_date: '2026-05-10',
      paid_at: '2026-05-10T12:00:00Z',
      description: 'Smoke clean paid invoice',
      metadata: { seeded_by: 'test-billing-reconciliation-local-smoke' },
    },
    {
      id: IDS.invoiceMismatch,
      tenant_id: tenantId,
      patient_id: IDS.patient,
      patient_customer_id: patientCustomerId,
      asaas_invoice_id: 'smoke_invoice_amount_mismatch',
      status: 'pending',
      amount_cents: 40000,
      due_date: '2026-06-10',
      paid_at: null,
      description: 'Smoke amount mismatch invoice',
      metadata: { seeded_by: 'test-billing-reconciliation-local-smoke' },
    },
    {
      id: IDS.invoicePaidNoPayment,
      tenant_id: tenantId,
      patient_id: IDS.patient,
      patient_customer_id: patientCustomerId,
      asaas_invoice_id: 'smoke_invoice_paid_no_payment',
      status: 'pago',
      amount_cents: 25000,
      due_date: '2026-05-12',
      paid_at: '2026-05-12T12:00:00Z',
      description: 'Smoke paid invoice without payment',
      metadata: { seeded_by: 'test-billing-reconciliation-local-smoke' },
    },
    {
      id: IDS.invoicePaidPaymentUnpaid,
      tenant_id: tenantId,
      patient_id: IDS.patient,
      patient_customer_id: patientCustomerId,
      asaas_invoice_id: 'smoke_invoice_paid_payment_unpaid',
      status: 'pending',
      amount_cents: 22000,
      due_date: '2026-06-14',
      paid_at: null,
      description: 'Smoke paid payment with unpaid invoice',
      metadata: { seeded_by: 'test-billing-reconciliation-local-smoke' },
    },
    {
      id: IDS.invoiceOverdue,
      tenant_id: tenantId,
      patient_id: IDS.patient,
      patient_customer_id: patientCustomerId,
      asaas_invoice_id: 'smoke_invoice_overdue',
      status: 'pending',
      amount_cents: 18000,
      due_date: '2026-05-01',
      paid_at: null,
      description: 'Smoke overdue invoice',
      metadata: { seeded_by: 'test-billing-reconciliation-local-smoke' },
    },
  ];

  const paymentRows = [
    {
      id: IDS.paymentClean,
      tenant_id: tenantId,
      patient_id: IDS.patient,
      patient_invoice_id: IDS.invoiceClean,
      asaas_payment_id: 'smoke_payment_clean',
      status: 'paid',
      amount_cents: 10000,
      paid_at: '2026-05-10T12:10:00Z',
      due_date: '2026-05-10',
      method: 'pix',
      metadata: { seeded_by: 'test-billing-reconciliation-local-smoke' },
    },
    {
      id: IDS.paymentMismatch,
      tenant_id: tenantId,
      patient_id: IDS.patient,
      patient_invoice_id: IDS.invoiceMismatch,
      asaas_payment_id: 'smoke_payment_amount_mismatch',
      status: 'pending',
      amount_cents: 39000,
      paid_at: null,
      due_date: '2026-06-10',
      method: 'pix',
      metadata: { seeded_by: 'test-billing-reconciliation-local-smoke' },
    },
    {
      id: IDS.paymentPaidUnpaid,
      tenant_id: tenantId,
      patient_id: IDS.patient,
      patient_invoice_id: IDS.invoicePaidPaymentUnpaid,
      asaas_payment_id: 'smoke_payment_paid_unpaid_invoice',
      status: 'paid',
      amount_cents: 22000,
      paid_at: '2026-05-15T13:00:00Z',
      due_date: '2026-06-14',
      method: 'pix',
      metadata: { seeded_by: 'test-billing-reconciliation-local-smoke' },
    },
    {
      id: IDS.paymentOrphan,
      tenant_id: tenantId,
      patient_id: IDS.patient,
      patient_invoice_id: null,
      asaas_payment_id: 'smoke_payment_orphan',
      status: 'pending',
      amount_cents: 12000,
      paid_at: null,
      due_date: '2026-06-20',
      method: 'pix',
      metadata: { seeded_by: 'test-billing-reconciliation-local-smoke' },
    },
  ];

  await admin.from('patient_invoices').upsert(invoiceRows, { onConflict: 'id' }).throwOnError();
  await admin.from('payments').upsert(paymentRows, { onConflict: 'id' }).throwOnError();
  await admin
    .from('asaas_events')
    .upsert(
      [
        {
          id: IDS.asaasFailedEvent,
          tenant_id: tenantId,
          event_type: 'PAYMENT_CONFIRMED',
          asaas_event_id: 'smoke_event_failed',
          idempotency_key: 'smoke_event_failed_key',
          external_reference: IDS.invoicePaidNoPayment,
          status: 'failed',
          payload_summary: { source: 'local_smoke', payment_status: 'CONFIRMED' },
          processed_at: null,
          retry_count: 1,
          error_message: 'smoke_provider_mapping_failed',
        },
        {
          id: IDS.asaasProcessedEvent,
          tenant_id: tenantId,
          event_type: 'PAYMENT_RECEIVED',
          asaas_event_id: 'smoke_event_processed',
          idempotency_key: 'smoke_event_processed_key',
          external_reference: IDS.invoiceClean,
          status: 'processed',
          payload_summary: { source: 'local_smoke', payment_status: 'RECEIVED' },
          processed_at: '2026-05-10T12:11:00Z',
          retry_count: 0,
          error_message: null,
        },
      ],
      { onConflict: 'id' }
    )
    .throwOnError();
}

async function run() {
  runNodeScript(path.join(repoRoot, 'scripts', 'supabase', 'bootstrap-core-auth.mjs'));
  runNodeScript(path.join(repoRoot, 'scripts', 'supabase', 'bootstrap-patient360-demo.mjs'));
  runNodeScript(path.join(repoRoot, 'scripts', 'supabase', 'bootstrap-billing-demo.mjs'));

  const tenant = await ensureTenant(process.env.SUPABASE_BOOTSTRAP_TENANT_SLUG ?? 'demo-clinic');
  await ensureAuthUserPassword('clinic.admin@example.com');
  const patientCustomerId = await ensurePatientCustomer(tenant.id);
  await seedBillingReconciliationData(tenant.id, patientCustomerId);

  const clinicClient = await signIn('clinic.admin@example.com');

  const { data: overview, error: overviewError } = await clinicClient.rpc(
    'get_clinic_finance_overview'
  );
  if (overviewError) throw overviewError;
  ok(overview?.metrics, 'Expected finance overview metrics');
  ok(Array.isArray(overview?.recentCharges), 'Expected finance overview recentCharges');

  const { data, error } = await clinicClient.rpc('get_clinic_finance_reconciliation');
  if (error) throw error;
  ok(data?.summary, 'Expected reconciliation summary');
  ok(Array.isArray(data?.divergences), 'Expected divergences array');
  ok(Array.isArray(data?.recentEvents), 'Expected recentEvents array');
  assertNoProviderFields(data);

  const kinds = new Set(data.divergences.map((item) => item.kind));
  for (const kind of [
    'amount_mismatch',
    'paid_invoice_without_paid_payment',
    'paid_payment_unpaid_invoice',
    'overdue_invoice_without_overdue_payment',
    'orphan_payment',
    'webhook_unresolved',
  ]) {
    ok(kinds.has(kind), `Expected divergence kind ${kind}`);
  }
  ok(data.summary.divergences >= 6, 'Expected at least six seeded divergences');
  ok(data.summary.highSeverity >= 3, 'Expected high severity seeded divergences');
  ok(data.summary.failedWebhookEvents >= 1, 'Expected failed webhook count');
  ok(data.summary.unmatchedPayments >= 1, 'Expected unmatched payment count');

  const unauthClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const unauth = await unauthClient.rpc('get_clinic_finance_reconciliation');
  ok(unauth.error, 'Expected unauthenticated reconciliation RPC to fail closed');

  console.log('Billing reconciliation local smoke passed:');
  console.log('- seeded local invoice/payment divergence scenarios');
  console.log('- get_clinic_finance_reconciliation returned safe summary/divergences/events');
  console.log('- get_clinic_finance_overview remains compatible');
  console.log('- unauthenticated reconciliation RPC fails closed');
}

run().catch((error) => {
  console.error(`Billing reconciliation local smoke failed: ${error.message}`);
  process.exit(1);
});
