-- Mercado Pago billing control plane.
-- Separates SlimHiper SaaS billing from tenant/patient billing, versions prices,
-- closes tenant writes on SaaS subscriptions and makes provider event processing resumable.

-- ---------------------------------------------------------------------------
-- 1. Fine-grained tenant financial permissions
-- ---------------------------------------------------------------------------

create or replace function security.seed_billing_permissions(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.permissions (tenant_id, code, description)
  values
    (p_tenant_id, 'financial.charge.create', 'Create patient charges'),
    (p_tenant_id, 'financial.subscription.manage', 'Manage patient subscriptions'),
    (p_tenant_id, 'financial.refund.create', 'Create patient refunds'),
    (p_tenant_id, 'financial.integration.manage', 'Manage payment provider connections'),
    (p_tenant_id, 'financial.reconciliation.manage', 'Manage payment reconciliation'),
    (p_tenant_id, 'financial.webhook.read', 'Read sanitized payment webhook status')
  on conflict (tenant_id, code) do update
  set description = excluded.description,
      updated_at = now();

  insert into public.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant_id, r.id, p.id
  from (
    values
      ('tenant_owner', 'financial.charge.create'),
      ('tenant_owner', 'financial.subscription.manage'),
      ('tenant_owner', 'financial.refund.create'),
      ('tenant_owner', 'financial.integration.manage'),
      ('tenant_owner', 'financial.reconciliation.manage'),
      ('tenant_owner', 'financial.webhook.read'),
      ('clinic_admin', 'financial.charge.create'),
      ('clinic_admin', 'financial.subscription.manage'),
      ('clinic_admin', 'financial.refund.create'),
      ('clinic_admin', 'financial.integration.manage'),
      ('clinic_admin', 'financial.reconciliation.manage'),
      ('clinic_admin', 'financial.webhook.read'),
      ('financial_user', 'financial.charge.create'),
      ('financial_user', 'financial.subscription.manage'),
      ('financial_user', 'financial.refund.create'),
      ('financial_user', 'financial.reconciliation.manage'),
      ('financial_user', 'financial.webhook.read'),
      ('financial_user', 'packages.read')
  ) as matrix(role_code, permission_code)
  join public.roles r
    on r.tenant_id = p_tenant_id
   and r.name = matrix.role_code
  join public.permissions p
    on p.tenant_id = p_tenant_id
   and p.code = matrix.permission_code
  on conflict (tenant_id, role_id, permission_id) do nothing;
end;
$$;

select security.seed_billing_permissions(id) from public.tenants;

create or replace function public.seed_new_tenant_billing_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  perform security.seed_billing_permissions(new.id);
  return new;
end;
$$;

drop trigger if exists zz_trg_tenants_seed_billing_permissions on public.tenants;
create trigger zz_trg_tenants_seed_billing_permissions
after insert on public.tenants
for each row execute function public.seed_new_tenant_billing_permissions();

-- SaaS subscriptions are controlled only by the platform backend/admin.
drop policy if exists tenant_subscriptions_write_financial on public.tenant_subscriptions;
drop policy if exists tenant_subscriptions_update_financial on public.tenant_subscriptions;

-- Keep the existing operational SELECT policy, but all mutations now flow
-- through audited service-role APIs/RPCs.

-- ---------------------------------------------------------------------------
-- 2. Versioned SaaS plans and Mercado Pago platform connection
-- ---------------------------------------------------------------------------

create table public.platform_plan_prices (
  id uuid primary key default gen_random_uuid(),
  platform_plan_id uuid not null references public.platform_plans(id) on delete cascade,
  version integer not null check (version > 0),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  billing_cycle text not null check (billing_cycle in ('monthly', 'quarterly', 'yearly')),
  frequency integer not null check (frequency > 0),
  frequency_type text not null check (frequency_type in ('days', 'weeks', 'months')),
  trial_days integer not null default 14 check (trial_days between 0 and 365),
  grace_days integer not null default 7 check (grace_days between 0 and 90),
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_plan_id text,
  provider_status text not null default 'not_synced'
    check (provider_status in ('not_synced', 'syncing', 'active', 'error', 'retired')),
  provider_last_synced_at timestamptz,
  provider_error_code text,
  is_current boolean not null default true,
  effective_from timestamptz not null default now(),
  retired_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_plan_id, version)
);

create unique index idx_platform_plan_prices_current
  on public.platform_plan_prices(platform_plan_id)
  where is_current;
create unique index idx_platform_plan_prices_provider_plan
  on public.platform_plan_prices(provider_plan_id)
  where provider_plan_id is not null;

create or replace function public.capture_platform_plan_price_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version integer;
  v_frequency integer;
begin
  if tg_op = 'UPDATE'
     and new.amount_cents is not distinct from old.amount_cents
     and new.currency is not distinct from old.currency
     and new.billing_cycle is not distinct from old.billing_cycle then
    return new;
  end if;

  update public.platform_plan_prices
  set is_current = false,
      provider_status = case when provider_status = 'active' then 'retired' else provider_status end,
      retired_at = coalesce(retired_at, now()),
      updated_at = now()
  where platform_plan_id = new.id
    and is_current;

  select coalesce(max(version), 0) + 1
    into v_version
  from public.platform_plan_prices
  where platform_plan_id = new.id;

  v_frequency := case new.billing_cycle when 'quarterly' then 3 when 'yearly' then 12 else 1 end;

  insert into public.platform_plan_prices (
    platform_plan_id, version, amount_cents, currency, billing_cycle,
    frequency, frequency_type, is_current, metadata
  ) values (
    new.id, v_version, new.amount_cents, new.currency, new.billing_cycle,
    v_frequency, 'months', true, jsonb_build_object('source', 'platform_plan_version_trigger')
  );

  return new;
end;
$$;

insert into public.platform_plan_prices (
  platform_plan_id, version, amount_cents, currency, billing_cycle,
  frequency, frequency_type, is_current, metadata
)
select
  p.id,
  1,
  p.amount_cents,
  p.currency,
  p.billing_cycle,
  case p.billing_cycle when 'quarterly' then 3 when 'yearly' then 12 else 1 end,
  'months',
  true,
  jsonb_build_object('source', 'billing_platform_backfill')
from public.platform_plans p
where not exists (
  select 1 from public.platform_plan_prices pp where pp.platform_plan_id = p.id
);

drop trigger if exists trg_platform_plan_capture_price on public.platform_plans;
create trigger trg_platform_plan_capture_price
after insert or update of amount_cents, currency, billing_cycle on public.platform_plans
for each row execute function public.capture_platform_plan_price_version();

create table public.platform_billing_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  environment text not null check (environment in ('test', 'production')),
  status text not null default 'not_configured'
    check (status in ('not_configured', 'validating', 'active', 'degraded', 'revoked', 'disabled')),
  application_id text,
  provider_user_id text,
  account_ref_masked text,
  access_token_ciphertext text,
  access_token_iv text,
  webhook_secret_ciphertext text,
  webhook_secret_iv text,
  configured_by uuid references public.profiles(id) on delete set null,
  configured_at timestamptz,
  last_validated_at timestamptz,
  last_webhook_at timestamptz,
  last_reconciled_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment)
);

-- ---------------------------------------------------------------------------
-- 3. Platform subscription ledger
-- ---------------------------------------------------------------------------

alter table public.tenant_subscriptions
  drop constraint if exists tenant_subscriptions_status_check;
alter table public.tenant_subscriptions
  add constraint tenant_subscriptions_status_check
  check (status in (
    'pending_authorization', 'trialing', 'active', 'past_due', 'grace',
    'canceled', 'paused', 'expired'
  ));

alter table public.tenant_subscriptions
  add column if not exists platform_plan_price_id uuid references public.platform_plan_prices(id),
  add column if not exists provider text check (provider is null or provider = 'mercadopago'),
  add column if not exists provider_subscription_id text,
  add column if not exists provider_external_reference text,
  add column if not exists provider_status text,
  add column if not exists checkout_url text,
  add column if not exists payer_email_masked text,
  add column if not exists next_payment_at timestamptz,
  add column if not exists grace_ends_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists last_provider_sync_at timestamptz,
  add column if not exists provider_error_code text;

update public.tenant_subscriptions ts
set platform_plan_price_id = pp.id
from public.platform_plan_prices pp
where pp.platform_plan_id = ts.platform_plan_id
  and pp.is_current
  and ts.platform_plan_price_id is null;

create unique index idx_tenant_subscriptions_provider_id
  on public.tenant_subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;
create unique index idx_tenant_subscriptions_external_reference
  on public.tenant_subscriptions(provider_external_reference)
  where provider_external_reference is not null;
create index idx_tenant_subscriptions_next_payment
  on public.tenant_subscriptions(status, next_payment_at)
  where status in ('trialing', 'active', 'past_due', 'grace');

create table public.platform_subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tenant_subscription_id uuid not null references public.tenant_subscriptions(id) on delete cascade,
  platform_plan_price_id uuid references public.platform_plan_prices(id),
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_invoice_id text,
  provider_payment_id text,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'paid', 'failed', 'canceled', 'refunded', 'chargeback')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  due_at timestamptz,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint platform_subscription_invoices_subscription_same_tenant
    foreign key (tenant_id, tenant_subscription_id)
    references public.tenant_subscriptions(tenant_id, id)
    on delete cascade
);

create unique index idx_platform_subscription_invoices_provider
  on public.platform_subscription_invoices(provider_invoice_id)
  where provider_invoice_id is not null;
create unique index idx_platform_subscription_invoices_payment
  on public.platform_subscription_invoices(provider_payment_id)
  where provider_payment_id is not null;

create table public.platform_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tenant_subscription_id uuid not null references public.tenant_subscriptions(id) on delete cascade,
  platform_invoice_id uuid references public.platform_subscription_invoices(id) on delete set null,
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_payment_id text not null,
  status text not null check (status in ('pending', 'authorized', 'paid', 'failed', 'canceled', 'refunded', 'chargeback')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id),
  constraint platform_subscription_payments_subscription_same_tenant
    foreign key (tenant_id, tenant_subscription_id)
    references public.tenant_subscriptions(tenant_id, id)
    on delete cascade,
  constraint platform_subscription_payments_invoice_same_tenant
    foreign key (tenant_id, platform_invoice_id)
    references public.platform_subscription_invoices(tenant_id, id)
    on delete set null (platform_invoice_id)
);

create table public.platform_billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.platform_billing_connections(id) on delete set null,
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_event_id text not null,
  event_type text not null,
  resource_type text not null,
  resource_id text not null,
  signature_valid boolean not null,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'retryable_failed', 'dead_letter', 'ignored', 'rejected')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  payload_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_summary) = 'object'),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_event_id, resource_type, resource_id)
);

create index idx_platform_billing_webhooks_due
  on public.platform_billing_webhook_events(status, next_attempt_at)
  where status in ('received', 'retryable_failed');

create table public.platform_billing_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('reconcile', 'sync_plan', 'sync_subscription', 'retry_webhook', 'lifecycle')),
  tenant_id uuid references public.tenants(id) on delete cascade,
  tenant_subscription_id uuid references public.tenant_subscriptions(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'retry', 'dead_letter', 'canceled')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  error_code text,
  payload_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_summary) = 'object'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_platform_billing_jobs_due
  on public.platform_billing_jobs(status, next_attempt_at)
  where status in ('queued', 'retry');

-- ---------------------------------------------------------------------------
-- 4. Patient billing provider semantics and resumable events
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array[
    'patient_customers', 'patient_invoices', 'patient_subscriptions',
    'payment_links', 'payments'
  ] loop
    v_constraint := v_table || '_provider_check';
    execute format('alter table public.%I drop constraint if exists %I', v_table, v_constraint);
    execute format(
      'alter table public.%I add constraint %I check (provider in (''local'', ''asaas'', ''mercadopago''))',
      v_table, v_constraint
    );
  end loop;
end $$;

alter table public.patient_invoices
  add column if not exists collection_mode text not null default 'provider'
    check (collection_mode in ('local', 'provider'));
alter table public.patient_subscriptions
  add column if not exists collection_mode text not null default 'provider'
    check (collection_mode in ('local', 'provider'));
alter table public.payments
  add column if not exists collection_mode text not null default 'provider'
    check (collection_mode in ('local', 'provider'));

update public.patient_invoices
set provider = 'local', collection_mode = 'local'
where coalesce(metadata ->> 'provider', '') = 'local'
  and provider_invoice_id is null
  and provider_payment_id is null
  and provider_preference_id is null;

update public.patient_subscriptions
set provider = 'local', collection_mode = 'local'
where coalesce(metadata ->> 'provider', '') = 'local'
  and provider_subscription_id is null;

update public.payments
set provider = 'local', collection_mode = 'local'
where coalesce(metadata ->> 'provider', '') = 'local'
  and provider_payment_id is null;

alter table public.packages
  add column if not exists billing_cycle text not null default 'monthly'
    check (billing_cycle in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  add column if not exists billing_repetitions integer check (billing_repetitions is null or billing_repetitions > 0),
  add column if not exists billing_trial_days integer not null default 0 check (billing_trial_days between 0 and 365),
  add column if not exists provider text check (provider is null or provider = 'mercadopago'),
  add column if not exists provider_plan_id text,
  add column if not exists provider_sync_status text not null default 'not_synced'
    check (provider_sync_status in ('not_synced', 'syncing', 'active', 'error', 'retired')),
  add column if not exists provider_last_synced_at timestamptz,
  add column if not exists provider_error_code text;

create unique index idx_packages_provider_plan
  on public.packages(tenant_id, provider_plan_id)
  where provider_plan_id is not null;

alter table public.patient_subscriptions
  drop constraint if exists patient_subscriptions_status_check;
alter table public.patient_subscriptions
  add constraint patient_subscriptions_status_check
  check (status in ('pending', 'active', 'past_due', 'paused', 'canceled', 'cancelled', 'expired'));

alter table public.billing_provider_events
  drop constraint if exists billing_provider_events_status_check;
alter table public.billing_provider_events
  add constraint billing_provider_events_status_check
  check (status in ('received', 'processing', 'processed', 'retryable_failed', 'failed', 'dead_letter', 'ignored', 'rejected'));
alter table public.billing_provider_events
  add column if not exists signature_valid boolean,
  add column if not exists payload_digest text,
  add column if not exists attempts integer not null default 0 check (attempts between 0 and 20),
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_billing_provider_events_due
  on public.billing_provider_events(status, next_attempt_at)
  where status in ('received', 'retryable_failed');

-- Provider resources are single-ledger objects. These invariants make
-- concurrent webhook delivery converge instead of duplicating financial rows.
create unique index if not exists idx_payments_provider_payment_unique
  on public.payments(provider, provider_payment_id)
  where provider_payment_id is not null;
create unique index if not exists idx_patient_invoices_provider_invoice_unique
  on public.patient_invoices(provider, provider_invoice_id)
  where provider_invoice_id is not null;
create unique index if not exists idx_patient_invoices_provider_preference_unique
  on public.patient_invoices(provider, provider_preference_id)
  where provider_preference_id is not null;
create unique index if not exists idx_patient_subscriptions_provider_subscription_unique
  on public.patient_subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create unique index if not exists idx_billing_refunds_provider_idempotency
  on public.billing_refunds(tenant_id, provider, (metadata ->> 'idempotency_key'))
  where metadata ->> 'idempotency_key' is not null;

-- Preserve the tenant key when nullable children are deleted from composite
-- same-tenant foreign keys.
alter table public.mercadopago_tenant_accounts
  drop constraint if exists mercadopago_tenant_accounts_billing_account_same_tenant;
alter table public.mercadopago_tenant_accounts
  add constraint mercadopago_tenant_accounts_billing_account_same_tenant
  foreign key (tenant_id, tenant_billing_account_id)
  references public.tenant_billing_accounts(tenant_id, id)
  on delete set null (tenant_billing_account_id);

alter table public.payment_receipts
  drop constraint if exists payment_receipts_invoice_same_tenant,
  drop constraint if exists payment_receipts_payment_same_tenant;
alter table public.payment_receipts
  add constraint payment_receipts_invoice_same_tenant
    foreign key (tenant_id, patient_invoice_id)
    references public.patient_invoices(tenant_id, id)
    on delete set null (patient_invoice_id),
  add constraint payment_receipts_payment_same_tenant
    foreign key (tenant_id, payment_id)
    references public.payments(tenant_id, id)
    on delete set null (payment_id);

alter table public.billing_refunds
  drop constraint if exists billing_refunds_invoice_same_tenant,
  drop constraint if exists billing_refunds_payment_same_tenant;
alter table public.billing_refunds
  add constraint billing_refunds_invoice_same_tenant
    foreign key (tenant_id, patient_invoice_id)
    references public.patient_invoices(tenant_id, id)
    on delete set null (patient_invoice_id),
  add constraint billing_refunds_payment_same_tenant
    foreign key (tenant_id, payment_id)
    references public.payments(tenant_id, id)
    on delete set null (payment_id);

-- A paid local/provider payment settles the invoice only when the aggregate paid
-- amount reaches the invoice amount. Reversals and invoice reassignment reconcile
-- both sides instead of leaving an invoice falsely paid.
create or replace function public.reconcile_patient_invoice_balance(
  p_tenant_id uuid,
  p_invoice_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice_amount integer;
  v_paid_amount bigint;
  v_current_status text;
begin
  if p_tenant_id is null or p_invoice_id is null then return; end if;

  select amount_cents, status into v_invoice_amount, v_current_status
  from public.patient_invoices
  where tenant_id = p_tenant_id and id = p_invoice_id
  for update;

  if v_invoice_amount is null then return; end if;

  select coalesce(sum(amount_cents), 0) into v_paid_amount
  from public.payments
  where tenant_id = p_tenant_id
    and patient_invoice_id = p_invoice_id
    and status in ('paid', 'approved');

  update public.patient_invoices
  set status = case
        when v_paid_amount >= v_invoice_amount then 'paid'
        when v_current_status = 'paid' then 'pending'
        else v_current_status
      end,
      paid_at = case
        when v_paid_amount >= v_invoice_amount then coalesce(paid_at, now())
        when v_current_status = 'paid' then null
        else paid_at
      end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('paidAmountCents', v_paid_amount)
  where tenant_id = p_tenant_id and id = p_invoice_id;

  return;
end;
$$;

create or replace function public.reconcile_invoice_from_payments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.reconcile_patient_invoice_balance(old.tenant_id, old.patient_invoice_id);
  elsif tg_op = 'INSERT' then
    perform public.reconcile_patient_invoice_balance(new.tenant_id, new.patient_invoice_id);
  elsif new.tenant_id is distinct from old.tenant_id
     or new.patient_invoice_id is distinct from old.patient_invoice_id then
    perform public.reconcile_patient_invoice_balance(old.tenant_id, old.patient_invoice_id);
    perform public.reconcile_patient_invoice_balance(new.tenant_id, new.patient_invoice_id);
  else
    perform public.reconcile_patient_invoice_balance(new.tenant_id, new.patient_invoice_id);
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.reconcile_patient_invoice_balance(uuid, uuid) from public;

drop trigger if exists trg_payments_reconcile_invoice on public.payments;
create trigger trg_payments_reconcile_invoice
after insert or update of status, amount_cents, patient_invoice_id on public.payments
for each row execute function public.reconcile_invoice_from_payments();

drop trigger if exists trg_payments_reconcile_invoice_delete on public.payments;
create trigger trg_payments_reconcile_invoice_delete
after delete on public.payments
for each row execute function public.reconcile_invoice_from_payments();

create or replace function public.prevent_payment_receipt_terminal_reversal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status in ('approved', 'rejected') and new.status is distinct from old.status then
    raise exception 'payment_receipt_already_reviewed' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payment_receipt_terminal_state on public.payment_receipts;
create trigger trg_payment_receipt_terminal_state
before update of status on public.payment_receipts
for each row execute function public.prevent_payment_receipt_terminal_reversal();

-- ---------------------------------------------------------------------------
-- 5. Transactional platform webhook projection and lifecycle automation
-- ---------------------------------------------------------------------------

create or replace function security.require_billing_service_role()
returns void
language plpgsql
stable
security definer
set search_path = auth, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.reserve_mercadopago_refund(
  p_tenant_id uuid,
  p_patient_id uuid,
  p_invoice_id uuid,
  p_payment_id uuid,
  p_amount_cents integer,
  p_reason text,
  p_requested_by uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_existing public.billing_refunds%rowtype;
  v_refund_id uuid;
  v_local_amount integer;
  v_reserved_amount bigint;
  v_retry_existing boolean := false;
begin
  perform security.require_billing_service_role();
  if p_amount_cents <= 0 or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'invalid_refund_reservation' using errcode = '22023';
  end if;

  select * into v_existing
  from public.billing_refunds
  where tenant_id = p_tenant_id
    and provider = 'mercadopago'
    and metadata ->> 'idempotency_key' = p_idempotency_key
  limit 1
  for update;
  v_retry_existing := v_existing.id is not null and (
    v_existing.status = 'failed'
    or (v_existing.status = 'processing' and v_existing.updated_at < now() - interval '2 minutes')
  );
  if v_existing.id is not null
     and (
       v_existing.amount_cents <> p_amount_cents
       or v_existing.payment_id is distinct from p_payment_id
       or v_existing.patient_invoice_id is distinct from p_invoice_id
     ) then
    raise exception 'refund_idempotency_conflict' using errcode = '22023';
  end if;
  if v_existing.id is not null and not v_retry_existing then
    return jsonb_build_object(
      'refundId', v_existing.id,
      'status', v_existing.status,
      'amountCents', v_existing.amount_cents,
      'processedAt', v_existing.processed_at,
      'reused', true
    );
  end if;

  if p_payment_id is not null then
    select amount_cents into v_local_amount
    from public.payments
    where id = p_payment_id
      and tenant_id = p_tenant_id
      and patient_id = p_patient_id
      and provider = 'mercadopago'
    for update;
  else
    select amount_cents into v_local_amount
    from public.patient_invoices
    where id = p_invoice_id
      and tenant_id = p_tenant_id
      and patient_id = p_patient_id
      and provider = 'mercadopago'
    for update;
  end if;
  if v_local_amount is null then
    raise exception 'refundable_payment_not_found' using errcode = 'P0002';
  end if;

  -- Re-check after the row lock so simultaneous requests cannot over-reserve.
  select * into v_existing
  from public.billing_refunds
  where tenant_id = p_tenant_id
    and provider = 'mercadopago'
    and metadata ->> 'idempotency_key' = p_idempotency_key
  limit 1
  for update;
  v_retry_existing := v_existing.id is not null and (
    v_existing.status = 'failed'
    or (v_existing.status = 'processing' and v_existing.updated_at < now() - interval '2 minutes')
  );
  if v_existing.id is not null
     and (
       v_existing.amount_cents <> p_amount_cents
       or v_existing.payment_id is distinct from p_payment_id
       or v_existing.patient_invoice_id is distinct from p_invoice_id
     ) then
    raise exception 'refund_idempotency_conflict' using errcode = '22023';
  end if;
  if v_existing.id is not null and not v_retry_existing then
    return jsonb_build_object(
      'refundId', v_existing.id,
      'status', v_existing.status,
      'amountCents', v_existing.amount_cents,
      'processedAt', v_existing.processed_at,
      'reused', true
    );
  end if;

  select coalesce(sum(amount_cents), 0) into v_reserved_amount
  from public.billing_refunds
  where tenant_id = p_tenant_id
    and provider = 'mercadopago'
    and status in ('processing', 'succeeded')
    and (v_existing.id is null or id <> v_existing.id)
    and (
      (p_payment_id is not null and payment_id = p_payment_id)
      or (p_payment_id is null and patient_invoice_id = p_invoice_id)
    );

  if p_amount_cents > greatest(v_local_amount - v_reserved_amount, 0) then
    raise exception 'amount_exceeds_refundable_balance' using errcode = '22023';
  end if;

  if v_retry_existing then
    update public.billing_refunds
    set status = 'processing', processed_at = null, error_code = null,
        reason = p_reason, requested_by = p_requested_by, updated_at = now()
    where id = v_existing.id;
    return jsonb_build_object(
      'refundId', v_existing.id,
      'status', 'processing',
      'amountCents', p_amount_cents,
      'previouslyRefundedCents', v_reserved_amount,
      'cumulativeRefundedCents', v_reserved_amount + p_amount_cents,
      'fullRefund', v_reserved_amount + p_amount_cents >= v_local_amount,
      'reused', false,
      'retried', true
    );
  end if;

  insert into public.billing_refunds (
    tenant_id, patient_id, patient_invoice_id, payment_id, provider,
    status, amount_cents, reason, requested_by, metadata
  ) values (
    p_tenant_id, p_patient_id, p_invoice_id, p_payment_id, 'mercadopago',
    'processing', p_amount_cents, p_reason, p_requested_by,
    jsonb_build_object('idempotency_key', p_idempotency_key)
  ) returning id into v_refund_id;

  return jsonb_build_object(
    'refundId', v_refund_id,
    'status', 'processing',
    'amountCents', p_amount_cents,
    'previouslyRefundedCents', v_reserved_amount,
    'cumulativeRefundedCents', v_reserved_amount + p_amount_cents,
    'fullRefund', v_reserved_amount + p_amount_cents >= v_local_amount,
    'reused', false
  );
end;
$$;

create or replace function public.finalize_mercadopago_refund(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_provider_status text,
  p_provider_amount_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_refund public.billing_refunds%rowtype;
  v_payment public.payments%rowtype;
  v_invoice public.patient_invoices%rowtype;
  v_previous_amount bigint := 0;
  v_cumulative_amount bigint;
  v_base_amount integer;
  v_full_refund boolean;
  v_processed_at timestamptz := now();
  v_event_reference text;
begin
  perform security.require_billing_service_role();
  if p_provider_amount_cents <= 0 then
    raise exception 'invalid_provider_refund_amount' using errcode = '22023';
  end if;

  select * into v_refund
  from public.billing_refunds
  where id = p_refund_id and provider = 'mercadopago'
  for update;
  if v_refund.id is null then
    raise exception 'refund_not_found' using errcode = 'P0002';
  end if;
  if p_provider_amount_cents <> v_refund.amount_cents then
    raise exception 'provider_refund_amount_mismatch' using errcode = '22023';
  end if;
  if v_refund.status = 'succeeded' then
    return jsonb_build_object(
      'refundId', v_refund.id,
      'status', 'succeeded',
      'processedAt', v_refund.processed_at,
      'duplicate', true
    );
  end if;
  if v_refund.status <> 'processing' then
    raise exception 'refund_not_processing' using errcode = '55000';
  end if;

  if v_refund.payment_id is not null then
    select * into v_payment
    from public.payments
    where id = v_refund.payment_id
      and tenant_id = v_refund.tenant_id
      and patient_id = v_refund.patient_id
      and provider = 'mercadopago'
    for update;
    v_base_amount := v_payment.amount_cents;
  else
    select * into v_invoice
    from public.patient_invoices
    where id = v_refund.patient_invoice_id
      and tenant_id = v_refund.tenant_id
      and patient_id = v_refund.patient_id
      and provider = 'mercadopago'
    for update;
    v_base_amount := v_invoice.amount_cents;
  end if;
  if v_base_amount is null then
    raise exception 'refundable_payment_not_found' using errcode = 'P0002';
  end if;

  select coalesce(sum(amount_cents), 0) into v_previous_amount
  from public.billing_refunds
  where tenant_id = v_refund.tenant_id
    and provider = 'mercadopago'
    and status = 'succeeded'
    and id <> v_refund.id
    and (
      (v_refund.payment_id is not null and payment_id = v_refund.payment_id)
      or (v_refund.payment_id is null and patient_invoice_id = v_refund.patient_invoice_id)
    );
  v_cumulative_amount := v_previous_amount + v_refund.amount_cents;
  v_full_refund := v_cumulative_amount >= v_base_amount;

  update public.billing_refunds
  set status = 'succeeded', processed_at = v_processed_at,
      provider_refund_id = nullif(btrim(p_provider_refund_id), ''),
      provider_status = coalesce(nullif(btrim(p_provider_status), ''), 'approved'),
      error_code = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_payment_id', coalesce(v_payment.provider_payment_id, v_invoice.provider_payment_id),
        'provider_status', coalesce(nullif(btrim(p_provider_status), ''), 'approved'),
        'provider_amount_cents', p_provider_amount_cents,
        'full_refund', v_full_refund
      ),
      updated_at = v_processed_at
  where id = v_refund.id;

  if v_refund.payment_id is not null then
    update public.payments
    set status = case when v_full_refund then 'refunded' else status end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_refund_id', v_refund.id,
          'refunded_amount_cents', v_cumulative_amount,
          'refund_status', case when v_full_refund then 'full' else 'partial' end
        )
    where id = v_refund.payment_id and tenant_id = v_refund.tenant_id;
  end if;

  if v_refund.patient_invoice_id is not null
     and v_full_refund
     and (
       v_refund.payment_id is null
       or not exists (
         select 1
         from public.payments p
         where p.tenant_id = v_refund.tenant_id
           and p.patient_invoice_id = v_refund.patient_invoice_id
           and p.id <> v_refund.payment_id
           and p.status in ('paid', 'approved')
       )
     ) then
    update public.patient_invoices
    set status = 'refunded',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_refund_id', v_refund.id
        )
    where id = v_refund.patient_invoice_id and tenant_id = v_refund.tenant_id;
  end if;

  v_event_reference := coalesce(
    nullif(btrim(p_provider_refund_id), ''),
    'refund:' || v_refund.id::text
  );
  insert into public.billing_provider_events (
    tenant_id, provider, provider_event_id, event_type, resource_type,
    resource_id, local_invoice_id, status, idempotency_key, payload_summary, processed_at
  ) values (
    v_refund.tenant_id, 'mercadopago', v_event_reference, 'REFUND_CREATED', 'payment',
    coalesce(v_payment.provider_payment_id, v_invoice.provider_payment_id),
    v_refund.patient_invoice_id, 'processed', 'refund:' || v_refund.id::text,
    jsonb_build_object(
      'refund_id', nullif(btrim(p_provider_refund_id), ''),
      'amount_cents', p_provider_amount_cents,
      'provider_status', coalesce(nullif(btrim(p_provider_status), ''), 'approved')
    ),
    v_processed_at
  ) on conflict do nothing;

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, title, description,
    status, status_label, event_at, payload
  ) values (
    v_refund.tenant_id, v_refund.patient_id, 'pagamento', 'financial',
    case when v_full_refund then 'Pagamento estornado' else 'Estorno parcial registrado' end,
    case when v_full_refund
      then 'Estorno financeiro processado pelo provedor.'
      else 'Estorno parcial processado pelo provedor.' end,
    'recorded', case when v_full_refund then 'estornado' else 'parcial' end,
    v_processed_at,
    jsonb_build_object(
      'provider', 'mercadopago', 'refundId', v_refund.id,
      'invoiceId', v_refund.patient_invoice_id, 'paymentId', v_refund.payment_id
    )
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_refund.tenant_id, v_refund.requested_by, 'billing_refund.succeeded',
    'billing_refund', v_refund.id::text,
    jsonb_build_object(
      'provider', 'mercadopago', 'patientId', v_refund.patient_id,
      'invoiceId', v_refund.patient_invoice_id, 'amountCents', v_refund.amount_cents,
      'fullRefund', v_full_refund
    )
  );

  return jsonb_build_object(
    'refundId', v_refund.id,
    'status', 'succeeded',
    'amountCents', v_refund.amount_cents,
    'processedAt', v_processed_at,
    'cumulativeRefundedCents', v_cumulative_amount,
    'fullRefund', v_full_refund,
    'duplicate', false
  );
end;
$$;

create or replace function public.apply_platform_mercadopago_event(
  p_event_id uuid,
  p_resource jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_event public.platform_billing_webhook_events%rowtype;
  v_subscription public.tenant_subscriptions%rowtype;
  v_resource_id text := coalesce(p_resource ->> 'id', '');
  v_external_reference text := coalesce(p_resource ->> 'external_reference', '');
  v_preapproval_id text := coalesce(
    p_resource ->> 'preapproval_id',
    p_resource #>> '{subscription,id}',
    p_resource #>> '{metadata,preapproval_id}',
    case when coalesce(p_resource ->> 'type', '') = 'preapproval' then v_resource_id else null end
  );
  v_provider_status text := lower(coalesce(p_resource ->> 'status', 'pending'));
  v_local_status text;
  v_amount_cents integer := greatest(0, round(coalesce(
    nullif(p_resource ->> 'transaction_amount', '')::numeric,
    nullif(p_resource #>> '{auto_recurring,transaction_amount}', '')::numeric,
    nullif(p_resource ->> 'amount', '')::numeric,
    0
  ) * 100)::integer);
  v_invoice_id uuid;
  v_payment_id text;
  v_trial_days integer := 0;
  v_grace_days integer := 7;
  v_frequency integer := 1;
  v_frequency_type text := 'months';
begin
  perform security.require_billing_service_role();

  select * into v_event
  from public.platform_billing_webhook_events
  where id = p_event_id
  for update;

  if v_event.id is null then
    raise exception 'platform_billing_event_not_found' using errcode = 'P0002';
  end if;
  v_payment_id := coalesce(
    p_resource ->> 'payment_id',
    p_resource #>> '{payment,id}',
    case when v_event.resource_type = 'payment' then v_resource_id else null end,
    ''
  );
  if v_event.status = 'processed' then
    return jsonb_build_object('eventId', v_event.id, 'status', 'processed', 'duplicate', true);
  end if;
  if not v_event.signature_valid then
    update public.platform_billing_webhook_events
    set status = 'rejected', error_code = 'signature_invalid', updated_at = now()
    where id = v_event.id;
    return jsonb_build_object('eventId', v_event.id, 'status', 'rejected');
  end if;

  update public.platform_billing_webhook_events
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where id = v_event.id;

  select * into v_subscription
  from public.tenant_subscriptions ts
  where (v_preapproval_id <> '' and ts.provider_subscription_id = v_preapproval_id)
     or (v_external_reference <> '' and ts.provider_external_reference = v_external_reference)
  order by case when ts.provider_subscription_id = v_preapproval_id then 0 else 1 end
  limit 1
  for update;

  if v_subscription.id is null then
    update public.platform_billing_webhook_events
    set status = 'retryable_failed', error_code = 'subscription_not_resolved',
        next_attempt_at = now() + interval '5 minutes', updated_at = now()
    where id = v_event.id;
    return jsonb_build_object('eventId', v_event.id, 'status', 'retryable_failed');
  end if;

  select coalesce(pp.trial_days, 0), coalesce(pp.grace_days, 7),
         coalesce(pp.frequency, 1), coalesce(pp.frequency_type, 'months')
    into v_trial_days, v_grace_days, v_frequency, v_frequency_type
  from public.platform_plan_prices pp
  where pp.id = v_subscription.platform_plan_price_id;
  v_trial_days := coalesce(v_trial_days, 0);
  v_grace_days := coalesce(v_grace_days, 7);
  v_frequency := coalesce(v_frequency, 1);
  v_frequency_type := coalesce(v_frequency_type, 'months');

  v_local_status := case
    when v_provider_status = 'authorized'
      and v_event.resource_type = 'preapproval'
      and v_trial_days > 0
      and not exists (
        select 1 from public.platform_subscription_payments p
        where p.tenant_subscription_id = v_subscription.id and p.status = 'paid'
      ) then 'trialing'
    when v_provider_status in ('authorized', 'approved', 'processed') then 'active'
    when v_provider_status in ('paused') then 'paused'
    when v_provider_status in ('cancelled', 'canceled') then 'canceled'
    when v_provider_status in ('rejected', 'failed') then 'past_due'
    when v_provider_status in ('pending') then 'pending_authorization'
    else v_subscription.status
  end;

  update public.tenant_subscriptions
  set status = v_local_status,
      provider = 'mercadopago',
      provider_subscription_id = coalesce(nullif(v_preapproval_id, ''), provider_subscription_id),
      provider_status = v_provider_status,
      next_payment_at = coalesce(
        nullif(p_resource ->> 'next_payment_date', '')::timestamptz,
        case
          when v_event.resource_type in ('authorized_payment', 'payment')
            and v_provider_status in ('approved', 'processed') then
            coalesce(
              nullif(p_resource ->> 'debit_date', '')::timestamptz,
              nullif(p_resource ->> 'date_created', '')::timestamptz,
              now()
            ) + case v_frequency_type
              when 'days' then make_interval(days => v_frequency)
              when 'weeks' then make_interval(days => v_frequency * 7)
              else make_interval(months => v_frequency)
            end
          else next_payment_at
        end
      ),
      grace_ends_at = case
        when v_local_status = 'past_due' then coalesce(grace_ends_at, now() + make_interval(days => v_grace_days))
        when v_local_status = 'active' then null
        else grace_ends_at
      end,
      last_provider_sync_at = now(),
      provider_error_code = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'lastProviderEventType', v_event.event_type,
        'lastProviderResourceId', v_resource_id
      )
  where id = v_subscription.id;

  if v_local_status in ('active', 'trialing') then
    update public.tenants
    set status = 'active',
        settings = (coalesce(settings, '{}'::jsonb) - 'billingSuspendedAt' - 'billingSuspensionSource')
          || jsonb_build_object('billingReactivatedAt', now()),
        updated_at = now()
    where id = v_subscription.tenant_id
      and status = 'suspended'
      and settings ->> 'billingSuspensionSource' = 'mercadopago_lifecycle';
  end if;

  if v_event.resource_type in ('authorized_payment', 'payment') then
    insert into public.platform_subscription_invoices (
      tenant_id, tenant_subscription_id, platform_plan_price_id,
      provider_invoice_id, provider_payment_id, status, amount_cents, currency,
      due_at, paid_at, metadata
    ) values (
      v_subscription.tenant_id,
      v_subscription.id,
      v_subscription.platform_plan_price_id,
      case when v_event.resource_type = 'authorized_payment' then v_resource_id else null end,
      nullif(v_payment_id, ''),
      case
        when v_provider_status in ('approved', 'processed') then 'paid'
        when v_provider_status = 'authorized' then 'authorized'
        when v_provider_status in ('rejected', 'failed') then 'failed'
        when v_provider_status in ('cancelled', 'canceled') then 'canceled'
        when v_provider_status = 'refunded' then 'refunded'
        else 'pending'
      end,
      v_amount_cents,
      coalesce(nullif(p_resource ->> 'currency_id', ''), 'BRL'),
      coalesce(nullif(p_resource ->> 'debit_date', '')::timestamptz, nullif(p_resource ->> 'date_created', '')::timestamptz),
      case when v_provider_status in ('approved', 'processed') then now() else null end,
      jsonb_build_object('providerStatus', v_provider_status)
    )
    on conflict (provider_payment_id) where provider_payment_id is not null
    do update set
      provider_payment_id = coalesce(excluded.provider_payment_id, public.platform_subscription_invoices.provider_payment_id),
      status = excluded.status,
      amount_cents = greatest(excluded.amount_cents, public.platform_subscription_invoices.amount_cents),
      paid_at = coalesce(public.platform_subscription_invoices.paid_at, excluded.paid_at),
      updated_at = now()
    returning id into v_invoice_id;

    if v_payment_id <> '' then
      insert into public.platform_subscription_payments (
        tenant_id, tenant_subscription_id, platform_invoice_id, provider_payment_id,
        status, amount_cents, currency, paid_at, metadata
      ) values (
        v_subscription.tenant_id,
        v_subscription.id,
        v_invoice_id,
        v_payment_id,
        case
          when v_provider_status in ('approved', 'processed') then 'paid'
          when v_provider_status = 'authorized' then 'authorized'
          when v_provider_status in ('rejected', 'failed') then 'failed'
          when v_provider_status in ('cancelled', 'canceled') then 'canceled'
          when v_provider_status = 'refunded' then 'refunded'
          else 'pending'
        end,
        v_amount_cents,
        coalesce(nullif(p_resource ->> 'currency_id', ''), 'BRL'),
        case when v_provider_status in ('approved', 'processed') then now() else null end,
        jsonb_build_object('providerStatus', v_provider_status)
      )
      on conflict (provider, provider_payment_id)
      do update set
        status = excluded.status,
        amount_cents = greatest(excluded.amount_cents, public.platform_subscription_payments.amount_cents),
        paid_at = coalesce(public.platform_subscription_payments.paid_at, excluded.paid_at),
        platform_invoice_id = coalesce(excluded.platform_invoice_id, public.platform_subscription_payments.platform_invoice_id),
        updated_at = now();
    end if;
  end if;

  update public.platform_billing_webhook_events
  set status = 'processed', processed_at = now(), error_code = null, updated_at = now()
  where id = v_event.id;

  update public.platform_billing_connections
  set last_webhook_at = now(), status = 'active', error_code = null, error_message = null
  where id = v_event.connection_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_subscription.tenant_id,
    null,
    'platform_billing.webhook_processed',
    'tenant_subscription',
    v_subscription.id::text,
    jsonb_build_object('eventType', v_event.event_type, 'providerStatus', v_provider_status)
  );

  return jsonb_build_object(
    'eventId', v_event.id,
    'status', 'processed',
    'tenantId', v_subscription.tenant_id,
    'subscriptionId', v_subscription.id
  );
exception when others then
  update public.platform_billing_webhook_events
  set status = case when attempts >= 9 then 'dead_letter' else 'retryable_failed' end,
      attempts = least(attempts + 1, 20),
      error_code = 'projection_failed',
      next_attempt_at = now() + make_interval(secs => least(3600, (2 ^ least(attempts + 1, 10))::integer * 30)),
      updated_at = now()
  where id = p_event_id;
  return jsonb_build_object(
    'eventId', p_event_id,
    'status', 'retryable_failed',
    'errorCode', 'projection_failed'
  );
end;
$$;

create or replace function public.apply_platform_billing_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_past_due integer;
  v_suspended integer;
begin
  perform security.require_billing_service_role();

  update public.tenant_subscriptions ts
  set status = 'past_due',
      grace_ends_at = coalesce(ts.grace_ends_at, now() + make_interval(days => coalesce(pp.grace_days, 7))),
      updated_at = now()
  from public.platform_plan_prices pp
  where pp.id = ts.platform_plan_price_id
    and ts.status in ('active', 'trialing')
    and ts.next_payment_at is not null
    and ts.next_payment_at < now()
    and not exists (
      select 1 from public.platform_subscription_payments p
      where p.tenant_subscription_id = ts.id
        and p.status = 'paid'
        and p.paid_at >= ts.next_payment_at - interval '1 day'
    );
  get diagnostics v_past_due = row_count;

  update public.tenants t
  set status = 'suspended',
      settings = coalesce(t.settings, '{}'::jsonb) || jsonb_build_object(
        'billingSuspendedAt', now(),
        'billingSuspensionSource', 'mercadopago_lifecycle'
      ),
      updated_at = now()
  from public.tenant_subscriptions ts
  where ts.tenant_id = t.id
    and ts.status in ('past_due', 'grace')
    and ts.grace_ends_at is not null
    and ts.grace_ends_at < now()
    and t.status <> 'suspended';
  get diagnostics v_suspended = row_count;

  return jsonb_build_object('pastDue', v_past_due, 'suspended', v_suspended, 'processedAt', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS, grants and operational views
-- ---------------------------------------------------------------------------

select security.touch_updated_at('public.platform_plan_prices');
select security.touch_updated_at('public.platform_billing_connections');
select security.touch_updated_at('public.platform_subscription_invoices');
select security.touch_updated_at('public.platform_subscription_payments');
select security.touch_updated_at('public.platform_billing_jobs');

alter table public.platform_plan_prices enable row level security;
alter table public.platform_billing_connections enable row level security;
alter table public.platform_subscription_invoices enable row level security;
alter table public.platform_subscription_payments enable row level security;
alter table public.platform_billing_webhook_events enable row level security;
alter table public.platform_billing_jobs enable row level security;

create policy platform_plan_prices_select_authenticated
on public.platform_plan_prices for select to authenticated
using (true);

create policy platform_subscription_invoices_select
on public.platform_subscription_invoices for select to authenticated
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, 'financial.read'))
);
create policy platform_subscription_payments_select
on public.platform_subscription_payments for select to authenticated
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, 'financial.read'))
);

create policy platform_billing_service_connections
on public.platform_billing_connections for all to service_role using (true) with check (true);
create policy platform_billing_service_invoices
on public.platform_subscription_invoices for all to service_role using (true) with check (true);
create policy platform_billing_service_payments
on public.platform_subscription_payments for all to service_role using (true) with check (true);
create policy platform_billing_service_webhooks
on public.platform_billing_webhook_events for all to service_role using (true) with check (true);
create policy platform_billing_service_jobs
on public.platform_billing_jobs for all to service_role using (true) with check (true);

revoke all on public.platform_billing_connections, public.platform_billing_webhook_events,
  public.platform_billing_jobs from anon, authenticated;
revoke insert, update, delete on public.tenant_subscriptions from authenticated;
grant select on public.tenant_subscriptions to authenticated, service_role;
grant select, insert, update, delete on public.platform_billing_connections,
  public.platform_billing_webhook_events, public.platform_billing_jobs to service_role;
grant select on public.platform_plan_prices, public.platform_subscription_invoices,
  public.platform_subscription_payments to authenticated, service_role;
grant insert, update, delete on public.platform_plan_prices to service_role;
grant insert, update, delete on public.platform_subscription_invoices,
  public.platform_subscription_payments to service_role;

revoke all on function security.seed_billing_permissions(uuid) from public;
revoke all on function security.require_billing_service_role() from public;
revoke all on function public.apply_platform_mercadopago_event(uuid, jsonb) from public;
revoke all on function public.apply_platform_billing_lifecycle() from public;
revoke all on function public.reserve_mercadopago_refund(uuid, uuid, uuid, uuid, integer, text, uuid, text) from public;
revoke all on function public.finalize_mercadopago_refund(uuid, text, text, integer) from public;
grant execute on function security.seed_billing_permissions(uuid) to service_role;
grant execute on function security.require_billing_service_role() to service_role;
grant execute on function public.apply_platform_mercadopago_event(uuid, jsonb) to service_role;
grant execute on function public.apply_platform_billing_lifecycle() to service_role;
grant execute on function public.reserve_mercadopago_refund(uuid, uuid, uuid, uuid, integer, text, uuid, text) to service_role;
grant execute on function public.finalize_mercadopago_refund(uuid, text, text, integer) to service_role;

-- Database-only lifecycle enforcement does not need provider credentials and
-- is scheduled automatically when pg_cron is available. Canonical provider
-- reconciliation remains in the authenticated Edge cron documented in the runbook.
do $$
begin
  if to_regnamespace('cron') is null
     or to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron unavailable; platform billing lifecycle must be scheduled externally';
    return;
  end if;

  if to_regprocedure('cron.unschedule(text)') is not null then
    begin
      execute 'select cron.unschedule($1)' using 'slimhiper-platform-billing-lifecycle';
    exception when others then null;
    end;
  end if;
  execute 'select cron.schedule($1, $2, $3)'
    using
      'slimhiper-platform-billing-lifecycle',
      '*/5 * * * *',
      'select public.apply_platform_billing_lifecycle();';
end $$;

comment on table public.platform_billing_connections is
  'Service-role-only encrypted credentials and health for the SlimHiper Mercado Pago seller account.';
comment on table public.platform_plan_prices is
  'Immutable commercial price versions. Existing tenant subscriptions retain their contracted version.';
comment on table public.platform_billing_webhook_events is
  'Resumable Mercado Pago SaaS billing webhook inbox. Processed is set only after transactional projection.';
comment on column public.patient_invoices.collection_mode is
  'Distinguishes local ledger entries from objects collected through a payment provider.';
