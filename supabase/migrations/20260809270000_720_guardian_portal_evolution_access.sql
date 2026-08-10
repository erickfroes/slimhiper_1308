-- Enforces the tenant portal policy for clinical evolution viewed by guardians.

alter function public.get_patient_portal_evolution_summary(uuid)
  rename to get_patient_portal_evolution_summary_base;

create function public.get_patient_portal_evolution_summary(p_patient_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_summary jsonb;
  v_patient_id uuid;
  v_tenant_id uuid;
  v_is_guardian boolean := false;
  v_evolution_allowed boolean := true;
begin
  v_summary := public.get_patient_portal_evolution_summary_base(p_patient_id);
  v_patient_id := (v_summary ->> 'selectedPatientId')::uuid;

  select gl.tenant_id into v_tenant_id
  from public.guardian_links gl
  where gl.guardian_user_id = auth.uid() and gl.patient_id = v_patient_id and gl.status = 'active'
    and not exists (
      select 1 from public.patient_accounts pa
      where pa.user_id = auth.uid() and pa.patient_id = v_patient_id and pa.status = 'active'
    )
  limit 1;
  v_is_guardian := v_tenant_id is not null;

  if v_is_guardian then
    select coalesce((settings -> 'portal' ->> 'guardianEvolutionAccess')::boolean, false)
      into v_evolution_allowed
    from public.tenants where id = v_tenant_id;
  end if;

  if not coalesce(v_evolution_allowed, false) then
    raise exception 'guardian_evolution_access_denied' using errcode = '42501';
  end if;
  return v_summary;
end;
$$;

revoke all on function public.get_patient_portal_evolution_summary(uuid) from public;
grant execute on function public.get_patient_portal_evolution_summary(uuid) to authenticated, service_role;
