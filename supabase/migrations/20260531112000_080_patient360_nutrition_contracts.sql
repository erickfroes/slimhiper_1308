-- Patient 360 nutrition contracts.
-- Scope: schema/RLS only. Do not apply without an authorized Supabase target.

create table public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived', 'cancelled')),
  name text not null,
  target_calories integer not null default 0 check (target_calories >= 0),
  target_protein_g numeric(8,2) not null default 0 check (target_protein_g >= 0),
  target_carbs_g numeric(8,2) not null default 0 check (target_carbs_g >= 0),
  target_fat_g numeric(8,2) not null default 0 check (target_fat_g >= 0),
  meals jsonb not null default '[]'::jsonb,
  food_groups jsonb not null default '[]'::jsonb,
  meal_adherence jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint nutrition_plans_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade
);

create table public.nutrition_plan_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  nutrition_plan_id uuid not null,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  author_role text,
  content text not null,
  is_internal boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint nutrition_plan_notes_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint nutrition_plan_notes_plan_same_tenant
    foreign key (tenant_id, nutrition_plan_id)
    references public.nutrition_plans(tenant_id, id)
    on delete cascade
);

create unique index idx_nutrition_plans_one_active_per_patient
  on public.nutrition_plans(tenant_id, patient_id)
  where status = 'active';

create index idx_nutrition_plans_patient_status
  on public.nutrition_plans(tenant_id, patient_id, status);

create index idx_nutrition_plans_patient_created_at
  on public.nutrition_plans(tenant_id, patient_id, created_at desc);

create index idx_nutrition_plan_notes_plan_created_at
  on public.nutrition_plan_notes(tenant_id, nutrition_plan_id, created_at desc);

select security.touch_updated_at('public.nutrition_plans');
select security.touch_updated_at('public.nutrition_plan_notes');

alter table public.nutrition_plans enable row level security;
alter table public.nutrition_plan_notes enable row level security;

create policy nutrition_plans_select_nutrition_read
on public.nutrition_plans
for select
to authenticated
using (
  security.is_tenant_member(tenant_id)
  and public.has_clinical_permission(tenant_id, 'nutrition.read')
);

create policy nutrition_plans_write_nutrition_write
on public.nutrition_plans
for all
to authenticated
using (
  security.is_tenant_member(tenant_id)
  and public.has_clinical_permission(tenant_id, 'nutrition.write')
)
with check (
  security.is_tenant_member(tenant_id)
  and public.has_clinical_permission(tenant_id, 'nutrition.write')
);

create policy nutrition_plan_notes_select_nutrition_read
on public.nutrition_plan_notes
for select
to authenticated
using (
  security.is_tenant_member(tenant_id)
  and public.has_clinical_permission(tenant_id, 'nutrition.read')
);

create policy nutrition_plan_notes_write_nutrition_write
on public.nutrition_plan_notes
for all
to authenticated
using (
  security.is_tenant_member(tenant_id)
  and public.has_clinical_permission(tenant_id, 'nutrition.write')
)
with check (
  security.is_tenant_member(tenant_id)
  and public.has_clinical_permission(tenant_id, 'nutrition.write')
);
