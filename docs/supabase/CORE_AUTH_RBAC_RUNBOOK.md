# Supabase Core Auth And RBAC Runbook

This project uses a clean canonical migration set for an empty Supabase
project. The core auth bootstrap is for development/staging tenant and RBAC
testing only. It does not create UI changes and should run only after the clean
schema has been applied.

For the app-facing session shape, route guards, expected tables/columns, and
known contract gaps, see `docs/auth/AUTH_RBAC_SESSION_CONTRACT.md`.

## Environment Variables

Create a local env file, for example `.env.local`, and set placeholders like:

```bash
# Public web client vars (safe for frontend)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co

# Preferred public key variable
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>

# Backward compatibility fallback
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Service-role vars (bootstrap script only; NEVER expose to frontend)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_BOOTSTRAP_PASSWORD=<temporary-dev-password>

# Optional bootstrap overrides
SUPABASE_BOOTSTRAP_TENANT_SLUG=demo-clinic
SUPABASE_BOOTSTRAP_TENANT_NAME=Demo Clinic
```

Use service-role credentials only in trusted server-side scripts such as
`scripts/supabase/bootstrap-core-auth.mjs`. Never expose service-role keys in
browser code or any `NEXT_PUBLIC_*` variable.

For local Supabase CLI, use `SERVICE_ROLE_KEY`, not `SECRET_KEY`. The
`SECRET_KEY` value starts with `sb_secret_...` and is not accepted by these
bootstrap scripts as `SUPABASE_SERVICE_ROLE_KEY`.

PowerShell helper for local development:

```powershell
$status = npx supabase status --output env
$env:SUPABASE_URL = ($status | Select-String '^API_URL=').Line -replace '^API_URL="(.+)"$','$1'
$env:SUPABASE_SERVICE_ROLE_KEY = ($status | Select-String '^SERVICE_ROLE_KEY=').Line -replace '^SERVICE_ROLE_KEY="(.+)"$','$1'
```

This captures values into environment variables without printing them again in
the terminal.

## Run Migrations First

```bash
supabase db push
```

Do not run this command unless the task explicitly authorizes database changes
against the selected Supabase project.

Expected clean migration order:

1. `20260530120000_000_extensions_security.sql`
2. `20260530121000_010_core_auth_rbac.sql`
3. `20260530122000_020_clinical_patient360.sql`
4. `20260530123000_030_programs_reports_chat_crm_inventory.sql`
5. `20260530124000_040_documents_storage_d4sign.sql`
6. `20260530125000_050_billing_asaas.sql`
7. `20260530126000_060_contract_views_rpcs.sql`
8. `20260531090000_070_billing_webhook_security_hardening.sql`

## Run The Bootstrap Script

```bash
node scripts/supabase/bootstrap-core-auth.mjs
```

## Seeded Users And Tenant Data

The core bootstrap creates or upserts:

- 1 platform admin profile with `platform_role = platform_admin`.
- 1 demo tenant.
- 1 clinic admin tenant membership with `clinic_admin`.
- 1 physician tenant membership with `physician`.
- 1 nutritionist tenant membership with `nutritionist`.
- 1 financial user tenant membership with `financial_user`.
- 1 patient auth user plus profile only, with no tenant membership yet.

Using placeholder emails:

- `platform.admin@example.com`
- `clinic.admin@example.com`
- `physician.demo@example.com`
- `nutritionist.demo@example.com`
- `finance.demo@example.com`
- `patient.demo@example.com`

## What The Script Does

1. Creates users in Supabase Auth (`auth.users`) using the Admin API.
2. Links `auth.users` to `public.profiles` by upserting profile rows with
   matching `id`. Clinic users receive `profiles.active_tenant_id` for the demo
   tenant.
3. Creates `tenant_memberships` for the seeded clinic roles:
   `clinic_admin`, `physician`, `nutritionist`, `financial_user`.
   `tenant_memberships.role` mirrors `role_code`.
4. Skips patient tenant membership in this core bootstrap. Patient/guardian
   portal identity is represented by active patient/guardian memberships plus
   `patient_accounts` and `guardian_links`, whose own-link RLS and scoped portal
   RPCs are validated separately. Use the patient linkage/portal contracts when
   `/patient` needs to open in a smoke environment.
5. Assigns roles and permissions by upserting tenant-scoped `roles`,
   `permissions`, and `role_permissions` for the clinic roles above.
   `clinic_admin` includes `packages.read` and `packages.write` for the
   programs/packages MVP contract.

## Manual Flow

If you prefer manual setup in Supabase Dashboard:

1. Go to Authentication -> Users and create each user with placeholder email
   plus temporary password.
2. In SQL Editor, insert or update `public.profiles` where
   `profiles.id = auth.users.id`.
3. Insert a demo row in `public.tenants`.
4. Set `profiles.active_tenant_id` for clinic users to the demo tenant ID.
5. Insert rows in `public.tenant_memberships` for clinic users only, using valid
   constrained role values.
6. Seed patient as auth user plus `public.profiles` row only for core auth. Use
   the patient linkage contract when you need active `patient_accounts` or
   `guardian_links` demo rows.
7. Insert role and permission rows in `public.roles`, `public.permissions`, then
   relation rows in `public.role_permissions` for clinic roles.

The bootstrap script automates this exact flow for local development and
testing.

## Manual RBAC Smoke Tests

A lightweight manual SQL test checklist is available at:

- `supabase/tests/core_rbac_smoke_tests.sql`
- `supabase/tests/rls_cross_tenant_smoke_tests.sql`
- `scripts/supabase/test-rls-cross-tenant-contract.mjs`
- `scripts/supabase/test-patient-linkage-contract.mjs`

How to run:

1. Run migrations and bootstrap first:
   - `supabase db push`
   - `node scripts/supabase/bootstrap-core-auth.mjs`
   - Optional cross-tenant smoke seed:
     `node scripts/supabase/bootstrap-cross-tenant-demo.mjs`
   - Optional scripted local RLS contracts:
     `node scripts/supabase/test-rls-cross-tenant-contract.mjs` and
     `node scripts/supabase/test-patient-linkage-contract.mjs`
2. Open Supabase Dashboard -> SQL Editor.
3. Open or copy `supabase/tests/core_rbac_smoke_tests.sql`.
4. Replace all placeholder IDs (`USER_*_UUID`, `TENANT_*_UUID`) with values
   from your own seeded environment.
5. Run each numbered test block and verify the expected result comments.

Notes:

- This file is intentionally manual/commented and does not depend on hard-coded
  real UUIDs.
- It focuses only on core RBAC behavior and metadata access checks.
- It does not create UI changes or new clinical tables.
