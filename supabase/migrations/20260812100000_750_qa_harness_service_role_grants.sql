-- Allows trusted local/bootstrap QA harnesses to prepare and clean synthetic
-- tenant fixtures. Browser-facing roles keep their existing grants and RLS.

grant select, insert, update, delete on table public.tenants to service_role;
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.tenant_memberships to service_role;
grant select, insert, update, delete on table public.roles to service_role;
grant select, insert, update, delete on table public.permissions to service_role;
grant select, insert, update, delete on table public.role_permissions to service_role;
grant select, insert, update, delete on table public.patients to service_role;
grant select, insert, update, delete on table public.patient_pii to service_role;
grant select, insert, update, delete on table public.patient_accounts to service_role;
grant select, insert, update, delete on table public.guardian_links to service_role;

-- The RLS policy patients_select_by_permission already restricts this read to
-- users with patients.read. Without this table grant, PostgREST rejects the
-- request before evaluating that policy.
grant select on table public.patients to authenticated;

comment on table public.patient_accounts is
  'Patient portal linkage. Trusted QA fixtures may mutate it only through the service_role; browser users remain read-scoped by RLS.';
