#!/usr/bin/env node

import {
  envFlag,
  getEnvValue,
  getSupabasePublishableKey,
  isSandboxLikeUrl,
} from './_shared/env.mjs';

const url = getEnvValue('SUPABASE_URL');
const key = getSupabasePublishableKey();
const token = getEnvValue('TEST_ACCESS_TOKEN');
const patientId = getEnvValue('TEST_PATIENT_ID');
const cpfCnpj = getEnvValue('TEST_PATIENT_CPF_CNPJ');
const requireProviderSuccess = envFlag('REQUIRE_ASAAS_PROVIDER_SUCCESS');

if (!url || !key || !token || !patientId) {
  console.error('Missing envs');
  process.exit(1);
}

if (requireProviderSuccess) {
  const asaasBaseUrl = getEnvValue('ASAAS_BASE_URL');
  if (!asaasBaseUrl) {
    throw new Error('REQUIRE_ASAAS_PROVIDER_SUCCESS=true requires ASAAS_BASE_URL.');
  }
  if (!isSandboxLikeUrl(asaasBaseUrl) && !envFlag('ALLOW_ASAAS_PROVIDER_CONTRACT_NON_SANDBOX')) {
    throw new Error(
      'Refusing strict Asaas provider contract because ASAAS_BASE_URL is not classified as sandbox. Set ALLOW_ASAAS_PROVIDER_CONTRACT_NON_SANDBOX=true only for an explicitly approved non-sandbox run.'
    );
  }
}

const allowedStatuses = new Set([200, 401, 403, 404, 409, 422, 502]);
const forbiddenBrowserFields = new Set([
  'asaas_customer_id',
  'asaas_invoice_id',
  'asaas_subscription_id',
  'asaas_account_id',
]);
const futureDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function invoke(fn, body, auth = true) {
  const response = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      ...(auth ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

function assertEnvelope(name, result) {
  if (!result.body || typeof result.body !== 'object' || typeof result.body.ok !== 'boolean') {
    throw new Error(`${name} did not return safe envelope`);
  }
}

function assertNoProviderIds(name, result) {
  const data = result.body?.data;
  if (!data || typeof data !== 'object') return;

  for (const field of forbiddenBrowserFields) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      throw new Error(`${name} exposed provider field ${field} to the browser contract`);
    }
  }
}

const checks = [
  ['asaas-create-patient-customer', { patient_id: patientId }],
  [
    'asaas-create-patient-invoice',
    {
      patient_id: patientId,
      amount_cents: 1000,
      due_date: futureDueDate,
      description: 'Demo',
    },
  ],
  [
    'asaas-create-patient-subscription',
    {
      patient_id: patientId,
      amount_cents: 1000,
      next_due_date: futureDueDate,
      cycle: 'monthly',
    },
  ],
];

for (const [name, body] of checks) {
  const requestBody =
    name === 'asaas-create-patient-customer' && cpfCnpj ? { ...body, cpf_cnpj: cpfCnpj } : body;
  const okRes = await invoke(name, requestBody, true);
  if (requireProviderSuccess && okRes.status !== 200) {
    throw new Error(`${name} expected provider success, received status ${okRes.status}`);
  }
  if (!requireProviderSuccess && !allowedStatuses.has(okRes.status)) {
    throw new Error(`${name} unexpected status ${okRes.status}`);
  }
  assertEnvelope(name, okRes);
  assertNoProviderIds(name, okRes);

  const unauth = await invoke(name, requestBody, false);
  if (![401, 403].includes(unauth.status)) {
    throw new Error(`${name} should enforce auth`);
  }
}

console.log('Billing contract checks passed');
