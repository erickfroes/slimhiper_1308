-- Patient-safe operational snapshot: appointments and program-service credit balance.

create or replace function public.get_patient_portal_operational_snapshot(p_patient_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_appointments jsonb := '[]'::jsonb;
  v_credits jsonb := '[]'::jsonb;
  v_pending jsonb := '[]'::jsonb;
begin
  select tenant_id, patient_id into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id);
  if v_tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'scheduledAt', a.scheduled_at, 'durationMinutes', coalesce(a.duration_minutes, 30),
    'status', a.status, 'type', a.type, 'serviceName', coalesce(s.name, a.type),
    'professionalName', coalesce(pr.full_name, 'Equipe clínica'), 'roomName', coalesce(r.name, a.location),
    'financialStatus', a.financial_status, 'financialAmountCents', a.financial_amount_cents,
    'canCancel', a.status in ('agendado', 'confirmado') and a.scheduled_at > now()
  ) order by a.scheduled_at asc), '[]'::jsonb)
  into v_appointments
  from (
    select * from public.appointments
    where tenant_id = v_tenant_id and patient_id = v_patient_id
    order by scheduled_at asc
    limit 30
  ) a
  left join public.services s on s.tenant_id = a.tenant_id and s.id = a.commercial_service_id
  left join public.tenant_professionals tp on tp.tenant_id = a.tenant_id and tp.id = a.professional_profile_id
  left join public.profiles pr on pr.id = tp.user_id
  left join public.clinic_rooms r on r.tenant_id = a.tenant_id and r.id = a.room_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'enrollmentId', e.id, 'programName', p.name, 'serviceId', ps.service_id,
    'serviceName', coalesce(s.name, ps.label), 'total', ps.quantity,
    'reserved', coalesce(usage.reserved, 0), 'used', coalesce(usage.used, 0),
    'available', greatest(ps.quantity - coalesce(usage.reserved, 0) - coalesce(usage.used, 0), 0)
  ) order by p.name, coalesce(s.name, ps.label)), '[]'::jsonb)
  into v_credits
  from public.patient_program_enrollments e
  join public.programs p on p.tenant_id = e.tenant_id and p.id = e.program_id
  join public.program_services ps on ps.tenant_id = e.tenant_id and ps.program_id = e.program_id
  left join public.services s on s.tenant_id = ps.tenant_id and s.id = ps.service_id
  left join lateral (
    select
      coalesce(sum(quantity) filter (where status = 'reserved'), 0) as reserved,
      coalesce(sum(quantity) filter (where status in ('consumed', 'forfeited')), 0) as used
    from public.program_service_credits c
    where c.tenant_id = e.tenant_id and c.enrollment_id = e.id and c.program_service_id = ps.id
  ) usage on true
  where e.tenant_id = v_tenant_id and e.patient_id = v_patient_id and e.status = 'ativo';

  select coalesce(jsonb_agg(item order by item ->> 'dueAt'), '[]'::jsonb) into v_pending
  from (
    select jsonb_build_object('kind', 'checkin', 'title', pc.title, 'dueAt', pc.due_date, 'href', '/patient?tab=checkins') item
    from public.patient_program_checkins pc
    where pc.tenant_id = v_tenant_id and pc.patient_id = v_patient_id and pc.status in ('scheduled', 'overdue')
    union all
    select jsonb_build_object('kind', 'financial', 'title', coalesce(pi.description, 'Cobrança pendente'), 'dueAt', pi.due_date, 'href', '/patient?tab=financeiro') item
    from public.patient_invoices pi
    where pi.tenant_id = v_tenant_id and pi.patient_id = v_patient_id and pi.status in ('pending', 'overdue')
    union all
    select jsonb_build_object('kind', 'document', 'title', gd.name, 'dueAt', gd.generated_at, 'href', '/patient?tab=documentos') item
    from public.generated_documents gd
    where gd.tenant_id = v_tenant_id and gd.patient_id = v_patient_id and gd.released_to_patient = true and gd.status in ('pending', 'awaiting_signature')
    limit 12
  ) pending_rows;

  return jsonb_build_object('patientId', v_patient_id, 'appointments', v_appointments, 'credits', v_credits, 'pending', v_pending);
end;
$$;

revoke all on function public.get_patient_portal_operational_snapshot(uuid) from public;
grant execute on function public.get_patient_portal_operational_snapshot(uuid) to authenticated, service_role;
comment on function public.get_patient_portal_operational_snapshot(uuid) is
  'Patient/guardian scoped operational portal snapshot for appointments, program-service balances and actionable pending items.';
