-- Program billing now uses one fixed Checkout Pro price.
-- Mercado Pago decides the available payment methods and card installment costs.

alter table public.programs
  drop constraint if exists programs_payment_model_check;

alter table public.programs
  add constraint programs_payment_model_check
  check (payment_model in ('checkout_pro', 'parcelado', 'avista', 'assinatura', 'hibrido'));

alter table public.programs
  alter column payment_model set default 'checkout_pro';

with normalized as (
  select
    p.id,
    p.tenant_id,
    p.payment_model as legacy_payment_model,
    coalesce(p.financial_config, '{}'::jsonb) as legacy_config,
    case
      when coalesce(p.financial_config ->> 'basePrice', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then greatest((p.financial_config ->> 'basePrice')::numeric, 0)
      else 0
    end as legacy_base_price,
    case
      when coalesce(p.financial_config ->> 'discountPercent', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then least(greatest((p.financial_config ->> 'discountPercent')::numeric, 0), 100)
      else 0
    end as legacy_discount_percent,
    case
      when coalesce(p.financial_config ->> 'maxInstallments', '') ~ '^[0-9]+$'
        then least(greatest((p.financial_config ->> 'maxInstallments')::integer, 1), 12)
      when coalesce(p.financial_config ->> 'installments', '') ~ '^[0-9]+$'
        then least(greatest((p.financial_config ->> 'installments')::integer, 1), 12)
      else 12
    end as max_installments
  from public.programs p
)
update public.programs p
set payment_model = 'checkout_pro',
    financial_config = jsonb_strip_nulls(jsonb_build_object(
      'paymentModel', 'checkout_pro',
      'pricingModel', 'fixed_price_provider_installments',
      'basePrice', round((n.legacy_base_price * (1 - n.legacy_discount_percent / 100))::numeric, 2),
      'maxInstallments', n.max_installments,
      'installments', n.max_installments,
      'discountPercent', 0,
      'description', coalesce(nullif(n.legacy_config ->> 'description', ''), p.payment_description, ''),
      'legacyPaymentModel', n.legacy_payment_model,
      'legacyBasePrice', n.legacy_base_price,
      'legacyDiscountPercent', n.legacy_discount_percent,
      'legacyInstallments', n.max_installments,
      'legacyFinancialConfig', n.legacy_config
    )),
    payment_description = coalesce(nullif(n.legacy_config ->> 'description', ''), p.payment_description),
    updated_at = now()
from normalized n
where p.tenant_id = n.tenant_id
  and p.id = n.id;

create or replace function public.upsert_program_from_builder(
  p_draft jsonb,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_program_id uuid;
  v_name text := btrim(coalesce(p_draft ->> 'name', ''));
  v_program_type text := coalesce(nullif(p_draft ->> 'programType', ''), 'saude_metabolica');
  v_duration_weeks integer := greatest(coalesce(nullif(p_draft ->> 'durationWeeks', '')::integer, 0), 0);
  v_status text := case when p_publish then 'ativo' else coalesce(nullif(p_draft ->> 'status', ''), 'rascunho') end;
  v_payment_model text := 'checkout_pro';
  v_payment_description text := coalesce(p_draft #>> '{financial,description}', '');
  v_base_price numeric := 0;
  v_max_installments integer := 12;
  v_financial_config jsonb;
  v_checkins_total integer := greatest(coalesce(nullif(p_draft ->> 'checkInsTotal', '')::integer, 0), 0);
  v_checkin_frequency text := nullif(p_draft ->> 'checkInFrequency', '');
  v_id_text text := nullif(p_draft ->> 'id', '');
  v_uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
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

  if v_name = '' then
    raise exception 'program_name_required' using errcode = '22023';
  end if;

  if v_program_type not in ('emagrecimento', 'hipertrofia', 'recomposicao', 'saude_metabolica', 'longevidade') then
    raise exception 'invalid_program_type' using errcode = '22023';
  end if;

  if v_status not in ('ativo', 'arquivado', 'rascunho') then
    raise exception 'invalid_program_status' using errcode = '22023';
  end if;

  v_base_price := case
    when coalesce(p_draft #>> '{financial,basePrice}', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then greatest((p_draft #>> '{financial,basePrice}')::numeric, 0)
    else 0
  end;

  v_max_installments := case
    when coalesce(p_draft #>> '{financial,maxInstallments}', '') ~ '^[0-9]+$'
      then least(greatest((p_draft #>> '{financial,maxInstallments}')::integer, 1), 12)
    when coalesce(p_draft #>> '{financial,installments}', '') ~ '^[0-9]+$'
      then least(greatest((p_draft #>> '{financial,installments}')::integer, 1), 12)
    else 12
  end;

  v_financial_config := jsonb_strip_nulls(jsonb_build_object(
    'paymentModel', v_payment_model,
    'pricingModel', 'fixed_price_provider_installments',
    'basePrice', v_base_price,
    'maxInstallments', v_max_installments,
    'installments', v_max_installments,
    'discountPercent', 0,
    'description', nullif(v_payment_description, '')
  ));

  if v_id_text is not null then
    if v_id_text !~ v_uuid_pattern then
      raise exception 'invalid_program_id' using errcode = '22023';
    end if;
    v_program_id := v_id_text::uuid;
    if not exists (
      select 1
      from public.programs
      where tenant_id = v_tenant_id
        and id = v_program_id
    ) then
      raise exception 'program_not_found' using errcode = 'P0002';
    end if;
  end if;

  if v_program_id is null then
    insert into public.programs (
      tenant_id,
      name,
      program_type,
      objective,
      duration_weeks,
      status,
      payment_model,
      payment_description,
      color,
      created_by,
      checkins_total,
      checkin_frequency,
      financial_config
    )
    values (
      v_tenant_id,
      v_name,
      v_program_type,
      nullif(p_draft ->> 'objective', ''),
      v_duration_weeks,
      v_status,
      v_payment_model,
      nullif(v_payment_description, ''),
      coalesce(nullif(p_draft ->> 'color', ''), 'teal'),
      v_user_id,
      v_checkins_total,
      v_checkin_frequency,
      v_financial_config
    )
    returning id into v_program_id;
  else
    update public.programs
    set name = v_name,
        program_type = v_program_type,
        objective = nullif(p_draft ->> 'objective', ''),
        duration_weeks = v_duration_weeks,
        status = v_status,
        payment_model = v_payment_model,
        payment_description = nullif(v_payment_description, ''),
        color = coalesce(nullif(p_draft ->> 'color', ''), 'teal'),
        checkins_total = v_checkins_total,
        checkin_frequency = v_checkin_frequency,
        financial_config = v_financial_config,
        updated_at = now()
    where tenant_id = v_tenant_id
      and id = v_program_id;
  end if;

  delete from public.program_phases where tenant_id = v_tenant_id and program_id = v_program_id;
  delete from public.program_services where tenant_id = v_tenant_id and program_id = v_program_id;
  delete from public.program_entitlements where tenant_id = v_tenant_id and program_id = v_program_id;
  delete from public.program_required_documents where tenant_id = v_tenant_id and program_id = v_program_id;
  delete from public.program_checkin_templates where tenant_id = v_tenant_id and program_id = v_program_id;
  delete from public.program_team_members where tenant_id = v_tenant_id and program_id = v_program_id;

  insert into public.program_phases (tenant_id, program_id, position, name, duration_weeks, description)
  select
    v_tenant_id,
    v_program_id,
    phase_ord::integer,
    btrim(coalesce(phase ->> 'name', 'Fase')),
    greatest(coalesce(nullif(phase ->> 'durationWeeks', '')::integer, 0), 0),
    nullif(phase ->> 'description', '')
  from jsonb_array_elements(coalesce(p_draft -> 'phases', '[]'::jsonb)) with ordinality as phases(phase, phase_ord)
  where btrim(coalesce(phase ->> 'name', '')) <> '';

  insert into public.program_services (tenant_id, program_id, label, quantity, unit)
  select
    v_tenant_id,
    v_program_id,
    btrim(coalesce(service ->> 'label', 'Servico')),
    greatest(coalesce(nullif(service ->> 'quantity', '')::numeric, 0), 0),
    coalesce(nullif(service ->> 'unit', ''), 'unidade')
  from jsonb_array_elements(coalesce(p_draft -> 'includedServices', '[]'::jsonb)) as services(service)
  where btrim(coalesce(service ->> 'label', '')) <> '';

  insert into public.program_entitlements (tenant_id, program_id, key, label, enabled)
  select
    v_tenant_id,
    v_program_id,
    btrim(coalesce(entitlement ->> 'key', entitlement ->> 'label')),
    btrim(coalesce(entitlement ->> 'label', entitlement ->> 'key')),
    coalesce((entitlement ->> 'enabled')::boolean, true)
  from jsonb_array_elements(coalesce(p_draft -> 'appEntitlements', '[]'::jsonb)) as entitlements(entitlement)
  where btrim(coalesce(entitlement ->> 'key', entitlement ->> 'label', '')) <> '';

  insert into public.program_required_documents (tenant_id, program_id, label, required)
  select
    v_tenant_id,
    v_program_id,
    btrim(coalesce(document ->> 'label', 'Documento')),
    coalesce((document ->> 'required')::boolean, true)
  from jsonb_array_elements(coalesce(p_draft -> 'requiredDocuments', '[]'::jsonb)) as documents(document)
  where btrim(coalesce(document ->> 'label', '')) <> '';

  insert into public.program_checkin_templates (tenant_id, program_id, label, frequency, channel, questions)
  select
    v_tenant_id,
    v_program_id,
    btrim(coalesce(template ->> 'label', 'Check-in')),
    nullif(template ->> 'frequency', ''),
    case
      when template ->> 'channel' in ('app', 'whatsapp', 'email', 'presencial')
        then template ->> 'channel'
      else 'app'
    end,
    case
      when jsonb_typeof(template -> 'questions') = 'array'
        then template -> 'questions'
      else '[]'::jsonb
    end
  from jsonb_array_elements(coalesce(p_draft -> 'checkinTemplates', '[]'::jsonb)) as templates(template)
  where btrim(coalesce(template ->> 'label', '')) <> '';

  if v_checkins_total > 0
     and not exists (
       select 1
       from public.program_checkin_templates
       where tenant_id = v_tenant_id
         and program_id = v_program_id
     ) then
    insert into public.program_checkin_templates (tenant_id, program_id, label, frequency, channel, questions)
    values (
      v_tenant_id,
      v_program_id,
      'Check-in do programa',
      coalesce(v_checkin_frequency, 'Semanal via app'),
      'app',
      '[
        "Como foi sua adesao ao plano nesta semana?",
        "Teve alguma dificuldade relevante?",
        "Deseja registrar alguma observacao para a equipe?"
      ]'::jsonb
    );
  end if;

  insert into public.program_team_members (tenant_id, program_id, profile_id, role_label, specialty)
  select
    v_tenant_id,
    v_program_id,
    team.profile_id,
    nullif(team.item ->> 'role', ''),
    nullif(team.item ->> 'specialty', '')
  from (
    select item, (item ->> 'id')::uuid as profile_id
    from jsonb_array_elements(coalesce(p_draft -> 'team', '[]'::jsonb)) as team_items(item)
    where item ->> 'id' ~ v_uuid_pattern
  ) team
  where exists (
    select 1
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.tenant_id = v_tenant_id
      and tm.user_id = team.profile_id
      and tm.status = 'active'
      and p.is_active = true
  )
  on conflict (tenant_id, program_id, profile_id) do update
  set role_label = excluded.role_label,
      specialty = excluded.specialty,
      updated_at = now();

  return jsonb_build_object(
    'id', v_program_id,
    'status', v_status,
    'published', p_publish,
    'updatedAt', now()
  );
end;
$$;

create or replace function public.apply_program_enrollment_billing_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_invoice_id uuid := security.try_uuid(new.metadata ->> 'invoice_id');
  v_program public.programs%rowtype;
  v_invoice public.patient_invoices%rowtype;
  v_payment_model text := lower(coalesce(new.metadata ->> 'payment_model', 'checkout_pro'));
  v_max_installments integer := 12;
begin
  if new.metadata ? 'billing_schedule_generated_at' then
    return new;
  end if;

  if v_invoice_id is null then
    return new;
  end if;

  select * into v_program
  from public.programs
  where tenant_id = new.tenant_id
    and id = new.program_id;

  select * into v_invoice
  from public.patient_invoices
  where tenant_id = new.tenant_id
    and id = v_invoice_id
  for update;

  if v_program.id is null or v_invoice.id is null then
    return new;
  end if;

  v_max_installments := case
    when coalesce(new.metadata #>> '{financial_config_snapshot,maxInstallments}', '') ~ '^[0-9]+$'
      then least(greatest((new.metadata #>> '{financial_config_snapshot,maxInstallments}')::integer, 1), 12)
    when coalesce(new.metadata #>> '{financial_config_snapshot,installments}', '') ~ '^[0-9]+$'
      then least(greatest((new.metadata #>> '{financial_config_snapshot,installments}')::integer, 1), 12)
    when coalesce(new.metadata ->> 'installments', '') ~ '^[0-9]+$'
      then least(greatest((new.metadata ->> 'installments')::integer, 1), 12)
    else 12
  end;

  update public.patient_invoices
  set provider = 'mercadopago',
      program_id = new.program_id,
      package_id = new.package_id,
      enrollment_id = new.id,
      source_module = 'program_enrollment',
      metadata = metadata || jsonb_build_object(
        'source', 'program_enrollment',
        'provider', 'mercadopago',
        'program_id', new.program_id,
        'package_id', new.package_id,
        'enrollment_id', new.id,
        'payment_model', v_payment_model,
        'pricing_model', 'fixed_price_provider_installments',
        'max_installments', v_max_installments,
        'installments', v_max_installments
      )
  where tenant_id = new.tenant_id
    and id = v_invoice_id;

  update public.patient_program_enrollments
  set metadata = metadata || jsonb_build_object('billing_schedule_generated_at', now())
  where tenant_id = new.tenant_id
    and id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_program_enrollment_billing_schedule on public.patient_program_enrollments;
create trigger trg_program_enrollment_billing_schedule
after update of metadata on public.patient_program_enrollments
for each row execute function public.apply_program_enrollment_billing_schedule();

with candidates as (
  select
    i.*,
    row_number() over (
      partition by i.tenant_id, i.patient_id, i.enrollment_id
      order by i.due_date asc nulls last, i.created_at asc, i.id asc
    ) as rn,
    first_value(i.id) over (
      partition by i.tenant_id, i.patient_id, i.enrollment_id
      order by i.due_date asc nulls last, i.created_at asc, i.id asc
    ) as keeper_id,
    count(*) over (partition by i.tenant_id, i.patient_id, i.enrollment_id) as invoice_count,
    sum(i.amount_cents) over (partition by i.tenant_id, i.patient_id, i.enrollment_id) as total_amount_cents
  from public.patient_invoices i
  where i.enrollment_id is not null
    and coalesce(i.source_module, i.metadata ->> 'source') = 'program_enrollment'
    and coalesce(i.payment_link, '') = ''
    and coalesce(i.invoice_url, '') = ''
    and i.asaas_invoice_id is null
    and i.provider_payment_id is null
    and i.provider_invoice_id is null
    and i.provider_preference_id is null
    and i.paid_at is null
    and not (i.metadata ? 'superseded_by_invoice_id')
    and public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) in ('pendente', 'vencido')
), grouped as (
  select
    tenant_id,
    patient_id,
    enrollment_id,
    keeper_id,
    max(total_amount_cents) as total_amount_cents,
    jsonb_agg(id order by due_date asc nulls last, created_at asc, id asc) as invoice_ids
  from candidates
  where invoice_count > 1
  group by tenant_id, patient_id, enrollment_id, keeper_id
), keepers as (
  update public.patient_invoices i
  set amount_cents = g.total_amount_cents,
      status = 'pending',
      provider = 'mercadopago',
      source_module = 'program_enrollment',
      metadata = i.metadata || jsonb_build_object(
        'provider', 'mercadopago',
        'pricing_model', 'fixed_price_provider_installments',
        'consolidated_open_installments_at', now(),
        'consolidated_invoice_ids', g.invoice_ids
      ),
      updated_at = now()
  from grouped g
  where i.tenant_id = g.tenant_id
    and i.id = g.keeper_id
  returning i.tenant_id, i.id
)
update public.patient_invoices i
set status = 'cancelled',
    amount_cents = 0,
    metadata = i.metadata || jsonb_build_object(
      'superseded_by_invoice_id', g.keeper_id,
      'superseded_at', now(),
      'original_amount_cents', i.amount_cents,
      'cancel_reason', 'consolidated_open_program_installments'
    ),
    updated_at = now()
from grouped g
where i.tenant_id = g.tenant_id
  and i.enrollment_id = g.enrollment_id
  and i.id <> g.keeper_id;

grant execute on function public.upsert_program_from_builder(jsonb, boolean) to authenticated, service_role;
grant execute on function public.apply_program_enrollment_billing_schedule() to service_role;

comment on function public.upsert_program_from_builder(jsonb, boolean) is
  'Creates or updates program builder records using fixed Checkout Pro pricing. Legacy payment models are preserved only in historical financial_config metadata.';

comment on function public.apply_program_enrollment_billing_schedule() is
  'Annotates program enrollment invoices for Mercado Pago Checkout Pro without creating local installment rows.';
