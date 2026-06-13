create or replace function public.request_webhook_reprocess(
  p_provider text,
  p_event_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_provider text := lower(coalesce(p_provider, ''));
  v_tenant_id uuid;
  v_reprocessable boolean := false;
  v_job_id uuid;
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not security.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(v_reason) < 12 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  if v_provider = 'asaas' then
    select ae.tenant_id, ae.status in ('failed', 'ignored', 'received')
      into v_tenant_id, v_reprocessable
    from public.asaas_events ae
    where ae.id = p_event_id;
  elsif v_provider = 'd4sign' then
    select de.tenant_id, de.status in ('failed', 'ignored', 'received', 'error')
      into v_tenant_id, v_reprocessable
    from public.d4sign_events de
    where de.id = p_event_id;
  else
    raise exception 'invalid_provider' using errcode = '22023';
  end if;

  if p_event_id is null or v_tenant_id is null then
    raise exception 'webhook_event_not_found' using errcode = '22023';
  end if;

  insert into public.webhook_reprocess_jobs (
    tenant_id, provider, event_id, status, reason, requested_by
  )
  values (
    v_tenant_id,
    v_provider,
    p_event_id,
    case when v_reprocessable then 'queued' else 'not_reprocessable' end,
    v_reason,
    v_user_id
  )
  returning id into v_job_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'webhook_reprocess.requested',
    'webhook_event',
    p_event_id::text,
    jsonb_build_object(
      'provider', v_provider,
      'jobId', v_job_id,
      'queued', v_reprocessable,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'id', v_job_id,
    'status', case when v_reprocessable then 'queued' else 'not_reprocessable' end
  );
end;
$$;

revoke all on function public.request_webhook_reprocess(text, uuid, text) from public;
grant execute on function public.request_webhook_reprocess(text, uuid, text) to authenticated, service_role;

comment on function public.request_webhook_reprocess(text, uuid, text) is
  'Creates an audited local webhook reprocess job for platform owner/admin users without calling external providers.';
