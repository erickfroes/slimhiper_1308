-- Patient/guardian linkage read scope before opening the patient portal.
-- This exposes only the linkage rows owned by the authenticated user. Patient
-- clinical/PII rows remain fail-closed to patient/guardian accounts until a
-- dedicated portal contract is implemented and smoked separately.

create index if not exists idx_patient_accounts_user_status
  on public.patient_accounts(user_id, status);

create index if not exists idx_patient_accounts_patient_status
  on public.patient_accounts(tenant_id, patient_id, status);

create index if not exists idx_guardian_links_user_status
  on public.guardian_links(guardian_user_id, status);

create index if not exists idx_guardian_links_patient_status
  on public.guardian_links(tenant_id, patient_id, status);

grant select on public.patient_accounts to authenticated, service_role;
grant select on public.guardian_links to authenticated, service_role;

revoke insert, update, delete on public.patient_accounts from anon, authenticated;
revoke insert, update, delete on public.guardian_links from anon, authenticated;

drop policy if exists patient_accounts_select_self on public.patient_accounts;
create policy patient_accounts_select_self
on public.patient_accounts for select
to authenticated
using (
  user_id = auth.uid()
  and status = 'active'
);

drop policy if exists guardian_links_select_self on public.guardian_links;
create policy guardian_links_select_self
on public.guardian_links for select
to authenticated
using (
  guardian_user_id = auth.uid()
  and status = 'active'
);

comment on policy patient_accounts_select_self on public.patient_accounts is
  'Allows an authenticated patient account to read only its active linkage row; patient data remains separately scoped.';

comment on policy guardian_links_select_self on public.guardian_links is
  'Allows an authenticated guardian to read only active dependent linkage rows; patient data remains separately scoped.';
