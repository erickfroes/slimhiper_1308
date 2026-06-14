# Programs And Packages Runbook

Operational notes for the MVP local programs/packages contract.

## Scope

Phase 6 covers clinic-side program templates, builder persistence, publish,
archive, clone, patient enrollment, and generated journey check-ins visible in
Patient 360. Enrollment also creates local operational reflections for agenda,
billing, and required-document follow-up without calling external providers.

The patient portal remains fail-closed. CRM and inventory package automations
remain post-MVP.

## Schema And RPCs

Migration:

- `supabase/migrations/20260531180000_140_programs_builder_contract.sql`
- `supabase/migrations/20260531181000_141_program_checkin_template_fk_fix.sql`
- `supabase/migrations/20260531182000_142_program_enrollment_operational_reflections.sql`
- `supabase/migrations/20260614100000_450_program_builder_professionals_contract.sql`

Tables added or extended:

- `programs.checkins_total`, `programs.checkin_frequency`,
  `programs.financial_config`
- `program_team_members`
- `patient_program_checkins`

RPCs:

- `get_clinic_programs()`: read program list, phases, services, app
  entitlements, required documents, check-in templates, team and active patient
  counts. Requires `packages.read`.
- `get_program_builder_options()`: read active clinical professionals from
  `tenant_professionals`, with legacy role fallback only when no professional
  profiles exist, plus reusable check-in templates. Requires `packages.read`
  for the caller; returned professionals do not need `packages.read`.
- `upsert_program_from_builder(p_draft, p_publish)`: transactional builder
  save/publish. Requires `packages.write`.
- `update_program_status(p_program_id, p_status)`: publish/archive/draft status
  transition. Requires `packages.write`.
- `clone_program(p_program_id)`: clone to draft with child rows. Requires
  `packages.write`.
- `enroll_patient_in_program(p_patient_id, p_program_id, p_start_date)`: create
  enrollment, derive service totals, create an initial appointment, create a
  local pending invoice when the program has price, create required-document
  tasks, generate check-ins and write timeline. Requires `packages.write`,
  `agenda.write`, `financial.write` when there is a charge, and
  `patients.write` when required-document tasks are needed.

## Frontend Contracts

- `src/services/programsApi.ts` is the clinic service facade.
- `src/app/clinic/programs/components/ProgramsContent.tsx` loads only through
  `programsApi` unless `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- `src/app/clinic/programs/builder/components/ProgramBuilderContent.tsx`
  persists drafts/publications through `upsert_program_from_builder`.
- `src/app/paciente-360/components/tabs/TabPacotes.tsx` displays check-ins
  returned by `patient-360-summary`.

Production paths must show backend/RLS errors instead of silently replacing
them with mock success.

Builder team options now return `professionalProfileId`, `professionalType`,
license, unit, status, role code and source metadata. The `id` field remains
the `profiles.id` value because `program_team_members.profile_id` is still the
saved relation.

## Local Smoke

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
node scripts/supabase/test-patient360-local-real-smoke.mjs
npm run type-check
npm run lint
npm run build
git diff --check
```

`test-programs-phase6-local-smoke.mjs` refuses non-local targets unless
`ALLOW_REMOTE_PROGRAMS_SMOKE=true` is set for an approved sandbox.

## Known Limits

- Inline custom check-in question editing is disabled until an audited editor is
  implemented.
- Enrollment currently generates local scheduled check-ins; patient submission
  UX and portal-scoped RLS are post-MVP.
- Enrollment creates local invoice and required-document task rows only. Asaas
  provider calls remain gated by billing Edge Functions, and D4Sign/document PDF
  generation remains gated by the documents module.

## Clinical Flow P0 Alignment

See [../CLINICAL_FLOW_CONTRACTS_P0.md](../CLINICAL_FLOW_CONTRACTS_P0.md) for
the agenda/finance/Paciente 360 integration contract before new UI work.

Program enrollment already creates local operational reflections: enrollment,
initial appointment, local pending invoice when priced, required-document tasks,
check-ins, audit, and timeline. Agenda-originated program, package, or service
selection should reuse the same local-reflection pattern and write stable IDs
for `appointment`, `program`, `enrollment`, `package`, `service`, `invoice`, and
`payment` before Patient 360 or finance screens consume the data.

Provider calls remain outside this automatic flow. A program/package/service
selected in agenda may create local billing context, but Asaas and D4Sign calls
must continue to go through their dedicated gated functions after explicit
authorization and permission checks.
