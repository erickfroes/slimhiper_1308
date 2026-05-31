#!/usr/bin/env node

/**
 * Local documents/D4Sign Phase 4 smoke.
 *
 * Seeds deterministic local data, signs in real local users, checks document
 * generation, patient/guardian released-document read scope, signed URL access,
 * and D4Sign webhook idempotency/audit without printing secrets.
 */

import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { getRequiredServiceRoleKey, requireEnv } from './_shared/env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_BOOTSTRAP_PASSWORD',
  'D4SIGN_WEBHOOK_HMAC_SECRET',
];

const IDS = {
  patientA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  patientB: '9b5c6d6a-1f7e-4dbb-8eab-3d55a8a1f042',
  crossDocument: '82000000-0000-4000-8000-0000000000b1',
  signatureRequest: '82000000-0000-4000-8000-0000000000c1',
  signatureSigner: '82000000-0000-4000-8000-0000000000c2',
};

const clinicAdminPermissions = [
  'patients.read',
  'patients.write',
  'documents.read',
  'documents.write',
  'timeline.sensitive.read',
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
  if (process.env.ALLOW_REMOTE_DOCUMENTS_PHASE4_SMOKE === 'true') return;

  const parsed = new URL(url);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      'Refusing to run mutating Documents Phase 4 smoke outside localhost. Set ALLOW_REMOTE_DOCUMENTS_PHASE4_SMOKE=true only for an approved sandbox.'
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

function runNodeScript(scriptPath) {
  execFileSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

async function ensureTenant(slug) {
  const { data, error } = await admin.from('tenants').select('id, slug').eq('slug', slug).single();
  if (error) throw error;
  return data;
}

async function ensureAuthUser(email, fullName) {
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
      user_metadata: { seeded_by: 'test-documents-phase4-local-smoke' },
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: process.env.SUPABASE_BOOTSTRAP_PASSWORD,
    email_confirm: true,
    user_metadata: { seeded_by: 'test-documents-phase4-local-smoke' },
  });
  if (error) throw error;
  await ensureProfile(data.user, fullName, null);
  return data.user;
}

async function ensureProfile(user, fullName, activeTenantId) {
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

async function ensureMembership(user, tenantId, roleCode) {
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

async function ensureRolePermissions(tenantId, roleName, permissions) {
  const { data: role, error: roleError } = await admin
    .from('roles')
    .upsert(
      { tenant_id: tenantId, name: roleName, description: `Documents Phase 4 ${roleName}` },
      { onConflict: 'tenant_id,name' }
    )
    .select('id')
    .single();
  if (roleError) throw roleError;

  const { error: permissionError } = await admin.from('permissions').upsert(
    permissions.map((code) => ({
      tenant_id: tenantId,
      code,
      description: `Documents Phase 4 permission ${code}`,
    })),
    { onConflict: 'tenant_id,code' }
  );
  if (permissionError) throw permissionError;

  const { data: permissionRows, error: fetchError } = await admin
    .from('permissions')
    .select('id, code')
    .eq('tenant_id', tenantId)
    .in('code', permissions);
  if (fetchError) throw fetchError;

  const { error: rolePermissionError } = await admin.from('role_permissions').upsert(
    (permissionRows ?? []).map((permission) => ({
      tenant_id: tenantId,
      role_id: role.id,
      permission_id: permission.id,
    })),
    { onConflict: 'tenant_id,role_id,permission_id' }
  );
  if (rolePermissionError) throw rolePermissionError;
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
  const token = data.session?.access_token;
  ok(token, `Missing access token for ${email}`);
  return { client, token };
}

async function callFunction(name, token, body) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    // Ignore non-JSON function responses.
  }

  return { status: response.status, json };
}

async function getActiveTemplateId(tenantId) {
  const { data, error } = await admin
    .from('document_templates')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('name', { ascending: true })
    .limit(1)
    .single();
  if (error) throw error;
  return data.id;
}

async function expectDocumentVisibility(client, label, documentId, expectedCount) {
  const { data, error } = await client
    .from('generated_documents')
    .select('id')
    .eq('id', documentId);
  if (error) throw error;
  ok(
    (data ?? []).length === expectedCount,
    `${label}: expected ${expectedCount}, got ${data?.length ?? 0}`
  );
}

async function seedPatientPortalLinks(tenantId, patientId, patientUser, guardianUser) {
  const linkedAt = new Date().toISOString();
  await admin
    .from('patient_accounts')
    .upsert(
      {
        tenant_id: tenantId,
        patient_id: patientId,
        user_id: patientUser.id,
        status: 'active',
        linked_at: linkedAt,
      },
      { onConflict: 'tenant_id,patient_id,user_id' }
    )
    .throwOnError();

  await admin
    .from('guardian_links')
    .upsert(
      {
        tenant_id: tenantId,
        patient_id: patientId,
        guardian_user_id: guardianUser.id,
        relationship: 'guardian',
        status: 'active',
      },
      { onConflict: 'tenant_id,patient_id,guardian_user_id' }
    )
    .throwOnError();
}

async function seedCrossTenantDocument(tenantB) {
  const storagePath = `${tenantB.id}/${IDS.patientB}/${IDS.crossDocument}/document.pdf`;
  const blob = new Blob(
    [new TextEncoder().encode('%PDF-1.4\n% local cross-tenant smoke\n%%EOF\n')],
    {
      type: 'application/pdf',
    }
  );

  await admin.storage
    .from('patient-documents')
    .upload(storagePath, blob, {
      upsert: true,
      contentType: 'application/pdf',
    })
    .then(({ error }) => {
      if (error) throw error;
    });

  await admin
    .from('generated_documents')
    .upsert(
      {
        id: IDS.crossDocument,
        tenant_id: tenantB.id,
        patient_id: IDS.patientB,
        name: 'Documento cross-tenant Phase 4',
        category: 'contract',
        status: 'generated',
        storage_bucket: 'patient-documents',
        storage_path: storagePath,
        released_to_patient: true,
      },
      { onConflict: 'id' }
    )
    .throwOnError();
}

async function invokeD4SignWebhook(signatureRequestId, documentId, tenantId) {
  const idempotencyKey = 'phase4-local-d4sign-signed';
  const providerEventId = 'phase4-local-d4sign-event';
  const providerDocumentId = 'phase4-local-d4sign-provider-document';

  await admin.from('d4sign_events').delete().eq('idempotency_key', idempotencyKey).throwOnError();
  await admin
    .from('d4sign_events')
    .delete()
    .eq('provider_event_id', providerEventId)
    .throwOnError();

  await admin
    .from('signature_requests')
    .upsert(
      {
        id: signatureRequestId,
        tenant_id: tenantId,
        patient_id: IDS.patientA,
        generated_document_id: documentId,
        provider: 'd4sign',
        provider_document_id: providerDocumentId,
        status: 'sent',
        sent_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await admin
    .from('signature_signers')
    .upsert(
      {
        id: IDS.signatureSigner,
        tenant_id: tenantId,
        signature_request_id: signatureRequestId,
        name: 'Juliana Pereira',
        email: 'juliana.pereira.demo@example.com',
        role: 'patient',
        status: 'pending',
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  const payload = {
    event: 'document.signed',
    event_id: providerEventId,
    provider_document_id: providerDocumentId,
    status: 'signed',
    signers: [{ email: 'juliana.pereira.demo@example.com', status: 'signed' }],
  };
  const rawBody = JSON.stringify(payload);
  const signature = createHmac('sha256', process.env.D4SIGN_WEBHOOK_HMAC_SECRET)
    .update(rawBody)
    .digest('hex');
  const headers = {
    'Content-Type': 'application/json',
    'x-d4sign-signature': `sha256=${signature}`,
    'idempotency-key': idempotencyKey,
  };
  if (process.env.D4SIGN_WEBHOOK_TOKEN) {
    headers['x-d4sign-token'] = process.env.D4SIGN_WEBHOOK_TOKEN;
  }

  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  async function postWebhook() {
    const response = await fetch(`${base}/functions/v1/webhook-d4sign`, {
      method: 'POST',
      headers,
      body: rawBody,
    });
    return { status: response.status, json: await response.json() };
  }

  const first = await postWebhook();
  ok(
    first.status === 200 && first.json?.processed === true,
    `webhook-d4sign: first call must process, got ${first.status} ${
      first.json?.error?.message ?? first.json?.error?.code ?? 'unexpected_response'
    }`
  );

  const second = await postWebhook();
  ok(
    second.status === 200 && second.json?.duplicate === true,
    `webhook-d4sign: duplicate must be idempotent, got ${second.status} ${
      second.json?.error?.message ?? second.json?.error?.code ?? 'unexpected_response'
    }`
  );

  const { data: signatureRequest, error: signatureError } = await admin
    .from('signature_requests')
    .select('status, signed_at')
    .eq('id', signatureRequestId)
    .single();
  if (signatureError) throw signatureError;
  ok(signatureRequest.status === 'signed', 'webhook-d4sign: signature request must be signed');
  ok(signatureRequest.signed_at, 'webhook-d4sign: signed_at must be set');

  const { data: generatedDocument, error: documentError } = await admin
    .from('generated_documents')
    .select('status')
    .eq('id', documentId)
    .single();
  if (documentError) throw documentError;
  ok(generatedDocument.status === 'signed', 'webhook-d4sign: generated document must be signed');

  const { count, error: timelineError } = await admin
    .from('patient_timeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', IDS.patientA)
    .eq('event_type', 'documento_assinado');
  if (timelineError) throw timelineError;
  ok((count ?? 0) >= 1, 'webhook-d4sign: timeline event must be written');
}

async function runOptionalSandboxSend(staffToken, patientId, templateId) {
  if (process.env.RUN_D4SIGN_SANDBOX_SEND !== 'true') return false;

  const required = ['D4SIGN_TOKEN_API', 'D4SIGN_CRYPT_KEY', 'D4SIGN_BASE_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`D4Sign sandbox send requested but missing env vars: ${missing.join(', ')}`);
  }
  if (!process.env.D4SIGN_SAFE_UUID && process.env.D4SIGN_AUTO_DISCOVER_SAFE !== 'true') {
    throw new Error(
      'D4Sign sandbox send requested but D4SIGN_SAFE_UUID is missing. Set D4SIGN_AUTO_DISCOVER_SAFE=true only for approved sandbox auto-discovery.'
    );
  }

  const gen = await callFunction('generate-document', staffToken, {
    patient_id: patientId,
    template_id: templateId,
    variables: { program_name: 'Smoke sandbox D4Sign Phase 4' },
  });
  ok(
    gen.status === 200 && gen.json?.data?.generatedDocument?.id,
    'sandbox generate-document failed'
  );

  const send = await callFunction('d4sign-send-document', staffToken, {
    patient_id: patientId,
    generated_document_id: gen.json.data.generatedDocument.id,
  });
  ok(
    send.status === 200 && send.json?.ok === true,
    `D4Sign sandbox send failed with ${send.status} ${
      send.json?.error?.code ?? send.json?.error?.message ?? 'unexpected_response'
    }`
  );
  return true;
}

async function run() {
  currentStep = 'running base bootstraps';
  runNodeScript(path.join('scripts', 'supabase', 'bootstrap-core-auth.mjs'));
  runNodeScript(path.join('scripts', 'supabase', 'bootstrap-patient360-demo.mjs'));
  runNodeScript(path.join('scripts', 'supabase', 'bootstrap-cross-tenant-demo.mjs'));
  runNodeScript(path.join('scripts', 'supabase', 'bootstrap-document-templates-demo.mjs'));

  currentStep = 'ensuring tenants, users and permissions';
  const tenantA = await ensureTenant('demo-clinic');
  const tenantB = await ensureTenant('demo-clinic-b');
  const staff = await ensureAuthUser('clinic.admin@example.com', 'Clinic Admin');
  const patientUser = await ensureAuthUser('phase4.patient.local@example.com', 'Phase 4 Patient');
  const guardianUser = await ensureAuthUser(
    'phase4.guardian.local@example.com',
    'Phase 4 Guardian'
  );

  await ensureProfile(staff, 'Clinic Admin', tenantA.id);
  await ensureProfile(patientUser, 'Phase 4 Patient', null);
  await ensureProfile(guardianUser, 'Phase 4 Guardian', null);
  await ensureRolePermissions(tenantA.id, 'clinic_admin', clinicAdminPermissions);
  await ensureMembership(staff, tenantA.id, 'clinic_admin');
  await seedPatientPortalLinks(tenantA.id, IDS.patientA, patientUser, guardianUser);
  await seedCrossTenantDocument(tenantB);

  currentStep = 'signing in local users';
  const staffSession = await signIn('clinic.admin@example.com');
  const patientSession = await signIn('phase4.patient.local@example.com');
  const guardianSession = await signIn('phase4.guardian.local@example.com');
  const templateId = await getActiveTemplateId(tenantA.id);

  currentStep = 'checking generation and template variable gating';
  const invalid = await callFunction('generate-document', staffSession.token, {
    patient_id: IDS.patientA,
    template_id: templateId,
    variables: { patient_name: 'Unsafe Override' },
  });
  ok(
    invalid.status === 400 && invalid.json?.error?.code === 'invalid_template_variables',
    'generate-document: protected variable override must fail closed'
  );

  const generated = await callFunction('generate-document', staffSession.token, {
    patient_id: IDS.patientA,
    template_id: templateId,
    variables: { program_name: 'Smoke documentos Phase 4' },
  });
  ok(
    generated.status === 200 && generated.json?.data?.generatedDocument?.id,
    'generate-document failed'
  );
  const generatedDocumentId = generated.json.data.generatedDocument.id;

  await admin
    .from('generated_documents')
    .update({ released_to_patient: true })
    .eq('id', generatedDocumentId)
    .throwOnError();

  const { data: generatedMeta, error: generatedMetaError } = await admin
    .from('generated_documents')
    .select('storage_path, released_to_patient')
    .eq('id', generatedDocumentId)
    .single();
  if (generatedMetaError) throw generatedMetaError;
  ok(
    generatedMeta.storage_path.endsWith('/document.pdf'),
    'generate-document: expected PDF storage path'
  );
  ok(
    generatedMeta.released_to_patient === true,
    'generated document must be released for portal smoke'
  );

  currentStep = 'checking patient/guardian document RLS';
  await expectDocumentVisibility(
    patientSession.client,
    'patient own released document',
    generatedDocumentId,
    1
  );
  await expectDocumentVisibility(
    guardianSession.client,
    'guardian released document',
    generatedDocumentId,
    1
  );
  await expectDocumentVisibility(
    patientSession.client,
    'patient cross-tenant document',
    IDS.crossDocument,
    0
  );

  currentStep = 'checking document-signed-url scope';
  const patientSignedUrl = await callFunction('document-signed-url', patientSession.token, {
    patient_id: IDS.patientA,
    generated_document_id: generatedDocumentId,
  });
  ok(
    patientSignedUrl.status === 200 && patientSignedUrl.json?.data?.url,
    'document-signed-url: patient own document must succeed'
  );

  const guardianSignedUrl = await callFunction('document-signed-url', guardianSession.token, {
    patient_id: IDS.patientA,
    generated_document_id: generatedDocumentId,
  });
  ok(
    guardianSignedUrl.status === 200 && guardianSignedUrl.json?.data?.url,
    'document-signed-url: guardian own document must succeed'
  );

  const crossSignedUrl = await callFunction('document-signed-url', patientSession.token, {
    patient_id: IDS.patientB,
    generated_document_id: IDS.crossDocument,
  });
  ok(
    crossSignedUrl.status === 403 || crossSignedUrl.status === 404,
    'document-signed-url: cross-tenant document must fail closed'
  );

  currentStep = 'checking D4Sign webhook idempotency and audit';
  await invokeD4SignWebhook(IDS.signatureRequest, generatedDocumentId, tenantA.id);

  currentStep = 'optionally checking D4Sign sandbox send';
  const sandboxRan = await runOptionalSandboxSend(staffSession.token, IDS.patientA, templateId);

  console.log('Documents Phase 4 local smoke passed');
  console.log('- generation uses active templates, allowed variables, and PDF storage');
  console.log('- patient/guardian released-document RLS and signed URL scope passed');
  console.log('- D4Sign webhook HMAC, idempotency, audit, document status, and timeline passed');
  console.log(
    sandboxRan
      ? '- D4Sign sandbox send passed'
      : '- D4Sign sandbox send skipped; set RUN_D4SIGN_SANDBOX_SEND=true with D4SIGN_SAFE_UUID or approved D4SIGN_AUTO_DISCOVER_SAFE=true to run it'
  );
}

run().catch((error) => {
  console.error(
    `Documents Phase 4 local smoke failed during ${currentStep}:`,
    shortError(error) || 'unknown_error'
  );
  process.exit(1);
});
