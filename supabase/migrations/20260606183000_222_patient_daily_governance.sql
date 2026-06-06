-- M01 follow-up: patient daily retention policy and operational alert helpers.
-- Defaults:
-- - Structured daily habit records are retained for 6 years.
-- - Meal photos are retained for 180 days and then marked for storage deletion.
-- Destructive execution helpers are service-role only and dry-run by default.

alter table public.water_entries
  add column if not exists retention_expires_at timestamptz;

alter table public.meal_entries
  add column if not exists retention_expires_at timestamptz,
  add column if not exists photo_retention_expires_at timestamptz,
  add column if not exists photo_retention_status text not null default 'not_applicable';

alter table public.workout_entries
  add column if not exists retention_expires_at timestamptz;

alter table public.daily_checkins
  add column if not exists retention_expires_at timestamptz;

alter table public.meal_entries
  drop constraint if exists meal_entries_photo_retention_status_check;

alter table public.meal_entries
  add constraint meal_entries_photo_retention_status_check
  check (photo_retention_status in ('not_applicable', 'active', 'delete_due', 'deleted'));

alter table public.water_entries
  alter column retention_expires_at set default (now() + interval '6 years');

alter table public.meal_entries
  alter column retention_expires_at set default (now() + interval '6 years');

alter table public.workout_entries
  alter column retention_expires_at set default (now() + interval '6 years');

alter table public.daily_checkins
  alter column retention_expires_at set default (now() + interval '6 years');

update public.water_entries
set retention_expires_at = coalesce(retention_expires_at, occurred_at + interval '6 years')
where retention_expires_at is null;

update public.meal_entries
set retention_expires_at = coalesce(retention_expires_at, occurred_at + interval '6 years'),
    photo_retention_expires_at = case
      when photo_storage_path is null then null
      else coalesce(photo_retention_expires_at, occurred_at + interval '180 days')
    end,
    photo_retention_status = case
      when photo_storage_path is null then 'not_applicable'
      when photo_retention_status in ('delete_due', 'deleted') then photo_retention_status
      else 'active'
    end
where retention_expires_at is null
   or (photo_storage_path is null and photo_retention_status <> 'not_applicable')
   or (photo_storage_path is not null and photo_retention_expires_at is null)
   or (photo_storage_path is not null and photo_retention_status = 'not_applicable');

update public.workout_entries
set retention_expires_at = coalesce(retention_expires_at, occurred_at + interval '6 years')
where retention_expires_at is null;

update public.daily_checkins
set retention_expires_at = coalesce(retention_expires_at, occurred_at + interval '6 years')
where retention_expires_at is null;

create index if not exists idx_water_entries_retention
  on public.water_entries(retention_expires_at)
  where status <> 'deleted';

create index if not exists idx_meal_entries_retention
  on public.meal_entries(retention_expires_at)
  where status <> 'deleted';

create index if not exists idx_meal_entries_photo_retention
  on public.meal_entries(photo_retention_expires_at)
  where photo_storage_path is not null and photo_retention_status in ('active', 'delete_due');

create index if not exists idx_workout_entries_retention
  on public.workout_entries(retention_expires_at)
  where status <> 'deleted';

create index if not exists idx_daily_checkins_retention
  on public.daily_checkins(retention_expires_at)
  where status <> 'deleted';

create or replace function security.apply_patient_daily_retention_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_base timestamptz := coalesce(new.occurred_at, now());
begin
  if new.retention_expires_at is null then
    new.retention_expires_at := v_base + interval '6 years';
  end if;

  if tg_table_name = 'meal_entries' then
    if new.photo_storage_path is null then
      new.photo_retention_expires_at := null;
      if new.photo_retention_status is null or new.photo_retention_status <> 'deleted' then
        new.photo_retention_status := 'not_applicable';
      end if;
    else
      if new.photo_retention_expires_at is null then
        new.photo_retention_expires_at := v_base + interval '180 days';
      end if;
      if new.photo_retention_status is null or new.photo_retention_status = 'not_applicable' then
        new.photo_retention_status := 'active';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists water_entries_retention_defaults on public.water_entries;
create trigger water_entries_retention_defaults
  before insert or update of occurred_at, retention_expires_at
  on public.water_entries
  for each row execute function security.apply_patient_daily_retention_defaults();

drop trigger if exists meal_entries_retention_defaults on public.meal_entries;
create trigger meal_entries_retention_defaults
  before insert or update of occurred_at, retention_expires_at, photo_storage_path, photo_retention_expires_at, photo_retention_status
  on public.meal_entries
  for each row execute function security.apply_patient_daily_retention_defaults();

drop trigger if exists workout_entries_retention_defaults on public.workout_entries;
create trigger workout_entries_retention_defaults
  before insert or update of occurred_at, retention_expires_at
  on public.workout_entries
  for each row execute function security.apply_patient_daily_retention_defaults();

drop trigger if exists daily_checkins_retention_defaults on public.daily_checkins;
create trigger daily_checkins_retention_defaults
  before insert or update of occurred_at, retention_expires_at
  on public.daily_checkins
  for each row execute function security.apply_patient_daily_retention_defaults();

create or replace function public.get_patient_daily_governance_snapshot(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
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
    where tm.user_id = v_user_id
      and tm.status = 'active'
      and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null or not public.has_clinical_permission(v_tenant_id, 'patients.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'policy', jsonb_build_object(
      'dailyRecordsRetentionDays', 2190,
      'mealPhotoRetentionDays', 180,
      'signedUrlExpiresInSeconds', 300,
      'photoDeletionMode', 'service_role_mark_then_storage_delete'
    ),
    'dailyRecordsDueNow', (
      select count(*)::integer
      from (
        select id from public.water_entries where tenant_id = v_tenant_id and status <> 'deleted' and retention_expires_at <= now()
        union all
        select id from public.meal_entries where tenant_id = v_tenant_id and status <> 'deleted' and retention_expires_at <= now()
        union all
        select id from public.workout_entries where tenant_id = v_tenant_id and status <> 'deleted' and retention_expires_at <= now()
        union all
        select id from public.daily_checkins where tenant_id = v_tenant_id and status <> 'deleted' and retention_expires_at <= now()
      ) due
    ),
    'dailyRecordsDueWithinWindow', (
      select count(*)::integer
      from (
        select id from public.water_entries where tenant_id = v_tenant_id and status <> 'deleted' and retention_expires_at <= now() + (v_days || ' days')::interval
        union all
        select id from public.meal_entries where tenant_id = v_tenant_id and status <> 'deleted' and retention_expires_at <= now() + (v_days || ' days')::interval
        union all
        select id from public.workout_entries where tenant_id = v_tenant_id and status <> 'deleted' and retention_expires_at <= now() + (v_days || ' days')::interval
        union all
        select id from public.daily_checkins where tenant_id = v_tenant_id and status <> 'deleted' and retention_expires_at <= now() + (v_days || ' days')::interval
      ) due
    ),
    'mealPhotosRetentionDueNow', (
      select count(*)::integer
      from public.meal_entries me
      where me.tenant_id = v_tenant_id
        and me.status <> 'deleted'
        and me.photo_storage_path is not null
        and me.photo_retention_status in ('active', 'delete_due')
        and me.photo_retention_expires_at <= now()
    ),
    'mealPhotosMarkedForDeletion', (
      select count(*)::integer
      from public.meal_entries me
      where me.tenant_id = v_tenant_id
        and me.status <> 'deleted'
        and me.photo_storage_path is not null
        and me.photo_retention_status = 'delete_due'
    ),
    'mealPhotosPendingReview', (
      select count(*)::integer
      from public.meal_entries me
      where me.tenant_id = v_tenant_id
        and me.status in ('recorded', 'pending_review')
        and me.photo_storage_path is not null
        and me.photo_upload_status = 'uploaded'
        and me.reviewed_at is null
        and coalesce(me.photo_retention_status, 'active') = 'active'
    ),
    'mealPhotosStalePendingUpload', (
      select count(*)::integer
      from public.meal_entries me
      where me.tenant_id = v_tenant_id
        and me.status <> 'deleted'
        and me.photo_storage_path is not null
        and me.photo_upload_status = 'pending_upload'
        and me.created_at <= now() - interval '2 hours'
    )
  );
end;
$$;

create or replace function public.expire_patient_daily_habits_for_retention(
  p_execute boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_water_candidates integer := 0;
  v_meal_candidates integer := 0;
  v_workout_candidates integer := 0;
  v_checkin_candidates integer := 0;
  v_photo_candidates integer := 0;
  v_water_expired integer := 0;
  v_meal_expired integer := 0;
  v_workout_expired integer := 0;
  v_checkin_expired integer := 0;
  v_photos_marked integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select count(*)::integer into v_water_candidates
  from public.water_entries
  where status <> 'deleted' and retention_expires_at <= now();

  select count(*)::integer into v_meal_candidates
  from public.meal_entries
  where status <> 'deleted' and retention_expires_at <= now();

  select count(*)::integer into v_workout_candidates
  from public.workout_entries
  where status <> 'deleted' and retention_expires_at <= now();

  select count(*)::integer into v_checkin_candidates
  from public.daily_checkins
  where status <> 'deleted' and retention_expires_at <= now();

  select count(*)::integer into v_photo_candidates
  from public.meal_entries
  where status <> 'deleted'
    and photo_storage_path is not null
    and photo_retention_status in ('active', 'delete_due')
    and photo_retention_expires_at <= now();

  if p_execute then
    with candidates as (
      select id
      from public.water_entries
      where status <> 'deleted' and retention_expires_at <= now()
      order by retention_expires_at asc, created_at asc
      limit v_limit
    ), updated as (
      update public.water_entries we
      set status = 'deleted',
          metadata = we.metadata || jsonb_build_object('retentionExpiredAt', now()),
          updated_at = now()
      from candidates c
      where we.id = c.id
      returning we.id
    )
    select count(*)::integer into v_water_expired from updated;

    with candidates as (
      select id
      from public.meal_entries
      where status <> 'deleted' and retention_expires_at <= now()
      order by retention_expires_at asc, created_at asc
      limit v_limit
    ), updated as (
      update public.meal_entries me
      set status = 'deleted',
          notes = null,
          review_note = null,
          photo_retention_status = case when me.photo_storage_path is null then me.photo_retention_status else 'delete_due' end,
          metadata = me.metadata || jsonb_build_object(
            'retentionExpiredAt', now(),
            'photoRetentionDeleteRequired', me.photo_storage_path is not null
          ),
          updated_at = now()
      from candidates c
      where me.id = c.id
      returning me.id
    )
    select count(*)::integer into v_meal_expired from updated;

    with candidates as (
      select id
      from public.workout_entries
      where status <> 'deleted' and retention_expires_at <= now()
      order by retention_expires_at asc, created_at asc
      limit v_limit
    ), updated as (
      update public.workout_entries wo
      set status = 'deleted',
          notes = null,
          metadata = wo.metadata || jsonb_build_object('retentionExpiredAt', now()),
          updated_at = now()
      from candidates c
      where wo.id = c.id
      returning wo.id
    )
    select count(*)::integer into v_workout_expired from updated;

    with candidates as (
      select id
      from public.daily_checkins
      where status <> 'deleted' and retention_expires_at <= now()
      order by retention_expires_at asc, created_at asc
      limit v_limit
    ), updated as (
      update public.daily_checkins dc
      set status = 'deleted',
          symptoms = null,
          metadata = dc.metadata || jsonb_build_object('retentionExpiredAt', now()),
          updated_at = now()
      from candidates c
      where dc.id = c.id
      returning dc.id
    )
    select count(*)::integer into v_checkin_expired from updated;

    with candidates as (
      select id
      from public.meal_entries
      where status <> 'deleted'
        and photo_storage_path is not null
        and photo_retention_status in ('active', 'delete_due')
        and photo_retention_expires_at <= now()
      order by photo_retention_expires_at asc, created_at asc
      limit v_limit
    ), updated as (
      update public.meal_entries me
      set photo_retention_status = 'delete_due',
          metadata = me.metadata || jsonb_build_object(
            'photoRetentionDeleteRequired', true,
            'photoRetentionMarkedAt', now()
          ),
          updated_at = now()
      from candidates c
      where me.id = c.id
      returning me.id
    )
    select count(*)::integer into v_photos_marked from updated;
  end if;

  return jsonb_build_object(
    'execute', p_execute,
    'limit', v_limit,
    'candidates', jsonb_build_object(
      'waterEntries', v_water_candidates,
      'mealEntries', v_meal_candidates,
      'workoutEntries', v_workout_candidates,
      'dailyCheckins', v_checkin_candidates,
      'mealPhotos', v_photo_candidates
    ),
    'expired', jsonb_build_object(
      'waterEntries', v_water_expired,
      'mealEntries', v_meal_expired,
      'workoutEntries', v_workout_expired,
      'dailyCheckins', v_checkin_expired,
      'mealPhotosMarkedForDeletion', v_photos_marked
    )
  );
end;
$$;

create or replace function public.mark_patient_daily_photo_deleted(
  p_meal_entry_id uuid,
  p_storage_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_updated integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  update public.meal_entries me
  set photo_storage_bucket = null,
      photo_storage_path = null,
      photo_mime_type = null,
      photo_size_bytes = null,
      photo_upload_status = 'none',
      photo_retention_expires_at = null,
      photo_retention_status = 'deleted',
      metadata = me.metadata || jsonb_build_object('photoRetentionDeletedAt', now()),
      updated_at = now()
  where me.id = p_meal_entry_id
    and me.photo_storage_bucket = 'meal-photos'
    and me.photo_storage_path = p_storage_path;

  get diagnostics v_updated = row_count;

  return jsonb_build_object('updated', v_updated);
end;
$$;

create or replace function public.emit_patient_daily_operational_alerts(
  p_target_date date default current_date - 1,
  p_execute boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_date date := coalesce(p_target_date, current_date - 1);
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_candidates integer := 0;
  v_alerts_upserted integer := 0;
  v_counts jsonb := '{}'::jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  drop table if exists pg_temp.patient_daily_alert_candidates;

  create temp table patient_daily_alert_candidates on commit drop as
  with active_patients as (
    select p.tenant_id, p.id as patient_id
    from public.patients p
    where p.status = 'active'
  ), goals as (
    select ap.tenant_id,
           ap.patient_id,
           coalesce(g.water_goal_ml, 2000) as water_goal_ml,
           coalesce(g.meals_goal, 4) as meals_goal,
           coalesce(g.workouts_goal, 1) as workouts_goal,
           coalesce(g.checkin_required, true) as checkin_required
    from active_patients ap
    left join lateral (
      select gd.*
      from public.patient_daily_goals gd
      where gd.tenant_id = ap.tenant_id
        and gd.status = 'active'
        and (gd.patient_id = ap.patient_id or gd.patient_id is null)
        and gd.effective_from <= v_date
        and (gd.effective_to is null or gd.effective_to >= v_date)
      order by (gd.patient_id is not null) desc, gd.effective_from desc, gd.created_at desc
      limit 1
    ) g on true
  ), counts as (
    select g.tenant_id,
           g.patient_id,
           g.water_goal_ml,
           g.meals_goal,
           g.workouts_goal,
           (
             g.checkin_required
             or exists (
               select 1
               from public.patient_program_checkins pc
               where pc.tenant_id = g.tenant_id
                 and pc.patient_id = g.patient_id
                 and pc.status not in ('completed', 'canceled')
                 and (pc.due_date is null or pc.due_date::date <= v_date)
             )
           ) as checkin_required,
           coalesce((select sum(we.amount_ml)::integer from public.water_entries we where we.tenant_id = g.tenant_id and we.patient_id = g.patient_id and we.status = 'recorded' and we.occurred_at >= v_date::timestamptz and we.occurred_at < (v_date + 1)::timestamptz), 0) as water_ml,
           coalesce((select count(*)::integer from public.meal_entries me where me.tenant_id = g.tenant_id and me.patient_id = g.patient_id and me.status <> 'deleted' and me.occurred_at >= v_date::timestamptz and me.occurred_at < (v_date + 1)::timestamptz), 0) as meals_count,
           coalesce((select count(*)::integer from public.workout_entries wo where wo.tenant_id = g.tenant_id and wo.patient_id = g.patient_id and wo.status = 'recorded' and wo.occurred_at >= v_date::timestamptz and wo.occurred_at < (v_date + 1)::timestamptz), 0) as workouts_count,
           exists (select 1 from public.daily_checkins dc where dc.tenant_id = g.tenant_id and dc.patient_id = g.patient_id and dc.status = 'recorded' and dc.checkin_date = v_date) as checkin_done,
           nullif(greatest(
             coalesce((select max(we.occurred_at) from public.water_entries we where we.tenant_id = g.tenant_id and we.patient_id = g.patient_id and we.status = 'recorded' and we.occurred_at >= v_date::timestamptz and we.occurred_at < (v_date + 1)::timestamptz), 'epoch'::timestamptz),
             coalesce((select max(me.occurred_at) from public.meal_entries me where me.tenant_id = g.tenant_id and me.patient_id = g.patient_id and me.status <> 'deleted' and me.occurred_at >= v_date::timestamptz and me.occurred_at < (v_date + 1)::timestamptz), 'epoch'::timestamptz),
             coalesce((select max(wo.occurred_at) from public.workout_entries wo where wo.tenant_id = g.tenant_id and wo.patient_id = g.patient_id and wo.status = 'recorded' and wo.occurred_at >= v_date::timestamptz and wo.occurred_at < (v_date + 1)::timestamptz), 'epoch'::timestamptz),
             coalesce((select max(dc.occurred_at) from public.daily_checkins dc where dc.tenant_id = g.tenant_id and dc.patient_id = g.patient_id and dc.status = 'recorded' and dc.checkin_date = v_date), 'epoch'::timestamptz)
           ), 'epoch'::timestamptz) as last_signal_at,
           coalesce((
             select count(*)::integer
             from public.meal_entries me
             where me.tenant_id = g.tenant_id
               and me.patient_id = g.patient_id
               and me.status in ('recorded', 'pending_review')
               and me.photo_storage_path is not null
               and me.photo_upload_status = 'uploaded'
               and me.reviewed_at is null
               and coalesce(me.photo_retention_status, 'active') = 'active'
               and (me.photo_retention_expires_at is null or me.photo_retention_expires_at > now())
               and me.occurred_at <= now() - interval '4 hours'
           ), 0) as pending_photo_count
    from goals g
  ), scored as (
    select *,
           round((
             case when water_goal_ml <= 0 then 35 else least(water_ml::numeric / water_goal_ml, 1) * 35 end
             + case when meals_goal <= 0 then 25 else least(meals_count::numeric / meals_goal, 1) * 25 end
             + case when workouts_goal <= 0 then 20 else least(workouts_count::numeric / workouts_goal, 1) * 20 end
             + case when checkin_required and checkin_done then 20 else 0 end
           ) / greatest(35 + 25 + 20 + case when checkin_required then 20 else 0 end, 1) * 100)::integer as adherence_percent
    from counts
  )
  select tenant_id,
         patient_id,
         alert_type,
         severity,
         title,
         description,
         starts_at,
         sort_rank
  from (
    select s.tenant_id,
           s.patient_id,
           'daily_low_adherence'::text as alert_type,
           case when s.adherence_percent < 40 then 'high' else 'medium' end as severity,
           'Adesao diaria baixa em ' || to_char(v_date, 'YYYY-MM-DD') as title,
           'Progresso diario ficou em ' || s.adherence_percent::text || '%. Agua: ' || s.water_ml::text || '/' || s.water_goal_ml::text || ' ml, refeicoes: ' || s.meals_count::text || '/' || s.meals_goal::text || ', treino: ' || s.workouts_count::text || '/' || s.workouts_goal::text || '.' as description,
           coalesce(s.last_signal_at, (v_date + 1)::timestamptz) as starts_at,
           case when s.adherence_percent < 40 then 10 else 20 end as sort_rank
    from scored s
    where v_date < current_date and s.adherence_percent < 60
    union all
    select s.tenant_id,
           s.patient_id,
           'daily_checkin_absent'::text as alert_type,
           'medium'::text as severity,
           'Check-in diario ausente em ' || to_char(v_date, 'YYYY-MM-DD') as title,
           'Check-in diario obrigatorio nao foi enviado pelo paciente na data esperada.' as description,
           (v_date + 1)::timestamptz as starts_at,
           15 as sort_rank
    from scored s
    where v_date < current_date and s.checkin_required and not s.checkin_done
    union all
    select s.tenant_id,
           s.patient_id,
           'meal_photo_pending_review'::text as alert_type,
           case when s.pending_photo_count >= 3 then 'high' else 'medium' end as severity,
           'Foto de refeicao pendente de revisao' as title,
           s.pending_photo_count::text || ' foto(s) de refeicao aguardam revisao nutricional ha mais de 4 horas.' as description,
           now() as starts_at,
           case when s.pending_photo_count >= 3 then 12 else 25 end as sort_rank
    from scored s
    where s.pending_photo_count > 0
  ) candidates;

  select count(*)::integer into v_candidates
  from pg_temp.patient_daily_alert_candidates;

  select coalesce(jsonb_object_agg(alert_type, candidate_count), '{}'::jsonb)
  into v_counts
  from (
    select alert_type, count(*)::integer as candidate_count
    from pg_temp.patient_daily_alert_candidates
    group by alert_type
  ) grouped;

  if p_execute then
    with limited as (
      select *
      from pg_temp.patient_daily_alert_candidates
      order by sort_rank asc, starts_at asc, patient_id asc
      limit v_limit
    ), upserted as (
      insert into public.patient_alerts (
        tenant_id, patient_id, alert_type, severity, status, title, description, starts_at
      )
      select tenant_id, patient_id, alert_type, severity, 'active', title, description, starts_at
      from limited
      on conflict (tenant_id, patient_id, title) do update
        set status = 'active',
            alert_type = excluded.alert_type,
            severity = excluded.severity,
            description = excluded.description,
            starts_at = excluded.starts_at,
            updated_at = now()
      returning id
    )
    select count(*)::integer into v_alerts_upserted from upserted;
  end if;

  return jsonb_build_object(
    'execute', p_execute,
    'targetDate', v_date,
    'limit', v_limit,
    'candidateAlerts', v_candidates,
    'candidateCounts', v_counts,
    'upsertedAlerts', v_alerts_upserted
  );
end;
$$;

revoke all on function security.apply_patient_daily_retention_defaults() from public;
revoke all on function public.get_patient_daily_governance_snapshot(integer) from public;
revoke all on function public.expire_patient_daily_habits_for_retention(boolean, integer) from public;
revoke all on function public.mark_patient_daily_photo_deleted(uuid, text) from public;
revoke all on function public.emit_patient_daily_operational_alerts(date, boolean, integer) from public;

grant execute on function security.apply_patient_daily_retention_defaults() to service_role;
grant execute on function public.get_patient_daily_governance_snapshot(integer) to authenticated, service_role;
grant execute on function public.expire_patient_daily_habits_for_retention(boolean, integer) to service_role;
grant execute on function public.mark_patient_daily_photo_deleted(uuid, text) to service_role;
grant execute on function public.emit_patient_daily_operational_alerts(date, boolean, integer) to service_role;

comment on column public.water_entries.retention_expires_at is 'M01 retention boundary for structured water entries; default is occurred_at plus 6 years.';
comment on column public.meal_entries.retention_expires_at is 'M01 retention boundary for structured meal entries; default is occurred_at plus 6 years.';
comment on column public.meal_entries.photo_retention_expires_at is 'M01 retention boundary for private meal photos; default is occurred_at plus 180 days.';
comment on column public.meal_entries.photo_retention_status is 'M01 meal photo retention state: active, delete_due, deleted, or not_applicable.';
comment on column public.workout_entries.retention_expires_at is 'M01 retention boundary for structured workout entries; default is occurred_at plus 6 years.';
comment on column public.daily_checkins.retention_expires_at is 'M01 retention boundary for structured daily check-ins; default is occurred_at plus 6 years.';
comment on function public.get_patient_daily_governance_snapshot(integer) is 'Returns tenant-scoped M01 daily retention and meal photo governance counts without patient PII.';
comment on function public.expire_patient_daily_habits_for_retention(boolean, integer) is 'Service-role M01 retention helper for daily habit records; dry-run by default and marks meal photos for storage deletion.';
comment on function public.mark_patient_daily_photo_deleted(uuid, text) is 'Service-role helper to clear meal photo metadata after storage deletion has succeeded.';
comment on function public.emit_patient_daily_operational_alerts(date, boolean, integer) is 'Service-role M01 helper that dry-runs or upserts daily low-adherence, absent check-in, and pending meal-photo-review alerts.';
