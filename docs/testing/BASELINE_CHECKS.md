# Baseline Checks

Local baseline captured before new feature work. This document records commands,
results, pending items, and environment details for the current repository state.

## Latest Implementation Validation

- Date: 2026-05-31.
- Branch: local working tree.
- Touched paths: README/checkpoint/runbooks, Supabase config/functions/migration,
  admin services/screens, dashboard/agenda/patient services, Patient 360
  documents redirect/action handling, encounter UI, and program builder card
  classes.
- `git diff --check`: passed; Git reported CRLF normalization warnings only.
- `npm run type-check`: passed.
- `npm run lint`: passed with 32 warnings.
- `npm run build`: passed.
- Browser smoke: `npm run dev` required removing generated `.next` cache after a
  local `readlink` diagnostic artifact error. The in-app Browser reached the dev
  server after restart; `/clinic/dashboard`, `/clinic/agenda`,
  `/clinic/patients/patient-001/encounter`, `/admin/tenants`, and
  `/admin/webhooks` redirected to `/auth/login` because no authenticated test
  session was available. The guarded login page rendered without framework error
  or blank screen, but the protected route interiors were not visually exercised.
- Skipped: Supabase `db push`, migrations, bootstraps, contract scripts, D4Sign
  sandbox, and Asaas sandbox/provider checks. Reason: no explicitly authorized
  target environment/command for mutating or provider-capable operations.
- Residual risks: protected UI states still need authenticated browser smoke,
  Supabase RLS/RPC contracts still need an authorized environment, and lint
  warnings remain non-blocking.

## Environment Used

- Date: 2026-05-19.
- Repo path: local `slimhiper_1308` workspace.
- Branch: `test/baseline-green-checks`.
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
```

For docs-only changes, `git diff --check` is the minimum required check. For UI,
lint, or frontend changes, keep `npm run lint` in the baseline. The lint script
now uses ESLint CLI over `src/**/*.{ts,tsx}` instead of `next lint`.

## Results From This Run

| Command              | Result               | Notes                                                                                                                                                    |
| -------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`        | Passed               | Dependencies were already up to date; npm audited 534 packages.                                                                                          |
| `npm run type-check` | Passed               | `tsc --noEmit` exited successfully.                                                                                                                      |
| `npm run build`      | Passed               | First final rerun hit an ignored `.next` diagnostics artifact readlink error; after removing `.next`, `next build` compiled and generated 25 app routes. |
| `npm run lint`       | Passed with warnings | ESLint CLI exits with code 0 after line-ending formatting; existing warnings remain.                                                                     |
| `git diff --check`   | Passed               | No whitespace errors reported.                                                                                                                           |

## Lint Warning Categories

The baseline lint command exits successfully, but warnings remain in the
codebase:

- Unused variables or arguments in admin, clinic, Patient 360, shared
  components, and Supabase middleware files.
- `no-explicit-any` warnings in admin services and shared UI image/icon helpers.
- Missing React hook dependency in `Patient360Content`.
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
- CI or preview builds must provide safe public Supabase values:
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
- Use `.github/workflows/contract-fixtures.yml` for manual local fixture checks;
  real Supabase/D4Sign/Asaas contracts still require explicit authorization and
  sandbox credentials.

## Known Coverage Limits

- `next.config.mjs` skips TypeScript and ESLint validation during `next build`,
  so `npm run type-check` and `npm run lint` remain independent baseline checks.
- `tsconfig.json` excludes `supabase/functions/**/*.ts`; this baseline covers
  the Next.js app TypeScript surface, not Edge Function type-checking.
- Supabase contract tests and provider workflows are covered separately in
  `docs/testing/CONTRACT_TESTS.md` and require explicit authorization.

## Baseline Status

The executable local baseline is green by exit code for install, type-check,
build, and lint. Remaining issues are warning/dependency-audit cleanup items,
not blocking command failures.
