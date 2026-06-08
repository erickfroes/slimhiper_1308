-- Transactional clinical write contracts.
-- These RPCs keep patient/PII and clinical data/audit/timeline writes atomic.

create or replace function public.upsert_patient_with_pii(
  p_patient_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', true);
  v_user_id uuid := auth.uid();
  v_patient_id uuid := p_patient_id;
  v_full_name text := nullif(trim(p_payload ->> 'fullName'), '');
  v_status text := coalesce(nullif(p_payload ->> 'status', ''), 'active');
  v_tags text[] := coalesce(
    array(select jsonb_array_elements_text(coalesce(p_payload -> 'tags', '[]'::jsonb))),
    '{}'::text[]
  );
  v_metadata jsonb := coalesce(p_payload -> 'metadata', '{}'::jsonb);
  v_action text;
begin
  if v_full_name is null or length(v_full_name) < 3 then
    raise exception 'patient_full_name_required' using errcode = '22023';
  end if;

  if v_patient_id is null then
    insert into public.patients (tenant_id, status, preferred_name, tags, metadata)
    values (
      v_tenant_id,
      v_status,
      nullif(trim(p_payload ->> 'preferredName'), ''),
      v_tags,
      v_metadata
    )
    returning id into v_patient_id;
    v_action := 'patient_created';
  else
    update public.patients
    set
      status = v_status,
      preferred_name = nullif(trim(p_payload ->> 'preferredName'), ''),
      tags = v_tags,
      metadata = v_metadata,
      updated_at = now()
    where tenant_id = v_tenant_id
      and id = v_patient_id
    returning id into v_patient_id;

    if v_patient_id is null then
      raise exception 'patient_not_found_or_forbidden' using errcode = 'P0002';
    end if;
    v_action := 'patient_updated';
  end if;

  insert into public.patient_pii (
    tenant_id,
    patient_id,
    full_name,
    email,
    phone,
    cpf_masked,
    birth_date,
    sex_gender
  )
  values (
    v_tenant_id,
    v_patient_id,
    v_full_name,
    nullif(trim(p_payload ->> 'email'), ''),
    nullif(trim(p_payload ->> 'phone'), ''),
    nullif(trim(p_payload ->> 'cpfMasked'), ''),
    nullif(trim(p_payload ->> 'birthDate'), '')::date,
    nullif(trim(p_payload ->> 'sexGender'), '')
  )
  on conflict (patient_id) do update
    set
      tenant_id = excluded.tenant_id,
      full_name = excluded.full_name,
      email = excluded.email,
      phone = excluded.phone,
      cpf_masked = excluded.cpf_masked,
      birth_date = excluded.birth_date,
      sex_gender = excluded.sex_gender,
      updated_at = now();

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    v_action,
    'patient',
    v_patient_id::text,
    jsonb_build_object('source', 'upsert_patient_with_pii')
  );

  return jsonb_build_object('id', v_patient_id);
end;
$$;

create or replace function public.record_patient_measurement(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', true);
  v_user_id uuid := auth.uid();
  v_patient_id uuid := (p_payload ->> 'patientId')::uuid;
  v_encounter_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'encounterId', '')) then (p_payload ->> 'encounterId')::uuid
    else null
  end;
  v_weight numeric := nullif(p_payload ->> 'weightKg', '')::numeric;
  v_height numeric := nullif(p_payload ->> 'heightCm', '')::numeric;
  v_bmi numeric := nullif(p_payload ->> 'bmi', '')::numeric;
  v_measurement_id uuid;
begin
  if not exists (select 1 from public.patients where tenant_id = v_tenant_id and id = v_patient_id) then
    raise exception 'patient_not_found_or_forbidden' using errcode = 'P0002';
  end if;

  if v_bmi is null and v_weight is not null and v_height is not null and v_height > 0 then
    v_bmi := round(v_weight / power(v_height / 100, 2), 2);
  end if;

  insert into public.measurements (
    tenant_id,
    patient_id,
    encounter_id,
    status,
    measured_at,
    height_cm,
    weight_kg,
    bmi,
    body_fat_pct,
    waist_cm,
    hip_cm,
    measured_by,
    notes
  )
  values (
    v_tenant_id,
    v_patient_id,
    v_encounter_id,
    'recorded',
    coalesce(nullif(p_payload ->> 'measuredAt', '')::timestamptz, now()),
    v_height,
    v_weight,
    v_bmi,
    nullif(p_payload ->> 'bodyFatPercent', '')::numeric,
    nullif(p_payload ->> 'waistCm', '')::numeric,
    nullif(p_payload ->> 'hipCm', '')::numeric,
    v_user_id,
    nullif(trim(p_payload ->> 'notes'), '')
  )
  returning id into v_measurement_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'measurement_created',
    'measurement',
    v_measurement_id::text,
    jsonb_build_object('patientId', v_patient_id, 'encounterId', v_encounter_id)
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
    'Novas medidas corporais foram registradas no atendimento.',
    'Equipe clinica',
    'Registrado',
    '/clinic/patients/' || v_patient_id || '/encounter',
    jsonb_build_object('entityId', v_measurement_id, 'encounterId', v_encounter_id)
  );

  return jsonb_build_object('id', v_measurement_id);
end;
$$;

create or replace function public.update_patient_measurement(
  p_measurement_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', true);
  v_user_id uuid := auth.uid();
  v_patient_id uuid := (p_payload ->> 'patientId')::uuid;
  v_weight numeric := nullif(p_payload ->> 'weightKg', '')::numeric;
  v_height numeric := nullif(p_payload ->> 'heightCm', '')::numeric;
  v_bmi numeric := nullif(p_payload ->> 'bmi', '')::numeric;
  v_updated_id uuid;
begin
  if v_bmi is null and v_weight is not null and v_height is not null and v_height > 0 then
    v_bmi := round(v_weight / power(v_height / 100, 2), 2);
  end if;

  update public.measurements
  set
    measured_at = coalesce(nullif(p_payload ->> 'measuredAt', '')::timestamptz, measured_at),
    height_cm = v_height,
    weight_kg = v_weight,
    bmi = v_bmi,
    body_fat_pct = nullif(p_payload ->> 'bodyFatPercent', '')::numeric,
    waist_cm = nullif(p_payload ->> 'waistCm', '')::numeric,
    hip_cm = nullif(p_payload ->> 'hipCm', '')::numeric,
    notes = nullif(trim(p_payload ->> 'notes'), ''),
    updated_at = now()
  where id = p_measurement_id
    and tenant_id = v_tenant_id
    and patient_id = v_patient_id
  returning id into v_updated_id;

  if v_updated_id is null then
    raise exception 'measurement_not_found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'measurement_updated',
    'measurement',
    v_updated_id::text,
    jsonb_build_object('patientId', v_patient_id)
  );

  return jsonb_build_object('id', v_updated_id);
end;
$$;

create or replace function public.delete_patient_measurement(
  p_patient_id uuid,
  p_measurement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', true);
  v_user_id uuid := auth.uid();
begin
  delete from public.measurements
  where id = p_measurement_id
    and tenant_id = v_tenant_id
    and patient_id = p_patient_id;

  if not found then
    raise exception 'measurement_not_found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'measurement_deleted',
    'measurement',
    p_measurement_id::text,
    jsonb_build_object('patientId', p_patient_id)
  );

  return jsonb_build_object('id', p_measurement_id, 'deleted', true);
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
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', true);
  v_user_id uuid := auth.uid();
  v_patient_id uuid := (p_payload ->> 'patientId')::uuid;
  v_encounter_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'encounterId', '')) then (p_payload ->> 'encounterId')::uuid
    else null
  end;
  v_result_id uuid;
begin
  if not exists (select 1 from public.patients where tenant_id = v_tenant_id and id = v_patient_id) then
    raise exception 'patient_not_found_or_forbidden' using errcode = 'P0002';
  end if;

  insert into public.bioimpedance_results (
    tenant_id,
    patient_id,
    encounter_id,
    status,
    measured_at,
    result_payload
  )
  values (
    v_tenant_id,
    v_patient_id,
    v_encounter_id,
    coalesce(nullif(p_payload ->> 'status', ''), 'final'),
    coalesce(nullif(p_payload ->> 'measuredAt', '')::timestamptz, now()),
    coalesce(p_payload -> 'payload', '{}'::jsonb)
  )
  returning id into v_result_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'bioimpedance_created',
    'bioimpedance_result',
    v_result_id::text,
    jsonb_build_object('patientId', v_patient_id, 'encounterId', v_encounter_id)
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
    'Resultado de bioimpedancia registrado no atendimento.',
    'Equipe clinica',
    'Registrado',
    '/clinic/patients/' || v_patient_id || '/encounter',
    jsonb_build_object('entityId', v_result_id, 'encounterId', v_encounter_id)
  );

  return jsonb_build_object('id', v_result_id);
end;
$$;

create or replace function public.create_patient_lab_order(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', true);
  v_user_id uuid := auth.uid();
  v_patient_id uuid := (p_payload ->> 'patientId')::uuid;
  v_encounter_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'encounterId', '')) then (p_payload ->> 'encounterId')::uuid
    else null
  end;
  v_panel_name text := nullif(trim(p_payload ->> 'panelName'), '');
  v_order_id uuid;
begin
  if v_panel_name is null then
    raise exception 'lab_order_panel_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.patients where tenant_id = v_tenant_id and id = v_patient_id) then
    raise exception 'patient_not_found_or_forbidden' using errcode = 'P0002';
  end if;

  insert into public.lab_orders (
    tenant_id,
    patient_id,
    encounter_id,
    status,
    ordered_by,
    order_payload
  )
  values (
    v_tenant_id,
    v_patient_id,
    v_encounter_id,
    'requested',
    v_user_id,
    jsonb_build_object(
      'panel_name', v_panel_name,
      'tests', coalesce(p_payload -> 'tests', '[]'::jsonb),
      'urgency', coalesce(nullif(p_payload ->> 'urgency', ''), 'routine'),
      'note', nullif(trim(p_payload ->> 'note'), '')
    )
  )
  returning id into v_order_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'lab_order_created',
    'lab_order',
    v_order_id::text,
    jsonb_build_object('patientId', v_patient_id, 'encounterId', v_encounter_id)
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
    'exame_solicitado',
    'clinical',
    'recorded',
    'Exames solicitados',
    'Painel ' || v_panel_name || ' solicitado no atendimento.',
    'Equipe clinica',
    'Registrado',
    '/clinic/patients/' || v_patient_id || '/encounter',
    jsonb_build_object('entityId', v_order_id, 'encounterId', v_encounter_id, 'tests', coalesce(p_payload -> 'tests', '[]'::jsonb))
  );

  return jsonb_build_object('id', v_order_id);
end;
$$;

create or replace function public.record_patient_lab_result(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', true);
  v_user_id uuid := auth.uid();
  v_patient_id uuid := (p_payload ->> 'patientId')::uuid;
  v_lab_order_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'labOrderId', '')) then (p_payload ->> 'labOrderId')::uuid
    else null
  end;
  v_result_id uuid;
begin
  if not exists (select 1 from public.patients where tenant_id = v_tenant_id and id = v_patient_id) then
    raise exception 'patient_not_found_or_forbidden' using errcode = 'P0002';
  end if;

  insert into public.lab_results (
    tenant_id,
    patient_id,
    lab_order_id,
    status,
    result_at,
    result_payload
  )
  values (
    v_tenant_id,
    v_patient_id,
    v_lab_order_id,
    'received',
    coalesce(nullif(p_payload ->> 'resultAt', '')::timestamptz, now()),
    coalesce(p_payload -> 'values', '{}'::jsonb)
      || jsonb_build_object('interpretation', nullif(trim(p_payload ->> 'interpretation'), ''))
  )
  returning id into v_result_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'lab_result_recorded',
    'lab_result',
    v_result_id::text,
    jsonb_build_object('patientId', v_patient_id, 'labOrderId', v_lab_order_id)
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
    'exame_resultado_recebido',
    'clinical',
    'recorded',
    'Resultado de exame recebido',
    'Resultado laboratorial registrado no prontuario.',
    'Equipe clinica',
    'Registrado',
    '/clinic/patients/' || v_patient_id || '/encounter',
    jsonb_build_object('entityId', v_result_id, 'labOrderId', v_lab_order_id)
  );

  return jsonb_build_object('id', v_result_id);
end;
$$;

create or replace function public.finalize_encounter_soap(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('soap.write', true);
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
  v_soap_note_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload ->> 'soapNoteId', '')) then (p_payload ->> 'soapNoteId')::uuid
    else null
  end;
  v_encounter public.encounters%rowtype;
  v_soap public.soap_notes%rowtype;
  v_now timestamptz := now();
begin
  if not exists (select 1 from public.patients where tenant_id = v_tenant_id and id = v_patient_id) then
    raise exception 'patient_not_found_or_forbidden' using errcode = 'P0002';
  end if;

  if nullif(trim(p_payload ->> 'subjective'), '') is null
    or nullif(trim(p_payload ->> 'objective'), '') is null
    or nullif(trim(p_payload ->> 'assessment'), '') is null
    or nullif(trim(p_payload ->> 'plan'), '') is null then
    raise exception 'soap_required_fields_missing' using errcode = '22023';
  end if;

  if v_encounter_id is not null then
    select * into v_encounter
    from public.encounters
    where id = v_encounter_id
      and tenant_id = v_tenant_id
      and patient_id = v_patient_id;

    if not found then
      raise exception 'encounter_not_found' using errcode = 'P0002';
    end if;
    if v_encounter.status = 'closed' then
      raise exception 'encounter_already_finalized' using errcode = '22023';
    end if;
  else
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
      v_patient_id,
      v_appointment_id,
      'open',
      'clinic_visit',
      v_now,
      v_user_id
    )
    returning * into v_encounter;
  end if;

  if v_soap_note_id is not null then
    select * into v_soap
    from public.soap_notes
    where id = v_soap_note_id
      and tenant_id = v_tenant_id
      and patient_id = v_patient_id;

    if not found then
      raise exception 'soap_note_not_found' using errcode = 'P0002';
    end if;
    if v_soap.status = 'final' then
      raise exception 'soap_note_already_finalized' using errcode = '22023';
    end if;
    if v_soap.encounter_id is not null and v_soap.encounter_id <> v_encounter.id then
      raise exception 'soap_note_encounter_mismatch' using errcode = '22023';
    end if;

    update public.soap_notes
    set
      encounter_id = v_encounter.id,
      status = 'final',
      subjective = p_payload ->> 'subjective',
      objective = p_payload ->> 'objective',
      assessment = p_payload ->> 'assessment',
      plan = p_payload ->> 'plan',
      authored_by = v_user_id,
      updated_at = v_now
    where id = v_soap_note_id
    returning * into v_soap;
  else
    insert into public.soap_notes (
      tenant_id,
      patient_id,
      encounter_id,
      status,
      subjective,
      objective,
      assessment,
      plan,
      authored_by,
      created_at,
      updated_at
    )
    values (
      v_tenant_id,
      v_patient_id,
      v_encounter.id,
      'final',
      p_payload ->> 'subjective',
      p_payload ->> 'objective',
      p_payload ->> 'assessment',
      p_payload ->> 'plan',
      v_user_id,
      v_now,
      v_now
    )
    returning * into v_soap;
  end if;

  update public.encounters
  set
    status = 'closed',
    ended_at = v_now,
    finalized_by = v_user_id,
    updated_at = v_now
  where id = v_encounter.id
    and tenant_id = v_tenant_id
  returning * into v_encounter;

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
    v_patient_id,
    'soap_atualizado',
    'clinical',
    'recorded',
    'SOAP finalizado',
    'Atendimento SOAP finalizado e registrado no prontuario.',
    'Equipe clinica',
    'Finalizado',
    'Abrir SOAP',
    '/clinic/patients/' || v_patient_id || '/encounter',
    v_now,
    jsonb_build_object('encounterId', v_encounter.id, 'soapNoteId', v_soap.id)
  );

  if v_encounter.appointment_id is not null then
    perform public.complete_attendance_encounter(v_encounter.id, null, null);
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'soap_finalized',
    'soap_note',
    v_soap.id::text,
    jsonb_build_object('patientId', v_patient_id, 'encounterId', v_encounter.id, 'status', 'final')
  );

  perform public.create_note_from_encounter(v_encounter.id, v_soap.id);

  return jsonb_build_object(
    'encounterId', v_encounter.id,
    'soapNoteId', v_soap.id,
    'status', 'final'
  );
end;
$$;

create table if not exists public.provider_webhook_dead_letters (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  reason text not null,
  provider_event_id text,
  provider_document_id text,
  event_type text,
  idempotency_key text,
  status text not null default 'received' check (status in ('received', 'triaged', 'reprocessed', 'ignored')),
  payload_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists provider_webhook_dead_letters_provider_idempotency_key
  on public.provider_webhook_dead_letters(provider, idempotency_key)
  where idempotency_key is not null;

alter table public.provider_webhook_dead_letters enable row level security;

drop policy if exists provider_webhook_dead_letters_service_role on public.provider_webhook_dead_letters;
create policy provider_webhook_dead_letters_service_role
on public.provider_webhook_dead_letters
for all
to service_role
using (true)
with check (true);

create or replace function public.record_provider_webhook_dead_letter(
  p_provider text,
  p_reason text,
  p_payload_summary jsonb,
  p_idempotency_key text default null,
  p_provider_event_id text default null,
  p_provider_document_id text default null,
  p_event_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.provider_webhook_dead_letters (
    provider,
    reason,
    provider_event_id,
    provider_document_id,
    event_type,
    idempotency_key,
    payload_summary
  )
  values (
    left(nullif(trim(p_provider), ''), 80),
    left(nullif(trim(p_reason), ''), 160),
    left(nullif(trim(p_provider_event_id), ''), 160),
    left(nullif(trim(p_provider_document_id), ''), 160),
    left(nullif(trim(p_event_type), ''), 120),
    left(nullif(trim(p_idempotency_key), ''), 180),
    coalesce(p_payload_summary, '{}'::jsonb)
  )
  on conflict (provider, idempotency_key)
    where idempotency_key is not null
  do update
    set
      reason = excluded.reason,
      provider_event_id = excluded.provider_event_id,
      provider_document_id = excluded.provider_document_id,
      event_type = excluded.event_type,
      payload_summary = excluded.payload_summary
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.upsert_patient_with_pii(uuid, jsonb) from public;
revoke all on function public.record_patient_measurement(jsonb) from public;
revoke all on function public.update_patient_measurement(uuid, jsonb) from public;
revoke all on function public.delete_patient_measurement(uuid, uuid) from public;
revoke all on function public.record_patient_bioimpedance(jsonb) from public;
revoke all on function public.create_patient_lab_order(jsonb) from public;
revoke all on function public.record_patient_lab_result(jsonb) from public;
revoke all on function public.finalize_encounter_soap(jsonb) from public;
revoke all on function public.record_provider_webhook_dead_letter(text, text, jsonb, text, text, text, text) from public;

grant execute on function public.upsert_patient_with_pii(uuid, jsonb) to authenticated, service_role;
grant execute on function public.record_patient_measurement(jsonb) to authenticated, service_role;
grant execute on function public.update_patient_measurement(uuid, jsonb) to authenticated, service_role;
grant execute on function public.delete_patient_measurement(uuid, uuid) to authenticated, service_role;
grant execute on function public.record_patient_bioimpedance(jsonb) to authenticated, service_role;
grant execute on function public.create_patient_lab_order(jsonb) to authenticated, service_role;
grant execute on function public.record_patient_lab_result(jsonb) to authenticated, service_role;
grant execute on function public.finalize_encounter_soap(jsonb) to authenticated, service_role;
grant execute on function public.record_provider_webhook_dead_letter(text, text, jsonb, text, text, text, text) to service_role;


-- CRM/inventory tenant resolver hardening
-- Re-emit legacy CRM/inventory RPCs so tenant selection goes through the
-- shared resolver, preserving the existing RBAC/unit checks in each function.

create or replace function public.list_crm_leads(p_status text default null, p_stage_id uuid default null, p_search text default null, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_rows jsonb;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'crm.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'status', l.status,
    'stageId', l.stage_id,
    'stageLabel', s.label,
    'unitId', l.unit_id,
    'source', l.source,
    'campaign', l.campaign,
    'fullName', l.full_name,
    'email', l.email,
    'phone', l.phone,
    'ownerUserId', l.owner_user_id,
    'contactConsent', l.contact_consent,
    'nextFollowUpAt', l.next_follow_up_at,
    'createdAt', l.created_at,
    'updatedAt', l.updated_at
  ) order by l.updated_at desc), '[]'::jsonb) into v_rows
  from public.crm_leads l
  left join public.crm_pipeline_stages s on s.tenant_id = l.tenant_id and s.id = l.stage_id
  where l.tenant_id = v_tenant_id
    and public.has_unit_access(l.tenant_id, l.unit_id)
    and (p_status is null or l.status = p_status)
    and (p_stage_id is null or l.stage_id = p_stage_id)
    and (
      nullif(trim(coalesce(p_search, '')), '') is null
      or l.full_name ilike '%' || trim(p_search) || '%'
      or l.normalized_email = public.normalize_contact_email(p_search)
      or l.normalized_phone = public.normalize_contact_phone(p_search)
    )
  limit v_limit;

  return jsonb_build_object('leads', v_rows, 'limit', v_limit);
end;
$$;

create or replace function public.create_crm_lead(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_stage_id uuid;
  v_lead public.crm_leads%rowtype;
  v_unit_id uuid := nullif(p_payload->>'unitId', '')::uuid;
  v_full_name text := nullif(trim(p_payload->>'fullName'), '');
  v_email text := nullif(trim(p_payload->>'email'), '');
  v_phone text := nullif(trim(p_payload->>'phone'), '');
begin
  v_tenant_id := security.resolve_current_tenant(null, true);

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'crm.write', false) or not public.has_unit_access(v_tenant_id, v_unit_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_full_name is null or (public.normalize_contact_email(v_email) is null and public.normalize_contact_phone(v_phone) is null) then
    raise exception 'invalid_lead_payload' using errcode = '22023';
  end if;

  perform public.ensure_default_crm_pipeline(v_tenant_id);
  select id into v_stage_id from public.crm_pipeline_stages where tenant_id = v_tenant_id and code = coalesce(nullif(p_payload->>'stageCode', ''), 'novo');

  insert into public.crm_leads (tenant_id, unit_id, stage_id, owner_user_id, source, campaign, full_name, email, phone, contact_preference, contact_consent, consent_purpose, retention_expires_at, next_follow_up_at, metadata)
  values (
    v_tenant_id,
    v_unit_id,
    v_stage_id,
    coalesce(nullif(p_payload->>'ownerUserId', '')::uuid, auth.uid()),
    nullif(p_payload->>'source', ''),
    nullif(p_payload->>'campaign', ''),
    v_full_name,
    v_email,
    v_phone,
    nullif(p_payload->>'contactPreference', ''),
    case when nullif(p_payload->>'contactConsent', '') is null then false else (p_payload->>'contactConsent')::boolean end,
    nullif(p_payload->>'consentPurpose', ''),
    nullif(p_payload->>'retentionExpiresAt', '')::timestamptz,
    nullif(p_payload->>'nextFollowUpAt', '')::timestamptz,
    coalesce(p_payload->'metadata', '{}'::jsonb)
  ) returning * into v_lead;

  insert into public.crm_lead_activities (tenant_id, lead_id, activity_type, title, actor_user_id, metadata)
  values (v_tenant_id, v_lead.id, 'note', 'Lead criado', auth.uid(), jsonb_build_object('source', v_lead.source, 'campaign', v_lead.campaign));

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'crm_lead.created', 'crm_lead', v_lead.id::text, jsonb_build_object('unitId', v_lead.unit_id, 'source', v_lead.source, 'stageId', v_lead.stage_id));

  return jsonb_build_object('id', v_lead.id, 'status', v_lead.status, 'stageId', v_lead.stage_id, 'createdAt', v_lead.created_at);
end;
$$;

create or replace function public.list_inventory_catalog(p_include_cost boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_can_cost boolean;
  v_items jsonb;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_can_cost := p_include_cost and security.has_permission(v_tenant_id, 'inventory.cost.read', false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'sku', i.sku,
    'name', i.name,
    'categoryId', i.category_id,
    'categoryName', c.name,
    'unit', i.unit,
    'status', i.status,
    'minimumQuantity', i.minimum_quantity,
    'defaultUnitCostCents', case when v_can_cost then i.default_unit_cost_cents else null end,
    'quantityOnHand', coalesce((select sum(s.quantity_on_hand) from public.inventory_stock_snapshots s where s.tenant_id = i.tenant_id and s.item_id = i.id), 0),
    'updatedAt', i.updated_at
  ) order by i.name), '[]'::jsonb) into v_items
  from public.inventory_items i
  left join public.inventory_categories c on c.tenant_id = i.tenant_id and c.id = i.category_id
  where i.tenant_id = v_tenant_id;

  return jsonb_build_object('items', v_items, 'costIncluded', v_can_cost);
end;
$$;

create or replace function public.list_inventory_lots(p_item_id uuid default null, p_location_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_lots jsonb;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);
  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'itemId', l.item_id,
    'locationId', l.location_id,
    'lotCode', l.lot_code,
    'expiresAt', l.expires_at,
    'status', l.status,
    'quantityOnHand', coalesce(s.quantity_on_hand, 0),
    'quantityReserved', coalesce(s.quantity_reserved, 0)
  ) order by l.expires_at nulls last, l.created_at desc), '[]'::jsonb) into v_lots
  from public.inventory_lots l
  left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.item_id = l.item_id and s.lot_id = l.id and (s.location_id is not distinct from l.location_id)
  where l.tenant_id = v_tenant_id
    and (p_item_id is null or l.item_id = p_item_id)
    and (p_location_id is null or l.location_id = p_location_id);

  return jsonb_build_object('lots', v_lots);
end;
$$;

create or replace function public.create_inventory_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_item public.inventory_items%rowtype;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);
  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.inventory_items (tenant_id, sku, name, category_id, unit, status, minimum_quantity, default_unit_cost_cents, metadata)
  values (v_tenant_id, nullif(p_payload->>'sku', ''), nullif(trim(p_payload->>'name'), ''), nullif(p_payload->>'categoryId', '')::uuid, coalesce(nullif(p_payload->>'unit', ''), 'unidade'), 'active', coalesce((p_payload->>'minimumQuantity')::numeric, 0), case when security.has_permission(v_tenant_id, 'inventory.cost.read', false) then nullif(p_payload->>'defaultUnitCostCents', '')::integer else null end, coalesce(p_payload->'metadata', '{}'::jsonb))
  returning * into v_item;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'inventory_item.created', 'inventory_item', v_item.id::text, jsonb_build_object('sku', v_item.sku, 'categoryId', v_item.category_id));

  return jsonb_build_object('id', v_item.id, 'name', v_item.name, 'createdAt', v_item.created_at);
end;
$$;

create or replace function public.list_inventory_alerts(p_days_to_expiry integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_alerts jsonb;
  v_days integer := least(greatest(coalesce(p_days_to_expiry, 30), 0), 365);
begin
  v_tenant_id := security.resolve_current_tenant(null, true);
  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(alert order by alert->>'severity' desc, alert->>'itemName'), '[]'::jsonb) into v_alerts
  from (
    select jsonb_build_object('type', 'minimum_stock', 'severity', 'high', 'itemId', i.id, 'itemName', i.name, 'quantityOnHand', coalesce(sum(s.quantity_on_hand), 0), 'minimumQuantity', i.minimum_quantity) as alert
    from public.inventory_items i
    left join public.inventory_stock_snapshots s on s.tenant_id = i.tenant_id and s.item_id = i.id
    where i.tenant_id = v_tenant_id and i.status = 'active'
    group by i.id, i.name, i.minimum_quantity
    having coalesce(sum(s.quantity_on_hand), 0) <= i.minimum_quantity
    union all
    select jsonb_build_object('type', 'lot_expiry', 'severity', case when l.expires_at < current_date then 'critical' else 'medium' end, 'itemId', l.item_id, 'lotId', l.id, 'lotCode', l.lot_code, 'expiresAt', l.expires_at)
    from public.inventory_lots l
    where l.tenant_id = v_tenant_id and l.status = 'active' and l.expires_at is not null and l.expires_at <= current_date + (v_days || ' days')::interval
  ) alerts;

  return jsonb_build_object('alerts', v_alerts, 'daysToExpiry', v_days);
end;
$$;

create or replace function public.emit_crm_operational_notifications(p_stalled_after interval default interval '7 days')
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_overdue_count integer := 0;
  v_stalled_count integer := 0;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'crm.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.notifications (tenant_id, user_id, title, body, category, status, metadata)
  select t.tenant_id, coalesce(t.assigned_to, l.owner_user_id, auth.uid()), 'Tarefa comercial vencida', 'Existe uma tarefa de CRM vencida.', 'crm', 'unread', jsonb_build_object('leadId', l.id, 'taskId', t.id, 'href', '/clinic/crm?leadId=' || l.id::text)
  from public.crm_lead_tasks t
  join public.crm_leads l on l.tenant_id = t.tenant_id and l.id = t.lead_id
  where t.tenant_id = v_tenant_id
    and t.status = 'open'
    and t.due_at < now()
    and public.has_unit_access(l.tenant_id, l.unit_id);
  get diagnostics v_overdue_count = row_count;

  update public.crm_lead_tasks
  set status = 'overdue', updated_at = now()
  where tenant_id = v_tenant_id and status = 'open' and due_at < now();

  insert into public.notifications (tenant_id, user_id, title, body, category, status, metadata)
  select l.tenant_id, coalesce(l.owner_user_id, auth.uid()), 'Lead parado no funil', 'Revise o proximo contato ou mova a etapa do lead.', 'crm', 'unread', jsonb_build_object('leadId', l.id, 'href', '/clinic/crm?leadId=' || l.id::text)
  from public.crm_leads l
  where l.tenant_id = v_tenant_id
    and l.status = 'open'
    and l.updated_at < now() - p_stalled_after
    and public.has_unit_access(l.tenant_id, l.unit_id);
  get diagnostics v_stalled_count = row_count;

  return jsonb_build_object('overdueTasks', v_overdue_count, 'stalledLeads', v_stalled_count);
end;
$$;

create or replace function public.list_inventory_operations_snapshot(p_include_cost boolean default false, p_days_to_expiry integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_can_cost boolean;
  v_days integer := least(greatest(coalesce(p_days_to_expiry, 30), 0), 365);
  v_items jsonb;
  v_categories jsonb;
  v_locations jsonb;
  v_lots jsonb;
  v_movements jsonb;
  v_alerts jsonb;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_cost := p_include_cost and security.has_permission(v_tenant_id, 'inventory.cost.read', false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'status', c.status
  ) order by c.name), '[]'::jsonb) into v_categories
  from public.inventory_categories c
  where c.tenant_id = v_tenant_id and c.status <> 'archived';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'unitId', l.unit_id,
    'code', l.code,
    'name', l.name,
    'status', l.status
  ) order by l.name), '[]'::jsonb) into v_locations
  from public.inventory_locations l
  where l.tenant_id = v_tenant_id
    and l.status <> 'archived'
    and public.has_unit_access(l.tenant_id, l.unit_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'sku', i.sku,
    'name', i.name,
    'categoryId', i.category_id,
    'categoryName', c.name,
    'unitId', i.unit_id,
    'unit', i.unit,
    'status', i.status,
    'minimumQuantity', i.minimum_quantity,
    'defaultUnitCostCents', case when v_can_cost then i.default_unit_cost_cents else null end,
    'quantityOnHand', coalesce(s.quantity_on_hand, 0),
    'quantityReserved', coalesce(s.quantity_reserved, 0),
    'updatedAt', i.updated_at
  ) order by i.name), '[]'::jsonb) into v_items
  from public.inventory_items i
  left join public.inventory_categories c on c.tenant_id = i.tenant_id and c.id = i.category_id
  left join lateral (
    select sum(ss.quantity_on_hand) as quantity_on_hand, sum(ss.quantity_reserved) as quantity_reserved
    from public.inventory_stock_snapshots ss
    left join public.inventory_locations sl on sl.tenant_id = ss.tenant_id and sl.id = ss.location_id
    where ss.tenant_id = i.tenant_id
      and ss.item_id = i.id
      and public.has_unit_access(ss.tenant_id, sl.unit_id)
  ) s on true
  where i.tenant_id = v_tenant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'itemId', l.item_id,
    'itemName', i.name,
    'locationId', l.location_id,
    'locationName', loc.name,
    'lotCode', l.lot_code,
    'expiresAt', l.expires_at,
    'receivedAt', l.received_at,
    'status', l.status,
    'unitCostCents', case when v_can_cost then l.unit_cost_cents else null end,
    'quantityOnHand', coalesce(s.quantity_on_hand, 0),
    'quantityReserved', coalesce(s.quantity_reserved, 0),
    'daysToExpiry', case when l.expires_at is null then null else l.expires_at - current_date end
  ) order by l.expires_at nulls last, i.name, l.lot_code), '[]'::jsonb) into v_lots
  from public.inventory_lots l
  join public.inventory_items i on i.tenant_id = l.tenant_id and i.id = l.item_id
  left join public.inventory_locations loc on loc.tenant_id = l.tenant_id and loc.id = l.location_id
  left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.item_id = l.item_id and s.lot_id = l.id and (s.location_id is not distinct from l.location_id)
  where l.tenant_id = v_tenant_id
    and public.has_unit_access(l.tenant_id, loc.unit_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'itemId', m.item_id,
    'itemName', i.name,
    'lotId', m.lot_id,
    'lotCode', lot.lot_code,
    'locationId', m.location_id,
    'locationName', loc.name,
    'movementType', m.movement_type,
    'direction', m.direction,
    'reason', m.reason,
    'quantity', m.quantity,
    'unitCostCents', case when v_can_cost then m.unit_cost_cents else null end,
    'createdBy', m.created_by,
    'occurredAt', m.occurred_at,
    'createdAt', m.created_at,
    'metadata', m.metadata
  ) order by m.occurred_at desc, m.created_at desc), '[]'::jsonb) into v_movements
  from (
    select *
    from public.inventory_movements
    where tenant_id = v_tenant_id
    order by occurred_at desc, created_at desc
    limit 80
  ) m
  join public.inventory_items i on i.tenant_id = m.tenant_id and i.id = m.item_id
  left join public.inventory_lots lot on lot.tenant_id = m.tenant_id and lot.id = m.lot_id
  left join public.inventory_locations loc on loc.tenant_id = m.tenant_id and loc.id = m.location_id
  where public.has_unit_access(m.tenant_id, loc.unit_id);

  select coalesce(jsonb_agg(alert order by alert->>'severity' desc, alert->>'itemName'), '[]'::jsonb) into v_alerts
  from (
    select jsonb_build_object(
      'type', 'minimum_stock',
      'severity', case when coalesce(sum(s.quantity_on_hand), 0) <= 0 then 'critical' else 'high' end,
      'itemId', i.id,
      'itemName', i.name,
      'quantityOnHand', coalesce(sum(s.quantity_on_hand), 0),
      'minimumQuantity', i.minimum_quantity,
      'href', '/clinic/inventory?itemId=' || i.id::text
    ) as alert
    from public.inventory_items i
    left join public.inventory_stock_snapshots s on s.tenant_id = i.tenant_id and s.item_id = i.id
    left join public.inventory_locations loc on loc.tenant_id = s.tenant_id and loc.id = s.location_id
    where i.tenant_id = v_tenant_id and i.status = 'active' and public.has_unit_access(i.tenant_id, loc.unit_id)
    group by i.id, i.name, i.minimum_quantity
    having coalesce(sum(s.quantity_on_hand), 0) <= i.minimum_quantity
    union all
    select jsonb_build_object(
      'type', 'lot_expiry',
      'severity', case when l.expires_at < current_date then 'critical' else 'medium' end,
      'itemId', l.item_id,
      'itemName', i.name,
      'lotId', l.id,
      'lotCode', l.lot_code,
      'expiresAt', l.expires_at,
      'quantityOnHand', coalesce(s.quantity_on_hand, 0),
      'href', '/clinic/inventory?lotId=' || l.id::text
    )
    from public.inventory_lots l
    join public.inventory_items i on i.tenant_id = l.tenant_id and i.id = l.item_id
    left join public.inventory_locations loc on loc.tenant_id = l.tenant_id and loc.id = l.location_id
    left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.item_id = l.item_id and s.lot_id = l.id and (s.location_id is not distinct from l.location_id)
    where l.tenant_id = v_tenant_id
      and l.status = 'active'
      and l.expires_at is not null
      and l.expires_at <= current_date + (v_days || ' days')::interval
      and public.has_unit_access(l.tenant_id, loc.unit_id)
  ) alerts;

  return jsonb_build_object(
    'items', v_items,
    'categories', v_categories,
    'locations', v_locations,
    'lots', v_lots,
    'movements', v_movements,
    'alerts', v_alerts,
    'costIncluded', v_can_cost,
    'daysToExpiry', v_days
  );
end;
$$;

create or replace function public.upsert_inventory_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_item_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_item public.inventory_items%rowtype;
  v_category_id uuid := nullif(p_payload->>'categoryId', '')::uuid;
  v_unit_id uuid := nullif(p_payload->>'unitId', '')::uuid;
  v_can_cost boolean;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if nullif(trim(p_payload->>'name'), '') is null then
    raise exception 'item_name_required' using errcode = '22023';
  end if;
  if v_category_id is not null and not exists (select 1 from public.inventory_categories where tenant_id = v_tenant_id and id = v_category_id) then
    raise exception 'invalid_inventory_category' using errcode = '22023';
  end if;
  if v_unit_id is not null and not public.has_unit_access(v_tenant_id, v_unit_id) then
    raise exception 'forbidden_unit' using errcode = '42501';
  end if;

  v_can_cost := security.has_permission(v_tenant_id, 'inventory.cost.read', false);

  if v_item_id is null then
    insert into public.inventory_items (tenant_id, sku, name, category_id, unit_id, unit, status, minimum_quantity, default_unit_cost_cents, metadata)
    values (
      v_tenant_id,
      nullif(trim(p_payload->>'sku'), ''),
      left(trim(p_payload->>'name'), 180),
      v_category_id,
      v_unit_id,
      coalesce(nullif(trim(p_payload->>'unit'), ''), 'unidade'),
      coalesce(nullif(p_payload->>'status', ''), 'active'),
      coalesce(nullif(p_payload->>'minimumQuantity', '')::numeric, 0),
      case when v_can_cost then nullif(p_payload->>'defaultUnitCostCents', '')::integer else null end,
      coalesce(p_payload->'metadata', '{}'::jsonb)
    ) returning * into v_item;

    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    values (v_tenant_id, auth.uid(), 'inventory_item.created', 'inventory_item', v_item.id::text, jsonb_build_object('sku', v_item.sku, 'categoryId', v_item.category_id));
  else
    update public.inventory_items
    set sku = nullif(trim(p_payload->>'sku'), ''),
        name = left(trim(p_payload->>'name'), 180),
        category_id = v_category_id,
        unit_id = v_unit_id,
        unit = coalesce(nullif(trim(p_payload->>'unit'), ''), unit),
        status = coalesce(nullif(p_payload->>'status', ''), status),
        minimum_quantity = coalesce(nullif(p_payload->>'minimumQuantity', '')::numeric, minimum_quantity),
        default_unit_cost_cents = case when v_can_cost then nullif(p_payload->>'defaultUnitCostCents', '')::integer else default_unit_cost_cents end,
        metadata = metadata || coalesce(p_payload->'metadata', '{}'::jsonb),
        updated_at = now()
    where tenant_id = v_tenant_id and id = v_item_id
    returning * into v_item;

    if v_item.id is null then
      raise exception 'inventory_item_not_found' using errcode = 'P0002';
    end if;

    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    values (v_tenant_id, auth.uid(), 'inventory_item.updated', 'inventory_item', v_item.id::text, jsonb_build_object('sku', v_item.sku, 'categoryId', v_item.category_id, 'status', v_item.status));
  end if;

  return jsonb_build_object('id', v_item.id, 'name', v_item.name, 'status', v_item.status, 'updatedAt', v_item.updated_at);
end;
$$;

create or replace function public.create_inventory_lot(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_item_id uuid := nullif(p_payload->>'itemId', '')::uuid;
  v_location_id uuid := nullif(p_payload->>'locationId', '')::uuid;
  v_location_unit_id uuid;
  v_lot public.inventory_lots%rowtype;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_item_id is null or not exists (select 1 from public.inventory_items where tenant_id = v_tenant_id and id = v_item_id) then
    raise exception 'inventory_item_not_found' using errcode = 'P0002';
  end if;
  if v_location_id is not null then
    select unit_id into v_location_unit_id from public.inventory_locations where tenant_id = v_tenant_id and id = v_location_id;
    if v_location_unit_id is null and not exists (select 1 from public.inventory_locations where tenant_id = v_tenant_id and id = v_location_id) then
      raise exception 'inventory_location_not_found' using errcode = 'P0002';
    end if;
    if not public.has_unit_access(v_tenant_id, v_location_unit_id) then
      raise exception 'forbidden_unit' using errcode = '42501';
    end if;
  end if;

  insert into public.inventory_lots (tenant_id, item_id, location_id, lot_code, expires_at, received_at, status, unit_cost_cents, metadata)
  values (
    v_tenant_id,
    v_item_id,
    v_location_id,
    nullif(trim(p_payload->>'lotCode'), ''),
    nullif(p_payload->>'expiresAt', '')::date,
    coalesce(nullif(p_payload->>'receivedAt', '')::date, current_date),
    coalesce(nullif(p_payload->>'status', ''), 'active'),
    case when security.has_permission(v_tenant_id, 'inventory.cost.read', false) then nullif(p_payload->>'unitCostCents', '')::integer else null end,
    coalesce(p_payload->'metadata', '{}'::jsonb)
  ) returning * into v_lot;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'inventory_lot.created', 'inventory_lot', v_lot.id::text, jsonb_build_object('itemId', v_item_id, 'locationId', v_location_id, 'expiresAt', v_lot.expires_at));

  return jsonb_build_object('id', v_lot.id, 'itemId', v_lot.item_id, 'lotCode', v_lot.lot_code, 'expiresAt', v_lot.expires_at, 'locationId', v_lot.location_id);
end;
$$;

create or replace function public.create_inventory_movement(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_item_id uuid := nullif(p_payload->>'itemId', '')::uuid;
  v_location_id uuid := nullif(p_payload->>'locationId', '')::uuid;
  v_lot_id uuid := nullif(p_payload->>'lotId', '')::uuid;
  v_direction text := coalesce(nullif(p_payload->>'direction', ''), 'in');
  v_reason text := coalesce(nullif(p_payload->>'reason', ''), 'adjustment');
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, 0);
  v_current numeric;
  v_delta numeric;
  v_movement_id uuid;
  v_required_permission text;
  v_location_unit_id uuid;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);

  v_required_permission := case
    when v_reason in ('transfer_in', 'transfer_out') then 'inventory.transfer'
    else 'inventory.adjust'
  end;
  if v_tenant_id is null or not security.has_permission(v_tenant_id, v_required_permission, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_item_id is null
    or v_quantity <= 0
    or v_direction not in ('in', 'out')
    or v_reason not in (
      'receipt',
      'consumption',
      'loss',
      'adjustment',
      'transfer_in',
      'transfer_out',
      'reservation',
      'release'
    )
  then
    raise exception 'invalid_inventory_movement' using errcode = '22023';
  end if;
  if nullif(trim(p_payload->>'reasonNote'), '') is null then
    raise exception 'inventory_reason_note_required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.inventory_items
    where tenant_id = v_tenant_id and id = v_item_id and status = 'active'
  ) then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  if v_location_id is not null then
    select unit_id into v_location_unit_id
    from public.inventory_locations
    where tenant_id = v_tenant_id and id = v_location_id;
    if not found then
      raise exception 'inventory_location_not_found' using errcode = 'P0002';
    end if;
    if not public.has_unit_access(v_tenant_id, v_location_unit_id) then
      raise exception 'forbidden_unit' using errcode = '42501';
    end if;
  end if;
  if v_lot_id is not null and not exists (
    select 1
    from public.inventory_lots
    where tenant_id = v_tenant_id
      and id = v_lot_id
      and item_id = v_item_id
      and (location_id is not distinct from v_location_id)
  ) then
    raise exception 'inventory_lot_not_found' using errcode = 'P0002';
  end if;

  v_delta := case when v_direction = 'in' then v_quantity else -v_quantity end;

  select coalesce(quantity_on_hand, 0)
    into v_current
  from public.inventory_stock_snapshots
  where tenant_id = v_tenant_id
    and item_id = v_item_id
    and (location_id is not distinct from v_location_id)
    and (lot_id is not distinct from v_lot_id)
  for update;

  v_current := coalesce(v_current, 0);
  if v_current + v_delta < 0 then
    raise exception 'negative_stock_blocked' using errcode = '23514';
  end if;

  insert into public.inventory_stock_snapshots (
    tenant_id,
    item_id,
    location_id,
    lot_id,
    quantity_on_hand,
    quantity_reserved
  )
  values (v_tenant_id, v_item_id, v_location_id, v_lot_id, greatest(v_delta, 0), 0)
  on conflict (tenant_id, item_id, location_id, lot_id) do update
  set quantity_on_hand = public.inventory_stock_snapshots.quantity_on_hand + v_delta,
      updated_at = now()
  returning quantity_on_hand into v_current;

  insert into public.inventory_movements (
    tenant_id,
    item_id,
    lot_id,
    location_id,
    movement_type,
    direction,
    reason,
    quantity,
    unit_cost_cents,
    related_patient_id,
    reference_type,
    reference_id,
    created_by,
    metadata,
    occurred_at
  )
  values (
    v_tenant_id,
    v_item_id,
    v_lot_id,
    v_location_id,
    case
      when v_reason like 'transfer%' then 'transfer'
      when v_reason = 'adjustment' then 'adjustment'
      when v_direction = 'in' then 'in'
      else 'out'
    end,
    v_direction,
    v_reason,
    v_quantity,
    case
      when security.has_permission(v_tenant_id, 'inventory.cost.read', false)
        then nullif(p_payload->>'unitCostCents', '')::integer
      else null
    end,
    nullif(p_payload->>'patientId', '')::uuid,
    nullif(p_payload->>'referenceType', ''),
    nullif(p_payload->>'referenceId', '')::uuid,
    auth.uid(),
    coalesce(p_payload->'metadata', '{}'::jsonb)
      || jsonb_build_object('reasonNote', left(trim(p_payload->>'reasonNote'), 500)),
    coalesce(nullif(p_payload->>'occurredAt', '')::timestamptz, now())
  ) returning id into v_movement_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    auth.uid(),
    'inventory_movement.created',
    'inventory_movement',
    v_movement_id::text,
    jsonb_build_object(
      'itemId',
      v_item_id,
      'locationId',
      v_location_id,
      'lotId',
      v_lot_id,
      'direction',
      v_direction,
      'reason',
      v_reason,
      'quantity',
      v_quantity,
      'quantityOnHand',
      v_current
    )
  );

  if v_reason in ('loss', 'adjustment', 'transfer_in', 'transfer_out') then
    insert into public.notifications (tenant_id, user_id, title, body, category, status, metadata)
    values (
      v_tenant_id,
      auth.uid(),
      'Movimentacao de estoque registrada',
      'Uma movimentacao sensivel de estoque foi auditada.',
      'inventory',
      'unread',
      jsonb_build_object('movementId', v_movement_id, 'itemId', v_item_id, 'href', '/clinic/inventory')
    );
  end if;

  return jsonb_build_object('id', v_movement_id, 'itemId', v_item_id, 'quantityOnHand', v_current);
end;
$$;

create or replace function public.emit_inventory_operational_notifications(p_days_to_expiry integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_alerts jsonb;
  v_inserted integer := 0;
  v_alert jsonb;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_alerts := (public.list_inventory_operations_snapshot(false, p_days_to_expiry)->'alerts');

  for v_alert in select * from jsonb_array_elements(v_alerts)
  loop
    insert into public.notifications (tenant_id, user_id, title, body, category, status, metadata)
    values (
      v_tenant_id,
      auth.uid(),
      case when v_alert->>'type' = 'minimum_stock' then 'Estoque abaixo do minimo' else 'Lote com validade critica' end,
      case when v_alert->>'type' = 'minimum_stock' then 'Revise reposicao do item em estoque.' else 'Revise lote vencido ou proximo do vencimento.' end,
      'inventory',
      'unread',
      v_alert
    );
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'alerts', jsonb_array_length(v_alerts));
end;
$$;

create or replace function public.get_crm_inventory_dashboard_insights(p_days_to_expiry integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_days integer := least(greatest(coalesce(p_days_to_expiry, 30), 0), 365);
  v_can_crm boolean := false;
  v_can_inventory boolean := false;
  v_open_leads integer := 0;
  v_overdue_tasks integer := 0;
  v_critical_stock integer := 0;
  v_expiring_lots integer := 0;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);

  if v_tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_crm := security.has_permission(v_tenant_id, 'crm.read', false);
  v_can_inventory := security.has_permission(v_tenant_id, 'inventory.read', false);

  if v_can_crm then
    select count(*)::integer into v_open_leads
    from public.crm_leads l
    where l.tenant_id = v_tenant_id
      and l.status = 'open'
      and public.has_unit_access(l.tenant_id, l.unit_id);

    select count(*)::integer into v_overdue_tasks
    from public.crm_lead_tasks t
    join public.crm_leads l on l.tenant_id = t.tenant_id and l.id = t.lead_id
    where t.tenant_id = v_tenant_id
      and t.status in ('open', 'overdue')
      and t.due_at < now()
      and public.has_unit_access(l.tenant_id, l.unit_id);
  end if;

  if v_can_inventory then
    select count(*)::integer into v_critical_stock
    from (
      select i.id
      from public.inventory_items i
      left join public.inventory_stock_snapshots s on s.tenant_id = i.tenant_id and s.item_id = i.id
      left join public.inventory_locations loc on loc.tenant_id = s.tenant_id and loc.id = s.location_id
      where i.tenant_id = v_tenant_id
        and i.status = 'active'
        and public.has_unit_access(i.tenant_id, loc.unit_id)
      group by i.id, i.minimum_quantity
      having coalesce(sum(s.quantity_on_hand), 0) <= i.minimum_quantity
    ) critical_items;

    select count(*)::integer into v_expiring_lots
    from public.inventory_lots l
    join public.inventory_items i on i.tenant_id = l.tenant_id and i.id = l.item_id
    left join public.inventory_locations loc on loc.tenant_id = l.tenant_id and loc.id = l.location_id
    left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.item_id = l.item_id and s.lot_id = l.id and (s.location_id is not distinct from l.location_id)
    where l.tenant_id = v_tenant_id
      and l.status = 'active'
      and l.expires_at is not null
      and l.expires_at <= current_date + (v_days || ' days')::interval
      and coalesce(s.quantity_on_hand, 0) > 0
      and public.has_unit_access(l.tenant_id, loc.unit_id);
  end if;

  return jsonb_build_object(
    'crm', jsonb_build_object(
      'canRead', v_can_crm,
      'openLeads', v_open_leads,
      'overdueTasks', v_overdue_tasks,
      'href', '/clinic/crm'
    ),
    'inventory', jsonb_build_object(
      'canRead', v_can_inventory,
      'criticalStockItems', v_critical_stock,
      'expiringLots', v_expiring_lots,
      'daysToExpiry', v_days,
      'href', '/clinic/inventory'
    )
  );
end;
$$;

create or replace function public.get_crm_inventory_governance_snapshot(p_days_to_expiry integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_days integer := least(greatest(coalesce(p_days_to_expiry, 30), 0), 365);
  v_can_crm boolean := false;
  v_can_inventory boolean := false;
  v_crm jsonb := '{}'::jsonb;
  v_inventory jsonb := '{}'::jsonb;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);

  if v_tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_crm := security.has_permission(v_tenant_id, 'crm.read', false);
  v_can_inventory := security.has_permission(v_tenant_id, 'inventory.read', false);

  if v_can_crm then
    select jsonb_build_object(
      'openLeads', count(*) filter (where l.status = 'open'),
      'convertedLeads', count(*) filter (where l.status = 'converted'),
      'optedOutLeads', count(*) filter (where l.opt_out_at is not null or l.contact_consent = false),
      'retentionDueLeads', count(*) filter (where l.status <> 'converted' and l.retention_expires_at is not null and l.retention_expires_at <= now()),
      'retentionDueWithAttachments', count(*) filter (
        where l.status <> 'converted'
          and l.retention_expires_at is not null
          and l.retention_expires_at <= now()
          and exists (
            select 1 from public.crm_lead_attachments a
            where a.tenant_id = l.tenant_id and a.lead_id = l.id
          )
      )
    ) into v_crm
    from public.crm_leads l
    where l.tenant_id = v_tenant_id
      and public.has_unit_access(l.tenant_id, l.unit_id);
  end if;

  if v_can_inventory then
    select jsonb_build_object(
      'expiredActiveLots', count(*) filter (where l.expires_at < current_date and coalesce(s.quantity_on_hand, 0) > 0),
      'expiringLots', count(*) filter (where l.expires_at >= current_date and l.expires_at <= current_date + (v_days || ' days')::interval and coalesce(s.quantity_on_hand, 0) > 0),
      'negativeSnapshots', count(*) filter (where coalesce(s.quantity_on_hand, 0) < 0),
      'sensitiveMovementsWithoutReasonNote', (
        select count(*)
        from public.inventory_movements m
        left join public.inventory_locations ml on ml.tenant_id = m.tenant_id and ml.id = m.location_id
        where m.tenant_id = v_tenant_id
          and m.reason in ('loss', 'adjustment', 'transfer_in', 'transfer_out')
          and nullif(trim(m.metadata->>'reasonNote'), '') is null
          and public.has_unit_access(m.tenant_id, ml.unit_id)
      )
    ) into v_inventory
    from public.inventory_lots l
    join public.inventory_items i on i.tenant_id = l.tenant_id and i.id = l.item_id
    left join public.inventory_locations loc on loc.tenant_id = l.tenant_id and loc.id = l.location_id
    left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.item_id = l.item_id and s.lot_id = l.id and (s.location_id is not distinct from l.location_id)
    where l.tenant_id = v_tenant_id
      and l.status = 'active'
      and public.has_unit_access(l.tenant_id, loc.unit_id);
  end if;

  return jsonb_build_object(
    'crm', coalesce(v_crm, '{}'::jsonb) || jsonb_build_object('canRead', v_can_crm),
    'inventory', coalesce(v_inventory, '{}'::jsonb) || jsonb_build_object('canRead', v_can_inventory, 'daysToExpiry', v_days)
  );
end;
$$;
