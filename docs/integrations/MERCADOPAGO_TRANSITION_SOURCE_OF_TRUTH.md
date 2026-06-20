# Mercado Pago Transition Source Of Truth

Last updated: 2026-06-20

This document is the operational source of truth for replacing the current
Asaas billing integration with Mercado Pago.

It is intentionally written as an execution checklist. Keep it updated during
implementation, review, staging validation, cutover, and post-cutover cleanup.

## Current Status

- [x] Product decision finalized: single SlimHiper seller account or per-clinic
      Mercado Pago marketplace sellers.
- [x] Provider-neutral billing schema designed.
- [x] Provider-neutral frontend/service contract designed.
- [x] Mercado Pago Edge Functions implemented.
- [x] Mercado Pago webhook implemented and validated with fixtures.
- [x] Clinical finance UI migrated from Asaas wording to provider-neutral or
      Mercado Pago wording.
- [x] Admin integrations, webhooks, observability, and reconciliation migrated.
- [x] Local fixture tests added.
- [ ] Authorized sandbox validation completed.
- [ ] Production cutover approved.
- [ ] Asaas legacy processing retired after all pending legacy objects close.

Implementation note: code now follows the per-tenant OAuth + Checkout Pro path
for patient charges. SlimHiper platform plan billing remains a separate
platform billing concern and sandbox/cutover validation are still pending.
The migration and provider calls have not been run by this document update.

## Non-Negotiable Rules

- Do not edit old migrations. Create new timestamped migrations for schema
  changes.
- Do not run `supabase db push`, migrations, bootstraps, provider scripts, or
  provider API calls unless the exact command and environment are explicitly
  authorized.
- Do not read or print `.env` values.
- Do not place Mercado Pago access tokens, webhook secrets, OAuth secrets, or
  service-role keys in `NEXT_PUBLIC_*`.
- Do not expose raw provider payloads, provider credentials, patient data, CPF,
  billing identifiers tied to real people, or signed URLs in logs or docs.
- Keep webhooks fail-closed, idempotent, tenant-scoped, and minimally stored.
- Keep Asaas processing available for legacy invoices/subscriptions until the
  cutover window confirms that no pending Asaas financial object remains.
- Keep Rocket scripts in `src/app/layout.tsx` untouched unless a separate task
  explicitly authorizes Rocket governance changes.

## Target Outcome

The target state is not a blind rename from Asaas to Mercado Pago. The target
state is a provider-neutral billing domain with Mercado Pago as the active
provider.

Expected end state:

- Frontend calls provider-neutral billing APIs.
- Database stores provider-neutral identifiers and events.
- Mercado Pago Edge Functions own all provider calls.
- Browser receives only local ids, safe statuses, safe payment links, and safe
  messages.
- Admin and observability screens display provider status without leaking
  secrets or raw payloads.
- Asaas legacy code is frozen, then removed only after the final cleanup phase.

## Product Decision Gate

Mercado Pago has two materially different operating models for this app.
Choose one before implementation.

| Decision                        | When to choose                                                                                | Consequence                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Single SlimHiper seller account | SlimHiper collects all payments centrally and handles settlement internally.                  | Simpler credentials and webhook model. No per-clinic OAuth required.                                      |
| Per-clinic marketplace sellers  | Each clinic must receive funds in its own Mercado Pago account, optionally with platform fee. | Requires OAuth per seller, secure token storage/refresh, seller onboarding, and marketplace fee handling. |

Checklist:

- [ ] Confirm who is the legal seller of record.
- [ ] Confirm whether each clinic needs its own Mercado Pago account.
- [ ] Confirm whether SlimHiper charges a platform fee.
- [ ] Confirm whether split/marketplace accounting is mandatory for MVP.
- [ ] Confirm refund liability owner.
- [ ] Confirm webhook/event retention requirements with legal/security.
- [ ] Confirm whether subscriptions are required on day one or can follow
      one-time payments.

Blocked until answered:

- [x] Tenant OAuth connection design implemented through Next admin routes.
- [x] OAuth credential storage uses encrypted `mercadopago_tenant_accounts`.
- [ ] Marketplace fee payload mapping.
- [x] Admin/clinic integration model for Mercado Pago OAuth status.

## Current Asaas Inventory

The scan found direct Asaas usage across source, Supabase, scripts, tests, docs,
and environment templates. The main replacement points are listed below.

### Frontend Service Layer

Primary file:

- `src/services/billingApi.ts`

Current direct provider actions:

- `createPatientCustomer` checks `financial.asaas` and invokes
  `asaas-create-patient-customer`.
- `createPatientInvoice` invokes `asaas-create-patient-invoice` and expects
  local invoice status plus safe payment links.
- `createPatientSubscription` invokes `asaas-create-patient-subscription`.
- `refundPatientPayment` invokes `asaas-refund-payment`.
- `syncAsaasPayment` invokes `asaas-sync-payment`.
- Mock reconciliation still uses Asaas wording.

Required change:

- [x] Add provider-neutral exports:
  - `createBillingCustomer`
  - `createPatientCharge`
  - `createPatientSubscription`
  - `refundProviderPayment`
  - `syncProviderPayment`
- [x] Keep legacy exports temporarily as wrappers if needed to reduce UI churn.
- [x] Replace `FINANCIAL_ASAAS_DISABLED_MESSAGE` with provider-neutral wording.
- [x] Replace direct function names with provider routing.
- [x] Keep response envelope compatibility: `{ data, error }`.

### Clinical Finance UI

Primary files:

- `src/app/clinic/financeiro/components/ClinicFinanceiroContent.tsx`
- `src/app/paciente-360/components/tabs/TabFinanceiro.tsx`

Current coupling:

- Feature flag `financial.asaas`.
- Labels such as `Operacoes Asaas`, `Eventos Asaas recentes`, and customer
  Asaas language.
- Manual sync calls `syncAsaasPayment`.
- Patient 360 creates invoices/subscriptions/refunds through Asaas-backed
  service functions.

Required change:

- [x] Rename UI labels to `Mercado Pago` or `provedor de pagamento`.
- [x] Replace `canUseAsaas` with provider-neutral entitlement state.
- [x] Replace manual sync action with `syncProviderPayment`.
- [x] Preserve loading, empty, error, disabled, and forbidden states.
- [x] Keep payment link display protected by `asSafePaymentUrl`.
- [ ] Validate target routes in browser after implementation.

### Admin, Webhooks, And Operations UI

Primary files:

- `src/services/adminApi.ts`
- `src/app/api/admin/tenants/route.ts`
- `src/app/api/admin/tenants/[tenantId]/route.ts`
- `src/app/api/admin/tenants/[tenantId]/integrations/route.ts`
- `src/app/api/admin/webhooks/reprocess/route.ts`
- `src/app/admin/components/AdminContent.tsx`
- `src/app/admin/components/AdminOperationsContent.tsx`
- `src/app/admin/webhooks`
- `src/app/admin/observability`

Current coupling:

- `AdminIntegrationProvider = 'asaas' | 'd4sign'`.
- Webhook reprocess accepts only `asaas` or `d4sign`.
- Tenant creation seeds `settings.integrations.asaas`.
- Admin cards and summaries show Asaas status labels.
- Operational console branches on provider `asaas`.

Required change:

- [x] Add `mercadopago` to admin provider unions.
- [x] Decide whether admin display names use `Mercado Pago` while API values
      use `mercadopago`.
- [x] Add tenant integration settings for Mercado Pago.
- [x] Preserve legacy `asaas` status while migration is in progress.
- [x] Update webhook reprocess RPC/API to accept Mercado Pago events.
- [x] Update observability cards and counters to group by provider.

### Database And Migrations

Primary migrations:

- `supabase/migrations/20260530125000_050_billing_asaas.sql`
- `supabase/migrations/20260531165000_130_billing_reconciliation_contract.sql`
- `supabase/migrations/20260605170000_200_provider_production_hardening.sql`
- `supabase/migrations/20260607110000_340_finance_m13_receipts_refunds_reconciliation.sql`
- `supabase/migrations/20260607170000_370_operational_jobs_cron_observability.sql`
- `supabase/migrations/20260607170500_371_operational_jobs_cron_observability_fix.sql`
- `supabase/migrations/20260613120000_410_platform_admin_operational_console.sql`

Current coupling:

- Provider check constraints allow only `asaas` in billing tables.
- Asaas-specific tables and columns:
  - `asaas_subaccounts`
  - `asaas_events`
  - `asaas_customer_id`
  - `asaas_invoice_id`
  - `asaas_payment_id`
  - `asaas_subscription_id`
  - `asaas_payment_link_id`
- Reconciliation and observability read `asaas_events`.
- Admin webhook views union Asaas and D4Sign.
- Refunds default provider to `asaas`.

Required migration strategy:

- [x] Create a new timestamped migration.
- [x] Add provider-neutral columns without dropping legacy Asaas columns.
- [x] Relax provider checks to include `mercadopago`.
- [x] Create a generic provider event table or equivalent compatibility view.
- [x] Backfill generic provider columns from Asaas columns for existing rows.
- [x] Update RLS and grants for any new table.
- [x] Update reconciliation RPCs to group by `provider`.
- [x] Keep compatibility views for Asaas until cleanup.

Recommended generic columns:

| Table                         | New columns                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant_billing_accounts`     | allow `provider = 'mercadopago'`; add marketplace/OAuth metadata only if needed                                                                                      |
| `patient_customers`           | `provider`, `provider_customer_id`                                                                                                                                   |
| `patient_invoices`            | `provider`, `provider_invoice_id`, `provider_payment_id`, `provider_preference_id`                                                                                   |
| `patient_subscriptions`       | `provider`, `provider_subscription_id`, `provider_plan_id`                                                                                                           |
| `payment_links`               | `provider`, `provider_payment_link_id`, `provider_preference_id`                                                                                                     |
| `payments`                    | `provider`, `provider_payment_id`                                                                                                                                    |
| `billing_refunds`             | `provider`, `provider_refund_id`                                                                                                                                     |
| new `billing_provider_events` | `provider`, `provider_event_id`, `event_type`, `resource_type`, `resource_id`, `tenant_id`, `status`, `error_code`, `idempotency_key`, `payload_summary`, timestamps |

Minimum indexing:

- [x] Unique `(provider, provider_event_id)` where `provider_event_id is not null`.
- [x] Unique `(provider, idempotency_key)` where `idempotency_key is not null`.
- [x] Index `(tenant_id, provider, created_at desc)`.
- [x] Index provider ids used by sync/webhook lookup.
- [x] Preserve existing Asaas indexes during migration.

### Edge Functions

Current Asaas functions:

- `supabase/functions/asaas-create-tenant-subaccount`
- `supabase/functions/asaas-create-patient-customer`
- `supabase/functions/asaas-create-patient-invoice`
- `supabase/functions/asaas-create-patient-subscription`
- `supabase/functions/asaas-refund-payment`
- `supabase/functions/asaas-sync-payment`
- `supabase/functions/webhook-asaas`

Required Mercado Pago functions:

- [x] `supabase/functions/mercadopago-create-patient-customer`
  - Optional for Checkout Pro MVP.
  - Required if storing Mercado Pago customer objects or moving to transparent
    checkout/card vault flows.
- [x] `supabase/functions/mercadopago-create-patient-invoice`
  - Creates Checkout Pro preference.
  - Stores `preference_id` and safe payment link.
  - Does not expose raw Mercado Pago response to browser.
- [x] `supabase/functions/mercadopago-create-patient-subscription`
  - Creates preapproval/subscription.
  - Stores preapproval id and safe init point.
- [x] `supabase/functions/mercadopago-refund-payment`
  - Sends idempotent refund request.
  - Updates local refund state safely.
- [x] `supabase/functions/mercadopago-sync-payment`
  - Fetches current provider payment state and updates local invoice/payment.
- [x] `supabase/functions/webhook-mercadopago`
  - Validates signature.
  - Deduplicates events.
  - Fetches provider resource before local state mutation.
  - Stores only minimal event summary.

Shared Edge Function requirements:

- [x] Validate Supabase JWT for browser-invoked billing functions.
- [x] Validate tenant membership and required permissions.
- [x] Use service-role only inside trusted Edge Function code.
- [x] Read Mercado Pago credentials only from server-side Edge Function env.
- [x] Refuse dummy/empty credentials.
- [x] Redact provider error bodies.
- [x] Return safe envelopes only.
- [x] Include idempotency key for provider mutations where supported.
- [x] Use pseudonymous external references, not clinical patient UUIDs when a
      provider-visible reference can avoid direct patient identifiers.

### Scripts And Fixtures

Current scripts:

- `scripts/supabase/test-billing-contract.mjs`
- `scripts/supabase/test-billing-fixtures.mjs`
- `scripts/supabase/test-billing-reconciliation-local-smoke.mjs`
- `scripts/supabase/bootstrap-billing-demo.mjs`

Current fixtures:

- `tests/fixtures/asaas-payment-confirmed.json`
- `tests/fixtures/asaas-payment-overdue.json`
- `tests/fixtures/asaas-payment-cancelled.json`
- `tests/fixtures/asaas-webhook-duplicated.json`
- `tests/fixtures/asaas-invalid-token.json`

Required change:

- [x] Add Mercado Pago fixture files with fake identifiers only.
- [x] Add invalid signature fixture.
- [x] Add duplicate event fixture.
- [x] Add approved, pending, rejected/cancelled, refunded, and chargeback-like
      scenarios if supported by the selected flow.
- [x] Add provider-neutral status mapping tests.
- [ ] Add provider-neutral reconciliation smoke.
- [ ] Keep Asaas fixture tests while legacy support remains.
- [x] Ensure fixture scripts do not call Supabase or Mercado Pago.

### Environment And Safe URLs

Primary files:

- `.env.example`
- `docs/operations/ENVIRONMENT_MATRIX.md`
- `docs/security/ENV_HYGIENE.md`
- `src/lib/safeExternalUrl.ts`

Required variables:

| Variable                                          | Scope                 | Notes                                                                              |
| ------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `MERCADOPAGO_ACCESS_TOKEN`                        | server/Edge only      | Private credential for API calls. Never browser.                                   |
| `MERCADOPAGO_BASE_URL`                            | server/Edge only      | Default target should be `https://api.mercadopago.com`.                            |
| `MERCADOPAGO_WEBHOOK_SECRET`                      | server/Edge only      | Used to validate webhook signature.                                                |
| `MERCADOPAGO_TOKEN_ENCRYPTION_KEY`                | server/Edge only      | 32-byte AES-GCM key for encrypted tenant OAuth tokens.                             |
| `MERCADOPAGO_PUBLIC_KEY`                          | public only if needed | Only for frontend SDK/card flows. Not needed for simple Checkout Pro redirect MVP. |
| `MERCADOPAGO_CLIENT_ID`                           | server only           | Marketplace/OAuth only.                                                            |
| `MERCADOPAGO_CLIENT_SECRET`                       | server only           | Marketplace/OAuth only.                                                            |
| `MERCADOPAGO_OAUTH_REDIRECT_URL`                  | server/admin config   | Marketplace/OAuth only.                                                            |
| `MERCADOPAGO_OAUTH_TEST_TOKEN`                    | server/admin config   | Optional sandbox OAuth token flag.                                                 |
| `REQUIRE_MERCADOPAGO_PROVIDER_SUCCESS`            | scripts               | Strict sandbox contract gate, matching current Asaas pattern.                      |
| `ALLOW_MERCADOPAGO_PROVIDER_CONTRACT_NON_SANDBOX` | scripts               | Explicit override for non-sandbox provider contract.                               |

Checklist:

- [x] Add names to `.env.example` with empty values only.
- [x] Update environment matrix.
- [x] Update env hygiene docs.
- [x] Add Mercado Pago payment hosts to `safeExternalUrl.ts` after confirming
      returned `init_point` hosts for the selected country/account.
- [x] Do not use broad wildcard URL allowlists.

## Mercado Pago Target Contract

The target contract below is based on official Mercado Pago documentation. Re-
check the official docs before implementation and before production cutover.

Official references:

- Checkout Pro create preference:
  `https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro/preferences/create-preference/post`
- Checkout Pro payment notifications:
  `https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications`
- Get payment:
  `https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api-payments/get-payment/get`
- Create refund:
  `https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api-payments/create-refund/post`
- Subscriptions/preapproval:
  `https://www.mercadopago.com.br/developers/en/reference/online-payments/subscriptions/create-preapproval/post`
- Credentials:
  `https://www.mercadopago.com.br/developers/en/docs/your-integrations/credentials`
- Test accounts:
  `https://www.mercadopago.com.br/developers/en/docs/your-integrations/test/accounts`
- Marketplace:
  `https://www.mercadopago.com.br/developers/en/docs/checkout-pro/how-tos/integrate-marketplace`
- OAuth token:
  `https://www.mercadopago.com.br/developers/en/reference/authentication/oauth/_oauth_token/post`

### One-Time Charge

Recommended MVP path:

- Use Checkout Pro preference creation.
- Store local invoice first.
- Send Mercado Pago an `external_reference` that maps to local billing reference.
- Store returned preference id and safe payment link.
- Resolve final provider payment id from webhook/sync.

Checklist:

- [ ] Decide item description format.
- [ ] Decide whether payer email/name/document are sent.
- [ ] Decide back URLs.
- [x] Configure `notification_url`.
- [ ] Include `external_reference`.
- [ ] Store `init_point` or equivalent safe link.
- [ ] Map preference/payment ids to local invoice.

### Subscription

Recommended path:

- Use Mercado Pago preapproval for recurring billing.
- Store provider subscription/preapproval id.
- Process subscription payment events through webhook and sync.

Checklist:

- [ ] Confirm recurrence model: monthly, package-based, open-ended, or fixed.
- [ ] Confirm cancellation flow.
- [ ] Confirm whether subscription plans are needed or direct preapproval is
      sufficient.
- [ ] Confirm trial/discount requirements.
- [ ] Add subscription webhook fixtures.

### Refund

Recommended path:

- Local refund row is created first.
- Edge Function sends `POST /v1/payments/{id}/refunds`.
- Use an idempotency key.
- Update local refund state and payment/invoice state after provider confirms.

Checklist:

- [ ] Full refund supported.
- [ ] Partial refund decision documented.
- [ ] Duplicate refund requests are blocked by local idempotency.
- [ ] Provider errors are redacted.
- [ ] Refund timeline event is written without raw payload.

### Payment Sync

Recommended path:

- Resolve local invoice to provider payment id.
- Fetch payment from Mercado Pago.
- Map status to local invoice/payment state.
- Record sync job status and errors.

Checklist:

- [ ] Sync refuses invoices without provider payment id unless preference lookup
      strategy is implemented.
- [ ] Sync cannot cross tenants.
- [ ] Sync writes audit/timeline summary.
- [ ] Sync stores only safe provider summary.

### Webhook

Recommended path:

- `webhook-mercadopago` has `verify_jwt = false` because provider webhooks do
  not send Supabase JWT.
- Signature validation must be fail-closed.
- Deduplicate before local state mutation.
- Fetch the notified resource from Mercado Pago before trusting state changes.
- Return a success HTTP status only after the event is safely accepted or safely
  identified as duplicate.

Checklist:

- [x] Add `supabase/functions/webhook-mercadopago/config.toml`.
- [x] Validate `x-signature`.
- [x] Validate `x-request-id`.
- [x] Validate notification resource id such as `data.id`.
- [x] Reject malformed payloads.
- [x] Reject invalid signatures.
- [x] Deduplicate by `(provider, provider_event_id)` or idempotency hash.
- [x] Fetch current provider resource.
- [x] Resolve tenant through local invoice/payment/subscription mapping.
- [x] Update local invoice/payment/subscription in one controlled flow.
- [x] Insert timeline/audit summary.
- [x] Never log raw webhook body in production.

## Status Mapping

Final mapping must be confirmed against the selected Mercado Pago flow and
fixtures. Initial target mapping:

| Mercado Pago status | Local invoice status    | Local payment status | Financial state        | Notes                                                |
| ------------------- | ----------------------- | -------------------- | ---------------------- | ---------------------------------------------------- |
| `approved`          | `paid`                  | `paid`               | `settled`              | Payment accepted.                                    |
| `pending`           | `pending`               | `pending`            | `pending`              | Awaiting payment or processing.                      |
| `in_process`        | `pending`               | `pending`            | `pending`              | Do not mark as paid.                                 |
| `authorized`        | `pending`               | `authorized`         | `pending`              | Only if flow uses authorization/capture.             |
| `rejected`          | `cancelled` or `failed` | `failed`             | `attention`            | Product must choose local invoice behavior.          |
| `cancelled`         | `cancelled`             | `cancelled`          | `attention`            | Must not create duplicate replacement automatically. |
| `refunded`          | `refunded`              | `refunded`           | `settled_or_attention` | Depends on full vs partial refund.                   |
| `charged_back`      | `chargeback`            | `chargeback`         | `attention`            | Requires operational review.                         |

Checklist:

- [ ] Confirm actual statuses returned by fixtures/test account.
- [ ] Add unit/fixture coverage for every mapped status.
- [ ] Decide partial refund local status.
- [ ] Decide chargeback timeline and admin alert behavior.
- [ ] Update reconciliation RPCs to flag unknown statuses.

## Implementation Phases

### Phase 0 - Discovery And Decision

Goal: freeze requirements before schema/code work.

Checklist:

- [ ] Confirm single seller vs marketplace.
- [ ] Confirm Checkout Pro redirect MVP vs transparent checkout.
- [ ] Confirm subscriptions on day one.
- [ ] Confirm refund requirements.
- [ ] Confirm provider-visible PII policy.
- [ ] Confirm expected payment link hosts.
- [ ] Confirm staging/test account strategy.
- [ ] Confirm rollout owner and rollback owner.

Exit criteria:

- [ ] Product decision gate completed.
- [ ] Security owner approves credential model.
- [ ] Finance/ops owner approves status mapping assumptions.

### Phase 1 - Provider-Neutral Schema Foundation

Goal: add generic provider support while preserving Asaas compatibility.

Checklist:

- [ ] Create new migration.
- [ ] Add generic provider ids/columns.
- [ ] Add generic provider events table or compatibility layer.
- [ ] Relax provider constraints.
- [ ] Add RLS policies and grants.
- [ ] Backfill generic columns from existing Asaas columns.
- [ ] Update reconciliation SQL/RPCs.
- [ ] Update admin webhook/reprocess SQL/RPCs.
- [ ] Update cron/job observability labels from Asaas-only to provider-aware.

Checks:

- [ ] `git diff --check`
- [ ] `npm run type-check`
- [ ] `npm run build`
- [ ] Supabase local migration checks only if explicitly authorized.

Exit criteria:

- [ ] Existing Asaas fixture/reconciliation tests still pass.
- [ ] New schema supports `provider = 'mercadopago'`.
- [ ] No old migration was edited.

### Phase 2 - Service Contract Refactor

Goal: make frontend billing code provider-neutral before Mercado Pago behavior
is wired into UI.

Checklist:

- [ ] Add provider-neutral service function names.
- [ ] Keep temporary legacy wrappers.
- [ ] Add provider selection helper.
- [ ] Replace `financial.asaas` gate or add compatibility resolver.
- [ ] Replace Asaas disabled message.
- [ ] Preserve `{ data, error }` envelopes.
- [ ] Add mock data updates for provider-neutral wording.

Checks:

- [ ] `git diff --check`
- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run build`

Exit criteria:

- [ ] UI compiles while still using Asaas legacy implementation.
- [ ] No browser code receives provider secrets.

### Phase 3 - Mercado Pago Edge Functions

Goal: implement server-side Mercado Pago calls with safe contracts.

Checklist:

- [ ] Add shared Mercado Pago helper for env validation, fetch, redaction,
      idempotency, and status mapping.
- [ ] Implement create invoice/preference function.
- [ ] Implement subscription/preapproval function if in scope.
- [ ] Implement refund function.
- [ ] Implement sync function.
- [ ] Implement webhook function.
- [ ] Add function configs.
- [ ] Add safe response envelopes.
- [ ] Add local unit/fixture coverage where practical.

Checks:

- [ ] `git diff --check`
- [ ] `npm run type-check`
- [ ] `npm run build`
- [ ] Fixture scripts only; no provider calls unless explicitly authorized.

Exit criteria:

- [ ] Functions fail closed with missing/dummy env.
- [ ] Functions reject unauthenticated browser calls where JWT is required.
- [ ] Webhook rejects invalid signatures.
- [ ] No raw provider payload is stored outside approved summary fields.

### Phase 4 - UI/Admin Migration

Goal: move user-facing and admin-facing surfaces to Mercado Pago/provider-
neutral workflows.

Checklist:

- [ ] Update `/clinic/financeiro`.
- [ ] Update `/paciente-360` finance tab.
- [ ] Update `/admin/billing`.
- [ ] Update `/admin/integrations`.
- [ ] Update `/admin/webhooks`.
- [ ] Update `/admin/observability`.
- [ ] Update API routes for integration providers.
- [ ] Update disabled/error/loading/empty states.
- [ ] Update safe link handling.

Checks:

- [ ] `git diff --check`
- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Start `npm run dev` and inspect relevant routes when practical.

Exit criteria:

- [ ] No Asaas wording remains in active Mercado Pago user flows.
- [ ] Legacy Asaas wording remains only where explicitly labeled as legacy.
- [ ] Payment links render only if safe URL validation accepts the host.

### Phase 5 - Tests, Fixtures, And Documentation

Goal: make the new provider contract repeatable without real provider calls.

Checklist:

- [ ] Add Mercado Pago fixture files.
- [ ] Add fixture-only script or extend billing fixture script.
- [ ] Add provider-neutral reconciliation smoke.
- [ ] Update `docs/testing/CONTRACT_TESTS.md`.
- [ ] Update `docs/operations/ENVIRONMENT_MATRIX.md`.
- [ ] Update `docs/security/ENV_HYGIENE.md`.
- [ ] Add or update Mercado Pago runbook.
- [ ] Update README links after the new runbook becomes canonical.

Checks:

- [ ] `git diff --check`
- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] New fixture scripts.

Exit criteria:

- [ ] New fixture tests pass without Mercado Pago credentials.
- [ ] Docs clearly separate fixture, sandbox, and production validation.

### Phase 6 - Authorized Sandbox Validation

Goal: validate against Mercado Pago test/sandbox accounts in a controlled
environment.

Do not execute this phase without explicit authorization for the exact
environment and commands.

Checklist:

- [ ] Configure staging/local sandbox credentials in secure secret store.
- [ ] Confirm `NEXT_PUBLIC_USE_MOCK_DATA=false` for staging validation.
- [ ] Create test patient/tenant data with dummy identity.
- [ ] Create one-time payment preference.
- [ ] Open payment link manually and complete test payment.
- [ ] Receive webhook.
- [ ] Confirm local invoice/payment status updates.
- [ ] Run manual sync and confirm idempotent behavior.
- [ ] Create subscription/preapproval if in scope.
- [ ] Execute refund if in scope.
- [ ] Validate duplicate webhook fixture or provider resend behavior.
- [ ] Redact evidence before sharing.

Checks:

- [ ] Authorized Mercado Pago sandbox contract command.
- [ ] Browser smoke for `/clinic/financeiro`.
- [ ] Browser smoke for Patient 360 finance tab.
- [ ] Admin webhook/event inspection.

Exit criteria:

- [ ] Payment creation, webhook, sync, and refund pass in sandbox.
- [ ] No secret, raw payload, CPF, or real patient data appears in logs.
- [ ] Reconciliation reports no unexplained divergence.

### Phase 7 - Production Cutover

Goal: switch new payment creation to Mercado Pago while safely draining Asaas.

Checklist:

- [ ] Announce freeze window.
- [ ] Disable new Asaas payment creation.
- [ ] Keep Asaas webhook/sync/refund processing active for legacy objects.
- [ ] Enable Mercado Pago provider flag.
- [ ] Confirm Mercado Pago production secrets are configured only in secure
      backend/Edge environments.
- [ ] Confirm webhook URL is configured in Mercado Pago.
- [ ] Confirm safe URL hosts for production payment links.
- [ ] Create a controlled production smoke payment if approved.
- [ ] Monitor webhook events, reconciliation, admin alerts, and user reports.
- [ ] Keep rollback path ready.

Go/no-go checklist:

- [ ] Security approval.
- [ ] Finance approval.
- [ ] Operations/on-call approval.
- [ ] Product approval.
- [ ] Engineering approval.
- [ ] Rollback owner available.

Exit criteria:

- [ ] New production charges use Mercado Pago.
- [ ] Asaas receives no new charge/subscription creation.
- [ ] Legacy Asaas events continue to reconcile.

### Phase 8 - Legacy Cleanup

Goal: remove Asaas only after operational drain is complete.

Checklist:

- [ ] Confirm no pending Asaas invoices.
- [ ] Confirm no active Asaas subscriptions.
- [ ] Confirm no unresolved Asaas refunds.
- [ ] Confirm no unresolved Asaas webhook events.
- [ ] Archive Asaas runbook as legacy.
- [ ] Remove legacy wrappers.
- [ ] Remove Asaas-only UI labels and admin paths.
- [ ] Remove Asaas function deploys only after retention/governance approval.
- [ ] Remove Asaas secrets from secret stores.
- [ ] Keep historical ids if required for audit/accounting.

Exit criteria:

- [ ] Asaas code is either removed or clearly isolated as read-only legacy.
- [ ] Historical reporting still works.
- [ ] Provider-neutral docs are canonical.

## Rollback Plan

Rollback must be possible until the production cutover is declared stable.

Rollback checklist:

- [ ] Disable Mercado Pago new charge creation flag.
- [ ] Re-enable Asaas new charge creation only if secrets/routes remain valid
      and finance approves.
- [ ] Keep Mercado Pago webhook active for already-created Mercado Pago
      payments.
- [ ] Do not delete Mercado Pago events or local invoices created during the
      failed cutover.
- [ ] Mark affected invoices as attention/reconciliation-required if provider
      state is uncertain.
- [ ] Run reconciliation in dry-run/inspection mode before any corrective write.
- [ ] Document all affected local invoice ids and provider ids in redacted form.

Rollback is not allowed to:

- [ ] Reuse production secrets in local/preview.
- [ ] Delete provider events to hide duplicates.
- [ ] Create duplicate charges without finance approval.
- [ ] Trust browser-supplied provider ids across tenants.

## Security And Compliance Checklist

- [ ] No Mercado Pago secret in `NEXT_PUBLIC_*`.
- [ ] No service-role import in client components or browser services.
- [ ] Edge Functions validate JWT, tenant membership, and permissions.
- [ ] Webhook validates provider signature fail-closed.
- [ ] Webhook deduplicates before mutation.
- [ ] Raw provider payload storage is avoided unless separately approved.
- [ ] Stored summaries redact PII and provider-sensitive details.
- [ ] Logs redact provider errors.
- [ ] CPF/CNPJ is sent only when required and never stored unnecessarily.
- [ ] Provider-visible references avoid clinical UUIDs when pseudonymous
      financial references are available.
- [ ] RLS policies cover new tables.
- [ ] Grants match existing finance/admin access patterns.
- [ ] Admin reprocess cannot cross tenants.

## Verification Matrix

| Change type                 | Required checks                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Docs only                   | `git diff --check`                                                                                      |
| TypeScript/service changes  | `git diff --check`, `npm run type-check`, `npm run build`                                               |
| Frontend/UI changes         | `git diff --check`, `npm run type-check`, `npm run lint`, `npm run build`, browser smoke when practical |
| Supabase schema changes     | Above checks plus authorized local migration/test flow                                                  |
| Edge Function changes       | Above checks plus fixture tests; provider sandbox only with explicit authorization                      |
| Provider sandbox validation | Explicitly authorized command/environment, redacted evidence                                            |

## Definition Of Done

The Mercado Pago transition is done only when:

- [ ] Product decision gate is recorded.
- [ ] Provider-neutral schema is live and documented.
- [ ] Mercado Pago Edge Functions create, sync, refund, and process webhooks
      safely.
- [ ] UI and admin surfaces no longer depend on Asaas naming for active flows.
- [ ] Tests cover Mercado Pago fixtures and provider-neutral reconciliation.
- [ ] Environment docs and `.env.example` list Mercado Pago variables with empty
      placeholders only.
- [ ] Staging/sandbox validation is complete with redacted evidence.
- [ ] Production cutover is approved and monitored.
- [ ] Asaas is kept only for legacy drain or fully retired after pending objects
      are closed.
- [ ] No secrets, raw provider payloads, or real patient/provider data were
      printed, committed, or exposed.
