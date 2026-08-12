import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const QA_ALIASES = [
  ['qa_owner_a', 'aurora', 'clinic_admin'],
  ['qa_physician_a', 'aurora', 'physician'],
  ['qa_nutrition_a', 'aurora', 'nutritionist'],
  ['qa_reception_a', 'aurora', 'receptionist'],
  ['qa_finance_a', 'aurora', 'financial_user'],
  ['qa_patient_a', 'aurora', 'patient'],
  ['qa_guardian_a', 'aurora', 'guardian'],
  ['qa_owner_b', 'boreal', 'clinic_admin'],
  ['qa_patient_b', 'boreal', 'patient'],
  ['qa_revoked_a', 'aurora', 'receptionist'],
  ['qa_support_pending', 'platform', 'platform_support'],
  ['qa_support_active', 'platform', 'platform_support'],
];

const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);

function required(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required process environment variable: ${key}`);
  return value;
}

export function assertQaTarget() {
  const url = new URL(required('SUPABASE_URL'));
  if (localHosts.has(url.hostname)) return;
  if (process.env.ALLOW_QA_STAGING === 'true' && process.env.QA_STAGING_ISOLATED === 'true') return;
  throw new Error(
    'Refusing QA mutation outside localhost. Set ALLOW_QA_STAGING=true and QA_STAGING_ISOLATED=true only for approved isolated staging.'
  );
}

export function createAdmin() {
  assertQaTarget();
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSessionClient() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createEphemeralPassword() {
  return `Qa-${randomBytes(24).toString('base64url')}`;
}

function qaEmail(alias) {
  return `${alias}@example.test`;
}

async function ensureUser(admin, alias, password) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((user) => user.email?.toLowerCase() === qaEmail(alias));
  const attributes = {
    email: qaEmail(alias),
    password,
    email_confirm: true,
    user_metadata: { qa_fixture: true, qa_alias: alias },
  };
  const result = existing
    ? await admin.auth.admin.updateUserById(existing.id, attributes)
    : await admin.auth.admin.createUser(attributes);
  if (result.error) throw result.error;
  return result.data.user;
}

async function ensureTenant(admin, key) {
  const { data, error } = await admin
    .from('tenants')
    .upsert(
      { slug: `qa-clinica-${key}`, name: `QA Clínica ${key}`, status: 'active' },
      { onConflict: 'slug' }
    )
    .select('id, slug')
    .single();
  if (error) throw error;
  return data;
}

async function ensureProfile(admin, user, tenantId, alias, platformRole = 'user') {
  const { error } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: alias,
      active_tenant_id: tenantId,
      platform_role: platformRole,
      is_active: true,
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

async function ensureRole(admin, tenantId, roleCode, permissions) {
  const { data: role, error: roleError } = await admin
    .from('roles')
    .upsert(
      { tenant_id: tenantId, name: roleCode, description: `QA fixture ${roleCode}` },
      { onConflict: 'tenant_id,name' }
    )
    .select('id')
    .single();
  if (roleError) throw roleError;
  if (!permissions.length) return;
  const { error: permissionError } = await admin.from('permissions').upsert(
    permissions.map((code) => ({ tenant_id: tenantId, code, description: `QA fixture ${code}` })),
    { onConflict: 'tenant_id,code' }
  );
  if (permissionError) throw permissionError;
  const { data: rows, error: rowsError } = await admin
    .from('permissions')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('code', permissions);
  if (rowsError) throw rowsError;
  const { error: linkError } = await admin.from('role_permissions').upsert(
    (rows ?? []).map((permission) => ({ tenant_id: tenantId, role_id: role.id, permission_id: permission.id })),
    { onConflict: 'tenant_id,role_id,permission_id' }
  );
  if (linkError) throw linkError;
}

async function ensureMembership(admin, userId, tenantId, roleCode, status = 'active') {
  const { error } = await admin.from('tenant_memberships').upsert(
    { tenant_id: tenantId, user_id: userId, role_code: roleCode, role: roleCode, status },
    { onConflict: 'tenant_id,user_id' }
  );
  if (error) throw error;
}

async function ensurePatient(admin, tenantId, alias) {
  const { data: existing, error: existingError } = await admin
    .from('patients')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('preferred_name', alias)
    .maybeSingle();
  if (existingError) throw existingError;
  let patient = existing;
  if (!patient) {
    const { data, error } = await admin
      .from('patients')
      .insert({ tenant_id: tenantId, preferred_name: alias, status: 'active', tags: ['qa_fixture'] })
      .select('id')
      .single();
    if (error) throw error;
    patient = data;
  }
  const { error: piiError } = await admin.from('patient_pii').upsert(
    { tenant_id: tenantId, patient_id: patient.id, full_name: alias, cpf_masked: '***.***.***-**' },
    { onConflict: 'tenant_id,patient_id' }
  );
  if (piiError) throw piiError;
  return patient.id;
}

export async function seedQaFixtures(admin, password = createEphemeralPassword()) {
  const aurora = await ensureTenant(admin, 'aurora');
  const boreal = await ensureTenant(admin, 'boreal');
  const tenantFor = { aurora: aurora.id, boreal: boreal.id, platform: aurora.id };
  const permissions = [
    'patients.read',
    'patients.write',
    'patient_portal.access',
    'agenda.read',
    'agenda.write',
    'encounters.read',
    'encounters.write',
    'soap.read',
    'soap.write',
    'prescriptions.read',
    'prescriptions.write',
    'documents.read',
    'documents.write',
    'finance.read',
    'finance.write',
  ];
  await ensureRole(admin, aurora.id, 'clinic_admin', permissions);
  await ensureRole(admin, boreal.id, 'clinic_admin', permissions);
  await ensureRole(admin, aurora.id, 'patient', ['patient_portal.access']);
  await ensureRole(admin, boreal.id, 'patient', ['patient_portal.access']);
  await ensureRole(admin, aurora.id, 'guardian', ['patient_portal.access']);

  const users = {};
  for (const [alias, tenantKey, roleCode] of QA_ALIASES) {
    const user = await ensureUser(admin, alias, password);
    const isSupport = alias.startsWith('qa_support_');
    await ensureProfile(admin, user, tenantFor[tenantKey], alias, isSupport ? 'platform_support' : 'user');
    if (!isSupport) {
      await ensureMembership(admin, user.id, tenantFor[tenantKey], roleCode, alias === 'qa_revoked_a' ? 'revoked' : 'active');
    }
    users[alias] = user;
  }

  const patientA = await ensurePatient(admin, aurora.id, 'qa_patient_a');
  const patientB = await ensurePatient(admin, boreal.id, 'qa_patient_b');
  await admin
    .from('patient_accounts')
    .upsert(
      { tenant_id: aurora.id, patient_id: patientA, user_id: users.qa_patient_a.id, status: 'active', linked_at: new Date().toISOString() },
      { onConflict: 'tenant_id,patient_id,user_id' }
    )
    .throwOnError();
  await admin
    .from('patient_accounts')
    .upsert(
      { tenant_id: boreal.id, patient_id: patientB, user_id: users.qa_patient_b.id, status: 'active', linked_at: new Date().toISOString() },
      { onConflict: 'tenant_id,patient_id,user_id' }
    )
    .throwOnError();
  await admin
    .from('guardian_links')
    .upsert(
      { tenant_id: aurora.id, patient_id: patientA, guardian_user_id: users.qa_guardian_a.id, relationship: 'QA guardian', status: 'active' },
      { onConflict: 'tenant_id,patient_id,guardian_user_id' }
    )
    .throwOnError();

  return { password, tenants: { aurora: aurora.id, boreal: boreal.id }, patients: { qa_patient_a: patientA, qa_patient_b: patientB }, users };
}

export async function cleanupQaFixtures(admin) {
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email')
    .like('email', 'qa_%@example.test');
  if (error) throw new Error('QA cleanup could not list synthetic profiles.');
  const { data: tenants, error: tenantError } = await admin
    .from('tenants')
    .select('id')
    .like('slug', 'qa-clinica-%');
  if (tenantError) throw new Error('QA cleanup could not list synthetic tenants.');
  for (const tenant of tenants ?? []) {
    const { error: deleteTenantError } = await admin.from('tenants').delete().eq('id', tenant.id);
    if (deleteTenantError) throw new Error(`QA cleanup could not delete a synthetic tenant: ${deleteTenantError.message ?? deleteTenantError.code ?? 'unknown_error'}`);
  }
  for (const profile of profiles ?? []) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(profile.id);
    if (deleteError) throw new Error('QA cleanup could not delete a synthetic auth user.');
  }
  return { tenantsRemoved: tenants?.length ?? 0, usersRemoved: profiles?.length ?? 0 };
}

export async function signInQa(alias, password) {
  const client = createSessionClient();
  const { error } = await client.auth.signInWithPassword({ email: qaEmail(alias), password });
  if (error) throw error;
  return client;
}
