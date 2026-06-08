-- M16 hardening: replace temp-table job helpers with CTE-based implementations
-- so schema lint can analyze the functions without temp relation false positives.

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

  with candidates as materialized (
    select pc.tenant_id, pc.id as checkin_id, pc.patient_id
    from public.patient_program_checkins pc
    join public.patient_program_enrollments e
      on e.tenant_id = pc.tenant_id
     and e.id = pc.enrollment_id
     and e.status in ('ativo', 'aguardando')
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
    limit v_limit
  )
  select count(*)::integer into v_candidates from candidates;

  if p_execute and v_candidates > 0 then
    with candidates as materialized (
      select
        pc.tenant_id,
        pc.id as checkin_id,
        pc.patient_id,
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
      limit v_limit
    ), inserted as (
      insert into public.notifications (
        tenant_id, user_id, patient_id, title, body, category, status, metadata,
        moderation_status, retention_until
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
      from candidates c
      returning id
    )
    select count(*)::integer into v_inserted from inserted;
  end if;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_inserted,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_inserted, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object('candidateCheckins', v_candidates, 'notificationsInserted', v_inserted)
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

  with candidates as materialized (
    select mr.tenant_id, mr.id as reminder_id, mr.patient_id
    from public.medication_reminders mr
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
    limit v_limit
  )
  select count(*)::integer into v_candidates from candidates;

  if p_execute and v_candidates > 0 then
    with candidates as materialized (
      select mr.tenant_id, mr.id as reminder_id, mr.patient_id, account_row.user_id
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
      limit v_limit
    ), inserted as (
      insert into public.notifications (
        tenant_id, user_id, patient_id, title, body, category, status, metadata,
        moderation_status, retention_until
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
      from candidates c
      returning id
    )
    select count(*)::integer into v_inserted from inserted;
  end if;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_inserted,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_inserted, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object('candidateMedicationReminders', v_candidates, 'notificationsInserted', v_inserted)
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

  with candidates as materialized (
    select q.tenant_id, q.id as queue_id
    from public.attendance_queue q
    where q.status in ('scheduled', 'waiting', 'called', 'in_attendance', 'checkout')
      and coalesce(q.last_status_at, q.created_at) <= now() - (v_threshold_minutes * interval '1 minute')
    order by coalesce(q.last_status_at, q.created_at) asc
    limit v_limit
  )
  select count(*)::integer into v_candidates from candidates;

  if p_execute and v_candidates > 0 then
    with candidates as materialized (
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
      limit v_limit
    ), history_insert as (
      insert into public.attendance_status_history (
        tenant_id, queue_id, appointment_id, patient_id, from_status, to_status,
        appointment_status, actor_id, metadata
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
      from candidates c
      returning queue_id
    ), updated as (
      update public.attendance_queue q
         set status = 'stuck',
             stuck_detected_at = now(),
             updated_at = now()
        from candidates c
       where q.tenant_id = c.tenant_id
         and q.id = c.queue_id
         and q.status = c.from_status
      returning q.tenant_id, q.id
    ), audit_insert as (
      insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
      select
        c.tenant_id,
        null,
        'attendance.stuck_detected',
        'attendance_queue',
        null,
        jsonb_build_object('source', 'm16_operational_job', 'count', count(*)::integer, 'thresholdMinutes', v_threshold_minutes)
      from candidates c
      group by c.tenant_id
      returning id
    )
    select count(*)::integer into v_updated from updated;
  end if;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_updated,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_updated, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object('candidateAttendanceRows', v_candidates, 'markedStuck', v_updated, 'thresholdMinutes', v_threshold_minutes)
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

  select count(*)::integer into v_message_candidates
  from (
    select id
    from public.patient_chat_messages
    where archived_at is null and retention_until is not null and retention_until < now()
    order by retention_until asc, created_at asc
    limit v_limit
  ) rows_for_count;

  select count(*)::integer into v_notification_candidates
  from (
    select id
    from public.notifications
    where archived_at is null and retention_until is not null and retention_until < now()
    order by retention_until asc, created_at asc
    limit v_limit
  ) rows_for_count;

  select count(*)::integer into v_thread_candidates
  from (
    select pct.id
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
    limit v_limit
  ) rows_for_count;

  v_candidates := v_message_candidates + v_notification_candidates + v_thread_candidates;

  if p_execute and v_candidates > 0 then
    with candidates as materialized (
      select tenant_id, id
      from public.patient_chat_messages
      where archived_at is null and retention_until is not null and retention_until < now()
      order by retention_until asc, created_at asc
      limit v_limit
    ), updated as (
      update public.patient_chat_messages pcm
         set archived_at = now()
        from candidates c
       where pcm.tenant_id = c.tenant_id
         and pcm.id = c.id
         and pcm.archived_at is null
      returning pcm.id
    )
    select count(*)::integer into v_messages_archived from updated;

    with candidates as materialized (
      select tenant_id, id
      from public.notifications
      where archived_at is null and retention_until is not null and retention_until < now()
      order by retention_until asc, created_at asc
      limit v_limit
    ), updated as (
      update public.notifications n
         set archived_at = now(),
             status = 'archived',
             read_at = coalesce(read_at, now())
        from candidates c
       where n.tenant_id = c.tenant_id
         and n.id = c.id
         and n.archived_at is null
      returning n.id
    )
    select count(*)::integer into v_notifications_archived from updated;

    with candidates as materialized (
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
      limit v_limit
    ), updated as (
      update public.patient_chat_threads pct
         set archived_at = now(),
             status = 'archived',
             updated_at = now()
        from candidates c
       where pct.tenant_id = c.tenant_id
         and pct.id = c.id
         and pct.archived_at is null
      returning pct.id
    )
    select count(*)::integer into v_threads_archived from updated;
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

  with alerts as materialized (
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
    left join public.inventory_stock_snapshots s on s.tenant_id = i.tenant_id and s.item_id = i.id
    where i.status = 'active' and i.minimum_quantity > 0
    group by i.tenant_id, i.id, i.minimum_quantity
    having coalesce(sum(s.quantity_on_hand), 0) <= i.minimum_quantity
    union all
    select
      l.tenant_id,
      'lot_expiry'::text,
      case when l.expires_at < current_date then 'critical' else 'medium' end,
      l.item_id,
      l.id,
      coalesce(s.quantity_on_hand, 0)::text,
      v_days_to_expiry::text,
      l.expires_at
    from public.inventory_lots l
    left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.lot_id = l.id
    where l.status = 'active'
      and l.expires_at is not null
      and l.expires_at <= current_date + (v_days_to_expiry || ' days')::interval
      and coalesce(s.quantity_on_hand, 0) > 0
  ), candidates as materialized (
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
    order by case a.severity when 'critical' then 0 when 'high' then 1 else 2 end, a.tenant_id, a.item_id
    limit v_limit
  )
  select count(*)::integer into v_candidates from candidates;

  if p_execute and v_candidates > 0 then
    with alerts as materialized (
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
      left join public.inventory_stock_snapshots s on s.tenant_id = i.tenant_id and s.item_id = i.id
      where i.status = 'active' and i.minimum_quantity > 0
      group by i.tenant_id, i.id, i.minimum_quantity
      having coalesce(sum(s.quantity_on_hand), 0) <= i.minimum_quantity
      union all
      select
        l.tenant_id,
        'lot_expiry'::text,
        case when l.expires_at < current_date then 'critical' else 'medium' end,
        l.item_id,
        l.id,
        coalesce(s.quantity_on_hand, 0)::text,
        v_days_to_expiry::text,
        l.expires_at
      from public.inventory_lots l
      left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.lot_id = l.id
      where l.status = 'active'
        and l.expires_at is not null
        and l.expires_at <= current_date + (v_days_to_expiry || ' days')::interval
        and coalesce(s.quantity_on_hand, 0) > 0
    ), candidates as materialized (
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
      order by case a.severity when 'critical' then 0 when 'high' then 1 else 2 end, a.tenant_id, a.item_id
      limit v_limit
    ), inserted as (
      insert into public.notifications (
        tenant_id, user_id, patient_id, title, body, category, status, metadata,
        moderation_status, retention_until
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
      from candidates c
      returning id
    )
    select count(*)::integer into v_inserted from inserted;
  end if;

  return jsonb_build_object(
    'processedCount', v_candidates,
    'succeededCount', v_inserted,
    'failedCount', 0,
    'skippedCount', case when p_execute then greatest(v_candidates - v_inserted, 0) else v_candidates end,
    'dryRun', not p_execute,
    'limit', v_limit,
    'summary', jsonb_build_object('candidateAlerts', v_candidates, 'notificationsInserted', v_inserted, 'daysToExpiry', v_days_to_expiry)
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

  with candidates as materialized (
    select i.tenant_id, i.id as patient_invoice_id
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
    limit v_limit
  )
  select count(*)::integer into v_candidates from candidates;

  select count(*)::integer into v_pending_receipts
  from public.payment_receipts pr
  where pr.status = 'pending_review';

  select count(*)::integer into v_divergences
  from public.asaas_events ae
  where ae.status in ('failed', 'ignored');

  if p_execute and v_candidates > 0 then
    with candidates as materialized (
      select i.tenant_id, i.id as patient_invoice_id
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
      limit v_limit
    ), inserted as (
      insert into public.billing_sync_jobs (
        tenant_id, patient_invoice_id, status, source, reason, requested_by, metadata
      )
      select
        c.tenant_id,
        c.patient_invoice_id,
        'queued',
        'cron',
        'pending_or_overdue_reconciliation',
        null,
        jsonb_build_object('source', 'm16_operational_job', 'jobKey', 'billing.asaas_reconciliation')
      from candidates c
      returning tenant_id
    ), reconciliation as (
      insert into public.billing_reconciliation_runs (
        tenant_id, source, status, checked_invoice_count, queued_sync_count,
        pending_receipt_count, divergence_count, metadata
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
        select tenant_id from candidates
        union
        select tenant_id from inserted
      ) tenant_row
      left join lateral (
        select count(*)::integer as checked_invoice_count
        from candidates c
        where c.tenant_id = tenant_row.tenant_id
      ) candidate_row on true
      left join lateral (
        select count(*)::integer as queued_sync_count
        from inserted i
        where i.tenant_id = tenant_row.tenant_id
      ) inserted_row on true
      left join lateral (
        select count(*)::integer as pending_receipt_count
        from public.payment_receipts pr
        where pr.tenant_id = tenant_row.tenant_id and pr.status = 'pending_review'
      ) receipt_row on true
      left join lateral (
        select count(*)::integer as divergence_count
        from public.asaas_events ae
        where ae.tenant_id = tenant_row.tenant_id and ae.status in ('failed', 'ignored')
      ) divergence_row on true
      returning id
    )
    select count(*)::integer into v_queued from inserted;
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

  with candidates as materialized (
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
    left join public.asaas_events ae on wrj.provider = 'asaas' and ae.id = wrj.event_id
    left join public.d4sign_events de on wrj.provider = 'd4sign' and de.id = wrj.event_id
    where wrj.status = 'queued'
    order by wrj.created_at asc
    limit v_limit
  )
  select count(*)::integer into v_candidates from candidates;

  if p_execute and v_candidates > 0 then
    with candidates as materialized (
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
      left join public.asaas_events ae on wrj.provider = 'asaas' and ae.id = wrj.event_id
      left join public.d4sign_events de on wrj.provider = 'd4sign' and de.id = wrj.event_id
      where wrj.status = 'queued'
      order by wrj.created_at asc
      limit v_limit
    ), not_reprocessable as (
      update public.webhook_reprocess_jobs wrj
         set status = 'not_reprocessable',
             processed_at = now(),
             error_message = c.skip_reason
        from candidates c
       where wrj.id = c.job_id
         and c.skip_reason is not null
      returning wrj.id
    ), missing_worker as (
      update public.webhook_reprocess_jobs wrj
         set status = 'failed',
             processed_at = now(),
             error_message = 'provider_replay_worker_not_configured'
        from candidates c
       where wrj.id = c.job_id
         and c.skip_reason is null
      returning wrj.id
    ), audit_insert as (
      insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
      select
        c.tenant_id,
        null,
        'webhook_reprocess.worker_triaged',
        'webhook_reprocess_job',
        c.job_id::text,
        jsonb_build_object('provider', c.provider, 'eventId', c.event_id, 'outcome', coalesce(c.skip_reason, 'provider_replay_worker_not_configured'))
      from candidates c
      where c.tenant_id is not null
      returning id
    )
    select
      (select count(*)::integer from not_reprocessable),
      (select count(*)::integer from missing_worker)
      into v_not_reprocessable, v_missing_worker;
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

  select count(*)::integer into v_candidates
  from (
    select t.id
    from public.tenants t
    where t.status <> 'archived'
    order by t.created_at asc
    limit v_limit
  ) tenants_for_count;

  if p_execute then
    for v_tenant in
      select t.id as tenant_id
      from public.tenants t
      where t.status <> 'archived'
      order by t.created_at asc
      limit v_limit
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
  join (
    select t.id as tenant_id
    from public.tenants t
    where t.status <> 'archived'
    order by t.created_at asc
    limit v_limit
  ) tenants_for_gaps on tenants_for_gaps.tenant_id = cg.tenant_id;

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
