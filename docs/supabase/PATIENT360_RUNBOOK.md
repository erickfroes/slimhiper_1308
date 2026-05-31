# Patient 360 Runbook

Patient 360 combines clinical schema, Edge Functions, frontend service facades,
and UI tabs under the clinic patient detail experience.

## Demo Data Bootstrap

Run only after authorized migrations and core auth bootstrap:

```bash
node scripts/supabase/bootstrap-patient360-demo.mjs
```

This script seeds development-safe Patient 360 clinical data for tenant
`demo-clinic`, including Juliana Pereira demo records across:

- patients
- appointments
- encounters
- SOAP notes
- measurements
- bioimpedance
- labs
- prescriptions placeholder
- alerts
- tasks
- timeline events

Do not run this against a production or sensitive environment.

Optional cross-tenant smoke seed:

```bash
node scripts/supabase/bootstrap-cross-tenant-demo.mjs
```

This creates a second demo tenant and deterministic tenant B patient ID for
negative access tests. It does not create a tenant B user.

## Contract Checks

Patient 360 can be validated with:

- `supabase/tests/patient360_contract_checks.md` as a manual checklist.
- `scripts/supabase/test-patient360-contract.mjs` as scripted smoke checks.
- `scripts/supabase/test-clinical-core-contract.mjs` as the local mutating
  clinical core smoke for patients, agenda, encounter/SOAP, measurements,
  bioimpedance, labs, timeline, and audit rows.
- `tests/fixtures/patient360-summary.fixture.json` as the local, non-Supabase
  contract fixture.

See [../testing/CONTRACT_TESTS.md](../testing/CONTRACT_TESTS.md) for the full
contract-test workflow.

Run local fixture validation any time, without secrets or Supabase access:

```bash
node scripts/supabase/test-patient360-contract.mjs --mode=fixture
```

Run real Supabase validation only after explicit authorization for the target
environment:

```bash
node scripts/supabase/test-patient360-contract.mjs --mode=real
```

Real mode fails fast when required env vars are missing. Fixture mode does not
read tokens, does not call Edge Functions, and does not write data.

Run the local clinical core smoke only against local Supabase or an approved
sandbox:

```bash
node scripts/supabase/test-clinical-core-contract.mjs
```

The script refuses non-local targets unless
`ALLOW_REMOTE_CLINICAL_CORE_SMOKE=true`, creates a temporary tenant/patient
dataset, validates appointment queue events, encounter/SOAP, measurements,
bioimpedance, lab orders/results, timeline and audit rows, then deletes the
temporary tenant during cleanup.

2026-05-31 local validation: real mode passed against the local Supabase stack
with a staff token after running local migrations and demo bootstraps. Optional
forbidden and cross-tenant real checks were skipped because the corresponding
negative token / tenant B patient id were not provided in that pass. The
clinical core smoke also passed locally after Phase 2 completion, including
patient CRUD contracts, appointment queue events, SOAP, measurements,
bioimpedance, labs, timeline, and audit rows.

## What Is Validated

1. `patient-360-summary` returns `{ ok:true, data, meta }`.
2. `data.profile` matches the frontend `PatientProfile` shape.
3. `data.activePackage` uses valid `ProgramType` and `PackageStatus` values.
4. `data.clinicalStatus` numeric KPIs and history arrays exist.
5. `data.financial` uses valid `FinancialStatus` and numeric totals.
6. `data.alerts`, `data.tasks`, `data.upcomingAppointments`,
   `data.recentTimeline`, `data.documents`, and `data.prescriptions` are arrays
   with frontend-compatible item shapes.
7. `data.nutritionPlan` and `data.chat` provide safe fallback values.
8. `patient-timeline` returns `{ ok:true, data:{events,page,page_size,total}, meta }`.
9. `category` filter returns only matching category events when events exist.
10. User without `patients.read` receives 403 when the optional token is
    provided in real mode.
11. Tenant A user cannot fetch tenant B patient when a tenant B patient id is
    provided in real mode.

The scripted checks may report additional skipped/optional checks when optional
environment variables are missing.

## Frontend And Edge Function Contract

The frontend service in `src/services/patient360Api.ts` calls:

- `patient-360-summary` with `{ patient_id }`.
- `patient-timeline` with `{ patient_id, category, page, page_size, date_start, date_end }`.

Additional Patient 360 tab services call:

- `patient-nutrition-plan` with `{ patient_id }`, backed by
  `nutrition_plans` and `nutrition_plan_notes` from migration
  `20260531112000_080_patient360_nutrition_contracts.sql`.
- `patient-reports` with `{ patient_id }`, backed by active
  `report_definitions`.

Both Edge Functions return an envelope:

```json
{ "ok": true, "data": {}, "meta": {} }
```

The frontend unwraps this envelope and normalizes the `data` payload into
`Patient360Summary` and `PatientTimelineEvent[]`.

Known normalization points:

- `patient-360-summary` currently returns `mainUnit`,
  `responsibleProfessional`, and `clinicalRisk` as `null` when unavailable. The
  frontend contract treats them as optional fields and drops non-string values.
- `patient-timeline` returns paginated data as
  `{ events, page, page_size, total }`; the frontend reads `events` and then
  applies local filters.
- `recentTimeline` inside the summary is an array, while the timeline endpoint
  returns a paginated object.
- `metadata` is optional. The summary function sanitizes payload keys; the
  timeline function includes payload only when `timeline.sensitive.read` is
  granted.
- `nutritionPlan` is loaded from `nutrition_plans` only when the session has
  `nutrition.read`; otherwise it returns a safe inactive plan with empty arrays.
  Meal photos are not exposed by the current Edge contract because they need a
  storage/signed URL design before patient-submitted media can be shown.
- `patient-reports` returns report definitions only. Report execution/export is
  intentionally disabled in the Patient 360 UI until a separate report-run Edge
  Function/RPC exists.

## Required Environment Variables

Only real mode requires env vars:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
TOKEN_WITH_PATIENTS_READ=<jwt-of-tenant-a-user-with-patients.read>
PATIENT_ID_TENANT_A=<tenant-a-patient-id>
```

Optional:

```bash
TOKEN_WITHOUT_PATIENTS_READ=<jwt-of-user-without-patients.read>
PATIENT_ID_TENANT_B=<tenant-b-patient-id>
```

## End-To-End Setup

Run these commands only for an authorized development or staging environment.

1. Run migrations:

```bash
supabase db push
```

2. Bootstrap core auth and tenant RBAC seed:

```bash
node scripts/supabase/bootstrap-core-auth.mjs
```

3. Bootstrap Patient 360 demo records:

```bash
node scripts/supabase/bootstrap-patient360-demo.mjs
```

4. Bootstrap document templates demo records:

```bash
node scripts/supabase/bootstrap-document-templates-demo.mjs
```

5. Bootstrap billing demo records:

```bash
node scripts/supabase/bootstrap-billing-demo.mjs
```

6. Optional: seed a tenant B patient for cross-tenant negative checks:

```bash
node scripts/supabase/bootstrap-cross-tenant-demo.mjs
```

7. Obtain a test access token (`TOKEN_WITH_PATIENTS_READ`) for a seeded user.

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

8. Run the Patient 360 contract script:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co TOKEN_WITH_PATIENTS_READ=<access_token> PATIENT_ID_TENANT_A=<tenant-a-patient-id> node scripts/supabase/test-patient360-contract.mjs --mode=real
```

If optional vars are not provided, optional checks are reported as skipped.

## Baseline Checkpoint

Before continuing implementation work for D4Sign or storage integration, ensure
this repository baseline is green by running:

- `npm run type-check`
- `npm run build`
- `node scripts/supabase/test-patient360-contract.mjs --mode=fixture`
- `supabase db push` only when explicitly authorized for the target environment.
- `node scripts/supabase/bootstrap-core-auth.mjs` only when explicitly
  authorized.
- `node scripts/supabase/bootstrap-patient360-demo.mjs` only when explicitly
  authorized.
- `node scripts/supabase/bootstrap-document-templates-demo.mjs` only when
  explicitly authorized.
- `node scripts/supabase/bootstrap-billing-demo.mjs` only when explicitly
  authorized.
- `node scripts/supabase/bootstrap-cross-tenant-demo.mjs` only when explicitly
  authorized.
- `node scripts/supabase/test-patient360-contract.mjs --mode=real` only when
  explicitly authorized.

Recommended checkpoint label:

- `baseline-patient360-contract-green`

Only run Supabase and contract commands when explicitly authorized for the
target environment.
