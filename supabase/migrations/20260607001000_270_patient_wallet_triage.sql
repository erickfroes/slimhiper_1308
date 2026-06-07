-- M06: Patient wallet, triage and explainable priority.
-- Browser reads the wallet through one tenant-scoped RPC instead of broad client joins.

create index if not exists idx_patients_tenant_status_updated
  on public.patients(tenant_id, status, updated_at desc);

create index if not exists idx_patient_alerts_patient_status_created
  on public.patient_alerts(tenant_id, patient_id, status, created_at desc);

create index if not exists idx_appointments_tenant_patient_upcoming
  on public.appointments(tenant_id, patient_id, scheduled_at)
  where status not in ('cancelado', 'falta');

create index if not exists idx_generated_documents_patient_pending
  on public.generated_documents(tenant_id, patient_id, status, created_at desc)
  where status in ('draft', 'generated', 'sent_for_signature', 'pending_signature', 'expired', 'failed');

create or replace function public.get_patient_wallet_snapshot(
  p_search text default null,
  p_status text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(
    lower(
      trim(
        regexp_replace(
          replace(replace(replace(coalesce(p_search, ''), '%', ' '), '_', ' '), ',', ' '),
          '[[:space:]]+',
          ' ',
          'g'
        )
      )
    ),
    ''
  );
  v_status text := case lower(trim(coalesce(p_status, '')))
    when 'ativo' then 'active'
    when 'active' then 'active'
    when 'inativo' then 'inactive'
    when 'inactive' then 'inactive'
    when 'pausado' then 'paused'
    when 'paused' then 'paused'
    when 'concluido' then 'completed'
    when 'completed' then 'completed'
    when 'cancelado' then 'cancelled'
    when 'cancelled' then 'cancelled'
    when 'canceled' then 'cancelled'
    else null
  end;
  v_can_patients boolean := false;
  v_can_clinical boolean := false;
  v_can_financial boolean := false;
  v_can_documents boolean := false;
  v_can_chat boolean := false;
  v_low_adherence jsonb := '[]'::jsonb;
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
  v_can_clinical := v_can_patients;
  v_can_financial := security.has_permission(v_tenant_id, 'financial.read', false);
  v_can_documents := security.has_permission(v_tenant_id, 'documents.read', false);
  v_can_chat := security.has_permission(v_tenant_id, 'chat.read', false);

  if not v_can_patients then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_low_adherence := public.get_clinic_daily_adherence_snapshot(current_date, 100);

  return (
    with filtered as (
      select
        p.id,
        p.status,
        p.preferred_name,
        p.tags,
        p.metadata,
        p.updated_at,
        pp.full_name,
        pp.phone,
        pp.birth_date
      from public.patients p
      left join public.patient_pii pp
        on pp.tenant_id = p.tenant_id
       and pp.patient_id = p.id
      where p.tenant_id = v_tenant_id
        and (v_status is null or p.status = v_status)
        and (
          v_search is null
          or lower(coalesce(pp.full_name, p.preferred_name, '')) like '%' || v_search || '%'
          or lower(coalesce(pp.phone, '')) like '%' || v_search || '%'
          or lower(coalesce(pp.email, '')) like '%' || v_search || '%'
          or lower(coalesce(pp.cpf_masked, '')) like '%' || v_search || '%'
        )
    ), total_count as (
      select count(*)::integer as total from filtered
    ), low_adherence as (
      select
        (item ->> 'patientId')::uuid as patient_id,
        coalesce(nullif(item ->> 'adherencePercent', '')::integer, 0) as daily_adherence_percent,
        nullif(item ->> 'reason', '') as daily_reason,
        nullif(item ->> 'severity', '') as daily_severity,
        nullif(item ->> 'lastSignalAt', '')::timestamptz as last_signal_at
      from jsonb_array_elements(v_low_adherence) item
      where security.is_valid_uuid_text(item ->> 'patientId')
    ), latest_enrollments as (
      select distinct on (e.patient_id)
        e.patient_id,
        e.program_id,
        e.current_week,
        e.status as enrollment_status,
        case
          when coalesce(e.metadata ->> 'weekly_adherence_percent', e.metadata ->> 'weeklyAdherencePercent') ~ '^[0-9]+(\.[0-9]+)?$'
            then round((coalesce(e.metadata ->> 'weekly_adherence_percent', e.metadata ->> 'weeklyAdherencePercent'))::numeric)::integer
          else 0
        end as weekly_adherence_percent,
        pr.name as program_name,
        pr.program_type,
        pr.duration_weeks
      from filtered f
      join public.patient_program_enrollments e
        on e.tenant_id = v_tenant_id
       and e.patient_id = f.id
       and e.status = 'ativo'
      join public.programs pr
        on pr.tenant_id = e.tenant_id
       and pr.id = e.program_id
      order by e.patient_id, e.updated_at desc, e.created_at desc
    ), alerts_ranked as (
      select
        pa.patient_id,
        pa.title,
        pa.severity,
        pa.created_at,
        case
          when pa.severity in ('critical', 'critico') then 4
          when pa.severity in ('high', 'alto') then 3
          when pa.severity in ('medium', 'medio') then 2
          else 1
        end as severity_rank,
        row_number() over (
          partition by pa.patient_id
          order by
            case
              when pa.severity in ('critical', 'critico') then 4
              when pa.severity in ('high', 'alto') then 3
              when pa.severity in ('medium', 'medio') then 2
              else 1
            end desc,
            pa.created_at desc
        ) as rn
      from public.patient_alerts pa
      join filtered f on f.id = pa.patient_id
      where v_can_clinical
        and pa.tenant_id = v_tenant_id
        and pa.status = 'active'
    ), alerts_agg as (
      select
        patient_id,
        count(*)::integer as alert_count,
        max(severity_rank)::integer as max_severity_rank,
        jsonb_agg(
          jsonb_build_object('title', title, 'severity', severity, 'createdAt', created_at)
          order by severity_rank desc, created_at desc
        ) filter (where rn <= 3) as top_alerts
      from alerts_ranked
      group by patient_id
    ), next_appointments as (
      select distinct on (a.patient_id)
        a.patient_id,
        a.id as appointment_id,
        a.type as appointment_type,
        a.status as appointment_status,
        a.scheduled_at
      from public.appointments a
      join filtered f on f.id = a.patient_id
      where v_can_clinical
        and a.tenant_id = v_tenant_id
        and a.scheduled_at >= now()
        and a.status not in ('cancelado', 'falta')
      order by a.patient_id, a.scheduled_at asc
    ), documents_agg as (
      select
        gd.patient_id,
        count(*)::integer as pending_document_count,
        max(gd.created_at) as last_document_at
      from public.generated_documents gd
      join filtered f on f.id = gd.patient_id
      where v_can_documents
        and gd.tenant_id = v_tenant_id
        and gd.status in ('draft', 'generated', 'sent_for_signature', 'pending_signature', 'expired', 'failed')
      group by gd.patient_id
    ), financial_agg as (
      select
        pi.patient_id,
        count(*) filter (
          where lower(coalesce(pi.status, '')) in ('pending', 'aguardando', 'pendente')
        )::integer as pending_count,
        count(*) filter (
          where lower(coalesce(pi.status, '')) in ('overdue', 'vencido', 'inadimplente')
             or (
               pi.due_date < current_date
               and pi.paid_at is null
               and lower(coalesce(pi.status, '')) not in ('paid', 'received', 'pago', 'cancelled', 'canceled', 'cancelado')
             )
        )::integer as overdue_count
      from public.patient_invoices pi
      join filtered f on f.id = pi.patient_id
      where v_can_financial
        and pi.tenant_id = v_tenant_id
      group by pi.patient_id
    ), chat_agg as (
      select
        pct.patient_id,
        pct.last_message_at,
        pct.unread_count
      from public.patient_chat_threads pct
      join filtered f on f.id = pct.patient_id
      where v_can_chat
        and pct.tenant_id = v_tenant_id
    ), joined as (
      select
        f.*,
        coalesce(le.program_id::text, null) as active_program_id,
        coalesce(le.program_name, 'Sem programa') as active_program_name,
        coalesce(le.program_type, 'emagrecimento') as program_type,
        coalesce(le.current_week, 0) as current_week,
        coalesce(le.duration_weeks, 0) as total_weeks,
        greatest(0, least(100, coalesce(la.daily_adherence_percent, le.weekly_adherence_percent, 0))) as adherence_percent,
        coalesce(aa.alert_count, 0) as alert_count,
        coalesce(aa.max_severity_rank, 0) as max_severity_rank,
        aa.top_alerts,
        na.appointment_id,
        na.appointment_type,
        na.appointment_status,
        na.scheduled_at as next_appointment_at,
        coalesce(da.pending_document_count, 0) as pending_document_count,
        da.last_document_at,
        coalesce(fa.pending_count, 0) as financial_pending_count,
        coalesce(fa.overdue_count, 0) as financial_overdue_count,
        ca.last_message_at,
        coalesce(ca.unread_count, 0) as unread_chat_count,
        la.daily_reason,
        la.daily_severity,
        la.last_signal_at
      from filtered f
      left join latest_enrollments le on le.patient_id = f.id
      left join low_adherence la on la.patient_id = f.id
      left join alerts_agg aa on aa.patient_id = f.id
      left join next_appointments na on na.patient_id = f.id
      left join documents_agg da on da.patient_id = f.id
      left join financial_agg fa on fa.patient_id = f.id
      left join chat_agg ca on ca.patient_id = f.id
    ), scored_raw as (
      select
        *,
        least(100,
          case
            when max_severity_rank >= 4 then 35
            when max_severity_rank = 3 then 25
            when max_severity_rank = 2 then 15
            when alert_count > 0 then 8
            else 0
          end
          + case
            when adherence_percent < 40 then 30
            when adherence_percent < 55 then 22
            when adherence_percent < 70 then 10
            else 0
          end
          + case
            when v_can_financial and financial_overdue_count > 0 then 22
            when v_can_financial and financial_pending_count > 0 then 12
            else 0
          end
          + case
            when v_can_documents and pending_document_count > 0 then least(14, pending_document_count * 7)
            else 0
          end
          + case
            when v_can_chat and unread_chat_count > 0 then least(16, 8 + unread_chat_count * 2)
            else 0
          end
          + case
            when status = 'active' and next_appointment_at is null then 6
            else 0
          end
        )::integer as priority_score,
        array_remove(array[
          case when alert_count > 0 then alert_count::text || ' alerta(s) clinico(s) ativo(s)' end,
          case when adherence_percent < 70 then 'Adesao em ' || adherence_percent::text || '%' end,
          case when v_can_financial and financial_overdue_count > 0 then financial_overdue_count::text || ' cobranca(s) vencida(s)' end,
          case when v_can_financial and financial_pending_count > 0 and financial_overdue_count = 0 then financial_pending_count::text || ' cobranca(s) pendente(s)' end,
          case when v_can_documents and pending_document_count > 0 then pending_document_count::text || ' documento(s) pendente(s)' end,
          case when v_can_chat and unread_chat_count > 0 then unread_chat_count::text || ' mensagem(ns) nao lida(s)' end,
          case when status = 'active' and next_appointment_at is null then 'Sem proxima consulta registrada' end
        ]::text[], null) as score_reasons
      from joined
    ), scored as (
      select
        *,
        case
          when priority_score >= 75 then 'critico'
          when priority_score >= 50 then 'alto'
          when priority_score >= 25 then 'medio'
          else 'baixo'
        end as priority_band,
        case
          when priority_score >= 75 then 'acao_imediata'
          when priority_score >= 25 then 'monitorar'
          else 'rotina'
        end as triage_status,
        case
          when alert_count > 0 then 'Revisar alerta clinico'
          when adherence_percent < 70 then 'Chamar paciente e ajustar plano'
          when v_can_chat and unread_chat_count > 0 then 'Responder chat'
          when v_can_financial and financial_overdue_count > 0 then 'Acionar financeiro'
          when v_can_documents and pending_document_count > 0 then 'Regularizar documentos'
          when next_appointment_at is not null then 'Preparar proxima consulta'
          else 'Abrir Paciente 360'
        end as action_label,
        case
          when alert_count > 0 or adherence_percent < 70 then '/clinic/patients/' || id::text || '?tab=timeline'
          when v_can_chat and unread_chat_count > 0 then '/clinic/inbox?tab=conversas&patientId=' || id::text
          when v_can_financial and financial_overdue_count > 0 then '/clinic/financeiro?patientId=' || id::text
          when v_can_documents and pending_document_count > 0 then '/clinic/documents?patientId=' || id::text
          else '/clinic/patients/' || id::text
        end as action_href,
        case
          when alert_count > 0 or adherence_percent < 70 then 'clinical'
          when v_can_chat and unread_chat_count > 0 then 'chat'
          when v_can_financial and financial_overdue_count > 0 then 'financial'
          when v_can_documents and pending_document_count > 0 then 'documents'
          when next_appointment_at is not null then 'agenda'
          else 'patient'
        end as action_kind
      from scored_raw
    ), ordered_rows as (
      select *
      from scored
      order by priority_score desc, updated_at desc, id
      limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'generatedAt', now(),
      'total', (select total from total_count),
      'pageSize', v_limit,
      'offset', v_offset,
      'access', jsonb_build_object(
        'clinical', jsonb_build_object('canRead', v_can_clinical, 'error', case when v_can_clinical then null else 'Sem permissao patients.read.' end),
        'financial', jsonb_build_object('canRead', v_can_financial, 'error', case when v_can_financial then null else 'Sem permissao financial.read.' end),
        'documents', jsonb_build_object('canRead', v_can_documents, 'error', case when v_can_documents then null else 'Sem permissao documents.read.' end),
        'chat', jsonb_build_object('canRead', v_can_chat, 'error', case when v_can_chat then null else 'Sem permissao chat.read.' end)
      ),
      'summary', jsonb_build_object(
        'total', (select total from total_count),
        'loaded', (select count(*)::integer from ordered_rows),
        'active', (select count(*)::integer from scored where status = 'active'),
        'highPriority', (select count(*)::integer from scored where priority_band in ('critico', 'alto')),
        'criticalPriority', (select count(*)::integer from scored where priority_band = 'critico'),
        'lowAdherence', (select count(*)::integer from scored where adherence_percent < 60),
        'pendingFinancial', (select count(*)::integer from scored where v_can_financial and (financial_pending_count > 0 or financial_overdue_count > 0)),
        'pendingDocuments', (select coalesce(sum(pending_document_count), 0)::integer from scored where v_can_documents),
        'unreadChats', (select coalesce(sum(unread_chat_count), 0)::integer from scored where v_can_chat)
      ),
      'rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'name', coalesce(r.full_name, r.preferred_name, 'Paciente sem nome'),
            'age', case when r.birth_date is null then 0 else extract(year from age(current_date, r.birth_date))::integer end,
            'phone', case
              when nullif(regexp_replace(coalesce(r.phone, ''), '[^0-9]', '', 'g'), '') is null then 'Nao informado'
              else '(**) *****-' || right(regexp_replace(r.phone, '[^0-9]', '', 'g'), 4)
            end,
            'status', r.status,
            'activePackage', r.active_program_name,
            'activeProgramId', r.active_program_id,
            'activeProgramName', r.active_program_name,
            'programType', r.program_type,
            'currentWeek', r.current_week,
            'totalWeeks', r.total_weeks,
            'weeklyAdherence', r.adherence_percent,
            'nextAppointmentAt', r.next_appointment_at,
            'careTeam', '[]'::jsonb,
            'alertCount', r.alert_count,
            'clinicalAlertSeverity', case
              when r.max_severity_rank >= 4 then 'critical'
              when r.max_severity_rank = 3 then 'high'
              when r.max_severity_rank = 2 then 'medium'
              when r.alert_count > 0 then 'low'
              else null
            end,
            'financialStatus', case
              when v_can_financial and r.financial_overdue_count > 0 then 'inadimplente'
              when v_can_financial and r.financial_pending_count > 0 then 'pendente'
              else 'em_dia'
            end,
            'financialPendingCount', r.financial_pending_count,
            'financialOverdueCount', r.financial_overdue_count,
            'pendingDocumentCount', r.pending_document_count,
            'lastMessageAt', r.last_message_at,
            'unreadChatCount', r.unread_chat_count,
            'priorityScore', r.priority_score,
            'priorityBand', r.priority_band,
            'triageStatus', r.triage_status,
            'scoreReasons', to_jsonb(r.score_reasons),
            'scoreExplanation', case
              when cardinality(r.score_reasons) > 0
                then 'Prioridade ' || r.priority_band || ' por ' || array_to_string(r.score_reasons, ', ') || '.'
              else 'Prioridade baixa: sem pendencias criticas nesta carteira.'
            end,
            'nextAction', jsonb_build_object('label', r.action_label, 'href', r.action_href, 'kind', r.action_kind)
          )
          order by r.priority_score desc, r.updated_at desc, r.id
        )
        from ordered_rows r
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.audit_patient_wallet_context_opened(
  p_patient_id uuid,
  p_sections text[] default array['clinical', 'financial', 'documents', 'chat']
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_requested_sections text[] := coalesce(p_sections, array[]::text[]);
  v_allowed_sections text[];
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select p.tenant_id into v_tenant_id
  from public.patients p
  where p.id = p_patient_id;

  if v_tenant_id is null then
    raise exception 'patient_not_found' using errcode = '22023';
  end if;

  if not security.has_permission(v_tenant_id, 'patients.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_allowed_sections := array_remove(array[
    case when 'clinical' = any(v_requested_sections) then 'clinical' end,
    case when 'financial' = any(v_requested_sections) and security.has_permission(v_tenant_id, 'financial.read', false) then 'financial' end,
    case when 'documents' = any(v_requested_sections) and security.has_permission(v_tenant_id, 'documents.read', false) then 'documents' end,
    case when 'chat' = any(v_requested_sections) and security.has_permission(v_tenant_id, 'chat.read', false) then 'chat' end
  ]::text[], null);

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'patient.wallet_context_opened',
    'patient',
    p_patient_id::text,
    jsonb_build_object(
      'requestedSections', to_jsonb(v_requested_sections),
      'allowedSections', to_jsonb(v_allowed_sections)
    )
  );

  return jsonb_build_object('status', 'logged', 'patientId', p_patient_id, 'sections', v_allowed_sections);
end;
$$;

revoke all on function public.get_patient_wallet_snapshot(text, text, integer, integer) from public;
revoke all on function public.audit_patient_wallet_context_opened(uuid, text[]) from public;

grant execute on function public.get_patient_wallet_snapshot(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.audit_patient_wallet_context_opened(uuid, text[]) to authenticated, service_role;

comment on function public.get_patient_wallet_snapshot(text, text, integer, integer) is
  'Returns the M06 tenant-scoped patient wallet with explainable priority, section-gated aggregates and no raw provider payloads.';
comment on function public.audit_patient_wallet_context_opened(uuid, text[]) is
  'Audits opening the M06 patient wallet context drawer after tenant and section permission checks.';
