-- M16: operational jobs, automations, versioned cron and observability.
-- Jobs are service-role/backend only, bounded per execution, dry-run capable,
-- and audited through sanitized aggregate run records.

do $$
begin
  create extension if not exists pg_cron;
exception
  when insufficient_privilege or undefined_file or feature_not_supported then
    raise notice 'pg_cron is not available in this environment; job definitions remain versioned.';
end
$$;

create table if not exists public.operational_job_definitions (
  job_key text primary key,
  display_name text not null,
  category text not null
    check (category in (
      'agenda',
      'patient_app',
      'communications',
      'crm',
      'inventory',
      'billing',
      'webhooks',
      'compliance',
      'provider',
      'one_shot'
    )),
  execution_kind text not null
    check (execution_kind in ('recurring', 'one_shot', 'admin_check')),
  handler_name text not null,
  schedule_cron text,
  timezone text not null default 'America/Sao_Paulo',
  cron_job_name text unique,
  cron_enabled boolean not null default false,
  is_enabled boolean not null default true,
  default_limit integer not null default 100 check (default_limit between 1 and 1000),
  max_limit integer not null default 500 check (max_limit between 1 and 2000),
  expected_max_lag interval not null default interval '2 hours',
  dry_run_supported boolean not null default true,
  service_role_only boolean not null default true,
  description text,
  runbook_href text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_job_limit_order check (max_limit >= default_limit),
  constraint operational_job_cron_requirements check (
    not cron_enabled
    or (
      execution_kind = 'recurring'
      and nullif(schedule_cron, '') is not null
      and nullif(cron_job_name, '') is not null
    )
  )
);

create table if not exists public.operational_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null references public.operational_job_definitions(job_key) on delete restrict,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'skipped')),
  trigger_source text not null default 'manual'
    check (trigger_source in ('cron', 'manual', 'edge', 'script', 'migration', 'admin')),
  dry_run boolean not null default true,
  requested_limit integer not null check (requested_limit between 1 and 2000),
  requested_by uuid references public.profiles(id) on delete set null,
  correlation_id text not null default ('job_' || replace(gen_random_uuid()::text, '-', '')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  succeeded_count integer not null default 0 check (succeeded_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

select security.touch_updated_at('public.operational_job_definitions');

create index if not exists idx_operational_job_definitions_category
  on public.operational_job_definitions(category, execution_kind, is_enabled);

create index if not exists idx_operational_job_runs_job_started
  on public.operational_job_runs(job_key, started_at desc);

create index if not exists idx_operational_job_runs_status_started
  on public.operational_job_runs(status, started_at desc);

alter table public.operational_job_definitions enable row level security;
alter table public.operational_job_runs enable row level security;

drop policy if exists operational_job_definitions_select_platform on public.operational_job_definitions;
create policy operational_job_definitions_select_platform
on public.operational_job_definitions for select
to authenticated
using (security.can_access_platform_operations());

drop policy if exists operational_job_runs_select_platform on public.operational_job_runs;
create policy operational_job_runs_select_platform
on public.operational_job_runs for select
to authenticated
using (security.can_access_platform_operations());

grant select on public.operational_job_definitions to authenticated, service_role;
grant select, insert, update on public.operational_job_definitions to service_role;
grant select on public.operational_job_runs to authenticated, service_role;
grant insert, update on public.operational_job_runs to service_role;

create or replace function security.m16_sanitize_job_text(p_value text, p_max_length integer default 500)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_text text := coalesce(p_value, '');
  v_max integer := least(greatest(coalesce(p_max_length, 500), 1), 1000);
begin
  v_text := regexp_replace(v_text, '[[:cntrl:]]+', ' ', 'g');
  v_text := regexp_replace(v_text, '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', '[email]', 'gi');
  v_text := regexp_replace(v_text, 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}', '[jwt]', 'g');
  v_text := regexp_replace(v_text, '([?&](token|secret|key|signature|crypt_key|access_token|refresh_token)=)[^&[:space:]]+', '\1[redacted]', 'gi');
  v_text := regexp_replace(v_text, '([A-Za-z0-9_-]{36,})', '[redacted]', 'g');
  return left(btrim(v_text), v_max);
end;
$$;

create or replace function security.m16_assert_job_caller()
returns void
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.role() = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return;
  end if;

  raise exception 'service_role_required' using errcode = '42501';
end;
$$;

create or replace function security.m16_job_checkin_reminders(
  p_execute boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_candidates integer := 0;
  v_inserted integer := 0;
begin
  perform security.m16_assert_job_caller();

  drop table if exists pg_temp.m16_checkin_candidates;
  create temp table m16_checkin_candidates on commit drop as
  select
    pc.tenant_id,
    pc.id as checkin_id,
    pc.patient_id,
    pc.title,
    pc.due_date,
    account_row.user_id
  from public.patient_program_checkins pc
  join public.patient_program_enrollments e
    on e.tenant_id = pc.tenant_id
   and e.id = pc.enrollment_id
   and e.status in ('ativo', 'aguardando')
  left join lateral (
    select pa.user_id
    from public.patient_accounts pa
    where pa.tenant_id = pc.tenant_id
      and pa.patient_id = pc.patient_id
      and pa.status = 'active'
    order by pa.linked_at desc nulls last, pa.created_at desc
    limit 1
  ) account_row on true
  where pc.status in ('scheduled', 'sent', 'overdue')
    and pc.due_date <= current_date + 1
    and not exists (
      select 1
      from public.notifications n
      where n.tenant_id = pc.tenant_id
        and n.patient_id = pc.patient_id
        and n.metadata ->> 'jobKey' = 'checkin.reminder'
        and n.metadata ->> 'checkinId' = pc.id::text
        and n.created_at >= now() - interval '36 hours'
    )
  order by pc.due_date asc, pc.created_at asc
  limit v_limit;

  select count(*)::integer into v_candidates from m16_checkin_candidates;

  if p_execute and v_candidates > 0 then
    insert into public.notifications (
      tenant_id,
      user_id,
      patient_id,
      title,
      body,
      category,
      status,
      metadata,
      moderation_status,
      retention_until
    )
    select
      c.tenant_id,
      c.user_id,
      c.patient_id,
      'Check-in pendente',
      'Ha um check-in do programa aguardando resposta.',
      'patient_app',
      'unread',
      jsonb_build_object(
        'source', 'm16_operational_job',
        'jobKey', 'checkin.reminder',
        'checkinId', c.checkin_id,
        'dueDate', c.due_date,
        'href', '/portal?tab=checkins'
      ),
      'approved',
      now() + interval '2 years'
    from m16_checkin_candidates c;

    get diagnostics v_inserted = row_count;
  end if;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_inserted,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_inserted, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object(
      'candidateCheckins', v_candidates,
      'notificationsInserted', v_inserted
    )
  );
end;
$$;

create or replace function security.m16_job_medication_reminders(
  p_execute boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_candidates integer := 0;
  v_inserted integer := 0;
begin
  perform security.m16_assert_job_caller();

  drop table if exists pg_temp.m16_medication_candidates;
  create temp table m16_medication_candidates on commit drop as
  select
    mr.tenant_id,
    mr.id as reminder_id,
    mr.patient_id,
    account_row.user_id
  from public.medication_reminders mr
  left join lateral (
    select pa.user_id
    from public.patient_accounts pa
    where pa.tenant_id = mr.tenant_id
      and pa.patient_id = mr.patient_id
      and pa.status = 'active'
    order by pa.linked_at desc nulls last, pa.created_at desc
    limit 1
  ) account_row on true
  where mr.status = 'active'
    and mr.start_date <= current_date
    and (mr.end_date is null or mr.end_date >= current_date)
    and coalesce(array_length(mr.schedule_times, 1), 0) > 0
    and not exists (
      select 1
      from public.notifications n
      where n.tenant_id = mr.tenant_id
        and n.patient_id = mr.patient_id
        and n.metadata ->> 'jobKey' = 'medication.reminder'
        and n.metadata ->> 'reminderId' = mr.id::text
        and n.metadata ->> 'reminderDate' = current_date::text
    )
  order by mr.created_at asc
  limit v_limit;

  select count(*)::integer into v_candidates from m16_medication_candidates;

  if p_execute and v_candidates > 0 then
    insert into public.notifications (
      tenant_id,
      user_id,
      patient_id,
      title,
      body,
      category,
      status,
      metadata,
      moderation_status,
      retention_until
    )
    select
      c.tenant_id,
      c.user_id,
      c.patient_id,
      'Lembrete do tratamento',
      'Confira os lembretes ativos do seu tratamento.',
      'patient_app',
      'unread',
      jsonb_build_object(
        'source', 'm16_operational_job',
        'jobKey', 'medication.reminder',
        'reminderId', c.reminder_id,
        'reminderDate', current_date,
        'href', '/portal?tab=jornada'
      ),
      'approved',
      now() + interval '2 years'
    from m16_medication_candidates c;

    get diagnostics v_inserted = row_count;
  end if;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_inserted,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_inserted, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object(
      'candidateMedicationReminders', v_candidates,
      'notificationsInserted', v_inserted
    )
  );
end;
$$;

create or replace function security.m16_job_detect_stuck_attendance(
  p_execute boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_threshold_minutes integer := 45;
  v_candidates integer := 0;
  v_updated integer := 0;
begin
  perform security.m16_assert_job_caller();

  drop table if exists pg_temp.m16_stuck_attendance_candidates;
  create temp table m16_stuck_attendance_candidates on commit drop as
  select
    q.tenant_id,
    q.id as queue_id,
    q.appointment_id,
    q.patient_id,
    q.status as from_status,
    a.status as appointment_status
  from public.attendance_queue q
  join public.appointments a
    on a.tenant_id = q.tenant_id
   and a.id = q.appointment_id
  where q.status in ('scheduled', 'waiting', 'called', 'in_attendance', 'checkout')
    and coalesce(q.last_status_at, q.created_at) <= now() - (v_threshold_minutes * interval '1 minute')
  order by coalesce(q.last_status_at, q.created_at) asc
  limit v_limit;

  select count(*)::integer into v_candidates from m16_stuck_attendance_candidates;

  if p_execute and v_candidates > 0 then
    insert into public.attendance_status_history (
      tenant_id,
      queue_id,
      appointment_id,
      patient_id,
      from_status,
      to_status,
      appointment_status,
      actor_id,
      metadata
    )
    select
      c.tenant_id,
      c.queue_id,
      c.appointment_id,
      c.patient_id,
      c.from_status,
      'stuck',
      c.appointment_status,
      null,
      jsonb_build_object('thresholdMinutes', v_threshold_minutes, 'source', 'm16_operational_job')
    from m16_stuck_attendance_candidates c;

    update public.attendance_queue q
       set status = 'stuck',
           stuck_detected_at = now(),
           updated_at = now()
      from m16_stuck_attendance_candidates c
     where q.tenant_id = c.tenant_id
       and q.id = c.queue_id
       and q.status = c.from_status;

    get diagnostics v_updated = row_count;

    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    select
      c.tenant_id,
      null,
      'attendance.stuck_detected',
      'attendance_queue',
      null,
      jsonb_build_object(
        'source', 'm16_operational_job',
        'count', count(*)::integer,
        'thresholdMinutes', v_threshold_minutes
      )
    from m16_stuck_attendance_candidates c
    group by c.tenant_id;
  end if;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_updated,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_updated, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object(
      'candidateAttendanceRows', v_candidates,
      'markedStuck', v_updated,
      'thresholdMinutes', v_threshold_minutes
    )
  );
end;
$$;

create or replace function security.m16_job_expire_communications(
  p_execute boolean default false,
  p_limit integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 250), 1), 1000);
  v_message_candidates integer := 0;
  v_notification_candidates integer := 0;
  v_thread_candidates integer := 0;
  v_messages_archived integer := 0;
  v_notifications_archived integer := 0;
  v_threads_archived integer := 0;
  v_candidates integer := 0;
  v_updated integer := 0;
begin
  perform security.m16_assert_job_caller();

  drop table if exists pg_temp.m16_expired_messages;
  create temp table m16_expired_messages on commit drop as
  select tenant_id, id
  from public.patient_chat_messages
  where archived_at is null
    and retention_until is not null
    and retention_until < now()
  order by retention_until asc, created_at asc
  limit v_limit;

  drop table if exists pg_temp.m16_expired_notifications;
  create temp table m16_expired_notifications on commit drop as
  select tenant_id, id
  from public.notifications
  where archived_at is null
    and retention_until is not null
    and retention_until < now()
  order by retention_until asc, created_at asc
  limit v_limit;

  drop table if exists pg_temp.m16_expired_threads;
  create temp table m16_expired_threads on commit drop as
  select pct.tenant_id, pct.id
  from public.patient_chat_threads pct
  where pct.archived_at is null
    and pct.retention_until is not null
    and pct.retention_until < now()
    and not exists (
      select 1
      from public.patient_chat_messages pcm
      where pcm.tenant_id = pct.tenant_id
        and pcm.thread_id = pct.id
        and pcm.archived_at is null
    )
  order by pct.retention_until asc, pct.created_at asc
  limit v_limit;

  select count(*)::integer into v_message_candidates from m16_expired_messages;
  select count(*)::integer into v_notification_candidates from m16_expired_notifications;
  select count(*)::integer into v_thread_candidates from m16_expired_threads;
  v_candidates := v_message_candidates + v_notification_candidates + v_thread_candidates;

  if p_execute and v_candidates > 0 then
    update public.patient_chat_messages pcm
       set archived_at = now()
      from m16_expired_messages c
     where pcm.tenant_id = c.tenant_id
       and pcm.id = c.id
       and pcm.archived_at is null;
    get diagnostics v_messages_archived = row_count;

    update public.notifications n
       set archived_at = now(),
           status = 'archived',
           read_at = coalesce(read_at, now())
      from m16_expired_notifications c
     where n.tenant_id = c.tenant_id
       and n.id = c.id
       and n.archived_at is null;
    get diagnostics v_notifications_archived = row_count;

    update public.patient_chat_threads pct
       set archived_at = now(),
           status = 'archived',
           updated_at = now()
      from m16_expired_threads c
     where pct.tenant_id = c.tenant_id
       and pct.id = c.id
       and pct.archived_at is null;
    get diagnostics v_threads_archived = row_count;
  end if;

  v_updated := v_messages_archived + v_notifications_archived + v_threads_archived;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_updated,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_updated, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object(
      'candidateMessages', v_message_candidates,
      'candidateNotifications', v_notification_candidates,
      'candidateThreads', v_thread_candidates,
      'archivedMessages', v_messages_archived,
      'archivedNotifications', v_notifications_archived,
      'archivedThreads', v_threads_archived
    )
  );
end;
$$;

create or replace function security.m16_job_crm_retention(
  p_execute boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_result jsonb;
  v_candidates integer := 0;
  v_redacted integer := 0;
begin
  perform security.m16_assert_job_caller();
  perform set_config('request.jwt.claim.role', 'service_role', true);

  v_result := public.expire_crm_leads_for_retention(p_execute, v_limit);
  v_candidates := coalesce((v_result ->> 'candidateLeads')::integer, 0);
  v_redacted := coalesce((v_result ->> 'redactedLeads')::integer, 0);

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_redacted,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_redacted, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', v_result
  );
end;
$$;

create or replace function security.m16_job_inventory_notifications(
  p_execute boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_candidates integer := 0;
  v_inserted integer := 0;
  v_days_to_expiry integer := 30;
begin
  perform security.m16_assert_job_caller();

  drop table if exists pg_temp.m16_inventory_alert_candidates;
  create temp table m16_inventory_alert_candidates on commit drop as
  with alerts as (
    select
      i.tenant_id,
      'minimum_stock'::text as alert_type,
      case when coalesce(sum(s.quantity_on_hand), 0) <= 0 then 'critical' else 'high' end as severity,
      i.id as item_id,
      null::uuid as lot_id,
      coalesce(sum(s.quantity_on_hand), 0)::text as quantity_on_hand,
      i.minimum_quantity::text as threshold,
      null::date as expires_at
    from public.inventory_items i
    left join public.inventory_stock_snapshots s
      on s.tenant_id = i.tenant_id
     and s.item_id = i.id
    where i.status = 'active'
      and i.minimum_quantity > 0
    group by i.tenant_id, i.id, i.minimum_quantity
    having coalesce(sum(s.quantity_on_hand), 0) <= i.minimum_quantity
    union all
    select
      l.tenant_id,
      'lot_expiry'::text as alert_type,
      case when l.expires_at < current_date then 'critical' else 'medium' end as severity,
      l.item_id,
      l.id as lot_id,
      coalesce(s.quantity_on_hand, 0)::text as quantity_on_hand,
      v_days_to_expiry::text as threshold,
      l.expires_at
    from public.inventory_lots l
    left join public.inventory_stock_snapshots s
      on s.tenant_id = l.tenant_id
     and s.lot_id = l.id
    where l.status = 'active'
      and l.expires_at is not null
      and l.expires_at <= current_date + (v_days_to_expiry || ' days')::interval
      and coalesce(s.quantity_on_hand, 0) > 0
  )
  select *
  from alerts a
  where not exists (
    select 1
    from public.notifications n
    where n.tenant_id = a.tenant_id
      and n.metadata ->> 'jobKey' = 'inventory.notification'
      and n.metadata ->> 'alertType' = a.alert_type
      and n.metadata ->> 'itemId' = a.item_id::text
      and coalesce(n.metadata ->> 'lotId', '') = coalesce(a.lot_id::text, '')
      and n.created_at >= now() - interval '24 hours'
  )
  order by
    case a.severity when 'critical' then 0 when 'high' then 1 else 2 end,
    a.tenant_id,
    a.item_id
  limit v_limit;

  select count(*)::integer into v_candidates from m16_inventory_alert_candidates;

  if p_execute and v_candidates > 0 then
    insert into public.notifications (
      tenant_id,
      user_id,
      patient_id,
      title,
      body,
      category,
      status,
      metadata,
      moderation_status,
      retention_until
    )
    select
      c.tenant_id,
      null,
      null,
      case when c.alert_type = 'minimum_stock' then 'Estoque abaixo do minimo' else 'Lote com validade critica' end,
      case when c.alert_type = 'minimum_stock' then 'Revise a reposicao do item em estoque.' else 'Revise lotes vencidos ou proximos do vencimento.' end,
      'inventory',
      'unread',
      jsonb_build_object(
        'source', 'm16_operational_job',
        'jobKey', 'inventory.notification',
        'alertType', c.alert_type,
        'severity', c.severity,
        'itemId', c.item_id,
        'lotId', c.lot_id,
        'quantityOnHand', c.quantity_on_hand,
        'threshold', c.threshold,
        'expiresAt', c.expires_at,
        'href', '/clinic/estoque'
      ),
      'approved',
      now() + interval '2 years'
    from m16_inventory_alert_candidates c;

    get diagnostics v_inserted = row_count;
  end if;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_inserted,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_inserted, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object(
      'candidateAlerts', v_candidates,
      'notificationsInserted', v_inserted,
      'daysToExpiry', v_days_to_expiry
    )
  );
end;
$$;

create or replace function security.m16_job_billing_asaas_reconciliation(
  p_execute boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_candidates integer := 0;
  v_queued integer := 0;
  v_pending_receipts integer := 0;
  v_divergences integer := 0;
begin
  perform security.m16_assert_job_caller();

  drop table if exists pg_temp.m16_billing_candidates;
  create temp table m16_billing_candidates on commit drop as
  select
    i.tenant_id,
    i.id as patient_invoice_id
  from public.patient_invoices i
  where i.asaas_invoice_id is not null
    and public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) in ('pendente', 'vencido')
    and not exists (
      select 1
      from public.billing_sync_jobs bsj
      where bsj.tenant_id = i.tenant_id
        and bsj.patient_invoice_id = i.id
        and bsj.status in ('queued', 'processing')
    )
  order by i.due_date asc nulls last, i.created_at asc
  limit v_limit;

  select count(*)::integer into v_candidates from m16_billing_candidates;

  select count(*)::integer into v_pending_receipts
  from public.payment_receipts pr
  where pr.status = 'pending_review';

  select count(*)::integer into v_divergences
  from public.asaas_events ae
  where ae.status in ('failed', 'ignored');

  drop table if exists pg_temp.m16_billing_inserted;
  create temp table m16_billing_inserted (tenant_id uuid) on commit drop;

  if p_execute and v_candidates > 0 then
    with inserted as (
      insert into public.billing_sync_jobs (
        tenant_id,
        patient_invoice_id,
        status,
        source,
        reason,
        requested_by,
        metadata
      )
      select
        c.tenant_id,
        c.patient_invoice_id,
        'queued',
        'cron',
        'pending_or_overdue_reconciliation',
        null,
        jsonb_build_object('source', 'm16_operational_job', 'jobKey', 'billing.asaas_reconciliation')
      from m16_billing_candidates c
      returning tenant_id
    )
    insert into m16_billing_inserted(tenant_id)
    select tenant_id from inserted;

    get diagnostics v_queued = row_count;

    insert into public.billing_reconciliation_runs (
      tenant_id,
      source,
      status,
      checked_invoice_count,
      queued_sync_count,
      pending_receipt_count,
      divergence_count,
      metadata
    )
    select
      tenant_row.tenant_id,
      'cron',
      'completed',
      coalesce(candidate_row.checked_invoice_count, 0),
      coalesce(inserted_row.queued_sync_count, 0),
      coalesce(receipt_row.pending_receipt_count, 0),
      coalesce(divergence_row.divergence_count, 0),
      jsonb_build_object('source', 'm16_operational_job', 'jobKey', 'billing.asaas_reconciliation', 'limit', v_limit)
    from (
      select tenant_id from m16_billing_candidates
      union
      select tenant_id from m16_billing_inserted
    ) tenant_row
    left join lateral (
      select count(*)::integer as checked_invoice_count
      from m16_billing_candidates c
      where c.tenant_id = tenant_row.tenant_id
    ) candidate_row on true
    left join lateral (
      select count(*)::integer as queued_sync_count
      from m16_billing_inserted i
      where i.tenant_id = tenant_row.tenant_id
    ) inserted_row on true
    left join lateral (
      select count(*)::integer as pending_receipt_count
      from public.payment_receipts pr
      where pr.tenant_id = tenant_row.tenant_id
        and pr.status = 'pending_review'
    ) receipt_row on true
    left join lateral (
      select count(*)::integer as divergence_count
      from public.asaas_events ae
      where ae.tenant_id = tenant_row.tenant_id
        and ae.status in ('failed', 'ignored')
    ) divergence_row on true;
  end if;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_queued,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_queued, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object(
      'candidateInvoices', v_candidates,
      'syncJobsQueued', v_queued,
      'pendingReceiptCount', v_pending_receipts,
      'divergenceCount', v_divergences
    )
  );
end;
$$;

create or replace function security.m16_job_webhook_reprocess(
  p_execute boolean default false,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_candidates integer := 0;
  v_not_reprocessable integer := 0;
  v_missing_worker integer := 0;
begin
  perform security.m16_assert_job_caller();

  drop table if exists pg_temp.m16_webhook_reprocess_candidates;
  create temp table m16_webhook_reprocess_candidates on commit drop as
  select
    wrj.id as job_id,
    wrj.tenant_id,
    wrj.provider,
    wrj.event_id,
    coalesce(ae.status, de.status) as event_status,
    case
      when wrj.provider = 'asaas' and ae.id is null then 'event_missing'
      when wrj.provider = 'd4sign' and de.id is null then 'event_missing'
      when coalesce(ae.status, de.status) not in ('failed', 'ignored', 'received') then 'event_not_reprocessable'
      else null
    end as skip_reason
  from public.webhook_reprocess_jobs wrj
  left join public.asaas_events ae
    on wrj.provider = 'asaas'
   and ae.id = wrj.event_id
  left join public.d4sign_events de
    on wrj.provider = 'd4sign'
   and de.id = wrj.event_id
  where wrj.status = 'queued'
  order by wrj.created_at asc
  limit v_limit;

  select count(*)::integer into v_candidates from m16_webhook_reprocess_candidates;

  if p_execute and v_candidates > 0 then
    update public.webhook_reprocess_jobs wrj
       set status = 'not_reprocessable',
           processed_at = now(),
           error_message = c.skip_reason
      from m16_webhook_reprocess_candidates c
     where wrj.id = c.job_id
       and c.skip_reason is not null;
    get diagnostics v_not_reprocessable = row_count;

    update public.webhook_reprocess_jobs wrj
       set status = 'failed',
           processed_at = now(),
           error_message = 'provider_replay_worker_not_configured'
      from m16_webhook_reprocess_candidates c
     where wrj.id = c.job_id
       and c.skip_reason is null;
    get diagnostics v_missing_worker = row_count;

    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    select
      c.tenant_id,
      null,
      'webhook_reprocess.worker_triaged',
      'webhook_reprocess_job',
      c.job_id::text,
      jsonb_build_object(
        'provider', c.provider,
        'eventId', c.event_id,
        'outcome', coalesce(c.skip_reason, 'provider_replay_worker_not_configured')
      )
    from m16_webhook_reprocess_candidates c
    where c.tenant_id is not null;
  end if;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_not_reprocessable,
    'failedCount', v_missing_worker,
    'skippedCount', case when p_execute then 0 else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object(
      'queuedJobsScanned', v_candidates,
      'notReprocessable', v_not_reprocessable,
      'requiresProviderReplayWorker', v_missing_worker,
      'rawPayloadReplay', false
    )
  );
end;
$$;

create or replace function security.m16_job_compliance_readiness(
  p_execute boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_tenant record;
  v_candidates integer := 0;
  v_evaluated integer := 0;
  v_open_gaps integer := 0;
  v_critical_gaps integer := 0;
begin
  perform security.m16_assert_job_caller();

  drop table if exists pg_temp.m16_compliance_tenants;
  create temp table m16_compliance_tenants on commit drop as
  select t.id as tenant_id
  from public.tenants t
  where t.status <> 'archived'
  order by t.created_at asc
  limit v_limit;

  select count(*)::integer into v_candidates from m16_compliance_tenants;

  if p_execute then
    for v_tenant in select tenant_id from m16_compliance_tenants
    loop
      perform security.evaluate_tenant_compliance_gaps(v_tenant.tenant_id);
      v_evaluated := v_evaluated + 1;
    end loop;
  end if;

  select
    count(*) filter (where cg.status in ('open', 'acknowledged'))::integer,
    count(*) filter (where cg.status in ('open', 'acknowledged') and cg.severity = 'critical')::integer
    into v_open_gaps, v_critical_gaps
  from public.compliance_gaps cg
  join m16_compliance_tenants t
    on t.tenant_id = cg.tenant_id;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_evaluated,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_evaluated, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object(
      'candidateTenants', v_candidates,
      'evaluatedTenants', v_evaluated,
      'openGaps', coalesce(v_open_gaps, 0),
      'criticalGaps', coalesce(v_critical_gaps, 0)
    )
  );
end;
$$;

create or replace function security.m16_job_provider_healthcheck(
  p_execute boolean default false,
  p_limit integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenants integer := 0;
  v_asaas_active integer := 0;
  v_asaas_attention integer := 0;
  v_d4sign_configured integer := 0;
  v_d4sign_attention integer := 0;
  v_webhook_failures integer := 0;
begin
  perform security.m16_assert_job_caller();

  select count(*)::integer into v_tenants
  from public.tenants
  where status <> 'archived';

  select
    count(*) filter (where coalesce(a.status, '') in ('active', 'enabled'))::integer,
    count(*) filter (where coalesce(a.status, '') not in ('active', 'enabled', ''))::integer
    into v_asaas_active, v_asaas_attention
  from public.asaas_subaccounts a;

  select
    count(*) filter (where coalesce(t.settings #>> '{integrations,d4sign,status}', '') in ('active', 'enabled'))::integer,
    count(*) filter (where coalesce(t.settings #>> '{integrations,d4sign,status}', '') in ('error', 'failed', 'blocked'))::integer
    into v_d4sign_configured, v_d4sign_attention
  from public.tenants t
  where t.status <> 'archived';

  select count(*)::integer into v_webhook_failures
  from public.admin_webhook_events e
  where e.status in ('failed', 'ignored')
    and e.created_at >= now() - interval '24 hours';

  return jsonb_build_object(
    'processedCount', 1,
    'succeededCount', 1,
    'failedCount', 0,
    'skippedCount', 0,
    'dryRun', not p_execute,
    'limit', least(greatest(coalesce(p_limit, 1), 1), 1),
    'summary', jsonb_build_object(
      'tenants', v_tenants,
      'asaasActive', coalesce(v_asaas_active, 0),
      'asaasAttention', coalesce(v_asaas_attention, 0),
      'd4signConfigured', coalesce(v_d4sign_configured, 0),
      'd4signAttention', coalesce(v_d4sign_attention, 0),
      'webhookFailures24h', coalesce(v_webhook_failures, 0),
      'externalProviderCalls', false
    )
  );
end;
$$;

create or replace function security.m16_job_one_shot_placeholder(
  p_job_key text,
  p_execute boolean default false,
  p_limit integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  perform security.m16_assert_job_caller();

  return jsonb_build_object(
    'processedCount', 0,
    'succeededCount', 0,
    'failedCount', 0,
    'skippedCount', 1,
    'dryRun', not p_execute,
    'limit', least(greatest(coalesce(p_limit, 1), 1), 1),
    'summary', jsonb_build_object(
      'jobKey', p_job_key,
      'executionKind', 'one_shot',
      'status', 'documented_not_scheduled',
      'reason', 'One-shot jobs must run from reviewed backend scripts, not recurring cron.'
    )
  );
end;
$$;

create or replace function security.run_operational_job_internal(
  p_job_key text,
  p_dry_run boolean default true,
  p_limit integer default null,
  p_trigger_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_job public.operational_job_definitions%rowtype;
  v_run_id uuid;
  v_started_at timestamptz := clock_timestamp();
  v_summary jsonb := '{}'::jsonb;
  v_limit integer;
  v_trigger text := case
    when lower(coalesce(p_trigger_source, 'manual')) in ('cron', 'manual', 'edge', 'script', 'migration', 'admin')
      then lower(coalesce(p_trigger_source, 'manual'))
    else 'manual'
  end;
  v_locked boolean := false;
  v_error_message text;
  v_error_code text;
begin
  perform security.m16_assert_job_caller();

  select *
    into v_job
  from public.operational_job_definitions
  where job_key = p_job_key;

  if v_job.job_key is null then
    raise exception 'operational_job_not_found' using errcode = '22023';
  end if;

  v_limit := least(greatest(coalesce(p_limit, v_job.default_limit), 1), v_job.max_limit);

  v_locked := pg_try_advisory_xact_lock(hashtext(v_job.job_key));

  insert into public.operational_job_runs (
    job_key,
    status,
    trigger_source,
    dry_run,
    requested_limit,
    requested_by,
    started_at,
    summary
  )
  values (
    v_job.job_key,
    'running',
    v_trigger,
    coalesce(p_dry_run, true),
    v_limit,
    auth.uid(),
    v_started_at,
    jsonb_build_object('jobKey', v_job.job_key, 'phase', 'started')
  )
  returning id into v_run_id;

  if not v_job.is_enabled then
    v_summary := jsonb_build_object(
      'processedCount', 0,
      'succeededCount', 0,
      'failedCount', 0,
      'skippedCount', 1,
      'summary', jsonb_build_object('reason', 'job_disabled')
    );

    update public.operational_job_runs
       set status = 'skipped',
           finished_at = clock_timestamp(),
           duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer),
           skipped_count = 1,
           summary = v_summary
     where id = v_run_id;

    return (
      select jsonb_build_object(
        'id', r.id,
        'jobKey', r.job_key,
        'status', r.status,
        'summary', r.summary
      )
      from public.operational_job_runs r
      where r.id = v_run_id
    );
  end if;

  if not v_locked then
    v_summary := jsonb_build_object(
      'processedCount', 0,
      'succeededCount', 0,
      'failedCount', 0,
      'skippedCount', 1,
      'summary', jsonb_build_object('reason', 'already_running')
    );

    update public.operational_job_runs
       set status = 'skipped',
           finished_at = clock_timestamp(),
           duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer),
           skipped_count = 1,
           summary = v_summary
     where id = v_run_id;

    return (
      select jsonb_build_object(
        'id', r.id,
        'jobKey', r.job_key,
        'status', r.status,
        'summary', r.summary
      )
      from public.operational_job_runs r
      where r.id = v_run_id
    );
  end if;

  begin
    case v_job.job_key
      when 'checkin.reminder' then
        v_summary := security.m16_job_checkin_reminders(not coalesce(p_dry_run, true), v_limit);
      when 'medication.reminder' then
        v_summary := security.m16_job_medication_reminders(not coalesce(p_dry_run, true), v_limit);
      when 'attendance.stuck' then
        v_summary := security.m16_job_detect_stuck_attendance(not coalesce(p_dry_run, true), v_limit);
      when 'communications.expire' then
        v_summary := security.m16_job_expire_communications(not coalesce(p_dry_run, true), v_limit);
      when 'crm.retention' then
        v_summary := security.m16_job_crm_retention(not coalesce(p_dry_run, true), v_limit);
      when 'inventory.notification' then
        v_summary := security.m16_job_inventory_notifications(not coalesce(p_dry_run, true), v_limit);
      when 'billing.asaas_reconciliation' then
        v_summary := security.m16_job_billing_asaas_reconciliation(not coalesce(p_dry_run, true), v_limit);
      when 'webhook.reprocess' then
        v_summary := security.m16_job_webhook_reprocess(not coalesce(p_dry_run, true), v_limit);
      when 'compliance.readiness' then
        v_summary := security.m16_job_compliance_readiness(not coalesce(p_dry_run, true), v_limit);
      when 'provider.healthcheck' then
        v_summary := security.m16_job_provider_healthcheck(false, 1);
      when 'permissions.seed' then
        v_summary := security.m16_job_one_shot_placeholder(v_job.job_key, not coalesce(p_dry_run, true), 1);
      when 'platform_settings.seed' then
        v_summary := security.m16_job_one_shot_placeholder(v_job.job_key, not coalesce(p_dry_run, true), 1);
      when 'compliance.legacy_audit' then
        v_summary := security.m16_job_one_shot_placeholder(v_job.job_key, not coalesce(p_dry_run, true), 1);
      else
        raise exception 'operational_job_handler_missing' using errcode = '22023';
    end case;

    update public.operational_job_runs
       set status = case
             when coalesce((v_summary ->> 'failedCount')::integer, 0) > 0 then 'failed'
             else 'succeeded'
           end,
           finished_at = clock_timestamp(),
           duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer),
           processed_count = coalesce((v_summary ->> 'processedCount')::integer, 0),
           succeeded_count = coalesce((v_summary ->> 'succeededCount')::integer, 0),
           failed_count = coalesce((v_summary ->> 'failedCount')::integer, 0),
           skipped_count = coalesce((v_summary ->> 'skippedCount')::integer, 0),
           summary = coalesce(v_summary -> 'summary', v_summary),
           error_code = case when coalesce((v_summary ->> 'failedCount')::integer, 0) > 0 then 'job_partial_failure' else null end,
           error_message = case when coalesce((v_summary ->> 'failedCount')::integer, 0) > 0 then security.m16_sanitize_job_text(v_summary::text, 500) else null end
     where id = v_run_id;
  exception
    when others then
      v_error_code := sqlstate;
      get stacked diagnostics v_error_message = message_text;

      update public.operational_job_runs
         set status = 'failed',
             finished_at = clock_timestamp(),
             duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer),
             failed_count = 1,
             summary = jsonb_build_object(
               'jobKey', v_job.job_key,
               'phase', 'failed',
               'message', security.m16_sanitize_job_text(v_error_message, 500)
             ),
             error_code = v_error_code,
             error_message = security.m16_sanitize_job_text(v_error_message, 500)
       where id = v_run_id;
  end;

  return (
    select jsonb_build_object(
      'id', r.id,
      'jobKey', r.job_key,
      'status', r.status,
      'dryRun', r.dry_run,
      'triggerSource', r.trigger_source,
      'processedCount', r.processed_count,
      'succeededCount', r.succeeded_count,
      'failedCount', r.failed_count,
      'skippedCount', r.skipped_count,
      'startedAt', r.started_at,
      'finishedAt', r.finished_at,
      'durationMs', r.duration_ms,
      'summary', r.summary,
      'errorCode', r.error_code,
      'errorMessage', r.error_message
    )
    from public.operational_job_runs r
    where r.id = v_run_id
  );
end;
$$;

create or replace function public.run_operational_job(
  p_job_key text,
  p_dry_run boolean default true,
  p_limit integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  return security.run_operational_job_internal(p_job_key, p_dry_run, p_limit, 'script');
end;
$$;

create or replace function public.list_platform_operational_jobs(p_limit integer default 100)
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

  select coalesce(jsonb_agg(job_payload order by job_payload ->> 'jobKey'), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'jobKey', d.job_key,
      'displayName', d.display_name,
      'category', d.category,
      'executionKind', d.execution_kind,
      'handlerName', d.handler_name,
      'enabled', d.is_enabled,
      'cronEnabled', d.cron_enabled,
      'scheduleCron', d.schedule_cron,
      'timezone', d.timezone,
      'cronJobName', d.cron_job_name,
      'defaultLimit', d.default_limit,
      'maxLimit', d.max_limit,
      'expectedMaxLagMinutes', floor(extract(epoch from d.expected_max_lag) / 60)::integer,
      'dryRunSupported', d.dry_run_supported,
      'serviceRoleOnly', d.service_role_only,
      'description', d.description,
      'runbookHref', d.runbook_href,
      'currentStatus',
        case
          when not d.is_enabled then 'watch'
          when r.id is null then 'watch'
          when r.status = 'failed' then 'critical'
          when d.execution_kind = 'recurring'
            and r.finished_at is not null
            and r.finished_at < now() - d.expected_max_lag then 'watch'
          else 'ok'
        end,
      'isStale',
        case
          when d.execution_kind <> 'recurring' or r.finished_at is null then false
          else r.finished_at < now() - d.expected_max_lag
        end,
      'evidence',
        case
          when r.id is null then 'Nenhuma execucao registrada.'
          when r.status = 'failed' then coalesce(r.error_message, 'Falha sem detalhe sensivel.')
          when d.execution_kind = 'recurring' and r.finished_at < now() - d.expected_max_lag then 'Ultima execucao acima do SLA esperado.'
          else 'Ultima execucao dentro do contrato operacional.'
        end,
      'lastRun',
        case when r.id is null then null else jsonb_build_object(
          'id', r.id,
          'status', r.status,
          'triggerSource', r.trigger_source,
          'dryRun', r.dry_run,
          'requestedLimit', r.requested_limit,
          'startedAt', r.started_at,
          'finishedAt', r.finished_at,
          'durationMs', r.duration_ms,
          'processedCount', r.processed_count,
          'succeededCount', r.succeeded_count,
          'failedCount', r.failed_count,
          'skippedCount', r.skipped_count,
          'summary', r.summary,
          'errorCode', r.error_code,
          'errorMessage', r.error_message
        ) end
    ) as job_payload
    from public.operational_job_definitions d
    left join lateral (
      select *
      from public.operational_job_runs r
      where r.job_key = d.job_key
      order by r.started_at desc
      limit 1
    ) r on true
    order by d.category, d.job_key
    limit v_limit
  ) jobs;

  return v_result;
end;
$$;

insert into public.operational_job_definitions (
  job_key,
  display_name,
  category,
  execution_kind,
  handler_name,
  schedule_cron,
  cron_job_name,
  cron_enabled,
  is_enabled,
  default_limit,
  max_limit,
  expected_max_lag,
  description,
  runbook_href,
  metadata
)
values
  (
    'checkin.reminder',
    'Lembretes de check-in',
    'patient_app',
    'recurring',
    'security.m16_job_checkin_reminders',
    '*/30 * * * *',
    'm16_checkin_reminder',
    true,
    true,
    100,
    500,
    interval '90 minutes',
    'Enfileira notificacoes in-app genericas para check-ins pendentes ou proximos do vencimento.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'agendaAutomations')
  ),
  (
    'medication.reminder',
    'Lembretes de medicacao',
    'patient_app',
    'recurring',
    'security.m16_job_medication_reminders',
    '*/30 * * * *',
    'm16_medication_reminder',
    true,
    true,
    100,
    500,
    interval '90 minutes',
    'Enfileira notificacoes in-app genericas para medication_reminders ativos; sem provider externo.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'generateMedicationReminders')
  ),
  (
    'attendance.stuck',
    'Atendimento preso',
    'agenda',
    'recurring',
    'security.m16_job_detect_stuck_attendance',
    '*/15 * * * *',
    'm16_attendance_stuck',
    true,
    true,
    100,
    500,
    interval '45 minutes',
    'Marca filas de atendimento paradas acima do limite e registra historico/auditoria agregada.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'detectStuckAttendance', 'thresholdMinutes', 45)
  ),
  (
    'communications.expire',
    'Expiracao de comunicacoes',
    'communications',
    'recurring',
    'security.m16_job_expire_communications',
    '15 * * * *',
    'm16_communications_expire',
    true,
    true,
    250,
    1000,
    interval '3 hours',
    'Arquiva mensagens, notificacoes e threads vencidas por retencao, com limite por tabela.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'archive_expired_communications')
  ),
  (
    'crm.retention',
    'CRM expirado e retencao',
    'crm',
    'recurring',
    'security.m16_job_crm_retention',
    '35 2 * * *',
    'm16_crm_retention',
    true,
    true,
    100,
    500,
    interval '30 hours',
    'Executa a retencao de leads expirados com dry-run e limite.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'expire_crm_leads_for_retention')
  ),
  (
    'inventory.notification',
    'Notificacoes de estoque',
    'inventory',
    'recurring',
    'security.m16_job_inventory_notifications',
    '20 7 * * *',
    'm16_inventory_notification',
    true,
    true,
    100,
    500,
    interval '30 hours',
    'Enfileira notificacoes tenant-level para estoque minimo e lotes proximos do vencimento.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'emit_inventory_operational_notifications')
  ),
  (
    'billing.asaas_reconciliation',
    'Conciliacao Asaas',
    'billing',
    'recurring',
    'security.m16_job_billing_asaas_reconciliation',
    '*/30 * * * *',
    'm16_billing_asaas_reconciliation',
    true,
    true,
    100,
    500,
    interval '90 minutes',
    'Cria billing_sync_jobs para cobrancas Asaas pendentes/vencidas, sem chamar provider.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'calculateOperationalIntelligence')
  ),
  (
    'webhook.reprocess',
    'Triagem de reprocesso de webhook',
    'webhooks',
    'recurring',
    'security.m16_job_webhook_reprocess',
    '*/10 * * * *',
    'm16_webhook_reprocess',
    true,
    true,
    50,
    200,
    interval '30 minutes',
    'Processa a fila de reprocesso com idempotencia e fail-closed; nao reexecuta payload bruto.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'webhook_reprocess_jobs', 'rawPayloadReplay', false)
  ),
  (
    'compliance.readiness',
    'Compliance readiness',
    'compliance',
    'recurring',
    'security.m16_job_compliance_readiness',
    '40 3 * * *',
    'm16_compliance_readiness',
    true,
    true,
    100,
    500,
    interval '30 hours',
    'Reavalia lacunas de compliance por tenant sem expor evidencias sensiveis.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'backfillComplianceReadiness')
  ),
  (
    'provider.healthcheck',
    'Healthcheck de providers',
    'provider',
    'admin_check',
    'security.m16_job_provider_healthcheck',
    null,
    null,
    false,
    true,
    1,
    1,
    interval '6 hours',
    'Healthcheck admin-only baseado em sinais locais; nao chama Asaas/D4Sign.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'healthCheck', 'externalProviderCalls', false)
  ),
  (
    'permissions.seed',
    'Seed de permissoes',
    'one_shot',
    'one_shot',
    'security.m16_job_one_shot_placeholder',
    null,
    null,
    false,
    false,
    1,
    1,
    interval '365 days',
    'One-shot documentado; deve rodar apenas via script backend revisado.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'seedPermissions')
  ),
  (
    'platform_settings.seed',
    'Seed de platform settings',
    'one_shot',
    'one_shot',
    'security.m16_job_one_shot_placeholder',
    null,
    null,
    false,
    false,
    1,
    1,
    interval '365 days',
    'One-shot documentado; deve rodar apenas via script backend revisado.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'seedPlatformSettings')
  ),
  (
    'compliance.legacy_audit',
    'Auditoria de compliance legado',
    'one_shot',
    'one_shot',
    'security.m16_job_one_shot_placeholder',
    null,
    null,
    false,
    false,
    1,
    1,
    interval '365 days',
    'One-shot documentado; deve rodar apenas via script backend revisado.',
    'docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md#m16-jobs-operacionais',
    jsonb_build_object('origin', 'auditLegacyComplianceData')
  )
on conflict (job_key) do update
set display_name = excluded.display_name,
    category = excluded.category,
    execution_kind = excluded.execution_kind,
    handler_name = excluded.handler_name,
    schedule_cron = excluded.schedule_cron,
    timezone = excluded.timezone,
    cron_job_name = excluded.cron_job_name,
    cron_enabled = excluded.cron_enabled,
    is_enabled = excluded.is_enabled,
    default_limit = excluded.default_limit,
    max_limit = excluded.max_limit,
    expected_max_lag = excluded.expected_max_lag,
    dry_run_supported = excluded.dry_run_supported,
    service_role_only = excluded.service_role_only,
    description = excluded.description,
    runbook_href = excluded.runbook_href,
    metadata = excluded.metadata,
    updated_at = now();

create or replace function security.register_m16_operational_cron()
returns void
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_job record;
  v_command text;
begin
  perform security.m16_assert_job_caller();

  if to_regnamespace('cron') is null
    or to_regprocedure('cron.schedule(text,text,text)') is null then
    update public.operational_job_definitions
       set metadata = metadata || jsonb_build_object('cronInstallStatus', 'pg_cron_unavailable'),
           updated_at = now()
     where cron_enabled;
    return;
  end if;

  for v_job in
    select job_key, cron_job_name, schedule_cron, default_limit
    from public.operational_job_definitions
    where execution_kind = 'recurring'
      and cron_enabled
      and is_enabled
      and cron_job_name is not null
      and schedule_cron is not null
    order by job_key
  loop
    if to_regprocedure('cron.unschedule(text)') is not null then
      begin
        execute 'select cron.unschedule($1)' using v_job.cron_job_name;
      exception
        when others then
          null;
      end;
    end if;

    v_command := format(
      'select security.run_operational_job_internal(%L, false, %s, %L);',
      v_job.job_key,
      v_job.default_limit,
      'cron'
    );

    execute 'select cron.schedule($1, $2, $3)'
      using v_job.cron_job_name, v_job.schedule_cron, v_command;

    update public.operational_job_definitions
       set metadata = metadata || jsonb_build_object('cronInstallStatus', 'scheduled'),
           updated_at = now()
     where job_key = v_job.job_key;
  end loop;
end;
$$;

select security.register_m16_operational_cron();

revoke all on function security.m16_sanitize_job_text(text, integer) from public;
revoke all on function security.m16_assert_job_caller() from public;
revoke all on function security.m16_job_checkin_reminders(boolean, integer) from public;
revoke all on function security.m16_job_medication_reminders(boolean, integer) from public;
revoke all on function security.m16_job_detect_stuck_attendance(boolean, integer) from public;
revoke all on function security.m16_job_expire_communications(boolean, integer) from public;
revoke all on function security.m16_job_crm_retention(boolean, integer) from public;
revoke all on function security.m16_job_inventory_notifications(boolean, integer) from public;
revoke all on function security.m16_job_billing_asaas_reconciliation(boolean, integer) from public;
revoke all on function security.m16_job_webhook_reprocess(boolean, integer) from public;
revoke all on function security.m16_job_compliance_readiness(boolean, integer) from public;
revoke all on function security.m16_job_provider_healthcheck(boolean, integer) from public;
revoke all on function security.m16_job_one_shot_placeholder(text, boolean, integer) from public;
revoke all on function security.run_operational_job_internal(text, boolean, integer, text) from public;
revoke all on function security.register_m16_operational_cron() from public;
revoke all on function public.run_operational_job(text, boolean, integer) from public;
revoke all on function public.list_platform_operational_jobs(integer) from public;

grant execute on function security.m16_sanitize_job_text(text, integer) to service_role;
grant execute on function security.m16_assert_job_caller() to service_role;
grant execute on function security.m16_job_checkin_reminders(boolean, integer) to service_role;
grant execute on function security.m16_job_medication_reminders(boolean, integer) to service_role;
grant execute on function security.m16_job_detect_stuck_attendance(boolean, integer) to service_role;
grant execute on function security.m16_job_expire_communications(boolean, integer) to service_role;
grant execute on function security.m16_job_crm_retention(boolean, integer) to service_role;
grant execute on function security.m16_job_inventory_notifications(boolean, integer) to service_role;
grant execute on function security.m16_job_billing_asaas_reconciliation(boolean, integer) to service_role;
grant execute on function security.m16_job_webhook_reprocess(boolean, integer) to service_role;
grant execute on function security.m16_job_compliance_readiness(boolean, integer) to service_role;
grant execute on function security.m16_job_provider_healthcheck(boolean, integer) to service_role;
grant execute on function security.m16_job_one_shot_placeholder(text, boolean, integer) to service_role;
grant execute on function security.run_operational_job_internal(text, boolean, integer, text) to service_role;
grant execute on function security.register_m16_operational_cron() to service_role;
grant execute on function public.run_operational_job(text, boolean, integer) to service_role;
grant execute on function public.list_platform_operational_jobs(integer) to authenticated, service_role;

comment on table public.operational_job_definitions is
  'Versioned M16 operational job catalog. Recurring jobs are service-role/backend only; one-shot jobs are documented and not scheduled.';
comment on table public.operational_job_runs is
  'Sanitized aggregate execution log for M16 operational jobs. No provider payloads, secrets, PII/PHI or signed URLs.';
comment on function public.run_operational_job(text, boolean, integer) is
  'Service-role only entrypoint for dry-run or execution of one bounded operational job.';
comment on function public.list_platform_operational_jobs(integer) is
  'Admin/support observability RPC returning latest M16 job status, schedules and sanitized run evidence.';
