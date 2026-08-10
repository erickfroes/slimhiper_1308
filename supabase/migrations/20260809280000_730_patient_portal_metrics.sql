-- Tenant-scoped operational metrics for the patient portal dashboard.

create or replace function public.get_clinic_patient_portal_metrics(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_since timestamptz;
begin
  select active_tenant_id into v_tenant_id from public.profiles where id = auth.uid() and is_active = true;
  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'reports.read', false) then
    raise exception 'reports_read_required' using errcode = '42501';
  end if;
  v_since := now() - make_interval(days => v_days);

  return jsonb_build_object(
    'periodDays', v_days,
    'portalAccounts', (
      select count(*) from (
        select user_id from public.patient_accounts where tenant_id=v_tenant_id and status='active'
        union
        select guardian_user_id from public.guardian_links where tenant_id=v_tenant_id and status='active'
      ) accounts
    ),
    'selfScheduledAppointments', (
      select count(*) from public.appointments
      where tenant_id=v_tenant_id and created_at>=v_since and metadata ->> 'bookingSource'='self_scheduling'
    ),
    'completedSelfScheduledAppointments', (
      select count(*) from public.appointments
      where tenant_id=v_tenant_id and created_at>=v_since and metadata ->> 'bookingSource'='self_scheduling' and status='concluido'
    ),
    'avulsoInvoiceAmountCents', (
      select coalesce(sum(amount_cents),0) from public.patient_invoices
      where tenant_id=v_tenant_id and created_at>=v_since and metadata ->> 'source'='patient_portal'
    ),
    'paidPortalInvoiceAmountCents', (
      select coalesce(sum(amount_cents),0) from public.patient_invoices
      where tenant_id=v_tenant_id and created_at>=v_since and metadata ->> 'source'='patient_portal' and status='paid'
    ),
    'lowAdherencePatients', jsonb_array_length(public.get_clinic_daily_adherence_snapshot(current_date, 100))
  );
end;
$$;

revoke all on function public.get_clinic_patient_portal_metrics(integer) from public;
grant execute on function public.get_clinic_patient_portal_metrics(integer) to authenticated, service_role;
