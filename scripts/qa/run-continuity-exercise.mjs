#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanupQaFixtures, createAdmin, seedQaFixtures, signInQa } from './qa-fixtures.mjs';

const BACKUP_DIR = path.resolve(process.cwd(), '.qa-artifacts');
const BACKUP_FILE = path.join(BACKUP_DIR, 'qa_continuity_backup.json');
const REPORT_FILE = path.join(BACKUP_DIR, 'qa_continuity_report.json');
const MAX_RPO_MS = Number.parseInt(process.env.QA_MAX_RPO_MS ?? '300000', 10);
const MAX_RTO_MS = Number.parseInt(process.env.QA_MAX_RTO_MS ?? '300000', 10);
const DOCUMENT_BUCKET = 'clinical-attachments';
let currentStep = 'initializing';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

async function rows(admin, table, tenantId) {
  const { data, error } = await admin.from(table).select('*').eq('tenant_id', tenantId);
  if (error) throw error;
  return data ?? [];
}

async function one(admin, table, filters) {
  let query = admin.from(table).select('*');
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { data, error } = await query.single();
  if (error) throw error;
  return data;
}

function compactDomain(name, rowsToHash) {
  return { name, count: rowsToHash.length, hash: digest(rowsToHash) };
}

async function createContinuityData(admin, fixture) {
  const tenantId = fixture.tenants.aurora;
  const patientId = fixture.patients.qa_patient_a;
  const ownerId = fixture.users.qa_owner_a.id;
  const now = new Date().toISOString();
  const encounterId = randomUUID();
  const soapId = randomUUID();
  const documentId = randomUUID();
  const invoiceId = randomUUID();
  const paymentId = randomUUID();
  const storagePath = `${tenantId}/${patientId}/${documentId}/qa_continuity_attachment.txt`;

  await admin.from('patient_pii').upsert({
    tenant_id: tenantId, patient_id: patientId, full_name: 'qa_patient_a continuity record', cpf_masked: '***.***.***-**',
  }, { onConflict: 'tenant_id,patient_id' }).throwOnError();
  await admin.from('encounters').insert({
    id: encounterId, tenant_id: tenantId, patient_id: patientId, status: 'closed', encounter_type: 'qa_continuity',
    started_at: now, ended_at: now, created_by: ownerId, finalized_by: ownerId,
  }).throwOnError();
  await admin.from('soap_notes').insert({
    id: soapId, tenant_id: tenantId, patient_id: patientId, encounter_id: encounterId, status: 'final',
    subjective: 'qa continuity subjective', objective: 'qa continuity objective', assessment: 'qa continuity assessment',
    plan: 'qa continuity plan', authored_by: ownerId,
  }).throwOnError();
  await admin.from('measurements').insert({
    tenant_id: tenantId, patient_id: patientId, encounter_id: encounterId, status: 'recorded',
    measured_at: now, weight_kg: 71.1, height_cm: 170, waist_cm: 81, measured_by: ownerId, notes: 'qa continuity measurement',
  }).throwOnError();
  await admin.storage.from(DOCUMENT_BUCKET).upload(storagePath, new TextEncoder().encode('qa_continuity_attachment_v1'), {
    contentType: 'text/plain', upsert: true,
  }).then(({ error }) => { if (error) throw error; });
  await admin.from('generated_documents').insert({
    id: documentId, tenant_id: tenantId, patient_id: patientId, name: 'qa_continuity_attachment.txt', category: 'qa_continuity',
    status: 'generated', storage_bucket: DOCUMENT_BUCKET, storage_path: storagePath, generated_by: ownerId,
  }).throwOnError();
  await admin.from('patient_invoices').insert({
    id: invoiceId, tenant_id: tenantId, patient_id: patientId, status: 'pending', amount_cents: 12345,
    due_date: now.slice(0, 10), description: 'qa continuity local invoice', metadata: { source: 'qa_continuity', provider: 'local' },
  }).throwOnError();
  await admin.from('payments').insert({
    id: paymentId, tenant_id: tenantId, patient_id: patientId, patient_invoice_id: invoiceId, status: 'confirmed', amount_cents: 12345,
    paid_at: now, due_date: now.slice(0, 10), method: 'qa_local', metadata: { source: 'qa_continuity', provider: 'local' },
  }).throwOnError();
  return { encounterId, soapId, documentId, invoiceId, paymentId, storagePath };
}

async function snapshot(admin, fixture) {
  const tenantId = fixture.tenants.aurora;
  const patientId = fixture.patients.qa_patient_a;
  const source = {
    tenant: await one(admin, 'tenants', { id: tenantId }),
    patient: await one(admin, 'patients', { tenant_id: tenantId, id: patientId }),
    pii: [await one(admin, 'patient_pii', { tenant_id: tenantId, patient_id: patientId })],
    encounters: await rows(admin, 'encounters', tenantId),
    soap_notes: await rows(admin, 'soap_notes', tenantId),
    measurements: await rows(admin, 'measurements', tenantId),
    generated_documents: await rows(admin, 'generated_documents', tenantId),
    patient_invoices: await rows(admin, 'patient_invoices', tenantId),
    payments: await rows(admin, 'payments', tenantId),
    memberships: await rows(admin, 'tenant_memberships', tenantId),
    roles: await rows(admin, 'roles', tenantId),
    permissions: await rows(admin, 'permissions', tenantId),
  };
  const document = source.generated_documents.find((row) => row.name === 'qa_continuity_attachment.txt');
  assert(document, 'QA continuity attachment metadata missing before backup');
  const { data: blob, error } = await admin.storage.from(document.storage_bucket).download(document.storage_path);
  if (error || !blob) throw error ?? new Error('QA continuity attachment missing before backup');
  const object = Buffer.from(await blob.arrayBuffer()).toString('base64');
  const domains = [
    compactDomain('clinical', [...source.encounters, ...source.soap_notes, ...source.measurements]),
    compactDomain('pii', source.pii),
    compactDomain('documents', source.generated_documents.map((row) => ({ ...row, objectHash: digest(object) }))),
    compactDomain('financial', [...source.patient_invoices, ...source.payments]),
    compactDomain('rbac', [...source.memberships, ...source.roles, ...source.permissions]),
  ];
  return { version: 1, createdAt: new Date().toISOString(), source, object: { bucket: document.storage_bucket, path: document.storage_path, base64: object }, domains };
}

function remap(value, map) {
  if (Array.isArray(value)) return value.map((item) => remap(item, map));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item, map)]));
  return typeof value === 'string' && map[value] ? map[value] : value;
}

async function restore(admin, backup) {
  const fixture = await seedQaFixtures(admin);
  const source = backup.source;
  const targetPatient = fixture.patients.qa_patient_a;
  const targetOwner = fixture.users.qa_owner_a.id;
  const map = {
    [source.tenant.id]: fixture.tenants.aurora,
    [source.patient.id]: targetPatient,
    [source.encounters[0].created_by]: targetOwner,
  };
  const document = source.generated_documents.find((row) => row.name === 'qa_continuity_attachment.txt');
  const targetPath = `${fixture.tenants.aurora}/${targetPatient}/${document.id}/qa_continuity_attachment.txt`;
  await admin.from('patient_pii').upsert(remap(source.pii[0], map), { onConflict: 'tenant_id,patient_id' }).throwOnError();
  for (const table of ['encounters', 'soap_notes', 'measurements', 'patient_invoices', 'payments']) {
    const payload = source[table].map((row) => remap(row, map));
    if (payload.length) await admin.from(table).insert(payload).throwOnError();
  }
  await admin.storage.from(document.storage_bucket).upload(targetPath, Buffer.from(backup.object.base64, 'base64'), {
    contentType: 'text/plain', upsert: true,
  }).then(({ error }) => { if (error) throw error; });
  await admin.from('generated_documents').insert({ ...remap(document, map), storage_path: targetPath }).throwOnError();
  return { fixture, targetPath, soapId: source.soap_notes[0].id };
}

async function verifyRestore(admin, backup, restored) {
  const fixture = restored.fixture;
  const source = backup.source;
  const target = {
    pii: [await one(admin, 'patient_pii', { tenant_id: fixture.tenants.aurora, patient_id: fixture.patients.qa_patient_a })],
    encounters: await rows(admin, 'encounters', fixture.tenants.aurora),
    soap_notes: await rows(admin, 'soap_notes', fixture.tenants.aurora),
    measurements: await rows(admin, 'measurements', fixture.tenants.aurora),
    generated_documents: await rows(admin, 'generated_documents', fixture.tenants.aurora),
    patient_invoices: await rows(admin, 'patient_invoices', fixture.tenants.aurora),
    payments: await rows(admin, 'payments', fixture.tenants.aurora),
    memberships: await rows(admin, 'tenant_memberships', fixture.tenants.aurora),
    roles: await rows(admin, 'roles', fixture.tenants.aurora),
    permissions: await rows(admin, 'permissions', fixture.tenants.aurora),
  };
  assert(target.encounters.some((row) => row.id === source.encounters[0].id), 'encounter relation was not restored');
  assert(target.soap_notes.some((row) => row.id === source.soap_notes[0].id && row.encounter_id === source.encounters[0].id), 'SOAP relation was not restored');
  assert(target.payments.some((row) => row.patient_invoice_id === source.patient_invoices[0].id), 'financial relation was not restored');
  const { data: blob, error } = await admin.storage.from(DOCUMENT_BUCKET).download(restored.targetPath);
  if (error || !blob) throw error ?? new Error('restored attachment is unavailable');
  assert(digest(Buffer.from(await blob.arrayBuffer()).toString('base64')) === digest(backup.object.base64), 'restored attachment hash differs');
  const owner = await signInQa('qa_owner_a', fixture.password);
  const { error: ownExportError } = await owner.rpc('export_final_soap_record', { p_soap_note_id: restored.soapId });
  if (ownExportError) throw ownExportError;
  const otherOwner = await signInQa('qa_owner_b', fixture.password);
  const { error: crossTenantError } = await otherOwner.rpc('export_final_soap_record', { p_soap_note_id: restored.soapId });
  assert(crossTenantError, 'cross-tenant SOAP export was not denied after restore');
  const domainCounts = {
    clinical: target.encounters.length + target.soap_notes.length + target.measurements.length,
    pii: target.pii.length,
    documents: target.generated_documents.length,
    financial: target.patient_invoices.length + target.payments.length,
    rbac: target.memberships.length + target.roles.length + target.permissions.length,
  };
  for (const domain of backup.domains) assert(domainCounts[domain.name] >= domain.count, `${domain.name} count is below backup baseline`);
  return domainCounts;
}

async function run() {
  const admin = createAdmin();
  await mkdir(BACKUP_DIR, { recursive: true });
  try {
    currentStep = 'preparing isolated QA source';
    await cleanupQaFixtures(admin);
    const sourceFixture = await seedQaFixtures(admin);
    await createContinuityData(admin, sourceFixture);
    currentStep = 'creating local logical backup';
    const backup = await snapshot(admin, sourceFixture);
    await writeFile(BACKUP_FILE, JSON.stringify(backup));
    const latestAt = Math.max(...Object.values(backup.source).flat().filter(Boolean).map((row) => Date.parse(row.created_at ?? row.updated_at ?? backup.createdAt)));
    const rpoMs = Math.max(0, Date.parse(backup.createdAt) - latestAt);
    assert(rpoMs <= MAX_RPO_MS, `RPO threshold exceeded: ${rpoMs}ms`);
    const restores = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      currentStep = `restoring isolated QA dataset (${attempt}/2)`;
      await cleanupQaFixtures(admin);
      const startedAt = Date.now();
      const restored = await restore(admin, JSON.parse(await readFile(BACKUP_FILE, 'utf8')));
      const counts = await verifyRestore(admin, backup, restored);
      const rtoMs = Date.now() - startedAt;
      assert(rtoMs <= MAX_RTO_MS, `RTO threshold exceeded: ${rtoMs}ms`);
      restores.push({ attempt, rtoMs, counts });
    }
    const report = { status: 'passed', scenario: 'qa-continuity-backup-restore', rpoMs, restores, domains: backup.domains.map(({ name, count, hash }) => ({ name, count, hash: hash.slice(0, 12) })) };
    await writeFile(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    try { await cleanupQaFixtures(admin); } finally { await rm(BACKUP_FILE, { force: true }); }
  }
}

run().catch((error) => {
  const details = error && typeof error === 'object' ? [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ') : String(error);
  console.error(`QA continuity exercise failed during ${currentStep}: ${details || 'unknown_error'}`);
  process.exitCode = 1;
});
