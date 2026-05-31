#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { getRequiredServiceRoleKey, requireEnv } from './_shared/env.mjs';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

const tenantSlug = process.env.SUPABASE_BOOTSTRAP_TENANT_SLUG ?? 'demo-clinic';
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
    .select('id, slug')
    .eq('slug', tenantSlug)
    .maybeSingle();

  if (tenantError) throw tenantError;
  if (!tenant) {
    throw new Error(`Tenant with slug "${tenantSlug}" was not found. Run bootstrap-core-auth first.`);
  }

  const { data: plan, error: planError } = await supabase
    .from('platform_plans')
    .upsert(
      {
        code: 'starter',
        name: 'Starter',
        billing_cycle: 'monthly',
        amount_cents: 19900,
        currency: 'BRL',
        metadata: {
          features: {
            patients_limit: 300,
            users_limit: 8,
            storage_gb: 20,
          },
          seeded_by: 'bootstrap-billing-demo',
        },
      },
      { onConflict: 'code' }
    )
    .select('id')
    .single();

  if (planError) throw planError;

  const { error: subscriptionError } = await supabase.from('tenant_subscriptions').upsert(
    {
      tenant_id: tenant.id,
      platform_plan_id: plan.id,
      status: 'active',
      starts_at: new Date().toISOString(),
      metadata: { seeded_by: 'bootstrap-billing-demo' },
    },
    { onConflict: 'tenant_id' }
  );

  if (subscriptionError) throw subscriptionError;

  console.log(`Billing demo bootstrap complete for tenant ${tenant.slug}.`);
}

run().catch((error) => {
  console.error('Failed to bootstrap billing demo.', error.message);
  process.exit(1);
});
