-- Keep generated patient check-ins stable when program check-in templates are edited.

alter table public.patient_program_checkins
  drop constraint if exists patient_program_checkins_template_same_tenant;

alter table public.patient_program_checkins
  add constraint patient_program_checkins_template_same_tenant
    foreign key (tenant_id, template_id)
    references public.program_checkin_templates(tenant_id, id)
    on delete set null (template_id);
