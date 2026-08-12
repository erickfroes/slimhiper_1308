-- Trusted local QA continuity harnesses need explicit table privileges to
-- create, snapshot and restore only synthetic tenant-scoped records. Browser
-- roles keep their existing grants and RLS policies.

grant select, insert, update, delete on table public.encounters to service_role;
grant select, insert, update, delete on table public.soap_notes to service_role;
grant select, insert, update, delete on table public.measurements to service_role;
grant select, insert, update, delete on table public.generated_documents to service_role;
grant select, insert, update, delete on table public.patient_invoices to service_role;
grant select, insert, update, delete on table public.payments to service_role;

comment on table public.generated_documents is
  'Clinical document metadata. Downloads are served by Edge signed URLs, not direct storage reads. Trusted local QA continuity harnesses may snapshot synthetic qa_ metadata only.';
