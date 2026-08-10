-- Closes the self-scheduling operational loop: safe rescheduling, patient
-- notifications/timeline, and tenant-controlled no-show credit consumption.

create or replace function public.resolve_program_service_credit_on_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_portal jsonb := '{}'::jsonb;
begin
  if new.status = old.status then return new; end if;

  if new.status = 'concluido' then
    update public.program_service_credits
       set status = 'consumed', resolved_at = now(), resolved_reason = 'attendance_completed', updated_at = now()
     where tenant_id = new.tenant_id and appointment_id = new.id and status = 'reserved';
  elsif new.status = 'cancelado' then
    update public.program_service_credits
       set status = 'released', resolved_at = now(), resolved_reason = 'cancelado', updated_at = now()
     where tenant_id = new.tenant_id and appointment_id = new.id and status = 'reserved';
  elsif new.status = 'falta' then
    select coalesce(settings -> 'portal', '{}'::jsonb) into v_portal
    from public.tenants where id = new.tenant_id;

    update public.program_service_credits
       set status = case when coalesce((v_portal ->> 'consumeProgramCreditOnNoShow')::boolean, false)
                           then 'forfeited' else 'released' end,
           resolved_at = now(),
           resolved_reason = case when coalesce((v_portal ->> 'consumeProgramCreditOnNoShow')::boolean, false)
                                   then 'no_show_credit_consumed' else 'falta' end,
           updated_at = now()
     where tenant_id = new.tenant_id and appointment_id = new.id and status = 'reserved';
  end if;
  return new;
end;
$$;

create or replace function public.patient_portal_appointment_activity()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_service_name text;
  v_title text;
  v_body text;
  v_event_type text;
begin
  if coalesce(new.metadata ->> 'bookingSource', '') <> 'self_scheduling' then
    return new;
  end if;

  select name into v_service_name
  from public.services
  where tenant_id = new.tenant_id and id = new.commercial_service_id;
  v_service_name := coalesce(v_service_name, new.type, 'Atendimento');

  if TG_OP = 'INSERT' then
    v_title := 'Atendimento agendado';
    v_body := format('%s confirmado para %s.', v_service_name, to_char(new.scheduled_at, 'DD/MM/YYYY HH24:MI'));
    v_event_type := 'patient_portal_appointment_booked';
  elsif new.status = 'cancelado' and old.status <> 'cancelado' then
    v_title := 'Atendimento cancelado';
    v_body := format('%s de %s foi cancelado.', v_service_name, to_char(old.scheduled_at, 'DD/MM/YYYY HH24:MI'));
    v_event_type := 'patient_portal_appointment_cancelled';
  elsif new.scheduled_at <> old.scheduled_at then
    v_title := 'Atendimento reagendado';
    v_body := format('%s foi reagendado para %s.', v_service_name, to_char(new.scheduled_at, 'DD/MM/YYYY HH24:MI'));
    v_event_type := 'patient_portal_appointment_rescheduled';
  else
    return new;
  end if;

  insert into public.notifications (tenant_id, patient_id, title, body, category, status, metadata)
  values (new.tenant_id, new.patient_id, v_title, v_body, 'agenda', 'unread',
    jsonb_build_object('appointmentId', new.id, 'eventType', v_event_type));

  insert into public.patient_timeline_events (
    tenant_id, patient_id, event_type, category, status, title, description, event_at, payload
  ) values (
    new.tenant_id, new.patient_id, v_event_type, 'agenda', 'recorded', v_title, v_body, now(),
    jsonb_build_object('appointmentId', new.id, 'scheduledAt', new.scheduled_at)
  );
  return new;
end;
$$;

drop trigger if exists patient_portal_appointment_activity_after_write on public.appointments;
create trigger patient_portal_appointment_activity_after_write
after insert or update of status, scheduled_at on public.appointments
for each row execute function public.patient_portal_appointment_activity();

create or replace function public.reschedule_patient_portal_appointment(
  p_appointment_id uuid,
  p_allocation_id uuid,
  p_scheduled_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_appointment public.appointments%rowtype;
  v_new_appointment jsonb;
begin
  select tenant_id, patient_id into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(null);
  if v_tenant_id is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_appointment
  from public.appointments
  where tenant_id = v_tenant_id and id = p_appointment_id and patient_id = v_patient_id
  for update;

  if not found or v_appointment.status not in ('agendado', 'confirmado')
     or v_appointment.scheduled_at <= now() or v_appointment.commercial_service_id is null
     or v_appointment.commercial_enrollment_id is null then
    raise exception 'appointment_cannot_be_rescheduled' using errcode = '22023';
  end if;

  -- Cancelling first releases the old reservation. If the new booking fails,
  -- PostgreSQL rolls this update back with the whole function call.
  update public.appointments
  set status = 'cancelado', notes = left('Reagendado pelo paciente', 240), updated_at = now()
  where tenant_id = v_tenant_id and id = v_appointment.id;

  select public.book_patient_portal_appointment(
    v_patient_id,
    v_appointment.commercial_service_id,
    v_appointment.commercial_enrollment_id,
    p_allocation_id,
    p_scheduled_at
  ) into v_new_appointment;

  update public.appointments
  set metadata = metadata || jsonb_build_object('rescheduledFromAppointmentId', v_appointment.id)
  where tenant_id = v_tenant_id and id = (v_new_appointment ->> 'id')::uuid;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'patient_portal.appointment_rescheduled', 'appointment',
    (v_new_appointment ->> 'id'), jsonb_build_object('previousAppointmentId', v_appointment.id));

  return v_new_appointment || jsonb_build_object('previousAppointmentId', v_appointment.id);
end;
$$;

revoke all on function public.reschedule_patient_portal_appointment(uuid, uuid, timestamptz) from public;
grant execute on function public.reschedule_patient_portal_appointment(uuid, uuid, timestamptz) to authenticated, service_role;

comment on function public.reschedule_patient_portal_appointment(uuid, uuid, timestamptz) is
  'Atomically replaces a future patient self-scheduled program appointment while preserving its credit ledger.';
