-- SlimHiper clean foundation: clinical records and Patient 360.

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive', 'paused', 'completed', 'cancelled')),
  preferred_name text,
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.patient_pii (
  patient_id uuid primary key,
  tenant_id uuid not null,
  full_name text not null,
  email text,
  phone text,
  cpf_masked text,
  birth_date date,
  sex_gender text,
  address jsonb not null default '{}'::jsonb,
  emergency_contact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, patient_id),
  constraint patient_pii_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.patient_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  relationship text,
  name text not null,
  phone text,
  email text,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_contacts_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.patient_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'revoked')),
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id, user_id),
  constraint patient_accounts_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.guardian_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  guardian_user_id uuid not null references public.profiles(id) on delete cascade,
  relationship text,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id, guardian_user_id),
  constraint guardian_links_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.patient_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  status text not null default 'active' check (status in ('active', 'resolved', 'dismissed')),
  alert_type text not null,
  title text not null,
  description text,
  severity text check (severity is null or severity in ('critical', 'high', 'medium', 'low', 'critico', 'alto', 'medio', 'baixo')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id, title),
  constraint patient_alerts_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.patient_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  title text not null,
  details text,
  due_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id, title),
  constraint patient_tasks_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.patient_timeline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  event_type text not null,
  category text check (category is null or category in ('clinical', 'financial', 'documents', 'agenda', 'communication', 'patient_app', 'commercial')),
  status text not null default 'recorded',
  title text,
  description text,
  actor_name text,
  status_label text,
  action_label text,
  details_href text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, patient_id, event_type, event_at),
  constraint patient_timeline_events_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  type text not null default 'consulta_medica',
  status text not null default 'agendado'
    check (status in ('agendado', 'chegou', 'triagem', 'medidas', 'bioimpedancia', 'aguardando_medico', 'em_consulta', 'checkout', 'concluido', 'falta', 'cancelado')),
  scheduled_at timestamptz not null,
  arrived_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  practitioner_id uuid references public.profiles(id) on delete set null,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint appointments_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.queue_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  appointment_id uuid,
  event_type text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  event_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint queue_events_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint queue_events_appointment_same_tenant
    foreign key (tenant_id, appointment_id)
    references public.appointments(tenant_id, id)
);

create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  appointment_id uuid,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed', 'cancelled')),
  encounter_type text,
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  finalized_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint encounters_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint encounters_appointment_same_tenant
    foreign key (tenant_id, appointment_id)
    references public.appointments(tenant_id, id)
);

create table public.soap_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  encounter_id uuid,
  status text not null default 'draft' check (status in ('draft', 'final', 'amended', 'cancelled')),
  subjective text,
  objective text,
  assessment text,
  plan text,
  authored_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint soap_notes_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint soap_notes_encounter_same_tenant
    foreign key (tenant_id, encounter_id)
    references public.encounters(tenant_id, id)
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  encounter_id uuid,
  status text not null default 'recorded' check (status in ('recorded', 'corrected', 'void')),
  measured_at timestamptz not null default now(),
  height_cm numeric(5,2),
  weight_kg numeric(6,2),
  bmi numeric(5,2),
  body_fat_pct numeric(5,2),
  waist_cm numeric(5,2),
  hip_cm numeric(5,2),
  measured_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint measurements_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint measurements_encounter_same_tenant
    foreign key (tenant_id, encounter_id)
    references public.encounters(tenant_id, id)
);

create table public.bioimpedance_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  encounter_id uuid,
  status text not null default 'final' check (status in ('draft', 'final', 'corrected', 'void')),
  measured_at timestamptz not null default now(),
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint bioimpedance_results_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint bioimpedance_results_encounter_same_tenant
    foreign key (tenant_id, encounter_id)
    references public.encounters(tenant_id, id)
);

create table public.lab_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  encounter_id uuid,
  status text not null default 'requested' check (status in ('requested', 'collected', 'completed', 'cancelled')),
  ordered_at timestamptz not null default now(),
  ordered_by uuid references public.profiles(id) on delete set null,
  order_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint lab_orders_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint lab_orders_encounter_same_tenant
    foreign key (tenant_id, encounter_id)
    references public.encounters(tenant_id, id)
);

create table public.lab_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  lab_order_id uuid,
  status text not null default 'received' check (status in ('received', 'reviewed', 'corrected', 'void')),
  result_at timestamptz,
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint lab_results_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint lab_results_order_same_tenant
    foreign key (tenant_id, lab_order_id)
    references public.lab_orders(tenant_id, id)
);

create table public.prescriptions_placeholder (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  encounter_id uuid,
  status text not null default 'draft' check (status in ('draft', 'final', 'cancelled')),
  prescription_text text,
  medication_name text,
  dosage text,
  frequency text,
  instructions text,
  start_date date,
  end_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint prescriptions_placeholder_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint prescriptions_placeholder_encounter_same_tenant
    foreign key (tenant_id, encounter_id)
    references public.encounters(tenant_id, id)
);

create index idx_patients_tenant_status on public.patients(tenant_id, status);
create index idx_patient_pii_tenant_name on public.patient_pii(tenant_id, full_name);
create index idx_patient_alerts_tenant_status on public.patient_alerts(tenant_id, status);
create index idx_patient_tasks_tenant_status_due on public.patient_tasks(tenant_id, status, due_at);
create index idx_patient_timeline_events_patient_event_at on public.patient_timeline_events(tenant_id, patient_id, event_at desc);
create index idx_patient_timeline_events_category on public.patient_timeline_events(category);
create index idx_appointments_tenant_scheduled_at on public.appointments(tenant_id, scheduled_at);
create index idx_appointments_tenant_status on public.appointments(tenant_id, status);
create index idx_queue_events_tenant_event_at on public.queue_events(tenant_id, event_at desc);
create index idx_encounters_patient_created_at on public.encounters(tenant_id, patient_id, created_at desc);
create index idx_soap_notes_patient_created_at on public.soap_notes(tenant_id, patient_id, created_at desc);
create index idx_measurements_patient_measured_at on public.measurements(tenant_id, patient_id, measured_at desc);
create index idx_bioimpedance_patient_measured_at on public.bioimpedance_results(tenant_id, patient_id, measured_at desc);
create index idx_lab_orders_patient_ordered_at on public.lab_orders(tenant_id, patient_id, ordered_at desc);
create index idx_lab_results_patient_result_at on public.lab_results(tenant_id, patient_id, result_at desc);
create index idx_prescriptions_patient_created_at on public.prescriptions_placeholder(tenant_id, patient_id, created_at desc);
create index idx_patient_accounts_user_id on public.patient_accounts(user_id);
create index idx_guardian_links_guardian_user_id on public.guardian_links(guardian_user_id);

select security.touch_updated_at('public.patients');
select security.touch_updated_at('public.patient_pii');
select security.touch_updated_at('public.patient_contacts');
select security.touch_updated_at('public.patient_accounts');
select security.touch_updated_at('public.guardian_links');
select security.touch_updated_at('public.patient_alerts');
select security.touch_updated_at('public.patient_tasks');
select security.touch_updated_at('public.patient_timeline_events');
select security.touch_updated_at('public.appointments');
select security.touch_updated_at('public.queue_events');
select security.touch_updated_at('public.encounters');
select security.touch_updated_at('public.soap_notes');
select security.touch_updated_at('public.measurements');
select security.touch_updated_at('public.bioimpedance_results');
select security.touch_updated_at('public.lab_orders');
select security.touch_updated_at('public.lab_results');
select security.touch_updated_at('public.prescriptions_placeholder');

alter table public.patients enable row level security;
alter table public.patient_pii enable row level security;
alter table public.patient_contacts enable row level security;
alter table public.patient_accounts enable row level security;
alter table public.guardian_links enable row level security;
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

create policy patients_select_by_permission
on public.patients for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.read'));

create policy patients_write_by_permission
on public.patients for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.write'))
with check (public.has_clinical_permission(tenant_id, 'patients.write'));

create policy patient_accounts_select_staff
on public.patient_accounts for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.read'));

create policy guardian_links_select_staff
on public.guardian_links for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'patients.read'));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'patient_pii',
    'patient_contacts',
    'patient_alerts',
    'patient_tasks',
    'patient_timeline_events',
    'appointments',
    'queue_events',
    'encounters',
    'measurements',
    'bioimpedance_results',
    'lab_orders',
    'lab_results'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_clinical_permission(tenant_id, ''patients.read''));',
      table_name || '_select_by_patients_read',
      table_name
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_clinical_permission(tenant_id, ''patients.write'')) with check (public.has_clinical_permission(tenant_id, ''patients.write''));',
      table_name || '_write_by_patients_write',
      table_name
    );
  end loop;
end $$;

create policy soap_notes_select_by_soap_read
on public.soap_notes for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'soap.read'));

create policy soap_notes_write_by_soap_write
on public.soap_notes for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'soap.write'))
with check (public.has_clinical_permission(tenant_id, 'soap.write'));

create policy prescriptions_select_by_prescriptions_read
on public.prescriptions_placeholder for select
to authenticated
using (public.has_clinical_permission(tenant_id, 'prescriptions.read'));

create policy prescriptions_write_by_prescriptions_write
on public.prescriptions_placeholder for all
to authenticated
using (public.has_clinical_permission(tenant_id, 'prescriptions.write'))
with check (public.has_clinical_permission(tenant_id, 'prescriptions.write'));
