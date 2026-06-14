-- Allow auditable one-step operational corrections in the agenda workflow.

create or replace function security.assert_appointment_transition(
  p_current_status text,
  p_next_status text,
  p_reason text default null
)
returns void
language plpgsql
stable
set search_path = public, security, pg_temp
as $$
declare
  v_current text := lower(coalesce(p_current_status, 'agendado'));
  v_next text := lower(coalesce(p_next_status, ''));
  v_allowed text[] := array[]::text[];
  v_flow text[] := array[
    'agendado',
    'confirmado',
    'chegou',
    'triagem',
    'medidas',
    'bioimpedancia',
    'aguardando_medico',
    'em_consulta',
    'checkout'
  ];
  v_current_index integer := array_position(v_flow, v_current);
  v_next_index integer := array_position(v_flow, v_next);
  v_is_backward boolean := v_current_index is not null
    and v_next_index is not null
    and v_next_index < v_current_index;
begin
  v_allowed := case v_current
    when 'agendado' then array['confirmado', 'cancelado', 'falta']
    when 'confirmado' then array['agendado', 'chegou', 'cancelado', 'falta']
    when 'chegou' then array['confirmado', 'triagem', 'aguardando_medico', 'cancelado', 'falta']
    when 'triagem' then array['chegou', 'medidas', 'aguardando_medico', 'cancelado']
    when 'medidas' then array['triagem', 'bioimpedancia', 'aguardando_medico', 'cancelado']
    when 'bioimpedancia' then array['medidas', 'aguardando_medico', 'cancelado']
    when 'aguardando_medico' then array['bioimpedancia', 'em_consulta', 'cancelado', 'falta']
    when 'em_consulta' then array['aguardando_medico', 'checkout', 'cancelado']
    when 'checkout' then array['em_consulta', 'concluido']
    else array[]::text[]
  end;

  if not v_next = any(v_allowed) then
    raise exception 'invalid_appointment_transition: % -> %', v_current, v_next
      using errcode = '22023';
  end if;

  if v_next in ('cancelado', 'falta')
     and length(coalesce(security.agenda_clean_reason(p_reason, 240), '')) < 3 then
    raise exception 'status_reason_required' using errcode = '22023';
  end if;

  if v_is_backward
     and length(coalesce(security.agenda_clean_reason(p_reason, 240), '')) < 3 then
    raise exception 'status_correction_reason_required' using errcode = '22023';
  end if;
end;
$$;

comment on function security.assert_appointment_transition(text, text, text) is
  'Validates agenda status transitions, including auditable one-step backward corrections for operational workflow stages.';
