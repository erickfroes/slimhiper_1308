-- Private Supabase Storage foundation for clinical documents.
--
-- IMPORTANT:
-- 1) Clinical document downloads must be mediated by backend/Edge Functions
--    that issue short-lived signed URLs.
-- 2) Frontend clients should never receive or derive raw storage object paths.

-- 1) Provision private buckets (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('patient-documents', 'patient-documents', false, null, null),
  ('signed-documents', 'signed-documents', false, null, null),
  ('clinical-attachments', 'clinical-attachments', false, null, null),
  ('evidence-packages', 'evidence-packages', false, null, null)
on conflict (id) do update
set public = false;

-- 2) Storage helpers for strict tenant-scoped path validation
-- Path convention enforced: {tenant_id}/{patient_id}/{document_id}/{filename}
create or replace function security.storage_object_tenant_id(p_object_name text)
returns uuid
language sql
stable
as $$
  select
    case
      when p_object_name is null or split_part(p_object_name, '/', 1) = '' then null
      when split_part(p_object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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
    and split_part(p_object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(p_object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(p_object_name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and nullif(split_part(p_object_name, '/', 4), '') is not null;
$$;

create or replace function security.has_tenant_document_permission_from_path(
  p_object_name text,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r
      on r.tenant_id = tm.tenant_id
     and r.name = tm.role_code
    join public.role_permissions rp
      on rp.tenant_id = r.tenant_id
     and rp.role_id = r.id
    join public.permissions p
      on p.tenant_id = rp.tenant_id
     and p.id = rp.permission_id
    where tm.tenant_id = security.storage_object_tenant_id(p_object_name)
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.code = p_permission
  );
$$;

revoke all on function security.storage_object_tenant_id(text) from public;
revoke all on function security.is_valid_clinical_storage_path(text) from public;
revoke all on function security.has_tenant_document_permission_from_path(text, text) from public;

grant execute on function security.storage_object_tenant_id(text) to authenticated, service_role;
grant execute on function security.is_valid_clinical_storage_path(text) to authenticated, service_role;
grant execute on function security.has_tenant_document_permission_from_path(text, text) to authenticated, service_role;

-- 3) RLS for private clinical-storage buckets
-- Explicitly tenant membership + permission based. Platform roles are NOT given
-- automatic access to clinical files by default.

drop policy if exists "clinical_documents_read" on storage.objects;
create policy "clinical_documents_read"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('patient-documents', 'signed-documents', 'clinical-attachments', 'evidence-packages')
  and security.is_valid_clinical_storage_path(name)
  and security.has_tenant_document_permission_from_path(name, 'documents.read')
);

drop policy if exists "clinical_documents_insert" on storage.objects;
create policy "clinical_documents_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('patient-documents', 'signed-documents', 'clinical-attachments', 'evidence-packages')
  and security.is_valid_clinical_storage_path(name)
  and security.has_tenant_document_permission_from_path(name, 'documents.write')
);

drop policy if exists "clinical_documents_update" on storage.objects;
create policy "clinical_documents_update"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('patient-documents', 'signed-documents', 'clinical-attachments', 'evidence-packages')
  and security.is_valid_clinical_storage_path(name)
  and security.has_tenant_document_permission_from_path(name, 'documents.write')
)
with check (
  bucket_id in ('patient-documents', 'signed-documents', 'clinical-attachments', 'evidence-packages')
  and security.is_valid_clinical_storage_path(name)
  and security.has_tenant_document_permission_from_path(name, 'documents.write')
);
