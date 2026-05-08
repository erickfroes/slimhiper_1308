-- Align core multi-tenant RBAC with SlimHiper role model and non-recursive RLS helpers.
-- Note: platform-level admin capabilities do not imply clinical data access.
-- Note: clinical/patient domain tables will be introduced in a later migration.

create schema if not exists security;
revoke all on schema security from public;
grant usage on schema security to postgres, service_role;

-- 1) Profiles role model alignment
alter table public.profiles
  drop constraint if exists profiles_platform_role_check;

alter table public.profiles
  add constraint profiles_platform_role_check
  check (platform_role in ('platform_owner', 'platform_admin', 'platform_support', 'user'));

alter table public.profiles
  alter column platform_role set default 'user';

-- 2) Tenant membership role/status model alignment
alter table public.tenant_memberships
  add column if not exists unit_id uuid references public.tenant_units(id) on delete set null,
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz;

-- Backfill accepted_at for active members.
update public.tenant_memberships
set accepted_at = coalesce(accepted_at, created_at)
where status = 'active';

-- Normalize legacy roles if needed.
update public.tenant_memberships
set role = case
  when role in ('admin', 'tenant_owner') then 'tenant_owner'
  when role in ('member', 'clinic_admin') then 'clinic_admin'
  else role
end
where role in ('admin', 'member');

alter table public.tenant_memberships
  drop constraint if exists tenant_memberships_role_check;

alter table public.tenant_memberships
  add constraint tenant_memberships_role_check
  check (role in (
    'tenant_owner',
    'clinic_admin',
    'receptionist',
    'physician',
    'nutritionist',
    'fitness_professional',
    'financial_user',
    'external_professional'
  ));

alter table public.tenant_memberships
  drop constraint if exists tenant_memberships_status_check;

alter table public.tenant_memberships
  add constraint tenant_memberships_status_check
  check (status in ('active', 'invited', 'suspended', 'revoked'));

alter table public.tenant_memberships
  alter column role set default 'receptionist',
  alter column status set default 'invited';

-- 3) Updated-at helper and triggers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tenants_set_updated_at on public.tenants;
create trigger trg_tenants_set_updated_at before update on public.tenants
for each row execute function public.set_updated_at();

drop trigger if exists trg_tenant_units_set_updated_at on public.tenant_units;
create trigger trg_tenant_units_set_updated_at before update on public.tenant_units
for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_tenant_memberships_set_updated_at on public.tenant_memberships;
create trigger trg_tenant_memberships_set_updated_at before update on public.tenant_memberships
for each row execute function public.set_updated_at();

drop trigger if exists trg_roles_set_updated_at on public.roles;
create trigger trg_roles_set_updated_at before update on public.roles
for each row execute function public.set_updated_at();

drop trigger if exists trg_permissions_set_updated_at on public.permissions;
create trigger trg_permissions_set_updated_at before update on public.permissions
for each row execute function public.set_updated_at();

drop trigger if exists trg_feature_flags_set_updated_at on public.feature_flags;
create trigger trg_feature_flags_set_updated_at before update on public.feature_flags
for each row execute function public.set_updated_at();

-- 4) Auth users -> profiles auto-provisioning
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, platform_role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    'user',
    true
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- 5) Non-recursive RLS helpers in private schema
create or replace function security.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.platform_role in ('platform_owner', 'platform_admin')
  );
$$;

create or replace function security.is_platform_support()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.platform_role = 'platform_support'
  );
$$;

create or replace function security.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

create or replace function security.has_tenant_role(p_tenant_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role = any(p_roles)
  );
$$;

create or replace function security.can_manage_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select security.is_platform_admin()
      or security.has_tenant_role(p_tenant_id, array['tenant_owner', 'clinic_admin']);
$$;

revoke all on function security.is_platform_admin() from public;
revoke all on function security.is_platform_support() from public;
revoke all on function security.is_tenant_member(uuid) from public;
revoke all on function security.has_tenant_role(uuid, text[]) from public;
revoke all on function security.can_manage_tenant(uuid) from public;
grant execute on function security.is_platform_admin() to authenticated, service_role;
grant execute on function security.is_platform_support() to authenticated, service_role;
grant execute on function security.is_tenant_member(uuid) to authenticated, service_role;
grant execute on function security.has_tenant_role(uuid, text[]) to authenticated, service_role;
grant execute on function security.can_manage_tenant(uuid) to authenticated, service_role;

-- 6) RLS policy refresh

drop policy if exists "profiles_manage_platform_admin" on public.profiles;
create policy "profiles_manage_platform_admin"
on public.profiles
for all
using (security.is_platform_admin())
with check (security.is_platform_admin());

-- authenticated users can read own profile
-- existing policy kept by name and logic.

drop policy if exists "tenant_memberships_manage_tenant_admin" on public.tenant_memberships;
create policy "tenant_memberships_manage_tenant_admin"
on public.tenant_memberships
for all
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

-- active tenant members can read their own membership

drop policy if exists "tenant_memberships_select_own" on public.tenant_memberships;
create policy "tenant_memberships_select_own"
on public.tenant_memberships
for select
using (user_id = auth.uid() and status = 'active');

-- active tenant members can read their own tenant basic info
create policy "tenants_select_active_member"
on public.tenants
for select
using (security.is_tenant_member(id));

drop policy if exists "tenants_manage_platform_admin" on public.tenants;
create policy "tenants_manage_platform_admin"
on public.tenants
for all
using (security.is_platform_admin())
with check (security.is_platform_admin());

-- clinic users can read tenant feature flags; platform admins can manage globally

drop policy if exists "feature_flags_manage_platform_or_tenant_admin" on public.feature_flags;
create policy "feature_flags_select_member"
on public.feature_flags
for select
using (security.is_tenant_member(tenant_id));

create policy "feature_flags_manage_platform_or_tenant_admin"
on public.feature_flags
for all
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

-- audit logs readable by platform admins/support and tenant admins

drop policy if exists "audit_logs_manage_platform_or_tenant_admin" on public.audit_logs;
create policy "audit_logs_select_operational"
on public.audit_logs
for select
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or security.has_tenant_role(tenant_id, array['tenant_owner', 'clinic_admin'])
);

create policy "audit_logs_manage_admin"
on public.audit_logs
for all
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

-- support / break-glass follow tenant/platform rules

drop policy if exists "support_sessions_manage_platform_or_tenant_admin" on public.support_sessions;
create policy "support_sessions_select_scope"
on public.support_sessions
for select
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or security.is_tenant_member(tenant_id)
);

create policy "support_sessions_manage_scope"
on public.support_sessions
for all
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

drop policy if exists "break_glass_requests_manage_platform_or_tenant_admin" on public.break_glass_requests;
create policy "break_glass_requests_select_scope"
on public.break_glass_requests
for select
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or security.is_tenant_member(tenant_id)
);

create policy "break_glass_requests_manage_scope"
on public.break_glass_requests
for all
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

-- keep admin management policies aligned on RBAC helper

drop policy if exists "tenant_units_manage_platform_or_tenant_admin" on public.tenant_units;
create policy "tenant_units_manage_platform_or_tenant_admin"
on public.tenant_units
for all
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

drop policy if exists "roles_manage_platform_or_tenant_admin" on public.roles;
create policy "roles_manage_platform_or_tenant_admin"
on public.roles
for all
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

drop policy if exists "permissions_manage_platform_or_tenant_admin" on public.permissions;
create policy "permissions_manage_platform_or_tenant_admin"
on public.permissions
for all
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

drop policy if exists "role_permissions_manage_platform_or_tenant_admin" on public.role_permissions;
create policy "role_permissions_manage_platform_or_tenant_admin"
on public.role_permissions
for all
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

-- 7) Additional indexes
create index if not exists idx_tenant_memberships_status on public.tenant_memberships(status);
create index if not exists idx_tenant_memberships_updated_at on public.tenant_memberships(updated_at);
create index if not exists idx_profiles_platform_role on public.profiles(platform_role);
create index if not exists idx_profiles_created_at on public.profiles(created_at);
create index if not exists idx_profiles_updated_at on public.profiles(updated_at);
create index if not exists idx_feature_flags_updated_at on public.feature_flags(updated_at);

-- 8) Compatibility wrappers (avoid changing app SQL callers while moving policy internals)
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select security.is_platform_admin();
$$;

create or replace function public.is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select security.has_tenant_role(p_tenant_id, array['tenant_owner', 'clinic_admin']);
$$;

-- 9) Test query examples
-- test: user reads own profile
-- select * from public.profiles where id = auth.uid();

-- test: tenant member reads own tenant
-- select t.* from public.tenants t where security.is_tenant_member(t.id);

-- test: tenant A cannot read tenant B
-- set local request.jwt.claim.sub = '<user_from_tenant_a_uuid>';
-- select * from public.tenants where id = '<tenant_b_uuid>';

-- test: clinic_admin can manage tenant users
-- select security.has_tenant_role('<tenant_uuid>', array['clinic_admin']);

-- test: receptionist cannot manage tenant users
-- select security.can_manage_tenant('<tenant_uuid>'); -- false for receptionist

-- test: platform_support cannot read clinical data by default
-- -- no clinical tables exist in this migration scope; verify support access is limited to operational tables.
