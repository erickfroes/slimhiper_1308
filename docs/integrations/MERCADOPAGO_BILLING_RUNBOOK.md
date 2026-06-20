# Mercado Pago Billing Runbook

Last updated: 2026-06-20

This runbook covers the provider-neutral Mercado Pago billing integration. It
does not authorize provider API calls, migrations, bootstraps, or production
cutover by itself.

## Active Scope

- Active flow: tenant sellers connect their Mercado Pago account through OAuth;
  patient charges use Checkout Pro with the connected tenant token.
- SlimHiper platform plan billing remains a separate platform billing concern
  and must not reuse tenant seller OAuth tokens.
- One-time charges create a local invoice first, then create a Mercado Pago
  preference.
- Webhooks and manual sync fetch the Mercado Pago payment before mutating local
  invoice/payment state.
- Refunds require a resolved Mercado Pago payment id.
- Asaas remains available only for legacy drain until a separate cleanup phase.

Split payments, card vault flows, and transparent checkout are out of scope
until product/security explicitly approve them.

## Secrets

Server/Edge only:

- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_BASE_URL`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `MERCADOPAGO_NOTIFICATION_URL`
- `MERCADOPAGO_TOKEN_ENCRYPTION_KEY`
- `MERCADOPAGO_CLIENT_ID`
- `MERCADOPAGO_CLIENT_SECRET`
- `MERCADOPAGO_OAUTH_REDIRECT_URL`
- `MERCADOPAGO_OAUTH_TEST_TOKEN`

Public key:

- `MERCADOPAGO_PUBLIC_KEY` is not required for Checkout Pro redirect MVP. Do not
  expose it to browser code unless a future SDK/card flow is approved.

Never print secrets, raw provider payloads, CPF/CNPJ, real patient data, or
provider identifiers tied to real people in logs or evidence.

`MERCADOPAGO_TOKEN_ENCRYPTION_KEY` must be a 32-byte AES-GCM key. Prefer a
base64 value generated per environment, for example with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
Configure it in Vercel and as a Supabase Edge Function secret.

## Deploy Order

1. Apply the provider-neutral schema migration in an authorized environment.
2. Apply the tenant OAuth schema migration in an authorized environment.
3. Deploy Mercado Pago Edge Functions:
   - `mercadopago-create-patient-customer`
   - `mercadopago-create-patient-invoice`
   - `mercadopago-create-patient-subscription`
   - `mercadopago-refund-payment`
   - `mercadopago-sync-payment`
   - `webhook-mercadopago`
4. Configure `webhook-mercadopago` with `verify_jwt = false`.
5. Configure Edge Function secrets in the target Supabase project.
6. Configure the Mercado Pago OAuth app redirect URL exactly as
   `MERCADOPAGO_OAUTH_REDIRECT_URL`; for this implementation it should point to
   `/api/admin/mercadopago/oauth/callback` on the target app origin.
7. Configure the Mercado Pago notification URL only after the webhook URL and
   secret are ready. The default Supabase Edge Function URL format is
   `https://<project-ref>.supabase.co/functions/v1/webhook-mercadopago`.
8. Enable `financial.mercadopago` for authorized tenants/plans.
9. Connect each tenant from Admin > Tenants > Integrations > Mercado Pago or
   Clinic > Settings > Integrations before creating patient payment links.

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
- Resolve the tenant from the `tenant_id` query parameter added to the
  `notification_url` when the preference is created, then verify the fetched
  payment resolves to a local invoice for the same tenant.
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
