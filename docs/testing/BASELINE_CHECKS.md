# Baseline Checks

Local baseline captured before new feature work. This document records commands,
results, pending items, and environment details for the current repository state.

## Latest Implementation Validation

- Date: 2026-05-31 08:30 -03:00.
- Branch: `test/asaas-billing-contract-hardening`.
- Commit base: `bb190f1`.
- Touched paths: dashboard empty states and quick actions, agenda/fila visible
  status transitions, patient list fake-action hardening, encounter/SOAP
  mock-side-panel removal, Patient 360 document signature gating, Patient 360
  tab deep-links, Patient 360 reports service facade,
  `docs/PROJECT_COMPLETION_CHECKPOINTS.md`, and this baseline.
- `npm run type-check`: passed.
- `npm run lint`: passed with 27 warnings.
- `npm run build`: passed; Next generated 26 app routes.
- Local fixture contracts passed:
  `node scripts/supabase/test-patient360-contract.mjs --mode=fixture`,
  `node scripts/supabase/test-d4sign-fixtures.mjs`, and
  `node scripts/supabase/test-billing-fixtures.mjs`.
- Local HTTP smoke with `npm run dev` on port `4028`: `/auth/login` and
  `/no-workspace` returned 200; `/clinic/dashboard`, `/clinic/agenda`,
  `/clinic/patients?search=ana`, `/clinic/patients/test-patient?tab=relatorios`,
  `/clinic/patients/test-patient/encounter`, `/patient`, and `/admin` returned
  307 to `/auth/login` without an authenticated session.
- Browser smoke: authenticated Patient 360 deep-link was redirected to
  `/auth/login`; login screen rendered with no framework overlay, no console
  errors/warnings, and the e-mail field accepted focus.
- Docker local check: Docker Engine responded (`29.2.1`), the local Supabase DB
  answered `pg_isready`, Kong/Studio/Inbucket answered on their local ports, but
  `supabase_vector_slimhiper_1308` was restarting; Supabase local green remains
  blocked and no secret-printing status command was run.
- Skipped: `.env` real inspection, Supabase `db push`, migrations, bootstraps,
  real/sandbox contract scripts, D4Sign sandbox, and Asaas sandbox/provider
  checks. Reason: local-safe execution only and no authorized mutable/provider
  environment.
- Residual risks: authenticated UI states still need browser smoke,
  Supabase RLS/RPC contracts still need an authorized environment, dependency
  audit findings need a dedicated package task, and lint warnings remain
  non-blocking.

## Environment Used

- Date: 2026-05-31 08:30 -03:00.
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

No Supabase migrations, `supabase db push`, bootstraps, D4Sign calls, or Asaas
calls were run for this baseline.

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
```

For docs-only changes, `git diff --check` is the minimum required check. For UI,
lint, or frontend changes, keep `npm run lint` in the baseline. The lint script
now uses ESLint CLI over `src/**/*.{ts,tsx}` instead of `next lint`.

## Results From This Run

| Command              | Result               | Notes                                                                                            |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `npm install`        | Passed               | Dependencies were already up to date; npm audited 534 packages and produced no package diff.     |
| `npm run type-check` | Passed               | `tsc --noEmit` exited successfully.                                                              |
| `npm run build`      | Passed               | `next build` compiled successfully and generated 26 app routes.                                  |
| `npm run lint`       | Passed with warnings | ESLint CLI exited with code 0; existing 27 warnings remain.                                      |
| `git diff --check`   | Passed               | No whitespace errors reported.                                                                   |
| Patient 360 fixture  | Passed               | Summary, timeline, category filter, forbidden, and cross-tenant fixtures passed.                 |
| D4Sign fixture       | Passed               | Valid webhook, invalid fail-closed behavior, document summary, and HMAC strategy passed.         |
| Billing fixture      | Passed               | Confirmed, overdue, cancelled, duplicated, tenant resolution, and invalid-token fixtures passed. |
| Local HTTP smoke     | Passed limited       | `/auth/login` and `/no-workspace` returned 200; touched authenticated routes redirected.         |
| Browser smoke        | Passed limited       | Login rendered without overlay/console errors; e-mail field focus interaction passed.            |

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

The executable local baseline is green by exit code for install, diff check,
type-check, build, lint, and fixture-only Patient 360, D4Sign, and Billing
contracts. Remaining issues are warning/dependency-audit cleanup items, not
blocking command failures.
