-- P1: operational triage, measurements and bioimpedance outside SOAP.
-- Adds structured origin links for clinical records created from agenda/queue
-- and records auditable start/complete timestamps for operational stages.

alter table public.measurements
  add column if not exists appointment_id uuid,
  add column if not exists queue_id uuid,
  add column if not exists source_module text not null default 'encounter',
  add column if not exists room_id uuid,
  add column if not exists professional_profile_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.bioimpedance_results
  add column if not exists appointment_id uuid,
  add column if not exists queue_id uuid,
  add column if not exists source_module text not null default 'encounter',
  add column if not exists room_id uuid,
  add column if not exists professional_profile_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'measurements_source_module_check'
      and conrelid = 'public.measurements'::regclass
  ) then
    alter table public.measurements
      add constraint measurements_source_module_check
      check (source_module in ('encounter', 'patient360', 'agenda', 'attendance_queue', 'import', 'system'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bioimpedance_results_source_module_check'
      and conrelid = 'public.bioimpedance_results'::regclass
  ) then
    alter table public.bioimpedance_results
      add constraint bioimpedance_results_source_module_check
      check (source_module in ('encounter', 'patient360', 'agenda', 'attendance_queue', 'import', 'system'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'measurements_appointment_same_tenant'
      and conrelid = 'public.measurements'::regclass
  ) then
    alter table public.measurements
      add constraint measurements_appointment_same_tenant
      foreign key (tenant_id, appointment_id)
      references public.appointments(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'measurements_queue_same_tenant'
      and conrelid = 'public.measurements'::regclass
  ) then
    alter table public.measurements
      add constraint measurements_queue_same_tenant
      foreign key (tenant_id, queue_id)
      references public.attendance_queue(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'measurements_room_same_tenant'
      and conrelid = 'public.measurements'::regclass
  ) then
    alter table public.measurements
      add constraint measurements_room_same_tenant
      foreign key (tenant_id, room_id)
      references public.clinic_rooms(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'measurements_professional_profile_same_tenant'
      and conrelid = 'public.measurements'::regclass
  ) then
    alter table public.measurements
      add constraint measurements_professional_profile_same_tenant
      foreign key (tenant_id, professional_profile_id)
      references public.tenant_professionals(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bioimpedance_results_appointment_same_tenant'
      and conrelid = 'public.bioimpedance_results'::regclass
  ) then
    alter table public.bioimpedance_results
      add constraint bioimpedance_results_appointment_same_tenant
      foreign key (tenant_id, appointment_id)
      references public.appointments(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bioimpedance_results_queue_same_tenant'
      and conrelid = 'public.bioimpedance_results'::regclass
  ) then
    alter table public.bioimpedance_results
      add constraint bioimpedance_results_queue_same_tenant
      foreign key (tenant_id, queue_id)
      references public.attendance_queue(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bioimpedance_results_room_same_tenant'
      and conrelid = 'public.bioimpedance_results'::regclass
  ) then
    alter table public.bioimpedance_results
      add constraint bioimpedance_results_room_same_tenant
      foreign key (tenant_id, room_id)
      references public.clinic_rooms(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bioimpedance_results_professional_profile_same_tenant'
      and conrelid = 'public.bioimpedance_results'::regclass
  ) then
    alter table public.bioimpedance_results
      add constraint bioimpedance_results_professional_profile_same_tenant
      foreign key (tenant_id, professional_profile_id)
      references public.tenant_professionals(tenant_id, id);
  end if;
end $$;

create index if not exists idx_measurements_appointment
  on public.measurements(tenant_id, appointment_id, measured_at desc)
  where appointment_id is not null;

create index if not exists idx_measurements_queue
  on public.measurements(tenant_id, queue_id, measured_at desc)
  where queue_id is not null;

create index if not exists idx_bioimpedance_appointment
  on public.bioimpedance_results(tenant_id, appointment_id, measured_at desc)
  where appointment_id is not null;

create index if not exists idx_bioimpedance_queue
  on public.bioimpedance_results(tenant_id, queue_id, measured_at desc)
  where queue_id is not null;

create or replace function public.record_patient_measurement(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant(null, true);
  v_user_id uuid := auth.uid();
  v_patient_id uuid := (p_payload ->> 'patientId')::uuid;
  v_encounter_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'encounterId', '')) then (p_payload ->> 'encounterId')::uuid
    else null
  end;
  v_appointment_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'appointmentId', '')) then (p_payload ->> 'appointmentId')::uuid
    else null
  end;
  v_queue_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'queueId', '')) then (p_payload ->> 'queueId')::uuid
    else null
  end;
  v_room_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'roomId', '')) then (p_payload ->> 'roomId')::uuid
    else null
  end;
  v_professional_profile_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'professionalProfileId', '')) then (p_payload ->> 'professionalProfileId')::uuid
    else null
  end;
  v_source_module text := lower(coalesce(nullif(p_payload ->> 'sourceModule', ''), 'encounter'));
  v_weight numeric := nullif(p_payload ->> 'weightKg', '')::numeric;
  v_height numeric := nullif(p_payload ->> 'heightCm', '')::numeric;
  v_bmi numeric := nullif(p_payload ->> 'bmi', '')::numeric;
  v_measurement_id uuid;
  v_metadata jsonb := coalesce(p_payload -> 'metadata', '{}'::jsonb);
  v_details_href text;
begin
  if v_source_module not in ('encounter', 'patient360', 'agenda', 'attendance_queue', 'import', 'system') then
    v_source_module := 'encounter';
  end if;

  if not (
    security.has_permission(v_tenant_id, 'patients.write', false)
    or security.has_permission(v_tenant_id, 'encounters.write', false)
    or security.has_permission(v_tenant_id, 'agenda.write', false)
  ) then
    raise exception 'clinical_write_required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.patients where tenant_id = v_tenant_id and id = v_patient_id) then
    raise exception 'patient_not_found_or_forbidden' using errcode = 'P0002';
  end if;

  if v_queue_id is not null then
    select
      coalesce(v_appointment_id, q.appointment_id),
      coalesce(v_encounter_id, q.encounter_id),
      coalesce(v_room_id, q.room_id),
      coalesce(v_professional_profile_id, q.professional_profile_id)
    into v_appointment_id, v_encounter_id, v_room_id, v_professional_profile_id
    from public.attendance_queue q
    where q.tenant_id = v_tenant_id
      and q.id = v_queue_id
      and q.patient_id = v_patient_id;

    if not found then
      raise exception 'queue_entry_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  if v_appointment_id is not null then
    select
      coalesce(v_room_id, a.room_id),
      coalesce(v_professional_profile_id, a.professional_profile_id)
    into v_room_id, v_professional_profile_id
    from public.appointments a
    where a.tenant_id = v_tenant_id
      and a.id = v_appointment_id
      and a.patient_id = v_patient_id;

    if not found then
      raise exception 'appointment_not_found_or_forbidden' using errcode = '42501';
    end if;

    if v_encounter_id is null then
      select e.id
        into v_encounter_id
      from public.encounters e
      where e.tenant_id = v_tenant_id
        and e.patient_id = v_patient_id
        and e.appointment_id = v_appointment_id
        and e.status in ('open', 'in_progress')
      order by e.created_at desc
      limit 1;
    end if;
  end if;

  if v_encounter_id is not null and not exists (
    select 1
    from public.encounters e
    where e.tenant_id = v_tenant_id
      and e.patient_id = v_patient_id
      and e.id = v_encounter_id
  ) then
    raise exception 'encounter_not_found_or_forbidden' using errcode = '42501';
  end if;

  if v_room_id is not null and not exists (
    select 1 from public.clinic_rooms r where r.tenant_id = v_tenant_id and r.id = v_room_id
  ) then
    raise exception 'room_not_found_or_forbidden' using errcode = '42501';
  end if;

  if v_professional_profile_id is not null and not exists (
    select 1
    from public.tenant_professionals tp
    where tp.tenant_id = v_tenant_id
      and tp.id = v_professional_profile_id
  ) then
    raise exception 'professional_not_found_or_forbidden' using errcode = '42501';
  end if;

  if v_bmi is null and v_weight is not null and v_height is not null and v_height > 0 then
    v_bmi := round(v_weight / power(v_height / 100, 2), 2);
  end if;

  v_metadata := v_metadata || jsonb_build_object(
    'sourceModule', v_source_module,
    'appointmentId', v_appointment_id,
    'queueId', v_queue_id,
    'roomId', v_room_id,
    'professionalProfileId', v_professional_profile_id
  );

  insert into public.measurements (
    tenant_id,
    patient_id,
    encounter_id,
    appointment_id,
    queue_id,
    source_module,
    room_id,
    professional_profile_id,
    status,
    measured_at,
    height_cm,
    weight_kg,
    bmi,
    body_fat_pct,
    waist_cm,
    hip_cm,
    measured_by,
    notes,
    metadata
  )
  values (
    v_tenant_id,
    v_patient_id,
    v_encounter_id,
    v_appointment_id,
    v_queue_id,
    v_source_module,
    v_room_id,
    v_professional_profile_id,
    'recorded',
    coalesce(nullif(p_payload ->> 'measuredAt', '')::timestamptz, now()),
    v_height,
    v_weight,
    v_bmi,
    nullif(p_payload ->> 'bodyFatPercent', '')::numeric,
    nullif(p_payload ->> 'waistCm', '')::numeric,
    nullif(p_payload ->> 'hipCm', '')::numeric,
    v_user_id,
    nullif(trim(p_payload ->> 'notes'), ''),
    v_metadata
  )
  returning id into v_measurement_id;

  v_details_href := '/clinic/patients/' || v_patient_id || '/encounter';
  if v_appointment_id is not null then
    v_details_href := v_details_href || '?appointmentId=' || v_appointment_id;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'measurement_created',
    'measurement',
    v_measurement_id::text,
    jsonb_build_object(
      'patientId', v_patient_id,
      'encounterId', v_encounter_id,
      'appointmentId', v_appointment_id,
      'queueId', v_queue_id,
      'sourceModule', v_source_module
    )
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
    details_href,
    payload
  )
  values (
    v_tenant_id,
    v_patient_id,
    'medida_registrada',
    'clinical',
    'recorded',
    'Medidas registradas',
    case
      when v_source_module in ('agenda', 'attendance_queue') then 'Novas medidas corporais foram registradas pela fila operacional.'
      else 'Novas medidas corporais foram registradas no atendimento.'
    end,
    'Equipe clinica',
    'Registrado',
    v_details_href,
    jsonb_build_object(
      'entityId', v_measurement_id,
      'encounterId', v_encounter_id,
      'appointmentId', v_appointment_id,
      'queueId', v_queue_id,
      'sourceModule', v_source_module
    )
  );

  return jsonb_build_object('id', v_measurement_id);
end;
$$;

create or replace function public.record_patient_bioimpedance(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant(null, true);
  v_user_id uuid := auth.uid();
  v_patient_id uuid := (p_payload ->> 'patientId')::uuid;
  v_encounter_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'encounterId', '')) then (p_payload ->> 'encounterId')::uuid
    else null
  end;
  v_appointment_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'appointmentId', '')) then (p_payload ->> 'appointmentId')::uuid
    else null
  end;
  v_queue_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'queueId', '')) then (p_payload ->> 'queueId')::uuid
    else null
  end;
  v_room_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'roomId', '')) then (p_payload ->> 'roomId')::uuid
    else null
  end;
  v_professional_profile_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'professionalProfileId', '')) then (p_payload ->> 'professionalProfileId')::uuid
    else null
  end;
  v_source_module text := lower(coalesce(nullif(p_payload ->> 'sourceModule', ''), 'encounter'));
  v_result_payload jsonb := coalesce(p_payload -> 'payload', '{}'::jsonb);
  v_metadata jsonb := coalesce(p_payload -> 'metadata', '{}'::jsonb);
  v_result_id uuid;
  v_details_href text;
begin
  if v_source_module not in ('encounter', 'patient360', 'agenda', 'attendance_queue', 'import', 'system') then
    v_source_module := 'encounter';
  end if;

  if not (
    security.has_permission(v_tenant_id, 'patients.write', false)
    or security.has_permission(v_tenant_id, 'encounters.write', false)
    or security.has_permission(v_tenant_id, 'agenda.write', false)
  ) then
    raise exception 'clinical_write_required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.patients where tenant_id = v_tenant_id and id = v_patient_id) then
    raise exception 'patient_not_found_or_forbidden' using errcode = 'P0002';
  end if;

  if v_queue_id is not null then
    select
      coalesce(v_appointment_id, q.appointment_id),
      coalesce(v_encounter_id, q.encounter_id),
      coalesce(v_room_id, q.room_id),
      coalesce(v_professional_profile_id, q.professional_profile_id)
    into v_appointment_id, v_encounter_id, v_room_id, v_professional_profile_id
    from public.attendance_queue q
    where q.tenant_id = v_tenant_id
      and q.id = v_queue_id
      and q.patient_id = v_patient_id;

    if not found then
      raise exception 'queue_entry_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  if v_appointment_id is not null then
    select
      coalesce(v_room_id, a.room_id),
      coalesce(v_professional_profile_id, a.professional_profile_id)
    into v_room_id, v_professional_profile_id
    from public.appointments a
    where a.tenant_id = v_tenant_id
      and a.id = v_appointment_id
      and a.patient_id = v_patient_id;

    if not found then
      raise exception 'appointment_not_found_or_forbidden' using errcode = '42501';
    end if;

    if v_encounter_id is null then
      select e.id
        into v_encounter_id
      from public.encounters e
      where e.tenant_id = v_tenant_id
        and e.patient_id = v_patient_id
        and e.appointment_id = v_appointment_id
        and e.status in ('open', 'in_progress')
      order by e.created_at desc
      limit 1;
    end if;
  end if;

  if v_encounter_id is not null and not exists (
    select 1
    from public.encounters e
    where e.tenant_id = v_tenant_id
      and e.patient_id = v_patient_id
      and e.id = v_encounter_id
  ) then
    raise exception 'encounter_not_found_or_forbidden' using errcode = '42501';
  end if;

  if v_room_id is not null and not exists (
    select 1 from public.clinic_rooms r where r.tenant_id = v_tenant_id and r.id = v_room_id
  ) then
    raise exception 'room_not_found_or_forbidden' using errcode = '42501';
  end if;

  if v_professional_profile_id is not null and not exists (
    select 1
    from public.tenant_professionals tp
    where tp.tenant_id = v_tenant_id
      and tp.id = v_professional_profile_id
  ) then
    raise exception 'professional_not_found_or_forbidden' using errcode = '42501';
  end if;

  v_result_payload := v_result_payload || jsonb_build_object(
    'sourceModule', v_source_module,
    'appointmentId', v_appointment_id,
    'queueId', v_queue_id,
    'roomId', v_room_id,
    'professionalProfileId', v_professional_profile_id
  );
  v_metadata := v_metadata || jsonb_build_object(
    'sourceModule', v_source_module,
    'appointmentId', v_appointment_id,
    'queueId', v_queue_id,
    'roomId', v_room_id,
    'professionalProfileId', v_professional_profile_id
  );

  insert into public.bioimpedance_results (
    tenant_id,
    patient_id,
    encounter_id,
    appointment_id,
    queue_id,
    source_module,
    room_id,
    professional_profile_id,
    status,
    measured_at,
    result_payload,
    metadata
  )
  values (
    v_tenant_id,
    v_patient_id,
    v_encounter_id,
    v_appointment_id,
    v_queue_id,
    v_source_module,
    v_room_id,
    v_professional_profile_id,
    coalesce(nullif(p_payload ->> 'status', ''), 'final'),
    coalesce(nullif(p_payload ->> 'measuredAt', '')::timestamptz, now()),
    v_result_payload,
    v_metadata
  )
  returning id into v_result_id;

  v_details_href := '/clinic/patients/' || v_patient_id || '/encounter';
  if v_appointment_id is not null then
    v_details_href := v_details_href || '?appointmentId=' || v_appointment_id;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'bioimpedance_created',
    'bioimpedance_result',
    v_result_id::text,
    jsonb_build_object(
      'patientId', v_patient_id,
      'encounterId', v_encounter_id,
      'appointmentId', v_appointment_id,
      'queueId', v_queue_id,
      'sourceModule', v_source_module
    )
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
    details_href,
    payload
  )
  values (
    v_tenant_id,
    v_patient_id,
    'medida_registrada',
    'clinical',
    'recorded',
    'Bioimpedancia registrada',
    case
      when v_source_module in ('agenda', 'attendance_queue') then 'Resultado de bioimpedancia registrado pela fila operacional.'
      else 'Resultado de bioimpedancia registrado no atendimento.'
    end,
    'Equipe clinica',
    'Registrado',
    v_details_href,
    jsonb_build_object(
      'entityId', v_result_id,
      'encounterId', v_encounter_id,
      'appointmentId', v_appointment_id,
      'queueId', v_queue_id,
      'sourceModule', v_source_module
    )
  );

  return jsonb_build_object('id', v_result_id);
end;
$$;

create or replace function public.record_operational_clinical_stage(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_appointment_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'appointmentId', '')) then (p_payload ->> 'appointmentId')::uuid
    else null
  end;
  v_queue_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'queueId', '')) then (p_payload ->> 'queueId')::uuid
    else null
  end;
  v_room_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'roomId', '')) then (p_payload ->> 'roomId')::uuid
    else null
  end;
  v_professional_profile_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'professionalProfileId', '')) then (p_payload ->> 'professionalProfileId')::uuid
    else null
  end;
  v_stage text := lower(coalesce(nullif(p_payload ->> 'stage', ''), ''));
  v_action text := lower(coalesce(nullif(p_payload ->> 'action', ''), ''));
  v_note text := security.agenda_clean_reason(p_payload ->> 'notes', 1000);
  v_appointment public.appointments%rowtype;
  v_queue public.attendance_queue%rowtype;
  v_queue_status text;
  v_old_queue_status text;
  v_next_status text;
  v_event_type text;
  v_timestamp timestamptz := coalesce(nullif(p_payload ->> 'occurredAt', '')::timestamptz, now());
  v_stage_payload jsonb;
  v_existing_stage jsonb := '{}'::jsonb;
  v_room_name text;
  v_professional_user_id uuid;
begin
  if not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  if v_stage not in ('triagem', 'medidas', 'bioimpedancia') then
    raise exception 'invalid_operational_stage' using errcode = '22023';
  end if;

  if v_action not in ('start', 'complete') then
    raise exception 'invalid_operational_action' using errcode = '22023';
  end if;

  if v_queue_id is not null then
    select *
      into v_queue
    from public.attendance_queue
    where tenant_id = v_tenant_id
      and id = v_queue_id
    for update;

    if not found then
      raise exception 'queue_entry_not_found_or_forbidden' using errcode = '42501';
    end if;

    v_appointment_id := coalesce(v_appointment_id, v_queue.appointment_id);
    v_room_id := coalesce(v_room_id, v_queue.room_id);
    v_professional_profile_id := coalesce(v_professional_profile_id, v_queue.professional_profile_id);
  end if;

  if v_appointment_id is null then
    raise exception 'appointment_required' using errcode = '22023';
  end if;

  select *
    into v_appointment
  from public.appointments
  where tenant_id = v_tenant_id
    and id = v_appointment_id
  for update;

  if not found then
    raise exception 'appointment_not_found_or_forbidden' using errcode = '42501';
  end if;

  v_room_id := coalesce(v_room_id, v_appointment.room_id);
  v_professional_profile_id := coalesce(v_professional_profile_id, v_appointment.professional_profile_id);

  if v_room_id is not null then
    select r.name
      into v_room_name
    from public.clinic_rooms r
    where r.tenant_id = v_tenant_id
      and r.id = v_room_id;

    if not found then
      raise exception 'room_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  if v_professional_profile_id is not null then
    select tp.user_id
      into v_professional_user_id
    from public.tenant_professionals tp
    where tp.tenant_id = v_tenant_id
      and tp.id = v_professional_profile_id;

    if not found then
      raise exception 'professional_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  if v_action = 'start' then
    v_next_status := v_stage;
  elsif v_stage = 'triagem' then
    v_next_status := 'medidas';
  elsif v_stage = 'medidas' then
    v_next_status := 'bioimpedancia';
  else
    v_next_status := 'aguardando_medico';
  end if;

  if lower(coalesce(v_appointment.status, '')) <> v_next_status then
    perform security.assert_appointment_transition(v_appointment.status, v_next_status, v_note);

    update public.appointments
       set status = v_next_status,
           arrived_at = case
             when arrived_at is null
              and v_next_status in ('chegou', 'triagem', 'medidas', 'bioimpedancia', 'aguardando_medico', 'em_consulta', 'checkout')
               then v_timestamp
             else arrived_at
           end,
           updated_at = v_timestamp
     where tenant_id = v_tenant_id
       and id = v_appointment.id;
  end if;

  v_queue_status := security.attendance_queue_status_for_appointment(v_next_status);

  if v_queue_id is null then
    select *
      into v_queue
    from public.attendance_queue
    where tenant_id = v_tenant_id
      and appointment_id = v_appointment.id
    for update;
  end if;

  if not found then
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
      v_tenant_id,
      v_appointment.patient_id,
      v_appointment.id,
      coalesce(v_queue_status, 'waiting'),
      v_appointment.scheduled_at,
      coalesce(v_appointment.arrived_at, v_timestamp),
      coalesce(v_professional_user_id, v_appointment.practitioner_id),
      v_professional_profile_id,
      v_room_id,
      coalesce(v_room_name, v_appointment.location),
      v_timestamp,
      jsonb_build_object('source', 'record_operational_clinical_stage')
    )
    returning * into v_queue;
  end if;

  v_queue_id := v_queue.id;
  v_old_queue_status := v_queue.status;
  v_existing_stage := coalesce(v_queue.metadata #> array['clinicalWorkflow', v_stage], '{}'::jsonb);
  v_stage_payload := jsonb_build_object(
    'stage', v_stage,
    'action', v_action,
    'actorId', v_user_id,
    'roomId', v_room_id,
    'professionalProfileId', v_professional_profile_id,
    'notes', v_note
  );

  if v_action = 'start' then
    v_stage_payload := v_stage_payload || jsonb_build_object('startedAt', v_timestamp);
    v_event_type := 'operational_' || v_stage || '_started';
  else
    v_stage_payload := v_stage_payload || jsonb_build_object('completedAt', v_timestamp);
    v_event_type := 'operational_' || v_stage || '_completed';
  end if;

  update public.attendance_queue
     set status = coalesce(v_queue_status, status),
         arrived_at = coalesce(arrived_at, v_timestamp),
         assigned_to = coalesce(v_professional_user_id, assigned_to),
         professional_profile_id = coalesce(v_professional_profile_id, professional_profile_id),
         room_id = coalesce(v_room_id, room_id),
         room = coalesce(v_room_name, room),
         last_status_at = case
           when status is distinct from coalesce(v_queue_status, status) then v_timestamp
           else last_status_at
         end,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'clinicalWorkflow',
           coalesce(metadata -> 'clinicalWorkflow', '{}'::jsonb) ||
           jsonb_build_object(v_stage, v_existing_stage || v_stage_payload)
         ),
         updated_at = v_timestamp
   where tenant_id = v_tenant_id
     and id = v_queue_id;

  if lower(coalesce(v_appointment.status, '')) <> v_next_status then
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
      v_appointment.id,
      v_appointment.patient_id,
      v_old_queue_status,
      v_queue_status,
      v_next_status,
      v_note,
      v_user_id,
      jsonb_build_object(
        'source', 'record_operational_clinical_stage',
        'stage', v_stage,
        'action', v_action,
        'fromAppointmentStatus', v_appointment.status
      )
    );
  end if;

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
    v_appointment.patient_id,
    v_appointment.id,
    v_event_type,
    case when v_action = 'complete' then 'closed' else 'open' end,
    v_timestamp,
    jsonb_build_object(
      'queueId', v_queue_id,
      'stage', v_stage,
      'action', v_action,
      'roomId', v_room_id,
      'professionalProfileId', v_professional_profile_id
    )
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'agenda.operational_stage_' || v_action,
    'attendance_queue',
    v_queue_id::text,
    jsonb_build_object(
      'appointmentId', v_appointment.id,
      'patientId', v_appointment.patient_id,
      'stage', v_stage,
      'nextStatus', v_next_status,
      'roomId', v_room_id,
      'professionalProfileId', v_professional_profile_id
    )
  );

  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'queueId', v_queue_id,
    'patientId', v_appointment.patient_id,
    'stage', v_stage,
    'action', v_action,
    'status', v_next_status,
    'queueStatus', v_queue_status,
    'occurredAt', v_timestamp
  );
end;
$$;

create or replace function public.get_agenda_operational_queue(
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
  v_rows jsonb := '[]'::jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'queueId', q.id,
    'appointmentId', q.appointment_id,
    'patientId', q.patient_id,
    'clinicalWorkflow', coalesce(q.metadata -> 'clinicalWorkflow', '{}'::jsonb)
  ) order by q.scheduled_at asc), '[]'::jsonb)
    into v_rows
  from public.attendance_queue q
  join public.appointments a
    on a.tenant_id = q.tenant_id
   and a.id = q.appointment_id
  where q.tenant_id = v_tenant_id
    and a.scheduled_at >= v_day_start
    and a.scheduled_at < v_day_end;

  return v_rows;
end;
$$;

revoke all on function public.record_operational_clinical_stage(jsonb) from public;
revoke all on function public.get_agenda_operational_queue(date) from public;

grant execute on function public.record_operational_clinical_stage(jsonb) to authenticated, service_role;
grant execute on function public.get_agenda_operational_queue(date) to authenticated, service_role;

comment on function public.record_operational_clinical_stage(jsonb) is
  'Records auditable operational start/complete transitions for triage, measurements and bioimpedance in agenda/queue.';

comment on function public.get_agenda_operational_queue(date) is
  'Returns operational clinical workflow metadata for agenda queue cards.';
