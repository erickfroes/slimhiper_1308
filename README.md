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
npm run type-check
npm run lint
npm run build
```

Notes:

- `npm run dev` starts the app on port `4028`.
- `npm run lint` currently uses `next lint`.
- `npm run start` currently starts the development server.
- Do not change `package.json` or `rocketCritical` dependencies without a
  specific reason and explanation.

## Runbooks

- Project overview: [docs/README_OVERVIEW.md](docs/README_OVERVIEW.md)
- Core Auth/RBAC bootstrap: [docs/supabase/CORE_AUTH_RBAC_RUNBOOK.md](docs/supabase/CORE_AUTH_RBAC_RUNBOOK.md)
- Patient 360 setup and checkpoint: [docs/supabase/PATIENT360_RUNBOOK.md](docs/supabase/PATIENT360_RUNBOOK.md)
- Document templates bootstrap: [docs/supabase/DOCUMENT_TEMPLATES_RUNBOOK.md](docs/supabase/DOCUMENT_TEMPLATES_RUNBOOK.md)
- D4Sign documents runbook: [docs/integrations/D4SIGN_RUNBOOK.md](docs/integrations/D4SIGN_RUNBOOK.md)
- Asaas billing runbook: [docs/integrations/ASAAS_BILLING_RUNBOOK.md](docs/integrations/ASAAS_BILLING_RUNBOOK.md)
- Contract and smoke checks: [docs/testing/CONTRACT_TESTS.md](docs/testing/CONTRACT_TESTS.md)
- Codex agent operating rules: [AGENTS.md](AGENTS.md)

## Secrets And Safety

- Never commit real secrets.
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
