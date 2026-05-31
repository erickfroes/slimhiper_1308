-- Platform admin, support and audit contracts for Phase 7.
-- Exposes sanitized platform operations through RPCs and records sensitive actions in audit_logs.

alter table public.support_sessions
  add column if not exists subject text,
  add column if not exists priority text not null default 'medio'
    check (priority in ('urgente', 'alto', 'medio', 'baixo')),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.break_glass_requests
  add column if not exists scope text not null default 'operational_support',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_support_sessions_tenant_status_created_at
  on public.support_sessions(tenant_id, status, created_at desc);

create index if not exists idx_break_glass_requests_tenant_status_created_at
  on public.break_glass_requests(tenant_id, status, created_at desc);

create or replace function security.can_access_platform_operations()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select security.is_platform_admin() or security.is_platform_support();
$$;

create or replace function public.list_platform_tenants()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_result jsonb := '[]'::jsonb;
begin
  if not security.can_access_platform_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'clinicName', t.name,
        'owner', coalesce(owner_profile.full_name, t.settings #>> '{profile,owner}', 'N/A'),
        'email', coalesce(owner_profile.email, t.settings #>> '{profile,email}', 'N/A'),
        'phone', coalesce(t.settings #>> '{profile,phone}', ''),
        'website', coalesce(t.settings #>> '{profile,website}', ''),
        'cnpj', coalesce(t.settings #>> '{profile,cnpj}', ''),
        'plan', coalesce(plan_row.code, t.settings ->> 'plan', 'starter'),
        'status', t.status,
        'users', coalesce(usage_row.users_count, 0),
        'patients', coalesce(usage_row.patients_count, 0),
        'units', coalesce(usage_row.units_count, 0),
        'storageUsedGb',
          case
            when coalesce(t.settings #>> '{usage,storageUsedGb}', '') ~ '^[0-9]+(\.[0-9]+)?$'
              then (t.settings #>> '{usage,storageUsedGb}')::numeric
            else 0
          end,
        'storageCapacityGb',
          case
            when coalesce(t.settings #>> '{usage,storageCapacityGb}', '') ~ '^[0-9]+(\.[0-9]+)?$'
              then (t.settings #>> '{usage,storageCapacityGb}')::numeric
            else 20
          end,
        'apiCallsThisMonth', coalesce(api_row.calls_count, 0),
        'apiLimitMonthly',
          case
            when coalesce(t.settings #>> '{usage,apiLimitMonthly}', '') ~ '^[0-9]+$'
              then (t.settings #>> '{usage,apiLimitMonthly}')::integer
            else 30000
          end,
        'saasSubscriptionStatus', coalesce(plan_row.status, 'not_configured'),
        'mrr', coalesce(round(plan_row.amount_cents::numeric / 100, 2), 0),
        'nextBillingDate', coalesce(plan_row.trial_ends_at, plan_row.ends_at),
        'paymentMethod', coalesce(billing_row.provider, 'not_configured'),
        'asaasSubaccountStatus', coalesce(asaas_row.status, 'not_configured'),
        'asaasAccountId', coalesce(asaas_row.account_ref, ''),
        'd4signStatus', coalesce(t.settings #>> '{integrations,d4sign,status}', 'not_configured'),
        'd4signDocsUsed', coalesce(d4sign_row.docs_used, 0),
        'd4signDocsLimit',
          case
            when coalesce(t.settings #>> '{integrations,d4sign,docsLimit}', '') ~ '^[0-9]+$'
              then (t.settings #>> '{integrations,d4sign,docsLimit}')::integer
            else 100
          end,
        'usersLimit',
          case
            when coalesce(t.settings #>> '{usage,usersLimit}', '') ~ '^[0-9]+$'
              then (t.settings #>> '{usage,usersLimit}')::integer
            else 10
          end,
        'appointmentsThisMonth', coalesce(usage_row.appointments_month_count, 0),
        'featureFlags', coalesce(flags_row.flags, '{}'::jsonb),
        'openSupportSessions', coalesce(support_row.open_count, 0),
        'pendingBreakGlass', coalesce(break_row.pending_count, 0),
        'auditEvents', coalesce(audit_row.audit_count, 0),
        'createdAt', t.created_at,
        'lastActivityAt', greatest(t.updated_at, coalesce(audit_row.last_audit_at, t.created_at))
      )
      order by t.created_at desc
    ),
    '[]'::jsonb
  )
    into v_result
  from public.tenants t
  left join lateral (
    select p.full_name, p.email
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.tenant_id = t.id
      and tm.status = 'active'
      and tm.role_code in ('tenant_owner', 'clinic_admin')
      and p.is_active = true
    order by case tm.role_code when 'tenant_owner' then 0 else 1 end, tm.created_at asc
    limit 1
  ) owner_profile on true
  left join lateral (
    select ts.status, ts.trial_ends_at, ts.ends_at, pp.code, pp.amount_cents
    from public.tenant_subscriptions ts
    join public.platform_plans pp on pp.id = ts.platform_plan_id
    where ts.tenant_id = t.id
    order by ts.created_at desc
    limit 1
  ) plan_row on true
  left join lateral (
    select provider
    from public.tenant_billing_accounts tba
    where tba.tenant_id = t.id
    order by tba.created_at desc
    limit 1
  ) billing_row on true
  left join lateral (
    select
      asa.status,
      case
        when asa.asaas_account_id is null then ''
        when length(asa.asaas_account_id) <= 8 then asa.asaas_account_id
        else left(asa.asaas_account_id, 4) || '...' || right(asa.asaas_account_id, 4)
      end as account_ref
    from public.asaas_subaccounts asa
    where asa.tenant_id = t.id
    order by asa.created_at desc
    limit 1
  ) asaas_row on true
  left join lateral (
    select
      (select count(*)::integer from public.tenant_memberships tm where tm.tenant_id = t.id) as users_count,
      (select count(*)::integer from public.patients p where p.tenant_id = t.id) as patients_count,
      (select count(*)::integer from public.tenant_units tu where tu.tenant_id = t.id) as units_count,
      (
        select count(*)::integer
        from public.appointments a
        where a.tenant_id = t.id
          and a.created_at >= date_trunc('month', now())
      ) as appointments_month_count
  ) usage_row on true
  left join lateral (
    select
      coalesce((select count(*)::integer from public.asaas_events ae where ae.tenant_id = t.id and ae.created_at >= date_trunc('month', now())), 0)
      + coalesce((select count(*)::integer from public.d4sign_events de where de.tenant_id = t.id and de.created_at >= date_trunc('month', now())), 0)
      + coalesce((select count(*)::integer from public.audit_logs al where al.tenant_id = t.id and al.created_at >= date_trunc('month', now())), 0) as calls_count
  ) api_row on true
  left join lateral (
    select coalesce(jsonb_object_agg(ff.key, ff.enabled), '{}'::jsonb) as flags
    from public.feature_flags ff
    where ff.tenant_id = t.id
  ) flags_row on true
  left join lateral (
    select count(*)::integer as docs_used
    from public.generated_documents gd
    where gd.tenant_id = t.id
      and gd.created_at >= date_trunc('month', now())
  ) d4sign_row on true
  left join lateral (
    select count(*)::integer as open_count
    from public.support_sessions ss
    where ss.tenant_id = t.id
      and ss.status in ('requested', 'active')
  ) support_row on true
  left join lateral (
    select count(*)::integer as pending_count
    from public.break_glass_requests bg
    where bg.tenant_id = t.id
      and bg.status = 'pending'
  ) break_row on true
  left join lateral (
    select count(*)::integer as audit_count, max(created_at) as last_audit_at
    from public.audit_logs al
    where al.tenant_id = t.id
  ) audit_row on true;

  return v_result;
end;
$$;

create or replace function public.list_platform_webhook_events(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_result jsonb := '[]'::jsonb;
begin
  if not security.can_access_platform_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', event.id,
        'provider', event.provider,
        'eventType', event.event_type,
        'tenant', coalesce(event.tenant_name, 'N/A'),
        'tenantId', event.tenant_id,
        'patientRef', event.payload_summary ->> 'patientRef',
        'externalId', coalesce(event.external_id, event.id::text),
        'idempotencyKey', coalesce(event.idempotency_key, event.id::text),
        'receivedAt', event.created_at,
        'processedAt', event.processed_at,
        'status', event.status,
        'retryCount', event.retry_count,
        'errorSummary', event.error_message
      )
      order by event.created_at desc
    ),
    '[]'::jsonb
  )
    into v_result
  from (
    select *
    from public.admin_webhook_events
    order by created_at desc
    limit v_limit
  ) event;

  return v_result;
end;
$$;

create or replace function public.get_platform_tenant_detail(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenants jsonb := '[]'::jsonb;
  v_tenant jsonb;
  v_users jsonb := '[]'::jsonb;
  v_units jsonb := '[]'::jsonb;
  v_audit jsonb := '[]'::jsonb;
  v_webhooks jsonb := '[]'::jsonb;
  v_support jsonb := '[]'::jsonb;
  v_break_glass jsonb := '[]'::jsonb;
begin
  if p_tenant_id is null then
    raise exception 'tenant_required' using errcode = '22023';
  end if;

  if not security.can_access_platform_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_tenants := public.list_platform_tenants();

  select tenant_item
    into v_tenant
  from jsonb_array_elements(v_tenants) as tenant_item
  where tenant_item ->> 'id' = p_tenant_id::text
  limit 1;

  if v_tenant is null then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tm.id,
        'name', coalesce(p.full_name, p.email, 'Usuario'),
        'email', coalesce(p.email, ''),
        'role', tm.role_code,
        'status', case when p.is_active and tm.status = 'active' then 'active' else 'inactive' end,
        'membershipStatus', tm.status,
        'unitId', tm.unit_id,
        'mfaEnabled', false,
        'lastLogin', null,
        'createdAt', tm.created_at
      )
      order by p.full_name nulls last, p.email nulls last
    ),
    '[]'::jsonb
  )
    into v_users
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.tenant_id = p_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tu.id,
        'name', tu.name,
        'city', coalesce(tu.metadata ->> 'city', ''),
        'state', coalesce(tu.metadata ->> 'state', ''),
        'status', tu.status,
        'users', coalesce(unit_counts.users_count, 0),
        'patients', coalesce(unit_counts.patients_count, 0),
        'createdAt', tu.created_at
      )
      order by tu.created_at asc
    ),
    '[]'::jsonb
  )
    into v_units
  from public.tenant_units tu
  left join lateral (
    select
      (select count(*)::integer from public.tenant_memberships tm where tm.tenant_id = tu.tenant_id and tm.unit_id = tu.id) as users_count,
      (
        select count(*)::integer
        from public.patients p
        where p.tenant_id = tu.tenant_id
          and p.metadata ->> 'main_unit_id' = tu.id::text
      ) as patients_count
  ) unit_counts on true
  where tu.tenant_id = p_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', al.id,
        'action', al.action,
        'description', coalesce(al.metadata ->> 'description', al.action),
        'admin', coalesce(p.full_name, p.email, 'Sistema'),
        'timestamp', al.created_at,
        'category',
          case
            when al.action like '%billing%' or al.action like '%invoice%' or al.entity_type in ('patient_invoice', 'payment') then 'billing'
            when al.action like '%break_glass%' or al.action like '%security%' then 'security'
            when al.action like '%support%' then 'support'
            when al.action like '%webhook%' or al.action like '%integration%' then 'integration'
            else 'config'
          end
      )
      order by al.created_at desc
    ),
    '[]'::jsonb
  )
    into v_audit
  from (
    select *
    from public.audit_logs
    where tenant_id = p_tenant_id
    order by created_at desc
    limit 50
  ) al
  left join public.profiles p on p.id = al.user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', event.id,
        'event', event.event_type,
        'error', coalesce(event.error_message, ''),
        'severity', case when event.status = 'failed' and event.retry_count >= 3 then 'critico' when event.status = 'failed' then 'alto' else 'medio' end,
        'timestamp', event.created_at,
        'retries', event.retry_count,
        'status', case when event.status = 'failed' and event.retry_count >= 5 then 'dead_letter' when event.status = 'processed' then 'resolved' else 'pending' end
      )
      order by event.created_at desc
    ),
    '[]'::jsonb
  )
    into v_webhooks
  from (
    select *
    from public.admin_webhook_events
    where tenant_id = p_tenant_id
      and status in ('failed', 'received', 'ignored')
    order by created_at desc
    limit 50
  ) event;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ss.id,
        'status', ss.status,
        'priority', ss.priority,
        'subject', coalesce(ss.subject, 'Suporte operacional'),
        'assignedTo', coalesce(p.full_name, p.email),
        'openedAt', ss.created_at,
        'lastActivity', coalesce(ss.ended_at, ss.started_at, ss.created_at),
        'reason', ss.reason
      )
      order by ss.created_at desc
    ),
    '[]'::jsonb
  )
    into v_support
  from public.support_sessions ss
  left join public.profiles p on p.id = ss.user_id
  where ss.tenant_id = p_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', bg.id,
        'requestedBy', coalesce(requester.full_name, requester.email, 'Usuario'),
        'reason', bg.reason,
        'status', bg.status,
        'requestedAt', bg.created_at,
        'approvedBy', coalesce(approver.full_name, approver.email),
        'expiresAt', bg.expires_at,
        'scope', bg.scope
      )
      order by bg.created_at desc
    ),
    '[]'::jsonb
  )
    into v_break_glass
  from public.break_glass_requests bg
  left join public.profiles requester on requester.id = coalesce(bg.requested_by, bg.user_id)
  left join public.profiles approver on approver.id = bg.approved_by
  where bg.tenant_id = p_tenant_id;

  return jsonb_build_object(
    'tenant', v_tenant,
    'users', v_users,
    'units', v_units,
    'auditLogs', v_audit,
    'webhookErrors', v_webhooks,
    'supportSessions', v_support,
    'breakGlassRequests', v_break_glass
  );
end;
$$;

create or replace function public.request_platform_support_session(
  p_tenant_id uuid,
  p_subject text,
  p_reason text,
  p_priority text default 'medio'
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.support_sessions%rowtype;
  v_priority text := coalesce(nullif(btrim(p_priority), ''), 'medio');
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not security.can_access_platform_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_tenant_id is null then
    raise exception 'tenant_required' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 16 then
    raise exception 'support_reason_too_short' using errcode = '22023';
  end if;

  if v_priority not in ('urgente', 'alto', 'medio', 'baixo') then
    raise exception 'invalid_priority' using errcode = '22023';
  end if;

  insert into public.support_sessions (
    tenant_id,
    user_id,
    requested_by,
    subject,
    reason,
    priority,
    status,
    metadata
  )
  values (
    p_tenant_id,
    v_user_id,
    v_user_id,
    nullif(btrim(coalesce(p_subject, '')), ''),
    btrim(p_reason),
    v_priority,
    'requested',
    jsonb_build_object('source', 'platform_admin_rpc')
  )
  returning *
  into v_session;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    v_user_id,
    'platform_support_session.requested',
    'support_session',
    v_session.id::text,
    jsonb_build_object('priority', v_priority, 'subject', v_session.subject)
  );

  return jsonb_build_object('id', v_session.id, 'status', v_session.status);
end;
$$;

create or replace function public.end_platform_support_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.support_sessions%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not security.can_access_platform_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.support_sessions
     set status = 'ended',
         ended_at = now()
   where id = p_session_id
     and status in ('requested', 'active')
   returning *
   into v_session;

  if not found then
    raise exception 'support_session_not_found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_session.tenant_id,
    v_user_id,
    'platform_support_session.ended',
    'support_session',
    v_session.id::text,
    '{}'::jsonb
  );

  return jsonb_build_object('id', v_session.id, 'status', v_session.status);
end;
$$;

create or replace function public.request_platform_break_glass(
  p_tenant_id uuid,
  p_reason text,
  p_scope text,
  p_duration_minutes integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_duration integer := least(greatest(coalesce(p_duration_minutes, 120), 15), 240);
  v_scope text := nullif(btrim(coalesce(p_scope, '')), '');
  v_request public.break_glass_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not security.can_access_platform_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_tenant_id is null then
    raise exception 'tenant_required' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 24 then
    raise exception 'break_glass_reason_too_short' using errcode = '22023';
  end if;

  if v_scope is null or length(v_scope) < 8 then
    raise exception 'break_glass_scope_required' using errcode = '22023';
  end if;

  insert into public.break_glass_requests (
    tenant_id,
    user_id,
    requested_by,
    reason,
    scope,
    status,
    expires_at,
    metadata
  )
  values (
    p_tenant_id,
    v_user_id,
    v_user_id,
    btrim(p_reason),
    v_scope,
    'pending',
    now() + make_interval(mins => v_duration),
    jsonb_build_object('source', 'platform_admin_rpc', 'durationMinutes', v_duration)
  )
  returning *
  into v_request;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    v_user_id,
    'platform_break_glass.requested',
    'break_glass_request',
    v_request.id::text,
    jsonb_build_object('scope', v_scope, 'durationMinutes', v_duration)
  );

  return jsonb_build_object('id', v_request.id, 'status', v_request.status);
end;
$$;

create or replace function public.decide_platform_break_glass(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_decision text := lower(coalesce(p_decision, ''));
  v_existing public.break_glass_requests%rowtype;
  v_request public.break_glass_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not security.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_decision not in ('approved', 'denied') then
    raise exception 'invalid_break_glass_decision' using errcode = '22023';
  end if;

  select *
    into v_existing
  from public.break_glass_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'break_glass_request_not_found' using errcode = 'P0002';
  end if;

  if v_existing.status <> 'pending' then
    raise exception 'break_glass_request_already_decided' using errcode = '22023';
  end if;

  if v_decision = 'approved' and coalesce(v_existing.requested_by, v_existing.user_id) = v_user_id then
    raise exception 'break_glass_self_approval_forbidden' using errcode = '42501';
  end if;

  update public.break_glass_requests
     set status = v_decision,
         approved_by = case when v_decision = 'approved' then v_user_id else null end,
         decided_at = now()
   where id = p_request_id
   returning *
   into v_request;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_request.tenant_id,
    v_user_id,
    'platform_break_glass.' || v_decision,
    'break_glass_request',
    v_request.id::text,
    jsonb_build_object('scope', v_request.scope)
  );

  return jsonb_build_object('id', v_request.id, 'status', v_request.status);
end;
$$;

revoke all on function security.can_access_platform_operations() from public;
revoke all on function public.list_platform_tenants() from public;
revoke all on function public.list_platform_webhook_events(integer) from public;
revoke all on function public.get_platform_tenant_detail(uuid) from public;
revoke all on function public.request_platform_support_session(uuid, text, text, text) from public;
revoke all on function public.end_platform_support_session(uuid) from public;
revoke all on function public.request_platform_break_glass(uuid, text, text, integer) from public;
revoke all on function public.decide_platform_break_glass(uuid, text) from public;

grant execute on function security.can_access_platform_operations() to authenticated, service_role;
grant execute on function public.list_platform_tenants() to authenticated, service_role;
grant execute on function public.list_platform_webhook_events(integer) to authenticated, service_role;
grant execute on function public.get_platform_tenant_detail(uuid) to authenticated, service_role;
grant execute on function public.request_platform_support_session(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.end_platform_support_session(uuid) to authenticated, service_role;
grant execute on function public.request_platform_break_glass(uuid, text, text, integer) to authenticated, service_role;
grant execute on function public.decide_platform_break_glass(uuid, text) to authenticated, service_role;

comment on function public.list_platform_tenants() is 'Returns sanitized platform tenant management rows for platform admin/support users.';
comment on function public.get_platform_tenant_detail(uuid) is 'Returns sanitized tenant detail, users, units, audit, webhook, support and break-glass data for platform admin/support users.';
comment on function public.request_platform_break_glass(uuid, text, text, integer) is 'Creates an audited break-glass request with bounded duration and mandatory scope/reason.';
