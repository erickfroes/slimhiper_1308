-- Public call panels deliberately expose only a masked patient name, room and call time.

create table if not exists public.call_panels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid,
  name text not null,
  public_token text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive')),
  settings jsonb not null default '{"soundEnabled": true, "recentCallMinutes": 5}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint call_panels_name_not_blank check (length(btrim(name)) > 0),
  constraint call_panels_unit_same_tenant
    foreign key (tenant_id, unit_id)
    references public.tenant_units(tenant_id, id)
);

create index if not exists idx_call_panels_tenant_status_unit
  on public.call_panels(tenant_id, status, unit_id);

select security.touch_updated_at('public.call_panels'::regclass);

alter table public.call_panels enable row level security;

drop policy if exists call_panels_select_by_agenda_or_settings_read on public.call_panels;
create policy call_panels_select_by_agenda_or_settings_read
on public.call_panels for select to authenticated
using (
  security.has_permission(tenant_id, 'agenda.read', true)
  or security.has_permission(tenant_id, 'settings.read', true)
);

drop policy if exists call_panels_write_by_agenda_or_settings_write on public.call_panels;
create policy call_panels_write_by_agenda_or_settings_write
on public.call_panels for all to authenticated
using (
  security.has_permission(tenant_id, 'agenda.write', true)
  or security.has_permission(tenant_id, 'settings.write', true)
)
with check (
  security.has_permission(tenant_id, 'agenda.write', true)
  or security.has_permission(tenant_id, 'settings.write', true)
);

grant select, insert, update on public.call_panels to authenticated, service_role;

create or replace function public.mask_call_panel_patient_name(p_name text)
returns text
language plpgsql
immutable
set search_path = pg_temp
as $$
declare
  v_parts text[] := regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+');
  v_count integer;
begin
  v_count := coalesce(array_length(v_parts, 1), 0);
  if v_count = 0 or coalesce(v_parts[1], '') = '' then
    return 'Paciente';
  end if;

  if v_count = 1 then
    return v_parts[1];
  end if;

  return v_parts[1] || ' ' || upper(left(v_parts[v_count], 1)) || '.';
end;
$$;

create or replace function public.list_call_panels()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
begin
  if not (
    security.has_permission(v_tenant_id, 'agenda.read', false)
    or security.has_permission(v_tenant_id, 'settings.read', false)
  ) then
    raise exception 'agenda_read_required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', cp.id,
      'name', cp.name,
      'unitId', cp.unit_id,
      'unitName', tu.name,
      'status', cp.status,
      'publicToken', cp.public_token,
      'settings', cp.settings,
      'updatedAt', cp.updated_at
    ) order by cp.name)
    from public.call_panels cp
    left join public.tenant_units tu
      on tu.tenant_id = cp.tenant_id and tu.id = cp.unit_id
    where cp.tenant_id = v_tenant_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.upsert_call_panel(
  p_panel_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_panel public.call_panels%rowtype;
  v_existing public.call_panels%rowtype;
  v_name text := nullif(btrim(p_payload ->> 'name'), '');
  v_unit_id uuid := nullif(p_payload ->> 'unitId', '')::uuid;
  v_status text := coalesce(nullif(lower(btrim(p_payload ->> 'status')), ''), 'active');
  v_settings jsonb := case when jsonb_typeof(p_payload -> 'settings') = 'object' then p_payload -> 'settings' else '{}'::jsonb end;
begin
  if not (
    security.has_permission(v_tenant_id, 'agenda.write', false)
    or security.has_permission(v_tenant_id, 'settings.write', false)
  ) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  if p_panel_id is not null then
    select * into v_existing from public.call_panels
    where tenant_id = v_tenant_id and id = p_panel_id for update;
    if not found then raise exception 'call_panel_not_found_or_forbidden' using errcode = '42501'; end if;
    v_name := coalesce(v_name, v_existing.name);
    v_unit_id := coalesce(v_unit_id, v_existing.unit_id);
    v_status := coalesce(nullif(lower(btrim(p_payload ->> 'status')), ''), v_existing.status);
    v_settings := case when jsonb_typeof(p_payload -> 'settings') = 'object' then p_payload -> 'settings' else v_existing.settings end;
  end if;

  if v_name is null then raise exception 'call_panel_name_required' using errcode = '22023'; end if;
  if v_status not in ('active', 'inactive') then raise exception 'call_panel_status_not_allowed' using errcode = '22023'; end if;
  if v_unit_id is not null and not exists (select 1 from public.tenant_units where tenant_id = v_tenant_id and id = v_unit_id) then
    raise exception 'unit_not_found_or_forbidden' using errcode = '42501';
  end if;

  if p_panel_id is null then
    insert into public.call_panels (tenant_id, unit_id, name, public_token, status, settings, created_by)
    values (v_tenant_id, v_unit_id, v_name, replace(gen_random_uuid()::text, '-', ''), v_status, v_settings, v_user_id)
    returning * into v_panel;
  else
    update public.call_panels set unit_id = v_unit_id, name = v_name, status = v_status, settings = v_settings
    where tenant_id = v_tenant_id and id = p_panel_id returning * into v_panel;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, v_user_id, 'agenda.call_panel_upserted', 'call_panel', v_panel.id::text,
    jsonb_build_object('unitId', v_panel.unit_id, 'status', v_panel.status));

  return jsonb_build_object('id', v_panel.id, 'name', v_panel.name, 'unitId', v_panel.unit_id,
    'status', v_panel.status, 'publicToken', v_panel.public_token, 'settings', v_panel.settings,
    'updatedAt', v_panel.updated_at);
end;
$$;

create or replace function public.rotate_call_panel_token(p_panel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_panel public.call_panels%rowtype;
begin
  if not (
    security.has_permission(v_tenant_id, 'agenda.write', false)
    or security.has_permission(v_tenant_id, 'settings.write', false)
  ) then raise exception 'agenda_write_required' using errcode = '42501'; end if;

  update public.call_panels
    set public_token = replace(gen_random_uuid()::text, '-', '')
    where tenant_id = v_tenant_id and id = p_panel_id
    returning * into v_panel;
  if not found then raise exception 'call_panel_not_found_or_forbidden' using errcode = '42501'; end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id)
  values (v_tenant_id, v_user_id, 'agenda.call_panel_token_rotated', 'call_panel', v_panel.id::text);

  return jsonb_build_object('id', v_panel.id, 'publicToken', v_panel.public_token, 'updatedAt', v_panel.updated_at);
end;
$$;

create or replace function public.get_call_panel_snapshot(p_public_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_panel public.call_panels%rowtype;
  v_recent_minutes integer;
  v_calls jsonb;
begin
  select * into v_panel from public.call_panels
  where public_token = nullif(btrim(p_public_token), '') and status = 'active';
  if not found then raise exception 'call_panel_not_found_or_inactive' using errcode = '42501'; end if;

  v_recent_minutes := greatest(1, least(30, coalesce((v_panel.settings ->> 'recentCallMinutes')::integer, 5)));
  select coalesce(jsonb_agg(jsonb_build_object(
    'displayName', public.mask_call_panel_patient_name(pp.full_name),
    'roomName', coalesce(qr.name, ar.name, q.room, a.location, 'Sala a confirmar'),
    'calledAt', q.called_at
  ) order by q.called_at desc), '[]'::jsonb)
  into v_calls
  from public.attendance_queue q
  join public.appointments a on a.tenant_id = q.tenant_id and a.id = q.appointment_id
  left join public.patient_pii pp on pp.tenant_id = q.tenant_id and pp.patient_id = q.patient_id
  left join public.clinic_rooms qr on qr.tenant_id = q.tenant_id and qr.id = q.room_id
  left join public.clinic_rooms ar on ar.tenant_id = a.tenant_id and ar.id = a.room_id
  where q.tenant_id = v_panel.tenant_id
    and q.called_at is not null
    and q.called_at >= now() - make_interval(mins => v_recent_minutes)
    and q.status in ('called', 'in_attendance', 'checkout')
    and (v_panel.unit_id is null or a.unit_id = v_panel.unit_id);

  return jsonb_build_object(
    'panelName', v_panel.name,
    'soundEnabled', coalesce((v_panel.settings ->> 'soundEnabled')::boolean, true),
    'currentCall', coalesce(v_calls -> 0, 'null'::jsonb),
    'recentCalls', v_calls,
    'refreshedAt', now()
  );
end;
$$;

revoke all on function public.mask_call_panel_patient_name(text) from public;
revoke all on function public.list_call_panels() from public;
revoke all on function public.upsert_call_panel(uuid, jsonb) from public;
revoke all on function public.rotate_call_panel_token(uuid) from public;
revoke all on function public.get_call_panel_snapshot(text) from public;
grant execute on function public.list_call_panels() to authenticated, service_role;
grant execute on function public.upsert_call_panel(uuid, jsonb) to authenticated, service_role;
grant execute on function public.rotate_call_panel_token(uuid) to authenticated, service_role;
grant execute on function public.get_call_panel_snapshot(text) to anon, authenticated, service_role;
