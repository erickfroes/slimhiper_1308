-- Documents schema foundation for SlimHiper.
-- Scope: database schema + RLS only (no UI changes, no D4Sign integration, no Asaas integration).

-- 1) document_templates
create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  category text not null,
  status text not null default 'draft',
  template_body text,
  variables jsonb not null default '{}'::jsonb,
  d4sign_enabled boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) generated_documents
create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  protocol_instance_id uuid,
  template_id uuid references public.document_templates(id) on delete set null,
  name text not null,
  category text not null,
  status text not null default 'generated',
  storage_bucket text not null,
  storage_path text not null,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  released_to_patient boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) signature_requests
create table if not exists public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  generated_document_id uuid not null references public.generated_documents(id) on delete cascade,
  provider text not null,
  provider_document_id text,
  status text not null default 'pending',
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  canceled_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) signature_signers
create table if not exists public.signature_signers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  signature_request_id uuid not null references public.signature_requests(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text not null,
  status text not null default 'pending',
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5) d4sign_events
create table if not exists public.d4sign_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  signature_request_id uuid references public.signature_requests(id) on delete set null,
  provider_event_id text,
  event_type text not null,
  status text not null default 'received',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_summary jsonb not null default '{}'::jsonb,
  error_message text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes: operational filters and provider/idempotency lookups
create index if not exists idx_document_templates_tenant_id on public.document_templates(tenant_id);
create index if not exists idx_document_templates_status on public.document_templates(status);
create index if not exists idx_document_templates_category on public.document_templates(category);
create index if not exists idx_document_templates_created_at on public.document_templates(created_at);

create index if not exists idx_generated_documents_tenant_id on public.generated_documents(tenant_id);
create index if not exists idx_generated_documents_patient_id on public.generated_documents(patient_id);
create index if not exists idx_generated_documents_status on public.generated_documents(status);
create index if not exists idx_generated_documents_category on public.generated_documents(category);
create index if not exists idx_generated_documents_created_at on public.generated_documents(created_at);

create index if not exists idx_signature_requests_tenant_id on public.signature_requests(tenant_id);
create index if not exists idx_signature_requests_patient_id on public.signature_requests(patient_id);
create index if not exists idx_signature_requests_status on public.signature_requests(status);
create index if not exists idx_signature_requests_provider_document_id on public.signature_requests(provider_document_id);
create index if not exists idx_signature_requests_created_at on public.signature_requests(created_at);

create index if not exists idx_signature_signers_tenant_id on public.signature_signers(tenant_id);
create index if not exists idx_signature_signers_status on public.signature_signers(status);
create index if not exists idx_signature_signers_created_at on public.signature_signers(created_at);

create index if not exists idx_d4sign_events_tenant_id on public.d4sign_events(tenant_id);
create index if not exists idx_d4sign_events_status on public.d4sign_events(status);
create index if not exists idx_d4sign_events_provider_event_id on public.d4sign_events(provider_event_id);
create index if not exists idx_d4sign_events_idempotency_key on public.d4sign_events(idempotency_key);
create index if not exists idx_d4sign_events_created_at on public.d4sign_events(created_at);

-- RLS
alter table public.document_templates enable row level security;
alter table public.generated_documents enable row level security;
alter table public.signature_requests enable row level security;
alter table public.signature_signers enable row level security;
alter table public.d4sign_events enable row level security;

-- Tenant staff access: explicit documents.read / documents.write permissions only.
-- Platform admin/support are intentionally not given automatic clinical document access.

drop policy if exists document_templates_read on public.document_templates;
create policy document_templates_read
on public.document_templates
for select
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'documents.read')
);

drop policy if exists document_templates_write on public.document_templates;
create policy document_templates_write
on public.document_templates
for all
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'documents.write')
)
with check (
  public.has_clinical_permission(tenant_id, 'documents.write')
);

drop policy if exists generated_documents_read on public.generated_documents;
create policy generated_documents_read
on public.generated_documents
for select
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'documents.read')
);

drop policy if exists generated_documents_write on public.generated_documents;
create policy generated_documents_write
on public.generated_documents
for all
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'documents.write')
)
with check (
  public.has_clinical_permission(tenant_id, 'documents.write')
);

drop policy if exists signature_requests_read on public.signature_requests;
create policy signature_requests_read
on public.signature_requests
for select
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'documents.read')
);

drop policy if exists signature_requests_write on public.signature_requests;
create policy signature_requests_write
on public.signature_requests
for all
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'documents.write')
)
with check (
  public.has_clinical_permission(tenant_id, 'documents.write')
);

drop policy if exists signature_signers_read on public.signature_signers;
create policy signature_signers_read
on public.signature_signers
for select
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'documents.read')
);

drop policy if exists signature_signers_write on public.signature_signers;
create policy signature_signers_write
on public.signature_signers
for all
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'documents.write')
)
with check (
  public.has_clinical_permission(tenant_id, 'documents.write')
);

drop policy if exists d4sign_events_read on public.d4sign_events;
create policy d4sign_events_read
on public.d4sign_events
for select
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'documents.read')
);

drop policy if exists d4sign_events_write on public.d4sign_events;
create policy d4sign_events_write
on public.d4sign_events
for all
to authenticated
using (
  public.has_clinical_permission(tenant_id, 'documents.write')
)
with check (
  public.has_clinical_permission(tenant_id, 'documents.write')
);

-- Patient read access placeholder (to be implemented when patient auth-account linkage is ready):
-- Intended rule: patients should only be able to read their own released documents.
-- TODO: add dedicated patient policies for public.generated_documents and related derived reads.
