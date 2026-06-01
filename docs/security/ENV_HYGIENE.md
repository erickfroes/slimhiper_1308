# Environment Hygiene

This repository is a hybrid Next.js and Supabase app. Environment variables must
be handled as deployment configuration, not as source code.

## Local Setup

1. Copy the template:

```bash
cp .env.example .env.local
```

2. Fill `.env.local` with local development values.
3. Keep `.env`, `.env.local`, and `.env.*.local` out of Git.
4. Commit updates to `.env.example` only when variable names change.

## Public Browser Variables

Variables prefixed with `NEXT_PUBLIC_` are bundled into browser code. They must
be safe to expose to users.

Current public variables used or documented by the repo:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_USE_MOCK_DATA`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- `NEXT_PUBLIC_ADSENSE_ID`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Do not put provider secrets, service-role keys, webhook tokens, private API
keys, or patient data in any `NEXT_PUBLIC_*` variable.

## Server-only Variables

These variables must be used only in trusted server-side code, authorized local
scripts, CI secrets, or Supabase Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BOOTSTRAP_PASSWORD`
- `SUPABASE_BOOTSTRAP_TENANT_SLUG`
- `SUPABASE_BOOTSTRAP_TENANT_NAME`
- `TEST_ACCESS_TOKEN`
- `TEST_PATIENT_ID`
- `TEST_TEMPLATE_ID`
- `ENABLE_PRODUCTION_SOURCE_MAPS`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`
- `PERPLEXITY_API_KEY`

`ENABLE_PRODUCTION_SOURCE_MAPS` must stay unset/false unless a release owner explicitly accepts the risk of publishing production source maps for a bounded diagnostic window.

`SUPABASE_SERVICE_ROLE_KEY` must never be imported into client components,
browser services, or any `NEXT_PUBLIC_*` variable. It bypasses RLS and belongs
only in trusted scripts or Edge Functions that validate tenant/user/provider
context before doing privileged work.

## D4Sign Variables

D4Sign credentials and webhook secrets are server-only:

- `D4SIGN_TOKEN_API`
- `D4SIGN_CRYPT_KEY`
- `D4SIGN_BASE_URL`
- `D4SIGN_WEBHOOK_TOKEN`
- `D4SIGN_WEBHOOK_HMAC_SECRET`

Never expose D4Sign credentials to frontend code. Do not log tokens, crypt keys,
webhook secrets, raw signed payloads, or provider payloads tied to real patients.

## Asaas Variables

Asaas credentials and webhook secrets are server-only:

- `ASAAS_API_KEY`
- `ASAAS_BASE_URL`
- `ASAAS_WEBHOOK_TOKEN`

Never expose Asaas credentials to frontend code. Do not call Asaas APIs unless a
task explicitly authorizes that environment and operation.

## Rotation Guidance

If a real value was committed to Git, rotate it in the provider dashboard or
Supabase project even after removing it from tracking. Removing a secret from
the current tree does not remove it from repository history.

When reporting exposed variables, report only variable names. Never print secret
values in issues, PRs, logs, docs, or assistant responses.

Current handling decision:

- `.env` is removed from the Git index and local env files are ignored.
- Repository history is not being rewritten in this pass.
- If the previously tracked `.env` contained real values, rotate the private
  provider keys outside the repository before using those providers again:
  `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, and
  `PERPLEXITY_API_KEY`.
- Review public configuration values that appeared in the previous tracked
  `.env`: `NEXT_PUBLIC_ADSENSE_ID`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`,
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SUPABASE_URL`.

## Reproducible Installs

This project uses npm. Keep `package-lock.json` committed so local development,
CI, and deployment builds resolve the same dependency graph.

Do not introduce `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, or another package
manager lockfile without a dedicated package-manager migration task.

## Maintenance Rules

When adding, renaming, or removing an environment variable in code, scripts, Edge
Functions, or provider runbooks, update all relevant files in the same PR:

- `.env.example`
- `docs/security/ENV_HYGIENE.md`
- The affected integration or Supabase runbook
- Any contract script documentation that references the variable
