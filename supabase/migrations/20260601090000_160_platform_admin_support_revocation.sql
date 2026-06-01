-- Phase 7 support/break-glass operational closure contracts.
-- Adds an audited break-glass revocation RPC; support closure already exists from migration 150.

create or replace function public.revoke_platform_break_glass(
  p_request_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.break_glass_requests%rowtype;
  v_request public.break_glass_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not security.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'break_glass_request_required' using errcode = '22023';
  end if;

  if v_reason is null or length(v_reason) < 12 then
    raise exception 'break_glass_revoke_reason_too_short' using errcode = '22023';
  end if;

  select *
    into v_existing
  from public.break_glass_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'break_glass_request_not_found' using errcode = 'P0002';
  end if;

  if v_existing.status <> 'approved' then
    raise exception 'break_glass_request_not_active' using errcode = '22023';
  end if;

  update public.break_glass_requests
     set status = 'expired',
         decided_at = now(),
         expires_at = least(coalesce(expires_at, now()), now()),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'revokedBy', v_user_id,
           'revokedAt', now(),
           'revokeReason', v_reason
         )
   where id = p_request_id
   returning *
   into v_request;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_request.tenant_id,
    v_user_id,
    'platform_break_glass.revoked',
    'break_glass_request',
    v_request.id::text,
    jsonb_build_object('scope', v_request.scope, 'reason', v_reason)
  );

  return jsonb_build_object('id', v_request.id, 'status', v_request.status);
end;
$$;

revoke all on function public.revoke_platform_break_glass(uuid, text) from public;
grant execute on function public.revoke_platform_break_glass(uuid, text) to authenticated, service_role;

comment on function public.revoke_platform_break_glass(uuid, text) is 'Revokes an approved break-glass request with mandatory reason and audit log.';
