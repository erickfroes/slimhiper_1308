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
- `scripts/supabase/test-documents-contract.mjs`
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
```

## Edge Function Secrets

Do not place these in `NEXT_PUBLIC_*`. Configure them only in trusted server or
Edge Function environments:

- `D4SIGN_TOKEN_API`
- `D4SIGN_CRYPT_KEY`
- `D4SIGN_BASE_URL`
- D4Sign webhook token or HMAC secret used by `webhook-d4sign`
- `SUPABASE_SERVICE_ROLE_KEY` where required by trusted Edge Functions

Use placeholders in docs and examples. Never commit real values.

## Storage Contract

- `generated_documents.storage_bucket` is constrained to the clinical
  document bucket allow-list.
- Direct storage downloads are intentionally blocked by policy.
- `generate-document` validates the caller JWT, active tenant membership, and
  `documents.write` with the user-scoped client, then writes the rendered object,
  generated document row, and timeline event with the service-role client. This
  keeps storage writes backend-owned while preserving user authorization.
- Users request short-lived URLs through `document-signed-url`, which checks
  tenant membership, `documents.read`, the bucket allow-list, and the canonical
  storage path shape before using the service-role storage client.
- Upload/update remains limited to users with `documents.write` in the document
  tenant context.

## Patient 360 Signature Gating

- `src/app/paciente-360/components/tabs/TabDocumentos.tsx` calls
  `sendDocumentForSignature(documentId, patientId)` without building a fake
  signer in the browser.
- `src/services/documentsApi.ts` invokes only `d4sign-send-document`; browser
  code does not receive D4Sign tokens or provider credentials.
- `supabase/functions/d4sign-send-document` validates tenant membership and
  `documents.write`, rejects medical prescription categories, blocks duplicate
  pending signature requests, and derives the signer from `patient_pii`
  (`full_name` plus email or phone) when the request does not include explicit
  signers.
- If no real signer can be derived, the function returns
  `missing_patient_signer` and does not call D4Sign.
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
