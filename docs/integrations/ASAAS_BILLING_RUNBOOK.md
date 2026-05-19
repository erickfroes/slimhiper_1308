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

## Setup Flow

Apply migration:

```bash
supabase db push
```

Do not run this command unless the task explicitly authorizes database changes
against the selected Supabase project.

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

## Security Notes

- Tenant is always resolved from active membership in JWT context, never from
  client payload.
- `financial.write` is required for customer, invoice, and subscription
  creation.
- No Asaas API key is persisted in tables or returned by functions.
- Store only the minimum webhook payload needed for operational support.
- Prefer redacted views or summaries for UI/admin access to webhook events.
