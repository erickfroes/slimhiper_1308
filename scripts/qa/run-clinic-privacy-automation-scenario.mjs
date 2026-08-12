#!/usr/bin/env node
import { cleanupQaFixtures, createAdmin, seedQaFixtures, signInQa } from './qa-fixtures.mjs';

let currentStep = 'initializing';
const assert = (value, message) => { if (!value) throw new Error(message); };
async function rpc(client, name, params) { const { data, error } = await client.rpc(name, params); if (error) throw error; return data; }
async function rejected(label, fn) { try { await fn(); } catch { return; } throw new Error(`${label}: expected rejection`); }

async function run() {
  const admin = createAdmin();
  try {
    currentStep = 'cleaning and seeding QA tenants'; await cleanupQaFixtures(admin); const fixture = await seedQaFixtures(admin);
    const ownerA = await signInQa('qa_owner_a', fixture.password); const ownerB = await signInQa('qa_owner_b', fixture.password); const patientA = await signInQa('qa_patient_a', fixture.password);
    currentStep = 'checking unpublished automation';
    const dry = await rpc(admin, 'run_clinic_privacy_automation', { p_execute: false, p_limit: 100 });
    assert(dry.dryRun === true, 'privacy automation dry-run was not reported');
    const before = await rpc(ownerA, 'get_clinic_privacy_governance', {});
    assert(!before.policy, 'new clinic unexpectedly has a policy');
    currentStep = 'drafting and publishing tenant policy';
    const drafted = await rpc(ownerA, 'save_clinic_privacy_policy', { p_policy: { dpoEmail: 'qa-dpo@example.test', consentVersion: 'qa-v1', requestSlaDays: 7, alertLeadDays: 2, allowNonclinicalAnonymization: true, retentionRules: { clinical: 'clinical_retention_required', personal: 'until_request_resolution' }, optionalConsents: { marketing: { version: 'qa-v1', enabled: true }, community: { version: 'qa-v1', enabled: true }, progress_photos: { version: 'qa-v1', enabled: true }, optional_communications: { version: 'qa-v1', enabled: true } }, approvedOperators: ['qa_processor'] } });
    assert(drafted.status === 'draft', 'policy draft was not created');
    await rpc(ownerA, 'publish_clinic_privacy_policy', { p_policy_id: drafted.id });
    const published = await rpc(ownerA, 'get_clinic_privacy_governance', {});
    assert(published.policy.status === 'published' && published.policy.automationEnabled, 'policy publication did not activate automation');
    const replacement = await rpc(ownerA, 'save_clinic_privacy_policy', { p_policy: { ...published.policy, consentVersion: 'qa-v2' } });
    assert(replacement.version === 2, 'policy version history was not preserved');
    currentStep = 'checking access boundaries and rights workflow';
    await rejected('cross-tenant policy access', () => rpc(ownerB, 'publish_clinic_privacy_policy', { p_policy_id: drafted.id }));
    await rejected('unlinked patient request', () => rpc(patientA, 'create_data_subject_request', { p_patient_id: fixture.patients.qa_patient_b, p_request_type: 'access' }));
    const access = await rpc(patientA, 'create_data_subject_request', { p_patient_id: fixture.patients.qa_patient_a, p_request_type: 'access' });
    const assigned = await rpc(ownerA, 'assign_data_subject_request', { p_request_id: access.id, p_assigned_to: fixture.users.qa_owner_a.id });
    assert(assigned.status === 'in_progress', 'request was not assigned');
    const execute = await rpc(admin, 'run_clinic_privacy_automation', { p_execute: true, p_limit: 100 });
    assert(execute.dryRun === false, 'privacy automation did not execute');
    currentStep = 'validating sanitized audit trail';
    const { data: audits, error } = await admin.from('audit_logs').select('action,metadata').eq('tenant_id', fixture.tenants.aurora).like('action', 'privacy.%'); if (error) throw error;
    assert((audits ?? []).length >= 2, 'privacy policy audit missing');
    assert((audits ?? []).every((row) => !/(soap|subjective|objective|assessment|prescription|diagnosis)/i.test(JSON.stringify(row.metadata))), 'clinical content leaked into privacy audit');
    console.log(JSON.stringify({ status: 'passed', scenario: 'clinic-privacy-automation', assertions: 12, alertsCreated: execute.succeededCount }));
  } finally { try { await cleanupQaFixtures(admin); } catch { console.error('QA privacy cleanup failed; synthetic fixture removal must be retried.'); } }
}
run().catch((error) => { const details = error && typeof error === 'object' ? [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ') : String(error); console.error(`QA privacy automation failed during ${currentStep}: ${details || 'unknown_error'}`); process.exitCode = 1; });
