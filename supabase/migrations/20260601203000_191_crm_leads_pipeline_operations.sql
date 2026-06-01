-- Phase 9.2: CRM operational pipeline, lead detail, tasks, notifications and idempotent conversion.

create or replace function public.get_crm_lead_detail(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_stage_label text;
begin
  select * into v_lead from public.crm_leads where id = p_lead_id;
  if v_lead.id is null or not security.has_permission(v_lead.tenant_id, 'crm.read', false) or not public.has_unit_access(v_lead.tenant_id, v_lead.unit_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select label into v_stage_label
  from public.crm_pipeline_stages
  where tenant_id = v_lead.tenant_id and id = v_lead.stage_id;

  return jsonb_build_object(
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'status', v_lead.status,
      'stageId', v_lead.stage_id,
      'stageLabel', v_stage_label,
      'unitId', v_lead.unit_id,
      'source', v_lead.source,
      'campaign', v_lead.campaign,
      'fullName', v_lead.full_name,
      'email', v_lead.email,
      'phone', v_lead.phone,
      'ownerUserId', v_lead.owner_user_id,
      'convertedPatientId', v_lead.converted_patient_id,
      'contactPreference', v_lead.contact_preference,
      'contactConsent', v_lead.contact_consent,
      'consentPurpose', v_lead.consent_purpose,
      'optOutAt', v_lead.opt_out_at,
      'retentionExpiresAt', v_lead.retention_expires_at,
      'nextFollowUpAt', v_lead.next_follow_up_at,
      'lostReason', v_lead.lost_reason,
      'metadata', v_lead.metadata,
      'createdAt', v_lead.created_at,
      'updatedAt', v_lead.updated_at
    ),
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'activityType', a.activity_type,
        'title', a.title,
        'description', a.description,
        'actorUserId', a.actor_user_id,
        'occurredAt', a.occurred_at,
        'metadata', a.metadata
      ) order by a.occurred_at desc)
      from public.crm_lead_activities a
      where a.tenant_id = v_lead.tenant_id and a.lead_id = v_lead.id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'assignedTo', t.assigned_to,
        'title', t.title,
        'dueAt', t.due_at,
        'status', case when t.status = 'open' and t.due_at < now() then 'overdue' else t.status end,
        'completedAt', t.completed_at,
        'createdAt', t.created_at
      ) order by t.due_at asc nulls last, t.created_at desc)
      from public.crm_lead_tasks t
      where t.tenant_id = v_lead.tenant_id and t.lead_id = v_lead.id
    ), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'channel', c.channel,
        'purpose', c.purpose,
        'status', c.status,
        'legalBasis', c.legal_basis,
        'capturedAt', c.captured_at,
        'expiresAt', c.expires_at
      ) order by c.captured_at desc)
      from public.crm_lead_consents c
      where c.tenant_id = v_lead.tenant_id and c.lead_id = v_lead.id
    ), '[]'::jsonb),
    'attachments', '[]'::jsonb
  );
end;
$$;

create or replace function public.create_crm_lead_task(p_lead_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_task public.crm_lead_tasks%rowtype;
  v_assigned_to uuid := coalesce(nullif(p_payload->>'assignedTo', '')::uuid, auth.uid());
  v_title text := nullif(trim(p_payload->>'title'), '');
begin
  select * into v_lead from public.crm_leads where id = p_lead_id;
  if v_lead.id is null or not security.has_permission(v_lead.tenant_id, 'crm.write', false) or not public.has_unit_access(v_lead.tenant_id, v_lead.unit_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_title is null then
    raise exception 'invalid_task_payload' using errcode = '22023';
  end if;

  insert into public.crm_lead_tasks (tenant_id, lead_id, assigned_to, title, due_at, metadata)
  values (v_lead.tenant_id, v_lead.id, v_assigned_to, left(v_title, 180), nullif(p_payload->>'dueAt', '')::timestamptz, coalesce(p_payload->'metadata', '{}'::jsonb))
  returning * into v_task;

  insert into public.crm_lead_activities (tenant_id, lead_id, activity_type, title, actor_user_id, metadata)
  values (v_lead.tenant_id, v_lead.id, 'task', 'Tarefa criada', auth.uid(), jsonb_build_object('taskId', v_task.id, 'dueAt', v_task.due_at));

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_lead.tenant_id, auth.uid(), 'crm_lead.task_created', 'crm_lead', v_lead.id::text, jsonb_build_object('taskId', v_task.id));

  insert into public.notifications (tenant_id, user_id, title, body, category, status, metadata)
  values (v_lead.tenant_id, v_assigned_to, 'Tarefa comercial atribuida', 'Ha uma tarefa de CRM pendente.', 'crm', 'unread', jsonb_build_object('leadId', v_lead.id, 'taskId', v_task.id, 'href', '/clinic/crm?leadId=' || v_lead.id::text));

  return jsonb_build_object('id', v_task.id, 'leadId', v_lead.id, 'dueAt', v_task.due_at, 'status', v_task.status);
end;
$$;

create or replace function public.convert_crm_lead_to_patient(p_lead_id uuid, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_patient_id uuid;
  v_existing_patient_id uuid;
  v_converted_stage_id uuid;
  v_create_appointment boolean := coalesce((p_payload->>'createAppointment')::boolean, false);
  v_appointment_id uuid;
  v_has_consent boolean;
begin
  select * into v_lead from public.crm_leads where id = p_lead_id for update;
  if v_lead.id is null or not security.has_permission(v_lead.tenant_id, 'crm.convert', false) or not public.has_unit_access(v_lead.tenant_id, v_lead.unit_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_lead.converted_patient_id is not null then
    return jsonb_build_object('leadId', v_lead.id, 'patientId', v_lead.converted_patient_id, 'appointmentId', null, 'idempotent', true, 'status', 'converted');
  end if;

  select (v_lead.contact_consent and v_lead.opt_out_at is null) or exists (
    select 1 from public.crm_lead_consents c
    where c.tenant_id = v_lead.tenant_id
      and c.lead_id = v_lead.id
      and c.status = 'granted'
      and (c.expires_at is null or c.expires_at > now())
  ) into v_has_consent;

  if not coalesce(v_has_consent, false) then
    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    values (v_lead.tenant_id, auth.uid(), 'crm_lead.conversion_failed', 'crm_lead', v_lead.id::text, jsonb_build_object('reason', 'lead_consent_required'));

    insert into public.notifications (tenant_id, user_id, title, body, category, status, metadata)
    values (v_lead.tenant_id, coalesce(v_lead.owner_user_id, auth.uid()), 'Falha na conversao de lead', 'Consentimento/base legal pendente antes da conversao.', 'crm', 'unread', jsonb_build_object('leadId', v_lead.id, 'href', '/clinic/crm?leadId=' || v_lead.id::text));

    return jsonb_build_object('leadId', v_lead.id, 'patientId', null, 'appointmentId', null, 'idempotent', false, 'status', 'failed', 'reason', 'lead_consent_required');
  end if;

  select ppi.patient_id into v_existing_patient_id
  from public.patient_pii ppi
  where ppi.tenant_id = v_lead.tenant_id
    and (
      (public.normalize_contact_email(v_lead.email) is not null and public.normalize_contact_email(ppi.email) = public.normalize_contact_email(v_lead.email))
      or (public.normalize_contact_phone(v_lead.phone) is not null and public.normalize_contact_phone(ppi.phone) = public.normalize_contact_phone(v_lead.phone))
    )
  order by ppi.created_at asc
  limit 1;

  if v_existing_patient_id is null then
    insert into public.patients (tenant_id, status, preferred_name, tags, metadata)
    values (v_lead.tenant_id, 'active', split_part(v_lead.full_name, ' ', 1), array['crm'], jsonb_build_object('sourceLeadId', v_lead.id, 'source', v_lead.source, 'campaign', v_lead.campaign, 'unitId', v_lead.unit_id))
    returning id into v_patient_id;

    insert into public.patient_pii (tenant_id, patient_id, full_name, email, phone)
    values (v_lead.tenant_id, v_patient_id, v_lead.full_name, v_lead.email, v_lead.phone);
  else
    v_patient_id := v_existing_patient_id;
  end if;

  perform public.ensure_default_crm_pipeline(v_lead.tenant_id);
  select id into v_converted_stage_id from public.crm_pipeline_stages where tenant_id = v_lead.tenant_id and code = 'convertido';

  update public.crm_leads
  set status = 'converted',
      stage_id = coalesce(v_converted_stage_id, stage_id),
      converted_patient_id = v_patient_id,
      updated_at = now(),
      metadata = metadata || jsonb_build_object('convertedAt', now(), 'conversionMode', case when v_existing_patient_id is null then 'created_patient' else 'linked_existing_patient' end)
  where id = v_lead.id;

  insert into public.crm_lead_activities (tenant_id, lead_id, activity_type, title, actor_user_id, metadata)
  values (v_lead.tenant_id, v_lead.id, 'conversion', 'Lead convertido em paciente', auth.uid(), jsonb_build_object('patientId', v_patient_id, 'deduplicated', v_existing_patient_id is not null));

  insert into public.patient_timeline_events (tenant_id, patient_id, event_type, category, status, title, description, actor_name, details_href, payload)
  values (v_lead.tenant_id, v_patient_id, 'lead_convertido', 'commercial', 'recorded', 'Lead convertido em paciente', 'Conversao auditada do CRM para paciente.', 'CRM', '/clinic/crm?leadId=' || v_lead.id::text, jsonb_build_object('leadId', v_lead.id, 'source', v_lead.source, 'campaign', v_lead.campaign))
  on conflict (tenant_id, patient_id, event_type, event_at) do nothing;

  if v_create_appointment then
    insert into public.appointments (tenant_id, patient_id, type, status, scheduled_at, duration_minutes, location, notes)
    values (v_lead.tenant_id, v_patient_id, coalesce(nullif(p_payload->>'appointmentType', ''), 'avaliacao_inicial'), 'agendado', coalesce(nullif(p_payload->>'scheduledAt', '')::timestamptz, now() + interval '1 day'), 50, nullif(p_payload->>'location', ''), 'Consulta inicial criada a partir de conversao CRM.')
    returning id into v_appointment_id;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_lead.tenant_id, auth.uid(), 'crm_lead.converted', 'crm_lead', v_lead.id::text, jsonb_build_object('patientId', v_patient_id, 'appointmentId', v_appointment_id, 'deduplicated', v_existing_patient_id is not null));

  insert into public.notifications (tenant_id, user_id, patient_id, title, body, category, status, metadata)
  values (v_lead.tenant_id, coalesce(v_lead.owner_user_id, auth.uid()), v_patient_id, 'Lead convertido', 'A conversao CRM foi concluida.', 'crm', 'unread', jsonb_build_object('leadId', v_lead.id, 'patientId', v_patient_id, 'href', '/clinic/patients/' || v_patient_id::text));

  return jsonb_build_object('leadId', v_lead.id, 'patientId', v_patient_id, 'appointmentId', v_appointment_id, 'idempotent', false, 'status', 'converted');
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
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;

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

create or replace function public.notify_crm_lead_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.owner_user_id is not null and (tg_op = 'INSERT' or old.owner_user_id is distinct from new.owner_user_id) then
    insert into public.notifications (tenant_id, user_id, title, body, category, status, metadata)
    values (new.tenant_id, new.owner_user_id, 'Lead atribuido', 'Voce recebeu um lead no CRM.', 'crm', 'unread', jsonb_build_object('leadId', new.id, 'href', '/clinic/crm?leadId=' || new.id::text));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_lead_assignment_notification on public.crm_leads;
create trigger trg_crm_lead_assignment_notification
after insert or update of owner_user_id on public.crm_leads
for each row execute function public.notify_crm_lead_assignment();

revoke all on function public.get_crm_lead_detail(uuid) from public;
revoke all on function public.create_crm_lead_task(uuid, jsonb) from public;
revoke all on function public.convert_crm_lead_to_patient(uuid, jsonb) from public;
revoke all on function public.emit_crm_operational_notifications(interval) from public;

grant execute on function public.get_crm_lead_detail(uuid) to authenticated, service_role;
grant execute on function public.create_crm_lead_task(uuid, jsonb) to authenticated, service_role;
grant execute on function public.convert_crm_lead_to_patient(uuid, jsonb) to authenticated, service_role;
grant execute on function public.emit_crm_operational_notifications(interval) to authenticated, service_role;

comment on function public.convert_crm_lead_to_patient(uuid, jsonb) is 'Idempotently converts or links a CRM lead to a patient with consent, deduplication, timeline, audit log and optional initial appointment.';
