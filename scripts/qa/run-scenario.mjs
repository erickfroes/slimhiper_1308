#!/usr/bin/env node
import { cleanupQaFixtures, createAdmin, seedQaFixtures, signInQa } from './qa-fixtures.mjs';

let currentStep = 'initializing';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function count(client, table, filters) {
  let query = client.from(table).select('*', { count: 'exact', head: true });
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { count: result, error } = await query;
  if (error) throw error;
  return result ?? 0;
}

async function expectCount(label, client, table, filters, expected) {
  let actual;
  try {
    actual = await count(client, table, filters);
  } catch (error) {
    const detail =
      error && typeof error === 'object'
        ? [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ')
        : String(error ?? '');
    throw new Error(`${label}: query was rejected${detail ? ` (${detail})` : ''}.`);
  }
  assert(actual === expected, `${label}: expected ${expected}, received ${actual}`);
}

async function run() {
  const admin = createAdmin();
  let fixture;
  try {
    currentStep = 'cleaning fixtures';
    console.log('QA: cleaning synthetic fixtures');
    await cleanupQaFixtures(admin);
    currentStep = 'seeding fixtures';
    console.log('QA: seeding synthetic fixtures');
    fixture = await seedQaFixtures(admin);
    currentStep = 'signing in synthetic users';
    console.log('QA: signing in synthetic users');
    const ownerA = await signInQa('qa_owner_a', fixture.password);
    const patientA = await signInQa('qa_patient_a', fixture.password);
    const guardianA = await signInQa('qa_guardian_a', fixture.password);
    const revoked = await signInQa('qa_revoked_a', fixture.password);
    currentStep = 'checking tenant and portal RLS';
    console.log('QA: checking tenant and portal RLS');
    await expectCount('owner reads own patient', ownerA, 'patients', { id: fixture.patients.qa_patient_a }, 1);
    await expectCount('owner cross-tenant patient denial', ownerA, 'patients', { id: fixture.patients.qa_patient_b }, 0);
    await expectCount('patient reads own linkage', patientA, 'patient_accounts', { patient_id: fixture.patients.qa_patient_a }, 1);
    await expectCount('patient cross-tenant linkage denial', patientA, 'patient_accounts', { patient_id: fixture.patients.qa_patient_b }, 0);
    await expectCount('patient clinical row denial', patientA, 'patients', { id: fixture.patients.qa_patient_a }, 0);
    await expectCount('guardian reads own linkage', guardianA, 'guardian_links', { patient_id: fixture.patients.qa_patient_a }, 1);
    await expectCount('guardian cross-tenant linkage denial', guardianA, 'guardian_links', { patient_id: fixture.patients.qa_patient_b }, 0);
    await expectCount('revoked member patient denial', revoked, 'patients', { id: fixture.patients.qa_patient_a }, 0);
    console.log(JSON.stringify({ status: 'passed', scenario: 'rls-portal-revocation', assertions: 8 }));
  } finally {
    try {
      await cleanupQaFixtures(admin);
    } catch {
      console.error('QA scenario cleanup failed; synthetic fixture removal must be retried.');
    }
  }
}

run().catch((error) => {
  const details =
    error && typeof error === 'object'
      ? [error.name, error.message, error.code, error.details, error.hint]
          .filter(Boolean)
          .join(' | ')
      : String(error);
  console.error(`QA scenario failed during ${currentStep}: ${details || 'unknown_error'}`);
  process.exitCode = 1;
});
