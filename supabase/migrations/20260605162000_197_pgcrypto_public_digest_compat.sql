-- Compatibility shim for environments where pgcrypto lives in the `extensions`
-- schema while older report functions call `digest(text, text)` unqualified.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'digest'
      and pg_get_function_identity_arguments(p.oid) = 'data text, type text'
  ) then
    create function public.digest(data text, type text)
    returns bytea
    language sql
    immutable
    strict
    parallel safe
    set search_path = extensions, pg_temp
    as $function$
      select extensions.digest(data, type);
    $function$;

    revoke all on function public.digest(text, text) from public;
    grant execute on function public.digest(text, text) to authenticated, service_role;
  end if;
end;
$$;

alter function public.create_clinic_report_run(text, jsonb, text, uuid)
  set search_path = public, security, extensions, pg_temp;
