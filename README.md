# SlimHiper Clinic OS

SlimHiper is a clinical operations app for transformation-body clinics. It
combines a Next.js frontend, Supabase Auth/RBAC, Patient 360 clinical views,
document templates, D4Sign document-signing workflows, and Asaas billing
workflows.

This README is the short entry point. Detailed setup and operational runbooks
live under `docs/`.

## Stack

- Next.js 15 App Router.
- React 19.
- TypeScript.
- Tailwind CSS 3 using `tailwind.config.js` and `src/styles/tailwind.css`.
- Supabase Auth, database, RLS/RBAC, storage, and Edge Functions.
- Supabase SSR helpers in `src/lib/supabase`.
- Clinical UI via `DashboardShell` and shared components in `src/components`.
- Mock-backed frontend services in selected screens through `src/services`.

## Main Commands

```bash
npm install
npm run dev
git diff --check
npm run type-check
npm run lint
npm run build
```

Notes:

- `npm run dev` starts the app on port `4028`.
- `git diff --check` is the whitespace/syntax guard for staged or unstaged diffs.
- `npm run lint` runs ESLint CLI over `src/**/*.{ts,tsx}`.
- `npm run start` currently starts the development server.
- Do not change `package.json` or `rocketCritical` dependencies without a
  specific reason and explanation.

## Runbooks

- Project overview: [docs/README_OVERVIEW.md](docs/README_OVERVIEW.md)
- Core Auth/RBAC bootstrap: [docs/supabase/CORE_AUTH_RBAC_RUNBOOK.md](docs/supabase/CORE_AUTH_RBAC_RUNBOOK.md)
- Auth/RBAC session contract: [docs/auth/AUTH_RBAC_SESSION_CONTRACT.md](docs/auth/AUTH_RBAC_SESSION_CONTRACT.md)
- Patient 360 setup and checkpoint: [docs/supabase/PATIENT360_RUNBOOK.md](docs/supabase/PATIENT360_RUNBOOK.md)
- Document templates bootstrap: [docs/supabase/DOCUMENT_TEMPLATES_RUNBOOK.md](docs/supabase/DOCUMENT_TEMPLATES_RUNBOOK.md)
- D4Sign documents runbook: [docs/integrations/D4SIGN_RUNBOOK.md](docs/integrations/D4SIGN_RUNBOOK.md)
- Asaas billing runbook: [docs/integrations/ASAAS_BILLING_RUNBOOK.md](docs/integrations/ASAAS_BILLING_RUNBOOK.md)
- Mercado Pago transition source of truth: [docs/integrations/MERCADOPAGO_TRANSITION_SOURCE_OF_TRUTH.md](docs/integrations/MERCADOPAGO_TRANSITION_SOURCE_OF_TRUTH.md)
- Environment hygiene: [docs/security/ENV_HYGIENE.md](docs/security/ENV_HYGIENE.md)
- Contract and smoke checks: [docs/testing/CONTRACT_TESTS.md](docs/testing/CONTRACT_TESTS.md)
- Project completion checkpoints: [docs/PROJECT_COMPLETION_CHECKPOINTS.md](docs/PROJECT_COMPLETION_CHECKPOINTS.md)
- Production readiness execution: [docs/Production_Readiness_Execution_Plan.md](docs/Production_Readiness_Execution_Plan.md)
- Production readiness tracker: [docs/operations/PRODUCTION_READINESS_STAGE_TRACKER.md](docs/operations/PRODUCTION_READINESS_STAGE_TRACKER.md)
- Staging evidence/go-live template: [docs/operations/STAGING_GO_LIVE_EVIDENCE_TEMPLATE.md](docs/operations/STAGING_GO_LIVE_EVIDENCE_TEMPLATE.md)
- Codex agent operating rules: [AGENTS.md](AGENTS.md)

## Secrets And Safety

- Never commit real secrets.
- Keep local values in `.env.local`; use `.env.example` as the versioned
  template.
- Never place service-role credentials or provider secrets in `NEXT_PUBLIC_*`.
- Use service-role credentials only in trusted server-side scripts or Edge
  Functions.
- Do not run `supabase db push`, bootstrap scripts, contract scripts, D4Sign
  calls, or Asaas calls unless the task explicitly authorizes that operation.
- Treat patient, clinical, billing, document, and webhook data as sensitive.
- The repository currently includes Rocket-related metadata/scripts. Do not
  remove Rocket dependencies or external Rocket scripts without a specific task.

## Documentation Maintenance

When changing Supabase schema, Edge Functions, provider integrations, or command
workflows, update the relevant runbook in the same task. Keep README short and
use `docs/` for operational detail.
