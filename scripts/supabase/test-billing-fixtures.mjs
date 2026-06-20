#!/usr/bin/env node

import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures');

const FIXTURE_WEBHOOK_TOKEN = '__fixture_valid_asaas_webhook_token__';
const FIXTURE_MERCADOPAGO_WEBHOOK_SECRET = '__fixture_valid_mercadopago_webhook_secret__';

const fixtures = {
  confirmed: path.join(fixtureRoot, 'asaas-payment-confirmed.json'),
  overdue: path.join(fixtureRoot, 'asaas-payment-overdue.json'),
  cancelled: path.join(fixtureRoot, 'asaas-payment-cancelled.json'),
  duplicated: path.join(fixtureRoot, 'asaas-webhook-duplicated.json'),
  invalidToken: path.join(fixtureRoot, 'asaas-invalid-token.json'),
};

const mercadoPagoFixtures = {
  approved: path.join(fixtureRoot, 'mercadopago-payment-approved.json'),
  pending: path.join(fixtureRoot, 'mercadopago-payment-pending.json'),
  rejected: path.join(fixtureRoot, 'mercadopago-payment-rejected.json'),
  cancelled: path.join(fixtureRoot, 'mercadopago-payment-cancelled.json'),
  refunded: path.join(fixtureRoot, 'mercadopago-payment-refunded.json'),
  chargeback: path.join(fixtureRoot, 'mercadopago-payment-chargeback.json'),
  duplicated: path.join(fixtureRoot, 'mercadopago-webhook-duplicated.json'),
  invalidSignature: path.join(fixtureRoot, 'mercadopago-invalid-signature.json'),
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

const MERCADOPAGO_VALID_INVOICE_STATUSES = new Set([
  'pending',
  'paid',
  'failed',
  'cancelled',
  'refunded',
  'chargeback',
]);
const MERCADOPAGO_VALID_PAYMENT_STATUSES = new Set([
  'pending',
  'paid',
  'authorized',
  'failed',
  'cancelled',
  'refunded',
  'chargeback',
]);
const MERCADOPAGO_VALID_FINANCIAL_STATES = new Set(['settled', 'pending', 'attention']);
const MERCADOPAGO_EVENT_MAPPING = new Map([
  [
    'approved',
    {
      invoiceStatus: 'paid',
      paymentStatus: 'paid',
      financialState: 'settled',
      timelineEventType: 'pagamento_recebido',
      timelineCategory: 'financial',
    },
  ],
  [
    'pending',
    {
      invoiceStatus: 'pending',
      paymentStatus: 'pending',
      financialState: 'pending',
      timelineEventType: null,
      timelineCategory: null,
    },
  ],
  [
    'in_process',
    {
      invoiceStatus: 'pending',
      paymentStatus: 'pending',
      financialState: 'pending',
      timelineEventType: null,
      timelineCategory: null,
    },
  ],
  [
    'authorized',
    {
      invoiceStatus: 'pending',
      paymentStatus: 'authorized',
      financialState: 'pending',
      timelineEventType: null,
      timelineCategory: null,
    },
  ],
  [
    'rejected',
    {
      invoiceStatus: 'failed',
      paymentStatus: 'failed',
      financialState: 'attention',
      timelineEventType: null,
      timelineCategory: null,
    },
  ],
  [
    'cancelled',
    {
      invoiceStatus: 'cancelled',
      paymentStatus: 'cancelled',
      financialState: 'attention',
      timelineEventType: null,
      timelineCategory: null,
    },
  ],
  [
    'refunded',
    {
      invoiceStatus: 'refunded',
      paymentStatus: 'refunded',
      financialState: 'attention',
      timelineEventType: 'pagamento',
      timelineCategory: 'financial',
    },
  ],
  [
    'charged_back',
    {
      invoiceStatus: 'chargeback',
      paymentStatus: 'chargeback',
      financialState: 'attention',
      timelineEventType: 'pagamento',
      timelineCategory: 'financial',
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

function parseSignatureHeader(header) {
  return Object.fromEntries(
    getString(header)
      .split(',')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
  );
}

function mercadopagoSignature(dataId, requestId, ts) {
  return createHmac('sha256', FIXTURE_MERCADOPAGO_WEBHOOK_SECRET)
    .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
    .digest('hex');
}

function isMercadoPagoSignatureValid(fixture) {
  const payload = toObject(fixture.payload);
  const dataId = getString(payload.data?.id);
  const requestId = getString(fixture.headers?.['x-request-id']);
  const parsedSignature = parseSignatureHeader(fixture.headers?.['x-signature']);
  const ts = getString(parsedSignature.ts);
  const v1 = getString(parsedSignature.v1);
  return Boolean(
    dataId && requestId && ts && v1 && mercadopagoSignature(dataId, requestId, ts) === v1
  );
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
  ok(
    mapping.financialState === expected.financialState,
    `${label}.financialState mapping mismatch`
  );
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
  ok(
    tenantResolution.shouldResolve === true,
    `${label}.tenantResolution.shouldResolve must be true`
  );
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

function assertMercadoPagoPayloadShape(fixture, label) {
  const payload = toObject(fixture.payload);
  const providerResource = toObject(fixture.providerResource);
  const eventType = getString(payload.action, payload.type);
  const dataId = getString(payload.data?.id);

  ok(fixture.provider === 'mercadopago', `${label}.provider must be mercadopago`);
  ok(getString(fixture.name), `${label}.name must exist`);
  ok(eventType, `${label}.payload action/type must exist`);
  ok(getString(payload.id), `${label}.payload.id must exist`);
  ok(dataId, `${label}.payload.data.id must exist`);
  ok(getString(providerResource.id) === dataId, `${label}.providerResource.id must match data.id`);
  ok(getString(providerResource.status), `${label}.providerResource.status must exist`);
  ok(typeof providerResource.transaction_amount === 'number', `${label}.amount must be a number`);
  ok(getString(providerResource.preference_id), `${label}.preference_id must exist`);
  ok(getString(providerResource.external_reference), `${label}.external_reference must exist`);

  const hash = webhookHash(payload);
  ok(hash.length === 64, `${label}.eventHash must be sha256 hex`);

  return { eventType, providerResource, hash };
}

function assertMercadoPagoMapping(fixture, label) {
  const { eventType, providerResource } = assertMercadoPagoPayloadShape(fixture, label);
  const expected = toObject(fixture.expected);
  const providerStatus = getString(providerResource.status);
  const mapping = MERCADOPAGO_EVENT_MAPPING.get(providerStatus);

  ok(mapping, `${label}.providerResource.status must have an internal mapping`);
  ok(
    expected.eventType === eventType,
    `${label}.expected.eventType must match payload action/type`
  );
  ok(
    MERCADOPAGO_VALID_INVOICE_STATUSES.has(expected.invoiceStatus),
    `${label}.invoiceStatus must be valid`
  );
  ok(
    MERCADOPAGO_VALID_PAYMENT_STATUSES.has(expected.paymentStatus),
    `${label}.paymentStatus must be valid`
  );
  ok(
    MERCADOPAGO_VALID_FINANCIAL_STATES.has(expected.financialState),
    `${label}.financialState must be valid`
  );
  ok(mapping.invoiceStatus === expected.invoiceStatus, `${label}.invoiceStatus mapping mismatch`);
  ok(mapping.paymentStatus === expected.paymentStatus, `${label}.paymentStatus mapping mismatch`);
  ok(
    mapping.financialState === expected.financialState,
    `${label}.financialState mapping mismatch`
  );
  ok(
    mapping.timelineEventType === expected.timelineEventType,
    `${label}.timelineEventType mapping mismatch`
  );
  ok(mapping.timelineCategory === expected.timelineCategory, `${label}.timelineCategory mismatch`);
}

function assertMercadoPagoTenantResolution(fixture, label) {
  const dataId = getString(fixture.payload?.data?.id);
  const tenantResolution = toObject(fixture.expected?.tenantResolution);

  ok(
    tenantResolution.strategy === 'patient_invoices.provider_payment_id',
    `${label}.tenantResolution.strategy must match webhook implementation`
  );
  ok(
    tenantResolution.lookupPaymentId === dataId,
    `${label}.tenantResolution.lookupPaymentId must use payload.data.id`
  );
  ok(getString(tenantResolution.tenantId), `${label}.tenantResolution.tenantId must exist`);
  ok(getString(tenantResolution.patientId), `${label}.tenantResolution.patientId must exist`);
  ok(
    tenantResolution.shouldResolve === true,
    `${label}.tenantResolution.shouldResolve must be true`
  );
}

function assertAcceptedMercadoPagoWebhook(fixture, label) {
  ok(fixture.expected?.accepted === true, `${label}.expected.accepted must be true`);
  ok(isMercadoPagoSignatureValid(fixture), `${label}.fixture signature must be valid`);
  assertMercadoPagoMapping(fixture, label);
  assertMercadoPagoTenantResolution(fixture, label);
}

function assertMercadoPagoDuplicate(duplicateFixture, originalFixture) {
  assertAcceptedMercadoPagoWebhook(duplicateFixture, 'mercadopagoDuplicated');
  ok(
    duplicateFixture.expected?.idempotent === true,
    'mercadopagoDuplicated.expected.idempotent must be true'
  );

  const originalHash = webhookHash(originalFixture.payload);
  const duplicateHash = webhookHash(duplicateFixture.payload);
  ok(duplicateHash === originalHash, 'duplicated Mercado Pago webhook hash must match original');
}

function assertMercadoPagoInvalidSignature(fixture) {
  assertMercadoPagoPayloadShape(fixture, 'mercadopagoInvalidSignature');
  ok(
    fixture.expected?.accepted === false,
    'mercadopagoInvalidSignature.expected.accepted must be false'
  );
  ok(
    fixture.expected?.error === 'invalid_signature',
    'mercadopagoInvalidSignature expected error mismatch'
  );
  ok(
    !isMercadoPagoSignatureValid(fixture),
    'mercadopagoInvalidSignature must fail fixture signature validation'
  );
}

async function run() {
  const [confirmed, overdue, cancelled, duplicated, invalidToken] = await Promise.all([
    readFixture(fixtures.confirmed),
    readFixture(fixtures.overdue),
    readFixture(fixtures.cancelled),
    readFixture(fixtures.duplicated),
    readFixture(fixtures.invalidToken),
  ]);
  const [
    mercadoPagoApproved,
    mercadoPagoPending,
    mercadoPagoRejected,
    mercadoPagoCancelled,
    mercadoPagoRefunded,
    mercadoPagoChargeback,
    mercadoPagoDuplicated,
    mercadoPagoInvalidSignature,
  ] = await Promise.all([
    readFixture(mercadoPagoFixtures.approved),
    readFixture(mercadoPagoFixtures.pending),
    readFixture(mercadoPagoFixtures.rejected),
    readFixture(mercadoPagoFixtures.cancelled),
    readFixture(mercadoPagoFixtures.refunded),
    readFixture(mercadoPagoFixtures.chargeback),
    readFixture(mercadoPagoFixtures.duplicated),
    readFixture(mercadoPagoFixtures.invalidSignature),
  ]);

  assertAcceptedWebhook(confirmed, 'confirmed');
  assertAcceptedWebhook(overdue, 'overdue');
  assertAcceptedWebhook(cancelled, 'cancelled');
  assertDuplicate(duplicated, confirmed);
  assertInvalidToken(invalidToken);
  assertAcceptedMercadoPagoWebhook(mercadoPagoApproved, 'mercadopagoApproved');
  assertAcceptedMercadoPagoWebhook(mercadoPagoPending, 'mercadopagoPending');
  assertAcceptedMercadoPagoWebhook(mercadoPagoRejected, 'mercadopagoRejected');
  assertAcceptedMercadoPagoWebhook(mercadoPagoCancelled, 'mercadopagoCancelled');
  assertAcceptedMercadoPagoWebhook(mercadoPagoRefunded, 'mercadopagoRefunded');
  assertAcceptedMercadoPagoWebhook(mercadoPagoChargeback, 'mercadopagoChargeback');
  assertMercadoPagoDuplicate(mercadoPagoDuplicated, mercadoPagoApproved);
  assertMercadoPagoInvalidSignature(mercadoPagoInvalidSignature);

  console.log('Billing fixture contract checks passed:');
  console.log('- confirmed, overdue and cancelled mappings passed');
  console.log(
    '- Mercado Pago approved, pending, rejected, cancelled, refunded and chargeback mappings passed'
  );
  console.log('- webhook idempotency hash passed');
  console.log('- Mercado Pago webhook signature checks passed');
  console.log('- tenant resolution strategy passed');
  console.log('- invalid token/signature fixtures fail closed');
}

run().catch((error) => {
  console.error(`Billing fixture contract checks failed: ${error.message}`);
  process.exit(1);
});
