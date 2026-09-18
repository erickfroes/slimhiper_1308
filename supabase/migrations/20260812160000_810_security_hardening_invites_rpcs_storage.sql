-- Security hardening: invitation proof, SECURITY DEFINER execution grants, and clinical uploads.
-- This migration is forward-only and does not alter historical migrations.

create table if not exists public.tenant_invitation_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  role_code text not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  issued_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create index if not exists tenant_invitation_tokens_pending_lookup_idx
  on public.tenant_invitation_tokens (token_hash, expires_at)
  where used_at is null and revoked_at is null;

create index if not exists tenant_invitation_tokens_tenant_email_pending_idx
  on public.tenant_invitation_tokens (tenant_id, email, created_at desc)
  where used_at is null and revoked_at is null;

alter table public.tenant_invitation_tokens enable row level security;
revoke all on public.tenant_invitation_tokens from anon, authenticated;
grant select, insert, update, delete on public.tenant_invitation_tokens to service_role;

comment on table public.tenant_invitation_tokens is
  'One-time hashes that bind a tenant membership acceptance to the e-mail invitation link. Raw tokens are never stored.';

-- PostgreSQL grants EXECUTE to PUBLIC by default. Revoke that implicit grant from
-- every privileged function already present, then explicitly re-grant only RPCs
-- that authenticate and authorize their own caller.
do $$
declare
  target record;
begin
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'security')
      and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon', target.signature);
  end loop;

  for target in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (array[
        'archive_patient_nutrition_plan',
        'cancel_patient_prescription',
        'clone_program',
        'create_patient_financial_local_action',
        'create_patient_review_flag',
        'duplicate_document_template',
        'duplicate_patient_prescription',
        'enroll_patient_in_program',
        'get_clinic_finance_overview',
        'get_clinic_finance_reconciliation',
        'get_clinic_programs',
        'get_patient_document_evidence',
        'get_patient_financial_summary',
        'link_patient_prescription_document',
        'save_patient_nutrition_plan',
        'set_generated_document_patient_release',
        'set_patient_clinical_task_status',
        'update_patient_package_status',
        'update_program_status',
        'upsert_patient_clinical_task',
        'upsert_patient_prescription',
        'upsert_program_from_builder'
      ])
  loop
    execute format('grant execute on function %s to authenticated, service_role', target.signature);
  end loop;
end;
$$;

-- Future SECURITY DEFINER functions need an explicit grant in the migration that
-- introduces them. This prevents a transient or accidental public RPC surface.
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema security revoke execute on functions from public, anon;

-- Clinical storage remains private and permission-checked by the existing object
-- RLS policies, while now rejecting unbounded or unsupported browser uploads.
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['application/pdf']::text[]
where id in ('patient-documents', 'signed-documents');

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
where id = 'clinical-attachments';

update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['application/pdf', 'application/zip']::text[]
where id = 'evidence-packages';
