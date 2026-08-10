-- Enforces the tenant portal policy for financial data viewed by guardians.
-- Patient accounts retain their own financial access.

alter function public.get_patient_portal_snapshot(uuid)
  rename to get_patient_portal_snapshot_base;

create function public.get_patient_portal_snapshot(p_patient_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_patient_id uuid;
  v_tenant_id uuid;
  v_linkage text;
  v_finance_allowed boolean := true;
begin
  v_snapshot := public.get_patient_portal_snapshot_base(p_patient_id);
  v_patient_id := (v_snapshot ->> 'selectedPatientId')::uuid;
  select item ->> 'tenantId', item ->> 'linkageType'
    into v_tenant_id, v_linkage
  from jsonb_array_elements(coalesce(v_snapshot -> 'patients', '[]'::jsonb)) item
  where (item ->> 'patientId')::uuid = v_patient_id
  limit 1;

  if v_linkage = 'guardian' then
    select coalesce((settings -> 'portal' ->> 'guardianFinancialAccess')::boolean, false)
      into v_finance_allowed
    from public.tenants where id = v_tenant_id;
  end if;

  if not coalesce(v_finance_allowed, false) then
    v_snapshot := jsonb_set(v_snapshot, '{invoices}', '[]'::jsonb, true);
    v_snapshot := jsonb_set(
      v_snapshot,
      '{access,capabilities,financeiro}',
      jsonb_build_object('enabled', false, 'reason', 'A clínica não autorizou acesso financeiro para responsáveis.'),
      true
    );
  end if;
  return v_snapshot;
end;
$$;

revoke all on function public.get_patient_portal_snapshot(uuid) from public;
grant execute on function public.get_patient_portal_snapshot(uuid) to authenticated, service_role;

comment on function public.get_patient_portal_snapshot(uuid) is
  'Patient portal snapshot with tenant-enforced guardian financial visibility.';
