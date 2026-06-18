-- Patient portal gamification persistence.
-- Stores derived, low-risk progress read models. The scoring source remains the
-- application service; this layer gives auditability without exposing public data.

create table if not exists public.patient_journey_progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  snapshot_date date not null default current_date,
  weekly_window_key text not null,
  xp integer not null default 0 check (xp between 0 and 1000),
  energy_score integer not null default 0 check (energy_score between 0 and 100),
  streak_days integer not null default 0 check (streak_days between 0 and 3650),
  weekly_progress integer not null default 0 check (weekly_progress between 0 and 100),
  next_level_label text,
  is_paused boolean not null default false,
  pause_reason text,
  levels jsonb not null default '[]'::jsonb check (jsonb_typeof(levels) = 'array'),
  badges jsonb not null default '[]'::jsonb check (jsonb_typeof(badges) = 'array'),
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array'),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  calculated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id, snapshot_date),
  constraint patient_journey_progress_snapshots_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.patient_weekly_quest_progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  weekly_window_key text not null,
  mission_id text not null,
  title text not null,
  current_value integer not null default 0 check (current_value >= 0),
  target_value integer not null default 1 check (target_value >= 1),
  status text not null default 'in_progress'
    check (status in ('blocked', 'in_progress', 'completed')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id, weekly_window_key, mission_id),
  constraint patient_weekly_quest_progress_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.patient_gamification_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  source_key text not null,
  kind text not null,
  score integer not null default 0 check (score >= 0),
  reason text not null,
  blocked_reason text,
  is_blocked boolean not null default false,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id, source_key),
  constraint patient_gamification_events_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create index if not exists idx_patient_journey_progress_patient_date
  on public.patient_journey_progress_snapshots(tenant_id, patient_id, snapshot_date desc);

create index if not exists idx_patient_weekly_quest_progress_patient_week
  on public.patient_weekly_quest_progress(tenant_id, patient_id, weekly_window_key);

create index if not exists idx_patient_gamification_events_patient_time
  on public.patient_gamification_events(tenant_id, patient_id, occurred_at desc);

select security.touch_updated_at('public.patient_journey_progress_snapshots');
select security.touch_updated_at('public.patient_weekly_quest_progress');
select security.touch_updated_at('public.patient_gamification_events');

alter table public.patient_journey_progress_snapshots enable row level security;
alter table public.patient_weekly_quest_progress enable row level security;
alter table public.patient_gamification_events enable row level security;

drop policy if exists patient_journey_progress_select_patient_portal on public.patient_journey_progress_snapshots;
create policy patient_journey_progress_select_patient_portal
on public.patient_journey_progress_snapshots for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists patient_weekly_quest_select_patient_portal on public.patient_weekly_quest_progress;
create policy patient_weekly_quest_select_patient_portal
on public.patient_weekly_quest_progress for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists patient_gamification_events_select_patient_portal on public.patient_gamification_events;
create policy patient_gamification_events_select_patient_portal
on public.patient_gamification_events for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists patient_journey_progress_select_staff on public.patient_journey_progress_snapshots;
create policy patient_journey_progress_select_staff
on public.patient_journey_progress_snapshots for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.read'));

drop policy if exists patient_weekly_quest_select_staff on public.patient_weekly_quest_progress;
create policy patient_weekly_quest_select_staff
on public.patient_weekly_quest_progress for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.read'));

drop policy if exists patient_gamification_events_select_staff on public.patient_gamification_events;
create policy patient_gamification_events_select_staff
on public.patient_gamification_events for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.read'));

drop policy if exists patient_journey_progress_write_staff on public.patient_journey_progress_snapshots;
create policy patient_journey_progress_write_staff
on public.patient_journey_progress_snapshots for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.write'))
with check (public.has_clinical_permission(tenant_id, 'patients.write'));

drop policy if exists patient_weekly_quest_write_staff on public.patient_weekly_quest_progress;
create policy patient_weekly_quest_write_staff
on public.patient_weekly_quest_progress for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.write'))
with check (public.has_clinical_permission(tenant_id, 'patients.write'));

drop policy if exists patient_gamification_events_write_staff on public.patient_gamification_events;
create policy patient_gamification_events_write_staff
on public.patient_gamification_events for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.write'))
with check (public.has_clinical_permission(tenant_id, 'patients.write'));

grant select, insert, update on public.patient_journey_progress_snapshots to authenticated, service_role;
grant select, insert, update on public.patient_weekly_quest_progress to authenticated, service_role;
grant select, insert, update on public.patient_gamification_events to authenticated, service_role;

create or replace function public.record_patient_gamification_summary(
  p_patient_id uuid default null,
  p_summary jsonb default '{}'::jsonb,
  p_snapshot_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_snapshot_date date := coalesce(p_snapshot_date, current_date);
  v_weekly_window_key text;
  v_missions jsonb;
  v_events jsonb;
  v_mission jsonb;
  v_event jsonb;
  v_mission_count integer := 0;
  v_event_count integer := 0;
begin
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' then
    raise exception 'invalid_gamification_summary' using errcode = '22023';
  end if;

  select r.tenant_id, r.patient_id
    into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id) r
  limit 1;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_weekly_window_key := coalesce(
    nullif(left(p_summary ->> 'weeklyWindowKey', 32), ''),
    to_char(date_trunc('week', v_snapshot_date::timestamp), 'YYYY-MM-DD')
  );

  insert into public.patient_journey_progress_snapshots (
    tenant_id,
    patient_id,
    snapshot_date,
    weekly_window_key,
    xp,
    energy_score,
    streak_days,
    weekly_progress,
    next_level_label,
    is_paused,
    pause_reason,
    levels,
    badges,
    events,
    summary,
    calculated_at,
    created_by
  )
  values (
    v_tenant_id,
    v_patient_id,
    v_snapshot_date,
    v_weekly_window_key,
    greatest(0, least(1000, coalesce((p_summary ->> 'xp')::integer, 0))),
    greatest(0, least(100, coalesce((p_summary ->> 'energyScore')::integer, 0))),
    greatest(0, least(3650, coalesce((p_summary ->> 'streakDays')::integer, 0))),
    greatest(0, least(100, coalesce((p_summary ->> 'weeklyProgress')::integer, 0))),
    nullif(left(p_summary ->> 'nextLevelLabel', 160), ''),
    coalesce((p_summary ->> 'isPaused')::boolean, false),
    nullif(left(p_summary ->> 'pauseReason', 500), ''),
    case when jsonb_typeof(p_summary -> 'levels') = 'array' then p_summary -> 'levels' else '[]'::jsonb end,
    case when jsonb_typeof(p_summary -> 'badges') = 'array' then p_summary -> 'badges' else '[]'::jsonb end,
    case when jsonb_typeof(p_summary -> 'events') = 'array' then p_summary -> 'events' else '[]'::jsonb end,
    p_summary,
    now(),
    auth.uid()
  )
  on conflict (tenant_id, patient_id, snapshot_date)
  do update set
    weekly_window_key = excluded.weekly_window_key,
    xp = excluded.xp,
    energy_score = excluded.energy_score,
    streak_days = excluded.streak_days,
    weekly_progress = excluded.weekly_progress,
    next_level_label = excluded.next_level_label,
    is_paused = excluded.is_paused,
    pause_reason = excluded.pause_reason,
    levels = excluded.levels,
    badges = excluded.badges,
    events = excluded.events,
    summary = excluded.summary,
    calculated_at = excluded.calculated_at,
    updated_at = now();

  v_missions := case
    when jsonb_typeof(p_summary -> 'missions') = 'array' then p_summary -> 'missions'
    else '[]'::jsonb
  end;

  for v_mission in select value from jsonb_array_elements(v_missions)
  loop
    if nullif(v_mission ->> 'id', '') is null then
      continue;
    end if;

    insert into public.patient_weekly_quest_progress (
      tenant_id,
      patient_id,
      weekly_window_key,
      mission_id,
      title,
      current_value,
      target_value,
      status,
      payload,
      created_by
    )
    values (
      v_tenant_id,
      v_patient_id,
      v_weekly_window_key,
      left(v_mission ->> 'id', 120),
      coalesce(nullif(left(v_mission ->> 'title', 160), ''), 'Missao semanal'),
      greatest(0, coalesce((v_mission ->> 'value')::integer, 0)),
      greatest(1, coalesce((v_mission ->> 'target')::integer, 1)),
      case
        when coalesce((p_summary ->> 'isPaused')::boolean, false) then 'blocked'
        when coalesce((v_mission ->> 'value')::integer, 0) >= greatest(1, coalesce((v_mission ->> 'target')::integer, 1)) then 'completed'
        else 'in_progress'
      end,
      v_mission,
      auth.uid()
    )
    on conflict (tenant_id, patient_id, weekly_window_key, mission_id)
    do update set
      title = excluded.title,
      current_value = excluded.current_value,
      target_value = excluded.target_value,
      status = excluded.status,
      payload = excluded.payload,
      updated_at = now();

    v_mission_count := v_mission_count + 1;
  end loop;

  v_events := case
    when jsonb_typeof(p_summary -> 'events') = 'array' then p_summary -> 'events'
    else '[]'::jsonb
  end;

  for v_event in select value from jsonb_array_elements(v_events)
  loop
    if nullif(v_event ->> 'key', '') is null then
      continue;
    end if;

    insert into public.patient_gamification_events (
      tenant_id,
      patient_id,
      source_key,
      kind,
      score,
      reason,
      blocked_reason,
      is_blocked,
      occurred_at,
      payload,
      created_by
    )
    values (
      v_tenant_id,
      v_patient_id,
      left(v_event ->> 'key', 200),
      coalesce(nullif(left(v_event ->> 'kind', 80), ''), 'event'),
      greatest(0, coalesce((v_event ->> 'score')::integer, 0)),
      coalesce(nullif(left(v_event ->> 'reason', 500), ''), 'Evento de jornada'),
      nullif(left(v_event ->> 'blockedReason', 500), ''),
      coalesce((v_event ->> 'isBlocked')::boolean, false),
      case
        when (v_event ->> 'occurredAt') ~ '^[0-9]+(\\.[0-9]+)?$'
          then to_timestamp((v_event ->> 'occurredAt')::numeric / 1000)
        else now()
      end,
      v_event,
      auth.uid()
    )
    on conflict (tenant_id, patient_id, source_key)
    do update set
      kind = excluded.kind,
      score = excluded.score,
      reason = excluded.reason,
      blocked_reason = excluded.blocked_reason,
      is_blocked = excluded.is_blocked,
      occurred_at = excluded.occurred_at,
      payload = excluded.payload,
      updated_at = now();

    v_event_count := v_event_count + 1;
  end loop;

  return jsonb_build_object(
    'patientId', v_patient_id,
    'snapshotDate', v_snapshot_date,
    'weeklyWindowKey', v_weekly_window_key,
    'missionCount', v_mission_count,
    'eventCount', v_event_count
  );
end;
$$;

revoke all on function public.record_patient_gamification_summary(uuid, jsonb, date) from public;
grant execute on function public.record_patient_gamification_summary(uuid, jsonb, date)
  to authenticated, service_role;

comment on table public.patient_journey_progress_snapshots is
  'Daily patient portal gamification read model snapshots for individual progress tracking.';
comment on table public.patient_weekly_quest_progress is
  'Weekly patient portal mission progress for audit and tuning.';
comment on table public.patient_gamification_events is
  'Accepted and blocked gamification reward events, scoped by tenant and patient.';
comment on function public.record_patient_gamification_summary(uuid, jsonb, date) is
  'Persists the derived patient gamification summary after patient portal authorization.';
