#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import {
  getRequiredServiceRoleKey,
  requireEnv,
  requireSupabasePublishableKey,
} from './_shared/env.mjs';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_BOOTSTRAP_PASSWORD'];

const IDS = {
  patientA: '70000000-0000-4000-8000-0000000000a1',
  patientB: '70000000-0000-4000-8000-0000000000b1',
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
  if (process.env.ALLOW_REMOTE_PATIENT_LINKAGE_SMOKE === 'true') return;

  const parsed = new URL(url);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      'Refusing to run mutating patient linkage smoke outside localhost. Set ALLOW_REMOTE_PATIENT_LINKAGE_SMOKE=true only for an approved sandbox.'
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
    user_metadata: { seeded_by: 'test-patient-linkage-contract' },
  });
  if (error) throw error;
  return data.user;
}

async function ensureProfile(user, fullName, activeTenantId = null) {
  const { error } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: fullName,
      platform_role: 'user',
      active_tenant_id: activeTenantId,
      is_active: true,
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

async function ensurePortalRoleAndPermission(tenantId, roleName) {
  const { data: role, error: roleError } = await admin
    .from('roles')
    .upsert(
      { tenant_id: tenantId, name: roleName, description: `Patient linkage smoke ${roleName}` },
      { onConflict: 'tenant_id,name' }
    )
    .select('id')
    .single();
  if (roleError) throw roleError;

  const { data: permission, error: permissionError } = await admin
    .from('permissions')
    .upsert(
      {
        tenant_id: tenantId,
        code: 'patient_portal.access',
        description: 'Access patient portal',
      },
      { onConflict: 'tenant_id,code' }
    )
    .select('id')
    .single();
  if (permissionError) throw permissionError;

  const { error: rolePermissionError } = await admin
    .from('role_permissions')
    .upsert(
      { tenant_id: tenantId, role_id: role.id, permission_id: permission.id },
      { onConflict: 'tenant_id,role_id,permission_id' }
    );
  if (rolePermissionError) throw rolePermissionError;
}

async function ensurePortalMembership(user, tenantId, roleCode) {
  const { error } = await admin.from('tenant_memberships').upsert(
    {
      tenant_id: tenantId,
      user_id: user.id,
      role_code: roleCode,
      role: roleCode,
      status: 'active',
    },
    { onConflict: 'tenant_id,user_id' }
  );
  if (error) throw error;
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

async function ensurePatient(tenant, patientId, suffix) {
  await admin
    .from('patients')
    .upsert(
      {
        id: patientId,
        tenant_id: tenant.id,
        preferred_name: `Linkage Paciente ${suffix}`,
        status: 'active',
        tags: ['patient-linkage-smoke'],
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
        full_name: `Linkage Paciente ${suffix}`,
        cpf_masked: '***.***.***-**',
        phone: '',
        email: '',
      },
      { onConflict: 'tenant_id,patient_id' }
    )
    .throwOnError();
}

async function ensurePatientAccount(tenant, patientId, user) {
  await admin
    .from('patient_accounts')
    .upsert(
      {
        tenant_id: tenant.id,
        patient_id: patientId,
        user_id: user.id,
        status: 'active',
        linked_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,patient_id,user_id' }
    )
    .throwOnError();
}

async function ensureGuardianLink(tenant, patientId, user, relationship) {
  await admin
    .from('guardian_links')
    .upsert(
      {
        tenant_id: tenant.id,
        patient_id: patientId,
        guardian_user_id: user.id,
        relationship,
        status: 'active',
      },
      { onConflict: 'tenant_id,patient_id,guardian_user_id' }
    )
    .throwOnError();
}

function createSignedInClient() {
  return createClient(process.env.SUPABASE_URL, requireSupabasePublishableKey(), {
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

async function checkedPortalSnapshot(label, client, patientId, shouldSucceed) {
  const { data, error } = await client.rpc('get_patient_portal_snapshot', {
    p_patient_id: patientId,
  });

  if (!shouldSucceed) {
    ok(Boolean(error), `${label}: expected RPC to be rejected`);
    return null;
  }

  if (error) {
    const details = [error.message, error.code, error.details, error.hint]
      .filter(Boolean)
      .join(' | ');
    throw new Error(`${label}: ${details || 'unknown_error'}`);
  }

  ok(data && typeof data === 'object', `${label}: expected JSON object snapshot`);
  ok(data.patient?.patientId === patientId, `${label}: expected own patient snapshot`);
  return data;
}

async function run() {
  currentStep = 'ensuring tenants and patients';
  const tenantA = await ensureTenant('demo-clinic-linkage', 'Demo Clinic Linkage');
  const tenantB = await ensureTenant('demo-clinic-linkage-b', 'Demo Clinic Linkage B');
  await ensurePatient(tenantA, IDS.patientA, 'A');
  await ensurePatient(tenantB, IDS.patientB, 'B');

  currentStep = 'ensuring linked auth users';
  const patientA = await ensureAuthUser('linkage.patient-a@example.com');
  const patientB = await ensureAuthUser('linkage.patient-b@example.com');
  const guardianA = await ensureAuthUser('linkage.guardian-a@example.com');
  const guardianB = await ensureAuthUser('linkage.guardian-b@example.com');

  await ensureProfile(patientA, 'Linkage Patient A', tenantA.id);
  await ensureProfile(patientB, 'Linkage Patient B', tenantB.id);
  await ensureProfile(guardianA, 'Linkage Guardian A', tenantA.id);
  await ensureProfile(guardianB, 'Linkage Guardian B', tenantB.id);

  currentStep = 'ensuring portal roles and memberships';
  await ensurePortalRoleAndPermission(tenantA.id, 'patient');
  await ensurePortalRoleAndPermission(tenantA.id, 'guardian');
  await ensurePortalRoleAndPermission(tenantB.id, 'patient');
  await ensurePortalRoleAndPermission(tenantB.id, 'guardian');
  await ensurePortalMembership(patientA, tenantA.id, 'patient');
  await ensurePortalMembership(patientB, tenantB.id, 'patient');
  await ensurePortalMembership(guardianA, tenantA.id, 'guardian');
  await ensurePortalMembership(guardianB, tenantB.id, 'guardian');

  currentStep = 'seeding linkage rows';
  await ensurePatientAccount(tenantA, IDS.patientA, patientA);
  await ensurePatientAccount(tenantB, IDS.patientB, patientB);
  await ensureGuardianLink(tenantA, IDS.patientA, guardianA, 'Responsavel A');
  await ensureGuardianLink(tenantB, IDS.patientB, guardianB, 'Responsavel B');

  currentStep = 'signing in linked users';
  const patientAClient = await signIn('linkage.patient-a@example.com');
  const patientBClient = await signIn('linkage.patient-b@example.com');
  const guardianAClient = await signIn('linkage.guardian-a@example.com');

  currentStep = 'checking patient account linkage RLS';
  const patientChecks = [
    [
      'patient A can read own patient account link',
      await checkedCount('patient A own link', patientAClient, 'patient_accounts', {
        patient_id: IDS.patientA,
      }),
      1,
    ],
    [
      'patient A cannot read patient B account link',
      await checkedCount('patient A cross link', patientAClient, 'patient_accounts', {
        patient_id: IDS.patientB,
      }),
      0,
    ],
    [
      'patient B can read own patient account link',
      await checkedCount('patient B own link', patientBClient, 'patient_accounts', {
        patient_id: IDS.patientB,
      }),
      1,
    ],
    [
      'patient A cannot read clinical patient row yet',
      await checkedCount('patient A clinical data still closed', patientAClient, 'patients', {
        id: IDS.patientA,
      }),
      0,
    ],
  ];

  for (const [label, actual, expected] of patientChecks) {
    ok(actual === expected, `${label}: expected ${expected}, received ${actual}`);
  }

  currentStep = 'checking guardian linkage RLS';
  const guardianChecks = [
    [
      'guardian A can read own guardian link',
      await checkedCount('guardian A own link', guardianAClient, 'guardian_links', {
        patient_id: IDS.patientA,
      }),
      1,
    ],
    [
      'guardian A cannot read guardian B link',
      await checkedCount('guardian A cross link', guardianAClient, 'guardian_links', {
        patient_id: IDS.patientB,
      }),
      0,
    ],
    [
      'guardian A cannot read patient account link',
      await checkedCount(
        'guardian A cannot read patient account',
        guardianAClient,
        'patient_accounts',
        {
          patient_id: IDS.patientA,
        }
      ),
      0,
    ],
    [
      'guardian A cannot read clinical patient row yet',
      await checkedCount('guardian A clinical data still closed', guardianAClient, 'patients', {
        id: IDS.patientA,
      }),
      0,
    ],
  ];

  for (const [label, actual, expected] of guardianChecks) {
    ok(actual === expected, `${label}: expected ${expected}, received ${actual}`);
  }

  currentStep = 'checking patient portal RPC scope';
  await checkedPortalSnapshot(
    'patient A can load own portal snapshot',
    patientAClient,
    IDS.patientA,
    true
  );
  await checkedPortalSnapshot(
    'patient A cannot load patient B portal snapshot',
    patientAClient,
    IDS.patientB,
    false
  );
  await checkedPortalSnapshot(
    'guardian A can load dependent portal snapshot',
    guardianAClient,
    IDS.patientA,
    true
  );
  await checkedPortalSnapshot(
    'guardian A cannot load tenant B portal snapshot',
    guardianAClient,
    IDS.patientB,
    false
  );

  console.log('Patient linkage contract checks passed');
}

run().catch((error) => {
  const details =
    error && typeof error === 'object'
      ? [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ')
      : String(error);
  console.error(
    `Patient linkage contract failed during ${currentStep}:`,
    details || 'unknown_error'
  );
  process.exit(1);
});
