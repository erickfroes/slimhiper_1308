-- Paciente 360 clinical foundation (no UI wiring, no billing, no storage, no D4Sign)

-- Helper function for clinical RBAC.
-- Important: this intentionally excludes platform admins; only active tenant members with
-- explicit permission grants may access clinical records.
create or replace function public.has_clinical_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r
      on r.tenant_id = tm.tenant_id
     and r.name = tm.role_code
    join public.role_permissions rp
      on rp.tenant_id = r.tenant_id
     and rp.role_id = r.id
    join public.permissions p
      on p.tenant_id = rp.tenant_id
     and p.id = rp.permission_id
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.code = p_permission
  );
$$;

-- 1) patients
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'active',
  preferred_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) patient_pii
create table if not exists public.patient_pii (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  cpf_masked text,
  birth_date date,
  sex_gender text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) patient_contacts
create table if not exists public.patient_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  relationship text,
  name text not null,
  phone text,
  email text,
  is_primary boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) patient_alerts
create table if not exists public.patient_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status text not null default 'active',
  alert_type text not null,
  title text not null,
  description text,
  severity text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5) patient_tasks
create table if not exists public.patient_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status text not null default 'open',
  title text not null,
  details text,
  due_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6) patient_timeline_events
create table if not exists public.patient_timeline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  event_type text not null,
  status text not null default 'recorded',
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7) appointments
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status text not null default 'scheduled',
  scheduled_at timestamptz not null,
  duration_minutes integer,
  practitioner_id uuid references public.profiles(id) on delete set null,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8) queue_events
create table if not exists public.queue_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  event_type text not null,
  status text not null default 'open',
  event_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 9) encounters
create table if not exists public.encounters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  status text not null default 'open',
  encounter_type text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 10) soap_notes
create table if not exists public.soap_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  status text not null default 'draft',
  subjective text,
  objective text,
  assessment text,
  plan text,
  authored_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 11) measurements
create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  status text not null default 'recorded',
  measured_at timestamptz not null default now(),
  height_cm numeric(5,2),
  weight_kg numeric(6,2),
  bmi numeric(5,2),
  body_fat_pct numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 12) bioimpedance_results
create table if not exists public.bioimpedance_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  status text not null default 'final',
  measured_at timestamptz not null default now(),
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 13) lab_orders
create table if not exists public.lab_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  status text not null default 'requested',
  ordered_at timestamptz not null default now(),
  ordered_by uuid references public.profiles(id) on delete set null,
  order_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 14) lab_results
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  lab_order_id uuid references public.lab_orders(id) on delete set null,
  status text not null default 'received',
  result_at timestamptz,
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 15) prescriptions_placeholder
create table if not exists public.prescriptions_placeholder (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  status text not null default 'draft',
  prescription_text text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes: required operational filters (tenant_id, patient_id, status, event_type, scheduled_at, created_at)
create index if not exists idx_patients_tenant_id on public.patients(tenant_id);
create index if not exists idx_patients_status on public.patients(status);
create index if not exists idx_patients_created_at on public.patients(created_at);

create index if not exists idx_patient_pii_tenant_id on public.patient_pii(tenant_id);
create index if not exists idx_patient_pii_created_at on public.patient_pii(created_at);

create index if not exists idx_patient_contacts_tenant_id on public.patient_contacts(tenant_id);
create index if not exists idx_patient_contacts_patient_id on public.patient_contacts(patient_id);
create index if not exists idx_patient_contacts_status on public.patient_contacts(status);
create index if not exists idx_patient_contacts_created_at on public.patient_contacts(created_at);

create index if not exists idx_patient_alerts_tenant_id on public.patient_alerts(tenant_id);
create index if not exists idx_patient_alerts_patient_id on public.patient_alerts(patient_id);
create index if not exists idx_patient_alerts_status on public.patient_alerts(status);
create index if not exists idx_patient_alerts_created_at on public.patient_alerts(created_at);

create index if not exists idx_patient_tasks_tenant_id on public.patient_tasks(tenant_id);
create index if not exists idx_patient_tasks_patient_id on public.patient_tasks(patient_id);
create index if not exists idx_patient_tasks_status on public.patient_tasks(status);
create index if not exists idx_patient_tasks_created_at on public.patient_tasks(created_at);

create index if not exists idx_patient_timeline_events_tenant_id on public.patient_timeline_events(tenant_id);
create index if not exists idx_patient_timeline_events_patient_id on public.patient_timeline_events(patient_id);
create index if not exists idx_patient_timeline_events_status on public.patient_timeline_events(status);
create index if not exists idx_patient_timeline_events_event_type on public.patient_timeline_events(event_type);
create index if not exists idx_patient_timeline_events_created_at on public.patient_timeline_events(created_at);

create index if not exists idx_appointments_tenant_id on public.appointments(tenant_id);
create index if not exists idx_appointments_patient_id on public.appointments(patient_id);
create index if not exists idx_appointments_status on public.appointments(status);
create index if not exists idx_appointments_scheduled_at on public.appointments(scheduled_at);
create index if not exists idx_appointments_created_at on public.appointments(created_at);

create index if not exists idx_queue_events_tenant_id on public.queue_events(tenant_id);
create index if not exists idx_queue_events_patient_id on public.queue_events(patient_id);
create index if not exists idx_queue_events_status on public.queue_events(status);
create index if not exists idx_queue_events_event_type on public.queue_events(event_type);
create index if not exists idx_queue_events_created_at on public.queue_events(created_at);

create index if not exists idx_encounters_tenant_id on public.encounters(tenant_id);
create index if not exists idx_encounters_patient_id on public.encounters(patient_id);
create index if not exists idx_encounters_status on public.encounters(status);
create index if not exists idx_encounters_created_at on public.encounters(created_at);

create index if not exists idx_soap_notes_tenant_id on public.soap_notes(tenant_id);
create index if not exists idx_soap_notes_patient_id on public.soap_notes(patient_id);
create index if not exists idx_soap_notes_status on public.soap_notes(status);
create index if not exists idx_soap_notes_created_at on public.soap_notes(created_at);

create index if not exists idx_measurements_tenant_id on public.measurements(tenant_id);
create index if not exists idx_measurements_patient_id on public.measurements(patient_id);
create index if not exists idx_measurements_status on public.measurements(status);
create index if not exists idx_measurements_created_at on public.measurements(created_at);

create index if not exists idx_bioimpedance_results_tenant_id on public.bioimpedance_results(tenant_id);
create index if not exists idx_bioimpedance_results_patient_id on public.bioimpedance_results(patient_id);
create index if not exists idx_bioimpedance_results_status on public.bioimpedance_results(status);
create index if not exists idx_bioimpedance_results_created_at on public.bioimpedance_results(created_at);

create index if not exists idx_lab_orders_tenant_id on public.lab_orders(tenant_id);
create index if not exists idx_lab_orders_patient_id on public.lab_orders(patient_id);
create index if not exists idx_lab_orders_status on public.lab_orders(status);
create index if not exists idx_lab_orders_created_at on public.lab_orders(created_at);

create index if not exists idx_lab_results_tenant_id on public.lab_results(tenant_id);
create index if not exists idx_lab_results_patient_id on public.lab_results(patient_id);
create index if not exists idx_lab_results_status on public.lab_results(status);
create index if not exists idx_lab_results_created_at on public.lab_results(created_at);

create index if not exists idx_prescriptions_placeholder_tenant_id on public.prescriptions_placeholder(tenant_id);
create index if not exists idx_prescriptions_placeholder_patient_id on public.prescriptions_placeholder(patient_id);
create index if not exists idx_prescriptions_placeholder_status on public.prescriptions_placeholder(status);
create index if not exists idx_prescriptions_placeholder_created_at on public.prescriptions_placeholder(created_at);

-- Enable RLS on all clinical tables.
alter table public.patients enable row level security;
alter table public.patient_pii enable row level security;
alter table public.patient_contacts enable row level security;
alter table public.patient_alerts enable row level security;
alter table public.patient_tasks enable row level security;
alter table public.patient_timeline_events enable row level security;
alter table public.appointments enable row level security;
alter table public.queue_events enable row level security;
alter table public.encounters enable row level security;
alter table public.soap_notes enable row level security;
alter table public.measurements enable row level security;
alter table public.bioimpedance_results enable row level security;
alter table public.lab_orders enable row level security;
alter table public.lab_results enable row level security;
alter table public.prescriptions_placeholder enable row level security;

-- Patients module policy: tenant members with patients.read can read only records in their tenant.
create policy "patients_select_by_tenant_permission"
on public.patients
for select
using (
  public.has_clinical_permission(tenant_id, 'patients.read')
);

-- Patients module policy: tenant members with patients.write can insert/update/delete only records in their tenant.
create policy "patients_write_by_tenant_permission"
on public.patients
for all
using (
  public.has_clinical_permission(tenant_id, 'patients.write')
)
with check (
  public.has_clinical_permission(tenant_id, 'patients.write')
);

-- Generic clinical policy template (patients.read / patients.write) for patient-linked tables.
-- This keeps access tenant-scoped and prevents platform_support/admin default access.

do $$
declare
  t text;
begin
  foreach t in array array[
    'patient_pii','patient_contacts','patient_alerts','patient_tasks','patient_timeline_events',
    'appointments','queue_events','encounters','measurements','bioimpedance_results','lab_orders','lab_results'
  ]
  loop
    execute format('create policy %I on public.%I for select using (public.has_clinical_permission(tenant_id, ''patients.read''));', t || '_select_by_patients_read', t);
    execute format('create policy %I on public.%I for all using (public.has_clinical_permission(tenant_id, ''patients.write'')) with check (public.has_clinical_permission(tenant_id, ''patients.write''));', t || '_write_by_patients_write', t);
  end loop;
end $$;

-- SOAP policy: requires soap.read for select.
create policy "soap_notes_select_by_soap_read"
on public.soap_notes
for select
using (
  public.has_clinical_permission(tenant_id, 'soap.read')
);

-- SOAP policy: requires soap.write for insert/update/delete.
create policy "soap_notes_write_by_soap_write"
on public.soap_notes
for all
using (
  public.has_clinical_permission(tenant_id, 'soap.write')
)
with check (
  public.has_clinical_permission(tenant_id, 'soap.write')
);

-- Prescriptions placeholder policy: requires prescriptions.read for select.
create policy "prescriptions_placeholder_select_by_prescriptions_read"
on public.prescriptions_placeholder
for select
using (
  public.has_clinical_permission(tenant_id, 'prescriptions.read')
);

-- Prescriptions placeholder policy: requires prescriptions.write for insert/update/delete.
create policy "prescriptions_placeholder_write_by_prescriptions_write"
on public.prescriptions_placeholder
for all
using (
  public.has_clinical_permission(tenant_id, 'prescriptions.write')
)
with check (
  public.has_clinical_permission(tenant_id, 'prescriptions.write')
);

-- Patient portal policy placeholder:
-- Future migration should define patient-account linkage (e.g. patient_accounts) and add
-- self-service RLS policies for patient users/guardians constrained to their own records.

-- updated_at triggers
create or replace function public.attach_updated_at_trigger(p_table regclass)
returns void
language plpgsql
as $$
declare
  short_name text;
begin
  short_name := split_part(p_table::text, '.', 2);
  execute format('drop trigger if exists %I on %s;', 'trg_' || short_name || '_set_updated_at', p_table);
  execute format('create trigger %I before update on %s for each row execute function public.set_updated_at();', 'trg_' || short_name || '_set_updated_at', p_table);
end;
$$;

select public.attach_updated_at_trigger('public.patients');
select public.attach_updated_at_trigger('public.patient_pii');
select public.attach_updated_at_trigger('public.patient_contacts');
select public.attach_updated_at_trigger('public.patient_alerts');
select public.attach_updated_at_trigger('public.patient_tasks');
select public.attach_updated_at_trigger('public.patient_timeline_events');
select public.attach_updated_at_trigger('public.appointments');
select public.attach_updated_at_trigger('public.queue_events');
select public.attach_updated_at_trigger('public.encounters');
select public.attach_updated_at_trigger('public.soap_notes');
select public.attach_updated_at_trigger('public.measurements');
select public.attach_updated_at_trigger('public.bioimpedance_results');
select public.attach_updated_at_trigger('public.lab_orders');
select public.attach_updated_at_trigger('public.lab_results');
select public.attach_updated_at_trigger('public.prescriptions_placeholder');

-- helper cleanup
 drop function if exists public.attach_updated_at_trigger(regclass);
