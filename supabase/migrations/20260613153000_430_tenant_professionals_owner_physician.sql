-- Separate tenant RBAC membership from clinical professional identity.
-- Owners can keep tenant_owner permissions while also having a physician profile that counts
-- against the plan doctor limit.

create table if not exists public.tenant_professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  membership_id uuid not null,
  unit_id uuid,
  professional_type text not null
    check (professional_type in ('physician', 'nutritionist', 'fitness_professional', 'external_professional')),
  license_number text,
  license_state text,
  specialty text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_professionals_membership_same_tenant
    foreign key (tenant_id, membership_id)
    references public.tenant_memberships(tenant_id, id)
    on delete cascade,
  constraint tenant_professionals_user_membership_same_tenant
    foreign key (tenant_id, user_id)
    references public.tenant_memberships(tenant_id, user_id)
    on delete cascade,
  constraint tenant_professionals_unit_same_tenant
    foreign key (tenant_id, unit_id)
    references public.tenant_units(tenant_id, id),
  constraint tenant_professionals_unique_user_type
    unique (tenant_id, user_id, professional_type)
);

select security.touch_updated_at('public.tenant_professionals');

create index if not exists idx_tenant_professionals_tenant_type_active
  on public.tenant_professionals(tenant_id, professional_type, is_active);

create index if not exists idx_tenant_professionals_membership
  on public.tenant_professionals(tenant_id, membership_id);

create index if not exists idx_tenant_professionals_user
  on public.tenant_professionals(tenant_id, user_id);

alter table public.tenant_professionals enable row level security;

drop policy if exists tenant_professionals_select_authorized on public.tenant_professionals;
create policy tenant_professionals_select_authorized
on public.tenant_professionals for select
to authenticated
using (
  security.has_permission(tenant_id, 'settings.read', true)
  or security.has_permission(tenant_id, 'tenant.users.manage', true)
  or security.has_permission(tenant_id, 'team.permissions.manage', true)
);

grant select on public.tenant_professionals to authenticated, service_role;
grant insert, update, delete on public.tenant_professionals to service_role;

create or replace function security.tenant_doctors_limit(p_tenant_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when coalesce(t.settings #>> '{usage,doctorsLimit}', '') ~ '^[0-9]+$'
      then (t.settings #>> '{usage,doctorsLimit}')::integer
    when coalesce(t.settings #>> '{usage,doctors_limit}', '') ~ '^[0-9]+$'
      then (t.settings #>> '{usage,doctors_limit}')::integer
    else null
  end
  from public.tenants t
  where t.id = p_tenant_id;
$$;

create or replace function security.count_tenant_physicians(
  p_tenant_id uuid,
  p_exclude_user_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with professional_physicians as (
    select distinct tp.user_id
    from public.tenant_professionals tp
    join public.tenant_memberships tm
      on tm.tenant_id = tp.tenant_id
     and tm.id = tp.membership_id
    where tp.tenant_id = p_tenant_id
      and tp.professional_type = 'physician'
      and tp.is_active = true
      and tm.status in ('active', 'invited')
  ), legacy_role_physicians as (
    select distinct tm.user_id
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.status in ('active', 'invited')
      and tm.role_code = 'physician'
      and not exists (
        select 1
        from public.tenant_professionals tp
        where tp.tenant_id = tm.tenant_id
          and tp.user_id = tm.user_id
          and tp.professional_type = 'physician'
      )
  ), unioned as (
    select user_id from professional_physicians
    union
    select user_id from legacy_role_physicians
  )
  select count(*)::integer
  from unioned
  where p_exclude_user_id is null
     or user_id <> p_exclude_user_id;
$$;

create or replace function security.assert_tenant_physician_limit(
  p_tenant_id uuid,
  p_target_user_id uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := security.tenant_doctors_limit(p_tenant_id);
  v_current integer := security.count_tenant_physicians(p_tenant_id, p_target_user_id);
begin
  if v_limit is not null and v_limit > 0 and v_current + 1 > v_limit then
    raise exception 'tenant_doctors_limit_exceeded'
      using errcode = '23514',
            detail = jsonb_build_object(
              'current', v_current,
              'limit', v_limit
            )::text;
  end if;
end;
$$;

revoke all on function security.tenant_doctors_limit(uuid) from public;
revoke all on function security.count_tenant_physicians(uuid, uuid) from public;
revoke all on function security.assert_tenant_physician_limit(uuid, uuid) from public;
grant execute on function security.tenant_doctors_limit(uuid) to authenticated, service_role;
grant execute on function security.count_tenant_physicians(uuid, uuid) to authenticated, service_role;
grant execute on function security.assert_tenant_physician_limit(uuid, uuid) to authenticated, service_role;

insert into public.tenant_professionals (
  tenant_id,
  user_id,
  membership_id,
  unit_id,
  professional_type,
  is_active
)
select
  tm.tenant_id,
  tm.user_id,
  tm.id,
  tm.unit_id,
  'physician',
  tm.status in ('active', 'invited')
from public.tenant_memberships tm
where tm.role_code = 'physician'
on conflict (tenant_id, user_id, professional_type) do update
set membership_id = excluded.membership_id,
    unit_id = excluded.unit_id,
    is_active = excluded.is_active,
    updated_at = now();

create or replace function public.upsert_tenant_professional_profile(
  p_membership_id uuid,
  p_professional_type text,
  p_license_number text default null,
  p_license_state text default null,
  p_specialty text default null,
  p_is_active boolean default true,
  p_reason text default null,
  p_require_license boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.tenant_memberships%rowtype;
  v_profile public.tenant_professionals%rowtype;
  v_type text := lower(btrim(coalesce(p_professional_type, '')));
  v_license_number text := nullif(btrim(coalesce(p_license_number, '')), '');
  v_license_state text := nullif(left(upper(regexp_replace(coalesce(p_license_state, ''), '[^A-Za-z]+', '', 'g')), 2), '');
  v_specialty text := nullif(btrim(coalesce(p_specialty, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_membership_id is null then
    raise exception 'membership_required' using errcode = '22023';
  end if;

  if v_type not in ('physician', 'nutritionist', 'fitness_professional', 'external_professional') then
    raise exception 'professional_type_not_allowed' using errcode = '22023';
  end if;

  select *
    into v_membership
  from public.tenant_memberships
  where id = p_membership_id
  for update;

  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  if not (
    security.can_access_platform_operations()
    or security.has_permission(v_membership.tenant_id, 'team.permissions.manage', true)
    or security.has_permission(v_membership.tenant_id, 'settings.write', true)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_is_active and v_type = 'physician' then
    if p_require_license and (v_license_number is null or v_license_state is null) then
      raise exception 'physician_license_required' using errcode = '22023';
    end if;

    if v_membership.status in ('active', 'invited') then
      perform security.assert_tenant_physician_limit(v_membership.tenant_id, v_membership.user_id);
    end if;
  end if;

  select *
    into v_profile
  from public.tenant_professionals
  where tenant_id = v_membership.tenant_id
    and user_id = v_membership.user_id
    and professional_type = v_type
  for update;

  if not found then
    if not p_is_active then
      raise exception 'professional_profile_not_found' using errcode = 'P0002';
    end if;

    insert into public.tenant_professionals (
      tenant_id,
      user_id,
      membership_id,
      unit_id,
      professional_type,
      license_number,
      license_state,
      specialty,
      is_active
    )
    values (
      v_membership.tenant_id,
      v_membership.user_id,
      v_membership.id,
      v_membership.unit_id,
      v_type,
      v_license_number,
      v_license_state,
      v_specialty,
      p_is_active
    )
    returning *
    into v_profile;
  else
    update public.tenant_professionals
       set membership_id = v_membership.id,
           unit_id = coalesce(v_membership.unit_id, unit_id),
           license_number =
             case
               when p_is_active and (p_require_license or v_license_number is not null)
                 then v_license_number
               else license_number
             end,
           license_state =
             case
               when p_is_active and (p_require_license or v_license_state is not null)
                 then v_license_state
               else license_state
             end,
           specialty =
             case
               when p_is_active and v_specialty is not null
                 then v_specialty
               else specialty
             end,
           is_active = p_is_active,
           updated_at = now()
     where id = v_profile.id
     returning *
     into v_profile;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_profile.tenant_id,
    v_user_id,
    'tenant_professional_profile.upserted',
    'tenant_professional',
    v_profile.id::text,
    jsonb_build_object(
      'reason', v_reason,
      'membershipId', v_membership.id,
      'targetUserId', v_membership.user_id,
      'professionalType', v_profile.professional_type,
      'licenseState', v_profile.license_state,
      'hasLicenseNumber', v_profile.license_number is not null,
      'isActive', v_profile.is_active
    )
  );

  return jsonb_build_object(
    'id', v_profile.id,
    'professionalType', v_profile.professional_type,
    'licenseNumber', v_profile.license_number,
    'licenseState', v_profile.license_state,
    'specialty', v_profile.specialty,
    'isActive', v_profile.is_active,
    'countsAsDoctor',
      v_profile.professional_type = 'physician'
      and v_profile.is_active
      and v_membership.status in ('active', 'invited')
  );
end;
$$;

revoke all on function public.upsert_tenant_professional_profile(uuid, text, text, text, text, boolean, text, boolean) from public;
grant execute on function public.upsert_tenant_professional_profile(uuid, text, text, text, text, boolean, text, boolean) to authenticated, service_role;

create or replace function public.get_clinic_settings_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_tenant public.tenants%rowtype;
  v_settings jsonb := '{}'::jsonb;
  v_safe_settings jsonb := '{}'::jsonb;
  v_units jsonb := '[]'::jsonb;
  v_team jsonb := '[]'::jsonb;
  v_roles jsonb := '[]'::jsonb;
  v_permissions jsonb := '[]'::jsonb;
  v_role_permissions jsonb := '[]'::jsonb;
  v_feature_flags jsonb := '[]'::jsonb;
  v_programs jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select p.active_tenant_id
    into v_tenant_id
  from public.profiles p
  where p.id = v_user_id
    and p.is_active = true
    and p.active_tenant_id is not null
    and security.is_tenant_member(p.active_tenant_id)
  limit 1;

  if v_tenant_id is null then
    select tm.tenant_id
      into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = v_user_id
      and tm.status = 'active'
      and p.is_active = true
    order by tm.created_at asc
    limit 1;
  end if;

  if v_tenant_id is null then
    raise exception 'no_active_tenant' using errcode = '42501';
  end if;

  if not security.has_permission(v_tenant_id, 'settings.read', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
    into v_tenant
  from public.tenants
  where id = v_tenant_id;

  if not found then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;

  v_settings := coalesce(v_tenant.settings, '{}'::jsonb);

  v_safe_settings := jsonb_build_object(
    'profile', coalesce(v_settings -> 'profile', '{}'::jsonb),
    'branding', coalesce(v_settings -> 'branding', '{}'::jsonb),
    'portal', coalesce(v_settings -> 'portal', '{}'::jsonb),
    'finance', coalesce(v_settings -> 'finance', '{}'::jsonb),
    'defaultPrograms', coalesce(v_settings -> 'defaultPrograms', '{}'::jsonb),
    'integrations',
      coalesce(
        (
          select jsonb_object_agg(
            item.key,
            jsonb_build_object(
              'enabled',
                case
                  when jsonb_typeof(item.value -> 'enabled') = 'boolean'
                    then (item.value ->> 'enabled')::boolean
                  else false
                end,
              'status',
                case
                  when jsonb_typeof(item.value -> 'status') = 'string'
                    then item.value ->> 'status'
                  else 'not_configured'
                end
            )
          )
          from jsonb_each(coalesce(v_settings -> 'integrations', '{}'::jsonb)) as item
        ),
        '{}'::jsonb
      )
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tu.id,
        'code', tu.code,
        'name', tu.name,
        'status', tu.status,
        'metadata', tu.metadata,
        'createdAt', tu.created_at,
        'updatedAt', tu.updated_at
      )
      order by tu.created_at asc
    ),
    '[]'::jsonb
  )
    into v_units
  from public.tenant_units tu
  where tu.tenant_id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tm.id,
        'userId', tm.user_id,
        'unitId', tm.unit_id,
        'unitName', tu.name,
        'roleCode', tm.role_code,
        'status', tm.status,
        'email', p.email,
        'fullName', p.full_name,
        'isActive', p.is_active,
        'createdAt', tm.created_at,
        'updatedAt', tm.updated_at,
        'professionalProfile', professional.profile
      )
      order by p.full_name nulls last, p.email nulls last
    ),
    '[]'::jsonb
  )
    into v_team
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  left join public.tenant_units tu
    on tu.tenant_id = tm.tenant_id
   and tu.id = tm.unit_id
  left join lateral (
    select jsonb_build_object(
      'id', tp.id,
      'professionalType', tp.professional_type,
      'licenseNumber', tp.license_number,
      'licenseState', tp.license_state,
      'specialty', tp.specialty,
      'isActive', tp.is_active,
      'countsAsDoctor',
        tp.professional_type = 'physician'
        and tp.is_active
        and tm.status in ('active', 'invited')
    ) as profile
    from public.tenant_professionals tp
    where tp.tenant_id = tm.tenant_id
      and tp.membership_id = tm.id
    order by
      case when tp.is_active then 0 else 1 end,
      case when tp.professional_type = 'physician' then 0 else 1 end,
      tp.updated_at desc
    limit 1
  ) professional on true
  where tm.tenant_id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'description', r.description,
        'isSystem', r.is_system,
        'membersCount',
          (
            select count(*)::integer
            from public.tenant_memberships tm
            where tm.tenant_id = v_tenant_id
              and tm.role_code = r.name
              and tm.status = 'active'
          )
      )
      order by r.is_system desc, r.name asc
    ),
    '[]'::jsonb
  )
    into v_roles
  from public.roles r
  where r.tenant_id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'description', p.description
      )
      order by p.code asc
    ),
    '[]'::jsonb
  )
    into v_permissions
  from public.permissions p
  where p.tenant_id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'roleId', r.id,
        'roleName', r.name,
        'permissions',
          coalesce(
            (
              select jsonb_agg(p.code order by p.code asc)
              from public.role_permissions rp
              join public.permissions p
                on p.tenant_id = rp.tenant_id
               and p.id = rp.permission_id
              where rp.tenant_id = v_tenant_id
                and rp.role_id = r.id
            ),
            '[]'::jsonb
          )
      )
      order by r.name asc
    ),
    '[]'::jsonb
  )
    into v_role_permissions
  from public.roles r
  where r.tenant_id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', ff.key,
        'enabled', ff.enabled
      )
      order by ff.key asc
    ),
    '[]'::jsonb
  )
    into v_feature_flags
  from public.feature_flags ff
  where ff.tenant_id = v_tenant_id;

  if security.has_permission(v_tenant_id, 'packages.read', true) then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'status', p.status,
          'programType', p.program_type,
          'durationWeeks', p.duration_weeks
        )
        order by p.status asc, p.name asc
      ),
      '[]'::jsonb
    )
      into v_programs
    from public.programs p
    where p.tenant_id = v_tenant_id;
  end if;

  return jsonb_build_object(
    'tenant',
      jsonb_build_object(
        'id', v_tenant.id,
        'slug', v_tenant.slug,
        'name', v_tenant.name,
        'status', v_tenant.status,
        'createdAt', v_tenant.created_at,
        'updatedAt', v_tenant.updated_at
      ),
    'settings', v_safe_settings,
    'units', v_units,
    'team', v_team,
    'roles', v_roles,
    'permissions', v_permissions,
    'rolePermissions', v_role_permissions,
    'featureFlags', v_feature_flags,
    'programs', v_programs
  );
end;
$$;

create or replace function public.get_platform_tenant_detail(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenants jsonb := '[]'::jsonb;
  v_tenant jsonb;
  v_users jsonb := '[]'::jsonb;
  v_units jsonb := '[]'::jsonb;
  v_audit jsonb := '[]'::jsonb;
  v_webhooks jsonb := '[]'::jsonb;
  v_support jsonb := '[]'::jsonb;
  v_break_glass jsonb := '[]'::jsonb;
begin
  if p_tenant_id is null then
    raise exception 'tenant_required' using errcode = '22023';
  end if;

  if not security.can_access_platform_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_tenants := public.list_platform_tenants();

  select tenant_item
    into v_tenant
  from jsonb_array_elements(v_tenants) as tenant_item
  where tenant_item ->> 'id' = p_tenant_id::text
  limit 1;

  if v_tenant is null then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tm.id,
        'name', coalesce(p.full_name, p.email, 'Usuario'),
        'email', coalesce(p.email, ''),
        'role', tm.role_code,
        'status', case when p.is_active and tm.status = 'active' then 'active' else 'inactive' end,
        'membershipStatus', tm.status,
        'unitId', tm.unit_id,
        'mfaEnabled', false,
        'lastLogin', null,
        'createdAt', tm.created_at,
        'professionalProfile', professional.profile
      )
      order by p.full_name nulls last, p.email nulls last
    ),
    '[]'::jsonb
  )
    into v_users
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  left join lateral (
    select jsonb_build_object(
      'id', tp.id,
      'professionalType', tp.professional_type,
      'licenseNumber', tp.license_number,
      'licenseState', tp.license_state,
      'specialty', tp.specialty,
      'isActive', tp.is_active,
      'countsAsDoctor',
        tp.professional_type = 'physician'
        and tp.is_active
        and tm.status in ('active', 'invited')
    ) as profile
    from public.tenant_professionals tp
    where tp.tenant_id = tm.tenant_id
      and tp.membership_id = tm.id
    order by
      case when tp.is_active then 0 else 1 end,
      case when tp.professional_type = 'physician' then 0 else 1 end,
      tp.updated_at desc
    limit 1
  ) professional on true
  where tm.tenant_id = p_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tu.id,
        'name', tu.name,
        'city', coalesce(tu.metadata ->> 'city', ''),
        'state', coalesce(tu.metadata ->> 'state', ''),
        'status', tu.status,
        'users', coalesce(unit_counts.users_count, 0),
        'patients', coalesce(unit_counts.patients_count, 0),
        'createdAt', tu.created_at
      )
      order by tu.created_at asc
    ),
    '[]'::jsonb
  )
    into v_units
  from public.tenant_units tu
  left join lateral (
    select
      (select count(*)::integer from public.tenant_memberships tm where tm.tenant_id = tu.tenant_id and tm.unit_id = tu.id) as users_count,
      (
        select count(*)::integer
        from public.patients p
        where p.tenant_id = tu.tenant_id
          and p.metadata ->> 'main_unit_id' = tu.id::text
      ) as patients_count
  ) unit_counts on true
  where tu.tenant_id = p_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', al.id,
        'action', al.action,
        'description', coalesce(al.metadata ->> 'description', al.action),
        'admin', coalesce(p.full_name, p.email, 'Sistema'),
        'timestamp', al.created_at,
        'category',
          case
            when al.action like '%billing%' or al.action like '%invoice%' or al.entity_type in ('patient_invoice', 'payment') then 'billing'
            when al.action like '%break_glass%' or al.action like '%security%' then 'security'
            when al.action like '%support%' then 'support'
            when al.action like '%webhook%' or al.action like '%integration%' then 'integration'
            else 'config'
          end
      )
      order by al.created_at desc
    ),
    '[]'::jsonb
  )
    into v_audit
  from (
    select *
    from public.audit_logs
    where tenant_id = p_tenant_id
    order by created_at desc
    limit 50
  ) al
  left join public.profiles p on p.id = al.user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', event.id,
        'event', event.event_type,
        'error', coalesce(event.error_message, ''),
        'severity', case when event.status = 'failed' and event.retry_count >= 3 then 'critico' when event.status = 'failed' then 'alto' else 'medio' end,
        'timestamp', event.created_at,
        'retries', event.retry_count,
        'status', case when event.status = 'failed' and event.retry_count >= 5 then 'dead_letter' when event.status = 'processed' then 'resolved' else 'pending' end
      )
      order by event.created_at desc
    ),
    '[]'::jsonb
  )
    into v_webhooks
  from (
    select *
    from public.admin_webhook_events
    where tenant_id = p_tenant_id
      and status in ('failed', 'received', 'ignored')
    order by created_at desc
    limit 50
  ) event;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ss.id,
        'status', ss.status,
        'priority', ss.priority,
        'subject', coalesce(ss.subject, 'Suporte operacional'),
        'assignedTo', coalesce(p.full_name, p.email),
        'openedAt', ss.created_at,
        'lastActivity', coalesce(ss.ended_at, ss.started_at, ss.created_at),
        'reason', ss.reason
      )
      order by ss.created_at desc
    ),
    '[]'::jsonb
  )
    into v_support
  from public.support_sessions ss
  left join public.profiles p on p.id = ss.user_id
  where ss.tenant_id = p_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', bg.id,
        'requestedBy', coalesce(requester.full_name, requester.email, 'Usuario'),
        'reason', bg.reason,
        'status', bg.status,
        'requestedAt', bg.created_at,
        'approvedBy', coalesce(approver.full_name, approver.email),
        'expiresAt', bg.expires_at,
        'scope', bg.scope
      )
      order by bg.created_at desc
    ),
    '[]'::jsonb
  )
    into v_break_glass
  from public.break_glass_requests bg
  left join public.profiles requester on requester.id = coalesce(bg.requested_by, bg.user_id)
  left join public.profiles approver on approver.id = bg.approved_by
  where bg.tenant_id = p_tenant_id;

  return jsonb_build_object(
    'tenant', v_tenant,
    'users', v_users,
    'units', v_units,
    'auditLogs', v_audit,
    'webhookErrors', v_webhooks,
    'supportSessions', v_support,
    'breakGlassRequests', v_break_glass
  );
end;
$$;

create or replace function public.update_platform_tenant_membership(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_role_code text default null,
  p_status text default null,
  p_unit_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.tenant_memberships%rowtype;
  v_updated public.tenant_memberships%rowtype;
  v_role_code text := nullif(btrim(coalesce(p_role_code, '')), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_next_role_code text;
  v_next_status text;
  v_professional jsonb;
  v_allowed_roles text[] := array[
    'tenant_owner',
    'clinic_admin',
    'receptionist',
    'physician',
    'nutritionist',
    'fitness_professional',
    'financial_user',
    'external_professional'
  ];
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not security.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_tenant_id is null then
    raise exception 'tenant_required' using errcode = '22023';
  end if;

  if p_membership_id is null then
    raise exception 'membership_required' using errcode = '22023';
  end if;

  if v_reason is null or length(v_reason) < 16 then
    raise exception 'membership_update_reason_too_short' using errcode = '22023';
  end if;

  select *
    into v_existing
  from public.tenant_memberships
  where tenant_id = p_tenant_id
    and id = p_membership_id
  for update;

  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  if v_role_code is not null then
    if v_role_code <> all(v_allowed_roles) then
      raise exception 'membership_role_not_allowed' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.roles r
      where r.tenant_id = p_tenant_id
        and r.name = v_role_code
    ) then
      raise exception 'membership_role_not_configured' using errcode = '22023';
    end if;
  end if;

  if v_status is not null and v_status not in ('active', 'invited', 'suspended', 'revoked') then
    raise exception 'membership_status_not_allowed' using errcode = '22023';
  end if;

  if p_unit_id is not null and not exists (
    select 1
    from public.tenant_units tu
    where tu.tenant_id = p_tenant_id
      and tu.id = p_unit_id
  ) then
    raise exception 'membership_unit_not_found' using errcode = 'P0002';
  end if;

  v_next_role_code := coalesce(v_role_code, v_existing.role_code);
  v_next_status := coalesce(v_status, v_existing.status);

  if v_next_role_code = 'physician' and v_next_status in ('active', 'invited') then
    perform security.assert_tenant_physician_limit(p_tenant_id, v_existing.user_id);
  end if;

  update public.tenant_memberships
     set role_code = coalesce(v_role_code, role_code),
         status = coalesce(v_status, status),
         unit_id = p_unit_id,
         updated_at = now()
   where tenant_id = p_tenant_id
     and id = p_membership_id
   returning *
   into v_updated;

  if v_updated.role_code = 'physician' and v_updated.status in ('active', 'invited') then
    v_professional := public.upsert_tenant_professional_profile(
      v_updated.id,
      'physician',
      null,
      null,
      null,
      true,
      'Criacao automatica por compatibilidade com role_code physician.',
      false
    );
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    v_user_id,
    'platform_tenant_membership.updated',
    'tenant_membership',
    v_updated.id::text,
    jsonb_build_object(
      'reason', v_reason,
      'targetUserId', v_updated.user_id,
      'previous', jsonb_build_object(
        'roleCode', v_existing.role_code,
        'status', v_existing.status,
        'unitId', v_existing.unit_id
      ),
      'current', jsonb_build_object(
        'roleCode', v_updated.role_code,
        'status', v_updated.status,
        'unitId', v_updated.unit_id
      ),
      'professionalProfile', v_professional
    )
  );

  return jsonb_build_object(
    'id', v_updated.id,
    'tenantId', v_updated.tenant_id,
    'userId', v_updated.user_id,
    'role', v_updated.role_code,
    'status', v_updated.status,
    'unitId', v_updated.unit_id,
    'professionalProfile', v_professional,
    'updatedAt', v_updated.updated_at
  );
end;
$$;

create or replace function public.update_clinic_member_role(
  p_membership_id uuid,
  p_role_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.tenant_memberships%rowtype;
  v_updated public.tenant_memberships%rowtype;
  v_role_code text := lower(btrim(coalesce(p_role_code, '')));
  v_owner_count integer;
  v_professional jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_membership_id is null or v_role_code = '' then
    raise exception 'membership_and_role_required' using errcode = '22023';
  end if;

  select *
    into v_membership
  from public.tenant_memberships
  where id = p_membership_id
  for update;

  if v_membership.id is null then
    raise exception 'membership_not_found' using errcode = '22023';
  end if;
  if not (
    security.has_permission(v_membership.tenant_id, 'team.permissions.manage', true)
    or security.has_permission(v_membership.tenant_id, 'settings.write', true)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.roles r
    where r.tenant_id = v_membership.tenant_id
      and r.name = v_role_code
  ) then
    raise exception 'role_not_found' using errcode = '22023';
  end if;

  if v_membership.role_code = 'tenant_owner' and v_role_code <> 'tenant_owner' then
    select count(*)::integer into v_owner_count
    from public.tenant_memberships tm
    where tm.tenant_id = v_membership.tenant_id
      and tm.role_code = 'tenant_owner'
      and tm.status = 'active';

    if v_owner_count <= 1 and v_membership.status = 'active' then
      raise exception 'last_owner_cannot_be_demoted' using errcode = '42501';
    end if;
  end if;

  if v_role_code = 'physician' and v_membership.status in ('active', 'invited') then
    perform security.assert_tenant_physician_limit(v_membership.tenant_id, v_membership.user_id);
  end if;

  update public.tenant_memberships
     set role_code = v_role_code,
         role = v_role_code,
         updated_at = now()
   where id = v_membership.id
   returning *
   into v_updated;

  if v_updated.role_code = 'physician' and v_updated.status in ('active', 'invited') then
    v_professional := public.upsert_tenant_professional_profile(
      v_updated.id,
      'physician',
      null,
      null,
      null,
      true,
      'Criacao automatica por compatibilidade com role_code physician.',
      false
    );
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_membership.tenant_id,
    v_user_id,
    'clinic_member.role_updated',
    'tenant_membership',
    v_membership.id::text,
    jsonb_build_object(
      'fromRole', v_membership.role_code,
      'toRole', v_role_code,
      'targetUserId', v_membership.user_id,
      'professionalProfile', v_professional
    )
  );

  return jsonb_build_object('id', v_membership.id, 'roleCode', v_role_code, 'status', 'ok');
end;
$$;

revoke all on function public.get_clinic_settings_snapshot() from public;
revoke all on function public.get_platform_tenant_detail(uuid) from public;
revoke all on function public.update_platform_tenant_membership(uuid, uuid, text, text, uuid, text) from public;
revoke all on function public.update_clinic_member_role(uuid, text) from public;

grant execute on function public.get_clinic_settings_snapshot() to authenticated, service_role;
grant execute on function public.get_platform_tenant_detail(uuid) to authenticated, service_role;
grant execute on function public.update_platform_tenant_membership(uuid, uuid, text, text, uuid, text) to authenticated, service_role;
grant execute on function public.update_clinic_member_role(uuid, text) to authenticated, service_role;

comment on table public.tenant_professionals is
  'Tenant-scoped clinical professional profiles separate from RBAC membership. Permissions continue to come from tenant_memberships.role_code.';

comment on function public.upsert_tenant_professional_profile(uuid, text, text, text, text, boolean, text, boolean) is
  'Audited professional profile mutator. Physician profiles count against tenant doctor limits; license metadata is minimized in audit logs.';

comment on function public.update_platform_tenant_membership(uuid, uuid, text, text, uuid, text) is
  'Updates tenant membership role/status/unit for platform admins and enforces doctor limits through tenant_professionals.';
