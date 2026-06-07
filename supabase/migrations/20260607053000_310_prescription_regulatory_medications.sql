-- M10 - Regulatory prescriptions and medications.
-- Raises the previous prescriptions_placeholder MVP into an official, versioned
-- prescription contract while keeping legacy RPC names compatible.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prescription-pdfs',
  'prescription-pdfs',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.prescriptions_placeholder
  drop constraint if exists prescriptions_placeholder_category_check;

alter table public.prescriptions_placeholder
  add constraint prescriptions_placeholder_category_check
  check (
    category in (
      'prescricao_medica',
      'suplementacao',
      'orientacoes_nutricionais',
      'orientacoes_gerais',
      'plano_alimentar'
    )
  );

create or replace function security.clean_prescription_text(p_value text, p_max_length integer)
returns text
language sql
immutable
as $$
  select nullif(
    left(
      btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')),
      greatest(coalesce(p_max_length, 1), 1)
    ),
    ''
  );
$$;

create or replace function security.normalize_prescription_category(p_category text)
returns text
language sql
immutable
as $$
  select case lower(btrim(coalesce(p_category, '')))
    when 'prescricao_medica' then 'prescricao_medica'
    when 'medicamento' then 'prescricao_medica'
    when 'suplementacao' then 'suplementacao'
    when 'suplemento' then 'suplementacao'
    when 'orientacoes_nutricionais' then 'orientacoes_nutricionais'
    when 'orientacao_nutricional' then 'orientacoes_nutricionais'
    when 'plano_alimentar' then 'plano_alimentar'
    when 'diet_plan' then 'plano_alimentar'
    else 'orientacoes_gerais'
  end;
$$;

create or replace function security.prescription_item_type(p_category text)
returns text
language sql
immutable
as $$
  select case security.normalize_prescription_category(p_category)
    when 'prescricao_medica' then 'medicamento'
    when 'suplementacao' then 'suplemento'
    when 'plano_alimentar' then 'plano_alimentar'
    else 'orientacao'
  end;
$$;

create or replace function security.prescription_signature_requirement(p_category text)
returns text
language sql
immutable
as $$
  select case security.normalize_prescription_category(p_category)
    when 'prescricao_medica' then 'qualified_or_icp_required'
    when 'suplementacao' then 'd4sign_optional'
    else 'none'
  end;
$$;

create or replace function security.prescription_signature_status(p_category text)
returns text
language sql
immutable
as $$
  select case security.prescription_signature_requirement(p_category)
    when 'qualified_or_icp_required' then 'not_configured'
    else 'not_required'
  end;
$$;

create or replace function security.is_valid_prescription_pdf_path(p_object_name text)
returns boolean
language sql
stable
as $$
  select
    p_object_name is not null
    and array_length(string_to_array(p_object_name, '/'), 1) = 5
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 1))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 2))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 3))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 4))
    and nullif(split_part(p_object_name, '/', 5), '') is not null
    and split_part(p_object_name, '/', 5) !~ '[\\/]';
$$;

create or replace function security.user_can_issue_medical_prescription(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select security.has_permission(p_tenant_id, 'prescriptions.write', false)
     and security.has_tenant_role(
       p_tenant_id,
       array['tenant_owner', 'clinic_admin', 'physician']
     );
$$;

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  encounter_id uuid,
  category text not null default 'prescricao_medica'
    check (
      category in (
        'prescricao_medica',
        'suplementacao',
        'orientacoes_nutricionais',
        'orientacoes_gerais',
        'plano_alimentar'
      )
    ),
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'cancelled', 'expired')),
  title text not null default 'Prescricao',
  summary text,
  issue_date date,
  valid_until date,
  patient_visible boolean not null default true,
  requires_review boolean not null default false,
  current_version integer not null default 1 check (current_version > 0),
  linked_document_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  issued_by uuid references public.profiles(id) on delete set null,
  issued_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint prescriptions_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint prescriptions_encounter_same_tenant
    foreign key (tenant_id, encounter_id)
    references public.encounters(tenant_id, id),
  constraint prescriptions_linked_document_same_tenant
    foreign key (tenant_id, linked_document_id)
    references public.generated_documents(tenant_id, id)
    on delete set null (linked_document_id),
  constraint prescriptions_validity_range
    check (valid_until is null or issue_date is null or valid_until >= issue_date),
  constraint prescriptions_issued_consistency
    check (
      status <> 'issued'
      or (issued_at is not null and issue_date is not null)
    ),
  constraint prescriptions_cancelled_consistency
    check (
      status <> 'cancelled'
      or (cancelled_at is not null and cancel_reason is not null)
    )
);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  prescription_id uuid not null,
  position integer not null default 1 check (position > 0),
  item_type text not null default 'medicamento'
    check (item_type in ('medicamento', 'suplemento', 'orientacao', 'plano_alimentar')),
  label text not null,
  dosage text,
  route text,
  frequency text,
  duration text,
  quantity text,
  instructions text,
  start_date date,
  end_date date,
  schedule_times text[] not null default '{}'::text[],
  reminder_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint prescription_items_prescription_same_tenant
    foreign key (tenant_id, prescription_id)
    references public.prescriptions(tenant_id, id)
    on delete cascade,
  constraint prescription_items_date_range
    check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.prescription_regulatory_metadata (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  prescription_id uuid not null,
  prescription_scope text not null default 'clinical'
    check (prescription_scope in ('clinical', 'nutrition', 'orientation', 'diet_plan')),
  regulatory_classification text not null default 'orientation'
    check (
      regulatory_classification in (
        'medical_prescription',
        'supplement_recommendation',
        'nutrition_orientation',
        'general_orientation',
        'diet_plan'
      )
    ),
  legal_signature_requirement text not null default 'none'
    check (legal_signature_requirement in ('none', 'd4sign_optional', 'qualified_or_icp_required')),
  legal_signature_status text not null default 'not_required'
    check (
      legal_signature_status in (
        'not_required',
        'not_configured',
        'pending',
        'validated',
        'rejected'
      )
    ),
  d4sign_allowed boolean not null default false,
  provider_policy text not null default 'none',
  prescriber_profile_id uuid references public.profiles(id) on delete set null,
  prescriber_name text,
  professional_council text,
  professional_registration text,
  professional_registration_state text,
  issued_at timestamptz,
  valid_until date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, prescription_id),
  constraint prescription_regulatory_prescription_same_tenant
    foreign key (tenant_id, prescription_id)
    references public.prescriptions(tenant_id, id)
    on delete cascade
);

create table public.prescription_pdf_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  prescription_id uuid not null,
  version_number integer not null default 1 check (version_number > 0),
  status text not null default 'generated'
    check (status in ('generated', 'superseded', 'cancelled', 'failed')),
  storage_bucket text not null default 'prescription-pdfs'
    check (storage_bucket = 'prescription-pdfs'),
  storage_path text not null,
  file_name text not null default 'prescription.pdf',
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  digest_sha256 text,
  released_to_patient boolean not null default true,
  released_at timestamptz,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (storage_bucket, storage_path),
  constraint prescription_pdf_artifacts_prescription_same_tenant
    foreign key (tenant_id, prescription_id)
    references public.prescriptions(tenant_id, id)
    on delete cascade,
  constraint prescription_pdf_artifacts_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint prescription_pdf_artifacts_storage_path_shape
    check (
      security.is_valid_prescription_pdf_path(storage_path)
      and storage_path =
        tenant_id::text || '/' ||
        patient_id::text || '/' ||
        prescription_id::text || '/' ||
        id::text || '/' ||
        split_part(storage_path, '/', 5)
    )
);

create table public.legal_signatures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  prescription_id uuid,
  pdf_artifact_id uuid,
  provider text not null default 'internal_policy'
    check (provider in ('internal_policy', 'd4sign', 'qualified_signature', 'icp_brasil')),
  signature_type text not null default 'not_required'
    check (signature_type in ('not_required', 'electronic', 'qualified', 'icp_brasil')),
  status text not null default 'not_required'
    check (
      status in (
        'not_required',
        'not_configured',
        'pending',
        'validated',
        'rejected',
        'cancelled'
      )
    ),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz,
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  validation_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint legal_signatures_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint legal_signatures_prescription_same_tenant
    foreign key (tenant_id, prescription_id)
    references public.prescriptions(tenant_id, id)
    on delete cascade,
  constraint legal_signatures_pdf_same_tenant
    foreign key (tenant_id, pdf_artifact_id)
    references public.prescription_pdf_artifacts(tenant_id, id)
    on delete set null
);

create table public.prescription_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  prescription_id uuid not null,
  version_number integer not null check (version_number > 0),
  status text not null,
  category text not null,
  content_snapshot jsonb not null,
  regulatory_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, prescription_id, version_number),
  constraint prescription_versions_prescription_same_tenant
    foreign key (tenant_id, prescription_id)
    references public.prescriptions(tenant_id, id)
    on delete cascade
);

create index idx_prescriptions_patient_status
  on public.prescriptions(tenant_id, patient_id, status, created_at desc);
create index idx_prescriptions_patient_validity
  on public.prescriptions(tenant_id, patient_id, valid_until)
  where status = 'issued';
create index idx_prescription_items_prescription_position
  on public.prescription_items(tenant_id, prescription_id, position);
create index idx_prescription_regulatory_requirement
  on public.prescription_regulatory_metadata(tenant_id, legal_signature_requirement, legal_signature_status);
create index idx_prescription_pdf_artifacts_prescription
  on public.prescription_pdf_artifacts(tenant_id, prescription_id, generated_at desc);
create index idx_legal_signatures_prescription
  on public.legal_signatures(tenant_id, prescription_id, status);
create index idx_prescription_versions_prescription
  on public.prescription_versions(tenant_id, prescription_id, version_number desc);

select security.touch_updated_at('public.prescriptions');
select security.touch_updated_at('public.prescription_items');
select security.touch_updated_at('public.prescription_regulatory_metadata');
select security.touch_updated_at('public.prescription_pdf_artifacts');
select security.touch_updated_at('public.legal_signatures');

alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.prescription_regulatory_metadata enable row level security;
alter table public.prescription_pdf_artifacts enable row level security;
alter table public.legal_signatures enable row level security;
alter table public.prescription_versions enable row level security;

drop policy if exists prescriptions_select_staff_or_patient on public.prescriptions;
create policy prescriptions_select_staff_or_patient
on public.prescriptions for select
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'prescriptions.read')
  or (
    patient_visible = true
    and status in ('issued', 'cancelled', 'expired')
    and public.can_access_patient_portal_patient(tenant_id, patient_id)
  )
);

drop policy if exists prescriptions_write_staff on public.prescriptions;
create policy prescriptions_write_staff
on public.prescriptions for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'prescriptions.write'))
with check (
  public.has_clinical_permission(tenant_id, 'prescriptions.write')
  and (
    category <> 'prescricao_medica'
    or security.user_can_issue_medical_prescription(tenant_id)
  )
);

drop policy if exists prescription_items_select_staff_or_patient on public.prescription_items;
create policy prescription_items_select_staff_or_patient
on public.prescription_items for select
to authenticated
using (
  exists (
    select 1
    from public.prescriptions p
    where p.tenant_id = prescription_items.tenant_id
      and p.id = prescription_items.prescription_id
      and (
        public.has_clinical_permission(p.tenant_id, 'prescriptions.read')
        or (
          p.patient_visible = true
          and p.status in ('issued', 'cancelled', 'expired')
          and public.can_access_patient_portal_patient(p.tenant_id, p.patient_id)
        )
      )
  )
);

drop policy if exists prescription_items_write_staff on public.prescription_items;
create policy prescription_items_write_staff
on public.prescription_items for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'prescriptions.write'))
with check (public.has_clinical_permission(tenant_id, 'prescriptions.write'));

drop policy if exists prescription_regulatory_select_staff on public.prescription_regulatory_metadata;
create policy prescription_regulatory_select_staff
on public.prescription_regulatory_metadata for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'prescriptions.read'));

drop policy if exists prescription_regulatory_write_staff on public.prescription_regulatory_metadata;
create policy prescription_regulatory_write_staff
on public.prescription_regulatory_metadata for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'prescriptions.write'))
with check (public.has_clinical_permission(tenant_id, 'prescriptions.write'));

drop policy if exists prescription_pdf_select_staff_or_patient on public.prescription_pdf_artifacts;
create policy prescription_pdf_select_staff_or_patient
on public.prescription_pdf_artifacts for select
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'prescriptions.read')
  or (
    released_to_patient = true
    and status = 'generated'
    and public.can_access_patient_portal_patient(tenant_id, patient_id)
  )
);

drop policy if exists prescription_pdf_write_staff on public.prescription_pdf_artifacts;
create policy prescription_pdf_write_staff
on public.prescription_pdf_artifacts for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'prescriptions.write'))
with check (public.has_clinical_permission(tenant_id, 'prescriptions.write'));

drop policy if exists legal_signatures_select_staff on public.legal_signatures;
create policy legal_signatures_select_staff
on public.legal_signatures for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'prescriptions.read'));

drop policy if exists legal_signatures_write_staff on public.legal_signatures;
create policy legal_signatures_write_staff
on public.legal_signatures for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'prescriptions.write'))
with check (public.has_clinical_permission(tenant_id, 'prescriptions.write'));

drop policy if exists prescription_versions_select_staff on public.prescription_versions;
create policy prescription_versions_select_staff
on public.prescription_versions for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'prescriptions.read'));

drop policy if exists prescription_versions_insert_staff on public.prescription_versions;
create policy prescription_versions_insert_staff
on public.prescription_versions for insert
to authenticated
with check (public.has_clinical_permission(tenant_id, 'prescriptions.write'));

grant select, insert, update on public.prescriptions to authenticated, service_role;
grant select, insert, update, delete on public.prescription_items to authenticated, service_role;
grant select, insert, update on public.prescription_regulatory_metadata to authenticated, service_role;
grant select, insert, update on public.prescription_pdf_artifacts to authenticated, service_role;
grant select, insert, update on public.legal_signatures to authenticated, service_role;
grant select, insert on public.prescription_versions to authenticated, service_role;

create or replace function security.prevent_issued_prescription_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text := coalesce(current_setting('slimhiper.prescription_mutation', true), '');
begin
  if tg_op = 'DELETE' then
    if old.status in ('issued', 'cancelled', 'expired') and v_mode <> 'system_migration' then
      raise exception 'issued_prescription_is_immutable' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.status in ('issued', 'cancelled', 'expired')
     and v_mode not in ('cancel', 'document_link', 'version_sync', 'pdf_link', 'system_migration') then
    raise exception 'issued_prescription_is_immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prescriptions_prevent_issued_mutation on public.prescriptions;
create trigger trg_prescriptions_prevent_issued_mutation
before update or delete on public.prescriptions
for each row execute function security.prevent_issued_prescription_mutation();

create or replace function security.prevent_issued_prescription_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_mode text := coalesce(current_setting('slimhiper.prescription_mutation', true), '');
  v_prescription_id uuid;
  v_tenant_id uuid;
begin
  if tg_op = 'DELETE' then
    v_prescription_id := old.prescription_id;
    v_tenant_id := old.tenant_id;
  else
    v_prescription_id := new.prescription_id;
    v_tenant_id := new.tenant_id;
  end if;

  select status into v_status
  from public.prescriptions
  where tenant_id = v_tenant_id
    and id = v_prescription_id;

  if v_status in ('issued', 'cancelled', 'expired')
     and v_mode not in ('system_migration') then
    raise exception 'issued_prescription_items_are_immutable' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prescription_items_prevent_issued_mutation on public.prescription_items;
create trigger trg_prescription_items_prevent_issued_mutation
before insert or update or delete on public.prescription_items
for each row execute function security.prevent_issued_prescription_item_mutation();

create or replace function security.prevent_prescription_version_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'prescription_versions_are_immutable' using errcode = '42501';
end;
$$;

drop trigger if exists trg_prescription_versions_immutable on public.prescription_versions;
create trigger trg_prescription_versions_immutable
before update or delete on public.prescription_versions
for each row execute function security.prevent_prescription_version_change();

create or replace function security.classify_prescription_regulatory_metadata(p_category text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'scope',
    case security.normalize_prescription_category(p_category)
      when 'prescricao_medica' then 'clinical'
      when 'suplementacao' then 'nutrition'
      when 'orientacoes_nutricionais' then 'nutrition'
      when 'plano_alimentar' then 'diet_plan'
      else 'orientation'
    end,
    'classification',
    case security.normalize_prescription_category(p_category)
      when 'prescricao_medica' then 'medical_prescription'
      when 'suplementacao' then 'supplement_recommendation'
      when 'orientacoes_nutricionais' then 'nutrition_orientation'
      when 'plano_alimentar' then 'diet_plan'
      else 'general_orientation'
    end,
    'signatureRequirement',
    security.prescription_signature_requirement(p_category),
    'signatureStatus',
    security.prescription_signature_status(p_category),
    'd4signAllowed',
    security.normalize_prescription_category(p_category) <> 'prescricao_medica',
    'providerPolicy',
    case security.normalize_prescription_category(p_category)
      when 'prescricao_medica' then 'd4sign_blocked_qualified_or_icp_required'
      when 'suplementacao' then 'd4sign_optional_non_medical'
      else 'signature_not_required'
    end
  );
$$;

create or replace function security.record_prescription_version(
  p_prescription_id uuid,
  p_actor_id uuid,
  p_reason text default 'snapshot'
)
returns integer
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_prescription public.prescriptions%rowtype;
  v_items jsonb := '[]'::jsonb;
  v_regulatory jsonb := '{}'::jsonb;
  v_next_version integer;
begin
  select * into v_prescription
  from public.prescriptions
  where id = p_prescription_id;

  if v_prescription.id is null then
    raise exception 'prescription_not_found' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'position', i.position,
        'itemType', i.item_type,
        'label', i.label,
        'dosage', i.dosage,
        'route', i.route,
        'frequency', i.frequency,
        'duration', i.duration,
        'quantity', i.quantity,
        'instructions', i.instructions,
        'startDate', i.start_date,
        'endDate', i.end_date,
        'scheduleTimes', to_jsonb(i.schedule_times),
        'reminderEnabled', i.reminder_enabled
      )
      order by i.position, i.created_at
    ),
    '[]'::jsonb
  )
  into v_items
  from public.prescription_items i
  where i.tenant_id = v_prescription.tenant_id
    and i.prescription_id = v_prescription.id;

  select coalesce(
    to_jsonb(r) - 'id' - 'tenant_id' - 'prescription_id' - 'created_at' - 'updated_at',
    '{}'::jsonb
  )
  into v_regulatory
  from public.prescription_regulatory_metadata r
  where r.tenant_id = v_prescription.tenant_id
    and r.prescription_id = v_prescription.id;

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from public.prescription_versions
  where tenant_id = v_prescription.tenant_id
    and prescription_id = v_prescription.id;

  insert into public.prescription_versions (
    tenant_id,
    prescription_id,
    version_number,
    status,
    category,
    content_snapshot,
    regulatory_snapshot,
    created_by
  )
  values (
    v_prescription.tenant_id,
    v_prescription.id,
    v_next_version,
    v_prescription.status,
    v_prescription.category,
    jsonb_build_object(
      'title', v_prescription.title,
      'summary', v_prescription.summary,
      'issueDate', v_prescription.issue_date,
      'validUntil', v_prescription.valid_until,
      'items', v_items,
      'reason', coalesce(p_reason, 'snapshot')
    ),
    v_regulatory,
    p_actor_id
  );

  return v_next_version;
end;
$$;

create or replace function security.sync_prescription_placeholder(p_prescription_id uuid)
returns void
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_prescription public.prescriptions%rowtype;
  v_first_item public.prescription_items%rowtype;
begin
  select * into v_prescription
  from public.prescriptions
  where id = p_prescription_id;

  if v_prescription.id is null then
    return;
  end if;

  select * into v_first_item
  from public.prescription_items
  where tenant_id = v_prescription.tenant_id
    and prescription_id = v_prescription.id
  order by position, created_at
  limit 1;

  insert into public.prescriptions_placeholder (
    id,
    tenant_id,
    patient_id,
    encounter_id,
    status,
    category,
    prescription_text,
    medication_name,
    dosage,
    frequency,
    instructions,
    start_date,
    end_date,
    created_by,
    linked_document_id,
    version,
    cancelled_at,
    metadata,
    created_at,
    updated_at
  )
  values (
    v_prescription.id,
    v_prescription.tenant_id,
    v_prescription.patient_id,
    v_prescription.encounter_id,
    case v_prescription.status
      when 'issued' then 'final'
      when 'cancelled' then 'cancelled'
      else 'draft'
    end,
    v_prescription.category,
    v_prescription.summary,
    coalesce(v_first_item.label, v_prescription.title),
    v_first_item.dosage,
    v_first_item.frequency,
    v_first_item.instructions,
    coalesce(v_first_item.start_date, v_prescription.issue_date, current_date),
    coalesce(v_first_item.end_date, v_prescription.valid_until),
    v_prescription.created_by,
    v_prescription.linked_document_id,
    v_prescription.current_version,
    v_prescription.cancelled_at,
    coalesce(v_prescription.metadata, '{}'::jsonb) || jsonb_build_object('officialContract', true),
    v_prescription.created_at,
    v_prescription.updated_at
  )
  on conflict (id) do update
  set status = excluded.status,
      category = excluded.category,
      prescription_text = excluded.prescription_text,
      medication_name = excluded.medication_name,
      dosage = excluded.dosage,
      frequency = excluded.frequency,
      instructions = excluded.instructions,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      linked_document_id = excluded.linked_document_id,
      version = excluded.version,
      cancelled_at = excluded.cancelled_at,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.upsert_patient_prescription(
  p_patient_id uuid,
  p_prescription_id uuid default null,
  p_encounter_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_finalize boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_prescription_id uuid := coalesce(p_prescription_id, gen_random_uuid());
  v_existing public.prescriptions%rowtype;
  v_prescription public.prescriptions%rowtype;
  v_profile public.profiles%rowtype;
  v_category text := security.normalize_prescription_category(p_payload ->> 'category');
  v_status text := case when coalesce(p_finalize, true) then 'issued' else 'draft' end;
  v_title text;
  v_summary text;
  v_issue_date date;
  v_valid_until date;
  v_items jsonb;
  v_regulatory jsonb;
  v_version integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_patient_id is null then
    raise exception 'patient_required' using errcode = '22023';
  end if;

  select p.tenant_id into v_tenant_id
  from public.patients p
  where p.id = p_patient_id;

  if v_tenant_id is null then
    raise exception 'patient_not_found' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_tenant_id, 'prescriptions.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_category = 'prescricao_medica'
     and not security.user_can_issue_medical_prescription(v_tenant_id) then
    raise exception 'medical_prescription_requires_authorized_prescriber' using errcode = '42501';
  end if;

  select * into v_existing
  from public.prescriptions
  where id = p_prescription_id
  for update;

  if p_prescription_id is not null and v_existing.id is null then
    raise exception 'prescription_not_found' using errcode = '22023';
  end if;
  if v_existing.id is not null and v_existing.status <> 'draft' then
    raise exception 'issued_prescription_is_immutable' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id;

  v_title := coalesce(
    security.clean_prescription_text(p_payload ->> 'title', 160),
    security.clean_prescription_text(p_payload ->> 'medicationName', 160),
    case v_category
      when 'prescricao_medica' then 'Prescricao medica'
      when 'suplementacao' then 'Suplementacao'
      when 'plano_alimentar' then 'Plano alimentar'
      else 'Orientacao'
    end
  );
  v_summary := coalesce(
    security.clean_prescription_text(p_payload ->> 'prescriptionText', 2000),
    security.clean_prescription_text(p_payload ->> 'instructions', 2000),
    security.clean_prescription_text(p_payload ->> 'notes', 2000)
  );
  v_issue_date := coalesce(nullif(p_payload ->> 'startDate', '')::date, current_date);
  v_valid_until := coalesce(
    nullif(p_payload ->> 'endDate', '')::date,
    case v_category
      when 'prescricao_medica' then v_issue_date + 30
      when 'suplementacao' then v_issue_date + 90
      else null
    end
  );

  if jsonb_typeof(p_payload -> 'items') = 'array' and jsonb_array_length(p_payload -> 'items') > 0 then
    v_items := p_payload -> 'items';
  else
    v_items := jsonb_build_array(jsonb_build_object(
      'label', coalesce(p_payload ->> 'medicationName', v_title),
      'dosage', p_payload ->> 'dosage',
      'frequency', p_payload ->> 'frequency',
      'instructions', coalesce(p_payload ->> 'instructions', p_payload ->> 'notes'),
      'startDate', v_issue_date::text,
      'endDate', case when v_valid_until is null then null else v_valid_until::text end,
      'reminderEnabled', false
    ));
  end if;

  insert into public.prescriptions (
    id,
    tenant_id,
    patient_id,
    encounter_id,
    category,
    status,
    title,
    summary,
    issue_date,
    valid_until,
    patient_visible,
    requires_review,
    created_by,
    issued_by,
    issued_at,
    metadata
  )
  values (
    v_prescription_id,
    v_tenant_id,
    p_patient_id,
    p_encounter_id,
    v_category,
    'draft',
    v_title,
    v_summary,
    case when v_status = 'issued' then v_issue_date else null end,
    v_valid_until,
    coalesce((p_payload ->> 'patientVisible')::boolean, true),
    false,
    v_user_id,
    case when v_status = 'issued' then v_user_id else null end,
    case when v_status = 'issued' then now() else null end,
    jsonb_build_object(
      'source', 'patient360',
      'legacyPlaceholderCompatible', true,
      'legalScopeResolvedAt', now()
    )
  )
  on conflict (id) do update
    set encounter_id = excluded.encounter_id,
        category = excluded.category,
        title = excluded.title,
        summary = excluded.summary,
        valid_until = excluded.valid_until,
        patient_visible = excluded.patient_visible,
        requires_review = false,
        metadata = coalesce(public.prescriptions.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now()
  returning * into v_prescription;

  delete from public.prescription_items
  where tenant_id = v_tenant_id
    and prescription_id = v_prescription_id;

  insert into public.prescription_items (
    tenant_id,
    prescription_id,
    position,
    item_type,
    label,
    dosage,
    route,
    frequency,
    duration,
    quantity,
    instructions,
    start_date,
    end_date,
    schedule_times,
    reminder_enabled,
    metadata
  )
  select
    v_tenant_id,
    v_prescription_id,
    ordinality::integer,
    coalesce(
      nullif(item.value ->> 'itemType', ''),
      security.prescription_item_type(v_category)
    ),
    coalesce(
      security.clean_prescription_text(item.value ->> 'label', 180),
      security.clean_prescription_text(item.value ->> 'medicationName', 180),
      v_title
    ),
    security.clean_prescription_text(item.value ->> 'dosage', 120),
    security.clean_prescription_text(item.value ->> 'route', 80),
    security.clean_prescription_text(item.value ->> 'frequency', 160),
    security.clean_prescription_text(item.value ->> 'duration', 120),
    security.clean_prescription_text(item.value ->> 'quantity', 120),
    security.clean_prescription_text(item.value ->> 'instructions', 600),
    coalesce(nullif(item.value ->> 'startDate', '')::date, v_issue_date),
    coalesce(nullif(item.value ->> 'endDate', '')::date, v_valid_until),
    case
      when jsonb_typeof(item.value -> 'scheduleTimes') = 'array' then
        array(
          select distinct schedule_time
          from jsonb_array_elements_text(item.value -> 'scheduleTimes') raw(schedule_time)
          where schedule_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          order by schedule_time
        )
      else '{}'::text[]
    end,
    coalesce((item.value ->> 'reminderEnabled')::boolean, false),
    jsonb_build_object('source', 'patient360')
  from jsonb_array_elements(v_items) with ordinality as item(value, ordinality)
  where coalesce(
    security.clean_prescription_text(item.value ->> 'label', 180),
    security.clean_prescription_text(item.value ->> 'medicationName', 180),
    v_title
  ) is not null;

  v_regulatory := security.classify_prescription_regulatory_metadata(v_category);

  insert into public.prescription_regulatory_metadata (
    tenant_id,
    prescription_id,
    prescription_scope,
    regulatory_classification,
    legal_signature_requirement,
    legal_signature_status,
    d4sign_allowed,
    provider_policy,
    prescriber_profile_id,
    prescriber_name,
    issued_at,
    valid_until,
    metadata
  )
  values (
    v_tenant_id,
    v_prescription_id,
    v_regulatory ->> 'scope',
    v_regulatory ->> 'classification',
    v_regulatory ->> 'signatureRequirement',
    v_regulatory ->> 'signatureStatus',
    (v_regulatory ->> 'd4signAllowed')::boolean,
    v_regulatory ->> 'providerPolicy',
    v_user_id,
    coalesce(nullif(v_profile.full_name, ''), v_profile.email, 'Profissional'),
    case when v_status = 'issued' then now() else null end,
    v_valid_until,
    jsonb_build_object(
      'legalDecision',
      case
        when v_category = 'prescricao_medica'
          then 'medical prescriptions require qualified or ICP-Brasil flow before external signature'
        when v_category = 'suplementacao'
          then 'D4Sign may be used only for non-medical document acknowledgement'
        else 'No legal signature required by default'
      end
    )
  )
  on conflict (tenant_id, prescription_id) do update
    set prescription_scope = excluded.prescription_scope,
        regulatory_classification = excluded.regulatory_classification,
        legal_signature_requirement = excluded.legal_signature_requirement,
        legal_signature_status = excluded.legal_signature_status,
        d4sign_allowed = excluded.d4sign_allowed,
        provider_policy = excluded.provider_policy,
        prescriber_profile_id = excluded.prescriber_profile_id,
        prescriber_name = excluded.prescriber_name,
        issued_at = excluded.issued_at,
        valid_until = excluded.valid_until,
        metadata = excluded.metadata,
        updated_at = now();

  update public.medication_reminders
  set status = 'archived',
      updated_at = now()
  where tenant_id = v_tenant_id
    and prescription_id = v_prescription_id
    and source = 'prescription';

  insert into public.medication_reminders (
    tenant_id,
    patient_id,
    prescription_id,
    title,
    medication_label,
    dosage,
    instructions,
    schedule_times,
    timezone,
    start_date,
    end_date,
    patient_editable,
    external_notification_consent,
    notification_copy_mode,
    source,
    created_by,
    metadata
  )
  select
    v_tenant_id,
    p_patient_id,
    v_prescription_id,
    'Lembrete do tratamento',
    i.label,
    i.dosage,
    i.instructions,
    i.schedule_times,
    'America/Sao_Paulo',
    coalesce(i.start_date, current_date),
    i.end_date,
    true,
    false,
    'generic',
    'prescription',
    v_user_id,
    jsonb_build_object('prescriptionItemId', i.id)
  from public.prescription_items i
  where i.tenant_id = v_tenant_id
    and i.prescription_id = v_prescription_id
    and i.reminder_enabled = true
    and cardinality(i.schedule_times) > 0;

  if v_status = 'issued' then
    update public.prescriptions
    set status = 'issued',
        issue_date = v_issue_date,
        valid_until = v_valid_until,
        issued_by = v_user_id,
        issued_at = now(),
        updated_at = now()
    where id = v_prescription_id
    returning * into v_prescription;
  end if;

  v_version := security.record_prescription_version(
    v_prescription_id,
    v_user_id,
    case when v_status = 'issued' then 'issued' else 'draft_saved' end
  );

  perform set_config('slimhiper.prescription_mutation', 'version_sync', true);
  update public.prescriptions
  set current_version = v_version,
      updated_at = now()
  where id = v_prescription_id
  returning * into v_prescription;
  perform set_config('slimhiper.prescription_mutation', '', true);

  perform security.sync_prescription_placeholder(v_prescription_id);

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, title, description, event_at, payload
  )
  values (
    v_tenant_id,
    p_patient_id,
    case when v_status = 'issued' then 'prescricao_emitida' else 'prescricao_atualizada' end,
    'clinical',
    case when v_category = 'prescricao_medica' then 'Prescricao regulatoria emitida' else 'Orientacao registrada' end,
    case
      when v_category = 'prescricao_medica' then 'Registro regulatorio emitido pela equipe autorizada.'
      else 'Registro clinico atualizado pela equipe.'
    end,
    now(),
    jsonb_build_object('prescriptionId', v_prescription_id, 'category', v_category, 'version', v_version)
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    case when v_status = 'issued' then 'patient_prescription.issued' else 'patient_prescription.draft_saved' end,
    'prescription',
    v_prescription_id::text,
    jsonb_build_object('patientId', p_patient_id, 'category', v_category, 'version', v_version)
  );

  return jsonb_build_object(
    'id', v_prescription_id,
    'status', v_prescription.status,
    'version', v_version,
    'signatureRequirement', v_regulatory ->> 'signatureRequirement'
  );
exception
  when others then
    perform set_config('slimhiper.prescription_mutation', '', true);
    raise;
end;
$$;

create or replace function public.duplicate_patient_prescription(p_prescription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_source public.prescriptions%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_version integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_source
  from public.prescriptions
  where id = p_prescription_id;

  if v_source.id is null then
    raise exception 'prescription_not_found' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_source.tenant_id, 'prescriptions.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_source.category = 'prescricao_medica'
     and not security.user_can_issue_medical_prescription(v_source.tenant_id) then
    raise exception 'medical_prescription_requires_authorized_prescriber' using errcode = '42501';
  end if;

  insert into public.prescriptions (
    id,
    tenant_id,
    patient_id,
    encounter_id,
    category,
    status,
    title,
    summary,
    valid_until,
    patient_visible,
    requires_review,
    created_by,
    metadata
  )
  values (
    v_new_id,
    v_source.tenant_id,
    v_source.patient_id,
    v_source.encounter_id,
    v_source.category,
    'draft',
    v_source.title || ' (revisao)',
    v_source.summary,
    v_source.valid_until,
    v_source.patient_visible,
    true,
    v_user_id,
    coalesce(v_source.metadata, '{}'::jsonb) || jsonb_build_object('duplicatedFrom', v_source.id)
  );

  insert into public.prescription_items (
    tenant_id,
    prescription_id,
    position,
    item_type,
    label,
    dosage,
    route,
    frequency,
    duration,
    quantity,
    instructions,
    start_date,
    end_date,
    schedule_times,
    reminder_enabled,
    metadata
  )
  select
    tenant_id,
    v_new_id,
    position,
    item_type,
    label,
    dosage,
    route,
    frequency,
    duration,
    quantity,
    instructions,
    start_date,
    end_date,
    schedule_times,
    reminder_enabled,
    metadata
  from public.prescription_items
  where tenant_id = v_source.tenant_id
    and prescription_id = v_source.id;

  insert into public.prescription_regulatory_metadata (
    tenant_id,
    prescription_id,
    prescription_scope,
    regulatory_classification,
    legal_signature_requirement,
    legal_signature_status,
    d4sign_allowed,
    provider_policy,
    prescriber_profile_id,
    prescriber_name,
    valid_until,
    metadata
  )
  select
    tenant_id,
    v_new_id,
    prescription_scope,
    regulatory_classification,
    legal_signature_requirement,
    legal_signature_status,
    d4sign_allowed,
    provider_policy,
    v_user_id,
    prescriber_name,
    valid_until,
    coalesce(metadata, '{}'::jsonb) || jsonb_build_object('duplicatedFrom', v_source.id)
  from public.prescription_regulatory_metadata
  where tenant_id = v_source.tenant_id
    and prescription_id = v_source.id;

  v_version := security.record_prescription_version(v_new_id, v_user_id, 'duplicated_for_review');

  update public.prescriptions
  set current_version = v_version
  where id = v_new_id;

  perform security.sync_prescription_placeholder(v_new_id);

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_source.tenant_id,
    v_user_id,
    'patient_prescription.duplicated',
    'prescription',
    v_new_id::text,
    jsonb_build_object('sourcePrescriptionId', v_source.id, 'patientId', v_source.patient_id, 'requiresReview', true)
  );

  return jsonb_build_object('id', v_new_id, 'status', 'draft', 'requiresReview', true);
end;
$$;

create or replace function public.link_patient_prescription_document(
  p_prescription_id uuid,
  p_generated_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_prescription public.prescriptions%rowtype;
  v_document public.generated_documents%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_prescription_id is null or p_generated_document_id is null then
    raise exception 'prescription_and_document_required' using errcode = '22023';
  end if;

  select * into v_prescription
  from public.prescriptions
  where id = p_prescription_id;

  if v_prescription.id is null then
    raise exception 'prescription_not_found' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_prescription.tenant_id, 'prescriptions.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.has_clinical_permission(v_prescription.tenant_id, 'documents.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_document
  from public.generated_documents
  where id = p_generated_document_id
    and tenant_id = v_prescription.tenant_id
    and patient_id = v_prescription.patient_id;

  if v_document.id is null then
    raise exception 'document_not_found' using errcode = '22023';
  end if;

  perform set_config('slimhiper.prescription_mutation', 'document_link', true);
  update public.prescriptions
  set linked_document_id = v_document.id,
      updated_at = now()
  where id = v_prescription.id;
  perform set_config('slimhiper.prescription_mutation', '', true);

  perform security.sync_prescription_placeholder(v_prescription.id);

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, title, description, event_at, details_href, payload
  )
  values (
    v_prescription.tenant_id,
    v_prescription.patient_id,
    'prescricao_documento_vinculado',
    'documents',
    'Documento vinculado a prescricao',
    coalesce(v_document.name, 'Documento clinico'),
    now(),
    '/clinic/patients/' || v_prescription.patient_id::text || '?tab=documentos',
    jsonb_build_object('prescriptionId', v_prescription.id, 'documentId', v_document.id)
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_prescription.tenant_id,
    v_user_id,
    'patient_prescription.document_linked',
    'prescription',
    v_prescription.id::text,
    jsonb_build_object('patientId', v_prescription.patient_id, 'documentId', v_document.id)
  );

  return jsonb_build_object(
    'id', v_prescription.id,
    'documentId', v_document.id,
    'documentName', v_document.name,
    'status', v_document.status
  );
exception
  when others then
    perform set_config('slimhiper.prescription_mutation', '', true);
    raise;
end;
$$;

create or replace function public.cancel_patient_prescription(
  p_prescription_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_prescription public.prescriptions%rowtype;
  v_reason text := security.clean_prescription_text(p_reason, 240);
  v_version integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'cancel_reason_required' using errcode = '22023';
  end if;

  select * into v_prescription
  from public.prescriptions
  where id = p_prescription_id;

  if v_prescription.id is null then
    raise exception 'prescription_not_found' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_prescription.tenant_id, 'prescriptions.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_prescription.status = 'cancelled' then
    return jsonb_build_object('id', p_prescription_id, 'status', 'cancelled');
  end if;

  perform set_config('slimhiper.prescription_mutation', 'cancel', true);
  update public.prescriptions
  set status = 'cancelled',
      cancelled_by = v_user_id,
      cancelled_at = now(),
      cancel_reason = v_reason,
      updated_at = now()
  where id = p_prescription_id
  returning * into v_prescription;
  perform set_config('slimhiper.prescription_mutation', '', true);

  update public.medication_reminders
  set status = 'archived',
      updated_at = now()
  where tenant_id = v_prescription.tenant_id
    and prescription_id = v_prescription.id
    and source = 'prescription'
    and status <> 'archived';

  v_version := security.record_prescription_version(v_prescription.id, v_user_id, 'cancelled');
  perform set_config('slimhiper.prescription_mutation', 'version_sync', true);
  update public.prescriptions
  set current_version = v_version
  where id = v_prescription.id;
  perform set_config('slimhiper.prescription_mutation', '', true);

  perform security.sync_prescription_placeholder(v_prescription.id);

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_prescription.tenant_id,
    v_user_id,
    'patient_prescription.cancelled',
    'prescription',
    p_prescription_id::text,
    jsonb_build_object('patientId', v_prescription.patient_id, 'reasonProvided', true, 'version', v_version)
  );

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, title, description, event_at, payload
  )
  values (
    v_prescription.tenant_id,
    v_prescription.patient_id,
    'prescricao_cancelada',
    'clinical',
    'Prescricao cancelada',
    'Registro cancelado pela equipe com motivo auditado.',
    now(),
    jsonb_build_object('prescriptionId', v_prescription.id, 'version', v_version)
  );

  return jsonb_build_object('id', p_prescription_id, 'status', 'cancelled', 'version', v_version);
exception
  when others then
    perform set_config('slimhiper.prescription_mutation', '', true);
    raise;
end;
$$;

insert into public.prescriptions (
  id,
  tenant_id,
  patient_id,
  encounter_id,
  category,
  status,
  title,
  summary,
  issue_date,
  valid_until,
  patient_visible,
  current_version,
  linked_document_id,
  created_by,
  issued_by,
  issued_at,
  cancelled_by,
  cancelled_at,
  cancel_reason,
  metadata,
  created_at,
  updated_at
)
select
  pp.id,
  pp.tenant_id,
  pp.patient_id,
  pp.encounter_id,
  security.normalize_prescription_category(pp.category),
  case pp.status
    when 'final' then 'issued'
    when 'cancelled' then 'cancelled'
    else 'draft'
  end,
  coalesce(nullif(pp.medication_name, ''), nullif(pp.prescription_text, ''), 'Prescricao registrada'),
  coalesce(pp.instructions, pp.prescription_text),
  case when pp.status = 'final' then coalesce(pp.start_date, pp.created_at::date) else null end,
  pp.end_date,
  true,
  greatest(coalesce(pp.version, 1), 1),
  pp.linked_document_id,
  pp.created_by,
  case when pp.status = 'final' then pp.created_by else null end,
  case when pp.status = 'final' then pp.created_at else null end,
  case when pp.status = 'cancelled' then pp.created_by else null end,
  case when pp.status = 'cancelled' then coalesce(pp.cancelled_at, pp.updated_at, now()) else null end,
  case when pp.status = 'cancelled' then coalesce(pp.metadata ->> 'cancelReason', 'Migrated cancellation') else null end,
  coalesce(pp.metadata, '{}'::jsonb) || jsonb_build_object('migratedFromPlaceholder', true),
  pp.created_at,
  pp.updated_at
from public.prescriptions_placeholder pp
on conflict (id) do nothing;

insert into public.prescription_items (
  tenant_id,
  prescription_id,
  position,
  item_type,
  label,
  dosage,
  frequency,
  instructions,
  start_date,
  end_date,
  metadata,
  created_at,
  updated_at
)
select
  pp.tenant_id,
  pp.id,
  1,
  security.prescription_item_type(pp.category),
  coalesce(nullif(pp.medication_name, ''), nullif(pp.prescription_text, ''), 'Registro clinico'),
  pp.dosage,
  pp.frequency,
  pp.instructions,
  pp.start_date,
  pp.end_date,
  jsonb_build_object('migratedFromPlaceholder', true),
  pp.created_at,
  pp.updated_at
from public.prescriptions_placeholder pp
where not exists (
  select 1
  from public.prescription_items pi
  where pi.tenant_id = pp.tenant_id
    and pi.prescription_id = pp.id
);

insert into public.prescription_regulatory_metadata (
  tenant_id,
  prescription_id,
  prescription_scope,
  regulatory_classification,
  legal_signature_requirement,
  legal_signature_status,
  d4sign_allowed,
  provider_policy,
  prescriber_profile_id,
  prescriber_name,
  issued_at,
  valid_until,
  metadata,
  created_at,
  updated_at
)
select
  p.tenant_id,
  p.id,
  security.classify_prescription_regulatory_metadata(p.category) ->> 'scope',
  security.classify_prescription_regulatory_metadata(p.category) ->> 'classification',
  security.classify_prescription_regulatory_metadata(p.category) ->> 'signatureRequirement',
  security.classify_prescription_regulatory_metadata(p.category) ->> 'signatureStatus',
  (security.classify_prescription_regulatory_metadata(p.category) ->> 'd4signAllowed')::boolean,
  security.classify_prescription_regulatory_metadata(p.category) ->> 'providerPolicy',
  p.issued_by,
  coalesce(profile.full_name, profile.email, 'Equipe clinica'),
  p.issued_at,
  p.valid_until,
  jsonb_build_object('migratedFromPlaceholder', true),
  p.created_at,
  p.updated_at
from public.prescriptions p
left join public.profiles profile on profile.id = p.issued_by
on conflict (tenant_id, prescription_id) do nothing;

do $$
declare
  v_prescription_id uuid;
begin
  perform set_config('slimhiper.prescription_mutation', 'system_migration', true);
  for v_prescription_id in select id from public.prescriptions loop
    if not exists (
      select 1
      from public.prescription_versions pv
      where pv.prescription_id = v_prescription_id
    ) then
      perform security.record_prescription_version(v_prescription_id, null, 'migrated_from_placeholder');
    end if;
  end loop;

  update public.prescriptions p
  set current_version = versions.max_version,
      updated_at = p.updated_at
  from (
    select tenant_id, prescription_id, max(version_number) as max_version
    from public.prescription_versions
    group by tenant_id, prescription_id
  ) versions
  where versions.tenant_id = p.tenant_id
    and versions.prescription_id = p.id;

  perform set_config('slimhiper.prescription_mutation', '', true);
exception
  when others then
    perform set_config('slimhiper.prescription_mutation', '', true);
    raise;
end $$;

do $$
begin
  alter table public.medication_reminders
    drop constraint if exists medication_reminders_prescription_same_tenant;

  alter table public.medication_reminders
    add constraint medication_reminders_prescription_same_tenant
    foreign key (tenant_id, prescription_id)
    references public.prescriptions(tenant_id, id)
    on delete set null (prescription_id);
exception
  when duplicate_object then null;
end $$;

revoke all on function security.clean_prescription_text(text, integer) from public;
revoke all on function security.normalize_prescription_category(text) from public;
revoke all on function security.prescription_item_type(text) from public;
revoke all on function security.prescription_signature_requirement(text) from public;
revoke all on function security.prescription_signature_status(text) from public;
revoke all on function security.is_valid_prescription_pdf_path(text) from public;
revoke all on function security.user_can_issue_medical_prescription(uuid) from public;
revoke all on function security.classify_prescription_regulatory_metadata(text) from public;
revoke all on function security.record_prescription_version(uuid, uuid, text) from public;
revoke all on function security.sync_prescription_placeholder(uuid) from public;
revoke all on function security.prevent_issued_prescription_mutation() from public;
revoke all on function security.prevent_issued_prescription_item_mutation() from public;
revoke all on function security.prevent_prescription_version_change() from public;

grant execute on function security.is_valid_prescription_pdf_path(text) to authenticated, service_role;
grant execute on function security.user_can_issue_medical_prescription(uuid) to authenticated, service_role;
grant execute on function security.classify_prescription_regulatory_metadata(text) to service_role;
grant execute on function security.record_prescription_version(uuid, uuid, text) to service_role;
grant execute on function security.sync_prescription_placeholder(uuid) to service_role;

grant execute on function public.upsert_patient_prescription(uuid, uuid, uuid, jsonb, boolean)
  to authenticated, service_role;
grant execute on function public.duplicate_patient_prescription(uuid)
  to authenticated, service_role;
grant execute on function public.link_patient_prescription_document(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.cancel_patient_prescription(uuid, text)
  to authenticated, service_role;

comment on table public.prescriptions is
  'Official M10 regulatory prescription header. Issued records are immutable except audited cancellation/document links.';
comment on table public.prescription_items is
  'Structured prescription items and dosage/reminder metadata.';
comment on table public.prescription_versions is
  'Append-only immutable prescription snapshots for audit/version history.';
comment on table public.prescription_regulatory_metadata is
  'Regulatory classification and legal signature policy summary without raw provider payloads.';
comment on table public.prescription_pdf_artifacts is
  'Private prescription PDF storage metadata. Access is through short-lived Edge signed URLs.';
comment on table public.legal_signatures is
  'Signature validation summaries for prescription artifacts. Raw provider payloads are intentionally excluded.';
