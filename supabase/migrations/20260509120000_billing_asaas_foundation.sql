-- Billing + Asaas foundation (no UI wiring).

create extension if not exists pgcrypto;

insert into public.permissions (code, name, description)
values
  ('financial.read', 'Financial Read', 'Read tenant financial and billing records.'),
  ('financial.write', 'Financial Write', 'Create/update patient charges and subscriptions.')
on conflict (code) do update set name = excluded.name, description = excluded.description;

create table if not exists public.platform_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  billing_cycle text not null check (billing_cycle in ('monthly','quarterly','yearly')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  platform_plan_id uuid not null references public.platform_plans(id),
  status text not null check (status in ('trialing','active','past_due','canceled','paused')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  trial_ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  provider text not null default 'asaas' check (provider in ('asaas')),
  status text not null default 'pending' check (status in ('pending','active','restricted','disabled')),
  wallet_id text,
  wallet_id_masked text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asaas_subaccounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tenant_billing_account_id uuid not null unique references public.tenant_billing_accounts(id) on delete cascade,
  asaas_account_id text not null unique,
  wallet_id text,
  wallet_id_masked text,
  account_name text,
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  masked_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patient_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  asaas_customer_id text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, patient_id),
  unique (tenant_id, asaas_customer_id)
);

create table if not exists public.patient_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  patient_customer_id uuid references public.patient_customers(id) on delete set null,
  asaas_invoice_id text unique,
  status text not null default 'pending',
  amount_cents integer not null check (amount_cents >= 0),
  due_date date,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patient_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  patient_customer_id uuid references public.patient_customers(id) on delete set null,
  asaas_subscription_id text unique,
  status text not null default 'active' check (status in ('active','paused','canceled')),
  cycle text not null check (cycle in ('weekly','biweekly','monthly','quarterly','yearly')),
  amount_cents integer not null check (amount_cents >= 0),
  next_due_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  asaas_payment_link_id text not null unique,
  url text,
  status text not null default 'active' check (status in ('active','inactive','expired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  patient_invoice_id uuid references public.patient_invoices(id) on delete set null,
  asaas_payment_id text unique,
  status text not null,
  amount_cents integer not null check (amount_cents >= 0),
  paid_at timestamptz,
  due_date date,
  method text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.splits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  recipient_wallet_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  split_type text not null default 'fixed' check (split_type in ('fixed','percentage')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asaas_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  event_type text not null,
  asaas_event_id text,
  external_reference text,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (asaas_event_id)
);

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas' check (provider in ('asaas')),
  event_hash text not null unique,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Trigger wiring
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_plans','tenant_subscriptions','tenant_billing_accounts','asaas_subaccounts','patient_customers','patient_invoices','patient_subscriptions','payment_links','payments','splits']
  LOOP
    EXECUTE format('drop trigger if exists trg_%s_set_updated_at on public.%s;', t, t);
    EXECUTE format('create trigger trg_%s_set_updated_at before update on public.%s for each row execute function public.set_updated_at();', t, t);
  END LOOP;
END $$;

-- RLS
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_subscriptions','tenant_billing_accounts','asaas_subaccounts','patient_customers','patient_invoices','patient_subscriptions','payment_links','payments','splits','asaas_events']
  LOOP
    EXECUTE format('alter table public.%s enable row level security;', t);
  END LOOP;
END $$;

create policy "platform_plans_select_authenticated" on public.platform_plans for select to authenticated using (true);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_billing_accounts','asaas_subaccounts','patient_customers','patient_invoices','patient_subscriptions','payment_links','payments','splits','asaas_events'] LOOP
    EXECUTE format('create policy %L on public.%s for select to authenticated using (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, ''financial.read''));', t||'_select_financial_read', t);
    EXECUTE format('create policy %L on public.%s for insert to authenticated with check (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, ''financial.write''));', t||'_insert_financial_write', t);
    EXECUTE format('create policy %L on public.%s for update to authenticated using (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, ''financial.write'')) with check (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, ''financial.write''));', t||'_update_financial_write', t);
  END LOOP;
END $$;

create policy "tenant_subscriptions_select_operational" on public.tenant_subscriptions for select to authenticated using (
  security.is_platform_admin() or (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, 'financial.read'))
);
create policy "tenant_subscriptions_mutate_financial_write" on public.tenant_subscriptions for all to authenticated using (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, 'financial.write')) with check (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, 'financial.write'));

comment on table public.payments is 'Patient/self-portal access can be added after patient-account linkage is finalized.';
