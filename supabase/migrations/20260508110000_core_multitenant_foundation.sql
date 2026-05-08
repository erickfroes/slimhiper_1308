-- Core multi-tenant foundation (no clinical/patient tables)

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  platform_role text not null default 'user', -- user | platform_admin
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member', -- member | admin
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, role_id, permission_id)
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  reason text,
  status text not null default 'requested',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.break_glass_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  reason text not null,
  approved_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ---------- Helper functions ----------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.platform_role = 'platform_admin'
      and p.is_active = true
  );
$$;

create or replace function public.is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
      and tm.status = 'active'
  );
$$;

-- ---------- Indexes ----------

create index if not exists idx_tenant_units_tenant_id on public.tenant_units(tenant_id);
create index if not exists idx_tenant_units_created_at on public.tenant_units(created_at);

create index if not exists idx_tenant_memberships_tenant_id on public.tenant_memberships(tenant_id);
create index if not exists idx_tenant_memberships_user_id on public.tenant_memberships(user_id);
create index if not exists idx_tenant_memberships_role on public.tenant_memberships(role);
create index if not exists idx_tenant_memberships_created_at on public.tenant_memberships(created_at);

create index if not exists idx_roles_tenant_id on public.roles(tenant_id);
create index if not exists idx_roles_created_at on public.roles(created_at);

create index if not exists idx_permissions_tenant_id on public.permissions(tenant_id);
create index if not exists idx_permissions_created_at on public.permissions(created_at);

create index if not exists idx_role_permissions_tenant_id on public.role_permissions(tenant_id);
create index if not exists idx_role_permissions_created_at on public.role_permissions(created_at);

create index if not exists idx_feature_flags_tenant_id on public.feature_flags(tenant_id);
create index if not exists idx_feature_flags_created_at on public.feature_flags(created_at);

create index if not exists idx_audit_logs_tenant_id on public.audit_logs(tenant_id);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);

create index if not exists idx_support_sessions_tenant_id on public.support_sessions(tenant_id);
create index if not exists idx_support_sessions_user_id on public.support_sessions(user_id);
create index if not exists idx_support_sessions_created_at on public.support_sessions(created_at);

create index if not exists idx_break_glass_requests_tenant_id on public.break_glass_requests(tenant_id);
create index if not exists idx_break_glass_requests_user_id on public.break_glass_requests(user_id);
create index if not exists idx_break_glass_requests_created_at on public.break_glass_requests(created_at);

-- ---------- RLS ----------

alter table public.tenants enable row level security;
alter table public.tenant_units enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_logs enable row level security;
alter table public.support_sessions enable row level security;
alter table public.break_glass_requests enable row level security;

-- Users can read their own profile
create policy "profiles_select_own"
on public.profiles
for select
using (id = auth.uid());

-- Platform admins can manage profiles (SaaS settings/users)
create policy "profiles_manage_platform_admin"
on public.profiles
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Users can read own memberships
create policy "tenant_memberships_select_own"
on public.tenant_memberships
for select
using (user_id = auth.uid());

-- Tenant admins can manage users in their tenant
create policy "tenant_memberships_manage_tenant_admin"
on public.tenant_memberships
for all
using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

-- Platform admins can manage tenants and SaaS settings
create policy "tenants_manage_platform_admin"
on public.tenants
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "tenant_units_manage_platform_or_tenant_admin"
on public.tenant_units
for all
using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "roles_manage_platform_or_tenant_admin"
on public.roles
for all
using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "permissions_manage_platform_or_tenant_admin"
on public.permissions
for all
using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "role_permissions_manage_platform_or_tenant_admin"
on public.role_permissions
for all
using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "feature_flags_manage_platform_or_tenant_admin"
on public.feature_flags
for all
using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "audit_logs_manage_platform_or_tenant_admin"
on public.audit_logs
for all
using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "support_sessions_manage_platform_or_tenant_admin"
on public.support_sessions
for all
using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "break_glass_requests_manage_platform_or_tenant_admin"
on public.break_glass_requests
for all
using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

-- Platform admins cannot access clinical data by default:
-- No clinical/patient tables are created in this migration.
