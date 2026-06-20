-- Mercado Pago provider transition foundation.
-- Adds provider-neutral billing columns/events while preserving legacy Asaas
-- processing for existing financial objects.

do $$
begin
  alter table public.tenant_billing_accounts
    drop constraint if exists tenant_billing_accounts_provider_check;
  alter table public.tenant_billing_accounts
    add constraint tenant_billing_accounts_provider_check
    check (provider in ('asaas', 'mercadopago'));

  alter table public.billing_webhook_events
    drop constraint if exists billing_webhook_events_provider_check;
  alter table public.billing_webhook_events
    add constraint billing_webhook_events_provider_check
    check (provider in ('asaas', 'mercadopago'));

  alter table public.billing_refunds
    drop constraint if exists billing_refunds_provider_check;
  alter table public.billing_refunds
    add constraint billing_refunds_provider_check
    check (provider in ('asaas', 'mercadopago'));

  alter table public.webhook_reprocess_jobs
    drop constraint if exists webhook_reprocess_jobs_provider_check;
  alter table public.webhook_reprocess_jobs
    add constraint webhook_reprocess_jobs_provider_check
    check (provider in ('asaas', 'd4sign', 'mercadopago'));
end $$;

alter table public.patient_customers
  add column if not exists provider text not null default 'asaas',
  add column if not exists provider_customer_id text;

alter table public.patient_customers
  drop constraint if exists patient_customers_provider_check;
alter table public.patient_customers
  add constraint patient_customers_provider_check
  check (provider in ('asaas', 'mercadopago'));

update public.patient_customers
set provider = coalesce(nullif(provider, ''), 'asaas'),
    provider_customer_id = coalesce(provider_customer_id, asaas_customer_id)
where provider_customer_id is null
   or provider is null
   or provider = '';

alter table public.patient_invoices
  add column if not exists provider text not null default 'asaas',
  add column if not exists provider_invoice_id text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_preference_id text;

alter table public.patient_invoices
  drop constraint if exists patient_invoices_provider_check;
alter table public.patient_invoices
  add constraint patient_invoices_provider_check
  check (provider in ('asaas', 'mercadopago'));

update public.patient_invoices
set provider = coalesce(nullif(provider, ''), 'asaas'),
    provider_invoice_id = coalesce(provider_invoice_id, asaas_invoice_id)
where provider_invoice_id is null
   or provider is null
   or provider = '';

alter table public.patient_subscriptions
  add column if not exists provider text not null default 'asaas',
  add column if not exists provider_subscription_id text,
  add column if not exists provider_plan_id text;

alter table public.patient_subscriptions
  drop constraint if exists patient_subscriptions_provider_check;
alter table public.patient_subscriptions
  add constraint patient_subscriptions_provider_check
  check (provider in ('asaas', 'mercadopago'));

update public.patient_subscriptions
set provider = coalesce(nullif(provider, ''), 'asaas'),
    provider_subscription_id = coalesce(provider_subscription_id, asaas_subscription_id)
where provider_subscription_id is null
   or provider is null
   or provider = '';

alter table public.payment_links
  add column if not exists provider text not null default 'asaas',
  add column if not exists provider_payment_link_id text,
  add column if not exists provider_preference_id text;

alter table public.payment_links
  alter column asaas_payment_link_id drop not null;

alter table public.payment_links
  drop constraint if exists payment_links_provider_check;
alter table public.payment_links
  add constraint payment_links_provider_check
  check (provider in ('asaas', 'mercadopago'));

update public.payment_links
set provider = coalesce(nullif(provider, ''), 'asaas'),
    provider_payment_link_id = coalesce(provider_payment_link_id, asaas_payment_link_id)
where provider_payment_link_id is null
   or provider is null
   or provider = '';

alter table public.payments
  add column if not exists provider text not null default 'asaas',
  add column if not exists provider_payment_id text;

alter table public.payments
  drop constraint if exists payments_provider_check;
alter table public.payments
  add constraint payments_provider_check
  check (provider in ('asaas', 'mercadopago'));

update public.payments
set provider = coalesce(nullif(provider, ''), 'asaas'),
    provider_payment_id = coalesce(provider_payment_id, asaas_payment_id)
where provider_payment_id is null
   or provider is null
   or provider = '';

alter table public.billing_sync_jobs
  add column if not exists provider text not null default 'asaas';

alter table public.billing_sync_jobs
  drop constraint if exists billing_sync_jobs_provider_check;
alter table public.billing_sync_jobs
  add constraint billing_sync_jobs_provider_check
  check (provider in ('asaas', 'mercadopago'));

create table if not exists public.billing_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('asaas', 'mercadopago')),
  tenant_id uuid references public.tenants(id) on delete set null,
  provider_event_id text,
  event_type text not null,
  resource_type text,
  resource_id text,
  local_invoice_id uuid,
  local_subscription_id uuid,
  status text not null default 'received'
    check (status in ('received', 'processed', 'failed', 'ignored')),
  error_code text,
  error_message text,
  idempotency_key text,
  payload_summary jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  retry_count integer not null default 0 check (retry_count >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_billing_provider_events_provider_event_unique
  on public.billing_provider_events(provider, provider_event_id)
  where provider_event_id is not null;

create unique index if not exists idx_billing_provider_events_idempotency_unique
  on public.billing_provider_events(provider, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_billing_provider_events_tenant_provider_created
  on public.billing_provider_events(tenant_id, provider, created_at desc);

create index if not exists idx_patient_customers_provider_customer
  on public.patient_customers(tenant_id, provider, provider_customer_id)
  where provider_customer_id is not null;

create index if not exists idx_patient_invoices_provider_invoice
  on public.patient_invoices(provider, provider_invoice_id)
  where provider_invoice_id is not null;

create index if not exists idx_patient_invoices_provider_payment
  on public.patient_invoices(provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists idx_patient_invoices_provider_preference
  on public.patient_invoices(provider, provider_preference_id)
  where provider_preference_id is not null;

create index if not exists idx_patient_subscriptions_provider_subscription
  on public.patient_subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists idx_payment_links_provider_link
  on public.payment_links(provider, provider_payment_link_id)
  where provider_payment_link_id is not null;

create index if not exists idx_payment_links_provider_preference
  on public.payment_links(provider, provider_preference_id)
  where provider_preference_id is not null;

create index if not exists idx_payments_provider_payment
  on public.payments(provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists idx_billing_refunds_provider_refund
  on public.billing_refunds(provider, provider_refund_id)
  where provider_refund_id is not null;

alter table public.billing_provider_events enable row level security;

drop policy if exists billing_provider_events_select_financial_read
  on public.billing_provider_events;
create policy billing_provider_events_select_financial_read
on public.billing_provider_events for select
to authenticated
using (
  security.can_access_platform_operations()
  or (
    tenant_id is not null
    and security.is_tenant_member(tenant_id)
    and public.has_permission(tenant_id, 'financial.read')
  )
);

drop policy if exists billing_provider_events_service_role_write
  on public.billing_provider_events;
create policy billing_provider_events_service_role_write
on public.billing_provider_events for all
to service_role
using (true)
with check (true);

grant select on public.billing_provider_events to authenticated, service_role;
grant insert, update, delete on public.billing_provider_events to service_role;

insert into public.billing_provider_events (
  provider,
  tenant_id,
  provider_event_id,
  event_type,
  resource_type,
  resource_id,
  status,
  error_message,
  idempotency_key,
  payload_summary,
  processed_at,
  retry_count,
  created_at
)
select
  'asaas',
  e.tenant_id,
  e.asaas_event_id,
  e.event_type,
  'payment',
  coalesce(e.payload_summary ->> 'payment_id', e.external_reference),
  e.status,
  e.error_message,
  e.idempotency_key,
  e.payload_summary,
  e.processed_at,
  e.retry_count,
  e.created_at
from public.asaas_events e
on conflict do nothing;

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
  'Mercado Pago'::text as provider,
  e.tenant_id,
  t.name as tenant_name,
  e.event_type,
  security.redact_operational_identifier(
    coalesce(e.provider_event_id, e.resource_id, e.id::text),
    e.id::text
  ) as external_id,
  security.redact_operational_identifier(e.idempotency_key, e.id::text) as idempotency_key,
  coalesce(e.status, 'received') as status,
  coalesce(e.retry_count, 0) as retry_count,
  e.error_message,
  e.created_at,
  e.processed_at,
  e.payload_summary
from public.billing_provider_events e
left join public.tenants t on t.id = e.tenant_id
where e.provider = 'mercadopago'
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
  elsif v_provider = 'mercadopago' then
    select be.tenant_id, be.status in ('failed', 'ignored', 'received')
      into v_tenant_id, v_reprocessable
    from public.billing_provider_events be
    where be.id = p_event_id
      and be.provider = 'mercadopago';
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
grant execute on function public.request_webhook_reprocess(text, uuid, text)
  to authenticated, service_role;

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
  provider_event_rows as (
    select
      e.id,
      'Asaas'::text as provider_label,
      e.event_type,
      e.status,
      e.error_message,
      e.created_at,
      e.processed_at
    from public.asaas_events e
    where e.tenant_id = v_tenant_id

    union all

    select
      e.id,
      'Mercado Pago'::text as provider_label,
      e.event_type,
      e.status,
      e.error_message,
      e.created_at,
      e.processed_at
    from public.billing_provider_events e
    where e.tenant_id = v_tenant_id
      and e.provider = 'mercadopago'
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
      'Webhook ' || e.provider_label,
      null::uuid,
      null::uuid,
      coalesce(nullif(e.error_message, ''), 'Evento do provedor de pagamento exige revisao operacional.'),
      'processed',
      e.status,
      null::numeric,
      null::numeric,
      null::date,
      e.created_at
    from provider_event_rows e
    where e.status in ('failed', 'ignored')
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
  from (
    select e.status
    from public.asaas_events e
    where e.tenant_id = v_tenant_id
    union all
    select e.status
    from public.billing_provider_events e
    where e.tenant_id = v_tenant_id
      and e.provider = 'mercadopago'
  ) e
  where e.status in ('failed', 'ignored');

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
        'provider', e.provider_label,
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
    select
      e.id,
      'Asaas'::text as provider_label,
      e.event_type,
      e.status,
      e.error_message,
      e.created_at,
      e.processed_at
    from public.asaas_events e
    where e.tenant_id = v_tenant_id

    union all

    select
      e.id,
      'Mercado Pago'::text as provider_label,
      e.event_type,
      e.status,
      e.error_message,
      e.created_at,
      e.processed_at
    from public.billing_provider_events e
    where e.tenant_id = v_tenant_id
      and e.provider = 'mercadopago'
    order by created_at desc
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

grant execute on function public.get_clinic_finance_reconciliation()
  to authenticated, service_role;

comment on table public.billing_provider_events is
  'Provider-neutral billing webhook and sync event summaries. Stores sanitized Mercado Pago and compatibility event summaries without raw provider payloads.';
comment on function public.get_clinic_finance_reconciliation() is
  'Returns safe clinic billing reconciliation summary, divergences and recent payment provider event states after financial.read authorization.';
comment on function public.request_webhook_reprocess(text, uuid, text) is
  'Creates an audited local webhook reprocess job for platform owner/admin users without calling external providers.';
comment on view public.admin_webhook_events is
  'Unified webhook event monitor for Asaas, Mercado Pago and D4Sign with provider identifiers pseudonymized in SQL.';
