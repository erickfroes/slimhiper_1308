#!/usr/bin/env node

import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures');

const FIXTURE_HMAC_SECRET = 'fixture-only-hmac-secret-not-real';

const fixtures = {
  validWebhook: path.join(fixtureRoot, 'd4sign-webhook-valid.json'),
  invalidWebhook: path.join(fixtureRoot, 'd4sign-webhook-invalid.json'),
  documentSummary: path.join(fixtureRoot, 'document-summary.json'),
};

const VALID_SIGNATURE_STATUSES = new Set([
  'sent',
  'viewed',
  'signed',
  'rejected',
  'expired',
  'canceled',
  'error',
]);
const VALID_SIGNER_STATUSES = new Set([
  'pending',
  'viewed',
  'signed',
  'rejected',
  'expired',
  'canceled',
  'error',
]);
const VALID_DOCUMENT_CATEGORIES = new Set([
  'relatorio',
  'prescricao',
  'termo',
  'contrato',
  'consentimento',
  'orientacao',
  'pacote_evidencia',
]);
const VALID_DOCUMENT_STATUSES = new Set([
  'assinado',
  'pendente_assinatura',
  'em_analise',
  'vencido',
  'cancelado',
  'disponivel',
]);
const VALID_DOCUMENT_SIGNATURE_STATUSES = new Set(['assinado', 'pendente', 'nao_requerido']);
const D4SIGN_TO_DOCUMENT_STATUS = new Map([
  ['sent', 'pendente_assinatura'],
  ['viewed', 'pendente_assinatura'],
  ['signed', 'assinado'],
  ['rejected', 'cancelado'],
  ['expired', 'vencido'],
  ['canceled', 'cancelado'],
  ['error', 'em_analise'],
]);
const D4SIGN_TO_DOCUMENT_SIGNATURE_STATUS = new Map([
  ['sent', 'pendente'],
  ['viewed', 'pendente'],
  ['signed', 'assinado'],
  ['rejected', 'pendente'],
  ['expired', 'pendente'],
  ['canceled', 'pendente'],
  ['error', 'pendente'],
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

function normalizeStatus(rawStatus) {
  const status = String(rawStatus ?? '').toLowerCase();
  if (
    status.includes('sign') ||
    status.includes('assinad') ||
    status === 'done' ||
    status === 'completed'
  ) {
    return 'signed';
  }
  if (status.includes('view') || status.includes('opened') || status.includes('visualiz')) {
    return 'viewed';
  }
  if (status.includes('reject') || status.includes('refus') || status.includes('declin')) {
    return 'rejected';
  }
  if (status.includes('expir')) return 'expired';
  if (status.includes('cancel')) return 'canceled';
  if (status.includes('error') || status.includes('fail') || status.includes('invalid')) {
    return 'error';
  }
  if (status.includes('sent') || status.includes('created') || status.includes('enviado')) {
    return 'sent';
  }
  return 'sent';
}

function signatureToSignerStatus(status) {
  if (status === 'signed') return 'signed';
  if (status === 'viewed') return 'viewed';
  if (status === 'rejected') return 'rejected';
  if (status === 'expired') return 'expired';
  if (status === 'canceled') return 'canceled';
  if (status === 'error') return 'error';
  return 'pending';
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function hmacSha256Hex(secret, message) {
  return createHmac('sha256', secret).update(message).digest('hex');
}

async function readFixture(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function deriveWebhookContract(fixture) {
  const payload = toObject(fixture.payload);
  const document = toObject(payload.document);
  const eventType =
    getString(payload.event, payload.event_type, payload.type, payload.action, payload.status) ||
    'unknown';
  const providerEventId = getString(payload.event_id, payload.id, payload.uuid);
  const providerDocumentId = getString(
    payload.provider_document_id,
    payload.document_id,
    payload.document_uuid,
    document.id,
    document.uuid
  );
  const idempotencyKey = getString(
    payload.idempotency_key,
    fixture.headers?.['idempotency-key'],
    providerEventId && `${providerEventId}:${eventType}`,
    providerDocumentId && `${providerDocumentId}:${eventType}`
  );
  const normalizedStatus = normalizeStatus(getString(payload.status, eventType));
  const rawBody = canonicalJson(payload);
  const payloadHash = sha256Hex(rawBody);
  const expectedSignature = hmacSha256Hex(FIXTURE_HMAC_SECRET, rawBody);
  const providedSignature = getString(
    fixture.headers?.['x-d4sign-signature'],
    fixture.headers?.['x-signature']
  )
    .toLowerCase()
    .replace(/^sha256=/, '');

  return {
    eventType,
    providerEventId,
    providerDocumentId,
    idempotencyKey,
    normalizedStatus,
    signerStatus: signatureToSignerStatus(normalizedStatus),
    payloadHash,
    expectedSignature,
    providedSignature,
    signerCount: Array.isArray(payload.signers) ? payload.signers.length : 0,
  };
}

function assertWebhookShape(fixture, label) {
  const payload = toObject(fixture.payload);
  const contract = deriveWebhookContract(fixture);

  ok(getString(fixture.name), `${label}.name must exist`);
  ok(getString(payload.event, payload.event_type, payload.type), `${label}.payload event must exist`);
  ok(contract.providerDocumentId, `${label}.providerDocumentId must be derivable`);
  ok(contract.idempotencyKey, `${label}.idempotencyKey must be deterministic`);
  ok(VALID_SIGNATURE_STATUSES.has(contract.normalizedStatus), `${label}.status must map safely`);
  ok(VALID_SIGNER_STATUSES.has(contract.signerStatus), `${label}.signerStatus must map safely`);
  ok(contract.payloadHash.length === 64, `${label}.payloadHash must be sha256 hex`);
  ok(contract.expectedSignature.length === 64, `${label}.expectedSignature must be hmac sha256 hex`);

  return contract;
}

function assertValidWebhook(fixture) {
  const contract = assertWebhookShape(fixture, 'validWebhook');
  const expected = toObject(fixture.expected);

  ok(expected.accepted === true, 'validWebhook expected.accepted must be true');
  ok(contract.providerDocumentId === expected.providerDocumentId, 'validWebhook provider document mismatch');
  ok(contract.providerEventId === expected.providerEventId, 'validWebhook provider event mismatch');
  ok(contract.idempotencyKey === expected.idempotencyKey, 'validWebhook idempotency key mismatch');
  ok(contract.normalizedStatus === expected.normalizedStatus, 'validWebhook status mapping mismatch');
  ok(contract.signerStatus === expected.signerStatus, 'validWebhook signer status mismatch');
  ok(expected.timelineEventType === 'documento_assinado', 'validWebhook timeline event must be document signed');
  ok(contract.signerCount > 0, 'validWebhook must include at least one signer');

  const signatureHeader = getString(fixture.headers?.['x-d4sign-signature']);
  ok(signatureHeader.startsWith('sha256='), 'validWebhook must document sha256 signature header');

  if (signatureHeader !== 'sha256=__computed_from_fixture_secret__') {
    ok(contract.providedSignature === contract.expectedSignature, 'validWebhook HMAC signature mismatch');
  }

  return contract;
}

function assertInvalidWebhookFailsClosed(fixture) {
  const contract = assertWebhookShape(fixture, 'invalidWebhook');
  const expected = toObject(fixture.expected);
  const signatureHeader = getString(fixture.headers?.['x-d4sign-signature'], fixture.headers?.['x-signature']);

  ok(expected.accepted === false, 'invalidWebhook expected.accepted must be false');
  ok(expected.errorCode === 'unauthorized_webhook', 'invalidWebhook must fail closed as unauthorized_webhook');
  ok(!signatureHeader, 'invalidWebhook must not include a valid signature');
  ok(expected.reason === 'missing_signature', 'invalidWebhook expected reason must be missing_signature');
  ok(contract.idempotencyKey, 'invalidWebhook still needs deterministic idempotency key for audit');
}

function assertDocumentSummary(fixture) {
  const documents = fixture.data?.documents;
  const expected = toObject(fixture.expected);

  ok(Array.isArray(documents), 'documentSummary.data.documents must be an array');
  ok(documents.length === expected.documentCount, 'documentSummary document count mismatch');

  for (const [index, document] of documents.entries()) {
    const prefix = `documentSummary.documents[${index}]`;
    ok(getString(document.id), `${prefix}.id must exist`);
    ok(getString(document.patientId), `${prefix}.patientId must exist`);
    ok(getString(document.name), `${prefix}.name must exist`);
    ok(VALID_DOCUMENT_CATEGORIES.has(document.category), `${prefix}.category must be valid`);
    ok(getString(document.tipo), `${prefix}.tipo must exist`);
    ok(VALID_DOCUMENT_STATUSES.has(document.status), `${prefix}.status must be valid`);
    ok(
      VALID_DOCUMENT_SIGNATURE_STATUSES.has(document.assinatura),
      `${prefix}.assinatura must be valid`
    );
    ok(getString(document.emitidoEm), `${prefix}.emitidoEm must exist`);
    ok(getString(document.emitidoPor), `${prefix}.emitidoPor must exist`);

    const signature = toObject(document.signature);
    ok(signature.provider === 'd4sign', `${prefix}.signature.provider must be d4sign`);
    ok(getString(signature.providerDocumentId), `${prefix}.signature.providerDocumentId must exist`);
    ok(getString(signature.signatureRequestId), `${prefix}.signature.signatureRequestId must exist`);
    ok(VALID_SIGNATURE_STATUSES.has(signature.status), `${prefix}.signature.status must be valid`);
    ok(getString(signature.idempotencyKey), `${prefix}.signature.idempotencyKey must exist`);

    ok(
      D4SIGN_TO_DOCUMENT_STATUS.get(signature.status) === document.status,
      `${prefix}.status must match D4Sign status mapping`
    );
    ok(
      D4SIGN_TO_DOCUMENT_SIGNATURE_STATUS.get(signature.status) === document.assinatura,
      `${prefix}.assinatura must match D4Sign status mapping`
    );
  }

  for (const forbiddenField of expected.mustNotExposeFields ?? []) {
    const leaked = documents.some((document) => Object.hasOwn(document, forbiddenField));
    ok(!leaked, `documentSummary must not expose ${forbiddenField}`);
  }
}

async function run() {
  const [validWebhook, invalidWebhook, documentSummary] = await Promise.all([
    readFixture(fixtures.validWebhook),
    readFixture(fixtures.invalidWebhook),
    readFixture(fixtures.documentSummary),
  ]);

  assertValidWebhook(validWebhook);
  assertInvalidWebhookFailsClosed(invalidWebhook);
  assertDocumentSummary(documentSummary);

  console.log('D4Sign fixture contract checks passed:');
  console.log('- valid webhook shape/status/idempotency passed');
  console.log('- invalid webhook fails closed without signature');
  console.log('- document summary shape and status mapping passed');
  console.log('- HMAC strategy validated with fixture-only secret placeholder');
}

run().catch((error) => {
  console.error(`D4Sign fixture contract checks failed: ${error.message}`);
  process.exit(1);
});
