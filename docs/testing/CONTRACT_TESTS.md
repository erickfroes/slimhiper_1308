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

For clinical-flow P0 contract work, update
`docs/CLINICAL_FLOW_CONTRACTS_P0.md` and the affected runbooks before UI or
schema work. Docs-only verification remains `git diff --check`; Supabase
migrations, bootstraps, provider calls, and mutating smokes require explicit
authorization for the exact command and environment.

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
- `scripts/supabase/test-patient360-local-real-smoke.mjs`

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

Local all-tab authenticated smoke:

```bash
node scripts/supabase/test-patient360-local-real-smoke.mjs
```

Required local/sandbox variables:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role JWT>
SUPABASE_BOOTSTRAP_PASSWORD=<local demo password>
```

This script refuses non-local targets unless
`ALLOW_REMOTE_PATIENT360_SMOKE=true`. It seeds deterministic demo data, signs in
staff and forbidden users through the anon key, runs the real summary/timeline
contract with forbidden and cross-tenant checks, and validates the MVP Patient
360 tab contracts for documents, nutrition, reports, consultas, pacotes,
prescricoes, financeiro, chat, and clinical timeline lab events.

## Programs And Packages Contract Checks

Scripted local smoke:

- `scripts/supabase/test-programs-phase6-local-smoke.mjs`

Required local variables:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<local anon or publishable key>
SUPABASE_SERVICE_ROLE_KEY=<local service role JWT>
SUPABASE_BOOTSTRAP_PASSWORD=<local demo password>
```

Run:

```bash
npx supabase migration up --local --include-all
node scripts/supabase/test-programs-phase6-local-smoke.mjs
```

Validated behavior:

1. Core auth and Patient 360 demo seeds are present.
2. `get_clinic_programs()` returns seeded programs for a clinic admin.
3. `get_program_builder_options()` returns active `tenant_professionals` team
   members with profile metadata, validates a clinic admin RBAC user with a
   physician professional profile, and returns check-in template options.
4. `upsert_program_from_builder()` saves a draft and publishes it.
5. `clone_program()` creates a draft clone.
6. `update_program_status()` archives the clone.
7. `enroll_patient_in_program()` creates a real enrollment, initial agenda
   appointment, local pending invoice, required-document task, and generated
   `patient_program_checkins`.
8. The local invoice/task rows reference the enrollment, while external Asaas
   and D4Sign provider calls remain outside the enrollment RPC.
9. `patient-360-summary` exposes package check-ins in the Paciente 360 pacotes
   tab contract.

The script refuses non-local targets unless
`ALLOW_REMOTE_PROGRAMS_SMOKE=true` is set for an approved sandbox.

## Agenda Rooms And Professional Schedule Contract Checks

Manual/local contract for P1:

```bash
npx supabase migration up --local --include-all
```

Validated behavior:

1. `clinic_rooms` and `professional_day_allocations` exist with RLS enabled.
2. `get_agenda_schedule_options()` returns units, active professionals, rooms,
   and allocations for the selected date.
3. `upsert_clinic_room()` creates or updates a tenant-scoped room and writes an
   `agenda.room_upserted` audit event.
4. `upsert_professional_day_allocation()` associates an active
   `tenant_professionals` record with a room and time range for the day.
5. Overlapping allocation for the same professional raises
   `professional_allocation_conflict`.
6. Overlapping allocation for the same room raises `room_allocation_conflict`.
7. `create_agenda_appointment()` and `update_agenda_appointment()` accept
   `professional_profile_id`, `room_id` and `unit_id`, require a covering
   professional allocation when a structured professional is provided, and
   reject appointment conflicts by patient, room or professional.
8. `get_agenda_day_snapshot()` returns persisted `professionalProfileId`,
   `professionalUserId`, `roomId`, `roomCode` and `unitId`; the attendance queue
   mirrors those IDs from the appointment trigger.

## Documents Contract Test

Scripts:

- `scripts/supabase/test-documents-contract.mjs`
- `scripts/supabase/test-documents-phase4-local-smoke.mjs`

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

Local Phase 4 smoke:

```bash
node scripts/supabase/test-documents-phase4-local-smoke.mjs
```

Required local/sandbox variables:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role JWT>
SUPABASE_BOOTSTRAP_PASSWORD=<local demo password>
D4SIGN_WEBHOOK_HMAC_SECRET=<webhook hmac secret>
```

This script refuses non-local targets unless
`ALLOW_REMOTE_DOCUMENTS_PHASE4_SMOKE=true`. It seeds deterministic demo data,
confirms active-template generation and protected variable gating, confirms PDF
storage, confirms patient/guardian released-document read scope, confirms
cross-tenant denial, confirms `document-signed-url`, and posts a local D4Sign
webhook with HMAC to validate idempotency, audit rows, document status, signer
status, and timeline.

Optional real D4Sign sandbox send:

```bash
RUN_D4SIGN_SANDBOX_SEND=true node scripts/supabase/test-documents-phase4-local-smoke.mjs
```

Only enable this after configuring `D4SIGN_TOKEN_API`, `D4SIGN_CRYPT_KEY`,
`D4SIGN_BASE_URL`, and either `D4SIGN_SAFE_UUID` or approved sandbox-only
`D4SIGN_AUTO_DISCOVER_SAFE=true` in the trusted Edge Function environment. The
script does not print provider secrets or signed URLs. If D4Sign returns no
cofres from `GET /safes`, the expected blocked result is
`provider_safe_not_found`.

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

Billing contract scripts may call billing provider Edge Functions and can create
provider-side customers, invoices, preferences, or subscriptions depending on
configuration. Do not run provider-success mode without explicit authorization
for the exact environment.

Strict provider-success mode for an authorized Asaas sandbox:

```bash
REQUIRE_ASAAS_PROVIDER_SUCCESS=true \
TEST_PATIENT_CPF_CNPJ=12345678909 \
node scripts/supabase/test-billing-contract.mjs
```

Use a fresh sandbox/local `TEST_PATIENT_ID` with billing identity seeded before
running strict mode. The script requires customer, invoice, and subscription to
return 200, verifies safe `{ ok, data/error }` envelopes, verifies unauthenticated
requests fail closed, and rejects provider IDs in browser response data.

Strict provider-success mode for authorized Mercado Pago test credentials:

```bash
REQUIRE_MERCADOPAGO_PROVIDER_SUCCESS=true \
node scripts/supabase/test-billing-contract.mjs
```

Mercado Pago uses the regular API host with test credentials, so the script
requires either a sandbox-like base URL, a `TEST-` access token, or the explicit
`ALLOW_MERCADOPAGO_PROVIDER_CONTRACT_NON_SANDBOX=true` override for a separately
approved non-sandbox run.

Local fixture test:

```bash
node scripts/supabase/test-billing-fixtures.mjs
node scripts/supabase/test-billing-reconciliation-local-smoke.mjs
```

This fixture test validates Asaas and Mercado Pago event-to-status mapping,
idempotency hash strategy, Mercado Pago webhook HMAC signature handling, tenant
resolution expectations, duplicated payload behavior, and invalid token/signature
handling without calling external providers. The reconciliation smoke seeds
deterministic local divergence scenarios, calls
`get_clinic_finance_reconciliation()`, checks safe summary/divergence/event
envelopes, and confirms unauthenticated access fails closed.

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
