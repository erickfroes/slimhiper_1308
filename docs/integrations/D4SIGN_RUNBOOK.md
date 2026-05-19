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
- `scripts/supabase/bootstrap-document-templates-demo.mjs`

## Setup Flow

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

## Edge Function Secrets

Do not place these in `NEXT_PUBLIC_*`. Configure them only in trusted server or
Edge Function environments:

- `D4SIGN_TOKEN_API`
- `D4SIGN_CRYPT_KEY`
- `D4SIGN_BASE_URL`
- D4Sign webhook token or HMAC secret used by `webhook-d4sign`
- `SUPABASE_SERVICE_ROLE_KEY` where required by trusted Edge Functions

Use placeholders in docs and examples. Never commit real values.

## Security Rules

- D4Sign APIs must not be called without explicit authorization.
- Webhook verification must fail closed.
- Store only the minimum operational payload needed.
- Prefer redacted payload summaries over raw provider bodies.
- Signed document URLs must be short-lived and permission-checked.
- Keep patient, document, signature, and provider identifiers treated as
  sensitive operational data.

## Deployment Notes

Runbook users should confirm whether webhook functions need JWT verification
disabled at deployment time and document the deployment command for the target
Supabase project. Do not infer deployment settings from local code alone.
