# Baseline Checks

Local baseline captured before new feature work. This document records commands,
results, pending items, and environment details for the current repository state.

## Latest Implementation Validation

- Date: 2026-05-31 15:09 -03:00.
- Branch: `test/asaas-billing-contract-hardening`.
- Commit base: `bb190f1`.
- Touched paths in this pass: `src/app/clinic/documents/page.tsx`,
  `src/app/clinic/documents/components/ClinicDocumentsContent.tsx`,
  `src/services/clinicDocumentsApi.ts`, `src/services/documentsApi.ts`,
  `supabase/functions/generate-document/index.ts`,
  `supabase/functions/document-signed-url/index.ts`,
  `supabase/functions/d4sign-send-document/index.ts`,
  `supabase/migrations/20260531152000_120_patient_document_read_scope.sql`,
  `supabase/config.toml`, `scripts/supabase/test-documents-phase4-local-smoke.mjs`,
  `scripts/supabase/bootstrap-document-templates-demo.mjs`, `.env.example`,
  and document/runbook updates.
- Phase 4 result: document workflows are complete for MVP local evidence except
  the real D4Sign sandbox send. The clinic documents page now uses real data,
  generates PDFs through `generate-document`, limits custom variables to
  template-owned non-protected keys, releases/withdraws patient access, requests
  short-lived signed URLs, and shows a pending/failed document monitor.
- Local migration applied: `npx supabase migration up --local --include-all`
  applied `20260531152000_120_patient_document_read_scope.sql`.
- Local documents smoke passed:
  `node scripts/supabase/test-documents-phase4-local-smoke.mjs`. It re-ran core
  auth, Patient 360, cross-tenant, and document-template bootstraps locally,
  confirmed protected variable overrides fail closed, generated PDF documents,
  confirmed patient and guardian released-document RLS, confirmed cross-tenant
  denial, confirmed `document-signed-url` for patient/guardian, and confirmed
  D4Sign webhook HMAC/idempotency/audit/timeline.
- Supabase Edge runtime was restarted locally with `[edge_runtime.secrets]`
  mapping in `supabase/config.toml`. `supabase/functions/.env` was rewritten as
  UTF-8 without BOM; no secret values were printed. Docker/Supabase containers
  returned healthy/running states after restart.
- `npm run type-check`: passed.
- `npm run lint`: passed with the same 24 warnings already tracked in unrelated
  files.
- `npm run build`: passed; Next generated 26 app routes including
  `/clinic/documents`.
- Local fixture contracts passed:
  `node scripts/supabase/test-patient360-contract.mjs --mode=fixture`,
  `node scripts/supabase/test-d4sign-fixtures.mjs`, and
  `node scripts/supabase/test-billing-fixtures.mjs`.
- `git diff --check`: passed with CRLF conversion warnings only.
- Local HTTP smoke with the existing dev server on port `4028`: `/auth/login`
  returned 200; `/clinic/documents` returned 307 to `/auth/login` without an
  authenticated session.
- Skipped/blocked: real D4Sign sandbox send was not run because
  `D4SIGN_SAFE_UUID` is absent; `RUN_D4SIGN_SANDBOX_SEND=true` is available in
  the local smoke once the safe/cofre UUID is configured. Authenticated visual
  Browser traversal was not available in this pass; local Edge/RLS smoke covers
  the data contract and HTTP smoke covers fail-closed routing.
- Residual risks: real provider send must be tested in D4Sign sandbox with
  `D4SIGN_SAFE_UUID`, and broad authenticated browser smoke should still verify
  the new documents UI before release.

## Previous Implementation Validation - Phase 3

- Date: 2026-05-31 14:35 -03:00.
- Branch: `test/asaas-billing-contract-hardening`.
- Commit base: `bb190f1`.
- Touched paths in this pass: `src/services/patient360Api.ts`,
  `src/services/documentsApi.ts`, `src/services/nutritionApi.ts`,
  `src/services/chatApi.ts`, `src/services/agendaApi.ts`,
  `src/services/billingApi.ts`,
  `supabase/functions/patient-360-summary/index.ts`,
  `supabase/functions/patient-timeline/index.ts`,
  `scripts/supabase/test-patient360-local-real-smoke.mjs`,
  `docs/PROJECT_COMPLETION_CHECKPOINTS.md`,
  `docs/testing/BASELINE_CHECKS.md`,
  `docs/testing/CONTRACT_TESTS.md`, and
  `docs/supabase/PATIENT360_RUNBOOK.md`.
- Phase 3 result: Patient 360 is complete for MVP local evidence. Edge
  Functions now preserve `exame_solicitado` and
  `exame_resultado_recebido`; Patient 360-related services load mock data only
  inside the explicit `NEXT_PUBLIC_USE_MOCK_DATA=true` branch; production paths
  remain Edge/RLS/RPC based.
- Local real Patient 360 smoke passed:
  `node scripts/supabase/test-patient360-local-real-smoke.mjs`. It re-ran core
  auth, Patient 360 demo, and tenant B bootstraps locally, signed in a real
  staff user plus a user without `patients.read`, ran
  `test-patient360-contract.mjs --mode=real`, confirmed forbidden 403 and
  cross-tenant status 404, and validated documents, nutrition, reports,
  consultas, pacotes, prescricoes, financeiro, chat, and new timeline event
  types through Edge Functions, RLS, and RPC.
- `npm run type-check`: passed.
- `npm run lint`: passed with the same 24 warnings already tracked in unrelated
  files.
- `npm run build`: passed; Next generated 26 app routes.
- Local fixture contracts passed:
  `node scripts/supabase/test-patient360-contract.mjs --mode=fixture`,
  `node scripts/supabase/test-d4sign-fixtures.mjs`, and
  `node scripts/supabase/test-billing-fixtures.mjs`.
- Local HTTP smoke with the existing dev server on port `4028`: `/auth/login`
  returned 200; Patient 360 deep-links for `timeline`, `documentos`,
  `financeiro`, `nutricao`, `chat`, and `relatorios` returned 307 to
  `/auth/login` without an authenticated session.
- Skipped/blocked: visual authenticated Browser tab traversal was not rerun in
  this pass; the local-real script covers authenticated data contracts for all
  Patient 360 MVP tabs, and anonymous HTTP smoke covers fail-closed routing.
  Asaas/D4Sign provider sandbox calls were not needed for Phase 3.
- Residual risks: broad authenticated visual smoke for all Patient 360 tabs
  remains a release gate, alongside the existing lint warning cleanup and
  dependency audit follow-ups.

## Previous Implementation Validation - Phase 2

- Date: 2026-05-31 14:18 -03:00.
- Branch: `test/asaas-billing-contract-hardening`.
- Commit base: `bb190f1`.
- Touched paths in this pass: `src/services/patientsApi.ts`,
  `src/app/patient-list/components/PatientListContent.tsx`,
  `src/services/dashboardApi.ts`, `src/services/agendaApi.ts`,
  `src/app/clinic/agenda/components/AgendaContent.tsx`,
  `src/services/encounterApi.ts`, `src/services/clinicalRecordsApi.ts`,
  `src/app/clinic/patients/[patientId]/encounter/page.tsx`,
  `src/domain/types.ts`,
  `src/app/paciente-360/components/tabs/TabTimeline.tsx`,
  `scripts/supabase/test-clinical-core-contract.mjs`,
  `scripts/supabase/test-patient360-contract.mjs`,
  `docs/PROJECT_COMPLETION_CHECKPOINTS.md`,
  `docs/testing/BASELINE_CHECKS.md`,
  `docs/testing/CONTRACT_TESTS.md`, and
  `docs/supabase/PATIENT360_RUNBOOK.md`.
- Phase 2 result: core clinical MVP local completed. Patients now have
  service/UI create/edit with PII in `patient_pii`, paginated/filtered list
  contracts, and masked list phone. Dashboard KPIs use real program enrollment
  and chat unread data. Agenda now creates, edits, cancels, and transitions
  appointments with valid `queue_events.status`. Encounter/SOAP validates final
  SOAP and creates measurements, bioimpedance, lab orders/results, audit logs
  and clinical timeline events.
- `npm run type-check`: passed.
- `npm run lint`: passed with the same 24 warnings already tracked in unrelated
  files.
- `npm run build`: passed; Next generated 26 app routes.
- `git diff --check`: passed with CRLF conversion warnings only.
- Local fixture contracts passed:
  `node scripts/supabase/test-patient360-contract.mjs --mode=fixture`,
  `node scripts/supabase/test-d4sign-fixtures.mjs`, and
  `node scripts/supabase/test-billing-fixtures.mjs`.
- Local mutating clinical core smoke passed:
  `node scripts/supabase/test-clinical-core-contract.mjs`. It refuses non-local
  targets unless `ALLOW_REMOTE_CLINICAL_CORE_SMOKE=true`, created a temporary
  tenant/patient/appointment/queue/encounter/SOAP/measurements/bio/labs/timeline/audit
  dataset, asserted persistence, and deleted the tenant at cleanup.
- Local HTTP smoke with `npm run dev` on port `4028`: `/auth/login` returned
  200; `/clinic/dashboard`, `/clinic/patients`, `/clinic/agenda`, and
  `/clinic/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/encounter` returned
  307 to `/auth/login` without an authenticated session.
- Skipped/blocked: in-app Browser authenticated interaction for the new patient
  and agenda/encounter modals was not available in this tool turn; HTTP smoke
  covered fail-closed routing and build covered route compilation. Supabase
  remote `db push` was not run in this phase. Asaas/D4Sign sandbox provider
  calls were not needed for Phase 2.
- Residual risks: authenticated browser smoke should still exercise the new
  patient, agenda, and encounter clinical-record forms before release; timezone
  remains local-operator based for MVP and needs tenant/unit/professional
  calendar schema before production scheduling scale.

## Previous Implementation Validation

- Date: 2026-05-31 14:00 -03:00.
- Branch: `test/asaas-billing-contract-hardening`.
- Commit base: `bb190f1`.
- Touched paths: dashboard empty states and quick actions, agenda/fila visible
  status transitions, patient list fake-action hardening, encounter/SOAP
  mock-side-panel removal, Patient 360 document signature gating, Patient 360
  tab deep-links, Patient 360 reports service facade, Patient 360 financial tab
  validation/loading/error hardening, Patient 360 Edge Function contract
  hardening in `src/services/patient360Api.ts`, Patient 360 sensitive-tab
  forbidden rendering in `src/app/paciente-360/components/Patient360Tabs.tsx`,
  Patient 360 tab loading/error/retry hardening in `TabTimeline`,
  `TabDocumentos`, `TabRelatorios`, and `TabFinanceiro`,
  Patient 360 chat real-service hardening in `src/services/chatApi.ts`,
  `src/app/paciente-360/components/tabs/TabChat.tsx`, and
  `supabase/functions/patient-360-summary/index.ts`,
  Patient 360 appointment/package/prescription hardening in
  `src/services/agendaApi.ts`, `src/components/PackageProgressCard.tsx`,
  `src/app/paciente-360/components/tabs/TabConsultas.tsx`, `TabPacotes`,
  `TabNutricao`, and `TabPrescricoes`,
  Patient 360 document signer hardening in `TabDocumentos`,
  `src/services/documentsApi.ts`, `src/domain/types.ts`,
  `supabase/functions/patient-documents`, `supabase/functions/d4sign-send-document`,
  `scripts/supabase/test-documents-contract.mjs`, clinic documents placeholder
  action gating, Patient 360 nutrition/report contracts in
  `src/services/nutritionApi.ts`, `src/services/reportsApi.ts`,
  `supabase/functions/patient-nutrition-plan`,
  `supabase/functions/patient-reports`,
  `supabase/migrations/20260531112000_080_patient360_nutrition_contracts.sql`,
  `supabase/functions/patient-360-summary`, `TabNutricao`, `TabRelatorios`,
  and `docs/supabase/PATIENT360_RUNBOOK.md`,
  billing/Asaas safe Edge Function hardening in
  `supabase/functions/asaas-create-patient-customer`,
  `supabase/functions/asaas-create-patient-invoice`,
  `supabase/functions/asaas-create-patient-subscription`,
  `supabase/functions/asaas-create-tenant-subaccount`,
  `src/services/billingApi.ts`,
  `src/app/clinic/financeiro/components/ClinicFinanceiroContent.tsx`,
  `scripts/supabase/test-billing-contract.mjs`, and
  `docs/integrations/ASAAS_BILLING_RUNBOOK.md`,
  local schema/runtime validation fixes in
  `supabase/functions/generate-document`,
  `src/lib/auth/getCurrentUserContext.ts`, and
  `supabase/migrations/20260531120000_090_finance_overview_patient_name_contract.sql`,
  `docs/integrations/D4SIGN_RUNBOOK.md`,
  `docs/PROJECT_COMPLETION_CHECKPOINTS.md`, and this baseline, plus clinic
  settings persistence in
  `src/app/clinic/settings/components/ClinicSettingsContent.tsx`,
  `src/services/clinicSettingsApi.ts`, and
  `supabase/migrations/20260531123000_100_clinic_settings_snapshot.sql`, plus
  clinic guard hardening in `src/lib/auth/clinicAccessGuard.ts`,
  `src/app/clinic/layout.tsx`, `src/middleware.ts`, and
  `src/services/session/getCurrentAppSession.ts`, and
  `docs/auth/AUTH_RBAC_SESSION_CONTRACT.md`, plus automated RLS cross-tenant
  coverage in `scripts/supabase/test-rls-cross-tenant-contract.mjs` and
  `docs/testing/CONTRACT_TESTS.md`, plus patient/guardian linkage RLS in
  `supabase/migrations/20260531135000_110_patient_guardian_linkage_rls.sql` and
  `scripts/supabase/test-patient-linkage-contract.mjs`.
- `npm run type-check`: passed.
- `npm run lint`: passed with 24 warnings.
- `npm run build`: passed; Next generated 26 app routes.
- Local fixture contracts passed:
  `node scripts/supabase/test-patient360-contract.mjs --mode=fixture`,
  `node scripts/supabase/test-d4sign-fixtures.mjs`, and
  `node scripts/supabase/test-billing-fixtures.mjs`.
- Supabase local migrations applied with
  `npx supabase migration up --local --include-all --yes`: versions `070`,
  `080`, `090`, `100`, and `110` are present in
  `supabase_migrations.schema_migrations`.
- Local bootstraps passed: `bootstrap-core-auth`,
  `bootstrap-patient360-demo`, `bootstrap-document-templates-demo`, and
  `bootstrap-billing-demo`. In this settings pass, `bootstrap-core-auth` was
  re-run against the forced local Supabase URL; the local demo auth password was
  synchronized for `clinic.admin@example.com` without printing the value.
- Local authenticated contracts passed: `test-patient360-contract.mjs
--mode=real` with a staff token, and `test-documents-contract.mjs` after
  `generate-document` was patched to use service-role writes after user
  authorization. Settings local contract passed with `clinic.admin@example.com`:
  `get_clinic_settings_snapshot` returned tenant/equipe/roles/permissoes,
  `upsert_clinic_unit` saved `Unidade Matriz`, and
  `update_clinic_settings` persisted portal/integracoes with sanitized
  `enabled/status`.
- Local HTTP smoke with `npm run dev` on port `4028`: `/auth/login` returned
  200; `/clinic/patients/test-patient?tab=financeiro` and
  `/clinic/patients/test-patient?tab=timeline` returned 307 to
  `/auth/login` without an authenticated session. This pass also checked
  `/clinic/patients/test-patient?tab=documentos` and
  `/clinic/patients/test-patient?tab=relatorios`, which returned 307 to
  `/auth/login` without an authenticated session. This chat lote added
  `/clinic/patients/test-patient?tab=chat`, which also returned 307 to
  `/auth/login` without an authenticated session. This remaining-tabs lote added
  `/clinic/patients/test-patient?tab=consultas`, `?tab=pacotes`,
  `?tab=prescricoes`, and `?tab=nutricao`, all returning 307 to `/auth/login`
  without an authenticated session. This document signer lote checked
  `/clinic/documents` and `/clinic/patients/test-patient?tab=documentos`, both
  returning 307 to `/auth/login` without an authenticated session. This
  nutrition/report contracts lote rechecked `/auth/login` as 200 and
  `/clinic/patients/test-patient?tab=nutricao` plus
  `/clinic/patients/test-patient?tab=relatorios` as 307 to `/auth/login`.
  This billing/Asaas hardening lote rechecked `/clinic/financeiro` and
  `/clinic/patients/test-patient?tab=financeiro`; both returned 307 to
  `/auth/login` without an authenticated session. `/auth/login` returned 200.
  This settings pass added authenticated HTTP smoke with a local SSR auth
  cookie: `/api/auth/app-session` returned 200, authenticated `true`,
  `targetRoute=/clinic/dashboard`, and `/clinic/settings` returned 200 with no
  redirect. The 8/8 smoke pass expanded authenticated HTTP coverage to
  `/clinic/dashboard`, `/clinic/patients`, `/clinic/agenda`,
  `/clinic/documents`, `/clinic/financeiro`, `/clinic/settings`,
  `/clinic/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, and
  `/clinic/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/encounter`; all
  returned 200 without login markup or Next error overlay. With the same clinic
  admin session, `/admin`, `/admin/tenants`, `/admin/webhooks`, and `/patient`
  returned 307 to `/clinic/dashboard`, confirming fail-closed routing for a
  non-platform, non-patient user.
- Clinic guard smoke: passed locally with demo-only users. Anonymous
  `/clinic/dashboard` returned 307 to `/auth/login`; `clinic.admin@example.com`
  returned 200; `clinic.noworkspace.demo@example.com` returned 307 to
  `/no-workspace`; `clinic.forbidden.demo@example.com` with active tenant
  membership role `patient` rendered the server-side `Acesso clinico negado`
  state on `/clinic/dashboard` and `/clinic/settings` without a Next error
  overlay. A demo profile with `is_active=false` returned
  `/api/auth/app-session` as `authenticated=false` even with a valid Supabase
  cookie, confirming app-session fail-closed behavior for disabled profiles.
- RLS cross-tenant contract: passed locally with demo-only tenants/users. The
  script seeded tenant A/B data, signed in through the anon key, confirmed tenant
  A could read its own patient and could not read tenant B in `patients`,
  `patient_pii`, `generated_documents`, `patient_invoices`,
  `patient_chat_threads`, `patient_chat_messages`, and `report_definitions`.
  A tenant A update attempt against tenant B patient affected 0 rows, and a
  service-role verification confirmed tenant B data was unchanged. The script
  refuses mutating runs outside localhost unless `ALLOW_REMOTE_RLS_SMOKE=true`.
- Patient/guardian linkage contract: passed locally with demo-only users. The
  script seeded active `patient_accounts` and `guardian_links`, signed in linked
  patient/guardian users through the anon key, confirmed each user can read only
  its own active linkage row, confirmed cross-patient linkage reads return 0
  rows, and confirmed linked users still cannot read `patients` rows directly.
  The script refuses mutating runs outside localhost unless
  `ALLOW_REMOTE_PATIENT_LINKAGE_SMOKE=true`.
- Browser smoke: passed limited after the in-app Browser tab was opened and
  `iab` became available. `/clinic/patients/test-patient?tab=financeiro`
  redirected to `/auth/login`; login rendered without framework overlay, console
  errors/warnings, and the e-mail input accepted focus. After the patient360Api
  hardening, `/clinic/patients/test-patient?tab=timeline` also rendered the
  login DOM without framework overlay or console errors/warnings; click
  interaction was not repeated because Browser click/evaluate timed out in that
  second pass. After sensitive-tab forbidden rendering, the `documentos`
  deep-link also redirected to login and rendered styled login with CSS loaded,
  no framework overlay, and no console errors/warnings. After chat hardening,
  the `chat` deep-link redirected to `/auth/login`; Browser confirmed login DOM
  (`Entrar`, e-mail input), CSS loaded (`stylesheetCount=2`, teal button and
  padded rounded form), and no console errors/warnings. After the
  consultas/pacotes/prescricoes/nutricao hardening, the `consultas` deep-link
  redirected to `/auth/login` with the same styled login DOM and no console
  errors/warnings. After document signer hardening, the `documentos` deep-link
  again redirected to `/auth/login`; Browser confirmed styled login DOM
  (`Entrar`, e-mail input, stylesheetCount=2, teal button, rounded padded form),
  no console errors/warnings, and no Next.js dialog overlay.
  After the nutrition/report contracts lote, the in-app Browser rechecked
  `?tab=nutricao` and `?tab=relatorios`; both redirected to `/auth/login`, the
  login DOM stayed styled (`Entrar`, e-mail input, stylesheetCount=2, teal
  button), console errors/warnings were empty, and the `nextjs-portal` node was
  empty (`children=0`) rather than a visible framework overlay.
  After billing/Asaas hardening, Browser rechecked `/clinic/financeiro` and
  `?tab=financeiro`; both redirected to `/auth/login`. `/auth/login` rendered a
  styled login form with visible `E-mail` and `Senha` inputs, submit button,
  loaded stylesheets, empty `nextjs-portal`, and no console errors/warnings.
  After local migrations/bootstraps, Browser ran an authenticated local smoke
  with the Next dev server pointed at local Supabase through process
  environment overrides: `/clinic/financeiro` rendered metrics and empty recent
  charges without the prior `pii.preferred_name` RPC error, and
  `/clinic/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?tab=financeiro`
  rendered Juliana Pereira's Paciente 360 financial tab without overlay or
  console errors/warnings. During the settings pass, Browser rendered the styled
  `/auth/login` form, but authenticated `/clinic/settings` smoke stayed blocked
  because the in-app Browser runtime could not type into inputs without virtual
  clipboard support; the pass used RPC and authenticated HTTP smoke instead. In
  the 8/8 smoke pass, Browser anonymous checks revalidated `/auth/login`,
  `/clinic/dashboard`, `/clinic/settings`, `/admin`, and `/patient`: protected
  routes redirected to `/auth/login`, the login page kept styled fields/button,
  and console error count stayed 0. Invalid-credential typing remains blocked by
  the same Browser clipboard limitation, so authenticated coverage was recorded
  through HTTP/RPC.
- Docker local check: Docker Engine responded (`29.2.1`). Docker Desktop was
  updated through its local settings API so `tcp://localhost:2375` is exposed
  (`ExposeDockerAPIOnTCP2375=true` in `settings-store.json`, with a local
  backup kept). The local Supabase DB answered `pg_isready`, Vector stabilized
  as `healthy`, Kong/Studio/Inbucket/Analytics answered on their local ports,
  and no secret-printing status command was run. After the Docker Desktop
  restart, `supabase_edge_runtime_slimhiper_1308` was manually started because
  its restart policy is `no`; it then served functions through Kong and a
  no-session request returned `401`.
- Supabase local was restarted after containers were absent. `supabase start`
  initially failed because `supabase/functions/.env` had a UTF-8 BOM before
  `ASAAS_API_KEY`; the BOM was removed without printing values, and the local
  stack then started successfully.
- Skipped/blocked: Supabase remote `db push` was not run. Secret values were not
  printed; `.env` was read only in-process to classify target/provider
  readiness. The Asaas real/sandbox contract was attempted against local Edge
  Functions and failed before provider work with `asaas-create-patient-customer`
  status 500 because the local Edge Runtime had no `ASAAS_*` secrets loaded and
  `.env` did not classify `ASAAS_BASE_URL` as sandbox. D4Sign provider sandbox
  was not called; documents contract passed through the local gated path.
- Residual risks: authenticated Browser smoke remains needed for
  `/clinic/settings` once Browser input/clipboard works, team invite and role
  mutation require audited backend contracts, authenticated visual UI smoke
  remains a release gate for Patient 360 tabs, portal UI and scoped patient data
  contracts remain pending before `/patient` can open, Asaas/D4Sign provider
  sandbox needs segregated Edge secrets/base URLs, dependency audit
  findings need a dedicated package task, and lint warnings remain non-blocking.

## Environment Used

- Date: 2026-05-31 14:00 -03:00.
- Repo path: local `slimhiper_1308` workspace.
- Branch: `test/asaas-billing-contract-hardening`.
- Commit base: `bb190f1`.
- Shell: PowerShell.
- Node: `v24.15.0`.
- npm: `11.12.1`.
- Package manager: npm.
- Next.js: `15.1.11`.
- React: `19.0.3`.
- Tailwind CSS: `3.4.6`.
- Dev server port from `package.json`: `4028`.

Supabase local migrations were applied through version `110`; no remote
`supabase db push` was run. Local bootstraps were run for core auth, Patient
360, document templates, and billing. D4Sign/Asaas provider sandbox calls were
not completed in this pass.

## Commands

Run these commands for the local baseline:

```bash
npm install
npm run type-check
npm run build
npm run lint
git diff --check
node scripts/supabase/test-patient360-contract.mjs --mode=fixture
node scripts/supabase/test-d4sign-fixtures.mjs
node scripts/supabase/test-billing-fixtures.mjs
npx supabase migration up --local --include-all --yes
node scripts/supabase/bootstrap-core-auth.mjs
node scripts/supabase/bootstrap-patient360-demo.mjs
node scripts/supabase/bootstrap-document-templates-demo.mjs
node scripts/supabase/bootstrap-billing-demo.mjs
node scripts/supabase/test-patient360-contract.mjs --mode=real
node scripts/supabase/test-patient360-local-real-smoke.mjs
node scripts/supabase/test-documents-contract.mjs
node scripts/supabase/test-rls-cross-tenant-contract.mjs
node scripts/supabase/test-patient-linkage-contract.mjs
```

For docs-only changes, `git diff --check` is the minimum required check. For UI,
lint, or frontend changes, keep `npm run lint` in the baseline. The lint script
now uses ESLint CLI over `src/**/*.{ts,tsx}` instead of `next lint`.

## Results From This Run

| Command              | Result               | Notes                                                                                                                                                                   |
| -------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`        | Not run this pass    | Dependency graph was not changed.                                                                                                                                       |
| `npm run type-check` | Passed               | `tsc --noEmit` exited successfully.                                                                                                                                     |
| `npm run build`      | Passed               | `next build` compiled successfully and generated 26 app routes.                                                                                                         |
| `npm run lint`       | Passed with warnings | ESLint CLI exited with code 0; 24 warnings remain.                                                                                                                      |
| `git diff --check`   | Passed               | No whitespace errors reported.                                                                                                                                          |
| Patient 360 fixture  | Passed               | Summary, timeline, category filter, forbidden, and cross-tenant fixtures passed.                                                                                        |
| D4Sign fixture       | Passed               | Valid webhook, invalid fail-closed behavior, document summary, and HMAC strategy passed.                                                                                |
| Billing fixture      | Passed               | Confirmed, overdue, cancelled, duplicated, tenant resolution, and invalid-token fixtures passed.                                                                        |
| Supabase migrations  | Passed local         | Local DB applied migrations through `20260531135000_110_patient_guardian_linkage_rls.sql`.                                                                              |
| Local bootstraps     | Passed               | Core auth, Patient 360 demo, document templates, and billing demo bootstraps completed.                                                                                 |
| Patient 360 real     | Passed local         | Local-real smoke passed staff summary/timeline, forbidden 403, cross-tenant 404, all MVP tab contracts, and new lab timeline event types.                               |
| Documents real       | Passed local         | Generated document, signed URL, and gated D4Sign send contract passed against local Supabase.                                                                           |
| Settings real        | Passed local         | Snapshot/update/unit RPCs passed with `clinic.admin@example.com`; `/clinic/settings` returned 200 by HTTP.                                                              |
| Clinic guard         | Passed local         | Anonymous, no-workspace, valid clinic, forbidden, and inactive-profile states returned expected outcomes.                                                               |
| RLS cross-tenant     | Passed local         | Tenant A/B demo users proved isolation for patients, PII, documents, invoices, chat, reports, and cross writes.                                                         |
| Patient linkage      | Passed local         | Linked patient/guardian users read only own active linkage rows and still cannot read `patients` directly.                                                              |
| Billing real         | Blocked local        | Local Edge returned 500 before provider work because `ASAAS_*`/sandbox base URL are not loaded in runtime.                                                              |
| Local HTTP smoke     | Passed local         | Anonymous fail-closed plus authenticated clinic routes/settings/patient demo returned expected 200/307 statuses; Phase 3 rechecked Patient 360 tab deep-links to login. |
| Browser smoke        | Passed limited       | Anonymous login/guards passed; credential typing remains blocked by Browser clipboard limitation.                                                                       |

## Lint Warning Categories

The baseline lint command exits successfully, but warnings remain in the
codebase:

- Unused variables or arguments in admin, clinic, Patient 360, shared
  components, and Supabase middleware files.
- `no-explicit-any` warnings in admin services and shared UI image/icon helpers.
- `next/no-img-element` warning in `PatientHeaderCard`.
- Missing `alt` warnings in `AppImage`.

These warnings were not fixed in this baseline task because the requested scope
is to stabilize checks without changing product behavior.

## Pending Items

- Address lint warnings in a dedicated cleanup task.
- Review `npm audit` output: npm reports 2 vulnerabilities, 1 moderate and 1
  critical. Do not run `npm audit fix --force` without a dependency update task.
- Prefer `npm ci` for a clean reproducibility check when resetting
  `node_modules` is acceptable.
- CI or preview builds must continue to provide safe public Supabase values:
  `NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `next/font/google` depends on Google font resolution during build. If CI has
  no egress or font cache, use a dedicated task to self-host fonts or configure a
  build cache strategy.
- Keep `package-lock.json` versioned for reproducible npm installs.
- Keep `.env`, `.env.local`, and `.env.*.local` out of Git.
- Continue to avoid Supabase/provider commands unless explicitly authorized.
- Keep `.github/workflows/ci.yml` free of provider secrets and real contract
  calls.
- Automatic CI now runs fixture-only Patient 360, D4Sign, and Billing checks
  without provider secrets. Keep `.github/workflows/contract-fixtures.yml` as a
  manual fixture rerun path. Real Supabase/D4Sign/Asaas contracts still require
  explicit authorization and sandbox credentials.

## Known Coverage Limits

- `next.config.mjs` skips TypeScript and ESLint validation during `next build`,
  so `npm run type-check` and `npm run lint` remain independent baseline checks.
- `tsconfig.json` excludes `supabase/functions/**/*.ts`; this baseline covers
  the Next.js app TypeScript surface, not Edge Function type-checking.
- Supabase contract tests and provider workflows are covered separately in
  `docs/testing/CONTRACT_TESTS.md` and require explicit authorization.

## Baseline Status

The executable local baseline is green by exit code for type-check, build, lint,
fixture-only Patient 360, D4Sign, Billing contracts, local migrations,
bootstraps, local authenticated Patient 360/documents contracts, the Patient 360
local-real all-tab smoke, limited HTTP smoke, authenticated Browser smoke for
finance/Paciente 360 financeiro, local settings RPC/HTTP smoke, clinic guard
states, scripted local RLS cross-tenant coverage, and patient/guardian linkage
RLS coverage. Asaas provider sandbox remains blocked by runtime configuration,
not by a passed provider test.
Authenticated Browser smoke for settings is blocked by Browser input/clipboard
support, not by a route/build failure. Remaining issues are warning/dependency
audit cleanup items and unfinished module coverage, not blocking command failures
for this lote.
