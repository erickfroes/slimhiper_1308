# Auth/RBAC Session Contract

This document captures the current SlimHiper Auth/RBAC/session contract for the
Next.js app and Supabase schema. It is a baseline contract, not a migration.

## Scope

Covered application files:

- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/middleware.ts`
- `src/middleware.ts`
- `src/services/session/getCurrentAppSession.ts`
- `src/lib/auth/getCurrentUserContext.ts`
- `src/lib/auth/canAccessPlatformAdmin.ts`
- `src/lib/auth/clinicAccessGuard.ts`
- `src/app/auth/login/page.tsx`
- `src/app/api/auth/app-session/route.ts`
- `src/app/clinic/layout.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/components/PlatformAdminGuard.tsx`

Supabase schema sources:

- `supabase/migrations/20260530120000_000_extensions_security.sql`
- `supabase/migrations/20260530121000_010_core_auth_rbac.sql`
- `supabase/migrations/20260531135000_110_patient_guardian_linkage_rls.sql`
- `scripts/supabase/bootstrap-core-auth.mjs`
- `scripts/supabase/test-rls-cross-tenant-contract.mjs`
- `scripts/supabase/test-patient-linkage-contract.mjs`
- `supabase/tests/core_rbac_smoke_tests.sql`

## Supabase Clients

- Browser client: `src/lib/supabase/client.ts`.
  - Uses `NEXT_PUBLIC_SUPABASE_URL`.
  - Uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, falling back to
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Must never receive `SUPABASE_SERVICE_ROLE_KEY`.
- Server component/client helper: `src/lib/supabase/server.ts`.
  - Uses the same public Supabase URL/key and request cookies.
  - Does not use service role.
- Middleware helper: `src/lib/supabase/middleware.ts`.
  - Uses the same public Supabase URL/key.
  - Refreshes Supabase auth cookies through `@supabase/ssr`.

Build and runtime environments must provide safe public Supabase values. Secrets
and service-role credentials belong only in trusted scripts or Edge Functions.

## Expected Tables And Fields

### `public.profiles`

Expected by app/session:

- `id`
- `email`
- `full_name`
- `platform_role`
- `active_tenant_id`
- `is_active`
- `created_at`
- `updated_at`

`active_tenant_id` stores the preferred workspace. `getCurrentAppSession` uses
it only when the user also has an active membership for that tenant; otherwise
it falls back to the first active membership.

### `public.tenants`

- `id`
- `slug`
- `name`
- `status`
- `settings`
- `created_at`
- `updated_at`

### `public.tenant_units`

- `id`
- `tenant_id`
- `code`
- `name`
- `metadata`
- `created_at`
- `updated_at`

### `public.tenant_memberships`

- `id`
- `tenant_id`
- `user_id`
- `role`
- `role_code`
- `status`
- `unit_id`
- `invited_by`
- `accepted_at`
- `created_at`
- `updated_at`

`role` is legacy/policy-facing and `role_code` is the application RBAC role
code. `getCurrentAppSession` prefers `role_code`, falling back to `role`.

### `public.roles`

- `id`
- `tenant_id`
- `name`
- `description`
- `is_system`
- `created_at`
- `updated_at`

### `public.permissions`

- `id`
- `tenant_id`
- `code`
- `description`
- `created_at`
- `updated_at`

The app session contract reads permission codes from `permissions.code`.

### `public.role_permissions`

- `id`
- `tenant_id`
- `role_id`
- `permission_id`
- `created_at`

### `public.feature_flags`

- `id`
- `tenant_id`
- `key`
- `enabled`
- `config`
- `created_at`
- `updated_at`

Only enabled flags are exposed through `AppSession.featureFlags`.

## Expected Helper Functions

Current migrations define or align these helpers:

- `public.has_permission(p_tenant_id uuid, p_permission text)`
- `public.has_tenant_role(p_tenant_id uuid, p_role text)`
- `public.is_platform_admin()`
- `public.is_tenant_admin(p_tenant_id uuid)`
- `security.is_platform_admin()`
- `security.is_platform_support()`
- `security.is_tenant_member(p_tenant_id uuid)`
- `security.has_tenant_role(p_tenant_id uuid, p_roles text[])`
- `security.can_manage_tenant(p_tenant_id uuid)`

Frontend session assembly does not call these helpers directly. It reads role
and permission rows through the logged-in Supabase session.

## Roles

### Platform Roles

Stored in `profiles.platform_role`:

- `platform_owner`
- `platform_admin`
- `platform_support`
- `user`

`src/services/session/roles.ts` also recognizes `patient` as an application
role, but the current core profile constraint allows only `platform_owner`,
`platform_admin`, `platform_support`, and `user`.

### Tenant Roles

Stored primarily in `tenant_memberships.role_code`:

- `tenant_owner`
- `clinic_admin`
- `receptionist`
- `physician`
- `nutritionist`
- `fitness_professional`
- `financial_user`
- `patient`
- `guardian`
- `external_professional`

The later RLS alignment constrains legacy `tenant_memberships.role` to tenant
staff roles and does not include `patient` or `guardian` there.

## Permission Codes

Core permissions seeded by migrations include:

- `patients.read`
- `patients.write`
- `agenda.read`
- `agenda.write`
- `encounters.read`
- `encounters.write`
- `soap.read`
- `soap.write`
- `nutrition.read`
- `nutrition.write`
- `prescriptions.read`
- `prescriptions.write`
- `documents.read`
- `documents.write`
- `financial.read`
- `financial.write`
- `packages.read`
- `packages.write`
- `chat.read`
- `chat.write`
- `reports.read`
- `settings.read`
- `settings.write`
- `platform.tenants.read`
- `platform.tenants.write`
- `platform.webhooks.read`
- `platform.audit.read`

App-level computed permissions currently use:

- `canAccessPlatformAdmin`: platform owner/admin/support or explicit platform
  admin access aliases.
- `canAccessClinicWorkspace`: active tenant membership and a non-patient role.
- `canViewFinancial`: `financial.read` or `financial.write`.
- `canViewMedicalPrescriptions`: physician/admin/owner role plus
  `prescriptions.read` or `prescriptions.write`.
- `canManageTenantUsers`: tenant owner/clinic admin role or
  `tenant.users.manage`/`settings.write`.

## Session Assembly Flow

`getCurrentAppSession`:

1. Calls `supabase.auth.getUser()`.
2. Returns `null` for unauthenticated users.
3. Reads `profiles` by auth user ID.
4. Returns `null` when an existing profile has `is_active = false`.
5. Reads all `tenant_memberships` for the auth user.
6. Chooses active tenant from optional `profiles.active_tenant_id` or first
   active membership. `profiles.active_tenant_id` is accepted only when it
   matches an active membership.
7. Resolves permissions through `roles` and `role_permissions`.
8. Reads enabled `feature_flags` for the active tenant.
9. Returns an `AppSession` with computed access helpers.

`getCurrentUserContext` converts computed functions into booleans for server
components.

## Route Guard Flow

- `src/middleware.ts` redirects unauthenticated users away from `/admin`,
  `/clinic`, and `/patient` to `/auth/login`.
- Authenticated users hitting `/` or `/auth/login` are redirected to:
  - `/admin` for platform admin access.
  - `/clinic/dashboard` for active clinic workspace users.
  - `/patient` for patient portal users.
- `/admin` paths require `canAccessPlatformAdmin`.
- `/clinic` paths require clinic workspace access. Middleware redirects
  unauthenticated users to `/auth/login` and users without active tenant
  membership to `/no-workspace`; users with an active membership but no clinic
  workspace access are allowed through so `src/app/clinic/layout.tsx` can render
  the server-side `forbidden` state.
- `src/lib/auth/clinicAccessGuard.ts` returns explicit clinic states:
  `ok`, `unauthenticated`, `no_workspace`, `forbidden`, and `session_error`.
- `src/app/clinic/layout.tsx` applies the guard to all clinic routes and renders
  stable server-side state screens instead of letting pages mount against an
  invalid workspace context.
- `/patient` paths require `isPatient()`.
- `src/app/admin/layout.tsx` also performs a server-side admin guard.
- `PlatformAdminGuard` performs a client-side confirmation through
  `/api/auth/app-session`.

## Profile Flows

### Platform Owner/Admin

- `profiles.platform_role` is `platform_owner` or `platform_admin`.
- May enter `/admin`.
- Does not require a tenant membership for platform admin routing.

### Platform Support

- `profiles.platform_role` is `platform_support`.
- App-level guard allows `/admin`.
- Some RLS helpers treat support separately from admin; support may need
  dedicated backend policies for specific admin screens.

### Clinic Staff

- `profiles.platform_role` is usually `user`.
- Has an active `tenant_memberships` row.
- Uses `tenant_memberships.role_code` for role behavior.
- Enters `/clinic/dashboard`.

### Financial User

- Active tenant membership with `role_code = financial_user`.
- Needs `financial.read` or `financial.write` for financial views.

### Patient Portal

- Current app logic treats only explicit `platform_role = patient` as patient
  portal access.
- Dedicated `patient_accounts` and `guardian_links` rows now have RLS policies
  for reading only the authenticated user's active linkage row.
- `/patient` remains fail-closed because linked patient/guardian users are not
  yet allowed to read clinical/PII data directly and no scoped portal UI contract
  exists yet.

## Mock And Fallback Points

- `src/services/mockSession.ts` still contains role permission helpers used by
  mock-era screens.
- Several frontend services use `NEXT_PUBLIC_USE_MOCK_DATA` for data fallback.
- `getCurrentAppSession` itself does not use mock data; middleware keeps
  protected routes fail-closed and lets clinic `session_error` cases reach the
  server-side clinic guard.
- Authenticated users without platform, clinic, or patient access are routed to
  `/no-workspace`.

## Gaps Found

1. `getCurrentAppSession` previously selected non-existent permission fields
   from `permissions`. The code now selects `permissions.code`, matching the
   migrations.
2. Patient portal access is backed by linkage rows only at the RLS contract
   level. `/patient` intentionally remains fail-closed until scoped portal data
   contracts and UI are implemented.
3. Platform support is allowed through frontend admin guards, while backend RLS
   distinguishes support from platform admin. Admin screens need explicit
   support policy review.
4. `no_workspace` now has a minimal route at `/no-workspace`; clinic routes now
   also expose server-side `forbidden` and `session_error` states through
   `src/app/clinic/layout.tsx`.
5. Session assembly currently ignores query errors for profile, memberships,
   roles, permissions, and feature flags. A future contract should distinguish
   `unauthenticated`, `forbidden`, and `session_error` instead of collapsing
   backend/RLS failures into no access.
6. `profiles.is_active=false` is enforced in app session assembly by returning
   no app session. Remaining hardening should add an explicit disabled-account
   UX if product policy requires it.
7. `NEXT_PUBLIC_USE_MOCK_DATA=true` can still force mock providers in selected
   screens. RBAC smoke checks must run with real backend paths and
   visible error/forbidden states.
8. Build/type-check do not exercise live Supabase RLS or schema contracts. Use
   the diagnostic script, scripted RLS cross-tenant contract, and SQL smoke tests
   in authorized environments.

## Diagnostic Script

`scripts/supabase/check-auth-rbac-contract.mjs` performs read-only table/column
checks when these environment variables are present:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The script does not write data and does not print secret values. If required
environment variables are absent, it exits successfully with a skip message.

Run only in an authorized environment:

```bash
node scripts/supabase/check-auth-rbac-contract.mjs
```

## Related Checks

- `npm run type-check`
- `npm run lint`
- `npm run build`
- `git diff --check`
- `node scripts/supabase/test-rls-cross-tenant-contract.mjs` against authorized
  local or sandbox Supabase
- `node scripts/supabase/test-patient-linkage-contract.mjs` against authorized
  local or sandbox Supabase
- `supabase/tests/core_rbac_smoke_tests.sql` in an authorized Supabase
  environment
