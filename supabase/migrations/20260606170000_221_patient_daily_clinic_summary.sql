-- M01 follow-up: clinic-facing daily adherence summary and meal photo references.
-- The RPC returns daily aggregates and meal photo entry ids only. Signed URLs
-- are issued separately by the meal-photo-signed-url Edge Function.

create or replace function public.get_clinic_patient_daily_summary(
  p_patient_id uuid,
  p_target_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
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
  v_pending_checkins_count integer := 0;
  v_progress integer := 0;
  v_total_weight numeric := 100;
  v_last_signal_at timestamptz;
  v_meal_photos jsonb := '[]'::jsonb;
begin
  if p_patient_id is null then
    raise exception 'invalid_patient' using errcode = '22023';
  end if;

  select p.tenant_id
  into v_tenant_id
  from public.patients p
  where p.id = p_patient_id;

  if v_tenant_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not public.has_clinical_permission(v_tenant_id, 'patients.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_start := v_date::timestamptz;
  v_end := (v_date + 1)::timestamptz;

  with chosen_goal as (
    select g.water_goal_ml, g.meals_goal, g.workouts_goal, g.checkin_required
    from public.patient_daily_goals g
    where g.tenant_id = v_tenant_id
      and g.status = 'active'
      and (g.patient_id = p_patient_id or g.patient_id is null)
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
    and we.patient_id = p_patient_id
    and we.status = 'recorded'
    and we.occurred_at >= v_start
    and we.occurred_at < v_end;

  select count(*)::integer
  into v_meals_count
  from public.meal_entries me
  where me.tenant_id = v_tenant_id
    and me.patient_id = p_patient_id
    and me.status <> 'deleted'
    and me.occurred_at >= v_start
    and me.occurred_at < v_end;

  select count(*)::integer
  into v_workouts_count
  from public.workout_entries wo
  where wo.tenant_id = v_tenant_id
    and wo.patient_id = p_patient_id
    and wo.status = 'recorded'
    and wo.occurred_at >= v_start
    and wo.occurred_at < v_end;

  select exists (
    select 1
    from public.daily_checkins dc
    where dc.tenant_id = v_tenant_id
      and dc.patient_id = p_patient_id
      and dc.status = 'recorded'
      and dc.checkin_date = v_date
  ) or exists (
    select 1
    from public.patient_program_checkins pc
    where pc.tenant_id = v_tenant_id
      and pc.patient_id = p_patient_id
      and pc.status = 'completed'
      and pc.completed_at >= v_start
      and pc.completed_at < v_end
  )
  into v_checkin_done;

  select count(*)::integer
  into v_pending_checkins_count
  from public.patient_program_checkins pc
  where pc.tenant_id = v_tenant_id
    and pc.patient_id = p_patient_id
    and pc.status not in ('completed', 'canceled')
    and (pc.due_date is null or pc.due_date::date <= v_date);

  v_checkin_required := v_checkin_required or v_pending_checkins_count > 0;
  v_total_weight := 35 + 25 + 20 + case when v_checkin_required then 20 else 0 end;
  v_progress := round((
    case when v_water_goal <= 0 then 35 else least(v_water_ml::numeric / v_water_goal, 1) * 35 end
    + case when v_meals_goal <= 0 then 25 else least(v_meals_count::numeric / v_meals_goal, 1) * 25 end
    + case when v_workouts_goal <= 0 then 20 else least(v_workouts_count::numeric / v_workouts_goal, 1) * 20 end
    + case when v_checkin_required and v_checkin_done then 20 else 0 end
  ) / greatest(v_total_weight, 1) * 100)::integer;

  select nullif(greatest(
    coalesce((select max(we.occurred_at) from public.water_entries we where we.tenant_id = v_tenant_id and we.patient_id = p_patient_id and we.status = 'recorded' and we.occurred_at >= v_start and we.occurred_at < v_end), 'epoch'::timestamptz),
    coalesce((select max(me.occurred_at) from public.meal_entries me where me.tenant_id = v_tenant_id and me.patient_id = p_patient_id and me.status <> 'deleted' and me.occurred_at >= v_start and me.occurred_at < v_end), 'epoch'::timestamptz),
    coalesce((select max(wo.occurred_at) from public.workout_entries wo where wo.tenant_id = v_tenant_id and wo.patient_id = p_patient_id and wo.status = 'recorded' and wo.occurred_at >= v_start and wo.occurred_at < v_end), 'epoch'::timestamptz),
    coalesce((select max(dc.occurred_at) from public.daily_checkins dc where dc.tenant_id = v_tenant_id and dc.patient_id = p_patient_id and dc.status = 'recorded' and dc.checkin_date = v_date), 'epoch'::timestamptz)
  ), 'epoch'::timestamptz)
  into v_last_signal_at;

  if public.has_clinical_permission(v_tenant_id, 'nutrition.read') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', me.id,
      'mealName', coalesce(nullif(me.meal_type, ''), 'Refeicao'),
      'submittedAt', me.occurred_at,
      'note', nullif(left(coalesce(me.notes, ''), 180), ''),
      'photoUploadStatus', me.photo_upload_status,
      'hasPhoto', me.photo_storage_path is not null,
      'reviewedAt', me.reviewed_at,
      'reviewNote', nullif(left(coalesce(me.review_note, ''), 180), '')
    ) order by me.occurred_at desc), '[]'::jsonb)
    into v_meal_photos
    from (
      select *
      from public.meal_entries source_me
      where source_me.tenant_id = v_tenant_id
        and source_me.patient_id = p_patient_id
        and source_me.status <> 'deleted'
        and source_me.photo_storage_bucket = 'meal-photos'
        and source_me.photo_storage_path is not null
        and source_me.photo_upload_status in ('uploaded', 'failed', 'pending_upload')
      order by source_me.occurred_at desc
      limit 12
    ) me;
  end if;

  return jsonb_build_object(
    'dateIso', v_date,
    'progressPercent', v_progress,
    'status', case
      when v_progress >= 80 then 'done'
      when v_progress >= 60 then 'partial'
      when v_progress > 0 then 'low'
      else 'empty'
    end,
    'lastSignalAt', v_last_signal_at,
    'waterMl', v_water_ml,
    'waterGoalMl', v_water_goal,
    'mealsCount', v_meals_count,
    'mealsGoal', v_meals_goal,
    'workoutsCount', v_workouts_count,
    'workoutsGoal', v_workouts_goal,
    'checkinRequired', v_checkin_required,
    'checkinDone', v_checkin_done,
    'pendingCheckinsCount', v_pending_checkins_count,
    'mealPhotos', v_meal_photos
  );
end;
$$;

revoke all on function public.get_clinic_patient_daily_summary(uuid, date) from public;
grant execute on function public.get_clinic_patient_daily_summary(uuid, date)
  to authenticated, service_role;

comment on function public.get_clinic_patient_daily_summary(uuid, date) is
  'Returns clinic-authorized daily habit aggregates for one patient plus meal photo entry references without signed URLs.';
