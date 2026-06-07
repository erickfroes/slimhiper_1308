-- M11 document library: template versioning, audited patient release and library actions.

alter table public.document_templates
  add column if not exists current_version integer not null default 1,
  add column if not exists last_versioned_at timestamptz not null default now();

create table if not exists public.document_template_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_id uuid not null,
  version_number integer not null check (version_number > 0),
  name text not null,
  category text not null,
  status text not null check (status in ('draft', 'active', 'archived')),
  template_body text,
  variables jsonb not null default '{}'::jsonb,
  d4sign_enabled boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id, id),
  unique (tenant_id, template_id, version_number),
  constraint document_template_versions_template_same_tenant
    foreign key (tenant_id, template_id)
    references public.document_templates(tenant_id, id)
    on delete cascade
);

create table if not exists public.document_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid,
  generated_document_id uuid,
  template_id uuid,
  action text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  source text not null default 'app' check (source in ('app', 'edge', 'provider', 'system')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint document_audit_events_document_same_tenant
    foreign key (tenant_id, generated_document_id)
    references public.generated_documents(tenant_id, id)
    on delete cascade,
  constraint document_audit_events_template_same_tenant
    foreign key (tenant_id, template_id)
    references public.document_templates(tenant_id, id)
    on delete cascade,
  constraint document_audit_events_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create index if not exists idx_document_template_versions_template_created
  on public.document_template_versions(tenant_id, template_id, version_number desc);

create index if not exists idx_document_audit_events_document_created
  on public.document_audit_events(tenant_id, generated_document_id, created_at desc);

create index if not exists idx_document_audit_events_template_created
  on public.document_audit_events(tenant_id, template_id, created_at desc);

create index if not exists idx_document_audit_events_patient_created
  on public.document_audit_events(tenant_id, patient_id, created_at desc);

alter table public.document_template_versions enable row level security;
alter table public.document_audit_events enable row level security;

drop policy if exists document_template_versions_select_documents_read on public.document_template_versions;
create policy document_template_versions_select_documents_read
on public.document_template_versions for select
to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'documents.read'));

drop policy if exists document_audit_events_select_documents_read on public.document_audit_events;
create policy document_audit_events_select_documents_read
on public.document_audit_events for select
to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'documents.read'));

grant select on public.document_template_versions to authenticated, service_role;
grant select on public.document_audit_events to authenticated, service_role;
grant insert, update, delete on public.document_template_versions to service_role;
grant insert, update, delete on public.document_audit_events to service_role;

insert into public.document_template_versions (
  tenant_id,
  template_id,
  version_number,
  name,
  category,
  status,
  template_body,
  variables,
  d4sign_enabled,
  created_by,
  created_at,
  metadata
)
select
  dt.tenant_id,
  dt.id,
  greatest(coalesce(dt.current_version, 1), 1),
  dt.name,
  dt.category,
  dt.status,
  dt.template_body,
  coalesce(dt.variables, '{}'::jsonb),
  dt.d4sign_enabled,
  dt.created_by,
  coalesce(dt.last_versioned_at, dt.updated_at, dt.created_at, now()),
  jsonb_build_object('backfilled', true)
from public.document_templates dt
where not exists (
  select 1
  from public.document_template_versions dtv
  where dtv.tenant_id = dt.tenant_id
    and dtv.template_id = dt.id
    and dtv.version_number = greatest(coalesce(dt.current_version, 1), 1)
);

create or replace function public.document_templates_version_bump()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.current_version := greatest(coalesce(new.current_version, 1), 1);
    new.last_versioned_at := coalesce(new.last_versioned_at, now());
    return new;
  end if;

  if new.name is distinct from old.name
    or new.category is distinct from old.category
    or new.status is distinct from old.status
    or new.template_body is distinct from old.template_body
    or new.variables is distinct from old.variables
    or new.d4sign_enabled is distinct from old.d4sign_enabled
  then
    new.current_version := greatest(coalesce(old.current_version, 1), 1) + 1;
    new.last_versioned_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.document_templates_version_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT'
    or new.name is distinct from old.name
    or new.category is distinct from old.category
    or new.status is distinct from old.status
    or new.template_body is distinct from old.template_body
    or new.variables is distinct from old.variables
    or new.d4sign_enabled is distinct from old.d4sign_enabled
  then
    insert into public.document_template_versions (
      tenant_id,
      template_id,
      version_number,
      name,
      category,
      status,
      template_body,
      variables,
      d4sign_enabled,
      created_by,
      created_at,
      metadata
    )
    values (
      new.tenant_id,
      new.id,
      greatest(coalesce(new.current_version, 1), 1),
      new.name,
      new.category,
      new.status,
      new.template_body,
      coalesce(new.variables, '{}'::jsonb),
      new.d4sign_enabled,
      coalesce(new.created_by, auth.uid()),
      coalesce(new.last_versioned_at, now()),
      jsonb_build_object('source', 'document_template_trigger')
    )
    on conflict (tenant_id, template_id, version_number) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_document_templates_version_bump on public.document_templates;
create trigger trg_document_templates_version_bump
before insert or update on public.document_templates
for each row execute function public.document_templates_version_bump();

drop trigger if exists trg_document_templates_version_snapshot on public.document_templates;
create trigger trg_document_templates_version_snapshot
after insert or update on public.document_templates
for each row execute function public.document_templates_version_snapshot();

create or replace function public.generated_documents_audit_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_action text;
  v_summary jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.document_audit_events (
      tenant_id,
      patient_id,
      generated_document_id,
      template_id,
      action,
      actor_id,
      source,
      summary
    )
    values (
      new.tenant_id,
      new.patient_id,
      new.id,
      new.template_id,
      'document.generated',
      coalesce(new.generated_by, v_actor),
      case when v_actor is null then 'edge' else 'app' end,
      jsonb_build_object(
        'status', new.status,
        'category', new.category,
        'releasedToPatient', new.released_to_patient,
        'hasPrivateStoragePath', new.storage_path is not null
      )
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    v_action := 'document.status_changed';
    v_summary := jsonb_build_object(
      'previousStatus', old.status,
      'status', new.status,
      'category', new.category
    );

    insert into public.document_audit_events (
      tenant_id,
      patient_id,
      generated_document_id,
      template_id,
      action,
      actor_id,
      source,
      summary
    )
    values (
      new.tenant_id,
      new.patient_id,
      new.id,
      new.template_id,
      v_action,
      v_actor,
      case when v_actor is null then 'system' else 'app' end,
      v_summary
    );
  end if;

  return new;
end;
$$;

create or replace function public.signature_requests_audit_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_document public.generated_documents%rowtype;
  v_action text;
begin
  select * into v_document
  from public.generated_documents
  where tenant_id = new.tenant_id
    and id = new.generated_document_id;

  if v_document.id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'document.signature_requested';
  elsif new.status is distinct from old.status then
    v_action := 'document.signature_status_changed';
  else
    return new;
  end if;

  insert into public.document_audit_events (
    tenant_id,
    patient_id,
    generated_document_id,
    template_id,
    action,
    actor_id,
    source,
    summary
  )
  values (
    new.tenant_id,
    new.patient_id,
    new.generated_document_id,
    v_document.template_id,
    v_action,
    v_actor,
    case
      when v_actor is not null then 'app'
      when tg_op = 'UPDATE' then 'provider'
      else 'edge'
    end,
    jsonb_build_object(
      'signatureRequestId', new.id,
      'previousStatus', case when tg_op = 'UPDATE' then old.status else null end,
      'status', new.status,
      'providerDocumentIdPresent', new.provider_document_id is not null
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_generated_documents_audit_snapshot on public.generated_documents;
create trigger trg_generated_documents_audit_snapshot
after insert or update of status on public.generated_documents
for each row execute function public.generated_documents_audit_snapshot();

drop trigger if exists trg_signature_requests_audit_snapshot on public.signature_requests;
create trigger trg_signature_requests_audit_snapshot
after insert or update of status on public.signature_requests
for each row execute function public.signature_requests_audit_snapshot();

drop policy if exists generated_documents_write on public.generated_documents;
revoke insert, update, delete on public.generated_documents from authenticated;
grant select on public.generated_documents to authenticated, service_role;
grant insert, update, delete on public.generated_documents to service_role;

create or replace function public.set_generated_document_patient_release(
  p_generated_document_id uuid,
  p_patient_id uuid,
  p_released_to_patient boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_document public.generated_documents%rowtype;
  v_previous boolean;
  v_action text;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_document
  from public.generated_documents
  where id = p_generated_document_id
    and patient_id = p_patient_id;

  if v_document.id is null then
    raise exception 'document_not_found' using errcode = '22023';
  end if;

  if not security.has_permission(v_document.tenant_id, 'documents.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_previous := coalesce(v_document.released_to_patient, false);
  v_action := case
    when coalesce(p_released_to_patient, false) then 'document.released_to_patient'
    else 'document.hidden_from_patient'
  end;

  update public.generated_documents
  set released_to_patient = coalesce(p_released_to_patient, false),
      updated_at = now()
  where tenant_id = v_document.tenant_id
    and id = v_document.id
    and patient_id = v_document.patient_id
  returning * into v_document;

  insert into public.document_audit_events (
    tenant_id,
    patient_id,
    generated_document_id,
    template_id,
    action,
    actor_id,
    source,
    summary
  )
  values (
    v_document.tenant_id,
    v_document.patient_id,
    v_document.id,
    v_document.template_id,
    v_action,
    v_user_id,
    'app',
    jsonb_build_object(
      'previousReleasedToPatient', v_previous,
      'releasedToPatient', v_document.released_to_patient,
      'reason', nullif(left(coalesce(p_reason, ''), 240), ''),
      'status', v_document.status
    )
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_document.tenant_id,
    v_user_id,
    replace(v_action, '.', '_'),
    'generated_document',
    v_document.id::text,
    jsonb_build_object(
      'patientId', v_document.patient_id,
      'releasedToPatient', v_document.released_to_patient
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
    action_label,
    details_href,
    event_at,
    payload
  )
  values (
    v_document.tenant_id,
    v_document.patient_id,
    case when v_document.released_to_patient then 'documento_liberado_paciente' else 'documento_ocultado_paciente' end,
    'documents',
    'recorded',
    case when v_document.released_to_patient then 'Documento liberado ao paciente' else 'Documento ocultado do paciente' end,
    'A equipe atualizou o acesso do paciente ao documento.',
    'Equipe clinica',
    case when v_document.released_to_patient then 'Liberado' else 'Restrito' end,
    'Ver documentos',
    '/paciente-360?patient=' || v_document.patient_id::text || '&tab=documentos',
    now(),
    jsonb_build_object(
      'generatedDocumentId', v_document.id,
      'documentName', v_document.name,
      'releasedToPatient', v_document.released_to_patient
    )
  );

  return jsonb_build_object(
    'id', v_document.id,
    'patientId', v_document.patient_id,
    'releasedToPatient', v_document.released_to_patient,
    'updatedAt', v_document.updated_at
  );
end;
$$;

create or replace function public.duplicate_document_template(
  p_template_id uuid,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_source public.document_templates%rowtype;
  v_new public.document_templates%rowtype;
  v_base_name text;
  v_candidate_name text;
  v_attempt integer := 0;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_source
  from public.document_templates
  where id = p_template_id;

  if v_source.id is null then
    raise exception 'template_not_found' using errcode = '22023';
  end if;

  if not security.has_permission(v_source.tenant_id, 'documents.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_base_name := left(coalesce(nullif(trim(p_name), ''), v_source.name || ' (copia)'), 180);

  loop
    v_candidate_name := case
      when v_attempt = 0 then v_base_name
      else left(v_base_name || ' ' || (v_attempt + 1)::text, 200)
    end;

    exit when not exists (
      select 1
      from public.document_templates dt
      where dt.tenant_id = v_source.tenant_id
        and lower(dt.name) = lower(v_candidate_name)
    );

    v_attempt := v_attempt + 1;
    if v_attempt > 50 then
      raise exception 'duplicate_name_unavailable' using errcode = '23505';
    end if;
  end loop;

  insert into public.document_templates (
    tenant_id,
    name,
    category,
    status,
    template_body,
    variables,
    d4sign_enabled,
    created_by,
    current_version,
    last_versioned_at
  )
  values (
    v_source.tenant_id,
    v_candidate_name,
    v_source.category,
    'draft',
    v_source.template_body,
    coalesce(v_source.variables, '{}'::jsonb),
    v_source.d4sign_enabled,
    v_user_id,
    1,
    now()
  )
  returning * into v_new;

  insert into public.document_audit_events (
    tenant_id,
    template_id,
    action,
    actor_id,
    source,
    summary
  )
  values (
    v_new.tenant_id,
    v_new.id,
    'document_template.duplicated',
    v_user_id,
    'app',
    jsonb_build_object(
      'sourceTemplateId', v_source.id,
      'sourceTemplateName', v_source.name,
      'newTemplateName', v_new.name,
      'status', v_new.status
    )
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_new.tenant_id,
    v_user_id,
    'document_template_duplicated',
    'document_template',
    v_new.id::text,
    jsonb_build_object('sourceTemplateId', v_source.id)
  );

  return jsonb_build_object(
    'id', v_new.id,
    'name', v_new.name,
    'category', v_new.category,
    'status', v_new.status,
    'currentVersion', v_new.current_version
  );
end;
$$;

grant execute on function public.set_generated_document_patient_release(uuid, uuid, boolean, text) to authenticated, service_role;
grant execute on function public.duplicate_document_template(uuid, text) to authenticated, service_role;

comment on table public.document_template_versions is
  'Immutable snapshots for document template library versions. Patient files continue to use generated_documents and private storage.';

comment on table public.document_audit_events is
  'Operational document audit trail without raw provider payloads, signed URLs or private storage paths.';

comment on function public.set_generated_document_patient_release(uuid, uuid, boolean, text) is
  'Audited RPC to release or hide a generated document from patient/guardian portal access.';

comment on function public.duplicate_document_template(uuid, text) is
  'Audited RPC to duplicate a document template into a draft library item.';
