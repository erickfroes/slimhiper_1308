#!/usr/bin/env node

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const token = process.env.TEST_ACCESS_TOKEN;
const patientId = process.env.TEST_PATIENT_ID;
const templateId = process.env.TEST_TEMPLATE_ID;

if (!url || !key || !token || !patientId || !templateId) {
  console.error('Missing envs');
  process.exit(1);
}

async function invoke(fn, body) {
  const response = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
}

const pd = await invoke('patient-documents', { patient_id: patientId });
if (pd.status !== 200 || pd.body?.ok !== true) throw new Error('patient-documents contract failed');
if ((pd.body.data.documents || []).some((d) => d.storage_path || d.storage_bucket)) {
  throw new Error('storage leakage');
}

const gen = await invoke('generate-document', { patient_id: patientId, template_id: templateId });
if (gen.status !== 200 || !gen.body?.data?.generatedDocument?.id) {
  throw new Error('generate-document contract failed');
}

const generatedDocumentId = gen.body.data.generatedDocument.id;

const su = await invoke('document-signed-url', {
  patient_id: patientId,
  generated_document_id: generatedDocumentId,
});
if (su.status !== 200 || !su.body?.data?.url || !su.body?.data?.expiresInSeconds) {
  throw new Error('document-signed-url contract failed');
}

const sig = await invoke('d4sign-send-document', {
  patient_id: patientId,
  generated_document_id: generatedDocumentId,
});
const acceptedLocalSafeCodes = new Set([
  'server_misconfigured',
  'missing_patient_signer',
  'unsupported_document_category',
  'signature_already_pending',
]);
if (sig.status >= 400 && !acceptedLocalSafeCodes.has(sig.body?.error?.code) && sig.status !== 502) {
  throw new Error('Expected safe d4sign gated response');
}

console.log('Documents contract checks passed');
