-- Fixes local financial action contracts so manual operations reconcile with
-- invoices and cannot cross patient boundaries inside the same tenant.

create or replace function public.create_patient_financial_local_action(
  p_patient_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_id uuid;
  v_invoice_id uuid := security.try_uuid(p_payload ->> 'invoiceId');
  v_payment_id uuid := security.try_uuid(p_payload ->> 'paymentId');
  v_amount_cents integer := case
    when coalesce(p_payload ->> 'amountCents', '') ~ '^\d{1,10}$'
      then greatest((p_payload ->> 'amountCents')::integer, 0)
    else 0
  end;
  v_original_amount_cents integer := case
    when coalesce(p_payload ->> 'originalAmountCents', '') ~ '^\d{1,10}$'
      then greatest((p_payload ->> 'originalAmountCents')::integer, 0)
    else 0
  end;
  v_negotiated_amount_cents integer := case
    when coalesce(p_payload ->> 'negotiatedAmountCents', '') ~ '^\d{1,10}$'
      then greatest((p_payload ->> 'negotiatedAmountCents')::integer, 0)
    else v_amount_cents
  end;
  v_installments integer := case
    when coalesce(p_payload ->> 'installments', '') ~ '^\d{1,3}$'
      then greatest((p_payload ->> 'installments')::integer, 1)
    else 1
  end;
  v_description text := nullif(btrim(coalesce(p_payload ->> 'description', '')), '');
  v_title text := nullif(btrim(coalesce(p_payload ->> 'title', '')), '');
  v_invoice public.patient_invoices%rowtype;
  v_payment public.payments%rowtype;
  v_paid_cents bigint := 0;
  v_outstanding_cents bigint := 0;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select p.tenant_id into v_tenant_id
  from public.patients p
  where p.id = p_patient_id;

  if v_tenant_id is null then
    raise exception 'patient_not_found' using errcode = '22023';
  end if;
  if not public.has_clinical_permission(v_tenant_id, 'financial.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_invoice_id is not null then
    select * into v_invoice
    from public.patient_invoices i
    where i.id = v_invoice_id
      and i.tenant_id = v_tenant_id
      and i.patient_id = p_patient_id
    for update;
    if v_invoice.id is null then
      raise exception 'invoice_patient_mismatch' using errcode = '22023';
    end if;

    select coalesce(sum(amount_cents), 0) into v_paid_cents
    from public.payments
    where tenant_id = v_tenant_id
      and patient_invoice_id = v_invoice_id
      and status in ('paid', 'approved');
    v_outstanding_cents := greatest(v_invoice.amount_cents - v_paid_cents, 0);
  end if;

  if v_payment_id is not null then
    select * into v_payment
    from public.payments p
    where p.id = v_payment_id
      and p.tenant_id = v_tenant_id
      and p.patient_id = p_patient_id;
    if v_payment.id is null then
      raise exception 'payment_patient_mismatch' using errcode = '22023';
    end if;
  end if;

  if p_action = 'reminder' then
    insert into public.payment_reminders (
      tenant_id, patient_id, patient_invoice_id, channel, status, message, created_by, sent_at
    ) values (
      v_tenant_id, p_patient_id, v_invoice_id, 'portal', 'sent',
      coalesce(v_description, 'Lembrete financeiro enviado pelo time da clinica.'),
      v_user_id, now()
    ) returning id into v_id;

  elsif p_action = 'receipt' then
    if v_payment_id is null then
      raise exception 'payment_required' using errcode = '22023';
    end if;
    if v_amount_cents = 0 then
      v_amount_cents := v_payment.amount_cents;
    elsif v_amount_cents > v_payment.amount_cents then
      raise exception 'receipt_amount_exceeds_payment' using errcode = '22023';
    end if;
    insert into public.patient_receipts (
      tenant_id, patient_id, payment_id, receipt_number, description,
      amount_cents, issued_by, metadata
    ) values (
      v_tenant_id, p_patient_id, v_payment_id,
      'REC-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6),
      coalesce(v_description, 'Recibo financeiro'), v_amount_cents, v_user_id,
      coalesce(p_payload -> 'metadata', '{}'::jsonb)
    ) returning id into v_id;

  elsif p_action = 'payment' then
    if v_amount_cents <= 0 then
      raise exception 'payment_amount_required' using errcode = '22023';
    end if;
    if v_invoice_id is not null and v_amount_cents > v_outstanding_cents then
      raise exception 'payment_amount_exceeds_invoice_balance' using errcode = '22023';
    end if;
    insert into public.payments (
      tenant_id, patient_id, patient_invoice_id, provider, collection_mode,
      status, amount_cents, paid_at, due_date, method, metadata
    ) values (
      v_tenant_id, p_patient_id, v_invoice_id, 'local', 'local', 'paid', v_amount_cents,
      coalesce(nullif(p_payload ->> 'paidAt', '')::timestamptz, now()),
      nullif(p_payload ->> 'dueDate', '')::date,
      coalesce(nullif(p_payload ->> 'method', ''), 'manual'),
      coalesce(p_payload -> 'metadata', '{}'::jsonb) || jsonb_build_object(
        'source', 'manual_local_action', 'provider', 'local'
      )
    ) returning id into v_id;

    insert into public.patient_receipts (
      tenant_id, patient_id, payment_id, receipt_number, description,
      amount_cents, issued_by, metadata
    ) values (
      v_tenant_id, p_patient_id, v_id,
      'REC-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6),
      coalesce(v_description, 'Pagamento manual registrado'), v_amount_cents, v_user_id,
      jsonb_build_object('paymentId', v_id, 'source', 'manual_payment', 'provider', 'local')
    );

  elsif p_action = 'contract' then
    insert into public.patient_financial_contracts (
      tenant_id, patient_id, title, amount_cents, status, created_by, metadata
    ) values (
      v_tenant_id, p_patient_id,
      coalesce(v_title, v_description, 'Contrato financeiro'),
      v_amount_cents, 'active', v_user_id,
      coalesce(p_payload -> 'metadata', '{}'::jsonb)
    ) returning id into v_id;

  elsif p_action = 'negotiation' then
    if v_original_amount_cents <= 0 or v_negotiated_amount_cents <= 0 then
      raise exception 'negotiation_amounts_required' using errcode = '22023';
    end if;
    if v_negotiated_amount_cents > v_original_amount_cents then
      raise exception 'negotiated_amount_exceeds_original' using errcode = '22023';
    end if;
    insert into public.billing_negotiations (
      tenant_id, patient_id, original_amount_cents, negotiated_amount_cents,
      installments, status, description, notes, created_by
    ) values (
      v_tenant_id, p_patient_id, v_original_amount_cents, v_negotiated_amount_cents,
      v_installments, 'ativa', coalesce(v_description, 'Renegociacao financeira'),
      nullif(p_payload ->> 'notes', ''), v_user_id
    ) returning id into v_id;
  else
    raise exception 'invalid_financial_action' using errcode = '22023';
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id, v_user_id, 'patient_financial.' || p_action,
    'patient_financial_action', v_id::text,
    jsonb_build_object('patientId', p_patient_id, 'invoiceId', v_invoice_id, 'paymentId', v_payment_id)
  );

  return jsonb_build_object('id', v_id, 'action', p_action, 'status', 'ok');
end;
$$;

create or replace function public.review_payment_receipt(
  p_receipt_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_decision text := lower(coalesce(p_decision, ''));
  v_reason text := security.clean_financial_text(p_reason, 500);
  v_receipt public.payment_receipts%rowtype;
  v_invoice public.patient_invoices%rowtype;
  v_payment_id uuid;
  v_paid_cents bigint := 0;
  v_outstanding_cents bigint := 0;
  v_receipt_number text;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if v_decision not in ('approve', 'approved', 'reject', 'rejected') then
    raise exception 'invalid_review_decision' using errcode = '22023';
  end if;

  select * into v_receipt
  from public.payment_receipts
  where id = p_receipt_id
  for update;
  if v_receipt.id is null then
    raise exception 'payment_receipt_not_found' using errcode = 'P0002';
  end if;
  if not public.has_clinical_permission(v_receipt.tenant_id, 'financial.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_receipt.status in ('approved', 'rejected') then
    if (v_receipt.status = 'approved' and v_decision in ('approve', 'approved'))
       or (v_receipt.status = 'rejected' and v_decision in ('reject', 'rejected')) then
      return jsonb_build_object(
        'id', v_receipt.id, 'status', v_receipt.status,
        'paymentId', v_receipt.payment_id, 'reviewedAt', v_receipt.reviewed_at,
        'idempotent', true
      );
    end if;
    raise exception 'payment_receipt_already_reviewed' using errcode = '23514';
  end if;
  if v_receipt.status <> 'pending_review' then
    raise exception 'payment_receipt_not_ready' using errcode = '22023';
  end if;
  if v_decision in ('reject', 'rejected') and v_reason is null then
    raise exception 'review_reason_required' using errcode = '22023';
  end if;

  if v_receipt.patient_invoice_id is not null then
    select * into v_invoice
    from public.patient_invoices
    where id = v_receipt.patient_invoice_id
      and tenant_id = v_receipt.tenant_id
      and patient_id = v_receipt.patient_id
    for update;
    if v_invoice.id is null then
      raise exception 'invoice_patient_mismatch' using errcode = '22023';
    end if;

    select coalesce(sum(amount_cents), 0) into v_paid_cents
    from public.payments
    where tenant_id = v_receipt.tenant_id
      and patient_invoice_id = v_receipt.patient_invoice_id
      and status in ('paid', 'approved');
    v_outstanding_cents := greatest(v_invoice.amount_cents - v_paid_cents, 0);
    if v_decision in ('approve', 'approved') and v_receipt.amount_cents > v_outstanding_cents then
      raise exception 'receipt_amount_exceeds_invoice_balance' using errcode = '22023';
    end if;
  end if;

  if v_decision in ('approve', 'approved') then
    insert into public.payments (
      tenant_id, patient_id, patient_invoice_id, provider, collection_mode,
      status, amount_cents, paid_at, method, metadata
    ) values (
      v_receipt.tenant_id, v_receipt.patient_id, v_receipt.patient_invoice_id,
      'local', 'local', 'paid', v_receipt.amount_cents, now(), 'comprovante',
      jsonb_build_object('source', 'payment_receipt', 'payment_receipt_id', v_receipt.id, 'provider', 'local')
    ) returning id into v_payment_id;

    update public.payment_receipts
    set status = 'approved', payment_id = v_payment_id, reviewed_by = v_user_id,
        reviewed_at = now(), review_note = v_reason, rejection_reason = null
    where id = v_receipt.id
    returning * into v_receipt;

    v_receipt_number := 'REC-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || left(replace(v_receipt.id::text, '-', ''), 6);
    insert into public.patient_receipts (
      tenant_id, patient_id, payment_id, receipt_number, description,
      amount_cents, issued_by, payment_date, metadata
    ) values (
      v_receipt.tenant_id, v_receipt.patient_id, v_payment_id, v_receipt_number,
      'Recibo gerado apos aprovacao de comprovante', v_receipt.amount_cents,
      v_user_id, current_date,
      jsonb_build_object('source', 'payment_receipt', 'paymentReceiptId', v_receipt.id)
    );

    insert into public.patient_timeline_events (
      tenant_id, patient_id, event_type, category, title, description,
      status, status_label, event_at, payload
    ) values (
      v_receipt.tenant_id, v_receipt.patient_id, 'pagamento_recebido', 'financial',
      'Comprovante aprovado', 'Pagamento aprovado pela equipe financeira.',
      'recorded', 'pago', now(),
      jsonb_build_object('paymentReceiptId', v_receipt.id, 'paymentId', v_payment_id, 'invoiceId', v_receipt.patient_invoice_id)
    );

    insert into public.notifications (tenant_id, patient_id, title, body, category, status, metadata)
    values (
      v_receipt.tenant_id, v_receipt.patient_id, 'Comprovante aprovado',
      'Seu comprovante foi aprovado e o pagamento foi registrado.',
      'financeiro', 'unread', jsonb_build_object('paymentReceiptId', v_receipt.id)
    );
  else
    update public.payment_receipts
    set status = 'rejected', reviewed_by = v_user_id, reviewed_at = now(),
        review_note = v_reason, rejection_reason = v_reason
    where id = v_receipt.id
    returning * into v_receipt;

    insert into public.patient_timeline_events (
      tenant_id, patient_id, event_type, category, title, description,
      status, status_label, event_at, payload
    ) values (
      v_receipt.tenant_id, v_receipt.patient_id, 'pagamento', 'financial',
      'Comprovante rejeitado', 'Comprovante de pagamento rejeitado pela equipe financeira.',
      'recorded', 'rejeitado', now(),
      jsonb_build_object('paymentReceiptId', v_receipt.id, 'invoiceId', v_receipt.patient_invoice_id)
    );

    insert into public.notifications (tenant_id, patient_id, title, body, category, status, metadata)
    values (
      v_receipt.tenant_id, v_receipt.patient_id, 'Comprovante rejeitado',
      coalesce(v_reason, 'Revise o comprovante enviado e tente novamente.'),
      'financeiro', 'unread', jsonb_build_object('paymentReceiptId', v_receipt.id)
    );
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_receipt.tenant_id, v_user_id,
    'payment_receipt.' || case when v_receipt.status = 'approved' then 'approved' else 'rejected' end,
    'payment_receipt', v_receipt.id::text,
    jsonb_build_object('patientId', v_receipt.patient_id, 'invoiceId', v_receipt.patient_invoice_id, 'paymentId', v_payment_id)
  );

  return jsonb_build_object(
    'id', v_receipt.id, 'status', v_receipt.status,
    'paymentId', v_receipt.payment_id, 'reviewedAt', v_receipt.reviewed_at
  );
end;
$$;

revoke all on function public.create_patient_financial_local_action(uuid, text, jsonb) from public;
revoke all on function public.review_payment_receipt(uuid, text, text) from public;
grant execute on function public.create_patient_financial_local_action(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.review_payment_receipt(uuid, text, text) to authenticated, service_role;
