-- Clinic D4Sign monitor actions: safe local reconciliation controls only.
-- These routines do not call D4Sign or replay raw provider payloads.

alter table public.d4sign_events
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references public.profiles(id) on delete set null,
  add column if not exists acknowledgement_note text;

create index if not exists idx_d4sign_events_tenant_status_created_at
  on public.d4sign_events(tenant_id, status, created_at desc);

create or replace function public.update_document_signature_status(
  p_generated_document_id uuid,
  p_patient_id uuid,
  p_status text,
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
  v_request public.signature_requests%rowtype;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_status not in ('pending', 'sent', 'viewed', 'signed', 'rejected', 'canceled', 'cancelled', 'expired', 'failed', 'error') then
    raise exception 'invalid_signature_status' using errcode = '22023';
  end if;
  if length(v_reason) < 8 then
    raise exception 'reason_required' using errcode = '22023';
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

  select * into v_request
  from public.signature_requests
  where tenant_id = v_document.tenant_id
    and generated_document_id = v_document.id
  order by created_at desc
  limit 1;

  if v_request.id is null then
    raise exception 'signature_request_not_found' using errcode = '22023';
  end if;

  update public.signature_requests
  set status = v_status,
      sent_at = case when v_status = 'sent' then coalesce(sent_at, now()) else sent_at end,
      viewed_at = case when v_status = 'viewed' then coalesce(viewed_at, now()) else viewed_at end,
      signed_at = case when v_status = 'signed' then coalesce(signed_at, now()) else signed_at end,
      canceled_at = case when v_status in ('canceled', 'cancelled', 'rejected') then coalesce(canceled_at, now()) else canceled_at end,
      updated_at = now()
  where tenant_id = v_request.tenant_id
    and id = v_request.id
  returning * into v_request;

  if v_status = 'signed' then
    update public.generated_documents
    set status = 'signed', updated_at = now()
    where tenant_id = v_document.tenant_id and id = v_document.id
    returning * into v_document;
  elsif v_status in ('failed', 'error', 'expired', 'canceled', 'cancelled', 'rejected') then
    update public.generated_documents
    set status = 'failed', updated_at = now()
    where tenant_id = v_document.tenant_id and id = v_document.id
    returning * into v_document;
  end if;

  insert into public.document_audit_events (tenant_id, patient_id, generated_document_id, template_id, action, actor_id, source, summary)
  values (v_document.tenant_id, v_document.patient_id, v_document.id, v_document.template_id,
    'document.signature_status_changed', v_user_id, 'app',
    jsonb_build_object('signatureRequestId', v_request.id, 'status', v_status, 'manualReconciliation', true, 'reason', v_reason));

  return jsonb_build_object('id', v_request.id, 'status', v_request.status, 'documentStatus', v_document.status);
end;
$$;

create or replace function public.acknowledge_d4sign_event_failure(
  p_event_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.d4sign_events%rowtype;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_event from public.d4sign_events where id = p_event_id;
  if v_event.id is null then
    raise exception 'event_not_found' using errcode = '22023';
  end if;
  if not security.has_permission(v_event.tenant_id, 'documents.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_event.status <> 'failed' then
    raise exception 'event_not_failed' using errcode = '22023';
  end if;

  update public.d4sign_events
  set acknowledged_at = now(), acknowledged_by = v_user_id, acknowledgement_note = v_note, updated_at = now()
  where tenant_id = v_event.tenant_id and id = v_event.id
  returning * into v_event;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_event.tenant_id, v_user_id, 'd4sign_event_failure_acknowledged', 'd4sign_event', v_event.id::text,
    jsonb_build_object('eventType', v_event.event_type, 'hasNote', v_note is not null));

  return jsonb_build_object('id', v_event.id, 'acknowledgedAt', v_event.acknowledged_at);
end;
$$;

create or replace function public.request_clinic_d4sign_event_reprocess(
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
  v_event public.d4sign_events%rowtype;
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_job_id uuid;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if length(v_reason) < 12 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_event from public.d4sign_events where id = p_event_id;
  if v_event.id is null then
    raise exception 'event_not_found' using errcode = '22023';
  end if;
  if not security.has_permission(v_event.tenant_id, 'documents.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_status := case when v_event.status in ('failed', 'ignored', 'received') then 'queued' else 'not_reprocessable' end;

  insert into public.webhook_reprocess_jobs (tenant_id, provider, event_id, status, reason, requested_by)
  values (v_event.tenant_id, 'd4sign', v_event.id, v_status, v_reason, v_user_id)
  returning id into v_job_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_event.tenant_id, v_user_id, 'clinic_d4sign_reprocess_requested', 'd4sign_event', v_event.id::text,
    jsonb_build_object('jobId', v_job_id, 'status', v_status, 'rawPayloadReplay', false, 'externalProviderCalled', false));

  return jsonb_build_object('id', v_job_id, 'status', v_status);
end;
$$;

revoke all on function public.update_document_signature_status(uuid, uuid, text, text) from public;
revoke all on function public.acknowledge_d4sign_event_failure(uuid, text) from public;
revoke all on function public.request_clinic_d4sign_event_reprocess(uuid, text) from public;
grant execute on function public.update_document_signature_status(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.acknowledge_d4sign_event_failure(uuid, text) to authenticated, service_role;
grant execute on function public.request_clinic_d4sign_event_reprocess(uuid, text) to authenticated, service_role;

comment on function public.request_clinic_d4sign_event_reprocess(uuid, text) is
  'Queues an audited local D4Sign webhook reprocess job for clinic document operators; it never calls D4Sign or replays raw payloads.';
