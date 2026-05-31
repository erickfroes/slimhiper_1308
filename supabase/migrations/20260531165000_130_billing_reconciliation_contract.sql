-- Clinic billing reconciliation contract.
-- Read-only RPC for financial users to inspect local invoice/payment divergence
-- without exposing provider identifiers in the browser.

create index if not exists idx_payments_tenant_invoice
  on public.payments(tenant_id, patient_invoice_id)
  where patient_invoice_id is not null;

create or replace function public.get_clinic_finance_reconciliation()
returns jsonb
language plpgsql
security definer
set search_path = public, security
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_divergences jsonb := '[]'::jsonb;
  v_recent_events jsonb := '[]'::jsonb;
  v_pending_invoices integer := 0;
  v_overdue_invoices integer := 0;
  v_failed_webhooks integer := 0;
  v_unmatched_payments integer := 0;
  v_high_severity integer := 0;
  v_medium_severity integer := 0;
begin
  select coalesce(
    (
      select p.active_tenant_id
      from public.profiles p
      where p.id = v_user_id
        and p.active_tenant_id is not null
        and security.is_tenant_member(p.active_tenant_id)
      limit 1
    ),
    (
      select tm.tenant_id
      from public.tenant_memberships tm
      where tm.user_id = v_user_id
        and tm.status = 'active'
      order by tm.created_at asc
      limit 1
    )
  )
  into v_tenant_id;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'financial.read', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with invoice_rows as (
    select
      i.id,
      i.tenant_id,
      i.patient_id,
      i.status,
      i.amount_cents,
      i.due_date,
      i.paid_at,
      i.description,
      i.created_at,
      public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) as domain_status,
      coalesce(nullif(p.preferred_name, ''), pii.full_name, 'Paciente') as patient_name
    from public.patient_invoices i
    left join public.patients p
      on p.tenant_id = i.tenant_id
     and p.id = i.patient_id
    left join public.patient_pii pii
      on pii.tenant_id = i.tenant_id
     and pii.patient_id = i.patient_id
    where i.tenant_id = v_tenant_id
  ),
  payment_rows as (
    select
      pay.id,
      pay.tenant_id,
      pay.patient_id,
      pay.patient_invoice_id,
      pay.status,
      pay.amount_cents,
      pay.paid_at,
      pay.due_date,
      pay.created_at,
      coalesce(nullif(p.preferred_name, ''), pii.full_name, 'Paciente') as patient_name
    from public.payments pay
    left join public.patients p
      on p.tenant_id = pay.tenant_id
     and p.id = pay.patient_id
    left join public.patient_pii pii
      on pii.tenant_id = pay.tenant_id
     and pii.patient_id = pay.patient_id
    where pay.tenant_id = v_tenant_id
  ),
  divergence_rows as (
    select
      'amount_mismatch'::text as kind,
      'high'::text as severity,
      i.patient_id,
      i.patient_name,
      i.id as invoice_id,
      pay.id as payment_id,
      'Valor do pagamento conciliado difere da cobranca local.'::text as description,
      i.domain_status as expected_status,
      pay.status as actual_status,
      round(i.amount_cents::numeric / 100, 2) as expected_amount,
      round(pay.amount_cents::numeric / 100, 2) as actual_amount,
      i.due_date,
      greatest(i.created_at, pay.created_at) as created_at
    from invoice_rows i
    join payment_rows pay
      on pay.patient_invoice_id = i.id
    where pay.amount_cents <> i.amount_cents

    union all

    select
      'paid_invoice_without_paid_payment',
      'high',
      i.patient_id,
      i.patient_name,
      i.id,
      null::uuid,
      'Cobranca esta paga, mas nao ha pagamento pago vinculado.',
      'pago',
      coalesce((
        select string_agg(distinct coalesce(p.status, 'sem_status'), ', ')
        from payment_rows p
        where p.patient_invoice_id = i.id
      ), 'sem_pagamento'),
      round(i.amount_cents::numeric / 100, 2),
      null::numeric,
      i.due_date,
      i.created_at
    from invoice_rows i
    where i.domain_status = 'pago'
      and not exists (
        select 1
        from payment_rows p
        where p.patient_invoice_id = i.id
          and (
            p.paid_at is not null
            or lower(coalesce(p.status, '')) in (
              'paid',
              'pago',
              'received',
              'confirmed',
              'payment_received',
              'payment_confirmed'
            )
          )
      )

    union all

    select
      'paid_payment_unpaid_invoice',
      'high',
      coalesce(i.patient_id, pay.patient_id),
      coalesce(i.patient_name, pay.patient_name),
      i.id,
      pay.id,
      'Pagamento esta pago, mas a cobranca vinculada ainda nao esta marcada como paga.',
      'pago',
      coalesce(i.domain_status, pay.status),
      round(coalesce(i.amount_cents, pay.amount_cents)::numeric / 100, 2),
      round(pay.amount_cents::numeric / 100, 2),
      coalesce(i.due_date, pay.due_date),
      pay.created_at
    from payment_rows pay
    left join invoice_rows i
      on i.id = pay.patient_invoice_id
    where (
        pay.paid_at is not null
        or lower(coalesce(pay.status, '')) in (
          'paid',
          'pago',
          'received',
          'confirmed',
          'payment_received',
          'payment_confirmed'
        )
      )
      and (i.id is null or i.domain_status <> 'pago')

    union all

    select
      'overdue_invoice_without_overdue_payment',
      'medium',
      i.patient_id,
      i.patient_name,
      i.id,
      null::uuid,
      'Cobranca esta vencida e nao ha pagamento vencido vinculado.',
      'vencido',
      coalesce((
        select string_agg(distinct coalesce(p.status, 'sem_status'), ', ')
        from payment_rows p
        where p.patient_invoice_id = i.id
      ), 'sem_pagamento'),
      round(i.amount_cents::numeric / 100, 2),
      null::numeric,
      i.due_date,
      i.created_at
    from invoice_rows i
    where i.domain_status = 'vencido'
      and not exists (
        select 1
        from payment_rows p
        where p.patient_invoice_id = i.id
          and lower(coalesce(p.status, '')) in ('overdue', 'vencido', 'payment_overdue')
      )

    union all

    select
      'orphan_payment',
      'medium',
      pay.patient_id,
      pay.patient_name,
      pay.patient_invoice_id,
      pay.id,
      'Pagamento local nao tem cobranca local correspondente.',
      'cobranca_vinculada',
      coalesce(pay.status, 'sem_status'),
      null::numeric,
      round(pay.amount_cents::numeric / 100, 2),
      pay.due_date,
      pay.created_at
    from payment_rows pay
    left join invoice_rows i
      on i.id = pay.patient_invoice_id
    where pay.patient_invoice_id is null
       or i.id is null

    union all

    select
      'webhook_unresolved',
      case when e.status = 'failed' then 'high' else 'medium' end,
      null::uuid,
      'Webhook Asaas',
      null::uuid,
      null::uuid,
      coalesce(nullif(e.error_message, ''), 'Evento Asaas exige revisao operacional.'),
      'processed',
      e.status,
      null::numeric,
      null::numeric,
      null::date,
      e.created_at
    from public.asaas_events e
    where e.tenant_id = v_tenant_id
      and e.status in ('failed', 'ignored')
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', concat(kind, ':', coalesce(invoice_id::text, 'no_invoice'), ':', coalesce(payment_id::text, 'no_payment'), ':', extract(epoch from created_at)::bigint::text),
        'kind', kind,
        'severity', severity,
        'patientId', patient_id,
        'patientName', patient_name,
        'invoiceId', invoice_id,
        'paymentId', payment_id,
        'description', description,
        'expectedStatus', expected_status,
        'actualStatus', actual_status,
        'expectedAmount', expected_amount,
        'actualAmount', actual_amount,
        'dueDate', due_date,
        'createdAt', created_at
      )
      order by created_at desc
    ),
    '[]'::jsonb
  )
  into v_divergences
  from (
    select *
    from divergence_rows
    order by created_at desc
    limit 50
  ) d;

  select count(*)::integer
  into v_pending_invoices
  from public.patient_invoices i
  where i.tenant_id = v_tenant_id
    and public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) = 'pendente';

  select count(*)::integer
  into v_overdue_invoices
  from public.patient_invoices i
  where i.tenant_id = v_tenant_id
    and public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) = 'vencido';

  select count(*)::integer
  into v_failed_webhooks
  from public.asaas_events e
  where e.tenant_id = v_tenant_id
    and e.status in ('failed', 'ignored');

  select count(*)::integer
  into v_unmatched_payments
  from public.payments pay
  left join public.patient_invoices i
    on i.tenant_id = pay.tenant_id
   and i.id = pay.patient_invoice_id
  where pay.tenant_id = v_tenant_id
    and (pay.patient_invoice_id is null or i.id is null);

  select count(*)::integer
  into v_high_severity
  from jsonb_array_elements(v_divergences) item
  where item->>'severity' = 'high';

  select count(*)::integer
  into v_medium_severity
  from jsonb_array_elements(v_divergences) item
  where item->>'severity' = 'medium';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'eventType', e.event_type,
        'status', e.status,
        'errorMessage', nullif(e.error_message, ''),
        'createdAt', e.created_at,
        'processedAt', e.processed_at
      )
      order by e.created_at desc
    ),
    '[]'::jsonb
  )
  into v_recent_events
  from (
    select e.id, e.event_type, e.status, e.error_message, e.created_at, e.processed_at
    from public.asaas_events e
    where e.tenant_id = v_tenant_id
    order by e.created_at desc
    limit 8
  ) e;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'divergences', jsonb_array_length(v_divergences),
      'highSeverity', v_high_severity,
      'mediumSeverity', v_medium_severity,
      'failedWebhookEvents', v_failed_webhooks,
      'pendingInvoices', v_pending_invoices,
      'overdueInvoices', v_overdue_invoices,
      'unmatchedPayments', v_unmatched_payments,
      'lastCheckedAt', now()
    ),
    'divergences', v_divergences,
    'recentEvents', v_recent_events
  );
end;
$$;

grant execute on function public.get_clinic_finance_reconciliation() to authenticated, service_role;

comment on function public.get_clinic_finance_reconciliation() is
  'Returns safe clinic billing reconciliation summary, divergences and recent Asaas event states after financial.read authorization.';
