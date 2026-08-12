-- LGPD governance: versioned processing inventory, optional-purpose consent
-- and data-subject rights. Audit metadata is intentionally limited to IDs,
-- codes and state transitions; clinical content never enters audit_logs.

create table public.lgpd_processing_inventory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_.:-]{3,80}$'),
  purpose text not null check (purpose ~ '^[a-z0-9_.:-]{3,120}$'),
  legal_basis text not null check (legal_basis in ('consent', 'contract', 'legal_obligation', 'health_protection', 'legitimate_interest')),
  controller_role text not null check (length(btrim(controller_role)) between 3 and 120),
  operator_role text check (operator_role is null or length(btrim(operator_role)) between 3 and 120),
  retention_policy text not null check (retention_policy ~ '^[a-z0-9_.:-]{3,120}$'),
  sharing_scope text not null default 'none' check (sharing_scope in ('none', 'internal', 'contracted_processor')),
  access_profiles jsonb not null default '[]'::jsonb check (jsonb_typeof(access_profiles) = 'array'),
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code, version)
);

create table public.patient_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null,
  purpose text not null check (purpose in ('marketing', 'community', 'progress_photos', 'optional_communications')),
  version text not null check (version ~ '^[a-zA-Z0-9_.:-]{1,40}$'),
  status text not null check (status in ('granted', 'revoked')),
  evidence_digest text check (evidence_digest is null or evidence_digest ~ '^[a-f0-9]{64}$'),
  captured_by uuid references public.profiles(id) on delete set null,
  captured_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  constraint patient_consents_patient_same_tenant foreign key (tenant_id, patient_id) references public.patients(tenant_id, id) on delete cascade,
  check ((status = 'granted' and revoked_at is null) or (status = 'revoked' and revoked_at is not null))
);

create unique index patient_consents_active_purpose on public.patient_consents(tenant_id, patient_id, purpose) where status = 'granted';
create index idx_patient_consents_patient_purpose on public.patient_consents(tenant_id, patient_id, purpose, captured_at desc);

create table public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null,
  request_type text not null check (request_type in ('access', 'correction', 'export', 'revocation', 'anonymization')),
  status text not null default 'requested' check (status in ('requested', 'in_progress', 'completed', 'denied', 'retained')),
  requested_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz not null default now() + interval '15 days',
  resolution_code text check (resolution_code is null or resolution_code ~ '^[a-z0-9_.:-]{3,80}$'),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_subject_requests_patient_same_tenant foreign key (tenant_id, patient_id) references public.patients(tenant_id, id) on delete cascade
);

create index idx_data_subject_requests_tenant_status_due on public.data_subject_requests(tenant_id, status, due_at);

alter table public.lgpd_processing_inventory enable row level security;
alter table public.patient_consents enable row level security;
alter table public.data_subject_requests enable row level security;
revoke all on public.lgpd_processing_inventory, public.patient_consents, public.data_subject_requests from anon, authenticated;
grant select, insert, update, delete on public.lgpd_processing_inventory, public.patient_consents, public.data_subject_requests to service_role;

create or replace function security.ensure_lgpd_processing_inventory(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public, security, pg_temp as $$
begin
  insert into public.lgpd_processing_inventory (tenant_id, code, purpose, legal_basis, controller_role, operator_role, retention_policy, sharing_scope, access_profiles)
  values
    (p_tenant_id, 'clinical_care', 'healthcare_delivery', 'health_protection', 'clinic_controller', 'authorized_health_processor', 'clinical_retention_required', 'contracted_processor', '["clinic_admin","physician","nutritionist"]'::jsonb),
    (p_tenant_id, 'marketing', 'optional_marketing', 'consent', 'clinic_controller', null, 'until_revocation', 'none', '["clinic_admin"]'::jsonb),
    (p_tenant_id, 'community', 'optional_community', 'consent', 'clinic_controller', 'moderation_processor', 'until_revocation', 'contracted_processor', '["clinic_admin","patient"]'::jsonb),
    (p_tenant_id, 'progress_photos', 'optional_progress_photos', 'consent', 'clinic_controller', 'storage_processor', 'until_revocation', 'contracted_processor', '["clinic_admin","nutritionist"]'::jsonb),
    (p_tenant_id, 'optional_communications', 'optional_communications', 'consent', 'clinic_controller', 'communications_processor', 'until_revocation', 'contracted_processor', '["clinic_admin"]'::jsonb)
  on conflict (tenant_id, code, version) do nothing;
end;
$$;

create or replace function security.lgpd_can_access_patient(p_tenant_id uuid, p_patient_id uuid)
returns boolean language sql stable security definer set search_path = public, security, auth, pg_temp as $$
  select public.has_clinical_permission(p_tenant_id, 'patients.read')
    or public.can_access_patient_portal_patient(p_tenant_id, p_patient_id);
$$;

create or replace function public.get_lgpd_processing_inventory()
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare v_tenant_id uuid := security.resolve_current_tenant('patients.read', false);
begin
  perform security.ensure_lgpd_processing_inventory(v_tenant_id);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'code', code, 'purpose', purpose, 'legalBasis', legal_basis, 'controllerRole', controller_role,
    'operatorRole', operator_role, 'retentionPolicy', retention_policy, 'sharingScope', sharing_scope,
    'accessProfiles', access_profiles, 'version', version
  ) order by code) from public.lgpd_processing_inventory where tenant_id = v_tenant_id and active), '[]'::jsonb);
end;
$$;

create or replace function public.record_patient_consent(
  p_patient_id uuid, p_purpose text, p_granted boolean, p_version text, p_evidence_digest text default null
)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant(null, false);
  v_user_id uuid := auth.uid();
  v_row public.patient_consents%rowtype;
begin
  if not (security.has_permission(v_tenant_id, 'patients.write', false) or public.can_access_patient_portal_patient(v_tenant_id, p_patient_id)) then
    raise exception 'consent_not_authorized' using errcode = '42501';
  end if;
  if p_purpose not in ('marketing', 'community', 'progress_photos', 'optional_communications')
     or coalesce(p_version, '') !~ '^[a-zA-Z0-9_.:-]{1,40}$'
     or (p_evidence_digest is not null and p_evidence_digest !~ '^[a-f0-9]{64}$') then
    raise exception 'invalid_consent_contract' using errcode = '22023';
  end if;
  update public.patient_consents set status = 'revoked', revoked_by = v_user_id, revoked_at = now()
  where tenant_id = v_tenant_id and patient_id = p_patient_id and purpose = p_purpose and status = 'granted';
  insert into public.patient_consents (tenant_id, patient_id, purpose, version, status, evidence_digest, captured_by, revoked_by, revoked_at)
  values (v_tenant_id, p_patient_id, p_purpose, p_version, case when p_granted then 'granted' else 'revoked' end, p_evidence_digest, v_user_id,
    case when p_granted then null else v_user_id end, case when p_granted then null else now() end)
  returning * into v_row;
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, v_user_id, case when p_granted then 'lgpd.consent_granted' else 'lgpd.consent_revoked' end, 'patient_consent', v_row.id::text,
    jsonb_build_object('patientId', p_patient_id, 'purpose', p_purpose, 'version', p_version));
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'purpose', v_row.purpose);
end;
$$;

create or replace function public.create_data_subject_request(p_patient_id uuid, p_request_type text)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant(null, false);
  v_user_id uuid := auth.uid(); v_row public.data_subject_requests%rowtype;
begin
  if not (security.has_permission(v_tenant_id, 'patients.write', false) or public.can_access_patient_portal_patient(v_tenant_id, p_patient_id)) then
    raise exception 'data_subject_request_not_authorized' using errcode = '42501';
  end if;
  if p_request_type not in ('access', 'correction', 'export', 'revocation', 'anonymization') then raise exception 'invalid_data_subject_request' using errcode = '22023'; end if;
  insert into public.data_subject_requests (tenant_id, patient_id, request_type, requested_by)
  values (v_tenant_id, p_patient_id, p_request_type, v_user_id) returning * into v_row;
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, v_user_id, 'lgpd.request_created', 'data_subject_request', v_row.id::text,
    jsonb_build_object('patientId', p_patient_id, 'requestType', p_request_type));
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'dueAt', v_row.due_at);
end;
$$;

create or replace function public.resolve_data_subject_request(p_request_id uuid, p_resolution text default 'complete')
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', false);
  v_user_id uuid := auth.uid(); v_request public.data_subject_requests%rowtype; v_has_clinical boolean;
begin
  select * into v_request from public.data_subject_requests where id = p_request_id and tenant_id = v_tenant_id for update;
  if not found then raise exception 'data_subject_request_not_found' using errcode = 'P0002'; end if;
  if v_request.status not in ('requested', 'in_progress') then raise exception 'data_subject_request_already_resolved' using errcode = '22023'; end if;
  if v_request.request_type = 'anonymization' then
    select exists (
      select 1 from public.encounters where tenant_id = v_tenant_id and patient_id = v_request.patient_id
      union all select 1 from public.soap_notes where tenant_id = v_tenant_id and patient_id = v_request.patient_id
      union all select 1 from public.prescriptions where tenant_id = v_tenant_id and patient_id = v_request.patient_id
      union all select 1 from public.generated_documents where tenant_id = v_tenant_id and patient_id = v_request.patient_id
    ) into v_has_clinical;
    if v_has_clinical then
      update public.data_subject_requests set status = 'retained', resolution_code = 'clinical_retention_required', assigned_to = v_user_id, resolved_at = now(), updated_at = now() where id = v_request.id;
    else
      update public.patient_pii set full_name = 'anon_' || left(v_request.patient_id::text, 12), cpf_masked = null, email = null, phone = null,
        birth_date = null, sex_gender = null, address = '{}'::jsonb, emergency_contact = '{}'::jsonb, updated_at = now()
      where tenant_id = v_tenant_id and patient_id = v_request.patient_id;
      update public.data_subject_requests set status = 'completed', resolution_code = 'anonymized_permitted_data', assigned_to = v_user_id, resolved_at = now(), updated_at = now() where id = v_request.id;
    end if;
  else
    update public.data_subject_requests set status = case when p_resolution = 'deny' then 'denied' else 'completed' end,
      resolution_code = case when p_resolution = 'deny' then 'request_denied' else 'request_completed' end,
      assigned_to = v_user_id, resolved_at = now(), updated_at = now() where id = v_request.id;
  end if;
  select * into v_request from public.data_subject_requests where id = v_request.id;
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, v_user_id, 'lgpd.request_resolved', 'data_subject_request', v_request.id::text,
    jsonb_build_object('patientId', v_request.patient_id, 'requestType', v_request.request_type, 'status', v_request.status, 'resolutionCode', v_request.resolution_code));
  return jsonb_build_object('id', v_request.id, 'status', v_request.status, 'resolutionCode', v_request.resolution_code);
end;
$$;

create or replace function public.get_data_subject_export(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare v_tenant_id uuid := security.resolve_current_tenant(null, false); v_request public.data_subject_requests%rowtype; v_pii public.patient_pii%rowtype;
begin
  select * into v_request from public.data_subject_requests where id = p_request_id and tenant_id = v_tenant_id;
  if not found or v_request.request_type <> 'export' or not security.lgpd_can_access_patient(v_tenant_id, v_request.patient_id) then raise exception 'data_subject_export_forbidden' using errcode = '42501'; end if;
  select * into v_pii from public.patient_pii where tenant_id = v_tenant_id and patient_id = v_request.patient_id;
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'lgpd.export_accessed', 'data_subject_request', v_request.id::text,
    jsonb_build_object('patientId', v_request.patient_id, 'requestType', 'export'));
  return jsonb_build_object('schemaVersion', '1.0', 'requestId', v_request.id, 'patientId', v_request.patient_id,
    'personalData', jsonb_build_object('fullName', v_pii.full_name, 'email', v_pii.email, 'phone', v_pii.phone),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('purpose', purpose, 'version', version, 'status', status, 'capturedAt', captured_at, 'revokedAt', revoked_at) order by captured_at) from public.patient_consents where tenant_id = v_tenant_id and patient_id = v_request.patient_id), '[]'::jsonb));
end;
$$;

revoke all on function public.get_lgpd_processing_inventory(), public.record_patient_consent(uuid, text, boolean, text, text), public.create_data_subject_request(uuid, text), public.resolve_data_subject_request(uuid, text), public.get_data_subject_export(uuid) from public;
grant execute on function public.get_lgpd_processing_inventory(), public.record_patient_consent(uuid, text, boolean, text, text), public.create_data_subject_request(uuid, text), public.resolve_data_subject_request(uuid, text), public.get_data_subject_export(uuid) to authenticated, service_role;
