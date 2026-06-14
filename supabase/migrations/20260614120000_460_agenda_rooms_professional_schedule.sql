-- P1: structured agenda rooms and daily professional allocation.
-- Keeps appointments.location as a legacy display fallback while new flows persist
-- room/professional identifiers for audit, conflicts and queue synchronization.

alter table public.appointments
  add column if not exists room_id uuid,
  add column if not exists professional_profile_id uuid,
  add column if not exists unit_id uuid;

alter table public.attendance_queue
  add column if not exists room_id uuid,
  add column if not exists professional_profile_id uuid;

alter table public.blocked_slots
  add column if not exists room_id uuid;

create unique index if not exists idx_tenant_professionals_tenant_id_id_unique
  on public.tenant_professionals(tenant_id, id);

create table if not exists public.clinic_rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid,
  code text not null,
  name text not null,
  room_type text not null default 'consulting'
    check (room_type in ('consulting', 'triage', 'bioimpedance', 'procedure', 'admin', 'other')),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'maintenance')),
  capacity integer not null default 1 check (capacity > 0),
  equipment jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code),
  constraint clinic_rooms_code_not_blank check (length(btrim(code)) > 0),
  constraint clinic_rooms_name_not_blank check (length(btrim(name)) > 0),
  constraint clinic_rooms_unit_same_tenant
    foreign key (tenant_id, unit_id)
    references public.tenant_units(tenant_id, id)
);

create table if not exists public.professional_day_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid,
  professional_profile_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid,
  work_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'available'
    check (status in ('scheduled', 'available', 'blocked', 'cancelled')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint professional_day_allocations_time_order check (ends_at > starts_at),
  constraint professional_day_allocations_professional_same_tenant
    foreign key (tenant_id, professional_profile_id)
    references public.tenant_professionals(tenant_id, id),
  constraint professional_day_allocations_room_same_tenant
    foreign key (tenant_id, room_id)
    references public.clinic_rooms(tenant_id, id),
  constraint professional_day_allocations_unit_same_tenant
    foreign key (tenant_id, unit_id)
    references public.tenant_units(tenant_id, id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_room_same_tenant'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_room_same_tenant
      foreign key (tenant_id, room_id)
      references public.clinic_rooms(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_professional_profile_same_tenant'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_professional_profile_same_tenant
      foreign key (tenant_id, professional_profile_id)
      references public.tenant_professionals(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_unit_same_tenant'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_unit_same_tenant
      foreign key (tenant_id, unit_id)
      references public.tenant_units(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_queue_room_same_tenant'
      and conrelid = 'public.attendance_queue'::regclass
  ) then
    alter table public.attendance_queue
      add constraint attendance_queue_room_same_tenant
      foreign key (tenant_id, room_id)
      references public.clinic_rooms(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_queue_professional_profile_same_tenant'
      and conrelid = 'public.attendance_queue'::regclass
  ) then
    alter table public.attendance_queue
      add constraint attendance_queue_professional_profile_same_tenant
      foreign key (tenant_id, professional_profile_id)
      references public.tenant_professionals(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'blocked_slots_room_same_tenant'
      and conrelid = 'public.blocked_slots'::regclass
  ) then
    alter table public.blocked_slots
      add constraint blocked_slots_room_same_tenant
      foreign key (tenant_id, room_id)
      references public.clinic_rooms(tenant_id, id);
  end if;
end;
$$;

select security.touch_updated_at('public.clinic_rooms');
select security.touch_updated_at('public.professional_day_allocations');

create index if not exists idx_clinic_rooms_tenant_status_unit_name
  on public.clinic_rooms(tenant_id, status, unit_id, name);

create index if not exists idx_professional_day_allocations_tenant_date_status
  on public.professional_day_allocations(tenant_id, work_date, status);

create index if not exists idx_professional_day_allocations_professional_range
  on public.professional_day_allocations(tenant_id, professional_profile_id, starts_at, ends_at)
  where status <> 'cancelled';

create index if not exists idx_professional_day_allocations_room_range
  on public.professional_day_allocations(tenant_id, room_id, starts_at, ends_at)
  where room_id is not null and status <> 'cancelled';

create index if not exists idx_appointments_tenant_room_schedule
  on public.appointments(tenant_id, room_id, scheduled_at)
  where room_id is not null and status not in ('cancelado', 'falta');

create index if not exists idx_appointments_tenant_professional_schedule
  on public.appointments(tenant_id, professional_profile_id, scheduled_at)
  where professional_profile_id is not null and status not in ('cancelado', 'falta');

create index if not exists idx_attendance_queue_tenant_room_status
  on public.attendance_queue(tenant_id, room_id, status)
  where room_id is not null;

alter table public.clinic_rooms enable row level security;
alter table public.professional_day_allocations enable row level security;

drop policy if exists clinic_rooms_select_by_agenda_or_settings_read on public.clinic_rooms;
create policy clinic_rooms_select_by_agenda_or_settings_read
on public.clinic_rooms for select
to authenticated
using (
  security.has_permission(tenant_id, 'agenda.read', true)
  or security.has_permission(tenant_id, 'settings.read', true)
);

drop policy if exists clinic_rooms_write_by_agenda_or_settings_write on public.clinic_rooms;
create policy clinic_rooms_write_by_agenda_or_settings_write
on public.clinic_rooms for all
to authenticated
using (
  security.has_permission(tenant_id, 'agenda.write', true)
  or security.has_permission(tenant_id, 'settings.write', true)
)
with check (
  security.has_permission(tenant_id, 'agenda.write', true)
  or security.has_permission(tenant_id, 'settings.write', true)
);

drop policy if exists professional_day_allocations_select_by_agenda_or_settings_read on public.professional_day_allocations;
create policy professional_day_allocations_select_by_agenda_or_settings_read
on public.professional_day_allocations for select
to authenticated
using (
  security.has_permission(tenant_id, 'agenda.read', true)
  or security.has_permission(tenant_id, 'settings.read', true)
);

drop policy if exists professional_day_allocations_write_by_agenda_or_settings_write on public.professional_day_allocations;
create policy professional_day_allocations_write_by_agenda_or_settings_write
on public.professional_day_allocations for all
to authenticated
using (
  security.has_permission(tenant_id, 'agenda.write', true)
  or security.has_permission(tenant_id, 'settings.write', true)
)
with check (
  security.has_permission(tenant_id, 'agenda.write', true)
  or security.has_permission(tenant_id, 'settings.write', true)
);

grant select, insert, update on public.clinic_rooms to authenticated, service_role;
grant select, insert, update on public.professional_day_allocations to authenticated, service_role;

create or replace function public.get_agenda_schedule_options(
  p_target_date date default current_date,
  p_unit_id uuid default null
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
  v_units jsonb := '[]'::jsonb;
  v_rooms jsonb := '[]'::jsonb;
  v_professionals jsonb := '[]'::jsonb;
  v_allocations jsonb := '[]'::jsonb;
begin
  if not (
    security.has_permission(v_tenant_id, 'agenda.read', false)
    or security.has_permission(v_tenant_id, 'settings.read', false)
  ) then
    raise exception 'agenda_read_required' using errcode = '42501';
  end if;

  select coalesce(nullif(t.settings #>> '{profile,timezone}', ''), 'America/Sao_Paulo')
    into v_timezone
  from public.tenants t
  where t.id = v_tenant_id;

  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    v_timezone := 'America/Sao_Paulo';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'code', u.code,
    'name', u.name,
    'status', u.status
  ) order by u.name), '[]'::jsonb)
    into v_units
  from public.tenant_units u
  where u.tenant_id = v_tenant_id
    and (p_unit_id is null or u.id = p_unit_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'unitId', r.unit_id,
    'code', r.code,
    'name', r.name,
    'roomType', r.room_type,
    'status', r.status,
    'capacity', r.capacity,
    'equipment', r.equipment,
    'unitName', u.name
  ) order by r.status, r.name), '[]'::jsonb)
    into v_rooms
  from public.clinic_rooms r
  left join public.tenant_units u
    on u.tenant_id = r.tenant_id
   and u.id = r.unit_id
  where r.tenant_id = v_tenant_id
    and (p_unit_id is null or r.unit_id = p_unit_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', tp.id,
    'userId', tp.user_id,
    'unitId', tp.unit_id,
    'name', coalesce(p.full_name, p.email, 'Profissional sem nome'),
    'email', p.email,
    'professionalType', tp.professional_type,
    'specialty', tp.specialty,
    'licenseNumber', tp.license_number,
    'licenseState', tp.license_state,
    'isActive', tp.is_active,
    'unitName', u.name
  ) order by coalesce(p.full_name, p.email, 'Profissional sem nome')), '[]'::jsonb)
    into v_professionals
  from public.tenant_professionals tp
  join public.tenant_memberships tm
    on tm.tenant_id = tp.tenant_id
   and tm.id = tp.membership_id
  join public.profiles p
    on p.id = tp.user_id
  left join public.tenant_units u
    on u.tenant_id = tp.tenant_id
   and u.id = tp.unit_id
  where tp.tenant_id = v_tenant_id
    and tp.is_active = true
    and tm.status in ('active', 'invited')
    and (p_unit_id is null or tp.unit_id = p_unit_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'unitId', a.unit_id,
    'workDate', a.work_date,
    'startsAt', a.starts_at,
    'endsAt', a.ends_at,
    'startTime', to_char(a.starts_at at time zone v_timezone, 'HH24:MI'),
    'endTime', to_char(a.ends_at at time zone v_timezone, 'HH24:MI'),
    'status', a.status,
    'notes', a.notes,
    'professionalProfileId', a.professional_profile_id,
    'professionalUserId', a.user_id,
    'professionalName', coalesce(p.full_name, p.email, 'Profissional sem nome'),
    'professionalType', tp.professional_type,
    'professionalSpecialty', tp.specialty,
    'roomId', a.room_id,
    'roomName', r.name,
    'roomCode', r.code,
    'roomType', r.room_type,
    'unitName', u.name
  ) order by a.starts_at, coalesce(p.full_name, p.email, 'Profissional sem nome')), '[]'::jsonb)
    into v_allocations
  from public.professional_day_allocations a
  join public.tenant_professionals tp
    on tp.tenant_id = a.tenant_id
   and tp.id = a.professional_profile_id
  join public.profiles p
    on p.id = a.user_id
  left join public.clinic_rooms r
    on r.tenant_id = a.tenant_id
   and r.id = a.room_id
  left join public.tenant_units u
    on u.tenant_id = a.tenant_id
   and u.id = a.unit_id
  where a.tenant_id = v_tenant_id
    and a.work_date = v_date
    and a.status <> 'cancelled'
    and (p_unit_id is null or a.unit_id = p_unit_id);

  return jsonb_build_object(
    'date', v_date,
    'timezone', v_timezone,
    'units', v_units,
    'rooms', v_rooms,
    'professionals', v_professionals,
    'allocations', v_allocations
  );
end;
$$;

create or replace function public.upsert_clinic_room(
  p_room_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_existing public.clinic_rooms%rowtype;
  v_room public.clinic_rooms%rowtype;
  v_unit_id uuid := nullif(p_payload ->> 'unitId', '')::uuid;
  v_code text;
  v_name text;
  v_type text;
  v_status text;
  v_capacity integer;
  v_equipment jsonb;
  v_metadata jsonb;
begin
  if not (
    security.has_permission(v_tenant_id, 'agenda.write', false)
    or security.has_permission(v_tenant_id, 'settings.write', false)
  ) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  if p_room_id is not null then
    select *
      into v_existing
    from public.clinic_rooms
    where tenant_id = v_tenant_id
      and id = p_room_id
    for update;

    if not found then
      raise exception 'room_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  v_code := upper(nullif(btrim(coalesce(p_payload ->> 'code', v_existing.code)), ''));
  v_name := nullif(btrim(coalesce(p_payload ->> 'name', v_existing.name)), '');
  v_type := coalesce(nullif(lower(btrim(coalesce(p_payload ->> 'roomType', v_existing.room_type))), ''), 'consulting');
  v_status := coalesce(nullif(lower(btrim(coalesce(p_payload ->> 'status', v_existing.status))), ''), 'active');
  v_capacity := greatest(
    coalesce(
      case
        when coalesce(p_payload ->> 'capacity', '') ~ '^[0-9]+$'
          then (p_payload ->> 'capacity')::integer
        else v_existing.capacity
      end,
      1
    ),
    1
  );
  v_equipment := case
    when jsonb_typeof(p_payload -> 'equipment') = 'array' then p_payload -> 'equipment'
    else coalesce(v_existing.equipment, '[]'::jsonb)
  end;
  v_metadata := case
    when jsonb_typeof(p_payload -> 'metadata') = 'object' then p_payload -> 'metadata'
    else coalesce(v_existing.metadata, '{}'::jsonb)
  end;
  v_unit_id := coalesce(v_unit_id, v_existing.unit_id);

  if v_code is null or v_name is null then
    raise exception 'room_code_and_name_required' using errcode = '22023';
  end if;

  if v_type not in ('consulting', 'triage', 'bioimpedance', 'procedure', 'admin', 'other') then
    raise exception 'room_type_not_allowed' using errcode = '22023';
  end if;

  if v_status not in ('active', 'inactive', 'maintenance') then
    raise exception 'room_status_not_allowed' using errcode = '22023';
  end if;

  if v_unit_id is not null and not exists (
    select 1
    from public.tenant_units u
    where u.tenant_id = v_tenant_id
      and u.id = v_unit_id
  ) then
    raise exception 'unit_not_found_or_forbidden' using errcode = '42501';
  end if;

  if p_room_id is null then
    insert into public.clinic_rooms (
      tenant_id,
      unit_id,
      code,
      name,
      room_type,
      status,
      capacity,
      equipment,
      metadata,
      created_by
    )
    values (
      v_tenant_id,
      v_unit_id,
      v_code,
      v_name,
      v_type,
      v_status,
      v_capacity,
      v_equipment,
      v_metadata,
      v_user_id
    )
    returning *
    into v_room;
  else
    update public.clinic_rooms
       set unit_id = v_unit_id,
           code = v_code,
           name = v_name,
           room_type = v_type,
           status = v_status,
           capacity = v_capacity,
           equipment = v_equipment,
           metadata = v_metadata,
           updated_at = now()
     where tenant_id = v_tenant_id
       and id = p_room_id
     returning *
     into v_room;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'agenda.room_upserted',
    'clinic_room',
    v_room.id::text,
    jsonb_build_object(
      'code', v_room.code,
      'roomType', v_room.room_type,
      'status', v_room.status,
      'unitId', v_room.unit_id
    )
  );

  return jsonb_build_object(
    'id', v_room.id,
    'unitId', v_room.unit_id,
    'code', v_room.code,
    'name', v_room.name,
    'roomType', v_room.room_type,
    'status', v_room.status,
    'capacity', v_room.capacity,
    'equipment', v_room.equipment
  );
end;
$$;

create or replace function public.upsert_professional_day_allocation(
  p_allocation_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_timezone text := 'America/Sao_Paulo';
  v_existing public.professional_day_allocations%rowtype;
  v_allocation public.professional_day_allocations%rowtype;
  v_professional_id uuid := nullif(p_payload ->> 'professionalProfileId', '')::uuid;
  v_room_id uuid := nullif(p_payload ->> 'roomId', '')::uuid;
  v_unit_id uuid := nullif(p_payload ->> 'unitId', '')::uuid;
  v_professional_user_id uuid;
  v_professional_unit_id uuid;
  v_room_unit_id uuid;
  v_work_date date := nullif(p_payload ->> 'workDate', '')::date;
  v_start_time text := nullif(btrim(p_payload ->> 'startTime'), '');
  v_end_time text := nullif(btrim(p_payload ->> 'endTime'), '');
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_status text;
  v_notes text;
  v_metadata jsonb;
begin
  if not (
    security.has_permission(v_tenant_id, 'agenda.write', false)
    or security.has_permission(v_tenant_id, 'settings.write', false)
  ) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  select coalesce(nullif(t.settings #>> '{profile,timezone}', ''), 'America/Sao_Paulo')
    into v_timezone
  from public.tenants t
  where t.id = v_tenant_id;

  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    v_timezone := 'America/Sao_Paulo';
  end if;

  if p_allocation_id is not null then
    select *
      into v_existing
    from public.professional_day_allocations
    where tenant_id = v_tenant_id
      and id = p_allocation_id
    for update;

    if not found then
      raise exception 'allocation_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  v_professional_id := coalesce(v_professional_id, v_existing.professional_profile_id);
  v_room_id := coalesce(v_room_id, v_existing.room_id);
  v_work_date := coalesce(v_work_date, v_existing.work_date);
  v_status := coalesce(nullif(lower(btrim(coalesce(p_payload ->> 'status', v_existing.status))), ''), 'available');
  v_notes := case
    when p_payload ? 'notes' then security.agenda_clean_reason(p_payload ->> 'notes', 1000)
    else v_existing.notes
  end;
  v_metadata := case
    when jsonb_typeof(p_payload -> 'metadata') = 'object' then p_payload -> 'metadata'
    else coalesce(v_existing.metadata, '{}'::jsonb)
  end;

  if v_professional_id is null or v_work_date is null then
    raise exception 'professional_and_work_date_required' using errcode = '22023';
  end if;

  if v_status not in ('scheduled', 'available', 'blocked', 'cancelled') then
    raise exception 'allocation_status_not_allowed' using errcode = '22023';
  end if;

  select tp.user_id, tp.unit_id
    into v_professional_user_id, v_professional_unit_id
  from public.tenant_professionals tp
  join public.tenant_memberships tm
    on tm.tenant_id = tp.tenant_id
   and tm.id = tp.membership_id
  where tp.tenant_id = v_tenant_id
    and tp.id = v_professional_id
    and tp.is_active = true
    and tm.status in ('active', 'invited');

  if not found then
    raise exception 'professional_not_found_or_forbidden' using errcode = '42501';
  end if;

  if v_room_id is not null then
    select r.unit_id
      into v_room_unit_id
    from public.clinic_rooms r
    where r.tenant_id = v_tenant_id
      and r.id = v_room_id
      and r.status = 'active';

    if not found then
      raise exception 'room_not_found_or_unavailable' using errcode = '42501';
    end if;
  end if;

  v_unit_id := coalesce(v_unit_id, v_existing.unit_id, v_room_unit_id, v_professional_unit_id);

  if v_room_unit_id is not null and v_professional_unit_id is not null and v_room_unit_id <> v_professional_unit_id then
    raise exception 'room_professional_unit_mismatch' using errcode = '23514';
  end if;

  if v_unit_id is not null and not exists (
    select 1
    from public.tenant_units u
    where u.tenant_id = v_tenant_id
      and u.id = v_unit_id
  ) then
    raise exception 'unit_not_found_or_forbidden' using errcode = '42501';
  end if;

  v_starts_at := coalesce(
    nullif(p_payload ->> 'startsAt', '')::timestamptz,
    case
      when v_start_time is not null then (v_work_date::text || ' ' || v_start_time)::timestamp at time zone v_timezone
      else v_existing.starts_at
    end
  );
  v_ends_at := coalesce(
    nullif(p_payload ->> 'endsAt', '')::timestamptz,
    case
      when v_end_time is not null then (v_work_date::text || ' ' || v_end_time)::timestamp at time zone v_timezone
      else v_existing.ends_at
    end
  );

  if v_starts_at is null or v_ends_at is null or v_ends_at <= v_starts_at then
    raise exception 'invalid_allocation_time_range' using errcode = '22023';
  end if;

  if v_status <> 'cancelled' and exists (
    select 1
    from public.professional_day_allocations a
    where a.tenant_id = v_tenant_id
      and a.id <> coalesce(p_allocation_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and a.status <> 'cancelled'
      and a.professional_profile_id = v_professional_id
      and a.starts_at < v_ends_at
      and a.ends_at > v_starts_at
  ) then
    raise exception 'professional_allocation_conflict' using errcode = '23505';
  end if;

  if v_status <> 'cancelled' and v_room_id is not null and exists (
    select 1
    from public.professional_day_allocations a
    where a.tenant_id = v_tenant_id
      and a.id <> coalesce(p_allocation_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and a.status <> 'cancelled'
      and a.room_id = v_room_id
      and a.starts_at < v_ends_at
      and a.ends_at > v_starts_at
  ) then
    raise exception 'room_allocation_conflict' using errcode = '23505';
  end if;

  if p_allocation_id is null then
    insert into public.professional_day_allocations (
      tenant_id,
      unit_id,
      professional_profile_id,
      user_id,
      room_id,
      work_date,
      starts_at,
      ends_at,
      status,
      notes,
      metadata,
      created_by
    )
    values (
      v_tenant_id,
      v_unit_id,
      v_professional_id,
      v_professional_user_id,
      v_room_id,
      v_work_date,
      v_starts_at,
      v_ends_at,
      v_status,
      v_notes,
      v_metadata,
      v_user_id
    )
    returning *
    into v_allocation;
  else
    update public.professional_day_allocations
       set unit_id = v_unit_id,
           professional_profile_id = v_professional_id,
           user_id = v_professional_user_id,
           room_id = v_room_id,
           work_date = v_work_date,
           starts_at = v_starts_at,
           ends_at = v_ends_at,
           status = v_status,
           notes = v_notes,
           metadata = v_metadata,
           updated_at = now()
     where tenant_id = v_tenant_id
       and id = p_allocation_id
     returning *
     into v_allocation;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'agenda.professional_day_allocation_upserted',
    'professional_day_allocation',
    v_allocation.id::text,
    jsonb_build_object(
      'professionalProfileId', v_allocation.professional_profile_id,
      'roomId', v_allocation.room_id,
      'workDate', v_allocation.work_date,
      'startsAt', v_allocation.starts_at,
      'endsAt', v_allocation.ends_at,
      'status', v_allocation.status
    )
  );

  return jsonb_build_object(
    'id', v_allocation.id,
    'unitId', v_allocation.unit_id,
    'professionalProfileId', v_allocation.professional_profile_id,
    'professionalUserId', v_allocation.user_id,
    'roomId', v_allocation.room_id,
    'workDate', v_allocation.work_date,
    'startsAt', v_allocation.starts_at,
    'endsAt', v_allocation.ends_at,
    'status', v_allocation.status,
    'notes', v_allocation.notes
  );
end;
$$;

create or replace function public.cancel_professional_day_allocation(
  p_allocation_id uuid,
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
  v_allocation public.professional_day_allocations%rowtype;
begin
  if not (
    security.has_permission(v_tenant_id, 'agenda.write', false)
    or security.has_permission(v_tenant_id, 'settings.write', false)
  ) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  update public.professional_day_allocations
     set status = 'cancelled',
         notes = coalesce(security.agenda_clean_reason(p_reason, 1000), notes),
         updated_at = now()
   where tenant_id = v_tenant_id
     and id = p_allocation_id
  returning *
  into v_allocation;

  if not found then
    raise exception 'allocation_not_found_or_forbidden' using errcode = '42501';
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'agenda.professional_day_allocation_cancelled',
    'professional_day_allocation',
    v_allocation.id::text,
    jsonb_build_object('reason', security.agenda_clean_reason(p_reason, 1000))
  );

  return jsonb_build_object('id', v_allocation.id, 'status', v_allocation.status);
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
  v_room_name text;
begin
  v_queue_status := security.attendance_queue_status_for_appointment(new.status);

  if v_queue_status is null then
    return new;
  end if;

  if new.room_id is not null then
    select r.name
      into v_room_name
    from public.clinic_rooms r
    where r.tenant_id = new.tenant_id
      and r.id = new.room_id;
  end if;

  insert into public.attendance_queue (
    tenant_id,
    patient_id,
    appointment_id,
    status,
    scheduled_at,
    arrived_at,
    assigned_to,
    professional_profile_id,
    room_id,
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
    new.professional_profile_id,
    new.room_id,
    coalesce(v_room_name, new.location),
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
    professional_profile_id = excluded.professional_profile_id,
    room_id = excluded.room_id,
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
after insert or update of status, scheduled_at, arrived_at, practitioner_id, professional_profile_id, room_id, location
on public.appointments
for each row
execute function public.sync_attendance_queue_from_appointment();

update public.attendance_queue q
   set assigned_to = a.practitioner_id,
       professional_profile_id = a.professional_profile_id,
       room_id = a.room_id,
       room = coalesce(r.name, a.location, q.room),
       updated_at = now()
from public.appointments a
left join public.clinic_rooms r
  on r.tenant_id = a.tenant_id
 and r.id = a.room_id
where q.tenant_id = a.tenant_id
  and q.appointment_id = a.id;

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
    'professionalProfileId', a.professional_profile_id,
    'professionalUserId', coalesce(tp.user_id, a.practitioner_id),
    'professionalName', coalesce(pr.full_name, legacy_pr.full_name, 'Equipe clinica'),
    'professionalRole', coalesce(tp.professional_type, 'Profissional'),
    'roomId', a.room_id,
    'roomName', coalesce(r.name, a.location),
    'roomCode', r.code,
    'unitId', a.unit_id,
    'unitName', u.name,
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
  left join public.tenant_professionals tp
    on tp.tenant_id = a.tenant_id
   and tp.id = a.professional_profile_id
  left join public.profiles pr
    on pr.id = tp.user_id
  left join public.profiles legacy_pr
    on legacy_pr.id = a.practitioner_id
  left join public.clinic_rooms r
    on r.tenant_id = a.tenant_id
   and r.id = a.room_id
  left join public.tenant_units u
    on u.tenant_id = a.tenant_id
   and u.id = a.unit_id
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
    'professionalProfileId', coalesce(q.professional_profile_id, a.professional_profile_id),
    'professionalUserId', coalesce(q.assigned_to, qtp.user_id, atp.user_id, a.practitioner_id),
    'professionalName', coalesce(qpr.full_name, qtp_profile.full_name, atp_profile.full_name, legacy_pr.full_name, 'Equipe clinica'),
    'roomId', coalesce(q.room_id, a.room_id),
    'room', coalesce(qr.name, ar.name, q.room, a.location),
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
  left join public.tenant_professionals qtp
    on qtp.tenant_id = q.tenant_id
   and qtp.id = q.professional_profile_id
  left join public.profiles qtp_profile
    on qtp_profile.id = qtp.user_id
  left join public.tenant_professionals atp
    on atp.tenant_id = a.tenant_id
   and atp.id = a.professional_profile_id
  left join public.profiles atp_profile
    on atp_profile.id = atp.user_id
  left join public.profiles qpr
    on qpr.id = q.assigned_to
  left join public.profiles legacy_pr
    on legacy_pr.id = a.practitioner_id
  left join public.clinic_rooms qr
    on qr.tenant_id = q.tenant_id
   and qr.id = q.room_id
  left join public.clinic_rooms ar
    on ar.tenant_id = a.tenant_id
   and ar.id = a.room_id
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
    'location', coalesce(br.name, bs.location),
    'roomId', bs.room_id,
    'roomName', br.name
  ) order by bs.start_at asc), '[]'::jsonb)
    into v_blocked_slots
  from public.blocked_slots bs
  left join public.clinic_rooms br
    on br.tenant_id = bs.tenant_id
   and br.id = bs.room_id
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

drop function if exists public.create_agenda_appointment(uuid, text, timestamptz, integer, text, text);
drop function if exists public.update_agenda_appointment(uuid, uuid, text, timestamptz, integer, text, text);

create or replace function public.create_agenda_appointment(
  p_patient_id uuid,
  p_type text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 30,
  p_location text default null,
  p_notes text default null,
  p_professional_profile_id uuid default null,
  p_room_id uuid default null,
  p_unit_id uuid default null
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
  v_timezone text := 'America/Sao_Paulo';
  v_work_date date;
  v_location text := security.agenda_clean_reason(p_location, 120);
  v_room_name text;
  v_room_unit_id uuid;
  v_professional_unit_id uuid;
  v_practitioner_id uuid;
  v_unit_id uuid := p_unit_id;
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

  select coalesce(nullif(t.settings #>> '{profile,timezone}', ''), 'America/Sao_Paulo')
    into v_timezone
  from public.tenants t
  where t.id = v_tenant_id;

  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    v_timezone := 'America/Sao_Paulo';
  end if;

  v_work_date := (v_start at time zone v_timezone)::date;

  if p_room_id is not null then
    select r.name, r.unit_id
      into v_room_name, v_room_unit_id
    from public.clinic_rooms r
    where r.tenant_id = v_tenant_id
      and r.id = p_room_id
      and r.status = 'active';

    if not found then
      raise exception 'room_not_found_or_unavailable' using errcode = '42501';
    end if;

    v_location := coalesce(v_room_name, v_location);
  end if;

  if p_professional_profile_id is not null then
    select tp.user_id, tp.unit_id
      into v_practitioner_id, v_professional_unit_id
    from public.tenant_professionals tp
    join public.tenant_memberships tm
      on tm.tenant_id = tp.tenant_id
     and tm.id = tp.membership_id
    where tp.tenant_id = v_tenant_id
      and tp.id = p_professional_profile_id
      and tp.is_active = true
      and tm.status in ('active', 'invited');

    if not found then
      raise exception 'professional_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  if v_room_unit_id is not null and v_professional_unit_id is not null and v_room_unit_id <> v_professional_unit_id then
    raise exception 'room_professional_unit_mismatch' using errcode = '23514';
  end if;

  v_unit_id := coalesce(v_unit_id, v_room_unit_id, v_professional_unit_id);

  if p_unit_id is not null and (
    (v_room_unit_id is not null and p_unit_id <> v_room_unit_id)
    or (v_professional_unit_id is not null and p_unit_id <> v_professional_unit_id)
  ) then
    raise exception 'unit_mismatch' using errcode = '23514';
  end if;

  if v_unit_id is not null and not exists (
    select 1
    from public.tenant_units u
    where u.tenant_id = v_tenant_id
      and u.id = v_unit_id
  ) then
    raise exception 'unit_not_found_or_forbidden' using errcode = '42501';
  end if;

  if p_professional_profile_id is not null and not exists (
    select 1
    from public.professional_day_allocations a
    where a.tenant_id = v_tenant_id
      and a.professional_profile_id = p_professional_profile_id
      and a.work_date = v_work_date
      and a.status in ('available', 'scheduled')
      and a.starts_at <= v_start
      and a.ends_at >= v_end
      and (p_room_id is null or a.room_id = p_room_id)
  ) then
    raise exception 'professional_not_allocated_for_time' using errcode = '23514';
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
        or (p_room_id is not null and a.room_id = p_room_id)
        or (p_professional_profile_id is not null and a.professional_profile_id = p_professional_profile_id)
        or (v_practitioner_id is not null and a.practitioner_id = v_practitioner_id)
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
        (bs.room_id is null and bs.practitioner_id is null and bs.location is null)
        or (p_room_id is not null and bs.room_id = p_room_id)
        or (v_practitioner_id is not null and bs.practitioner_id = v_practitioner_id)
        or (
          v_location is not null
          and lower(coalesce(bs.location, '')) = lower(v_location)
        )
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
    practitioner_id,
    professional_profile_id,
    room_id,
    unit_id,
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
    v_practitioner_id,
    p_professional_profile_id,
    p_room_id,
    v_unit_id,
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
      'type', coalesce(nullif(p_type, ''), 'consulta_medica'),
      'professionalProfileId', p_professional_profile_id,
      'roomId', p_room_id,
      'unitId', v_unit_id
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
  p_notes text default null,
  p_professional_profile_id uuid default null,
  p_room_id uuid default null,
  p_unit_id uuid default null
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
  v_timezone text := 'America/Sao_Paulo';
  v_work_date date;
  v_location text := security.agenda_clean_reason(p_location, 120);
  v_room_name text;
  v_room_unit_id uuid;
  v_professional_unit_id uuid;
  v_practitioner_id uuid;
  v_unit_id uuid := p_unit_id;
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

  select coalesce(nullif(t.settings #>> '{profile,timezone}', ''), 'America/Sao_Paulo')
    into v_timezone
  from public.tenants t
  where t.id = v_tenant_id;

  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    v_timezone := 'America/Sao_Paulo';
  end if;

  v_work_date := (v_start at time zone v_timezone)::date;

  if p_room_id is not null then
    select r.name, r.unit_id
      into v_room_name, v_room_unit_id
    from public.clinic_rooms r
    where r.tenant_id = v_tenant_id
      and r.id = p_room_id
      and r.status = 'active';

    if not found then
      raise exception 'room_not_found_or_unavailable' using errcode = '42501';
    end if;

    v_location := coalesce(v_room_name, v_location);
  end if;

  if p_professional_profile_id is not null then
    select tp.user_id, tp.unit_id
      into v_practitioner_id, v_professional_unit_id
    from public.tenant_professionals tp
    join public.tenant_memberships tm
      on tm.tenant_id = tp.tenant_id
     and tm.id = tp.membership_id
    where tp.tenant_id = v_tenant_id
      and tp.id = p_professional_profile_id
      and tp.is_active = true
      and tm.status in ('active', 'invited');

    if not found then
      raise exception 'professional_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  if v_room_unit_id is not null and v_professional_unit_id is not null and v_room_unit_id <> v_professional_unit_id then
    raise exception 'room_professional_unit_mismatch' using errcode = '23514';
  end if;

  v_unit_id := coalesce(v_unit_id, v_room_unit_id, v_professional_unit_id);

  if p_unit_id is not null and (
    (v_room_unit_id is not null and p_unit_id <> v_room_unit_id)
    or (v_professional_unit_id is not null and p_unit_id <> v_professional_unit_id)
  ) then
    raise exception 'unit_mismatch' using errcode = '23514';
  end if;

  if v_unit_id is not null and not exists (
    select 1
    from public.tenant_units u
    where u.tenant_id = v_tenant_id
      and u.id = v_unit_id
  ) then
    raise exception 'unit_not_found_or_forbidden' using errcode = '42501';
  end if;

  if p_professional_profile_id is not null and not exists (
    select 1
    from public.professional_day_allocations a
    where a.tenant_id = v_tenant_id
      and a.professional_profile_id = p_professional_profile_id
      and a.work_date = v_work_date
      and a.status in ('available', 'scheduled')
      and a.starts_at <= v_start
      and a.ends_at >= v_end
      and (p_room_id is null or a.room_id = p_room_id)
  ) then
    raise exception 'professional_not_allocated_for_time' using errcode = '23514';
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
        or (p_room_id is not null and a.room_id = p_room_id)
        or (p_professional_profile_id is not null and a.professional_profile_id = p_professional_profile_id)
        or (v_practitioner_id is not null and a.practitioner_id = v_practitioner_id)
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
        (bs.room_id is null and bs.practitioner_id is null and bs.location is null)
        or (p_room_id is not null and bs.room_id = p_room_id)
        or (v_practitioner_id is not null and bs.practitioner_id = v_practitioner_id)
        or (
          v_location is not null
          and lower(coalesce(bs.location, '')) = lower(v_location)
        )
      )
  ) then
    raise exception 'blocked_slot_conflict' using errcode = '23505';
  end if;

  update public.appointments
     set patient_id = p_patient_id,
         type = coalesce(nullif(p_type, ''), 'consulta_medica'),
         scheduled_at = p_scheduled_at,
         duration_minutes = v_duration,
         practitioner_id = v_practitioner_id,
         professional_profile_id = p_professional_profile_id,
         room_id = p_room_id,
         unit_id = v_unit_id,
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
      'type', coalesce(nullif(p_type, ''), 'consulta_medica'),
      'professionalProfileId', p_professional_profile_id,
      'roomId', p_room_id,
      'unitId', v_unit_id
    )
  );

  return jsonb_build_object('id', p_appointment_id);
end;
$$;

revoke all on function public.get_agenda_schedule_options(date, uuid) from public;
revoke all on function public.upsert_clinic_room(uuid, jsonb) from public;
revoke all on function public.upsert_professional_day_allocation(uuid, jsonb) from public;
revoke all on function public.cancel_professional_day_allocation(uuid, text) from public;
revoke all on function public.sync_attendance_queue_from_appointment() from public;
revoke all on function public.get_agenda_day_snapshot(date) from public;
revoke all on function public.create_agenda_appointment(uuid, text, timestamptz, integer, text, text, uuid, uuid, uuid) from public;
revoke all on function public.update_agenda_appointment(uuid, uuid, text, timestamptz, integer, text, text, uuid, uuid, uuid) from public;

grant execute on function public.get_agenda_schedule_options(date, uuid) to authenticated, service_role;
grant execute on function public.upsert_clinic_room(uuid, jsonb) to authenticated, service_role;
grant execute on function public.upsert_professional_day_allocation(uuid, jsonb) to authenticated, service_role;
grant execute on function public.cancel_professional_day_allocation(uuid, text) to authenticated, service_role;
grant execute on function public.sync_attendance_queue_from_appointment() to authenticated, service_role;
grant execute on function public.get_agenda_day_snapshot(date) to authenticated, service_role;
grant execute on function public.create_agenda_appointment(uuid, text, timestamptz, integer, text, text, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.update_agenda_appointment(uuid, uuid, text, timestamptz, integer, text, text, uuid, uuid, uuid) to authenticated, service_role;
