alter table public.patient_timeline_events
  add column if not exists category text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists actor_name text,
  add column if not exists status_label text,
  add column if not exists action_label text,
  add column if not exists details_href text;

alter table public.patient_timeline_events
  drop constraint if exists patient_timeline_events_category_check;

alter table public.patient_timeline_events
  add constraint patient_timeline_events_category_check
  check (
    category is null
    or category in (
      'clinical',
      'financial',
      'documents',
      'agenda',
      'communication',
      'patient_app',
      'commercial'
    )
  );

create index if not exists idx_patient_timeline_events_category on public.patient_timeline_events(category);
create index if not exists idx_patient_timeline_events_event_at on public.patient_timeline_events(event_at);
create index if not exists idx_patient_timeline_events_tenant_id on public.patient_timeline_events(tenant_id);
create index if not exists idx_patient_timeline_events_patient_id on public.patient_timeline_events(patient_id);
create index if not exists idx_patient_timeline_events_event_type on public.patient_timeline_events(event_type);
create index if not exists idx_patient_timeline_events_created_at on public.patient_timeline_events(created_at);
