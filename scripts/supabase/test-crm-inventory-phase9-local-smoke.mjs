#!/usr/bin/env node

/**
 * Local Phase 9.5 CRM/inventory smoke.
 *
 * Seeds only deterministic dummy tenants/users/leads/items, refuses remote
 * targets by default, and exercises CRM conversion, cross-tenant/RBAC denial,
 * inventory ledger/negative-stock blocking, governance retention dry-run,
 * notifications and CRM/inventory report allowlist regressions.
 */

import { createClient } from '@supabase/supabase-js';
import {
  getRequiredServiceRoleKey,
  requireEnv,
  requireSupabasePublishableKey,
} from './_shared/env.mjs';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_BOOTSTRAP_PASSWORD'];

const IDS = {
  tenantA: '19500000-0000-4000-8000-0000000000a1',
  tenantB: '19500000-0000-4000-8000-0000000000b1',
  unitA: '19500000-0000-4000-8000-0000000000a2',
  unitB: '19500000-0000-4000-8000-0000000000b2',
  categoryA: '19500000-0000-4000-8000-0000000000a3',
  locationA: '19500000-0000-4000-8000-0000000000a4',
  locationB: '19500000-0000-4000-8000-0000000000b4',
};

const EMAILS = {
  ownerA: 'phase9.crm.inventory.owner.a@example.test',
  noCrmWriteA: 'phase9.crm.inventory.no-crm-write.a@example.test',
  noInventoryAdjustA: 'phase9.crm.inventory.no-inventory-adjust.a@example.test',
  ownerB: 'phase9.crm.inventory.owner.b@example.test',
};

const LEADS = {
  convertEmail: 'lead.convert.phase9@example.test',
  duplicateEmail: 'lead.duplicate.phase9@example.test',
  expiredEmail: 'lead.expired.phase9@example.test',
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
  if (process.env.ALLOW_REMOTE_CRM_INVENTORY_SMOKE === 'true') return;

  const parsed = new URL(url);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      'Refusing to run mutating CRM/inventory smoke outside localhost. Set ALLOW_REMOTE_CRM_INVENTORY_SMOKE=true only for an approved sandbox.'
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

function daysFromNow(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function ensureUser(email, fullName, tenantId, roleCode, unitId = null) {
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
        user_metadata: { seeded_by: 'test-crm-inventory-phase9-local-smoke' },
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
        active_tenant_id: tenantId,
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
        unit_id: unitId,
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

async function rpc(client, fn, args = {}) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${shortError(error)}`);
  return data;
}

async function expectRpcError(client, fn, args, expectedFragment) {
  const { error } = await client.rpc(fn, args);
  ok(error, `Expected ${fn} to fail.`);
  const details = shortError(error);
  ok(
    details.includes(expectedFragment),
    `Expected ${fn} error to include ${expectedFragment}, got: ${details}`
  );
}

async function seedTenant(tenantId, unitId, slug) {
  await admin
    .from('tenants')
    .upsert(
      { id: tenantId, name: `Phase 9 Smoke ${slug}`, slug, status: 'active' },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('tenant_units')
    .upsert(
      { id: unitId, tenant_id: tenantId, code: 'MAIN', name: `Unidade ${slug}`, status: 'active' },
      { onConflict: 'tenant_id,code' }
    )
    .throwOnError();

  await admin.rpc('seed_crm_inventory_rbac_contracts').throwOnError();
}

async function removePermissionFromRole(tenantId, roleName, permissionCode) {
  const { data: role, error: roleError } = await admin
    .from('roles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', roleName)
    .single();
  if (roleError) throw roleError;

  const { data: permission, error: permissionError } = await admin
    .from('permissions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('code', permissionCode)
    .single();
  if (permissionError) throw permissionError;

  await admin
    .from('role_permissions')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('role_id', role.id)
    .eq('permission_id', permission.id)
    .throwOnError();
}

async function cleanupSyntheticRows() {
  const leadEmails = Object.values(LEADS);
  const { data: piiRows, error: piiError } = await admin
    .from('patient_pii')
    .select('patient_id')
    .in('email', leadEmails);
  if (piiError) throw piiError;

  const patientIds = (piiRows ?? []).map((row) => row.patient_id).filter(Boolean);
  if (patientIds.length > 0) {
    await admin.from('patients').delete().in('id', patientIds).throwOnError();
  }

  await admin.from('crm_leads').delete().in('email', leadEmails).throwOnError();
  await admin
    .from('inventory_items')
    .delete()
    .eq('tenant_id', IDS.tenantA)
    .eq('sku', 'PHASE9-LUVA')
    .throwOnError();
  await admin.from('inventory_locations').delete().eq('id', IDS.locationA).throwOnError();
  await admin.from('inventory_locations').delete().eq('id', IDS.locationB).throwOnError();
  await admin.from('inventory_categories').delete().eq('id', IDS.categoryA).throwOnError();
}

async function seedInventoryReferenceData() {
  await admin
    .from('inventory_categories')
    .upsert(
      {
        id: IDS.categoryA,
        tenant_id: IDS.tenantA,
        name: 'Phase 9 insumos dummy',
        status: 'active',
      },
      { onConflict: 'tenant_id,name' }
    )
    .throwOnError();

  await admin
    .from('inventory_locations')
    .upsert(
      {
        id: IDS.locationA,
        tenant_id: IDS.tenantA,
        unit_id: IDS.unitA,
        code: 'P9-A',
        name: 'Phase 9 estoque A',
        status: 'active',
      },
      { onConflict: 'tenant_id,code' }
    )
    .throwOnError();

  await admin
    .from('inventory_locations')
    .upsert(
      {
        id: IDS.locationB,
        tenant_id: IDS.tenantB,
        unit_id: IDS.unitB,
        code: 'P9-B',
        name: 'Phase 9 estoque B',
        status: 'active',
      },
      { onConflict: 'tenant_id,code' }
    )
    .throwOnError();
}

async function seedData() {
  await seedTenant(IDS.tenantA, IDS.unitA, 'crm-inventory-a');
  await seedTenant(IDS.tenantB, IDS.unitB, 'crm-inventory-b');
  await cleanupSyntheticRows();
  await seedInventoryReferenceData();

  await ensureUser(EMAILS.ownerA, 'Phase 9 Owner A', IDS.tenantA, 'tenant_owner', IDS.unitA);
  await ensureUser(
    EMAILS.noCrmWriteA,
    'Phase 9 No CRM Write A',
    IDS.tenantA,
    'physician',
    IDS.unitA
  );
  await ensureUser(
    EMAILS.noInventoryAdjustA,
    'Phase 9 No Inventory Adjust A',
    IDS.tenantA,
    'clinic_admin',
    IDS.unitA
  );
  await ensureUser(EMAILS.ownerB, 'Phase 9 Owner B', IDS.tenantB, 'tenant_owner', IDS.unitB);

  await removePermissionFromRole(IDS.tenantA, 'clinic_admin', 'inventory.adjust');
  await removePermissionFromRole(IDS.tenantA, 'clinic_admin', 'inventory.transfer');
}

async function run() {
  currentStep = 'seeding deterministic dummy data';
  await seedData();

  currentStep = 'signing in smoke users';
  const ownerA = await signIn(EMAILS.ownerA);
  const noCrmWriteA = await signIn(EMAILS.noCrmWriteA);
  const noInventoryAdjustA = await signIn(EMAILS.noInventoryAdjustA);
  const ownerB = await signIn(EMAILS.ownerB);

  currentStep = 'validating CRM permissions, deduplication and conversion';
  await expectRpcError(
    noCrmWriteA,
    'create_crm_lead',
    {
      p_payload: {
        fullName: 'Lead Sem Escrita Dummy',
        email: 'lead.no-write.phase9@example.test',
        contactConsent: true,
        consentPurpose: 'Smoke local Phase 9',
        unitId: IDS.unitA,
      },
    },
    'forbidden'
  );

  const lead = await rpc(ownerA, 'create_crm_lead', {
    p_payload: {
      fullName: 'Lead Conversao Dummy',
      email: LEADS.convertEmail,
      phone: '+5511999000001',
      source: 'smoke-local',
      campaign: 'phase-9',
      contactPreference: 'email',
      contactConsent: true,
      consentPurpose: 'Smoke local sem dado real',
      retentionExpiresAt: daysFromNow(90),
      nextFollowUpAt: daysFromNow(-1),
      unitId: IDS.unitA,
    },
  });
  ok(lead?.id, 'Expected CRM lead id.');

  await expectRpcError(
    ownerA,
    'create_crm_lead',
    {
      p_payload: {
        fullName: 'Lead Duplicado Dummy',
        email: LEADS.convertEmail,
        contactConsent: true,
        consentPurpose: 'Smoke local sem dado real',
        unitId: IDS.unitA,
      },
    },
    'duplicate'
  );

  await expectRpcError(ownerB, 'get_crm_lead_detail', { p_lead_id: lead.id }, 'not_found');

  const task = await rpc(ownerA, 'create_crm_lead_task', {
    p_lead_id: lead.id,
    p_payload: { title: 'Retornar lead dummy', dueAt: daysFromNow(-1), assignedTo: '' },
  });
  ok(task?.id, 'Expected CRM task id.');

  const conversion = await rpc(ownerA, 'convert_crm_lead_to_patient', {
    p_lead_id: lead.id,
    p_payload: {
      createAppointment: true,
      scheduledAt: daysFromNow(1),
      appointmentType: 'avaliacao_inicial',
    },
  });
  ok(
    conversion?.status === 'converted' && conversion?.patientId,
    'Expected converted lead with patient id.'
  );

  const conversionAgain = await rpc(ownerA, 'convert_crm_lead_to_patient', {
    p_lead_id: lead.id,
    p_payload: {},
  });
  ok(conversionAgain?.idempotent === true, 'Expected idempotent conversion on second call.');

  const crmNotifications = await rpc(ownerA, 'emit_crm_operational_notifications');
  ok(
    Number(crmNotifications?.overdueTasks ?? 0) >= 0,
    'Expected CRM notification contract result.'
  );

  currentStep = 'validating inventory ledger and RBAC';
  const item = await rpc(ownerA, 'upsert_inventory_item', {
    p_payload: {
      sku: 'PHASE9-LUVA',
      name: 'Luva dummy Phase 9',
      categoryId: IDS.categoryA,
      unitId: IDS.unitA,
      unit: 'caixa',
      status: 'active',
      minimumQuantity: 10,
      defaultUnitCostCents: 4500,
      metadata: { seededBy: 'test-crm-inventory-phase9-local-smoke' },
    },
  });
  ok(item?.id, 'Expected inventory item id.');

  const lot = await rpc(ownerA, 'create_inventory_lot', {
    p_payload: {
      itemId: item.id,
      locationId: IDS.locationA,
      lotCode: 'P9-LOT-DUMMY',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      unitCostCents: 4500,
      metadata: { seededBy: 'test-crm-inventory-phase9-local-smoke' },
    },
  });
  ok(lot?.id, 'Expected inventory lot id.');

  const receipt = await rpc(ownerA, 'create_inventory_movement', {
    p_payload: {
      itemId: item.id,
      lotId: lot.id,
      locationId: IDS.locationA,
      direction: 'in',
      reason: 'receipt',
      quantity: 12,
      unitCostCents: 4500,
      reasonNote: 'Recebimento dummy Phase 9',
    },
  });
  ok(Number(receipt?.quantityOnHand) === 12, 'Expected receipt to set quantity 12.');

  await expectRpcError(
    noInventoryAdjustA,
    'create_inventory_movement',
    {
      p_payload: {
        itemId: item.id,
        lotId: lot.id,
        locationId: IDS.locationA,
        direction: 'out',
        reason: 'adjustment',
        quantity: 1,
        reasonNote: 'Tentativa sem permissao dummy',
      },
    },
    'forbidden'
  );

  await expectRpcError(
    ownerA,
    'create_inventory_movement',
    {
      p_payload: {
        itemId: item.id,
        lotId: lot.id,
        locationId: IDS.locationA,
        direction: 'out',
        reason: 'consumption',
        quantity: 999,
        reasonNote: 'Bloqueio saldo negativo dummy',
      },
    },
    'negative_stock_blocked'
  );

  const consumption = await rpc(ownerA, 'create_inventory_movement', {
    p_payload: {
      itemId: item.id,
      lotId: lot.id,
      locationId: IDS.locationA,
      direction: 'out',
      reason: 'consumption',
      quantity: 3,
      reasonNote: 'Consumo dummy Phase 9',
    },
  });
  ok(Number(consumption?.quantityOnHand) === 9, 'Expected consumption to leave quantity 9.');

  const tenantBSnapshot = await rpc(ownerB, 'list_inventory_operations_snapshot', {
    p_include_cost: true,
    p_days_to_expiry: 30,
  });
  ok(
    !(tenantBSnapshot?.items ?? []).some((snapshotItem) => snapshotItem.id === item.id),
    'Expected tenant B inventory snapshot not to expose tenant A item.'
  );

  const inventoryNotifications = await rpc(ownerA, 'emit_inventory_operational_notifications', {
    p_days_to_expiry: 30,
  });
  ok(Number(inventoryNotifications?.alerts ?? 0) >= 1, 'Expected inventory alert contract result.');

  currentStep = 'validating report, dashboard, notification and governance regressions';
  const definitions = await rpc(ownerA, 'list_clinic_report_definitions');
  const reportKeys = (definitions?.definitions ?? []).map((definition) => definition.key);
  ok(reportKeys.includes('crm-leads-origem'), 'Expected CRM report definition.');
  ok(reportKeys.includes('inventory-saldo-unidade'), 'Expected inventory report definition.');

  const crmReport = await rpc(ownerA, 'create_clinic_report_run', {
    p_report_key: 'crm-leads-origem',
    p_filters: { from: daysFromNow(-7), to: daysFromNow(1) },
    p_export_format: 'csv',
    p_patient_id: null,
  });
  ok(crmReport?.id && Array.isArray(crmReport?.rows), 'Expected CRM report run rows.');

  const inventoryReport = await rpc(ownerA, 'create_clinic_report_run', {
    p_report_key: 'inventory-lotes-vencer',
    p_filters: { daysToExpiry: 30, from: daysFromNow(-7), to: daysFromNow(1) },
    p_export_format: 'csv',
    p_patient_id: null,
  });
  ok(
    inventoryReport?.id && Array.isArray(inventoryReport?.rows),
    'Expected inventory report run rows.'
  );

  const dashboard = await rpc(ownerA, 'get_crm_inventory_dashboard_insights', {
    p_days_to_expiry: 30,
  });
  ok(
    dashboard?.crm?.canRead === true && dashboard?.inventory?.canRead === true,
    'Expected dashboard insights access.'
  );

  const expiredLead = await rpc(ownerA, 'create_crm_lead', {
    p_payload: {
      fullName: 'Lead Retencao Dummy',
      email: LEADS.expiredEmail,
      source: 'smoke-local',
      campaign: 'phase-9-retention',
      contactPreference: 'email',
      contactConsent: false,
      consentPurpose: 'Smoke local sem dado real',
      retentionExpiresAt: daysFromNow(-1),
      unitId: IDS.unitA,
    },
  });
  ok(expiredLead?.id, 'Expected expired lead id for governance dry-run.');

  const governance = await rpc(ownerA, 'get_crm_inventory_governance_snapshot', {
    p_days_to_expiry: 30,
  });
  ok(
    Number(governance?.crm?.retentionDueLeads ?? 0) >= 1,
    'Expected retention-due lead in governance snapshot.'
  );
  ok(
    Number(governance?.inventory?.negativeSnapshots ?? 0) === 0,
    'Expected no negative inventory snapshots.'
  );

  const retentionDryRun = await rpc(admin, 'expire_crm_leads_for_retention', {
    p_execute: false,
    p_limit: 25,
  });
  ok(retentionDryRun?.execute === false, 'Expected retention helper to run in dry-run mode.');
  ok(Number(retentionDryRun?.candidateLeads ?? 0) >= 1, 'Expected dry-run candidate lead.');

  const { count: auditCount, error: auditError } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', IDS.tenantA)
    .in('action', ['crm_lead.created', 'crm_lead.converted', 'inventory_movement.created']);
  if (auditError) throw auditError;
  ok((auditCount ?? 0) >= 3, 'Expected CRM/inventory audit logs.');

  const { count: notificationCount, error: notificationError } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', IDS.tenantA)
    .in('category', ['crm', 'inventory']);
  if (notificationError) throw notificationError;
  ok((notificationCount ?? 0) >= 1, 'Expected CRM/inventory notifications.');

  console.log('CRM/inventory Phase 9 local smoke passed.');
}

run().catch((error) => {
  console.error(`CRM/inventory Phase 9 local smoke failed during step: ${currentStep}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
