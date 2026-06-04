#!/usr/bin/env node

/**
 * Local Phase 8.1 reports smoke.
 *
 * Exercises the secure reports RPC contract for clinic_admin/physician/
 * financial_user, a user without reports.read, cross-tenant scoping, and
 * sensitive financial export authorization. Refuses remote Supabase targets by
 * default and uses only synthetic local rows.
 */

import { createClient } from '@supabase/supabase-js';
import {
  getRequiredServiceRoleKey,
  requireEnv,
  requireSupabasePublishableKey,
} from './_shared/env.mjs';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_BOOTSTRAP_PASSWORD'];

const IDS = {
  tenantA: '18000000-0000-4000-8000-0000000000a1',
  tenantB: '18000000-0000-4000-8000-0000000000b1',
  patientA: '18000000-0000-4000-8000-0000000000a2',
  patientB: '18000000-0000-4000-8000-0000000000b2',
  reportA: '18000000-0000-4000-8000-0000000000a3',
  reportB: '18000000-0000-4000-8000-0000000000b3',
  appointmentA: '18000000-0000-4000-8000-0000000000a4',
  documentA: '18000000-0000-4000-8000-0000000000a5',
  invoiceA: '18000000-0000-4000-8000-0000000000a6',
};

let admin;
let currentStep = 'initializing';

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
  if (process.env.ALLOW_REMOTE_REPORTS_SMOKE === 'true') return;

  const parsed = new URL(url);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      'Refusing to run mutating reports smoke outside localhost. Set ALLOW_REMOTE_REPORTS_SMOKE=true only for an approved sandbox.'
    );
  }
}

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function shortError(error) {
  if (!error || typeof error !== 'object') return String(error ?? 'unknown_error');
  return [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ');
}

async function ensureUser(email, fullName, tenantId, roleCode, activeTenantId = tenantId) {
  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const existing = list.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  const result = existing
    ? await admin.auth.admin.updateUserById(existing.id, {
        password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
        email_confirm: true,
      })
    : await admin.auth.admin.createUser({
        email,
        password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
        email_confirm: true,
        user_metadata: { seeded_by: 'test-reports-phase8-local-smoke' },
      });

  if (result.error) throw result.error;
  const user = result.data.user;
  ok(user, `Could not ensure auth user ${email}.`);

  await admin
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email,
        full_name: fullName,
        platform_role: 'user',
        active_tenant_id: activeTenantId,
        is_active: true,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('tenant_memberships')
    .upsert(
      {
        tenant_id: tenantId,
        user_id: user.id,
        role_code: roleCode,
        role: roleCode,
        status: 'active',
        accepted_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,user_id' }
    )
    .throwOnError();

  return user;
}

async function signIn(email) {
  const client = createClient(process.env.SUPABASE_URL, requireSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
  });
  if (error) throw error;
  ok(data.session?.access_token, `Expected session token for ${email}.`);
  return client;
}

async function seedTenant(tenantId, slug, patientId, reportId) {
  await admin
    .from('tenants')
    .upsert(
      { id: tenantId, name: `Reports Smoke ${slug}`, slug, status: 'active' },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('patients')
    .upsert(
      { id: patientId, tenant_id: tenantId, preferred_name: `Paciente ${slug}`, status: 'active' },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('patient_pii')
    .upsert(
      { patient_id: patientId, tenant_id: tenantId, full_name: `Paciente Reports ${slug}` },
      { onConflict: 'patient_id' }
    )
    .throwOnError();

  await admin
    .from('report_definitions')
    .upsert(
      {
        id: reportId,
        tenant_id: tenantId,
        key: 'resumo-clinico',
        label: 'Resumo Clinico',
        description: 'Resumo clinico local de smoke.',
        icon_key: 'FileText',
        export_enabled: true,
        status: 'active',
        definition: { badge: 'Smoke' },
      },
      { onConflict: 'tenant_id,key' }
    )
    .throwOnError();
}

async function seedData() {
  await seedTenant(IDS.tenantA, 'reports-smoke-a', IDS.patientA, IDS.reportA);
  await seedTenant(IDS.tenantB, 'reports-smoke-b', IDS.patientB, IDS.reportB);

  await admin
    .from('appointments')
    .upsert(
      {
        id: IDS.appointmentA,
        tenant_id: IDS.tenantA,
        patient_id: IDS.patientA,
        type: 'consulta_medica',
        status: 'concluido',
        scheduled_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('generated_documents')
    .upsert(
      {
        id: IDS.documentA,
        tenant_id: IDS.tenantA,
        patient_id: IDS.patientA,
        name: 'Documento smoke',
        category: 'termo',
        status: 'generated',
        storage_bucket: 'patient-documents',
        storage_path: `${IDS.tenantA}/${IDS.patientA}/${IDS.documentA}/smoke.pdf`,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('patient_invoices')
    .upsert(
      {
        id: IDS.invoiceA,
        tenant_id: IDS.tenantA,
        patient_id: IDS.patientA,
        status: 'pending',
        amount_cents: 12345,
        due_date: new Date().toISOString().slice(0, 10),
        description: 'Cobranca smoke reports',
      },
      { onConflict: 'id' }
    )
    .throwOnError();
}

async function expectRpcOk(client, name, args, label) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${label}: ${shortError(error)}`);
  return data;
}

async function expectRpcForbidden(client, name, args, label) {
  const { error } = await client.rpc(name, args);
  ok(error, `${label}: expected forbidden error.`);
}

async function main() {
  currentStep = 'seeding local data';
  await seedData();

  currentStep = 'ensuring users';
  await ensureUser('reports-admin@example.test', 'Reports Admin', IDS.tenantA, 'clinic_admin');
  await ensureUser('reports-physician@example.test', 'Reports Physician', IDS.tenantA, 'physician');
  await ensureUser(
    'reports-financial@example.test',
    'Reports Financial',
    IDS.tenantA,
    'financial_user'
  );
  await ensureUser('reports-no-read@example.test', 'Reports No Read', IDS.tenantA, 'receptionist');
  await ensureUser(
    'reports-tenant-b@example.test',
    'Reports Tenant B',
    IDS.tenantB,
    'clinic_admin'
  );

  currentStep = 'signing in users';
  const clinicAdmin = await signIn('reports-admin@example.test');
  const physician = await signIn('reports-physician@example.test');
  const financialUser = await signIn('reports-financial@example.test');
  const noRead = await signIn('reports-no-read@example.test');
  const tenantB = await signIn('reports-tenant-b@example.test');

  currentStep = 'checking definitions';
  const definitions = await expectRpcOk(
    clinicAdmin,
    'list_clinic_report_definitions',
    {},
    'clinic_admin definitions'
  );
  ok(
    Array.isArray(definitions) && definitions.length >= 1,
    'Expected report definitions for clinic_admin.'
  );

  currentStep = 'checking clinic and patient run/export';
  const adminRun = await expectRpcOk(
    clinicAdmin,
    'create_clinic_report_run',
    {
      p_report_key: 'resumo-clinico',
      p_filters: { from: '2026-01-01', to: '2026-12-31' },
      p_export_format: 'csv',
      p_patient_id: IDS.patientA,
    },
    'clinic_admin patient report run'
  );
  ok(adminRun?.id && adminRun?.exportToken, 'Expected report run id and export token.');

  const exportPayload = await expectRpcOk(
    clinicAdmin,
    'get_clinic_report_export',
    { p_run_id: adminRun.id, p_export_token: adminRun.exportToken },
    'clinic_admin export payload'
  );
  ok(Array.isArray(exportPayload?.rows), 'Expected export rows array.');

  currentStep = 'checking physician reports without finance';
  const physicianRun = await expectRpcOk(
    physician,
    'create_clinic_report_run',
    {
      p_report_key: 'documentos-emitidos',
      p_filters: { from: '2026-01-01', to: '2026-12-31' },
      p_export_format: 'pdf',
      p_patient_id: IDS.patientA,
    },
    'physician document report run'
  );
  ok(physicianRun?.scope === 'patient', 'Expected physician patient-scoped run.');

  currentStep = 'checking financial sensitive permission';
  const financeRun = await expectRpcOk(
    financialUser,
    'create_clinic_report_run',
    {
      p_report_key: 'resumo-financeiro',
      p_filters: { from: '2026-01-01', to: '2026-12-31' },
      p_export_format: 'csv',
      p_patient_id: IDS.patientA,
    },
    'financial_user financial report run'
  );
  ok(
    financeRun?.resultSummary?.requiresFinancialRead === true,
    'Expected financial permission marker.'
  );

  await expectRpcForbidden(
    physician,
    'create_clinic_report_run',
    {
      p_report_key: 'resumo-financeiro',
      p_filters: { from: '2026-01-01', to: '2026-12-31' },
      p_export_format: 'csv',
      p_patient_id: IDS.patientA,
    },
    'physician cannot export financial report'
  );

  currentStep = 'checking forbidden and cross-tenant';
  await expectRpcForbidden(
    noRead,
    'list_clinic_report_definitions',
    {},
    'receptionist without reports.read'
  );
  await expectRpcForbidden(
    tenantB,
    'create_clinic_report_run',
    {
      p_report_key: 'resumo-clinico',
      p_filters: { from: '2026-01-01', to: '2026-12-31' },
      p_export_format: 'csv',
      p_patient_id: IDS.patientA,
    },
    'tenant B cannot export tenant A patient report'
  );

  console.log('Phase 8.1 reports local smoke passed.');
}

main().catch((error) => {
  console.error(`Phase 8.1 reports smoke failed at step: ${currentStep}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
