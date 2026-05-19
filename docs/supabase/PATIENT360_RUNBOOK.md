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

## Contract Checks

Patient 360 can be validated with:

- `supabase/tests/patient360_contract_checks.md` as a manual checklist.
- `scripts/supabase/test-patient360-contract.mjs` as scripted smoke checks.

See [../testing/CONTRACT_TESTS.md](../testing/CONTRACT_TESTS.md) for the full
contract-test workflow.

## What Is Validated

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

The scripted checks may report additional skipped/optional checks when optional
environment variables are missing.

## Required Environment Variables

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
TOKEN_WITH_PATIENTS_READ=<jwt-of-tenant-a-user-with-patients.read>
PATIENT_ID_TENANT_A=<tenant-a-patient-id>
```

Optional:

```bash
TOKEN_WITHOUT_PATIENTS_READ=<jwt-of-user-without-patients.read>
TOKEN_TENANT_B=<jwt-of-tenant-b-user>
PATIENT_ID_TENANT_B=<tenant-b-patient-id>
```

## End-To-End Setup

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

5. Obtain a test access token (`TOKEN_WITH_PATIENTS_READ`) for a seeded user.

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

6. Run the Patient 360 contract script:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co TOKEN_WITH_PATIENTS_READ=<access_token> PATIENT_ID_TENANT_A=<tenant-a-patient-id> node scripts/supabase/test-patient360-contract.mjs
```

If optional vars are not provided, optional checks are reported as skipped.

## Baseline Checkpoint

Before continuing implementation work for D4Sign or storage integration, ensure
this repository baseline is green by running:

- `npm run type-check`
- `npm run build`
- `supabase db push`
- `node scripts/supabase/bootstrap-core-auth.mjs`
- `node scripts/supabase/bootstrap-patient360-demo.mjs`
- `node scripts/supabase/bootstrap-document-templates-demo.mjs`
- `node scripts/supabase/test-patient360-contract.mjs`

Recommended checkpoint label:

- `baseline-patient360-contract-green`

Only run Supabase and contract commands when explicitly authorized for the
target environment.
