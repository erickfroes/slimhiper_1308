-- Patient/guardian document read scope for released Edge signed URLs.
-- Storage remains private; browser downloads still go through document-signed-url.

create index if not exists idx_generated_documents_patient_status_release
  on public.generated_documents(tenant_id, patient_id, status, released_to_patient);

create index if not exists idx_signature_requests_document_patient_status
  on public.signature_requests(tenant_id, generated_document_id, patient_id, status);

create or replace function security.can_read_own_patient_document(
  p_tenant_id uuid,
  p_patient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.patient_accounts pa
    where pa.tenant_id = p_tenant_id
      and pa.patient_id = p_patient_id
      and pa.user_id = auth.uid()
      and pa.status = 'active'
  )
  or exists (
    select 1
    from public.guardian_links gl
    where gl.tenant_id = p_tenant_id
      and gl.patient_id = p_patient_id
      and gl.guardian_user_id = auth.uid()
      and gl.status = 'active'
  );
$$;

revoke all on function security.can_read_own_patient_document(uuid, uuid) from public;
grant execute on function security.can_read_own_patient_document(uuid, uuid)
  to authenticated, service_role;

create or replace function public.can_read_own_patient_document(
  p_tenant_id uuid,
  p_patient_id uuid
)
returns boolean
language sql
stable
as $$
  select security.can_read_own_patient_document(p_tenant_id, p_patient_id);
$$;

revoke all on function public.can_read_own_patient_document(uuid, uuid) from public;
grant execute on function public.can_read_own_patient_document(uuid, uuid)
  to authenticated, service_role;

grant select on public.generated_documents to authenticated, service_role;
grant select on public.signature_requests to authenticated, service_role;
grant select on public.signature_signers to authenticated, service_role;

drop policy if exists generated_documents_read_patient_linked on public.generated_documents;
create policy generated_documents_read_patient_linked
on public.generated_documents for select
to authenticated
using (
  released_to_patient = true
  and public.can_read_own_patient_document(tenant_id, patient_id)
);

drop policy if exists signature_requests_read_patient_linked on public.signature_requests;
create policy signature_requests_read_patient_linked
on public.signature_requests for select
to authenticated
using (
  exists (
    select 1
    from public.generated_documents gd
    where gd.tenant_id = signature_requests.tenant_id
      and gd.id = signature_requests.generated_document_id
      and gd.patient_id = signature_requests.patient_id
      and gd.released_to_patient = true
      and public.can_read_own_patient_document(gd.tenant_id, gd.patient_id)
  )
);

drop policy if exists signature_signers_read_patient_linked on public.signature_signers;
create policy signature_signers_read_patient_linked
on public.signature_signers for select
to authenticated
using (
  exists (
    select 1
    from public.signature_requests sr
    join public.generated_documents gd
      on gd.tenant_id = sr.tenant_id
     and gd.id = sr.generated_document_id
     and gd.patient_id = sr.patient_id
    where sr.tenant_id = signature_signers.tenant_id
      and sr.id = signature_signers.signature_request_id
      and gd.released_to_patient = true
      and public.can_read_own_patient_document(gd.tenant_id, gd.patient_id)
  )
);

comment on function security.can_read_own_patient_document(uuid, uuid) is
  'Returns true when auth.uid() is an active patient account or guardian for the tenant/patient pair.';

comment on policy generated_documents_read_patient_linked on public.generated_documents is
  'Allows linked patient/guardian users to read released document metadata only; file access remains through Edge signed URLs.';

comment on policy signature_requests_read_patient_linked on public.signature_requests is
  'Allows linked patient/guardian users to read signature request status for released documents only.';

comment on policy signature_signers_read_patient_linked on public.signature_signers is
  'Allows linked patient/guardian users to read signer status for released documents only.';
