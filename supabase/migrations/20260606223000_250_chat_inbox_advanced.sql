-- M04: advanced chat and clinical inbox.
-- Attachments stay private in Supabase Storage. Browser clients only receive
-- short-lived signed URLs after table/RLS checks pass.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function security.storage_object_chat_patient_id(p_object_name text)
returns uuid
language sql
stable
as $$
  select
    case
      when p_object_name is null then null
      when security.is_valid_uuid_text(split_part(p_object_name, '/', 2))
        then split_part(p_object_name, '/', 2)::uuid
      else null
    end;
$$;

create or replace function security.storage_object_chat_thread_id(p_object_name text)
returns uuid
language sql
stable
as $$
  select
    case
      when p_object_name is null then null
      when security.is_valid_uuid_text(split_part(p_object_name, '/', 3))
        then split_part(p_object_name, '/', 3)::uuid
      else null
    end;
$$;

create or replace function security.storage_object_chat_attachment_id(p_object_name text)
returns uuid
language sql
stable
as $$
  select
    case
      when p_object_name is null then null
      when security.is_valid_uuid_text(split_part(p_object_name, '/', 4))
        then split_part(p_object_name, '/', 4)::uuid
      else null
    end;
$$;

create or replace function security.is_valid_chat_attachment_path(p_object_name text)
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

revoke all on function security.storage_object_chat_patient_id(text) from public;
revoke all on function security.storage_object_chat_thread_id(text) from public;
revoke all on function security.storage_object_chat_attachment_id(text) from public;
revoke all on function security.is_valid_chat_attachment_path(text) from public;
grant execute on function security.storage_object_chat_patient_id(text) to authenticated, service_role;
grant execute on function security.storage_object_chat_thread_id(text) to authenticated, service_role;
grant execute on function security.storage_object_chat_attachment_id(text) to authenticated, service_role;
grant execute on function security.is_valid_chat_attachment_path(text) to authenticated, service_role;

create table if not exists public.chat_shortcuts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  text text not null,
  category text not null default 'general',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, title)
);

create table if not exists public.chat_service_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null default time '08:00',
  closes_at time not null default time '18:00',
  timezone text not null default 'America/Sao_Paulo',
  auto_reply text,
  is_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, weekday)
);

create table if not exists public.chat_sla_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  first_response_minutes integer not null default 240 check (first_response_minutes between 5 and 10080),
  resolution_minutes integer not null default 1440 check (resolution_minutes between 30 and 43200),
  breach_notification_minutes integer not null default 30 check (breach_notification_minutes between 1 and 1440),
  business_hours_only boolean not null default true,
  is_default boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create unique index if not exists idx_chat_sla_policies_one_default
  on public.chat_sla_policies(tenant_id)
  where is_default = true and is_active = true;

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  thread_id uuid not null,
  message_id uuid,
  patient_id uuid not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_by_role text not null default 'staff' check (uploaded_by_role in ('staff', 'patient', 'guardian')),
  storage_bucket text not null default 'chat-attachments' check (storage_bucket = 'chat-attachments'),
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')
  ),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'failed', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retention_until timestamptz not null default (now() + interval '6 years'),
  archived_at timestamptz,
  unique (tenant_id, id),
  unique (storage_bucket, storage_path),
  constraint chat_attachments_thread_same_tenant
    foreign key (tenant_id, thread_id)
    references public.patient_chat_threads(tenant_id, id)
    on delete cascade,
  constraint chat_attachments_message_same_tenant
    foreign key (tenant_id, message_id)
    references public.patient_chat_messages(tenant_id, id)
    on delete cascade,
  constraint chat_attachments_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint chat_attachments_storage_path_shape
    check (
      security.is_valid_chat_attachment_path(storage_path)
      and split_part(storage_path, '/', 1)::uuid = tenant_id
      and split_part(storage_path, '/', 2)::uuid = patient_id
      and split_part(storage_path, '/', 3)::uuid = thread_id
      and split_part(storage_path, '/', 4)::uuid = id
    )
);

select security.touch_updated_at('public.chat_shortcuts');
select security.touch_updated_at('public.chat_service_hours');
select security.touch_updated_at('public.chat_sla_policies');
select security.touch_updated_at('public.chat_attachments');

create index if not exists idx_chat_shortcuts_tenant_active
  on public.chat_shortcuts(tenant_id, is_active, sort_order);
create index if not exists idx_chat_service_hours_tenant_weekday
  on public.chat_service_hours(tenant_id, weekday)
  where is_enabled = true;
create index if not exists idx_chat_attachments_message
  on public.chat_attachments(tenant_id, message_id, status);
create index if not exists idx_chat_attachments_thread
  on public.chat_attachments(tenant_id, thread_id, created_at desc);

alter table public.chat_shortcuts enable row level security;
alter table public.chat_service_hours enable row level security;
alter table public.chat_sla_policies enable row level security;
alter table public.chat_attachments enable row level security;

drop policy if exists chat_shortcuts_read on public.chat_shortcuts;
create policy chat_shortcuts_read
on public.chat_shortcuts for select
to authenticated
using (
  public.has_permission(tenant_id, 'chat.read')
  or security.can_access_patient_portal_tenant(tenant_id)
);

drop policy if exists chat_shortcuts_write on public.chat_shortcuts;
create policy chat_shortcuts_write
on public.chat_shortcuts for all
to authenticated
using (public.has_permission(tenant_id, 'chat.write'))
with check (public.has_permission(tenant_id, 'chat.write'));

drop policy if exists chat_service_hours_read on public.chat_service_hours;
create policy chat_service_hours_read
on public.chat_service_hours for select
to authenticated
using (
  public.has_permission(tenant_id, 'chat.read')
  or security.can_access_patient_portal_tenant(tenant_id)
);

drop policy if exists chat_service_hours_write on public.chat_service_hours;
create policy chat_service_hours_write
on public.chat_service_hours for all
to authenticated
using (public.has_permission(tenant_id, 'chat.write'))
with check (public.has_permission(tenant_id, 'chat.write'));

drop policy if exists chat_sla_policies_read on public.chat_sla_policies;
create policy chat_sla_policies_read
on public.chat_sla_policies for select
to authenticated
using (public.has_permission(tenant_id, 'chat.read'));

drop policy if exists chat_sla_policies_write on public.chat_sla_policies;
create policy chat_sla_policies_write
on public.chat_sla_policies for all
to authenticated
using (public.has_permission(tenant_id, 'chat.write'))
with check (public.has_permission(tenant_id, 'chat.write'));

drop policy if exists chat_attachments_read on public.chat_attachments;
create policy chat_attachments_read
on public.chat_attachments for select
to authenticated
using (
  public.has_permission(tenant_id, 'chat.read')
  or public.can_access_patient_portal_patient(tenant_id, patient_id)
);

drop policy if exists chat_attachments_write_staff on public.chat_attachments;
create policy chat_attachments_write_staff
on public.chat_attachments for all
to authenticated
using (public.has_permission(tenant_id, 'chat.write'))
with check (public.has_permission(tenant_id, 'chat.write'));

grant select on public.chat_shortcuts to authenticated, service_role;
grant insert, update, delete on public.chat_shortcuts to authenticated, service_role;
grant select on public.chat_service_hours to authenticated, service_role;
grant insert, update, delete on public.chat_service_hours to authenticated, service_role;
grant select on public.chat_sla_policies to authenticated, service_role;
grant insert, update, delete on public.chat_sla_policies to authenticated, service_role;
grant select on public.chat_attachments to authenticated, service_role;
grant insert, update on public.chat_attachments to authenticated, service_role;

insert into public.chat_shortcuts (tenant_id, title, text, category, sort_order)
select t.id, seed.title, seed.text, seed.category, seed.sort_order
from public.tenants t
cross join (
  values
    ('Recebemos sua mensagem', 'Recebemos sua mensagem e vamos retornar com orientacao em breve.', 'triage', 10),
    ('Orientacao pre-consulta', 'Para sua seguranca, mantenha as orientacoes combinadas ate a proxima consulta.', 'clinical', 20),
    ('Anexo recebido', 'Anexo recebido. A equipe vai avaliar e retorna pelo chat.', 'attachments', 30)
) as seed(title, text, category, sort_order)
on conflict (tenant_id, title) do nothing;

insert into public.chat_service_hours (tenant_id, weekday, opens_at, closes_at, auto_reply)
select t.id, day.weekday, time '08:00', time '18:00',
       'Estamos fora do horario de atendimento. Sua mensagem fica registrada e sera respondida no proximo periodo util.'
from public.tenants t
cross join (values (1), (2), (3), (4), (5)) as day(weekday)
on conflict (tenant_id, weekday) do nothing;

insert into public.chat_sla_policies (
  tenant_id, name, first_response_minutes, resolution_minutes, breach_notification_minutes,
  business_hours_only, is_default
)
select t.id, 'Responder em ate 4h', 240, 1440, 30, true, true
from public.tenants t
on conflict (tenant_id, name) do nothing;

drop policy if exists "chat_attachments_storage_select" on storage.objects;
create policy "chat_attachments_storage_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'chat-attachments'
  and security.is_valid_chat_attachment_path(name)
  and exists (
    select 1
    from public.chat_attachments ca
    where ca.storage_bucket = bucket_id
      and ca.storage_path = name
      and ca.status = 'uploaded'
      and ca.archived_at is null
      and (
        public.has_permission(ca.tenant_id, 'chat.read')
        or public.can_access_patient_portal_patient(ca.tenant_id, ca.patient_id)
      )
  )
);

drop policy if exists "chat_attachments_storage_insert" on storage.objects;
create policy "chat_attachments_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-attachments'
  and security.is_valid_chat_attachment_path(name)
  and exists (
    select 1
    from public.chat_attachments ca
    where ca.storage_bucket = bucket_id
      and ca.storage_path = name
      and ca.status = 'pending'
      and (
        public.has_permission(ca.tenant_id, 'chat.write')
        or public.can_access_patient_portal_patient(ca.tenant_id, ca.patient_id)
      )
  )
);

drop policy if exists "chat_attachments_storage_update" on storage.objects;
create policy "chat_attachments_storage_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'chat-attachments'
  and security.is_valid_chat_attachment_path(name)
  and exists (
    select 1
    from public.chat_attachments ca
    where ca.storage_bucket = bucket_id
      and ca.storage_path = name
      and (
        public.has_permission(ca.tenant_id, 'chat.write')
        or public.can_access_patient_portal_patient(ca.tenant_id, ca.patient_id)
      )
  )
)
with check (
  bucket_id = 'chat-attachments'
  and security.is_valid_chat_attachment_path(name)
  and exists (
    select 1
    from public.chat_attachments ca
    where ca.storage_bucket = bucket_id
      and ca.storage_path = name
      and (
        public.has_permission(ca.tenant_id, 'chat.write')
        or public.can_access_patient_portal_patient(ca.tenant_id, ca.patient_id)
      )
  )
);

create or replace function public.prepare_chat_attachment(
  p_thread_id uuid,
  p_message_id uuid,
  p_file_name text,
  p_mime_type text,
  p_size_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, storage, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_thread public.patient_chat_threads%rowtype;
  v_attachment_id uuid := gen_random_uuid();
  v_file_name text := left(regexp_replace(coalesce(nullif(btrim(p_file_name), ''), 'attachment'), '[^a-zA-Z0-9._-]+', '-', 'g'), 120);
  v_mime_type text := lower(coalesce(p_mime_type, ''));
  v_storage_path text;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf') then
    raise exception 'invalid_attachment_type' using errcode = '22023';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'invalid_attachment_size' using errcode = '22023';
  end if;

  select * into v_thread
  from public.patient_chat_threads pct
  where pct.id = p_thread_id
    and pct.archived_at is null;

  if v_thread.id is null then
    raise exception 'thread_not_found' using errcode = '22023';
  end if;

  if not public.has_permission(v_thread.tenant_id, 'chat.write')
     and not security.can_access_patient_portal_patient(v_thread.tenant_id, v_thread.patient_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_message_id is not null and not exists (
    select 1
    from public.patient_chat_messages pcm
    where pcm.tenant_id = v_thread.tenant_id
      and pcm.thread_id = v_thread.id
      and pcm.patient_id = v_thread.patient_id
      and pcm.id = p_message_id
      and pcm.archived_at is null
  ) then
    raise exception 'message_not_found' using errcode = '22023';
  end if;

  v_role := case
    when public.has_permission(v_thread.tenant_id, 'chat.write') then 'staff'
    else 'patient'
  end;

  v_file_name := coalesce(nullif(trim(both '-' from v_file_name), ''), 'attachment');
  v_storage_path := v_thread.tenant_id::text || '/' || v_thread.patient_id::text || '/' ||
                    v_thread.id::text || '/' || v_attachment_id::text || '/' || v_file_name;

  insert into public.chat_attachments (
    id, tenant_id, thread_id, message_id, patient_id, uploaded_by, uploaded_by_role,
    storage_bucket, storage_path, file_name, mime_type, size_bytes, status
  )
  values (
    v_attachment_id, v_thread.tenant_id, v_thread.id, p_message_id, v_thread.patient_id,
    v_user_id, v_role, 'chat-attachments', v_storage_path, v_file_name, v_mime_type,
    p_size_bytes, 'pending'
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_thread.tenant_id,
    v_user_id,
    'chat_attachment.prepared',
    'chat_attachment',
    v_attachment_id::text,
    jsonb_build_object('threadId', v_thread.id, 'patientId', v_thread.patient_id, 'mimeType', v_mime_type, 'sizeBytes', p_size_bytes)
  );

  return jsonb_build_object(
    'id', v_attachment_id,
    'bucket', 'chat-attachments',
    'path', v_storage_path,
    'fileName', v_file_name,
    'mimeType', v_mime_type,
    'sizeBytes', p_size_bytes
  );
end;
$$;

create or replace function public.complete_chat_attachment_upload(
  p_attachment_id uuid,
  p_status text default 'uploaded'
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, storage, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text := lower(coalesce(p_status, 'uploaded'));
  v_attachment public.chat_attachments%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  if v_status not in ('uploaded', 'failed') then
    raise exception 'invalid_attachment_status' using errcode = '22023';
  end if;

  select * into v_attachment
  from public.chat_attachments ca
  where ca.id = p_attachment_id;

  if v_attachment.id is null then
    raise exception 'attachment_not_found' using errcode = '22023';
  end if;

  if not public.has_permission(v_attachment.tenant_id, 'chat.write')
     and not security.can_access_patient_portal_patient(v_attachment.tenant_id, v_attachment.patient_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_status = 'uploaded' and not exists (
    select 1
    from storage.objects o
    where o.bucket_id = v_attachment.storage_bucket
      and o.name = v_attachment.storage_path
  ) then
    raise exception 'attachment_object_not_found' using errcode = '22023';
  end if;

  update public.chat_attachments
  set status = v_status,
      updated_at = now()
  where id = p_attachment_id
  returning * into v_attachment;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_attachment.tenant_id,
    v_user_id,
    'chat_attachment.' || v_status,
    'chat_attachment',
    p_attachment_id::text,
    jsonb_build_object('threadId', v_attachment.thread_id, 'patientId', v_attachment.patient_id)
  );

  return jsonb_build_object(
    'id', v_attachment.id,
    'status', v_attachment.status,
    'messageId', v_attachment.message_id
  );
end;
$$;

create or replace function public.get_chat_attachment_download(
  p_attachment_id uuid,
  p_expires_in integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_attachment public.chat_attachments%rowtype;
  v_expires integer := least(greatest(coalesce(p_expires_in, 300), 60), 600);
begin
  select * into v_attachment
  from public.chat_attachments ca
  where ca.id = p_attachment_id;

  if v_attachment.id is null
     or v_attachment.status <> 'uploaded'
     or v_attachment.archived_at is not null
     or (
       not public.has_permission(v_attachment.tenant_id, 'chat.read')
       and not security.can_access_patient_portal_patient(v_attachment.tenant_id, v_attachment.patient_id)
     ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'bucket', v_attachment.storage_bucket,
    'path', v_attachment.storage_path,
    'expiresInSeconds', v_expires
  );
end;
$$;

create or replace function public.notify_chat_sla_breaches(
  p_dry_run boolean default true,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_count integer := 0;
begin
  with candidates as (
    select
      pct.id,
      pct.tenant_id,
      pct.patient_id,
      pct.assigned_to,
      coalesce(pct.last_message_at, pct.updated_at, pct.created_at) as anchor_at,
      coalesce(csp.first_response_minutes, 240) as first_response_minutes
    from public.patient_chat_threads pct
    left join lateral (
      select csp.first_response_minutes
      from public.chat_sla_policies csp
      where csp.tenant_id = pct.tenant_id
        and csp.is_active = true
      order by csp.is_default desc, csp.created_at asc
      limit 1
    ) csp on true
    where pct.status = 'open'
      and pct.archived_at is null
      and pct.unread_count > 0
      and not (pct.metadata ? 'slaBreachNotifiedAt')
      and now() > coalesce(pct.last_message_at, pct.updated_at, pct.created_at) +
        make_interval(mins => coalesce(csp.first_response_minutes, 240))
    order by coalesce(pct.last_message_at, pct.updated_at, pct.created_at) asc
    limit v_limit
  ), notified as (
    select
      c.*,
      case when p_dry_run then null else public.create_in_app_notification(
        c.tenant_id,
        c.assigned_to,
        c.patient_id,
        'SLA de chat vencido',
        'Uma conversa de paciente ultrapassou o SLA de resposta.',
        'chat',
        jsonb_build_object('severity', 'high', 'href', '/clinic/inbox?tab=conversas&thread=' || c.id, 'threadId', c.id, 'slaBreach', true)
      ) end as notification_id
    from candidates c
  ), updated as (
    update public.patient_chat_threads pct
    set metadata = jsonb_set(
          pct.metadata,
          '{slaBreachNotifiedAt}',
          to_jsonb(now()),
          true
        ),
        updated_at = now()
    from notified n
    where not p_dry_run
      and pct.tenant_id = n.tenant_id
      and pct.id = n.id
    returning pct.id
  )
  select count(*)::integer into v_count
  from notified;

  return jsonb_build_object('dryRun', p_dry_run, 'count', v_count);
end;
$$;

revoke all on function public.prepare_chat_attachment(uuid, uuid, text, text, integer) from public;
revoke all on function public.complete_chat_attachment_upload(uuid, text) from public;
revoke all on function public.get_chat_attachment_download(uuid, integer) from public;
revoke all on function public.notify_chat_sla_breaches(boolean, integer) from public;

grant execute on function public.prepare_chat_attachment(uuid, uuid, text, text, integer) to authenticated, service_role;
grant execute on function public.complete_chat_attachment_upload(uuid, text) to authenticated, service_role;
grant execute on function public.get_chat_attachment_download(uuid, integer) to authenticated, service_role;
grant execute on function public.notify_chat_sla_breaches(boolean, integer) to service_role;

comment on table public.chat_attachments is 'Private chat attachment metadata. File bytes live in the chat-attachments bucket and are served through short-lived signed URLs.';
comment on function public.notify_chat_sla_breaches(boolean, integer) is 'Service-role M04 helper for SLA breach notification. Dry-run by default.';
