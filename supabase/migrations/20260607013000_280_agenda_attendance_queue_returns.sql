-- M07: agenda, returns, blocked slots and formal attendance queue.
-- The browser should mutate agenda/attendance through these RPCs instead of
-- stitching clinical status transitions client-side.

alter table public.appointments
  drop constraint if exists appointments_status_check;

alter table public.appointments
  add constraint appointments_status_check
  check (
    status in (
      'agendado',
      'confirmado',
      'chegou',
      'triagem',
      'medidas',
      'bioimpedancia',
      'aguardando_medico',
      'em_consulta',
      'checkout',
      'concluido',
      'falta',
      'cancelado'
    )
  );

create table if not exists public.attendance_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  appointment_id uuid not null,
  encounter_id uuid,
  status text not null default 'scheduled'
    check (
      status in (
        'scheduled',
        'waiting',
        'called',
        'in_attendance',
        'checkout',
        'completed',
        'no_show',
        'cancelled',
        'stuck'
      )
    ),
  priority integer not null default 0,
  scheduled_at timestamptz not null,
  arrived_at timestamptz,
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_status_at timestamptz not null default now(),
  stuck_detected_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  room text,
  check_in_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, appointment_id),
  constraint attendance_queue_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint attendance_queue_appointment_same_tenant
    foreign key (tenant_id, appointment_id)
    references public.appointments(tenant_id, id)
    on delete cascade,
  constraint attendance_queue_encounter_same_tenant
    foreign key (tenant_id, encounter_id)
    references public.encounters(tenant_id, id)
    on delete set null
);

create table if not exists public.attendance_status_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  queue_id uuid,
  appointment_id uuid,
  patient_id uuid not null,
  from_status text,
  to_status text not null,
  appointment_status text,
  reason text,
  actor_id uuid references public.profiles(id) on delete set null,
  event_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint attendance_history_queue_same_tenant
    foreign key (tenant_id, queue_id)
    references public.attendance_queue(tenant_id, id)
    on delete set null,
  constraint attendance_history_appointment_same_tenant
    foreign key (tenant_id, appointment_id)
    references public.appointments(tenant_id, id)
    on delete set null,
  constraint attendance_history_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  reason text not null,
  location text,
  practitioner_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (end_at > start_at)
);

create table if not exists public.patient_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  source_appointment_id uuid,
  source_encounter_id uuid,
  target_appointment_id uuid,
  due_date date not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'contatado', 'agendado', 'dispensado', 'vencido', 'cancelado')),
  reason text not null,
  contact_method text,
  next_action_at timestamptz,
  last_contact_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_returns_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint patient_returns_source_appointment_same_tenant
    foreign key (tenant_id, source_appointment_id)
    references public.appointments(tenant_id, id)
    on delete set null,
  constraint patient_returns_target_appointment_same_tenant
    foreign key (tenant_id, target_appointment_id)
    references public.appointments(tenant_id, id)
    on delete set null,
  constraint patient_returns_source_encounter_same_tenant
    foreign key (tenant_id, source_encounter_id)
    references public.encounters(tenant_id, id)
    on delete set null
);

create index if not exists idx_attendance_queue_tenant_status
  on public.attendance_queue(tenant_id, status, scheduled_at);
create index if not exists idx_attendance_queue_patient
  on public.attendance_queue(tenant_id, patient_id, scheduled_at desc);
create index if not exists idx_attendance_history_queue
  on public.attendance_status_history(tenant_id, queue_id, event_at desc);
create index if not exists idx_blocked_slots_tenant_range
  on public.blocked_slots(tenant_id, start_at, end_at)
  where status = 'active';
create index if not exists idx_patient_returns_tenant_status_due
  on public.patient_returns(tenant_id, status, due_date);
create index if not exists idx_patient_returns_patient
  on public.patient_returns(tenant_id, patient_id, due_date desc);

select security.touch_updated_at('public.attendance_queue');
select security.touch_updated_at('public.blocked_slots');
select security.touch_updated_at('public.patient_returns');

alter table public.attendance_queue enable row level security;
alter table public.attendance_status_history enable row level security;
alter table public.blocked_slots enable row level security;
alter table public.patient_returns enable row level security;

drop policy if exists appointments_write_by_patients_write on public.appointments;
drop policy if exists queue_events_write_by_patients_write on public.queue_events;
drop policy if exists encounters_write_by_patients_write on public.encounters;

create policy appointments_select_by_agenda_or_patients_read
on public.appointments for select
to authenticated
using (
  public.has_permission(tenant_id, 'agenda.read')
  or public.has_clinical_permission(tenant_id, 'patients.read')
);

create policy appointments_write_by_agenda_write
on public.appointments for all
to authenticated
using (public.has_permission(tenant_id, 'agenda.write'))
with check (public.has_permission(tenant_id, 'agenda.write'));

create policy queue_events_write_by_agenda_write
on public.queue_events for all
to authenticated
using (public.has_permission(tenant_id, 'agenda.write'))
with check (public.has_permission(tenant_id, 'agenda.write'));

create policy encounters_write_by_encounters_write
on public.encounters for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'encounters.write'))
with check (public.has_clinical_permission(tenant_id, 'encounters.write'));

create policy attendance_queue_select_by_agenda_read
on public.attendance_queue for select
to authenticated
using (public.has_permission(tenant_id, 'agenda.read'));

create policy attendance_queue_write_by_agenda_write
on public.attendance_queue for all
to authenticated
using (public.has_permission(tenant_id, 'agenda.write'))
with check (public.has_permission(tenant_id, 'agenda.write'));

create policy attendance_history_select_by_agenda_read
on public.attendance_status_history for select
to authenticated
using (public.has_permission(tenant_id, 'agenda.read'));

create policy attendance_history_write_by_agenda_write
on public.attendance_status_history for all
to authenticated
using (public.has_permission(tenant_id, 'agenda.write'))
with check (public.has_permission(tenant_id, 'agenda.write'));

create policy blocked_slots_select_by_agenda_read
on public.blocked_slots for select
to authenticated
using (public.has_permission(tenant_id, 'agenda.read'));

create policy blocked_slots_write_by_agenda_write
on public.blocked_slots for all
to authenticated
using (public.has_permission(tenant_id, 'agenda.write'))
with check (public.has_permission(tenant_id, 'agenda.write'));

create policy patient_returns_select_by_agenda_read
on public.patient_returns for select
to authenticated
using (public.has_permission(tenant_id, 'agenda.read'));

create policy patient_returns_write_by_agenda_write
on public.patient_returns for all
to authenticated
using (public.has_permission(tenant_id, 'agenda.write'))
with check (public.has_permission(tenant_id, 'agenda.write'));

grant select on public.appointments to authenticated, service_role;
grant select, insert, update on public.attendance_queue to authenticated, service_role;
grant select, insert on public.attendance_status_history to authenticated, service_role;
grant select, insert, update on public.blocked_slots to authenticated, service_role;
grant select, insert, update on public.patient_returns to authenticated, service_role;

create or replace function security.resolve_agenda_tenant()
returns uuid
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
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

  return v_tenant_id;
end;
$$;

create or replace function security.agenda_clean_reason(p_reason text, p_max_length integer default 240)
returns text
language sql
stable
set search_path = public, security, pg_temp
as $$
  select nullif(
    left(
      regexp_replace(trim(coalesce(p_reason, '')), '[[:cntrl:]]+', ' ', 'g'),
      greatest(coalesce(p_max_length, 240), 1)
    ),
    ''
  );
$$;

create or replace function security.attendance_queue_status_for_appointment(p_status text)
returns text
language sql
immutable
set search_path = public, security, pg_temp
as $$
  select case lower(coalesce(p_status, ''))
    when 'confirmado' then 'scheduled'
    when 'chegou' then 'waiting'
    when 'triagem' then 'waiting'
    when 'medidas' then 'waiting'
    when 'bioimpedancia' then 'waiting'
    when 'aguardando_medico' then 'waiting'
    when 'em_consulta' then 'in_attendance'
    when 'checkout' then 'checkout'
    when 'concluido' then 'completed'
    when 'falta' then 'no_show'
    when 'cancelado' then 'cancelled'
    else null
  end;
$$;

create or replace function security.assert_appointment_transition(
  p_current_status text,
  p_next_status text,
  p_reason text default null
)
returns void
language plpgsql
stable
set search_path = public, security, pg_temp
as $$
declare
  v_current text := lower(coalesce(p_current_status, 'agendado'));
  v_next text := lower(coalesce(p_next_status, ''));
  v_allowed text[] := array[]::text[];
begin
  v_allowed := case v_current
    when 'agendado' then array['confirmado', 'cancelado', 'falta']
    when 'confirmado' then array['chegou', 'cancelado', 'falta']
    when 'chegou' then array['triagem', 'aguardando_medico', 'cancelado', 'falta']
    when 'triagem' then array['medidas', 'aguardando_medico', 'cancelado']
    when 'medidas' then array['bioimpedancia', 'aguardando_medico', 'cancelado']
    when 'bioimpedancia' then array['aguardando_medico', 'cancelado']
    when 'aguardando_medico' then array['em_consulta', 'cancelado', 'falta']
    when 'em_consulta' then array['checkout', 'cancelado']
    when 'checkout' then array['concluido']
    else array[]::text[]
  end;

  if not v_next = any(v_allowed) then
    raise exception 'invalid_appointment_transition: % -> %', v_current, v_next
      using errcode = '22023';
  end if;

  if v_next in ('cancelado', 'falta')
     and length(coalesce(security.agenda_clean_reason(p_reason, 240), '')) < 3 then
    raise exception 'status_reason_required' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.sync_attendance_queue_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_queue_status text;
  v_now timestamptz := now();
begin
  v_queue_status := security.attendance_queue_status_for_appointment(new.status);

  if v_queue_status is null then
    return new;
  end if;

  insert into public.attendance_queue (
    tenant_id,
    patient_id,
    appointment_id,
    status,
    scheduled_at,
    arrived_at,
    assigned_to,
    room,
    last_status_at,
    metadata
  )
  values (
    new.tenant_id,
    new.patient_id,
    new.id,
    v_queue_status,
    new.scheduled_at,
    new.arrived_at,
    new.practitioner_id,
    new.location,
    v_now,
    jsonb_build_object('source', 'appointments_trigger')
  )
  on conflict (tenant_id, appointment_id)
  do update set
    patient_id = excluded.patient_id,
    status = excluded.status,
    scheduled_at = excluded.scheduled_at,
    arrived_at = coalesce(excluded.arrived_at, attendance_queue.arrived_at),
    assigned_to = excluded.assigned_to,
    room = excluded.room,
    completed_at = case
      when excluded.status in ('completed', 'cancelled', 'no_show') then coalesce(attendance_queue.completed_at, v_now)
      else attendance_queue.completed_at
    end,
    last_status_at = case
      when attendance_queue.status is distinct from excluded.status then v_now
      else attendance_queue.last_status_at
    end,
    metadata = attendance_queue.metadata || excluded.metadata,
    updated_at = v_now;

  return new;
end;
$$;

drop trigger if exists trg_sync_attendance_queue_from_appointment on public.appointments;
create trigger trg_sync_attendance_queue_from_appointment
after insert or update of status, scheduled_at, arrived_at, practitioner_id, location
on public.appointments
for each row
execute function public.sync_attendance_queue_from_appointment();

insert into public.attendance_queue (
  tenant_id,
  patient_id,
  appointment_id,
  status,
  scheduled_at,
  arrived_at,
  assigned_to,
  room,
  last_status_at,
  metadata
)
select
  a.tenant_id,
  a.patient_id,
  a.id,
  security.attendance_queue_status_for_appointment(a.status),
  a.scheduled_at,
  a.arrived_at,
  a.practitioner_id,
  a.location,
  now(),
  jsonb_build_object('source', 'migration_backfill')
from public.appointments a
where security.attendance_queue_status_for_appointment(a.status) is not null
on conflict (tenant_id, appointment_id) do nothing;

create or replace function public.get_agenda_day_snapshot(
  p_target_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_date date := coalesce(p_target_date, current_date);
  v_timezone text := 'America/Sao_Paulo';
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_now timestamptz := now();
  v_appointments jsonb := '[]'::jsonb;
  v_queue jsonb := '[]'::jsonb;
  v_returns jsonb := '[]'::jsonb;
  v_blocked_slots jsonb := '[]'::jsonb;
  v_calendar_events jsonb := '{}'::jsonb;
begin
  if not security.has_permission(v_tenant_id, 'agenda.read', false) then
    raise exception 'agenda_read_required' using errcode = '42501';
  end if;

  select coalesce(nullif(t.settings #>> '{profile,timezone}', ''), 'America/Sao_Paulo')
    into v_timezone
  from public.tenants t
  where t.id = v_tenant_id;

  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    v_timezone := 'America/Sao_Paulo';
  end if;

  v_day_start := v_date::timestamp at time zone v_timezone;
  v_day_end := (v_date + 1)::timestamp at time zone v_timezone;
  v_month_start := date_trunc('month', v_date)::timestamp at time zone v_timezone;
  v_month_end := (date_trunc('month', v_date)::date + interval '1 month')::timestamp at time zone v_timezone;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'patientId', a.patient_id,
    'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
    'patientPhone', case
      when length(phone.digits) >= 4 then '(**) *****-' || right(phone.digits, 4)
      else null
    end,
    'activePackageName', coalesce(pkg.program_name, 'Sem pacote ativo'),
    'alertCount', coalesce(alerts.alert_count, 0),
    'type', a.type,
    'status', a.status,
    'scheduledAt', a.scheduled_at,
    'durationMinutes', coalesce(a.duration_minutes, 30),
    'professionalName', coalesce(pr.full_name, 'Equipe clinica'),
    'professionalRole', 'Profissional',
    'roomName', a.location,
    'notes', a.notes,
    'attendanceQueueId', aq.id,
    'attendanceQueueStatus', aq.status,
    'attendanceLink', '/clinic/patients/' || a.patient_id::text || '/encounter?appointmentId=' || a.id::text
  ) order by a.scheduled_at asc), '[]'::jsonb)
    into v_appointments
  from public.appointments a
  left join public.patient_pii pp
    on pp.tenant_id = a.tenant_id
   and pp.patient_id = a.patient_id
  left join lateral (
    select regexp_replace(coalesce(pp.phone, ''), '\D', '', 'g') as digits
  ) phone on true
  left join public.profiles pr
    on pr.id = a.practitioner_id
  left join public.attendance_queue aq
    on aq.tenant_id = a.tenant_id
   and aq.appointment_id = a.id
  left join lateral (
    select p.name as program_name
    from public.patient_program_enrollments e
    join public.programs p
      on p.tenant_id = e.tenant_id
     and p.id = e.program_id
    where e.tenant_id = a.tenant_id
      and e.patient_id = a.patient_id
      and e.status = 'ativo'
    order by e.updated_at desc
    limit 1
  ) pkg on true
  left join lateral (
    select count(*)::integer as alert_count
    from public.patient_alerts pa
    where pa.tenant_id = a.tenant_id
      and pa.patient_id = a.patient_id
      and pa.status = 'active'
  ) alerts on true
  where a.tenant_id = v_tenant_id
    and a.scheduled_at >= v_day_start
    and a.scheduled_at < v_day_end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'queueId', q.id,
    'appointmentId', q.appointment_id,
    'patientId', q.patient_id,
    'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
    'patientPhone', case
      when length(phone.digits) >= 4 then '(**) *****-' || right(phone.digits, 4)
      else null
    end,
    'activePackageName', coalesce(pkg.program_name, 'Sem pacote ativo'),
    'alertCount', coalesce(alerts.alert_count, 0),
    'appointmentType', a.type,
    'status', a.status,
    'queueStatus', q.status,
    'scheduledTime', a.scheduled_at,
    'arrivedAt', q.arrived_at,
    'calledAt', q.called_at,
    'startedAt', q.started_at,
    'completedAt', q.completed_at,
    'waitingMinutes', greatest(0, floor(extract(epoch from (v_now - coalesce(q.arrived_at, q.scheduled_at))) / 60))::integer,
    'professionalName', coalesce(pr.full_name, 'Equipe clinica'),
    'room', coalesce(q.room, a.location),
    'encounterId', q.encounter_id,
    'attendanceLink', '/clinic/patients/' || q.patient_id::text || '/encounter?appointmentId=' || q.appointment_id::text
  ) order by
    case q.status
      when 'called' then 0
      when 'waiting' then 1
      when 'in_attendance' then 2
      when 'checkout' then 3
      when 'scheduled' then 4
      else 5
    end,
    q.scheduled_at asc), '[]'::jsonb)
    into v_queue
  from public.attendance_queue q
  join public.appointments a
    on a.tenant_id = q.tenant_id
   and a.id = q.appointment_id
  left join public.patient_pii pp
    on pp.tenant_id = q.tenant_id
   and pp.patient_id = q.patient_id
  left join lateral (
    select regexp_replace(coalesce(pp.phone, ''), '\D', '', 'g') as digits
  ) phone on true
  left join public.profiles pr
    on pr.id = coalesce(q.assigned_to, a.practitioner_id)
  left join lateral (
    select p.name as program_name
    from public.patient_program_enrollments e
    join public.programs p
      on p.tenant_id = e.tenant_id
     and p.id = e.program_id
    where e.tenant_id = q.tenant_id
      and e.patient_id = q.patient_id
      and e.status = 'ativo'
    order by e.updated_at desc
    limit 1
  ) pkg on true
  left join lateral (
    select count(*)::integer as alert_count
    from public.patient_alerts pa
    where pa.tenant_id = q.tenant_id
      and pa.patient_id = q.patient_id
      and pa.status = 'active'
  ) alerts on true
  where q.tenant_id = v_tenant_id
    and q.scheduled_at >= v_day_start
    and q.scheduled_at < v_day_end
    and q.status in ('scheduled', 'waiting', 'called', 'in_attendance', 'checkout', 'stuck');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'patientId', r.patient_id,
    'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
    'patientPhone', case
      when length(phone.digits) >= 4 then '(**) *****-' || right(phone.digits, 4)
      else null
    end,
    'activePackageName', coalesce(pkg.program_name, 'Sem pacote ativo'),
    'alertCount', coalesce(alerts.alert_count, 0),
    'dueDate', r.due_date,
    'status', r.status,
    'reason', r.reason,
    'contactMethod', r.contact_method,
    'lastContactAt', r.last_contact_at,
    'nextActionAt', r.next_action_at,
    'sourceAppointmentId', r.source_appointment_id,
    'targetAppointmentId', r.target_appointment_id,
    'notes', r.notes,
    'href', '/clinic/patients/' || r.patient_id::text
  ) order by r.due_date asc, r.created_at asc), '[]'::jsonb)
    into v_returns
  from public.patient_returns r
  left join public.patient_pii pp
    on pp.tenant_id = r.tenant_id
   and pp.patient_id = r.patient_id
  left join lateral (
    select regexp_replace(coalesce(pp.phone, ''), '\D', '', 'g') as digits
  ) phone on true
  left join lateral (
    select p.name as program_name
    from public.patient_program_enrollments e
    join public.programs p
      on p.tenant_id = e.tenant_id
     and p.id = e.program_id
    where e.tenant_id = r.tenant_id
      and e.patient_id = r.patient_id
      and e.status = 'ativo'
    order by e.updated_at desc
    limit 1
  ) pkg on true
  left join lateral (
    select count(*)::integer as alert_count
    from public.patient_alerts pa
    where pa.tenant_id = r.tenant_id
      and pa.patient_id = r.patient_id
      and pa.status = 'active'
  ) alerts on true
  where r.tenant_id = v_tenant_id
    and r.status in ('pendente', 'contatado', 'vencido')
    and (
      r.due_date <= v_date + 30
      or r.next_action_at < v_day_end
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', bs.id,
    'startAt', bs.start_at,
    'endAt', bs.end_at,
    'status', bs.status,
    'reason', bs.reason,
    'location', bs.location
  ) order by bs.start_at asc), '[]'::jsonb)
    into v_blocked_slots
  from public.blocked_slots bs
  where bs.tenant_id = v_tenant_id
    and bs.status = 'active'
    and bs.start_at < v_day_end
    and bs.end_at > v_day_start;

  select coalesce(jsonb_object_agg(day_key, total), '{}'::jsonb)
    into v_calendar_events
  from (
    select
      to_char(a.scheduled_at at time zone v_timezone, 'YYYY-MM-DD') as day_key,
      count(*)::integer as total
    from public.appointments a
    where a.tenant_id = v_tenant_id
      and a.scheduled_at >= v_month_start
      and a.scheduled_at < v_month_end
    group by day_key
  ) events;

  return jsonb_build_object(
    'date', v_date,
    'timezone', v_timezone,
    'appointments', v_appointments,
    'waitingQueue', v_queue,
    'returns', v_returns,
    'blockedSlots', v_blocked_slots,
    'calendarEvents', v_calendar_events
  );
end;
$$;

create or replace function public.create_agenda_appointment(
  p_patient_id uuid,
  p_type text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 30,
  p_location text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_duration integer := greatest(coalesce(p_duration_minutes, 30), 1);
  v_start timestamptz := p_scheduled_at;
  v_end timestamptz := p_scheduled_at + (greatest(coalesce(p_duration_minutes, 30), 1) * interval '1 minute');
  v_location text := security.agenda_clean_reason(p_location, 120);
  v_appointment_id uuid;
begin
  if not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  if p_patient_id is null or p_scheduled_at is null then
    raise exception 'invalid_appointment_payload' using errcode = '22023';
  end if;

  perform 1
  from public.patients p
  where p.tenant_id = v_tenant_id
    and p.id = p_patient_id;

  if not found then
    raise exception 'patient_not_found_or_forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.tenant_id = v_tenant_id
      and a.status not in ('cancelado', 'falta')
      and a.scheduled_at < v_end
      and (a.scheduled_at + (coalesce(a.duration_minutes, 30) * interval '1 minute')) > v_start
      and (
        a.patient_id = p_patient_id
        or (
          v_location is not null
          and lower(coalesce(a.location, '')) = lower(v_location)
        )
      )
  ) then
    raise exception 'appointment_conflict' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.blocked_slots bs
    where bs.tenant_id = v_tenant_id
      and bs.status = 'active'
      and bs.start_at < v_end
      and bs.end_at > v_start
      and (
        bs.location is null
        or v_location is null
        or lower(bs.location) = lower(v_location)
      )
  ) then
    raise exception 'blocked_slot_conflict' using errcode = '23505';
  end if;

  insert into public.appointments (
    tenant_id,
    patient_id,
    type,
    status,
    scheduled_at,
    duration_minutes,
    location,
    notes
  )
  values (
    v_tenant_id,
    p_patient_id,
    coalesce(nullif(p_type, ''), 'consulta_medica'),
    'agendado',
    p_scheduled_at,
    v_duration,
    v_location,
    security.agenda_clean_reason(p_notes, 1000)
  )
  returning id into v_appointment_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'agenda.appointment_created',
    'appointment',
    v_appointment_id::text,
    jsonb_build_object(
      'patientId', p_patient_id,
      'scheduledAt', p_scheduled_at,
      'type', coalesce(nullif(p_type, ''), 'consulta_medica')
    )
  );

  return jsonb_build_object('id', v_appointment_id);
end;
$$;

create or replace function public.update_agenda_appointment(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_type text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 30,
  p_location text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_duration integer := greatest(coalesce(p_duration_minutes, 30), 1);
  v_start timestamptz := p_scheduled_at;
  v_end timestamptz := p_scheduled_at + (greatest(coalesce(p_duration_minutes, 30), 1) * interval '1 minute');
  v_location text := security.agenda_clean_reason(p_location, 120);
begin
  if not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  if p_appointment_id is null or p_patient_id is null or p_scheduled_at is null then
    raise exception 'invalid_appointment_payload' using errcode = '22023';
  end if;

  perform 1
  from public.appointments a
  where a.tenant_id = v_tenant_id
    and a.id = p_appointment_id
  for update;

  if not found then
    raise exception 'appointment_not_found_or_forbidden' using errcode = '42501';
  end if;

  perform 1
  from public.patients p
  where p.tenant_id = v_tenant_id
    and p.id = p_patient_id;

  if not found then
    raise exception 'patient_not_found_or_forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.tenant_id = v_tenant_id
      and a.id <> p_appointment_id
      and a.status not in ('cancelado', 'falta')
      and a.scheduled_at < v_end
      and (a.scheduled_at + (coalesce(a.duration_minutes, 30) * interval '1 minute')) > v_start
      and (
        a.patient_id = p_patient_id
        or (
          v_location is not null
          and lower(coalesce(a.location, '')) = lower(v_location)
        )
      )
  ) then
    raise exception 'appointment_conflict' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.blocked_slots bs
    where bs.tenant_id = v_tenant_id
      and bs.status = 'active'
      and bs.start_at < v_end
      and bs.end_at > v_start
      and (
        bs.location is null
        or v_location is null
        or lower(bs.location) = lower(v_location)
      )
  ) then
    raise exception 'blocked_slot_conflict' using errcode = '23505';
  end if;

  update public.appointments
     set patient_id = p_patient_id,
         type = coalesce(nullif(p_type, ''), 'consulta_medica'),
         scheduled_at = p_scheduled_at,
         duration_minutes = v_duration,
         location = v_location,
         notes = security.agenda_clean_reason(p_notes, 1000),
         updated_at = now()
   where tenant_id = v_tenant_id
     and id = p_appointment_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'agenda.appointment_updated',
    'appointment',
    p_appointment_id::text,
    jsonb_build_object(
      'patientId', p_patient_id,
      'scheduledAt', p_scheduled_at,
      'type', coalesce(nullif(p_type, ''), 'consulta_medica')
    )
  );

  return jsonb_build_object('id', p_appointment_id);
end;
$$;

create or replace function public.update_appointment_status(
  p_appointment_id uuid,
  p_next_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_current public.appointments%rowtype;
  v_reason text := security.agenda_clean_reason(p_reason, 240);
  v_now timestamptz := now();
  v_old_queue_status text;
  v_queue_status text;
  v_queue_id uuid;
begin
  if not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  select *
    into v_current
  from public.appointments
  where tenant_id = v_tenant_id
    and id = p_appointment_id
  for update;

  if not found then
    raise exception 'appointment_not_found_or_forbidden' using errcode = '42501';
  end if;

  perform security.assert_appointment_transition(v_current.status, p_next_status, v_reason);

  select aq.status
    into v_old_queue_status
  from public.attendance_queue aq
  where aq.tenant_id = v_tenant_id
    and aq.appointment_id = p_appointment_id
  for update;

  update public.appointments
     set status = p_next_status,
         arrived_at = case
           when arrived_at is null
            and p_next_status in ('chegou', 'triagem', 'medidas', 'bioimpedancia', 'aguardando_medico', 'em_consulta', 'checkout')
             then v_now
           else arrived_at
         end,
         notes = case
           when p_next_status in ('cancelado', 'falta') then v_reason
           else notes
         end,
         updated_at = v_now
   where tenant_id = v_tenant_id
     and id = p_appointment_id;

  v_queue_status := security.attendance_queue_status_for_appointment(p_next_status);

  if v_queue_status is not null then
    select aq.id
      into v_queue_id
    from public.attendance_queue aq
    where aq.tenant_id = v_tenant_id
      and aq.appointment_id = p_appointment_id;

    insert into public.attendance_status_history (
      tenant_id,
      queue_id,
      appointment_id,
      patient_id,
      from_status,
      to_status,
      appointment_status,
      reason,
      actor_id,
      metadata
    )
    values (
      v_tenant_id,
      v_queue_id,
      p_appointment_id,
      v_current.patient_id,
      v_old_queue_status,
      v_queue_status,
      p_next_status,
      v_reason,
      v_user_id,
      jsonb_build_object('fromAppointmentStatus', v_current.status)
    );
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'agenda.appointment_status_updated',
    'appointment',
    p_appointment_id::text,
    jsonb_build_object(
      'fromStatus', v_current.status,
      'toStatus', p_next_status,
      'reasonProvided', v_reason is not null
    )
  );

  insert into public.queue_events (
    tenant_id,
    patient_id,
    appointment_id,
    event_type,
    status,
    event_at,
    metadata
  )
  values (
    v_tenant_id,
    v_current.patient_id,
    p_appointment_id,
    'appointment_status_transition',
    'closed',
    v_now,
    jsonb_build_object('fromStatus', v_current.status, 'toStatus', p_next_status)
  );

  return jsonb_build_object(
    'appointmentId', p_appointment_id,
    'status', p_next_status,
    'queueId', v_queue_id,
    'queueStatus', v_queue_status
  );
end;
$$;

create or replace function public.cancel_agenda_appointment(
  p_appointment_id uuid,
  p_reason text
)
returns jsonb
language sql
security definer
set search_path = public, security, pg_temp
as $$
  select public.update_appointment_status(p_appointment_id, 'cancelado', p_reason);
$$;

create or replace function public.call_attendance_queue(
  p_queue_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_queue public.attendance_queue%rowtype;
  v_now timestamptz := now();
  v_next_appointment_status text := 'aguardando_medico';
begin
  if not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  select *
    into v_queue
  from public.attendance_queue
  where tenant_id = v_tenant_id
    and id = p_queue_id
  for update;

  if not found then
    raise exception 'queue_entry_not_found_or_forbidden' using errcode = '42501';
  end if;

  if v_queue.status not in ('scheduled', 'waiting', 'stuck') then
    raise exception 'queue_entry_cannot_be_called' using errcode = '22023';
  end if;

  update public.appointments
     set status = case
           when status in ('agendado', 'confirmado', 'chegou') then v_next_appointment_status
           else status
         end,
         arrived_at = coalesce(arrived_at, v_now),
         updated_at = v_now
   where tenant_id = v_tenant_id
     and id = v_queue.appointment_id;

  update public.attendance_queue
     set status = 'called',
         arrived_at = coalesce(arrived_at, v_now),
         called_at = v_now,
         last_status_at = v_now,
         stuck_detected_at = null,
         updated_at = v_now
   where tenant_id = v_tenant_id
     and id = p_queue_id;

  insert into public.attendance_status_history (
    tenant_id,
    queue_id,
    appointment_id,
    patient_id,
    from_status,
    to_status,
    appointment_status,
    actor_id,
    metadata
  )
  values (
    v_tenant_id,
    p_queue_id,
    v_queue.appointment_id,
    v_queue.patient_id,
    v_queue.status,
    'called',
    v_next_appointment_status,
    v_user_id,
    jsonb_build_object('source', 'call_attendance_queue')
  );

  insert into public.queue_events (
    tenant_id,
    patient_id,
    appointment_id,
    event_type,
    status,
    event_at,
    metadata
  )
  values (
    v_tenant_id,
    v_queue.patient_id,
    v_queue.appointment_id,
    'attendance_called',
    'closed',
    v_now,
    jsonb_build_object('queueId', p_queue_id)
  );

  return jsonb_build_object(
    'queueId', p_queue_id,
    'appointmentId', v_queue.appointment_id,
    'patientId', v_queue.patient_id,
    'queueStatus', 'called'
  );
end;
$$;

create or replace function public.start_attendance_encounter(
  p_appointment_id uuid default null,
  p_queue_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_queue_id uuid;
  v_previous_queue_status text;
  v_encounter_id uuid;
  v_now timestamptz := now();
begin
  if not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  if not security.has_permission(v_tenant_id, 'encounters.write', false) then
    raise exception 'encounters_write_required' using errcode = '42501';
  end if;

  if p_queue_id is not null then
    select a.*
      into v_appointment
    from public.attendance_queue q
    join public.appointments a
      on a.tenant_id = q.tenant_id
     and a.id = q.appointment_id
    where q.tenant_id = v_tenant_id
      and q.id = p_queue_id
    for update of a;
  else
    select *
      into v_appointment
    from public.appointments
    where tenant_id = v_tenant_id
      and id = p_appointment_id
    for update;
  end if;

  if not found then
    raise exception 'appointment_not_found_or_forbidden' using errcode = '42501';
  end if;

  if v_appointment.status in ('concluido', 'cancelado', 'falta') then
    raise exception 'appointment_not_startable' using errcode = '22023';
  end if;

  select aq.id, aq.status
    into v_queue_id, v_previous_queue_status
  from public.attendance_queue aq
  where aq.tenant_id = v_tenant_id
    and aq.appointment_id = v_appointment.id
  for update;

  if v_queue_id is null then
    insert into public.attendance_queue (
      tenant_id,
      patient_id,
      appointment_id,
      status,
      scheduled_at,
      arrived_at,
      assigned_to,
      room,
      last_status_at,
      metadata
    )
    values (
      v_tenant_id,
      v_appointment.patient_id,
      v_appointment.id,
      'waiting',
      v_appointment.scheduled_at,
      coalesce(v_appointment.arrived_at, v_now),
      v_appointment.practitioner_id,
      v_appointment.location,
      v_now,
      jsonb_build_object('source', 'start_attendance_encounter')
    )
    returning id into v_queue_id;
  end if;

  select e.id
    into v_encounter_id
  from public.encounters e
  where e.tenant_id = v_tenant_id
    and e.appointment_id = v_appointment.id
    and e.status in ('open', 'in_progress')
  order by e.created_at desc
  limit 1
  for update;

  if v_encounter_id is null then
    insert into public.encounters (
      tenant_id,
      patient_id,
      appointment_id,
      status,
      encounter_type,
      started_at,
      created_by
    )
    values (
      v_tenant_id,
      v_appointment.patient_id,
      v_appointment.id,
      'in_progress',
      'clinic_visit',
      v_now,
      v_user_id
    )
    returning id into v_encounter_id;
  else
    update public.encounters
       set status = 'in_progress',
           started_at = coalesce(started_at, v_now),
           updated_at = v_now
     where tenant_id = v_tenant_id
       and id = v_encounter_id;
  end if;

  update public.appointments
     set status = 'em_consulta',
         arrived_at = coalesce(arrived_at, v_now),
         updated_at = v_now
   where tenant_id = v_tenant_id
     and id = v_appointment.id;

  update public.attendance_queue
     set status = 'in_attendance',
         encounter_id = v_encounter_id,
         arrived_at = coalesce(arrived_at, v_now),
         started_at = coalesce(started_at, v_now),
         last_status_at = v_now,
         stuck_detected_at = null,
         updated_at = v_now
   where tenant_id = v_tenant_id
     and id = v_queue_id;

  insert into public.attendance_status_history (
    tenant_id,
    queue_id,
    appointment_id,
    patient_id,
    from_status,
    to_status,
    appointment_status,
    actor_id,
    metadata
  )
  values (
    v_tenant_id,
    v_queue_id,
    v_appointment.id,
    v_appointment.patient_id,
    v_previous_queue_status,
    'in_attendance',
    'em_consulta',
    v_user_id,
    jsonb_build_object('encounterId', v_encounter_id)
  );

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
    v_appointment.patient_id,
    'atendimento_iniciado',
    'agenda',
    'recorded',
    'Atendimento iniciado',
    'Consulta iniciada pela fila de atendimento.',
    'Equipe clinica',
    'Em atendimento',
    'Abrir SOAP',
    '/clinic/patients/' || v_appointment.patient_id::text || '/encounter',
    v_now,
    jsonb_build_object('appointmentId', v_appointment.id, 'encounterId', v_encounter_id)
  )
  on conflict do nothing;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'attendance.encounter_started',
    'encounter',
    v_encounter_id::text,
    jsonb_build_object('appointmentId', v_appointment.id, 'queueId', v_queue_id)
  );

  return jsonb_build_object(
    'encounterId', v_encounter_id,
    'appointmentId', v_appointment.id,
    'queueId', v_queue_id,
    'patientId', v_appointment.patient_id,
    'href', '/clinic/patients/' || v_appointment.patient_id::text || '/encounter?appointmentId=' || v_appointment.id::text || '&encounterId=' || v_encounter_id::text
  );
end;
$$;

create or replace function public.complete_attendance_encounter(
  p_encounter_id uuid,
  p_follow_up_due_date date default null,
  p_follow_up_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_encounter public.encounters%rowtype;
  v_queue public.attendance_queue%rowtype;
  v_now timestamptz := now();
  v_return_id uuid;
  v_follow_up_reason text := coalesce(
    security.agenda_clean_reason(p_follow_up_reason, 240),
    'Retorno pos-atendimento'
  );
begin
  if not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  if not security.has_permission(v_tenant_id, 'encounters.write', false) then
    raise exception 'encounters_write_required' using errcode = '42501';
  end if;

  select *
    into v_encounter
  from public.encounters
  where tenant_id = v_tenant_id
    and id = p_encounter_id
  for update;

  if not found then
    raise exception 'encounter_not_found_or_forbidden' using errcode = '42501';
  end if;

  update public.encounters
     set status = 'closed',
         ended_at = coalesce(ended_at, v_now),
         finalized_by = coalesce(finalized_by, v_user_id),
         updated_at = v_now
   where tenant_id = v_tenant_id
     and id = p_encounter_id;

  if v_encounter.appointment_id is not null then
    update public.appointments
       set status = 'concluido',
           updated_at = v_now
     where tenant_id = v_tenant_id
       and id = v_encounter.appointment_id
       and status not in ('cancelado', 'falta');

    select *
      into v_queue
    from public.attendance_queue
    where tenant_id = v_tenant_id
      and appointment_id = v_encounter.appointment_id
    for update;

    if found then
      update public.attendance_queue
         set status = 'completed',
             encounter_id = p_encounter_id,
             completed_at = coalesce(completed_at, v_now),
             last_status_at = v_now,
             updated_at = v_now
       where tenant_id = v_tenant_id
         and id = v_queue.id;

      insert into public.attendance_status_history (
        tenant_id,
        queue_id,
        appointment_id,
        patient_id,
        from_status,
        to_status,
        appointment_status,
        actor_id,
        metadata
      )
      values (
        v_tenant_id,
        v_queue.id,
        v_encounter.appointment_id,
        v_encounter.patient_id,
        v_queue.status,
        'completed',
        'concluido',
        v_user_id,
        jsonb_build_object('encounterId', p_encounter_id)
      );
    end if;
  end if;

  if p_follow_up_due_date is not null then
    insert into public.patient_returns (
      tenant_id,
      patient_id,
      source_appointment_id,
      source_encounter_id,
      due_date,
      reason,
      next_action_at,
      created_by,
      metadata
    )
    values (
      v_tenant_id,
      v_encounter.patient_id,
      v_encounter.appointment_id,
      p_encounter_id,
      p_follow_up_due_date,
      v_follow_up_reason,
      p_follow_up_due_date::timestamp at time zone 'America/Sao_Paulo',
      v_user_id,
      jsonb_build_object('source', 'complete_attendance_encounter')
    )
    returning id into v_return_id;
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
    v_encounter.patient_id,
    'atendimento_concluido',
    'agenda',
    'recorded',
    'Atendimento concluido',
    'Consulta concluida e sincronizada com a fila de atendimento.',
    'Equipe clinica',
    'Concluido',
    'Abrir atendimento',
    '/clinic/patients/' || v_encounter.patient_id::text || '/encounter',
    v_now,
    jsonb_build_object(
      'appointmentId', v_encounter.appointment_id,
      'encounterId', p_encounter_id,
      'returnId', v_return_id
    )
  )
  on conflict do nothing;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'attendance.encounter_completed',
    'encounter',
    p_encounter_id::text,
    jsonb_build_object(
      'appointmentId', v_encounter.appointment_id,
      'returnCreated', v_return_id is not null
    )
  );

  return jsonb_build_object(
    'encounterId', p_encounter_id,
    'appointmentId', v_encounter.appointment_id,
    'patientId', v_encounter.patient_id,
    'returnId', v_return_id
  );
end;
$$;

create or replace function public.confirm_patient_return(
  p_return_id uuid,
  p_action text,
  p_appointment_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_return public.patient_returns%rowtype;
  v_action text := lower(coalesce(p_action, ''));
  v_status text;
  v_notes text := security.agenda_clean_reason(p_notes, 500);
  v_now timestamptz := now();
begin
  if not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  select *
    into v_return
  from public.patient_returns
  where tenant_id = v_tenant_id
    and id = p_return_id
  for update;

  if not found then
    raise exception 'return_not_found_or_forbidden' using errcode = '42501';
  end if;

  v_status := case v_action
    when 'contacted' then 'contatado'
    when 'scheduled' then 'agendado'
    when 'dismissed' then 'dispensado'
    when 'cancelled' then 'cancelado'
    else null
  end;

  if v_status is null then
    raise exception 'invalid_return_action' using errcode = '22023';
  end if;

  if v_status = 'agendado' then
    if p_appointment_id is null then
      raise exception 'target_appointment_required' using errcode = '22023';
    end if;

    perform 1
    from public.appointments a
    where a.tenant_id = v_tenant_id
      and a.id = p_appointment_id
      and a.patient_id = v_return.patient_id;

    if not found then
      raise exception 'target_appointment_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  update public.patient_returns
     set status = v_status,
         target_appointment_id = case when v_status = 'agendado' then p_appointment_id else target_appointment_id end,
         last_contact_at = case when v_status = 'contatado' then v_now else last_contact_at end,
         completed_by = case when v_status in ('agendado', 'dispensado', 'cancelado') then v_user_id else completed_by end,
         completed_at = case when v_status in ('agendado', 'dispensado', 'cancelado') then v_now else completed_at end,
         notes = coalesce(v_notes, notes),
         updated_at = v_now
   where tenant_id = v_tenant_id
     and id = p_return_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'agenda.return_action_recorded',
    'patient_return',
    p_return_id::text,
    jsonb_build_object(
      'action', v_action,
      'status', v_status,
      'targetAppointmentId', p_appointment_id,
      'notesProvided', v_notes is not null
    )
  );

  return jsonb_build_object(
    'id', p_return_id,
    'status', v_status,
    'targetAppointmentId', p_appointment_id
  );
end;
$$;

create or replace function public.detect_stuck_attendance(
  p_threshold_minutes integer default 45,
  p_execute boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_threshold integer := least(greatest(coalesce(p_threshold_minutes, 45), 10), 240);
  v_cutoff timestamptz := now() - (least(greatest(coalesce(p_threshold_minutes, 45), 10), 240) * interval '1 minute');
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if not security.has_permission(v_tenant_id, 'agenda.read', false) then
    raise exception 'agenda_read_required' using errcode = '42501';
  end if;

  if p_execute and not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'queueId', q.id,
    'appointmentId', q.appointment_id,
    'patientId', q.patient_id,
    'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
    'queueStatus', q.status,
    'minutesInStatus', greatest(0, floor(extract(epoch from (now() - q.last_status_at)) / 60))::integer,
    'scheduledAt', q.scheduled_at
  ) order by q.last_status_at asc), '[]'::jsonb),
  count(*)::integer
    into v_items, v_count
  from public.attendance_queue q
  left join public.patient_pii pp
    on pp.tenant_id = q.tenant_id
   and pp.patient_id = q.patient_id
  where q.tenant_id = v_tenant_id
    and q.status in ('scheduled', 'waiting', 'called', 'in_attendance', 'checkout')
    and q.last_status_at <= v_cutoff;

  if p_execute and v_count > 0 then
    insert into public.attendance_status_history (
      tenant_id,
      queue_id,
      appointment_id,
      patient_id,
      from_status,
      to_status,
      appointment_status,
      actor_id,
      metadata
    )
    select
      q.tenant_id,
      q.id,
      q.appointment_id,
      q.patient_id,
      q.status,
      'stuck',
      a.status,
      v_user_id,
      jsonb_build_object('thresholdMinutes', v_threshold, 'source', 'detect_stuck_attendance')
    from public.attendance_queue q
    join public.appointments a
      on a.tenant_id = q.tenant_id
     and a.id = q.appointment_id
    where q.tenant_id = v_tenant_id
      and q.status in ('scheduled', 'waiting', 'called', 'in_attendance', 'checkout')
      and q.last_status_at <= v_cutoff;

    update public.attendance_queue
       set status = 'stuck',
           stuck_detected_at = now(),
           updated_at = now()
     where tenant_id = v_tenant_id
       and status in ('scheduled', 'waiting', 'called', 'in_attendance', 'checkout')
       and last_status_at <= v_cutoff;

    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    values (
      v_tenant_id,
      v_user_id,
      'attendance.stuck_detected',
      'attendance_queue',
      null,
      jsonb_build_object('count', v_count, 'thresholdMinutes', v_threshold)
    );
  end if;

  return jsonb_build_object(
    'thresholdMinutes', v_threshold,
    'execute', p_execute,
    'count', v_count,
    'items', v_items
  );
end;
$$;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from public.roles r
join public.permissions p
  on p.tenant_id = r.tenant_id
 and p.code in ('agenda.read', 'agenda.write')
where r.name = 'physician'
on conflict (tenant_id, role_id, permission_id) do nothing;

revoke all on function security.resolve_agenda_tenant() from public;
revoke all on function security.agenda_clean_reason(text, integer) from public;
revoke all on function security.attendance_queue_status_for_appointment(text) from public;
revoke all on function security.assert_appointment_transition(text, text, text) from public;
revoke all on function public.sync_attendance_queue_from_appointment() from public;
revoke all on function public.get_agenda_day_snapshot(date) from public;
revoke all on function public.create_agenda_appointment(uuid, text, timestamptz, integer, text, text) from public;
revoke all on function public.update_agenda_appointment(uuid, uuid, text, timestamptz, integer, text, text) from public;
revoke all on function public.update_appointment_status(uuid, text, text) from public;
revoke all on function public.cancel_agenda_appointment(uuid, text) from public;
revoke all on function public.call_attendance_queue(uuid) from public;
revoke all on function public.start_attendance_encounter(uuid, uuid) from public;
revoke all on function public.complete_attendance_encounter(uuid, date, text) from public;
revoke all on function public.confirm_patient_return(uuid, text, uuid, text) from public;
revoke all on function public.detect_stuck_attendance(integer, boolean) from public;

grant execute on function security.resolve_agenda_tenant() to authenticated, service_role;
grant execute on function security.agenda_clean_reason(text, integer) to authenticated, service_role;
grant execute on function security.attendance_queue_status_for_appointment(text) to authenticated, service_role;
grant execute on function security.assert_appointment_transition(text, text, text) to authenticated, service_role;
grant execute on function public.get_agenda_day_snapshot(date) to authenticated, service_role;
grant execute on function public.create_agenda_appointment(uuid, text, timestamptz, integer, text, text) to authenticated, service_role;
grant execute on function public.update_agenda_appointment(uuid, uuid, text, timestamptz, integer, text, text) to authenticated, service_role;
grant execute on function public.update_appointment_status(uuid, text, text) to authenticated, service_role;
grant execute on function public.cancel_agenda_appointment(uuid, text) to authenticated, service_role;
grant execute on function public.call_attendance_queue(uuid) to authenticated, service_role;
grant execute on function public.start_attendance_encounter(uuid, uuid) to authenticated, service_role;
grant execute on function public.complete_attendance_encounter(uuid, date, text) to authenticated, service_role;
grant execute on function public.confirm_patient_return(uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.detect_stuck_attendance(integer, boolean) to authenticated, service_role;
