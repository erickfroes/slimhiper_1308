#!/usr/bin/env node

/**
 * Paciente 360 contract smoke checks
 *
 * Required env vars:
 * - SUPABASE_URL
 * - TOKEN_WITH_PATIENTS_READ
 * - PATIENT_ID_TENANT_A
 *
 * Optional env vars (for authz checks):
 * - TOKEN_WITHOUT_PATIENTS_READ
 * - TOKEN_TENANT_B
 * - PATIENT_ID_TENANT_B
 */

const {
  SUPABASE_URL,
  TOKEN_WITH_PATIENTS_READ,
  TOKEN_WITHOUT_PATIENTS_READ,
  TOKEN_TENANT_B,
  PATIENT_ID_TENANT_A,
  PATIENT_ID_TENANT_B,
} = process.env;

const required = ['SUPABASE_URL', 'TOKEN_WITH_PATIENTS_READ', 'PATIENT_ID_TENANT_A'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const base = SUPABASE_URL.replace(/\/$/, '');

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

async function callFunction(name, token, body) {
  const response = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    // noop
  }

  return { status: response.status, json };
}

async function run() {
  const results = [];

  const summary = await callFunction('patient-360-summary', TOKEN_WITH_PATIENTS_READ, {
    patient_id: PATIENT_ID_TENANT_A,
  });

  ok(summary.status === 200, `patient-360-summary expected 200, got ${summary.status}`);
  ok(summary.json?.ok === true, '1) summary.ok must be true');
  ok(summary.json?.data && summary.json?.meta, '1) summary must include data and meta');
  ok(Boolean(summary.json?.data?.profile?.name), '2) data.profile.name must exist');
  ok(Boolean(summary.json?.data?.profile?.id), '3) data.profile.id must exist');
  ok(typeof summary.json?.data?.activePackage?.status === 'string', '4) data.activePackage.status must exist');

  const clinicalStatus = summary.json?.data?.clinicalStatus;
  const hasWeightOrFallback =
    typeof clinicalStatus?.currentWeightKg === 'number' ||
    clinicalStatus?.currentWeightKg === null ||
    Boolean(clinicalStatus?.latestSoap) ||
    Boolean(clinicalStatus?.lastUpdatedAt);
  ok(hasWeightOrFallback, '5) clinicalStatus.currentWeightKg or safe fallback must exist');

  ok(typeof summary.json?.data?.financial?.status === 'string', '6) data.financial.status must exist');
  ok(Array.isArray(summary.json?.data?.upcomingAppointments), '7) data.upcomingAppointments must be an array');
  ok(Array.isArray(summary.json?.data?.recentTimeline), '8) data.recentTimeline must be an array');
  results.push('1-8 passed');

  const timeline = await callFunction('patient-timeline', TOKEN_WITH_PATIENTS_READ, {
    patient_id: PATIENT_ID_TENANT_A,
    page: 1,
    page_size: 10,
  });
  ok(timeline.status === 200, `patient-timeline expected 200, got ${timeline.status}`);
  ok(timeline.json?.ok === true, '9) timeline.ok must be true');
  ok(timeline.json?.data && timeline.json?.meta, '9) timeline must include data and meta');
  ok(Array.isArray(timeline.json?.data?.events), '9) timeline.data.events must be array');
  ok(Number.isInteger(timeline.json?.data?.page), '9) timeline.data.page must be integer');
  ok(Number.isInteger(timeline.json?.data?.page_size), '9) timeline.data.page_size must be integer');
  ok(Number.isInteger(timeline.json?.data?.total), '9) timeline.data.total must be integer');
  results.push('9 passed');

  const timelineWithCategory = await callFunction('patient-timeline', TOKEN_WITH_PATIENTS_READ, {
    patient_id: PATIENT_ID_TENANT_A,
    category: 'clinical',
    page: 1,
    page_size: 10,
  });
  ok(timelineWithCategory.status === 200, `10) category filter expected 200, got ${timelineWithCategory.status}`);
  ok(timelineWithCategory.json?.ok === true, '10) category filter should not error');
  results.push('10 passed');

  if (TOKEN_WITHOUT_PATIENTS_READ) {
    const forbidden = await callFunction('patient-360-summary', TOKEN_WITHOUT_PATIENTS_READ, {
      patient_id: PATIENT_ID_TENANT_A,
    });
    ok(forbidden.status === 403, `11) expected 403 without patients.read, got ${forbidden.status}`);
    results.push('11 passed');
  } else {
    results.push('11 skipped (TOKEN_WITHOUT_PATIENTS_READ not provided)');
  }

  if (TOKEN_TENANT_B && PATIENT_ID_TENANT_B) {
    const crossTenant = await callFunction('patient-360-summary', TOKEN_WITH_PATIENTS_READ, {
      patient_id: PATIENT_ID_TENANT_B,
    });
    ok(crossTenant.status !== 200, `12) cross-tenant fetch should fail, got ${crossTenant.status}`);
    results.push(`12 passed (status ${crossTenant.status})`);
  } else {
    results.push('12 skipped (TOKEN_TENANT_B and/or PATIENT_ID_TENANT_B not provided)');
  }

  console.log('Paciente 360 contract checks passed:');
  for (const item of results) console.log(`- ${item}`);
}

run().catch((error) => {
  console.error(`Contract checks failed: ${error.message}`);
  process.exit(1);
});
