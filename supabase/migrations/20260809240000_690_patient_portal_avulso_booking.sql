-- Patient portal self-scheduling for services not covered by a program.
-- Billing stays local: an auditable patient invoice is created without calling
-- an external payment provider.

create or replace function public.get_patient_portal_avulso_booking_options(p_patient_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_portal jsonb;
begin
  select tenant_id, patient_id into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id);
  if v_tenant_id is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select coalesce(settings -> 'portal', '{}'::jsonb) into v_portal
  from public.tenants where id = v_tenant_id;
  if coalesce((v_portal ->> 'allowAvulsoScheduling')::boolean, false) is not true then
    raise exception 'portal_avulso_scheduling_disabled' using errcode = '42501';
  end if;

  if coalesce((v_portal ->> 'blockSchedulingWithFinancialPending')::boolean, false)
     and exists (
       select 1 from public.patient_invoices i
       where i.tenant_id = v_tenant_id and i.patient_id = v_patient_id
         and i.status in ('pending', 'overdue')
     ) then
    raise exception 'patient_financial_pending_blocks_scheduling' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'patientId', v_patient_id,
    'paymentRequiredBeforeConfirmation', coalesce((v_portal ->> 'requireAvulsoPaymentBeforeConfirmation')::boolean, false),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'serviceId', s.id, 'name', s.name, 'durationMinutes', coalesce(s.duration_minutes, 30),
        'priceCents', s.base_price_cents, 'deliveryMode', s.delivery_mode
      ) order by s.name)
      from public.services s
      where s.tenant_id = v_tenant_id and s.status = 'ativo' and s.base_price_cents > 0
    ), '[]'::jsonb),
    'allocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'startsAt', a.starts_at, 'endsAt', a.ends_at,
        'professionalId', a.professional_profile_id, 'professionalName', coalesce(pr.full_name, 'Profissional'),
        'roomId', a.room_id, 'roomName', r.name
      ) order by a.starts_at)
      from public.professional_day_allocations a
      join public.tenant_professionals tp on tp.tenant_id = a.tenant_id and tp.id = a.professional_profile_id
      join public.profiles pr on pr.id = tp.user_id
      join public.clinic_rooms r on r.tenant_id = a.tenant_id and r.id = a.room_id
      where a.tenant_id = v_tenant_id and a.status in ('available', 'scheduled')
        and a.starts_at >= now() and a.starts_at < now() + interval '30 days'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.book_patient_portal_avulso_appointment(
  p_patient_id uuid,
  p_service_id uuid,
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
  v_portal jsonb;
  v_service public.services%rowtype;
  v_allocation public.professional_day_allocations%rowtype;
  v_appointment_id uuid;
  v_invoice_id uuid;
  v_end timestamptz;
begin
  select tenant_id, patient_id into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id);
  if v_tenant_id is null or v_patient_id <> p_patient_id then raise exception 'forbidden' using errcode = '42501'; end if;

  select coalesce(settings -> 'portal', '{}'::jsonb) into v_portal
  from public.tenants where id = v_tenant_id;
  if coalesce((v_portal ->> 'allowAvulsoScheduling')::boolean, false) is not true then
    raise exception 'portal_avulso_scheduling_disabled' using errcode = '42501';
  end if;
  if coalesce((v_portal ->> 'requireAvulsoPaymentBeforeConfirmation')::boolean, false) then
    raise exception 'patient_portal_avulso_payment_required' using errcode = '42501';
  end if;
  if coalesce((v_portal ->> 'blockSchedulingWithFinancialPending')::boolean, false)
     and exists (select 1 from public.patient_invoices i where i.tenant_id=v_tenant_id and i.patient_id=v_patient_id and i.status in ('pending','overdue')) then
    raise exception 'patient_financial_pending_blocks_scheduling' using errcode = '42501';
  end if;

  select * into v_service from public.services
  where tenant_id = v_tenant_id and id = p_service_id and status = 'ativo' and base_price_cents > 0;
  if not found then raise exception 'service_not_available' using errcode = '22023'; end if;

  select * into v_allocation from public.professional_day_allocations
  where tenant_id = v_tenant_id and id = p_allocation_id and status in ('available', 'scheduled') for update;
  v_end := p_scheduled_at + (coalesce(v_service.duration_minutes, 30) * interval '1 minute');
  if not found or p_scheduled_at < now() or p_scheduled_at < v_allocation.starts_at or v_end > v_allocation.ends_at then
    raise exception 'slot_not_available' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.appointments a
    where a.tenant_id = v_tenant_id and a.status not in ('cancelado', 'falta')
      and a.scheduled_at < v_end and a.scheduled_at + (coalesce(a.duration_minutes, 30) * interval '1 minute') > p_scheduled_at
      and (a.room_id = v_allocation.room_id or a.professional_profile_id = v_allocation.professional_profile_id or a.patient_id = v_patient_id)
  ) then raise exception 'appointment_conflict' using errcode = '23505'; end if;

  insert into public.appointments (
    tenant_id, patient_id, type, status, scheduled_at, duration_minutes,
    professional_profile_id, room_id, unit_id, practitioner_id, location,
    commercial_service_id, financial_status, financial_amount_cents, financial_due_date, metadata
  )
  select v_tenant_id, v_patient_id, 'consulta_medica', 'agendado', p_scheduled_at,
    coalesce(v_service.duration_minutes, 30), v_allocation.professional_profile_id, v_allocation.room_id,
    v_allocation.unit_id, tp.user_id, r.name, p_service_id,
    'pending_local_invoice', v_service.base_price_cents, current_date,
    jsonb_build_object('sourceModule', 'patient_portal', 'bookingSource', 'self_scheduling', 'commercialMode', 'avulso')
  from public.tenant_professionals tp
  join public.clinic_rooms r on r.tenant_id=tp.tenant_id and r.id=v_allocation.room_id
  where tp.tenant_id=v_tenant_id and tp.id=v_allocation.professional_profile_id
  returning id into v_appointment_id;

  insert into public.patient_invoices (tenant_id, patient_id, status, amount_cents, due_date, description, metadata)
  values (v_tenant_id, v_patient_id, 'pending', v_service.base_price_cents, current_date,
    'Agendamento avulso - ' || v_service.name,
    jsonb_build_object('source', 'patient_portal', 'provider', 'local', 'appointmentId', v_appointment_id, 'serviceId', p_service_id))
  returning id into v_invoice_id;

  update public.appointments set financial_invoice_id=v_invoice_id, updated_at=now()
  where tenant_id=v_tenant_id and id=v_appointment_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'patient_portal.avulso_appointment_booked', 'appointment', v_appointment_id::text,
    jsonb_build_object('patientId', v_patient_id, 'serviceId', p_service_id, 'invoiceId', v_invoice_id, 'amountCents', v_service.base_price_cents));

  return jsonb_build_object('id', v_appointment_id, 'status', 'agendado', 'invoiceId', v_invoice_id, 'amountCents', v_service.base_price_cents);
end;
$$;

revoke all on function public.get_patient_portal_avulso_booking_options(uuid) from public;
revoke all on function public.book_patient_portal_avulso_appointment(uuid, uuid, uuid, timestamptz) from public;
grant execute on function public.get_patient_portal_avulso_booking_options(uuid) to authenticated, service_role;
grant execute on function public.book_patient_portal_avulso_appointment(uuid, uuid, uuid, timestamptz) to authenticated, service_role;

comment on function public.book_patient_portal_avulso_appointment(uuid, uuid, uuid, timestamptz) is
  'Patient-scoped avulso appointment with local pending invoice; never calls payment providers.';
