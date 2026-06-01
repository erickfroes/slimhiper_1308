-- Phase 8.1: clinic report executor and short-lived export contracts.

alter table public.report_runs
  add column if not exists report_key text,
  add column if not exists scope text not null default 'clinic' check (scope in ('clinic', 'patient')),
  add column if not exists patient_id uuid,
  add column if not exists export_format text check (export_format is null or export_format in ('csv', 'pdf')),
  add column if not exists export_token_hash text,
  add column if not exists export_expires_at timestamptz,
  add column if not exists result_rows jsonb not null default '[]'::jsonb;

create index if not exists idx_report_runs_requester_created_at
  on public.report_runs(requested_by, created_at desc);
create index if not exists idx_report_runs_export_expiry
  on public.report_runs(tenant_id, export_expires_at)
  where export_token_hash is not null;

alter table public.report_runs
  drop constraint if exists report_runs_patient_same_tenant,
  add constraint report_runs_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id);

create or replace function public.list_clinic_report_definitions()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_can_reports boolean;
  v_can_financial boolean;
  v_can_sensitive boolean;
begin
  select p.active_tenant_id into v_tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'reports.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_reports := true;
  v_can_financial := security.has_permission(v_tenant_id, 'financial.read', false);
  v_can_sensitive := security.has_permission(v_tenant_id, 'timeline.sensitive.read', false);

  return (
    with allowed as (
      select * from (values
        ('resumo-clinico', 'Resumo Clinico', 'Indicadores clinicos agregados, atendimentos e status de pacientes.', 'FileText', false, false),
        ('resumo-financeiro', 'Resumo Financeiro', 'Totais financeiros minimizados por status de cobranca.', 'DollarSign', true, false),
        ('servicos-consumidos', 'Servicos Consumidos', 'Agenda e atendimentos agregados por status e profissional.', 'ShoppingBag', false, false),
        ('documentos-emitidos', 'Documentos Emitidos', 'Documentos emitidos e assinatura por status documental.', 'FileCheck', false, false),
        ('adesao-plano', 'Adesao ao Plano', 'Matriculas em programas, semana atual e status de jornada.', 'Target', false, false),
        ('timeline-consolidada', 'Timeline Consolidada', 'Eventos de timeline sanitizados; detalhamento exige permissao sensivel.', 'Clock', false, true),
        ('alertas', 'Alertas', 'Pendencias operacionais de agenda, documentos e cobranca.', 'Bell', true, false)
      ) as a(key, label, description, icon_key, requires_financial, requires_sensitive)
    ), tenant_defs as (
      select distinct on (a.key)
        rd.id,
        a.key,
        coalesce(nullif(rd.label, ''), a.label) as label,
        coalesce(nullif(rd.description, ''), a.description) as description,
        coalesce(nullif(rd.icon_key, ''), a.icon_key) as icon_key,
        rd.export_enabled,
        rd.definition,
        a.requires_financial,
        a.requires_sensitive
      from allowed a
      left join public.report_definitions rd
        on rd.tenant_id = v_tenant_id
       and rd.key = a.key
       and rd.status = 'active'
      order by a.key, rd.updated_at desc nulls last
    )
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'key', key,
      'label', label,
      'description', description,
      'iconKey', icon_key,
      'badge', case when requires_financial then 'Financeiro' when requires_sensitive then 'Sensivel' else 'Seguro' end,
      'badgeColor', case when requires_financial then 'bg-emerald-100 text-emerald-700' when requires_sensitive then 'bg-amber-100 text-amber-700' else 'bg-blue-100 text-blue-700' end,
      'exportEnabled', coalesce(export_enabled, true),
      'requiresFinancialRead', requires_financial,
      'requiresSensitiveRead', requires_sensitive,
      'canRun', v_can_reports and (not requires_financial or v_can_financial) and (not requires_sensitive or v_can_sensitive),
      'disabledReason', case
        when requires_financial and not v_can_financial then 'Exige permissao financial.read.'
        when requires_sensitive and not v_can_sensitive then 'Exige permissao timeline.sensitive.read.'
        else null
      end
    ) order by label)
    from tenant_defs
  );
end;
$$;

create or replace function public.create_clinic_report_run(
  p_report_key text,
  p_filters jsonb default '{}'::jsonb,
  p_export_format text default 'csv',
  p_patient_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_definition_id uuid;
  v_key text := lower(trim(coalesce(p_report_key, '')));
  v_format text := lower(trim(coalesce(p_export_format, 'csv')));
  v_requires_financial boolean := false;
  v_requires_sensitive boolean := false;
  v_scope text := case when p_patient_id is null then 'clinic' else 'patient' end;
  v_run_id uuid;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_rows jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_from timestamptz;
  v_to timestamptz;
begin
  if v_key not in ('resumo-clinico', 'resumo-financeiro', 'servicos-consumidos', 'documentos-emitidos', 'adesao-plano', 'timeline-consolidada', 'alertas') then
    raise exception 'report_not_allowed' using errcode = '22023';
  end if;

  if v_format not in ('csv', 'pdf') then
    raise exception 'invalid_export_format' using errcode = '22023';
  end if;

  select p.active_tenant_id into v_tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'reports.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_requires_financial := v_key in ('resumo-financeiro', 'alertas');
  v_requires_sensitive := v_key = 'timeline-consolidada' and coalesce((p_filters->>'detail')::boolean, false);

  if v_requires_financial and not security.has_permission(v_tenant_id, 'financial.read', false) then
    raise exception 'missing_financial_read' using errcode = '42501';
  end if;

  if v_requires_sensitive and not security.has_permission(v_tenant_id, 'timeline.sensitive.read', false) then
    raise exception 'missing_sensitive_read' using errcode = '42501';
  end if;

  if p_patient_id is not null and not exists (
    select 1 from public.patients p where p.tenant_id = v_tenant_id and p.id = p_patient_id
  ) then
    raise exception 'patient_not_found' using errcode = 'P0002';
  end if;

  select rd.id into v_definition_id
  from public.report_definitions rd
  where rd.tenant_id = v_tenant_id
    and rd.key = v_key
    and rd.status = 'active'
  order by rd.updated_at desc
  limit 1;

  v_from := coalesce(nullif(p_filters->>'from', '')::timestamptz, now() - interval '30 days');
  v_to := coalesce(nullif(p_filters->>'to', '')::timestamptz, now());

  if v_key = 'resumo-financeiro' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.status), '[]'::jsonb)
      into v_rows
    from (
      select pi.status, count(*)::integer as total, coalesce(sum(pi.amount_cents), 0)::integer as amount_cents
      from public.patient_invoices pi
      where pi.tenant_id = v_tenant_id
        and (p_patient_id is null or pi.patient_id = p_patient_id)
        and pi.created_at between v_from and v_to
      group by pi.status
    ) x;
  elsif v_key = 'documentos-emitidos' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.status), '[]'::jsonb)
      into v_rows
    from (
      select gd.status, gd.category, count(*)::integer as total
      from public.generated_documents gd
      where gd.tenant_id = v_tenant_id
        and (p_patient_id is null or gd.patient_id = p_patient_id)
        and gd.created_at between v_from and v_to
      group by gd.status, gd.category
    ) x;
  elsif v_key = 'servicos-consumidos' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.status), '[]'::jsonb)
      into v_rows
    from (
      select a.status, coalesce(a.type, 'consulta') as service_type, count(*)::integer as total
      from public.appointments a
      where a.tenant_id = v_tenant_id
        and (p_patient_id is null or a.patient_id = p_patient_id)
        and a.scheduled_at between v_from and v_to
      group by a.status, a.type
    ) x;
  elsif v_key = 'adesao-plano' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.status), '[]'::jsonb)
      into v_rows
    from (
      select e.status, count(*)::integer as enrollments, coalesce(avg(e.current_week), 0)::numeric(10,2) as avg_current_week
      from public.patient_program_enrollments e
      where e.tenant_id = v_tenant_id
        and (p_patient_id is null or e.patient_id = p_patient_id)
        and e.created_at between v_from and v_to
      group by e.status
    ) x;
  else
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.metric), '[]'::jsonb)
      into v_rows
    from (
      select 'pacientes_ativos' as metric, count(*)::integer as total from public.patients p where p.tenant_id = v_tenant_id and p.status = 'active' and (p_patient_id is null or p.id = p_patient_id)
      union all
      select 'consultas_periodo', count(*)::integer from public.appointments a where a.tenant_id = v_tenant_id and a.scheduled_at between v_from and v_to and (p_patient_id is null or a.patient_id = p_patient_id)
      union all
      select 'documentos_periodo', count(*)::integer from public.generated_documents gd where gd.tenant_id = v_tenant_id and gd.created_at between v_from and v_to and (p_patient_id is null or gd.patient_id = p_patient_id)
    ) x;
  end if;

  v_summary := jsonb_build_object(
    'reportKey', v_key,
    'scope', v_scope,
    'rowCount', jsonb_array_length(v_rows),
    'filters', jsonb_build_object('from', v_from, 'to', v_to, 'patientId', p_patient_id),
    'minimized', true,
    'requiresFinancialRead', v_requires_financial,
    'requiresSensitiveRead', v_requires_sensitive
  );

  insert into public.report_runs (
    tenant_id, report_definition_id, report_key, scope, patient_id, requested_by,
    status, filters, result_summary, result_rows, export_format, export_token_hash,
    export_expires_at, completed_at
  ) values (
    v_tenant_id, v_definition_id, v_key, v_scope, p_patient_id, auth.uid(),
    'completed', coalesce(p_filters, '{}'::jsonb), v_summary, v_rows, v_format,
    encode(digest(v_token, 'sha256'), 'hex'), now() + interval '15 minutes', now()
  ) returning id into v_run_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    auth.uid(),
    'report.export.created',
    'report_run',
    v_run_id::text,
    v_summary || jsonb_build_object('exportFormat', v_format, 'expiresInSeconds', 900)
  );

  return jsonb_build_object(
    'id', v_run_id,
    'status', 'completed',
    'reportKey', v_key,
    'scope', v_scope,
    'resultSummary', v_summary,
    'rows', v_rows,
    'exportFormat', v_format,
    'exportToken', v_token,
    'exportExpiresAt', now() + interval '15 minutes'
  );
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
begin
  select * into v_row from public.report_runs rr where rr.id = p_run_id;
  if not found or not security.has_permission(v_row.tenant_id, 'reports.read', false) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

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
    'createdAt', v_row.created_at,
    'completedAt', v_row.completed_at
  );
end;
$$;

create or replace function public.get_clinic_report_export(p_run_id uuid, p_export_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_row public.report_runs%rowtype;
  v_expected text := encode(digest(coalesce(p_export_token, ''), 'sha256'), 'hex');
begin
  select * into v_row from public.report_runs rr where rr.id = p_run_id;
  if not found or not security.has_permission(v_row.tenant_id, 'reports.read', false) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_row.export_token_hash is null or v_row.export_token_hash <> v_expected or v_row.export_expires_at < now() then
    raise exception 'export_expired_or_invalid' using errcode = '42501';
  end if;

  if coalesce((v_row.result_summary->>'requiresFinancialRead')::boolean, false)
     and not security.has_permission(v_row.tenant_id, 'financial.read', false) then
    raise exception 'missing_financial_read' using errcode = '42501';
  end if;

  if coalesce((v_row.result_summary->>'requiresSensitiveRead')::boolean, false)
     and not security.has_permission(v_row.tenant_id, 'timeline.sensitive.read', false) then
    raise exception 'missing_sensitive_read' using errcode = '42501';
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_row.tenant_id,
    auth.uid(),
    'report.export.downloaded',
    'report_run',
    v_row.id::text,
    jsonb_build_object('reportKey', v_row.report_key, 'format', v_row.export_format, 'scope', v_row.scope)
  );

  return jsonb_build_object(
    'id', v_row.id,
    'reportKey', v_row.report_key,
    'format', coalesce(v_row.export_format, 'csv'),
    'summary', v_row.result_summary,
    'rows', v_row.result_rows,
    'filename', concat(coalesce(v_row.report_key, 'relatorio'), '-', to_char(v_row.created_at, 'YYYYMMDD-HH24MISS'), '.', coalesce(v_row.export_format, 'csv'))
  );
end;
$$;

revoke all on function public.list_clinic_report_definitions() from public;
revoke all on function public.create_clinic_report_run(text, jsonb, text, uuid) from public;
revoke all on function public.get_clinic_report_run(uuid) from public;
revoke all on function public.get_clinic_report_export(uuid, text) from public;

grant execute on function public.list_clinic_report_definitions() to authenticated, service_role;
grant execute on function public.create_clinic_report_run(text, jsonb, text, uuid) to authenticated, service_role;
grant execute on function public.get_clinic_report_run(uuid) to authenticated, service_role;
grant execute on function public.get_clinic_report_export(uuid, text) to authenticated, service_role;

comment on function public.create_clinic_report_run(text, jsonb, text, uuid) is 'Runs allowlisted clinic/patient reports with minimized rows, short-lived export token and audit log.';
comment on function public.get_clinic_report_export(uuid, text) is 'Returns export payload only for authenticated reports.read callers with valid short-lived token.';
