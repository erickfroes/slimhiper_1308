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

Apply migration:

```bash
supabase db push
```

Do not run this command unless the task explicitly authorizes database changes
against the selected Supabase project.

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
- `ASAAS_BASE_URL` (optional, default `https://api.asaas.com/v3`)
- `ASAAS_WEBHOOK_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY` (webhook only)

Never place these in `NEXT_PUBLIC_*`.

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

Confirm whether webhook deployment needs JWT verification disabled for the
target environment before deploying.

## Idempotency

Webhook events are deduplicated by SHA-256 hash in `billing_webhook_events`.
The local fixture test computes the same hash shape from the JSON payload and
asserts that `asaas-webhook-duplicated.json` matches the confirmed-payment
payload hash.

## Webhook Status Mapping Contract

Local fixtures assert this minimum provider-to-internal mapping:

| Asaas event | Invoice status | Payment status | Financial state | Timeline event |
| --- | --- | --- | --- | --- |
| `PAYMENT_CONFIRMED` | `pago` | `paid` | `em_dia` | `pagamento_recebido` |
| `PAYMENT_RECEIVED` | `pago` | `paid` | `em_dia` | `pagamento_recebido` |
| `PAYMENT_OVERDUE` | `vencido` | `overdue` | `pagamento_atrasado` | `pagamento_atrasado` |
| `PAYMENT_CREATED` | `pendente` | `pending` | `cobranca_pendente` | `pagamento` |
| `PAYMENT_DELETED` / `PAYMENT_CANCELLED` | `cancelado` | `canceled` | `cobranca_pendente` | none |

Current implementation note: `webhook-asaas` records the webhook and emits
timeline rows for confirmed/received, overdue, and created events. It does not
yet update `patient_invoices`/`payments` status rows or emit a cancelled-payment
timeline event. Treat those as next hardening work for the real webhook
implementation, not as fixture-only behavior.

## Seed And Contract Test

Seed/demo:

```bash
node scripts/supabase/bootstrap-billing-demo.mjs
```

Contract test:

```bash
node scripts/supabase/test-billing-contract.mjs
```

Only run these commands when authorized. Billing tests may create provider-side
customers, invoices, or subscriptions depending on configuration.

For local contract validation, prefer:

```bash
node scripts/supabase/test-billing-fixtures.mjs
```

## Security Notes

- Tenant is always resolved from active membership in JWT context, never from
  client payload.
- Webhook tenant resolution is expected to derive tenant/patient from the
  existing invoice/customer records, not trust `externalReference` alone.
- `financial.write` is required for customer, invoice, and subscription
  creation.
- No Asaas API key is persisted in tables or returned by functions.
- Invalid webhook tokens must fail closed before idempotency, tenant resolution,
  or provider payload processing.
- Store only the minimum webhook payload needed for operational support.
- Prefer redacted views or summaries for UI/admin access to webhook events.
- Local fixture scripts must not print raw provider payloads or real identifiers.
