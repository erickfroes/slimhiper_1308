-- P2: read models, timeline and audit context for agenda-originated clinical flow.
-- This migration only updates read contracts and preserves provider calls gated.

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
  select p.tenant_id into v_tenant_id from public.patients p where p.id = p_patient_id;

  if v_tenant_id is null then
    return null;
  end if;

  if not security.has_permission(v_tenant_id, 'financial.read', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with normalized as (
    select i.id, i.description, i.amount_cents, i.due_date, i.paid_at,
           public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) as domain_status
    from public.patient_invoices i
    where i.tenant_id = v_tenant_id and i.patient_id = p_patient_id
  )
  select coalesce(sum(amount_cents), 0)::numeric / 100,
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

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'description', i.description,
           'amount', round(i.amount_cents::numeric / 100, 2),
           'dueDate', i.due_date,
           'paidAt', i.paid_at,
           'status', public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at),
           'sourceModule', coalesce(a.metadata ->> 'sourceModule', i.metadata ->> 'sourceModule', i.metadata ->> 'source'),
           'appointmentId', a.id,
           'programId', a.commercial_program_id,
           'packageId', a.commercial_package_id,
           'serviceId', a.commercial_service_id
         ) order by i.due_date desc), '[]'::jsonb)
    into v_invoices
  from public.patient_invoices i
  left join public.appointments a
    on a.tenant_id = i.tenant_id
   and a.financial_invoice_id = i.id
  where i.tenant_id = v_tenant_id and i.patient_id = p_patient_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'description', coalesce(i.description, 'Pagamento'),
           'amount', round(p.amount_cents::numeric / 100, 2),
           'paidAt', p.paid_at,
           'method', public.map_payment_method_to_domain(p.method),
           'registeredBy', 'Sistema',
           'invoiceId', i.id,
           'sourceModule', coalesce(a.metadata ->> 'sourceModule', p.metadata ->> 'sourceModule', p.metadata ->> 'source'),
           'appointmentId', a.id,
           'programId', a.commercial_program_id,
           'packageId', a.commercial_package_id,
           'serviceId', a.commercial_service_id
         ) order by p.paid_at desc), '[]'::jsonb)
    into v_payment_history
  from public.payments p
  left join public.patient_invoices i on i.tenant_id = p.tenant_id and i.id = p.patient_invoice_id
  left join public.appointments a on a.tenant_id = p.tenant_id and a.financial_payment_id = p.id
  where p.tenant_id = v_tenant_id and p.patient_id = p_patient_id and p.paid_at is not null;

  if v_total_overdue > 0 then
    v_status := 'inadimplente'; v_financial_state := 'pagamento_atrasado';
  elsif v_total_pending > 0 then
    v_status := 'pendente'; v_financial_state := 'cobranca_pendente';
  elsif v_total_contract = 0 and v_total_paid = 0 then
    v_status := 'isento'; v_financial_state := 'em_dia';
  else
    v_status := 'em_dia'; v_financial_state := 'em_dia';
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

comment on function public.get_patient_financial_summary(uuid) is 'Returns PatientFinancialSummary with agenda/package source context for read models after financial.read authorization.';
