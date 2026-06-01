-- Phase 9.1: CRM/inventory foundation contracts, RBAC hardening and audit logs.
-- This migration intentionally keeps browser writes behind audited RPCs.

create or replace function public.has_unit_access(p_tenant_id uuid, p_unit_id uuid default null)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.is_active = true
      and (p_unit_id is null or tm.unit_id is null or tm.unit_id = p_unit_id)
  ) or security.is_platform_admin() or security.is_platform_support();
$$;

create or replace function public.normalize_contact_email(p_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(p_email, ''))), '');
$$;

create or replace function public.normalize_contact_phone(p_phone text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
$$;

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  label text not null,
  position integer not null default 0,
  is_terminal boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid,
  stage_id uuid,
  owner_user_id uuid references public.profiles(id) on delete set null,
  converted_patient_id uuid,
  status text not null default 'open' check (status in ('open', 'converted', 'lost', 'archived')),
  source text,
  campaign text,
  full_name text not null,
  email text,
  phone text,
  normalized_email text generated always as (public.normalize_contact_email(email)) stored,
  normalized_phone text generated always as (public.normalize_contact_phone(phone)) stored,
  contact_preference text check (contact_preference is null or contact_preference in ('phone', 'email', 'whatsapp', 'sms', 'none')),
  contact_consent boolean not null default false,
  consent_purpose text,
  opt_out_at timestamptz,
  retention_expires_at timestamptz,
  next_follow_up_at timestamptz,
  lost_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint crm_leads_unit_same_tenant foreign key (tenant_id, unit_id) references public.tenant_units(tenant_id, id),
  constraint crm_leads_stage_same_tenant foreign key (tenant_id, stage_id) references public.crm_pipeline_stages(tenant_id, id),
  constraint crm_leads_patient_same_tenant foreign key (tenant_id, converted_patient_id) references public.patients(tenant_id, id),
  constraint crm_leads_contact_present check (normalized_email is not null or normalized_phone is not null)
);

create table if not exists public.crm_lead_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null,
  activity_type text not null default 'note' check (activity_type in ('note', 'call', 'email', 'whatsapp', 'meeting', 'status_change', 'consent', 'task', 'conversion')),
  title text not null,
  description text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint crm_lead_activities_lead_same_tenant foreign key (tenant_id, lead_id) references public.crm_leads(tenant_id, id) on delete cascade
);

create table if not exists public.crm_lead_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled', 'overdue')),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint crm_lead_tasks_lead_same_tenant foreign key (tenant_id, lead_id) references public.crm_leads(tenant_id, id) on delete cascade
);

create table if not exists public.crm_lead_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null,
  channel text not null check (channel in ('phone', 'email', 'whatsapp', 'sms', 'in_person', 'other')),
  purpose text not null,
  status text not null default 'granted' check (status in ('granted', 'revoked', 'expired')),
  legal_basis text,
  captured_by uuid references public.profiles(id) on delete set null,
  captured_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint crm_lead_consents_lead_same_tenant foreign key (tenant_id, lead_id) references public.crm_leads(tenant_id, id) on delete cascade
);

create table if not exists public.crm_lead_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, storage_bucket, storage_path),
  constraint crm_lead_attachments_lead_same_tenant foreign key (tenant_id, lead_id) references public.crm_leads(tenant_id, id) on delete cascade
);

create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid,
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code),
  constraint inventory_locations_unit_same_tenant foreign key (tenant_id, unit_id) references public.tenant_units(tenant_id, id)
);

alter table public.inventory_items add column if not exists category_id uuid;
alter table public.inventory_items add column if not exists unit_id uuid;
alter table public.inventory_items add column if not exists minimum_quantity numeric(12,3) not null default 0;
alter table public.inventory_items add column if not exists cost_visibility text not null default 'restricted' check (cost_visibility in ('restricted', 'visible_to_inventory'));
alter table public.inventory_items add column if not exists default_unit_cost_cents integer check (default_unit_cost_cents is null or default_unit_cost_cents >= 0);
alter table public.inventory_items add constraint inventory_items_category_same_tenant foreign key (tenant_id, category_id) references public.inventory_categories(tenant_id, id);
alter table public.inventory_items add constraint inventory_items_unit_same_tenant foreign key (tenant_id, unit_id) references public.tenant_units(tenant_id, id);

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  item_id uuid not null,
  location_id uuid,
  lot_code text,
  expires_at date,
  received_at date,
  status text not null default 'active' check (status in ('active', 'quarantined', 'expired', 'depleted', 'archived')),
  unit_cost_cents integer check (unit_cost_cents is null or unit_cost_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint inventory_lots_item_same_tenant foreign key (tenant_id, item_id) references public.inventory_items(tenant_id, id) on delete cascade,
  constraint inventory_lots_location_same_tenant foreign key (tenant_id, location_id) references public.inventory_locations(tenant_id, id)
);

alter table public.inventory_movements add column if not exists location_id uuid;
alter table public.inventory_movements add column if not exists lot_id uuid;
alter table public.inventory_movements add column if not exists direction text not null default 'in' check (direction in ('in', 'out'));
alter table public.inventory_movements add column if not exists reason text not null default 'manual_adjustment' check (reason in ('receipt', 'consumption', 'loss', 'adjustment', 'transfer_in', 'transfer_out', 'reservation', 'release'));
alter table public.inventory_movements add column if not exists reference_type text;
alter table public.inventory_movements add column if not exists reference_id uuid;
alter table public.inventory_movements add column if not exists occurred_at timestamptz not null default now();
alter table public.inventory_movements add constraint inventory_movements_location_same_tenant foreign key (tenant_id, location_id) references public.inventory_locations(tenant_id, id);
alter table public.inventory_movements add constraint inventory_movements_lot_same_tenant foreign key (tenant_id, lot_id) references public.inventory_lots(tenant_id, id);

create table if not exists public.inventory_stock_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  item_id uuid not null,
  location_id uuid,
  lot_id uuid,
  quantity_on_hand numeric(12,3) not null default 0,
  quantity_reserved numeric(12,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, item_id, location_id, lot_id),
  constraint inventory_stock_snapshots_item_same_tenant foreign key (tenant_id, item_id) references public.inventory_items(tenant_id, id) on delete cascade,
  constraint inventory_stock_snapshots_location_same_tenant foreign key (tenant_id, location_id) references public.inventory_locations(tenant_id, id),
  constraint inventory_stock_snapshots_lot_same_tenant foreign key (tenant_id, lot_id) references public.inventory_lots(tenant_id, id),
  constraint inventory_stock_snapshots_non_negative check (quantity_on_hand >= 0 and quantity_reserved >= 0 and quantity_reserved <= quantity_on_hand)
);

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  item_id uuid not null,
  location_id uuid,
  lot_id uuid,
  patient_id uuid,
  quantity numeric(12,3) not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'fulfilled', 'cancelled', 'expired')),
  reserved_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint inventory_reservations_item_same_tenant foreign key (tenant_id, item_id) references public.inventory_items(tenant_id, id) on delete cascade,
  constraint inventory_reservations_location_same_tenant foreign key (tenant_id, location_id) references public.inventory_locations(tenant_id, id),
  constraint inventory_reservations_lot_same_tenant foreign key (tenant_id, lot_id) references public.inventory_lots(tenant_id, id),
  constraint inventory_reservations_patient_same_tenant foreign key (tenant_id, patient_id) references public.patients(tenant_id, id)
);

create index if not exists idx_crm_leads_tenant_status_stage on public.crm_leads(tenant_id, status, stage_id);
create index if not exists idx_crm_leads_tenant_owner on public.crm_leads(tenant_id, owner_user_id, next_follow_up_at);
create index if not exists idx_crm_leads_tenant_source on public.crm_leads(tenant_id, source, campaign);
create unique index if not exists idx_crm_leads_unique_email_active on public.crm_leads(tenant_id, normalized_email) where normalized_email is not null and status in ('open', 'converted');
create unique index if not exists idx_crm_leads_unique_phone_active on public.crm_leads(tenant_id, normalized_phone) where normalized_phone is not null and status in ('open', 'converted');
create index if not exists idx_crm_lead_activities_lead_at on public.crm_lead_activities(tenant_id, lead_id, occurred_at desc);
create index if not exists idx_crm_lead_tasks_due on public.crm_lead_tasks(tenant_id, status, due_at);
create index if not exists idx_inventory_items_category_status on public.inventory_items(tenant_id, category_id, status);
create index if not exists idx_inventory_locations_unit_status on public.inventory_locations(tenant_id, unit_id, status);
create index if not exists idx_inventory_lots_item_expiry on public.inventory_lots(tenant_id, item_id, expires_at);
create index if not exists idx_inventory_movements_location_occurred on public.inventory_movements(tenant_id, location_id, occurred_at desc);
create index if not exists idx_inventory_stock_alerts on public.inventory_stock_snapshots(tenant_id, item_id, location_id, quantity_on_hand);

select security.touch_updated_at('public.crm_pipeline_stages');
select security.touch_updated_at('public.crm_leads');
select security.touch_updated_at('public.crm_lead_tasks');
select security.touch_updated_at('public.inventory_categories');
select security.touch_updated_at('public.inventory_locations');
select security.touch_updated_at('public.inventory_lots');
select security.touch_updated_at('public.inventory_reservations');

alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_lead_activities enable row level security;
alter table public.crm_lead_tasks enable row level security;
alter table public.crm_lead_consents enable row level security;
alter table public.crm_lead_attachments enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_stock_snapshots enable row level security;
alter table public.inventory_reservations enable row level security;

-- Tighten legacy inventory policies from the broad seed migration before adding unit/cost-aware contracts.
drop policy if exists inventory_items_write_inventory_write on public.inventory_items;
drop policy if exists inventory_batches_write_inventory_write on public.inventory_batches;
drop policy if exists inventory_movements_write_inventory_write on public.inventory_movements;

create policy crm_pipeline_stages_select_crm_read
on public.crm_pipeline_stages for select to authenticated
using (public.has_permission(tenant_id, 'crm.read'));

create policy crm_leads_select_crm_read_unit
on public.crm_leads for select to authenticated
using (public.has_permission(tenant_id, 'crm.read') and public.has_unit_access(tenant_id, unit_id));

create policy crm_lead_activities_select_crm_read_unit
on public.crm_lead_activities for select to authenticated
using (
  public.has_permission(tenant_id, 'crm.read')
  and exists (
    select 1 from public.crm_leads l
    where l.tenant_id = crm_lead_activities.tenant_id
      and l.id = crm_lead_activities.lead_id
      and public.has_unit_access(l.tenant_id, l.unit_id)
  )
);

create policy crm_lead_tasks_select_crm_read_unit
on public.crm_lead_tasks for select to authenticated
using (
  public.has_permission(tenant_id, 'crm.read')
  and exists (
    select 1 from public.crm_leads l
    where l.tenant_id = crm_lead_tasks.tenant_id
      and l.id = crm_lead_tasks.lead_id
      and public.has_unit_access(l.tenant_id, l.unit_id)
  )
);

create policy crm_lead_consents_select_crm_read_unit
on public.crm_lead_consents for select to authenticated
using (
  public.has_permission(tenant_id, 'crm.read')
  and exists (
    select 1 from public.crm_leads l
    where l.tenant_id = crm_lead_consents.tenant_id
      and l.id = crm_lead_consents.lead_id
      and public.has_unit_access(l.tenant_id, l.unit_id)
  )
);

create policy crm_lead_attachments_select_crm_read_unit
on public.crm_lead_attachments for select to authenticated
using (
  public.has_permission(tenant_id, 'crm.read')
  and exists (
    select 1 from public.crm_leads l
    where l.tenant_id = crm_lead_attachments.tenant_id
      and l.id = crm_lead_attachments.lead_id
      and public.has_unit_access(l.tenant_id, l.unit_id)
  )
);

create policy inventory_categories_select_inventory_read
on public.inventory_categories for select to authenticated
using (public.has_permission(tenant_id, 'inventory.read'));

create policy inventory_locations_select_inventory_read_unit
on public.inventory_locations for select to authenticated
using (public.has_permission(tenant_id, 'inventory.read') and public.has_unit_access(tenant_id, unit_id));

create policy inventory_lots_select_inventory_read
on public.inventory_lots for select to authenticated
using (public.has_permission(tenant_id, 'inventory.read'));

create policy inventory_stock_snapshots_select_inventory_read
on public.inventory_stock_snapshots for select to authenticated
using (public.has_permission(tenant_id, 'inventory.read'));

create policy inventory_reservations_select_inventory_read
on public.inventory_reservations for select to authenticated
using (public.has_permission(tenant_id, 'inventory.read'));

create policy crm_pipeline_stages_write_crm_write
on public.crm_pipeline_stages for all to authenticated
using (public.has_permission(tenant_id, 'crm.write'))
with check (public.has_permission(tenant_id, 'crm.write'));

create policy crm_leads_write_crm_write_unit
on public.crm_leads for all to authenticated
using (public.has_permission(tenant_id, 'crm.write') and public.has_unit_access(tenant_id, unit_id))
with check (public.has_permission(tenant_id, 'crm.write') and public.has_unit_access(tenant_id, unit_id));

create policy crm_lead_activities_write_crm_write
on public.crm_lead_activities for all to authenticated
using (public.has_permission(tenant_id, 'crm.write'))
with check (public.has_permission(tenant_id, 'crm.write'));

create policy crm_lead_tasks_write_crm_write
on public.crm_lead_tasks for all to authenticated
using (public.has_permission(tenant_id, 'crm.write'))
with check (public.has_permission(tenant_id, 'crm.write'));

create policy crm_lead_consents_write_crm_write
on public.crm_lead_consents for all to authenticated
using (public.has_permission(tenant_id, 'crm.write'))
with check (public.has_permission(tenant_id, 'crm.write'));

create policy crm_lead_attachments_write_crm_write
on public.crm_lead_attachments for all to authenticated
using (public.has_permission(tenant_id, 'crm.write'))
with check (public.has_permission(tenant_id, 'crm.write'));

create policy inventory_categories_write_inventory_write
on public.inventory_categories for all to authenticated
using (public.has_permission(tenant_id, 'inventory.write'))
with check (public.has_permission(tenant_id, 'inventory.write'));

create policy inventory_locations_write_inventory_write
on public.inventory_locations for all to authenticated
using (public.has_permission(tenant_id, 'inventory.write') and public.has_unit_access(tenant_id, unit_id))
with check (public.has_permission(tenant_id, 'inventory.write') and public.has_unit_access(tenant_id, unit_id));

create policy inventory_lots_write_inventory_write
on public.inventory_lots for all to authenticated
using (public.has_permission(tenant_id, 'inventory.write'))
with check (public.has_permission(tenant_id, 'inventory.write'));

create policy inventory_reservations_write_inventory_write
on public.inventory_reservations for all to authenticated
using (public.has_permission(tenant_id, 'inventory.write'))
with check (public.has_permission(tenant_id, 'inventory.write'));

create policy inventory_movements_insert_adjust_or_transfer
on public.inventory_movements for insert to authenticated
with check (
  public.has_permission(tenant_id, case when reason in ('transfer_in', 'transfer_out') then 'inventory.transfer' else 'inventory.adjust' end)
);

create or replace function public.seed_crm_inventory_rbac_contracts()
returns void
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  insert into public.permissions (tenant_id, code, description)
  select t.id, p.code, p.description
  from public.tenants t
  cross join (values
    ('crm.convert', 'Convert CRM leads into patients'),
    ('inventory.adjust', 'Create audited inventory adjustments and stock movements'),
    ('inventory.transfer', 'Transfer inventory between units or locations'),
    ('inventory.cost.read', 'Read restricted inventory cost data')
  ) as p(code, description)
  on conflict (tenant_id, code) do update set description = excluded.description, updated_at = now();

  insert into public.role_permissions (tenant_id, role_id, permission_id)
  select r.tenant_id, r.id, p.id
  from public.roles r
  join public.permissions p on p.tenant_id = r.tenant_id
  where (r.name in ('tenant_owner', 'clinic_admin') and p.code in ('crm.convert', 'inventory.adjust', 'inventory.transfer', 'inventory.cost.read'))
     or (r.name = 'receptionist' and p.code = 'crm.convert')
  on conflict (tenant_id, role_id, permission_id) do nothing;
end;
$$;

select public.seed_crm_inventory_rbac_contracts();

create or replace function public.seed_new_tenant_crm_inventory_rbac()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  perform public.seed_crm_inventory_rbac_contracts();
  return new;
end;
$$;

drop trigger if exists trg_seed_new_tenant_crm_inventory_rbac on public.tenants;
create trigger trg_seed_new_tenant_crm_inventory_rbac
after insert on public.tenants
for each row execute function public.seed_new_tenant_crm_inventory_rbac();

create or replace function public.ensure_default_crm_pipeline(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  if p_tenant_id is null then
    raise exception 'tenant_required' using errcode = '22023';
  end if;

  insert into public.crm_pipeline_stages (tenant_id, code, label, position, is_terminal)
  values
    (p_tenant_id, 'novo', 'Novo', 10, false),
    (p_tenant_id, 'contato', 'Contato', 20, false),
    (p_tenant_id, 'qualificado', 'Qualificado', 30, false),
    (p_tenant_id, 'convertido', 'Convertido', 90, true),
    (p_tenant_id, 'perdido', 'Perdido', 99, true)
  on conflict (tenant_id, code) do update
  set label = excluded.label,
      position = excluded.position,
      is_terminal = excluded.is_terminal,
      status = 'active',
      updated_at = now();
end;
$$;

create or replace function public.list_crm_leads(p_status text default null, p_stage_id uuid default null, p_search text default null, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_rows jsonb;
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'crm.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'status', l.status,
    'stageId', l.stage_id,
    'stageLabel', s.label,
    'unitId', l.unit_id,
    'source', l.source,
    'campaign', l.campaign,
    'fullName', l.full_name,
    'email', l.email,
    'phone', l.phone,
    'ownerUserId', l.owner_user_id,
    'contactConsent', l.contact_consent,
    'nextFollowUpAt', l.next_follow_up_at,
    'createdAt', l.created_at,
    'updatedAt', l.updated_at
  ) order by l.updated_at desc), '[]'::jsonb) into v_rows
  from public.crm_leads l
  left join public.crm_pipeline_stages s on s.tenant_id = l.tenant_id and s.id = l.stage_id
  where l.tenant_id = v_tenant_id
    and public.has_unit_access(l.tenant_id, l.unit_id)
    and (p_status is null or l.status = p_status)
    and (p_stage_id is null or l.stage_id = p_stage_id)
    and (
      nullif(trim(coalesce(p_search, '')), '') is null
      or l.full_name ilike '%' || trim(p_search) || '%'
      or l.normalized_email = public.normalize_contact_email(p_search)
      or l.normalized_phone = public.normalize_contact_phone(p_search)
    )
  limit v_limit;

  return jsonb_build_object('leads', v_rows, 'limit', v_limit);
end;
$$;

create or replace function public.create_crm_lead(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_stage_id uuid;
  v_lead public.crm_leads%rowtype;
  v_unit_id uuid := nullif(p_payload->>'unitId', '')::uuid;
  v_full_name text := nullif(trim(p_payload->>'fullName'), '');
  v_email text := nullif(trim(p_payload->>'email'), '');
  v_phone text := nullif(trim(p_payload->>'phone'), '');
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'crm.write', false) or not public.has_unit_access(v_tenant_id, v_unit_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_full_name is null or (public.normalize_contact_email(v_email) is null and public.normalize_contact_phone(v_phone) is null) then
    raise exception 'invalid_lead_payload' using errcode = '22023';
  end if;

  perform public.ensure_default_crm_pipeline(v_tenant_id);
  select id into v_stage_id from public.crm_pipeline_stages where tenant_id = v_tenant_id and code = coalesce(nullif(p_payload->>'stageCode', ''), 'novo');

  insert into public.crm_leads (tenant_id, unit_id, stage_id, owner_user_id, source, campaign, full_name, email, phone, contact_preference, contact_consent, consent_purpose, retention_expires_at, next_follow_up_at, metadata)
  values (
    v_tenant_id,
    v_unit_id,
    v_stage_id,
    coalesce(nullif(p_payload->>'ownerUserId', '')::uuid, auth.uid()),
    nullif(p_payload->>'source', ''),
    nullif(p_payload->>'campaign', ''),
    v_full_name,
    v_email,
    v_phone,
    nullif(p_payload->>'contactPreference', ''),
    case when nullif(p_payload->>'contactConsent', '') is null then false else (p_payload->>'contactConsent')::boolean end,
    nullif(p_payload->>'consentPurpose', ''),
    nullif(p_payload->>'retentionExpiresAt', '')::timestamptz,
    nullif(p_payload->>'nextFollowUpAt', '')::timestamptz,
    coalesce(p_payload->'metadata', '{}'::jsonb)
  ) returning * into v_lead;

  insert into public.crm_lead_activities (tenant_id, lead_id, activity_type, title, actor_user_id, metadata)
  values (v_tenant_id, v_lead.id, 'note', 'Lead criado', auth.uid(), jsonb_build_object('source', v_lead.source, 'campaign', v_lead.campaign));

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'crm_lead.created', 'crm_lead', v_lead.id::text, jsonb_build_object('unitId', v_lead.unit_id, 'source', v_lead.source, 'stageId', v_lead.stage_id));

  return jsonb_build_object('id', v_lead.id, 'status', v_lead.status, 'stageId', v_lead.stage_id, 'createdAt', v_lead.created_at);
end;
$$;

create or replace function public.update_crm_lead(p_lead_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_lead public.crm_leads%rowtype;
begin
  select * into v_lead from public.crm_leads where id = p_lead_id;
  if v_lead.id is null or not security.has_permission(v_lead.tenant_id, 'crm.write', false) or not public.has_unit_access(v_lead.tenant_id, v_lead.unit_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.crm_leads
  set full_name = coalesce(nullif(trim(p_payload->>'fullName'), ''), full_name),
      email = coalesce(nullif(trim(p_payload->>'email'), ''), email),
      phone = coalesce(nullif(trim(p_payload->>'phone'), ''), phone),
      source = coalesce(nullif(p_payload->>'source', ''), source),
      campaign = coalesce(nullif(p_payload->>'campaign', ''), campaign),
      owner_user_id = coalesce(nullif(p_payload->>'ownerUserId', '')::uuid, owner_user_id),
      next_follow_up_at = coalesce(nullif(p_payload->>'nextFollowUpAt', '')::timestamptz, next_follow_up_at),
      metadata = metadata || coalesce(p_payload->'metadata', '{}'::jsonb),
      updated_at = now()
  where id = p_lead_id
  returning * into v_lead;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_lead.tenant_id, auth.uid(), 'crm_lead.updated', 'crm_lead', v_lead.id::text, jsonb_build_object('updatedFields', coalesce((select jsonb_agg(key) from jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) as key), '[]'::jsonb)));

  return jsonb_build_object('id', v_lead.id, 'status', v_lead.status, 'updatedAt', v_lead.updated_at);
end;
$$;

create or replace function public.move_crm_lead_stage(p_lead_id uuid, p_stage_id uuid, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_old_stage uuid;
begin
  select * into v_lead from public.crm_leads where id = p_lead_id;
  if v_lead.id is null or not security.has_permission(v_lead.tenant_id, 'crm.write', false) or not public.has_unit_access(v_lead.tenant_id, v_lead.unit_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crm_pipeline_stages where tenant_id = v_lead.tenant_id and id = p_stage_id and status = 'active') then
    raise exception 'invalid_stage' using errcode = '22023';
  end if;

  v_old_stage := v_lead.stage_id;
  update public.crm_leads
  set stage_id = p_stage_id,
      status = coalesce(nullif(p_status, ''), status),
      updated_at = now()
  where id = p_lead_id
  returning * into v_lead;

  insert into public.crm_lead_activities (tenant_id, lead_id, activity_type, title, actor_user_id, metadata)
  values (v_lead.tenant_id, v_lead.id, 'status_change', 'Etapa alterada', auth.uid(), jsonb_build_object('fromStageId', v_old_stage, 'toStageId', p_stage_id, 'status', v_lead.status));

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_lead.tenant_id, auth.uid(), 'crm_lead.stage_changed', 'crm_lead', v_lead.id::text, jsonb_build_object('fromStageId', v_old_stage, 'toStageId', p_stage_id, 'status', v_lead.status));

  return jsonb_build_object('id', v_lead.id, 'stageId', v_lead.stage_id, 'status', v_lead.status, 'updatedAt', v_lead.updated_at);
end;
$$;

create or replace function public.record_crm_lead_activity(p_lead_id uuid, p_activity_type text, p_title text, p_description text default null, p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_activity_id uuid;
begin
  select * into v_lead from public.crm_leads where id = p_lead_id;
  if v_lead.id is null or not security.has_permission(v_lead.tenant_id, 'crm.write', false) or not public.has_unit_access(v_lead.tenant_id, v_lead.unit_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.crm_lead_activities (tenant_id, lead_id, activity_type, title, description, actor_user_id, metadata)
  values (v_lead.tenant_id, v_lead.id, coalesce(nullif(p_activity_type, ''), 'note'), left(coalesce(nullif(p_title, ''), 'Atividade registrada'), 160), nullif(p_description, ''), auth.uid(), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_activity_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_lead.tenant_id, auth.uid(), 'crm_lead.activity_recorded', 'crm_lead', v_lead.id::text, jsonb_build_object('activityId', v_activity_id, 'activityType', p_activity_type));

  return jsonb_build_object('id', v_activity_id, 'leadId', v_lead.id);
end;
$$;

create or replace function public.list_inventory_catalog(p_include_cost boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_can_cost boolean;
  v_items jsonb;
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_can_cost := p_include_cost and security.has_permission(v_tenant_id, 'inventory.cost.read', false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'sku', i.sku,
    'name', i.name,
    'categoryId', i.category_id,
    'categoryName', c.name,
    'unit', i.unit,
    'status', i.status,
    'minimumQuantity', i.minimum_quantity,
    'defaultUnitCostCents', case when v_can_cost then i.default_unit_cost_cents else null end,
    'quantityOnHand', coalesce((select sum(s.quantity_on_hand) from public.inventory_stock_snapshots s where s.tenant_id = i.tenant_id and s.item_id = i.id), 0),
    'updatedAt', i.updated_at
  ) order by i.name), '[]'::jsonb) into v_items
  from public.inventory_items i
  left join public.inventory_categories c on c.tenant_id = i.tenant_id and c.id = i.category_id
  where i.tenant_id = v_tenant_id;

  return jsonb_build_object('items', v_items, 'costIncluded', v_can_cost);
end;
$$;

create or replace function public.list_inventory_lots(p_item_id uuid default null, p_location_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_lots jsonb;
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;
  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'itemId', l.item_id,
    'locationId', l.location_id,
    'lotCode', l.lot_code,
    'expiresAt', l.expires_at,
    'status', l.status,
    'quantityOnHand', coalesce(s.quantity_on_hand, 0),
    'quantityReserved', coalesce(s.quantity_reserved, 0)
  ) order by l.expires_at nulls last, l.created_at desc), '[]'::jsonb) into v_lots
  from public.inventory_lots l
  left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.item_id = l.item_id and s.lot_id = l.id and (s.location_id is not distinct from l.location_id)
  where l.tenant_id = v_tenant_id
    and (p_item_id is null or l.item_id = p_item_id)
    and (p_location_id is null or l.location_id = p_location_id);

  return jsonb_build_object('lots', v_lots);
end;
$$;

create or replace function public.create_inventory_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_item public.inventory_items%rowtype;
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;
  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.inventory_items (tenant_id, sku, name, category_id, unit, status, minimum_quantity, default_unit_cost_cents, metadata)
  values (v_tenant_id, nullif(p_payload->>'sku', ''), nullif(trim(p_payload->>'name'), ''), nullif(p_payload->>'categoryId', '')::uuid, coalesce(nullif(p_payload->>'unit', ''), 'unidade'), 'active', coalesce((p_payload->>'minimumQuantity')::numeric, 0), case when security.has_permission(v_tenant_id, 'inventory.cost.read', false) then nullif(p_payload->>'defaultUnitCostCents', '')::integer else null end, coalesce(p_payload->'metadata', '{}'::jsonb))
  returning * into v_item;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'inventory_item.created', 'inventory_item', v_item.id::text, jsonb_build_object('sku', v_item.sku, 'categoryId', v_item.category_id));

  return jsonb_build_object('id', v_item.id, 'name', v_item.name, 'createdAt', v_item.created_at);
end;
$$;

create or replace function public.create_inventory_movement(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_item_id uuid := nullif(p_payload->>'itemId', '')::uuid;
  v_location_id uuid := nullif(p_payload->>'locationId', '')::uuid;
  v_lot_id uuid := nullif(p_payload->>'lotId', '')::uuid;
  v_direction text := coalesce(nullif(p_payload->>'direction', ''), 'in');
  v_reason text := coalesce(nullif(p_payload->>'reason', ''), 'adjustment');
  v_quantity numeric := coalesce((p_payload->>'quantity')::numeric, 0);
  v_current numeric;
  v_delta numeric;
  v_movement_id uuid;
  v_required_permission text;
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;

  v_required_permission := case when v_reason in ('transfer_in', 'transfer_out') then 'inventory.transfer' else 'inventory.adjust' end;
  if v_tenant_id is null or not security.has_permission(v_tenant_id, v_required_permission, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_item_id is null or v_quantity <= 0 or v_direction not in ('in', 'out') then
    raise exception 'invalid_inventory_movement' using errcode = '22023';
  end if;
  if not exists (select 1 from public.inventory_items where tenant_id = v_tenant_id and id = v_item_id and status = 'active') then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  v_delta := case when v_direction = 'in' then v_quantity else -v_quantity end;

  insert into public.inventory_stock_snapshots (tenant_id, item_id, location_id, lot_id, quantity_on_hand, quantity_reserved)
  values (v_tenant_id, v_item_id, v_location_id, v_lot_id, greatest(v_delta, 0), 0)
  on conflict (tenant_id, item_id, location_id, lot_id) do update
  set quantity_on_hand = public.inventory_stock_snapshots.quantity_on_hand + v_delta,
      updated_at = now()
  returning quantity_on_hand into v_current;

  if v_current < 0 then
    raise exception 'negative_stock_blocked' using errcode = '23514';
  end if;

  insert into public.inventory_movements (tenant_id, item_id, lot_id, location_id, movement_type, direction, reason, quantity, unit_cost_cents, related_patient_id, reference_type, reference_id, created_by, metadata, occurred_at)
  values (v_tenant_id, v_item_id, v_lot_id, v_location_id, case when v_reason like 'transfer%' then 'transfer' when v_reason = 'adjustment' then 'adjustment' when v_direction = 'in' then 'in' else 'out' end, v_direction, v_reason, v_quantity, case when security.has_permission(v_tenant_id, 'inventory.cost.read', false) then nullif(p_payload->>'unitCostCents', '')::integer else null end, nullif(p_payload->>'patientId', '')::uuid, nullif(p_payload->>'referenceType', ''), nullif(p_payload->>'referenceId', '')::uuid, auth.uid(), coalesce(p_payload->'metadata', '{}'::jsonb), coalesce(nullif(p_payload->>'occurredAt', '')::timestamptz, now()))
  returning id into v_movement_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'inventory_movement.created', 'inventory_movement', v_movement_id::text, jsonb_build_object('itemId', v_item_id, 'locationId', v_location_id, 'lotId', v_lot_id, 'direction', v_direction, 'reason', v_reason, 'quantity', v_quantity, 'quantityOnHand', v_current));

  return jsonb_build_object('id', v_movement_id, 'itemId', v_item_id, 'quantityOnHand', v_current);
end;
$$;

create or replace function public.adjust_inventory_stock(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  return public.create_inventory_movement(p_payload || jsonb_build_object('reason', coalesce(nullif(p_payload->>'reason', ''), 'adjustment')));
end;
$$;

create or replace function public.list_inventory_alerts(p_days_to_expiry integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_alerts jsonb;
  v_days integer := least(greatest(coalesce(p_days_to_expiry, 30), 0), 365);
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;
  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(alert order by alert->>'severity' desc, alert->>'itemName'), '[]'::jsonb) into v_alerts
  from (
    select jsonb_build_object('type', 'minimum_stock', 'severity', 'high', 'itemId', i.id, 'itemName', i.name, 'quantityOnHand', coalesce(sum(s.quantity_on_hand), 0), 'minimumQuantity', i.minimum_quantity) as alert
    from public.inventory_items i
    left join public.inventory_stock_snapshots s on s.tenant_id = i.tenant_id and s.item_id = i.id
    where i.tenant_id = v_tenant_id and i.status = 'active'
    group by i.id, i.name, i.minimum_quantity
    having coalesce(sum(s.quantity_on_hand), 0) <= i.minimum_quantity
    union all
    select jsonb_build_object('type', 'lot_expiry', 'severity', case when l.expires_at < current_date then 'critical' else 'medium' end, 'itemId', l.item_id, 'lotId', l.id, 'lotCode', l.lot_code, 'expiresAt', l.expires_at)
    from public.inventory_lots l
    where l.tenant_id = v_tenant_id and l.status = 'active' and l.expires_at is not null and l.expires_at <= current_date + (v_days || ' days')::interval
  ) alerts;

  return jsonb_build_object('alerts', v_alerts, 'daysToExpiry', v_days);
end;
$$;

revoke all on function public.list_crm_leads(text, uuid, text, integer) from public;
revoke all on function public.create_crm_lead(jsonb) from public;
revoke all on function public.update_crm_lead(uuid, jsonb) from public;
revoke all on function public.move_crm_lead_stage(uuid, uuid, text) from public;
revoke all on function public.record_crm_lead_activity(uuid, text, text, text, jsonb) from public;
revoke all on function public.list_inventory_catalog(boolean) from public;
revoke all on function public.list_inventory_lots(uuid, uuid) from public;
revoke all on function public.create_inventory_item(jsonb) from public;
revoke all on function public.create_inventory_movement(jsonb) from public;
revoke all on function public.adjust_inventory_stock(jsonb) from public;
revoke all on function public.list_inventory_alerts(integer) from public;

grant execute on function public.list_crm_leads(text, uuid, text, integer) to authenticated, service_role;
grant execute on function public.create_crm_lead(jsonb) to authenticated, service_role;
grant execute on function public.update_crm_lead(uuid, jsonb) to authenticated, service_role;
grant execute on function public.move_crm_lead_stage(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.record_crm_lead_activity(uuid, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.list_inventory_catalog(boolean) to authenticated, service_role;
grant execute on function public.list_inventory_lots(uuid, uuid) to authenticated, service_role;
grant execute on function public.create_inventory_item(jsonb) to authenticated, service_role;
grant execute on function public.create_inventory_movement(jsonb) to authenticated, service_role;
grant execute on function public.adjust_inventory_stock(jsonb) to authenticated, service_role;
grant execute on function public.list_inventory_alerts(integer) to authenticated, service_role;

revoke all on table public.crm_pipeline_stages, public.crm_leads, public.crm_lead_activities, public.crm_lead_tasks, public.crm_lead_consents, public.crm_lead_attachments from anon, authenticated;
revoke all on table public.inventory_categories, public.inventory_locations, public.inventory_lots, public.inventory_stock_snapshots, public.inventory_reservations from anon, authenticated;
grant select, insert, update, delete on public.crm_pipeline_stages, public.crm_leads, public.crm_lead_activities, public.crm_lead_tasks, public.crm_lead_consents, public.crm_lead_attachments to service_role;
grant select, insert, update, delete on public.inventory_categories, public.inventory_locations, public.inventory_lots, public.inventory_stock_snapshots, public.inventory_reservations to service_role;

grant select on public.crm_pipeline_stages, public.crm_leads, public.crm_lead_activities, public.crm_lead_tasks, public.crm_lead_consents, public.crm_lead_attachments to authenticated;
grant select on public.inventory_categories, public.inventory_locations, public.inventory_lots, public.inventory_stock_snapshots, public.inventory_reservations to authenticated;

comment on function public.create_crm_lead(jsonb) is 'Creates an audited CRM lead with tenant/unit/RBAC validation and LGPD contact fields.';
comment on function public.create_inventory_movement(jsonb) is 'Creates an audited ledger inventory movement, updates stock snapshot transactionally and blocks negative stock.';
