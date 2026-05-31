-- Programs builder and enrollment contracts.
-- Scope: transactional MVP contracts for clinic programs, packages and journey check-ins.

alter table public.programs
  add column if not exists checkins_total integer not null default 0 check (checkins_total >= 0),
  add column if not exists checkin_frequency text,
  add column if not exists financial_config jsonb not null default '{}'::jsonb;

create table if not exists public.program_team_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  program_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_label text,
  specialty text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, program_id, profile_id),
  constraint program_team_members_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
    on delete cascade
);

create table if not exists public.patient_program_checkins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  enrollment_id uuid not null,
  program_id uuid not null,
  template_id uuid,
  title text not null,
  channel text check (channel is null or channel in ('app', 'whatsapp', 'email', 'presencial')),
  due_date date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'completed', 'overdue', 'canceled')),
  questions jsonb not null default '[]'::jsonb,
  responses jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_program_checkins_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint patient_program_checkins_enrollment_same_tenant
    foreign key (tenant_id, enrollment_id)
    references public.patient_program_enrollments(tenant_id, id)
    on delete cascade,
  constraint patient_program_checkins_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
    on delete cascade,
  constraint patient_program_checkins_template_same_tenant
    foreign key (tenant_id, template_id)
    references public.program_checkin_templates(tenant_id, id)
    on delete set null
);

create index if not exists idx_program_team_members_program
  on public.program_team_members(tenant_id, program_id);

create index if not exists idx_patient_program_checkins_patient_due
  on public.patient_program_checkins(tenant_id, patient_id, due_date desc);

create index if not exists idx_patient_program_checkins_enrollment_status
  on public.patient_program_checkins(tenant_id, enrollment_id, status, due_date);

select security.touch_updated_at('public.program_team_members');
select security.touch_updated_at('public.patient_program_checkins');

alter table public.program_team_members enable row level security;
alter table public.patient_program_checkins enable row level security;

drop policy if exists program_team_members_select_packages_read on public.program_team_members;
create policy program_team_members_select_packages_read
on public.program_team_members for select
to authenticated
using (public.has_permission(tenant_id, 'packages.read'));

drop policy if exists program_team_members_write_packages_write on public.program_team_members;
create policy program_team_members_write_packages_write
on public.program_team_members for all
to authenticated
using (public.has_permission(tenant_id, 'packages.write'))
with check (public.has_permission(tenant_id, 'packages.write'));

drop policy if exists patient_program_checkins_select_packages_read on public.patient_program_checkins;
create policy patient_program_checkins_select_packages_read
on public.patient_program_checkins for select
to authenticated
using (public.has_permission(tenant_id, 'packages.read'));

drop policy if exists patient_program_checkins_write_packages_write on public.patient_program_checkins;
create policy patient_program_checkins_write_packages_write
on public.patient_program_checkins for all
to authenticated
using (public.has_permission(tenant_id, 'packages.write'))
with check (public.has_permission(tenant_id, 'packages.write'));

grant select, insert, update, delete on public.program_team_members to authenticated, service_role;
grant select, insert, update, delete on public.patient_program_checkins to authenticated, service_role;

create or replace function public.get_clinic_programs()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_programs jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'programType', p.program_type,
        'objective', coalesce(p.objective, ''),
        'durationWeeks', p.duration_weeks,
        'status', p.status,
        'phases', coalesce(phases.items, '[]'::jsonb),
        'includedServices', coalesce(services.items, '[]'::jsonb),
        'checkInsTotal', coalesce(p.checkins_total, 0),
        'checkInFrequency',
          coalesce(nullif(p.checkin_frequency, ''), checkins.first_frequency, 'Sem check-ins'),
        'checkinTemplates', coalesce(checkins.items, '[]'::jsonb),
        'appEntitlements', coalesce(entitlements.items, '[]'::jsonb),
        'requiredDocuments', coalesce(documents.items, '[]'::jsonb),
        'paymentModel', p.payment_model,
        'paymentDescription', coalesce(p.payment_description, ''),
        'financialConfig', coalesce(p.financial_config, '{}'::jsonb),
        'team', coalesce(team.items, '[]'::jsonb),
        'activePatients', coalesce(enrollments.active_count, 0),
        'createdAt', p.created_at,
        'updatedAt', p.updated_at,
        'color', coalesce(nullif(p.color, ''), 'teal')
      )
      order by
        case p.status when 'ativo' then 0 when 'rascunho' then 1 else 2 end,
        p.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_programs
  from public.programs p
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'name', ph.name,
        'durationWeeks', ph.duration_weeks,
        'description', coalesce(ph.description, '')
      )
      order by ph.position asc, ph.created_at asc
    ) as items
    from public.program_phases ph
    where ph.tenant_id = p.tenant_id
      and ph.program_id = p.id
  ) phases on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'label', ps.label,
        'quantity', ps.quantity,
        'unit', ps.unit
      )
      order by ps.created_at asc
    ) as items
    from public.program_services ps
    where ps.tenant_id = p.tenant_id
      and ps.program_id = p.id
  ) services on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'key', pe.key,
        'label', pe.label,
        'enabled', pe.enabled
      )
      order by pe.created_at asc
    ) as items
    from public.program_entitlements pe
    where pe.tenant_id = p.tenant_id
      and pe.program_id = p.id
  ) entitlements on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'label', prd.label,
        'required', prd.required
      )
      order by prd.created_at asc
    ) as items
    from public.program_required_documents prd
    where prd.tenant_id = p.tenant_id
      and prd.program_id = p.id
  ) documents on true
  left join lateral (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', pct.id,
          'label', pct.label,
          'frequency', coalesce(pct.frequency, ''),
          'channel', coalesce(pct.channel, 'app'),
          'questions', coalesce(pct.questions, '[]'::jsonb)
        )
        order by pct.created_at asc
      ) as items,
      min(nullif(pct.frequency, '')) as first_frequency
    from public.program_checkin_templates pct
    where pct.tenant_id = p.tenant_id
      and pct.program_id = p.id
  ) checkins on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', ptm.profile_id,
        'name', coalesce(nullif(profile.full_name, ''), profile.email, 'Profissional'),
        'role', coalesce(nullif(ptm.role_label, ''), tm.role_code, 'Equipe'),
        'specialty', coalesce(nullif(ptm.specialty, ''), tm.role_code, '')
      )
      order by profile.full_name nulls last, profile.email nulls last
    ) as items
    from public.program_team_members ptm
    join public.profiles profile on profile.id = ptm.profile_id
    left join public.tenant_memberships tm
      on tm.tenant_id = ptm.tenant_id
     and tm.user_id = ptm.profile_id
    where ptm.tenant_id = p.tenant_id
      and ptm.program_id = p.id
  ) team on true
  left join lateral (
    select count(*)::integer as active_count
    from public.patient_program_enrollments e
    where e.tenant_id = p.tenant_id
      and e.program_id = p.id
      and e.status in ('ativo', 'pausado', 'aguardando')
  ) enrollments on true
  where p.tenant_id = v_tenant_id;

  select jsonb_build_object(
    'total', count(*)::integer,
    'active', count(*) filter (where status = 'ativo')::integer,
    'draft', count(*) filter (where status = 'rascunho')::integer,
    'archived', count(*) filter (where status = 'arquivado')::integer,
    'activePatients',
      coalesce((
        select count(*)::integer
        from public.patient_program_enrollments e
        where e.tenant_id = v_tenant_id
          and e.status in ('ativo', 'pausado', 'aguardando')
      ), 0)
  )
  into v_summary
  from public.programs
  where tenant_id = v_tenant_id;

  return jsonb_build_object(
    'programs', v_programs,
    'summary', v_summary,
    'lastCheckedAt', now()
  );
end;
$$;

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

  select coalesce(jsonb_agg(item order by item ->> 'name'), '[]'::jsonb)
  into v_team
  from (
    select jsonb_build_object(
      'id', p.id,
      'name', coalesce(nullif(p.full_name, ''), p.email, 'Profissional'),
      'role',
        case tm.role_code
          when 'clinic_admin' then 'Coordenacao'
          when 'physician' then 'Medico'
          when 'nutritionist' then 'Nutricionista'
          when 'fitness_professional' then 'Educador fisico'
          when 'external_professional' then 'Profissional externo'
          else tm.role_code
        end,
      'specialty',
        case tm.role_code
          when 'clinic_admin' then 'Gestao clinica'
          when 'physician' then 'Medicina'
          when 'nutritionist' then 'Nutricao'
          when 'fitness_professional' then 'Atividade fisica'
          else tm.role_code
        end
    ) as item
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
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
  ) team_rows;

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

create or replace function public.upsert_program_from_builder(
  p_draft jsonb,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_program_id uuid;
  v_name text := btrim(coalesce(p_draft ->> 'name', ''));
  v_program_type text := coalesce(nullif(p_draft ->> 'programType', ''), 'saude_metabolica');
  v_duration_weeks integer := greatest(coalesce(nullif(p_draft ->> 'durationWeeks', '')::integer, 0), 0);
  v_status text := case when p_publish then 'ativo' else coalesce(nullif(p_draft ->> 'status', ''), 'rascunho') end;
  v_payment_model text := coalesce(p_draft #>> '{financial,paymentModel}', 'parcelado');
  v_payment_description text := coalesce(p_draft #>> '{financial,description}', '');
  v_checkins_total integer := greatest(coalesce(nullif(p_draft ->> 'checkInsTotal', '')::integer, 0), 0);
  v_checkin_frequency text := nullif(p_draft ->> 'checkInFrequency', '');
  v_id_text text := nullif(p_draft ->> 'id', '');
  v_uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
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

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'packages.write', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'program_name_required' using errcode = '22023';
  end if;

  if v_program_type not in ('emagrecimento', 'hipertrofia', 'recomposicao', 'saude_metabolica', 'longevidade') then
    raise exception 'invalid_program_type' using errcode = '22023';
  end if;

  if v_status not in ('ativo', 'arquivado', 'rascunho') then
    raise exception 'invalid_program_status' using errcode = '22023';
  end if;

  if v_payment_model not in ('parcelado', 'avista', 'assinatura', 'hibrido') then
    raise exception 'invalid_payment_model' using errcode = '22023';
  end if;

  if v_id_text is not null then
    if v_id_text !~ v_uuid_pattern then
      raise exception 'invalid_program_id' using errcode = '22023';
    end if;
    v_program_id := v_id_text::uuid;
    if not exists (
      select 1
      from public.programs
      where tenant_id = v_tenant_id
        and id = v_program_id
    ) then
      raise exception 'program_not_found' using errcode = 'P0002';
    end if;
  end if;

  if v_program_id is null then
    insert into public.programs (
      tenant_id,
      name,
      program_type,
      objective,
      duration_weeks,
      status,
      payment_model,
      payment_description,
      color,
      created_by,
      checkins_total,
      checkin_frequency,
      financial_config
    )
    values (
      v_tenant_id,
      v_name,
      v_program_type,
      nullif(p_draft ->> 'objective', ''),
      v_duration_weeks,
      v_status,
      v_payment_model,
      nullif(v_payment_description, ''),
      coalesce(nullif(p_draft ->> 'color', ''), 'teal'),
      v_user_id,
      v_checkins_total,
      v_checkin_frequency,
      coalesce(p_draft -> 'financial', '{}'::jsonb)
    )
    returning id into v_program_id;
  else
    update public.programs
    set name = v_name,
        program_type = v_program_type,
        objective = nullif(p_draft ->> 'objective', ''),
        duration_weeks = v_duration_weeks,
        status = v_status,
        payment_model = v_payment_model,
        payment_description = nullif(v_payment_description, ''),
        color = coalesce(nullif(p_draft ->> 'color', ''), 'teal'),
        checkins_total = v_checkins_total,
        checkin_frequency = v_checkin_frequency,
        financial_config = coalesce(p_draft -> 'financial', '{}'::jsonb),
        updated_at = now()
    where tenant_id = v_tenant_id
      and id = v_program_id;
  end if;

  delete from public.program_phases where tenant_id = v_tenant_id and program_id = v_program_id;
  delete from public.program_services where tenant_id = v_tenant_id and program_id = v_program_id;
  delete from public.program_entitlements where tenant_id = v_tenant_id and program_id = v_program_id;
  delete from public.program_required_documents where tenant_id = v_tenant_id and program_id = v_program_id;
  delete from public.program_checkin_templates where tenant_id = v_tenant_id and program_id = v_program_id;
  delete from public.program_team_members where tenant_id = v_tenant_id and program_id = v_program_id;

  insert into public.program_phases (tenant_id, program_id, position, name, duration_weeks, description)
  select
    v_tenant_id,
    v_program_id,
    phase_ord::integer,
    btrim(coalesce(phase ->> 'name', 'Fase')),
    greatest(coalesce(nullif(phase ->> 'durationWeeks', '')::integer, 0), 0),
    nullif(phase ->> 'description', '')
  from jsonb_array_elements(coalesce(p_draft -> 'phases', '[]'::jsonb)) with ordinality as phases(phase, phase_ord)
  where btrim(coalesce(phase ->> 'name', '')) <> '';

  insert into public.program_services (tenant_id, program_id, label, quantity, unit)
  select
    v_tenant_id,
    v_program_id,
    btrim(coalesce(service ->> 'label', 'Servico')),
    greatest(coalesce(nullif(service ->> 'quantity', '')::numeric, 0), 0),
    coalesce(nullif(service ->> 'unit', ''), 'unidade')
  from jsonb_array_elements(coalesce(p_draft -> 'includedServices', '[]'::jsonb)) as services(service)
  where btrim(coalesce(service ->> 'label', '')) <> '';

  insert into public.program_entitlements (tenant_id, program_id, key, label, enabled)
  select
    v_tenant_id,
    v_program_id,
    btrim(coalesce(entitlement ->> 'key', entitlement ->> 'label')),
    btrim(coalesce(entitlement ->> 'label', entitlement ->> 'key')),
    coalesce((entitlement ->> 'enabled')::boolean, true)
  from jsonb_array_elements(coalesce(p_draft -> 'appEntitlements', '[]'::jsonb)) as entitlements(entitlement)
  where btrim(coalesce(entitlement ->> 'key', entitlement ->> 'label', '')) <> '';

  insert into public.program_required_documents (tenant_id, program_id, label, required)
  select
    v_tenant_id,
    v_program_id,
    btrim(coalesce(document ->> 'label', 'Documento')),
    coalesce((document ->> 'required')::boolean, true)
  from jsonb_array_elements(coalesce(p_draft -> 'requiredDocuments', '[]'::jsonb)) as documents(document)
  where btrim(coalesce(document ->> 'label', '')) <> '';

  insert into public.program_checkin_templates (tenant_id, program_id, label, frequency, channel, questions)
  select
    v_tenant_id,
    v_program_id,
    btrim(coalesce(template ->> 'label', 'Check-in')),
    nullif(template ->> 'frequency', ''),
    case
      when template ->> 'channel' in ('app', 'whatsapp', 'email', 'presencial')
        then template ->> 'channel'
      else 'app'
    end,
    case
      when jsonb_typeof(template -> 'questions') = 'array'
        then template -> 'questions'
      else '[]'::jsonb
    end
  from jsonb_array_elements(coalesce(p_draft -> 'checkinTemplates', '[]'::jsonb)) as templates(template)
  where btrim(coalesce(template ->> 'label', '')) <> '';

  if v_checkins_total > 0
     and not exists (
       select 1
       from public.program_checkin_templates
       where tenant_id = v_tenant_id
         and program_id = v_program_id
     ) then
    insert into public.program_checkin_templates (tenant_id, program_id, label, frequency, channel, questions)
    values (
      v_tenant_id,
      v_program_id,
      'Check-in do programa',
      coalesce(v_checkin_frequency, 'Semanal via app'),
      'app',
      '[
        "Como foi sua adesao ao plano nesta semana?",
        "Teve alguma dificuldade relevante?",
        "Deseja registrar alguma observacao para a equipe?"
      ]'::jsonb
    );
  end if;

  insert into public.program_team_members (tenant_id, program_id, profile_id, role_label, specialty)
  select
    v_tenant_id,
    v_program_id,
    team.profile_id,
    nullif(team.item ->> 'role', ''),
    nullif(team.item ->> 'specialty', '')
  from (
    select item, (item ->> 'id')::uuid as profile_id
    from jsonb_array_elements(coalesce(p_draft -> 'team', '[]'::jsonb)) as team_items(item)
    where item ->> 'id' ~ v_uuid_pattern
  ) team
  where exists (
    select 1
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.tenant_id = v_tenant_id
      and tm.user_id = team.profile_id
      and tm.status = 'active'
      and p.is_active = true
  )
  on conflict (tenant_id, program_id, profile_id) do update
  set role_label = excluded.role_label,
      specialty = excluded.specialty,
      updated_at = now();

  return jsonb_build_object(
    'id', v_program_id,
    'status', v_status,
    'published', p_publish,
    'updatedAt', now()
  );
end;
$$;

create or replace function public.update_program_status(
  p_program_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
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

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'packages.write', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_status not in ('ativo', 'arquivado', 'rascunho') then
    raise exception 'invalid_program_status' using errcode = '22023';
  end if;

  update public.programs
  set status = p_status,
      updated_at = now()
  where tenant_id = v_tenant_id
    and id = p_program_id;

  if not found then
    raise exception 'program_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', p_program_id, 'status', p_status, 'updatedAt', now());
end;
$$;

create or replace function public.clone_program(p_program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_source public.programs%rowtype;
  v_new_id uuid;
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

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'packages.write', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
    into v_source
  from public.programs
  where tenant_id = v_tenant_id
    and id = p_program_id;

  if not found then
    raise exception 'program_not_found' using errcode = 'P0002';
  end if;

  insert into public.programs (
    tenant_id,
    name,
    program_type,
    objective,
    duration_weeks,
    status,
    payment_model,
    payment_description,
    color,
    created_by,
    checkins_total,
    checkin_frequency,
    financial_config
  )
  values (
    v_tenant_id,
    left(v_source.name || ' - copia ' || to_char(clock_timestamp(), 'HH24MISS'), 120),
    v_source.program_type,
    v_source.objective,
    v_source.duration_weeks,
    'rascunho',
    v_source.payment_model,
    v_source.payment_description,
    v_source.color,
    v_user_id,
    v_source.checkins_total,
    v_source.checkin_frequency,
    v_source.financial_config
  )
  returning id into v_new_id;

  insert into public.program_phases (tenant_id, program_id, position, name, duration_weeks, description)
  select tenant_id, v_new_id, position, name, duration_weeks, description
  from public.program_phases
  where tenant_id = v_tenant_id
    and program_id = p_program_id;

  insert into public.program_services (tenant_id, program_id, label, quantity, unit, metadata)
  select tenant_id, v_new_id, label, quantity, unit, metadata
  from public.program_services
  where tenant_id = v_tenant_id
    and program_id = p_program_id;

  insert into public.program_entitlements (tenant_id, program_id, key, label, enabled, config)
  select tenant_id, v_new_id, key, label, enabled, config
  from public.program_entitlements
  where tenant_id = v_tenant_id
    and program_id = p_program_id;

  insert into public.program_required_documents (tenant_id, program_id, label, required, template_id)
  select tenant_id, v_new_id, label, required, template_id
  from public.program_required_documents
  where tenant_id = v_tenant_id
    and program_id = p_program_id;

  insert into public.program_checkin_templates (tenant_id, program_id, label, frequency, channel, questions)
  select tenant_id, v_new_id, label, frequency, channel, questions
  from public.program_checkin_templates
  where tenant_id = v_tenant_id
    and program_id = p_program_id;

  insert into public.program_team_members (tenant_id, program_id, profile_id, role_label, specialty)
  select tenant_id, v_new_id, profile_id, role_label, specialty
  from public.program_team_members
  where tenant_id = v_tenant_id
    and program_id = p_program_id;

  return jsonb_build_object('id', v_new_id, 'status', 'rascunho', 'sourceId', p_program_id);
end;
$$;

create or replace function public.enroll_patient_in_program(
  p_patient_id uuid,
  p_program_id uuid,
  p_start_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_program public.programs%rowtype;
  v_enrollment_id uuid;
  v_total_consultations integer := 0;
  v_total_nutrition integer := 0;
  v_step_days integer := 7;
  v_template_count integer := 0;
  v_template_id uuid;
  v_template_label text;
  v_template_channel text;
  v_template_questions jsonb;
  v_index integer;
  v_due_date date;
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

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'packages.write', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.patients p
    where p.tenant_id = v_tenant_id
      and p.id = p_patient_id
  ) then
    raise exception 'patient_not_found' using errcode = 'P0002';
  end if;

  select *
    into v_program
  from public.programs
  where tenant_id = v_tenant_id
    and id = p_program_id;

  if not found then
    raise exception 'program_not_found' using errcode = 'P0002';
  end if;

  if v_program.status <> 'ativo' then
    raise exception 'program_not_active' using errcode = '22023';
  end if;

  select
    coalesce(sum(quantity) filter (
      where lower(label || ' ' || unit) like '%consulta%'
        and lower(label || ' ' || unit) not like '%nutri%'
    ), 0)::integer,
    coalesce(sum(quantity) filter (
      where lower(label || ' ' || unit) like '%nutri%'
    ), 0)::integer
  into v_total_consultations, v_total_nutrition
  from public.program_services
  where tenant_id = v_tenant_id
    and program_id = p_program_id;

  insert into public.patient_program_enrollments (
    tenant_id,
    patient_id,
    program_id,
    status,
    start_date,
    end_date,
    current_week,
    total_consultations,
    total_nutrition_sessions,
    metadata
  )
  values (
    v_tenant_id,
    p_patient_id,
    p_program_id,
    'ativo',
    p_start_date,
    p_start_date + (greatest(v_program.duration_weeks, 0) * 7) - 1,
    1,
    v_total_consultations,
    v_total_nutrition,
    jsonb_build_object(
      'created_by', v_user_id,
      'created_by_contract', 'enroll_patient_in_program',
      'checkins_total', v_program.checkins_total,
      'checkin_frequency', v_program.checkin_frequency,
      'payment_model', v_program.payment_model
    )
  )
  returning id into v_enrollment_id;

  if lower(coalesce(v_program.checkin_frequency, '')) like '%quinzen%' then
    v_step_days := 14;
  elsif lower(coalesce(v_program.checkin_frequency, '')) like '%mensal%' then
    v_step_days := 30;
  else
    v_step_days := 7;
  end if;

  select count(*)::integer
    into v_template_count
  from public.program_checkin_templates
  where tenant_id = v_tenant_id
    and program_id = p_program_id;

  if v_program.checkins_total > 0 then
    for v_index in 1..least(v_program.checkins_total, 52) loop
      v_due_date := p_start_date + (v_index * v_step_days);
      v_template_id := null;
      v_template_label := null;
      v_template_channel := null;
      v_template_questions := '[]'::jsonb;

      if v_template_count > 0 then
        select pct.id, pct.label, pct.channel, pct.questions
          into v_template_id, v_template_label, v_template_channel, v_template_questions
        from public.program_checkin_templates pct
        where pct.tenant_id = v_tenant_id
          and pct.program_id = p_program_id
        order by pct.created_at asc
        offset ((v_index - 1) % v_template_count)
        limit 1;
      end if;

      insert into public.patient_program_checkins (
        tenant_id,
        patient_id,
        enrollment_id,
        program_id,
        template_id,
        title,
        channel,
        due_date,
        status,
        questions
      )
      values (
        v_tenant_id,
        p_patient_id,
        v_enrollment_id,
        p_program_id,
        v_template_id,
        coalesce(v_template_label, 'Check-in do programa') || ' #' || v_index,
        coalesce(v_template_channel, 'app'),
        v_due_date,
        'scheduled',
        coalesce(v_template_questions, '[]'::jsonb)
      );
    end loop;
  end if;

  insert into public.patient_timeline_events (
    tenant_id,
    patient_id,
    event_type,
    category,
    status,
    title,
    description,
    actor_name,
    status_label,
    action_label,
    details_href,
    event_at,
    payload
  )
  values (
    v_tenant_id,
    p_patient_id,
    'programa_iniciado',
    'commercial',
    'recorded',
    'Programa iniciado',
    'Paciente matriculado em ' || v_program.name || '.',
    'Equipe clinica',
    'Ativo',
    'Ver pacote',
    '/clinic/patients/' || p_patient_id || '?tab=pacotes',
    now(),
    jsonb_build_object(
      'programId', p_program_id,
      'enrollmentId', v_enrollment_id,
      'checkinsCreated', least(v_program.checkins_total, 52)
    )
  );

  return jsonb_build_object(
    'id', v_enrollment_id,
    'patientId', p_patient_id,
    'programId', p_program_id,
    'checkinsCreated', least(v_program.checkins_total, 52),
    'status', 'ativo'
  );
end;
$$;

grant execute on function public.get_clinic_programs() to authenticated, service_role;
grant execute on function public.get_program_builder_options() to authenticated, service_role;
grant execute on function public.upsert_program_from_builder(jsonb, boolean) to authenticated, service_role;
grant execute on function public.update_program_status(uuid, text) to authenticated, service_role;
grant execute on function public.clone_program(uuid) to authenticated, service_role;
grant execute on function public.enroll_patient_in_program(uuid, uuid, date) to authenticated, service_role;
