-- SlimHiper clean foundation: clinical documents, private storage, D4Sign contracts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('patient-documents', 'patient-documents', false, null, null),
  ('signed-documents', 'signed-documents', false, null, null),
  ('clinical-attachments', 'clinical-attachments', false, null, null),
  ('evidence-packages', 'evidence-packages', false, null, null)
on conflict (id) do update
set public = false;

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  category text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  template_body text,
  variables jsonb not null default '{}'::jsonb,
  d4sign_enabled boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  protocol_instance_id uuid,
  template_id uuid,
  name text not null,
  category text not null,
  status text not null default 'generated'
    check (status in ('draft', 'generated', 'sent_for_signature', 'pending_signature', 'signed', 'cancelled', 'expired', 'failed')),
  storage_bucket text not null check (security.storage_bucket_is_clinical(storage_bucket)),
  storage_path text not null,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  released_to_patient boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (storage_bucket, storage_path),
  constraint generated_documents_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint generated_documents_template_same_tenant
    foreign key (tenant_id, template_id)
    references public.document_templates(tenant_id, id)
);

create table public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  generated_document_id uuid not null,
  provider text not null check (provider in ('d4sign')),
  provider_document_id text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'viewed', 'signed', 'rejected', 'canceled', 'cancelled', 'expired', 'failed', 'error')),
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  canceled_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint signature_requests_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint signature_requests_document_same_tenant
    foreign key (tenant_id, generated_document_id)
    references public.generated_documents(tenant_id, id)
    on delete cascade
);

create table public.signature_signers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  signature_request_id uuid not null,
  name text not null,
  email text,
  phone text,
  role text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'viewed', 'signed', 'rejected', 'canceled', 'cancelled', 'expired', 'failed', 'error')),
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint signature_signers_request_same_tenant
    foreign key (tenant_id, signature_request_id)
    references public.signature_requests(tenant_id, id)
    on delete cascade
);

create table public.d4sign_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  signature_request_id uuid,
  provider_event_id text,
  idempotency_key text,
  event_type text not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'ignored')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_summary jsonb not null default '{}'::jsonb,
  error_message text,
  retry_count integer not null default 0 check (retry_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint d4sign_events_request_same_tenant
    foreign key (tenant_id, signature_request_id)
    references public.signature_requests(tenant_id, id)
);

create unique index idx_d4sign_events_idempotency_unique
  on public.d4sign_events(idempotency_key)
  where idempotency_key is not null;

create unique index idx_d4sign_events_provider_event_unique
  on public.d4sign_events(provider_event_id)
  where provider_event_id is not null;

create index idx_document_templates_tenant_status on public.document_templates(tenant_id, status);
create index idx_generated_documents_patient_created_at on public.generated_documents(tenant_id, patient_id, created_at desc);
create index idx_generated_documents_status on public.generated_documents(status);
create index idx_signature_requests_provider_document_id on public.signature_requests(provider_document_id);
create index idx_signature_requests_patient_status on public.signature_requests(tenant_id, patient_id, status);
create index idx_signature_signers_request_status on public.signature_signers(tenant_id, signature_request_id, status);
create index idx_d4sign_events_tenant_created_at on public.d4sign_events(tenant_id, created_at desc);

select security.touch_updated_at('public.document_templates');
select security.touch_updated_at('public.generated_documents');
select security.touch_updated_at('public.signature_requests');
select security.touch_updated_at('public.signature_signers');
select security.touch_updated_at('public.d4sign_events');

create or replace function security.clinical_document_path_matches_row(
  p_bucket text,
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, storage, pg_temp
as $$
  select exists (
    select 1
    from public.generated_documents gd
    where gd.storage_bucket = p_bucket
      and gd.storage_path = p_object_name
      and security.is_valid_clinical_storage_path(p_object_name)
      and public.has_clinical_permission(gd.tenant_id, 'documents.read')
  );
$$;

revoke all on function security.clinical_document_path_matches_row(text, text) from public;
grant execute on function security.clinical_document_path_matches_row(text, text) to authenticated, service_role;

alter table public.document_templates enable row level security;
alter table public.generated_documents enable row level security;
alter table public.signature_requests enable row level security;
alter table public.signature_signers enable row level security;
alter table public.d4sign_events enable row level security;

create policy document_templates_read
on public.document_templates for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'documents.read'));

create policy document_templates_write
on public.document_templates for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'documents.write'))
with check (public.has_clinical_permission(tenant_id, 'documents.write'));

create policy generated_documents_read
on public.generated_documents for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'documents.read'));

create policy generated_documents_write
on public.generated_documents for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'documents.write'))
with check (
  public.has_clinical_permission(tenant_id, 'documents.write')
  and storage_path = tenant_id::text || '/' || patient_id::text || '/' || id::text || '/' || split_part(storage_path, '/', 4)
);

create policy signature_requests_read
on public.signature_requests for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'documents.read'));

create policy signature_requests_write
on public.signature_requests for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'documents.write'))
with check (public.has_clinical_permission(tenant_id, 'documents.write'));

create policy signature_signers_read
on public.signature_signers for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'documents.read'));

create policy signature_signers_write
on public.signature_signers for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'documents.write'))
with check (public.has_clinical_permission(tenant_id, 'documents.write'));

create policy d4sign_events_read
on public.d4sign_events for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'documents.read'));

-- No insert/update/delete policy for d4sign_events: provider events are backend/service-role only.

drop policy if exists "clinical_documents_read" on storage.objects;
drop policy if exists "clinical_documents_insert" on storage.objects;
drop policy if exists "clinical_documents_update" on storage.objects;

create policy "clinical_documents_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('patient-documents', 'signed-documents', 'clinical-attachments', 'evidence-packages')
  and security.is_valid_clinical_storage_path(name)
  and public.has_clinical_permission(security.storage_object_tenant_id(name), 'documents.write')
);

create policy "clinical_documents_update"
on storage.objects for update
to authenticated
using (
  bucket_id in ('patient-documents', 'signed-documents', 'clinical-attachments', 'evidence-packages')
  and security.is_valid_clinical_storage_path(name)
  and public.has_clinical_permission(security.storage_object_tenant_id(name), 'documents.write')
)
with check (
  bucket_id in ('patient-documents', 'signed-documents', 'clinical-attachments', 'evidence-packages')
  and security.is_valid_clinical_storage_path(name)
  and public.has_clinical_permission(security.storage_object_tenant_id(name), 'documents.write')
);

comment on table public.generated_documents is 'Clinical document metadata. Downloads are served by Edge signed URLs, not direct storage reads.';
comment on table public.d4sign_events is 'Append-only provider webhook event summaries written by backend/service role.';
