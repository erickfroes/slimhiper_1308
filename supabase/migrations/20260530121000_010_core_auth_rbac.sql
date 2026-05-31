-- SlimHiper clean foundation: tenants, auth profiles, RBAC, platform operations.
-- `tenant_memberships.role_code` is canonical. `role` remains as compatibility mirror.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, slug),
  unique (id, status)
);

create table public.tenant_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  platform_role text not null default 'user'
    check (platform_role in ('platform_owner', 'platform_admin', 'platform_support', 'user')),
  active_tenant_id uuid references public.tenants(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_id uuid,
  role_code text not null default 'receptionist'
    check (role_code in (
      'tenant_owner',
      'clinic_admin',
      'receptionist',
      'physician',
      'nutritionist',
      'fitness_professional',
      'financial_user',
      'patient',
      'guardian',
      'external_professional'
    )),
  role text not null default 'receptionist',
  status text not null default 'invited' check (status in ('active', 'invited', 'suspended', 'revoked')),
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, user_id),
  constraint tenant_memberships_unit_same_tenant
    foreign key (tenant_id, unit_id)
    references public.tenant_units(tenant_id, id),
  constraint tenant_memberships_role_mirror check (role = role_code)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_id uuid not null,
  permission_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, role_id, permission_id),
  constraint role_permissions_role_same_tenant
    foreign key (tenant_id, role_id)
    references public.roles(tenant_id, id)
    on delete cascade,
  constraint role_permissions_permission_same_tenant
    foreign key (tenant_id, permission_id)
    references public.permissions(tenant_id, id)
    on delete cascade
);

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, key)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  reason text,
  status text not null default 'requested' check (status in ('requested', 'active', 'ended', 'denied')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.break_glass_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  reason text not null,
  approved_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'expired')),
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create index idx_tenant_units_tenant_id on public.tenant_units(tenant_id);
create index idx_profiles_active_tenant_id on public.profiles(active_tenant_id);
create index idx_profiles_platform_role on public.profiles(platform_role);
create index idx_tenant_memberships_tenant_id on public.tenant_memberships(tenant_id);
create index idx_tenant_memberships_user_id on public.tenant_memberships(user_id);
create index idx_tenant_memberships_role_code on public.tenant_memberships(role_code);
create index idx_tenant_memberships_status on public.tenant_memberships(status);
create index idx_roles_tenant_id on public.roles(tenant_id);
create index idx_permissions_tenant_id on public.permissions(tenant_id);
create index idx_role_permissions_tenant_id on public.role_permissions(tenant_id);
create index idx_feature_flags_tenant_id on public.feature_flags(tenant_id);
create index idx_audit_logs_tenant_id_created_at on public.audit_logs(tenant_id, created_at desc);
create index idx_support_sessions_tenant_id on public.support_sessions(tenant_id);
create index idx_break_glass_requests_tenant_id on public.break_glass_requests(tenant_id);

select security.touch_updated_at('public.tenants');
select security.touch_updated_at('public.tenant_units');
select security.touch_updated_at('public.profiles');
select security.touch_updated_at('public.tenant_memberships');
select security.touch_updated_at('public.roles');
select security.touch_updated_at('public.permissions');
select security.touch_updated_at('public.feature_flags');

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
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.sync_membership_role()
returns trigger
language plpgsql
as $$
begin
  new.role := new.role_code;
  if new.status = 'active' and new.accepted_at is null then
    new.accepted_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_tenant_memberships_sync_role
before insert or update of role_code, status
on public.tenant_memberships
for each row execute function public.sync_membership_role();

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
    join public.profiles p on p.id = tm.user_id
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.is_active = true
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
    join public.profiles p on p.id = tm.user_id
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.is_active = true
      and tm.role_code = any(p_roles)
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

create or replace function security.has_permission(p_tenant_id uuid, p_permission text, p_include_platform boolean default true)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    (p_include_platform and security.is_platform_admin())
    or exists (
      select 1
      from public.tenant_memberships tm
      join public.profiles profile on profile.id = tm.user_id
      join public.roles r
        on r.tenant_id = tm.tenant_id
       and r.name = tm.role_code
      join public.role_permissions rp
        on rp.tenant_id = r.tenant_id
       and rp.role_id = r.id
      join public.permissions p
        on p.tenant_id = rp.tenant_id
       and p.id = rp.permission_id
      where tm.tenant_id = p_tenant_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and profile.is_active = true
        and p.code = p_permission
    );
$$;

create or replace function security.has_clinical_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select security.has_permission(p_tenant_id, p_permission, false);
$$;

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

create or replace function public.has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
as $$
  select security.has_permission(p_tenant_id, p_permission, true);
$$;

create or replace function public.has_clinical_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
as $$
  select security.has_clinical_permission(p_tenant_id, p_permission);
$$;

create or replace function security.seed_tenant_rbac(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.roles (tenant_id, name, description, is_system)
  select p_tenant_id, role_code, description, true
  from (
    values
      ('tenant_owner', 'Tenant owner with full tenant control'),
      ('clinic_admin', 'Clinic administrator with operational control'),
      ('receptionist', 'Front desk and scheduling operations'),
      ('physician', 'Physician clinical access'),
      ('nutritionist', 'Nutrition professional access'),
      ('fitness_professional', 'Fitness professional access'),
      ('financial_user', 'Financial and billing access'),
      ('patient', 'Patient self-service access'),
      ('guardian', 'Guardian access for dependents'),
      ('external_professional', 'External professional with restricted access')
  ) as seed(role_code, description)
  on conflict (tenant_id, name) do update
  set description = excluded.description,
      is_system = true,
      updated_at = now();

  insert into public.permissions (tenant_id, code, description)
  select p_tenant_id, code, description
  from (
    values
      ('patients.read', 'Read patients module'),
      ('patients.write', 'Write patients module'),
      ('agenda.read', 'Read agenda module'),
      ('agenda.write', 'Write agenda module'),
      ('encounters.read', 'Read encounters module'),
      ('encounters.write', 'Write encounters module'),
      ('soap.read', 'Read SOAP records'),
      ('soap.write', 'Write SOAP records'),
      ('nutrition.read', 'Read nutrition module'),
      ('nutrition.write', 'Write nutrition module'),
      ('prescriptions.read', 'Read prescriptions module'),
      ('prescriptions.write', 'Write prescriptions module'),
      ('documents.read', 'Read documents module'),
      ('documents.write', 'Write documents module'),
      ('financial.read', 'Read financial module'),
      ('financial.write', 'Write financial module'),
      ('packages.read', 'Read programs and packages module'),
      ('packages.write', 'Write programs and packages module'),
      ('chat.read', 'Read chat module'),
      ('chat.write', 'Write chat module'),
      ('notifications.read', 'Read notifications'),
      ('notifications.write', 'Write notifications'),
      ('crm.read', 'Read CRM and leads'),
      ('crm.write', 'Write CRM and leads'),
      ('inventory.read', 'Read inventory module'),
      ('inventory.write', 'Write inventory module'),
      ('reports.read', 'Read reports module'),
      ('reports.write', 'Write reports module'),
      ('settings.read', 'Read tenant settings'),
      ('settings.write', 'Write tenant settings'),
      ('timeline.sensitive.read', 'Read sensitive timeline payloads'),
      ('patient_portal.access', 'Access patient portal'),
      ('platform.tenants.read', 'Read platform tenant management'),
      ('platform.tenants.write', 'Write platform tenant management'),
      ('platform.webhooks.read', 'Read platform webhooks'),
      ('platform.audit.read', 'Read platform audit logs')
  ) as seed(code, description)
  on conflict (tenant_id, code) do update
  set description = excluded.description,
      updated_at = now();

  insert into public.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant_id, r.id, p.id
  from (
    values
      ('tenant_owner', 'patients.read'), ('tenant_owner', 'patients.write'),
      ('tenant_owner', 'agenda.read'), ('tenant_owner', 'agenda.write'),
      ('tenant_owner', 'encounters.read'), ('tenant_owner', 'encounters.write'),
      ('tenant_owner', 'soap.read'), ('tenant_owner', 'soap.write'),
      ('tenant_owner', 'nutrition.read'), ('tenant_owner', 'nutrition.write'),
      ('tenant_owner', 'prescriptions.read'), ('tenant_owner', 'prescriptions.write'),
      ('tenant_owner', 'documents.read'), ('tenant_owner', 'documents.write'),
      ('tenant_owner', 'financial.read'), ('tenant_owner', 'financial.write'),
      ('tenant_owner', 'packages.read'), ('tenant_owner', 'packages.write'),
      ('tenant_owner', 'chat.read'), ('tenant_owner', 'chat.write'),
      ('tenant_owner', 'notifications.read'), ('tenant_owner', 'notifications.write'),
      ('tenant_owner', 'crm.read'), ('tenant_owner', 'crm.write'),
      ('tenant_owner', 'inventory.read'), ('tenant_owner', 'inventory.write'),
      ('tenant_owner', 'reports.read'), ('tenant_owner', 'reports.write'),
      ('tenant_owner', 'settings.read'), ('tenant_owner', 'settings.write'),
      ('tenant_owner', 'timeline.sensitive.read'),
      ('clinic_admin', 'patients.read'), ('clinic_admin', 'patients.write'),
      ('clinic_admin', 'agenda.read'), ('clinic_admin', 'agenda.write'),
      ('clinic_admin', 'encounters.read'), ('clinic_admin', 'encounters.write'),
      ('clinic_admin', 'soap.read'), ('clinic_admin', 'soap.write'),
      ('clinic_admin', 'nutrition.read'), ('clinic_admin', 'nutrition.write'),
      ('clinic_admin', 'prescriptions.read'), ('clinic_admin', 'prescriptions.write'),
      ('clinic_admin', 'documents.read'), ('clinic_admin', 'documents.write'),
      ('clinic_admin', 'financial.read'), ('clinic_admin', 'financial.write'),
      ('clinic_admin', 'packages.read'), ('clinic_admin', 'packages.write'),
      ('clinic_admin', 'chat.read'), ('clinic_admin', 'chat.write'),
      ('clinic_admin', 'notifications.read'), ('clinic_admin', 'notifications.write'),
      ('clinic_admin', 'crm.read'), ('clinic_admin', 'crm.write'),
      ('clinic_admin', 'inventory.read'), ('clinic_admin', 'inventory.write'),
      ('clinic_admin', 'reports.read'), ('clinic_admin', 'reports.write'),
      ('clinic_admin', 'settings.read'), ('clinic_admin', 'settings.write'),
      ('clinic_admin', 'timeline.sensitive.read'),
      ('receptionist', 'patients.read'), ('receptionist', 'agenda.read'), ('receptionist', 'agenda.write'), ('receptionist', 'crm.read'), ('receptionist', 'crm.write'),
      ('physician', 'patients.read'), ('physician', 'encounters.read'), ('physician', 'encounters.write'), ('physician', 'soap.read'), ('physician', 'soap.write'), ('physician', 'prescriptions.read'), ('physician', 'prescriptions.write'), ('physician', 'documents.read'), ('physician', 'reports.read'), ('physician', 'timeline.sensitive.read'),
      ('nutritionist', 'patients.read'), ('nutritionist', 'encounters.read'), ('nutritionist', 'soap.read'), ('nutritionist', 'nutrition.read'), ('nutritionist', 'nutrition.write'), ('nutritionist', 'documents.read'), ('nutritionist', 'reports.read'), ('nutritionist', 'timeline.sensitive.read'),
      ('fitness_professional', 'patients.read'), ('fitness_professional', 'encounters.read'), ('fitness_professional', 'nutrition.read'), ('fitness_professional', 'reports.read'),
      ('financial_user', 'patients.read'), ('financial_user', 'financial.read'), ('financial_user', 'financial.write'), ('financial_user', 'reports.read'),
      ('patient', 'patient_portal.access'), ('patient', 'documents.read'), ('patient', 'chat.read'), ('patient', 'chat.write'), ('patient', 'notifications.read'),
      ('guardian', 'patient_portal.access'), ('guardian', 'documents.read'), ('guardian', 'chat.read'), ('guardian', 'chat.write'), ('guardian', 'notifications.read'),
      ('external_professional', 'patients.read'), ('external_professional', 'documents.read')
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

create or replace function public.seed_new_tenant_rbac()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform security.seed_tenant_rbac(new.id);
  return new;
end;
$$;

create trigger trg_tenants_seed_rbac
after insert on public.tenants
for each row execute function public.seed_new_tenant_rbac();

revoke all on function security.is_platform_admin() from public;
revoke all on function security.is_platform_support() from public;
revoke all on function security.is_tenant_member(uuid) from public;
revoke all on function security.has_tenant_role(uuid, text[]) from public;
revoke all on function security.can_manage_tenant(uuid) from public;
revoke all on function security.has_permission(uuid, text, boolean) from public;
revoke all on function security.has_clinical_permission(uuid, text) from public;
revoke all on function security.seed_tenant_rbac(uuid) from public;

grant execute on function security.is_platform_admin() to authenticated, service_role;
grant execute on function security.is_platform_support() to authenticated, service_role;
grant execute on function security.is_tenant_member(uuid) to authenticated, service_role;
grant execute on function security.has_tenant_role(uuid, text[]) to authenticated, service_role;
grant execute on function security.can_manage_tenant(uuid) to authenticated, service_role;
grant execute on function security.has_permission(uuid, text, boolean) to authenticated, service_role;
grant execute on function security.has_clinical_permission(uuid, text) to authenticated, service_role;
grant execute on function security.seed_tenant_rbac(uuid) to service_role;

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

create policy profiles_select_own_or_platform
on public.profiles for select
to authenticated
using (id = auth.uid() or security.is_platform_admin() or security.is_platform_support());

create policy profiles_manage_platform_admin
on public.profiles for all
to authenticated
using (security.is_platform_admin())
with check (security.is_platform_admin());

create policy tenant_memberships_select_scope
on public.tenant_memberships for select
to authenticated
using (
  user_id = auth.uid()
  or security.can_manage_tenant(tenant_id)
  or security.is_platform_support()
);

create policy tenant_memberships_manage_admin
on public.tenant_memberships for all
to authenticated
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

create policy tenants_select_scope
on public.tenants for select
to authenticated
using (
  security.is_tenant_member(id)
  or security.is_platform_admin()
  or security.is_platform_support()
);

create policy tenants_manage_platform_admin
on public.tenants for all
to authenticated
using (security.is_platform_admin())
with check (security.is_platform_admin());

create policy tenant_units_select_member
on public.tenant_units for select
to authenticated
using (security.is_tenant_member(tenant_id) or security.is_platform_admin() or security.is_platform_support());

create policy tenant_units_manage_admin
on public.tenant_units for all
to authenticated
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

create policy roles_read_member
on public.roles for select
to authenticated
using (security.is_tenant_member(tenant_id) or security.can_manage_tenant(tenant_id));

create policy roles_manage_admin
on public.roles for all
to authenticated
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

create policy permissions_read_member
on public.permissions for select
to authenticated
using (security.is_tenant_member(tenant_id) or security.can_manage_tenant(tenant_id));

create policy permissions_manage_admin
on public.permissions for all
to authenticated
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

create policy role_permissions_read_member
on public.role_permissions for select
to authenticated
using (security.is_tenant_member(tenant_id) or security.can_manage_tenant(tenant_id));

create policy role_permissions_manage_admin
on public.role_permissions for all
to authenticated
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

create policy feature_flags_select_member
on public.feature_flags for select
to authenticated
using (security.is_tenant_member(tenant_id) or security.is_platform_admin() or security.is_platform_support());

create policy feature_flags_manage_admin
on public.feature_flags for all
to authenticated
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

create policy audit_logs_select_operational
on public.audit_logs for select
to authenticated
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or security.has_tenant_role(tenant_id, array['tenant_owner', 'clinic_admin'])
);

create policy audit_logs_insert_member_self
on public.audit_logs for insert
to authenticated
with check (security.is_tenant_member(tenant_id) and user_id = auth.uid());

create policy support_sessions_select_scope
on public.support_sessions for select
to authenticated
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or user_id = auth.uid()
  or requested_by = auth.uid()
  or security.has_tenant_role(tenant_id, array['tenant_owner', 'clinic_admin'])
);

create policy support_sessions_manage_admin
on public.support_sessions for all
to authenticated
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));

create policy break_glass_requests_select_scope
on public.break_glass_requests for select
to authenticated
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or user_id = auth.uid()
  or requested_by = auth.uid()
  or security.has_tenant_role(tenant_id, array['tenant_owner', 'clinic_admin'])
);

create policy break_glass_requests_manage_admin
on public.break_glass_requests for all
to authenticated
using (security.can_manage_tenant(tenant_id))
with check (security.can_manage_tenant(tenant_id));
