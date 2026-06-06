-- Completes remaining local/homologation contracts for previously blocked UI actions.
-- Scope: new contracts and RPCs only. Do not apply to production without release approval.

alter table public.prescriptions_placeholder
  add column if not exists category text not null default 'prescricao_medica'
    check (category in ('prescricao_medica', 'suplementacao', 'orientacoes_nutricionais', 'orientacoes_gerais')),
  add column if not exists linked_document_id uuid,
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists cancelled_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.prescriptions_placeholder
    add constraint prescriptions_placeholder_linked_document_same_tenant
    foreign key (tenant_id, linked_document_id)
    references public.generated_documents(tenant_id, id)
    on delete set null (linked_document_id);
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_prescriptions_patient_status
  on public.prescriptions_placeholder(tenant_id, patient_id, status, created_at desc);

create table if not exists public.patient_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  payment_id uuid,
  receipt_number text not null,
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  issued_by uuid references public.profiles(id) on delete set null,
  issued_at timestamptz not null default now(),
  payment_date date not null default current_date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, receipt_number),
  constraint patient_receipts_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint patient_receipts_payment_same_tenant
    foreign key (tenant_id, payment_id)
    references public.payments(tenant_id, id)
);

alter table public.patient_receipts
  add column if not exists payment_date date not null default current_date;

create table if not exists public.billing_negotiations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  original_amount_cents integer not null default 0 check (original_amount_cents >= 0),
  negotiated_amount_cents integer not null default 0 check (negotiated_amount_cents >= 0),
  installments integer not null default 1 check (installments > 0),
  status text not null default 'ativa'
    check (status in ('ativa', 'concluida', 'cancelada', 'pendente_aprovacao')),
  description text not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint billing_negotiations_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  patient_invoice_id uuid,
  channel text not null default 'portal' check (channel in ('portal', 'inbox')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  message text not null,
  created_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint payment_reminders_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint payment_reminders_invoice_same_tenant
    foreign key (tenant_id, patient_invoice_id)
    references public.patient_invoices(tenant_id, id)
);

create table if not exists public.patient_financial_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  title text not null,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_financial_contracts_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.document_evidence_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  generated_document_id uuid not null,
  patient_id uuid not null,
  status text not null default 'available' check (status in ('available', 'building', 'failed')),
  storage_path text,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, generated_document_id),
  constraint document_evidence_packages_document_same_tenant
    foreign key (tenant_id, generated_document_id)
    references public.generated_documents(tenant_id, id)
    on delete cascade,
  constraint document_evidence_packages_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table if not exists public.webhook_reprocess_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  provider text not null check (provider in ('asaas', 'd4sign')),
  event_id uuid not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'processed', 'failed', 'not_reprocessable')),
  reason text not null,
  requested_by uuid references public.profiles(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

select security.touch_updated_at('public.patient_receipts');
select security.touch_updated_at('public.billing_negotiations');
select security.touch_updated_at('public.payment_reminders');
select security.touch_updated_at('public.patient_financial_contracts');
select security.touch_updated_at('public.document_evidence_packages');

alter table public.patient_receipts enable row level security;
alter table public.billing_negotiations enable row level security;
alter table public.payment_reminders enable row level security;
alter table public.patient_financial_contracts enable row level security;
alter table public.document_evidence_packages enable row level security;
alter table public.webhook_reprocess_jobs enable row level security;

drop policy if exists patient_receipts_select_financial_read on public.patient_receipts;
create policy patient_receipts_select_financial_read on public.patient_receipts
for select to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.read'));

drop policy if exists patient_receipts_write_financial_write on public.patient_receipts;
create policy patient_receipts_write_financial_write on public.patient_receipts
for all to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.write'))
with check (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.write'));

drop policy if exists billing_negotiations_select_financial_read on public.billing_negotiations;
create policy billing_negotiations_select_financial_read on public.billing_negotiations
for select to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.read'));

drop policy if exists billing_negotiations_write_financial_write on public.billing_negotiations;
create policy billing_negotiations_write_financial_write on public.billing_negotiations
for all to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.write'))
with check (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.write'));

drop policy if exists payment_reminders_select_financial_read on public.payment_reminders;
create policy payment_reminders_select_financial_read on public.payment_reminders
for select to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.read'));

drop policy if exists payment_reminders_write_financial_write on public.payment_reminders;
create policy payment_reminders_write_financial_write on public.payment_reminders
for all to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.write'))
with check (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.write'));

drop policy if exists patient_financial_contracts_select_financial_read on public.patient_financial_contracts;
create policy patient_financial_contracts_select_financial_read on public.patient_financial_contracts
for select to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.read'));

drop policy if exists patient_financial_contracts_write_financial_write on public.patient_financial_contracts;
create policy patient_financial_contracts_write_financial_write on public.patient_financial_contracts
for all to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.write'))
with check (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'financial.write'));

drop policy if exists document_evidence_packages_select_documents_read on public.document_evidence_packages;
create policy document_evidence_packages_select_documents_read on public.document_evidence_packages
for select to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'documents.read'));

drop policy if exists document_evidence_packages_write_documents_write on public.document_evidence_packages;
create policy document_evidence_packages_write_documents_write on public.document_evidence_packages
for all to authenticated
using (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'documents.write'))
with check (security.is_tenant_member(tenant_id) and public.has_clinical_permission(tenant_id, 'documents.write'));

drop policy if exists webhook_reprocess_jobs_platform_select on public.webhook_reprocess_jobs;
create policy webhook_reprocess_jobs_platform_select on public.webhook_reprocess_jobs
for select to authenticated
using (security.can_access_platform_operations());

drop policy if exists webhook_reprocess_jobs_platform_insert on public.webhook_reprocess_jobs;
create policy webhook_reprocess_jobs_platform_insert on public.webhook_reprocess_jobs
for insert to authenticated
with check (security.can_access_platform_operations());

grant select, insert, update, delete on public.patient_receipts to authenticated, service_role;
grant select, insert, update, delete on public.billing_negotiations to authenticated, service_role;
grant select, insert, update, delete on public.payment_reminders to authenticated, service_role;
grant select, insert, update, delete on public.patient_financial_contracts to authenticated, service_role;
grant select, insert, update, delete on public.document_evidence_packages to authenticated, service_role;
grant select, insert on public.webhook_reprocess_jobs to authenticated, service_role;

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
  v_prescription public.prescriptions_placeholder%rowtype;
  v_status text := case when coalesce(p_finalize, true) then 'final' else 'draft' end;
  v_category text := coalesce(nullif(p_payload ->> 'category', ''), 'prescricao_medica');
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
  if v_category not in ('prescricao_medica', 'suplementacao', 'orientacoes_nutricionais', 'orientacoes_gerais') then
    raise exception 'invalid_prescription_category' using errcode = '22023';
  end if;

  insert into public.prescriptions_placeholder (
    id, tenant_id, patient_id, encounter_id, status, category,
    prescription_text, medication_name, dosage, frequency, instructions,
    start_date, end_date, created_by, metadata
  )
  values (
    coalesce(p_prescription_id, gen_random_uuid()),
    v_tenant_id,
    p_patient_id,
    p_encounter_id,
    v_status,
    v_category,
    nullif(btrim(coalesce(p_payload ->> 'prescriptionText', p_payload ->> 'notes', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'medicationName', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'dosage', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'frequency', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'instructions', p_payload ->> 'notes', '')), ''),
    coalesce(nullif(p_payload ->> 'startDate', '')::date, current_date),
    nullif(p_payload ->> 'endDate', '')::date,
    v_user_id,
    jsonb_build_object('source', 'patient360')
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
        version = public.prescriptions_placeholder.version + 1,
        updated_at = now()
  returning * into v_prescription;

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, title, description, event_at, payload
  )
  values (
    v_tenant_id,
    p_patient_id,
    case when p_prescription_id is null then 'prescricao_emitida' else 'prescricao_atualizada' end,
    'clinical',
    case when v_category = 'prescricao_medica' then 'Prescricao registrada' else 'Orientacao registrada' end,
    coalesce(v_prescription.medication_name, v_prescription.prescription_text, 'Registro clinico'),
    now(),
    jsonb_build_object('prescriptionId', v_prescription.id, 'category', v_category)
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'patient_prescription.upserted',
    'prescription',
    v_prescription.id::text,
    jsonb_build_object('patientId', p_patient_id, 'category', v_category, 'status', v_status)
  );

  return jsonb_build_object('id', v_prescription.id, 'status', v_prescription.status);
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
  v_source public.prescriptions_placeholder%rowtype;
  v_new_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_source
  from public.prescriptions_placeholder
  where id = p_prescription_id;

  if v_source.id is null then
    raise exception 'prescription_not_found' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_source.tenant_id, 'prescriptions.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.prescriptions_placeholder (
    tenant_id, patient_id, encounter_id, status, category, prescription_text,
    medication_name, dosage, frequency, instructions, start_date, end_date,
    created_by, metadata
  )
  values (
    v_source.tenant_id, v_source.patient_id, v_source.encounter_id, 'draft',
    v_source.category, v_source.prescription_text, v_source.medication_name,
    v_source.dosage, v_source.frequency, v_source.instructions, current_date,
    v_source.end_date, v_user_id,
    coalesce(v_source.metadata, '{}'::jsonb) || jsonb_build_object('duplicatedFrom', v_source.id)
  )
  returning id into v_new_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_source.tenant_id,
    v_user_id,
    'patient_prescription.duplicated',
    'prescription',
    v_new_id::text,
    jsonb_build_object('sourcePrescriptionId', v_source.id, 'patientId', v_source.patient_id)
  );

  return jsonb_build_object('id', v_new_id, 'status', 'draft');
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
  v_prescription public.prescriptions_placeholder%rowtype;
  v_document public.generated_documents%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_prescription_id is null or p_generated_document_id is null then
    raise exception 'prescription_and_document_required' using errcode = '22023';
  end if;

  select * into v_prescription
  from public.prescriptions_placeholder
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

  update public.prescriptions_placeholder
     set linked_document_id = v_document.id,
         updated_at = now()
   where id = v_prescription.id;

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
end;
$$;

create or replace function public.cancel_patient_prescription(p_prescription_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_prescription public.prescriptions_placeholder%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_prescription
  from public.prescriptions_placeholder
  where id = p_prescription_id;

  if v_prescription.id is null then
    raise exception 'prescription_not_found' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_prescription.tenant_id, 'prescriptions.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.prescriptions_placeholder
     set status = 'cancelled',
         cancelled_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancelReason', left(coalesce(p_reason, ''), 240)),
         updated_at = now()
   where id = p_prescription_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_prescription.tenant_id,
    v_user_id,
    'patient_prescription.cancelled',
    'prescription',
    p_prescription_id::text,
    jsonb_build_object('patientId', v_prescription.patient_id, 'reasonProvided', coalesce(p_reason, '') <> '')
  );

  return jsonb_build_object('id', p_prescription_id, 'status', 'cancelled');
end;
$$;

create or replace function public.save_patient_nutrition_plan(
  p_patient_id uuid,
  p_plan_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_publish boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_plan_id uuid;
  v_name text := nullif(btrim(coalesce(p_payload ->> 'planName', p_payload ->> 'name', '')), '');
  v_status text := case when coalesce(p_publish, true) then 'active' else 'draft' end;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select p.tenant_id into v_tenant_id
  from public.patients p
  where p.id = p_patient_id;

  if v_tenant_id is null then
    raise exception 'patient_not_found' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_tenant_id, 'nutrition.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'nutrition_plan_name_required' using errcode = '22023';
  end if;

  if v_status = 'active' then
    update public.nutrition_plans
       set status = 'archived',
           archived_at = coalesce(archived_at, now()),
           updated_at = now()
     where tenant_id = v_tenant_id
       and patient_id = p_patient_id
       and status = 'active'
       and (p_plan_id is null or id <> p_plan_id);
  end if;

  insert into public.nutrition_plans (
    id, tenant_id, patient_id, status, name, target_calories, target_protein_g,
    target_carbs_g, target_fat_g, meals, food_groups, meal_adherence, metadata,
    created_by, published_at
  )
  values (
    coalesce(p_plan_id, gen_random_uuid()),
    v_tenant_id,
    p_patient_id,
    v_status,
    v_name,
    greatest(coalesce((p_payload ->> 'targetCalories')::integer, 0), 0),
    greatest(coalesce((p_payload ->> 'targetProteinG')::numeric, 0), 0),
    greatest(coalesce((p_payload ->> 'targetCarbsG')::numeric, 0), 0),
    greatest(coalesce((p_payload ->> 'targetFatG')::numeric, 0), 0),
    coalesce(p_payload -> 'meals', '[]'::jsonb),
    coalesce(p_payload -> 'foodGroups', p_payload -> 'food_groups', '[]'::jsonb),
    coalesce(p_payload -> 'mealAdherence', p_payload -> 'meal_adherence', '[]'::jsonb),
    coalesce(p_payload -> 'metadata', '{}'::jsonb) || jsonb_build_object('nutritionistName', 'Equipe de Nutricao'),
    v_user_id,
    case when v_status = 'active' then now() else null end
  )
  on conflict (id) do update
    set status = excluded.status,
        name = excluded.name,
        target_calories = excluded.target_calories,
        target_protein_g = excluded.target_protein_g,
        target_carbs_g = excluded.target_carbs_g,
        target_fat_g = excluded.target_fat_g,
        meals = excluded.meals,
        food_groups = excluded.food_groups,
        meal_adherence = excluded.meal_adherence,
        metadata = excluded.metadata,
        published_at = coalesce(excluded.published_at, public.nutrition_plans.published_at),
        updated_at = now()
  returning id into v_plan_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'nutrition_plan.saved',
    'nutrition_plan',
    v_plan_id::text,
    jsonb_build_object('patientId', p_patient_id, 'status', v_status)
  );

  return jsonb_build_object('id', v_plan_id, 'status', v_status);
end;
$$;

create or replace function public.archive_patient_nutrition_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.nutrition_plans%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_plan from public.nutrition_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'nutrition_plan_not_found' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_plan.tenant_id, 'nutrition.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.nutrition_plans
     set status = 'archived',
         archived_at = coalesce(archived_at, now()),
         updated_at = now()
   where id = p_plan_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_plan.tenant_id,
    v_user_id,
    'nutrition_plan.archived',
    'nutrition_plan',
    p_plan_id::text,
    jsonb_build_object('patientId', v_plan.patient_id)
  );

  return jsonb_build_object('id', p_plan_id, 'status', 'archived');
end;
$$;

create or replace function public.update_patient_package_status(
  p_enrollment_id uuid,
  p_status text,
  p_reason text default null,
  p_extend_weeks integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_enrollment public.patient_program_enrollments%rowtype;
  v_next_end_date date;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_enrollment
  from public.patient_program_enrollments
  where id = p_enrollment_id;

  if v_enrollment.id is null then
    raise exception 'package_not_found' using errcode = '22023';
  end if;
  if p_status not in ('ativo', 'pausado', 'concluido', 'cancelado', 'aguardando') then
    raise exception 'invalid_package_status' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_enrollment.tenant_id, 'packages.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_next_end_date := case
    when coalesce(p_extend_weeks, 0) > 0 then coalesce(v_enrollment.end_date, current_date) + (p_extend_weeks || ' weeks')::interval
    else v_enrollment.end_date
  end;

  update public.patient_program_enrollments
     set status = p_status,
         end_date = v_next_end_date,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'lastActionReason', left(coalesce(p_reason, ''), 240),
           'lastActionAt', now(),
           'lastActionBy', v_user_id
         ),
         updated_at = now()
   where id = p_enrollment_id;

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, title, description, event_at, payload
  )
  values (
    v_enrollment.tenant_id,
    v_enrollment.patient_id,
    'pacote_atualizado',
    'commercial',
    'Pacote atualizado',
    'Status alterado para ' || p_status,
    now(),
    jsonb_build_object('enrollmentId', p_enrollment_id, 'status', p_status, 'extendedWeeks', coalesce(p_extend_weeks, 0))
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_enrollment.tenant_id,
    v_user_id,
    'patient_package.status_updated',
    'patient_program_enrollment',
    p_enrollment_id::text,
    jsonb_build_object('patientId', v_enrollment.patient_id, 'status', p_status, 'reasonProvided', coalesce(p_reason, '') <> '')
  );

  return jsonb_build_object('id', p_enrollment_id, 'status', p_status, 'endDate', v_next_end_date);
end;
$$;

create or replace function public.create_patient_financial_local_action(
  p_patient_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_id uuid;
  v_amount_cents integer := greatest(coalesce((p_payload ->> 'amountCents')::integer, 0), 0);
  v_description text := nullif(btrim(coalesce(p_payload ->> 'description', '')), '');
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select p.tenant_id into v_tenant_id
  from public.patients p
  where p.id = p_patient_id;

  if v_tenant_id is null then
    raise exception 'patient_not_found' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_tenant_id, 'financial.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_action = 'reminder' then
    insert into public.payment_reminders (
      tenant_id, patient_id, patient_invoice_id, channel, status, message, created_by, sent_at
    )
    values (
      v_tenant_id,
      p_patient_id,
      nullif(p_payload ->> 'invoiceId', '')::uuid,
      'portal',
      'sent',
      coalesce(v_description, 'Lembrete financeiro enviado pelo time da clinica.'),
      v_user_id,
      now()
    )
    returning id into v_id;
  elsif p_action = 'receipt' then
    insert into public.patient_receipts (
      tenant_id, patient_id, payment_id, receipt_number, description, amount_cents, issued_by, metadata
    )
    values (
      v_tenant_id,
      p_patient_id,
      nullif(p_payload ->> 'paymentId', '')::uuid,
      'REC-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6),
      coalesce(v_description, 'Recibo financeiro'),
      v_amount_cents,
      v_user_id,
      coalesce(p_payload -> 'metadata', '{}'::jsonb)
    )
    returning id into v_id;
  elsif p_action = 'payment' then
    insert into public.payments (
      tenant_id, patient_id, patient_invoice_id, status, amount_cents, paid_at, due_date, method, metadata
    )
    values (
      v_tenant_id,
      p_patient_id,
      nullif(p_payload ->> 'invoiceId', '')::uuid,
      'paid',
      v_amount_cents,
      coalesce(nullif(p_payload ->> 'paidAt', '')::timestamptz, now()),
      nullif(p_payload ->> 'dueDate', '')::date,
      coalesce(nullif(p_payload ->> 'method', ''), 'manual'),
      coalesce(p_payload -> 'metadata', '{}'::jsonb) || jsonb_build_object('source', 'manual_local_action')
    )
    returning id into v_id;

    insert into public.patient_receipts (
      tenant_id, patient_id, payment_id, receipt_number, description, amount_cents, issued_by, metadata
    )
    values (
      v_tenant_id,
      p_patient_id,
      v_id,
      'REC-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6),
      coalesce(v_description, 'Pagamento manual registrado'),
      v_amount_cents,
      v_user_id,
      jsonb_build_object('paymentId', v_id, 'source', 'manual_payment')
    );
  elsif p_action = 'contract' then
    insert into public.patient_financial_contracts (
      tenant_id, patient_id, title, amount_cents, status, created_by, metadata
    )
    values (
      v_tenant_id,
      p_patient_id,
      coalesce(v_description, 'Contrato financeiro'),
      v_amount_cents,
      'active',
      v_user_id,
      coalesce(p_payload -> 'metadata', '{}'::jsonb)
    )
    returning id into v_id;
  elsif p_action = 'negotiation' then
    insert into public.billing_negotiations (
      tenant_id, patient_id, original_amount_cents, negotiated_amount_cents,
      installments, status, description, notes, created_by
    )
    values (
      v_tenant_id,
      p_patient_id,
      greatest(coalesce((p_payload ->> 'originalAmountCents')::integer, v_amount_cents), 0),
      v_amount_cents,
      greatest(coalesce((p_payload ->> 'installments')::integer, 1), 1),
      'ativa',
      coalesce(v_description, 'Renegociacao financeira'),
      nullif(p_payload ->> 'notes', ''),
      v_user_id
    )
    returning id into v_id;
  else
    raise exception 'invalid_financial_action' using errcode = '22023';
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'patient_financial.' || p_action,
    'patient_financial_action',
    v_id::text,
    jsonb_build_object('patientId', p_patient_id)
  );

  return jsonb_build_object('id', v_id, 'action', p_action, 'status', 'ok');
end;
$$;

create or replace function public.get_patient_document_evidence(
  p_generated_document_id uuid,
  p_patient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_document public.generated_documents%rowtype;
  v_signature jsonb := '{}'::jsonb;
  v_evidence public.document_evidence_packages%rowtype;
begin
  select * into v_document
  from public.generated_documents gd
  where gd.id = p_generated_document_id
    and gd.patient_id = p_patient_id;

  if v_document.id is null then
    raise exception 'document_not_found' using errcode = '22023';
  end if;

  v_tenant_id := v_document.tenant_id;
  if not public.has_clinical_permission(v_tenant_id, 'documents.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sr.id,
        'status', sr.status,
        'createdAt', sr.created_at,
        'providerDocumentIdPresent', sr.provider_document_id is not null
      )
      order by sr.created_at desc
    ),
    '[]'::jsonb
  )
  into v_signature
  from public.signature_requests sr
  where sr.tenant_id = v_tenant_id
    and sr.generated_document_id = p_generated_document_id;

  select * into v_evidence
  from public.document_evidence_packages
  where tenant_id = v_tenant_id
    and generated_document_id = p_generated_document_id;

  if v_evidence.id is null then
    insert into public.document_evidence_packages (
      tenant_id, generated_document_id, patient_id, status, summary
    )
    values (
      v_tenant_id,
      p_generated_document_id,
      p_patient_id,
      'available',
      jsonb_build_object('generatedAt', v_document.generated_at, 'signatureRequests', v_signature)
    )
    returning * into v_evidence;
  end if;

  return jsonb_build_object(
    'id', v_evidence.id,
    'documentId', v_document.id,
    'documentName', v_document.name,
    'status', v_evidence.status,
    'summary', coalesce(v_evidence.summary, '{}'::jsonb) || jsonb_build_object('signatureRequests', v_signature),
    'hasPackage', v_evidence.storage_path is not null,
    'createdAt', v_evidence.created_at
  );
end;
$$;

create or replace function public.request_webhook_reprocess(
  p_provider text,
  p_event_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_provider text := lower(coalesce(p_provider, ''));
  v_tenant_id uuid;
  v_reprocessable boolean := false;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not security.can_access_platform_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 12 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  if v_provider = 'asaas' then
    select ae.tenant_id, ae.status in ('failed', 'ignored', 'received')
      into v_tenant_id, v_reprocessable
    from public.asaas_events ae
    where ae.id = p_event_id;
  elsif v_provider = 'd4sign' then
    select de.tenant_id, de.status in ('failed', 'ignored', 'received', 'error')
      into v_tenant_id, v_reprocessable
    from public.d4sign_events de
    where de.id = p_event_id;
  else
    raise exception 'invalid_provider' using errcode = '22023';
  end if;

  if p_event_id is null or v_tenant_id is null then
    raise exception 'webhook_event_not_found' using errcode = '22023';
  end if;

  insert into public.webhook_reprocess_jobs (
    tenant_id, provider, event_id, status, reason, requested_by
  )
  values (
    v_tenant_id,
    v_provider,
    p_event_id,
    case when v_reprocessable then 'queued' else 'not_reprocessable' end,
    left(btrim(p_reason), 500),
    v_user_id
  )
  returning id into v_job_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'webhook_reprocess.requested',
    'webhook_event',
    p_event_id::text,
    jsonb_build_object('provider', v_provider, 'jobId', v_job_id, 'queued', v_reprocessable)
  );

  return jsonb_build_object(
    'id', v_job_id,
    'status', case when v_reprocessable then 'queued' else 'not_reprocessable' end
  );
end;
$$;

create or replace function public.update_clinic_member_role(
  p_membership_id uuid,
  p_role_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.tenant_memberships%rowtype;
  v_role_code text := lower(btrim(coalesce(p_role_code, '')));
  v_owner_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_membership_id is null or v_role_code = '' then
    raise exception 'membership_and_role_required' using errcode = '22023';
  end if;

  select * into v_membership
  from public.tenant_memberships
  where id = p_membership_id;

  if v_membership.id is null then
    raise exception 'membership_not_found' using errcode = '22023';
  end if;
  if not security.has_permission(v_membership.tenant_id, 'settings.write', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.roles r
    where r.tenant_id = v_membership.tenant_id
      and r.name = v_role_code
  ) then
    raise exception 'role_not_found' using errcode = '22023';
  end if;

  if v_membership.role_code = 'tenant_owner' and v_role_code <> 'tenant_owner' then
    select count(*)::integer into v_owner_count
    from public.tenant_memberships tm
    where tm.tenant_id = v_membership.tenant_id
      and tm.role_code = 'tenant_owner'
      and tm.status = 'active';

    if v_owner_count <= 1 and v_membership.status = 'active' then
      raise exception 'last_owner_cannot_be_demoted' using errcode = '42501';
    end if;
  end if;

  update public.tenant_memberships
     set role_code = v_role_code,
         role = v_role_code,
         updated_at = now()
   where id = v_membership.id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_membership.tenant_id,
    v_user_id,
    'clinic_member.role_updated',
    'tenant_membership',
    v_membership.id::text,
    jsonb_build_object('fromRole', v_membership.role_code, 'toRole', v_role_code, 'targetUserId', v_membership.user_id)
  );

  return jsonb_build_object('id', v_membership.id, 'roleCode', v_role_code, 'status', 'ok');
end;
$$;

create or replace function public.create_patient_review_flag(
  p_patient_id uuid,
  p_reason text default 'Revisao solicitada pela equipe'
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_alert_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select p.tenant_id into v_tenant_id
  from public.patients p
  where p.id = p_patient_id;

  if v_tenant_id is null then
    raise exception 'patient_not_found' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_tenant_id, 'patients.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.patient_alerts (
    tenant_id, patient_id, alert_type, severity, status, title, description
  )
  values (
    v_tenant_id,
    p_patient_id,
    'adesao',
    'medio',
    'active',
    'Revisao solicitada',
    left(coalesce(p_reason, 'Revisao solicitada pela equipe'), 500)
  )
  returning id into v_alert_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'patient.review_flag_created',
    'patient_alert',
    v_alert_id::text,
    jsonb_build_object('patientId', p_patient_id)
  );

  return jsonb_build_object('id', v_alert_id, 'status', 'active');
end;
$$;

grant execute on function public.upsert_patient_prescription(uuid, uuid, uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.duplicate_patient_prescription(uuid) to authenticated, service_role;
grant execute on function public.link_patient_prescription_document(uuid, uuid) to authenticated, service_role;
grant execute on function public.cancel_patient_prescription(uuid, text) to authenticated, service_role;
grant execute on function public.save_patient_nutrition_plan(uuid, uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.archive_patient_nutrition_plan(uuid) to authenticated, service_role;
grant execute on function public.update_patient_package_status(uuid, text, text, integer) to authenticated, service_role;
grant execute on function public.create_patient_financial_local_action(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.get_patient_document_evidence(uuid, uuid) to authenticated, service_role;
grant execute on function public.request_webhook_reprocess(text, uuid, text) to authenticated, service_role;
grant execute on function public.update_clinic_member_role(uuid, text) to authenticated, service_role;
grant execute on function public.create_patient_review_flag(uuid, text) to authenticated, service_role;
