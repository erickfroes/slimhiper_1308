-- M12: commercial catalog for services, packages, program package links,
-- patient commercial context and audited upgrade requests.
-- External providers are not called here. Upgrade charges create local
-- patient_invoices only; Asaas orchestration remains behind Edge Functions.

create or replace function security.resolve_current_tenant(
  p_permission text,
  p_include_platform boolean default true
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, security, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

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

  if v_tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_permission is not null
     and not security.has_permission(v_tenant_id, p_permission, p_include_platform) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return v_tenant_id;
end;
$$;

revoke all on function security.resolve_current_tenant(text, boolean) from public;
grant execute on function security.resolve_current_tenant(text, boolean)
  to authenticated, service_role;

create or replace function security.commercial_clean_text(
  p_value text,
  p_max_length integer
)
returns text
language sql
immutable
as $$
  select nullif(
    left(
      regexp_replace(btrim(coalesce(p_value, '')), '[[:cntrl:]]+', ' ', 'g'),
      greatest(1, least(coalesce(p_max_length, 240), 4000))
    ),
    ''
  );
$$;

revoke all on function security.commercial_clean_text(text, integer) from public;
grant execute on function security.commercial_clean_text(text, integer)
  to authenticated, service_role;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  category text not null default 'clinico'
    check (category in ('clinico', 'nutricao', 'fitness', 'exame', 'documento', 'suporte', 'outro')),
  description text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'arquivado')),
  base_price_cents integer not null default 0 check (base_price_cents >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  unit text not null default 'unidade',
  delivery_mode text not null default 'presencial'
    check (delivery_mode in ('presencial', 'online', 'hibrido', 'interno')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'ativo', 'inativo', 'arquivado')),
  price_cents integer not null default 0 check (price_cents >= 0),
  duration_weeks integer not null default 0 check (duration_weeks >= 0),
  renewal_policy text not null default 'manual' check (renewal_policy in ('manual', 'automatico', 'sem_renovacao')),
  community_access boolean not null default false,
  priority_chat boolean not null default false,
  benefits jsonb not null default '[]'::jsonb check (jsonb_typeof(benefits) = 'array'),
  usage_limits jsonb not null default '[]'::jsonb check (jsonb_typeof(usage_limits) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table if not exists public.package_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  package_id uuid not null,
  service_id uuid not null,
  quantity numeric(10,2) not null default 1 check (quantity >= 0),
  unit text not null default 'unidade',
  limit_per_period integer check (limit_per_period is null or limit_per_period >= 0),
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, package_id, service_id),
  constraint package_services_package_same_tenant
    foreign key (tenant_id, package_id)
    references public.packages(tenant_id, id)
    on delete cascade,
  constraint package_services_service_same_tenant
    foreign key (tenant_id, service_id)
    references public.services(tenant_id, id)
    on delete restrict
);

create table if not exists public.program_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  program_id uuid not null,
  package_id uuid not null,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  is_default boolean not null default false,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, program_id, package_id),
  constraint program_packages_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
    on delete cascade,
  constraint program_packages_package_same_tenant
    foreign key (tenant_id, package_id)
    references public.packages(tenant_id, id)
    on delete cascade
);

create table if not exists public.upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  enrollment_id uuid,
  current_package_id uuid,
  target_package_id uuid not null,
  current_program_id uuid,
  target_program_id uuid,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_role text not null default 'staff'
    check (requested_by_role in ('patient', 'guardian', 'staff', 'system')),
  status text not null default 'solicitado'
    check (status in ('solicitado', 'cotado', 'aprovado', 'rejeitado', 'cancelado', 'cobranca_pendente', 'concluido')),
  reason text,
  quote_amount_cents integer check (quote_amount_cents is null or quote_amount_cents >= 0),
  quote_currency text not null default 'BRL',
  quote_notes text,
  quote_due_date date,
  invoice_id uuid,
  decision_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint upgrade_requests_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint upgrade_requests_enrollment_same_tenant
    foreign key (tenant_id, enrollment_id)
    references public.patient_program_enrollments(tenant_id, id)
    on delete set null (enrollment_id),
  constraint upgrade_requests_current_package_same_tenant
    foreign key (tenant_id, current_package_id)
    references public.packages(tenant_id, id)
    on delete set null (current_package_id),
  constraint upgrade_requests_target_package_same_tenant
    foreign key (tenant_id, target_package_id)
    references public.packages(tenant_id, id)
    on delete restrict,
  constraint upgrade_requests_current_program_same_tenant
    foreign key (tenant_id, current_program_id)
    references public.programs(tenant_id, id)
    on delete set null (current_program_id),
  constraint upgrade_requests_target_program_same_tenant
    foreign key (tenant_id, target_program_id)
    references public.programs(tenant_id, id)
    on delete set null (target_program_id),
  constraint upgrade_requests_invoice_same_tenant
    foreign key (tenant_id, invoice_id)
    references public.patient_invoices(tenant_id, id)
    on delete set null (invoice_id)
);

create table if not exists public.upgrade_request_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  upgrade_request_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null
    check (event_type in ('requested', 'quoted', 'approved', 'rejected', 'cancelled', 'invoice_created', 'invoice_paid', 'package_applied')),
  status_from text,
  status_to text,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  notes text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint upgrade_request_events_request_same_tenant
    foreign key (tenant_id, upgrade_request_id)
    references public.upgrade_requests(tenant_id, id)
    on delete cascade
);

alter table public.patient_program_enrollments
  add column if not exists package_id uuid,
  add column if not exists package_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists service_entitlements jsonb not null default '[]'::jsonb,
  add column if not exists benefit_entitlements jsonb not null default '[]'::jsonb;

do $$
begin
  alter table public.patient_program_enrollments
    add constraint patient_program_enrollments_package_same_tenant
    foreign key (tenant_id, package_id)
    references public.packages(tenant_id, id)
    on delete set null (package_id);
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_services_tenant_status
  on public.services(tenant_id, status, updated_at desc);
create index if not exists idx_packages_tenant_status
  on public.packages(tenant_id, status, updated_at desc);
create index if not exists idx_package_services_package
  on public.package_services(tenant_id, package_id, position);
create index if not exists idx_program_packages_program
  on public.program_packages(tenant_id, program_id, status, is_default desc);
create unique index if not exists idx_program_packages_default
  on public.program_packages(tenant_id, program_id)
  where is_default = true and status = 'ativo';
create index if not exists idx_upgrade_requests_tenant_status
  on public.upgrade_requests(tenant_id, status, updated_at desc);
create index if not exists idx_upgrade_requests_patient
  on public.upgrade_requests(tenant_id, patient_id, created_at desc);
create index if not exists idx_upgrade_request_events_request
  on public.upgrade_request_events(tenant_id, upgrade_request_id, created_at desc);
create index if not exists idx_patient_program_enrollments_package
  on public.patient_program_enrollments(tenant_id, package_id, status);

select security.touch_updated_at('public.services');
select security.touch_updated_at('public.packages');
select security.touch_updated_at('public.package_services');
select security.touch_updated_at('public.program_packages');
select security.touch_updated_at('public.upgrade_requests');

alter table public.services enable row level security;
alter table public.packages enable row level security;
alter table public.package_services enable row level security;
alter table public.program_packages enable row level security;
alter table public.upgrade_requests enable row level security;
alter table public.upgrade_request_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['services', 'packages', 'package_services', 'program_packages']
  loop
    execute format('drop policy if exists %I on public.%I;', table_name || '_select_packages_read', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_permission(tenant_id, ''packages.read''));',
      table_name || '_select_packages_read',
      table_name
    );

    execute format('drop policy if exists %I on public.%I;', table_name || '_write_packages_write', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_permission(tenant_id, ''packages.write'')) with check (public.has_permission(tenant_id, ''packages.write''));',
      table_name || '_write_packages_write',
      table_name
    );
  end loop;
end $$;

drop policy if exists upgrade_requests_select_scope on public.upgrade_requests;
create policy upgrade_requests_select_scope
on public.upgrade_requests for select
to authenticated
using (
  public.has_permission(tenant_id, 'packages.read')
  or public.can_access_patient_portal_patient(tenant_id, patient_id)
);

drop policy if exists upgrade_requests_write_packages_write on public.upgrade_requests;
create policy upgrade_requests_write_packages_write
on public.upgrade_requests for all
to authenticated
using (public.has_permission(tenant_id, 'packages.write'))
with check (public.has_permission(tenant_id, 'packages.write'));

drop policy if exists upgrade_request_events_select_scope on public.upgrade_request_events;
create policy upgrade_request_events_select_scope
on public.upgrade_request_events for select
to authenticated
using (
  public.has_permission(tenant_id, 'packages.read')
  or exists (
    select 1
    from public.upgrade_requests ur
    where ur.tenant_id = upgrade_request_events.tenant_id
      and ur.id = upgrade_request_events.upgrade_request_id
      and public.can_access_patient_portal_patient(ur.tenant_id, ur.patient_id)
  )
);

drop policy if exists upgrade_request_events_write_packages_write on public.upgrade_request_events;
create policy upgrade_request_events_write_packages_write
on public.upgrade_request_events for insert
to authenticated
with check (public.has_permission(tenant_id, 'packages.write'));

grant select, insert, update, delete on public.services to authenticated, service_role;
grant select, insert, update, delete on public.packages to authenticated, service_role;
grant select, insert, update, delete on public.package_services to authenticated, service_role;
grant select, insert, update, delete on public.program_packages to authenticated, service_role;
grant select, insert, update on public.upgrade_requests to authenticated, service_role;
grant select, insert on public.upgrade_request_events to authenticated, service_role;

create or replace function public.sync_patient_enrollment_package_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_package_id uuid := new.package_id;
  v_package public.packages%rowtype;
  v_services jsonb := '[]'::jsonb;
begin
  if v_package_id is null then
    select pp.package_id
    into v_package_id
    from public.program_packages pp
    join public.packages pk
      on pk.tenant_id = pp.tenant_id
     and pk.id = pp.package_id
    where pp.tenant_id = new.tenant_id
      and pp.program_id = new.program_id
      and pp.status = 'ativo'
      and pk.status = 'ativo'
    order by pp.is_default desc, pp.position asc, pk.price_cents asc, pp.created_at asc
    limit 1;
  end if;

  if v_package_id is null then
    return new;
  end if;

  select *
  into v_package
  from public.packages
  where tenant_id = new.tenant_id
    and id = v_package_id;

  if v_package.id is null then
    return new;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'serviceId', s.id,
        'name', s.name,
        'category', s.category,
        'quantity', ps.quantity,
        'unit', ps.unit,
        'limitPerPeriod', ps.limit_per_period
      )
      order by ps.position asc, s.name asc
    ),
    '[]'::jsonb
  )
  into v_services
  from public.package_services ps
  join public.services s
    on s.tenant_id = ps.tenant_id
   and s.id = ps.service_id
  where ps.tenant_id = new.tenant_id
    and ps.package_id = v_package.id
    and s.status = 'ativo';

  new.package_id := v_package.id;
  new.package_snapshot := jsonb_build_object(
    'id', v_package.id,
    'name', v_package.name,
    'description', coalesce(v_package.description, ''),
    'priceCents', v_package.price_cents,
    'durationWeeks', v_package.duration_weeks,
    'renewalPolicy', v_package.renewal_policy,
    'communityAccess', v_package.community_access,
    'priorityChat', v_package.priority_chat
  );
  new.service_entitlements := v_services;
  new.benefit_entitlements := coalesce(v_package.benefits, '[]'::jsonb);
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'commercial_package_synced_at', now()
  );

  return new;
end;
$$;

drop trigger if exists sync_patient_enrollment_package_snapshot_before_write
  on public.patient_program_enrollments;
create trigger sync_patient_enrollment_package_snapshot_before_write
before insert or update of program_id, package_id
on public.patient_program_enrollments
for each row
execute function public.sync_patient_enrollment_package_snapshot();

-- Bootstrap catalog rows from existing program builder content so the new
-- operational catalog starts with the current program templates.
insert into public.services (
  tenant_id,
  name,
  category,
  status,
  unit,
  metadata
)
select distinct on (ps.tenant_id, lower(ps.label))
  ps.tenant_id,
  security.commercial_clean_text(ps.label, 160),
  case
    when lower(ps.label) like '%nutri%' then 'nutricao'
    when lower(ps.label) like '%bioimp%' or lower(ps.label) like '%exame%' then 'exame'
    else 'clinico'
  end,
  'ativo',
  coalesce(nullif(ps.unit, ''), 'unidade'),
  jsonb_build_object('source', 'program_builder_seed')
from public.program_services ps
where security.commercial_clean_text(ps.label, 160) is not null
order by ps.tenant_id, lower(ps.label), ps.created_at asc
on conflict (tenant_id, name) do nothing;

insert into public.packages (
  tenant_id,
  name,
  description,
  status,
  price_cents,
  duration_weeks,
  renewal_policy,
  community_access,
  priority_chat,
  benefits,
  usage_limits,
  metadata
)
select
  p.tenant_id,
  left('Pacote ' || p.name, 160),
  p.objective,
  case when p.status = 'ativo' then 'ativo' else 'rascunho' end,
  case
    when coalesce(p.financial_config ->> 'basePrice', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then greatest(round((p.financial_config ->> 'basePrice')::numeric * 100), 0)::integer
    else 0
  end,
  p.duration_weeks,
  case when p.payment_model = 'assinatura' then 'automatico' else 'manual' end,
  exists (
    select 1
    from public.program_entitlements pe
    where pe.tenant_id = p.tenant_id
      and pe.program_id = p.id
      and pe.key = 'comunidade'
      and pe.enabled = true
  ),
  exists (
    select 1
    from public.program_entitlements pe
    where pe.tenant_id = p.tenant_id
      and pe.program_id = p.id
      and pe.key in ('chat_prioritario', 'chat')
      and pe.enabled = true
  ),
  coalesce(
    (
      select jsonb_agg(pe.label order by pe.created_at asc)
      from public.program_entitlements pe
      where pe.tenant_id = p.tenant_id
        and pe.program_id = p.id
        and pe.enabled = true
    ),
    '[]'::jsonb
  ),
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('label', ps.label, 'value', ps.quantity || ' ' || ps.unit)
        order by ps.created_at asc
      )
      from public.program_services ps
      where ps.tenant_id = p.tenant_id
        and ps.program_id = p.id
    ),
    '[]'::jsonb
  ),
  jsonb_build_object('source', 'program_builder_seed', 'programId', p.id)
from public.programs p
where not exists (
  select 1
  from public.packages pk
  where pk.tenant_id = p.tenant_id
    and pk.metadata ->> 'programId' = p.id::text
)
on conflict (tenant_id, name) do nothing;

insert into public.package_services (
  tenant_id,
  package_id,
  service_id,
  quantity,
  unit,
  position,
  metadata
)
select
  ps.tenant_id,
  pk.id,
  s.id,
  greatest(ps.quantity, 0),
  coalesce(nullif(ps.unit, ''), s.unit),
  row_number() over (partition by ps.tenant_id, pk.id order by ps.created_at asc)::integer,
  jsonb_build_object('source', 'program_builder_seed', 'programServiceId', ps.id)
from public.program_services ps
join public.programs p
  on p.tenant_id = ps.tenant_id
 and p.id = ps.program_id
join public.packages pk
  on pk.tenant_id = p.tenant_id
 and pk.metadata ->> 'programId' = p.id::text
join public.services s
  on s.tenant_id = ps.tenant_id
 and lower(s.name) = lower(ps.label)
on conflict (tenant_id, package_id, service_id) do update
set quantity = excluded.quantity,
    unit = excluded.unit,
    position = excluded.position,
    metadata = public.package_services.metadata || excluded.metadata;

insert into public.program_packages (
  tenant_id,
  program_id,
  package_id,
  status,
  is_default,
  position,
  metadata
)
select
  p.tenant_id,
  p.id,
  pk.id,
  'ativo',
  true,
  0,
  jsonb_build_object('source', 'program_builder_seed')
from public.programs p
join public.packages pk
  on pk.tenant_id = p.tenant_id
 and pk.metadata ->> 'programId' = p.id::text
on conflict (tenant_id, program_id, package_id) do update
set status = 'ativo',
    is_default = true,
    metadata = public.program_packages.metadata || excluded.metadata;

update public.patient_program_enrollments e
set package_id = pp.package_id
from public.program_packages pp
where e.tenant_id = pp.tenant_id
  and e.program_id = pp.program_id
  and e.package_id is null
  and pp.status = 'ativo'
  and pp.is_default = true;

create or replace function public.get_clinic_commercial_catalog()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.read', true);
  v_services jsonb := '[]'::jsonb;
  v_packages jsonb := '[]'::jsonb;
  v_programs jsonb := '[]'::jsonb;
  v_upgrades jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'category', s.category,
        'description', coalesce(s.description, ''),
        'status', s.status,
        'basePriceCents', s.base_price_cents,
        'durationMinutes', s.duration_minutes,
        'unit', s.unit,
        'deliveryMode', s.delivery_mode,
        'packagesCount', coalesce(ps.packages_count, 0),
        'createdAt', s.created_at,
        'updatedAt', s.updated_at
      )
      order by case s.status when 'ativo' then 0 when 'inativo' then 1 else 2 end, s.name asc
    ),
    '[]'::jsonb
  )
  into v_services
  from public.services s
  left join lateral (
    select count(*)::integer as packages_count
    from public.package_services ps
    join public.packages pk
      on pk.tenant_id = ps.tenant_id
     and pk.id = ps.package_id
    where ps.tenant_id = s.tenant_id
      and ps.service_id = s.id
      and pk.status <> 'arquivado'
  ) ps on true
  where s.tenant_id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pk.id,
        'name', pk.name,
        'description', coalesce(pk.description, ''),
        'status', pk.status,
        'priceCents', pk.price_cents,
        'durationWeeks', pk.duration_weeks,
        'renewalPolicy', pk.renewal_policy,
        'communityAccess', pk.community_access,
        'priorityChat', pk.priority_chat,
        'benefits', pk.benefits,
        'usageLimits', pk.usage_limits,
        'services', coalesce(package_services.items, '[]'::jsonb),
        'programLinks', coalesce(program_links.items, '[]'::jsonb),
        'activePatients', coalesce(enrollments.active_count, 0),
        'createdAt', pk.created_at,
        'updatedAt', pk.updated_at
      )
      order by case pk.status when 'ativo' then 0 when 'rascunho' then 1 else 2 end, pk.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_packages
  from public.packages pk
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', ps.id,
        'serviceId', s.id,
        'serviceName', s.name,
        'category', s.category,
        'quantity', ps.quantity,
        'unit', ps.unit,
        'limitPerPeriod', ps.limit_per_period,
        'position', ps.position
      )
      order by ps.position asc, s.name asc
    ) as items
    from public.package_services ps
    join public.services s
      on s.tenant_id = ps.tenant_id
     and s.id = ps.service_id
    where ps.tenant_id = pk.tenant_id
      and ps.package_id = pk.id
  ) package_services on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'programId', p.id,
        'programName', p.name,
        'isDefault', pp.is_default,
        'status', pp.status
      )
      order by pp.is_default desc, p.name asc
    ) as items
    from public.program_packages pp
    join public.programs p
      on p.tenant_id = pp.tenant_id
     and p.id = pp.program_id
    where pp.tenant_id = pk.tenant_id
      and pp.package_id = pk.id
  ) program_links on true
  left join lateral (
    select count(*)::integer as active_count
    from public.patient_program_enrollments e
    where e.tenant_id = pk.tenant_id
      and e.package_id = pk.id
      and e.status in ('ativo', 'pausado', 'aguardando')
  ) enrollments on true
  where pk.tenant_id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'status', p.status,
        'programType', p.program_type
      )
      order by p.name asc
    ),
    '[]'::jsonb
  )
  into v_programs
  from public.programs p
  where p.tenant_id = v_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ur.id,
        'patientId', ur.patient_id,
        'patientName', coalesce(pp.full_name, p.preferred_name, 'Paciente'),
        'enrollmentId', ur.enrollment_id,
        'currentPackageId', ur.current_package_id,
        'currentPackageName', current_package.name,
        'targetPackageId', ur.target_package_id,
        'targetPackageName', target_package.name,
        'targetProgramId', ur.target_program_id,
        'status', ur.status,
        'requestedByRole', ur.requested_by_role,
        'reason', coalesce(ur.reason, ''),
        'quoteAmountCents', ur.quote_amount_cents,
        'quoteCurrency', ur.quote_currency,
        'quoteNotes', coalesce(ur.quote_notes, ''),
        'quoteDueDate', ur.quote_due_date,
        'invoiceId', ur.invoice_id,
        'invoiceStatus', invoice.status,
        'createdAt', ur.created_at,
        'updatedAt', ur.updated_at,
        'decidedAt', ur.decided_at
      )
      order by ur.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_upgrades
  from public.upgrade_requests ur
  join public.patients p
    on p.tenant_id = ur.tenant_id
   and p.id = ur.patient_id
  left join public.patient_pii pp
    on pp.tenant_id = ur.tenant_id
   and pp.patient_id = ur.patient_id
  left join public.packages current_package
    on current_package.tenant_id = ur.tenant_id
   and current_package.id = ur.current_package_id
  join public.packages target_package
    on target_package.tenant_id = ur.tenant_id
   and target_package.id = ur.target_package_id
  left join public.patient_invoices invoice
    on invoice.tenant_id = ur.tenant_id
   and invoice.id = ur.invoice_id
  where ur.tenant_id = v_tenant_id;

  select jsonb_build_object(
    'services', (select count(*)::integer from public.services where tenant_id = v_tenant_id and status = 'ativo'),
    'packages', (select count(*)::integer from public.packages where tenant_id = v_tenant_id and status = 'ativo'),
    'upgradesOpen', (
      select count(*)::integer
      from public.upgrade_requests
      where tenant_id = v_tenant_id
        and status in ('solicitado', 'cotado', 'cobranca_pendente')
    ),
    'upgradeRevenuePendingCents', (
      select coalesce(sum(quote_amount_cents), 0)::integer
      from public.upgrade_requests
      where tenant_id = v_tenant_id
        and status in ('cotado', 'cobranca_pendente')
    )
  )
  into v_summary;

  return jsonb_build_object(
    'services', v_services,
    'packages', v_packages,
    'programs', v_programs,
    'upgradeRequests', v_upgrades,
    'summary', v_summary,
    'lastCheckedAt', now()
  );
end;
$$;

create or replace function public.upsert_commercial_service(p_service jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_user_id uuid := auth.uid();
  v_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_service ->> 'id', '')) then (p_service ->> 'id')::uuid
    else null
  end;
  v_name text := security.commercial_clean_text(p_service ->> 'name', 160);
  v_category text := coalesce(nullif(p_service ->> 'category', ''), 'clinico');
  v_status text := coalesce(nullif(p_service ->> 'status', ''), 'ativo');
  v_delivery_mode text := coalesce(nullif(p_service ->> 'deliveryMode', ''), 'presencial');
  v_price_cents integer := greatest(coalesce(nullif(p_service ->> 'basePriceCents', '')::numeric, 0), 0)::integer;
  v_duration_minutes integer := nullif(p_service ->> 'durationMinutes', '')::integer;
begin
  if v_name is null then
    raise exception 'service_name_required' using errcode = '22023';
  end if;

  if v_category not in ('clinico', 'nutricao', 'fitness', 'exame', 'documento', 'suporte', 'outro') then
    v_category := 'clinico';
  end if;
  if v_status not in ('ativo', 'inativo', 'arquivado') then
    v_status := 'ativo';
  end if;
  if v_delivery_mode not in ('presencial', 'online', 'hibrido', 'interno') then
    v_delivery_mode := 'presencial';
  end if;

  if v_id is null then
    insert into public.services (
      tenant_id,
      name,
      category,
      description,
      status,
      base_price_cents,
      duration_minutes,
      unit,
      delivery_mode,
      created_by
    )
    values (
      v_tenant_id,
      v_name,
      v_category,
      security.commercial_clean_text(p_service ->> 'description', 1000),
      v_status,
      v_price_cents,
      v_duration_minutes,
      coalesce(security.commercial_clean_text(p_service ->> 'unit', 40), 'unidade'),
      v_delivery_mode,
      v_user_id
    )
    returning id into v_id;
  else
    update public.services
    set name = v_name,
        category = v_category,
        description = security.commercial_clean_text(p_service ->> 'description', 1000),
        status = v_status,
        base_price_cents = v_price_cents,
        duration_minutes = v_duration_minutes,
        unit = coalesce(security.commercial_clean_text(p_service ->> 'unit', 40), 'unidade'),
        delivery_mode = v_delivery_mode
    where tenant_id = v_tenant_id
      and id = v_id;

    if not found then
      raise exception 'service_not_found' using errcode = '22023';
    end if;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'commercial.service.upsert',
    'service',
    v_id::text,
    jsonb_build_object('name', v_name, 'status', v_status)
  );

  return jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

create or replace function public.set_commercial_service_status(
  p_service_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_status text := coalesce(nullif(p_status, ''), 'ativo');
begin
  if v_status not in ('ativo', 'inativo', 'arquivado') then
    raise exception 'invalid_service_status' using errcode = '22023';
  end if;

  update public.services
  set status = v_status
  where tenant_id = v_tenant_id
    and id = p_service_id;

  if not found then
    raise exception 'service_not_found' using errcode = '22023';
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    auth.uid(),
    'commercial.service.status',
    'service',
    p_service_id::text,
    jsonb_build_object('status', v_status)
  );

  return jsonb_build_object('id', p_service_id, 'status', v_status);
end;
$$;

create or replace function public.clone_commercial_service(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_source public.services%rowtype;
  v_new_id uuid;
begin
  select *
  into v_source
  from public.services
  where tenant_id = v_tenant_id
    and id = p_service_id;

  if v_source.id is null then
    raise exception 'service_not_found' using errcode = '22023';
  end if;

  insert into public.services (
    tenant_id,
    name,
    category,
    description,
    status,
    base_price_cents,
    duration_minutes,
    unit,
    delivery_mode,
    metadata,
    created_by
  )
  values (
    v_tenant_id,
    left(v_source.name || ' (copia ' || to_char(clock_timestamp(), 'HH24MISS') || ')', 160),
    v_source.category,
    v_source.description,
    'inativo',
    v_source.base_price_cents,
    v_source.duration_minutes,
    v_source.unit,
    v_source.delivery_mode,
    v_source.metadata || jsonb_build_object('clonedFrom', p_service_id),
    auth.uid()
  )
  returning id into v_new_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    auth.uid(),
    'commercial.service.clone',
    'service',
    v_new_id::text,
    jsonb_build_object('sourceServiceId', p_service_id)
  );

  return jsonb_build_object('id', v_new_id, 'status', 'inativo');
end;
$$;

create or replace function public.upsert_commercial_package(p_package jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_user_id uuid := auth.uid();
  v_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_package ->> 'id', '')) then (p_package ->> 'id')::uuid
    else null
  end;
  v_name text := security.commercial_clean_text(p_package ->> 'name', 160);
  v_status text := coalesce(nullif(p_package ->> 'status', ''), 'rascunho');
  v_renewal_policy text := coalesce(nullif(p_package ->> 'renewalPolicy', ''), 'manual');
  v_price_cents integer := greatest(coalesce(nullif(p_package ->> 'priceCents', '')::numeric, 0), 0)::integer;
  v_duration_weeks integer := greatest(coalesce(nullif(p_package ->> 'durationWeeks', '')::numeric, 0), 0)::integer;
  v_link jsonb;
  v_program_id uuid;
  v_is_default boolean;
begin
  if v_name is null then
    raise exception 'package_name_required' using errcode = '22023';
  end if;
  if v_status not in ('rascunho', 'ativo', 'inativo', 'arquivado') then
    v_status := 'rascunho';
  end if;
  if v_renewal_policy not in ('manual', 'automatico', 'sem_renovacao') then
    v_renewal_policy := 'manual';
  end if;

  if v_id is null then
    insert into public.packages (
      tenant_id,
      name,
      description,
      status,
      price_cents,
      duration_weeks,
      renewal_policy,
      community_access,
      priority_chat,
      benefits,
      usage_limits,
      created_by
    )
    values (
      v_tenant_id,
      v_name,
      security.commercial_clean_text(p_package ->> 'description', 1000),
      v_status,
      v_price_cents,
      v_duration_weeks,
      v_renewal_policy,
      coalesce((p_package ->> 'communityAccess')::boolean, false),
      coalesce((p_package ->> 'priorityChat')::boolean, false),
      case when jsonb_typeof(p_package -> 'benefits') = 'array' then p_package -> 'benefits' else '[]'::jsonb end,
      case when jsonb_typeof(p_package -> 'usageLimits') = 'array' then p_package -> 'usageLimits' else '[]'::jsonb end,
      v_user_id
    )
    returning id into v_id;
  else
    update public.packages
    set name = v_name,
        description = security.commercial_clean_text(p_package ->> 'description', 1000),
        status = v_status,
        price_cents = v_price_cents,
        duration_weeks = v_duration_weeks,
        renewal_policy = v_renewal_policy,
        community_access = coalesce((p_package ->> 'communityAccess')::boolean, false),
        priority_chat = coalesce((p_package ->> 'priorityChat')::boolean, false),
        benefits = case when jsonb_typeof(p_package -> 'benefits') = 'array' then p_package -> 'benefits' else '[]'::jsonb end,
        usage_limits = case when jsonb_typeof(p_package -> 'usageLimits') = 'array' then p_package -> 'usageLimits' else '[]'::jsonb end
    where tenant_id = v_tenant_id
      and id = v_id;

    if not found then
      raise exception 'package_not_found' using errcode = '22023';
    end if;
  end if;

  delete from public.package_services
  where tenant_id = v_tenant_id
    and package_id = v_id;

  insert into public.package_services (
    tenant_id,
    package_id,
    service_id,
    quantity,
    unit,
    limit_per_period,
    position
  )
  select
    v_tenant_id,
    v_id,
    (item ->> 'serviceId')::uuid,
    greatest(coalesce(nullif(item ->> 'quantity', '')::numeric, 0), 0),
    coalesce(
      security.commercial_clean_text(item ->> 'unit', 40),
      (
        select s.unit
        from public.services s
        where s.tenant_id = v_tenant_id
          and s.id = (item ->> 'serviceId')::uuid
      ),
      'unidade'
    ),
    case
      when coalesce(item ->> 'limitPerPeriod', '') ~ '^[0-9]+$' then (item ->> 'limitPerPeriod')::integer
      else null
    end,
    row_number() over ()::integer
  from jsonb_array_elements(coalesce(p_package -> 'services', '[]'::jsonb)) as rows(item)
  where security.is_valid_uuid_text(coalesce(item ->> 'serviceId', ''))
    and exists (
      select 1
      from public.services s
      where s.tenant_id = v_tenant_id
        and s.id = (item ->> 'serviceId')::uuid
    )
    and greatest(coalesce(nullif(item ->> 'quantity', '')::numeric, 0), 0) > 0;

  delete from public.program_packages
  where tenant_id = v_tenant_id
    and package_id = v_id;

  for v_link in
    select item
    from jsonb_array_elements(coalesce(p_package -> 'programLinks', '[]'::jsonb)) as rows(item)
    where security.is_valid_uuid_text(coalesce(item ->> 'programId', ''))
  loop
    v_program_id := (v_link ->> 'programId')::uuid;
    v_is_default := coalesce((v_link ->> 'isDefault')::boolean, false);

    if exists (
      select 1 from public.programs p where p.tenant_id = v_tenant_id and p.id = v_program_id
    ) then
      if v_is_default then
        update public.program_packages
        set is_default = false
        where tenant_id = v_tenant_id
          and program_id = v_program_id;
      end if;

      insert into public.program_packages (
        tenant_id,
        program_id,
        package_id,
        status,
        is_default,
        position
      )
      values (
        v_tenant_id,
        v_program_id,
        v_id,
        'ativo',
        v_is_default,
        0
      )
      on conflict (tenant_id, program_id, package_id) do update
      set status = 'ativo',
          is_default = excluded.is_default;
    end if;
  end loop;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'commercial.package.upsert',
    'package',
    v_id::text,
    jsonb_build_object('name', v_name, 'status', v_status)
  );

  return jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

create or replace function public.set_commercial_package_status(
  p_package_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_status text := coalesce(nullif(p_status, ''), 'ativo');
begin
  if v_status not in ('rascunho', 'ativo', 'inativo', 'arquivado') then
    raise exception 'invalid_package_status' using errcode = '22023';
  end if;

  update public.packages
  set status = v_status
  where tenant_id = v_tenant_id
    and id = p_package_id;

  if not found then
    raise exception 'package_not_found' using errcode = '22023';
  end if;

  if v_status <> 'ativo' then
    update public.program_packages
    set status = 'inativo',
        is_default = false
    where tenant_id = v_tenant_id
      and package_id = p_package_id;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    auth.uid(),
    'commercial.package.status',
    'package',
    p_package_id::text,
    jsonb_build_object('status', v_status)
  );

  return jsonb_build_object('id', p_package_id, 'status', v_status);
end;
$$;

create or replace function public.clone_commercial_package(p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_source public.packages%rowtype;
  v_new_id uuid;
begin
  select *
  into v_source
  from public.packages
  where tenant_id = v_tenant_id
    and id = p_package_id;

  if v_source.id is null then
    raise exception 'package_not_found' using errcode = '22023';
  end if;

  insert into public.packages (
    tenant_id,
    name,
    description,
    status,
    price_cents,
    duration_weeks,
    renewal_policy,
    community_access,
    priority_chat,
    benefits,
    usage_limits,
    metadata,
    created_by
  )
  values (
    v_tenant_id,
    left(v_source.name || ' (copia ' || to_char(clock_timestamp(), 'HH24MISS') || ')', 160),
    v_source.description,
    'rascunho',
    v_source.price_cents,
    v_source.duration_weeks,
    v_source.renewal_policy,
    v_source.community_access,
    v_source.priority_chat,
    v_source.benefits,
    v_source.usage_limits,
    v_source.metadata || jsonb_build_object('clonedFrom', p_package_id),
    auth.uid()
  )
  returning id into v_new_id;

  insert into public.package_services (
    tenant_id,
    package_id,
    service_id,
    quantity,
    unit,
    limit_per_period,
    position,
    metadata
  )
  select
    tenant_id,
    v_new_id,
    service_id,
    quantity,
    unit,
    limit_per_period,
    position,
    metadata || jsonb_build_object('clonedFromPackageId', p_package_id)
  from public.package_services
  where tenant_id = v_tenant_id
    and package_id = p_package_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    auth.uid(),
    'commercial.package.clone',
    'package',
    v_new_id::text,
    jsonb_build_object('sourcePackageId', p_package_id)
  );

  return jsonb_build_object('id', v_new_id, 'status', 'rascunho');
end;
$$;

create or replace function public.create_upgrade_request(
  p_patient_id uuid,
  p_target_package_id uuid,
  p_reason text default null,
  p_enrollment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_enrollment public.patient_program_enrollments%rowtype;
  v_target public.packages%rowtype;
  v_request_id uuid;
begin
  if not exists (select 1 from public.patients p where p.tenant_id = v_tenant_id and p.id = p_patient_id) then
    raise exception 'patient_not_found' using errcode = '22023';
  end if;

  select *
  into v_target
  from public.packages
  where tenant_id = v_tenant_id
    and id = p_target_package_id
    and status = 'ativo';

  if v_target.id is null then
    raise exception 'target_package_not_found' using errcode = '22023';
  end if;

  select *
  into v_enrollment
  from public.patient_program_enrollments e
  where e.tenant_id = v_tenant_id
    and e.patient_id = p_patient_id
    and (p_enrollment_id is null or e.id = p_enrollment_id)
    and e.status in ('ativo', 'pausado', 'aguardando')
  order by e.start_date desc nulls last, e.created_at desc
  limit 1;

  insert into public.upgrade_requests (
    tenant_id,
    patient_id,
    enrollment_id,
    current_package_id,
    target_package_id,
    current_program_id,
    target_program_id,
    requested_by,
    requested_by_role,
    reason
  )
  values (
    v_tenant_id,
    p_patient_id,
    v_enrollment.id,
    v_enrollment.package_id,
    p_target_package_id,
    v_enrollment.program_id,
    (
      select pp.program_id
      from public.program_packages pp
      where pp.tenant_id = v_tenant_id
        and pp.package_id = p_target_package_id
        and pp.status = 'ativo'
      order by pp.is_default desc, pp.position asc
      limit 1
    ),
    auth.uid(),
    'staff',
    security.commercial_clean_text(p_reason, 1000)
  )
  returning id into v_request_id;

  insert into public.upgrade_request_events (
    tenant_id,
    upgrade_request_id,
    actor_id,
    event_type,
    status_to,
    notes
  )
  values (
    v_tenant_id,
    v_request_id,
    auth.uid(),
    'requested',
    'solicitado',
    security.commercial_clean_text(p_reason, 1000)
  );

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
    'upgrade_solicitado',
    'commercial',
    'recorded',
    'Upgrade solicitado',
    'Solicitacao comercial para ' || v_target.name || '.',
    'Equipe comercial',
    'Solicitado',
    'Ver upgrades',
    '/clinic/programs?tab=upgrades',
    now(),
    jsonb_build_object('upgradeRequestId', v_request_id, 'targetPackageId', p_target_package_id)
  );

  return jsonb_build_object('id', v_request_id, 'status', 'solicitado');
end;
$$;

create or replace function public.request_patient_upgrade(
  p_patient_id uuid default null,
  p_target_package_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_linkage_type text;
  v_enrollment public.patient_program_enrollments%rowtype;
  v_target public.packages%rowtype;
  v_request_id uuid;
begin
  select r.tenant_id, r.patient_id, r.linkage_type
  into v_tenant_id, v_patient_id, v_linkage_type
  from security.resolve_patient_portal_link(p_patient_id) r;

  if v_patient_id is null or p_target_package_id is null then
    raise exception 'invalid_upgrade_request' using errcode = '22023';
  end if;

  select *
  into v_target
  from public.packages
  where tenant_id = v_tenant_id
    and id = p_target_package_id
    and status = 'ativo';

  if v_target.id is null then
    raise exception 'target_package_not_found' using errcode = '22023';
  end if;

  select *
  into v_enrollment
  from public.patient_program_enrollments e
  where e.tenant_id = v_tenant_id
    and e.patient_id = v_patient_id
    and e.status in ('ativo', 'pausado', 'aguardando')
  order by e.start_date desc nulls last, e.created_at desc
  limit 1;

  insert into public.upgrade_requests (
    tenant_id,
    patient_id,
    enrollment_id,
    current_package_id,
    target_package_id,
    current_program_id,
    target_program_id,
    requested_by,
    requested_by_role,
    reason
  )
  values (
    v_tenant_id,
    v_patient_id,
    v_enrollment.id,
    v_enrollment.package_id,
    p_target_package_id,
    v_enrollment.program_id,
    (
      select pp.program_id
      from public.program_packages pp
      where pp.tenant_id = v_tenant_id
        and pp.package_id = p_target_package_id
        and pp.status = 'ativo'
      order by pp.is_default desc, pp.position asc
      limit 1
    ),
    auth.uid(),
    case when v_linkage_type = 'guardian' then 'guardian' else 'patient' end,
    security.commercial_clean_text(p_reason, 1000)
  )
  returning id into v_request_id;

  insert into public.upgrade_request_events (
    tenant_id,
    upgrade_request_id,
    actor_id,
    event_type,
    status_to,
    notes
  )
  values (
    v_tenant_id,
    v_request_id,
    auth.uid(),
    'requested',
    'solicitado',
    security.commercial_clean_text(p_reason, 1000)
  );

  return jsonb_build_object('id', v_request_id, 'status', 'solicitado');
end;
$$;

create or replace function public.quote_upgrade_request(
  p_request_id uuid,
  p_quote_amount_cents integer,
  p_quote_notes text default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_old_status text;
begin
  select status
  into v_old_status
  from public.upgrade_requests
  where tenant_id = v_tenant_id
    and id = p_request_id
  for update;

  if v_old_status is null then
    raise exception 'upgrade_request_not_found' using errcode = '22023';
  end if;
  if v_old_status not in ('solicitado', 'cotado') then
    raise exception 'upgrade_request_not_quotable' using errcode = '22023';
  end if;

  update public.upgrade_requests
  set status = 'cotado',
      quote_amount_cents = greatest(coalesce(p_quote_amount_cents, 0), 0),
      quote_notes = security.commercial_clean_text(p_quote_notes, 1000),
      quote_due_date = p_due_date
  where tenant_id = v_tenant_id
    and id = p_request_id;

  insert into public.upgrade_request_events (
    tenant_id,
    upgrade_request_id,
    actor_id,
    event_type,
    status_from,
    status_to,
    amount_cents,
    notes
  )
  values (
    v_tenant_id,
    p_request_id,
    auth.uid(),
    'quoted',
    v_old_status,
    'cotado',
    greatest(coalesce(p_quote_amount_cents, 0), 0),
    security.commercial_clean_text(p_quote_notes, 1000)
  );

  return jsonb_build_object('id', p_request_id, 'status', 'cotado');
end;
$$;

create or replace function public.decide_upgrade_request(
  p_request_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_request public.upgrade_requests%rowtype;
  v_next_status text;
  v_event_type text;
begin
  select *
  into v_request
  from public.upgrade_requests
  where tenant_id = v_tenant_id
    and id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'upgrade_request_not_found' using errcode = '22023';
  end if;

  if p_decision = 'approve' then
    v_next_status := 'aprovado';
    v_event_type := 'approved';
  elsif p_decision = 'reject' then
    v_next_status := 'rejeitado';
    v_event_type := 'rejected';
  elsif p_decision = 'cancel' then
    v_next_status := 'cancelado';
    v_event_type := 'cancelled';
  else
    raise exception 'invalid_upgrade_decision' using errcode = '22023';
  end if;

  update public.upgrade_requests
  set status = v_next_status,
      decision_by = auth.uid(),
      decided_at = now(),
      metadata = metadata || jsonb_build_object('decision_notes', security.commercial_clean_text(p_notes, 1000))
  where tenant_id = v_tenant_id
    and id = p_request_id;

  if v_next_status = 'aprovado' and v_request.enrollment_id is not null then
    update public.patient_program_enrollments
    set package_id = v_request.target_package_id,
        metadata = metadata || jsonb_build_object(
          'last_upgrade_request_id', p_request_id,
          'last_upgrade_approved_at', now()
        )
    where tenant_id = v_tenant_id
      and id = v_request.enrollment_id;

    insert into public.upgrade_request_events (
      tenant_id,
      upgrade_request_id,
      actor_id,
      event_type,
      status_from,
      status_to,
      metadata
    )
    values (
      v_tenant_id,
      p_request_id,
      auth.uid(),
      'package_applied',
      v_request.status,
      v_next_status,
      jsonb_build_object('targetPackageId', v_request.target_package_id)
    );
  end if;

  insert into public.upgrade_request_events (
    tenant_id,
    upgrade_request_id,
    actor_id,
    event_type,
    status_from,
    status_to,
    notes
  )
  values (
    v_tenant_id,
    p_request_id,
    auth.uid(),
    v_event_type,
    v_request.status,
    v_next_status,
    security.commercial_clean_text(p_notes, 1000)
  );

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
    v_request.patient_id,
    case when v_next_status = 'aprovado' then 'upgrade_aprovado' else 'upgrade_decidido' end,
    'commercial',
    'recorded',
    case when v_next_status = 'aprovado' then 'Upgrade aprovado' else 'Upgrade atualizado' end,
    case
      when v_next_status = 'aprovado' then 'Beneficios comerciais atualizados.'
      when v_next_status = 'rejeitado' then 'Solicitacao de upgrade rejeitada.'
      else 'Solicitacao de upgrade cancelada.'
    end,
    'Equipe comercial',
    v_next_status,
    'Ver upgrades',
    '/clinic/programs?tab=upgrades',
    now(),
    jsonb_build_object('upgradeRequestId', p_request_id, 'targetPackageId', v_request.target_package_id)
  );

  return jsonb_build_object('id', p_request_id, 'status', v_next_status);
end;
$$;

create or replace function public.generate_upgrade_invoice(
  p_request_id uuid,
  p_due_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('packages.write', true);
  v_request public.upgrade_requests%rowtype;
  v_target public.packages%rowtype;
  v_invoice_id uuid;
begin
  if not security.has_permission(v_tenant_id, 'financial.write', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
  into v_request
  from public.upgrade_requests
  where tenant_id = v_tenant_id
    and id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'upgrade_request_not_found' using errcode = '22023';
  end if;
  if v_request.status not in ('cotado', 'aprovado', 'cobranca_pendente') then
    raise exception 'upgrade_request_not_billable' using errcode = '22023';
  end if;
  if coalesce(v_request.quote_amount_cents, 0) <= 0 then
    raise exception 'upgrade_quote_required' using errcode = '22023';
  end if;

  select *
  into v_target
  from public.packages
  where tenant_id = v_tenant_id
    and id = v_request.target_package_id;

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
    v_request.patient_id,
    'pending',
    v_request.quote_amount_cents,
    coalesce(p_due_date, current_date),
    'Upgrade para ' || coalesce(v_target.name, 'pacote comercial'),
    jsonb_build_object(
      'source', 'commercial_upgrade',
      'provider', 'local',
      'upgrade_request_id', p_request_id,
      'target_package_id', v_request.target_package_id,
      'created_by_contract', 'generate_upgrade_invoice'
    )
  )
  returning id into v_invoice_id;

  update public.upgrade_requests
  set status = 'cobranca_pendente',
      invoice_id = v_invoice_id,
      quote_due_date = coalesce(p_due_date, quote_due_date, current_date)
  where tenant_id = v_tenant_id
    and id = p_request_id;

  insert into public.upgrade_request_events (
    tenant_id,
    upgrade_request_id,
    actor_id,
    event_type,
    status_from,
    status_to,
    amount_cents,
    metadata
  )
  values (
    v_tenant_id,
    p_request_id,
    auth.uid(),
    'invoice_created',
    v_request.status,
    'cobranca_pendente',
    v_request.quote_amount_cents,
    jsonb_build_object('invoiceId', v_invoice_id)
  );

  return jsonb_build_object('id', p_request_id, 'status', 'cobranca_pendente', 'invoiceId', v_invoice_id);
end;
$$;

create or replace function public.apply_paid_upgrade_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_request public.upgrade_requests%rowtype;
begin
  if coalesce(new.metadata ->> 'source', '') <> 'commercial_upgrade' then
    return new;
  end if;

  if lower(coalesce(new.status, '')) not in ('paid', 'pago', 'received', 'confirmed', 'recebido', 'confirmado') then
    return new;
  end if;

  select *
  into v_request
  from public.upgrade_requests
  where tenant_id = new.tenant_id
    and invoice_id = new.id
  for update;

  if v_request.id is null then
    return new;
  end if;

  if v_request.enrollment_id is not null then
    update public.patient_program_enrollments
    set package_id = v_request.target_package_id,
        metadata = metadata || jsonb_build_object(
          'last_upgrade_request_id', v_request.id,
          'last_upgrade_paid_at', now()
        )
    where tenant_id = new.tenant_id
      and id = v_request.enrollment_id;
  end if;

  update public.upgrade_requests
  set status = 'concluido',
      decided_at = coalesce(decided_at, now()),
      metadata = metadata || jsonb_build_object('paid_invoice_id', new.id)
  where tenant_id = new.tenant_id
    and id = v_request.id
    and status <> 'concluido';

  insert into public.upgrade_request_events (
    tenant_id,
    upgrade_request_id,
    event_type,
    status_from,
    status_to,
    amount_cents,
    metadata
  )
  values (
    new.tenant_id,
    v_request.id,
    'invoice_paid',
    v_request.status,
    'concluido',
    new.amount_cents,
    jsonb_build_object('invoiceId', new.id)
  );

  return new;
end;
$$;

drop trigger if exists apply_paid_upgrade_invoice_after_update on public.patient_invoices;
create trigger apply_paid_upgrade_invoice_after_update
after update of status
on public.patient_invoices
for each row
when (old.status is distinct from new.status)
execute function public.apply_paid_upgrade_invoice();

create or replace function public.get_patient_commercial_data(p_patient_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid;
  v_enrollment public.patient_program_enrollments%rowtype;
  v_active_package_id uuid;
  v_active_package jsonb := null;
  v_upgrades jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
begin
  select r.tenant_id, r.patient_id
  into v_tenant_id, v_patient_id
  from security.resolve_patient_portal_link(p_patient_id) r;

  if v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
  into v_enrollment
  from public.patient_program_enrollments e
  where e.tenant_id = v_tenant_id
    and e.patient_id = v_patient_id
    and e.status in ('ativo', 'pausado', 'aguardando')
  order by e.start_date desc nulls last, e.created_at desc
  limit 1;

  v_active_package_id := v_enrollment.package_id;
  if v_active_package_id is null and v_enrollment.program_id is not null then
    select pp.package_id
    into v_active_package_id
    from public.program_packages pp
    join public.packages pk
      on pk.tenant_id = pp.tenant_id
     and pk.id = pp.package_id
    where pp.tenant_id = v_tenant_id
      and pp.program_id = v_enrollment.program_id
      and pp.status = 'ativo'
      and pk.status = 'ativo'
    order by pp.is_default desc, pp.position asc, pk.price_cents asc
    limit 1;
  end if;

  if v_active_package_id is not null then
    select jsonb_build_object(
      'id', pk.id,
      'name', pk.name,
      'description', coalesce(pk.description, ''),
      'priceCents', pk.price_cents,
      'durationWeeks', pk.duration_weeks,
      'renewalPolicy', pk.renewal_policy,
      'communityAccess', pk.community_access,
      'priorityChat', pk.priority_chat,
      'benefits', pk.benefits,
      'usageLimits', pk.usage_limits,
      'services', coalesce(services.items, '[]'::jsonb),
      'programName', program.name,
      'currentWeek', coalesce(v_enrollment.current_week, 0),
      'status', coalesce(v_enrollment.status, 'sem_matricula')
    )
    into v_active_package
    from public.packages pk
    left join public.programs program
      on program.tenant_id = v_tenant_id
     and program.id = v_enrollment.program_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'serviceId', s.id,
          'serviceName', s.name,
          'quantity', ps.quantity,
          'unit', ps.unit,
          'limitPerPeriod', ps.limit_per_period
        )
        order by ps.position asc, s.name asc
      ) as items
      from public.package_services ps
      join public.services s
        on s.tenant_id = ps.tenant_id
       and s.id = ps.service_id
      where ps.tenant_id = pk.tenant_id
        and ps.package_id = pk.id
        and s.status = 'ativo'
    ) services on true
    where pk.tenant_id = v_tenant_id
      and pk.id = v_active_package_id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pk.id,
        'name', pk.name,
        'description', coalesce(pk.description, ''),
        'priceCents', pk.price_cents,
        'durationWeeks', pk.duration_weeks,
        'renewalPolicy', pk.renewal_policy,
        'communityAccess', pk.community_access,
        'priorityChat', pk.priority_chat,
        'benefits', pk.benefits,
        'usageLimits', pk.usage_limits,
        'services', coalesce(services.items, '[]'::jsonb)
      )
      order by pk.price_cents asc, pk.name asc
    ),
    '[]'::jsonb
  )
  into v_upgrades
  from public.packages pk
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'serviceName', s.name,
        'quantity', ps.quantity,
        'unit', ps.unit
      )
      order by ps.position asc, s.name asc
    ) as items
    from public.package_services ps
    join public.services s
      on s.tenant_id = ps.tenant_id
     and s.id = ps.service_id
    where ps.tenant_id = pk.tenant_id
      and ps.package_id = pk.id
      and s.status = 'ativo'
  ) services on true
  where pk.tenant_id = v_tenant_id
    and pk.status = 'ativo'
    and (v_active_package_id is null or pk.id <> v_active_package_id)
    and (
      v_active_package_id is null
      or pk.price_cents >= coalesce((v_active_package ->> 'priceCents')::integer, 0)
      or pk.priority_chat = true
      or pk.community_access = true
    )
  limit 6;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ur.id,
        'targetPackageId', ur.target_package_id,
        'targetPackageName', target_package.name,
        'status', ur.status,
        'reason', coalesce(ur.reason, ''),
        'quoteAmountCents', ur.quote_amount_cents,
        'quoteCurrency', ur.quote_currency,
        'quoteNotes', coalesce(ur.quote_notes, ''),
        'quoteDueDate', ur.quote_due_date,
        'invoiceStatus', invoice.status,
        'createdAt', ur.created_at,
        'updatedAt', ur.updated_at
      )
      order by ur.created_at desc
    ),
    '[]'::jsonb
  )
  into v_requests
  from public.upgrade_requests ur
  join public.packages target_package
    on target_package.tenant_id = ur.tenant_id
   and target_package.id = ur.target_package_id
  left join public.patient_invoices invoice
    on invoice.tenant_id = ur.tenant_id
   and invoice.id = ur.invoice_id
  where ur.tenant_id = v_tenant_id
    and ur.patient_id = v_patient_id;

  return jsonb_build_object(
    'selectedPatientId', v_patient_id,
    'activeEnrollmentId', v_enrollment.id,
    'activePackage', v_active_package,
    'upgradeOptions', v_upgrades,
    'upgradeRequests', v_requests,
    'lastCheckedAt', now()
  );
end;
$$;

revoke all on function public.get_clinic_commercial_catalog() from public;
revoke all on function public.upsert_commercial_service(jsonb) from public;
revoke all on function public.set_commercial_service_status(uuid, text) from public;
revoke all on function public.clone_commercial_service(uuid) from public;
revoke all on function public.upsert_commercial_package(jsonb) from public;
revoke all on function public.set_commercial_package_status(uuid, text) from public;
revoke all on function public.clone_commercial_package(uuid) from public;
revoke all on function public.create_upgrade_request(uuid, uuid, text, uuid) from public;
revoke all on function public.request_patient_upgrade(uuid, uuid, text) from public;
revoke all on function public.quote_upgrade_request(uuid, integer, text, date) from public;
revoke all on function public.decide_upgrade_request(uuid, text, text) from public;
revoke all on function public.generate_upgrade_invoice(uuid, date) from public;
revoke all on function public.get_patient_commercial_data(uuid) from public;

grant execute on function public.get_clinic_commercial_catalog() to authenticated, service_role;
grant execute on function public.upsert_commercial_service(jsonb) to authenticated, service_role;
grant execute on function public.set_commercial_service_status(uuid, text) to authenticated, service_role;
grant execute on function public.clone_commercial_service(uuid) to authenticated, service_role;
grant execute on function public.upsert_commercial_package(jsonb) to authenticated, service_role;
grant execute on function public.set_commercial_package_status(uuid, text) to authenticated, service_role;
grant execute on function public.clone_commercial_package(uuid) to authenticated, service_role;
grant execute on function public.create_upgrade_request(uuid, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.request_patient_upgrade(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.quote_upgrade_request(uuid, integer, text, date) to authenticated, service_role;
grant execute on function public.decide_upgrade_request(uuid, text, text) to authenticated, service_role;
grant execute on function public.generate_upgrade_invoice(uuid, date) to authenticated, service_role;
grant execute on function public.get_patient_commercial_data(uuid) to authenticated, service_role;

comment on function public.get_clinic_commercial_catalog() is
  'M12 commercial staff payload with services, packages, program links and upgrade requests. Provider IDs are not returned.';
comment on function public.get_patient_commercial_data(uuid) is
  'M12 patient-scoped commercial context for active benefits, readable plan comparison and upgrade requests.';
comment on function public.generate_upgrade_invoice(uuid, date) is
  'Creates a local pending patient_invoice for an approved/quoted upgrade without calling Asaas.';
