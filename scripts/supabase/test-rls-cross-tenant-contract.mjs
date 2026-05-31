#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { getRequiredServiceRoleKey, requireEnv } from './_shared/env.mjs';

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_BOOTSTRAP_PASSWORD',
];

const IDS = {
  patientA: '10000000-0000-4000-8000-0000000000a1',
  patientB: '10000000-0000-4000-8000-0000000000b1',
  documentA: '20000000-0000-4000-8000-0000000000a1',
  documentB: '20000000-0000-4000-8000-0000000000b1',
  invoiceA: '30000000-0000-4000-8000-0000000000a1',
  invoiceB: '30000000-0000-4000-8000-0000000000b1',
  chatThreadA: '40000000-0000-4000-8000-0000000000a1',
  chatThreadB: '40000000-0000-4000-8000-0000000000b1',
  chatMessageA: '50000000-0000-4000-8000-0000000000a1',
  chatMessageB: '50000000-0000-4000-8000-0000000000b1',
  reportA: '60000000-0000-4000-8000-0000000000a1',
  reportB: '60000000-0000-4000-8000-0000000000b1',
};

const permissionsNeeded = [
  'patients.read',
  'patients.write',
  'documents.read',
  'documents.write',
  'financial.read',
  'financial.write',
  'chat.read',
  'chat.write',
  'reports.read',
  'reports.write',
];

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
  if (process.env.ALLOW_REMOTE_RLS_SMOKE === 'true') return;

  const parsed = new URL(url);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      'Refusing to run mutating RLS smoke outside localhost. Set ALLOW_REMOTE_RLS_SMOKE=true only for an approved sandbox.'
    );
  }
}

function ok(condition, message) {
  if (!condition) throw new Error(message);
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
    user_metadata: { seeded_by: 'test-rls-cross-tenant-contract' },
  });
  if (error) throw error;
  return data.user;
}

async function ensureTenant(slug, name) {
  const { data, error } = await admin
    .from('tenants')
    .upsert({ slug, name, status: 'active' }, { onConflict: 'slug' })
    .select('id, slug')
    .single();
  if (error) throw error;
  return data;
}

async function ensureRoleAndPermissions(tenantId, roleName) {
  const { data: role, error: roleError } = await admin
    .from('roles')
    .upsert(
      { tenant_id: tenantId, name: roleName, description: `RLS smoke role ${roleName}` },
      { onConflict: 'tenant_id,name' }
    )
    .select('id')
    .single();
  if (roleError) throw roleError;

  const { error: permissionError } = await admin.from('permissions').upsert(
    permissionsNeeded.map((code) => ({
      tenant_id: tenantId,
      code,
      description: `RLS smoke permission ${code}`,
    })),
    { onConflict: 'tenant_id,code' }
  );
  if (permissionError) throw permissionError;

  const { data: permissions, error: fetchError } = await admin
    .from('permissions')
    .select('id, code')
    .eq('tenant_id', tenantId)
    .in('code', permissionsNeeded);
  if (fetchError) throw fetchError;

  const { error: rolePermissionError } = await admin.from('role_permissions').upsert(
    (permissions ?? []).map((permission) => ({
      tenant_id: tenantId,
      role_id: role.id,
      permission_id: permission.id,
    })),
    { onConflict: 'tenant_id,role_id,permission_id' }
  );
  if (rolePermissionError) throw rolePermissionError;
}

async function ensureMembership(user, tenantId, roleCode) {
  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: user.email?.split('@')[0] ?? 'RLS Smoke User',
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

async function seedTenantData(tenant, patientId, ids, suffix) {
  await admin
    .from('patients')
    .upsert(
      {
        id: patientId,
        tenant_id: tenant.id,
        preferred_name: `RLS Paciente ${suffix}`,
        status: 'active',
        tags: ['rls-cross-tenant-smoke'],
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('patient_pii')
    .upsert(
      {
        tenant_id: tenant.id,
        patient_id: patientId,
        full_name: `RLS Paciente ${suffix}`,
        cpf_masked: '***.***.***-**',
        phone: '',
        email: '',
        birth_date: '1990-01-01',
      },
      { onConflict: 'tenant_id,patient_id' }
    )
    .throwOnError();

  await admin
    .from('generated_documents')
    .upsert(
      {
        id: ids.document,
        tenant_id: tenant.id,
        patient_id: patientId,
        name: `RLS Documento ${suffix}`,
        category: 'relatorio',
        status: 'generated',
        storage_bucket: 'patient-documents',
        storage_path: `${tenant.id}/${patientId}/${ids.document}/rls-${suffix}.pdf`,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('patient_invoices')
    .upsert(
      {
        id: ids.invoice,
        tenant_id: tenant.id,
        patient_id: patientId,
        status: 'pending',
        amount_cents: 12345,
        due_date: '2026-06-15',
        description: `RLS Invoice ${suffix}`,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('patient_chat_threads')
    .upsert(
      {
        id: ids.chatThread,
        tenant_id: tenant.id,
        patient_id: patientId,
        status: 'open',
        unread_count: 1,
        last_message_at: new Date().toISOString(),
        metadata: { seeded_by: 'test-rls-cross-tenant-contract' },
      },
      { onConflict: 'tenant_id,patient_id' }
    )
    .throwOnError();

  await admin
    .from('patient_chat_messages')
    .upsert(
      {
        id: ids.chatMessage,
        tenant_id: tenant.id,
        thread_id: ids.chatThread,
        patient_id: patientId,
        sender_label: 'RLS smoke',
        body: `Mensagem RLS ${suffix}`,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('report_definitions')
    .upsert(
      {
        id: ids.report,
        tenant_id: tenant.id,
        key: `rls_${suffix.toLowerCase()}`,
        label: `RLS Report ${suffix}`,
        status: 'active',
        definition: { seeded_by: 'test-rls-cross-tenant-contract' },
      },
      { onConflict: 'tenant_id,key' }
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
  const { error } = await client.auth.signInWithPassword({
    email,
    password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
  });
  if (error) throw error;
  return client;
}

async function countRows(client, table, filters) {
  let query = client.from(table).select('*', { count: 'exact', head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function updatePatientName(client, patientId, preferredName) {
  const { data, error } = await client
    .from('patients')
    .update({ preferred_name: preferredName })
    .eq('id', patientId)
    .select('id');
  if (error) throw error;
  return data ?? [];
}

async function checkedCount(label, client, table, filters) {
  try {
    return await countRows(client, table, filters);
  } catch (error) {
    const details =
      error && typeof error === 'object'
        ? [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ')
        : String(error);
    throw new Error(`${label}: ${details || 'unknown_error'}`);
  }
}

async function run() {
  currentStep = 'ensuring tenants';
  const tenantA = await ensureTenant('demo-clinic', 'Demo Clinic');
  const tenantB = await ensureTenant('demo-clinic-b', 'Demo Clinic B');
  currentStep = 'ensuring users';
  const userA = await ensureAuthUser('rls.tenant-a.admin@example.com');
  const userB = await ensureAuthUser('rls.tenant-b.admin@example.com');

  currentStep = 'ensuring roles and memberships';
  await ensureRoleAndPermissions(tenantA.id, 'clinic_admin');
  await ensureRoleAndPermissions(tenantB.id, 'clinic_admin');
  await ensureMembership(userA, tenantA.id, 'clinic_admin');
  await ensureMembership(userB, tenantB.id, 'clinic_admin');

  currentStep = 'seeding tenant data';
  await seedTenantData(
    tenantA,
    IDS.patientA,
    {
      document: IDS.documentA,
      invoice: IDS.invoiceA,
      chatThread: IDS.chatThreadA,
      chatMessage: IDS.chatMessageA,
      report: IDS.reportA,
    },
    'A'
  );
  await seedTenantData(
    tenantB,
    IDS.patientB,
    {
      document: IDS.documentB,
      invoice: IDS.invoiceB,
      chatThread: IDS.chatThreadB,
      chatMessage: IDS.chatMessageB,
      report: IDS.reportB,
    },
    'B'
  );

  currentStep = 'signing in smoke users';
  const clientA = await signIn('rls.tenant-a.admin@example.com');
  const clientB = await signIn('rls.tenant-b.admin@example.com');

  currentStep = 'checking RLS reads';
  const checks = [
    [
      'tenant A can read own patient',
      await checkedCount('own patient', clientA, 'patients', { id: IDS.patientA }),
      1,
    ],
    [
      'tenant A cannot read tenant B patient',
      await checkedCount('cross patient', clientA, 'patients', { id: IDS.patientB }),
      0,
    ],
    [
      'tenant A cannot read tenant B PII',
      await checkedCount('cross patient_pii', clientA, 'patient_pii', { patient_id: IDS.patientB }),
      0,
    ],
    [
      'tenant A cannot read tenant B generated documents',
      await checkedCount('cross generated_documents', clientA, 'generated_documents', {
        id: IDS.documentB,
      }),
      0,
    ],
    [
      'tenant A cannot read tenant B invoices',
      await checkedCount('cross patient_invoices', clientA, 'patient_invoices', {
        id: IDS.invoiceB,
      }),
      0,
    ],
    [
      'tenant A cannot read tenant B chat threads',
      await checkedCount('cross patient_chat_threads', clientA, 'patient_chat_threads', {
        id: IDS.chatThreadB,
      }),
      0,
    ],
    [
      'tenant A cannot read tenant B chat messages',
      await checkedCount('cross patient_chat_messages', clientA, 'patient_chat_messages', {
        id: IDS.chatMessageB,
      }),
      0,
    ],
    [
      'tenant A cannot read tenant B report definitions',
      await checkedCount('cross report_definitions', clientA, 'report_definitions', {
        id: IDS.reportB,
      }),
      0,
    ],
    [
      'tenant B can read own patient',
      await checkedCount('tenant B own patient', clientB, 'patients', { id: IDS.patientB }),
      1,
    ],
  ];

  for (const [label, actual, expected] of checks) {
    ok(actual === expected, `${label}: expected ${expected}, received ${actual}`);
  }

  currentStep = 'checking cross-tenant write blocking';
  const crossUpdate = await updatePatientName(clientA, IDS.patientB, 'RLS leak attempt');
  ok(crossUpdate.length === 0, 'tenant A cross-tenant update should affect 0 rows');

  const { data: patientB, error: patientBError } = await admin
    .from('patients')
    .select('preferred_name')
    .eq('id', IDS.patientB)
    .single();
  if (patientBError) throw patientBError;
  ok(patientB.preferred_name === 'RLS Paciente B', 'tenant B patient should not be mutated');

  console.log('RLS cross-tenant contract checks passed');
}

run().catch((error) => {
  const details =
    error && typeof error === 'object'
      ? [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ')
      : String(error);
  console.error(
    `RLS cross-tenant contract failed during ${currentStep}:`,
    details || 'unknown_error'
  );
  process.exit(1);
});
