-- M05: operational dashboard snapshot with actionable, permissioned sections.
-- Returns aggregate dashboard data through one RPC so the browser does not read broad PII tables directly.

create or replace function public.get_clinic_dashboard_snapshot(
  p_target_date date default current_date,
  p_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_date date := coalesce(p_target_date, current_date);
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 50);
  v_day_start timestamptz := v_date::timestamptz;
  v_day_end timestamptz := (v_date + 1)::timestamptz;
  v_now timestamptz := now();

  v_can_patients boolean := false;
  v_can_agenda boolean := false;
  v_can_documents boolean := false;
  v_can_financial boolean := false;
  v_can_chat boolean := false;
  v_can_crm boolean := false;
  v_can_inventory boolean := false;
  v_can_patient_detail boolean := false;

  v_consultas_hoje integer := 0;
  v_consultas_concluidas integer := 0;
  v_fila_espera integer := 0;
  v_programas_ativos integer := 0;
  v_alertas_clinicos integer := 0;
  v_mensagens_nao_lidas integer := 0;
  v_documentos_pendentes integer := 0;
  v_inadimplentes integer := 0;
  v_taxa_ocupacao integer := 0;
  v_baixa_adesao integer := 0;
  v_renovacoes_pendentes integer := 0;

  v_today_appointments jsonb := '[]'::jsonb;
  v_waiting_queue jsonb := '[]'::jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_low_adherence jsonb := '[]'::jsonb;
  v_review_patients jsonb := '[]'::jsonb;
  v_financial_pendencies jsonb := '[]'::jsonb;
  v_document_pendencies jsonb := '[]'::jsonb;
  v_recent_messages jsonb := '[]'::jsonb;
  v_renewal_pipeline jsonb := '[]'::jsonb;
  v_cohort_panel jsonb := '[]'::jsonb;
  v_operational_insights jsonb := jsonb_build_object(
    'crm', jsonb_build_object('canRead', false, 'openLeads', 0, 'overdueTasks', 0, 'href', '/clinic/crm'),
    'inventory', jsonb_build_object('canRead', false, 'criticalStockItems', 0, 'expiringLots', 0, 'daysToExpiry', 30, 'href', '/clinic/inventory')
  );
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select p.active_tenant_id into v_tenant_id
  from public.profiles p
  where p.id = v_user_id
    and p.is_active = true
    and p.active_tenant_id is not null
    and security.is_tenant_member(p.active_tenant_id);

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = v_user_id
      and tm.status = 'active'
      and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_patients := security.has_permission(v_tenant_id, 'patients.read', false);
  v_can_agenda := security.has_permission(v_tenant_id, 'agenda.read', false);
  v_can_documents := security.has_permission(v_tenant_id, 'documents.read', false);
  v_can_financial := security.has_permission(v_tenant_id, 'financial.read', false);
  v_can_chat := security.has_permission(v_tenant_id, 'chat.read', false);
  v_can_crm := security.has_permission(v_tenant_id, 'crm.read', false);
  v_can_inventory := security.has_permission(v_tenant_id, 'inventory.read', false);
  v_can_patient_detail := v_can_patients;

  if v_can_crm or v_can_inventory then
    v_operational_insights := public.get_crm_inventory_dashboard_insights(30);
  end if;

  if v_can_agenda then
    select
      count(*)::integer,
      count(*) filter (where a.status = 'concluido')::integer,
      count(*) filter (where a.status in ('chegou', 'triagem', 'medidas', 'bioimpedancia', 'aguardando_medico', 'em_consulta', 'checkout'))::integer
    into v_consultas_hoje, v_consultas_concluidas, v_fila_espera
    from public.appointments a
    where a.tenant_id = v_tenant_id
      and a.scheduled_at >= v_day_start
      and a.scheduled_at < v_day_end;

    if v_consultas_hoje > 0 then
      v_taxa_ocupacao := round((v_consultas_concluidas::numeric / v_consultas_hoje::numeric) * 100)::integer;
    end if;

    if v_can_patient_detail then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'patientId', a.patient_id,
        'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
        'type', a.type,
        'status', a.status,
        'scheduledAt', a.scheduled_at,
        'durationMinutes', coalesce(a.duration_minutes, 30),
        'professionalName', coalesce(pr.full_name, 'Equipe clinica'),
        'professionalRole', 'Profissional',
        'roomName', a.location
      ) order by a.scheduled_at asc), '[]'::jsonb)
      into v_today_appointments
      from public.appointments a
      left join public.patient_pii pp on pp.tenant_id = a.tenant_id and pp.patient_id = a.patient_id
      left join public.profiles pr on pr.id = a.practitioner_id
      where a.tenant_id = v_tenant_id
        and a.scheduled_at >= v_day_start
        and a.scheduled_at < v_day_end;

      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'patientId', a.patient_id,
        'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
        'appointmentType', a.type,
        'status', a.status,
        'scheduledTime', a.scheduled_at,
        'arrivedAt', a.arrived_at,
        'waitingMinutes', greatest(0, floor(extract(epoch from (v_now - coalesce(a.arrived_at, a.scheduled_at))) / 60))::integer,
        'professionalName', coalesce(pr.full_name, 'Equipe clinica'),
        'room', a.location
      ) order by a.scheduled_at asc), '[]'::jsonb)
      into v_waiting_queue
      from (
        select *
        from public.appointments a
        where a.tenant_id = v_tenant_id
          and a.scheduled_at >= v_day_start
          and a.scheduled_at < v_day_end
          and a.status in ('chegou', 'triagem', 'medidas', 'bioimpedancia', 'aguardando_medico', 'em_consulta', 'checkout')
        order by a.scheduled_at asc
        limit v_limit
      ) a
      left join public.patient_pii pp on pp.tenant_id = a.tenant_id and pp.patient_id = a.patient_id
      left join public.profiles pr on pr.id = a.practitioner_id;
    end if;
  end if;

  if v_can_patients then
    select count(*)::integer into v_programas_ativos
    from public.patient_program_enrollments e
    where e.tenant_id = v_tenant_id
      and e.status = 'ativo';

    select count(*)::integer into v_alertas_clinicos
    from public.patient_alerts pa
    where pa.tenant_id = v_tenant_id
      and pa.status = 'active';

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', pa.id,
      'patientId', pa.patient_id,
      'severity', coalesce(pa.severity, 'medium'),
      'title', pa.title,
      'description', coalesce(pa.description, ''),
      'createdAt', pa.created_at,
      'isResolved', false,
      'category', case
        when pa.alert_type in ('financeiro', 'financial') then 'financeiro'
        when pa.alert_type in ('adesao', 'adherence') then 'adesao'
        when pa.alert_type in ('documento', 'document') then 'documento'
        else 'clinico'
      end
    ) order by
      case coalesce(pa.severity, 'medium')
        when 'critical' then 0 when 'critico' then 0
        when 'high' then 1 when 'alto' then 1
        when 'medium' then 2 when 'medio' then 2
        else 3
      end,
      pa.created_at desc
    ), '[]'::jsonb)
    into v_alerts
    from (
      select *
      from public.patient_alerts pa
      where pa.tenant_id = v_tenant_id
        and pa.status = 'active'
      order by pa.created_at desc
      limit v_limit
    ) pa;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', 'low-adherence-' || (item ->> 'patientId'),
      'patientId', item ->> 'patientId',
      'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
      'adherencePercent', coalesce((item ->> 'adherencePercent')::integer, 0),
      'reason', coalesce(item ->> 'reason', 'Adesao diaria baixa'),
      'severity', coalesce(item ->> 'severity', 'medium'),
      'lastSignalAt', item ->> 'lastSignalAt',
      'href', coalesce(item ->> 'href', '/clinic/patients/' || (item ->> 'patientId') || '?tab=timeline')
    ) order by coalesce((item ->> 'adherencePercent')::integer, 100) asc), '[]'::jsonb)
    into v_low_adherence
    from jsonb_array_elements(public.get_clinic_daily_adherence_snapshot(v_date, v_limit)) item
    left join public.patient_pii pp
      on pp.tenant_id = v_tenant_id
     and pp.patient_id = (item ->> 'patientId')::uuid;

    v_baixa_adesao := jsonb_array_length(v_low_adherence);

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'patientId', e.patient_id,
      'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
      'programName', coalesce(p.name, 'Programa ativo'),
      'endDate', e.end_date,
      'daysToEnd', greatest(0, e.end_date - v_date),
      'href', '/clinic/patients/' || e.patient_id::text
    ) order by e.end_date asc), '[]'::jsonb)
    into v_renewal_pipeline
    from (
      select *
      from public.patient_program_enrollments e
      where e.tenant_id = v_tenant_id
        and e.status = 'ativo'
        and e.end_date is not null
        and e.end_date between v_date and (v_date + 21)
      order by e.end_date asc
      limit v_limit
    ) e
    left join public.patient_pii pp on pp.tenant_id = e.tenant_id and pp.patient_id = e.patient_id
    left join public.programs p on p.tenant_id = e.tenant_id and p.id = e.program_id;

    v_renovacoes_pendentes := jsonb_array_length(v_renewal_pipeline);

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', cohort.id,
      'label', cohort.name,
      'activePatients', cohort.active_count,
      'lowAdherenceCount', cohort.low_adherence_count,
      'renewalsCount', cohort.renewals_count,
      'href', '/clinic/programs'
    ) order by cohort.low_adherence_count desc, cohort.active_count desc, cohort.name asc), '[]'::jsonb)
    into v_cohort_panel
    from (
      select p.id, p.name, grouped.active_count, grouped.low_adherence_count, grouped.renewals_count
      from (
        select
          e.program_id,
          count(*)::integer as active_count,
          count(*) filter (
            where exists (
              select 1
              from jsonb_array_elements(v_low_adherence) la
              where la ->> 'patientId' = e.patient_id::text
            )
          )::integer as low_adherence_count,
          count(*) filter (where e.end_date is not null and e.end_date between v_date and (v_date + 21))::integer as renewals_count
        from public.patient_program_enrollments e
        where e.tenant_id = v_tenant_id
          and e.status = 'ativo'
        group by e.program_id
      ) grouped
      join public.programs p on p.tenant_id = v_tenant_id and p.id = grouped.program_id
      order by grouped.low_adherence_count desc, grouped.active_count desc, p.name asc
      limit v_limit
    ) cohort;

    select coalesce(jsonb_agg(item order by priority_rank asc), '[]'::jsonb)
    into v_review_patients
    from (
      select *
      from (
        select
          jsonb_build_object(
            'id', la ->> 'patientId',
            'name', coalesce(la ->> 'patientName', 'Paciente sem nome'),
            'issue', coalesce(la ->> 'reason', 'Adesao diaria baixa') || ' (' || coalesce(la ->> 'adherencePercent', '0') || '%)',
            'severity', coalesce(la ->> 'severity', 'medium')
          ) as item,
          0 as priority_rank
        from jsonb_array_elements(v_low_adherence) la
        union all
        select
          jsonb_build_object(
            'id', pa.patient_id,
            'name', coalesce(pp.full_name, 'Paciente sem nome'),
            'issue', pa.title,
            'severity', coalesce(pa.severity, 'medium')
          ) as item,
          1 as priority_rank
        from public.patient_alerts pa
        left join public.patient_pii pp on pp.tenant_id = pa.tenant_id and pp.patient_id = pa.patient_id
        where pa.tenant_id = v_tenant_id
          and pa.status = 'active'
      ) combined
      order by priority_rank asc
      limit v_limit
    ) ranked;
  end if;

  if v_can_documents then
    select count(*)::integer into v_documentos_pendentes
    from public.generated_documents gd
    where gd.tenant_id = v_tenant_id
      and gd.status in ('draft', 'pending_signature', 'sent_for_signature', 'failed', 'expired');

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', gd.id,
      'patientId', gd.patient_id,
      'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
      'name', gd.name,
      'status', gd.status,
      'generatedAt', gd.generated_at,
      'href', '/clinic/documents?patientId=' || gd.patient_id::text
    ) order by gd.generated_at desc), '[]'::jsonb)
    into v_document_pendencies
    from (
      select *
      from public.generated_documents gd
      where gd.tenant_id = v_tenant_id
        and gd.status in ('draft', 'pending_signature', 'sent_for_signature', 'failed', 'expired')
      order by gd.generated_at desc
      limit v_limit
    ) gd
    left join public.patient_pii pp on pp.tenant_id = gd.tenant_id and pp.patient_id = gd.patient_id;
  end if;

  if v_can_financial then
    select count(*)::integer into v_inadimplentes
    from public.patient_invoices pi
    where pi.tenant_id = v_tenant_id
      and (
        lower(pi.status) in ('overdue', 'vencido')
        or (pi.paid_at is null and pi.due_date is not null and pi.due_date < v_date and lower(pi.status) not in ('paid', 'pago', 'cancelled', 'canceled', 'cancelado'))
      );

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', pi.id,
      'patientId', pi.patient_id,
      'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
      'status', pi.status,
      'amountCents', pi.amount_cents,
      'dueDate', pi.due_date,
      'daysOverdue', case when pi.due_date is null then 0 else greatest(0, v_date - pi.due_date) end,
      'href', '/clinic/financeiro?patientId=' || pi.patient_id::text
    ) order by pi.due_date asc nulls last, pi.created_at desc), '[]'::jsonb)
    into v_financial_pendencies
    from (
      select *
      from public.patient_invoices pi
      where pi.tenant_id = v_tenant_id
        and (
          lower(pi.status) in ('overdue', 'vencido', 'pending', 'pendente')
          or (pi.paid_at is null and pi.due_date is not null and pi.due_date < v_date)
        )
      order by pi.due_date asc nulls last, pi.created_at desc
      limit v_limit
    ) pi
    left join public.patient_pii pp on pp.tenant_id = pi.tenant_id and pp.patient_id = pi.patient_id;
  end if;

  if v_can_chat then
    select coalesce(sum(pct.unread_count), 0)::integer into v_mensagens_nao_lidas
    from public.patient_chat_threads pct
    where pct.tenant_id = v_tenant_id
      and pct.status = 'open'
      and pct.unread_count > 0;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', pct.id,
      'threadId', pct.id,
      'patientId', pct.patient_id,
      'patientName', coalesce(pp.full_name, 'Paciente sem nome'),
      'unreadCount', pct.unread_count,
      'lastMessageAt', pct.last_message_at,
      'owner', coalesce(pr.full_name, 'Inbox'),
      'href', '/clinic/inbox?threadId=' || pct.id::text
    ) order by pct.last_message_at asc nulls first), '[]'::jsonb)
    into v_recent_messages
    from (
      select *
      from public.patient_chat_threads pct
      where pct.tenant_id = v_tenant_id
        and pct.status = 'open'
        and pct.unread_count > 0
      order by pct.last_message_at asc nulls first
      limit v_limit
    ) pct
    left join public.patient_pii pp on pp.tenant_id = pct.tenant_id and pp.patient_id = pct.patient_id
    left join public.profiles pr on pr.id = pct.assigned_to;
  end if;

  return jsonb_build_object(
    'access', jsonb_build_object(
      'patients', v_can_patients,
      'agenda', v_can_agenda,
      'documents', v_can_documents,
      'financial', v_can_financial,
      'chat', v_can_chat,
      'crm', v_can_crm,
      'inventory', v_can_inventory
    ),
    'stats', jsonb_build_object(
      'consultasHoje', v_consultas_hoje,
      'consultasConcluidas', v_consultas_concluidas,
      'filaEspera', v_fila_espera,
      'programasAtivos', v_programas_ativos,
      'alertasClinicos', v_alertas_clinicos + v_baixa_adesao,
      'mensagensNaoLidas', v_mensagens_nao_lidas,
      'documentosPendentes', v_documentos_pendentes,
      'inadimplentes', v_inadimplentes,
      'taxaOcupacao', v_taxa_ocupacao,
      'baixaAdesao', v_baixa_adesao,
      'renovacoesPendentes', v_renovacoes_pendentes,
      'operationalInsights', v_operational_insights
    ),
    'waitingQueue', v_waiting_queue,
    'todayAppointments', v_today_appointments,
    'alerts', (
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', coalesce(la ->> 'id', 'low-adherence-' || (la ->> 'patientId')),
          'patientId', la ->> 'patientId',
          'severity', coalesce(la ->> 'severity', 'medium'),
          'title', 'Adesao diaria baixa',
          'description', coalesce(la ->> 'reason', 'Adesao diaria baixa') || '. Progresso de hoje: ' || coalesce(la ->> 'adherencePercent', '0') || '%.',
          'createdAt', coalesce(la ->> 'lastSignalAt', v_now::text),
          'isResolved', false,
          'category', 'adesao'
        ))
        from jsonb_array_elements(v_low_adherence) la
      ), '[]'::jsonb) || v_alerts
    ),
    'patientsNeedingReview', v_review_patients,
    'sections', jsonb_build_object(
      'actionableQueue', jsonb_build_object('canRead', true, 'error', null, 'data', '[]'::jsonb),
      'lowAdherence', jsonb_build_object(
        'canRead', v_can_patients,
        'error', case when v_can_patients then null else 'Sem permissao patients.read.' end,
        'data', v_low_adherence
      ),
      'financialPendencies', jsonb_build_object(
        'canRead', v_can_financial,
        'error', case when v_can_financial then null else 'Sem permissao financial.read.' end,
        'data', v_financial_pendencies
      ),
      'documentPendencies', jsonb_build_object(
        'canRead', v_can_documents,
        'error', case when v_can_documents then null else 'Sem permissao documents.read.' end,
        'data', v_document_pendencies
      ),
      'recentMessages', jsonb_build_object(
        'canRead', v_can_chat,
        'error', case when v_can_chat then null else 'Sem permissao chat.read.' end,
        'data', v_recent_messages
      ),
      'renewalPipeline', jsonb_build_object(
        'canRead', v_can_patients,
        'error', case when v_can_patients then null else 'Sem permissao patients.read.' end,
        'data', v_renewal_pipeline
      ),
      'cohortPanel', jsonb_build_object(
        'canRead', v_can_patients,
        'error', case when v_can_patients then null else 'Sem permissao patients.read.' end,
        'data', v_cohort_panel
      )
    )
  );
end;
$$;

revoke all on function public.get_clinic_dashboard_snapshot(date, integer) from public;
grant execute on function public.get_clinic_dashboard_snapshot(date, integer) to authenticated, service_role;

comment on function public.get_clinic_dashboard_snapshot(date, integer) is
  'Returns the clinic operational dashboard snapshot with per-section canRead/error/data envelopes. Sensitive document storage paths, provider payloads and direct browser PII reads are not exposed.';
