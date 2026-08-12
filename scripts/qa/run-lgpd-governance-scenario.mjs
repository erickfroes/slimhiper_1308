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

async function expectRejected(label, fn) {
  try { await fn(); } catch { return; }
  throw new Error(`${label}: expected rejection`);
}

async function run() {
  const admin = createAdmin();
  try {
    currentStep = 'cleaning synthetic fixtures';
    await cleanupQaFixtures(admin);
    currentStep = 'seeding LGPD QA fixtures';
    const fixture = await seedQaFixtures(admin);
    const ownerA = await signInQa('qa_owner_a', fixture.password);
    const ownerB = await signInQa('qa_owner_b', fixture.password);
    const patientA = await signInQa('qa_patient_a', fixture.password);
    const patientB = await signInQa('qa_patient_b', fixture.password);

    currentStep = 'reading versioned processing inventory';
    const inventory = await rpc(ownerA, 'get_lgpd_processing_inventory', {});
    assert(inventory.length === 5 && inventory.every((item) => item.version === 1), 'LGPD inventory is incomplete or unversioned');

    currentStep = 'granting and revoking optional consents';
    const granted = await rpc(patientA, 'record_patient_consent', {
      p_patient_id: fixture.patients.qa_patient_a, p_purpose: 'marketing', p_granted: true, p_version: 'v1', p_evidence_digest: digest('qa_marketing_v1'),
    });
    assert(granted.status === 'granted', 'marketing consent was not granted');
    const revoked = await rpc(patientA, 'record_patient_consent', {
      p_patient_id: fixture.patients.qa_patient_a, p_purpose: 'marketing', p_granted: false, p_version: 'v1', p_evidence_digest: digest('qa_marketing_revoke'),
    });
    assert(revoked.status === 'revoked', 'marketing opt-out was not recorded');
    await rpc(patientA, 'record_patient_consent', {
      p_patient_id: fixture.patients.qa_patient_a, p_purpose: 'progress_photos', p_granted: true, p_version: 'v2', p_evidence_digest: digest('qa_photo_v2'),
    });

    currentStep = 'creating authorized export and enforcing tenant scope';
    const exportRequest = await rpc(patientA, 'create_data_subject_request', { p_patient_id: fixture.patients.qa_patient_a, p_request_type: 'export' });
    const exported = await rpc(patientA, 'get_data_subject_export', { p_request_id: exportRequest.id });
    assert(exported.patientId === fixture.patients.qa_patient_a && exported.consents.length === 3, 'authorized LGPD export is incomplete');
    await expectRejected('cross-tenant export', () => rpc(ownerB, 'get_data_subject_export', { p_request_id: exportRequest.id }));
    await expectRejected('patient A export of patient B', () => rpc(patientA, 'create_data_subject_request', { p_patient_id: fixture.patients.qa_patient_b, p_request_type: 'export' }));

    currentStep = 'retaining clinical record while resolving anonymization request';
    await admin.from('encounters').insert({ tenant_id: fixture.tenants.aurora, patient_id: fixture.patients.qa_patient_a, status: 'closed', encounter_type: 'qa_lgpd_retention' }).throwOnError();
    const retainedRequest = await rpc(patientA, 'create_data_subject_request', { p_patient_id: fixture.patients.qa_patient_a, p_request_type: 'anonymization' });
    const retained = await rpc(ownerA, 'resolve_data_subject_request', { p_request_id: retainedRequest.id, p_resolution: 'complete' });
    assert(retained.status === 'retained' && retained.resolutionCode === 'clinical_retention_required', 'clinical retention did not block anonymization');
    const { data: retainedPii, error: retainedPiiError } = await admin.from('patient_pii').select('full_name').eq('patient_id', fixture.patients.qa_patient_a).single();
    if (retainedPiiError) throw retainedPiiError;
    assert(retainedPii.full_name === 'qa_patient_a', 'clinical patient PII was altered despite retention');

    currentStep = 'anonymizing permitted non-clinical synthetic data';
    const permittedRequest = await rpc(patientB, 'create_data_subject_request', { p_patient_id: fixture.patients.qa_patient_b, p_request_type: 'anonymization' });
    const anonymized = await rpc(ownerB, 'resolve_data_subject_request', { p_request_id: permittedRequest.id, p_resolution: 'complete' });
    assert(anonymized.status === 'completed' && anonymized.resolutionCode === 'anonymized_permitted_data', 'permitted anonymization failed');
    const { data: anonymizedPii, error: anonymizedPiiError } = await admin.from('patient_pii').select('full_name, email, phone').eq('patient_id', fixture.patients.qa_patient_b).single();
    if (anonymizedPiiError) throw anonymizedPiiError;
    assert(anonymizedPii.full_name.startsWith('anon_') && anonymizedPii.email === null && anonymizedPii.phone === null, 'permitted data was not anonymized');

    currentStep = 'validating audit metadata has no clinical content';
    const { data: auditRows, error: auditError } = await admin.from('audit_logs').select('action, metadata').eq('tenant_id', fixture.tenants.aurora).like('action', 'lgpd.%');
    if (auditError) throw auditError;
    assert((auditRows ?? []).length >= 5, 'LGPD audit trail is missing');
    assert((auditRows ?? []).every((row) => !/(subjective|objective|assessment|diagnosis|prescription|soap)/i.test(JSON.stringify(row.metadata))), 'clinical content entered LGPD audit metadata');
    console.log(JSON.stringify({ status: 'passed', scenario: 'lgpd-governance', assertions: 15, inventoryItems: inventory.length, lgpdAuditEvents: auditRows.length }));
  } finally {
    try { await cleanupQaFixtures(admin); } catch { console.error('QA LGPD cleanup failed; synthetic fixture removal must be retried.'); }
  }
}

run().catch((error) => {
  const details = error && typeof error === 'object' ? [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ') : String(error);
  console.error(`QA LGPD scenario failed during ${currentStep}: ${details || 'unknown_error'}`);
  process.exitCode = 1;
});
