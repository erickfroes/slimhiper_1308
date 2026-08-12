-- Per-clinic privacy automation. Human publication is the activation gate.

create table public.clinic_privacy_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'superseded')),
  dpo_email text,
  consent_version text,
  request_sla_days integer not null default 15 check (request_sla_days between 1 and 90),
  alert_lead_days integer not null default 3 check (alert_lead_days between 1 and 30),
  automation_enabled boolean not null default false,
  allow_nonclinical_anonymization boolean not null default false,
  retention_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(retention_rules) = 'object'),
  optional_consents jsonb not null default '{}'::jsonb check (jsonb_typeof(optional_consents) = 'object'),
  approved_operators jsonb not null default '[]'::jsonb check (jsonb_typeof(approved_operators) = 'array'),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version)
);
create unique index clinic_privacy_policies_one_published on public.clinic_privacy_policies(tenant_id) where status = 'published';
create index clinic_privacy_policies_tenant_status on public.clinic_privacy_policies(tenant_id, status, version desc);

create table public.clinic_privacy_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  alert_type text not null check (alert_type in ('policy_unpublished', 'request_due', 'request_overdue', 'consent_revoked', 'unusual_exports', 'support_access', 'break_glass', 'tabletop_due')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  subject_type text not null,
  subject_id text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (tenant_id, alert_type, subject_type, subject_id, status)
);
create index clinic_privacy_alerts_tenant_open on public.clinic_privacy_alerts(tenant_id, created_at desc) where status = 'open';

alter table public.clinic_privacy_policies enable row level security;
alter table public.clinic_privacy_alerts enable row level security;
revoke all on public.clinic_privacy_policies, public.clinic_privacy_alerts from anon, authenticated;
grant select, insert, update, delete on public.clinic_privacy_policies, public.clinic_privacy_alerts to service_role;

create or replace function security.privacy_admin_tenant()
returns uuid language plpgsql stable security definer set search_path = public, security, pg_temp as $$
declare v_tenant uuid := security.resolve_current_tenant('patients.write', false);
begin
  if not security.can_manage_tenant(v_tenant) then raise exception 'privacy_admin_required' using errcode = '42501'; end if;
  return v_tenant;
end;
$$;

create or replace function public.get_clinic_privacy_governance()
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare v_tenant uuid := security.privacy_admin_tenant();
begin
  return jsonb_build_object(
    'policy', (select jsonb_build_object('id', id, 'version', version, 'status', status, 'dpoEmail', dpo_email, 'consentVersion', consent_version, 'requestSlaDays', request_sla_days, 'alertLeadDays', alert_lead_days, 'automationEnabled', automation_enabled, 'allowNonclinicalAnonymization', allow_nonclinical_anonymization, 'retentionRules', retention_rules, 'optionalConsents', optional_consents, 'approvedOperators', approved_operators, 'publishedAt', published_at) from public.clinic_privacy_policies where tenant_id = v_tenant and status in ('draft', 'published') order by version desc limit 1),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'type', alert_type, 'severity', severity, 'status', status, 'dueAt', due_at, 'createdAt', created_at) order by severity desc, created_at desc) from public.clinic_privacy_alerts where tenant_id = v_tenant and status = 'open'), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'type', request_type, 'status', status, 'dueAt', due_at, 'assignedTo', assigned_to, 'createdAt', created_at) order by due_at asc) from (select * from public.data_subject_requests where tenant_id = v_tenant and status in ('requested', 'in_progress', 'retained') order by due_at asc limit 50) requests), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_clinic_privacy_policy(p_policy jsonb)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare v_tenant uuid := security.privacy_admin_tenant(); v_version integer; v_policy public.clinic_privacy_policies%rowtype;
begin
  if jsonb_typeof(coalesce(p_policy, '{}'::jsonb)) <> 'object' then raise exception 'invalid_privacy_policy' using errcode = '22023'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.clinic_privacy_policies where tenant_id = v_tenant;
  update public.clinic_privacy_policies set status = 'superseded', updated_at = now() where tenant_id = v_tenant and status = 'draft';
  insert into public.clinic_privacy_policies (tenant_id, version, dpo_email, consent_version, request_sla_days, alert_lead_days, automation_enabled, allow_nonclinical_anonymization, retention_rules, optional_consents, approved_operators)
  values (v_tenant, v_version, nullif(btrim(p_policy->>'dpoEmail'), ''), nullif(btrim(p_policy->>'consentVersion'), ''), coalesce((p_policy->>'requestSlaDays')::integer, 15), coalesce((p_policy->>'alertLeadDays')::integer, 3), false, coalesce((p_policy->>'allowNonclinicalAnonymization')::boolean, false), coalesce(p_policy->'retentionRules', '{}'::jsonb), coalesce(p_policy->'optionalConsents', '{}'::jsonb), coalesce(p_policy->'approvedOperators', '[]'::jsonb)) returning * into v_policy;
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata) values (v_tenant, auth.uid(), 'privacy.policy_drafted', 'clinic_privacy_policy', v_policy.id::text, jsonb_build_object('version', v_policy.version));
  return jsonb_build_object('id', v_policy.id, 'version', v_policy.version, 'status', v_policy.status);
end;
$$;

create or replace function public.publish_clinic_privacy_policy(p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare v_tenant uuid := security.privacy_admin_tenant(); v_policy public.clinic_privacy_policies%rowtype;
begin
  select * into v_policy from public.clinic_privacy_policies where id = p_policy_id and tenant_id = v_tenant for update;
  if not found then raise exception 'privacy_policy_not_found' using errcode = 'P0002'; end if;
  if v_policy.status <> 'draft' then raise exception 'privacy_policy_not_draft' using errcode = '22023'; end if;
  if v_policy.dpo_email is null or v_policy.consent_version is null or v_policy.retention_rules = '{}'::jsonb or v_policy.optional_consents = '{}'::jsonb then raise exception 'privacy_policy_incomplete' using errcode = '22023'; end if;
  update public.clinic_privacy_policies set status = 'superseded', updated_at = now() where tenant_id = v_tenant and status = 'published';
  update public.clinic_privacy_policies set status = 'published', automation_enabled = true, published_by = auth.uid(), published_at = now(), updated_at = now() where id = v_policy.id returning * into v_policy;
  perform security.ensure_lgpd_processing_inventory(v_tenant);
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata) values (v_tenant, auth.uid(), 'privacy.policy_published', 'clinic_privacy_policy', v_policy.id::text, jsonb_build_object('version', v_policy.version, 'automationEnabled', true));
  return jsonb_build_object('id', v_policy.id, 'version', v_policy.version, 'status', v_policy.status, 'automationEnabled', true);
end;
$$;

create or replace function public.assign_data_subject_request(p_request_id uuid, p_assigned_to uuid)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare v_tenant uuid := security.privacy_admin_tenant(); v_request public.data_subject_requests%rowtype;
begin
  update public.data_subject_requests set assigned_to = p_assigned_to, status = 'in_progress', updated_at = now() where id = p_request_id and tenant_id = v_tenant and status = 'requested' returning * into v_request;
  if not found then raise exception 'data_subject_request_not_assignable' using errcode = '22023'; end if;
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata) values (v_tenant, auth.uid(), 'lgpd.request_assigned', 'data_subject_request', v_request.id::text, jsonb_build_object('requestType', v_request.request_type));
  return jsonb_build_object('id', v_request.id, 'status', v_request.status, 'assignedTo', v_request.assigned_to);
end;
$$;

create or replace function public.run_clinic_privacy_automation(p_execute boolean default false, p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500); v_candidates integer; v_created integer := 0;
begin
  perform security.integration_require_service_role();
  with candidates as (
    select t.id tenant_id, 'policy_unpublished'::text kind, 'tenant'::text subject_type, t.id::text subject_id, 'medium'::text severity, null::timestamptz due_at from public.tenants t where not exists (select 1 from public.clinic_privacy_policies p where p.tenant_id = t.id and p.status = 'published')
    union all
    select r.tenant_id, case when r.due_at < now() then 'request_overdue' else 'request_due' end, 'data_subject_request', r.id::text, case when r.due_at < now() then 'high' else 'medium' end, r.due_at from public.data_subject_requests r join public.clinic_privacy_policies p on p.tenant_id = r.tenant_id and p.status = 'published' and p.automation_enabled where r.status in ('requested', 'in_progress') and r.due_at <= now() + make_interval(days => p.alert_lead_days)
  ) select count(*) into v_candidates from candidates;
  if p_execute then
    insert into public.clinic_privacy_alerts (tenant_id, alert_type, severity, subject_type, subject_id, due_at, metadata)
    select tenant_id, kind, severity, subject_type, subject_id, due_at, jsonb_build_object('source', 'privacy_automation') from (
      select t.id tenant_id, 'policy_unpublished'::text kind, 'tenant'::text subject_type, t.id::text subject_id, 'medium'::text severity, null::timestamptz due_at from public.tenants t where not exists (select 1 from public.clinic_privacy_policies p where p.tenant_id = t.id and p.status = 'published')
      union all
      select r.tenant_id, case when r.due_at < now() then 'request_overdue' else 'request_due' end, 'data_subject_request', r.id::text, case when r.due_at < now() then 'high' else 'medium' end, r.due_at from public.data_subject_requests r join public.clinic_privacy_policies p on p.tenant_id = r.tenant_id and p.status = 'published' and p.automation_enabled where r.status in ('requested', 'in_progress') and r.due_at <= now() + make_interval(days => p.alert_lead_days)
    ) candidates limit v_limit on conflict do nothing;
    get diagnostics v_created = row_count;
  end if;
  return jsonb_build_object('processedCount', v_candidates, 'succeededCount', v_created, 'dryRun', not p_execute, 'summary', jsonb_build_object('alertsCreated', v_created));
end;
$$;

revoke all on function public.get_clinic_privacy_governance(), public.save_clinic_privacy_policy(jsonb), public.publish_clinic_privacy_policy(uuid), public.assign_data_subject_request(uuid, uuid), public.run_clinic_privacy_automation(boolean, integer) from public;
grant execute on function public.get_clinic_privacy_governance(), public.save_clinic_privacy_policy(jsonb), public.publish_clinic_privacy_policy(uuid), public.assign_data_subject_request(uuid, uuid) to authenticated, service_role;
grant execute on function public.run_clinic_privacy_automation(boolean, integer) to service_role;

-- Consent is valid only against the currently published clinic policy.  This
-- replacement deliberately keeps the original RPC signature for the portal.
create or replace function public.record_patient_consent(p_patient_id uuid, p_purpose text, p_granted boolean, p_version text, p_evidence_digest text default null)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant(null, false);
  v_user_id uuid := auth.uid(); v_policy public.clinic_privacy_policies%rowtype; v_row public.patient_consents%rowtype;
begin
  if not (security.has_permission(v_tenant_id, 'patients.write', false) or public.can_access_patient_portal_patient(v_tenant_id, p_patient_id)) then raise exception 'consent_not_authorized' using errcode = '42501'; end if;
  select * into v_policy from public.clinic_privacy_policies where tenant_id = v_tenant_id and status = 'published';
  if not found or not v_policy.automation_enabled then raise exception 'privacy_policy_not_published' using errcode = '42501'; end if;
  if p_purpose not in ('marketing', 'community', 'progress_photos', 'optional_communications') or not (v_policy.optional_consents ? p_purpose) or p_version is distinct from v_policy.consent_version or (p_evidence_digest is not null and p_evidence_digest !~ '^[a-f0-9]{64}$') then raise exception 'invalid_consent_contract' using errcode = '22023'; end if;
  update public.patient_consents set status = 'revoked', revoked_by = v_user_id, revoked_at = now() where tenant_id = v_tenant_id and patient_id = p_patient_id and purpose = p_purpose and status = 'granted';
  insert into public.patient_consents (tenant_id, patient_id, purpose, version, status, evidence_digest, captured_by, revoked_by, revoked_at)
  values (v_tenant_id, p_patient_id, p_purpose, p_version, case when p_granted then 'granted' else 'revoked' end, p_evidence_digest, v_user_id, case when p_granted then null else v_user_id end, case when p_granted then null else now() end) returning * into v_row;
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata) values (v_tenant_id, v_user_id, case when p_granted then 'lgpd.consent_granted' else 'lgpd.consent_revoked' end, 'patient_consent', v_row.id::text, jsonb_build_object('purpose', p_purpose, 'version', p_version));
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'purpose', v_row.purpose);
end;
$$;

-- A final clinical/legal decision is still human.  Automation may only apply
-- anonymization to non-clinical data when the published policy explicitly opts in.
create or replace function public.resolve_data_subject_request(p_request_id uuid, p_resolution text default 'complete')
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', false); v_user_id uuid := auth.uid();
  v_request public.data_subject_requests%rowtype; v_has_clinical boolean; v_allowed boolean;
begin
  select * into v_request from public.data_subject_requests where id = p_request_id and tenant_id = v_tenant_id for update;
  if not found then raise exception 'data_subject_request_not_found' using errcode = 'P0002'; end if;
  if v_request.status not in ('requested', 'in_progress') then raise exception 'data_subject_request_already_resolved' using errcode = '22023'; end if;
  if v_request.request_type = 'anonymization' then
    select coalesce(allow_nonclinical_anonymization, false) into v_allowed from public.clinic_privacy_policies where tenant_id = v_tenant_id and status = 'published';
    select exists (select 1 from public.encounters where tenant_id = v_tenant_id and patient_id = v_request.patient_id union all select 1 from public.soap_notes where tenant_id = v_tenant_id and patient_id = v_request.patient_id union all select 1 from public.prescriptions where tenant_id = v_tenant_id and patient_id = v_request.patient_id union all select 1 from public.generated_documents where tenant_id = v_tenant_id and patient_id = v_request.patient_id) into v_has_clinical;
    if v_has_clinical or not coalesce(v_allowed, false) then
      update public.data_subject_requests set status = 'retained', resolution_code = case when v_has_clinical then 'clinical_retention_required' else 'policy_review_required' end, assigned_to = v_user_id, resolved_at = now(), updated_at = now() where id = v_request.id;
    else
      update public.patient_pii set full_name = 'anon_' || left(v_request.patient_id::text, 12), cpf_masked = null, email = null, phone = null, birth_date = null, sex_gender = null, address = '{}'::jsonb, emergency_contact = '{}'::jsonb, updated_at = now() where tenant_id = v_tenant_id and patient_id = v_request.patient_id;
      update public.data_subject_requests set status = 'completed', resolution_code = 'anonymized_permitted_data', assigned_to = v_user_id, resolved_at = now(), updated_at = now() where id = v_request.id;
    end if;
  else
    update public.data_subject_requests set status = case when p_resolution = 'deny' then 'denied' else 'completed' end, resolution_code = case when p_resolution = 'deny' then 'request_denied' else 'request_completed' end, assigned_to = v_user_id, resolved_at = now(), updated_at = now() where id = v_request.id;
  end if;
  select * into v_request from public.data_subject_requests where id = v_request.id;
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata) values (v_tenant_id, v_user_id, 'lgpd.request_resolved', 'data_subject_request', v_request.id::text, jsonb_build_object('requestType', v_request.request_type, 'status', v_request.status, 'resolutionCode', v_request.resolution_code));
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
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata) values (v_tenant_id, auth.uid(), 'lgpd.export_accessed', 'data_subject_request', v_request.id::text, jsonb_build_object('requestType', 'export'));
  return jsonb_build_object('schemaVersion', '1.0', 'requestId', v_request.id, 'patientId', v_request.patient_id, 'personalData', jsonb_build_object('fullName', v_pii.full_name, 'email', v_pii.email, 'phone', v_pii.phone), 'consents', coalesce((select jsonb_agg(jsonb_build_object('purpose', purpose, 'version', version, 'status', status, 'capturedAt', captured_at, 'revokedAt', revoked_at) order by captured_at) from public.patient_consents where tenant_id = v_tenant_id and patient_id = v_request.patient_id), '[]'::jsonb));
end;
$$;

revoke all on function public.record_patient_consent(uuid, text, boolean, text, text), public.resolve_data_subject_request(uuid, text), public.get_data_subject_export(uuid) from public;
grant execute on function public.record_patient_consent(uuid, text, boolean, text, text), public.resolve_data_subject_request(uuid, text), public.get_data_subject_export(uuid) to authenticated, service_role;

insert into public.operational_job_definitions (job_key, display_name, category, execution_kind, handler_name, schedule_cron, cron_job_name, cron_enabled, is_enabled, default_limit, max_limit, expected_max_lag, description, runbook_href, metadata)
values ('lgpd.governance', 'Governança LGPD por clínica', 'compliance', 'recurring', 'public.run_clinic_privacy_automation', '10 3 * * *', 'lgpd_governance', false, true, 100, 500, interval '24 hours', 'Alertas sanitizados de política e solicitações LGPD; não executa decisões clínicas/legais.', 'docs/LGPD_GOVERNANCE_RUNBOOK.md', jsonb_build_object('manualActivationRequired', true, 'tabletopCadenceMonths', 3))
on conflict (job_key) do update set handler_name = excluded.handler_name, description = excluded.description, metadata = excluded.metadata, updated_at = now();
