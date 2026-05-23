# Supabase Core Auth And RBAC Runbook

This project includes a development bootstrap script for core auth and
multi-tenant role testing only. It does not create UI changes and does not
create new clinical tables.

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

## Run Migrations First

```bash
supabase db push
```

Do not run this command unless the task explicitly authorizes database changes
against the selected Supabase project.

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
3. Creates `tenant_memberships` only for clinic roles supported by the current
   migration: `clinic_admin`, `physician`, `nutritionist`, `financial_user`.
   `tenant_memberships.role` mirrors `role_code`.
4. Skips patient tenant membership for now, seeding only auth plus profile for a
   future patient-profile linking flow.
5. Assigns roles and permissions by upserting tenant-scoped `roles`,
   `permissions`, and `role_permissions` for the clinic roles above.

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
6. Seed patient as auth user plus `public.profiles` row only until a valid
   patient membership schema exists.
7. Insert role and permission rows in `public.roles`, `public.permissions`, then
   relation rows in `public.role_permissions` for clinic roles.

The bootstrap script automates this exact flow for local development and
testing.

## Manual RBAC Smoke Tests

A lightweight manual SQL test checklist is available at:

- `supabase/tests/core_rbac_smoke_tests.sql`
- `supabase/tests/rls_cross_tenant_smoke_tests.sql`

How to run:

1. Run migrations and bootstrap first:
   - `supabase db push`
   - `node scripts/supabase/bootstrap-core-auth.mjs`
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
