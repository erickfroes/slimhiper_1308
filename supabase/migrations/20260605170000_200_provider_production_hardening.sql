-- Production hardening for provider-backed document and webhook surfaces.
-- Keeps clinical reads available while making provider writes backend-only.

create or replace function security.redact_operational_identifier(
  p_value text,
  p_fallback text default null
)
returns text
language sql
stable
parallel safe
set search_path = public, pg_temp
as $$
  with input as (
    select nullif(btrim(coalesce(p_value, p_fallback, '')), '') as raw_value
  )
  select case
    when raw_value is null then ''
    else 'op_' || substring(encode(public.digest(raw_value, 'sha256'), 'hex') from 1 for 12)
  end
  from input;
$$;

revoke all on function security.redact_operational_identifier(text, text) from public;
grant execute on function security.redact_operational_identifier(text, text)
  to authenticated, service_role;

drop policy if exists signature_requests_write on public.signature_requests;
drop policy if exists signature_signers_write on public.signature_signers;

revoke insert, update, delete on public.signature_requests from authenticated;
revoke insert, update, delete on public.signature_signers from authenticated;
grant select on public.signature_requests to authenticated, service_role;
grant select on public.signature_signers to authenticated, service_role;

comment on table public.signature_requests is
  'D4Sign signature request status. Clinical users may read rows through RLS; provider writes are backend/service-role only.';
comment on table public.signature_signers is
  'D4Sign signer status. Clinical users may read rows through RLS; provider writes are backend/service-role only.';

create or replace view public.admin_webhook_events
with (security_invoker = true)
as
select
  e.id,
  'Asaas'::text as provider,
  e.tenant_id,
  t.name as tenant_name,
  e.event_type,
  security.redact_operational_identifier(
    coalesce(e.asaas_event_id, e.external_reference, e.id::text),
    e.id::text
  ) as external_id,
  security.redact_operational_identifier(e.idempotency_key, e.id::text) as idempotency_key,
  coalesce(e.status, 'processed') as status,
  coalesce(e.retry_count, 0) as retry_count,
  e.error_message,
  e.created_at,
  e.processed_at,
  e.payload_summary
from public.asaas_events e
left join public.tenants t on t.id = e.tenant_id
union all
select
  e.id,
  'D4Sign'::text as provider,
  e.tenant_id,
  t.name as tenant_name,
  e.event_type,
  security.redact_operational_identifier(
    coalesce(e.provider_event_id, e.idempotency_key, e.id::text),
    e.id::text
  ) as external_id,
  security.redact_operational_identifier(e.idempotency_key, e.id::text) as idempotency_key,
  coalesce(e.status, 'processed') as status,
  coalesce(e.retry_count, 0) as retry_count,
  e.error_message,
  e.created_at,
  e.processed_at,
  e.payload_summary
from public.d4sign_events e
left join public.tenants t on t.id = e.tenant_id;

revoke all on public.admin_webhook_events from public;
grant select on public.admin_webhook_events to authenticated, service_role;

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
        'patientRef', security.redact_operational_identifier(event.payload_summary ->> 'patientRef'),
        'externalId',
          coalesce(nullif(event.external_id, ''), security.redact_operational_identifier(event.id::text)),
        'idempotencyKey',
          coalesce(nullif(event.idempotency_key, ''), security.redact_operational_identifier(event.id::text)),
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

revoke all on function public.list_platform_webhook_events(integer) from public;
grant execute on function public.list_platform_webhook_events(integer) to authenticated, service_role;

comment on view public.admin_webhook_events is
  'Unified webhook event monitor for Asaas and D4Sign with provider identifiers pseudonymized in SQL.';
comment on function public.list_platform_webhook_events(integer) is
  'Returns platform webhook events with tenant context and pseudonymized provider identifiers.';
