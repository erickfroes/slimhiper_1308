-- Mercado Pago tenant OAuth marketplace accounts.
-- Stores encrypted seller tokens in a service-role-only table and exposes only
-- sanitized connection state through a view/RPC surfaces.

create table if not exists public.mercadopago_oauth_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  state_hash text not null unique,
  redirect_uri text not null,
  status text not null default 'pending'
    check (status in ('pending', 'consumed', 'expired', 'failed')),
  expires_at timestamptz not null default now() + interval '15 minutes',
  consumed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.mercadopago_tenant_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  tenant_billing_account_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'error', 'disconnected', 'disabled')),
  mercadopago_user_id text,
  account_ref_masked text,
  access_token_ciphertext text,
  access_token_iv text,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  token_type text,
  scope text,
  expires_at timestamptz,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  last_refreshed_at timestamptz,
  disconnected_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint mercadopago_tenant_accounts_billing_account_same_tenant
    foreign key (tenant_id, tenant_billing_account_id)
    references public.tenant_billing_accounts(tenant_id, id)
    on delete set null
);

create unique index if not exists idx_mercadopago_tenant_accounts_user_unique
  on public.mercadopago_tenant_accounts(mercadopago_user_id)
  where mercadopago_user_id is not null;

create index if not exists idx_mercadopago_oauth_states_tenant_status
  on public.mercadopago_oauth_states(tenant_id, status, expires_at desc);

create index if not exists idx_mercadopago_tenant_accounts_status
  on public.mercadopago_tenant_accounts(tenant_id, status);

alter table public.mercadopago_oauth_states enable row level security;
alter table public.mercadopago_tenant_accounts enable row level security;

drop policy if exists mercadopago_oauth_states_service_role_all
  on public.mercadopago_oauth_states;
create policy mercadopago_oauth_states_service_role_all
on public.mercadopago_oauth_states for all
to service_role
using (true)
with check (true);

drop policy if exists mercadopago_tenant_accounts_service_role_all
  on public.mercadopago_tenant_accounts;
create policy mercadopago_tenant_accounts_service_role_all
on public.mercadopago_tenant_accounts for all
to service_role
using (true)
with check (true);

revoke all on public.mercadopago_oauth_states from public;
revoke all on public.mercadopago_tenant_accounts from public;
grant select, insert, update, delete on public.mercadopago_oauth_states to service_role;
grant select, insert, update, delete on public.mercadopago_tenant_accounts to service_role;

drop view if exists public.mercadopago_tenant_account_status;
create view public.mercadopago_tenant_account_status
with (security_invoker = true)
as
select
  mta.id,
  mta.tenant_id,
  mta.status,
  mta.mercadopago_user_id,
  mta.account_ref_masked,
  mta.scope,
  mta.expires_at,
  mta.connected_at,
  mta.last_refreshed_at,
  mta.disconnected_at,
  mta.error_code,
  mta.error_message,
  mta.updated_at
from public.mercadopago_tenant_accounts mta;

revoke all on public.mercadopago_tenant_account_status from public;
grant select on public.mercadopago_tenant_account_status to authenticated, service_role;

create or replace function public.get_mercadopago_tenant_account_status(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row record;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not security.is_platform_admin()
     and not (
      security.is_tenant_member(p_tenant_id)
      and public.has_permission(p_tenant_id, 'financial.read')
    )
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
  into v_row
  from public.mercadopago_tenant_accounts mta
  where mta.tenant_id = p_tenant_id;

  if v_row.id is null then
    return jsonb_build_object(
      'tenantId', p_tenant_id,
      'provider', 'mercadopago',
      'status', 'not_configured',
      'accountRef', '',
      'connectedAt', null,
      'expiresAt', null,
      'lastRefreshedAt', null,
      'errorCode', null,
      'errorMessage', null
    );
  end if;

  return jsonb_build_object(
    'tenantId', p_tenant_id,
    'provider', 'mercadopago',
    'status', coalesce(v_row.status, 'not_configured'),
    'accountRef', coalesce(v_row.account_ref_masked, ''),
    'connectedAt', v_row.connected_at,
    'expiresAt', v_row.expires_at,
    'lastRefreshedAt', v_row.last_refreshed_at,
    'errorCode', v_row.error_code,
    'errorMessage', v_row.error_message
  );
end;
$$;

revoke all on function public.get_mercadopago_tenant_account_status(uuid) from public;
grant execute on function public.get_mercadopago_tenant_account_status(uuid)
  to authenticated, service_role;

select security.touch_updated_at('public.mercadopago_tenant_accounts');

comment on table public.mercadopago_tenant_accounts is
  'Encrypted Mercado Pago OAuth seller account credentials per tenant. Direct access is service-role only.';
comment on table public.mercadopago_oauth_states is
  'Short-lived Mercado Pago OAuth state records used to bind authorization callbacks to tenant connection attempts.';
comment on view public.mercadopago_tenant_account_status is
  'Sanitized Mercado Pago tenant connection status without token material.';
comment on function public.get_mercadopago_tenant_account_status(uuid) is
  'Returns sanitized Mercado Pago account connection status after tenant/platform authorization checks.';
