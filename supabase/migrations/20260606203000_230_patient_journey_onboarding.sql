-- M02: patient onboarding, journey profile, goals, care plan and reminders.
-- Scope: patient/guardian-scoped reads and narrow mutators guarded by
-- security.resolve_patient_portal_link / security.can_access_patient_portal_patient.

alter table public.patient_daily_goals
  add column if not exists sleep_goal_hours numeric(4,2) not null default 8.00
    check (sleep_goal_hours between 0 and 24),
  add column if not exists program_goal text,
  add column if not exists editable_fields jsonb not null default
    '{"waterGoalMl":false,"mealsGoal":false,"workoutsGoal":false,"sleepGoalHours":false,"programGoal":false}'::jsonb;

create table if not exists public.patient_onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  current_step text,
  completed_steps text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id),
  constraint patient_onboarding_progress_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.patient_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  requested_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'in_review', 'approved', 'rejected', 'applied', 'cancelled')),
  requested_changes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(requested_changes) = 'object'),
  review_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_profile_change_requests_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.medication_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  prescription_id uuid,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  title text not null default 'Lembrete do tratamento',
  medication_label text,
  dosage text,
  instructions text,
  schedule_times text[] not null default '{}'::text[],
  timezone text not null default 'America/Sao_Paulo',
  start_date date not null default current_date,
  end_date date,
  patient_editable boolean not null default true,
  external_notification_consent boolean not null default false,
  notification_copy_mode text not null default 'generic'
    check (notification_copy_mode in ('generic', 'details')),
  source text not null default 'patient_portal'
    check (source in ('clinic', 'patient_portal', 'prescription')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint medication_reminders_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint medication_reminders_date_range
    check (end_date is null or end_date >= start_date)
);

do $$
begin
  alter table public.medication_reminders
    add constraint medication_reminders_prescription_same_tenant
    foreign key (tenant_id, prescription_id)
    references public.prescriptions_placeholder(tenant_id, id)
    on delete set null (prescription_id);
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_patient_onboarding_progress_patient
  on public.patient_onboarding_progress(tenant_id, patient_id, status);

create index if not exists idx_patient_profile_change_requests_patient_status
  on public.patient_profile_change_requests(tenant_id, patient_id, status, created_at desc);

create index if not exists idx_medication_reminders_patient_status
  on public.medication_reminders(tenant_id, patient_id, status, start_date);

select security.touch_updated_at('public.patient_onboarding_progress');
select security.touch_updated_at('public.patient_profile_change_requests');
select security.touch_updated_at('public.medication_reminders');

alter table public.patient_onboarding_progress enable row level security;
alter table public.patient_profile_change_requests enable row level security;
alter table public.medication_reminders enable row level security;

drop policy if exists patient_onboarding_progress_select_patient_portal on public.patient_onboarding_progress;
create policy patient_onboarding_progress_select_patient_portal
on public.patient_onboarding_progress for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists patient_profile_change_requests_select_patient_portal on public.patient_profile_change_requests;
create policy patient_profile_change_requests_select_patient_portal
on public.patient_profile_change_requests for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists medication_reminders_select_patient_portal on public.medication_reminders;
create policy medication_reminders_select_patient_portal
on public.medication_reminders for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists patient_onboarding_progress_select_patients_read on public.patient_onboarding_progress;
create policy patient_onboarding_progress_select_patients_read
on public.patient_onboarding_progress for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.read'));

drop policy if exists patient_onboarding_progress_write_patients_write on public.patient_onboarding_progress;
create policy patient_onboarding_progress_write_patients_write
on public.patient_onboarding_progress for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.write'))
with check (public.has_clinical_permission(tenant_id, 'patients.write'));

drop policy if exists patient_profile_change_requests_select_patients_read on public.patient_profile_change_requests;
create policy patient_profile_change_requests_select_patients_read
on public.patient_profile_change_requests for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.read'));

drop policy if exists patient_profile_change_requests_write_patients_write on public.patient_profile_change_requests;
create policy patient_profile_change_requests_write_patients_write
on public.patient_profile_change_requests for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.write'))
with check (public.has_clinical_permission(tenant_id, 'patients.write'));

drop policy if exists medication_reminders_select_patients_read on public.medication_reminders;
create policy medication_reminders_select_patients_read
on public.medication_reminders for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.read'));

drop policy if exists medication_reminders_write_patients_write on public.medication_reminders;
create policy medication_reminders_write_patients_write
on public.medication_reminders for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.write'))
with check (public.has_clinical_permission(tenant_id, 'patients.write'));

grant select, insert, update on public.patient_onboarding_progress to authenticated, service_role;
grant select, insert, update on public.patient_profile_change_requests to authenticated, service_role;
grant select, insert, update on public.medication_reminders to authenticated, service_role;

create or replace function security.patient_journey_clean_text(
  p_value text,
  p_max_length integer
)
returns text
language sql
immutable
as $$
  select nullif(
    left(
      regexp_replace(btrim(coalesce(p_value, '')), '[[:cntrl:]]+', ' ', 'g'),
      greatest(coalesce(p_max_length, 0), 0)
    ),
    ''
  );
$$;

revoke all on function security.patient_journey_clean_text(text, integer) from public;
grant execute on function security.patient_journey_clean_text(text, integer)
  to authenticated, service_role;

create or replace function public.get_patient_journey_snapshot(p_patient_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_onboarding jsonb := '{}'::jsonb;
  v_profile jsonb := '{}'::jsonb;
  v_program jsonb := '{}'::jsonb;
  v_goals jsonb := '{}'::jsonb;
  v_medications jsonb := '[]'::jsonb;
  v_plan_today jsonb := '[]'::jsonb;
  v_plan_history jsonb := '[]'::jsonb;
  v_default_editable_fields jsonb :=
    '{"waterGoalMl":false,"mealsGoal":false,"workoutsGoal":false,"sleepGoalHours":false,"programGoal":false}'::jsonb;
begin
  select r.tenant_id, r.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id) r;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'status', coalesce(op.status, 'not_started'),
    'currentStep', coalesce(op.current_step, 'profile'),
    'completedSteps', coalesce(to_jsonb(op.completed_steps), '[]'::jsonb),
    'progressPercent',
      case
        when op.status = 'completed' then 100
        else least(100, round((coalesce(cardinality(op.completed_steps), 0)::numeric / 5) * 100)::integer)
      end,
    'completedAt', op.completed_at,
    'pendingReviewCount', (
      select count(*)::integer
      from public.patient_profile_change_requests cr
      where cr.tenant_id = v_tenant_id
        and cr.patient_id = v_patient_id
        and cr.status in ('pending', 'in_review')
    )
  )
  into v_onboarding
  from public.patient_onboarding_progress op
  where op.tenant_id = v_tenant_id
    and op.patient_id = v_patient_id;

  if v_onboarding = '{}'::jsonb then
    v_onboarding := jsonb_build_object(
      'status', 'not_started',
      'currentStep', 'profile',
      'completedSteps', '[]'::jsonb,
      'progressPercent', 0,
      'completedAt', null,
      'pendingReviewCount', 0
    );
  end if;

  select jsonb_build_object(
    'preferredName', coalesce(p.preferred_name, pp.full_name, 'Paciente'),
    'fullName', pp.full_name,
    'email', pp.email,
    'phone', pp.phone,
    'birthDate', pp.birth_date,
    'status', p.status,
    'editableFields', jsonb_build_object(
      'preferredName', 'direct',
      'fullName', 'review',
      'email', 'review',
      'phone', 'review',
      'birthDate', 'review',
      'address', 'review',
      'emergencyContact', 'review'
    ),
    'pendingReviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cr.id,
        'status', cr.status,
        'createdAt', cr.created_at,
        'fields', coalesce((
          select jsonb_agg(field_name order by field_name)
          from jsonb_object_keys(cr.requested_changes) as fields(field_name)
        ), '[]'::jsonb)
      ) order by cr.created_at desc)
      from public.patient_profile_change_requests cr
      where cr.tenant_id = v_tenant_id
        and cr.patient_id = v_patient_id
        and cr.status in ('pending', 'in_review')
    ), '[]'::jsonb)
  )
  into v_profile
  from public.patients p
  left join public.patient_pii pp on pp.tenant_id = p.tenant_id and pp.patient_id = p.id
  where p.tenant_id = v_tenant_id
    and p.id = v_patient_id;

  select coalesce(jsonb_build_object(
    'id', e.id,
    'programId', pr.id,
    'name', pr.name,
    'programType', pr.program_type,
    'objective', pr.objective,
    'status', e.status,
    'startDate', e.start_date,
    'endDate', e.end_date,
    'currentWeek',
      greatest(
        coalesce(e.current_week, 0),
        case
          when e.start_date is null then 0
          else floor(greatest(current_date - e.start_date, 0)::numeric / 7)::integer + 1
        end
      ),
    'totalWeeks', pr.duration_weeks,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', ps.label,
        'quantity', ps.quantity,
        'unit', ps.unit
      ) order by ps.label)
      from public.program_services ps
      where ps.tenant_id = e.tenant_id
        and ps.program_id = e.program_id
    ), '[]'::jsonb),
    'phases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', ph.name,
        'durationWeeks', ph.duration_weeks,
        'description', ph.description
      ) order by ph.position, ph.created_at)
      from public.program_phases ph
      where ph.tenant_id = e.tenant_id
        and ph.program_id = e.program_id
    ), '[]'::jsonb)
  ), jsonb_build_object('status', 'not_enrolled', 'services', '[]'::jsonb, 'phases', '[]'::jsonb))
  into v_program
  from public.patient_program_enrollments e
  join public.programs pr on pr.tenant_id = e.tenant_id and pr.id = e.program_id
  where e.tenant_id = v_tenant_id
    and e.patient_id = v_patient_id
    and e.status in ('ativo', 'aguardando', 'pausado')
  order by
    case e.status when 'ativo' then 0 when 'aguardando' then 1 else 2 end,
    e.start_date desc nulls last,
    e.created_at desc
  limit 1;

  if v_program = '{}'::jsonb then
    v_program := jsonb_build_object('status', 'not_enrolled', 'services', '[]'::jsonb, 'phases', '[]'::jsonb);
  end if;

  with chosen_goal as (
    select
      g.*,
      case when g.patient_id = v_patient_id then 'patient' else 'clinic_default' end as source_label,
      case when g.patient_id = v_patient_id then 0 else 1 end as source_priority
    from public.patient_daily_goals g
    where g.tenant_id = v_tenant_id
      and g.status = 'active'
      and (g.patient_id = v_patient_id or g.patient_id is null)
      and g.effective_from <= current_date
      and (g.effective_to is null or g.effective_to >= current_date)
    order by source_priority, g.effective_from desc, g.created_at desc
    limit 1
  )
  select coalesce(jsonb_build_object(
    'source', cg.source_label,
    'waterGoalMl', cg.water_goal_ml,
    'mealsGoal', cg.meals_goal,
    'workoutsGoal', cg.workouts_goal,
    'sleepGoalHours', cg.sleep_goal_hours,
    'programGoal', cg.program_goal,
    'checkinRequired', cg.checkin_required,
    'editableFields', coalesce(cg.editable_fields, v_default_editable_fields)
  ), jsonb_build_object(
    'source', 'fallback',
    'waterGoalMl', 2000,
    'mealsGoal', 4,
    'workoutsGoal', 1,
    'sleepGoalHours', 8,
    'programGoal', null,
    'checkinRequired', true,
    'editableFields', v_default_editable_fields
  ))
  into v_goals
  from chosen_goal cg;

  if v_goals = '{}'::jsonb then
    v_goals := jsonb_build_object(
      'source', 'fallback',
      'waterGoalMl', 2000,
      'mealsGoal', 4,
      'workoutsGoal', 1,
      'sleepGoalHours', 8,
      'programGoal', null,
      'checkinRequired', true,
      'editableFields', v_default_editable_fields
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', mr.id,
    'title', mr.title,
    'medicationLabel', mr.medication_label,
    'dosage', mr.dosage,
    'instructions', mr.instructions,
    'scheduleTimes', to_jsonb(mr.schedule_times),
    'timezone', mr.timezone,
    'status', mr.status,
    'patientEditable', mr.patient_editable,
    'externalNotificationConsent', mr.external_notification_consent,
    'notificationCopyMode', mr.notification_copy_mode,
    'startDate', mr.start_date,
    'endDate', mr.end_date,
    'source', mr.source
  ) order by mr.status, mr.start_date, mr.created_at), '[]'::jsonb)
  into v_medications
  from public.medication_reminders mr
  where mr.tenant_id = v_tenant_id
    and mr.patient_id = v_patient_id
    and mr.status <> 'archived';

  with items as (
    select
      10 as priority,
      coalesce(pc.due_date, current_date)::text as due_label,
      jsonb_build_object(
        'id', 'checkin-' || pc.id::text,
        'kind', 'checkin',
        'title', pc.title,
        'detail', 'Responder check-in do programa',
        'status', pc.status,
        'dueDate', pc.due_date,
        'actionTab', 'checkins'
      ) as item
    from public.patient_program_checkins pc
    where pc.tenant_id = v_tenant_id
      and pc.patient_id = v_patient_id
      and pc.status not in ('completed', 'canceled')
      and pc.due_date <= current_date + 1
    union all
    select
      20 as priority,
      current_date::text as due_label,
      jsonb_build_object(
        'id', 'reminder-' || mr.id::text,
        'kind', 'medication',
        'title', 'Lembrete do tratamento',
        'detail',
          case
            when array_length(mr.schedule_times, 1) is null then 'Horarios ainda nao definidos'
            else 'Horarios: ' || array_to_string(mr.schedule_times, ', ')
          end,
        'status', mr.status,
        'dueDate', current_date,
        'actionTab', 'jornada'
      ) as item
    from public.medication_reminders mr
    where mr.tenant_id = v_tenant_id
      and mr.patient_id = v_patient_id
      and mr.status = 'active'
      and mr.start_date <= current_date
      and (mr.end_date is null or mr.end_date >= current_date)
    union all
    select
      30 as priority,
      current_date::text as due_label,
      jsonb_build_object(
        'id', 'daily-plan',
        'kind', 'daily',
        'title', 'Registrar diario',
        'detail', 'Agua, refeicoes, treino e check-in do dia',
        'status', 'open',
        'dueDate', current_date,
        'actionTab', 'diario'
      ) as item
  )
  select coalesce(jsonb_agg(item order by priority, due_label), '[]'::jsonb)
  into v_plan_today
  from items;

  with history as (
    select
      op.completed_at as occurred_at,
      jsonb_build_object(
        'id', 'onboarding-' || op.id::text,
        'kind', 'onboarding',
        'title', 'Onboarding concluido',
        'detail', 'Dados enviados pelo portal',
        'occurredAt', op.completed_at
      ) as item
    from public.patient_onboarding_progress op
    where op.tenant_id = v_tenant_id
      and op.patient_id = v_patient_id
      and op.completed_at is not null
    union all
    select
      pc.completed_at as occurred_at,
      jsonb_build_object(
        'id', 'checkin-' || pc.id::text,
        'kind', 'checkin',
        'title', pc.title,
        'detail', 'Check-in enviado',
        'occurredAt', pc.completed_at
      ) as item
    from public.patient_program_checkins pc
    where pc.tenant_id = v_tenant_id
      and pc.patient_id = v_patient_id
      and pc.completed_at is not null
    union all
    select
      cr.created_at as occurred_at,
      jsonb_build_object(
        'id', 'review-' || cr.id::text,
        'kind', 'profile_review',
        'title', 'Atualizacao em revisao',
        'detail', cr.status,
        'occurredAt', cr.created_at
      ) as item
    from public.patient_profile_change_requests cr
    where cr.tenant_id = v_tenant_id
      and cr.patient_id = v_patient_id
  )
  select coalesce(jsonb_agg(item order by occurred_at desc), '[]'::jsonb)
  into v_plan_history
  from (
    select *
    from history
    where occurred_at is not null
    order by occurred_at desc
    limit 8
  ) h;

  return jsonb_build_object(
    'selectedPatientId', v_patient_id,
    'onboarding', v_onboarding,
    'profile', v_profile,
    'program', v_program,
    'goals', v_goals,
    'planToday', v_plan_today,
    'medicationReminders', v_medications,
    'history', v_plan_history
  );
end;
$$;

create or replace function public.complete_patient_onboarding(
  p_patient_id uuid default null,
  p_step text default 'profile',
  p_payload jsonb default '{}'::jsonb,
  p_finish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_patient_id uuid;
  v_step text := lower(coalesce(security.patient_journey_clean_text(p_step, 40), 'profile'));
  v_allowed_steps text[] := array['profile', 'goals', 'routine', 'reminders', 'consent'];
  v_step_payload jsonb := '{}'::jsonb;
  v_sensitive_changes jsonb := '{}'::jsonb;
  v_sensitive_fields jsonb := '[]'::jsonb;
  v_preferred_name text;
  v_completed_steps text[];
  v_status text;
  v_current_step text;
  v_completed_at timestamptz;
  v_water_goal integer;
  v_meals_goal integer;
  v_workouts_goal integer;
  v_sleep_goal numeric(4,2);
  v_program_goal text;
  v_goal_id uuid;
  v_goal_patient_id uuid;
  v_goal_editable jsonb;
  v_reminder_id uuid;
  v_schedule_times text[] := '{}'::text[];
  v_reminder_title text;
  v_medication_label text;
  v_dosage text;
  v_instructions text;
  v_notification_consent boolean;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  if not v_step = any(v_allowed_steps) then
    raise exception 'invalid_onboarding_step' using errcode = '22023';
  end if;

  select r.tenant_id, r.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id) r;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_step = 'profile' then
    v_preferred_name := security.patient_journey_clean_text(p_payload ->> 'preferredName', 80);

    if v_preferred_name is not null then
      update public.patients
      set preferred_name = v_preferred_name,
          updated_at = now()
      where tenant_id = v_tenant_id
        and id = v_patient_id;
    end if;

    v_sensitive_changes := jsonb_strip_nulls(jsonb_build_object(
      'fullName', security.patient_journey_clean_text(p_payload ->> 'fullName', 160),
      'email', security.patient_journey_clean_text(p_payload ->> 'email', 180),
      'phone', security.patient_journey_clean_text(p_payload ->> 'phone', 40),
      'birthDate', security.patient_journey_clean_text(p_payload ->> 'birthDate', 20),
      'address', case
        when jsonb_typeof(p_payload -> 'address') = 'object' then p_payload -> 'address'
        else null
      end,
      'emergencyContact', case
        when jsonb_typeof(p_payload -> 'emergencyContact') = 'object' then p_payload -> 'emergencyContact'
        else null
      end
    ));

    if v_sensitive_changes <> '{}'::jsonb then
      select coalesce(jsonb_agg(field_name order by field_name), '[]'::jsonb)
      into v_sensitive_fields
      from jsonb_object_keys(v_sensitive_changes) as fields(field_name);

      insert into public.patient_profile_change_requests (
        tenant_id, patient_id, requested_by, requested_changes
      )
      values (
        v_tenant_id,
        v_patient_id,
        v_user_id,
        v_sensitive_changes
      );
    end if;

    v_step_payload := jsonb_strip_nulls(jsonb_build_object(
      'preferredName', v_preferred_name,
      'submittedReviewFields', v_sensitive_fields
    ));
  elsif v_step = 'goals' then
    v_water_goal := case
      when coalesce(p_payload ->> 'waterGoalMl', '') ~ '^[0-9]+$'
        then least(greatest((p_payload ->> 'waterGoalMl')::integer, 250), 10000)
      else null
    end;
    v_meals_goal := case
      when coalesce(p_payload ->> 'mealsGoal', '') ~ '^[0-9]+$'
        then least(greatest((p_payload ->> 'mealsGoal')::integer, 1), 12)
      else null
    end;
    v_workouts_goal := case
      when coalesce(p_payload ->> 'workoutsGoal', '') ~ '^[0-9]+$'
        then least(greatest((p_payload ->> 'workoutsGoal')::integer, 0), 4)
      else null
    end;
    v_sleep_goal := case
      when coalesce(p_payload ->> 'sleepGoalHours', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then least(greatest((p_payload ->> 'sleepGoalHours')::numeric, 0), 24)
      else null
    end;
    v_program_goal := security.patient_journey_clean_text(p_payload ->> 'programGoal', 240);

    select g.id, g.patient_id, coalesce(g.editable_fields, '{}'::jsonb)
    into v_goal_id, v_goal_patient_id, v_goal_editable
    from public.patient_daily_goals g
    where g.tenant_id = v_tenant_id
      and g.status = 'active'
      and (g.patient_id = v_patient_id or g.patient_id is null)
      and g.effective_from <= current_date
      and (g.effective_to is null or g.effective_to >= current_date)
    order by case when g.patient_id = v_patient_id then 0 else 1 end, g.effective_from desc
    limit 1;

    if v_goal_id is not null and v_goal_patient_id = v_patient_id then
      update public.patient_daily_goals
      set water_goal_ml = case
            when coalesce(v_goal_editable ->> 'waterGoalMl', 'false') = 'true' and v_water_goal is not null
              then v_water_goal
            else water_goal_ml
          end,
          meals_goal = case
            when coalesce(v_goal_editable ->> 'mealsGoal', 'false') = 'true' and v_meals_goal is not null
              then v_meals_goal
            else meals_goal
          end,
          workouts_goal = case
            when coalesce(v_goal_editable ->> 'workoutsGoal', 'false') = 'true' and v_workouts_goal is not null
              then v_workouts_goal
            else workouts_goal
          end,
          sleep_goal_hours = case
            when coalesce(v_goal_editable ->> 'sleepGoalHours', 'false') = 'true' and v_sleep_goal is not null
              then v_sleep_goal
            else sleep_goal_hours
          end,
          program_goal = case
            when coalesce(v_goal_editable ->> 'programGoal', 'false') = 'true' and v_program_goal is not null
              then v_program_goal
            else program_goal
          end,
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object('lastPatientGoalSubmissionAt', now()),
          updated_at = now()
      where tenant_id = v_tenant_id
        and id = v_goal_id;
    end if;

    v_step_payload := jsonb_strip_nulls(jsonb_build_object(
      'waterGoalMl', v_water_goal,
      'mealsGoal', v_meals_goal,
      'workoutsGoal', v_workouts_goal,
      'sleepGoalHours', v_sleep_goal,
      'programGoal', v_program_goal,
      'editableFields', coalesce(v_goal_editable, '{}'::jsonb)
    ));
  elsif v_step = 'reminders' then
    v_reminder_id := case
      when security.is_valid_uuid_text(p_payload ->> 'reminderId') then (p_payload ->> 'reminderId')::uuid
      else null
    end;
    v_reminder_title := coalesce(
      security.patient_journey_clean_text(p_payload ->> 'title', 120),
      'Lembrete do tratamento'
    );
    v_medication_label := security.patient_journey_clean_text(p_payload ->> 'medicationLabel', 120);
    v_dosage := security.patient_journey_clean_text(p_payload ->> 'dosage', 80);
    v_instructions := security.patient_journey_clean_text(p_payload ->> 'instructions', 300);
    v_notification_consent :=
      lower(coalesce(p_payload ->> 'externalNotificationConsent', 'false')) in ('true', '1', 'yes', 'sim');

    if jsonb_typeof(p_payload -> 'scheduleTimes') = 'array' then
      select coalesce(array_agg(time_value order by time_value), '{}'::text[])
      into v_schedule_times
      from (
        select distinct security.patient_journey_clean_text(value, 5) as time_value
        from jsonb_array_elements_text(p_payload -> 'scheduleTimes') as raw(value)
      ) times
      where time_value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
    end if;

    if v_reminder_id is not null then
      update public.medication_reminders
      set schedule_times = case
            when cardinality(v_schedule_times) > 0 then v_schedule_times
            else schedule_times
          end,
          external_notification_consent = v_notification_consent,
          notification_copy_mode = case when v_notification_consent then notification_copy_mode else 'generic' end,
          status = case
            when (p_payload ->> 'status') in ('active', 'paused') then p_payload ->> 'status'
            else status
          end,
          updated_at = now()
      where tenant_id = v_tenant_id
        and patient_id = v_patient_id
        and id = v_reminder_id
        and patient_editable = true;
    elsif v_medication_label is not null or cardinality(v_schedule_times) > 0 then
      insert into public.medication_reminders (
        tenant_id, patient_id, title, medication_label, dosage, instructions,
        schedule_times, external_notification_consent, notification_copy_mode,
        source, created_by
      )
      values (
        v_tenant_id,
        v_patient_id,
        v_reminder_title,
        v_medication_label,
        v_dosage,
        v_instructions,
        v_schedule_times,
        v_notification_consent,
        'generic',
        'patient_portal',
        v_user_id
      )
      returning id into v_reminder_id;
    end if;

    v_step_payload := jsonb_strip_nulls(jsonb_build_object(
      'reminderId', v_reminder_id,
      'scheduleTimes', to_jsonb(v_schedule_times),
      'externalNotificationConsent', v_notification_consent
    ));
  else
    v_step_payload := case
      when jsonb_typeof(p_payload) = 'object' then p_payload
      else '{}'::jsonb
    end;
  end if;

  insert into public.patient_onboarding_progress (
    tenant_id,
    patient_id,
    status,
    current_step,
    completed_steps,
    payload,
    completed_at,
    created_by
  )
  values (
    v_tenant_id,
    v_patient_id,
    case when p_finish then 'completed' else 'in_progress' end,
    case when p_finish then null else v_step end,
    array[v_step],
    jsonb_build_object(v_step, v_step_payload),
    case when p_finish then now() else null end,
    v_user_id
  )
  on conflict (tenant_id, patient_id) do update
    set status = case
          when p_finish then 'completed'
          when public.patient_onboarding_progress.status = 'completed' then 'completed'
          else 'in_progress'
        end,
        current_step = case
          when p_finish then null
          when public.patient_onboarding_progress.status = 'completed' then null
          else v_step
        end,
        completed_steps = (
          select coalesce(array_agg(distinct step order by step), '{}'::text[])
          from unnest(public.patient_onboarding_progress.completed_steps || excluded.completed_steps) as s(step)
        ),
        payload = coalesce(public.patient_onboarding_progress.payload, '{}'::jsonb)
          || jsonb_build_object(v_step, v_step_payload),
        completed_at = case
          when p_finish then coalesce(public.patient_onboarding_progress.completed_at, now())
          else public.patient_onboarding_progress.completed_at
        end,
        updated_at = now()
  returning status, current_step, completed_steps, completed_at
  into v_status, v_current_step, v_completed_steps, v_completed_at;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    case when p_finish then 'patient_onboarding.completed' else 'patient_onboarding.step_saved' end,
    'patient',
    v_patient_id::text,
    jsonb_build_object('step', v_step, 'finish', p_finish)
  );

  return jsonb_build_object(
    'patientId', v_patient_id,
    'status', v_status,
    'currentStep', v_current_step,
    'completedSteps', to_jsonb(v_completed_steps),
    'completedAt', v_completed_at
  );
end;
$$;

revoke all on function public.get_patient_journey_snapshot(uuid) from public;
revoke all on function public.complete_patient_onboarding(uuid, text, jsonb, boolean) from public;

grant execute on function public.get_patient_journey_snapshot(uuid) to authenticated, service_role;
grant execute on function public.complete_patient_onboarding(uuid, text, jsonb, boolean)
  to authenticated, service_role;

comment on function public.get_patient_journey_snapshot(uuid) is
  'Returns patient-scoped journey data for M02 without exposing unrestricted clinical records.';

comment on function public.complete_patient_onboarding(uuid, text, jsonb, boolean) is
  'Saves one patient onboarding step, queues sensitive profile changes for review, and completes onboarding when requested.';
