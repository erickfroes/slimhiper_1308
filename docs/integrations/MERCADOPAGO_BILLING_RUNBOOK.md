# Mercado Pago Billing Runbook

Last updated: 2026-06-18

This runbook covers the provider-neutral Mercado Pago billing integration. It
does not authorize provider API calls, migrations, bootstraps, or production
cutover by itself.

## Active Scope

- MVP flow: single SlimHiper seller account with Checkout Pro redirect.
- One-time charges create a local invoice first, then create a Mercado Pago
  preference.
- Webhooks and manual sync fetch the Mercado Pago payment before mutating local
  invoice/payment state.
- Refunds require a resolved Mercado Pago payment id.
- Asaas remains available only for legacy drain until a separate cleanup phase.

Marketplace/OAuth, split payments, per-clinic sellers, and card vault flows are
out of scope until product/security explicitly approve them.

## Secrets

Server/Edge only:

- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_BASE_URL`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `MERCADOPAGO_NOTIFICATION_URL`
- `MERCADOPAGO_CLIENT_ID`
- `MERCADOPAGO_CLIENT_SECRET`
- `MERCADOPAGO_OAUTH_REDIRECT_URL`

Public key:

- `MERCADOPAGO_PUBLIC_KEY` is not required for Checkout Pro redirect MVP. Do not
  expose it to browser code unless a future SDK/card flow is approved.

Never print secrets, raw provider payloads, CPF/CNPJ, real patient data, or
provider identifiers tied to real people in logs or evidence.

## Deploy Order

1. Apply the provider-neutral schema migration in an authorized environment.
2. Deploy Mercado Pago Edge Functions:
   - `mercadopago-create-patient-customer`
   - `mercadopago-create-patient-invoice`
   - `mercadopago-create-patient-subscription`
   - `mercadopago-refund-payment`
   - `mercadopago-sync-payment`
   - `webhook-mercadopago`
3. Configure `webhook-mercadopago` with `verify_jwt = false`.
4. Configure Edge Function secrets in the target Supabase project.
5. Configure the Mercado Pago notification URL only after the webhook URL and
   secret are ready.
6. Enable `financial.mercadopago` for authorized tenants/plans.

Do not remove Asaas functions or secrets until all legacy Asaas invoices,
subscriptions, refunds, and webhook events are drained.

## Local Fixture Validation

Fixture validation is safe and does not call Mercado Pago:

```bash
node scripts/supabase/test-billing-fixtures.mjs
```

The fixtures cover approved, pending, rejected, cancelled, refunded,
chargeback-like, duplicate, and invalid-signature webhook scenarios.

## Authorized Sandbox Validation

Run only after explicit authorization for the exact environment:

```bash
REQUIRE_MERCADOPAGO_PROVIDER_SUCCESS=true \
node scripts/supabase/test-billing-contract.mjs
```

Use test credentials and dummy patient/tenant data only. Mercado Pago may use
the regular API host with `TEST-` credentials; the script refuses non-test
configuration unless the non-sandbox override is explicitly set for an approved
run.

## Webhook Handling

`webhook-mercadopago` must:

- Validate `x-signature`, `x-request-id`, and `data.id` fail-closed.
- Deduplicate before local mutation.
- Fetch `GET /v1/payments/{id}` before trusting payment state.
- Resolve tenant through local provider identifiers or pseudonymous external
  reference.
- Store only sanitized summaries in `billing_provider_events` and
  `billing_webhook_events`.

Malformed payloads, invalid signatures, unsupported resource types, and
unresolved tenants must not mutate invoices or payments.

## Rollback

- Disable new Mercado Pago charge creation through feature flags/config.
- Keep Mercado Pago webhook active for already-created Mercado Pago payments.
- Keep Asaas legacy processing active if rollback requires legacy drain.
- Do not delete provider events or duplicate charges to hide partial cutover
  state.
