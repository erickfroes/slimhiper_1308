-- P0: make Program Builder team options use tenant_professionals as the
-- clinical source of truth while preserving legacy role-based tenants.

create or replace function public.get_program_builder_options()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_team jsonb := '[]'::jsonb;
  v_checkins jsonb := '[]'::jsonb;
begin
  select coalesce(
    (
      select p.active_tenant_id
      from public.profiles p
      where p.id = v_user_id
        and p.is_active = true
        and p.active_tenant_id is not null
        and security.is_tenant_member(p.active_tenant_id)
      limit 1
    ),
    (
      select tm.tenant_id
      from public.tenant_memberships tm
      join public.profiles p on p.id = tm.user_id
      where tm.user_id = v_user_id
        and tm.status = 'active'
        and p.is_active = true
      order by tm.created_at asc
      limit 1
    )
  )
  into v_tenant_id;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'packages.read', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with active_professional_rows as (
    select
      p.id as profile_id,
      p.email,
      coalesce(nullif(p.full_name, ''), p.email, 'Profissional') as name,
      tm.role_code,
      tm.status as membership_status,
      p.is_active as profile_is_active,
      tp.id as professional_profile_id,
      tp.professional_type,
      tp.license_number,
      tp.license_state,
      coalesce(
        nullif(tp.specialty, ''),
        case tp.professional_type
          when 'physician' then 'Medicina'
          when 'nutritionist' then 'Nutricao'
          when 'fitness_professional' then 'Atividade fisica'
          when 'external_professional' then 'Profissional externo'
          else 'Equipe'
        end
      ) as specialty,
      true as professional_is_active,
      coalesce(tp.unit_id, tm.unit_id) as unit_id,
      coalesce(tu_prof.name, tu_member.name) as unit_name,
      'tenant_professionals'::text as source
    from public.tenant_professionals tp
    join public.tenant_memberships tm
      on tm.tenant_id = tp.tenant_id
     and tm.id = tp.membership_id
     and tm.user_id = tp.user_id
    join public.profiles p on p.id = tp.user_id
    left join public.tenant_units tu_prof
      on tu_prof.tenant_id = tp.tenant_id
     and tu_prof.id = tp.unit_id
    left join public.tenant_units tu_member
      on tu_member.tenant_id = tm.tenant_id
     and tu_member.id = tm.unit_id
    where tp.tenant_id = v_tenant_id
      and tp.is_active = true
      and tm.status = 'active'
      and p.is_active = true
  ), legacy_role_rows as (
    select
      p.id as profile_id,
      p.email,
      coalesce(nullif(p.full_name, ''), p.email, 'Profissional') as name,
      tm.role_code,
      tm.status as membership_status,
      p.is_active as profile_is_active,
      null::uuid as professional_profile_id,
      case tm.role_code
        when 'physician' then 'physician'
        when 'nutritionist' then 'nutritionist'
        when 'fitness_professional' then 'fitness_professional'
        when 'external_professional' then 'external_professional'
        else null
      end as professional_type,
      null::text as license_number,
      null::text as license_state,
      case tm.role_code
        when 'clinic_admin' then 'Gestao clinica'
        when 'physician' then 'Medicina'
        when 'nutritionist' then 'Nutricao'
        when 'fitness_professional' then 'Atividade fisica'
        when 'external_professional' then 'Profissional externo'
        else tm.role_code
      end as specialty,
      true as professional_is_active,
      tm.unit_id,
      tu.name as unit_name,
      'legacy_role'::text as source
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    left join public.tenant_units tu
      on tu.tenant_id = tm.tenant_id
     and tu.id = tm.unit_id
    where tm.tenant_id = v_tenant_id
      and tm.status = 'active'
      and p.is_active = true
      and tm.role_code in (
        'clinic_admin',
        'physician',
        'nutritionist',
        'fitness_professional',
        'external_professional'
      )
      and not exists (select 1 from active_professional_rows)
  ), source_rows as (
    select * from active_professional_rows
    union all
    select * from legacy_role_rows
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', source.profile_id,
        'name', source.name,
        'email', source.email,
        'role',
          case source.professional_type
            when 'physician' then 'Medico'
            when 'nutritionist' then 'Nutricionista'
            when 'fitness_professional' then 'Profissional fitness'
            when 'external_professional' then 'Profissional externo'
            else
              case source.role_code
                when 'clinic_admin' then 'Coordenacao'
                else coalesce(source.role_code, 'Equipe')
              end
          end,
        'roleCode', source.role_code,
        'specialty', coalesce(source.specialty, ''),
        'professionalProfileId', source.professional_profile_id,
        'professionalType', source.professional_type,
        'licenseNumber', source.license_number,
        'licenseState', source.license_state,
        'unitId', source.unit_id,
        'unitName', source.unit_name,
        'status',
          case
            when source.professional_is_active and source.membership_status = 'active' and source.profile_is_active
              then 'active'
            else 'inactive'
          end,
        'membershipStatus', source.membership_status,
        'profileStatus', case when source.profile_is_active then 'active' else 'inactive' end,
        'isActive', source.professional_is_active and source.membership_status = 'active' and source.profile_is_active,
        'source', source.source,
        'countsAsDoctor',
          source.professional_type = 'physician'
          and source.professional_is_active
          and source.membership_status = 'active'
      )
      order by source.name, source.email
    ),
    '[]'::jsonb
  )
  into v_team
  from source_rows source;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', source.id,
        'label', source.label,
        'frequency', coalesce(source.frequency, ''),
        'channel', coalesce(source.channel, 'app'),
        'questions', coalesce(source.questions, '[]'::jsonb)
      )
      order by source.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_checkins
  from (
    select distinct on (lower(pct.label), coalesce(pct.frequency, ''), coalesce(pct.channel, 'app'))
      pct.id,
      pct.label,
      pct.frequency,
      pct.channel,
      pct.questions,
      pct.updated_at
    from public.program_checkin_templates pct
    where pct.tenant_id = v_tenant_id
    order by lower(pct.label), coalesce(pct.frequency, ''), coalesce(pct.channel, 'app'), pct.updated_at desc
    limit 12
  ) source;

  return jsonb_build_object(
    'teamMembers', v_team,
    'checkinTemplates', v_checkins
  );
end;
$$;

revoke all on function public.get_program_builder_options() from public;
grant execute on function public.get_program_builder_options() to authenticated, service_role;

comment on function public.get_program_builder_options() is
  'Returns Program Builder options. P0: team members come from active tenant_professionals with legacy role fallback only when no professional profiles exist.';
