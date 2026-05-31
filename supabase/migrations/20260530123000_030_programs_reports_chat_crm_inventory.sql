-- SlimHiper clean foundation: future operational modules.
-- Scope: schema/RLS contracts only; no UI feature enablement.

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  program_type text not null check (program_type in ('emagrecimento', 'hipertrofia', 'recomposicao', 'saude_metabolica', 'longevidade')),
  objective text,
  duration_weeks integer not null default 0 check (duration_weeks >= 0),
  status text not null default 'rascunho' check (status in ('ativo', 'arquivado', 'rascunho')),
  payment_model text not null default 'parcelado' check (payment_model in ('parcelado', 'avista', 'assinatura', 'hibrido')),
  payment_description text,
  color text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table public.program_phases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  program_id uuid not null,
  position integer not null default 0,
  name text not null,
  duration_weeks integer not null default 0 check (duration_weeks >= 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint program_phases_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
    on delete cascade
);

create table public.program_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  program_id uuid not null,
  label text not null,
  quantity numeric(10,2) not null default 0,
  unit text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint program_services_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
    on delete cascade
);

create table public.program_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  program_id uuid not null,
  key text not null,
  label text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, program_id, key),
  constraint program_entitlements_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
    on delete cascade
);

create table public.program_required_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  program_id uuid not null,
  label text not null,
  required boolean not null default true,
  template_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint program_required_documents_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
    on delete cascade
);

create table public.program_checkin_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  program_id uuid not null,
  label text not null,
  frequency text,
  channel text check (channel is null or channel in ('app', 'whatsapp', 'email', 'presencial')),
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint program_checkin_templates_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
    on delete cascade
);

create table public.patient_program_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  program_id uuid not null,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'concluido', 'cancelado', 'aguardando')),
  start_date date,
  end_date date,
  current_week integer not null default 0 check (current_week >= 0),
  total_consultations integer not null default 0 check (total_consultations >= 0),
  used_consultations integer not null default 0 check (used_consultations >= 0),
  total_nutrition_sessions integer not null default 0 check (total_nutrition_sessions >= 0),
  used_nutrition_sessions integer not null default 0 check (used_nutrition_sessions >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_program_enrollments_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint patient_program_enrollments_program_same_tenant
    foreign key (tenant_id, program_id)
    references public.programs(tenant_id, id)
);

create table public.report_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  icon_key text,
  export_enabled boolean not null default false,
  definition jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, key)
);

create table public.report_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_definition_id uuid,
  requested_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  filters jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tenant_id, id),
  constraint report_runs_definition_same_tenant
    foreign key (tenant_id, report_definition_id)
    references public.report_definitions(tenant_id, id)
);

create table public.patient_chat_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  assigned_to uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id),
  constraint patient_chat_threads_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.patient_chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  thread_id uuid not null,
  patient_id uuid not null,
  sender_user_id uuid references public.profiles(id) on delete set null,
  sender_label text,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_chat_messages_thread_same_tenant
    foreign key (tenant_id, thread_id)
    references public.patient_chat_threads(tenant_id, id)
    on delete cascade,
  constraint patient_chat_messages_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  patient_id uuid,
  title text not null,
  body text,
  category text,
  status text not null default 'unread' check (status in ('unread', 'read', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint notifications_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'converted', 'lost', 'archived')),
  stage text,
  source text,
  full_name text not null,
  email text,
  phone text,
  owner_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint leads_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
);

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null,
  event_type text not null,
  title text,
  description text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint lead_events_lead_same_tenant
    foreign key (tenant_id, lead_id)
    references public.leads(tenant_id, id)
    on delete cascade
);

create table public.lead_patient_conversions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null,
  patient_id uuid not null,
  converted_by uuid references public.profiles(id) on delete set null,
  converted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id, id),
  unique (tenant_id, lead_id),
  constraint lead_patient_conversions_lead_same_tenant
    foreign key (tenant_id, lead_id)
    references public.leads(tenant_id, id)
    on delete cascade,
  constraint lead_patient_conversions_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text,
  name text not null,
  category text,
  unit text not null default 'unidade',
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, sku)
);

create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  item_id uuid not null,
  batch_code text,
  expires_at date,
  quantity_on_hand numeric(12,3) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint inventory_batches_item_same_tenant
    foreign key (tenant_id, item_id)
    references public.inventory_items(tenant_id, id)
    on delete cascade
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  item_id uuid not null,
  batch_id uuid,
  movement_type text not null check (movement_type in ('in', 'out', 'adjustment', 'transfer')),
  quantity numeric(12,3) not null,
  unit_cost_cents integer,
  related_patient_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint inventory_movements_item_same_tenant
    foreign key (tenant_id, item_id)
    references public.inventory_items(tenant_id, id),
  constraint inventory_movements_batch_same_tenant
    foreign key (tenant_id, batch_id)
    references public.inventory_batches(tenant_id, id),
  constraint inventory_movements_patient_same_tenant
    foreign key (tenant_id, related_patient_id)
    references public.patients(tenant_id, id)
);

create index idx_programs_tenant_status on public.programs(tenant_id, status);
create index idx_patient_program_enrollments_patient on public.patient_program_enrollments(tenant_id, patient_id, status);
create index idx_report_runs_tenant_created_at on public.report_runs(tenant_id, created_at desc);
create index idx_patient_chat_messages_thread_created_at on public.patient_chat_messages(tenant_id, thread_id, created_at desc);
create index idx_notifications_user_status on public.notifications(user_id, status, created_at desc);
create index idx_leads_tenant_status on public.leads(tenant_id, status);
create index idx_lead_events_lead_event_at on public.lead_events(tenant_id, lead_id, event_at desc);
create index idx_inventory_items_tenant_status on public.inventory_items(tenant_id, status);
create index idx_inventory_batches_item on public.inventory_batches(tenant_id, item_id);
create index idx_inventory_movements_item_created_at on public.inventory_movements(tenant_id, item_id, created_at desc);

select security.touch_updated_at('public.programs');
select security.touch_updated_at('public.program_phases');
select security.touch_updated_at('public.program_services');
select security.touch_updated_at('public.program_entitlements');
select security.touch_updated_at('public.program_required_documents');
select security.touch_updated_at('public.program_checkin_templates');
select security.touch_updated_at('public.patient_program_enrollments');
select security.touch_updated_at('public.report_definitions');
select security.touch_updated_at('public.patient_chat_threads');
select security.touch_updated_at('public.leads');
select security.touch_updated_at('public.inventory_items');
select security.touch_updated_at('public.inventory_batches');

alter table public.programs enable row level security;
alter table public.program_phases enable row level security;
alter table public.program_services enable row level security;
alter table public.program_entitlements enable row level security;
alter table public.program_required_documents enable row level security;
alter table public.program_checkin_templates enable row level security;
alter table public.patient_program_enrollments enable row level security;
alter table public.report_definitions enable row level security;
alter table public.report_runs enable row level security;
alter table public.patient_chat_threads enable row level security;
alter table public.patient_chat_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.lead_patient_conversions enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_movements enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'programs',
    'program_phases',
    'program_services',
    'program_entitlements',
    'program_required_documents',
    'program_checkin_templates',
    'patient_program_enrollments'
  ]
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.has_permission(tenant_id, ''packages.read''));', table_name || '_select_packages_read', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_permission(tenant_id, ''packages.write'')) with check (public.has_permission(tenant_id, ''packages.write''));', table_name || '_write_packages_write', table_name);
  end loop;

  foreach table_name in array array['report_definitions', 'report_runs']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.has_permission(tenant_id, ''reports.read''));', table_name || '_select_reports_read', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_permission(tenant_id, ''reports.write''));', table_name || '_write_reports_write', table_name);
  end loop;

  foreach table_name in array array['patient_chat_threads', 'patient_chat_messages']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.has_permission(tenant_id, ''chat.read''));', table_name || '_select_chat_read', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_permission(tenant_id, ''chat.write'')) with check (public.has_permission(tenant_id, ''chat.write''));', table_name || '_write_chat_write', table_name);
  end loop;

  foreach table_name in array array['leads', 'lead_events', 'lead_patient_conversions']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.has_permission(tenant_id, ''crm.read''));', table_name || '_select_crm_read', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_permission(tenant_id, ''crm.write'')) with check (public.has_permission(tenant_id, ''crm.write''));', table_name || '_write_crm_write', table_name);
  end loop;

  foreach table_name in array array['inventory_items', 'inventory_batches', 'inventory_movements']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.has_permission(tenant_id, ''inventory.read''));', table_name || '_select_inventory_read', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_permission(tenant_id, ''inventory.write'')) with check (public.has_permission(tenant_id, ''inventory.write''));', table_name || '_write_inventory_write', table_name);
  end loop;
end $$;

create policy notifications_select_scope
on public.notifications for select
to authenticated
using (
  user_id = auth.uid()
  or (tenant_id is not null and public.has_permission(tenant_id, 'notifications.read'))
);

create policy notifications_write_by_permission
on public.notifications for all
to authenticated
using (tenant_id is not null and public.has_permission(tenant_id, 'notifications.write'))
with check (tenant_id is not null and public.has_permission(tenant_id, 'notifications.write'));
