-- Versions recurring patient package prices so existing subscriptions retain
-- the commercial terms and Mercado Pago plan used at authorization time.

create table public.package_billing_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_id uuid not null,
  version integer not null check (version > 0),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  billing_cycle text not null check (billing_cycle in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  billing_repetitions integer check (billing_repetitions is null or billing_repetitions > 0),
  trial_days integer not null default 0 check (trial_days between 0 and 365),
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
  unique (tenant_id, id),
  unique (tenant_id, package_id, version),
  constraint package_billing_versions_package_same_tenant
    foreign key (tenant_id, package_id) references public.packages(tenant_id, id) on delete cascade
);

create unique index idx_package_billing_versions_current
  on public.package_billing_versions(tenant_id, package_id)
  where is_current;
create unique index idx_package_billing_versions_provider_plan
  on public.package_billing_versions(tenant_id, provider_plan_id)
  where provider_plan_id is not null;

create or replace function public.capture_package_billing_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_version integer;
begin
  if current_setting('app.skip_package_billing_version', true) = 'true' then
    return new;
  end if;
  if new.price_cents <= 0 then return new; end if;
  if tg_op = 'UPDATE'
     and new.price_cents is not distinct from old.price_cents
     and new.billing_cycle is not distinct from old.billing_cycle
     and new.billing_repetitions is not distinct from old.billing_repetitions
     and new.billing_trial_days is not distinct from old.billing_trial_days then
    return new;
  end if;

  update public.package_billing_versions
  set is_current = false,
      provider_status = case when provider_status = 'active' then 'retired' else provider_status end,
      retired_at = coalesce(retired_at, now()),
      updated_at = now()
  where tenant_id = new.tenant_id and package_id = new.id and is_current;

  select coalesce(max(version), 0) + 1 into v_version
  from public.package_billing_versions
  where tenant_id = new.tenant_id and package_id = new.id;

  insert into public.package_billing_versions (
    tenant_id, package_id, version, amount_cents, billing_cycle,
    billing_repetitions, trial_days, metadata
  ) values (
    new.tenant_id, new.id, v_version, new.price_cents, new.billing_cycle,
    new.billing_repetitions, new.billing_trial_days,
    jsonb_build_object('source', 'package_billing_version_trigger')
  );

  update public.packages
  set provider = 'mercadopago', provider_plan_id = null,
      provider_sync_status = 'not_synced', provider_last_synced_at = null,
      provider_error_code = null
  where tenant_id = new.tenant_id and id = new.id;
  return new;
end;
$$;

insert into public.package_billing_versions (
  tenant_id, package_id, version, amount_cents, billing_cycle,
  billing_repetitions, trial_days, provider_plan_id, provider_status,
  provider_last_synced_at, provider_error_code, metadata
)
select
  p.tenant_id, p.id, 1, p.price_cents, p.billing_cycle,
  p.billing_repetitions, p.billing_trial_days, p.provider_plan_id,
  p.provider_sync_status, p.provider_last_synced_at, p.provider_error_code,
  jsonb_build_object('source', 'package_billing_backfill')
from public.packages p
where p.price_cents > 0
  and not exists (
    select 1 from public.package_billing_versions v
    where v.tenant_id = p.tenant_id and v.package_id = p.id
  );

drop trigger if exists trg_package_capture_billing_version on public.packages;
create trigger trg_package_capture_billing_version
after insert or update of price_cents, billing_cycle, billing_repetitions, billing_trial_days
on public.packages
for each row execute function public.capture_package_billing_version();

alter table public.patient_subscriptions
  add column if not exists package_billing_version_id uuid;

do $$
begin
  alter table public.patient_subscriptions
    add constraint patient_subscriptions_billing_version_same_tenant
    foreign key (tenant_id, package_billing_version_id)
    references public.package_billing_versions(tenant_id, id)
    on delete set null (package_billing_version_id);
exception when duplicate_object then null;
end $$;

update public.patient_subscriptions ps
set package_billing_version_id = v.id
from public.package_billing_versions v
where v.tenant_id = ps.tenant_id
  and v.package_id = ps.package_id
  and v.is_current
  and ps.package_billing_version_id is null;

create or replace function public.configure_package_billing(
  p_package_id uuid,
  p_billing_cycle text,
  p_billing_repetitions integer default null,
  p_trial_days integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_package public.packages%rowtype;
begin
  if p_billing_cycle not in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')
     or (p_billing_repetitions is not null and p_billing_repetitions <= 0)
     or p_trial_days not between 0 and 365 then
    raise exception 'invalid_package_billing_configuration' using errcode = '22023';
  end if;

  update public.packages
  set billing_cycle = p_billing_cycle,
      billing_repetitions = p_billing_repetitions,
      billing_trial_days = p_trial_days
  where tenant_id = v_tenant_id and id = p_package_id
  returning * into v_package;
  if v_package.id is null then
    raise exception 'package_not_found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id, auth.uid(), 'patient_billing.package_configured', 'package', p_package_id::text,
    jsonb_build_object(
      'billingCycle', p_billing_cycle,
      'billingRepetitions', p_billing_repetitions,
      'trialDays', p_trial_days
    )
  );

  return jsonb_build_object(
    'id', p_package_id,
    'billingCycle', p_billing_cycle,
    'billingRepetitions', p_billing_repetitions,
    'trialDays', p_trial_days
  );
end;
$$;

-- Saves the commercial package and its recurring terms in one transaction so
-- a price+cycle edit creates exactly one billing version (never an intermediate
-- version with mixed old/new terms).
create or replace function public.upsert_commercial_package_with_billing(p_package jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_result jsonb;
  v_package public.packages%rowtype;
  v_current public.package_billing_versions%rowtype;
  v_id uuid;
  v_version integer;
  v_cycle text := coalesce(nullif(p_package ->> 'billingCycle', ''), 'monthly');
  v_repetitions integer := case
    when coalesce(p_package ->> 'billingRepetitions', '') ~ '^\d{1,5}$'
      then (p_package ->> 'billingRepetitions')::integer
    else null
  end;
  v_trial_days integer := case
    when coalesce(p_package ->> 'billingTrialDays', '') ~ '^\d{1,3}$'
      then (p_package ->> 'billingTrialDays')::integer
    else 0
  end;
begin
  if v_cycle not in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')
     or (v_repetitions is not null and v_repetitions <= 0)
     or v_trial_days not between 0 and 365 then
    raise exception 'invalid_package_billing_configuration' using errcode = '22023';
  end if;

  perform set_config('app.skip_package_billing_version', 'true', true);
  v_result := public.upsert_commercial_package(p_package);
  v_id := (v_result ->> 'id')::uuid;

  update public.packages
  set billing_cycle = v_cycle,
      billing_repetitions = v_repetitions,
      billing_trial_days = v_trial_days
  where tenant_id = v_tenant_id and id = v_id
  returning * into v_package;
  perform set_config('app.skip_package_billing_version', 'false', true);

  if v_package.id is null then
    raise exception 'package_not_found' using errcode = 'P0002';
  end if;

  select * into v_current
  from public.package_billing_versions
  where tenant_id = v_tenant_id and package_id = v_id and is_current
  for update;

  if v_package.price_cents <= 0 then
    update public.package_billing_versions
    set is_current = false, provider_status = 'retired', retired_at = coalesce(retired_at, now())
    where tenant_id = v_tenant_id and package_id = v_id and is_current;
    return v_result;
  end if;

  if v_current.id is not null
     and v_current.amount_cents = v_package.price_cents
     and v_current.billing_cycle = v_package.billing_cycle
     and v_current.billing_repetitions is not distinct from v_package.billing_repetitions
     and v_current.trial_days = v_package.billing_trial_days then
    return v_result;
  end if;

  update public.package_billing_versions
  set is_current = false,
      provider_status = case when provider_status = 'active' then 'retired' else provider_status end,
      retired_at = coalesce(retired_at, now()),
      updated_at = now()
  where tenant_id = v_tenant_id and package_id = v_id and is_current;

  select coalesce(max(version), 0) + 1 into v_version
  from public.package_billing_versions
  where tenant_id = v_tenant_id and package_id = v_id;

  insert into public.package_billing_versions (
    tenant_id, package_id, version, amount_cents, billing_cycle,
    billing_repetitions, trial_days, metadata
  ) values (
    v_tenant_id, v_id, v_version, v_package.price_cents, v_package.billing_cycle,
    v_package.billing_repetitions, v_package.billing_trial_days,
    jsonb_build_object('source', 'commercial_package_atomic_save')
  );

  update public.packages
  set provider = 'mercadopago', provider_plan_id = null,
      provider_sync_status = 'not_synced', provider_last_synced_at = null,
      provider_error_code = null
  where tenant_id = v_tenant_id and id = v_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id, auth.uid(), 'patient_billing.package_version_created', 'package', v_id::text,
    jsonb_build_object('version', v_version, 'billingCycle', v_cycle, 'trialDays', v_trial_days)
  );

  return v_result || jsonb_build_object('billingVersion', v_version);
end;
$$;

select security.touch_updated_at('public.package_billing_versions');
alter table public.package_billing_versions enable row level security;

create policy package_billing_versions_select
on public.package_billing_versions for select to authenticated
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or (security.is_tenant_member(tenant_id) and public.has_permission(tenant_id, 'packages.read'))
);
create policy package_billing_versions_service_write
on public.package_billing_versions for all to service_role using (true) with check (true);

grant select on public.package_billing_versions to authenticated, service_role;
grant insert, update, delete on public.package_billing_versions to service_role;
revoke insert, update, delete on public.packages from authenticated;
grant select on public.packages to authenticated, service_role;
revoke all on function public.configure_package_billing(uuid, text, integer, integer) from public;
revoke all on function public.upsert_commercial_package_with_billing(jsonb) from public;
grant execute on function public.configure_package_billing(uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.upsert_commercial_package_with_billing(jsonb) to authenticated, service_role;
