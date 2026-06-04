# Paciente 360 API contract checks (manual + script-assisted)

This checklist validates response contracts and access-control rules for:

- `patient-360-summary`
- `patient-timeline`

Use together with `scripts/supabase/test-patient360-contract.mjs` for quick automated assertions.

---

## Preconditions

1. Migrations applied (`supabase db push`).
2. Demo/bootstrap users and clinical data seeded:
   - `node scripts/supabase/bootstrap-core-auth.mjs`
   - `node scripts/supabase/bootstrap-patient360-demo.mjs`
3. You have valid JWT access tokens for at least:
   - A user with `patients.read` in tenant A.
   - A user without `patients.read`.
   - A tenant B user.
4. You know:
   - One `patient_id` from tenant A.
   - One `patient_id` from tenant B.

---

## Contract and security checks

The script covers all checks below.

1. `patient-360-summary` returns `{ ok:true, data, meta }`.
2. `data.profile.name` exists.
3. `data.profile.id` exists.
4. `data.profile.tenantId` is omitted, `birthDate` is blank, and CPF/phone/email are blank or masked.
5. `data.activePackage.status` exists.
6. `data.clinicalStatus.currentWeightKg` exists **or** safe fallback exists (`clinicalStatus.latestSoap` or `clinicalStatus.lastUpdatedAt`).
7. `data.financial.status` exists.
8. `data.upcomingAppointments` is an array.
9. `data.recentTimeline` is an array.
10. `patient-timeline` returns `{ ok:true, data:{ events, page, page_size, total }, meta }`.
11. Timeline `category` filter does not error (example: `category='clinical'`).
12. User without `patients.read` receives 403.
13. Tenant A user cannot fetch tenant B patient (expect non-200; typically 404).

---

## Manual API examples

### patient-360-summary

```bash
curl -sS "$SUPABASE_URL/functions/v1/patient-360-summary" \
  -H "Authorization: Bearer $TOKEN_WITH_PATIENTS_READ" \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"'$PATIENT_ID_TENANT_A'"}'
```

### patient-timeline

```bash
curl -sS "$SUPABASE_URL/functions/v1/patient-timeline" \
  -H "Authorization: Bearer $TOKEN_WITH_PATIENTS_READ" \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"'$PATIENT_ID_TENANT_A'","category":"clinical","page":1,"page_size":10}'
```

---

## Script usage

Run `node scripts/supabase/test-patient360-contract.mjs` after setting env vars described in the script header.
