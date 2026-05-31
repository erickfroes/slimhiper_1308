# Contract And Smoke Tests

This document collects the manual and scripted checks that were previously
listed in the root README.

Do not run scripts that require tokens, provider credentials, service-role
credentials, or Supabase mutations unless the task explicitly authorizes that
operation.

## Clean Schema Setup Order

For a new empty Supabase project, apply and seed in this order only after
explicit authorization:

```bash
supabase db push
node scripts/supabase/bootstrap-core-auth.mjs
node scripts/supabase/bootstrap-patient360-demo.mjs
node scripts/supabase/bootstrap-document-templates-demo.mjs
node scripts/supabase/bootstrap-billing-demo.mjs
```

Optional cross-tenant negative smoke seed:

```bash
node scripts/supabase/bootstrap-cross-tenant-demo.mjs
```

Run provider sandbox/real scripts only after the fixture contracts pass and the
target environment is explicitly approved.

## Local App Checks

For ordinary code changes:

```bash
git diff --check
npm run type-check
npm run build
```

For lint-related or frontend changes:

```bash
npm run lint
```

`npm run lint` uses ESLint CLI over `src/**/*.{ts,tsx}`. It does not depend on
`next lint`.

For documentation-only changes:

```bash
git diff --check
```

## Core RBAC Smoke Tests

Manual SQL checklist:

- `supabase/tests/core_rbac_smoke_tests.sql`
- `supabase/tests/rls_cross_tenant_smoke_tests.sql`

Scripted local RLS smoke:

- `scripts/supabase/test-rls-cross-tenant-contract.mjs`
- `scripts/supabase/test-patient-linkage-contract.mjs`

Prerequisites:

```bash
supabase db push
node scripts/supabase/bootstrap-core-auth.mjs
```

For the scripted local smoke, use an authorized local Supabase stack with
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
`SUPABASE_BOOTSTRAP_PASSWORD` available:

```bash
node scripts/supabase/test-rls-cross-tenant-contract.mjs
node scripts/supabase/test-patient-linkage-contract.mjs
```

The scripted smoke seeds demo tenant A/B users and records no secrets. It
refuses mutating runs outside localhost unless `ALLOW_REMOTE_RLS_SMOKE=true` is
set for an approved sandbox. It verifies tenant isolation for patients, PII,
generated documents, patient invoices, chat threads/messages, report
definitions, and a cross-tenant patient update attempt.

The patient linkage smoke seeds demo `patient_accounts` and `guardian_links`,
confirms linked patients/guardians can read only their own active linkage rows,
confirms cross-patient linkage reads return 0 rows, and confirms linked
patient/guardian users still cannot read `patients` directly while the portal
remains fail-closed.

## Clinical Core Contract Checks

Scripted local smoke:

- `scripts/supabase/test-clinical-core-contract.mjs`

Use only against authorized local Supabase unless an approved sandbox explicitly
sets `ALLOW_REMOTE_CLINICAL_CORE_SMOKE=true`.

Required environment variables:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local service role JWT>
```

Run:

```bash
node scripts/supabase/test-clinical-core-contract.mjs
```

Validated behavior:

1. Creates a temporary tenant, patient, and `patient_pii` record.
2. Creates an appointment and writes valid queue transition events.
3. Creates encounter and final SOAP records.
4. Creates measurements, bioimpedance, lab order and lab result records.
5. Writes clinical timeline and audit records.
6. Asserts persisted row counts and deletes the temporary tenant in cleanup.

For the manual SQL checklist:

1. Open Supabase Dashboard -> SQL Editor.
2. Open or copy `supabase/tests/core_rbac_smoke_tests.sql`.
3. Replace placeholder IDs (`USER_*_UUID`, `TENANT_*_UUID`) with values from
   your own seeded environment.
4. Run each numbered block and verify expected result comments.

## Patient 360 Contract Checks

Manual checklist:

- `supabase/tests/patient360_contract_checks.md`

Scripted smoke checks:

- `scripts/supabase/test-patient360-contract.mjs`

Local fixture mode does not require Supabase credentials:

```bash
node scripts/supabase/test-patient360-contract.mjs --mode=fixture
```

Validated behavior:

1. `patient-360-summary` returns `{ ok:true, data, meta }`.
2. `data.profile.name` exists.
3. `data.profile.id` exists.
4. `data.activePackage.status` exists.
5. `data.clinicalStatus.currentWeightKg` or safe fallback exists.
6. `data.financial.status` exists.
7. `data.upcomingAppointments` is an array.
8. `data.recentTimeline` is an array.
9. `patient-timeline` returns `{ ok:true, data:{events,page,page_size,total}, meta }`.
10. `category` filter does not error.
11. User without `patients.read` receives 403.
12. Tenant A user cannot fetch tenant B patient.

Required environment variables:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
TOKEN_WITH_PATIENTS_READ=<jwt-of-tenant-a-user-with-patients.read>
PATIENT_ID_TENANT_A=<tenant-a-patient-id>
```

Optional environment variables:

```bash
TOKEN_WITHOUT_PATIENTS_READ=<jwt-of-user-without-patients.read>
TOKEN_TENANT_B=<jwt-of-tenant-b-user>
PATIENT_ID_TENANT_B=<tenant-b-patient-id>
```

End-to-end setup:

```bash
supabase db push
node scripts/supabase/bootstrap-core-auth.mjs
node scripts/supabase/bootstrap-patient360-demo.mjs
node scripts/supabase/bootstrap-document-templates-demo.mjs
node scripts/supabase/bootstrap-billing-demo.mjs
# Optional negative cross-tenant smoke data:
node scripts/supabase/bootstrap-cross-tenant-demo.mjs
```

Obtain a test access token (`TOKEN_WITH_PATIENTS_READ`) for a seeded user.

Example using Supabase Auth password sign-in API:

```bash
export SUPABASE_URL=https://<project-ref>.supabase.co
export SUPABASE_PUBLISHABLE_KEY=<your-publishable-or-anon-key>

curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"clinic.admin@example.com","password":"<bootstrap-password>"}'
```

From the JSON response, copy `access_token`.

Run:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co TOKEN_WITH_PATIENTS_READ=<access_token> PATIENT_ID_TENANT_A=<tenant-a-patient-id> node scripts/supabase/test-patient360-contract.mjs
```

If optional vars are not provided, optional checks are reported as skipped.

## Documents Contract Test

Script:

- `scripts/supabase/test-documents-contract.mjs`

Typical setup:

```bash
supabase db push
node scripts/supabase/bootstrap-core-auth.mjs
node scripts/supabase/bootstrap-patient360-demo.mjs
node scripts/supabase/bootstrap-document-templates-demo.mjs
```

Required test environment variables include:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-or-publishable-key>
TEST_ACCESS_TOKEN=<jwt-for-authorized-user>
TEST_PATIENT_ID=<patient-id>
TEST_TEMPLATE_ID=<document-template-id>
```

Run:

```bash
node scripts/supabase/test-documents-contract.mjs
```

Only run when authorized. The script may generate documents, request signed
URLs, and invoke D4Sign-related functions.

## D4Sign Fixture Test

Local fixture test:

```bash
node scripts/supabase/test-d4sign-fixtures.mjs
```

This test validates payload shape, status mapping, idempotency hash strategy,
and fail-closed invalid fixture behavior without calling D4Sign.

## Billing Contract Test

Scripts:

- `scripts/supabase/bootstrap-billing-demo.mjs`
- `scripts/supabase/test-billing-contract.mjs`

Run only when authorized:

```bash
node scripts/supabase/bootstrap-billing-demo.mjs
node scripts/supabase/test-billing-contract.mjs
```

Billing contract scripts may call Asaas-related functions and can create
provider-side customers, invoices, or subscriptions depending on configuration.

Local fixture test:

```bash
node scripts/supabase/test-billing-fixtures.mjs
```

This fixture test validates event-to-status mapping, idempotency hash strategy,
tenant resolution expectations, duplicated payload behavior, and invalid token
handling without calling Asaas.

## CI Workflows

- `.github/workflows/ci.yml`: automatic baseline on pull requests and `main`
  pushes using `npm ci`, `git diff --check`, type-check, lint, build, and
  fixture-only Patient 360, D4Sign, and Billing checks. It uses safe public
  placeholder Supabase values only for static build compilation; it does not use
  service-role credentials or provider secrets.
- `.github/workflows/contract-fixtures.yml`: manual fixture-only contract checks
  with no provider secrets.

## Recommended Patient 360 Baseline Label

- `baseline-patient360-contract-green`
