-- Post-deploy contract checklist for the Mercado Pago billing control plane.
-- Run only in an authorized target after migrations 820-822 are applied.
-- The checks are read-only and fail fast when a required contract is absent.

do $$
declare
  v_missing text[] := '{}';
begin
  if to_regclass('public.platform_plan_prices') is null then
    v_missing := array_append(v_missing, 'platform_plan_prices');
  end if;
  if to_regclass('public.platform_billing_connections') is null then
    v_missing := array_append(v_missing, 'platform_billing_connections');
  end if;
  if to_regclass('public.platform_billing_webhook_events') is null then
    v_missing := array_append(v_missing, 'platform_billing_webhook_events');
  end if;
  if to_regclass('public.platform_subscription_invoices') is null then
    v_missing := array_append(v_missing, 'platform_subscription_invoices');
  end if;
  if to_regclass('public.platform_subscription_payments') is null then
    v_missing := array_append(v_missing, 'platform_subscription_payments');
  end if;
  if to_regclass('public.package_billing_versions') is null then
    v_missing := array_append(v_missing, 'package_billing_versions');
  end if;
  if array_length(v_missing, 1) is not null then
    raise exception 'missing billing tables: %', array_to_string(v_missing, ', ');
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.apply_platform_mercadopago_event(uuid,jsonb)') is null then
    raise exception 'missing apply_platform_mercadopago_event';
  end if;
  if to_regprocedure('public.apply_platform_billing_lifecycle()') is null then
    raise exception 'missing apply_platform_billing_lifecycle';
  end if;
  if to_regprocedure('public.configure_package_billing(uuid,text,integer,integer)') is null then
    raise exception 'missing configure_package_billing';
  end if;
  if to_regprocedure('public.upsert_commercial_package_with_billing(jsonb)') is null then
    raise exception 'missing upsert_commercial_package_with_billing';
  end if;
  if to_regprocedure('public.reconcile_patient_invoice_balance(uuid,uuid)') is null then
    raise exception 'missing reconcile_patient_invoice_balance';
  end if;
  if to_regprocedure('public.reserve_mercadopago_refund(uuid,uuid,uuid,uuid,integer,text,uuid,text)') is null then
    raise exception 'missing reserve_mercadopago_refund';
  end if;
  if to_regprocedure('public.finalize_mercadopago_refund(uuid,text,text,integer)') is null then
    raise exception 'missing finalize_mercadopago_refund';
  end if;
  if has_function_privilege(
       'authenticated',
       'public.finalize_mercadopago_refund(uuid,text,text,integer)',
       'EXECUTE'
     ) then
    raise exception 'authenticated can execute finalize_mercadopago_refund';
  end if;
  if not has_function_privilege(
       'service_role',
       'public.finalize_mercadopago_refund(uuid,text,text,integer)',
       'EXECUTE'
     ) then
    raise exception 'service_role cannot execute finalize_mercadopago_refund';
  end if;
end $$;

do $$
declare
  v_tenant_write_policies integer;
  v_rls_disabled text[];
begin
  select count(*) into v_tenant_write_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'tenant_subscriptions'
    and policyname in (
      'tenant_subscriptions_write_financial',
      'tenant_subscriptions_update_financial',
      'tenant_subscriptions_manage_platform_admin'
    );
  if v_tenant_write_policies <> 0 then
    raise exception 'tenant SaaS subscription write policies are still present';
  end if;
  if has_table_privilege('authenticated', 'public.tenant_subscriptions', 'INSERT')
     or has_table_privilege('authenticated', 'public.tenant_subscriptions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.tenant_subscriptions', 'DELETE') then
    raise exception 'authenticated still has direct SaaS subscription mutation grants';
  end if;
  if has_table_privilege('authenticated', 'public.packages', 'INSERT')
     or has_table_privilege('authenticated', 'public.packages', 'UPDATE')
     or has_table_privilege('authenticated', 'public.packages', 'DELETE') then
    raise exception 'authenticated still has direct package mutation grants';
  end if;

  select array_agg(c.relname order by c.relname) into v_rls_disabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'platform_plan_prices',
      'platform_billing_connections',
      'platform_billing_webhook_events',
      'platform_subscription_invoices',
      'platform_subscription_payments',
      'package_billing_versions'
    )
    and not c.relrowsecurity;
  if array_length(v_rls_disabled, 1) is not null then
    raise exception 'RLS disabled on: %', array_to_string(v_rls_disabled, ', ');
  end if;
end $$;

do $$
declare
  v_code text;
begin
  foreach v_code in array array[
    'financial.charge.create',
    'financial.subscription.manage',
    'financial.refund.create',
    'financial.integration.manage',
    'financial.reconciliation.manage',
    'financial.webhook.read'
  ] loop
    if not exists (select 1 from public.permissions where code = v_code) then
      raise exception 'missing fine-grained permission: %', v_code;
    end if;
  end loop;
end $$;

select
  'mercadopago_billing_control_plane_contract_ok' as result,
  now() as checked_at;
