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
const VALID_PACKAGE_STATUSES = new Set(['ativo', 'pausado', 'concluido', 'cancelado', 'aguardando']);

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

function isSafeFallbackString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertTimelineEventShape(event, index, checkNumber) {
  const prefix = `${checkNumber}) timeline event[${index}]`;
  ok(isSafeFallbackString(event?.id), `${prefix}.id must exist`);
  ok(isSafeFallbackString(event?.patientId), `${prefix}.patientId must exist`);
  ok(isSafeFallbackString(event?.type), `${prefix}.type must exist`);
  ok(isSafeFallbackString(event?.title), `${prefix}.title must exist`);
  ok(isSafeFallbackString(event?.description), `${prefix}.description must exist`);
  ok(isSafeFallbackString(event?.date), `${prefix}.date must exist`);
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

  const activePackage = summary.json?.data?.activePackage;
  ok(isSafeFallbackString(activePackage?.programName), '4) data.activePackage.programName must exist or be a safe fallback string');
  ok(
    typeof activePackage?.status === 'string' && VALID_PACKAGE_STATUSES.has(activePackage.status),
    '5) data.activePackage.status must be a valid frontend PackageStatus from SlimHiper domain',
  );

  const clinicalStatus = summary.json?.data?.clinicalStatus;
  const hasWeightOrFallback = typeof clinicalStatus?.currentWeightKg === 'number' || clinicalStatus?.currentWeightKg === null;
  ok(hasWeightOrFallback, '6) clinicalStatus.currentWeightKg must be a number or safe fallback (null)');

  ok(typeof summary.json?.data?.financial?.status === 'string', '7) data.financial.status must exist');
  ok(typeof summary.json?.data?.financial?.totalPending === 'number', '8) data.financial.totalPending must be a number');
  ok(Array.isArray(summary.json?.data?.upcomingAppointments), '9) data.upcomingAppointments must be an array');
  ok(Array.isArray(summary.json?.data?.recentTimeline), '10) data.recentTimeline must be an array');
  results.push('1-10 passed');

  const timeline = await callFunction('patient-timeline', TOKEN_WITH_PATIENTS_READ, {
    patient_id: PATIENT_ID_TENANT_A,
    page: 1,
    page_size: 10,
  });
  ok(timeline.status === 200, `patient-timeline expected 200, got ${timeline.status}`);
  ok(timeline.json?.ok === true, '11) timeline.ok must be true');
  ok(timeline.json?.data && timeline.json?.meta, '11) timeline must include data and meta');
  ok(Array.isArray(timeline.json?.data?.events), '11) timeline.data.events must be array');
  ok(Number.isInteger(timeline.json?.data?.page), '11) timeline.data.page must be integer');
  ok(Number.isInteger(timeline.json?.data?.page_size), '11) timeline.data.page_size must be integer');
  ok(Number.isInteger(timeline.json?.data?.total), '11) timeline.data.total must be integer');
  timeline.json.data.events.forEach((event, index) => assertTimelineEventShape(event, index, 12));
  results.push('11-12 passed');

  const timelineWithCategory = await callFunction('patient-timeline', TOKEN_WITH_PATIENTS_READ, {
    patient_id: PATIENT_ID_TENANT_A,
    category: 'clinical',
    page: 1,
    page_size: 10,
  });
  ok(timelineWithCategory.status === 200, `13) category filter expected 200, got ${timelineWithCategory.status}`);
  ok(timelineWithCategory.json?.ok === true, '13) category filter should not error');
  const categoryEvents = timelineWithCategory.json?.data?.events;
  ok(Array.isArray(categoryEvents), '13) category filter events must be array');
  if (categoryEvents.length > 0) {
    const mismatched = categoryEvents.find((event) => event?.category !== 'clinical');
    ok(!mismatched, '13) category filter must return only matching category events when events exist');
  }
  results.push('13 passed');

  if (TOKEN_WITHOUT_PATIENTS_READ) {
    const forbidden = await callFunction('patient-360-summary', TOKEN_WITHOUT_PATIENTS_READ, {
      patient_id: PATIENT_ID_TENANT_A,
    });
    ok(forbidden.status === 403, `14) expected 403 without patients.read, got ${forbidden.status}`);
    results.push('14 passed');
  } else {
    results.push('14 skipped (TOKEN_WITHOUT_PATIENTS_READ not provided)');
  }

  if (TOKEN_TENANT_B && PATIENT_ID_TENANT_B) {
    const crossTenant = await callFunction('patient-360-summary', TOKEN_WITH_PATIENTS_READ, {
      patient_id: PATIENT_ID_TENANT_B,
    });
    ok(crossTenant.status !== 200, `15) cross-tenant fetch should fail, got ${crossTenant.status}`);
    results.push(`15 passed (status ${crossTenant.status})`);
  } else {
    results.push('15 skipped (TOKEN_TENANT_B and/or PATIENT_ID_TENANT_B not provided)');
  }

  console.log('Paciente 360 contract checks passed:');
  for (const item of results) console.log(`- ${item}`);
}

run().catch((error) => {
  console.error(`Contract checks failed: ${error.message}`);
  process.exit(1);
});
