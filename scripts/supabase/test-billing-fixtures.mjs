#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures');

const FIXTURE_WEBHOOK_TOKEN = '__fixture_valid_asaas_webhook_token__';

const fixtures = {
  confirmed: path.join(fixtureRoot, 'asaas-payment-confirmed.json'),
  overdue: path.join(fixtureRoot, 'asaas-payment-overdue.json'),
  cancelled: path.join(fixtureRoot, 'asaas-payment-cancelled.json'),
  duplicated: path.join(fixtureRoot, 'asaas-webhook-duplicated.json'),
  invalidToken: path.join(fixtureRoot, 'asaas-invalid-token.json'),
};

const VALID_INVOICE_STATUSES = new Set(['pendente', 'pago', 'vencido', 'cancelado']);
const VALID_PAYMENT_STATUSES = new Set(['pending', 'paid', 'overdue', 'canceled']);
const VALID_FINANCIAL_STATES = new Set(['em_dia', 'pagamento_atrasado', 'cobranca_pendente']);
const VALID_TIMELINE_EVENTS = new Set(['pagamento_recebido', 'pagamento_atrasado', 'pagamento']);

const EVENT_MAPPING = new Map([
  [
    'PAYMENT_CONFIRMED',
    {
      invoiceStatus: 'pago',
      paymentStatus: 'paid',
      financialState: 'em_dia',
      timelineEventType: 'pagamento_recebido',
      timelineCategory: 'financial',
    },
  ],
  [
    'PAYMENT_RECEIVED',
    {
      invoiceStatus: 'pago',
      paymentStatus: 'paid',
      financialState: 'em_dia',
      timelineEventType: 'pagamento_recebido',
      timelineCategory: 'financial',
    },
  ],
  [
    'PAYMENT_OVERDUE',
    {
      invoiceStatus: 'vencido',
      paymentStatus: 'overdue',
      financialState: 'pagamento_atrasado',
      timelineEventType: 'pagamento_atrasado',
      timelineCategory: 'financial',
    },
  ],
  [
    'PAYMENT_CREATED',
    {
      invoiceStatus: 'pendente',
      paymentStatus: 'pending',
      financialState: 'cobranca_pendente',
      timelineEventType: 'pagamento',
      timelineCategory: 'financial',
    },
  ],
  [
    'PAYMENT_DELETED',
    {
      invoiceStatus: 'cancelado',
      paymentStatus: 'canceled',
      financialState: 'cobranca_pendente',
      timelineEventType: null,
      timelineCategory: null,
    },
  ],
  [
    'PAYMENT_CANCELLED',
    {
      invoiceStatus: 'cancelado',
      paymentStatus: 'canceled',
      financialState: 'cobranca_pendente',
      timelineEventType: null,
      timelineCategory: null,
    },
  ],
]);

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function webhookHash(payload) {
  return sha256Hex(JSON.stringify(payload));
}

function isWebhookTokenValid(fixture) {
  return getString(fixture.headers?.['asaas-access-token']) === FIXTURE_WEBHOOK_TOKEN;
}

async function readFixture(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function assertPayloadShape(fixture, label) {
  const payload = toObject(fixture.payload);
  const payment = toObject(payload.payment);
  const eventType = getString(payload.event);

  ok(getString(fixture.name), `${label}.name must exist`);
  ok(eventType, `${label}.payload.event must exist`);
  ok(getString(payload.id), `${label}.payload.id must exist`);
  ok(getString(payment.id), `${label}.payload.payment.id must exist`);
  ok(getString(payment.customer), `${label}.payload.payment.customer must exist`);
  ok(typeof payment.value === 'number', `${label}.payload.payment.value must be a number`);
  ok(getString(payment.billingType), `${label}.payload.payment.billingType must exist`);
  ok(getString(payment.externalReference), `${label}.payload.payment.externalReference must exist`);
  ok(getString(payment.dueDate), `${label}.payload.payment.dueDate must exist`);

  const hash = webhookHash(payload);
  ok(hash.length === 64, `${label}.eventHash must be sha256 hex`);

  return { eventType, payment, hash };
}

function assertMapping(fixture, label) {
  const { eventType } = assertPayloadShape(fixture, label);
  const expected = toObject(fixture.expected);
  const mapping = EVENT_MAPPING.get(eventType);

  ok(mapping, `${label}.eventType must have an internal mapping`);
  ok(expected.eventType === eventType, `${label}.expected.eventType must match payload.event`);
  ok(VALID_INVOICE_STATUSES.has(expected.invoiceStatus), `${label}.invoiceStatus must be valid`);
  ok(VALID_PAYMENT_STATUSES.has(expected.paymentStatus), `${label}.paymentStatus must be valid`);
  ok(VALID_FINANCIAL_STATES.has(expected.financialState), `${label}.financialState must be valid`);
  ok(mapping.invoiceStatus === expected.invoiceStatus, `${label}.invoiceStatus mapping mismatch`);
  ok(mapping.paymentStatus === expected.paymentStatus, `${label}.paymentStatus mapping mismatch`);
  ok(mapping.financialState === expected.financialState, `${label}.financialState mapping mismatch`);
  ok(
    mapping.timelineEventType === expected.timelineEventType,
    `${label}.timelineEventType mapping mismatch`
  );
  ok(mapping.timelineCategory === expected.timelineCategory, `${label}.timelineCategory mismatch`);

  if (expected.timelineEventType !== null) {
    ok(
      VALID_TIMELINE_EVENTS.has(expected.timelineEventType),
      `${label}.timelineEventType must be valid`
    );
  }
}

function assertTenantResolution(fixture, label) {
  const payment = toObject(fixture.payload?.payment);
  const tenantResolution = toObject(fixture.expected?.tenantResolution);

  ok(
    tenantResolution.strategy === 'patient_invoices.asaas_invoice_id',
    `${label}.tenantResolution.strategy must match webhook implementation`
  );
  ok(
    tenantResolution.lookupPaymentId === payment.id,
    `${label}.tenantResolution.lookupPaymentId must use payment.id`
  );
  ok(getString(tenantResolution.tenantId), `${label}.tenantResolution.tenantId must exist`);
  ok(getString(tenantResolution.patientId), `${label}.tenantResolution.patientId must exist`);
  ok(tenantResolution.shouldResolve === true, `${label}.tenantResolution.shouldResolve must be true`);
}

function assertAcceptedWebhook(fixture, label) {
  ok(fixture.expected?.accepted === true, `${label}.expected.accepted must be true`);
  ok(isWebhookTokenValid(fixture), `${label}.fixture token must be valid fixture token`);
  assertMapping(fixture, label);
  assertTenantResolution(fixture, label);
}

function assertDuplicate(duplicateFixture, originalFixture) {
  assertAcceptedWebhook(duplicateFixture, 'duplicated');
  ok(duplicateFixture.expected?.idempotent === true, 'duplicated.expected.idempotent must be true');

  const originalHash = webhookHash(originalFixture.payload);
  const duplicateHash = webhookHash(duplicateFixture.payload);
  ok(duplicateHash === originalHash, 'duplicated webhook hash must match original payload');
}

function assertInvalidToken(fixture) {
  assertPayloadShape(fixture, 'invalidToken');
  ok(fixture.expected?.accepted === false, 'invalidToken.expected.accepted must be false');
  ok(fixture.expected?.error === 'invalid_webhook_token', 'invalidToken expected error mismatch');
  ok(!isWebhookTokenValid(fixture), 'invalidToken must fail fixture token validation');
}

async function run() {
  const [confirmed, overdue, cancelled, duplicated, invalidToken] = await Promise.all([
    readFixture(fixtures.confirmed),
    readFixture(fixtures.overdue),
    readFixture(fixtures.cancelled),
    readFixture(fixtures.duplicated),
    readFixture(fixtures.invalidToken),
  ]);

  assertAcceptedWebhook(confirmed, 'confirmed');
  assertAcceptedWebhook(overdue, 'overdue');
  assertAcceptedWebhook(cancelled, 'cancelled');
  assertDuplicate(duplicated, confirmed);
  assertInvalidToken(invalidToken);

  console.log('Asaas billing fixture contract checks passed:');
  console.log('- confirmed, overdue and cancelled mappings passed');
  console.log('- webhook idempotency hash passed');
  console.log('- tenant resolution strategy passed');
  console.log('- invalid token fails closed');
}

run().catch((error) => {
  console.error(`Asaas billing fixture contract checks failed: ${error.message}`);
  process.exit(1);
});
