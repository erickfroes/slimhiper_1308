-- Categorization and prioritization of clinical inbox conversations.
alter table public.patient_chat_threads
  add column if not exists category text not null default 'geral',
  add column if not exists priority text not null default 'normal';

alter table public.patient_chat_threads
  drop constraint if exists patient_chat_threads_priority_check,
  add constraint patient_chat_threads_priority_check
  check (priority in ('baixa', 'normal', 'alta', 'urgente'));

create index if not exists idx_patient_chat_threads_triage
  on public.patient_chat_threads(tenant_id, priority, category, assigned_to, last_message_at desc)
  where archived_at is null;

create or replace function public.set_chat_thread_triage(
  p_thread_id uuid,
  p_category text default null,
  p_priority text default null,
  p_assigned_to uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_thread public.patient_chat_threads%rowtype;
  v_category text := lower(left(trim(coalesce(p_category, 'geral')), 60));
  v_priority text := lower(coalesce(nullif(trim(p_priority), ''), 'normal'));
begin
  select * into v_thread from public.patient_chat_threads where id = p_thread_id for update;
  if not found or not security.has_permission(v_thread.tenant_id, 'chat.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_category = '' then v_category := 'geral'; end if;
  if v_priority not in ('baixa', 'normal', 'alta', 'urgente') then
    raise exception 'invalid_chat_priority' using errcode = '22023';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_thread.tenant_id and user_id = p_assigned_to and status = 'active'
  ) then raise exception 'assignee_not_found_or_forbidden' using errcode = '42501'; end if;

  update public.patient_chat_threads
  set category = v_category, priority = v_priority,
      assigned_to = coalesce(p_assigned_to, assigned_to), updated_at = now()
  where tenant_id = v_thread.tenant_id and id = p_thread_id;

  insert into public.audit_logs(tenant_id,user_id,action,entity_type,entity_id,metadata)
  values(v_thread.tenant_id,auth.uid(),'chat_thread.triaged','patient_chat_thread',p_thread_id::text,
    jsonb_build_object('category',v_category,'priority',v_priority,'assignedTo',p_assigned_to));
  return jsonb_build_object('id',p_thread_id,'category',v_category,'priority',v_priority);
end;
$$;

revoke all on function public.set_chat_thread_triage(uuid,text,text,uuid) from public;
grant execute on function public.set_chat_thread_triage(uuid,text,text,uuid) to authenticated, service_role;

-- Keep the established inbox contract while enriching each conversation with triage.
alter function public.list_clinic_inbox(text, boolean, uuid, uuid, text, integer)
  rename to list_clinic_inbox_base;

create function public.list_clinic_inbox(
  p_tab text default 'conversas', p_unread_only boolean default false,
  p_patient_id uuid default null, p_assigned_to uuid default null,
  p_category text default null, p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_payload jsonb;
  v_conversations jsonb;
begin
  v_payload := public.list_clinic_inbox_base(
    p_tab, p_unread_only, p_patient_id, p_assigned_to, null, p_limit
  );

  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb) into v_conversations
  from jsonb_array_elements(coalesce(v_payload -> 'conversations', '[]'::jsonb)) with ordinality c(value, ord)
  join public.patient_chat_threads pct on pct.id = (c.value ->> 'threadId')::uuid
  cross join lateral (
    select c.value || jsonb_build_object('category', pct.category, 'priority', pct.priority) as item
  ) enriched
  where p_category is null or pct.category = p_category;

  return jsonb_set(v_payload, '{conversations}', v_conversations, true);
end;
$$;

revoke all on function public.list_clinic_inbox(text,boolean,uuid,uuid,text,integer) from public;
grant execute on function public.list_clinic_inbox(text,boolean,uuid,uuid,text,integer) to authenticated, service_role;
