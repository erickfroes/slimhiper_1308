-- Clinic settings snapshot/update contracts.
-- Scope: read sanitized tenant settings/team metadata and update safe settings keys.

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
        'updatedAt', tm.updated_at
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

create or replace function public.update_clinic_settings(
  p_name text default null,
  p_settings_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_patch jsonb := '{}'::jsonb;
  v_integrations jsonb := '{}'::jsonb;
  v_updated_settings jsonb := '{}'::jsonb;
  v_allowed_keys text[] := array[
    'profile',
    'branding',
    'portal',
    'finance',
    'defaultPrograms',
    'integrations'
  ];
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_settings_patch is null or jsonb_typeof(p_settings_patch) <> 'object' then
    raise exception 'invalid_settings_patch' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_settings_patch) as k(key)
    where not (k.key = any(v_allowed_keys))
  ) then
    raise exception 'settings_key_not_allowed' using errcode = '22023';
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

  if not security.has_permission(v_tenant_id, 'settings.write', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_patch := p_settings_patch - 'integrations';

  if p_settings_patch ? 'integrations' then
    if jsonb_typeof(p_settings_patch -> 'integrations') <> 'object' then
      raise exception 'invalid_integrations_settings' using errcode = '22023';
    end if;

    select coalesce(
      jsonb_object_agg(
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
      ),
      '{}'::jsonb
    )
      into v_integrations
    from jsonb_each(p_settings_patch -> 'integrations') as item;

    v_patch := v_patch || jsonb_build_object('integrations', v_integrations);
  end if;

  update public.tenants
     set name = coalesce(nullif(btrim(p_name), ''), name),
         settings = coalesce(settings, '{}'::jsonb) || v_patch,
         updated_at = now()
   where id = v_tenant_id
   returning settings
   into v_updated_settings;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'clinic_settings.updated',
    'tenant',
    v_tenant_id::text,
    jsonb_build_object(
      'keys', coalesce((select jsonb_agg(key) from jsonb_object_keys(v_patch) as key), '[]'::jsonb),
      'nameProvided', p_name is not null
    )
  );

  return jsonb_build_object(
    'tenantId', v_tenant_id,
    'settings', v_updated_settings
  );
end;
$$;

create or replace function public.upsert_clinic_unit(
  p_unit_id uuid default null,
  p_code text default null,
  p_name text default null,
  p_status text default 'active',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_unit public.tenant_units%rowtype;
  v_code text := lower(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9_-]+', '-', 'g'));
  v_name text := btrim(coalesce(p_name, ''));
  v_status text := coalesce(p_status, 'active');
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'unit_name_required' using errcode = '22023';
  end if;

  if v_code = '' then
    v_code := lower(regexp_replace(v_name, '[^a-zA-Z0-9_-]+', '-', 'g'));
  end if;

  v_code := trim(both '-' from v_code);

  if v_code = '' then
    raise exception 'unit_code_required' using errcode = '22023';
  end if;

  if v_status not in ('active', 'inactive', 'archived') then
    raise exception 'invalid_unit_status' using errcode = '22023';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'invalid_unit_metadata' using errcode = '22023';
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

  if not security.has_permission(v_tenant_id, 'settings.write', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_unit_id is null then
    insert into public.tenant_units (tenant_id, code, name, status, metadata)
    values (v_tenant_id, v_code, v_name, v_status, p_metadata)
    returning *
    into v_unit;
  else
    update public.tenant_units
       set code = v_code,
           name = v_name,
           status = v_status,
           metadata = p_metadata,
           updated_at = now()
     where tenant_id = v_tenant_id
       and id = p_unit_id
     returning *
     into v_unit;

    if not found then
      raise exception 'unit_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'clinic_unit.upserted',
    'tenant_unit',
    v_unit.id::text,
    jsonb_build_object('status', v_unit.status, 'code', v_unit.code)
  );

  return jsonb_build_object(
    'id', v_unit.id,
    'code', v_unit.code,
    'name', v_unit.name,
    'status', v_unit.status,
    'metadata', v_unit.metadata,
    'createdAt', v_unit.created_at,
    'updatedAt', v_unit.updated_at
  );
end;
$$;

revoke all on function public.get_clinic_settings_snapshot() from public;
revoke all on function public.update_clinic_settings(text, jsonb) from public;
revoke all on function public.upsert_clinic_unit(uuid, text, text, text, jsonb) from public;

grant execute on function public.get_clinic_settings_snapshot() to authenticated, service_role;
grant execute on function public.update_clinic_settings(text, jsonb) to authenticated, service_role;
grant execute on function public.upsert_clinic_unit(uuid, text, text, text, jsonb) to authenticated, service_role;
