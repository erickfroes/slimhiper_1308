-- SlimHiper clean foundation: extensions, private security schema, and shared helpers.
-- Target: empty Supabase project.

create extension if not exists pgcrypto;

create schema if not exists security;
revoke all on schema security from public;
grant usage on schema security to postgres, service_role, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function security.touch_updated_at(p_table regclass)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  short_name text;
begin
  short_name := split_part(p_table::text, '.', 2);
  execute format('drop trigger if exists %I on %s;', 'trg_' || short_name || '_set_updated_at', p_table);
  execute format(
    'create trigger %I before update on %s for each row execute function public.set_updated_at();',
    'trg_' || short_name || '_set_updated_at',
    p_table
  );
end;
$$;

create or replace function security.storage_bucket_is_clinical(p_bucket text)
returns boolean
language sql
immutable
as $$
  select p_bucket in (
    'patient-documents',
    'signed-documents',
    'clinical-attachments',
    'evidence-packages'
  );
$$;

create or replace function security.is_valid_uuid_text(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$$;

create or replace function security.storage_object_tenant_id(p_object_name text)
returns uuid
language sql
stable
as $$
  select
    case
      when p_object_name is null then null
      when security.is_valid_uuid_text(split_part(p_object_name, '/', 1))
        then split_part(p_object_name, '/', 1)::uuid
      else null
    end;
$$;

create or replace function security.is_valid_clinical_storage_path(p_object_name text)
returns boolean
language sql
stable
as $$
  select
    p_object_name is not null
    and array_length(string_to_array(p_object_name, '/'), 1) = 4
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 1))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 2))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 3))
    and nullif(split_part(p_object_name, '/', 4), '') is not null;
$$;

revoke all on function security.touch_updated_at(regclass) from public;
revoke all on function security.storage_bucket_is_clinical(text) from public;
revoke all on function security.is_valid_uuid_text(text) from public;
revoke all on function security.storage_object_tenant_id(text) from public;
revoke all on function security.is_valid_clinical_storage_path(text) from public;

grant execute on function security.touch_updated_at(regclass) to postgres, service_role;
grant execute on function security.storage_bucket_is_clinical(text) to authenticated, service_role;
grant execute on function security.is_valid_uuid_text(text) to authenticated, service_role;
grant execute on function security.storage_object_tenant_id(text) to authenticated, service_role;
grant execute on function security.is_valid_clinical_storage_path(text) to authenticated, service_role;
