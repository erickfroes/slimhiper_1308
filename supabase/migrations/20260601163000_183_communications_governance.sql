-- Phase 8.4: communications retention, moderation, and governance.
-- LGPD notes:
-- - Clinical chat messages are retained for clinical continuity/audit by default
--   for 6 years, then archived by an explicitly authorized backend job.
-- - Operational notifications are retained for 2 years by default.
-- - Moderation is fail-closed: non-approved content is not returned to staff or
--   portal surfaces, while moderation metadata and audit logs preserve traceability.

alter table public.patient_chat_threads
  add column if not exists archived_at timestamptz,
  add column if not exists retention_until timestamptz;

alter table public.patient_chat_messages
  add column if not exists archived_at timestamptz,
  add column if not exists retention_until timestamptz,
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists moderation_reason text,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderated_at timestamptz,
  add column if not exists read_receipts jsonb not null default '[]'::jsonb;

alter table public.notifications
  add column if not exists archived_at timestamptz,
  add column if not exists retention_until timestamptz,
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists moderation_reason text,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderated_at timestamptz,
  add column if not exists read_receipts jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patient_chat_messages_moderation_status_check') then
    alter table public.patient_chat_messages
      add constraint patient_chat_messages_moderation_status_check
      check (moderation_status in ('approved', 'pending_review', 'removed'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notifications_moderation_status_check') then
    alter table public.notifications
      add constraint notifications_moderation_status_check
      check (moderation_status in ('approved', 'pending_review', 'removed'));
  end if;
end $$;

update public.patient_chat_threads
set retention_until = coalesce(retention_until, created_at + interval '6 years')
where retention_until is null;

update public.patient_chat_messages
set retention_until = coalesce(retention_until, created_at + interval '6 years')
where retention_until is null;

update public.notifications
set retention_until = coalesce(
  retention_until,
  created_at + case
    when category in ('financeiro', 'relatorios') then interval '5 years'
    else interval '2 years'
  end
)
where retention_until is null;

create index if not exists idx_patient_chat_messages_governance
  on public.patient_chat_messages(tenant_id, moderation_status, retention_until, archived_at);

create index if not exists idx_notifications_governance
  on public.notifications(tenant_id, moderation_status, retention_until, archived_at);

create table if not exists public.communication_governance_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null check (entity_type in ('patient_chat_message', 'notification', 'patient_chat_thread')),
  entity_id uuid not null,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

alter table public.communication_governance_events enable row level security;

create index if not exists idx_communication_governance_events_tenant_created
  on public.communication_governance_events(tenant_id, created_at desc);

drop policy if exists communication_governance_events_select_admin on public.communication_governance_events;

create policy communication_governance_events_select_admin
on public.communication_governance_events for select
to authenticated
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or security.has_tenant_role(tenant_id, array['tenant_owner', 'clinic_admin'])
);

create or replace function public.create_in_app_notification(p_tenant_id uuid, p_user_id uuid, p_patient_id uuid, p_title text, p_body text, p_category text, p_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_id uuid;
  v_category text := coalesce(nullif(p_category, ''), 'operacional');
begin
  if p_tenant_id is null or nullif(p_title, '') is null then
    return null;
  end if;

  insert into public.notifications (
    tenant_id, user_id, patient_id, title, body, category, status, metadata,
    moderation_status, retention_until
  )
  values (
    p_tenant_id,
    p_user_id,
    p_patient_id,
    left(p_title, 160),
    nullif(left(coalesce(p_body, ''), 500), ''),
    v_category,
    'unread',
    coalesce(p_metadata, '{}'::jsonb) - 'providerPayload' - 'rawPayload' - 'token' - 'secret',
    'approved',
    now() + case when v_category in ('financeiro', 'relatorios') then interval '5 years' else interval '2 years' end
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.moderate_patient_chat_message(p_message_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_row public.patient_chat_messages%rowtype;
  v_user_id uuid := auth.uid();
  v_status text := lower(coalesce(p_status, ''));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
begin
  if v_status not in ('approved', 'pending_review', 'removed') then
    raise exception 'invalid_moderation_status' using errcode = '22023';
  end if;

  select * into v_row from public.patient_chat_messages pcm where pcm.id = p_message_id;
  if v_row.id is null or not security.has_permission(v_row.tenant_id, 'chat.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_status <> 'approved' and v_reason is null then
    raise exception 'moderation_reason_required' using errcode = '22023';
  end if;

  update public.patient_chat_messages
  set moderation_status = v_status,
      moderation_reason = case when v_status = 'approved' then null else v_reason end,
      moderated_by = v_user_id,
      moderated_at = now()
  where tenant_id = v_row.tenant_id and id = v_row.id;

  insert into public.communication_governance_events (tenant_id, actor_id, entity_type, entity_id, action, reason, metadata)
  values (v_row.tenant_id, v_user_id, 'patient_chat_message', v_row.id, 'message.moderated', v_reason, jsonb_build_object('status', v_status, 'patientId', v_row.patient_id, 'threadId', v_row.thread_id));

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_row.tenant_id, v_user_id, 'communication.message_moderated', 'patient_chat_message', v_row.id::text, jsonb_build_object('status', v_status, 'patientId', v_row.patient_id));

  return jsonb_build_object('id', v_row.id, 'status', v_status, 'moderatedAt', now());
end;
$$;

create or replace function public.moderate_notification(p_notification_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_row public.notifications%rowtype;
  v_user_id uuid := auth.uid();
  v_status text := lower(coalesce(p_status, ''));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
begin
  if v_status not in ('approved', 'pending_review', 'removed') then
    raise exception 'invalid_moderation_status' using errcode = '22023';
  end if;

  select * into v_row from public.notifications n where n.id = p_notification_id;
  if v_row.id is null or v_row.tenant_id is null or not security.has_permission(v_row.tenant_id, 'notifications.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_status <> 'approved' and v_reason is null then
    raise exception 'moderation_reason_required' using errcode = '22023';
  end if;

  update public.notifications
  set moderation_status = v_status,
      moderation_reason = case when v_status = 'approved' then null else v_reason end,
      moderated_by = v_user_id,
      moderated_at = now()
  where tenant_id = v_row.tenant_id and id = v_row.id;

  insert into public.communication_governance_events (tenant_id, actor_id, entity_type, entity_id, action, reason, metadata)
  values (v_row.tenant_id, v_user_id, 'notification', v_row.id, 'notification.moderated', v_reason, jsonb_build_object('status', v_status, 'category', v_row.category, 'patientId', v_row.patient_id));

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_row.tenant_id, v_user_id, 'communication.notification_moderated', 'notification', v_row.id::text, jsonb_build_object('status', v_status, 'category', v_row.category));

  return jsonb_build_object('id', v_row.id, 'status', v_status, 'moderatedAt', now());
end;
$$;

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
  where p.id = v_user_id and p.is_active = true;

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = v_user_id and tm.status = 'active' and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'chat.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(sum(greatest(pct.unread_count, 0)), 0)::integer into v_unread_messages
  from public.patient_chat_threads pct
  where pct.tenant_id = v_tenant_id
    and pct.status <> 'archived'
    and pct.archived_at is null;

  if security.has_permission(v_tenant_id, 'notifications.read', false) then
    select count(*)::integer into v_unread_notifications
    from public.notifications n
    where n.tenant_id = v_tenant_id
      and n.status = 'unread'
      and n.archived_at is null
      and n.moderation_status = 'approved'
      and (n.user_id is null or n.user_id = v_user_id);
  end if;

  return jsonb_build_object(
    'unreadMessages', v_unread_messages,
    'unreadNotifications', v_unread_notifications,
    'messages', coalesce((
      select jsonb_agg(item order by sort_at desc)
      from (
        select pct.last_message_at as sort_at,
          jsonb_build_object(
            'id', pct.id,
            'threadId', pct.id,
            'patientId', pct.patient_id,
            'patientName', coalesce(nullif(ppi.full_name, ''), nullif(p.preferred_name, ''), 'Paciente'),
            'title', coalesce(nullif(ppi.full_name, ''), nullif(p.preferred_name, ''), 'Paciente'),
            'body', case when last_msg.moderation_status = 'approved' then coalesce(nullif(last_msg.body, ''), 'Conversa sem mensagens recentes.') when last_msg.moderation_status is null then 'Conversa sem mensagens recentes.' else 'Conteudo sob revisao de moderacao.' end,
            'category', 'chat',
            'severity', case when pct.unread_count >= 3 then 'high' when pct.unread_count > 0 then 'medium' else 'low' end,
            'unreadCount', greatest(pct.unread_count, 0),
            'assignedTo', pct.assigned_to,
            'status', pct.status,
            'moderationStatus', coalesce(last_msg.moderation_status, 'approved'),
            'createdAt', coalesce(pct.last_message_at, pct.updated_at, pct.created_at),
            'href', '/clinic/inbox?tab=conversas&thread=' || pct.id,
            'patientHref', '/clinic/patients/' || pct.patient_id || '?tab=chat'
          ) as item
        from public.patient_chat_threads pct
        join public.patients p on p.tenant_id = pct.tenant_id and p.id = pct.patient_id
        left join public.patient_pii ppi on ppi.tenant_id = pct.tenant_id and ppi.patient_id = pct.patient_id
        left join lateral (
          select pcm.body, pcm.moderation_status
          from public.patient_chat_messages pcm
          where pcm.tenant_id = pct.tenant_id
            and pcm.thread_id = pct.id
            and pcm.archived_at is null
          order by pcm.created_at desc
          limit 1
        ) last_msg on true
        where pct.tenant_id = v_tenant_id
          and pct.status <> 'archived'
          and pct.archived_at is null
        order by pct.unread_count desc, pct.last_message_at desc nulls last, pct.updated_at desc
        limit v_limit
      ) ranked
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(item order by sort_at desc)
      from (
        select n.created_at as sort_at,
          jsonb_build_object(
            'id', n.id,
            'notificationId', n.id,
            'patientId', n.patient_id,
            'patientName', case when n.patient_id is null then null else coalesce(nullif(ppi.full_name, ''), nullif(p.preferred_name, ''), 'Paciente') end,
            'title', case when n.moderation_status = 'approved' then n.title else 'Notificacao sob revisao' end,
            'body', case when n.moderation_status = 'approved' then coalesce(n.body, '') else 'Conteudo removido ou sob revisao de moderacao.' end,
            'category', coalesce(n.category, 'operacional'),
            'severity', case when n.moderation_status = 'approved' then coalesce(nullif(n.metadata->>'severity', ''), 'medium') else 'medium' end,
            'status', n.status,
            'moderationStatus', n.moderation_status,
            'createdAt', n.created_at,
            'href', coalesce(nullif(n.metadata->>'href', ''), '/clinic/inbox?tab=notificacoes&notification=' || n.id),
            'patientHref', case when n.patient_id is null then null else '/clinic/patients/' || n.patient_id end
          ) as item
        from public.notifications n
        left join public.patients p on p.tenant_id = n.tenant_id and p.id = n.patient_id
        left join public.patient_pii ppi on ppi.tenant_id = n.tenant_id and ppi.patient_id = n.patient_id
        where n.tenant_id = v_tenant_id
          and n.status <> 'archived'
          and n.archived_at is null
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
  where p.id = v_user_id and p.is_active = true;

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = v_user_id and tm.status = 'active' and p.is_active = true
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
        select coalesce(pct.last_message_at, pct.updated_at, pct.created_at) as sort_at,
          jsonb_build_object(
            'id', pct.id,
            'threadId', pct.id,
            'patientId', pct.patient_id,
            'patientName', coalesce(nullif(ppi.full_name, ''), nullif(p.preferred_name, ''), 'Paciente'),
            'lastMessagePreview', case when last_msg.moderation_status = 'approved' then coalesce(nullif(last_msg.body, ''), 'Conversa sem mensagens recentes.') when last_msg.moderation_status is null then 'Conversa sem mensagens recentes.' else 'Conteudo sob revisao de moderacao.' end,
            'lastMessageFrom', case when last_msg.moderation_status = 'approved' or last_msg.moderation_status is null then coalesce(nullif(last_msg.sender_label, ''), case when last_msg.sender_type = 'patient' then 'Paciente' else 'Equipe' end) else 'Moderacao' end,
            'lastMessageAt', coalesce(last_msg.created_at, pct.last_message_at, pct.updated_at),
            'unreadCount', greatest(pct.unread_count, 0),
            'status', pct.status,
            'moderationStatus', coalesce(last_msg.moderation_status, 'approved'),
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
          select pcm.body, pcm.sender_label, pcm.created_at, pcm.moderation_status,
            coalesce(nullif(pcm.metadata->>'sender_type', ''), nullif(pcm.metadata->>'from', '')) as sender_type
          from public.patient_chat_messages pcm
          where pcm.tenant_id = pct.tenant_id
            and pcm.thread_id = pct.id
            and pcm.archived_at is null
          order by pcm.created_at desc
          limit 1
        ) last_msg on true
        where pct.tenant_id = v_tenant_id
          and pct.status <> 'archived'
          and pct.archived_at is null
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
        select n.created_at as sort_at,
          jsonb_build_object(
            'id', n.id,
            'notificationId', n.id,
            'patientId', n.patient_id,
            'patientName', case when n.patient_id is null then null else coalesce(nullif(ppi.full_name, ''), nullif(p.preferred_name, ''), 'Paciente') end,
            'title', case when n.moderation_status = 'approved' then n.title else 'Notificacao sob revisao' end,
            'body', case when n.moderation_status = 'approved' then coalesce(n.body, '') else 'Conteudo removido ou sob revisao de moderacao.' end,
            'category', coalesce(n.category, 'operacional'),
            'severity', case when n.moderation_status = 'approved' then coalesce(nullif(n.metadata->>'severity', ''), 'medium') else 'medium' end,
            'status', n.status,
            'moderationStatus', n.moderation_status,
            'createdAt', n.created_at,
            'href', coalesce(nullif(n.metadata->>'href', ''), '/clinic/inbox?tab=notificacoes&notification=' || n.id),
            'patientHref', case when n.patient_id is null then null else '/clinic/patients/' || n.patient_id end
          ) as item
        from public.notifications n
        left join public.patients p on p.tenant_id = n.tenant_id and p.id = n.patient_id
        left join public.patient_pii ppi on ppi.tenant_id = n.tenant_id and ppi.patient_id = n.patient_id
        where n.tenant_id = v_tenant_id
          and n.status <> 'archived'
          and n.archived_at is null
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

create or replace function public.archive_expired_communications(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_message_count integer := 0;
  v_notification_count integer := 0;
  v_thread_count integer := 0;
begin
  select count(*)::integer into v_message_count
  from public.patient_chat_messages
  where archived_at is null and retention_until is not null and retention_until < now();

  select count(*)::integer into v_notification_count
  from public.notifications
  where archived_at is null and retention_until is not null and retention_until < now();

  select count(*)::integer into v_thread_count
  from public.patient_chat_threads pct
  where pct.archived_at is null
    and pct.retention_until is not null
    and pct.retention_until < now()
    and not exists (
      select 1 from public.patient_chat_messages pcm
      where pcm.tenant_id = pct.tenant_id
        and pcm.thread_id = pct.id
        and pcm.archived_at is null
    );

  if not coalesce(p_dry_run, true) then
    update public.patient_chat_messages
    set archived_at = now()
    where archived_at is null and retention_until is not null and retention_until < now();

    update public.notifications
    set archived_at = now(), status = 'archived', read_at = coalesce(read_at, now())
    where archived_at is null and retention_until is not null and retention_until < now();

    update public.patient_chat_threads pct
    set archived_at = now(), status = 'archived', updated_at = now()
    where pct.archived_at is null
      and pct.retention_until is not null
      and pct.retention_until < now()
      and not exists (
        select 1 from public.patient_chat_messages pcm
        where pcm.tenant_id = pct.tenant_id
          and pcm.thread_id = pct.id
          and pcm.archived_at is null
      );
  end if;

  return jsonb_build_object(
    'dryRun', coalesce(p_dry_run, true),
    'messages', v_message_count,
    'notifications', v_notification_count,
    'threads', v_thread_count,
    'generatedAt', now()
  );
end;
$$;

revoke all on function public.moderate_patient_chat_message(uuid, text, text) from public;
revoke all on function public.moderate_notification(uuid, text, text) from public;
revoke all on function public.archive_expired_communications(boolean) from public;
revoke all on table public.communication_governance_events from public;

grant execute on function public.moderate_patient_chat_message(uuid, text, text) to authenticated, service_role;
grant execute on function public.moderate_notification(uuid, text, text) to authenticated, service_role;
grant execute on function public.archive_expired_communications(boolean) to service_role;
grant select on public.communication_governance_events to authenticated, service_role;
grant insert on public.communication_governance_events to service_role;

create or replace function public.get_patient_portal_snapshot(p_patient_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_selected_patient_id uuid;
  v_selected_tenant_id uuid;
  v_patients jsonb := '[]'::jsonb;
  v_patient jsonb := '{}'::jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_invoices jsonb := '[]'::jsonb;
  v_chat jsonb := '{}'::jsonb;
  v_notifications jsonb := '[]'::jsonb;
  v_checkins jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  with linked as (
    select pa.tenant_id, pa.patient_id, 'patient'::text as linkage_type, null::text as relationship
    from public.patient_accounts pa
    where pa.user_id = v_user_id
      and pa.status = 'active'
      and public.has_permission(pa.tenant_id, 'patient_portal.access')
    union all
    select gl.tenant_id, gl.patient_id, 'guardian'::text as linkage_type, gl.relationship
    from public.guardian_links gl
    where gl.guardian_user_id = v_user_id
      and gl.status = 'active'
      and public.has_permission(gl.tenant_id, 'patient_portal.access')
  ), dedup as (
    select distinct on (tenant_id, patient_id)
      tenant_id, patient_id, linkage_type, relationship
    from linked
    order by tenant_id, patient_id, linkage_type desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'tenantId', d.tenant_id,
    'patientId', d.patient_id,
    'linkageType', d.linkage_type,
    'relationship', d.relationship,
    'displayName', coalesce(pp.full_name, p.preferred_name, 'Paciente'),
    'status', p.status
  ) order by coalesce(pp.full_name, p.preferred_name, 'Paciente')), '[]'::jsonb)
  into v_patients
  from dedup d
  join public.patients p on p.tenant_id = d.tenant_id and p.id = d.patient_id
  left join public.patient_pii pp on pp.tenant_id = d.tenant_id and pp.patient_id = d.patient_id;

  if jsonb_array_length(v_patients) = 0 then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_patient_id is not null then
    if not exists (select 1 from jsonb_array_elements(v_patients) item where (item->>'patientId')::uuid = p_patient_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    v_selected_patient_id := p_patient_id;
  else
    v_selected_patient_id := (v_patients->0->>'patientId')::uuid;
  end if;

  v_selected_tenant_id := (select (item->>'tenantId')::uuid from jsonb_array_elements(v_patients) item where (item->>'patientId')::uuid = v_selected_patient_id limit 1);

  select jsonb_build_object(
    'id', p.id,
    'tenantId', p.tenant_id,
    'preferredName', coalesce(p.preferred_name, pp.full_name, 'Paciente'),
    'fullName', pp.full_name,
    'email', pp.email,
    'phone', pp.phone,
    'status', p.status,
    'tags', p.tags,
    'createdAt', p.created_at
  )
  into v_patient
  from public.patients p
  left join public.patient_pii pp on pp.tenant_id = p.tenant_id and pp.patient_id = p.id
  where p.tenant_id = v_selected_tenant_id
    and p.id = v_selected_patient_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gd.id,
    'name', gd.name,
    'category', gd.category,
    'status', gd.status,
    'generatedAt', gd.generated_at,
    'releasedToPatient', gd.released_to_patient
  ) order by gd.generated_at desc), '[]'::jsonb)
  into v_documents
  from public.generated_documents gd
  where gd.tenant_id = v_selected_tenant_id
    and gd.patient_id = v_selected_patient_id
    and gd.released_to_patient = true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pi.id,
    'status', pi.status,
    'amountCents', pi.amount_cents,
    'dueDate', pi.due_date,
    'paidAt', pi.paid_at,
    'description', pi.description,
    'paymentLink', coalesce(pi.payment_link, pl.url)
  ) order by pi.due_date desc nulls last, pi.created_at desc), '[]'::jsonb)
  into v_invoices
  from public.patient_invoices pi
  left join public.payment_links pl on pl.tenant_id = pi.tenant_id and pl.patient_id = pi.patient_id and pl.status = 'active'
  where pi.tenant_id = v_selected_tenant_id
    and pi.patient_id = v_selected_patient_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'title', case when n.moderation_status = 'approved' then n.title else 'Notificacao sob revisao' end,
    'body', case when n.moderation_status = 'approved' then n.body else 'Conteudo removido ou sob revisao de moderacao.' end,
    'category', n.category,
    'status', n.status,
    'moderationStatus', n.moderation_status,
    'createdAt', n.created_at
  ) order by n.created_at desc), '[]'::jsonb)
  into v_notifications
  from public.notifications n
  where n.tenant_id = v_selected_tenant_id
    and (n.user_id = v_user_id or n.patient_id = v_selected_patient_id)
    and n.status <> 'archived'
    and n.archived_at is null
  limit 20;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pc.id,
    'title', pc.title,
    'status', pc.status,
    'channel', pc.channel,
    'dueDate', pc.due_date,
    'questions', pc.questions,
    'responses', pc.responses,
    'completedAt', pc.completed_at
  ) order by pc.due_date desc), '[]'::jsonb)
  into v_checkins
  from public.patient_program_checkins pc
  where pc.tenant_id = v_selected_tenant_id
    and pc.patient_id = v_selected_patient_id
  limit 20;

  select jsonb_build_object(
    'threadId', pct.id,
    'status', pct.status,
    'lastMessageAt', pct.last_message_at,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pcm.id,
        'senderLabel', case when pcm.moderation_status = 'approved' then pcm.sender_label else 'Moderacao' end,
        'isOwn', pcm.sender_user_id = v_user_id,
        'body', case when pcm.moderation_status = 'approved' then pcm.body else 'Conteudo removido ou sob revisao de moderacao.' end,
        'moderationStatus', pcm.moderation_status,
        'createdAt', pcm.created_at
      ) order by pcm.created_at asc)
      from (
        select *
        from public.patient_chat_messages pcm
        where pcm.tenant_id = pct.tenant_id
          and pcm.thread_id = pct.id
          and pcm.patient_id = pct.patient_id
          and pcm.archived_at is null
        order by pcm.created_at desc
        limit 20
      ) pcm
    ), '[]'::jsonb)
  )
  into v_chat
  from public.patient_chat_threads pct
  where pct.tenant_id = v_selected_tenant_id
    and pct.patient_id = v_selected_patient_id
    and pct.archived_at is null;

  return jsonb_build_object(
    'selectedPatientId', v_selected_patient_id,
    'patients', v_patients,
    'patient', v_patient,
    'documents', v_documents,
    'invoices', v_invoices,
    'chat', coalesce(v_chat, jsonb_build_object('threadId', null, 'status', 'open', 'messages', '[]'::jsonb)),
    'notifications', v_notifications,
    'checkins', v_checkins
  );
end;
$$;

create or replace function public.send_patient_portal_message(
  p_patient_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_thread_id uuid;
  v_message_id uuid;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if v_body is null or length(v_body) > 2000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;

  select x.tenant_id into v_tenant_id
  from (
    select pa.tenant_id
    from public.patient_accounts pa
    where pa.user_id = v_user_id and pa.patient_id = p_patient_id and pa.status = 'active'
    union
    select gl.tenant_id
    from public.guardian_links gl
    where gl.guardian_user_id = v_user_id and gl.patient_id = p_patient_id and gl.status = 'active'
  ) x
  where public.has_permission(x.tenant_id, 'patient_portal.access')
  limit 1;

  if v_tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.patient_chat_threads (tenant_id, patient_id, status, last_message_at, unread_count, metadata, retention_until)
  values (v_tenant_id, p_patient_id, 'open', now(), 1, jsonb_build_object('source', 'patient_portal'), now() + interval '6 years')
  on conflict (tenant_id, patient_id) do update
    set status = case when public.patient_chat_threads.status = 'archived' then 'open' else public.patient_chat_threads.status end,
        archived_at = null,
        last_message_at = now(),
        unread_count = greatest(public.patient_chat_threads.unread_count, 0) + 1,
        retention_until = greatest(coalesce(public.patient_chat_threads.retention_until, now()), now() + interval '6 years'),
        updated_at = now()
  returning id into v_thread_id;

  insert into public.patient_chat_messages (tenant_id, thread_id, patient_id, sender_user_id, sender_label, body, metadata, moderation_status, retention_until)
  values (v_tenant_id, v_thread_id, p_patient_id, v_user_id, 'Portal do paciente', v_body, jsonb_build_object('source', 'patient_portal', 'sender_type', 'patient'), 'approved', now() + interval '6 years')
  returning id into v_message_id;

  return jsonb_build_object('id', v_message_id, 'threadId', v_thread_id, 'createdAt', now());
end;
$$;
