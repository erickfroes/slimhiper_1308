-- Final SOAP records are immutable. Corrections are preserved as separately
-- authored addenda, never by overwriting the finalized clinical statement.

alter table public.soap_notes
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists finalized_at timestamptz;

update public.soap_notes
set finalized_at = coalesce(finalized_at, updated_at, created_at)
where status = 'final' and finalized_at is null;

create or replace function security.stamp_final_soap_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'final' and (tg_op = 'INSERT' or old.status <> 'final') then
    new.version := greatest(coalesce(new.version, 1), 1);
    new.finalized_at := coalesce(new.finalized_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_final_soap_metadata on public.soap_notes;
create trigger trg_stamp_final_soap_metadata
before insert or update on public.soap_notes
for each row execute function security.stamp_final_soap_metadata();

create table public.soap_note_amendments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  soap_note_id uuid not null,
  amendment_text text not null check (length(btrim(amendment_text)) between 12 and 4000),
  reason text not null check (length(btrim(reason)) between 8 and 500),
  authored_by uuid not null references public.profiles(id) on delete restrict,
  authored_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id, id),
  constraint soap_note_amendments_same_tenant
    foreign key (tenant_id, soap_note_id)
    references public.soap_notes(tenant_id, id)
    on delete cascade,
  constraint soap_note_amendments_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create index idx_soap_note_amendments_note_authored_at
  on public.soap_note_amendments(tenant_id, soap_note_id, authored_at asc);

alter table public.soap_note_amendments enable row level security;

create policy soap_note_amendments_read
on public.soap_note_amendments for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'soap.read'));

revoke all on table public.soap_note_amendments from anon, authenticated;
grant select on table public.soap_note_amendments to authenticated;
grant select, insert, update, delete on table public.soap_note_amendments to service_role;
-- The QA harness uses this trusted role to prove the trigger protects final
-- records even when RLS is bypassed. Browser roles receive no direct mutation.
grant select, update on table public.soap_notes to service_role;
grant select, insert, update, delete on table public.appointments to service_role;
grant select on table public.measurements to service_role;
grant select on table public.patient_timeline_events to service_role;
grant select on table public.audit_logs to service_role;

create or replace function security.prevent_final_soap_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- A cascade from a parent tenant/patient cleanup is not a clinical edit.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if old.status = 'final' then
    raise exception 'final_soap_is_immutable' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_prevent_final_soap_mutation on public.soap_notes;
create trigger trg_prevent_final_soap_mutation
before update or delete on public.soap_notes
for each row execute function security.prevent_final_soap_mutation();

create or replace function public.append_final_soap_amendment(
  p_soap_note_id uuid,
  p_amendment_text text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_soap public.soap_notes%rowtype;
  v_amendment public.soap_note_amendments%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_soap
  from public.soap_notes
  where id = p_soap_note_id
  for update;

  if not found or not public.has_clinical_permission(v_soap.tenant_id, 'soap.write') then
    raise exception 'soap_not_found_or_forbidden' using errcode = '42501';
  end if;
  if v_soap.status <> 'final' then
    raise exception 'soap_must_be_final_before_amendment' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_amendment_text, ''))) < 12 or length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception 'amendment_text_and_reason_required' using errcode = '22023';
  end if;

  insert into public.soap_note_amendments (
    tenant_id, patient_id, soap_note_id, amendment_text, reason, authored_by, metadata
  ) values (
    v_soap.tenant_id, v_soap.patient_id, v_soap.id, btrim(p_amendment_text), btrim(p_reason), v_user_id,
    jsonb_build_object('source', 'append_final_soap_amendment')
  ) returning * into v_amendment;

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, status, title, description, event_at, payload
  ) values (
    v_soap.tenant_id, v_soap.patient_id, 'soap_adendo_registrado', 'clinical', 'recorded',
    'Adendo ao SOAP registrado', 'Um adendo preservado foi acrescentado ao atendimento finalizado.',
    v_amendment.authored_at, jsonb_build_object('soapNoteId', v_soap.id, 'amendmentId', v_amendment.id)
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_soap.tenant_id, v_user_id, 'soap_amendment.appended', 'soap_note_amendment', v_amendment.id::text,
    jsonb_build_object('patientId', v_soap.patient_id, 'soapNoteId', v_soap.id)
  );

  return jsonb_build_object('id', v_amendment.id, 'soapNoteId', v_soap.id, 'authoredAt', v_amendment.authored_at);
end;
$$;

revoke all on function public.append_final_soap_amendment(uuid, text, text) from public;
grant execute on function public.append_final_soap_amendment(uuid, text, text) to authenticated, service_role;

create or replace function public.export_final_soap_record(p_soap_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_soap public.soap_notes%rowtype;
  v_amendments jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_soap
  from public.soap_notes
  where id = p_soap_note_id;

  if not found or not public.has_clinical_permission(v_soap.tenant_id, 'soap.read') then
    raise exception 'soap_export_not_found_or_forbidden' using errcode = '42501';
  end if;
  if v_soap.status <> 'final' then
    raise exception 'soap_must_be_final_before_export' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'text', a.amendment_text,
    'reason', a.reason,
    'authoredBy', a.authored_by,
    'authoredAt', a.authored_at
  ) order by a.authored_at asc), '[]'::jsonb)
  into v_amendments
  from public.soap_note_amendments a
  where a.tenant_id = v_soap.tenant_id
    and a.soap_note_id = v_soap.id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_soap.tenant_id, v_user_id, 'soap.exported', 'soap_note', v_soap.id::text,
    jsonb_build_object('patientId', v_soap.patient_id, 'format', 'json')
  );

  return jsonb_build_object(
    'schemaVersion', '1.0',
    'soap', jsonb_build_object(
      'id', v_soap.id,
      'patientId', v_soap.patient_id,
      'encounterId', v_soap.encounter_id,
      'status', v_soap.status,
      'subjective', v_soap.subjective,
      'objective', v_soap.objective,
      'assessment', v_soap.assessment,
      'plan', v_soap.plan,
      'version', v_soap.version,
      'authoredBy', v_soap.authored_by,
      'authoredAt', v_soap.created_at,
      'finalizedAt', v_soap.finalized_at
    ),
    'amendments', v_amendments
  );
end;
$$;

revoke all on function public.export_final_soap_record(uuid) from public;
grant execute on function public.export_final_soap_record(uuid) to authenticated, service_role;

-- Immutable issued prescriptions must not make a legitimate tenant/patient
-- cascade impossible. The distinction is database-trigger depth, not role.
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
    if old.status in ('issued', 'cancelled', 'expired')
       and v_mode <> 'system_migration'
       and pg_trigger_depth() <= 1 then
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

create or replace function security.prevent_issued_prescription_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_mode text := coalesce(current_setting('slimhiper.prescription_mutation', true), '');
  v_prescription_id uuid := case when tg_op = 'DELETE' then old.prescription_id else new.prescription_id end;
  v_tenant_id uuid := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  select status into v_status from public.prescriptions
  where tenant_id = v_tenant_id and id = v_prescription_id;
  if v_status in ('issued', 'cancelled', 'expired') and v_mode <> 'system_migration' then
    raise exception 'issued_prescription_items_are_immutable' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function security.prevent_prescription_version_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'prescription_versions_are_immutable' using errcode = '42501';
end;
$$;
