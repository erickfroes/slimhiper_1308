-- P1: commercial, financial and clinical context for agenda appointments.
-- Keeps external providers gated. Agenda-originated charges are local
-- patient_invoices/payments only and appointment creation survives financial
-- failures with an auditable failed state.

alter table public.appointments
  add column if not exists commercial_program_id uuid,
  add column if not exists commercial_package_id uuid,
  add column if not exists commercial_service_id uuid,
  add column if not exists commercial_enrollment_id uuid,
  add column if not exists financial_invoice_id uuid,
  add column if not exists financial_payment_id uuid,
  add column if not exists financial_status text not null default 'not_required',
  add column if not exists financial_amount_cents integer,
  add column if not exists financial_due_date date,
  add column if not exists financial_payment_method text,
  add column if not exists financial_error text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.appointments
  drop constraint if exists appointments_financial_status_check,
  add constraint appointments_financial_status_check
  check (
    financial_status in (
      'not_required',
      'pending_local_invoice',
      'manual_paid',
      'failed'
    )
  );

alter table public.appointments
  drop constraint if exists appointments_financial_amount_non_negative,
  add constraint appointments_financial_amount_non_negative
  check (financial_amount_cents is null or financial_amount_cents >= 0);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_commercial_program_same_tenant'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_commercial_program_same_tenant
      foreign key (tenant_id, commercial_program_id)
      references public.programs(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_commercial_package_same_tenant'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_commercial_package_same_tenant
      foreign key (tenant_id, commercial_package_id)
      references public.packages(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_commercial_service_same_tenant'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_commercial_service_same_tenant
      foreign key (tenant_id, commercial_service_id)
      references public.services(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_commercial_enrollment_same_tenant'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_commercial_enrollment_same_tenant
      foreign key (tenant_id, commercial_enrollment_id)
      references public.patient_program_enrollments(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_financial_invoice_same_tenant'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_financial_invoice_same_tenant
      foreign key (tenant_id, financial_invoice_id)
      references public.patient_invoices(tenant_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_financial_payment_same_tenant'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_financial_payment_same_tenant
      foreign key (tenant_id, financial_payment_id)
      references public.payments(tenant_id, id);
  end if;
end;
$$;

create index if not exists idx_appointments_tenant_commercial_context
  on public.appointments(
    tenant_id,
    commercial_program_id,
    commercial_package_id,
    commercial_service_id,
    scheduled_at
  );

create index if not exists idx_appointments_tenant_financial_context
  on public.appointments(tenant_id, financial_status, financial_invoice_id, scheduled_at);

create or replace function public.apply_agenda_appointment_commercial_financial(
  p_appointment_id uuid,
  p_commercial_context jsonb default '{}'::jsonb,
  p_billing_context jsonb default '{}'::jsonb,
  p_operation text default 'updated'
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_commercial jsonb := coalesce(p_commercial_context, '{}'::jsonb);
  v_billing jsonb := coalesce(p_billing_context, '{}'::jsonb);
  v_program_id uuid := case
    when security.is_valid_uuid_text(coalesce(v_commercial ->> 'programId', ''))
      then (v_commercial ->> 'programId')::uuid
    else null
  end;
  v_package_id uuid := case
    when security.is_valid_uuid_text(coalesce(v_commercial ->> 'packageId', ''))
      then (v_commercial ->> 'packageId')::uuid
    else null
  end;
  v_service_id uuid := case
    when security.is_valid_uuid_text(coalesce(v_commercial ->> 'serviceId', ''))
      then (v_commercial ->> 'serviceId')::uuid
    else null
  end;
  v_enrollment_id uuid := case
    when security.is_valid_uuid_text(coalesce(v_commercial ->> 'enrollmentId', ''))
      then (v_commercial ->> 'enrollmentId')::uuid
    else null
  end;
  v_program_name text;
  v_package_name text;
  v_service_name text;
  v_package_price_cents integer := null;
  v_service_price_cents integer := null;
  v_billing_mode text := lower(coalesce(nullif(v_billing ->> 'mode', ''), 'none'));
  v_amount_cents integer := case
    when coalesce(v_billing ->> 'amountCents', '') ~ '^[0-9]+$'
      then (v_billing ->> 'amountCents')::integer
    else null
  end;
  v_due_date date := case
    when coalesce(v_billing ->> 'dueDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then (v_billing ->> 'dueDate')::date
    else current_date
  end;
  v_paid_at timestamptz := case
    when coalesce(v_billing ->> 'paidAt', '') <> ''
      then (v_billing ->> 'paidAt')::timestamptz
    else now()
  end;
  v_payment_method text := lower(coalesce(nullif(v_billing ->> 'paymentMethod', ''), 'pix'));
  v_description text := security.agenda_clean_reason(v_billing ->> 'description', 240);
  v_invoice_id uuid;
  v_payment_id uuid;
  v_financial_status text := 'not_required';
  v_financial_error text := null;
  v_commercial_payload jsonb;
  v_billing_payload jsonb;
  v_event_title text;
  v_event_description text;
begin
  if not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  select *
    into v_appointment
  from public.appointments a
  where a.tenant_id = v_tenant_id
    and a.id = p_appointment_id
  for update;

  if v_appointment.id is null then
    raise exception 'appointment_not_found_or_forbidden' using errcode = '42501';
  end if;

  if v_program_id is not null then
    select p.name
      into v_program_name
    from public.programs p
    where p.tenant_id = v_tenant_id
      and p.id = v_program_id
      and coalesce(p.status, 'ativo') <> 'arquivado';

    if v_program_name is null then
      raise exception 'program_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  if v_package_id is not null then
    select pk.name, pk.price_cents
      into v_package_name, v_package_price_cents
    from public.packages pk
    where pk.tenant_id = v_tenant_id
      and pk.id = v_package_id
      and pk.status = 'ativo';

    if v_package_name is null then
      raise exception 'package_not_found_or_inactive' using errcode = '42501';
    end if;

    if v_program_id is not null and not exists (
      select 1
      from public.program_packages pp
      where pp.tenant_id = v_tenant_id
        and pp.program_id = v_program_id
        and pp.package_id = v_package_id
        and pp.status = 'ativo'
    ) then
      raise exception 'package_program_mismatch' using errcode = '23514';
    end if;
  end if;

  if v_service_id is not null then
    select s.name, s.base_price_cents
      into v_service_name, v_service_price_cents
    from public.services s
    where s.tenant_id = v_tenant_id
      and s.id = v_service_id
      and s.status = 'ativo';

    if v_service_name is null then
      raise exception 'service_not_found_or_inactive' using errcode = '42501';
    end if;

    if v_package_id is not null and not exists (
      select 1
      from public.package_services ps
      where ps.tenant_id = v_tenant_id
        and ps.package_id = v_package_id
        and ps.service_id = v_service_id
    ) then
      raise exception 'service_package_mismatch' using errcode = '23514';
    end if;
  end if;

  if v_enrollment_id is not null then
    select e.id, coalesce(v_program_id, e.program_id), coalesce(v_package_id, e.package_id)
      into v_enrollment_id, v_program_id, v_package_id
    from public.patient_program_enrollments e
    where e.tenant_id = v_tenant_id
      and e.id = v_enrollment_id
      and e.patient_id = v_appointment.patient_id
      and e.status = 'ativo';

    if v_enrollment_id is null then
      raise exception 'enrollment_not_found_or_inactive' using errcode = '42501';
    end if;
  elsif v_program_id is not null or v_package_id is not null then
    select e.id
      into v_enrollment_id
    from public.patient_program_enrollments e
    where e.tenant_id = v_tenant_id
      and e.patient_id = v_appointment.patient_id
      and e.status = 'ativo'
      and (v_program_id is null or e.program_id = v_program_id)
      and (v_package_id is null or e.package_id = v_package_id)
    order by e.updated_at desc
    limit 1;
  end if;

  if v_program_id is not null and v_program_name is null then
    select p.name
      into v_program_name
    from public.programs p
    where p.tenant_id = v_tenant_id
      and p.id = v_program_id
      and coalesce(p.status, 'ativo') <> 'arquivado';
  end if;

  if v_package_id is not null and v_package_name is null then
    select pk.name, pk.price_cents
      into v_package_name, v_package_price_cents
    from public.packages pk
    where pk.tenant_id = v_tenant_id
      and pk.id = v_package_id
      and pk.status = 'ativo';
  end if;

  if v_billing_mode in ('invoice', 'pending', 'local_pending') then
    v_billing_mode := 'local_invoice';
  elsif v_billing_mode in ('paid', 'manual_payment', 'manual') then
    v_billing_mode := 'manual_paid';
  elsif v_billing_mode not in ('local_invoice', 'manual_paid') then
    v_billing_mode := 'none';
  end if;

  if v_payment_method not in (
    'pix',
    'cartao_credito',
    'cartao_debito',
    'boleto',
    'dinheiro',
    'transferencia'
  ) then
    v_payment_method := 'pix';
  end if;

  v_amount_cents := case
    when v_billing_mode = 'none' then null
    else coalesce(v_amount_cents, v_service_price_cents, v_package_price_cents, 0)
  end;

  v_description := coalesce(
    v_description,
    'Agendamento - ' || coalesce(v_service_name, v_package_name, v_program_name, 'consulta')
  );

  v_invoice_id := case
    when v_billing_mode <> 'none' then v_appointment.financial_invoice_id
    else null
  end;
  v_payment_id := case
    when v_billing_mode = 'manual_paid' then v_appointment.financial_payment_id
    else null
  end;

  if v_billing_mode <> 'none' and coalesce(v_amount_cents, 0) > 0 then
    begin
      if not security.has_permission(v_tenant_id, 'financial.write', true) then
        raise exception 'financial_write_required' using errcode = '42501';
      end if;

      if v_invoice_id is not null and exists (
        select 1
        from public.patient_invoices i
        where i.tenant_id = v_tenant_id
          and i.id = v_invoice_id
          and i.patient_id = v_appointment.patient_id
      ) then
        update public.patient_invoices
           set status = case when v_billing_mode = 'manual_paid' then 'paid' else status end,
               amount_cents = v_amount_cents,
               due_date = v_due_date,
               paid_at = case when v_billing_mode = 'manual_paid' then coalesce(paid_at, v_paid_at) else paid_at end,
               description = v_description,
               metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                 'source', 'agenda_appointment',
                 'provider', 'local',
                 'appointment_id', p_appointment_id,
                 'program_id', v_program_id,
                 'package_id', v_package_id,
                 'service_id', v_service_id,
                 'enrollment_id', v_enrollment_id,
                 'billing_mode', v_billing_mode,
                 'updated_by_contract', 'apply_agenda_appointment_commercial_financial'
               ),
               updated_at = now()
         where tenant_id = v_tenant_id
           and id = v_invoice_id;
      else
        insert into public.patient_invoices (
          tenant_id,
          patient_id,
          status,
          amount_cents,
          due_date,
          paid_at,
          description,
          metadata
        )
        values (
          v_tenant_id,
          v_appointment.patient_id,
          case when v_billing_mode = 'manual_paid' then 'paid' else 'pending' end,
          v_amount_cents,
          v_due_date,
          case when v_billing_mode = 'manual_paid' then v_paid_at else null end,
          v_description,
          jsonb_build_object(
            'source', 'agenda_appointment',
            'provider', 'local',
            'appointment_id', p_appointment_id,
            'program_id', v_program_id,
            'package_id', v_package_id,
            'service_id', v_service_id,
            'enrollment_id', v_enrollment_id,
            'billing_mode', v_billing_mode,
            'created_by_contract', 'apply_agenda_appointment_commercial_financial'
          )
        )
        returning id into v_invoice_id;
      end if;

      if v_billing_mode = 'manual_paid' then
        if v_payment_id is not null and exists (
          select 1
          from public.payments p
          where p.tenant_id = v_tenant_id
            and p.id = v_payment_id
            and p.patient_id = v_appointment.patient_id
        ) then
          update public.payments
             set patient_invoice_id = v_invoice_id,
                 status = 'paid',
                 amount_cents = v_amount_cents,
                 paid_at = coalesce(paid_at, v_paid_at),
                 due_date = v_due_date,
                 method = v_payment_method,
                 metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                   'source', 'agenda_manual_payment',
                   'appointment_id', p_appointment_id,
                   'invoice_id', v_invoice_id,
                   'updated_by_contract', 'apply_agenda_appointment_commercial_financial'
                 ),
                 updated_at = now()
           where tenant_id = v_tenant_id
             and id = v_payment_id;
        else
          insert into public.payments (
            tenant_id,
            patient_id,
            patient_invoice_id,
            status,
            amount_cents,
            paid_at,
            due_date,
            method,
            metadata
          )
          values (
            v_tenant_id,
            v_appointment.patient_id,
            v_invoice_id,
            'paid',
            v_amount_cents,
            v_paid_at,
            v_due_date,
            v_payment_method,
            jsonb_build_object(
              'source', 'agenda_manual_payment',
              'appointment_id', p_appointment_id,
              'invoice_id', v_invoice_id,
              'created_by_contract', 'apply_agenda_appointment_commercial_financial'
            )
          )
          returning id into v_payment_id;
        end if;

        update public.patient_invoices
           set status = 'paid',
               paid_at = coalesce(paid_at, v_paid_at),
               metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                 'manual_payment_id', v_payment_id,
                 'manual_payment_method', v_payment_method
               ),
               updated_at = now()
         where tenant_id = v_tenant_id
           and id = v_invoice_id;

        if not exists (
          select 1
          from public.patient_receipts pr
          where pr.tenant_id = v_tenant_id
            and pr.payment_id = v_payment_id
        ) then
          insert into public.patient_receipts (
            tenant_id,
            patient_id,
            payment_id,
            receipt_number,
            description,
            amount_cents,
            issued_by,
            payment_date,
            metadata
          )
          values (
            v_tenant_id,
            v_appointment.patient_id,
            v_payment_id,
            'REC-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || left(replace(v_payment_id::text, '-', ''), 6),
            v_description,
            v_amount_cents,
            v_user_id,
            (v_paid_at at time zone 'UTC')::date,
            jsonb_build_object('source', 'agenda_manual_payment', 'appointmentId', p_appointment_id)
          );
        end if;
      end if;

      v_financial_status := case
        when v_billing_mode = 'manual_paid' then 'manual_paid'
        else 'pending_local_invoice'
      end;
    exception
      when others then
        get stacked diagnostics v_financial_error = message_text;
        v_financial_status := 'failed';
        v_invoice_id := null;
        v_payment_id := null;
    end;
  elsif v_billing_mode <> 'none' then
    v_financial_status := 'failed';
    v_financial_error := 'financial_amount_required';
  end if;

  v_commercial_payload := jsonb_strip_nulls(jsonb_build_object(
    'programId', v_program_id,
    'programName', v_program_name,
    'packageId', v_package_id,
    'packageName', v_package_name,
    'serviceId', v_service_id,
    'serviceName', v_service_name,
    'enrollmentId', v_enrollment_id
  ));

  v_billing_payload := jsonb_strip_nulls(jsonb_build_object(
    'mode', v_billing_mode,
    'amountCents', v_amount_cents,
    'dueDate', case when v_billing_mode = 'none' then null else v_due_date end,
    'paymentMethod', case when v_billing_mode = 'manual_paid' then v_payment_method else null end,
    'invoiceId', v_invoice_id,
    'paymentId', v_payment_id,
    'financialStatus', v_financial_status,
    'financialError', v_financial_error
  ));

  update public.appointments
     set commercial_program_id = v_program_id,
         commercial_package_id = v_package_id,
         commercial_service_id = v_service_id,
         commercial_enrollment_id = v_enrollment_id,
         financial_invoice_id = v_invoice_id,
         financial_payment_id = v_payment_id,
         financial_status = v_financial_status,
         financial_amount_cents = v_amount_cents,
         financial_due_date = case when v_billing_mode = 'none' then null else v_due_date end,
         financial_payment_method = case when v_billing_mode = 'manual_paid' then v_payment_method else null end,
         financial_error = v_financial_error,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'commercialContext', v_commercial_payload,
           'billingContext', v_billing_payload,
           'sourceModule', 'agenda'
         ),
         updated_at = now()
   where tenant_id = v_tenant_id
     and id = p_appointment_id;

  v_event_title := case
    when p_operation = 'created' then 'Consulta agendada'
    else 'Consulta atualizada'
  end;
  v_event_description := 'Agendamento registrado com contexto operacional.';

  insert into public.patient_timeline_events (
    tenant_id,
    patient_id,
    event_type,
    category,
    status,
    title,
    description,
    actor_name,
    status_label,
    action_label,
    details_href,
    event_at,
    payload
  )
  values (
    v_tenant_id,
    v_appointment.patient_id,
    'consulta_agendada',
    'agenda',
    'recorded',
    v_event_title,
    v_event_description,
    'Equipe agenda',
    case
      when v_financial_status = 'failed' then 'financeiro parcial'
      when v_financial_status = 'manual_paid' then 'pago local'
      when v_financial_status = 'pending_local_invoice' then 'cobranca pendente'
      else 'sem cobranca'
    end,
    'Abrir agenda',
    '/clinic/agenda',
    now(),
    jsonb_build_object(
      'appointmentId', p_appointment_id,
      'patientId', v_appointment.patient_id,
      'sourceModule', 'agenda',
      'targetModule', 'patient360',
      'commercialContext', v_commercial_payload,
      'billingContext', v_billing_payload
    )
  );

  if v_invoice_id is not null then
    insert into public.patient_timeline_events (
      tenant_id,
      patient_id,
      event_type,
      category,
      status,
      title,
      description,
      actor_name,
      status_label,
      action_label,
      details_href,
      event_at,
      payload
    )
    values (
      v_tenant_id,
      v_appointment.patient_id,
      case when v_payment_id is not null then 'pagamento_recebido' else 'pagamento' end,
      'financial',
      'recorded',
      case when v_payment_id is not null then 'Pagamento local registrado' else 'Cobranca local criada' end,
      v_description,
      'Equipe financeira',
      case when v_payment_id is not null then 'pago' else 'pendente' end,
      'Abrir financeiro',
      '/clinic/financeiro',
      now(),
      jsonb_build_object(
        'appointmentId', p_appointment_id,
        'invoiceId', v_invoice_id,
        'paymentId', v_payment_id,
        'amountCents', v_amount_cents,
        'sourceModule', 'agenda',
        'targetModule', 'financeiro'
      )
    );
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'agenda.appointment_context_' || case when p_operation = 'created' then 'created' else 'updated' end,
    'appointment',
    p_appointment_id::text,
    jsonb_build_object(
      'patientId', v_appointment.patient_id,
      'sourceModule', 'agenda',
      'targetModules', jsonb_build_array('patient360', 'financeiro', 'encounter'),
      'commercialContext', v_commercial_payload,
      'billingContext', v_billing_payload
    )
  );

  if v_financial_status = 'failed' then
    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    values (
      v_tenant_id,
      v_user_id,
      'agenda.appointment_financial_failed',
      'appointment',
      p_appointment_id::text,
      jsonb_build_object(
        'patientId', v_appointment.patient_id,
        'amountCents', v_amount_cents,
        'billingMode', v_billing_mode,
        'error', v_financial_error
      )
    );
  end if;

  return jsonb_build_object(
    'id', p_appointment_id,
    'invoiceId', v_invoice_id,
    'paymentId', v_payment_id,
    'financialStatus', v_financial_status,
    'financialError', v_financial_error
  );
end;
$$;

create or replace function public.get_agenda_day_snapshot(
  p_target_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_date date := coalesce(p_target_date, current_date);
  v_timezone text := 'America/Sao_Paulo';
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_now timestamptz := now();
  v_appointments jsonb := '[]'::jsonb;
  v_queue jsonb := '[]'::jsonb;
  v_returns jsonb := '[]'::jsonb;
  v_blocked_slots jsonb := '[]'::jsonb;
  v_calendar_events jsonb := '{}'::jsonb;
begin
  if not security.has_permission(v_tenant_id, 'agenda.read', false) then
    raise exception 'agenda_read_required' using errcode = '42501';
  end if;

  select coalesce(nullif(t.settings #>> '{profile,timezone}', ''), 'America/Sao_Paulo')
    into v_timezone
  from public.tenants t
  where t.id = v_tenant_id;

  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    v_timezone := 'America/Sao_Paulo';
  end if;

  v_day_start := v_date::timestamp at time zone v_timezone;
  v_day_end := (v_date + 1)::timestamp at time zone v_timezone;
  v_month_start := date_trunc('month', v_date)::timestamp at time zone v_timezone;
  v_month_end := (date_trunc('month', v_date)::date + interval '1 month')::timestamp at time zone v_timezone;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'patientId', a.patient_id,
    'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
    'patientPhone', case
      when length(phone.digits) >= 4 then '(**) *****-' || right(phone.digits, 4)
      else null
    end,
    'activePackageName', coalesce(appt_package.name, appt_program.name, pkg.program_name, 'Sem pacote ativo'),
    'alertCount', coalesce(alerts.alert_count, 0),
    'type', a.type,
    'status', a.status,
    'scheduledAt', a.scheduled_at,
    'durationMinutes', coalesce(a.duration_minutes, 30),
    'professionalProfileId', a.professional_profile_id,
    'professionalUserId', coalesce(tp.user_id, a.practitioner_id),
    'professionalName', coalesce(pr.full_name, legacy_pr.full_name, 'Equipe clinica'),
    'professionalRole', coalesce(tp.professional_type, 'Profissional'),
    'roomId', a.room_id,
    'roomName', coalesce(r.name, a.location),
    'roomCode', r.code,
    'unitId', a.unit_id,
    'unitName', u.name,
    'programId', a.commercial_program_id,
    'programName', appt_program.name,
    'packageId', a.commercial_package_id,
    'packageName', appt_package.name,
    'serviceId', a.commercial_service_id,
    'serviceName', appt_service.name,
    'enrollmentId', a.commercial_enrollment_id,
    'invoiceId', a.financial_invoice_id,
    'paymentId', a.financial_payment_id,
    'financialStatus', a.financial_status,
    'financialAmountCents', a.financial_amount_cents,
    'financialDueDate', a.financial_due_date,
    'financialPaymentMethod', a.financial_payment_method,
    'financialError', a.financial_error,
    'notes', a.notes,
    'attendanceQueueId', aq.id,
    'attendanceQueueStatus', aq.status,
    'attendanceLink', '/clinic/patients/' || a.patient_id::text || '/encounter?appointmentId=' || a.id::text
  ) order by a.scheduled_at asc), '[]'::jsonb)
    into v_appointments
  from public.appointments a
  left join public.patient_pii pp
    on pp.tenant_id = a.tenant_id
   and pp.patient_id = a.patient_id
  left join lateral (
    select regexp_replace(coalesce(pp.phone, ''), '\D', '', 'g') as digits
  ) phone on true
  left join public.tenant_professionals tp
    on tp.tenant_id = a.tenant_id
   and tp.id = a.professional_profile_id
  left join public.profiles pr
    on pr.id = tp.user_id
  left join public.profiles legacy_pr
    on legacy_pr.id = a.practitioner_id
  left join public.clinic_rooms r
    on r.tenant_id = a.tenant_id
   and r.id = a.room_id
  left join public.tenant_units u
    on u.tenant_id = a.tenant_id
   and u.id = a.unit_id
  left join public.programs appt_program
    on appt_program.tenant_id = a.tenant_id
   and appt_program.id = a.commercial_program_id
  left join public.packages appt_package
    on appt_package.tenant_id = a.tenant_id
   and appt_package.id = a.commercial_package_id
  left join public.services appt_service
    on appt_service.tenant_id = a.tenant_id
   and appt_service.id = a.commercial_service_id
  left join public.attendance_queue aq
    on aq.tenant_id = a.tenant_id
   and aq.appointment_id = a.id
  left join lateral (
    select p.name as program_name
    from public.patient_program_enrollments e
    join public.programs p
      on p.tenant_id = e.tenant_id
     and p.id = e.program_id
    where e.tenant_id = a.tenant_id
      and e.patient_id = a.patient_id
      and e.status = 'ativo'
    order by e.updated_at desc
    limit 1
  ) pkg on true
  left join lateral (
    select count(*)::integer as alert_count
    from public.patient_alerts pa
    where pa.tenant_id = a.tenant_id
      and pa.patient_id = a.patient_id
      and pa.status = 'active'
  ) alerts on true
  where a.tenant_id = v_tenant_id
    and a.scheduled_at >= v_day_start
    and a.scheduled_at < v_day_end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'queueId', q.id,
    'appointmentId', q.appointment_id,
    'patientId', q.patient_id,
    'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
    'patientPhone', case
      when length(phone.digits) >= 4 then '(**) *****-' || right(phone.digits, 4)
      else null
    end,
    'activePackageName', coalesce(appt_package.name, appt_program.name, pkg.program_name, 'Sem pacote ativo'),
    'alertCount', coalesce(alerts.alert_count, 0),
    'appointmentType', a.type,
    'status', a.status,
    'queueStatus', q.status,
    'scheduledTime', a.scheduled_at,
    'arrivedAt', q.arrived_at,
    'calledAt', q.called_at,
    'startedAt', q.started_at,
    'completedAt', q.completed_at,
    'waitingMinutes', greatest(0, floor(extract(epoch from (v_now - coalesce(q.arrived_at, q.scheduled_at))) / 60))::integer,
    'professionalProfileId', coalesce(q.professional_profile_id, a.professional_profile_id),
    'professionalUserId', coalesce(q.assigned_to, qtp.user_id, atp.user_id, a.practitioner_id),
    'professionalName', coalesce(qpr.full_name, qtp_profile.full_name, atp_profile.full_name, legacy_pr.full_name, 'Equipe clinica'),
    'roomId', coalesce(q.room_id, a.room_id),
    'room', coalesce(qr.name, ar.name, q.room, a.location),
    'programId', a.commercial_program_id,
    'programName', appt_program.name,
    'packageId', a.commercial_package_id,
    'packageName', appt_package.name,
    'serviceId', a.commercial_service_id,
    'serviceName', appt_service.name,
    'invoiceId', a.financial_invoice_id,
    'paymentId', a.financial_payment_id,
    'financialStatus', a.financial_status,
    'encounterId', q.encounter_id,
    'attendanceLink', '/clinic/patients/' || q.patient_id::text || '/encounter?appointmentId=' || q.appointment_id::text
  ) order by
    case q.status
      when 'called' then 0
      when 'waiting' then 1
      when 'in_attendance' then 2
      when 'checkout' then 3
      when 'scheduled' then 4
      else 5
    end,
    q.scheduled_at asc), '[]'::jsonb)
    into v_queue
  from public.attendance_queue q
  join public.appointments a
    on a.tenant_id = q.tenant_id
   and a.id = q.appointment_id
  left join public.patient_pii pp
    on pp.tenant_id = q.tenant_id
   and pp.patient_id = q.patient_id
  left join lateral (
    select regexp_replace(coalesce(pp.phone, ''), '\D', '', 'g') as digits
  ) phone on true
  left join public.tenant_professionals qtp
    on qtp.tenant_id = q.tenant_id
   and qtp.id = q.professional_profile_id
  left join public.profiles qtp_profile
    on qtp_profile.id = qtp.user_id
  left join public.tenant_professionals atp
    on atp.tenant_id = a.tenant_id
   and atp.id = a.professional_profile_id
  left join public.profiles atp_profile
    on atp_profile.id = atp.user_id
  left join public.profiles qpr
    on qpr.id = q.assigned_to
  left join public.profiles legacy_pr
    on legacy_pr.id = a.practitioner_id
  left join public.clinic_rooms qr
    on qr.tenant_id = q.tenant_id
   and qr.id = q.room_id
  left join public.clinic_rooms ar
    on ar.tenant_id = a.tenant_id
   and ar.id = a.room_id
  left join public.programs appt_program
    on appt_program.tenant_id = a.tenant_id
   and appt_program.id = a.commercial_program_id
  left join public.packages appt_package
    on appt_package.tenant_id = a.tenant_id
   and appt_package.id = a.commercial_package_id
  left join public.services appt_service
    on appt_service.tenant_id = a.tenant_id
   and appt_service.id = a.commercial_service_id
  left join lateral (
    select p.name as program_name
    from public.patient_program_enrollments e
    join public.programs p
      on p.tenant_id = e.tenant_id
     and p.id = e.program_id
    where e.tenant_id = q.tenant_id
      and e.patient_id = q.patient_id
      and e.status = 'ativo'
    order by e.updated_at desc
    limit 1
  ) pkg on true
  left join lateral (
    select count(*)::integer as alert_count
    from public.patient_alerts pa
    where pa.tenant_id = q.tenant_id
      and pa.patient_id = q.patient_id
      and pa.status = 'active'
  ) alerts on true
  where q.tenant_id = v_tenant_id
    and q.scheduled_at >= v_day_start
    and q.scheduled_at < v_day_end
    and q.status in ('scheduled', 'waiting', 'called', 'in_attendance', 'checkout', 'stuck');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'patientId', r.patient_id,
    'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
    'patientPhone', case
      when length(phone.digits) >= 4 then '(**) *****-' || right(phone.digits, 4)
      else null
    end,
    'activePackageName', coalesce(pkg.program_name, 'Sem pacote ativo'),
    'alertCount', coalesce(alerts.alert_count, 0),
    'dueDate', r.due_date,
    'status', r.status,
    'reason', r.reason,
    'contactMethod', r.contact_method,
    'lastContactAt', r.last_contact_at,
    'nextActionAt', r.next_action_at,
    'sourceAppointmentId', r.source_appointment_id,
    'targetAppointmentId', r.target_appointment_id,
    'notes', r.notes,
    'href', '/clinic/patients/' || r.patient_id::text
  ) order by r.due_date asc, r.created_at asc), '[]'::jsonb)
    into v_returns
  from public.patient_returns r
  left join public.patient_pii pp
    on pp.tenant_id = r.tenant_id
   and pp.patient_id = r.patient_id
  left join lateral (
    select regexp_replace(coalesce(pp.phone, ''), '\D', '', 'g') as digits
  ) phone on true
  left join lateral (
    select p.name as program_name
    from public.patient_program_enrollments e
    join public.programs p
      on p.tenant_id = e.tenant_id
     and p.id = e.program_id
    where e.tenant_id = r.tenant_id
      and e.patient_id = r.patient_id
      and e.status = 'ativo'
    order by e.updated_at desc
    limit 1
  ) pkg on true
  left join lateral (
    select count(*)::integer as alert_count
    from public.patient_alerts pa
    where pa.tenant_id = r.tenant_id
      and pa.patient_id = r.patient_id
      and pa.status = 'active'
  ) alerts on true
  where r.tenant_id = v_tenant_id
    and r.status in ('pendente', 'contatado', 'vencido')
    and (
      r.due_date <= v_date + 30
      or r.next_action_at < v_day_end
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', bs.id,
    'startAt', bs.start_at,
    'endAt', bs.end_at,
    'status', bs.status,
    'reason', bs.reason,
    'location', coalesce(br.name, bs.location),
    'roomId', bs.room_id,
    'roomName', br.name
  ) order by bs.start_at asc), '[]'::jsonb)
    into v_blocked_slots
  from public.blocked_slots bs
  left join public.clinic_rooms br
    on br.tenant_id = bs.tenant_id
   and br.id = bs.room_id
  where bs.tenant_id = v_tenant_id
    and bs.status = 'active'
    and bs.start_at < v_day_end
    and bs.end_at > v_day_start;

  select coalesce(jsonb_object_agg(day_key, total), '{}'::jsonb)
    into v_calendar_events
  from (
    select
      to_char(a.scheduled_at at time zone v_timezone, 'YYYY-MM-DD') as day_key,
      count(*)::integer as total
    from public.appointments a
    where a.tenant_id = v_tenant_id
      and a.scheduled_at >= v_month_start
      and a.scheduled_at < v_month_end
    group by day_key
  ) events;

  return jsonb_build_object(
    'date', v_date,
    'timezone', v_timezone,
    'appointments', v_appointments,
    'waitingQueue', v_queue,
    'returns', v_returns,
    'blockedSlots', v_blocked_slots,
    'calendarEvents', v_calendar_events
  );
end;
$$;

drop function if exists public.create_agenda_appointment(uuid, text, timestamptz, integer, text, text, uuid, uuid, uuid);
drop function if exists public.update_agenda_appointment(uuid, uuid, text, timestamptz, integer, text, text, uuid, uuid, uuid);

create or replace function public.create_agenda_appointment(
  p_patient_id uuid,
  p_type text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 30,
  p_location text default null,
  p_notes text default null,
  p_professional_profile_id uuid default null,
  p_room_id uuid default null,
  p_unit_id uuid default null,
  p_commercial_context jsonb default '{}'::jsonb,
  p_billing_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_duration integer := greatest(coalesce(p_duration_minutes, 30), 1);
  v_start timestamptz := p_scheduled_at;
  v_end timestamptz := p_scheduled_at + (greatest(coalesce(p_duration_minutes, 30), 1) * interval '1 minute');
  v_timezone text := 'America/Sao_Paulo';
  v_work_date date;
  v_location text := security.agenda_clean_reason(p_location, 120);
  v_room_name text;
  v_room_unit_id uuid;
  v_professional_unit_id uuid;
  v_practitioner_id uuid;
  v_unit_id uuid := p_unit_id;
  v_appointment_id uuid;
  v_context jsonb := '{}'::jsonb;
begin
  if not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  if p_patient_id is null or p_scheduled_at is null then
    raise exception 'invalid_appointment_payload' using errcode = '22023';
  end if;

  perform 1
  from public.patients p
  where p.tenant_id = v_tenant_id
    and p.id = p_patient_id;

  if not found then
    raise exception 'patient_not_found_or_forbidden' using errcode = '42501';
  end if;

  select coalesce(nullif(t.settings #>> '{profile,timezone}', ''), 'America/Sao_Paulo')
    into v_timezone
  from public.tenants t
  where t.id = v_tenant_id;

  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    v_timezone := 'America/Sao_Paulo';
  end if;

  v_work_date := (v_start at time zone v_timezone)::date;

  if p_room_id is not null then
    select r.name, r.unit_id
      into v_room_name, v_room_unit_id
    from public.clinic_rooms r
    where r.tenant_id = v_tenant_id
      and r.id = p_room_id
      and r.status = 'active';

    if not found then
      raise exception 'room_not_found_or_unavailable' using errcode = '42501';
    end if;

    v_location := coalesce(v_room_name, v_location);
  end if;

  if p_professional_profile_id is not null then
    select tp.user_id, tp.unit_id
      into v_practitioner_id, v_professional_unit_id
    from public.tenant_professionals tp
    join public.tenant_memberships tm
      on tm.tenant_id = tp.tenant_id
     and tm.id = tp.membership_id
    where tp.tenant_id = v_tenant_id
      and tp.id = p_professional_profile_id
      and tp.is_active = true
      and tm.status in ('active', 'invited');

    if not found then
      raise exception 'professional_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  if v_room_unit_id is not null and v_professional_unit_id is not null and v_room_unit_id <> v_professional_unit_id then
    raise exception 'room_professional_unit_mismatch' using errcode = '23514';
  end if;

  v_unit_id := coalesce(v_unit_id, v_room_unit_id, v_professional_unit_id);

  if p_unit_id is not null and (
    (v_room_unit_id is not null and p_unit_id <> v_room_unit_id)
    or (v_professional_unit_id is not null and p_unit_id <> v_professional_unit_id)
  ) then
    raise exception 'unit_mismatch' using errcode = '23514';
  end if;

  if v_unit_id is not null and not exists (
    select 1
    from public.tenant_units u
    where u.tenant_id = v_tenant_id
      and u.id = v_unit_id
  ) then
    raise exception 'unit_not_found_or_forbidden' using errcode = '42501';
  end if;

  if p_professional_profile_id is not null and not exists (
    select 1
    from public.professional_day_allocations a
    where a.tenant_id = v_tenant_id
      and a.professional_profile_id = p_professional_profile_id
      and a.work_date = v_work_date
      and a.status in ('available', 'scheduled')
      and a.starts_at <= v_start
      and a.ends_at >= v_end
      and (p_room_id is null or a.room_id = p_room_id)
  ) then
    raise exception 'professional_not_allocated_for_time' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.tenant_id = v_tenant_id
      and a.status not in ('cancelado', 'falta')
      and a.scheduled_at < v_end
      and (a.scheduled_at + (coalesce(a.duration_minutes, 30) * interval '1 minute')) > v_start
      and (
        a.patient_id = p_patient_id
        or (p_room_id is not null and a.room_id = p_room_id)
        or (p_professional_profile_id is not null and a.professional_profile_id = p_professional_profile_id)
        or (v_practitioner_id is not null and a.practitioner_id = v_practitioner_id)
        or (
          v_location is not null
          and lower(coalesce(a.location, '')) = lower(v_location)
        )
      )
  ) then
    raise exception 'appointment_conflict' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.blocked_slots bs
    where bs.tenant_id = v_tenant_id
      and bs.status = 'active'
      and bs.start_at < v_end
      and bs.end_at > v_start
      and (
        (bs.room_id is null and bs.practitioner_id is null and bs.location is null)
        or (p_room_id is not null and bs.room_id = p_room_id)
        or (v_practitioner_id is not null and bs.practitioner_id = v_practitioner_id)
        or (
          v_location is not null
          and lower(coalesce(bs.location, '')) = lower(v_location)
        )
      )
  ) then
    raise exception 'blocked_slot_conflict' using errcode = '23505';
  end if;

  insert into public.appointments (
    tenant_id,
    patient_id,
    type,
    status,
    scheduled_at,
    duration_minutes,
    practitioner_id,
    professional_profile_id,
    room_id,
    unit_id,
    location,
    notes,
    metadata
  )
  values (
    v_tenant_id,
    p_patient_id,
    coalesce(nullif(p_type, ''), 'consulta_medica'),
    'agendado',
    p_scheduled_at,
    v_duration,
    v_practitioner_id,
    p_professional_profile_id,
    p_room_id,
    v_unit_id,
    v_location,
    security.agenda_clean_reason(p_notes, 1000),
    jsonb_build_object('sourceModule', 'agenda')
  )
  returning id into v_appointment_id;

  v_context := public.apply_agenda_appointment_commercial_financial(
    v_appointment_id,
    p_commercial_context,
    p_billing_context,
    'created'
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'agenda.appointment_created',
    'appointment',
    v_appointment_id::text,
    jsonb_build_object(
      'patientId', p_patient_id,
      'scheduledAt', p_scheduled_at,
      'type', coalesce(nullif(p_type, ''), 'consulta_medica'),
      'professionalProfileId', p_professional_profile_id,
      'roomId', p_room_id,
      'unitId', v_unit_id,
      'context', v_context
    )
  );

  return jsonb_build_object(
    'id', v_appointment_id,
    'invoiceId', v_context ->> 'invoiceId',
    'paymentId', v_context ->> 'paymentId',
    'financialStatus', v_context ->> 'financialStatus',
    'financialError', v_context ->> 'financialError'
  );
end;
$$;

create or replace function public.update_agenda_appointment(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_type text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 30,
  p_location text default null,
  p_notes text default null,
  p_professional_profile_id uuid default null,
  p_room_id uuid default null,
  p_unit_id uuid default null,
  p_commercial_context jsonb default '{}'::jsonb,
  p_billing_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_agenda_tenant();
  v_user_id uuid := auth.uid();
  v_duration integer := greatest(coalesce(p_duration_minutes, 30), 1);
  v_start timestamptz := p_scheduled_at;
  v_end timestamptz := p_scheduled_at + (greatest(coalesce(p_duration_minutes, 30), 1) * interval '1 minute');
  v_timezone text := 'America/Sao_Paulo';
  v_work_date date;
  v_location text := security.agenda_clean_reason(p_location, 120);
  v_room_name text;
  v_room_unit_id uuid;
  v_professional_unit_id uuid;
  v_practitioner_id uuid;
  v_unit_id uuid := p_unit_id;
  v_context jsonb := '{}'::jsonb;
begin
  if not security.has_permission(v_tenant_id, 'agenda.write', false) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  if p_appointment_id is null or p_patient_id is null or p_scheduled_at is null then
    raise exception 'invalid_appointment_payload' using errcode = '22023';
  end if;

  perform 1
  from public.appointments a
  where a.tenant_id = v_tenant_id
    and a.id = p_appointment_id
  for update;

  if not found then
    raise exception 'appointment_not_found_or_forbidden' using errcode = '42501';
  end if;

  perform 1
  from public.patients p
  where p.tenant_id = v_tenant_id
    and p.id = p_patient_id;

  if not found then
    raise exception 'patient_not_found_or_forbidden' using errcode = '42501';
  end if;

  select coalesce(nullif(t.settings #>> '{profile,timezone}', ''), 'America/Sao_Paulo')
    into v_timezone
  from public.tenants t
  where t.id = v_tenant_id;

  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    v_timezone := 'America/Sao_Paulo';
  end if;

  v_work_date := (v_start at time zone v_timezone)::date;

  if p_room_id is not null then
    select r.name, r.unit_id
      into v_room_name, v_room_unit_id
    from public.clinic_rooms r
    where r.tenant_id = v_tenant_id
      and r.id = p_room_id
      and r.status = 'active';

    if not found then
      raise exception 'room_not_found_or_unavailable' using errcode = '42501';
    end if;

    v_location := coalesce(v_room_name, v_location);
  end if;

  if p_professional_profile_id is not null then
    select tp.user_id, tp.unit_id
      into v_practitioner_id, v_professional_unit_id
    from public.tenant_professionals tp
    join public.tenant_memberships tm
      on tm.tenant_id = tp.tenant_id
     and tm.id = tp.membership_id
    where tp.tenant_id = v_tenant_id
      and tp.id = p_professional_profile_id
      and tp.is_active = true
      and tm.status in ('active', 'invited');

    if not found then
      raise exception 'professional_not_found_or_forbidden' using errcode = '42501';
    end if;
  end if;

  if v_room_unit_id is not null and v_professional_unit_id is not null and v_room_unit_id <> v_professional_unit_id then
    raise exception 'room_professional_unit_mismatch' using errcode = '23514';
  end if;

  v_unit_id := coalesce(v_unit_id, v_room_unit_id, v_professional_unit_id);

  if p_unit_id is not null and (
    (v_room_unit_id is not null and p_unit_id <> v_room_unit_id)
    or (v_professional_unit_id is not null and p_unit_id <> v_professional_unit_id)
  ) then
    raise exception 'unit_mismatch' using errcode = '23514';
  end if;

  if v_unit_id is not null and not exists (
    select 1
    from public.tenant_units u
    where u.tenant_id = v_tenant_id
      and u.id = v_unit_id
  ) then
    raise exception 'unit_not_found_or_forbidden' using errcode = '42501';
  end if;

  if p_professional_profile_id is not null and not exists (
    select 1
    from public.professional_day_allocations a
    where a.tenant_id = v_tenant_id
      and a.professional_profile_id = p_professional_profile_id
      and a.work_date = v_work_date
      and a.status in ('available', 'scheduled')
      and a.starts_at <= v_start
      and a.ends_at >= v_end
      and (p_room_id is null or a.room_id = p_room_id)
  ) then
    raise exception 'professional_not_allocated_for_time' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.tenant_id = v_tenant_id
      and a.id <> p_appointment_id
      and a.status not in ('cancelado', 'falta')
      and a.scheduled_at < v_end
      and (a.scheduled_at + (coalesce(a.duration_minutes, 30) * interval '1 minute')) > v_start
      and (
        a.patient_id = p_patient_id
        or (p_room_id is not null and a.room_id = p_room_id)
        or (p_professional_profile_id is not null and a.professional_profile_id = p_professional_profile_id)
        or (v_practitioner_id is not null and a.practitioner_id = v_practitioner_id)
        or (
          v_location is not null
          and lower(coalesce(a.location, '')) = lower(v_location)
        )
      )
  ) then
    raise exception 'appointment_conflict' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.blocked_slots bs
    where bs.tenant_id = v_tenant_id
      and bs.status = 'active'
      and bs.start_at < v_end
      and bs.end_at > v_start
      and (
        (bs.room_id is null and bs.practitioner_id is null and bs.location is null)
        or (p_room_id is not null and bs.room_id = p_room_id)
        or (v_practitioner_id is not null and bs.practitioner_id = v_practitioner_id)
        or (
          v_location is not null
          and lower(coalesce(bs.location, '')) = lower(v_location)
        )
      )
  ) then
    raise exception 'blocked_slot_conflict' using errcode = '23505';
  end if;

  update public.appointments
     set patient_id = p_patient_id,
         type = coalesce(nullif(p_type, ''), 'consulta_medica'),
         scheduled_at = p_scheduled_at,
         duration_minutes = v_duration,
         practitioner_id = v_practitioner_id,
         professional_profile_id = p_professional_profile_id,
         room_id = p_room_id,
         unit_id = v_unit_id,
         location = v_location,
         notes = security.agenda_clean_reason(p_notes, 1000),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('sourceModule', 'agenda'),
         updated_at = now()
   where tenant_id = v_tenant_id
     and id = p_appointment_id;

  v_context := public.apply_agenda_appointment_commercial_financial(
    p_appointment_id,
    p_commercial_context,
    p_billing_context,
    'updated'
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'agenda.appointment_updated',
    'appointment',
    p_appointment_id::text,
    jsonb_build_object(
      'patientId', p_patient_id,
      'scheduledAt', p_scheduled_at,
      'type', coalesce(nullif(p_type, ''), 'consulta_medica'),
      'professionalProfileId', p_professional_profile_id,
      'roomId', p_room_id,
      'unitId', v_unit_id,
      'context', v_context
    )
  );

  return jsonb_build_object(
    'id', p_appointment_id,
    'invoiceId', v_context ->> 'invoiceId',
    'paymentId', v_context ->> 'paymentId',
    'financialStatus', v_context ->> 'financialStatus',
    'financialError', v_context ->> 'financialError'
  );
end;
$$;

revoke all on function public.apply_agenda_appointment_commercial_financial(uuid, jsonb, jsonb, text) from public;
revoke all on function public.create_agenda_appointment(uuid, text, timestamptz, integer, text, text, uuid, uuid, uuid, jsonb, jsonb) from public;
revoke all on function public.update_agenda_appointment(uuid, uuid, text, timestamptz, integer, text, text, uuid, uuid, uuid, jsonb, jsonb) from public;

grant execute on function public.apply_agenda_appointment_commercial_financial(uuid, jsonb, jsonb, text) to authenticated, service_role;
grant execute on function public.create_agenda_appointment(uuid, text, timestamptz, integer, text, text, uuid, uuid, uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.update_agenda_appointment(uuid, uuid, text, timestamptz, integer, text, text, uuid, uuid, uuid, jsonb, jsonb) to authenticated, service_role;

comment on function public.apply_agenda_appointment_commercial_financial(uuid, jsonb, jsonb, text) is
  'Links agenda appointments to commercial context and local financial records without calling external providers.';

comment on column public.appointments.financial_status is
  'Local agenda billing status: not_required, pending_local_invoice, manual_paid or failed. Provider calls remain gated outside agenda.';
