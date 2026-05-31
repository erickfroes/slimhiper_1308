#!/usr/bin/env node

/**
 * Local Paciente 360 real smoke.
 *
 * Seeds deterministic local data, signs in real local users, and runs the
 * Patient 360 real Edge Function contract with forbidden and cross-tenant
 * checks enabled.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { getRequiredServiceRoleKey, requireEnv } from './_shared/env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_BOOTSTRAP_PASSWORD',
];

const IDS = {
  patientA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  patientB: '9b5c6d6a-1f7e-4dbb-8eab-3d55a8a1f042',
  program: '71000000-0000-4000-8000-0000000000a1',
  programService: '71000000-0000-4000-8000-0000000000a2',
  programEntitlement: '71000000-0000-4000-8000-0000000000a3',
  enrollment: '71000000-0000-4000-8000-0000000000a4',
  generatedDocument: '72000000-0000-4000-8000-0000000000a1',
  signatureRequest: '72000000-0000-4000-8000-0000000000a2',
  report: '73000000-0000-4000-8000-0000000000a1',
  nutritionPlan: '74000000-0000-4000-8000-0000000000a1',
  nutritionNote: '74000000-0000-4000-8000-0000000000a2',
  chatThread: '75000000-0000-4000-8000-0000000000a1',
  chatMessage: '75000000-0000-4000-8000-0000000000a2',
  invoice: '76000000-0000-4000-8000-0000000000a1',
  timelineLabOrder: '77000000-0000-4000-8000-0000000000a1',
  timelineLabResult: '77000000-0000-4000-8000-0000000000a2',
};

const clinicAdminPermissions = [
  'patients.read',
  'patients.write',
  'agenda.read',
  'agenda.write',
  'encounters.read',
  'encounters.write',
  'soap.read',
  'soap.write',
  'nutrition.read',
  'nutrition.write',
  'prescriptions.read',
  'prescriptions.write',
  'documents.read',
  'documents.write',
  'financial.read',
  'financial.write',
  'packages.read',
  'packages.write',
  'chat.read',
  'chat.write',
  'reports.read',
  'reports.write',
  'timeline.sensitive.read',
];

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
  if (process.env.ALLOW_REMOTE_PATIENT360_SMOKE === 'true') return;

  const parsed = new URL(url);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      'Refusing to run mutating Patient 360 smoke outside localhost. Set ALLOW_REMOTE_PATIENT360_SMOKE=true only for an approved sandbox.'
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

async function ensureAuthUser(email) {
  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const existing = list.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
    email_confirm: true,
    user_metadata: { seeded_by: 'test-patient360-local-real-smoke' },
  });
  if (error) throw error;
  return data.user;
}

async function ensureMembership(user, tenantId, roleCode) {
  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: user.email?.split('@')[0] ?? 'Patient 360 Smoke User',
      platform_role: 'user',
      active_tenant_id: tenantId,
      is_active: true,
    },
    { onConflict: 'id' }
  );
  if (profileError) throw profileError;

  const { error: membershipError } = await admin.from('tenant_memberships').upsert(
    {
      tenant_id: tenantId,
      user_id: user.id,
      role_code: roleCode,
      role: roleCode,
      status: 'active',
    },
    { onConflict: 'tenant_id,user_id' }
  );
  if (membershipError) throw membershipError;
}

async function ensureRolePermissions(tenantId, roleName, permissions) {
  const { data: role, error: roleError } = await admin
    .from('roles')
    .upsert(
      { tenant_id: tenantId, name: roleName, description: `Patient 360 smoke ${roleName}` },
      { onConflict: 'tenant_id,name' }
    )
    .select('id')
    .single();
  if (roleError) throw roleError;

  const { error: permissionError } = await admin.from('permissions').upsert(
    permissions.map((code) => ({
      tenant_id: tenantId,
      code,
      description: `Patient 360 smoke permission ${code}`,
    })),
    { onConflict: 'tenant_id,code' }
  );
  if (permissionError) throw permissionError;

  const { data: permissionRows, error: fetchError } = await admin
    .from('permissions')
    .select('id, code')
    .eq('tenant_id', tenantId)
    .in('code', permissions);
  if (fetchError) throw fetchError;

  const { error: rolePermissionError } = await admin.from('role_permissions').upsert(
    (permissionRows ?? []).map((permission) => ({
      tenant_id: tenantId,
      role_id: role.id,
      permission_id: permission.id,
    })),
    { onConflict: 'tenant_id,role_id,permission_id' }
  );
  if (rolePermissionError) throw rolePermissionError;
}

async function seedPatient360TabData(tenantId, patientId, userId) {
  const now = new Date().toISOString();

  await admin
    .from('programs')
    .upsert(
      {
        id: IDS.program,
        tenant_id: tenantId,
        name: 'Patient 360 Smoke Program',
        program_type: 'saude_metabolica',
        objective: 'Local smoke coverage for Patient 360 packages tab.',
        duration_weeks: 12,
        status: 'ativo',
        payment_model: 'parcelado',
        payment_description: 'Local smoke payment plan',
        created_by: userId,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('program_services')
    .upsert(
      {
        id: IDS.programService,
        tenant_id: tenantId,
        program_id: IDS.program,
        label: 'Consultas clinicas',
        quantity: 4,
        unit: 'consulta',
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('program_entitlements')
    .upsert(
      {
        id: IDS.programEntitlement,
        tenant_id: tenantId,
        program_id: IDS.program,
        key: 'chat',
        label: 'Chat com equipe',
        enabled: true,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('patient_program_enrollments')
    .upsert(
      {
        id: IDS.enrollment,
        tenant_id: tenantId,
        patient_id: patientId,
        program_id: IDS.program,
        status: 'ativo',
        start_date: '2026-05-01',
        current_week: 5,
        total_consultations: 4,
        used_consultations: 1,
        total_nutrition_sessions: 3,
        used_nutrition_sessions: 1,
        metadata: { seeded_by: 'test-patient360-local-real-smoke' },
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('generated_documents')
    .upsert(
      {
        id: IDS.generatedDocument,
        tenant_id: tenantId,
        patient_id: patientId,
        name: 'Termo local Patient 360',
        category: 'termo',
        status: 'sent_for_signature',
        storage_bucket: 'patient-documents',
        storage_path: `${tenantId}/${patientId}/${IDS.generatedDocument}/termo-local.pdf`,
        generated_by: userId,
        released_to_patient: false,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('signature_requests')
    .upsert(
      {
        id: IDS.signatureRequest,
        tenant_id: tenantId,
        patient_id: patientId,
        generated_document_id: IDS.generatedDocument,
        provider: 'd4sign',
        provider_document_id: 'local-d4sign-smoke',
        status: 'sent',
        sent_at: now,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('report_definitions')
    .upsert(
      {
        id: IDS.report,
        tenant_id: tenantId,
        key: 'patient360_smoke',
        label: 'Patient 360 Smoke Report',
        description: 'Local report definition for Patient 360 tab smoke.',
        icon_key: 'FileText',
        export_enabled: false,
        status: 'active',
        definition: { badge: 'Local' },
      },
      { onConflict: 'tenant_id,key' }
    )
    .throwOnError();

  await admin
    .from('nutrition_plans')
    .upsert(
      {
        id: IDS.nutritionPlan,
        tenant_id: tenantId,
        patient_id: patientId,
        status: 'active',
        name: 'Plano alimentar local',
        target_calories: 1800,
        target_protein_g: 120,
        target_carbs_g: 180,
        target_fat_g: 60,
        meals: [
          {
            id: 'breakfast',
            name: 'Cafe da manha',
            time: '08:00',
            targetCalories: 400,
            targetProteinG: 25,
            targetCarbsG: 45,
            targetFatG: 12,
          },
        ],
        food_groups: [
          {
            label: 'Proteinas magras',
            category: 'fonte_proteica',
            portionDescription: '1 palma',
            dailyServings: 3,
            examples: ['frango', 'ovos'],
          },
        ],
        meal_adherence: [{ week: 1, label: 'S1', adherencePercent: 82, mealsLogged: 12, mealsTotal: 14 }],
        metadata: { nutritionistName: 'Equipe SlimHiper', adherencePercent: 82 },
        created_by: userId,
        published_at: now,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('nutrition_plan_notes')
    .upsert(
      {
        id: IDS.nutritionNote,
        tenant_id: tenantId,
        patient_id: patientId,
        nutrition_plan_id: IDS.nutritionPlan,
        author_id: userId,
        author_name: 'Equipe SlimHiper',
        author_role: 'Nutricionista',
        content: 'Nota local para smoke Patient 360.',
        is_internal: true,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  const { data: thread, error: threadError } = await admin
    .from('patient_chat_threads')
    .upsert(
      {
        id: IDS.chatThread,
        tenant_id: tenantId,
        patient_id: patientId,
        status: 'open',
        assigned_to: userId,
        last_message_at: now,
        unread_count: 1,
        metadata: {
          responsibleTeamMember: { name: 'Equipe SlimHiper', role: 'Atendimento' },
          serviceHours: { days: 'Seg-Sex', start: '08:00', end: '18:00' },
        },
      },
      { onConflict: 'tenant_id,patient_id' }
    )
    .select('id')
    .single();
  if (threadError) throw threadError;

  await admin
    .from('patient_chat_messages')
    .upsert(
      {
        id: IDS.chatMessage,
        tenant_id: tenantId,
        thread_id: thread.id,
        patient_id: patientId,
        sender_user_id: null,
        sender_label: 'Paciente',
        body: 'Mensagem local para smoke Patient 360.',
        metadata: { sender_type: 'patient' },
        created_at: now,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('patient_invoices')
    .upsert(
      {
        id: IDS.invoice,
        tenant_id: tenantId,
        patient_id: patientId,
        status: 'pending',
        amount_cents: 45000,
        due_date: '2026-06-15',
        description: 'Parcela local Patient 360',
        payment_link: 'https://sandbox.local/pay/patient360',
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('patient_timeline_events')
    .upsert(
      [
        {
          id: IDS.timelineLabOrder,
          tenant_id: tenantId,
          patient_id: patientId,
          event_type: 'exame_solicitado',
          category: 'clinical',
          title: 'Exame solicitado',
          description: 'Evento local para smoke de timeline.',
          actor_name: 'Equipe clinica',
          status_label: 'Solicitado',
          event_at: '2026-05-30T10:00:00.000Z',
          payload: { seeded_by: 'test-patient360-local-real-smoke' },
        },
        {
          id: IDS.timelineLabResult,
          tenant_id: tenantId,
          patient_id: patientId,
          event_type: 'exame_resultado_recebido',
          category: 'clinical',
          title: 'Resultado de exame recebido',
          description: 'Evento local para smoke de timeline.',
          actor_name: 'Equipe clinica',
          status_label: 'Recebido',
          event_at: '2026-05-30T11:00:00.000Z',
          payload: { seeded_by: 'test-patient360-local-real-smoke' },
        },
      ],
      { onConflict: 'id' }
    )
    .throwOnError();
}

function createSignedInClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email) {
  const client = createSignedInClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
  });
  if (error) throw error;
  const token = data.session?.access_token;
  ok(token, `Missing access token for ${email}`);
  return { client, token };
}

async function callFunction(name, token, body) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
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
    // Ignore non-JSON function responses.
  }

  return { status: response.status, json };
}

async function expectFunctionOk(name, token, body, validate) {
  const response = await callFunction(name, token, body);
  ok(response.status === 200, `${name}: expected 200, got ${response.status}`);
  ok(response.json?.ok === true, `${name}: expected ok envelope`);
  validate?.(response.json.data);
  return response.json.data;
}

async function countRows(client, table, filters) {
  let query = client.from(table).select('id', { count: 'exact', head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function expectCount(client, label, table, filters, minimum = 1) {
  const count = await countRows(client, table, filters);
  ok(count >= minimum, `${label}: expected at least ${minimum}, got ${count}`);
}

async function runRealContract(staffToken, forbiddenToken) {
  execFileSync(
    process.execPath,
    [path.join('scripts', 'supabase', 'test-patient360-contract.mjs'), '--mode=real'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        TOKEN_WITH_PATIENTS_READ: staffToken,
        TOKEN_WITHOUT_PATIENTS_READ: forbiddenToken,
        PATIENT_ID_TENANT_A: IDS.patientA,
        PATIENT_ID_TENANT_B: IDS.patientB,
      },
      stdio: 'inherit',
    }
  );
}

async function run() {
  currentStep = 'running base bootstraps';
  runNodeScript(path.join('scripts', 'supabase', 'bootstrap-core-auth.mjs'));
  runNodeScript(path.join('scripts', 'supabase', 'bootstrap-patient360-demo.mjs'));
  runNodeScript(path.join('scripts', 'supabase', 'bootstrap-cross-tenant-demo.mjs'));

  currentStep = 'ensuring tenants and users';
  const tenantA = await ensureTenant('demo-clinic');
  await ensureTenant('demo-clinic-b');
  const staff = await ensureAuthUser('patient360.staff.local@example.com');
  const forbidden = await ensureAuthUser('patient360.forbidden.local@example.com');

  currentStep = 'ensuring role permissions';
  await ensureRolePermissions(tenantA.id, 'clinic_admin', clinicAdminPermissions);
  await ensureMembership(staff, tenantA.id, 'clinic_admin');
  await ensureMembership(forbidden, tenantA.id, 'patient');

  currentStep = 'seeding tab contracts';
  await seedPatient360TabData(tenantA.id, IDS.patientA, staff.id);

  currentStep = 'signing in local users';
  const staffSession = await signIn('patient360.staff.local@example.com');
  const forbiddenSession = await signIn('patient360.forbidden.local@example.com');

  currentStep = 'running Patient 360 real contract';
  await runRealContract(staffSession.token, forbiddenSession.token);

  currentStep = 'checking tab contracts through Edge Functions';
  await expectFunctionOk('patient-documents', staffSession.token, { patient_id: IDS.patientA }, (data) => {
    ok(Array.isArray(data?.documents), 'patient-documents: expected documents array');
    ok(data.documents.length >= 1, 'patient-documents: expected seeded document');
  });
  await expectFunctionOk('patient-nutrition-plan', staffSession.token, { patient_id: IDS.patientA }, (data) => {
    ok(data?.isActive === true, 'patient-nutrition-plan: expected active plan');
    ok(Array.isArray(data?.meals) && data.meals.length >= 1, 'patient-nutrition-plan: expected meals');
  });
  await expectFunctionOk('patient-reports', staffSession.token, { patient_id: IDS.patientA }, (data) => {
    ok(Array.isArray(data), 'patient-reports: expected definitions array');
    ok(data.some((item) => item?.key === 'patient360_smoke'), 'patient-reports: expected smoke report');
  });

  currentStep = 'checking tab contracts through RLS/RPC';
  await expectCount(staffSession.client, 'consultas tab', 'appointments', { patient_id: IDS.patientA });
  await expectCount(staffSession.client, 'pacotes tab', 'patient_program_enrollments', {
    patient_id: IDS.patientA,
  });
  await expectCount(staffSession.client, 'prescricoes tab', 'prescriptions_placeholder', {
    patient_id: IDS.patientA,
  });
  await expectCount(staffSession.client, 'chat tab thread', 'patient_chat_threads', {
    patient_id: IDS.patientA,
  });
  await expectCount(staffSession.client, 'chat tab messages', 'patient_chat_messages', {
    patient_id: IDS.patientA,
  });

  const { data: financial, error: financialError } = await staffSession.client.rpc(
    'get_patient_financial_summary',
    { p_patient_id: IDS.patientA }
  );
  if (financialError) throw financialError;
  ok(Array.isArray(financial?.invoices), 'financeiro tab: expected invoices array');
  ok(financial.invoices.length >= 1, 'financeiro tab: expected seeded invoice');

  const timeline = await expectFunctionOk(
    'patient-timeline',
    staffSession.token,
    { patient_id: IDS.patientA, category: 'clinical', page: 1, page_size: 50 },
    (data) => {
      ok(Array.isArray(data?.events), 'patient-timeline: expected events array');
    }
  );
  const timelineTypes = new Set(timeline.events.map((event) => event.type));
  ok(timelineTypes.has('exame_solicitado'), 'timeline: expected exame_solicitado event type');
  ok(
    timelineTypes.has('exame_resultado_recebido'),
    'timeline: expected exame_resultado_recebido event type'
  );

  console.log('Patient 360 local real smoke passed');
  console.log('- summary/timeline real contract passed with forbidden and cross-tenant checks');
  console.log('- documents, nutrition, reports Edge Function tabs passed');
  console.log('- consultas, pacotes, prescricoes, financeiro and chat RLS/RPC tabs passed');
}

run().catch((error) => {
  console.error(
    `Patient 360 local real smoke failed during ${currentStep}:`,
    shortError(error) || 'unknown_error'
  );
  process.exit(1);
});
