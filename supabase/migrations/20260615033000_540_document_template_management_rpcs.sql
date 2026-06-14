-- Document template management RPCs for audited, versioned clinic UI edits.

create or replace function public.validate_document_template_variables(
  p_template_body text,
  p_variables jsonb
)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_protected constant text[] := array[
    'patient_id',
    'patient_name',
    'patient_email',
    'patient_phone',
    'patient_cpf_masked',
    'patient_birth_date',
    'patient_sex_gender',
    'clinic_name',
    'date',
    'generated_at',
    'generated_by_user_id',
    'professional_name'
  ];
  v_key text;
  v_match text[];
begin
  if jsonb_typeof(coalesce(p_variables, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_template_variables' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_variables, '{}'::jsonb)) loop
    if v_key = any(v_protected) then
      raise exception 'protected_template_variable:%', v_key using errcode = '22023';
    end if;

    if v_key !~ '^[A-Za-z][A-Za-z0-9_]*$' then
      raise exception 'invalid_template_variable:%', v_key using errcode = '22023';
    end if;
  end loop;

  for v_match in
    select regexp_matches(coalesce(p_template_body, ''), '\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}', 'g')
  loop
    v_key := v_match[1];
    if v_key = any(v_protected) then
      continue;
    end if;

    if not coalesce(p_variables, '{}'::jsonb) ? v_key then
      raise exception 'unregistered_template_variable:%', v_key using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function public.current_documents_write_tenant()
returns uuid
language sql
stable
security definer
set search_path = public, security, auth, pg_temp
as $$
  select tm.tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid()
    and tm.status = 'active'
    and p.is_active = true
    and security.has_permission(tm.tenant_id, 'documents.write', false)
  order by case when p.active_tenant_id = tm.tenant_id then 0 else 1 end, tm.created_at desc
  limit 1;
$$;

create or replace function public.document_template_result(p_template public.document_templates)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p_template.id,
    'name', p_template.name,
    'category', p_template.category,
    'status', p_template.status,
    'currentVersion', p_template.current_version
  );
$$;

create or replace function public.create_document_template(
  p_name text,
  p_category text,
  p_template_body text default null,
  p_variables jsonb default '{}'::jsonb,
  p_d4sign_enabled boolean default false,
  p_status text default 'draft'
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_template public.document_templates%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  v_tenant_id := public.current_documents_write_tenant();
  if v_tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'template_name_required' using errcode = '22023';
  end if;

  if coalesce(p_status, 'draft') not in ('draft', 'active', 'archived') then
    raise exception 'invalid_template_status' using errcode = '22023';
  end if;

  if coalesce(p_status, 'draft') = 'active' then
    if nullif(trim(coalesce(p_category, '')), '') is null then
      raise exception 'template_category_required' using errcode = '22023';
    end if;

    if nullif(trim(coalesce(p_template_body, '')), '') is null then
      raise exception 'template_body_required' using errcode = '22023';
    end if;
  end if;

  perform public.validate_document_template_variables(p_template_body, coalesce(p_variables, '{}'::jsonb));

  insert into public.document_templates (
    tenant_id, name, category, status, template_body, variables, d4sign_enabled, created_by
  ) values (
    v_tenant_id,
    left(trim(p_name), 200),
    left(coalesce(nullif(trim(lower(p_category)), ''), 'outros'), 80),
    coalesce(p_status, 'draft'),
    p_template_body,
    coalesce(p_variables, '{}'::jsonb),
    coalesce(p_d4sign_enabled, false),
    v_user_id
  ) returning * into v_template;

  insert into public.document_audit_events (tenant_id, template_id, action, actor_id, source, summary)
  values (
    v_template.tenant_id,
    v_template.id,
    'document_template.created',
    v_user_id,
    'app',
    jsonb_build_object('name', v_template.name, 'status', v_template.status, 'currentVersion', v_template.current_version)
  );

  return public.document_template_result(v_template);
end;
$$;

create or replace function public.update_document_template(
  p_template_id uuid,
  p_name text,
  p_category text,
  p_template_body text default null,
  p_variables jsonb default '{}'::jsonb,
  p_d4sign_enabled boolean default false,
  p_status text default 'draft'
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_template public.document_templates%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_template from public.document_templates where id = p_template_id;
  if v_template.id is null then
    raise exception 'template_not_found' using errcode = '22023';
  end if;

  if not security.has_permission(v_template.tenant_id, 'documents.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'template_name_required' using errcode = '22023';
  end if;

  if coalesce(p_status, 'draft') not in ('draft', 'active', 'archived') then
    raise exception 'invalid_template_status' using errcode = '22023';
  end if;

  if coalesce(p_status, 'draft') = 'active' then
    if nullif(trim(coalesce(p_category, '')), '') is null then
      raise exception 'template_category_required' using errcode = '22023';
    end if;

    if nullif(trim(coalesce(p_template_body, '')), '') is null then
      raise exception 'template_body_required' using errcode = '22023';
    end if;
  end if;

  perform public.validate_document_template_variables(p_template_body, coalesce(p_variables, '{}'::jsonb));

  update public.document_templates
  set name = left(trim(p_name), 200),
      category = left(coalesce(nullif(trim(lower(p_category)), ''), 'outros'), 80),
      status = coalesce(p_status, 'draft'),
      template_body = p_template_body,
      variables = coalesce(p_variables, '{}'::jsonb),
      d4sign_enabled = coalesce(p_d4sign_enabled, false)
  where tenant_id = v_template.tenant_id
    and id = v_template.id
  returning * into v_template;

  insert into public.document_audit_events (tenant_id, template_id, action, actor_id, source, summary)
  values (
    v_template.tenant_id,
    v_template.id,
    'document_template.updated',
    v_user_id,
    'app',
    jsonb_build_object('name', v_template.name, 'status', v_template.status, 'currentVersion', v_template.current_version)
  );

  return public.document_template_result(v_template);
end;
$$;

create or replace function public.archive_document_template(
  p_template_id uuid,
  p_archived boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_template public.document_templates%rowtype;
  v_next_status text;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_template from public.document_templates where id = p_template_id;
  if v_template.id is null then
    raise exception 'template_not_found' using errcode = '22023';
  end if;

  if not security.has_permission(v_template.tenant_id, 'documents.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_next_status := case when coalesce(p_archived, true) then 'archived' else 'draft' end;

  update public.document_templates
  set status = v_next_status
  where tenant_id = v_template.tenant_id
    and id = v_template.id
  returning * into v_template;

  insert into public.document_audit_events (tenant_id, template_id, action, actor_id, source, summary)
  values (
    v_template.tenant_id,
    v_template.id,
    case when v_next_status = 'archived' then 'document_template.archived' else 'document_template.restored' end,
    v_user_id,
    'app',
    jsonb_build_object('status', v_template.status, 'currentVersion', v_template.current_version)
  );

  return public.document_template_result(v_template);
end;
$$;

create or replace function public.publish_document_template(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_template public.document_templates%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_template from public.document_templates where id = p_template_id;
  if v_template.id is null then
    raise exception 'template_not_found' using errcode = '22023';
  end if;

  if not security.has_permission(v_template.tenant_id, 'documents.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if nullif(trim(v_template.name), '') is null then
    raise exception 'template_name_required' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(v_template.category, '')), '') is null then
    raise exception 'template_category_required' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(v_template.template_body, '')), '') is null then
    raise exception 'template_body_required' using errcode = '22023';
  end if;

  perform public.validate_document_template_variables(v_template.template_body, coalesce(v_template.variables, '{}'::jsonb));

  update public.document_templates
  set status = 'active'
  where tenant_id = v_template.tenant_id
    and id = v_template.id
  returning * into v_template;

  insert into public.document_audit_events (tenant_id, template_id, action, actor_id, source, summary)
  values (
    v_template.tenant_id,
    v_template.id,
    'document_template.published',
    v_user_id,
    'app',
    jsonb_build_object('status', v_template.status, 'currentVersion', v_template.current_version)
  );

  return public.document_template_result(v_template);
end;
$$;

revoke all on function public.validate_document_template_variables(text, jsonb) from public;
revoke all on function public.current_documents_write_tenant() from public;
revoke all on function public.document_template_result(public.document_templates) from public;
revoke all on function public.create_document_template(text, text, text, jsonb, boolean, text) from public;
revoke all on function public.update_document_template(uuid, text, text, text, jsonb, boolean, text) from public;
revoke all on function public.archive_document_template(uuid, boolean) from public;
revoke all on function public.publish_document_template(uuid) from public;

grant execute on function public.create_document_template(text, text, text, jsonb, boolean, text) to authenticated, service_role;
grant execute on function public.update_document_template(uuid, text, text, text, jsonb, boolean, text) to authenticated, service_role;
grant execute on function public.archive_document_template(uuid, boolean) to authenticated, service_role;
grant execute on function public.publish_document_template(uuid) to authenticated, service_role;

comment on function public.create_document_template(text, text, text, jsonb, boolean, text) is
  'Creates an audited document template draft/active/archived item for the active documents.write tenant.';
comment on function public.update_document_template(uuid, text, text, text, jsonb, boolean, text) is
  'Updates an audited document template while preserving trigger-based document_template_versions snapshots.';
comment on function public.archive_document_template(uuid, boolean) is
  'Archives or restores a document template with documents.write authorization and audit trail.';
comment on function public.publish_document_template(uuid) is
  'Publishes a draft document template after protected-variable validation.';
