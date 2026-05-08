-- Core role model upgrade: tenant-specific role codes + RBAC helper functions
-- Keeps legacy tenant_memberships.role for policy compatibility.

-- 1) Extend tenant memberships with tenant-specific role code
alter table public.tenant_memberships
  add column if not exists role_code text;

-- Backfill existing rows with conservative defaults.
update public.tenant_memberships
set role_code = case
  when role = 'admin' then 'clinic_admin'
  else 'patient'
end
where role_code is null;

alter table public.tenant_memberships
  alter column role_code set default 'patient';

alter table public.tenant_memberships
  alter column role_code set not null;

alter table public.tenant_memberships
  drop constraint if exists tenant_memberships_role_code_check;

alter table public.tenant_memberships
  add constraint tenant_memberships_role_code_check
  check (
    role_code in (
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
    )
  );

create index if not exists idx_tenant_memberships_role_code
  on public.tenant_memberships(role_code);

-- 2) Seed system role definitions for each tenant
insert into public.roles (tenant_id, name, description, is_system)
select t.id, sr.code, sr.description, true
from public.tenants t
cross join (
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
) as sr(code, description)
on conflict (tenant_id, name) do update
set description = excluded.description,
    is_system = true,
    updated_at = now();

-- 3) Seed permission codes for core modules per tenant
insert into public.permissions (tenant_id, code, description)
select t.id, p.code, p.description
from public.tenants t
cross join (
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
    ('packages.read', 'Read packages module'),
    ('packages.write', 'Write packages module'),
    ('chat.read', 'Read chat module'),
    ('chat.write', 'Write chat module'),
    ('reports.read', 'Read reports module'),
    ('settings.read', 'Read tenant settings'),
    ('settings.write', 'Write tenant settings'),
    ('platform.tenants.read', 'Read platform tenant management'),
    ('platform.tenants.write', 'Write platform tenant management'),
    ('platform.webhooks.read', 'Read platform webhooks'),
    ('platform.audit.read', 'Read platform audit logs')
) as p(code, description)
on conflict (tenant_id, code) do update
set description = excluded.description,
    updated_at = now();

-- 4) Seed baseline role->permission links for tenant_owner and clinic_admin
with role_permission_matrix as (
  select *
  from (
    values
      ('tenant_owner', 'patients.read'),
      ('tenant_owner', 'patients.write'),
      ('tenant_owner', 'agenda.read'),
      ('tenant_owner', 'agenda.write'),
      ('tenant_owner', 'encounters.read'),
      ('tenant_owner', 'encounters.write'),
      ('tenant_owner', 'soap.read'),
      ('tenant_owner', 'soap.write'),
      ('tenant_owner', 'nutrition.read'),
      ('tenant_owner', 'nutrition.write'),
      ('tenant_owner', 'prescriptions.read'),
      ('tenant_owner', 'prescriptions.write'),
      ('tenant_owner', 'documents.read'),
      ('tenant_owner', 'documents.write'),
      ('tenant_owner', 'financial.read'),
      ('tenant_owner', 'financial.write'),
      ('tenant_owner', 'packages.read'),
      ('tenant_owner', 'packages.write'),
      ('tenant_owner', 'chat.read'),
      ('tenant_owner', 'chat.write'),
      ('tenant_owner', 'reports.read'),
      ('tenant_owner', 'settings.read'),
      ('tenant_owner', 'settings.write'),
      ('tenant_owner', 'platform.tenants.read'),
      ('tenant_owner', 'platform.tenants.write'),
      ('tenant_owner', 'platform.webhooks.read'),
      ('tenant_owner', 'platform.audit.read'),
      ('clinic_admin', 'patients.read'),
      ('clinic_admin', 'patients.write'),
      ('clinic_admin', 'agenda.read'),
      ('clinic_admin', 'agenda.write'),
      ('clinic_admin', 'encounters.read'),
      ('clinic_admin', 'encounters.write'),
      ('clinic_admin', 'soap.read'),
      ('clinic_admin', 'soap.write'),
      ('clinic_admin', 'nutrition.read'),
      ('clinic_admin', 'nutrition.write'),
      ('clinic_admin', 'prescriptions.read'),
      ('clinic_admin', 'prescriptions.write'),
      ('clinic_admin', 'documents.read'),
      ('clinic_admin', 'documents.write'),
      ('clinic_admin', 'financial.read'),
      ('clinic_admin', 'financial.write'),
      ('clinic_admin', 'packages.read'),
      ('clinic_admin', 'packages.write'),
      ('clinic_admin', 'chat.read'),
      ('clinic_admin', 'chat.write'),
      ('clinic_admin', 'reports.read'),
      ('clinic_admin', 'settings.read'),
      ('clinic_admin', 'settings.write')
  ) as x(role_code, permission_code)
)
insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from role_permission_matrix rpm
join public.roles r
  on r.name = rpm.role_code
join public.permissions p
  on p.tenant_id = r.tenant_id
 and p.code = rpm.permission_code
on conflict (tenant_id, role_id, permission_id) do nothing;

-- 5) Keep legacy role field coherent for existing policies.
update public.tenant_memberships
set role = case
  when role_code in ('tenant_owner', 'clinic_admin') then 'admin'
  else 'member'
end
where role not in ('admin', 'member')
   or role is null;

-- 6) Helper functions
create or replace function public.has_tenant_role(p_tenant_id uuid, p_role text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and (
        tm.role_code = p_role
        or tm.role = p_role
        or (p_role = 'admin' and tm.role_code in ('tenant_owner', 'clinic_admin'))
        or (p_role = 'member' and tm.role_code not in ('tenant_owner', 'clinic_admin'))
      )
  );
$$;

create or replace function public.has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
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
        and p.code = p_permission
    );
$$;
