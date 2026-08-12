-- Provider-agnostic integration reliability layer. It deliberately stores
-- codes, digests and bounded operational summaries only: never raw payloads.

create table public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel text not null check (channel in ('communications', 'fiscal', 'payment')),
  operation text not null check (operation ~ '^[a-z0-9_.:-]{3,100}$'),
  idempotency_key text not null check (idempotency_key ~ '^[a-zA-Z0-9_.:-]{8,160}$'),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  payload_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_summary) = 'object'),
  status text not null default 'queued' check (status in ('queued', 'retry', 'processing', 'delivered', 'dead_letter', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 20),
  next_attempt_at timestamptz not null default now(),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_.:-]{3,80}$'),
  correlation_id text not null default ('int_' || replace(gen_random_uuid()::text, '-', '')),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel, idempotency_key)
);

create table public.integration_inbound_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel text not null check (channel in ('communications', 'fiscal', 'payment')),
  event_key text not null check (event_key ~ '^[a-zA-Z0-9_.:-]{8,160}$'),
  entity_key text not null check (entity_key ~ '^[a-zA-Z0-9_.:-]{3,160}$'),
  event_sequence bigint not null check (event_sequence >= 0),
  signature_valid boolean not null,
  status text not null check (status in ('received', 'processed', 'ignored', 'rejected')),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  payload_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_summary) = 'object'),
  rejection_code text check (rejection_code is null or rejection_code ~ '^[a-z0-9_.:-]{3,80}$'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (tenant_id, channel, event_key)
);

create table public.integration_entity_offsets (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel text not null check (channel in ('communications', 'fiscal', 'payment')),
  entity_key text not null,
  last_sequence bigint not null check (last_sequence >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, channel, entity_key)
);

create table public.integration_dead_letters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel text not null check (channel in ('communications', 'fiscal', 'payment')),
  outbox_id uuid references public.integration_outbox(id) on delete cascade,
  inbound_event_id uuid references public.integration_inbound_events(id) on delete cascade,
  reason_code text not null check (reason_code ~ '^[a-z0-9_.:-]{3,80}$'),
  attempts integer not null default 0 check (attempts >= 0),
  status text not null default 'open' check (status in ('open', 'replayed', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (num_nonnulls(outbox_id, inbound_event_id) = 1)
);

create index idx_integration_outbox_due on public.integration_outbox(status, next_attempt_at) where status in ('queued', 'retry');
create index idx_integration_inbound_entity_sequence on public.integration_inbound_events(tenant_id, channel, entity_key, event_sequence desc);
create index idx_integration_dead_letters_open on public.integration_dead_letters(tenant_id, channel, created_at desc) where status = 'open';

alter table public.integration_outbox enable row level security;
alter table public.integration_inbound_events enable row level security;
alter table public.integration_entity_offsets enable row level security;
alter table public.integration_dead_letters enable row level security;

revoke all on public.integration_outbox, public.integration_inbound_events, public.integration_entity_offsets, public.integration_dead_letters from anon, authenticated;
grant select, insert, update, delete on public.integration_outbox, public.integration_inbound_events, public.integration_entity_offsets, public.integration_dead_letters to service_role;
grant insert on public.audit_logs to service_role;

create or replace function security.integration_require_service_role()
returns void language plpgsql stable security definer set search_path = auth, pg_temp as $$
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.enqueue_integration_outbox(
  p_channel text, p_operation text, p_idempotency_key text, p_payload_digest text
)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('financial.write', false);
  v_row public.integration_outbox%rowtype;
begin
  if coalesce(p_channel, '') not in ('communications', 'fiscal', 'payment')
     or coalesce(p_operation, '') !~ '^[a-z0-9_.:-]{3,100}$'
     or coalesce(p_idempotency_key, '') !~ '^[a-zA-Z0-9_.:-]{8,160}$'
     or coalesce(p_payload_digest, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_integration_outbox_contract' using errcode = '22023';
  end if;
  insert into public.integration_outbox (tenant_id, channel, operation, idempotency_key, payload_digest, payload_summary)
  values (v_tenant_id, p_channel, p_operation, p_idempotency_key, p_payload_digest, jsonb_build_object('operation', p_operation))
  on conflict (tenant_id, channel, idempotency_key) do update set updated_at = public.integration_outbox.updated_at
  returning * into v_row;
  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'integration.outbox_enqueued', 'integration_outbox', v_row.id::text,
    jsonb_build_object('channel', v_row.channel, 'operation', v_row.operation, 'duplicate', v_row.created_at <> v_row.updated_at));
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'correlationId', v_row.correlation_id);
end;
$$;

create or replace function public.process_local_integration_outbox(p_outbox_id uuid, p_result text)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare
  v_row public.integration_outbox%rowtype;
  v_attempts integer;
  v_retryable boolean := p_result in ('timeout', 'http_429', 'http_500', 'ambiguous');
  v_dead_letter boolean := p_result in ('http_400', 'http_401') or p_result not in ('delivered', 'timeout', 'http_400', 'http_401', 'http_429', 'http_500', 'ambiguous');
begin
  perform security.integration_require_service_role();
  select * into v_row from public.integration_outbox where id = p_outbox_id for update;
  if not found then raise exception 'outbox_not_found' using errcode = 'P0002'; end if;
  if v_row.status in ('delivered', 'dead_letter', 'cancelled') then
    return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'replayed', true);
  end if;
  v_attempts := v_row.attempts + 1;
  if p_result = 'delivered' then
    update public.integration_outbox set status = 'delivered', attempts = v_attempts, delivered_at = now(), last_error_code = null, updated_at = now() where id = v_row.id;
  elsif v_retryable and v_attempts < 3 then
    update public.integration_outbox set status = 'retry', attempts = v_attempts, last_error_code = p_result,
      next_attempt_at = now() + make_interval(secs => (2 ^ least(v_attempts, 8))::integer), updated_at = now() where id = v_row.id;
  else
    update public.integration_outbox set status = 'dead_letter', attempts = v_attempts, last_error_code = p_result, updated_at = now() where id = v_row.id;
    insert into public.integration_dead_letters (tenant_id, channel, outbox_id, reason_code, attempts)
    values (v_row.tenant_id, v_row.channel, v_row.id, p_result, v_attempts)
    on conflict do nothing;
  end if;
  select * into v_row from public.integration_outbox where id = v_row.id;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'attempts', v_row.attempts, 'nextAttemptAt', v_row.next_attempt_at);
end;
$$;

create or replace function public.record_local_inbound_integration_event(
  p_tenant_id uuid, p_channel text, p_event_key text, p_entity_key text, p_event_sequence bigint, p_signature_valid boolean, p_payload_digest text
)
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare
  v_event public.integration_inbound_events%rowtype;
  v_offset bigint;
begin
  perform security.integration_require_service_role();
  if p_tenant_id is null or coalesce(p_channel, '') not in ('communications', 'fiscal', 'payment')
     or coalesce(p_event_key, '') !~ '^[a-zA-Z0-9_.:-]{8,160}$' or coalesce(p_entity_key, '') !~ '^[a-zA-Z0-9_.:-]{3,160}$'
     or p_event_sequence is null or p_event_sequence < 0 or coalesce(p_payload_digest, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_inbound_integration_contract' using errcode = '22023';
  end if;
  select * into v_event from public.integration_inbound_events where tenant_id = p_tenant_id and channel = p_channel and event_key = p_event_key;
  if found then return jsonb_build_object('id', v_event.id, 'status', v_event.status, 'duplicate', true); end if;
  if not p_signature_valid then
    insert into public.integration_inbound_events (tenant_id, channel, event_key, entity_key, event_sequence, signature_valid, status, payload_digest, rejection_code)
    values (p_tenant_id, p_channel, p_event_key, p_entity_key, p_event_sequence, false, 'rejected', p_payload_digest, 'signature_invalid') returning * into v_event;
    insert into public.integration_dead_letters (tenant_id, channel, inbound_event_id, reason_code) values (p_tenant_id, p_channel, v_event.id, 'signature_invalid');
    return jsonb_build_object('id', v_event.id, 'status', 'rejected');
  end if;
  select last_sequence into v_offset from public.integration_entity_offsets where tenant_id = p_tenant_id and channel = p_channel and entity_key = p_entity_key for update;
  insert into public.integration_inbound_events (tenant_id, channel, event_key, entity_key, event_sequence, signature_valid, status, payload_digest, processed_at)
  values (p_tenant_id, p_channel, p_event_key, p_entity_key, p_event_sequence, true, case when v_offset is not null and p_event_sequence <= v_offset then 'ignored' else 'processed' end, p_payload_digest,
          case when v_offset is not null and p_event_sequence <= v_offset then null else now() end) returning * into v_event;
  if v_event.status = 'processed' then
    insert into public.integration_entity_offsets (tenant_id, channel, entity_key, last_sequence) values (p_tenant_id, p_channel, p_entity_key, p_event_sequence)
    on conflict (tenant_id, channel, entity_key) do update set last_sequence = excluded.last_sequence, updated_at = now();
  end if;
  return jsonb_build_object('id', v_event.id, 'status', v_event.status, 'duplicate', false);
end;
$$;

create or replace function public.get_integration_reconciliation()
returns jsonb language plpgsql security definer set search_path = public, security, pg_temp as $$
declare v_tenant_id uuid := security.resolve_current_tenant('financial.read', false);
begin
  return jsonb_build_object(
    'queued', (select count(*) from public.integration_outbox where tenant_id = v_tenant_id and status in ('queued', 'retry')),
    'deadLetters', (select count(*) from public.integration_dead_letters where tenant_id = v_tenant_id and status = 'open'),
    'rejectedInbound', (select count(*) from public.integration_inbound_events where tenant_id = v_tenant_id and status = 'rejected'),
    'outOfOrderIgnored', (select count(*) from public.integration_inbound_events where tenant_id = v_tenant_id and status = 'ignored')
  );
end;
$$;

revoke all on function public.enqueue_integration_outbox(text, text, text, text) from public;
revoke all on function public.get_integration_reconciliation() from public;
revoke all on function public.process_local_integration_outbox(uuid, text) from public;
revoke all on function public.record_local_inbound_integration_event(uuid, text, text, text, bigint, boolean, text) from public;
grant execute on function public.enqueue_integration_outbox(text, text, text, text), public.get_integration_reconciliation() to authenticated, service_role;
grant execute on function public.process_local_integration_outbox(uuid, text), public.record_local_inbound_integration_event(uuid, text, text, text, bigint, boolean, text) to service_role;
