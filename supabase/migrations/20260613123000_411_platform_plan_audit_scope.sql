alter table public.audit_logs
  alter column tenant_id drop not null;

drop policy if exists audit_logs_select_operational on public.audit_logs;
create policy audit_logs_select_operational
on public.audit_logs for select
to authenticated
using (
  security.is_platform_admin()
  or security.is_platform_support()
  or (
    tenant_id is not null
    and security.has_tenant_role(tenant_id, array['tenant_owner', 'clinic_admin'])
  )
);

drop policy if exists audit_logs_insert_platform_operations on public.audit_logs;
create policy audit_logs_insert_platform_operations
on public.audit_logs for insert
to authenticated
with check (
  tenant_id is null
  and security.is_platform_admin()
  and user_id = auth.uid()
);

comment on column public.audit_logs.tenant_id is
  'Tenant scoped audit target. Null is reserved for platform-global operations such as platform plan changes.';
