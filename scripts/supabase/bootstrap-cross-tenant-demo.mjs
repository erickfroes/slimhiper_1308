#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { getRequiredServiceRoleKey, requireEnv } from './_shared/env.mjs';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

const tenantSlug = process.env.SUPABASE_BOOTSTRAP_TENANT_B_SLUG ?? 'demo-clinic-b';
const tenantName = process.env.SUPABASE_BOOTSTRAP_TENANT_B_NAME ?? 'Demo Clinic B';
const patientId =
  process.env.SUPABASE_BOOTSTRAP_PATIENT_B_ID ?? '9b5c6d6a-1f7e-4dbb-8eab-3d55a8a1f042';

let supabase;
try {
  requireEnv(requiredEnv);
  supabase = createClient(process.env.SUPABASE_URL, getRequiredServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function run() {
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .upsert({ slug: tenantSlug, name: tenantName, status: 'active' }, { onConflict: 'slug' })
    .select('id, slug')
    .single();

  if (tenantError) throw tenantError;

  const { error: patientError } = await supabase.from('patients').upsert(
    {
      id: patientId,
      tenant_id: tenant.id,
      preferred_name: 'Paciente Tenant B',
      status: 'active',
      tags: ['cross-tenant-smoke'],
    },
    { onConflict: 'id' }
  );

  if (patientError) throw patientError;

  const { error: piiError } = await supabase.from('patient_pii').upsert(
    {
      tenant_id: tenant.id,
      patient_id: patientId,
      full_name: 'Paciente Tenant B',
      cpf_masked: '***.***.***-**',
      phone: '',
      email: '',
      birth_date: '1990-01-01',
    },
    { onConflict: 'tenant_id,patient_id' }
  );

  if (piiError) throw piiError;

  console.log(`Cross-tenant demo seed complete for ${tenant.slug}.`);
  console.log(`PATIENT_ID_TENANT_B=${patientId}`);
}

run().catch((error) => {
  console.error('Failed to bootstrap cross-tenant demo.', error.message);
  process.exit(1);
});
