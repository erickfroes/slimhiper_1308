#!/usr/bin/env node

/**
 * Local Phase 7 platform admin/support smoke.
 *
 * Signs in a platform admin, exercises sanitized admin RPCs, creates audited
 * support and break-glass requests, approves break-glass with a second admin,
 * and cleans up the mutable smoke rows. Refuses remote targets by default.
 */

import { createClient } from '@supabase/supabase-js';
import { getRequiredServiceRoleKey, requireEnv } from './_shared/env.mjs';

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_BOOTSTRAP_PASSWORD',
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
  if (process.env.ALLOW_REMOTE_PLATFORM_ADMIN_SMOKE === 'true') return;

  const parsed = new URL(url);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      'Refusing to run mutating platform admin smoke outside localhost. Set ALLOW_REMOTE_PLATFORM_ADMIN_SMOKE=true only for an approved sandbox.'
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

async function ensureAuthUser(email, fullName, platformRole) {
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
        user_metadata: { seeded_by: 'test-platform-admin-phase7-local-smoke' },
      });

  if (result.error) throw result.error;
  const user = result.data.user;

  if (!user) throw new Error(`Could not ensure auth user ${email}.`);

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      platform_role: platformRole,
      active_tenant_id: null,
      is_active: true,
    },
    { onConflict: 'id' }
  );
  if (profileError) throw profileError;

  return user;
}

async function signIn(email) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
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

async function cleanup(ids) {
  if (ids.supportSessionId) {
    await admin.from('support_sessions').delete().eq('id', ids.supportSessionId);
    await admin
      .from('audit_logs')
      .delete()
      .eq('entity_type', 'support_session')
      .eq('entity_id', ids.supportSessionId);
  }

  if (ids.breakGlassId) {
    await admin.from('break_glass_requests').delete().eq('id', ids.breakGlassId);
    await admin
      .from('audit_logs')
      .delete()
      .eq('entity_type', 'break_glass_request')
      .eq('entity_id', ids.breakGlassId);
  }
}

async function run() {
  const createdIds = {};

  try {
    currentStep = 'ensuring platform users';
    await ensureAuthUser('platform.admin@example.com', 'Platform Admin', 'platform_admin');
    await ensureAuthUser('platform.approver@example.com', 'Platform Approver', 'platform_admin');

    currentStep = 'signing in platform admin';
    const platformAdmin = await signIn('platform.admin@example.com');

    currentStep = 'listing tenants';
    const { data: tenants, error: tenantsError } = await platformAdmin.rpc('list_platform_tenants');
    if (tenantsError) throw tenantsError;
    ok(Array.isArray(tenants), 'list_platform_tenants should return an array.');
    ok(tenants.length > 0, 'Expected at least one tenant.');
    const tenant = tenants[0];
    ok(tenant.id, 'Tenant row should include id.');
    ok(!JSON.stringify(tenant).includes('service_role'), 'Tenant row must not expose secrets.');

    currentStep = 'fetching tenant detail';
    const { data: detail, error: detailError } = await platformAdmin.rpc(
      'get_platform_tenant_detail',
      { p_tenant_id: tenant.id }
    );
    if (detailError) throw detailError;
    ok(Array.isArray(detail.users), 'Tenant detail should include users array.');
    ok(Array.isArray(detail.auditLogs), 'Tenant detail should include audit logs array.');

    currentStep = 'creating support session';
    const supportReason = `Phase 7 local smoke support reason ${Date.now()}`;
    const { data: support, error: supportError } = await platformAdmin.rpc(
      'request_platform_support_session',
      {
        p_tenant_id: tenant.id,
        p_subject: 'Phase 7 local smoke support',
        p_reason: supportReason,
        p_priority: 'medio',
      }
    );
    if (supportError) throw supportError;
    createdIds.supportSessionId = support.id;
    ok(support.status === 'requested', 'Support session should be requested.');

    currentStep = 'creating break-glass request';
    const { data: breakGlass, error: breakGlassError } = await platformAdmin.rpc(
      'request_platform_break_glass',
      {
        p_tenant_id: tenant.id,
        p_reason: `Phase 7 local smoke break-glass reason ${Date.now()}`,
        p_scope: 'Leitura de configuracoes e logs operacionais',
        p_duration_minutes: 60,
      }
    );
    if (breakGlassError) throw breakGlassError;
    createdIds.breakGlassId = breakGlass.id;
    ok(breakGlass.status === 'pending', 'Break-glass request should start pending.');

    currentStep = 'checking self-approval is blocked';
    const { error: selfApprovalError } = await platformAdmin.rpc('decide_platform_break_glass', {
      p_request_id: breakGlass.id,
      p_decision: 'approved',
    });
    ok(selfApprovalError, 'Self-approval should be rejected.');

    currentStep = 'approving break-glass with second admin';
    const approver = await signIn('platform.approver@example.com');
    const { data: decision, error: decisionError } = await approver.rpc(
      'decide_platform_break_glass',
      {
        p_request_id: breakGlass.id,
        p_decision: 'approved',
      }
    );
    if (decisionError) throw decisionError;
    ok(decision.status === 'approved', 'Break-glass request should be approved.');

    currentStep = 'ending support session';
    const { data: endedSupport, error: endSupportError } = await platformAdmin.rpc(
      'end_platform_support_session',
      {
        p_session_id: support.id,
      }
    );
    if (endSupportError) throw endSupportError;
    ok(endedSupport.status === 'ended', 'Support session should be ended.');

    currentStep = 'revoking approved break-glass';
    const { data: revokedBreakGlass, error: revokeError } = await approver.rpc(
      'revoke_platform_break_glass',
      {
        p_request_id: breakGlass.id,
        p_reason: 'Phase 7 local smoke revocation reason',
      }
    );
    if (revokeError) throw revokeError;
    ok(revokedBreakGlass.status === 'expired', 'Break-glass request should be revoked/expired.');

    currentStep = 'verifying audit rows';
    const { count: auditCount, error: auditError } = await admin
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .in('entity_id', [createdIds.supportSessionId, createdIds.breakGlassId]);
    if (auditError) throw auditError;
    ok((auditCount ?? 0) >= 5, 'Expected audit rows for support and break-glass lifecycle.');

    console.log('Phase 7 platform admin local smoke passed.');
  } finally {
    await cleanup(createdIds);
  }
}

run().catch((error) => {
  console.error(`Phase 7 platform admin smoke failed during ${currentStep}:`, shortError(error));
  process.exit(1);
});
