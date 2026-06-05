-- Fix SQL allowlist semantics for platform membership role updates.
-- `value <> any(array)` rejects valid values because it is true when the value
-- differs from at least one array element. The intended check is `<> all(...)`.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'update_platform_tenant_membership'
    and pg_get_function_identity_arguments(p.oid) =
      'p_tenant_id uuid, p_membership_id uuid, p_role_code text, p_status text, p_unit_id uuid, p_reason text';

  if v_definition is null then
    raise exception 'update_platform_tenant_membership_not_found' using errcode = 'P0002';
  end if;

  v_definition := replace(
    v_definition,
    'if v_role_code <> any(v_allowed_roles) then',
    'if v_role_code <> all(v_allowed_roles) then'
  );

  execute v_definition;
end;
$$;
