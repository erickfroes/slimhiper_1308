-- Patient cancellation keeps credit policy under tenant control.
create or replace function public.cancel_patient_portal_appointment(p_appointment_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare v_tenant_id uuid; v_patient_id uuid; v_appointment public.appointments%rowtype; v_portal jsonb; begin
  select tenant_id, patient_id into v_tenant_id, v_patient_id from security.resolve_patient_portal_link(null);
  if v_tenant_id is null then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_appointment from public.appointments where tenant_id=v_tenant_id and id=p_appointment_id and patient_id=v_patient_id for update;
  if not found or v_appointment.status not in ('agendado','confirmado') or v_appointment.scheduled_at<=now() then raise exception 'appointment_cannot_be_cancelled' using errcode='22023'; end if;
  select coalesce(settings->'portal','{}'::jsonb) into v_portal from public.tenants where id=v_tenant_id;
  if coalesce((v_portal->>'releaseProgramCreditOnPatientCancellation')::boolean,true) is not true and v_appointment.commercial_enrollment_id is not null then raise exception 'patient_cancellation_credit_policy_denied' using errcode='42501'; end if;
  update public.appointments set status='cancelado', notes=left(coalesce(p_reason,'Cancelado pelo paciente'),240), updated_at=now() where tenant_id=v_tenant_id and id=p_appointment_id;
  insert into public.audit_logs(tenant_id,user_id,action,entity_type,entity_id,metadata) values(v_tenant_id,auth.uid(),'patient_portal.appointment_cancelled','appointment',p_appointment_id::text,jsonb_build_object('patientId',v_patient_id));
  return jsonb_build_object('id',p_appointment_id,'status','cancelado');
end; $$;
revoke all on function public.cancel_patient_portal_appointment(uuid,text) from public;
grant execute on function public.cancel_patient_portal_appointment(uuid,text) to authenticated,service_role;
