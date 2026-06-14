-- P1 unified clinical actions: task attribution/status and origin metadata.

alter table public.patient_tasks
  add column if not exists category text not null default 'clinico'
    check (category in ('clinico', 'financeiro', 'documento', 'comunicacao')),
  add column if not exists priority text not null default 'media'
    check (priority in ('alta', 'media', 'baixa')),
  add column if not exists source_module text,
  add column if not exists encounter_id uuid,
  add column if not exists appointment_id uuid,
  add column if not exists completed_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_patient_tasks_patient_open_priority
  on public.patient_tasks(tenant_id, patient_id, status, priority, due_at);

create or replace function public.upsert_patient_clinical_task(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', true);
  v_user_id uuid := auth.uid();
  v_patient_id uuid := (p_payload ->> 'patientId')::uuid;
  v_task_id uuid := case when security.is_valid_uuid_text(coalesce(p_payload ->> 'taskId', '')) then (p_payload ->> 'taskId')::uuid else null end;
  v_assigned_to uuid := case when security.is_valid_uuid_text(coalesce(p_payload ->> 'assignedTo', '')) then (p_payload ->> 'assignedTo')::uuid else null end;
  v_encounter_id uuid := case when security.is_valid_uuid_text(coalesce(p_payload ->> 'encounterId', '')) then (p_payload ->> 'encounterId')::uuid else null end;
  v_appointment_id uuid := case when security.is_valid_uuid_text(coalesce(p_payload ->> 'appointmentId', '')) then (p_payload ->> 'appointmentId')::uuid else null end;
  v_title text := nullif(btrim(p_payload ->> 'title'), '');
  v_details text := nullif(btrim(coalesce(p_payload ->> 'details', '')), '');
  v_category text := coalesce(nullif(lower(btrim(p_payload ->> 'category')), ''), 'clinico');
  v_priority text := coalesce(nullif(lower(btrim(p_payload ->> 'priority')), ''), 'media');
  v_source text := nullif(lower(btrim(coalesce(p_payload ->> 'sourceModule', ''))), '');
  v_due_at timestamptz := case when nullif(p_payload ->> 'dueAt', '') is null then null else (p_payload ->> 'dueAt')::timestamptz end;
begin
  if v_title is null then raise exception 'task_title_required' using errcode = '22023'; end if;
  if v_category not in ('clinico', 'financeiro', 'documento', 'comunicacao') then raise exception 'invalid_task_category' using errcode = '22023'; end if;
  if v_priority not in ('alta', 'media', 'baixa') then raise exception 'invalid_task_priority' using errcode = '22023'; end if;
  if not exists (select 1 from public.patients where tenant_id = v_tenant_id and id = v_patient_id) then raise exception 'patient_not_found_or_forbidden' using errcode = 'P0002'; end if;
  if v_assigned_to is not null and not exists (select 1 from public.tenant_memberships where tenant_id = v_tenant_id and user_id = v_assigned_to and status = 'active') then raise exception 'assignee_not_found_or_forbidden' using errcode = '42501'; end if;

  if v_task_id is null then
    insert into public.patient_tasks (tenant_id, patient_id, status, title, details, due_at, assigned_to, category, priority, source_module, encounter_id, appointment_id, metadata)
    values (v_tenant_id, v_patient_id, 'open', v_title, v_details, v_due_at, v_assigned_to, v_category, v_priority, v_source, v_encounter_id, v_appointment_id, p_payload - 'patientId' - 'title' - 'details')
    returning id into v_task_id;
  else
    update public.patient_tasks
       set title = v_title, details = v_details, due_at = v_due_at, assigned_to = v_assigned_to,
           category = v_category, priority = v_priority, source_module = v_source,
           encounter_id = coalesce(v_encounter_id, encounter_id), appointment_id = coalesce(v_appointment_id, appointment_id),
           metadata = metadata || (p_payload - 'patientId' - 'title' - 'details')
     where tenant_id = v_tenant_id and patient_id = v_patient_id and id = v_task_id;
    if not found then raise exception 'task_not_found_or_forbidden' using errcode = 'P0002'; end if;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, v_user_id, 'patient_task_upserted', 'patient_task', v_task_id::text, jsonb_build_object('patientId', v_patient_id, 'sourceModule', v_source, 'encounterId', v_encounter_id, 'appointmentId', v_appointment_id));

  insert into public.patient_timeline_events (tenant_id, patient_id, event_type, category, status, title, description, actor_name, status_label, details_href, payload)
  values (v_tenant_id, v_patient_id, 'tarefa_atribuida', 'clinical', 'recorded', 'Tarefa atribuida', v_title, 'Equipe clinica', 'Aberta', '/clinic/patients/' || v_patient_id, jsonb_build_object('entityId', v_task_id, 'sourceModule', v_source, 'priority', v_priority, 'category', v_category));

  return jsonb_build_object('id', v_task_id, 'status', 'open');
end;
$$;

create or replace function public.set_patient_clinical_task_status(p_patient_id uuid, p_task_id uuid, p_status text, p_source_module text default 'patient360', p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', true);
  v_user_id uuid := auth.uid();
  v_task public.patient_tasks%rowtype;
  v_event_type text;
begin
  if p_status not in ('open', 'in_progress', 'done', 'cancelled') then raise exception 'invalid_task_status' using errcode = '22023'; end if;
  update public.patient_tasks
     set status = p_status,
         completed_at = case when p_status = 'done' then now() when status = 'done' and p_status <> 'done' then null else completed_at end,
         metadata = metadata || jsonb_build_object('lastStatusSourceModule', p_source_module, 'lastStatusReason', p_reason)
   where tenant_id = v_tenant_id and patient_id = p_patient_id and id = p_task_id
   returning * into v_task;
  if v_task.id is null then raise exception 'task_not_found_or_forbidden' using errcode = 'P0002'; end if;

  v_event_type := case when p_status = 'done' then 'tarefa_concluida' when p_status = 'open' then 'tarefa_reaberta' else 'tarefa_atualizada' end;
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, v_user_id, v_event_type, 'patient_task', p_task_id::text, jsonb_build_object('patientId', p_patient_id, 'status', p_status, 'sourceModule', p_source_module, 'reason', p_reason));
  insert into public.patient_timeline_events (tenant_id, patient_id, event_type, category, status, title, description, actor_name, status_label, details_href, payload)
  values (v_tenant_id, p_patient_id, v_event_type, 'clinical', 'recorded', case when p_status = 'done' then 'Tarefa concluida' when p_status = 'open' then 'Tarefa reaberta' else 'Tarefa atualizada' end, v_task.title, 'Equipe clinica', p_status, '/clinic/patients/' || p_patient_id, jsonb_build_object('entityId', p_task_id, 'sourceModule', p_source_module));
  return jsonb_build_object('id', p_task_id, 'status', p_status);
end;
$$;

grant execute on function public.upsert_patient_clinical_task(jsonb) to authenticated, service_role;
grant execute on function public.set_patient_clinical_task_status(uuid, uuid, text, text, text) to authenticated, service_role;

create or replace function public.create_patient_lab_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', true);
  v_user_id uuid := auth.uid();
  v_patient_id uuid := (p_payload ->> 'patientId')::uuid;
  v_encounter_id uuid := case when security.is_valid_uuid_text(coalesce(p_payload ->> 'encounterId', '')) then (p_payload ->> 'encounterId')::uuid else null end;
  v_appointment_id uuid := case when security.is_valid_uuid_text(coalesce(p_payload ->> 'appointmentId', '')) then (p_payload ->> 'appointmentId')::uuid else null end;
  v_panel_name text := nullif(trim(p_payload ->> 'panelName'), '');
  v_source text := coalesce(nullif(lower(btrim(p_payload ->> 'sourceModule')), ''), case when v_encounter_id is null then 'patient360' else 'encounter' end);
  v_order_id uuid;
begin
  if v_panel_name is null then raise exception 'lab_order_panel_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.patients where tenant_id = v_tenant_id and id = v_patient_id) then raise exception 'patient_not_found_or_forbidden' using errcode = 'P0002'; end if;

  insert into public.lab_orders (tenant_id, patient_id, encounter_id, status, ordered_by, order_payload)
  values (v_tenant_id, v_patient_id, v_encounter_id, 'requested', v_user_id,
    jsonb_build_object(
      'panel_name', v_panel_name,
      'tests', coalesce(p_payload -> 'tests', '[]'::jsonb),
      'urgency', coalesce(nullif(p_payload ->> 'urgency', ''), 'routine'),
      'note', nullif(trim(p_payload ->> 'note'), ''),
      'source_module', v_source,
      'appointment_id', v_appointment_id,
      'metadata', coalesce(p_payload -> 'metadata', '{}'::jsonb)
    ))
  returning id into v_order_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, v_user_id, 'lab_order_created', 'lab_order', v_order_id::text, jsonb_build_object('patientId', v_patient_id, 'encounterId', v_encounter_id, 'appointmentId', v_appointment_id, 'sourceModule', v_source));

  insert into public.patient_timeline_events (tenant_id, patient_id, event_type, category, status, title, description, actor_name, status_label, details_href, payload)
  values (v_tenant_id, v_patient_id, 'exame_solicitado', 'clinical', 'recorded', 'Exames solicitados', 'Painel ' || v_panel_name || ' solicitado.', 'Equipe clinica', 'Registrado', '/clinic/patients/' || v_patient_id || case when v_encounter_id is null then '' else '/encounter' end, jsonb_build_object('entityId', v_order_id, 'encounterId', v_encounter_id, 'appointmentId', v_appointment_id, 'sourceModule', v_source, 'tests', coalesce(p_payload -> 'tests', '[]'::jsonb)));

  return jsonb_build_object('id', v_order_id);
end;
$$;
