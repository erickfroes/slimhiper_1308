# Mercado Pago Billing Runbook

Last updated: 2026-08-13

This runbook covers the provider-neutral Mercado Pago billing integration. It
does not authorize provider API calls, migrations, bootstraps, or production
cutover by itself.

## Active Scope

- Admin -> tenant: the SlimHiper owner configures one dedicated Mercado Pago
  account in `/admin/billing`. Versioned SaaS plan prices are synchronized as
  `preapproval_plan`; tenant subscriptions use `preapproval` and are projected
  into the platform ledger by a dedicated webhook.
- Tenant -> patient: tenant sellers connect their own Mercado Pago account
  through OAuth. Patient one-time charges use Checkout Pro and recurring
  packages use versioned `preapproval_plan` records with the connected tenant
  token.
- Platform credentials and tenant OAuth tokens are never interchangeable.
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
- `BILLING_CRON_SECRET`

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

1. Back up and validate the target database in an authorized change window.
2. Apply the existing provider-neutral/OAuth migrations, followed by:
   - `20260813100000_820_mercadopago_billing_platform_patient.sql`
   - `20260813110000_821_financial_local_consistency.sql`
   - `20260813120000_822_package_billing_versions.sql`
3. Deploy Mercado Pago Edge Functions:
   - `mercadopago-create-patient-customer`
   - `mercadopago-create-patient-invoice`
   - `mercadopago-create-patient-subscription`
   - `mercadopago-refund-payment`
   - `mercadopago-sync-payment`
   - `mercadopago-sync-patient-plan`
   - `webhook-mercadopago`
   - `webhook-mercadopago-platform`
   - `mercadopago-billing-reconcile`
4. Keep `webhook-mercadopago` and `webhook-mercadopago-platform` with
   `verify_jwt = false`. The handlers authenticate the provider signature
   themselves. Keep user-invoked functions JWT protected.
5. Configure Edge Function secrets in the target Supabase project.
6. Configure the Mercado Pago OAuth app redirect URL exactly as
   `MERCADOPAGO_OAUTH_REDIRECT_URL`; for this implementation it should point to
   `/api/admin/mercadopago/oauth/callback` on the target app origin.
7. Configure notification URLs only after the functions and secrets are ready.
   The default Supabase Edge Function URL formats are
   `https://<project-ref>.supabase.co/functions/v1/webhook-mercadopago`.
   and
   `https://<project-ref>.supabase.co/functions/v1/webhook-mercadopago-platform`.
8. Enable `financial.mercadopago` for authorized tenants/plans.
9. Connect each tenant from Admin > Tenants > Integrations > Mercado Pago or
   Clinic > Settings > Integrations before creating patient payment links.
10. In Clinic > Programas, configure package price, cycle, optional trial and
    repetition limit. In Clinic > Financeiro, synchronize the current package
    version before creating patient subscriptions.
11. In `/admin/billing`, configure and validate the platform account, synchronize
    current SaaS price versions, then create tenant authorization checkouts.
12. Schedule `mercadopago-billing-reconcile` with
    `Authorization: Bearer <BILLING_CRON_SECRET>` at least every five minutes.
    This advances grace and suspension rules and retries resumable platform
    events.

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

`webhook-mercadopago-platform` follows the same fail-closed signature contract,
but reads the environment-specific encrypted webhook secret configured in the
admin interface. It stores only a digest and sanitized event summary, fetches
the canonical Mercado Pago resource, and calls the transactional
`apply_platform_mercadopago_event` projection. Processing states are
`received`, `processing`, `processed`, `retryable_failed`, `dead_letter`,
`ignored`, and `rejected`.

## Interface Operations

### Platform owner/admin

- `/admin/billing`: configure/rotate platform credentials, validate the
  connection, set trial/grace values, synchronize plan-price versions, create
  tenant checkout authorization, pause/reactivate/cancel subscriptions,
  reconcile lifecycle state, and inspect sanitized webhook outcomes.
- Only `platform_owner` can store or rotate platform credentials. Platform
  admins can run normal billing operations. Platform support is read-only.
- Every sensitive mutation requires an auditable reason and creates an audit
  event. Credentials are write-only and never returned to the browser.

### Tenant finance team

- Clinic > Settings > Integrations: connect/reconnect the tenant Mercado Pago
  account using OAuth.
- Clinic > Programas: configure package recurring terms. Each commercial change
  creates a new immutable billing version; existing subscriptions keep their
  original version.
- Clinic > Financeiro: synchronize the current package version and inspect sync
  errors.
- Paciente 360 > Financeiro: select a real active package, synchronize it when
  needed, and create the patient authorization checkout.

Required fine-grained permissions are `financial.charge.create`,
`financial.subscription.manage`, `financial.refund.create`,
`financial.integration.manage`, `financial.reconciliation.manage`, and
`financial.webhook.read`.

## Reconciliation And Accounting Rules

- Provider events are acknowledged as complete only after local projection.
- Duplicate provider event/resource combinations are idempotent.
- Manual payments use provider/collection mode `local`; provider-created rows
  use collection mode `provider`.
- Partial payments update `paidAmountCents` but only settle an invoice when the
  aggregate confirmed amount reaches its total.
- Payment reversal or reassignment recalculates both affected invoices.
- Refund validation reserves the remaining balance under a row lock. Final
  projection is transactional, and failed/stale attempts may safely replay the
  same provider idempotency key.
- A receipt approval is terminal and cannot be applied to another patient or
  above the outstanding invoice balance.

## Rollback

- Disable new Mercado Pago charge creation through feature flags/config.
- Disable the platform connection in the database only through an authorized
  operational change; keep both webhooks and reconciliation active while
  outstanding subscriptions drain.
- Keep Mercado Pago webhook active for already-created Mercado Pago payments.
- Keep Asaas legacy processing active if rollback requires legacy drain.
- Do not delete provider events or duplicate charges to hide partial cutover
  state.
