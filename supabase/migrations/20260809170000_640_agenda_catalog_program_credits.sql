-- Makes the service catalog the source of truth for new agenda appointments.
-- Program credits are reserved on scheduling and consumed only when attendance ends.

alter table public.program_services
  add column if not exists service_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'program_services_service_same_tenant'
      and conrelid = 'public.program_services'::regclass
  ) then
    alter table public.program_services
      add constraint program_services_service_same_tenant
      foreign key (tenant_id, service_id)
      references public.services(tenant_id, id)
      on delete restrict;
  end if;
end;
$$;

alter table public.appointments
  add column if not exists service_snapshot jsonb not null default '{}'::jsonb;

create table if not exists public.program_service_credits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  enrollment_id uuid not null,
  program_service_id uuid not null,
  service_id uuid not null,
  appointment_id uuid not null,
  patient_id uuid not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'consumed', 'released', 'forfeited')),
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  reserved_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, appointment_id),
  constraint program_service_credits_enrollment_same_tenant
    foreign key (tenant_id, enrollment_id)
    references public.patient_program_enrollments(tenant_id, id) on delete cascade,
  constraint program_service_credits_program_service_same_tenant
    foreign key (tenant_id, program_service_id)
    references public.program_services(tenant_id, id) on delete restrict,
  constraint program_service_credits_service_same_tenant
    foreign key (tenant_id, service_id)
    references public.services(tenant_id, id) on delete restrict,
  constraint program_service_credits_appointment_same_tenant
    foreign key (tenant_id, appointment_id)
    references public.appointments(tenant_id, id) on delete cascade,
  constraint program_service_credits_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id) on delete cascade
);

create index if not exists idx_program_services_catalog_service
  on public.program_services(tenant_id, service_id);
create index if not exists idx_program_service_credits_enrollment
  on public.program_service_credits(tenant_id, enrollment_id, program_service_id, status);
create index if not exists idx_program_service_credits_patient
  on public.program_service_credits(tenant_id, patient_id, status, reserved_at desc);

select security.touch_updated_at('public.program_service_credits');

-- Existing program labels are linked when a catalog item with the same name exists.
update public.program_services ps
set service_id = s.id,
    updated_at = now()
from public.services s
where s.tenant_id = ps.tenant_id
  and ps.service_id is null
  and lower(btrim(s.name)) = lower(btrim(ps.label));

create or replace function public.link_program_service_to_catalog()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_service public.services%rowtype;
begin
  if new.service_id is not null then
    select * into v_service from public.services
    where tenant_id = new.tenant_id and id = new.service_id and status = 'ativo';
  else
    select * into v_service from public.services
    where tenant_id = new.tenant_id
      and lower(btrim(name)) = lower(btrim(new.label))
      and status = 'ativo';
  end if;

  if not found then
    raise exception 'program_service_must_be_registered_in_catalog' using errcode = '22023';
  end if;
  new.service_id := v_service.id;
  new.label := v_service.name;
  return new;
end;
$$;

drop trigger if exists link_program_service_to_catalog_before_write on public.program_services;
create trigger link_program_service_to_catalog_before_write
before insert or update of service_id, label on public.program_services
for each row execute function public.link_program_service_to_catalog();

create or replace function public.ensure_default_agenda_service(p_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_service_id uuid;
begin
  if p_tenant_id is null then
    raise exception 'tenant_required' using errcode = '22023';
  end if;

  select id into v_service_id
  from public.services
  where tenant_id = p_tenant_id
    and lower(name) = 'consulta padrão'
  limit 1;

  if v_service_id is null then
    insert into public.services (
      tenant_id, name, category, description, status, base_price_cents,
      duration_minutes, unit, delivery_mode, metadata
    ) values (
      p_tenant_id, 'Consulta padrão', 'clinico',
      'Atendimento clínico padrão agendável. Configure o preço antes de agendar.', 'ativo', 0,
      30, 'consulta', 'presencial',
      jsonb_build_object('systemDefault', true, 'requiresPriceConfiguration', true)
    )
    returning id into v_service_id;
  end if;

  return v_service_id;
end;
$$;

create or replace function public.ensure_default_agenda_service_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  perform public.ensure_default_agenda_service(new.id);
  return new;
end;
$$;

drop trigger if exists ensure_default_agenda_service_after_tenant_insert on public.tenants;
create trigger ensure_default_agenda_service_after_tenant_insert
after insert on public.tenants
for each row execute function public.ensure_default_agenda_service_for_tenant();

select public.ensure_default_agenda_service(id) from public.tenants;

create or replace function public.sync_program_service_credit_for_appointment()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_service public.services%rowtype;
  v_program_service public.program_services%rowtype;
  v_used numeric(10,2);
  v_snapshot jsonb;
begin
  -- A service is mandatory only for records created through the current agenda flow.
  if TG_OP = 'UPDATE'
     and new.metadata ->> 'sourceModule' = 'agenda'
     and new.commercial_service_id is null then
    raise exception 'agenda_service_required' using errcode = '22023';
  end if;

  if new.commercial_service_id is null then
    return new;
  end if;

  select * into v_service
  from public.services
  where tenant_id = new.tenant_id and id = new.commercial_service_id and status = 'ativo';

  if not found then
    raise exception 'agenda_service_not_active' using errcode = '22023';
  end if;
  if v_service.base_price_cents <= 0 then
    raise exception 'agenda_service_price_required' using errcode = '22023';
  end if;

  v_snapshot := jsonb_build_object(
    'id', v_service.id, 'name', v_service.name, 'basePriceCents', v_service.base_price_cents,
    'durationMinutes', v_service.duration_minutes, 'capturedAt', now()
  );

  if new.commercial_enrollment_id is not null then
    perform pg_advisory_xact_lock(hashtext(new.commercial_enrollment_id::text), hashtext(new.commercial_service_id::text));

    select ps.* into v_program_service
    from public.program_services ps
    where ps.tenant_id = new.tenant_id
      and ps.program_id = new.commercial_program_id
      and (ps.service_id = new.commercial_service_id
        or (ps.service_id is null and lower(btrim(ps.label)) = lower(btrim(v_service.name))))
    order by ps.created_at asc
    limit 1;

    if not found then
      raise exception 'service_not_in_program' using errcode = '23514';
    end if;

    update public.program_services
      set service_id = new.commercial_service_id, updated_at = now()
    where tenant_id = new.tenant_id and id = v_program_service.id and service_id is null;

    select coalesce(sum(quantity), 0) into v_used
    from public.program_service_credits
    where tenant_id = new.tenant_id
      and enrollment_id = new.commercial_enrollment_id
      and program_service_id = v_program_service.id
      and status in ('reserved', 'consumed', 'forfeited')
      and appointment_id <> new.id;

    if v_used + 1 > v_program_service.quantity then
      raise exception 'program_service_credit_unavailable' using errcode = '23514';
    end if;

    insert into public.program_service_credits (
      tenant_id, enrollment_id, program_service_id, service_id, appointment_id, patient_id,
      status, quantity, metadata
    ) values (
      new.tenant_id, new.commercial_enrollment_id, v_program_service.id, new.commercial_service_id,
      new.id, new.patient_id, case when new.status = 'concluido' then 'consumed' else 'reserved' end,
      1, jsonb_build_object('source', 'agenda', 'serviceSnapshot', v_snapshot)
    ) on conflict (tenant_id, appointment_id) do update
      set enrollment_id = excluded.enrollment_id,
          program_service_id = excluded.program_service_id,
          service_id = excluded.service_id,
          patient_id = excluded.patient_id,
          status = case
            when public.program_service_credits.status in ('consumed', 'released', 'forfeited')
              then public.program_service_credits.status
            else excluded.status
          end,
          metadata = excluded.metadata,
          updated_at = now();
  else
    update public.program_service_credits
       set status = 'released', resolved_at = now(), resolved_reason = 'commercial_context_removed', updated_at = now()
     where tenant_id = new.tenant_id and appointment_id = new.id and status = 'reserved';
  end if;

  new.service_snapshot := v_snapshot;
  return new;
end;
$$;

create or replace function public.resolve_program_service_credit_on_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  if new.status = old.status then return new; end if;
  if new.status = 'concluido' then
    update public.program_service_credits
       set status = 'consumed', resolved_at = now(), resolved_reason = 'attendance_completed', updated_at = now()
     where tenant_id = new.tenant_id and appointment_id = new.id and status = 'reserved';
  elsif new.status in ('cancelado', 'falta') then
    update public.program_service_credits
       set status = 'released', resolved_at = now(), resolved_reason = new.status, updated_at = now()
     where tenant_id = new.tenant_id and appointment_id = new.id and status = 'reserved';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_program_service_credit_for_appointment_before_write on public.appointments;
create trigger sync_program_service_credit_for_appointment_before_write
before insert or update of commercial_service_id, commercial_program_id, commercial_enrollment_id, patient_id, status, metadata
on public.appointments
for each row execute function public.sync_program_service_credit_for_appointment();

drop trigger if exists resolve_program_service_credit_after_status_change on public.appointments;
create trigger resolve_program_service_credit_after_status_change
after update of status on public.appointments
for each row execute function public.resolve_program_service_credit_on_appointment_status();

alter table public.program_service_credits enable row level security;
drop policy if exists program_service_credits_select_packages_read on public.program_service_credits;
create policy program_service_credits_select_packages_read on public.program_service_credits
  for select to authenticated using (public.has_permission(tenant_id, 'packages.read'));
drop policy if exists program_service_credits_write_agenda_write on public.program_service_credits;
create policy program_service_credits_write_agenda_write on public.program_service_credits
  for all to authenticated using (public.has_permission(tenant_id, 'agenda.write'))
  with check (public.has_permission(tenant_id, 'agenda.write'));

grant select, insert, update on public.program_service_credits to authenticated, service_role;
revoke all on function public.ensure_default_agenda_service(uuid) from public;
grant execute on function public.ensure_default_agenda_service(uuid) to authenticated, service_role;

comment on table public.program_service_credits is
  'Auditable reservation ledger: scheduled services reserve a program credit; completion consumes it and cancellation releases it.';
