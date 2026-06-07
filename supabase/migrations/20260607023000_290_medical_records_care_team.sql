-- M08 - Medical records, longitudinal notes, care team and record audit.

create table public.medical_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  status text not null default 'active' check (status in ('active', 'locked', 'archived')),
  opened_at timestamptz not null default now(),
  opened_by uuid references public.profiles(id) on delete set null,
  last_accessed_at timestamptz,
  last_written_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id),
  constraint medical_records_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  medical_record_id uuid not null,
  encounter_id uuid,
  soap_note_id uuid,
  note_type text not null default 'evolution'
    check (note_type in ('encounter', 'evolution', 'team_note', 'attachment_note', 'system')),
  status text not null default 'final' check (status in ('draft', 'final', 'amended', 'void')),
  title text not null,
  summary text,
  body text,
  authored_by uuid references public.profiles(id) on delete set null,
  signed_at timestamptz,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint clinical_notes_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint clinical_notes_record_same_tenant
    foreign key (tenant_id, medical_record_id)
    references public.medical_records(tenant_id, id)
    on delete cascade,
  constraint clinical_notes_encounter_same_tenant
    foreign key (tenant_id, encounter_id)
    references public.encounters(tenant_id, id),
  constraint clinical_notes_soap_same_tenant
    foreign key (tenant_id, soap_note_id)
    references public.soap_notes(tenant_id, id)
);

create table public.record_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  medical_record_id uuid not null,
  clinical_note_id uuid,
  storage_bucket text not null default 'clinical-attachments'
    check (storage_bucket = 'clinical-attachments'),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status text not null default 'uploaded'
    check (status in ('pending', 'uploaded', 'deleted', 'failed')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (storage_bucket, storage_path),
  constraint record_attachments_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint record_attachments_record_same_tenant
    foreign key (tenant_id, medical_record_id)
    references public.medical_records(tenant_id, id)
    on delete cascade,
  constraint record_attachments_note_same_tenant
    foreign key (tenant_id, clinical_note_id)
    references public.clinical_notes(tenant_id, id)
    on delete set null,
  constraint record_attachments_storage_path_shape
    check (
      security.is_valid_clinical_storage_path(storage_path)
      and storage_path = tenant_id::text || '/' || patient_id::text || '/' || id::text || '/' || split_part(storage_path, '/', 4)
    )
);

create table public.record_access_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  medical_record_id uuid,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (
    action in (
      'record_initialized',
      'record_opened',
      'record_read',
      'record_written',
      'note_created',
      'note_updated',
      'attachment_added',
      'team_member_added',
      'team_member_removed',
      'team_member_updated',
      'encounter_autosaved',
      'encounter_finalized'
    )
  ),
  entity_type text,
  entity_id text,
  access_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint record_access_audit_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint record_access_audit_record_same_tenant
    foreign key (tenant_id, medical_record_id)
    references public.medical_records(tenant_id, id)
    on delete set null
);

create table public.patient_care_team (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  membership_id uuid not null,
  user_id uuid not null,
  role_code text not null,
  role_label text,
  specialty text,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive', 'removed')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  assigned_by uuid references public.profiles(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_care_team_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint patient_care_team_membership_same_tenant
    foreign key (tenant_id, membership_id)
    references public.tenant_memberships(tenant_id, id)
    on delete cascade,
  constraint patient_care_team_user_same_tenant
    foreign key (tenant_id, user_id)
    references public.tenant_memberships(tenant_id, user_id)
    on delete cascade
);

create unique index idx_clinical_notes_soap_unique
  on public.clinical_notes(tenant_id, soap_note_id)
  where soap_note_id is not null;

create unique index idx_patient_care_team_active_member
  on public.patient_care_team(tenant_id, patient_id, membership_id)
  where status = 'active';

create unique index idx_patient_care_team_primary_member
  on public.patient_care_team(tenant_id, patient_id)
  where status = 'active' and is_primary = true;

create index idx_medical_records_patient on public.medical_records(tenant_id, patient_id);
create index idx_clinical_notes_record_created_at
  on public.clinical_notes(tenant_id, medical_record_id, created_at desc);
create index idx_record_attachments_record_created_at
  on public.record_attachments(tenant_id, medical_record_id, created_at desc);
create index idx_record_access_audit_record_created_at
  on public.record_access_audit(tenant_id, medical_record_id, created_at desc);
create index idx_patient_care_team_patient_status
  on public.patient_care_team(tenant_id, patient_id, status);

select security.touch_updated_at('public.medical_records');
select security.touch_updated_at('public.clinical_notes');
select security.touch_updated_at('public.record_attachments');
select security.touch_updated_at('public.patient_care_team');

create or replace function security.resolve_record_tenant(p_patient_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_patient_id is not null then
    select p.tenant_id
      into v_tenant_id
    from public.patients p
    join public.tenant_memberships tm
      on tm.tenant_id = p.tenant_id
     and tm.user_id = v_user_id
     and tm.status = 'active'
    join public.profiles profile
      on profile.id = tm.user_id
     and profile.is_active = true
    where p.id = p_patient_id
    limit 1;

    if v_tenant_id is null then
      raise exception 'patient_not_found_or_forbidden' using errcode = '42501';
    end if;

    return v_tenant_id;
  end if;

  select profile.active_tenant_id
    into v_tenant_id
  from public.profiles profile
  join public.tenant_memberships tm
    on tm.tenant_id = profile.active_tenant_id
   and tm.user_id = profile.id
   and tm.status = 'active'
  where profile.id = v_user_id
    and profile.is_active = true
    and profile.active_tenant_id is not null
  limit 1;

  if v_tenant_id is null then
    select tm.tenant_id
      into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles profile
      on profile.id = tm.user_id
     and profile.is_active = true
    where tm.user_id = v_user_id
      and tm.status = 'active'
    order by tm.created_at asc
    limit 1;
  end if;

  if v_tenant_id is null then
    raise exception 'no_active_tenant' using errcode = '42501';
  end if;

  return v_tenant_id;
end;
$$;

create or replace function security.can_manage_patient_care_team(
  p_tenant_id uuid,
  p_patient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.patients p
    where p.tenant_id = p_tenant_id
      and p.id = p_patient_id
  )
  and (
    security.can_manage_tenant(p_tenant_id)
    or security.has_permission(p_tenant_id, 'patients.write', false)
    or security.has_permission(p_tenant_id, 'encounters.write', false)
  );
$$;

create or replace function security.can_access_patient_record(
  p_tenant_id uuid,
  p_patient_id uuid,
  p_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.patients p
    where p.tenant_id = p_tenant_id
      and p.id = p_patient_id
  )
  and (
    case
      when p_write then (
        security.has_permission(p_tenant_id, 'encounters.write', false)
        or security.has_permission(p_tenant_id, 'soap.write', false)
        or security.has_permission(p_tenant_id, 'patients.write', false)
      )
      else (
        security.has_permission(p_tenant_id, 'patients.read', false)
        and (
          security.has_permission(p_tenant_id, 'encounters.read', false)
          or security.has_permission(p_tenant_id, 'soap.read', false)
          or security.has_permission(p_tenant_id, 'nutrition.read', false)
          or security.has_permission(p_tenant_id, 'prescriptions.read', false)
          or security.has_permission(p_tenant_id, 'timeline.sensitive.read', false)
        )
      )
    end
  )
  and (
    security.can_manage_tenant(p_tenant_id)
    or not exists (
      select 1
      from public.patient_care_team pct
      where pct.tenant_id = p_tenant_id
        and pct.patient_id = p_patient_id
        and pct.status = 'active'
    )
    or exists (
      select 1
      from public.patient_care_team pct
      where pct.tenant_id = p_tenant_id
        and pct.patient_id = p_patient_id
        and pct.status = 'active'
        and pct.user_id = auth.uid()
    )
  );
$$;

create or replace function security.record_audit(
  p_tenant_id uuid,
  p_patient_id uuid,
  p_record_id uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.record_access_audit (
    tenant_id,
    patient_id,
    medical_record_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_tenant_id,
    p_patient_id,
    p_record_id,
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.initialize_medical_record(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_record_tenant(p_patient_id);
  v_user_id uuid := auth.uid();
  v_record public.medical_records%rowtype;
  v_created boolean := false;
begin
  if not security.can_access_patient_record(v_tenant_id, p_patient_id, false) then
    raise exception 'record_read_required' using errcode = '42501';
  end if;

  select *
    into v_record
  from public.medical_records
  where tenant_id = v_tenant_id
    and patient_id = p_patient_id
  for update;

  if not found then
    insert into public.medical_records (
      tenant_id,
      patient_id,
      opened_by,
      last_accessed_at,
      metadata
    )
    values (
      v_tenant_id,
      p_patient_id,
      v_user_id,
      now(),
      jsonb_build_object('source', 'initialize_medical_record')
    )
    returning * into v_record;
    v_created := true;
  else
    update public.medical_records
       set last_accessed_at = now(),
           opened_by = coalesce(opened_by, v_user_id),
           updated_at = now()
     where tenant_id = v_tenant_id
       and id = v_record.id
     returning * into v_record;
  end if;

  perform security.record_audit(
    v_tenant_id,
    p_patient_id,
    v_record.id,
    case when v_created then 'record_initialized' else 'record_opened' end,
    'medical_record',
    v_record.id::text,
    jsonb_build_object('created', v_created)
  );

  return jsonb_build_object(
    'recordId', v_record.id,
    'tenantId', v_tenant_id,
    'patientId', p_patient_id,
    'status', v_record.status,
    'created', v_created,
    'openedAt', v_record.opened_at,
    'lastAccessedAt', v_record.last_accessed_at,
    'lastWrittenAt', v_record.last_written_at
  );
end;
$$;

create or replace function public.autosave_encounter(
  p_patient_id uuid,
  p_encounter_id uuid default null,
  p_appointment_id uuid default null,
  p_soap_note_id uuid default null,
  p_subjective text default '',
  p_objective text default '',
  p_assessment text default '',
  p_plan text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_record_tenant(p_patient_id);
  v_user_id uuid := auth.uid();
  v_record_id uuid;
  v_encounter public.encounters%rowtype;
  v_soap public.soap_notes%rowtype;
  v_now timestamptz := now();
begin
  if not security.can_access_patient_record(v_tenant_id, p_patient_id, true) then
    raise exception 'record_write_required' using errcode = '42501';
  end if;

  if not security.has_permission(v_tenant_id, 'soap.write', false) then
    raise exception 'soap_write_required' using errcode = '42501';
  end if;

  select (public.initialize_medical_record(p_patient_id) ->> 'recordId')::uuid
    into v_record_id;

  if p_encounter_id is not null then
    select *
      into v_encounter
    from public.encounters
    where tenant_id = v_tenant_id
      and patient_id = p_patient_id
      and id = p_encounter_id
    for update;

    if not found then
      raise exception 'encounter_not_found_or_forbidden' using errcode = '42501';
    end if;
  elsif p_appointment_id is not null then
    select *
      into v_encounter
    from public.encounters
    where tenant_id = v_tenant_id
      and patient_id = p_patient_id
      and appointment_id = p_appointment_id
      and status in ('open', 'in_progress')
    order by updated_at desc
    limit 1
    for update;
  end if;

  if v_encounter.id is null then
    select *
      into v_encounter
    from public.encounters
    where tenant_id = v_tenant_id
      and patient_id = p_patient_id
      and status in ('open', 'in_progress')
    order by updated_at desc
    limit 1
    for update;
  end if;

  if v_encounter.id is null then
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
      p_patient_id,
      p_appointment_id,
      'open',
      'clinic_visit',
      v_now,
      v_user_id
    )
    returning * into v_encounter;
  elsif v_encounter.status = 'closed' then
    raise exception 'encounter_already_finalized' using errcode = '22023';
  else
    update public.encounters
       set status = case when status = 'open' then 'open' else status end,
           started_at = coalesce(started_at, v_now),
           updated_at = v_now
     where tenant_id = v_tenant_id
       and id = v_encounter.id
     returning * into v_encounter;
  end if;

  if p_soap_note_id is not null then
    select *
      into v_soap
    from public.soap_notes
    where tenant_id = v_tenant_id
      and patient_id = p_patient_id
      and id = p_soap_note_id
    for update;

    if not found then
      raise exception 'soap_note_not_found_or_forbidden' using errcode = '42501';
    end if;

    if v_soap.status = 'final' then
      raise exception 'soap_note_already_finalized' using errcode = '22023';
    end if;
  else
    select *
      into v_soap
    from public.soap_notes
    where tenant_id = v_tenant_id
      and patient_id = p_patient_id
      and encounter_id = v_encounter.id
      and status = 'draft'
    order by updated_at desc
    limit 1
    for update;
  end if;

  if v_soap.id is null then
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
      p_patient_id,
      v_encounter.id,
      'draft',
      coalesce(p_subjective, ''),
      coalesce(p_objective, ''),
      coalesce(p_assessment, ''),
      coalesce(p_plan, ''),
      v_user_id,
      v_now,
      v_now
    )
    returning * into v_soap;
  else
    update public.soap_notes
       set encounter_id = coalesce(encounter_id, v_encounter.id),
           status = 'draft',
           subjective = coalesce(p_subjective, ''),
           objective = coalesce(p_objective, ''),
           assessment = coalesce(p_assessment, ''),
           plan = coalesce(p_plan, ''),
           authored_by = coalesce(authored_by, v_user_id),
           updated_at = v_now
     where tenant_id = v_tenant_id
       and id = v_soap.id
     returning * into v_soap;
  end if;

  update public.medical_records
     set last_written_at = v_now,
         updated_at = v_now
   where tenant_id = v_tenant_id
     and id = v_record_id;

  perform security.record_audit(
    v_tenant_id,
    p_patient_id,
    v_record_id,
    'encounter_autosaved',
    'soap_note',
    v_soap.id::text,
    jsonb_build_object('encounterId', v_encounter.id, 'status', 'draft')
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'soap_draft_saved',
    'soap_note',
    v_soap.id::text,
    jsonb_build_object('patientId', p_patient_id, 'encounterId', v_encounter.id, 'source', 'autosave_encounter')
  );

  return jsonb_build_object(
    'recordId', v_record_id,
    'encounterId', v_encounter.id,
    'soapNoteId', v_soap.id,
    'status', 'draft',
    'savedAt', v_now
  );
end;
$$;

create or replace function public.create_note_from_encounter(
  p_encounter_id uuid,
  p_soap_note_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
  v_encounter public.encounters%rowtype;
  v_soap public.soap_notes%rowtype;
  v_record_id uuid;
  v_note public.clinical_notes%rowtype;
  v_now timestamptz := now();
  v_summary text;
  v_body text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select *
    into v_encounter
  from public.encounters
  where id = p_encounter_id
  limit 1;

  if not found then
    raise exception 'encounter_not_found_or_forbidden' using errcode = '42501';
  end if;

  v_tenant_id := security.resolve_record_tenant(v_encounter.patient_id);

  if v_encounter.tenant_id <> v_tenant_id then
    raise exception 'encounter_not_found_or_forbidden' using errcode = '42501';
  end if;

  if not security.can_access_patient_record(v_tenant_id, v_encounter.patient_id, true) then
    raise exception 'record_write_required' using errcode = '42501';
  end if;

  if p_soap_note_id is not null then
    select *
      into v_soap
    from public.soap_notes
    where tenant_id = v_tenant_id
      and patient_id = v_encounter.patient_id
      and encounter_id = v_encounter.id
      and id = p_soap_note_id
    limit 1;
  else
    select *
      into v_soap
    from public.soap_notes
    where tenant_id = v_tenant_id
      and patient_id = v_encounter.patient_id
      and encounter_id = v_encounter.id
    order by updated_at desc
    limit 1;
  end if;

  if not found then
    raise exception 'soap_note_not_found_or_forbidden' using errcode = '42501';
  end if;

  select (public.initialize_medical_record(v_encounter.patient_id) ->> 'recordId')::uuid
    into v_record_id;

  v_summary := nullif(
    trim(
      concat_ws(
        ' ',
        nullif(v_soap.assessment, ''),
        nullif(v_soap.plan, '')
      )
    ),
    ''
  );
  v_body := concat_ws(
    E'\n\n',
    'S - Subjetivo: ' || coalesce(nullif(v_soap.subjective, ''), 'Nao informado.'),
    'O - Objetivo: ' || coalesce(nullif(v_soap.objective, ''), 'Nao informado.'),
    'A - Avaliacao: ' || coalesce(nullif(v_soap.assessment, ''), 'Nao informado.'),
    'P - Plano: ' || coalesce(nullif(v_soap.plan, ''), 'Nao informado.')
  );

  select *
    into v_note
  from public.clinical_notes
  where tenant_id = v_tenant_id
    and soap_note_id = v_soap.id
  for update;

  if v_note.id is null then
    insert into public.clinical_notes (
      tenant_id,
      patient_id,
      medical_record_id,
      encounter_id,
      soap_note_id,
      note_type,
      status,
      title,
      summary,
      body,
      authored_by,
      signed_at,
      source,
      metadata
    )
    values (
      v_tenant_id,
      v_encounter.patient_id,
      v_record_id,
      v_encounter.id,
      v_soap.id,
      'encounter',
      'final',
      'Atendimento SOAP',
      left(coalesce(v_summary, 'Atendimento SOAP finalizado.'), 600),
      v_body,
      coalesce(v_soap.authored_by, v_user_id),
      v_now,
      'encounter_soap',
      jsonb_build_object('soapNoteId', v_soap.id, 'encounterId', v_encounter.id)
    )
    returning * into v_note;
  else
    update public.clinical_notes
       set status = 'final',
           summary = left(coalesce(v_summary, 'Atendimento SOAP finalizado.'), 600),
           body = v_body,
           signed_at = coalesce(signed_at, v_now),
           updated_at = v_now,
           metadata = metadata || jsonb_build_object('refreshedFromSoapAt', v_now)
     where tenant_id = v_tenant_id
       and id = v_note.id
     returning * into v_note;
  end if;

  update public.medical_records
     set last_written_at = v_now,
         updated_at = v_now
   where tenant_id = v_tenant_id
     and id = v_record_id;

  perform security.record_audit(
    v_tenant_id,
    v_encounter.patient_id,
    v_record_id,
    case when v_note.created_at = v_note.updated_at then 'note_created' else 'note_updated' end,
    'clinical_note',
    v_note.id::text,
    jsonb_build_object('encounterId', v_encounter.id, 'soapNoteId', v_soap.id)
  );

  return jsonb_build_object(
    'recordId', v_record_id,
    'noteId', v_note.id,
    'encounterId', v_encounter.id,
    'soapNoteId', v_soap.id,
    'status', v_note.status
  );
end;
$$;

create or replace function public.upsert_patient_care_team_member(
  p_patient_id uuid,
  p_membership_id uuid,
  p_role_label text default null,
  p_specialty text default null,
  p_is_primary boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_record_tenant(p_patient_id);
  v_user_id uuid := auth.uid();
  v_record_id uuid;
  v_membership public.tenant_memberships%rowtype;
  v_team public.patient_care_team%rowtype;
  v_now timestamptz := now();
begin
  if not security.can_manage_patient_care_team(v_tenant_id, p_patient_id) then
    raise exception 'care_team_write_required' using errcode = '42501';
  end if;

  select *
    into v_membership
  from public.tenant_memberships
  where tenant_id = v_tenant_id
    and id = p_membership_id
    and status = 'active'
    and role_code not in ('patient', 'guardian')
  limit 1;

  if not found then
    raise exception 'membership_not_found_or_forbidden' using errcode = '42501';
  end if;

  select (public.initialize_medical_record(p_patient_id) ->> 'recordId')::uuid
    into v_record_id;

  if p_is_primary then
    update public.patient_care_team
       set is_primary = false,
           updated_at = v_now
     where tenant_id = v_tenant_id
       and patient_id = p_patient_id
       and status = 'active';
  end if;

  insert into public.patient_care_team (
    tenant_id,
    patient_id,
    membership_id,
    user_id,
    role_code,
    role_label,
    specialty,
    is_primary,
    status,
    starts_at,
    assigned_by
  )
  values (
    v_tenant_id,
    p_patient_id,
    p_membership_id,
    v_membership.user_id,
    v_membership.role_code,
    nullif(trim(coalesce(p_role_label, '')), ''),
    nullif(trim(coalesce(p_specialty, '')), ''),
    coalesce(p_is_primary, false),
    'active',
    v_now,
    v_user_id
  )
  on conflict (tenant_id, patient_id, membership_id)
    where status = 'active'
  do update
     set role_label = excluded.role_label,
         specialty = excluded.specialty,
         is_primary = excluded.is_primary,
         status = 'active',
         ends_at = null,
         assigned_by = excluded.assigned_by,
         updated_at = v_now
  returning * into v_team;

  perform security.record_audit(
    v_tenant_id,
    p_patient_id,
    v_record_id,
    case when v_team.created_at = v_team.updated_at then 'team_member_added' else 'team_member_updated' end,
    'patient_care_team',
    v_team.id::text,
    jsonb_build_object('membershipId', v_team.membership_id, 'roleCode', v_team.role_code)
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'record.care_team_upserted',
    'patient_care_team',
    v_team.id::text,
    jsonb_build_object('patientId', p_patient_id, 'membershipId', v_team.membership_id)
  );

  return jsonb_build_object(
    'id', v_team.id,
    'patientId', p_patient_id,
    'membershipId', v_team.membership_id,
    'userId', v_team.user_id,
    'roleCode', v_team.role_code,
    'isPrimary', v_team.is_primary,
    'status', v_team.status
  );
end;
$$;

create or replace function public.remove_patient_care_team_member(
  p_patient_id uuid,
  p_team_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_record_tenant(p_patient_id);
  v_user_id uuid := auth.uid();
  v_record_id uuid;
  v_team public.patient_care_team%rowtype;
begin
  if not security.can_manage_patient_care_team(v_tenant_id, p_patient_id) then
    raise exception 'care_team_write_required' using errcode = '42501';
  end if;

  update public.patient_care_team
     set status = 'removed',
         is_primary = false,
         ends_at = now(),
         updated_at = now()
   where tenant_id = v_tenant_id
     and patient_id = p_patient_id
     and id = p_team_member_id
     and status = 'active'
   returning * into v_team;

  if not found then
    raise exception 'team_member_not_found_or_forbidden' using errcode = '42501';
  end if;

  select (public.initialize_medical_record(p_patient_id) ->> 'recordId')::uuid
    into v_record_id;

  perform security.record_audit(
    v_tenant_id,
    p_patient_id,
    v_record_id,
    'team_member_removed',
    'patient_care_team',
    v_team.id::text,
    jsonb_build_object('membershipId', v_team.membership_id)
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'record.care_team_removed',
    'patient_care_team',
    v_team.id::text,
    jsonb_build_object('patientId', p_patient_id, 'membershipId', v_team.membership_id)
  );

  return jsonb_build_object('id', v_team.id, 'status', v_team.status);
end;
$$;

create or replace function public.get_medical_record_snapshot(
  p_patient_id uuid,
  p_include_audit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_record_tenant(p_patient_id);
  v_record_id uuid;
  v_record public.medical_records%rowtype;
  v_notes jsonb := '[]'::jsonb;
  v_attachments jsonb := '[]'::jsonb;
  v_care_team jsonb := '[]'::jsonb;
  v_candidates jsonb := '[]'::jsonb;
  v_audit jsonb := '[]'::jsonb;
  v_can_manage_team boolean;
  v_can_view_audit boolean;
begin
  if not security.can_access_patient_record(v_tenant_id, p_patient_id, false) then
    raise exception 'record_read_required' using errcode = '42501';
  end if;

  select (public.initialize_medical_record(p_patient_id) ->> 'recordId')::uuid
    into v_record_id;

  select *
    into v_record
  from public.medical_records
  where tenant_id = v_tenant_id
    and id = v_record_id;

  v_can_manage_team := security.can_manage_patient_care_team(v_tenant_id, p_patient_id);
  v_can_view_audit :=
    security.can_manage_tenant(v_tenant_id)
    or security.has_permission(v_tenant_id, 'timeline.sensitive.read', false);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', cn.id,
        'type', cn.note_type,
        'status', cn.status,
        'title', cn.title,
        'summary', cn.summary,
        'body', cn.body,
        'encounterId', cn.encounter_id,
        'soapNoteId', cn.soap_note_id,
        'authoredBy', cn.authored_by,
        'authorName', coalesce(nullif(profile.full_name, ''), profile.email, 'Equipe clinica'),
        'authorRole', coalesce(tm.role_code, 'profissional'),
        'signedAt', cn.signed_at,
        'createdAt', cn.created_at,
        'updatedAt', cn.updated_at
      )
      order by cn.created_at desc
    ),
    '[]'::jsonb
  )
    into v_notes
  from public.clinical_notes cn
  left join public.profiles profile on profile.id = cn.authored_by
  left join public.tenant_memberships tm
    on tm.tenant_id = cn.tenant_id
   and tm.user_id = cn.authored_by
  where cn.tenant_id = v_tenant_id
    and cn.medical_record_id = v_record_id
    and cn.status <> 'void';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ra.id,
        'fileName', ra.file_name,
        'mimeType', ra.mime_type,
        'sizeBytes', ra.size_bytes,
        'status', ra.status,
        'clinicalNoteId', ra.clinical_note_id,
        'uploadedBy', ra.uploaded_by,
        'uploadedByName', coalesce(nullif(profile.full_name, ''), profile.email, 'Equipe clinica'),
        'createdAt', ra.created_at
      )
      order by ra.created_at desc
    ),
    '[]'::jsonb
  )
    into v_attachments
  from public.record_attachments ra
  left join public.profiles profile on profile.id = ra.uploaded_by
  where ra.tenant_id = v_tenant_id
    and ra.medical_record_id = v_record_id
    and ra.status <> 'deleted';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pct.id,
        'membershipId', pct.membership_id,
        'userId', pct.user_id,
        'name', coalesce(nullif(profile.full_name, ''), profile.email, 'Profissional'),
        'email', profile.email,
        'roleCode', pct.role_code,
        'roleLabel', pct.role_label,
        'specialty', pct.specialty,
        'isPrimary', pct.is_primary,
        'status', pct.status,
        'startsAt', pct.starts_at,
        'createdAt', pct.created_at
      )
      order by pct.is_primary desc, profile.full_name nulls last, profile.email nulls last
    ),
    '[]'::jsonb
  )
    into v_care_team
  from public.patient_care_team pct
  join public.tenant_memberships tm
    on tm.tenant_id = pct.tenant_id
   and tm.id = pct.membership_id
  join public.profiles profile on profile.id = pct.user_id
  where pct.tenant_id = v_tenant_id
    and pct.patient_id = p_patient_id
    and pct.status = 'active';

  if v_can_manage_team then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'membershipId', tm.id,
          'userId', tm.user_id,
          'name', coalesce(nullif(profile.full_name, ''), profile.email, 'Profissional'),
          'email', profile.email,
          'roleCode', tm.role_code,
          'unitId', tm.unit_id,
          'alreadyAssigned',
            exists (
              select 1
              from public.patient_care_team pct
              where pct.tenant_id = tm.tenant_id
                and pct.patient_id = p_patient_id
                and pct.membership_id = tm.id
                and pct.status = 'active'
            )
        )
        order by profile.full_name nulls last, profile.email nulls last
      ),
      '[]'::jsonb
    )
      into v_candidates
    from public.tenant_memberships tm
    join public.profiles profile on profile.id = tm.user_id
    where tm.tenant_id = v_tenant_id
      and tm.status = 'active'
      and tm.role_code not in ('patient', 'guardian');
  end if;

  if p_include_audit and v_can_view_audit then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', audit.id,
          'action', audit.action,
          'entityType', audit.entity_type,
          'entityId', audit.entity_id,
          'actorId', audit.actor_id,
          'actorName', coalesce(nullif(profile.full_name, ''), profile.email, 'Sistema'),
          'metadata', audit.metadata,
          'createdAt', audit.created_at
        )
        order by audit.created_at desc
      ),
      '[]'::jsonb
    )
      into v_audit
    from (
      select *
      from public.record_access_audit
      where tenant_id = v_tenant_id
        and medical_record_id = v_record_id
      order by created_at desc
      limit 80
    ) audit
    left join public.profiles profile on profile.id = audit.actor_id
    ;
  end if;

  return jsonb_build_object(
    'record',
      jsonb_build_object(
        'id', v_record.id,
        'patientId', v_record.patient_id,
        'status', v_record.status,
        'openedAt', v_record.opened_at,
        'lastAccessedAt', v_record.last_accessed_at,
        'lastWrittenAt', v_record.last_written_at,
        'createdAt', v_record.created_at,
        'updatedAt', v_record.updated_at
      ),
    'notes', v_notes,
    'attachments', v_attachments,
    'careTeam', v_care_team,
    'careTeamCandidates', v_candidates,
    'audit', v_audit,
    'access',
      jsonb_build_object(
        'canManageTeam', v_can_manage_team,
        'canViewAudit', v_can_view_audit
      )
  );
end;
$$;

alter table public.medical_records enable row level security;
alter table public.clinical_notes enable row level security;
alter table public.record_attachments enable row level security;
alter table public.record_access_audit enable row level security;
alter table public.patient_care_team enable row level security;

create policy medical_records_read
on public.medical_records for select
to authenticated
using (security.can_access_patient_record(tenant_id, patient_id, false));

create policy medical_records_write
on public.medical_records for all
to authenticated
using (security.can_access_patient_record(tenant_id, patient_id, true))
with check (security.can_access_patient_record(tenant_id, patient_id, true));

create policy clinical_notes_read
on public.clinical_notes for select
to authenticated
using (security.can_access_patient_record(tenant_id, patient_id, false));

create policy clinical_notes_write
on public.clinical_notes for all
to authenticated
using (security.can_access_patient_record(tenant_id, patient_id, true))
with check (security.can_access_patient_record(tenant_id, patient_id, true));

create policy record_attachments_read
on public.record_attachments for select
to authenticated
using (security.can_access_patient_record(tenant_id, patient_id, false));

create policy record_attachments_write
on public.record_attachments for all
to authenticated
using (security.can_access_patient_record(tenant_id, patient_id, true))
with check (security.can_access_patient_record(tenant_id, patient_id, true));

create policy record_access_audit_read
on public.record_access_audit for select
to authenticated
using (
  security.can_access_patient_record(tenant_id, patient_id, false)
  and (
    security.can_manage_tenant(tenant_id)
    or security.has_permission(tenant_id, 'timeline.sensitive.read', false)
  )
);

create policy record_access_audit_insert
on public.record_access_audit for insert
to authenticated
with check (
  actor_id = auth.uid()
  and security.can_access_patient_record(tenant_id, patient_id, false)
);

create policy patient_care_team_read
on public.patient_care_team for select
to authenticated
using (security.can_access_patient_record(tenant_id, patient_id, false));

create policy patient_care_team_write
on public.patient_care_team for all
to authenticated
using (security.can_manage_patient_care_team(tenant_id, patient_id))
with check (security.can_manage_patient_care_team(tenant_id, patient_id));

drop policy if exists "record_attachments_storage_select" on storage.objects;
create policy "record_attachments_storage_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'clinical-attachments'
  and security.is_valid_clinical_storage_path(name)
  and exists (
    select 1
    from public.record_attachments ra
    where ra.storage_bucket = bucket_id
      and ra.storage_path = name
      and ra.status = 'uploaded'
      and security.can_access_patient_record(ra.tenant_id, ra.patient_id, false)
  )
);

revoke all on function security.resolve_record_tenant(uuid) from public;
revoke all on function security.can_manage_patient_care_team(uuid, uuid) from public;
revoke all on function security.can_access_patient_record(uuid, uuid, boolean) from public;
revoke all on function security.record_audit(uuid, uuid, uuid, text, text, text, jsonb) from public;
grant execute on function security.resolve_record_tenant(uuid) to authenticated, service_role;
grant execute on function security.can_manage_patient_care_team(uuid, uuid) to authenticated, service_role;
grant execute on function security.can_access_patient_record(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function security.record_audit(uuid, uuid, uuid, text, text, text, jsonb) to authenticated, service_role;

revoke all on function public.initialize_medical_record(uuid) from public;
revoke all on function public.autosave_encounter(uuid, uuid, uuid, uuid, text, text, text, text) from public;
revoke all on function public.create_note_from_encounter(uuid, uuid) from public;
revoke all on function public.upsert_patient_care_team_member(uuid, uuid, text, text, boolean) from public;
revoke all on function public.remove_patient_care_team_member(uuid, uuid) from public;
revoke all on function public.get_medical_record_snapshot(uuid, boolean) from public;
grant execute on function public.initialize_medical_record(uuid) to authenticated;
grant execute on function public.autosave_encounter(uuid, uuid, uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.create_note_from_encounter(uuid, uuid) to authenticated;
grant execute on function public.upsert_patient_care_team_member(uuid, uuid, text, text, boolean) to authenticated;
grant execute on function public.remove_patient_care_team_member(uuid, uuid) to authenticated;
grant execute on function public.get_medical_record_snapshot(uuid, boolean) to authenticated;

comment on table public.medical_records is 'One longitudinal medical record per patient and tenant.';
comment on table public.clinical_notes is 'Longitudinal clinical notes generated from SOAP encounters or authored directly.';
comment on table public.record_attachments is 'Private clinical attachment metadata. Bytes live in the clinical-attachments bucket and are served through short-lived signed URLs.';
comment on table public.record_access_audit is 'Append-only access/write audit for medical records. Metadata must not contain raw clinical note content.';
comment on table public.patient_care_team is 'Patient-specific care team assignments used by record access and Patient 360.';
