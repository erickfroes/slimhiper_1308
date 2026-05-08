#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_BOOTSTRAP_PASSWORD',
];

const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const usersToSeed = [
  { email: 'platform.admin@example.com', full_name: 'Platform Admin', platform_role: 'platform_admin' },
  { email: 'clinic.admin@example.com', full_name: 'Clinic Admin', role_code: 'clinic_admin' },
  { email: 'physician.demo@example.com', full_name: 'Demo Physician', role_code: 'physician' },
  { email: 'nutritionist.demo@example.com', full_name: 'Demo Nutritionist', role_code: 'nutritionist' },
  { email: 'finance.demo@example.com', full_name: 'Demo Financial User', role_code: 'financial_user' },
  { email: 'patient.demo@example.com', full_name: 'Demo Patient', role_code: 'patient' },
];

const permissionMatrix = {
  clinic_admin: ['patients.read', 'patients.write', 'agenda.read', 'agenda.write', 'financial.read', 'financial.write', 'settings.read', 'settings.write'],
  physician: ['patients.read', 'encounters.read', 'encounters.write', 'soap.read', 'soap.write', 'prescriptions.read', 'prescriptions.write'],
  nutritionist: ['patients.read', 'nutrition.read', 'nutrition.write', 'reports.read'],
  financial_user: ['patients.read', 'financial.read', 'financial.write', 'reports.read'],
  patient: ['chat.read', 'chat.write', 'documents.read', 'packages.read'],
};

async function ensureAuthUser(email, password) {
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { seeded_by: 'bootstrap-core-auth' },
  });
  if (error) throw error;
  return data.user;
}

async function run() {
  const tenantSlug = process.env.SUPABASE_BOOTSTRAP_TENANT_SLUG ?? 'demo-clinic';
  const tenantName = process.env.SUPABASE_BOOTSTRAP_TENANT_NAME ?? 'Demo Clinic';
  const bootstrapPassword = process.env.SUPABASE_BOOTSTRAP_PASSWORD;

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .upsert({ slug: tenantSlug, name: tenantName, status: 'active' }, { onConflict: 'slug' })
    .select('id, slug, name')
    .single();
  if (tenantError) throw tenantError;

  const seededUsers = [];
  for (const user of usersToSeed) {
    const authUser = await ensureAuthUser(user.email, bootstrapPassword);
    seededUsers.push({ ...user, id: authUser.id });
  }

  const profilesPayload = seededUsers.map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    platform_role: u.platform_role ?? 'user',
    is_active: true,
  }));

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(profilesPayload, { onConflict: 'id' });
  if (profileError) throw profileError;

  const membershipsPayload = seededUsers
    .filter((u) => u.role_code)
    .map((u) => ({
      tenant_id: tenant.id,
      user_id: u.id,
      role_code: u.role_code,
      role: ['tenant_owner', 'clinic_admin'].includes(u.role_code) ? 'admin' : 'member',
      status: 'active',
    }));

  const { error: membershipError } = await supabase
    .from('tenant_memberships')
    .upsert(membershipsPayload, { onConflict: 'tenant_id,user_id' });
  if (membershipError) throw membershipError;

  const roleRows = Object.keys(permissionMatrix).map((roleCode) => ({
    tenant_id: tenant.id,
    name: roleCode,
    description: `Seeded role: ${roleCode}`,
    is_system: false,
  }));

  const { error: rolesError } = await supabase.from('roles').upsert(roleRows, { onConflict: 'tenant_id,name' });
  if (rolesError) throw rolesError;

  const permissionCodes = [...new Set(Object.values(permissionMatrix).flat())];
  const permissionRows = permissionCodes.map((code) => ({
    tenant_id: tenant.id,
    code,
    description: `Seeded permission: ${code}`,
  }));

  const { error: permissionsError } = await supabase.from('permissions').upsert(permissionRows, { onConflict: 'tenant_id,code' });
  if (permissionsError) throw permissionsError;

  const { data: roles, error: rolesFetchError } = await supabase.from('roles').select('id, name').eq('tenant_id', tenant.id);
  if (rolesFetchError) throw rolesFetchError;
  const { data: permissions, error: permsFetchError } = await supabase.from('permissions').select('id, code').eq('tenant_id', tenant.id);
  if (permsFetchError) throw permsFetchError;

  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
  const permissionIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

  const rolePermissionRows = [];
  for (const [roleCode, codes] of Object.entries(permissionMatrix)) {
    const roleId = roleIdByName.get(roleCode);
    if (!roleId) continue;
    for (const code of codes) {
      const permissionId = permissionIdByCode.get(code);
      if (!permissionId) continue;
      rolePermissionRows.push({ tenant_id: tenant.id, role_id: roleId, permission_id: permissionId });
    }
  }

  if (rolePermissionRows.length > 0) {
    const { error: rolePermError } = await supabase.from('role_permissions').upsert(rolePermissionRows, { onConflict: 'tenant_id,role_id,permission_id' });
    if (rolePermError) throw rolePermError;
  }

  console.log('Bootstrap completed successfully.');
  console.table(seededUsers.map((u) => ({ email: u.email, role_code: u.role_code ?? 'platform_admin' })));
  console.log(`Tenant: ${tenant.slug} (${tenant.id})`);
}

run().catch((error) => {
  console.error('Bootstrap failed:', error.message);
  process.exit(1);
});
