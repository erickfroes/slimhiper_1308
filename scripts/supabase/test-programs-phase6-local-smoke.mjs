#!/usr/bin/env node

/**
 * Local Phase 6 programs/packages smoke.
 *
 * Seeds local demo data, signs in a clinic admin, exercises the programs RPC
 * contract, publishes/clones/archives a program and validates enrollment
 * check-ins plus Patient 360 visibility. Refuses remote targets by default.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  getRequiredServiceRoleKey,
  requireEnv,
  requireSupabasePublishableKey,
} from './_shared/env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_BOOTSTRAP_PASSWORD'];

const PATIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SMOKE_PROGRAM_NAME = 'Phase 6 Local Smoke Program';

let currentStep = 'initializing';
let admin;

try {
  requireEnv(requiredEnv);
  assertSafeTarget(process.env.SUPABASE_URL);
  admin = createClient(process.env.SUPABASE_URL, getRequiredServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function assertSafeTarget(url) {
  if (process.env.ALLOW_REMOTE_PROGRAMS_SMOKE === 'true') return;

  const parsed = new URL(url);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      'Refusing to run mutating programs smoke outside localhost. Set ALLOW_REMOTE_PROGRAMS_SMOKE=true only for an approved sandbox.'
    );
  }
}

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function runNodeScript(scriptPath) {
  execFileSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

function shortError(error) {
  if (!error || typeof error !== 'object') return String(error ?? 'unknown_error');
  return [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ');
}

async function ensureTenant(slug) {
  const { data, error } = await admin.from('tenants').select('id, slug').eq('slug', slug).single();
  if (error) throw error;
  return data;
}

async function signInClinicAdmin() {
  const { data: users, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;
  const user = users.users.find((item) => item.email === 'clinic.admin@example.com');
  if (!user) throw new Error('clinic.admin@example.com not found after bootstrap.');
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
  });
  if (updateError) throw updateError;

  const client = createClient(process.env.SUPABASE_URL, requireSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: 'clinic.admin@example.com',
    password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
  });
  if (error) throw error;
  ok(data.session?.access_token, 'Expected clinic admin session token.');
  return client;
}

async function ensureClinicAdminProfessionalProfile(tenantId) {
  const { data: membership, error: membershipError } = await admin
    .from('tenant_memberships')
    .select('id, tenant_id, user_id, unit_id, role_code, status')
    .eq('tenant_id', tenantId)
    .eq('role_code', 'clinic_admin')
    .eq('status', 'active')
    .limit(1)
    .single();
  if (membershipError) throw membershipError;

  const { error } = await admin.from('tenant_professionals').upsert(
    {
      tenant_id: membership.tenant_id,
      user_id: membership.user_id,
      membership_id: membership.id,
      unit_id: membership.unit_id,
      professional_type: 'physician',
      license_number: 'CRM-P0-SMOKE',
      license_state: 'SP',
      specialty: 'Medicina integrativa',
      is_active: true,
    },
    { onConflict: 'tenant_id,user_id,professional_type' }
  );
  if (error) throw error;
}

async function cleanupSmokeProgram(tenantId) {
  const { data: programs, error: listError } = await admin
    .from('programs')
    .select('id')
    .eq('tenant_id', tenantId)
    .like('name', `${SMOKE_PROGRAM_NAME}%`);
  if (listError) throw listError;

  const ids = (programs ?? []).map((program) => program.id);
  if (ids.length === 0) return;

  const programChildTables = [
    'patient_program_checkins',
    'program_team_members',
    'program_required_documents',
    'program_entitlements',
    'program_services',
    'program_phases',
    'program_checkin_templates',
  ];

  for (const table of programChildTables) {
    const { error } = await admin
      .from(table)
      .delete()
      .eq('tenant_id', tenantId)
      .in('program_id', ids);
    if (error) throw error;
  }

  const { error: taskCleanupError } = await admin
    .from('patient_tasks')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('patient_id', PATIENT_ID)
    .ilike('details', `%${SMOKE_PROGRAM_NAME}%`);
  if (taskCleanupError) throw taskCleanupError;

  const { error: appointmentCleanupError } = await admin
    .from('appointments')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('patient_id', PATIENT_ID)
    .ilike('notes', `%${SMOKE_PROGRAM_NAME}%`);
  if (appointmentCleanupError) throw appointmentCleanupError;

  const { error: invoiceCleanupError } = await admin
    .from('patient_invoices')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('patient_id', PATIENT_ID)
    .contains('metadata', { program_name: SMOKE_PROGRAM_NAME });
  if (invoiceCleanupError) throw invoiceCleanupError;

  const { error: timelineCleanupError } = await admin
    .from('patient_timeline_events')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('patient_id', PATIENT_ID)
    .ilike('description', `%${SMOKE_PROGRAM_NAME}%`);
  if (timelineCleanupError) throw timelineCleanupError;

  const { error: enrollmentError } = await admin
    .from('patient_program_enrollments')
    .delete()
    .eq('tenant_id', tenantId)
    .in('program_id', ids);
  if (enrollmentError) throw enrollmentError;

  const { error } = await admin.from('programs').delete().eq('tenant_id', tenantId).in('id', ids);
  if (error) throw error;
}

async function countRows(table, filters) {
  let query = admin.from(table).select('id', { count: 'exact', head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function rpc(client, fn, args = {}) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${shortError(error)}`);
  return data;
}

async function run() {
  currentStep = 'running base bootstraps';
  runNodeScript(path.join('scripts', 'supabase', 'bootstrap-core-auth.mjs'));
  runNodeScript(path.join('scripts', 'supabase', 'bootstrap-patient360-demo.mjs'));

  currentStep = 'preparing local smoke data';
  const tenant = await ensureTenant(process.env.SUPABASE_BOOTSTRAP_TENANT_SLUG ?? 'demo-clinic');
  await cleanupSmokeProgram(tenant.id);
  await ensureClinicAdminProfessionalProfile(tenant.id);
  const client = await signInClinicAdmin();

  currentStep = 'checking programs list/options RPCs';
  const initialList = await rpc(client, 'get_clinic_programs');
  ok(Array.isArray(initialList?.programs), 'get_clinic_programs: expected programs array.');
  ok(initialList.programs.length >= 1, 'get_clinic_programs: expected seeded demo program.');

  const options = await rpc(client, 'get_program_builder_options');
  ok(
    Array.isArray(options?.teamMembers) && options.teamMembers.length >= 1,
    'get_program_builder_options: expected team members.'
  );
  const professionalMembers = options.teamMembers.filter(
    (member) => member.source === 'tenant_professionals'
  );
  ok(
    professionalMembers.length >= 1,
    'get_program_builder_options: expected tenant_professionals-backed team members.'
  );
  ok(
    professionalMembers.every((member) => member.professionalProfileId && member.professionalType),
    'get_program_builder_options: expected professional profile metadata.'
  );
  ok(
    professionalMembers.some(
      (member) =>
        member.roleCode === 'clinic_admin' &&
        member.professionalType === 'physician' &&
        member.licenseNumber === 'CRM-P0-SMOKE'
    ),
    'get_program_builder_options: expected clinic admin RBAC with physician professional profile.'
  );
  ok(
    professionalMembers.every((member) => member.status === 'active' && member.isActive === true),
    'get_program_builder_options: expected active professional status.'
  );
  ok(
    Array.isArray(options?.checkinTemplates),
    'get_program_builder_options: expected checkin templates array.'
  );

  currentStep = 'creating and publishing program';
  const draft = {
    name: SMOKE_PROGRAM_NAME,
    programType: 'saude_metabolica',
    objective: 'Local Phase 6 smoke program.',
    durationWeeks: 8,
    color: 'blue',
    status: 'rascunho',
    phases: [
      { name: 'Avaliacao', durationWeeks: 2, description: 'Entrada e metas.' },
      { name: 'Acompanhamento', durationWeeks: 6, description: 'Execucao do plano.' },
    ],
    includedServices: [
      { label: 'Consultas clinicas', quantity: 2, unit: 'consulta' },
      { label: 'Sessoes de nutricao', quantity: 2, unit: 'sessao' },
    ],
    appEntitlements: [{ key: 'chat', label: 'Chat com equipe', enabled: true }],
    checkInsTotal: 4,
    checkInFrequency: 'Semanal via app',
    checkinTemplates: [
      {
        label: 'Check-in semanal smoke',
        frequency: 'Semanal',
        channel: 'app',
        questions: ['Como foi sua adesao nesta semana?'],
      },
    ],
    requiredDocuments: [{ label: 'Termo de consentimento', required: true }],
    financial: {
      paymentModel: 'parcelado',
      basePrice: 800,
      installments: 4,
      discountPercent: 0,
      description: 'Smoke local sem provider.',
    },
    team: options.teamMembers.slice(0, 1),
  };

  const saved = await rpc(client, 'upsert_program_from_builder', {
    p_draft: draft,
    p_publish: false,
  });
  ok(saved?.id, 'upsert_program_from_builder: expected saved id.');

  const published = await rpc(client, 'upsert_program_from_builder', {
    p_draft: { ...draft, id: saved.id },
    p_publish: true,
  });
  ok(published?.status === 'ativo', 'upsert_program_from_builder: expected active status.');

  currentStep = 'cloning and archiving program';
  const cloned = await rpc(client, 'clone_program', { p_program_id: published.id });
  ok(cloned?.id, 'clone_program: expected cloned id.');
  const archived = await rpc(client, 'update_program_status', {
    p_program_id: cloned.id,
    p_status: 'arquivado',
  });
  ok(archived?.status === 'arquivado', 'update_program_status: expected archived status.');

  currentStep = 'enrolling patient and checking generated check-ins';
  const enrollment = await rpc(client, 'enroll_patient_in_program', {
    p_patient_id: PATIENT_ID,
    p_program_id: published.id,
    p_start_date: '2026-05-31',
  });
  ok(enrollment?.id, 'enroll_patient_in_program: expected enrollment id.');
  ok(enrollment?.checkinsCreated === 4, 'enroll_patient_in_program: expected 4 check-ins.');
  ok(enrollment?.appointmentId, 'enroll_patient_in_program: expected agenda appointment id.');
  ok(enrollment?.invoiceId, 'enroll_patient_in_program: expected local invoice id.');
  ok(
    enrollment?.documentTasksCreated === 1,
    'enroll_patient_in_program: expected one required-document task.'
  );

  const generatedCheckins = await countRows('patient_program_checkins', {
    enrollment_id: enrollment.id,
  });
  ok(generatedCheckins >= 4, `Expected generated check-ins, got ${generatedCheckins}.`);

  currentStep = 'checking agenda, finance and required-document reflections';
  const { data: appointment, error: appointmentError } = await admin
    .from('appointments')
    .select('id,type,status,notes')
    .eq('tenant_id', tenant.id)
    .eq('patient_id', PATIENT_ID)
    .eq('id', enrollment.appointmentId)
    .single();
  if (appointmentError) throw appointmentError;
  ok(appointment.status === 'agendado', 'Expected enrollment appointment to be agendado.');
  ok(
    appointment.type === 'avaliacao_inicial',
    'Expected enrollment appointment to be avaliacao_inicial.'
  );

  const { data: invoice, error: invoiceError } = await admin
    .from('patient_invoices')
    .select('id,status,amount_cents,metadata')
    .eq('tenant_id', tenant.id)
    .eq('patient_id', PATIENT_ID)
    .eq('id', enrollment.invoiceId)
    .single();
  if (invoiceError) throw invoiceError;
  ok(invoice.status === 'pending', 'Expected local program invoice to be pending.');
  ok(invoice.amount_cents === 80000, 'Expected local program invoice amount to be 80000.');
  ok(
    invoice.metadata?.source === 'program_enrollment' &&
      invoice.metadata?.enrollment_id === enrollment.id,
    'Expected invoice metadata to reference program enrollment.'
  );

  const { data: documentTasks, error: documentTaskError } = await admin
    .from('patient_tasks')
    .select('id,title,status,details')
    .eq('tenant_id', tenant.id)
    .eq('patient_id', PATIENT_ID)
    .ilike('details', `%${enrollment.id}%`);
  if (documentTaskError) throw documentTaskError;
  ok(
    Array.isArray(documentTasks) &&
      documentTasks.some(
        (task) => task.status === 'open' && task.title.startsWith('Documento obrigatorio:')
      ),
    'Expected open required-document task linked to enrollment.'
  );

  currentStep = 'checking Patient 360 package visibility';
  const { data: summaryEnvelope, error: summaryError } = await client.functions.invoke(
    'patient-360-summary',
    { body: { patient_id: PATIENT_ID } }
  );
  if (summaryError) throw new Error(`patient-360-summary: ${summaryError.message}`);
  const summary = summaryEnvelope?.data;
  ok(
    Array.isArray(summary?.activePackage?.checkins) && summary.activePackage.checkins.length >= 1,
    'patient-360-summary: expected visible package check-ins.'
  );

  console.log('Programs Phase 6 local smoke passed.');
}

run().catch((error) => {
  console.error(`Programs Phase 6 local smoke failed at step "${currentStep}":`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
