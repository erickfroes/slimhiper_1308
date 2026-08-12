#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cleanupQaFixtures, createAdmin, seedQaFixtures, signInQa } from './qa-fixtures.mjs';

let currentStep = 'initializing';
const digest = (value) => createHash('sha256').update(value).digest('hex');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function rpc(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data;
}

async function count(admin, table, filters) {
  let query = admin.from(table).select('*', { count: 'exact', head: true });
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { count: value, error } = await query;
  if (error) throw error;
  return value ?? 0;
}

async function enqueue(owner, key) {
  return rpc(owner, 'enqueue_integration_outbox', {
    p_channel: 'payment', p_operation: 'invoice.sync', p_idempotency_key: key, p_payload_digest: digest(`qa_${key}`),
  });
}

async function process(admin, id, result) {
  return rpc(admin, 'process_local_integration_outbox', { p_outbox_id: id, p_result: result });
}

async function run() {
  const admin = createAdmin();
  try {
    currentStep = 'cleaning synthetic fixtures';
    await cleanupQaFixtures(admin);
    currentStep = 'seeding integration QA tenant';
    const fixture = await seedQaFixtures(admin);
    const owner = await signInQa('qa_owner_a', fixture.password);

    currentStep = 'checking idempotent outbox enqueue';
    const first = await enqueue(owner, 'qa-payment-duplicate-0001');
    const duplicate = await enqueue(owner, 'qa-payment-duplicate-0001');
    assert(first.id === duplicate.id, 'idempotency key created multiple outbox records');

    currentStep = 'retrying timeout, rate limit, ambiguous and server failure';
    const timeout = await enqueue(owner, 'qa-payment-timeout-0001');
    assert((await process(admin, timeout.id, 'timeout')).status === 'retry', 'timeout did not enter retry');
    assert((await process(admin, timeout.id, 'delivered')).status === 'delivered', 'timeout retry did not recover');
    const rateLimited = await enqueue(owner, 'qa-payment-rate-limit-0001');
    assert((await process(admin, rateLimited.id, 'http_429')).status === 'retry', '429 did not enter retry');
    assert((await process(admin, rateLimited.id, 'delivered')).status === 'delivered', '429 retry did not recover');
    const ambiguous = await enqueue(owner, 'qa-payment-ambiguous-0001');
    assert((await process(admin, ambiguous.id, 'ambiguous')).status === 'retry', 'ambiguous response did not enter retry');
    assert((await process(admin, ambiguous.id, 'delivered')).status === 'delivered', 'ambiguous retry duplicated or failed');
    const serverFailure = await enqueue(owner, 'qa-payment-server-500-0001');
    await process(admin, serverFailure.id, 'http_500');
    await process(admin, serverFailure.id, 'http_500');
    assert((await process(admin, serverFailure.id, 'http_500')).status === 'dead_letter', '500 exhaustion did not enter dead letter');

    currentStep = 'dead lettering permanent failures';
    for (const [key, result] of [['qa-payment-client-400-0001', 'http_400'], ['qa-payment-auth-401-0001', 'http_401']]) {
      const outbox = await enqueue(owner, key);
      assert((await process(admin, outbox.id, result)).status === 'dead_letter', `${result} did not enter dead letter`);
    }

    currentStep = 'rejecting invalid signatures and ordering inbound events';
    const tenantId = fixture.tenants.aurora;
    const invalid = await rpc(admin, 'record_local_inbound_integration_event', {
      p_tenant_id: tenantId, p_channel: 'payment', p_event_key: 'qa-signature-invalid-0001', p_entity_key: 'qa_invoice_1',
      p_event_sequence: 1, p_signature_valid: false, p_payload_digest: digest('qa_invalid_signature'),
    });
    assert(invalid.status === 'rejected', 'invalid signature was accepted');
    const newest = await rpc(admin, 'record_local_inbound_integration_event', {
      p_tenant_id: tenantId, p_channel: 'payment', p_event_key: 'qa-event-newest-0002', p_entity_key: 'qa_invoice_2',
      p_event_sequence: 2, p_signature_valid: true, p_payload_digest: digest('qa_event_2'),
    });
    assert(newest.status === 'processed', 'latest event was not processed');
    const replay = await rpc(admin, 'record_local_inbound_integration_event', {
      p_tenant_id: tenantId, p_channel: 'payment', p_event_key: 'qa-event-newest-0002', p_entity_key: 'qa_invoice_2',
      p_event_sequence: 2, p_signature_valid: true, p_payload_digest: digest('qa_event_2'),
    });
    assert(replay.duplicate === true, 'duplicate inbound event was not idempotent');
    const old = await rpc(admin, 'record_local_inbound_integration_event', {
      p_tenant_id: tenantId, p_channel: 'payment', p_event_key: 'qa-event-old-order-0001', p_entity_key: 'qa_invoice_2',
      p_event_sequence: 1, p_signature_valid: true, p_payload_digest: digest('qa_event_1'),
    });
    assert(old.status === 'ignored', 'out-of-order event was not ignored');

    currentStep = 'reading sanitized reconciliation';
    const reconciliation = await rpc(owner, 'get_integration_reconciliation', {});
    assert(reconciliation.deadLetters >= 4 && reconciliation.rejectedInbound === 1 && reconciliation.outOfOrderIgnored === 1, 'reconciliation counters are incomplete');
    assert(await count(admin, 'integration_outbox', { tenant_id: tenantId }) === 7, 'outbox count differs from idempotent scenario');
    assert(await count(admin, 'integration_dead_letters', { tenant_id: tenantId, status: 'open' }) >= 4, 'dead-letter records are missing');
    console.log(JSON.stringify({ status: 'passed', scenario: 'integration-resilience', assertions: 18, reconciliation }));
  } finally {
    try { await cleanupQaFixtures(admin); } catch { console.error('QA integration cleanup failed; synthetic fixture removal must be retried.'); }
  }
}

run().catch((error) => {
  const details = error && typeof error === 'object' ? [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ') : String(error);
  console.error(`QA integration scenario failed during ${currentStep}: ${details || 'unknown_error'}`);
  process.exitCode = 1;
});
