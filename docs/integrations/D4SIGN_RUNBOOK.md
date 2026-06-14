# D4Sign Documents Runbook

This runbook covers the document-signing workflow around D4Sign, document
templates, signed document URLs, and related contract checks.

## Scope

Relevant files include:

- `supabase/functions/d4sign-send-document`
- `supabase/functions/webhook-d4sign`
- `supabase/functions/document-signed-url`
- `supabase/functions/generate-document`
- `supabase/functions/patient-documents`
- `src/services/documentsApi.ts`
- `src/services/clinicDocumentsApi.ts`
- `scripts/supabase/test-documents-contract.mjs`
- `scripts/supabase/test-documents-phase4-local-smoke.mjs`
- `scripts/supabase/test-d4sign-fixtures.mjs`
- `scripts/supabase/bootstrap-document-templates-demo.mjs`
- `tests/fixtures/d4sign-webhook-valid.json`
- `tests/fixtures/d4sign-webhook-invalid.json`
- `tests/fixtures/document-summary.json`

## Local Fixture Contract Checks

Use local fixture checks before calling any Supabase or D4Sign environment:

```bash
node scripts/supabase/test-d4sign-fixtures.mjs
```

This script is offline-only. It does not read secrets, does not call D4Sign,
does not call Supabase, and does not write data.

It validates:

- D4Sign webhook payload shape.
- Deterministic idempotency key derivation.
- Local SHA-256 payload hash strategy without printing payloads.
- HMAC SHA-256 verification strategy with a fixture-only placeholder secret.
- Status mapping from D4Sign events to internal signature/document states.
- Fail-closed behavior for an invalid webhook fixture with missing signature.
- Document summary shape expected by the frontend, including storage/raw payload
  leakage checks.

The valid fixture documents `x-d4sign-signature: sha256=<digest>` as the target
header shape, but uses a placeholder marker instead of a real signature. The
script computes the HMAC locally with a hard-coded fixture-only value that must
never be reused as a real secret.

## Setup Flow

The setup flow below can call Supabase and D4Sign-related Edge Functions. Run it
only after explicit authorization for the target environment.

1. Run migrations from the project root:

```bash
supabase db push
```

2. Bootstrap auth core:

```bash
node scripts/supabase/bootstrap-core-auth.mjs
```

3. Bootstrap patient demo:

```bash
node scripts/supabase/bootstrap-patient360-demo.mjs
```

4. Bootstrap document templates:

```bash
node scripts/supabase/bootstrap-document-templates-demo.mjs
```

5. Obtain a test access token and export environment variables:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-or-publishable-key>
TEST_ACCESS_TOKEN=<jwt-for-authorized-user>
TEST_PATIENT_ID=<patient-id>
TEST_TEMPLATE_ID=<document-template-id>
```

6. Run the documents contract test:

```bash
node scripts/supabase/test-documents-contract.mjs
```

Only run this script when authorized. It may generate documents, request signed
URLs, or invoke D4Sign-related functions depending on environment and function
configuration.

For day-to-day local validation, prefer:

```bash
node scripts/supabase/test-d4sign-fixtures.mjs
node scripts/supabase/test-documents-phase4-local-smoke.mjs
```

The Phase 4 local smoke validates Supabase and Edge contracts without calling
D4Sign by default. It checks active-template generation, protected variable
gating, PDF storage, released-document patient/guardian RLS, short-lived signed
URLs, D4Sign webhook HMAC, idempotency, audit rows, document status, signer
status, and timeline.

To include the real D4Sign sandbox send, configure the safe/cofre UUID and run:

```bash
RUN_D4SIGN_SANDBOX_SEND=true node scripts/supabase/test-documents-phase4-local-smoke.mjs
```

Do this only in an approved sandbox. The current MVP local checkpoint keeps the
provider send blocked until `D4SIGN_SAFE_UUID` is configured with a real cofre
UUID or `D4SIGN_AUTO_DISCOVER_SAFE=true` is explicitly enabled for approved
sandbox auto-discovery. Dummy/placeholder values for safe, folder, webhook token,
or HMAC secret are treated as missing and fail closed.
When a real sandbox cofre and folder are configured explicitly, prefer leaving
`D4SIGN_AUTO_DISCOVER_SAFE` empty/false; the send flow will use
`D4SIGN_SAFE_UUID` and optionally `D4SIGN_FOLDER_UUID` directly.

## Edge Function Secrets

Do not place these in `NEXT_PUBLIC_*`. Configure them only in trusted server or
Edge Function environments:

- `D4SIGN_TOKEN_API`
- `D4SIGN_CRYPT_KEY`
- `D4SIGN_BASE_URL`
- `D4SIGN_SAFE_UUID`; dummy/placeholder values are treated as missing
- `D4SIGN_FOLDER_UUID` when documents should land in a specific D4Sign folder;
  dummy/placeholder values are ignored
- `D4SIGN_AUTO_DISCOVER_SAFE=true` only for approved sandbox smoke runs when the
  account has exactly the safe you expect to use
- D4Sign webhook token or HMAC secret used by `webhook-d4sign`
- `SUPABASE_SERVICE_ROLE_KEY` where required by trusted Edge Functions

Use placeholders in docs and examples. Never commit real values.

## Storage Contract

- `generated_documents.storage_bucket` is constrained to the clinical
  document bucket allow-list.
- Direct storage downloads are intentionally blocked by policy.
- `generate-document` validates the caller JWT, active tenant membership, and
  `documents.write` with the user-scoped client, accepts only active templates,
  blocks protected variable overrides, then writes a generated PDF object,
  generated document row, and timeline event with the service-role client. This
  keeps storage writes backend-owned while preserving user authorization.
- Users request short-lived URLs through `document-signed-url`, which checks
  either staff `documents.read` or an active patient/guardian linkage for a
  released document, the bucket allow-list, and the canonical storage path shape
  before using the service-role storage client.
- Upload/update remains limited to users with `documents.write` in the document
  tenant context.
- Patient/guardian document metadata access is scoped by
  `can_read_own_patient_document` and only applies to
  `generated_documents.released_to_patient=true`. Direct storage reads remain
  blocked.

## Patient 360 Signature Gating

- `src/app/paciente-360/components/tabs/TabDocumentos.tsx` calls
  `sendDocumentForSignature(documentId, patientId)` without building a fake
  signer in the browser.
- `src/services/documentsApi.ts` invokes only `d4sign-send-document`; browser
  code does not receive D4Sign tokens or provider credentials.
- `supabase/functions/d4sign-send-document` validates tenant membership and
  `documents.write`, rejects medical prescription categories, requires a
  provider-supported file, blocks duplicate pending signature requests, and
  derives the signer from `patient_pii` (`full_name` plus email) when the request
  does not include explicit signers.
- If no real signer can be derived, the function returns
  `missing_patient_signer` and does not call D4Sign.
- The provider call path downloads the private generated PDF with service role,
  uploads it to the configured D4Sign safe/cofre, creates the signer list, and
  sends to signer. Tokens, raw provider responses, and storage paths are never
  returned to browser code.
- By default the provider send requires a non-placeholder `D4SIGN_SAFE_UUID`.
  In an approved sandbox smoke only, `D4SIGN_AUTO_DISCOVER_SAFE=true` lets the
  Edge Function call `GET /safes` and use the first returned safe. If no safe is
  returned, the function fails closed with `provider_safe_not_found` and does
  not proceed to upload. If `D4SIGN_AUTO_DISCOVER_SAFE` is dummy or empty, it is
  considered disabled.
- `supabase/functions/patient-documents` exposes only safe UI hints:
  `canRequestSignature` and `signatureDisabledReason`. It must not expose
  storage paths, signed URLs, raw provider payloads, or signer PII.
- `scripts/supabase/test-documents-contract.mjs` no longer sends
  `paciente@example.com`; when the authorized environment is missing D4Sign
  configuration or signer data, `server_misconfigured` and
  `missing_patient_signer` are accepted gated outcomes.

## Security Rules

- D4Sign APIs must not be called without explicit authorization.
- Webhook verification must fail closed.
- Webhook handlers must reject missing token/signature configuration.
- Webhook handlers must reject missing or mismatched HMAC signatures when HMAC
  is configured.
- Idempotency keys must be deterministic when provider event/document ids are
  present.
- Store only the minimum operational payload needed.
- Prefer redacted payload summaries over raw provider bodies.
- Local fixture tests must not print raw webhook payloads or real identifiers.
- Signed document URLs must be short-lived and permission-checked.
- Keep patient, document, signature, and provider identifiers treated as
  sensitive operational data.

## Status Mapping Contract

Local contract fixtures assert this provider-to-internal mapping:

| D4Sign/webhook status                    | Signature request | Signer     | Frontend document status | Frontend signature |
| ---------------------------------------- | ----------------- | ---------- | ------------------------ | ------------------ |
| `sent`, `created`, `enviado`             | `sent`            | `pending`  | `pendente_assinatura`    | `pendente`         |
| `view`, `opened`, `visualiz*`            | `viewed`          | `viewed`   | `pendente_assinatura`    | `pendente`         |
| `sign*`, `assinad*`, `done`, `completed` | `signed`          | `signed`   | `assinado`               | `assinado`         |
| `reject*`, `refus*`, `declin*`           | `rejected`        | `rejected` | `cancelado`              | `pendente`         |
| `expir*`                                 | `expired`         | `expired`  | `vencido`                | `pendente`         |
| `cancel*`                                | `canceled`        | `canceled` | `cancelado`              | `pendente`         |
| `error`, `fail*`, `invalid`              | `error`           | `error`    | `em_analise`             | `pendente`         |

When a webhook maps to `signed`, the expected timeline event is
`documento_assinado` with category `documents`.

## Deployment Notes

`supabase/config.toml` versions `[functions.webhook-d4sign] verify_jwt = false`
because the provider cannot send a Supabase JWT. Keep this setting limited to
webhook handlers that validate their own token/HMAC, and document the target
project deployment command without printing secrets.

## Safe Validation Without Real Data

Use this flow to validate generation, signed URL authorization, D4Sign sandbox
readiness, and webhook handling without exposing real patients or calling Asaas.
Prefer a disposable local Supabase project or a dedicated staging tenant seeded
only with synthetic fixtures.

### 1. Pre-flight isolation

- Confirm all test identities, patients, guardians, templates, generated
  documents, and emails are synthetic and non-deliverable.
- Leave Asaas secrets unset; document validation must not call billing provider
  functions.
- Leave D4Sign send disabled by default. Do not set
  `RUN_D4SIGN_SANDBOX_SEND=true` unless the test objective is an explicitly
  approved D4Sign sandbox send.
- Use `supabase/tests/document_security_rls_checklist.sql` as the RLS/audit
  acceptance checklist for `document_templates`, `generated_documents`,
  patient/guardian release reads, restricted document blocking, and minimized
  audit events.

### 2. Generation validation with synthetic fixtures

1. Seed a synthetic tenant, authorized clinic staff user, patient, active
   guardian/contact, and an active document template in a disposable database.
2. Invoke only the local/staging `generate-document` path with the synthetic
   staff token and fixture variables. Do not include real identifiers, CPF,
   phone, address, clinical notes, provider IDs, or storage objects from
   production.
3. Verify the generated row belongs to the fixture tenant and patient, the
   template ID matches the active fixture template, protected variables were not
   overridden by the caller, and the stored PDF path uses the expected private
   document bucket/path convention.
4. Verify `document_audit_events` contains `document.generated` with minimized
   summary fields and no raw payloads, signed URLs, tokens, cookies,
   authorization headers, storage paths, CPF, or real email addresses.

### 3. Signed URL and portal access validation

1. Create two synthetic generated documents for the same patient: one with
   `released_to_patient=true` and one with `released_to_patient=false`.
2. As authorized clinic staff, verify metadata access for both documents through
   the expected clinic read path.
3. As the patient and as the active guardian, verify metadata access only for
   the released document.
4. Request a signed URL only through `document-signed-url` for the released
   document and confirm the response is short-lived and permission-checked.
5. Confirm direct storage access remains blocked and `document-signed-url`
   rejects the restricted document for patient/guardian actors.
6. Verify release/hide actions create `document.released_to_patient` and
   `document.hidden_from_patient` audit events with minimized summaries.

### 4. D4Sign sandbox validation boundaries

- Default local and CI checks must stop before the real D4Sign send. Use local
  fixtures and mapper/status tests first.
- If an approved sandbox send is required, use only a dedicated D4Sign sandbox
  account/cofre/folder and synthetic signers. Set `RUN_D4SIGN_SANDBOX_SEND=true`
  only for that single run, and unset it immediately after.
- Never use production cofre UUIDs, provider document IDs, tokens, crypt keys,
  webhook secrets, real signer emails, or real patient documents in sandbox
  validation.
- Sandbox send validation must not call Asaas and must not reuse production
  webhook endpoints.

### 5. Webhook validation with local payloads

1. Run fixture-only webhook checks before any environment test:

```bash
node scripts/supabase/test-d4sign-fixtures.mjs
```

2. Use placeholder fixture secrets only. Do not print or commit real webhook
   tokens, HMAC secrets, raw provider bodies, or provider document IDs.
3. Validate fail-closed behavior for missing token/signature configuration,
   missing or mismatched HMAC signatures, duplicate idempotency keys, and
   unsupported statuses.
4. Verify status changes create `document.status_changed` or
   `document.signature_status_changed` audit events and sanitized timeline/UI
   states without exposing raw provider payloads.

### 6. Mapper fixture coverage

`src/services/__fixtures__/clinicDocumentsApi.mapper-fixtures.json` documents
pure, offline expectations for `mapSignatureStatus`, `getStatusKind`, and
`buildCategories`. Unit tests that consume this fixture must import only pure
mapper/status modules and local assertion libraries; they must not instantiate
Supabase clients, invoke Edge Functions, or call D4Sign/Asaas.
