-- Contract-facing views and RPCs consumed by the current application.

create or replace function public.map_billing_status_to_invoice_status(
  p_status text,
  p_due_date date,
  p_paid_at timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_paid_at is not null
      or lower(coalesce(p_status, '')) in ('paid', 'pago', 'received', 'confirmed', 'payment_received', 'payment_confirmed')
      then 'pago'
    when lower(coalesce(p_status, '')) in ('cancelled', 'canceled', 'cancelado', 'payment_cancelled', 'payment_deleted')
      then 'cancelado'
    when lower(coalesce(p_status, '')) in ('overdue', 'vencido', 'payment_overdue')
      or (p_due_date < current_date and p_paid_at is null and lower(coalesce(p_status, '')) not in ('cancelled', 'canceled', 'cancelado'))
      then 'vencido'
    else 'pendente'
  end;
$$;

create or replace function public.map_payment_method_to_domain(p_method text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_method, ''))
    when 'credit_card' then 'cartao_credito'
    when 'cartao_credito' then 'cartao_credito'
    when 'debit_card' then 'cartao_debito'
    when 'cartao_debito' then 'cartao_debito'
    when 'boleto' then 'boleto'
    when 'cash' then 'dinheiro'
    when 'dinheiro' then 'dinheiro'
    when 'transfer' then 'transferencia'
    when 'transferencia' then 'transferencia'
    else 'pix'
  end;
$$;

create or replace view public.admin_webhook_events
with (security_invoker = true)
as
select
  e.id,
  'Asaas'::text as provider,
  e.tenant_id,
  t.name as tenant_name,
  e.event_type,
  coalesce(e.asaas_event_id, e.external_reference, e.id::text) as external_id,
  e.idempotency_key,
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
  coalesce(e.provider_event_id, e.idempotency_key, e.id::text) as external_id,
  e.idempotency_key,
  coalesce(e.status, 'processed') as status,
  coalesce(e.retry_count, 0) as retry_count,
  e.error_message,
  e.created_at,
  e.processed_at,
  e.payload_summary
from public.d4sign_events e
left join public.tenants t on t.id = e.tenant_id;

create or replace function public.get_patient_financial_summary(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security
as $$
declare
  v_tenant_id uuid;
  v_total_contract numeric := 0;
  v_total_paid numeric := 0;
  v_total_pending numeric := 0;
  v_total_overdue numeric := 0;
  v_next_due_date date;
  v_next_due_amount numeric;
  v_last_payment_date timestamptz;
  v_last_payment_amount numeric;
  v_invoices jsonb := '[]'::jsonb;
  v_payment_history jsonb := '[]'::jsonb;
  v_status text := 'isento';
  v_financial_state text := 'em_dia';
begin
  select p.tenant_id
  into v_tenant_id
  from public.patients p
  where p.id = p_patient_id;

  if v_tenant_id is null then
    return null;
  end if;

  if not security.has_permission(v_tenant_id, 'financial.read', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with normalized as (
    select
      i.id,
      i.description,
      i.amount_cents,
      i.due_date,
      i.paid_at,
      public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) as domain_status
    from public.patient_invoices i
    where i.tenant_id = v_tenant_id
      and i.patient_id = p_patient_id
  )
  select
    coalesce(sum(amount_cents), 0)::numeric / 100,
    coalesce(sum(amount_cents) filter (where domain_status = 'pendente'), 0)::numeric / 100,
    coalesce(sum(amount_cents) filter (where domain_status = 'vencido'), 0)::numeric / 100
  into v_total_contract, v_total_pending, v_total_overdue
  from normalized;

  select coalesce(sum(p.amount_cents), 0)::numeric / 100
  into v_total_paid
  from public.payments p
  where p.tenant_id = v_tenant_id
    and p.patient_id = p_patient_id
    and lower(coalesce(p.status, '')) in ('paid', 'pago', 'received', 'confirmed', 'payment_received', 'payment_confirmed');

  select i.due_date, i.amount_cents::numeric / 100
  into v_next_due_date, v_next_due_amount
  from public.patient_invoices i
  where i.tenant_id = v_tenant_id
    and i.patient_id = p_patient_id
    and public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) = 'pendente'
  order by i.due_date asc
  limit 1;

  select p.paid_at, p.amount_cents::numeric / 100
  into v_last_payment_date, v_last_payment_amount
  from public.payments p
  where p.tenant_id = v_tenant_id
    and p.patient_id = p_patient_id
    and p.paid_at is not null
  order by p.paid_at desc
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'description', i.description,
        'amount', round(i.amount_cents::numeric / 100, 2),
        'dueDate', i.due_date,
        'paidAt', i.paid_at,
        'status', public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at)
      )
      order by i.due_date desc
    ),
    '[]'::jsonb
  )
  into v_invoices
  from public.patient_invoices i
  where i.tenant_id = v_tenant_id
    and i.patient_id = p_patient_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'description', coalesce(i.description, 'Pagamento'),
        'amount', round(p.amount_cents::numeric / 100, 2),
        'paidAt', p.paid_at,
        'method', public.map_payment_method_to_domain(p.method),
        'registeredBy', 'Sistema'
      )
      order by p.paid_at desc
    ),
    '[]'::jsonb
  )
  into v_payment_history
  from public.payments p
  left join public.patient_invoices i
    on i.tenant_id = p.tenant_id
   and i.id = p.patient_invoice_id
  where p.tenant_id = v_tenant_id
    and p.patient_id = p_patient_id
    and p.paid_at is not null;

  if v_total_overdue > 0 then
    v_status := 'inadimplente';
    v_financial_state := 'pagamento_atrasado';
  elsif v_total_pending > 0 then
    v_status := 'pendente';
    v_financial_state := 'cobranca_pendente';
  elsif v_total_contract = 0 and v_total_paid = 0 then
    v_status := 'isento';
    v_financial_state := 'em_dia';
  else
    v_status := 'em_dia';
    v_financial_state := 'em_dia';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'financialState', v_financial_state,
    'totalContractValue', round(v_total_contract, 2),
    'totalPaid', round(v_total_paid, 2),
    'totalPending', round(v_total_pending, 2),
    'totalOverdue', round(v_total_overdue, 2),
    'nextDueDate', v_next_due_date,
    'nextDueAmount', case when v_next_due_amount is null then null else round(v_next_due_amount, 2) end,
    'lastPaymentDate', v_last_payment_date,
    'lastPaymentAmount', case when v_last_payment_amount is null then null else round(v_last_payment_amount, 2) end,
    'invoices', v_invoices,
    'paymentHistory', v_payment_history,
    'charges', '[]'::jsonb,
    'receipts', '[]'::jsonb,
    'negotiations', '[]'::jsonb
  );
end;
$$;

create or replace function public.get_clinic_finance_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, security
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_monthly_revenue numeric := 0;
  v_pending_receivables numeric := 0;
  v_overdue_receivables numeric := 0;
  v_active_subscriptions integer := 0;
  v_active_programs integer := 0;
  v_recent_charges jsonb := '[]'::jsonb;
begin
  select coalesce(
    (
      select p.active_tenant_id
      from public.profiles p
      where p.id = v_user_id
        and p.active_tenant_id is not null
        and security.is_tenant_member(p.active_tenant_id, true)
      limit 1
    ),
    (
      select tm.tenant_id
      from public.tenant_memberships tm
      where tm.user_id = v_user_id
        and tm.is_active = true
      order by tm.created_at asc
      limit 1
    )
  )
  into v_tenant_id;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'financial.read', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(sum(p.amount_cents), 0)::numeric / 100
  into v_monthly_revenue
  from public.payments p
  where p.tenant_id = v_tenant_id
    and lower(coalesce(p.status, '')) in ('paid', 'pago', 'received', 'confirmed', 'payment_received', 'payment_confirmed')
    and p.paid_at >= date_trunc('month', now());

  select
    coalesce(sum(i.amount_cents) filter (
      where public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) = 'pendente'
    ), 0)::numeric / 100,
    coalesce(sum(i.amount_cents) filter (
      where public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) = 'vencido'
    ), 0)::numeric / 100
  into v_pending_receivables, v_overdue_receivables
  from public.patient_invoices i
  where i.tenant_id = v_tenant_id;

  select count(*)::int
  into v_active_subscriptions
  from public.patient_subscriptions s
  where s.tenant_id = v_tenant_id
    and s.status = 'active';

  select count(*)::int
  into v_active_programs
  from public.patient_program_enrollments e
  where e.tenant_id = v_tenant_id
    and e.status = 'ativo';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'patientName', c.patient_name,
        'description', c.description,
        'amount', c.amount,
        'dueDate', c.due_date,
        'status', c.domain_status
      )
      order by c.due_date desc
    ),
    '[]'::jsonb
  )
  into v_recent_charges
  from (
    select
      i.id,
      coalesce(nullif(pii.preferred_name, ''), pii.full_name, 'Paciente') as patient_name,
      i.description,
      round(i.amount_cents::numeric / 100, 2) as amount,
      i.due_date,
      public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) as domain_status
    from public.patient_invoices i
    left join public.patient_pii pii
      on pii.tenant_id = i.tenant_id
     and pii.patient_id = i.patient_id
    where i.tenant_id = v_tenant_id
    order by i.due_date desc, i.created_at desc
    limit 10
  ) c;

  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'monthlyRevenue', round(v_monthly_revenue, 2),
      'pendingReceivables', round(v_pending_receivables, 2),
      'overdueReceivables', round(v_overdue_receivables, 2),
      'activeSubscriptionsAndPackages', v_active_subscriptions + v_active_programs
    ),
    'recentCharges', v_recent_charges
  );
end;
$$;

grant select on public.admin_webhook_events to authenticated, service_role;
grant execute on function public.map_billing_status_to_invoice_status(text, date, timestamptz) to authenticated, service_role;
grant execute on function public.map_payment_method_to_domain(text) to authenticated, service_role;
grant execute on function public.get_patient_financial_summary(uuid) to authenticated, service_role;
grant execute on function public.get_clinic_finance_overview() to authenticated, service_role;

comment on view public.admin_webhook_events is 'Unified webhook event monitor for Asaas and D4Sign, protected by underlying RLS.';
comment on function public.get_patient_financial_summary(uuid) is 'Returns the frontend PatientFinancialSummary contract for a single patient after financial.read authorization.';
comment on function public.get_clinic_finance_overview() is 'Returns clinic finance dashboard metrics for the caller active tenant after financial.read authorization.';
