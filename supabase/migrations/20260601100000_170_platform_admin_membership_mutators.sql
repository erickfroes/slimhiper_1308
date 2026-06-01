-- Phase 7 platform admin membership mutators.
-- Allows platform admins to update an existing tenant membership role/status/unit through
-- a sanitized, audited RPC instead of direct table writes from the browser.

create or replace function public.update_platform_tenant_membership(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_role_code text default null,
  p_status text default null,
  p_unit_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.tenant_memberships%rowtype;
  v_updated public.tenant_memberships%rowtype;
  v_role_code text := nullif(btrim(coalesce(p_role_code, '')), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_allowed_roles text[] := array[
    'tenant_owner',
    'clinic_admin',
    'receptionist',
    'physician',
    'nutritionist',
    'fitness_professional',
    'financial_user',
    'external_professional'
  ];
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not security.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_tenant_id is null then
    raise exception 'tenant_required' using errcode = '22023';
  end if;

  if p_membership_id is null then
    raise exception 'membership_required' using errcode = '22023';
  end if;

  if v_reason is null or length(v_reason) < 16 then
    raise exception 'membership_update_reason_too_short' using errcode = '22023';
  end if;

  select *
    into v_existing
  from public.tenant_memberships
  where tenant_id = p_tenant_id
    and id = p_membership_id
  for update;

  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  if v_role_code is not null then
    if v_role_code <> any(v_allowed_roles) then
      raise exception 'membership_role_not_allowed' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.roles r
      where r.tenant_id = p_tenant_id
        and r.name = v_role_code
    ) then
      raise exception 'membership_role_not_configured' using errcode = '22023';
    end if;
  end if;

  if v_status is not null and v_status not in ('active', 'invited', 'suspended', 'revoked') then
    raise exception 'membership_status_not_allowed' using errcode = '22023';
  end if;

  if p_unit_id is not null and not exists (
    select 1
    from public.tenant_units tu
    where tu.tenant_id = p_tenant_id
      and tu.id = p_unit_id
  ) then
    raise exception 'membership_unit_not_found' using errcode = 'P0002';
  end if;

  update public.tenant_memberships
     set role_code = coalesce(v_role_code, role_code),
         status = coalesce(v_status, status),
         unit_id = p_unit_id,
         updated_at = now()
   where tenant_id = p_tenant_id
     and id = p_membership_id
   returning *
   into v_updated;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    v_user_id,
    'platform_tenant_membership.updated',
    'tenant_membership',
    v_updated.id::text,
    jsonb_build_object(
      'reason', v_reason,
      'targetUserId', v_updated.user_id,
      'previous', jsonb_build_object(
        'roleCode', v_existing.role_code,
        'status', v_existing.status,
        'unitId', v_existing.unit_id
      ),
      'current', jsonb_build_object(
        'roleCode', v_updated.role_code,
        'status', v_updated.status,
        'unitId', v_updated.unit_id
      )
    )
  );

  return jsonb_build_object(
    'id', v_updated.id,
    'tenantId', v_updated.tenant_id,
    'userId', v_updated.user_id,
    'role', v_updated.role_code,
    'status', v_updated.status,
    'unitId', v_updated.unit_id,
    'updatedAt', v_updated.updated_at
  );
end;
$$;

revoke all on function public.update_platform_tenant_membership(uuid, uuid, text, text, uuid, text) from public;
grant execute on function public.update_platform_tenant_membership(uuid, uuid, text, text, uuid, text) to authenticated, service_role;

comment on function public.update_platform_tenant_membership(uuid, uuid, text, text, uuid, text) is 'Updates an existing tenant membership role/status/unit for platform admins with mandatory reason and audit log.';
