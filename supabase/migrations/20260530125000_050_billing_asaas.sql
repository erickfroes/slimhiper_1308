-- SlimHiper clean foundation: billing and Asaas contracts.

create table public.platform_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'quarterly', 'yearly')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  platform_plan_id uuid not null references public.platform_plans(id),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  trial_ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id),
  unique (tenant_id, id)
);

create table public.tenant_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  provider text not null default 'asaas' check (provider in ('asaas')),
  status text not null default 'pending' check (status in ('pending', 'active', 'restricted', 'disabled')),
  wallet_id text,
  wallet_id_masked text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.asaas_subaccounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tenant_billing_account_id uuid not null unique,
  asaas_account_id text not null unique,
  wallet_id text,
  wallet_id_masked text,
  account_name text,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  masked_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint asaas_subaccounts_billing_account_same_tenant
    foreign key (tenant_id, tenant_billing_account_id)
    references public.tenant_billing_accounts(tenant_id, id)
    on delete cascade
);

create table public.patient_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  asaas_customer_id text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id),
  unique (tenant_id, asaas_customer_id),
  constraint patient_customers_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.patient_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  patient_customer_id uuid,
  asaas_invoice_id text unique,
  status text not null default 'pending',
  amount_cents integer not null check (amount_cents >= 0),
  due_date date,
  paid_at timestamptz,
  description text,
  invoice_url text,
  payment_link text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_invoices_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint patient_invoices_customer_same_tenant
    foreign key (tenant_id, patient_customer_id)
    references public.patient_customers(tenant_id, id)
);

create table public.patient_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  patient_customer_id uuid,
  asaas_subscription_id text unique,
  status text not null default 'active' check (status in ('active', 'paused', 'canceled', 'cancelled')),
  cycle text not null check (cycle in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  amount_cents integer not null check (amount_cents >= 0),
  next_due_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_subscriptions_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint patient_subscriptions_customer_same_tenant
    foreign key (tenant_id, patient_customer_id)
    references public.patient_customers(tenant_id, id)
);

create table public.payment_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid,
  asaas_payment_link_id text not null unique,
  url text,
  status text not null default 'active' check (status in ('active', 'inactive', 'expired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint payment_links_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  patient_invoice_id uuid,
  asaas_payment_id text unique,
  status text not null,
  amount_cents integer not null check (amount_cents >= 0),
  paid_at timestamptz,
  due_date date,
  method text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint payments_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint payments_invoice_same_tenant
    foreign key (tenant_id, patient_invoice_id)
    references public.patient_invoices(tenant_id, id)
);

create table public.splits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  payment_id uuid not null,
  recipient_wallet_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  split_type text not null default 'fixed' check (split_type in ('fixed', 'percentage')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint splits_payment_same_tenant
    foreign key (tenant_id, payment_id)
    references public.payments(tenant_id, id)
    on delete cascade
);

create table public.asaas_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  event_type text not null,
  asaas_event_id text,
  idempotency_key text,
  external_reference text,
  status text not null default 'processed' check (status in ('received', 'processed', 'failed', 'ignored')),
  payload_summary jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  retry_count integer not null default 0 check (retry_count >= 0),
  error_message text,
  created_at timestamptz not null default now()
);

create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas' check (provider in ('asaas')),
  event_hash text not null unique,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'ignored')),
  error_message text
);

create unique index idx_asaas_events_asaas_event_unique
  on public.asaas_events(asaas_event_id)
  where asaas_event_id is not null;

create unique index idx_asaas_events_idempotency_unique
  on public.asaas_events(idempotency_key)
  where idempotency_key is not null;

create index idx_tenant_subscriptions_tenant_status on public.tenant_subscriptions(tenant_id, status);
create index idx_patient_customers_patient on public.patient_customers(tenant_id, patient_id);
create index idx_patient_invoices_patient_due on public.patient_invoices(tenant_id, patient_id, due_date);
create index idx_patient_invoices_tenant_status on public.patient_invoices(tenant_id, status);
create index idx_patient_subscriptions_patient_status on public.patient_subscriptions(tenant_id, patient_id, status);
create index idx_payment_links_tenant_status on public.payment_links(tenant_id, status);
create index idx_payments_patient_created_at on public.payments(tenant_id, patient_id, created_at desc);
create index idx_splits_payment on public.splits(tenant_id, payment_id);
create index idx_asaas_events_tenant_created_at on public.asaas_events(tenant_id, created_at desc);

select security.touch_updated_at('public.platform_plans');
select security.touch_updated_at('public.tenant_subscriptions');
select security.touch_updated_at('public.tenant_billing_accounts');
select security.touch_updated_at('public.asaas_subaccounts');
select security.touch_updated_at('public.patient_customers');
select security.touch_updated_at('public.patient_invoices');
select security.touch_updated_at('public.patient_subscriptions');
select security.touch_updated_at('public.payment_links');
select security.touch_updated_at('public.payments');
select security.touch_updated_at('public.splits');

alter table public.platform_plans enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.tenant_billing_accounts enable row level security;
alter table public.asaas_subaccounts enable row level security;
alter table public.patient_customers enable row level security;
alter table public.patient_invoices enable row level security;
alter table public.patient_subscriptions enable row level security;
alter table public.payment_links enable row level security;
alter table public.payments enable row level security;
alter table public.splits enable row level security;
alter table public.asaas_events enable row level security;
alter table public.billing_webhook_events enable row level security;

create policy platform_plans_select_authenticated
on public.platform_plans for select
to authenticated
using (true);

create policy platform_plans_manage_platform_admin
on public.platform_plans for all
to authenticated
using (security.is_platform_admin())
with check (security.is_platform_admin());

create policy tenant_subscriptions_select_operational
on public.tenant_subscriptions for select
to authenticated
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, 'financial.read'))
);

create policy tenant_subscriptions_write_financial
on public.tenant_subscriptions for insert
to authenticated
with check (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, 'financial.write'));

create policy tenant_subscriptions_update_financial
on public.tenant_subscriptions for update
to authenticated
using (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, 'financial.write'))
with check (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, 'financial.write'));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_billing_accounts',
    'asaas_subaccounts',
    'patient_customers',
    'patient_invoices',
    'patient_subscriptions',
    'payment_links',
    'payments',
    'splits'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, ''financial.read''));',
      table_name || '_select_financial_read',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, ''financial.write''));',
      table_name || '_insert_financial_write',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, ''financial.write'')) with check (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, ''financial.write''));',
      table_name || '_update_financial_write',
      table_name
    );
  end loop;
end $$;

create policy asaas_events_select_financial_read
on public.asaas_events for select
to authenticated
using (
  tenant_id is not null
  and security.is_tenant_member(tenant_id)
  and public.has_permission(tenant_id, 'financial.read')
);

-- No user policies for billing_webhook_events and no user writes for asaas_events:
-- webhook persistence is backend/service-role only.
