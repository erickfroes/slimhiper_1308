-- Patch clinic finance overview patient name resolution for the current schema.
-- patient_pii stores legal identity fields; preferred_name lives on patients.

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
      coalesce(nullif(p.preferred_name, ''), pii.full_name, 'Paciente') as patient_name,
      i.description,
      round(i.amount_cents::numeric / 100, 2) as amount,
      i.due_date,
      public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) as domain_status
    from public.patient_invoices i
    left join public.patients p
      on p.tenant_id = i.tenant_id
     and p.id = i.patient_id
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

comment on function public.get_clinic_finance_overview() is
  'Returns clinic finance dashboard metrics for the caller active tenant after financial.read authorization; patched by 090 to read preferred_name from patients.';
