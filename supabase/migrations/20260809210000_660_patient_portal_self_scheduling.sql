-- Patient self-scheduling is isolated from staff agenda permissions.

create or replace function public.get_patient_portal_booking_options(p_patient_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare v_tenant_id uuid; v_patient_id uuid; v_portal jsonb; begin
  select tenant_id, patient_id into v_tenant_id, v_patient_id from security.resolve_patient_portal_link(p_patient_id);
  if v_tenant_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(settings->'portal','{}'::jsonb) into v_portal from public.tenants where id=v_tenant_id;
  if coalesce((v_portal->>'selfScheduling')::boolean,false) is not true then raise exception 'portal_self_scheduling_disabled' using errcode='42501'; end if;
  return jsonb_build_object(
    'patientId',v_patient_id,
    'allowProfessionalChoice',coalesce((v_portal->>'allowPatientProfessionalChoice')::boolean,false),
    'services',coalesce((select jsonb_agg(jsonb_build_object('serviceId',ps.service_id,'enrollmentId',e.id,'programId',e.program_id,'name',s.name,'durationMinutes',coalesce(s.duration_minutes,30),'available',greatest(ps.quantity-coalesce(u.used,0),0)) order by s.name)
      from public.patient_program_enrollments e join public.program_services ps on ps.tenant_id=e.tenant_id and ps.program_id=e.program_id join public.services s on s.tenant_id=ps.tenant_id and s.id=ps.service_id
      left join lateral (select sum(quantity) filter(where status in ('reserved','consumed','forfeited')) used from public.program_service_credits c where c.tenant_id=e.tenant_id and c.enrollment_id=e.id and c.program_service_id=ps.id) u on true
      where e.tenant_id=v_tenant_id and e.patient_id=v_patient_id and e.status='ativo' and s.status='ativo' and s.base_price_cents>0 and greatest(ps.quantity-coalesce(u.used,0),0)>0),'[]'::jsonb),
    'allocations',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'startsAt',a.starts_at,'endsAt',a.ends_at,'professionalId',a.professional_profile_id,'professionalName',coalesce(pr.full_name,'Profissional'),'roomId',a.room_id,'roomName',r.name) order by a.starts_at)
      from public.professional_day_allocations a join public.tenant_professionals tp on tp.tenant_id=a.tenant_id and tp.id=a.professional_profile_id join public.profiles pr on pr.id=tp.user_id join public.clinic_rooms r on r.tenant_id=a.tenant_id and r.id=a.room_id
      where a.tenant_id=v_tenant_id and a.status in ('available','scheduled') and a.starts_at>=now() and a.starts_at<now()+interval '30 days'),'[]'::jsonb)
  );
end; $$;

create or replace function public.book_patient_portal_appointment(p_patient_id uuid, p_service_id uuid, p_enrollment_id uuid, p_allocation_id uuid, p_scheduled_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare v_tenant_id uuid; v_patient_id uuid; v_portal jsonb; v_service public.services%rowtype; v_enrollment public.patient_program_enrollments%rowtype; v_allocation public.professional_day_allocations%rowtype; v_appointment_id uuid; v_end timestamptz; begin
  select tenant_id, patient_id into v_tenant_id, v_patient_id from security.resolve_patient_portal_link(p_patient_id);
  if v_tenant_id is null or v_patient_id<>p_patient_id then raise exception 'forbidden' using errcode='42501'; end if;
  select coalesce(settings->'portal','{}'::jsonb) into v_portal from public.tenants where id=v_tenant_id;
  if coalesce((v_portal->>'selfScheduling')::boolean,false) is not true then raise exception 'portal_self_scheduling_disabled' using errcode='42501'; end if;
  select * into v_service from public.services where tenant_id=v_tenant_id and id=p_service_id and status='ativo' and base_price_cents>0;
  if not found then raise exception 'service_not_available' using errcode='22023'; end if;
  select * into v_enrollment from public.patient_program_enrollments where tenant_id=v_tenant_id and id=p_enrollment_id and patient_id=v_patient_id and status='ativo';
  if not found or not exists(select 1 from public.program_services where tenant_id=v_tenant_id and program_id=v_enrollment.program_id and service_id=p_service_id) then raise exception 'program_service_not_available' using errcode='22023'; end if;
  select * into v_allocation from public.professional_day_allocations where tenant_id=v_tenant_id and id=p_allocation_id and status in ('available','scheduled') for update;
  v_end:=p_scheduled_at+(coalesce(v_service.duration_minutes,30)*interval '1 minute');
  if not found or p_scheduled_at<now() or p_scheduled_at<v_allocation.starts_at or v_end>v_allocation.ends_at then raise exception 'slot_not_available' using errcode='23514'; end if;
  if exists(select 1 from public.appointments a where a.tenant_id=v_tenant_id and a.status not in ('cancelado','falta') and a.scheduled_at<v_end and a.scheduled_at+(coalesce(a.duration_minutes,30)*interval '1 minute')>p_scheduled_at and (a.room_id=v_allocation.room_id or a.professional_profile_id=v_allocation.professional_profile_id)) then raise exception 'appointment_conflict' using errcode='23505'; end if;
  insert into public.appointments(tenant_id,patient_id,type,status,scheduled_at,duration_minutes,professional_profile_id,room_id,unit_id,practitioner_id,location,commercial_program_id,commercial_service_id,commercial_enrollment_id,financial_status,metadata)
  select v_tenant_id,v_patient_id,'consulta_medica','agendado',p_scheduled_at,coalesce(v_service.duration_minutes,30),v_allocation.professional_profile_id,v_allocation.room_id,v_allocation.unit_id,tp.user_id,r.name,v_enrollment.program_id,p_service_id,p_enrollment_id,'not_required',jsonb_build_object('sourceModule','patient_portal','bookingSource','self_scheduling')
  from public.tenant_professionals tp join public.clinic_rooms r on r.tenant_id=tp.tenant_id and r.id=v_allocation.room_id where tp.tenant_id=v_tenant_id and tp.id=v_allocation.professional_profile_id returning id into v_appointment_id;
  insert into public.audit_logs(tenant_id,user_id,action,entity_type,entity_id,metadata) values(v_tenant_id,auth.uid(),'patient_portal.appointment_booked','appointment',v_appointment_id::text,jsonb_build_object('patientId',v_patient_id,'serviceId',p_service_id,'allocationId',p_allocation_id));
  return jsonb_build_object('id',v_appointment_id,'status','agendado');
end; $$;

revoke all on function public.get_patient_portal_booking_options(uuid) from public;
revoke all on function public.book_patient_portal_appointment(uuid,uuid,uuid,uuid,timestamptz) from public;
grant execute on function public.get_patient_portal_booking_options(uuid) to authenticated,service_role;
grant execute on function public.book_patient_portal_appointment(uuid,uuid,uuid,uuid,timestamptz) to authenticated,service_role;
