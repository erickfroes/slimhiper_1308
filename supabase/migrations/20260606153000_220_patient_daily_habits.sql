-- M01: patient daily mobile-first habits.
-- Patient/guardian writes are only exposed through patient-scoped RPCs guarded by
-- security.can_access_patient_portal_patient. Meal photos stay in a private bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function security.storage_object_patient_id(p_object_name text)
returns uuid
language sql
stable
as $$
  select
    case
      when p_object_name is null then null
      when security.is_valid_uuid_text(split_part(p_object_name, '/', 2))
        then split_part(p_object_name, '/', 2)::uuid
      else null
    end;
$$;

create or replace function security.is_valid_patient_daily_photo_path(p_object_name text)
returns boolean
language sql
stable
as $$
  select
    p_object_name is not null
    and array_length(string_to_array(p_object_name, '/'), 1) = 4
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 1))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 2))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 3))
    and nullif(split_part(p_object_name, '/', 4), '') is not null
    and split_part(p_object_name, '/', 4) !~ '[\\/]';
$$;

revoke all on function security.storage_object_patient_id(text) from public;
revoke all on function security.is_valid_patient_daily_photo_path(text) from public;
grant execute on function security.storage_object_patient_id(text) to authenticated, service_role;
grant execute on function security.is_valid_patient_daily_photo_path(text) to authenticated, service_role;

create or replace function security.can_access_patient_portal_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    auth.uid() is not null
    and p_tenant_id is not null
    and public.has_permission(p_tenant_id, 'patient_portal.access')
    and (
      exists (
        select 1
        from public.patient_accounts pa
        where pa.tenant_id = p_tenant_id
          and pa.user_id = auth.uid()
          and pa.status = 'active'
      )
      or exists (
        select 1
        from public.guardian_links gl
        where gl.tenant_id = p_tenant_id
          and gl.guardian_user_id = auth.uid()
          and gl.status = 'active'
      )
    );
$$;

revoke all on function security.can_access_patient_portal_tenant(uuid) from public;
grant execute on function security.can_access_patient_portal_tenant(uuid)
  to authenticated, service_role;

create table if not exists public.patient_daily_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid,
  status text not null default 'active' check (status in ('active', 'archived')),
  water_goal_ml integer not null default 2000 check (water_goal_ml between 250 and 10000),
  meals_goal integer not null default 4 check (meals_goal between 1 and 12),
  workouts_goal integer not null default 1 check (workouts_goal between 0 and 4),
  checkin_required boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_daily_goals_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint patient_daily_goals_effective_range
    check (effective_to is null or effective_to >= effective_from)
);

create unique index if not exists idx_patient_daily_goals_patient_active
  on public.patient_daily_goals(tenant_id, patient_id)
  where status = 'active' and patient_id is not null;

create unique index if not exists idx_patient_daily_goals_tenant_default_active
  on public.patient_daily_goals(tenant_id)
  where status = 'active' and patient_id is null;

create table if not exists public.water_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  amount_ml integer not null check (amount_ml between 1 and 5000),
  occurred_at timestamptz not null default now(),
  status text not null default 'recorded' check (status in ('recorded', 'deleted')),
  source text not null default 'patient_portal' check (source in ('patient_portal', 'clinic', 'import')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint water_entries_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  meal_type text,
  notes text,
  photo_storage_bucket text,
  photo_storage_path text,
  photo_mime_type text,
  photo_size_bytes integer check (photo_size_bytes is null or photo_size_bytes between 1 and 5242880),
  photo_upload_status text not null default 'none'
    check (photo_upload_status in ('none', 'pending_upload', 'uploaded', 'failed')),
  occurred_at timestamptz not null default now(),
  status text not null default 'recorded' check (status in ('recorded', 'pending_review', 'reviewed', 'deleted')),
  source text not null default 'patient_portal' check (source in ('patient_portal', 'clinic', 'import')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (photo_storage_bucket, photo_storage_path),
  constraint meal_entries_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint meal_entries_photo_bucket_private
    check (photo_storage_bucket is null or photo_storage_bucket = 'meal-photos'),
  constraint meal_entries_photo_path_shape
    check (photo_storage_path is null or security.is_valid_patient_daily_photo_path(photo_storage_path))
);

create table if not exists public.workout_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  workout_title text not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 360),
  intensity text check (intensity is null or intensity in ('Leve', 'Moderado', 'Intenso')),
  notes text,
  occurred_at timestamptz not null default now(),
  status text not null default 'recorded' check (status in ('recorded', 'deleted')),
  source text not null default 'patient_portal' check (source in ('patient_portal', 'clinic', 'import')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint workout_entries_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  checkin_date date not null default current_date,
  mood_score integer not null check (mood_score between 1 and 5),
  energy_score integer not null check (energy_score between 1 and 5),
  symptoms text,
  occurred_at timestamptz not null default now(),
  status text not null default 'recorded' check (status in ('recorded', 'deleted')),
  source text not null default 'patient_portal' check (source in ('patient_portal', 'clinic', 'import')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint daily_checkins_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create unique index if not exists idx_daily_checkins_one_recorded_per_day
  on public.daily_checkins(tenant_id, patient_id, checkin_date)
  where status = 'recorded';

create index if not exists idx_water_entries_patient_day
  on public.water_entries(tenant_id, patient_id, occurred_at desc)
  where status = 'recorded';
create index if not exists idx_meal_entries_patient_day
  on public.meal_entries(tenant_id, patient_id, occurred_at desc)
  where status <> 'deleted';
create index if not exists idx_workout_entries_patient_day
  on public.workout_entries(tenant_id, patient_id, occurred_at desc)
  where status = 'recorded';
create index if not exists idx_daily_checkins_patient_day
  on public.daily_checkins(tenant_id, patient_id, checkin_date desc)
  where status = 'recorded';

select security.touch_updated_at('public.patient_daily_goals');
select security.touch_updated_at('public.water_entries');
select security.touch_updated_at('public.meal_entries');
select security.touch_updated_at('public.workout_entries');
select security.touch_updated_at('public.daily_checkins');

alter table public.patient_daily_goals enable row level security;
alter table public.water_entries enable row level security;
alter table public.meal_entries enable row level security;
alter table public.workout_entries enable row level security;
alter table public.daily_checkins enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'patient_daily_goals',
    'water_entries',
    'meal_entries',
    'workout_entries',
    'daily_checkins'
  ]
  loop
    execute format('drop policy if exists %I on public.%I;', table_name || '_select_staff', table_name);
    execute format('drop policy if exists %I on public.%I;', table_name || '_select_patient_portal', table_name);
    execute format('drop policy if exists %I on public.%I;', table_name || '_write_staff', table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_clinical_permission(tenant_id, ''patients.read''));',
      table_name || '_select_staff',
      table_name
    );

    if table_name = 'patient_daily_goals' then
      execute format(
        'create policy %I on public.%I for select to authenticated using ((patient_id is not null and public.can_access_patient_portal_patient(tenant_id, patient_id)) or (patient_id is null and security.can_access_patient_portal_tenant(tenant_id)));',
        table_name || '_select_patient_portal',
        table_name
      );
    else
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.can_access_patient_portal_patient(tenant_id, patient_id));',
        table_name || '_select_patient_portal',
        table_name
      );
    end if;

    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_clinical_permission(tenant_id, ''patients.write'')) with check (public.has_clinical_permission(tenant_id, ''patients.write''));',
      table_name || '_write_staff',
      table_name
    );
  end loop;
end $$;

grant select on public.patient_daily_goals to authenticated, service_role;
grant select, insert, update on public.water_entries to authenticated, service_role;
grant select, insert, update on public.meal_entries to authenticated, service_role;
grant select, insert, update on public.workout_entries to authenticated, service_role;
grant select, insert, update on public.daily_checkins to authenticated, service_role;

drop policy if exists "meal_photos_insert_patient_portal" on storage.objects;
drop policy if exists "meal_photos_update_patient_portal" on storage.objects;

create policy "meal_photos_insert_patient_portal"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'meal-photos'
  and security.is_valid_patient_daily_photo_path(name)
  and public.can_access_patient_portal_patient(
    security.storage_object_tenant_id(name),
    security.storage_object_patient_id(name)
  )
);

create policy "meal_photos_update_patient_portal"
on storage.objects for update
to authenticated
using (
  bucket_id = 'meal-photos'
  and security.is_valid_patient_daily_photo_path(name)
  and public.can_access_patient_portal_patient(
    security.storage_object_tenant_id(name),
    security.storage_object_patient_id(name)
  )
)
with check (
  bucket_id = 'meal-photos'
  and security.is_valid_patient_daily_photo_path(name)
  and public.can_access_patient_portal_patient(
    security.storage_object_tenant_id(name),
    security.storage_object_patient_id(name)
  )
);

create or replace function security.resolve_patient_portal_link(p_patient_id uuid default null)
returns table(tenant_id uuid, patient_id uuid, linkage_type text)
language plpgsql
stable
security definer
set search_path = public, security, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  return query
  with linked as (
    select pa.tenant_id, pa.patient_id, 'patient'::text as linkage_type
    from public.patient_accounts pa
    where pa.user_id = v_user_id
      and pa.status = 'active'
      and public.has_permission(pa.tenant_id, 'patient_portal.access')
    union all
    select gl.tenant_id, gl.patient_id, 'guardian'::text as linkage_type
    from public.guardian_links gl
    where gl.guardian_user_id = v_user_id
      and gl.status = 'active'
      and public.has_permission(gl.tenant_id, 'patient_portal.access')
  ), dedup as (
    select distinct on (l.tenant_id, l.patient_id)
      l.tenant_id, l.patient_id, l.linkage_type
    from linked l
    join public.patients p on p.tenant_id = l.tenant_id and p.id = l.patient_id
    where p_patient_id is null or l.patient_id = p_patient_id
    order by l.tenant_id, l.patient_id, l.linkage_type desc
  )
  select d.tenant_id, d.patient_id, d.linkage_type
  from dedup d
  order by d.patient_id
  limit 1;
end;
$$;

revoke all on function security.resolve_patient_portal_link(uuid) from public;
grant execute on function security.resolve_patient_portal_link(uuid) to authenticated, service_role;

create or replace function security.patient_daily_clean_text(p_value text, p_max_length integer)
returns text
language sql
immutable
as $$
  select nullif(
    left(
      regexp_replace(btrim(coalesce(p_value, '')), '[[:cntrl:]]+', ' ', 'g'),
      greatest(1, least(coalesce(p_max_length, 500), 4000))
    ),
    ''
  );
$$;

revoke all on function security.patient_daily_clean_text(text, integer) from public;
grant execute on function security.patient_daily_clean_text(text, integer) to authenticated, service_role;

create or replace function security.patient_daily_entry_json(
  p_id uuid,
  p_kind text,
  p_title text,
  p_detail text,
  p_occurred_at timestamptz,
  p_status text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_id,
    'kind', p_kind,
    'title', coalesce(p_title, 'Registro'),
    'detail', coalesce(p_detail, ''),
    'occurredAt', p_occurred_at,
    'status', p_status,
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );
$$;

revoke all on function security.patient_daily_entry_json(uuid, text, text, text, timestamptz, text, jsonb) from public;
grant execute on function security.patient_daily_entry_json(uuid, text, text, text, timestamptz, text, jsonb)
  to authenticated, service_role;

create or replace function public.get_patient_daily_snapshot(
  p_patient_id uuid default null,
  p_target_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_date date := coalesce(p_target_date, current_date);
  v_start timestamptz;
  v_end timestamptz;
  v_water_goal integer := 2000;
  v_meals_goal integer := 4;
  v_workouts_goal integer := 1;
  v_checkin_required boolean := true;
  v_water_ml integer := 0;
  v_meals_count integer := 0;
  v_workouts_count integer := 0;
  v_checkin_done boolean := false;
  v_pending_checkins jsonb := '[]'::jsonb;
  v_timeline jsonb := '[]'::jsonb;
  v_week jsonb := '[]'::jsonb;
  v_progress integer := 0;
  v_total_weight numeric := 100;
  v_completed_dates text[] := array[]::text[];
begin
  select r.tenant_id, r.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id) r;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_start := v_date::timestamptz;
  v_end := (v_date + 1)::timestamptz;

  with chosen_goal as (
    select g.water_goal_ml, g.meals_goal, g.workouts_goal, g.checkin_required
    from public.patient_daily_goals g
    where g.tenant_id = v_tenant_id
      and g.status = 'active'
      and (g.patient_id = v_patient_id or g.patient_id is null)
      and g.effective_from <= v_date
      and (g.effective_to is null or g.effective_to >= v_date)
    order by (g.patient_id is not null) desc, g.effective_from desc, g.created_at desc
    limit 1
  )
  select
    coalesce((select cg.water_goal_ml from chosen_goal cg), v_water_goal),
    coalesce((select cg.meals_goal from chosen_goal cg), v_meals_goal),
    coalesce((select cg.workouts_goal from chosen_goal cg), v_workouts_goal),
    coalesce((select cg.checkin_required from chosen_goal cg), v_checkin_required)
  into v_water_goal, v_meals_goal, v_workouts_goal, v_checkin_required;

  select coalesce(sum(we.amount_ml), 0)::integer
  into v_water_ml
  from public.water_entries we
  where we.tenant_id = v_tenant_id
    and we.patient_id = v_patient_id
    and we.status = 'recorded'
    and we.occurred_at >= v_start
    and we.occurred_at < v_end;

  select count(*)::integer
  into v_meals_count
  from public.meal_entries me
  where me.tenant_id = v_tenant_id
    and me.patient_id = v_patient_id
    and me.status <> 'deleted'
    and me.occurred_at >= v_start
    and me.occurred_at < v_end;

  select count(*)::integer
  into v_workouts_count
  from public.workout_entries wo
  where wo.tenant_id = v_tenant_id
    and wo.patient_id = v_patient_id
    and wo.status = 'recorded'
    and wo.occurred_at >= v_start
    and wo.occurred_at < v_end;

  select exists (
    select 1
    from public.daily_checkins dc
    where dc.tenant_id = v_tenant_id
      and dc.patient_id = v_patient_id
      and dc.status = 'recorded'
      and dc.checkin_date = v_date
  ) or exists (
    select 1
    from public.patient_program_checkins pc
    where pc.tenant_id = v_tenant_id
      and pc.patient_id = v_patient_id
      and pc.status = 'completed'
      and pc.completed_at >= v_start
      and pc.completed_at < v_end
  )
  into v_checkin_done;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pc.id,
    'title', pc.title,
    'status', pc.status,
    'channel', pc.channel,
    'dueDate', pc.due_date,
    'questions', pc.questions,
    'responses', pc.responses,
    'completedAt', pc.completed_at
  ) order by pc.due_date asc), '[]'::jsonb)
  into v_pending_checkins
  from public.patient_program_checkins pc
  where pc.tenant_id = v_tenant_id
    and pc.patient_id = v_patient_id
    and pc.status not in ('completed', 'canceled');

  v_checkin_required := v_checkin_required or jsonb_array_length(v_pending_checkins) > 0;
  v_total_weight := 35 + 25 + 20 + case when v_checkin_required then 20 else 0 end;
  v_progress := round((
    least(v_water_ml::numeric / nullif(v_water_goal, 0), 1) * 35
    + least(v_meals_count::numeric / nullif(v_meals_goal, 0), 1) * 25
    + case when v_workouts_goal <= 0 then 20 else least(v_workouts_count::numeric / v_workouts_goal, 1) * 20 end
    + case when v_checkin_required and v_checkin_done then 20 else 0 end
  ) / v_total_weight * 100)::integer;

  select coalesce(array_agg(distinct signal_date::text), array[]::text[])
  into v_completed_dates
  from (
    select we.occurred_at::date as signal_date
    from public.water_entries we
    where we.tenant_id = v_tenant_id and we.patient_id = v_patient_id and we.status = 'recorded'
    union all
    select me.occurred_at::date
    from public.meal_entries me
    where me.tenant_id = v_tenant_id and me.patient_id = v_patient_id and me.status <> 'deleted'
    union all
    select dc.checkin_date
    from public.daily_checkins dc
    where dc.tenant_id = v_tenant_id and dc.patient_id = v_patient_id and dc.status = 'recorded'
    union all
    select pc.completed_at::date
    from public.patient_program_checkins pc
    where pc.tenant_id = v_tenant_id and pc.patient_id = v_patient_id and pc.status = 'completed' and pc.completed_at is not null
  ) signals
  where signal_date is not null;

  with days as (
    select generate_series(v_date - 6, v_date, interval '1 day')::date as day
  ), day_counts as (
    select d.day,
      coalesce((select sum(we.amount_ml)::integer from public.water_entries we where we.tenant_id = v_tenant_id and we.patient_id = v_patient_id and we.status = 'recorded' and we.occurred_at >= d.day::timestamptz and we.occurred_at < (d.day + 1)::timestamptz), 0) as water_ml,
      coalesce((select count(*)::integer from public.meal_entries me where me.tenant_id = v_tenant_id and me.patient_id = v_patient_id and me.status <> 'deleted' and me.occurred_at >= d.day::timestamptz and me.occurred_at < (d.day + 1)::timestamptz), 0) as meals_count,
      coalesce((select count(*)::integer from public.workout_entries wo where wo.tenant_id = v_tenant_id and wo.patient_id = v_patient_id and wo.status = 'recorded' and wo.occurred_at >= d.day::timestamptz and wo.occurred_at < (d.day + 1)::timestamptz), 0) as workouts_count,
      exists (select 1 from public.daily_checkins dc where dc.tenant_id = v_tenant_id and dc.patient_id = v_patient_id and dc.status = 'recorded' and dc.checkin_date = d.day) as checkin_done
    from days d
  ), scored as (
    select day,
      round((
        least(water_ml::numeric / nullif(v_water_goal, 0), 1) * 35
        + least(meals_count::numeric / nullif(v_meals_goal, 0), 1) * 25
        + case when v_workouts_goal <= 0 then 20 else least(workouts_count::numeric / v_workouts_goal, 1) * 20 end
        + case when v_checkin_required and checkin_done then 20 else 0 end
      ) / v_total_weight * 100)::integer as progress_percent
    from day_counts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'isoDate', day,
    'label', to_char(day, 'Dy'),
    'status', case
      when progress_percent >= 80 then 'done'
      when progress_percent > 0 then 'partial'
      when day = v_date then 'today'
      else 'empty'
    end,
    'progressPercent', progress_percent
  ) order by day), '[]'::jsonb)
  into v_week
  from scored;

  with timeline_rows as (
    select we.id, 'water'::text as kind, 'Agua'::text as title,
      we.amount_ml::text || ' ml registrados' as detail, we.occurred_at,
      'synced'::text as sync_status,
      jsonb_build_object('amountMl', we.amount_ml) as metadata
    from public.water_entries we
    where we.tenant_id = v_tenant_id and we.patient_id = v_patient_id and we.status = 'recorded' and we.occurred_at >= v_start and we.occurred_at < v_end
    union all
    select me.id, 'meal', coalesce('Refeicao - ' || nullif(me.meal_type, ''), 'Refeicao'),
      coalesce(nullif(me.notes, ''), 'Registro alimentar') ||
        case when me.photo_upload_status = 'uploaded' then ' - foto anexada' else '' end,
      me.occurred_at,
      case when me.photo_upload_status = 'failed' then 'failed' else 'synced' end,
      jsonb_build_object(
        'mealType', me.meal_type,
        'hasPhoto', me.photo_storage_path is not null,
        'photoUploadStatus', me.photo_upload_status
      )
    from public.meal_entries me
    where me.tenant_id = v_tenant_id and me.patient_id = v_patient_id and me.status <> 'deleted' and me.occurred_at >= v_start and me.occurred_at < v_end
    union all
    select wo.id, 'workout', wo.workout_title,
      coalesce(wo.duration_minutes::text || ' min', 'Treino registrado') ||
        coalesce(' - ' || nullif(wo.intensity, ''), ''),
      wo.occurred_at, 'synced',
      jsonb_build_object('durationMinutes', wo.duration_minutes, 'intensity', wo.intensity)
    from public.workout_entries wo
    where wo.tenant_id = v_tenant_id and wo.patient_id = v_patient_id and wo.status = 'recorded' and wo.occurred_at >= v_start and wo.occurred_at < v_end
    union all
    select dc.id, 'checkin', 'Check-in diario',
      'Humor ' || dc.mood_score::text || '/5 - energia ' || dc.energy_score::text || '/5',
      dc.occurred_at, 'synced',
      jsonb_build_object('mood', dc.mood_score, 'energy', dc.energy_score, 'hasSymptoms', dc.symptoms is not null)
    from public.daily_checkins dc
    where dc.tenant_id = v_tenant_id and dc.patient_id = v_patient_id and dc.status = 'recorded' and dc.checkin_date = v_date
  )
  select coalesce(jsonb_agg(
    security.patient_daily_entry_json(id, kind, title, detail, occurred_at, sync_status, metadata)
    order by occurred_at asc
  ), '[]'::jsonb)
  into v_timeline
  from timeline_rows;

  return jsonb_build_object(
    'selectedPatientId', v_patient_id,
    'dateIso', v_date,
    'dateLabel', to_char(v_date, 'YYYY-MM-DD'),
    'programStatus', coalesce((select p.status from public.patients p where p.tenant_id = v_tenant_id and p.id = v_patient_id), 'active'),
    'backendStatus', 'synced',
    'progressPercent', v_progress,
    'streakDays', coalesce((
      with recursive streak(day, keep_going) as (
        select v_date, v_date::text = any(v_completed_dates)
        union all
        select day - 1, (day - 1)::text = any(v_completed_dates)
        from streak
        where keep_going
      )
      select greatest(count(*) - 1, 0)::integer from streak
    ), 0),
    'waterMl', v_water_ml,
    'waterGoalMl', v_water_goal,
    'mealsCount', v_meals_count,
    'mealsGoal', v_meals_goal,
    'workoutsCount', v_workouts_count,
    'workoutsGoal', v_workouts_goal,
    'checkinRequired', v_checkin_required,
    'checkinDone', v_checkin_done,
    'pendingProgramCheckins', v_pending_checkins,
    'habits', jsonb_build_array(
      jsonb_build_object('kind', 'water', 'label', 'Agua', 'value', v_water_ml::text || ' ml', 'target', v_water_goal::text || ' ml', 'helper', case when v_water_ml >= v_water_goal then 'Meta do dia concluida' else 'Some em um toque quando beber.' end, 'status', case when v_water_ml >= v_water_goal then 'done' when v_water_ml > 0 then 'partial' else 'empty' end, 'progressPercent', least(100, round(v_water_ml::numeric / nullif(v_water_goal, 0) * 100)::integer)),
      jsonb_build_object('kind', 'meal', 'label', 'Refeicoes', 'value', v_meals_count::text, 'target', v_meals_goal::text || ' registros', 'helper', case when v_meals_count > 0 then 'Registros sincronizados.' else 'Foto opcional no mobile.' end, 'status', case when v_meals_count >= v_meals_goal then 'done' when v_meals_count > 0 then 'partial' else 'empty' end, 'progressPercent', least(100, round(v_meals_count::numeric / nullif(v_meals_goal, 0) * 100)::integer)),
      jsonb_build_object('kind', 'workout', 'label', 'Treino', 'value', v_workouts_count::text, 'target', v_workouts_goal::text || ' treino', 'helper', case when v_workouts_count > 0 then 'Treino informado hoje.' else 'Registre ou repita o ultimo.' end, 'status', case when v_workouts_goal <= 0 then 'not_configured' when v_workouts_count >= v_workouts_goal then 'done' when v_workouts_count > 0 then 'partial' else 'empty' end, 'progressPercent', case when v_workouts_goal <= 0 then 0 else least(100, round(v_workouts_count::numeric / v_workouts_goal * 100)::integer) end),
      jsonb_build_object('kind', 'checkin', 'label', 'Check-in', 'value', case when v_checkin_done then 'feito' when v_checkin_required then 'pendente' else 'sem agenda' end, 'target', case when v_checkin_required then '1 resposta' else 'nao configurado' end, 'helper', case when v_checkin_required then 'Use a escala e, se preciso, responda o check-in do programa.' else 'Nenhum check-in do programa foi configurado para este vinculo.' end, 'status', case when not v_checkin_required then 'not_configured' when v_checkin_done then 'done' else 'pending' end, 'progressPercent', case when v_checkin_required and v_checkin_done then 100 else 0 end)
    ),
    'week', v_week,
    'timeline', v_timeline
  );
end;
$$;

create or replace function public.record_patient_water_entry(
  p_patient_id uuid,
  p_amount_ml integer,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_entry public.water_entries%rowtype;
begin
  if p_amount_ml is null or p_amount_ml < 1 or p_amount_ml > 5000 then
    raise exception 'invalid_water_amount' using errcode = '22023';
  end if;

  select r.tenant_id, r.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id) r;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.water_entries (tenant_id, patient_id, amount_ml, occurred_at, created_by)
  values (v_tenant_id, v_patient_id, p_amount_ml, coalesce(p_occurred_at, now()), auth.uid())
  returning * into v_entry;

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, status, title, description,
    actor_name, status_label, details_href, event_at, payload
  )
  values (
    v_tenant_id, v_patient_id, 'meta_atingida', 'patient_app', 'recorded',
    'Agua registrada', 'Paciente registrou ingestao de agua.',
    'Portal do paciente', 'Registrado', '/clinic/patients/' || v_patient_id::text || '?tab=timeline',
    v_entry.occurred_at, jsonb_build_object('entryId', v_entry.id, 'kind', 'water', 'amountMl', v_entry.amount_ml)
  )
  on conflict do nothing;

  return jsonb_build_object(
    'entry', security.patient_daily_entry_json(v_entry.id, 'water', 'Agua', v_entry.amount_ml::text || ' ml registrados', v_entry.occurred_at, 'synced', jsonb_build_object('amountMl', v_entry.amount_ml))
  );
end;
$$;

create or replace function public.record_patient_meal_entry(
  p_patient_id uuid,
  p_meal_type text default null,
  p_notes text default null,
  p_photo_file_name text default null,
  p_photo_mime_type text default null,
  p_photo_size_bytes integer default null,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_entry_id uuid := gen_random_uuid();
  v_meal_type text := security.patient_daily_clean_text(p_meal_type, 40);
  v_notes text := security.patient_daily_clean_text(p_notes, 500);
  v_file_name text := security.patient_daily_clean_text(p_photo_file_name, 120);
  v_mime_type text := lower(security.patient_daily_clean_text(p_photo_mime_type, 80));
  v_photo_path text;
  v_photo_status text := 'none';
  v_entry public.meal_entries%rowtype;
begin
  select r.tenant_id, r.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id) r;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_file_name is not null then
    if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif') then
      raise exception 'invalid_photo_type' using errcode = '22023';
    end if;
    if p_photo_size_bytes is null or p_photo_size_bytes < 1 or p_photo_size_bytes > 5242880 then
      raise exception 'invalid_photo_size' using errcode = '22023';
    end if;
    v_file_name := regexp_replace(v_file_name, '[^a-zA-Z0-9._-]+', '-', 'g');
    v_file_name := coalesce(nullif(v_file_name, ''), 'meal-photo');
    v_photo_path := v_tenant_id::text || '/' || v_patient_id::text || '/' || v_entry_id::text || '/' || v_file_name;
    v_photo_status := 'pending_upload';
  end if;

  insert into public.meal_entries (
    id, tenant_id, patient_id, meal_type, notes, photo_storage_bucket,
    photo_storage_path, photo_mime_type, photo_size_bytes, photo_upload_status,
    occurred_at, created_by
  )
  values (
    v_entry_id, v_tenant_id, v_patient_id, v_meal_type, v_notes,
    case when v_photo_path is null then null else 'meal-photos' end,
    v_photo_path, v_mime_type, p_photo_size_bytes, v_photo_status,
    coalesce(p_occurred_at, now()), auth.uid()
  )
  returning * into v_entry;

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, status, title, description,
    actor_name, status_label, details_href, event_at, payload
  )
  values (
    v_tenant_id, v_patient_id, 'nutricao', 'patient_app', 'recorded',
    'Refeicao registrada', 'Paciente registrou uma refeicao no diario.',
    'Portal do paciente', 'Registrado', '/clinic/patients/' || v_patient_id::text || '?tab=timeline',
    v_entry.occurred_at,
    jsonb_build_object('entryId', v_entry.id, 'kind', 'meal', 'mealType', v_entry.meal_type, 'hasPhoto', v_entry.photo_storage_path is not null)
  )
  on conflict do nothing;

  return jsonb_build_object(
    'entry', security.patient_daily_entry_json(
      v_entry.id, 'meal', coalesce('Refeicao - ' || nullif(v_entry.meal_type, ''), 'Refeicao'),
      coalesce(v_entry.notes, 'Registro alimentar'), v_entry.occurred_at,
      case when v_entry.photo_upload_status = 'failed' then 'failed' else 'synced' end,
      jsonb_build_object('mealType', v_entry.meal_type, 'hasPhoto', v_entry.photo_storage_path is not null, 'photoUploadStatus', v_entry.photo_upload_status)
    ),
    'photoUpload', case when v_photo_path is null then null else jsonb_build_object('bucket', 'meal-photos', 'path', v_photo_path) end
  );
end;
$$;

create or replace function public.confirm_patient_meal_photo(
  p_meal_entry_id uuid,
  p_upload_status text default 'uploaded'
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, storage, pg_temp
as $$
declare
  v_status text := lower(coalesce(p_upload_status, 'uploaded'));
  v_entry public.meal_entries%rowtype;
begin
  if v_status not in ('uploaded', 'failed') then
    raise exception 'invalid_upload_status' using errcode = '22023';
  end if;

  select * into v_entry
  from public.meal_entries me
  where me.id = p_meal_entry_id;

  if v_entry.id is null or not security.can_access_patient_portal_patient(v_entry.tenant_id, v_entry.patient_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_status = 'uploaded' and not exists (
    select 1
    from storage.objects o
    where o.bucket_id = v_entry.photo_storage_bucket
      and o.name = v_entry.photo_storage_path
  ) then
    raise exception 'photo_not_found' using errcode = '22023';
  end if;

  update public.meal_entries
  set photo_upload_status = v_status
  where tenant_id = v_entry.tenant_id
    and id = v_entry.id
  returning * into v_entry;

  return jsonb_build_object(
    'entry', security.patient_daily_entry_json(
      v_entry.id, 'meal', coalesce('Refeicao - ' || nullif(v_entry.meal_type, ''), 'Refeicao'),
      coalesce(v_entry.notes, 'Registro alimentar') || case when v_status = 'uploaded' then ' - foto anexada' else '' end,
      v_entry.occurred_at, case when v_status = 'failed' then 'failed' else 'synced' end,
      jsonb_build_object('mealType', v_entry.meal_type, 'hasPhoto', v_entry.photo_storage_path is not null, 'photoUploadStatus', v_entry.photo_upload_status)
    )
  );
end;
$$;

create or replace function public.record_patient_workout_entry(
  p_patient_id uuid,
  p_workout_title text,
  p_duration_minutes integer default null,
  p_intensity text default null,
  p_notes text default null,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_title text := coalesce(security.patient_daily_clean_text(p_workout_title, 80), 'Treino registrado');
  v_intensity text := security.patient_daily_clean_text(p_intensity, 20);
  v_entry public.workout_entries%rowtype;
begin
  if p_duration_minutes is not null and (p_duration_minutes < 1 or p_duration_minutes > 360) then
    raise exception 'invalid_workout_duration' using errcode = '22023';
  end if;
  if v_intensity is not null and v_intensity not in ('Leve', 'Moderado', 'Intenso') then
    raise exception 'invalid_workout_intensity' using errcode = '22023';
  end if;

  select r.tenant_id, r.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id) r;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.workout_entries (
    tenant_id, patient_id, workout_title, duration_minutes, intensity, notes, occurred_at, created_by
  )
  values (
    v_tenant_id, v_patient_id, v_title, p_duration_minutes, v_intensity,
    security.patient_daily_clean_text(p_notes, 500), coalesce(p_occurred_at, now()), auth.uid()
  )
  returning * into v_entry;

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, status, title, description,
    actor_name, status_label, details_href, event_at, payload
  )
  values (
    v_tenant_id, v_patient_id, 'meta_atingida', 'patient_app', 'recorded',
    'Treino registrado', 'Paciente registrou treino no diario.',
    'Portal do paciente', 'Registrado', '/clinic/patients/' || v_patient_id::text || '?tab=timeline',
    v_entry.occurred_at,
    jsonb_build_object('entryId', v_entry.id, 'kind', 'workout', 'durationMinutes', v_entry.duration_minutes, 'intensity', v_entry.intensity)
  )
  on conflict do nothing;

  return jsonb_build_object(
    'entry', security.patient_daily_entry_json(
      v_entry.id, 'workout', v_entry.workout_title,
      coalesce(v_entry.duration_minutes::text || ' min', 'Treino registrado') || coalesce(' - ' || nullif(v_entry.intensity, ''), ''),
      v_entry.occurred_at, 'synced',
      jsonb_build_object('workoutTitle', v_entry.workout_title, 'durationMinutes', v_entry.duration_minutes, 'intensity', v_entry.intensity)
    )
  );
end;
$$;

create or replace function public.record_patient_daily_checkin(
  p_patient_id uuid,
  p_mood_score integer,
  p_energy_score integer,
  p_symptoms text default null,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_symptoms text := security.patient_daily_clean_text(p_symptoms, 500);
  v_entry public.daily_checkins%rowtype;
  v_alert_id uuid;
begin
  if p_mood_score is null or p_mood_score < 1 or p_mood_score > 5 then
    raise exception 'invalid_mood_score' using errcode = '22023';
  end if;
  if p_energy_score is null or p_energy_score < 1 or p_energy_score > 5 then
    raise exception 'invalid_energy_score' using errcode = '22023';
  end if;

  select r.tenant_id, r.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id) r;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.daily_checkins (
    tenant_id, patient_id, checkin_date, mood_score, energy_score, symptoms, occurred_at, created_by
  )
  values (
    v_tenant_id, v_patient_id, v_occurred_at::date, p_mood_score, p_energy_score, v_symptoms, v_occurred_at, auth.uid()
  )
  on conflict (tenant_id, patient_id, checkin_date) where status = 'recorded'
  do update set
    mood_score = excluded.mood_score,
    energy_score = excluded.energy_score,
    symptoms = excluded.symptoms,
    occurred_at = excluded.occurred_at,
    created_by = excluded.created_by,
    updated_at = now()
  returning * into v_entry;

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, status, title, description,
    actor_name, status_label, details_href, event_at, payload
  )
  values (
    v_tenant_id, v_patient_id, 'checkin_realizado', 'patient_app', 'recorded',
    'Check-in diario enviado', 'Paciente respondeu ao check-in diario.',
    'Portal do paciente', 'Respondido', '/clinic/patients/' || v_patient_id::text || '?tab=timeline',
    v_entry.occurred_at,
    jsonb_build_object('entryId', v_entry.id, 'kind', 'checkin', 'mood', v_entry.mood_score, 'energy', v_entry.energy_score, 'hasSymptoms', v_entry.symptoms is not null)
  )
  on conflict do nothing;

  if p_mood_score <= 2 or p_energy_score <= 2 or v_symptoms is not null then
    insert into public.patient_alerts (
      tenant_id, patient_id, alert_type, severity, status, title, description, starts_at
    )
    values (
      v_tenant_id,
      v_patient_id,
      'daily_checkin_risk',
      case when p_mood_score <= 1 or p_energy_score <= 1 then 'high' else 'medium' end,
      'active',
      'Sinal diario de risco',
      'Paciente informou humor/energia baixa ou sintomas no check-in diario.',
      v_entry.occurred_at
    )
    on conflict (tenant_id, patient_id, title) do update
      set status = 'active',
          severity = excluded.severity,
          description = excluded.description,
          starts_at = excluded.starts_at,
          updated_at = now()
    returning id into v_alert_id;
  end if;

  return jsonb_build_object(
    'entry', security.patient_daily_entry_json(
      v_entry.id, 'checkin', 'Check-in diario',
      'Humor ' || v_entry.mood_score::text || '/5 - energia ' || v_entry.energy_score::text || '/5',
      v_entry.occurred_at, 'synced',
      jsonb_build_object('mood', v_entry.mood_score, 'energy', v_entry.energy_score, 'hasSymptoms', v_entry.symptoms is not null, 'alertId', v_alert_id)
    )
  );
end;
$$;

create or replace function public.get_clinic_daily_adherence_snapshot(
  p_target_date date default current_date,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_date date := coalesce(p_target_date, current_date);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select p.active_tenant_id into v_tenant_id
  from public.profiles p
  where p.id = v_user_id and p.is_active = true;

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = v_user_id and tm.status = 'active' and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null or not public.has_clinical_permission(v_tenant_id, 'patients.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    with active_patients as (
      select p.id as patient_id
      from public.patients p
      where p.tenant_id = v_tenant_id
        and p.status = 'active'
    ), goals as (
      select ap.patient_id,
        coalesce(g.water_goal_ml, 2000) as water_goal_ml,
        coalesce(g.meals_goal, 4) as meals_goal,
        coalesce(g.workouts_goal, 1) as workouts_goal,
        coalesce(g.checkin_required, true) as checkin_required
      from active_patients ap
      left join lateral (
        select *
        from public.patient_daily_goals gd
        where gd.tenant_id = v_tenant_id
          and gd.status = 'active'
          and (gd.patient_id = ap.patient_id or gd.patient_id is null)
          and gd.effective_from <= v_date
          and (gd.effective_to is null or gd.effective_to >= v_date)
        order by (gd.patient_id is not null) desc, gd.effective_from desc, gd.created_at desc
        limit 1
      ) g on true
    ), counts as (
      select g.patient_id,
        g.water_goal_ml,
        g.meals_goal,
        g.workouts_goal,
        g.checkin_required,
        coalesce((select sum(we.amount_ml)::integer from public.water_entries we where we.tenant_id = v_tenant_id and we.patient_id = g.patient_id and we.status = 'recorded' and we.occurred_at >= v_date::timestamptz and we.occurred_at < (v_date + 1)::timestamptz), 0) as water_ml,
        coalesce((select count(*)::integer from public.meal_entries me where me.tenant_id = v_tenant_id and me.patient_id = g.patient_id and me.status <> 'deleted' and me.occurred_at >= v_date::timestamptz and me.occurred_at < (v_date + 1)::timestamptz), 0) as meals_count,
        coalesce((select count(*)::integer from public.workout_entries wo where wo.tenant_id = v_tenant_id and wo.patient_id = g.patient_id and wo.status = 'recorded' and wo.occurred_at >= v_date::timestamptz and wo.occurred_at < (v_date + 1)::timestamptz), 0) as workouts_count,
        exists (select 1 from public.daily_checkins dc where dc.tenant_id = v_tenant_id and dc.patient_id = g.patient_id and dc.status = 'recorded' and dc.checkin_date = v_date) as checkin_done,
        greatest(
          coalesce((select max(we.occurred_at) from public.water_entries we where we.tenant_id = v_tenant_id and we.patient_id = g.patient_id and we.status = 'recorded' and we.occurred_at >= v_date::timestamptz and we.occurred_at < (v_date + 1)::timestamptz), 'epoch'::timestamptz),
          coalesce((select max(me.occurred_at) from public.meal_entries me where me.tenant_id = v_tenant_id and me.patient_id = g.patient_id and me.status <> 'deleted' and me.occurred_at >= v_date::timestamptz and me.occurred_at < (v_date + 1)::timestamptz), 'epoch'::timestamptz),
          coalesce((select max(wo.occurred_at) from public.workout_entries wo where wo.tenant_id = v_tenant_id and wo.patient_id = g.patient_id and wo.status = 'recorded' and wo.occurred_at >= v_date::timestamptz and wo.occurred_at < (v_date + 1)::timestamptz), 'epoch'::timestamptz),
          coalesce((select max(dc.occurred_at) from public.daily_checkins dc where dc.tenant_id = v_tenant_id and dc.patient_id = g.patient_id and dc.status = 'recorded' and dc.checkin_date = v_date), 'epoch'::timestamptz)
        ) as last_signal_at
      from goals g
    ), scored as (
      select *,
        round((
          least(water_ml::numeric / nullif(water_goal_ml, 0), 1) * 35
          + least(meals_count::numeric / nullif(meals_goal, 0), 1) * 25
          + case when workouts_goal <= 0 then 20 else least(workouts_count::numeric / workouts_goal, 1) * 20 end
          + case when checkin_required and checkin_done then 20 else 0 end
        ) / (35 + 25 + 20 + case when checkin_required then 20 else 0 end) * 100)::integer as adherence_percent
      from counts
    )
    select jsonb_agg(jsonb_build_object(
      'patientId', patient_id,
      'adherencePercent', adherence_percent,
      'reason', case
        when last_signal_at = 'epoch'::timestamptz then 'Sem sinais diarios registrados'
        when adherence_percent < 40 then 'Adesao diaria critica'
        else 'Adesao diaria baixa'
      end,
      'severity', case when adherence_percent < 40 then 'high' else 'medium' end,
      'lastSignalAt', nullif(last_signal_at, 'epoch'::timestamptz),
      'waterMl', water_ml,
      'mealsCount', meals_count,
      'workoutsCount', workouts_count,
      'checkinDone', checkin_done,
      'href', '/clinic/patients/' || patient_id::text || '?tab=timeline'
    ) order by adherence_percent asc, last_signal_at asc)
    from (
      select *
      from scored
      where adherence_percent < 60
      order by adherence_percent asc, last_signal_at asc
      limit v_limit
    ) limited
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_patient_daily_snapshot(uuid, date) from public;
revoke all on function public.record_patient_water_entry(uuid, integer, timestamptz) from public;
revoke all on function public.record_patient_meal_entry(uuid, text, text, text, text, integer, timestamptz) from public;
revoke all on function public.confirm_patient_meal_photo(uuid, text) from public;
revoke all on function public.record_patient_workout_entry(uuid, text, integer, text, text, timestamptz) from public;
revoke all on function public.record_patient_daily_checkin(uuid, integer, integer, text, timestamptz) from public;
revoke all on function public.get_clinic_daily_adherence_snapshot(date, integer) from public;

grant execute on function public.get_patient_daily_snapshot(uuid, date) to authenticated, service_role;
grant execute on function public.record_patient_water_entry(uuid, integer, timestamptz) to authenticated, service_role;
grant execute on function public.record_patient_meal_entry(uuid, text, text, text, text, integer, timestamptz) to authenticated, service_role;
grant execute on function public.confirm_patient_meal_photo(uuid, text) to authenticated, service_role;
grant execute on function public.record_patient_workout_entry(uuid, text, integer, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.record_patient_daily_checkin(uuid, integer, integer, text, timestamptz) to authenticated, service_role;
grant execute on function public.get_clinic_daily_adherence_snapshot(date, integer) to authenticated, service_role;

comment on table public.water_entries is 'Patient daily water entries. Patient/guardian writes go through patient-scoped RPCs.';
comment on table public.meal_entries is 'Patient daily meal entries with optional private meal photo storage metadata.';
comment on table public.workout_entries is 'Patient daily workout entries from the patient portal.';
comment on table public.daily_checkins is 'Patient daily mood/energy check-ins with sanitized symptom notes.';
comment on function public.get_patient_daily_snapshot(uuid, date) is
  'Returns patient daily habit snapshot for the authenticated patient/guardian active linkage.';
comment on function public.get_clinic_daily_adherence_snapshot(date, integer) is
  'Returns low daily adherence rows for the active clinic tenant without patient PII.';
