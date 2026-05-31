#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { requireServiceRoleKey } from './_shared/env.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const tableContracts = [
  {
    table: 'profiles',
    columns: [
      'id',
      'email',
      'full_name',
      'platform_role',
      'active_tenant_id',
      'is_active',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'tenants',
    columns: ['id', 'slug', 'name', 'status', 'settings', 'created_at', 'updated_at'],
  },
  {
    table: 'tenant_units',
    columns: ['id', 'tenant_id', 'code', 'name', 'metadata', 'created_at', 'updated_at'],
  },
  {
    table: 'tenant_memberships',
    columns: [
      'id',
      'tenant_id',
      'user_id',
      'role',
      'role_code',
      'status',
      'unit_id',
      'invited_by',
      'accepted_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'roles',
    columns: ['id', 'tenant_id', 'name', 'description', 'is_system', 'created_at', 'updated_at'],
  },
  {
    table: 'permissions',
    columns: ['id', 'tenant_id', 'code', 'description', 'created_at', 'updated_at'],
  },
  {
    table: 'role_permissions',
    columns: ['id', 'tenant_id', 'role_id', 'permission_id', 'created_at'],
  },
  {
    table: 'feature_flags',
    columns: ['id', 'tenant_id', 'key', 'enabled', 'config', 'created_at', 'updated_at'],
  },
];

function logSkip() {
  console.log('Auth/RBAC contract check skipped.');
  console.log('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run read-only schema checks.');
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  logSkip();
  process.exit(0);
}

try {
  requireServiceRoleKey();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let hasFailure = false;

for (const contract of tableContracts) {
  const { error } = await supabase.from(contract.table).select(contract.columns.join(',')).limit(1);

  if (error) {
    hasFailure = true;
    console.error(`[FAIL] ${contract.table}: ${error.message}`);
  } else {
    console.log(`[OK] ${contract.table}`);
  }
}

if (hasFailure) {
  console.error('Auth/RBAC contract check failed.');
  process.exit(1);
}

console.log('Auth/RBAC contract check passed.');
