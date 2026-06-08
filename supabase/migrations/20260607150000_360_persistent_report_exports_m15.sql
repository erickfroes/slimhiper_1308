-- M15: persistent report exports.
-- Report bytes live in a private Storage bucket and are exposed only through
-- short-lived signed URLs after the report artifact metadata passes RBAC.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-exports',
  'report-exports',
  false,
  20971520,
  array['text/csv', 'application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.report_runs
  add column if not exists expires_at timestamptz,
  add column if not exists retained_until timestamptz,
  add column if not exists artifact_count integer not null default 0 check (artifact_count >= 0);

create table if not exists public.report_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_run_id uuid not null,
  report_key text not null,
  patient_id uuid,
  requested_by uuid references public.profiles(id) on delete set null,
  format text not null check (format in ('csv', 'pdf')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'ready', 'failed', 'expired', 'deleted')),
  storage_bucket text not null default 'report-exports' check (storage_bucket = 'report-exports'),
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in ('text/csv', 'application/pdf')),
  size_bytes integer check (size_bytes is null or size_bytes >= 0),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  row_count integer not null default 0 check (row_count >= 0),
  requires_financial_read boolean not null default false,
  requires_sensitive_read boolean not null default false,
  requires_crm_read boolean not null default false,
  requires_inventory_read boolean not null default false,
  requires_inventory_cost_read boolean not null default false,
  expires_at timestamptz not null default (now() + interval '7 days'),
  retained_until timestamptz not null default (now() + interval '30 days'),
  generated_at timestamptz,
  last_downloaded_at timestamptz,
  download_count integer not null default 0 check (download_count >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (storage_bucket, storage_path),
  constraint report_artifacts_run_same_tenant
    foreign key (tenant_id, report_run_id)
    references public.report_runs(tenant_id, id)
    on delete cascade,
  constraint report_artifacts_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
);

select security.touch_updated_at('public.report_artifacts');

create index if not exists idx_report_runs_tenant_expires_at
  on public.report_runs(tenant_id, expires_at)
  where expires_at is not null;

create index if not exists idx_report_artifacts_run_created
  on public.report_artifacts(report_run_id, created_at desc);

create index if not exists idx_report_artifacts_tenant_status_created
  on public.report_artifacts(tenant_id, status, created_at desc);

create index if not exists idx_report_artifacts_tenant_expires
  on public.report_artifacts(tenant_id, expires_at)
  where status in ('ready', 'running', 'pending');

alter table public.report_artifacts enable row level security;

create or replace function security.is_valid_report_export_path(p_object_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    p_object_name is not null
    and array_length(string_to_array(p_object_name, '/'), 1) = 4
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 1))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 2))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 3))
    and split_part(p_object_name, '/', 4) ~ '^[a-z0-9][a-z0-9._-]*\.(csv|pdf)$';
$$;

create or replace function security.can_read_report_export(
  p_tenant_id uuid,
  p_requires_financial_read boolean default false,
  p_requires_sensitive_read boolean default false,
  p_requires_crm_read boolean default false,
  p_requires_inventory_read boolean default false,
  p_requires_inventory_cost_read boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public, security, pg_temp
as $$
  select p_tenant_id is not null
    and security.has_permission(p_tenant_id, 'reports.read', false)
    and (not coalesce(p_requires_financial_read, false)
      or security.has_permission(p_tenant_id, 'financial.read', false))
    and (not coalesce(p_requires_sensitive_read, false)
      or security.has_permission(p_tenant_id, 'timeline.sensitive.read', false))
    and (not coalesce(p_requires_crm_read, false)
      or security.has_permission(p_tenant_id, 'crm.read', false))
    and (not coalesce(p_requires_inventory_read, false)
      or security.has_permission(p_tenant_id, 'inventory.read', false))
    and (not coalesce(p_requires_inventory_cost_read, false)
      or security.has_permission(p_tenant_id, 'inventory.cost.read', false));
$$;

revoke all on function security.is_valid_report_export_path(text) from public;
revoke all on function security.can_read_report_export(uuid, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function security.is_valid_report_export_path(text) to authenticated, service_role;
grant execute on function security.can_read_report_export(uuid, boolean, boolean, boolean, boolean, boolean)
  to authenticated, service_role;

drop policy if exists report_artifacts_select_reports_read on public.report_artifacts;
create policy report_artifacts_select_reports_read
on public.report_artifacts for select
to authenticated
using (
  security.can_read_report_export(
    tenant_id,
    requires_financial_read,
    requires_sensitive_read,
    requires_crm_read,
    requires_inventory_read,
    requires_inventory_cost_read
  )
);

grant select on public.report_artifacts to authenticated;
grant all on public.report_artifacts to service_role;

create or replace function public.prepare_clinic_report_artifact(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_run public.report_runs%rowtype;
  v_existing public.report_artifacts%rowtype;
  v_artifact_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_format text;
  v_file_name text;
  v_storage_path text;
  v_mime_type text;
  v_row_count integer;
begin
  select * into v_run
  from public.report_runs rr
  where rr.id = p_run_id;

  if not found or not security.can_read_report_export(
    v_run.tenant_id,
    coalesce((v_run.result_summary->>'requiresFinancialRead')::boolean, false),
    coalesce((v_run.result_summary->>'requiresSensitiveRead')::boolean, false),
    coalesce((v_run.result_summary->>'requiresCrmRead')::boolean, false),
    coalesce((v_run.result_summary->>'requiresInventoryRead')::boolean, false),
    coalesce((v_run.result_summary->>'requiresInventoryCostRead')::boolean, false)
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.report_artifacts a
  where a.report_run_id = v_run.id
    and a.status in ('pending', 'running', 'ready')
    and a.expires_at > v_now
  order by a.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'id', v_existing.id,
      'reportRunId', v_existing.report_run_id,
      'reportKey', v_existing.report_key,
      'format', v_existing.format,
      'status', v_existing.status,
      'storageBucket', v_existing.storage_bucket,
      'storagePath', v_existing.storage_path,
      'filename', v_existing.file_name,
      'mimeType', v_existing.mime_type,
      'sizeBytes', v_existing.size_bytes,
      'rowCount', v_existing.row_count,
      'expiresAt', v_existing.expires_at,
      'retainedUntil', v_existing.retained_until,
      'createdAt', v_existing.created_at
    );
  end if;

  v_format := lower(coalesce(v_run.export_format, 'csv'));
  if v_format not in ('csv', 'pdf') then
    raise exception 'invalid_export_format' using errcode = '22023';
  end if;

  v_mime_type := case when v_format = 'pdf' then 'application/pdf' else 'text/csv' end;
  v_file_name := concat(
    regexp_replace(coalesce(nullif(v_run.report_key, ''), 'relatorio'), '[^a-z0-9._-]+', '-', 'g'),
    '-',
    to_char(v_now, 'YYYYMMDD-HH24MISS'),
    '.',
    v_format
  );
  v_storage_path := concat(v_run.tenant_id, '/', v_run.id, '/', v_artifact_id, '/', v_file_name);
  v_row_count := coalesce(jsonb_array_length(v_run.result_rows), 0);

  if not security.is_valid_report_export_path(v_storage_path) then
    raise exception 'invalid_storage_path' using errcode = '22023';
  end if;

  insert into public.report_artifacts (
    id, tenant_id, report_run_id, report_key, patient_id, requested_by,
    format, status, storage_path, file_name, mime_type, row_count,
    requires_financial_read, requires_sensitive_read, requires_crm_read,
    requires_inventory_read, requires_inventory_cost_read,
    expires_at, retained_until, metadata
  ) values (
    v_artifact_id, v_run.tenant_id, v_run.id, coalesce(v_run.report_key, 'relatorio'),
    v_run.patient_id, v_run.requested_by, v_format, 'running', v_storage_path,
    v_file_name, v_mime_type, v_row_count,
    coalesce((v_run.result_summary->>'requiresFinancialRead')::boolean, false),
    coalesce((v_run.result_summary->>'requiresSensitiveRead')::boolean, false),
    coalesce((v_run.result_summary->>'requiresCrmRead')::boolean, false),
    coalesce((v_run.result_summary->>'requiresInventoryRead')::boolean, false),
    coalesce((v_run.result_summary->>'requiresInventoryCostRead')::boolean, false),
    v_now + interval '7 days',
    v_now + interval '30 days',
    jsonb_build_object(
      'reportSummary', v_run.result_summary - 'filters',
      'scope', v_run.scope,
      'preparedBy', auth.uid()
    )
  );

  update public.report_runs rr
  set expires_at = v_now + interval '7 days',
      retained_until = v_now + interval '30 days',
      artifact_count = (
        select count(*)::integer
        from public.report_artifacts a
        where a.report_run_id = v_run.id
          and a.status <> 'deleted'
      )
  where rr.id = v_run.id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_run.tenant_id,
    auth.uid(),
    'report.artifact.prepared',
    'report_artifact',
    v_artifact_id::text,
    jsonb_build_object(
      'reportRunId', v_run.id,
      'reportKey', v_run.report_key,
      'format', v_format,
      'expiresInDays', 7
    )
  );

  return jsonb_build_object(
    'id', v_artifact_id,
    'reportRunId', v_run.id,
    'reportKey', v_run.report_key,
    'format', v_format,
    'status', 'running',
    'storageBucket', 'report-exports',
    'storagePath', v_storage_path,
    'filename', v_file_name,
    'mimeType', v_mime_type,
    'sizeBytes', null,
    'rowCount', v_row_count,
    'expiresAt', v_now + interval '7 days',
    'retainedUntil', v_now + interval '30 days',
    'createdAt', v_now
  );
end;
$$;

create or replace function public.mark_clinic_report_artifact_ready(
  p_artifact_id uuid,
  p_size_bytes integer,
  p_content_sha256 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_artifact public.report_artifacts%rowtype;
begin
  select * into v_artifact
  from public.report_artifacts a
  where a.id = p_artifact_id
  for update;

  if not found or v_artifact.status not in ('pending', 'running') then
    raise exception 'artifact_not_found' using errcode = 'P0002';
  end if;

  if v_artifact.requested_by is distinct from auth.uid()
     and not security.has_permission(v_artifact.tenant_id, 'reports.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 20971520 then
    raise exception 'invalid_artifact_size' using errcode = '22023';
  end if;

  if p_content_sha256 is not null and p_content_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_artifact_checksum' using errcode = '22023';
  end if;

  update public.report_artifacts a
  set status = 'ready',
      size_bytes = p_size_bytes,
      content_sha256 = p_content_sha256,
      generated_at = now(),
      error_message = null
  where a.id = v_artifact.id
  returning * into v_artifact;

  update public.report_runs rr
  set artifact_count = (
        select count(*)::integer
        from public.report_artifacts a
        where a.report_run_id = rr.id
          and a.status <> 'deleted'
      ),
      expires_at = greatest(coalesce(rr.expires_at, v_artifact.expires_at), v_artifact.expires_at),
      retained_until = greatest(coalesce(rr.retained_until, v_artifact.retained_until), v_artifact.retained_until)
  where rr.id = v_artifact.report_run_id;

  return public.get_clinic_report_run(v_artifact.report_run_id);
end;
$$;

create or replace function public.mark_clinic_report_artifact_failed(
  p_artifact_id uuid,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_artifact public.report_artifacts%rowtype;
begin
  select * into v_artifact
  from public.report_artifacts a
  where a.id = p_artifact_id
  for update;

  if not found or v_artifact.status not in ('pending', 'running') then
    raise exception 'artifact_not_found' using errcode = 'P0002';
  end if;

  if v_artifact.requested_by is distinct from auth.uid()
     and not security.has_permission(v_artifact.tenant_id, 'reports.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.report_artifacts a
  set status = 'failed',
      error_message = left(coalesce(nullif(btrim(p_error_message), ''), 'artifact_generation_failed'), 240)
  where a.id = v_artifact.id
  returning * into v_artifact;

  update public.report_runs rr
  set status = 'failed',
      error_message = 'artifact_generation_failed',
      artifact_count = (
        select count(*)::integer
        from public.report_artifacts a
        where a.report_run_id = rr.id
          and a.status <> 'deleted'
      )
  where rr.id = v_artifact.report_run_id;

  return public.get_clinic_report_run(v_artifact.report_run_id);
end;
$$;

create or replace function public.get_clinic_report_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_row public.report_runs%rowtype;
  v_artifact jsonb := null;
begin
  select * into v_row from public.report_runs rr where rr.id = p_run_id;
  if not found or not security.can_read_report_export(
    v_row.tenant_id,
    coalesce((v_row.result_summary->>'requiresFinancialRead')::boolean, false),
    coalesce((v_row.result_summary->>'requiresSensitiveRead')::boolean, false),
    coalesce((v_row.result_summary->>'requiresCrmRead')::boolean, false),
    coalesce((v_row.result_summary->>'requiresInventoryRead')::boolean, false),
    coalesce((v_row.result_summary->>'requiresInventoryCostRead')::boolean, false)
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', a.id,
    'reportRunId', a.report_run_id,
    'reportKey', a.report_key,
    'format', a.format,
    'status', case
      when a.status = 'ready' and a.expires_at < now() then 'expired'
      else a.status
    end,
    'filename', a.file_name,
    'mimeType', a.mime_type,
    'sizeBytes', a.size_bytes,
    'rowCount', a.row_count,
    'downloadCount', a.download_count,
    'expiresAt', a.expires_at,
    'retainedUntil', a.retained_until,
    'createdAt', a.created_at,
    'generatedAt', a.generated_at,
    'lastDownloadedAt', a.last_downloaded_at
  )
  into v_artifact
  from public.report_artifacts a
  where a.report_run_id = v_row.id
    and a.status <> 'deleted'
  order by a.created_at desc
  limit 1;

  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'reportKey', v_row.report_key,
    'scope', v_row.scope,
    'patientId', v_row.patient_id,
    'filters', v_row.filters,
    'resultSummary', v_row.result_summary,
    'rows', v_row.result_rows,
    'exportFormat', v_row.export_format,
    'exportExpiresAt', v_row.export_expires_at,
    'artifact', v_artifact,
    'artifactId', v_artifact->>'id',
    'artifactStatus', v_artifact->>'status',
    'artifactExpiresAt', v_artifact->>'expiresAt',
    'createdAt', v_row.created_at,
    'completedAt', v_row.completed_at
  );
end;
$$;

create or replace function public.list_clinic_report_runs(
  p_report_key text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('reports.read', false);
  v_key text := nullif(lower(btrim(coalesce(p_report_key, ''))), '');
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if v_status is not null and v_status not in (
    'pending', 'running', 'ready', 'failed', 'expired', 'deleted',
    'completed', 'cancelled'
  ) then
    raise exception 'invalid_report_status' using errcode = '22023';
  end if;

  return coalesce((
    with base as (
      select
        rr.*,
        latest_artifact.artifact_json,
        latest_artifact.artifact_status
      from public.report_runs rr
      left join lateral (
        select
          jsonb_build_object(
            'id', a.id,
            'reportRunId', a.report_run_id,
            'reportKey', a.report_key,
            'format', a.format,
            'status', case
              when a.status = 'ready' and a.expires_at < now() then 'expired'
              else a.status
            end,
            'filename', a.file_name,
            'mimeType', a.mime_type,
            'sizeBytes', a.size_bytes,
            'rowCount', a.row_count,
            'downloadCount', a.download_count,
            'expiresAt', a.expires_at,
            'retainedUntil', a.retained_until,
            'createdAt', a.created_at,
            'generatedAt', a.generated_at,
            'lastDownloadedAt', a.last_downloaded_at
          ) as artifact_json,
          case
            when a.status = 'ready' and a.expires_at < now() then 'expired'
            else a.status
          end as artifact_status
        from public.report_artifacts a
        where a.report_run_id = rr.id
          and a.status <> 'deleted'
        order by a.created_at desc
        limit 1
      ) latest_artifact on true
      where rr.tenant_id = v_tenant_id
        and (v_key is null or rr.report_key = v_key)
        and (p_from is null or rr.created_at >= p_from)
        and (p_to is null or rr.created_at <= p_to)
        and security.can_read_report_export(
          rr.tenant_id,
          coalesce((rr.result_summary->>'requiresFinancialRead')::boolean, false),
          coalesce((rr.result_summary->>'requiresSensitiveRead')::boolean, false),
          coalesce((rr.result_summary->>'requiresCrmRead')::boolean, false),
          coalesce((rr.result_summary->>'requiresInventoryRead')::boolean, false),
          coalesce((rr.result_summary->>'requiresInventoryCostRead')::boolean, false)
        )
    )
    select jsonb_agg(
      jsonb_build_object(
        'id', id,
        'status', status,
        'reportKey', report_key,
        'scope', scope,
        'patientId', patient_id,
        'resultSummary', result_summary,
        'rowCount', coalesce(jsonb_array_length(result_rows), 0),
        'exportFormat', export_format,
        'artifact', artifact_json,
        'artifactId', artifact_json->>'id',
        'artifactStatus', coalesce(artifact_status, status),
        'artifactExpiresAt', artifact_json->>'expiresAt',
        'createdAt', created_at,
        'completedAt', completed_at
      )
      order by created_at desc
    )
    from (
      select *
      from base
      where v_status is null
        or coalesce(artifact_status, status) = v_status
      order by created_at desc
      limit v_limit
    ) limited
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_clinic_report_export_artifact(
  p_artifact_id uuid default null,
  p_run_id uuid default null,
  p_export_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_artifact public.report_artifacts%rowtype;
  v_run public.report_runs%rowtype;
  v_expected text := encode(digest(coalesce(p_export_token, ''), 'sha256'), 'hex');
  v_signed_url_ttl integer := 300;
begin
  if p_artifact_id is null and p_run_id is null then
    raise exception 'invalid_export_request' using errcode = '22023';
  end if;

  select a.* into v_artifact
  from public.report_artifacts a
  where (
      p_artifact_id is not null
      and a.id = p_artifact_id
    )
    or (
      p_artifact_id is null
      and a.report_run_id = p_run_id
      and a.status <> 'deleted'
    )
  order by a.created_at desc
  limit 1;

  if not found then
    raise exception 'artifact_not_found' using errcode = 'P0002';
  end if;

  select * into v_run
  from public.report_runs rr
  where rr.id = v_artifact.report_run_id;

  if not found or not security.can_read_report_export(
    v_artifact.tenant_id,
    v_artifact.requires_financial_read,
    v_artifact.requires_sensitive_read,
    v_artifact.requires_crm_read,
    v_artifact.requires_inventory_read,
    v_artifact.requires_inventory_cost_read
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_export_token is not null
     and (
      v_run.export_token_hash is null
      or v_run.export_token_hash <> v_expected
      or v_run.export_expires_at < now()
     ) then
    raise exception 'export_expired_or_invalid' using errcode = '42501';
  end if;

  if v_artifact.status = 'ready' and v_artifact.expires_at < now() then
    update public.report_artifacts
    set status = 'expired'
    where id = v_artifact.id
    returning * into v_artifact;
  end if;

  if v_artifact.status <> 'ready' then
    raise exception 'artifact_not_ready' using errcode = '42501';
  end if;

  if v_artifact.storage_bucket <> 'report-exports'
     or not security.is_valid_report_export_path(v_artifact.storage_path) then
    raise exception 'invalid_storage_contract' using errcode = '22023';
  end if;

  update public.report_artifacts
  set last_downloaded_at = now(),
      download_count = download_count + 1
  where id = v_artifact.id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_artifact.tenant_id,
    auth.uid(),
    'report.export.signed_url.created',
    'report_artifact',
    v_artifact.id::text,
    jsonb_build_object(
      'reportRunId', v_artifact.report_run_id,
      'reportKey', v_artifact.report_key,
      'format', v_artifact.format,
      'scope', v_run.scope,
      'expiresInSeconds', v_signed_url_ttl
    )
  );

  return jsonb_build_object(
    'artifactId', v_artifact.id,
    'runId', v_artifact.report_run_id,
    'reportKey', v_artifact.report_key,
    'format', v_artifact.format,
    'bucket', v_artifact.storage_bucket,
    'path', v_artifact.storage_path,
    'filename', v_artifact.file_name,
    'mimeType', v_artifact.mime_type,
    'sizeBytes', v_artifact.size_bytes,
    'expiresInSeconds', v_signed_url_ttl,
    'artifactExpiresAt', v_artifact.expires_at
  );
end;
$$;

create or replace function public.expire_clinic_report_artifacts(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 1000);
  v_expired integer := 0;
begin
  with candidates as (
    select id
    from public.report_artifacts
    where status in ('pending', 'running', 'ready')
      and expires_at < now()
    order by expires_at asc
    limit v_limit
  ), updated as (
    update public.report_artifacts a
    set status = 'expired'
    from candidates c
    where a.id = c.id
    returning a.id
  )
  select count(*)::integer into v_expired from updated;

  return jsonb_build_object('expiredCount', v_expired);
end;
$$;

revoke all on function public.prepare_clinic_report_artifact(uuid) from public;
revoke all on function public.mark_clinic_report_artifact_ready(uuid, integer, text) from public;
revoke all on function public.mark_clinic_report_artifact_failed(uuid, text) from public;
revoke all on function public.get_clinic_report_run(uuid) from public;
revoke all on function public.list_clinic_report_runs(text, text, timestamptz, timestamptz, integer) from public;
revoke all on function public.get_clinic_report_export_artifact(uuid, uuid, text) from public;
revoke all on function public.expire_clinic_report_artifacts(integer) from public;

grant execute on function public.prepare_clinic_report_artifact(uuid) to authenticated, service_role;
grant execute on function public.mark_clinic_report_artifact_ready(uuid, integer, text) to authenticated, service_role;
grant execute on function public.mark_clinic_report_artifact_failed(uuid, text) to authenticated, service_role;
grant execute on function public.get_clinic_report_run(uuid) to authenticated, service_role;
grant execute on function public.list_clinic_report_runs(text, text, timestamptz, timestamptz, integer)
  to authenticated, service_role;
grant execute on function public.get_clinic_report_export_artifact(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.expire_clinic_report_artifacts(integer) to service_role;

comment on table public.report_artifacts is
  'Persistent private report export metadata. Bytes live in report-exports and are downloaded through short-lived signed URLs.';
comment on function public.prepare_clinic_report_artifact(uuid) is
  'Creates a pending report_artifact metadata row for a completed report run after RBAC checks.';
comment on function public.get_clinic_report_export_artifact(uuid, uuid, text) is
  'Returns storage metadata for a ready report artifact after RBAC/token checks so Edge Functions can issue a short signed URL.';
