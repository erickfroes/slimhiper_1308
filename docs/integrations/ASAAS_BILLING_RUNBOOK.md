# Asaas Billing Runbook

This runbook covers the billing foundation around Asaas subaccounts, customers,
invoices, subscriptions, and webhook ingestion.

## Scope

Relevant files include:

- `supabase/functions/asaas-create-tenant-subaccount`
- `supabase/functions/asaas-create-patient-customer`
- `supabase/functions/asaas-create-patient-invoice`
- `supabase/functions/asaas-create-patient-subscription`
- `supabase/functions/webhook-asaas`
- `src/services/billingApi.ts`
- `src/app/clinic/financeiro`
- `src/app/admin/billing`
- `src/app/admin/webhooks`
- `supabase/migrations/20260530125000_050_billing_asaas.sql`
- `supabase/migrations/20260530126000_060_contract_views_rpcs.sql`
- `supabase/migrations/20260531090000_070_billing_webhook_security_hardening.sql`
- `scripts/supabase/bootstrap-billing-demo.mjs`
- `scripts/supabase/test-billing-contract.mjs`
- `scripts/supabase/test-billing-fixtures.mjs`
- `tests/fixtures/asaas-payment-confirmed.json`
- `tests/fixtures/asaas-payment-overdue.json`
- `tests/fixtures/asaas-payment-cancelled.json`
- `tests/fixtures/asaas-webhook-duplicated.json`
- `tests/fixtures/asaas-invalid-token.json`

## Local Fixture Contract Checks

Use fixture checks before any sandbox or real-provider validation:

```bash
node scripts/supabase/test-billing-fixtures.mjs
```

This script is offline-only. It does not read secrets, does not call Asaas, does
not call Supabase, and does not write data.

It validates:

- Asaas webhook payload shape for confirmed, overdue, and cancelled payments.
- Internal status mapping for invoice/payment/financial state.
- Timeline event mapping for supported financial events.
- SHA-256 idempotency hash strategy used by `billing_webhook_events`.
- Duplicate webhook detection by matching event hash.
- Expected tenant resolution strategy:
  `patient_invoices.asaas_invoice_id = payload.payment.id`.
- Fail-closed behavior for invalid `asaas-access-token`.

Fixtures use only fake identifiers and a fixture-only token placeholder:

```text
__fixture_valid_asaas_webhook_token__
```

Never reuse fixture placeholders as real provider secrets.

## Setup Flow

Apply the clean schema and bootstrap app data in this order:

```bash
supabase db push
node scripts/supabase/bootstrap-core-auth.mjs
node scripts/supabase/bootstrap-patient360-demo.mjs
node scripts/supabase/bootstrap-document-templates-demo.mjs
node scripts/supabase/bootstrap-billing-demo.mjs
```

Do not run these commands unless the task explicitly authorizes database changes
or data mutations against the selected Supabase project.

## Local Versus Sandbox/Real

Default to local fixture mode for contract work:

```bash
node scripts/supabase/test-billing-fixtures.mjs
```

Use sandbox/real contract checks only after explicit authorization:

```bash
node scripts/supabase/test-billing-contract.mjs
```

The sandbox/real script can invoke Edge Functions that may create customers,
invoices, or subscriptions depending on environment configuration. Do not run it
with production Asaas credentials unless the task explicitly requires that
target.

## Required Edge Function Secrets

Configure server-side only:

- `ASAAS_API_KEY`
- `ASAAS_BASE_URL`
- `ASAAS_WEBHOOK_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY` (webhook only)

Never place these in `NEXT_PUBLIC_*`.
Dummy/placeholder values are treated as missing by Edge Functions and local
contract helpers, so sandbox calls fail closed instead of reaching Asaas with a
fake token or base URL.

For sandbox validation, set `ASAAS_BASE_URL` to the Asaas sandbox API base URL
before running any real/sandbox contract. Do not run
`scripts/supabase/test-billing-contract.mjs` when the target cannot be
classified as sandbox or when the local Edge Runtime does not expose the
required `ASAAS_*` secrets by name.
When `REQUIRE_ASAAS_PROVIDER_SUCCESS=true`, the contract script refuses to run
unless `ASAAS_BASE_URL` is classified as sandbox/local, unless a non-sandbox run
is explicitly authorized through `ALLOW_ASAAS_PROVIDER_CONTRACT_NON_SANDBOX=true`.

## Deploy Functions

- `asaas-create-tenant-subaccount`
- `asaas-create-patient-customer`
- `asaas-create-patient-invoice`
- `asaas-create-patient-subscription`
- `webhook-asaas`

Webhook endpoint:

- `/functions/v1/webhook-asaas`

Expected webhook header:

- `asaas-access-token`

`supabase/config.toml` versions `[functions.webhook-asaas] verify_jwt = false`
because Asaas cannot send a Supabase JWT. Keep this setting limited to webhook
handlers that validate `asaas-access-token` or an equivalent provider secret
before tenant resolution, idempotency, or data writes.

## Idempotency

Webhook events are deduplicated by SHA-256 hash in `billing_webhook_events`.
The local fixture test computes the same hash shape from the JSON payload and
asserts that `asaas-webhook-duplicated.json` matches the confirmed-payment
payload hash.

## Webhook Status Mapping Contract

Local fixtures assert this minimum provider-to-internal mapping:

| Asaas event                             | Invoice status | Payment status | Financial state      | Timeline event       |
| --------------------------------------- | -------------- | -------------- | -------------------- | -------------------- |
| `PAYMENT_CONFIRMED`                     | `pago`         | `paid`         | `em_dia`             | `pagamento_recebido` |
| `PAYMENT_RECEIVED`                      | `pago`         | `paid`         | `em_dia`             | `pagamento_recebido` |
| `PAYMENT_OVERDUE`                       | `vencido`      | `overdue`      | `pagamento_atrasado` | `pagamento_atrasado` |
| `PAYMENT_CREATED`                       | `pendente`     | `pending`      | `cobranca_pendente`  | `pagamento`          |
| `PAYMENT_DELETED` / `PAYMENT_CANCELLED` | `cancelado`    | `canceled`     | `cobranca_pendente`  | none                 |

Implementation note: `webhook-asaas` records an append-only webhook audit row
with a minimized operational payload, deduplicates by SHA-256 event hash,
resolves tenant/patient from `patient_invoices.asaas_invoice_id`, updates
`patient_invoices`, upserts `payments`, and emits timeline rows for
created/received/confirmed/overdue events. Cancelled/deleted payments update
financial rows but intentionally do not emit a new timeline event.

The database stores provider-normalized statuses such as `pending`, `paid`,
`overdue`, and `cancelled`. The frontend contract maps these to Portuguese
domain statuses through `get_patient_financial_summary(...)`.

## Patient Billing Edge Function Contract

Patient billing mutations are browser-accessible only through Edge Functions:

- `asaas-create-patient-customer`
- `asaas-create-patient-invoice`
- `asaas-create-patient-subscription`

The frontend `billingApi` calls `asaas-create-patient-customer` before creating
an invoice or subscription so customer creation is explicit and idempotent.

Current local-safe contract:

- The Edge Function derives tenant context from the requested patient and the
  authenticated user's active membership, not from a tenant id supplied by the
  browser.
- `financial.write` is required before any provider request is attempted.
- Request payloads validate patient id, amount, due date, cycle, and
  description before calling Asaas.
- Direct browser writes to provider-owned billing tables remain blocked. After
  JWT, tenant, membership, and permission checks pass, customer, invoice, and
  subscription rows are persisted by the Edge Function with service-role.
- Creating a new Asaas-ready customer requires `cpf_cnpj`/`cpfCnpj` in the Edge
  Function body. The value is sent to Asaas, but the local database stores only
  `cpf_cnpj_last4` in metadata, not the raw document number.
- Provider errors are redacted to safe codes/messages; raw Asaas error bodies
  are not returned to the browser.
- Browser responses return local IDs and safe links/status only. They do not
  return `asaas_customer_id`, `asaas_invoice_id`, `asaas_subscription_id`, API
  keys, tokens, or raw provider payloads.
- The real/sandbox `test-billing-contract.mjs` script asserts the safe envelope
  and rejects provider IDs in response data, but it must run only after explicit
  authorization because it can call Edge Functions that may call Asaas.
- In the 2026-05-31 local validation pass, Asaas sandbox was classified before
  the call, the Edge Runtime was restarted with values redacted, and
  `REQUIRE_ASAAS_PROVIDER_SUCCESS=true node scripts/supabase/test-billing-contract.mjs`
  passed with a fresh local patient plus dummy `TEST_PATIENT_CPF_CNPJ`. Customer,
  invoice, and subscription all returned 200 through Edge Functions without
  exposing provider IDs to the browser contract.

## Reconciliation Contract

`get_clinic_finance_reconciliation()` returns a safe clinic dashboard contract
after `financial.read` authorization:

- `summary`: divergence counts, failed webhook count, pending/overdue invoice
  counts, unmatched payment count, and `lastCheckedAt`.
- `divergences`: local invoice/payment inconsistencies such as amount mismatch,
  paid invoice without paid payment, paid payment with unpaid invoice, overdue
  invoice without overdue payment, orphan payment, and unresolved Asaas event.
- `recentEvents`: recent Asaas event type/status/error summary for the active
  tenant.

The contract intentionally returns local IDs only and does not include
`asaas_*_id`, wallet IDs, API keys, tokens, or raw provider payloads. It is
consumed by `/clinic/financeiro`.

`asaas-create-tenant-subaccount` follows the same safe-envelope pattern for
tenant billing account creation: it resolves the active tenant from the
authenticated user, requires `financial.write`, reuses an existing subaccount
when present, and returns only local subaccount id/status plus masked wallet id.

## Seed And Contract Test

Seed/demo:

```bash
node scripts/supabase/bootstrap-billing-demo.mjs
```

Contract test:

```bash
node scripts/supabase/test-billing-contract.mjs
```

Strict sandbox provider mode:

```bash
REQUIRE_ASAAS_PROVIDER_SUCCESS=true \
TEST_PATIENT_CPF_CNPJ=12345678909 \
node scripts/supabase/test-billing-contract.mjs
```

Use a fresh local/sandbox `TEST_PATIENT_ID` without an existing customer when
you need to prove customer creation. The CPF/CNPJ above is dummy test data; do
not use real patient documents in shared logs.

Only run these commands when authorized. Billing tests may create provider-side
customers, invoices, or subscriptions depending on configuration.

For local contract validation, prefer:

```bash
node scripts/supabase/test-billing-fixtures.mjs
node scripts/supabase/test-billing-reconciliation-local-smoke.mjs
```

## Security Notes

- Tenant is always resolved from active membership in JWT context, never from
  client payload.
- Webhook tenant resolution is expected to derive tenant/patient from the
  existing invoice/customer records, not trust `externalReference` alone.
- `financial.write` is required for customer, invoice, and subscription
  creation.
- Direct authenticated writes to provider-owned billing tables are revoked by
  `20260531090000_070_billing_webhook_security_hardening.sql`; provider
  mutations should go through Edge Functions or reviewed RPCs.
- No Asaas API key is persisted in tables or returned by functions.
- Invalid webhook tokens must fail closed before idempotency, tenant resolution,
  or provider payload processing.
- Store only the minimum webhook payload needed for operational support; the
  current webhook audit row keeps event identifiers, payment status/type,
  amount cents, due date, and event hash instead of raw provider bodies.
- Prefer redacted views or summaries for UI/admin access to webhook events.
- Local fixture scripts must not print raw provider payloads or real identifiers.
