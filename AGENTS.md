# AGENTS.md

Operational context for Codex Desktop agents and subagents working in this
repository.

## 1. Real Stack

SlimHiper is a hybrid clinical operations app built with:

- Next.js 15 App Router.
- React 19.
- TypeScript.
- Tailwind CSS 3.
- Supabase Auth, database, RLS/RBAC, storage, and Edge Functions.
- Supabase SSR helpers in `src/lib/supabase`.
- Clinical UI surfaces under `src/app/clinic`, `src/app/paciente-360`, and
  shared components under `src/components`.
- Platform admin surfaces under `src/app/admin`.
- Patient 360, document templates, D4Sign, billing/Asaas, bootstrap scripts,
  and mock-backed screens.

Important directories:

- `src/app`: App Router routes and layouts.
- `src/components`: shared UI components, including `DashboardShell`.
- `src/services`: frontend service facades and mock/backend switching.
- `src/lib/supabase`: browser/server/middleware Supabase clients.
- `src/domain/types.ts`: shared domain types.
- `src/data`: mock data and builder data.
- `supabase/migrations`: database migrations.
- `supabase/functions`: Edge Functions.
- `supabase/tests`: SQL/manual Supabase test assets.
- `scripts/supabase`: bootstrap and contract-check scripts.

## 2. Real Scripts

Use `npm` as the default package manager unless a task explicitly says
otherwise.

Scripts in `package.json`:

- `npm run dev`: starts Next dev server on port `4028`.
- `npm run build`: runs `next build`.
- `npm run start`: currently runs `next dev -p 4028`.
- `npm run lint`: currently runs `next lint`.
- `npm run lint:fix`: currently runs `next lint --fix`.
- `npm run format`: runs Prettier over `src/**/*.{ts,tsx,css,md,json}`.
- `npm run serve`: runs `next start`.
- `npm run type-check`: runs `tsc --noEmit`.
- `npm run supabase:bootstrap:core-auth`: runs
  `node scripts/supabase/bootstrap-core-auth.mjs`.

Additional Supabase scripts exist under `scripts/supabase`, but most of them
require real environment variables and may mutate data or call provider
functions. Do not run them unless the task explicitly authorizes that exact
script and environment.

Do not alter `package.json` unless the task requires it. If you must change it,
explain why, what changed, and what install/check command was run.

Do not remove or edit the `rocketCritical` section in `package.json` without
explicit authorization.

## 3. Security Rules

- Do not print secrets, tokens, `.env` values, cookies, or provider credentials.
- Do not read `.env` unless the task explicitly requires environment diagnosis.
  Prefer checking variable names from `.env.example`, code references, or docs.
- Never put secrets in `NEXT_PUBLIC_*`.
- Public variables must be safe for browser exposure.
- `SUPABASE_SERVICE_ROLE_KEY` and service-role clients are allowed only in
  server-side scripts, trusted backend code, or Supabase Edge Functions.
- Never import or expose service-role credentials in client components, browser
  services, or `NEXT_PUBLIC_*` variables.
- Treat patient, clinical, billing, document, and webhook payload data as
  sensitive.
- Do not call external provider APIs unless explicitly authorized.
- Do not transmit repo data, secrets, payload samples, or patient data to third
  parties.
- `.env` should not be versioned. If a task touches env hygiene, add or preserve
  an `.env.example` template and avoid committing real values.
- `src/app/layout.tsx` currently includes external Rocket scripts. Do not remove
  or modify those scripts unless the task specifically asks for Rocket script
  governance/removal.
- If adding security headers or CSP, ensure Rocket, Supabase, D4Sign/Asaas
  surfaces, images, and Next assets are considered deliberately.

## 4. Supabase Rules

- Do not run `supabase db push` without explicit authorization.
- Do not run migrations, bootstraps, contract scripts, or provider workflows
  unless the task explicitly authorizes the exact operation.
- Keep Supabase Auth/RBAC, tenant context, RLS policies, and grants aligned.
- Client-side code must use anon/session-scoped Supabase clients only.
- Server code and Edge Functions may use elevated clients only when required
  and after validating tenant/user/provider context.
- Keep service response envelopes consistent with existing patterns:
  `{ data, error }` on frontend services and provider/function envelopes as
  already used locally.
- Be careful with `NEXT_PUBLIC_USE_MOCK_DATA`; mock fallback is useful for UI
  development but must not hide production authorization or schema failures.
- When changing a table, function, policy, or grant, update related scripts,
  tests, README/runbook notes, and frontend service assumptions.
- Do not assume scripts in `scripts/supabase` are read-only. Inspect before
  running.

## 5. UI And Tailwind Rules

- This project uses Tailwind CSS 3, `tailwind.config.js`, and
  `src/styles/tailwind.css`.
- Do not migrate to Tailwind 4, change Tailwind compilation, or upgrade Next.js
  as part of an unrelated task. Use a dedicated upgrade task.
- Prefer existing shared components and local patterns before creating new UI
  abstractions.
- Use `DashboardShell` for clinical dashboard-style pages unless the surrounding
  module has a more specific established shell.
- Keep clinical UI dense, scannable, and operational. Avoid marketing-style
  hero sections in product workflows.
- Always provide meaningful loading, empty, error, and forbidden states for data
  surfaces.
- Avoid hover-only actions for workflows that must work on touch or keyboard.
- Use responsive constraints and breakpoints for sidebars, steppers, tables, and
  dashboards.
- Use existing tokens and utilities from `src/styles/tailwind.css`. If adding a
  utility class, verify it is actually defined or generated by Tailwind.
- Watch for undefined classes such as legacy aliases. Prefer `card-base` and
  established local utilities unless a task intentionally introduces a new one.
- For UI changes, verify at least the target route and a relevant interaction in
  the browser when practical.

## 6. D4Sign Rules

- D4Sign code lives mainly in:
  - `supabase/functions/d4sign-send-document`
  - `supabase/functions/webhook-d4sign`
  - `supabase/functions/document-signed-url`
  - `src/services/documentsApi.ts`
  - document-related UI under `src/app/clinic/documents` and Patient 360 tabs.
- Do not call D4Sign APIs without explicit authorization.
- Do not log or print D4Sign tokens, crypt keys, webhook secrets, provider
  document IDs tied to real data, or raw payloads.
- Keep webhook verification fail-closed.
- Store only the minimum operational payload needed. Prefer summaries or
  redacted payloads over raw provider bodies.
- Signed document URLs must be short-lived and permission-checked.
- If changing D4Sign function contracts, update frontend service handling,
  runbook docs, and any contract scripts/checklists.

## 7. Asaas Rules

- Asaas/billing code lives mainly in:
  - `supabase/functions/asaas-create-tenant-subaccount`
  - `supabase/functions/asaas-create-patient-customer`
  - `supabase/functions/asaas-create-patient-invoice`
  - `supabase/functions/asaas-create-patient-subscription`
  - `supabase/functions/webhook-asaas`
  - `src/services/billingApi.ts`
  - `src/app/clinic/financeiro`
  - `src/app/admin/billing`
  - `src/app/admin/webhooks`
- Do not call Asaas APIs without explicit authorization.
- Do not store or expose raw provider payloads unless a task specifically
  requires a secure audit table design.
- Webhook handlers must validate authentication, payload shape, tenant mapping,
  idempotency, and storage rules.
- Be cautious with timeline writes from billing events; column names and schema
  contracts must match migrations.
- If changing billing tables/functions, update the billing runbook, bootstrap
  scripts, and UI service assumptions.

## 8. Migration Rules

- Do not edit old migrations unless the user explicitly authorizes a history
  rewrite or the repository policy changes.
- For schema changes, create a new timestamped migration.
- Do not create migrations unless the task explicitly asks for one.
- Do not run `supabase db push` without explicit authorization.
- Do not assume a migration applies cleanly. Check earlier migrations for table
  shape, constraints, grants, RLS, indexes, and functions.
- New migrations that touch access-controlled data must include RLS/grants
  analysis.
- New tables that store provider webhooks, clinical data, billing data, or
  documents need explicit access rules.
- If a script or Edge Function depends on a migration, update both in the same
  task or document the remaining gap.
- If migrations and bootstraps diverge, fix the schema contract first before
  expanding frontend features.

## 9. Subagent Rules

Use subagents for parallel audit, exploration, or independent implementation
work when explicitly requested or when the task calls for separate reviewers.

Subagent defaults:

- Work read-only unless assigned a specific write scope.
- Do not read or print secrets.
- Do not run provider APIs, Supabase push, migrations, bootstraps, or mutating
  scripts unless explicitly authorized.
- Return findings with file paths and line numbers when possible.
- State commands/checks run and commands intentionally skipped.
- Separate confirmed facts from likely risks.
- Keep output concise and actionable.

Recommended audit roles:

- `repo_explorer`: structure, routes, scripts, dependencies, modules.
- `frontend_reviewer`: Tailwind, layout, shells, pages, states, navigation.
- `supabase_reviewer`: migrations, functions, tests, scripts, README drift.
- `security_reviewer`: secrets, service role, RLS/grants, webhooks, external
  scripts.
- `docs_reviewer`: README, runbooks, commands, AGENTS.md gaps.

When multiple subagents run, the parent agent must consolidate and prioritize
findings rather than pasting raw reports only.

## 10. Mandatory Checks

For code changes, run:

- `npm run type-check`
- `npm run build`
- `git diff --check`

For lint-related or frontend changes, also run:

- `npm run lint`

Important: lint currently uses `next lint`. If Next.js deprecates or removes
that workflow, migrate linting in a dedicated task rather than mixing it into an
unrelated change.

For docs-only changes, at minimum run:

- `git diff --check`

For UI changes, when practical:

- Start `npm run dev`.
- Open the relevant route.
- Check for blank screens, framework overlays, console errors, and at least one
  relevant interaction.

For Supabase changes, checks depend on authorization. Do not run migrations,
pushes, bootstraps, or provider tests unless explicitly authorized.

## 11. Definition Of Done

A task is done when:

- The requested scope is implemented and unrelated changes are left alone.
- No secrets or real patient/provider data were printed or introduced.
- Existing user changes were not reverted.
- Migrations were not edited or created unless explicitly requested.
- `package.json` was not changed unless justified.
- `rocketCritical` and Rocket external scripts were not removed without a
  specific task.
- Required checks were run and results are reported.
- Any skipped checks are named with the reason.
- Risks, follow-up work, and known limitations are called out.
- File paths for important changes are included in the final response.
