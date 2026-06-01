-- Phase 9.4: CRM/inventory operational insights for reports and dashboard.
-- Extends the Phase 8 report allowlist with aggregate-only CRM/inventory contracts.

create or replace function public.get_crm_inventory_dashboard_insights(p_days_to_expiry integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_days integer := least(greatest(coalesce(p_days_to_expiry, 30), 0), 365);
  v_can_crm boolean := false;
  v_can_inventory boolean := false;
  v_open_leads integer := 0;
  v_overdue_tasks integer := 0;
  v_critical_stock integer := 0;
  v_expiring_lots integer := 0;
begin
  select p.active_tenant_id into v_tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_crm := security.has_permission(v_tenant_id, 'crm.read', false);
  v_can_inventory := security.has_permission(v_tenant_id, 'inventory.read', false);

  if v_can_crm then
    select count(*)::integer into v_open_leads
    from public.crm_leads l
    where l.tenant_id = v_tenant_id
      and l.status = 'open'
      and public.has_unit_access(l.tenant_id, l.unit_id);

    select count(*)::integer into v_overdue_tasks
    from public.crm_lead_tasks t
    join public.crm_leads l on l.tenant_id = t.tenant_id and l.id = t.lead_id
    where t.tenant_id = v_tenant_id
      and t.status in ('open', 'overdue')
      and t.due_at < now()
      and public.has_unit_access(l.tenant_id, l.unit_id);
  end if;

  if v_can_inventory then
    select count(*)::integer into v_critical_stock
    from (
      select i.id
      from public.inventory_items i
      left join public.inventory_stock_snapshots s on s.tenant_id = i.tenant_id and s.item_id = i.id
      left join public.inventory_locations loc on loc.tenant_id = s.tenant_id and loc.id = s.location_id
      where i.tenant_id = v_tenant_id
        and i.status = 'active'
        and public.has_unit_access(i.tenant_id, loc.unit_id)
      group by i.id, i.minimum_quantity
      having coalesce(sum(s.quantity_on_hand), 0) <= i.minimum_quantity
    ) critical_items;

    select count(*)::integer into v_expiring_lots
    from public.inventory_lots l
    join public.inventory_items i on i.tenant_id = l.tenant_id and i.id = l.item_id
    left join public.inventory_locations loc on loc.tenant_id = l.tenant_id and loc.id = l.location_id
    left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.item_id = l.item_id and s.lot_id = l.id and (s.location_id is not distinct from l.location_id)
    where l.tenant_id = v_tenant_id
      and l.status = 'active'
      and l.expires_at is not null
      and l.expires_at <= current_date + (v_days || ' days')::interval
      and coalesce(s.quantity_on_hand, 0) > 0
      and public.has_unit_access(l.tenant_id, loc.unit_id);
  end if;

  return jsonb_build_object(
    'crm', jsonb_build_object(
      'canRead', v_can_crm,
      'openLeads', v_open_leads,
      'overdueTasks', v_overdue_tasks,
      'href', '/clinic/crm'
    ),
    'inventory', jsonb_build_object(
      'canRead', v_can_inventory,
      'criticalStockItems', v_critical_stock,
      'expiringLots', v_expiring_lots,
      'daysToExpiry', v_days,
      'href', '/clinic/inventory'
    )
  );
end;
$$;

create or replace function public.list_clinic_report_definitions()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_can_reports boolean;
  v_can_financial boolean;
  v_can_sensitive boolean;
  v_can_crm boolean;
  v_can_inventory boolean;
  v_can_inventory_cost boolean;
begin
  select p.active_tenant_id into v_tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'reports.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_reports := true;
  v_can_financial := security.has_permission(v_tenant_id, 'financial.read', false);
  v_can_sensitive := security.has_permission(v_tenant_id, 'timeline.sensitive.read', false);
  v_can_crm := security.has_permission(v_tenant_id, 'crm.read', false);
  v_can_inventory := security.has_permission(v_tenant_id, 'inventory.read', false);
  v_can_inventory_cost := security.has_permission(v_tenant_id, 'inventory.cost.read', false);

  return (
    with allowed as (
      select * from (values
        ('resumo-clinico', 'Resumo Clinico', 'Indicadores clinicos agregados, atendimentos e status de pacientes.', 'FileText', false, false, false, false, false),
        ('resumo-financeiro', 'Resumo Financeiro', 'Totais financeiros minimizados por status de cobranca.', 'DollarSign', true, false, false, false, false),
        ('servicos-consumidos', 'Servicos Consumidos', 'Agenda e atendimentos agregados por status e profissional.', 'ShoppingBag', false, false, false, false, false),
        ('documentos-emitidos', 'Documentos Emitidos', 'Documentos emitidos e assinatura por status documental.', 'FileCheck', false, false, false, false, false),
        ('adesao-plano', 'Adesao ao Plano', 'Matriculas em programas, semana atual e status de jornada.', 'Target', false, false, false, false, false),
        ('timeline-consolidada', 'Timeline Consolidada', 'Eventos de timeline sanitizados; detalhamento exige permissao sensivel.', 'Clock', false, true, false, false, false),
        ('alertas', 'Alertas', 'Pendencias operacionais de agenda, documentos e cobranca.', 'Bell', true, false, false, false, false),
        ('crm-leads-origem', 'CRM: Leads por Origem', 'Leads agregados por origem/campanha/status sem PII.', 'Users', false, false, true, false, false),
        ('crm-conversao-etapa', 'CRM: Conversao por Etapa', 'Funil agregado por etapa e conversoes para paciente.', 'GitBranch', false, false, true, false, false),
        ('crm-sla-tarefas', 'CRM: SLA de Tarefas', 'Tarefas comerciais por status, vencimento e responsavel agregado.', 'Timer', false, false, true, false, false),
        ('crm-responsavel-campanhas', 'CRM: Responsaveis e Campanhas', 'Distribuicao operacional por responsavel/campanha com contagens minimizadas.', 'Briefcase', false, false, true, false, false),
        ('inventory-saldo-unidade', 'Estoque: Saldo por Unidade', 'Saldo agregado por local/unidade/categoria sem custo.', 'PackageSearch', false, false, false, true, false),
        ('inventory-giro-consumo', 'Estoque: Giro e Consumo', 'Movimentacoes de consumo e recebimento por item/local.', 'RotateCcw', false, false, false, true, false),
        ('inventory-lotes-vencer', 'Estoque: Lotes a Vencer', 'Lotes vencidos ou proximos ao vencimento com links operacionais.', 'CalendarClock', false, false, false, true, false),
        ('inventory-ajustes-perdas', 'Estoque: Ajustes e Perdas', 'Ajustes, perdas e transferencias agregadas por motivo.', 'AlertTriangle', false, false, false, true, false),
        ('inventory-custo', 'Estoque: Custo Restrito', 'Custo agregado apenas para usuarios com inventory.cost.read.', 'Coins', false, false, false, true, true)
      ) as a(key, label, description, icon_key, requires_financial, requires_sensitive, requires_crm, requires_inventory, requires_inventory_cost)
    ), tenant_defs as (
      select distinct on (a.key)
        rd.id,
        a.key,
        coalesce(nullif(rd.label, ''), a.label) as label,
        coalesce(nullif(rd.description, ''), a.description) as description,
        coalesce(nullif(rd.icon_key, ''), a.icon_key) as icon_key,
        rd.export_enabled,
        a.requires_financial,
        a.requires_sensitive,
        a.requires_crm,
        a.requires_inventory,
        a.requires_inventory_cost
      from allowed a
      left join public.report_definitions rd
        on rd.tenant_id = v_tenant_id
       and rd.key = a.key
       and rd.status = 'active'
      order by a.key, rd.updated_at desc nulls last
    )
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'key', key,
      'label', label,
      'description', description,
      'iconKey', icon_key,
      'badge', case
        when requires_inventory_cost then 'Custo restrito'
        when requires_inventory then 'Estoque'
        when requires_crm then 'CRM'
        when requires_financial then 'Financeiro'
        when requires_sensitive then 'Sensivel'
        else 'Seguro'
      end,
      'badgeColor', case
        when requires_inventory_cost then 'bg-purple-100 text-purple-700'
        when requires_inventory then 'bg-orange-100 text-orange-700'
        when requires_crm then 'bg-sky-100 text-sky-700'
        when requires_financial then 'bg-emerald-100 text-emerald-700'
        when requires_sensitive then 'bg-amber-100 text-amber-700'
        else 'bg-blue-100 text-blue-700'
      end,
      'exportEnabled', coalesce(export_enabled, true),
      'requiresFinancialRead', requires_financial,
      'requiresSensitiveRead', requires_sensitive,
      'requiresCrmRead', requires_crm,
      'requiresInventoryRead', requires_inventory,
      'requiresInventoryCostRead', requires_inventory_cost,
      'canRun', v_can_reports
        and (not requires_financial or v_can_financial)
        and (not requires_sensitive or v_can_sensitive)
        and (not requires_crm or v_can_crm)
        and (not requires_inventory or v_can_inventory)
        and (not requires_inventory_cost or v_can_inventory_cost),
      'disabledReason', case
        when requires_financial and not v_can_financial then 'Exige permissao financial.read.'
        when requires_sensitive and not v_can_sensitive then 'Exige permissao timeline.sensitive.read.'
        when requires_crm and not v_can_crm then 'Exige permissao crm.read.'
        when requires_inventory and not v_can_inventory then 'Exige permissao inventory.read.'
        when requires_inventory_cost and not v_can_inventory_cost then 'Exige permissao inventory.cost.read.'
        else null
      end
    ) order by label)
    from tenant_defs
  );
end;
$$;

create or replace function public.create_clinic_report_run(
  p_report_key text,
  p_filters jsonb default '{}'::jsonb,
  p_export_format text default 'csv',
  p_patient_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_definition_id uuid;
  v_key text := lower(trim(coalesce(p_report_key, '')));
  v_format text := lower(trim(coalesce(p_export_format, 'csv')));
  v_requires_financial boolean := false;
  v_requires_sensitive boolean := false;
  v_requires_crm boolean := false;
  v_requires_inventory boolean := false;
  v_requires_inventory_cost boolean := false;
  v_scope text := case when p_patient_id is null then 'clinic' else 'patient' end;
  v_run_id uuid;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_rows jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_from timestamptz;
  v_to timestamptz;
  v_days_to_expiry integer := least(greatest(coalesce(nullif(p_filters->>'daysToExpiry', '')::integer, 30), 0), 365);
begin
  if v_key not in (
    'resumo-clinico', 'resumo-financeiro', 'servicos-consumidos', 'documentos-emitidos', 'adesao-plano', 'timeline-consolidada', 'alertas',
    'crm-leads-origem', 'crm-conversao-etapa', 'crm-sla-tarefas', 'crm-responsavel-campanhas',
    'inventory-saldo-unidade', 'inventory-giro-consumo', 'inventory-lotes-vencer', 'inventory-ajustes-perdas', 'inventory-custo'
  ) then
    raise exception 'report_not_allowed' using errcode = '22023';
  end if;

  if v_format not in ('csv', 'pdf') then
    raise exception 'invalid_export_format' using errcode = '22023';
  end if;

  select p.active_tenant_id into v_tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_tenant_id is null then
    select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.is_active = true
    order by tm.created_at desc
    limit 1;
  end if;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'reports.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_requires_financial := v_key in ('resumo-financeiro', 'alertas');
  v_requires_sensitive := v_key = 'timeline-consolidada' and coalesce(nullif(p_filters->>'detail', '')::boolean, false);
  v_requires_crm := v_key like 'crm-%';
  v_requires_inventory := v_key like 'inventory-%';
  v_requires_inventory_cost := v_key = 'inventory-custo';

  if v_requires_financial and not security.has_permission(v_tenant_id, 'financial.read', false) then
    raise exception 'missing_financial_read' using errcode = '42501';
  end if;
  if v_requires_sensitive and not security.has_permission(v_tenant_id, 'timeline.sensitive.read', false) then
    raise exception 'missing_sensitive_read' using errcode = '42501';
  end if;
  if v_requires_crm and not security.has_permission(v_tenant_id, 'crm.read', false) then
    raise exception 'missing_crm_read' using errcode = '42501';
  end if;
  if v_requires_inventory and not security.has_permission(v_tenant_id, 'inventory.read', false) then
    raise exception 'missing_inventory_read' using errcode = '42501';
  end if;
  if v_requires_inventory_cost and not security.has_permission(v_tenant_id, 'inventory.cost.read', false) then
    raise exception 'missing_inventory_cost_read' using errcode = '42501';
  end if;

  if p_patient_id is not null and not exists (
    select 1 from public.patients p where p.tenant_id = v_tenant_id and p.id = p_patient_id
  ) then
    raise exception 'patient_not_found' using errcode = 'P0002';
  end if;

  select rd.id into v_definition_id
  from public.report_definitions rd
  where rd.tenant_id = v_tenant_id
    and rd.key = v_key
    and rd.status = 'active'
  order by rd.updated_at desc
  limit 1;

  v_from := coalesce(nullif(p_filters->>'from', '')::timestamptz, now() - interval '30 days');
  v_to := coalesce(nullif(p_filters->>'to', '')::timestamptz, now());

  if v_key = 'resumo-financeiro' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.status), '[]'::jsonb) into v_rows
    from (
      select pi.status, count(*)::integer as total, coalesce(sum(pi.amount_cents), 0)::integer as amount_cents
      from public.patient_invoices pi
      where pi.tenant_id = v_tenant_id and (p_patient_id is null or pi.patient_id = p_patient_id) and pi.created_at between v_from and v_to
      group by pi.status
    ) x;
  elsif v_key = 'documentos-emitidos' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.status), '[]'::jsonb) into v_rows
    from (
      select gd.status, gd.category, count(*)::integer as total
      from public.generated_documents gd
      where gd.tenant_id = v_tenant_id and (p_patient_id is null or gd.patient_id = p_patient_id) and gd.created_at between v_from and v_to
      group by gd.status, gd.category
    ) x;
  elsif v_key = 'servicos-consumidos' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.status), '[]'::jsonb) into v_rows
    from (
      select a.status, coalesce(a.type, 'consulta') as service_type, count(*)::integer as total
      from public.appointments a
      where a.tenant_id = v_tenant_id and (p_patient_id is null or a.patient_id = p_patient_id) and a.scheduled_at between v_from and v_to
      group by a.status, a.type
    ) x;
  elsif v_key = 'adesao-plano' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.status), '[]'::jsonb) into v_rows
    from (
      select e.status, count(*)::integer as enrollments, coalesce(avg(e.current_week), 0)::numeric(10,2) as avg_current_week
      from public.patient_program_enrollments e
      where e.tenant_id = v_tenant_id and (p_patient_id is null or e.patient_id = p_patient_id) and e.created_at between v_from and v_to
      group by e.status
    ) x;
  elsif v_key = 'crm-leads-origem' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.total desc, x.source), '[]'::jsonb) into v_rows
    from (
      select coalesce(nullif(l.source, ''), 'sem_origem') as source, coalesce(nullif(l.campaign, ''), 'sem_campanha') as campaign, l.status, count(*)::integer as total
      from public.crm_leads l
      where l.tenant_id = v_tenant_id and l.created_at between v_from and v_to and public.has_unit_access(l.tenant_id, l.unit_id)
      group by coalesce(nullif(l.source, ''), 'sem_origem'), coalesce(nullif(l.campaign, ''), 'sem_campanha'), l.status
    ) x;
  elsif v_key = 'crm-conversao-etapa' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.stage_position, x.stage_label), '[]'::jsonb) into v_rows
    from (
      select coalesce(s.label, 'Sem etapa') as stage_label, coalesce(s.position, 999) as stage_position, l.status, count(*)::integer as total, count(*) filter (where l.converted_patient_id is not null)::integer as converted_total
      from public.crm_leads l
      left join public.crm_pipeline_stages s on s.tenant_id = l.tenant_id and s.id = l.stage_id
      where l.tenant_id = v_tenant_id and l.created_at between v_from and v_to and public.has_unit_access(l.tenant_id, l.unit_id)
      group by coalesce(s.label, 'Sem etapa'), coalesce(s.position, 999), l.status
    ) x;
  elsif v_key = 'crm-sla-tarefas' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.task_status, x.due_bucket), '[]'::jsonb) into v_rows
    from (
      select case when t.status in ('open', 'overdue') and t.due_at < now() then 'overdue' else t.status end as task_status,
             case when t.due_at is null then 'sem_prazo' when t.due_at < now() then 'vencida' when t.due_at <= now() + interval '2 days' then 'ate_48h' else 'futura' end as due_bucket,
             count(*)::integer as total
      from public.crm_lead_tasks t
      join public.crm_leads l on l.tenant_id = t.tenant_id and l.id = t.lead_id
      where t.tenant_id = v_tenant_id and t.created_at between v_from and v_to and public.has_unit_access(l.tenant_id, l.unit_id)
      group by task_status, due_bucket
    ) x;
  elsif v_key = 'crm-responsavel-campanhas' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.total desc), '[]'::jsonb) into v_rows
    from (
      select coalesce(l.owner_user_id::text, 'sem_responsavel') as owner_user_id, coalesce(nullif(l.campaign, ''), 'sem_campanha') as campaign, count(*)::integer as total, count(*) filter (where l.status = 'converted')::integer as converted_total
      from public.crm_leads l
      where l.tenant_id = v_tenant_id and l.created_at between v_from and v_to and public.has_unit_access(l.tenant_id, l.unit_id)
      group by coalesce(l.owner_user_id::text, 'sem_responsavel'), coalesce(nullif(l.campaign, ''), 'sem_campanha')
    ) x;
  elsif v_key = 'inventory-saldo-unidade' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.location_name, x.item_name), '[]'::jsonb) into v_rows
    from (
      select coalesce(loc.name, 'Sem local') as location_name, coalesce(tu.name, 'Sem unidade') as unit_name, coalesce(c.name, i.category, 'Sem categoria') as category_name, i.name as item_name, coalesce(sum(s.quantity_on_hand), 0)::numeric(12,3) as quantity_on_hand, i.minimum_quantity
      from public.inventory_items i
      left join public.inventory_categories c on c.tenant_id = i.tenant_id and c.id = i.category_id
      left join public.inventory_stock_snapshots s on s.tenant_id = i.tenant_id and s.item_id = i.id
      left join public.inventory_locations loc on loc.tenant_id = s.tenant_id and loc.id = s.location_id
      left join public.tenant_units tu on tu.tenant_id = loc.tenant_id and tu.id = loc.unit_id
      where i.tenant_id = v_tenant_id and public.has_unit_access(i.tenant_id, loc.unit_id)
      group by loc.name, tu.name, c.name, i.category, i.name, i.minimum_quantity
    ) x;
  elsif v_key = 'inventory-giro-consumo' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.quantity desc), '[]'::jsonb) into v_rows
    from (
      select i.name as item_name, coalesce(loc.name, 'Sem local') as location_name, m.reason, m.direction, count(*)::integer as movements, sum(m.quantity)::numeric(12,3) as quantity
      from public.inventory_movements m
      join public.inventory_items i on i.tenant_id = m.tenant_id and i.id = m.item_id
      left join public.inventory_locations loc on loc.tenant_id = m.tenant_id and loc.id = m.location_id
      where m.tenant_id = v_tenant_id and m.occurred_at between v_from and v_to and m.reason in ('receipt', 'consumption', 'transfer_in', 'transfer_out') and public.has_unit_access(m.tenant_id, loc.unit_id)
      group by i.name, loc.name, m.reason, m.direction
    ) x;
  elsif v_key = 'inventory-lotes-vencer' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.expires_at nulls last, x.item_name), '[]'::jsonb) into v_rows
    from (
      select i.name as item_name, l.id::text as lot_id, l.lot_code, l.expires_at, (l.expires_at - current_date)::integer as days_to_expiry, coalesce(loc.name, 'Sem local') as location_name, coalesce(s.quantity_on_hand, 0)::numeric(12,3) as quantity_on_hand, '/clinic/inventory?lotId=' || l.id::text as href
      from public.inventory_lots l
      join public.inventory_items i on i.tenant_id = l.tenant_id and i.id = l.item_id
      left join public.inventory_locations loc on loc.tenant_id = l.tenant_id and loc.id = l.location_id
      left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.item_id = l.item_id and s.lot_id = l.id and (s.location_id is not distinct from l.location_id)
      where l.tenant_id = v_tenant_id and l.status = 'active' and l.expires_at is not null and l.expires_at <= current_date + (v_days_to_expiry || ' days')::interval and public.has_unit_access(l.tenant_id, loc.unit_id)
    ) x;
  elsif v_key = 'inventory-ajustes-perdas' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.reason, x.item_name), '[]'::jsonb) into v_rows
    from (
      select i.name as item_name, coalesce(loc.name, 'Sem local') as location_name, m.reason, m.direction, count(*)::integer as movements, sum(m.quantity)::numeric(12,3) as quantity
      from public.inventory_movements m
      join public.inventory_items i on i.tenant_id = m.tenant_id and i.id = m.item_id
      left join public.inventory_locations loc on loc.tenant_id = m.tenant_id and loc.id = m.location_id
      where m.tenant_id = v_tenant_id and m.occurred_at between v_from and v_to and m.reason in ('loss', 'adjustment', 'transfer_in', 'transfer_out') and public.has_unit_access(m.tenant_id, loc.unit_id)
      group by i.name, loc.name, m.reason, m.direction
    ) x;
  elsif v_key = 'inventory-custo' then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.estimated_value_cents desc), '[]'::jsonb) into v_rows
    from (
      select i.name as item_name, coalesce(loc.name, 'Sem local') as location_name, coalesce(sum(s.quantity_on_hand), 0)::numeric(12,3) as quantity_on_hand, coalesce(max(l.unit_cost_cents), max(i.default_unit_cost_cents), 0)::integer as unit_cost_cents, (coalesce(sum(s.quantity_on_hand), 0) * coalesce(max(l.unit_cost_cents), max(i.default_unit_cost_cents), 0))::integer as estimated_value_cents
      from public.inventory_items i
      left join public.inventory_stock_snapshots s on s.tenant_id = i.tenant_id and s.item_id = i.id
      left join public.inventory_lots l on l.tenant_id = s.tenant_id and l.id = s.lot_id
      left join public.inventory_locations loc on loc.tenant_id = s.tenant_id and loc.id = s.location_id
      where i.tenant_id = v_tenant_id and public.has_unit_access(i.tenant_id, loc.unit_id)
      group by i.name, loc.name
    ) x;
  else
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.metric), '[]'::jsonb) into v_rows
    from (
      select 'pacientes_ativos' as metric, count(*)::integer as total from public.patients p where p.tenant_id = v_tenant_id and p.status = 'active' and (p_patient_id is null or p.id = p_patient_id)
      union all
      select 'consultas_periodo', count(*)::integer from public.appointments a where a.tenant_id = v_tenant_id and a.scheduled_at between v_from and v_to and (p_patient_id is null or a.patient_id = p_patient_id)
      union all
      select 'documentos_periodo', count(*)::integer from public.generated_documents gd where gd.tenant_id = v_tenant_id and gd.created_at between v_from and v_to and (p_patient_id is null or gd.patient_id = p_patient_id)
    ) x;
  end if;

  v_summary := jsonb_build_object(
    'reportKey', v_key,
    'scope', v_scope,
    'rowCount', jsonb_array_length(v_rows),
    'filters', jsonb_build_object('from', v_from, 'to', v_to, 'patientId', p_patient_id, 'daysToExpiry', v_days_to_expiry),
    'minimized', true,
    'containsPii', false,
    'requiresFinancialRead', v_requires_financial,
    'requiresSensitiveRead', v_requires_sensitive,
    'requiresCrmRead', v_requires_crm,
    'requiresInventoryRead', v_requires_inventory,
    'requiresInventoryCostRead', v_requires_inventory_cost
  );

  insert into public.report_runs (
    tenant_id, report_definition_id, report_key, scope, patient_id, requested_by,
    status, filters, result_summary, result_rows, export_format, export_token_hash,
    export_expires_at, completed_at
  ) values (
    v_tenant_id, v_definition_id, v_key, v_scope, p_patient_id, auth.uid(),
    'completed', coalesce(p_filters, '{}'::jsonb), v_summary, v_rows, v_format,
    encode(digest(v_token, 'sha256'), 'hex'), now() + interval '15 minutes', now()
  ) returning id into v_run_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    auth.uid(),
    'report.export.created',
    'report_run',
    v_run_id::text,
    v_summary || jsonb_build_object('exportFormat', v_format, 'expiresInSeconds', 900)
  );

  return jsonb_build_object(
    'id', v_run_id,
    'status', 'completed',
    'reportKey', v_key,
    'scope', v_scope,
    'resultSummary', v_summary,
    'rows', v_rows,
    'exportFormat', v_format,
    'exportToken', v_token,
    'exportExpiresAt', now() + interval '15 minutes'
  );
end;
$$;

create or replace function public.get_clinic_report_export(p_run_id uuid, p_export_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_row public.report_runs%rowtype;
  v_expected text := encode(digest(coalesce(p_export_token, ''), 'sha256'), 'hex');
begin
  select * into v_row from public.report_runs rr where rr.id = p_run_id;
  if not found or not security.has_permission(v_row.tenant_id, 'reports.read', false) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_row.export_token_hash is null or v_row.export_token_hash <> v_expected or v_row.export_expires_at < now() then
    raise exception 'export_expired_or_invalid' using errcode = '42501';
  end if;

  if coalesce((v_row.result_summary->>'requiresFinancialRead')::boolean, false)
     and not security.has_permission(v_row.tenant_id, 'financial.read', false) then
    raise exception 'missing_financial_read' using errcode = '42501';
  end if;
  if coalesce((v_row.result_summary->>'requiresSensitiveRead')::boolean, false)
     and not security.has_permission(v_row.tenant_id, 'timeline.sensitive.read', false) then
    raise exception 'missing_sensitive_read' using errcode = '42501';
  end if;
  if coalesce((v_row.result_summary->>'requiresCrmRead')::boolean, false)
     and not security.has_permission(v_row.tenant_id, 'crm.read', false) then
    raise exception 'missing_crm_read' using errcode = '42501';
  end if;
  if coalesce((v_row.result_summary->>'requiresInventoryRead')::boolean, false)
     and not security.has_permission(v_row.tenant_id, 'inventory.read', false) then
    raise exception 'missing_inventory_read' using errcode = '42501';
  end if;
  if coalesce((v_row.result_summary->>'requiresInventoryCostRead')::boolean, false)
     and not security.has_permission(v_row.tenant_id, 'inventory.cost.read', false) then
    raise exception 'missing_inventory_cost_read' using errcode = '42501';
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_row.tenant_id,
    auth.uid(),
    'report.export.downloaded',
    'report_run',
    v_row.id::text,
    jsonb_build_object('reportKey', v_row.report_key, 'format', v_row.export_format, 'scope', v_row.scope)
  );

  return jsonb_build_object(
    'id', v_row.id,
    'reportKey', v_row.report_key,
    'format', coalesce(v_row.export_format, 'csv'),
    'summary', v_row.result_summary,
    'rows', v_row.result_rows,
    'filename', concat(coalesce(v_row.report_key, 'relatorio'), '-', to_char(v_row.created_at, 'YYYYMMDD-HH24MISS'), '.', coalesce(v_row.export_format, 'csv'))
  );
end;
$$;

revoke all on function public.get_crm_inventory_dashboard_insights(integer) from public;
revoke all on function public.list_clinic_report_definitions() from public;
revoke all on function public.create_clinic_report_run(text, jsonb, text, uuid) from public;
revoke all on function public.get_clinic_report_export(uuid, text) from public;

grant execute on function public.get_crm_inventory_dashboard_insights(integer) to authenticated, service_role;
grant execute on function public.list_clinic_report_definitions() to authenticated, service_role;
grant execute on function public.create_clinic_report_run(text, jsonb, text, uuid) to authenticated, service_role;
grant execute on function public.get_clinic_report_export(uuid, text) to authenticated, service_role;

comment on function public.get_crm_inventory_dashboard_insights(integer) is 'Returns aggregate CRM/inventory dashboard counters with RBAC and unit checks, without PII or cost.';
comment on function public.create_clinic_report_run(text, jsonb, text, uuid) is 'Runs allowlisted clinic, CRM and inventory reports with minimized rows, RBAC gates, short-lived export token and audit log.';
