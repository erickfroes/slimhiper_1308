-- Program enrollment operational reflections.
-- Scope: complete Phase 6 MVP enrollment by creating local agenda, billing and
-- required-document task rows without calling external providers.

create or replace function public.enroll_patient_in_program(
  p_patient_id uuid,
  p_program_id uuid,
  p_start_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_program public.programs%rowtype;
  v_enrollment_id uuid;
  v_total_consultations integer := 0;
  v_total_nutrition integer := 0;
  v_step_days integer := 7;
  v_template_count integer := 0;
  v_template_id uuid;
  v_template_label text;
  v_template_channel text;
  v_template_questions jsonb;
  v_index integer;
  v_due_date date;
  v_checkins_created integer := 0;
  v_team_profile_id uuid;
  v_appointment_id uuid;
  v_invoice_id uuid;
  v_base_price numeric := 0;
  v_discount_percent numeric := 0;
  v_amount_cents integer := 0;
  v_installments integer := 1;
  v_invoice_description text;
  v_required_doc_count integer := 0;
  v_document_tasks_created integer := 0;
  v_required_doc record;
  v_task_id uuid;
begin
  select coalesce(
    (
      select p.active_tenant_id
      from public.profiles p
      where p.id = v_user_id
        and p.is_active = true
        and p.active_tenant_id is not null
        and security.is_tenant_member(p.active_tenant_id)
      limit 1
    ),
    (
      select tm.tenant_id
      from public.tenant_memberships tm
      join public.profiles p on p.id = tm.user_id
      where tm.user_id = v_user_id
        and tm.status = 'active'
        and p.is_active = true
      order by tm.created_at asc
      limit 1
    )
  )
  into v_tenant_id;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'packages.write', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.patients p
    where p.tenant_id = v_tenant_id
      and p.id = p_patient_id
  ) then
    raise exception 'patient_not_found' using errcode = 'P0002';
  end if;

  select *
    into v_program
  from public.programs
  where tenant_id = v_tenant_id
    and id = p_program_id;

  if not found then
    raise exception 'program_not_found' using errcode = 'P0002';
  end if;

  if v_program.status <> 'ativo' then
    raise exception 'program_not_active' using errcode = '22023';
  end if;

  select
    coalesce(sum(quantity) filter (
      where lower(label || ' ' || unit) like '%consulta%'
        and lower(label || ' ' || unit) not like '%nutri%'
    ), 0)::integer,
    coalesce(sum(quantity) filter (
      where lower(label || ' ' || unit) like '%nutri%'
    ), 0)::integer
  into v_total_consultations, v_total_nutrition
  from public.program_services
  where tenant_id = v_tenant_id
    and program_id = p_program_id;

  v_base_price := case
    when coalesce(v_program.financial_config ->> 'basePrice', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then greatest((v_program.financial_config ->> 'basePrice')::numeric, 0)
    else 0
  end;
  v_discount_percent := case
    when coalesce(v_program.financial_config ->> 'discountPercent', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then least(greatest((v_program.financial_config ->> 'discountPercent')::numeric, 0), 100)
    else 0
  end;
  v_installments := case
    when coalesce(v_program.financial_config ->> 'installments', '') ~ '^[0-9]+$'
      then greatest((v_program.financial_config ->> 'installments')::integer, 1)
    else 1
  end;
  v_amount_cents := greatest(round((v_base_price * (1 - v_discount_percent / 100)) * 100), 0)::integer;
  v_invoice_description := coalesce(
    nullif(v_program.payment_description, ''),
    nullif(v_program.financial_config ->> 'description', ''),
    'Programa ' || v_program.name
  );

  select count(*)::integer
    into v_required_doc_count
  from public.program_required_documents prd
  where prd.tenant_id = v_tenant_id
    and prd.program_id = p_program_id
    and prd.required = true;

  if not security.has_permission(v_tenant_id, 'agenda.write', true) then
    raise exception 'agenda_write_required' using errcode = '42501';
  end if;

  if v_amount_cents > 0 and not security.has_permission(v_tenant_id, 'financial.write', true) then
    raise exception 'financial_write_required' using errcode = '42501';
  end if;

  if v_required_doc_count > 0
     and not security.has_permission(v_tenant_id, 'patients.write', true) then
    raise exception 'patients_write_required_for_required_documents' using errcode = '42501';
  end if;

  select ptm.profile_id
    into v_team_profile_id
  from public.program_team_members ptm
  where ptm.tenant_id = v_tenant_id
    and ptm.program_id = p_program_id
  order by ptm.created_at asc
  limit 1;

  insert into public.patient_program_enrollments (
    tenant_id,
    patient_id,
    program_id,
    status,
    start_date,
    end_date,
    current_week,
    total_consultations,
    total_nutrition_sessions,
    metadata
  )
  values (
    v_tenant_id,
    p_patient_id,
    p_program_id,
    'ativo',
    p_start_date,
    p_start_date + (greatest(v_program.duration_weeks, 0) * 7) - 1,
    1,
    v_total_consultations,
    v_total_nutrition,
    jsonb_build_object(
      'created_by', v_user_id,
      'created_by_contract', 'enroll_patient_in_program',
      'checkins_total', v_program.checkins_total,
      'checkin_frequency', v_program.checkin_frequency,
      'payment_model', v_program.payment_model,
      'financial_config_snapshot', v_program.financial_config
    )
  )
  returning id into v_enrollment_id;

  insert into public.appointments (
    tenant_id,
    patient_id,
    type,
    status,
    scheduled_at,
    duration_minutes,
    practitioner_id,
    location,
    notes
  )
  values (
    v_tenant_id,
    p_patient_id,
    'avaliacao_inicial',
    'agendado',
    p_start_date::timestamptz + interval '9 hours',
    45,
    coalesce(v_team_profile_id, v_user_id),
    'Programa',
    'Entrada do programa ' || v_program.name || '. Enrollment ' || v_enrollment_id || '.'
  )
  returning id into v_appointment_id;

  if v_amount_cents > 0 then
    insert into public.patient_invoices (
      tenant_id,
      patient_id,
      status,
      amount_cents,
      due_date,
      description,
      metadata
    )
    values (
      v_tenant_id,
      p_patient_id,
      'pending',
      v_amount_cents,
      p_start_date,
      v_invoice_description,
      jsonb_build_object(
        'source', 'program_enrollment',
        'provider', 'local',
        'program_id', p_program_id,
        'program_name', v_program.name,
        'enrollment_id', v_enrollment_id,
        'payment_model', v_program.payment_model,
        'installments', v_installments,
        'base_price', v_base_price,
        'discount_percent', v_discount_percent,
        'created_by_contract', 'enroll_patient_in_program'
      )
    )
    returning id into v_invoice_id;
  end if;

  for v_required_doc in
    select prd.id, prd.label, prd.template_id
    from public.program_required_documents prd
    where prd.tenant_id = v_tenant_id
      and prd.program_id = p_program_id
      and prd.required = true
    order by prd.created_at asc, prd.id asc
  loop
    insert into public.patient_tasks (
      tenant_id,
      patient_id,
      status,
      title,
      details,
      due_at,
      assigned_to
    )
    values (
      v_tenant_id,
      p_patient_id,
      'open',
      'Documento obrigatorio: ' || v_required_doc.label || ' - ' || v_program.name,
      'Programa ' || v_program.name || '. Enrollment ' || v_enrollment_id
        || '. Documento obrigatorio do programa'
        || case when v_required_doc.template_id is not null
             then ' com template ' || v_required_doc.template_id
             else ' sem template vinculado'
           end || '.',
      (p_start_date + 3)::timestamptz + interval '18 hours',
      coalesce(v_team_profile_id, v_user_id)
    )
    on conflict (tenant_id, patient_id, title) do update
    set status = 'open',
        details = excluded.details,
        due_at = excluded.due_at,
        assigned_to = excluded.assigned_to,
        updated_at = now()
    returning id into v_task_id;

    v_document_tasks_created := v_document_tasks_created + 1;
  end loop;

  if lower(coalesce(v_program.checkin_frequency, '')) like '%quinzen%' then
    v_step_days := 14;
  elsif lower(coalesce(v_program.checkin_frequency, '')) like '%mensal%' then
    v_step_days := 30;
  else
    v_step_days := 7;
  end if;

  select count(*)::integer
    into v_template_count
  from public.program_checkin_templates
  where tenant_id = v_tenant_id
    and program_id = p_program_id;

  if v_program.checkins_total > 0 then
    for v_index in 1..least(v_program.checkins_total, 52) loop
      v_due_date := p_start_date + (v_index * v_step_days);
      v_template_id := null;
      v_template_label := null;
      v_template_channel := null;
      v_template_questions := '[]'::jsonb;

      if v_template_count > 0 then
        select pct.id, pct.label, pct.channel, pct.questions
          into v_template_id, v_template_label, v_template_channel, v_template_questions
        from public.program_checkin_templates pct
        where pct.tenant_id = v_tenant_id
          and pct.program_id = p_program_id
        order by pct.created_at asc
        offset ((v_index - 1) % v_template_count)
        limit 1;
      end if;

      insert into public.patient_program_checkins (
        tenant_id,
        patient_id,
        enrollment_id,
        program_id,
        template_id,
        title,
        channel,
        due_date,
        status,
        questions
      )
      values (
        v_tenant_id,
        p_patient_id,
        v_enrollment_id,
        p_program_id,
        v_template_id,
        coalesce(v_template_label, 'Check-in do programa') || ' #' || v_index,
        coalesce(v_template_channel, 'app'),
        v_due_date,
        'scheduled',
        coalesce(v_template_questions, '[]'::jsonb)
      );

      v_checkins_created := v_checkins_created + 1;
    end loop;
  end if;

  update public.patient_program_enrollments
  set metadata = metadata || jsonb_build_object(
        'appointment_id', v_appointment_id,
        'invoice_id', v_invoice_id,
        'document_tasks_created', v_document_tasks_created,
        'checkins_created', v_checkins_created,
        'operational_reflections_created_at', now()
      )
  where tenant_id = v_tenant_id
    and id = v_enrollment_id;

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
    p_patient_id,
    'programa_iniciado',
    'commercial',
    'recorded',
    'Programa iniciado',
    'Paciente matriculado em ' || v_program.name || '.',
    'Equipe clinica',
    'Ativo',
    'Ver pacote',
    '/clinic/patients/' || p_patient_id || '?tab=pacotes',
    now(),
    jsonb_build_object(
      'programId', p_program_id,
      'enrollmentId', v_enrollment_id,
      'appointmentId', v_appointment_id,
      'invoiceId', v_invoice_id,
      'documentTasksCreated', v_document_tasks_created,
      'checkinsCreated', v_checkins_created,
      'created_by_contract', 'enroll_patient_in_program'
    )
  );

  return jsonb_build_object(
    'id', v_enrollment_id,
    'patientId', p_patient_id,
    'programId', p_program_id,
    'appointmentId', v_appointment_id,
    'invoiceId', v_invoice_id,
    'documentTasksCreated', v_document_tasks_created,
    'checkinsCreated', v_checkins_created,
    'status', 'ativo'
  );
end;
$$;

grant execute on function public.enroll_patient_in_program(uuid, uuid, date) to authenticated, service_role;

comment on function public.enroll_patient_in_program(uuid, uuid, date) is
  'Enrolls a patient in an active program and creates local agenda, billing, required-document task and check-in reflections. External providers remain gated by Edge Functions.';
