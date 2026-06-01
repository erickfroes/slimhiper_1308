-- Patient portal minimum contracts.
-- Scope: patient/guardian-scoped reads and narrow mutators behind active linkage
-- plus the patient_portal.access permission. No provider calls or public storage URLs.

create index if not exists idx_patient_invoices_patient_status_due
  on public.patient_invoices(tenant_id, patient_id, status, due_date desc);

create index if not exists idx_payment_links_patient_status
  on public.payment_links(tenant_id, patient_id, status, created_at desc);

create index if not exists idx_notifications_patient_status_created
  on public.notifications(tenant_id, patient_id, status, created_at desc);

create or replace function security.can_access_patient_portal_patient(
  p_tenant_id uuid,
  p_patient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, security, auth, pg_temp
as $$
  select p_tenant_id is not null
    and p_patient_id is not null
    and public.has_permission(p_tenant_id, 'patient_portal.access')
    and (
      exists (
        select 1
        from public.patient_accounts pa
        where pa.tenant_id = p_tenant_id
          and pa.patient_id = p_patient_id
          and pa.user_id = auth.uid()
          and pa.status = 'active'
      )
      or exists (
        select 1
        from public.guardian_links gl
        where gl.tenant_id = p_tenant_id
          and gl.patient_id = p_patient_id
          and gl.guardian_user_id = auth.uid()
          and gl.status = 'active'
      )
    );
$$;

revoke all on function security.can_access_patient_portal_patient(uuid, uuid) from public;
grant execute on function security.can_access_patient_portal_patient(uuid, uuid)
  to authenticated, service_role;

create or replace function public.can_access_patient_portal_patient(
  p_tenant_id uuid,
  p_patient_id uuid
)
returns boolean
language sql
stable
as $$
  select security.can_access_patient_portal_patient(p_tenant_id, p_patient_id);
$$;

revoke all on function public.can_access_patient_portal_patient(uuid, uuid) from public;
grant execute on function public.can_access_patient_portal_patient(uuid, uuid)
  to authenticated, service_role;

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
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'tenantId', d.tenant_id,
      'patientId', d.patient_id,
      'linkageType', d.linkage_type,
      'relationship', d.relationship,
      'displayName', coalesce(pp.full_name, p.preferred_name, 'Paciente'),
      'status', p.status
    ) order by coalesce(pp.full_name, p.preferred_name, 'Paciente')
  ), '[]'::jsonb)
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
    'title', n.title,
    'body', n.body,
    'category', n.category,
    'status', n.status,
    'createdAt', n.created_at
  ) order by n.created_at desc), '[]'::jsonb)
  into v_notifications
  from public.notifications n
  where n.tenant_id = v_selected_tenant_id
    and (n.user_id = v_user_id or n.patient_id = v_selected_patient_id)
    and n.status <> 'archived'
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
        'senderLabel', pcm.sender_label,
        'isOwn', pcm.sender_user_id = v_user_id,
        'body', pcm.body,
        'createdAt', pcm.created_at
      ) order by pcm.created_at asc)
      from (
        select *
        from public.patient_chat_messages pcm
        where pcm.tenant_id = pct.tenant_id
          and pcm.thread_id = pct.id
          and pcm.patient_id = pct.patient_id
        order by pcm.created_at desc
        limit 20
      ) pcm
    ), '[]'::jsonb)
  )
  into v_chat
  from public.patient_chat_threads pct
  where pct.tenant_id = v_selected_tenant_id
    and pct.patient_id = v_selected_patient_id;

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

  insert into public.patient_chat_threads (tenant_id, patient_id, status, last_message_at, unread_count, metadata)
  values (v_tenant_id, p_patient_id, 'open', now(), 1, jsonb_build_object('source', 'patient_portal'))
  on conflict (tenant_id, patient_id) do update
    set status = case when public.patient_chat_threads.status = 'archived' then 'open' else public.patient_chat_threads.status end,
        last_message_at = now(),
        unread_count = greatest(public.patient_chat_threads.unread_count, 0) + 1,
        updated_at = now()
  returning id into v_thread_id;

  insert into public.patient_chat_messages (tenant_id, thread_id, patient_id, sender_user_id, sender_label, body, metadata)
  values (v_tenant_id, v_thread_id, p_patient_id, v_user_id, 'Portal do paciente', v_body, jsonb_build_object('source', 'patient_portal'))
  returning id into v_message_id;

  return jsonb_build_object('id', v_message_id, 'threadId', v_thread_id, 'createdAt', now());
end;
$$;

create or replace function public.submit_patient_portal_checkin(
  p_checkin_id uuid,
  p_responses jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.patient_program_checkins%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_row
  from public.patient_program_checkins pc
  where pc.id = p_checkin_id;

  if v_row.id is null or not security.can_access_patient_portal_patient(v_row.tenant_id, v_row.patient_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_row.status in ('completed', 'canceled') then
    raise exception 'checkin_closed' using errcode = '22023';
  end if;

  update public.patient_program_checkins
  set responses = coalesce(p_responses, '{}'::jsonb),
      status = 'completed',
      completed_at = now(),
      updated_at = now()
  where tenant_id = v_row.tenant_id and id = v_row.id;

  return jsonb_build_object('id', v_row.id, 'status', 'completed', 'completedAt', now());
end;
$$;

create or replace function public.mark_patient_portal_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.notifications%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_row from public.notifications n where n.id = p_notification_id;

  if v_row.id is null or (
    v_row.user_id is distinct from v_user_id
    and not security.can_access_patient_portal_patient(v_row.tenant_id, v_row.patient_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notifications
  set status = 'read', read_at = coalesce(read_at, now())
  where id = p_notification_id
    and status = 'unread';

  return jsonb_build_object('id', p_notification_id, 'status', 'read');
end;
$$;

revoke all on function public.get_patient_portal_snapshot(uuid) from public;
revoke all on function public.send_patient_portal_message(uuid, text) from public;
revoke all on function public.submit_patient_portal_checkin(uuid, jsonb) from public;
revoke all on function public.mark_patient_portal_notification_read(uuid) from public;

grant execute on function public.get_patient_portal_snapshot(uuid) to authenticated, service_role;
grant execute on function public.send_patient_portal_message(uuid, text) to authenticated, service_role;
grant execute on function public.submit_patient_portal_checkin(uuid, jsonb) to authenticated, service_role;
grant execute on function public.mark_patient_portal_notification_read(uuid) to authenticated, service_role;

grant select on public.patient_pii to authenticated, service_role;
grant select on public.patient_invoices to authenticated, service_role;
grant select on public.payment_links to authenticated, service_role;
grant select on public.patient_chat_threads to authenticated, service_role;
grant select on public.patient_chat_messages to authenticated, service_role;
grant select on public.patient_program_checkins to authenticated, service_role;

drop policy if exists patient_pii_select_patient_portal_linked on public.patient_pii;
create policy patient_pii_select_patient_portal_linked
on public.patient_pii for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists patient_invoices_select_patient_portal_linked on public.patient_invoices;
create policy patient_invoices_select_patient_portal_linked
on public.patient_invoices for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists payment_links_select_patient_portal_linked on public.payment_links;
create policy payment_links_select_patient_portal_linked
on public.payment_links for select
to authenticated
using (patient_id is not null and public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists patient_chat_threads_select_patient_portal_linked on public.patient_chat_threads;
create policy patient_chat_threads_select_patient_portal_linked
on public.patient_chat_threads for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists patient_chat_messages_select_patient_portal_linked on public.patient_chat_messages;
create policy patient_chat_messages_select_patient_portal_linked
on public.patient_chat_messages for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists patient_program_checkins_select_patient_portal_linked on public.patient_program_checkins;
create policy patient_program_checkins_select_patient_portal_linked
on public.patient_program_checkins for select
to authenticated
using (public.can_access_patient_portal_patient(tenant_id, patient_id));

drop policy if exists notifications_select_patient_portal_linked on public.notifications;
create policy notifications_select_patient_portal_linked
on public.notifications for select
to authenticated
using (
  user_id = auth.uid()
  or (patient_id is not null and public.can_access_patient_portal_patient(tenant_id, patient_id))
);

comment on function public.get_patient_portal_snapshot(uuid) is
  'Returns the minimum patient portal snapshot scoped to the authenticated patient/guardian active linkage.';
comment on function public.send_patient_portal_message(uuid, text) is
  'Creates a patient/guardian message in the linked patient chat thread and increments staff unread count.';
comment on function public.submit_patient_portal_checkin(uuid, jsonb) is
  'Completes an own linked patient program check-in from the patient portal.';
comment on function public.mark_patient_portal_notification_read(uuid) is
  'Marks an own patient portal notification as read.';
