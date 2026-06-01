-- Phase 8.2: chat inbox, header notification aggregate, and audited communication mutators.

create index if not exists idx_patient_chat_threads_tenant_unread
  on public.patient_chat_threads(tenant_id, unread_count, last_message_at desc)
  where unread_count > 0;

create index if not exists idx_patient_chat_threads_assigned_status
  on public.patient_chat_threads(tenant_id, assigned_to, status, last_message_at desc);

create index if not exists idx_notifications_tenant_status_created
  on public.notifications(tenant_id, status, created_at desc);

create or replace function public.get_clinic_communications_summary(p_limit integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 10);
  v_user_id uuid := auth.uid();
  v_unread_messages integer := 0;
  v_unread_notifications integer := 0;
begin
  select p.active_tenant_id into v_tenant_id
  from public.profiles p
  where p.id = v_user_id
    and p.is_active = true;

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = v_user_id
      and tm.status = 'active'
      and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'chat.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(sum(greatest(pct.unread_count, 0)), 0)::integer
    into v_unread_messages
  from public.patient_chat_threads pct
  where pct.tenant_id = v_tenant_id
    and pct.status <> 'archived';

  if security.has_permission(v_tenant_id, 'notifications.read', false) then
    select count(*)::integer into v_unread_notifications
    from public.notifications n
    where n.tenant_id = v_tenant_id
      and n.status = 'unread'
      and (n.user_id is null or n.user_id = v_user_id);
  end if;

  return jsonb_build_object(
    'unreadMessages', v_unread_messages,
    'unreadNotifications', v_unread_notifications,
    'messages', coalesce((
      select jsonb_agg(item order by sort_at desc)
      from (
        select
          pct.last_message_at as sort_at,
          jsonb_build_object(
            'id', pct.id,
            'threadId', pct.id,
            'patientId', pct.patient_id,
            'patientName', coalesce(nullif(ppi.full_name, ''), nullif(p.preferred_name, ''), 'Paciente'),
            'title', coalesce(nullif(ppi.full_name, ''), nullif(p.preferred_name, ''), 'Paciente'),
            'body', coalesce(nullif(last_msg.body, ''), 'Conversa sem mensagens recentes.'),
            'category', 'chat',
            'severity', case when pct.unread_count >= 3 then 'high' when pct.unread_count > 0 then 'medium' else 'low' end,
            'unreadCount', greatest(pct.unread_count, 0),
            'assignedTo', pct.assigned_to,
            'status', pct.status,
            'createdAt', coalesce(pct.last_message_at, pct.updated_at, pct.created_at),
            'href', '/clinic/inbox?tab=conversas&thread=' || pct.id,
            'patientHref', '/clinic/patients/' || pct.patient_id || '?tab=chat'
          ) as item
        from public.patient_chat_threads pct
        join public.patients p on p.tenant_id = pct.tenant_id and p.id = pct.patient_id
        left join public.patient_pii ppi on ppi.tenant_id = pct.tenant_id and ppi.patient_id = pct.patient_id
        left join lateral (
          select pcm.body
          from public.patient_chat_messages pcm
          where pcm.tenant_id = pct.tenant_id
            and pcm.thread_id = pct.id
          order by pcm.created_at desc
          limit 1
        ) last_msg on true
        where pct.tenant_id = v_tenant_id
          and pct.status <> 'archived'
        order by pct.unread_count desc, pct.last_message_at desc nulls last, pct.updated_at desc
        limit v_limit
      ) ranked
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(item order by sort_at desc)
      from (
        select
          n.created_at as sort_at,
          jsonb_build_object(
            'id', n.id,
            'notificationId', n.id,
            'patientId', n.patient_id,
            'patientName', case when n.patient_id is null then null else coalesce(nullif(ppi.full_name, ''), nullif(p.preferred_name, ''), 'Paciente') end,
            'title', n.title,
            'body', coalesce(n.body, ''),
            'category', coalesce(n.category, 'operacional'),
            'severity', coalesce(nullif(n.metadata->>'severity', ''), 'medium'),
            'status', n.status,
            'createdAt', n.created_at,
            'href', coalesce(nullif(n.metadata->>'href', ''), '/clinic/inbox?tab=notificacoes&notification=' || n.id),
            'patientHref', case when n.patient_id is null then null else '/clinic/patients/' || n.patient_id end
          ) as item
        from public.notifications n
        left join public.patients p on p.tenant_id = n.tenant_id and p.id = n.patient_id
        left join public.patient_pii ppi on ppi.tenant_id = n.tenant_id and ppi.patient_id = n.patient_id
        where n.tenant_id = v_tenant_id
          and n.status <> 'archived'
          and (n.user_id is null or n.user_id = v_user_id)
        order by case n.status when 'unread' then 0 else 1 end, n.created_at desc
        limit v_limit
      ) ranked
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_clinic_inbox(p_tab text default 'conversas', p_unread_only boolean default false, p_patient_id uuid default null, p_assigned_to uuid default null, p_category text default null, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
  v_tab text := coalesce(nullif(p_tab, ''), 'conversas');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  select p.active_tenant_id into v_tenant_id
  from public.profiles p
  where p.id = v_user_id
    and p.is_active = true;

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = v_user_id
      and tm.status = 'active'
      and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'chat.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_tab in ('notificacoes', 'notifications') and not security.has_permission(v_tenant_id, 'notifications.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'conversations', case when v_tab in ('conversas', 'assigned', 'atribuidas', 'all') then coalesce((
      select jsonb_agg(item order by sort_at desc)
      from (
        select
          coalesce(pct.last_message_at, pct.updated_at, pct.created_at) as sort_at,
          jsonb_build_object(
            'id', pct.id,
            'threadId', pct.id,
            'patientId', pct.patient_id,
            'patientName', coalesce(nullif(ppi.full_name, ''), nullif(p.preferred_name, ''), 'Paciente'),
            'lastMessagePreview', coalesce(nullif(last_msg.body, ''), 'Conversa sem mensagens recentes.'),
            'lastMessageFrom', coalesce(nullif(last_msg.sender_label, ''), case when last_msg.sender_type = 'patient' then 'Paciente' else 'Equipe' end),
            'lastMessageAt', coalesce(last_msg.created_at, pct.last_message_at, pct.updated_at),
            'unreadCount', greatest(pct.unread_count, 0),
            'status', pct.status,
            'assignedTo', pct.assigned_to,
            'assignedToName', coalesce(assignee.full_name, assignee.email),
            'sla', coalesce(nullif(pct.metadata->'slaExpected'->>'label', ''), nullif(pct.metadata->>'sla', ''), 'SLA padrao'),
            'category', 'chat',
            'href', '/clinic/patients/' || pct.patient_id || '?tab=chat'
          ) as item
        from public.patient_chat_threads pct
        join public.patients p on p.tenant_id = pct.tenant_id and p.id = pct.patient_id
        left join public.patient_pii ppi on ppi.tenant_id = pct.tenant_id and ppi.patient_id = pct.patient_id
        left join public.profiles assignee on assignee.id = pct.assigned_to
        left join lateral (
          select
            pcm.body,
            pcm.sender_label,
            pcm.created_at,
            coalesce(nullif(pcm.metadata->>'sender_type', ''), nullif(pcm.metadata->>'from', '')) as sender_type
          from public.patient_chat_messages pcm
          where pcm.tenant_id = pct.tenant_id
            and pcm.thread_id = pct.id
          order by pcm.created_at desc
          limit 1
        ) last_msg on true
        where pct.tenant_id = v_tenant_id
          and pct.status <> 'archived'
          and (not p_unread_only or pct.unread_count > 0)
          and (p_patient_id is null or pct.patient_id = p_patient_id)
          and (p_assigned_to is null or pct.assigned_to = p_assigned_to)
          and (v_tab not in ('assigned', 'atribuidas') or pct.assigned_to = v_user_id)
        order by pct.unread_count desc, coalesce(pct.last_message_at, pct.updated_at, pct.created_at) desc
        limit v_limit
      ) ranked
    ), '[]'::jsonb) else '[]'::jsonb end,
    'notifications', case when v_tab in ('notificacoes', 'notifications', 'all') then coalesce((
      select jsonb_agg(item order by sort_at desc)
      from (
        select
          n.created_at as sort_at,
          jsonb_build_object(
            'id', n.id,
            'notificationId', n.id,
            'patientId', n.patient_id,
            'patientName', case when n.patient_id is null then null else coalesce(nullif(ppi.full_name, ''), nullif(p.preferred_name, ''), 'Paciente') end,
            'title', n.title,
            'body', coalesce(n.body, ''),
            'category', coalesce(n.category, 'operacional'),
            'severity', coalesce(nullif(n.metadata->>'severity', ''), 'medium'),
            'status', n.status,
            'createdAt', n.created_at,
            'href', coalesce(nullif(n.metadata->>'href', ''), '/clinic/inbox?tab=notificacoes&notification=' || n.id),
            'patientHref', case when n.patient_id is null then null else '/clinic/patients/' || n.patient_id end
          ) as item
        from public.notifications n
        left join public.patients p on p.tenant_id = n.tenant_id and p.id = n.patient_id
        left join public.patient_pii ppi on ppi.tenant_id = n.tenant_id and ppi.patient_id = n.patient_id
        where n.tenant_id = v_tenant_id
          and n.status <> 'archived'
          and (n.user_id is null or n.user_id = v_user_id)
          and (not p_unread_only or n.status = 'unread')
          and (p_patient_id is null or n.patient_id = p_patient_id)
          and (p_category is null or n.category = p_category)
        order by case n.status when 'unread' then 0 else 1 end, n.created_at desc
        limit v_limit
      ) ranked
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_row public.notifications%rowtype;
  v_user_id uuid := auth.uid();
begin
  select * into v_row from public.notifications n where n.id = p_notification_id;
  if v_row.id is null or v_row.tenant_id is null or not security.has_permission(v_row.tenant_id, 'notifications.read', false) or (v_row.user_id is not null and v_row.user_id <> v_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notifications
  set status = 'read', read_at = coalesce(read_at, now())
  where id = p_notification_id
    and status <> 'archived';

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_row.tenant_id, v_user_id, 'notification.read', 'notification', p_notification_id::text, jsonb_build_object('category', v_row.category));

  return public.get_clinic_communications_summary(5);
end;
$$;

create or replace function public.archive_notification(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_row public.notifications%rowtype;
  v_user_id uuid := auth.uid();
begin
  select * into v_row from public.notifications n where n.id = p_notification_id;
  if v_row.id is null or v_row.tenant_id is null or not security.has_permission(v_row.tenant_id, 'notifications.read', false) or (v_row.user_id is not null and v_row.user_id <> v_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notifications
  set status = 'archived', read_at = coalesce(read_at, now())
  where id = p_notification_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_row.tenant_id, v_user_id, 'notification.archived', 'notification', p_notification_id::text, jsonb_build_object('category', v_row.category));

  return public.get_clinic_communications_summary(5);
end;
$$;

create or replace function public.mark_thread_read(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_row public.patient_chat_threads%rowtype;
  v_user_id uuid := auth.uid();
begin
  select * into v_row from public.patient_chat_threads pct where pct.id = p_thread_id;
  if v_row.id is null or not security.has_permission(v_row.tenant_id, 'chat.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.patient_chat_threads
  set unread_count = 0,
      updated_at = now()
  where id = p_thread_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_row.tenant_id, v_user_id, 'chat_thread.read', 'patient_chat_thread', p_thread_id::text, jsonb_build_object('patientId', v_row.patient_id));

  return public.get_clinic_communications_summary(5);
end;
$$;

create or replace function public.assign_chat_thread(p_thread_id uuid, p_assigned_to uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_row public.patient_chat_threads%rowtype;
  v_user_id uuid := auth.uid();
  v_assigned_to uuid := coalesce(p_assigned_to, v_user_id);
begin
  select * into v_row from public.patient_chat_threads pct where pct.id = p_thread_id;
  if v_row.id is null or not security.has_permission(v_row.tenant_id, 'chat.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_assigned_to is not null and not exists (
    select 1 from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.tenant_id = v_row.tenant_id
      and tm.user_id = v_assigned_to
      and tm.status = 'active'
      and p.is_active = true
  ) then
    raise exception 'assignee_not_in_tenant' using errcode = '42501';
  end if;

  update public.patient_chat_threads
  set assigned_to = v_assigned_to,
      updated_at = now()
  where id = p_thread_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_row.tenant_id, v_user_id, 'chat_thread.assigned', 'patient_chat_thread', p_thread_id::text, jsonb_build_object('patientId', v_row.patient_id, 'assignedTo', v_assigned_to));

  return public.list_clinic_inbox('conversas', false, null, null, null, 50);
end;
$$;

create or replace function public.set_chat_thread_status(p_thread_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_row public.patient_chat_threads%rowtype;
  v_user_id uuid := auth.uid();
  v_status text := lower(coalesce(p_status, ''));
begin
  if v_status not in ('open', 'closed') then
    raise exception 'invalid_thread_status' using errcode = '22023';
  end if;

  select * into v_row from public.patient_chat_threads pct where pct.id = p_thread_id;
  if v_row.id is null or not security.has_permission(v_row.tenant_id, 'chat.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.patient_chat_threads
  set status = v_status,
      updated_at = now()
  where id = p_thread_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_row.tenant_id, v_user_id, 'chat_thread.status_changed', 'patient_chat_thread', p_thread_id::text, jsonb_build_object('patientId', v_row.patient_id, 'status', v_status));

  return public.list_clinic_inbox('conversas', false, null, null, null, 50);
end;
$$;

create or replace function public.create_in_app_notification(p_tenant_id uuid, p_user_id uuid, p_patient_id uuid, p_title text, p_body text, p_category text, p_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_tenant_id is null or nullif(p_title, '') is null then
    return null;
  end if;

  insert into public.notifications (tenant_id, user_id, patient_id, title, body, category, status, metadata)
  values (p_tenant_id, p_user_id, p_patient_id, left(p_title, 160), nullif(left(coalesce(p_body, ''), 500), ''), nullif(p_category, ''), 'unread', coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.handle_patient_chat_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_sender_type text := lower(coalesce(new.metadata->>'sender_type', new.metadata->>'from', 'staff'));
  v_thread public.patient_chat_threads%rowtype;
begin
  select * into v_thread from public.patient_chat_threads pct where pct.tenant_id = new.tenant_id and pct.id = new.thread_id;

  if v_thread.id is null then
    return new;
  end if;

  if v_sender_type = 'patient' then
    update public.patient_chat_threads
    set unread_count = greatest(unread_count, 0) + 1,
        last_message_at = new.created_at,
        status = 'open',
        updated_at = now()
    where tenant_id = new.tenant_id
      and id = new.thread_id;

    perform public.create_in_app_notification(
      new.tenant_id,
      v_thread.assigned_to,
      new.patient_id,
      'Nova mensagem de paciente',
      'Uma nova mensagem chegou no inbox clinico.',
      'chat',
      jsonb_build_object('severity', 'medium', 'href', '/clinic/inbox?tab=conversas&thread=' || new.thread_id, 'threadId', new.thread_id)
    );
  else
    update public.patient_chat_threads
    set last_message_at = new.created_at,
        status = 'open',
        updated_at = now()
    where tenant_id = new.tenant_id
      and id = new.thread_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_patient_chat_message_notification on public.patient_chat_messages;
create trigger trg_patient_chat_message_notification
after insert on public.patient_chat_messages
for each row execute function public.handle_patient_chat_message_notification();

create or replace function public.handle_report_run_notification()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  if new.status in ('completed', 'failed') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.create_in_app_notification(
      new.tenant_id,
      new.requested_by,
      new.patient_id,
      case when new.status = 'completed' then 'Export de relatorio concluido' else 'Export de relatorio falhou' end,
      case when new.status = 'completed' then 'Seu relatorio esta pronto para download seguro.' else 'Nao foi possivel concluir o relatorio solicitado.' end,
      'relatorios',
      jsonb_build_object('severity', case when new.status = 'completed' then 'low' else 'high' end, 'href', '/clinic/reports', 'reportRunId', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_report_run_notification on public.report_runs;
create trigger trg_report_run_notification
after insert or update of status on public.report_runs
for each row execute function public.handle_report_run_notification();

create or replace function public.handle_operational_notification()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_title text;
  v_body text;
  v_category text;
  v_severity text := 'medium';
  v_href text;
begin
  if tg_table_name = 'generated_documents' then
    if new.status not in ('pending_signature', 'sent_for_signature', 'signature_failed', 'failed') or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
      return new;
    end if;
    v_category := 'documentos';
    v_title := case when new.status in ('signature_failed', 'failed') then 'Falha em documento para assinatura' else 'Documento pendente de assinatura' end;
    v_body := 'Ha uma atualizacao documental que exige acompanhamento.';
    v_severity := case when new.status in ('signature_failed', 'failed') then 'high' else 'medium' end;
    v_href := '/clinic/documents';
  elsif tg_table_name = 'patient_invoices' then
    if lower(new.status) not in ('overdue', 'vencido', 'paid', 'received', 'confirmed') or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
      return new;
    end if;
    v_category := 'financeiro';
    v_title := case when lower(new.status) in ('overdue', 'vencido') then 'Pagamento vencido' else 'Pagamento confirmado' end;
    v_body := 'Ha uma atualizacao financeira vinculada ao paciente.';
    v_severity := case when lower(new.status) in ('overdue', 'vencido') then 'high' else 'low' end;
    v_href := '/clinic/financeiro';
  elsif tg_table_name = 'appointments' then
    if tg_op = 'UPDATE' and old.scheduled_at is not distinct from new.scheduled_at and old.status is not distinct from new.status then
      return new;
    end if;
    v_category := 'agenda';
    v_title := 'Agendamento alterado';
    v_body := 'Um agendamento do paciente foi atualizado.';
    v_href := '/clinic/agenda';
  else
    return new;
  end if;

  perform public.create_in_app_notification(
    new.tenant_id,
    null,
    new.patient_id,
    v_title,
    v_body,
    v_category,
    jsonb_build_object('severity', v_severity, 'href', v_href)
  );

  return new;
end;
$$;

drop trigger if exists trg_generated_documents_notification on public.generated_documents;
create trigger trg_generated_documents_notification
after insert or update of status on public.generated_documents
for each row execute function public.handle_operational_notification();

drop trigger if exists trg_patient_invoices_notification on public.patient_invoices;
create trigger trg_patient_invoices_notification
after insert or update of status on public.patient_invoices
for each row execute function public.handle_operational_notification();

drop trigger if exists trg_appointments_notification on public.appointments;
create trigger trg_appointments_notification
after update of scheduled_at, status on public.appointments
for each row execute function public.handle_operational_notification();

revoke all on function public.get_clinic_communications_summary(integer) from public;
revoke all on function public.list_clinic_inbox(text, boolean, uuid, uuid, text, integer) from public;
revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.archive_notification(uuid) from public;
revoke all on function public.mark_thread_read(uuid) from public;
revoke all on function public.assign_chat_thread(uuid, uuid) from public;
revoke all on function public.set_chat_thread_status(uuid, text) from public;
revoke all on function public.create_in_app_notification(uuid, uuid, uuid, text, text, text, jsonb) from public;

grant execute on function public.get_clinic_communications_summary(integer) to authenticated, service_role;
grant execute on function public.list_clinic_inbox(text, boolean, uuid, uuid, text, integer) to authenticated, service_role;
grant execute on function public.mark_notification_read(uuid) to authenticated, service_role;
grant execute on function public.archive_notification(uuid) to authenticated, service_role;
grant execute on function public.mark_thread_read(uuid) to authenticated, service_role;
grant execute on function public.assign_chat_thread(uuid, uuid) to authenticated, service_role;
grant execute on function public.set_chat_thread_status(uuid, text) to authenticated, service_role;
grant execute on function public.create_in_app_notification(uuid, uuid, uuid, text, text, text, jsonb) to service_role;
