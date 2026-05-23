-- Core RBAC smoke tests (manual)
--
-- Purpose:
--   Quick, manual checks for core tenant/platform RBAC behavior after migrations + bootstrap.
--
-- Important:
--   1) Replace placeholder UUIDs below with IDs from your environment.
--   2) Run each test block independently in Supabase SQL Editor.
--   3) These are smoke tests (human-verified expected outcomes), not pgTAP automation.

/* -------------------------------------------------------------------------- */
/* Placeholder setup (copy values from your seeded data)                      */
/* -------------------------------------------------------------------------- */
-- USER_PLATFORM_ADMIN_UUID   = '00000000-0000-0000-0000-0000000000a1'
-- USER_CLINIC_ADMIN_UUID     = '00000000-0000-0000-0000-0000000000a2'
-- USER_PHYSICIAN_UUID        = '00000000-0000-0000-0000-0000000000a3'
-- USER_FINANCIAL_UUID        = '00000000-0000-0000-0000-0000000000a4'
-- USER_NUTRITIONIST_UUID     = '00000000-0000-0000-0000-0000000000a5'
-- USER_RECEPTIONIST_UUID     = '00000000-0000-0000-0000-0000000000a6'
-- USER_SUPPORT_UUID          = '00000000-0000-0000-0000-0000000000a7'
--
-- TENANT_ALPHA_UUID          = '10000000-0000-0000-0000-0000000000a1'
-- TENANT_BETA_UUID           = '10000000-0000-0000-0000-0000000000b1'
--
-- MEMBERSHIP_PHYSICIAN_UUID  = '20000000-0000-0000-0000-0000000000a3'


/* -------------------------------------------------------------------------- */
/* Helper pattern to emulate auth.uid() in SQL Editor                         */
/* -------------------------------------------------------------------------- */
-- For each block, set claims to the acting user:
--   select set_config('request.jwt.claim.sub', '<USER_UUID>', true);
--   select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- Reset when switching users (run again with the next UUID).


/* -------------------------------------------------------------------------- */
/* 1) platform admin can read tenants                                         */
/* Expected: returns >= 1 tenant row.                                         */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_PLATFORM_ADMIN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select id, slug, name
-- from public.tenants
-- order by created_at desc
-- limit 20;


/* -------------------------------------------------------------------------- */
/* 2) clinic admin can read own tenant                                        */
/* Expected: returns exactly TENANT_ALPHA_UUID (or your owned tenant).        */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_CLINIC_ADMIN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select id, slug, name
-- from public.tenants
-- where id = 'TENANT_ALPHA_UUID';


/* -------------------------------------------------------------------------- */
/* 3) clinic admin cannot read another tenant                                 */
/* Expected: returns 0 rows for TENANT_BETA_UUID.                             */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_CLINIC_ADMIN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select id, slug, name
-- from public.tenants
-- where id = 'TENANT_BETA_UUID';


/* -------------------------------------------------------------------------- */
/* 4) physician can read own membership                                       */
/* Expected: returns physician's own membership row only.                     */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_PHYSICIAN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select id, tenant_id, user_id, role
-- from public.tenant_memberships
-- where user_id = 'USER_PHYSICIAN_UUID';


/* -------------------------------------------------------------------------- */
/* 5) financial_user has financial.read permission                            */
/* Expected: query returns 1 row with code = 'financial.read'.                */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_FINANCIAL_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select p.code
-- from public.tenant_memberships tm
-- join public.roles r
--   on r.tenant_id = tm.tenant_id
--  and r.name = tm.role_code
-- join public.role_permissions rp
--   on rp.role_id = r.id
-- join public.permissions p
--   on p.id = rp.permission_id
-- where tm.user_id = 'USER_FINANCIAL_UUID'
--   and p.code = 'financial.read';


/* -------------------------------------------------------------------------- */
/* 6) nutritionist does not have prescriptions.write                          */
/* Expected: returns 0 rows.                                                  */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_NUTRITIONIST_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select p.code
-- from public.tenant_memberships tm
-- join public.roles r
--   on r.tenant_id = tm.tenant_id
--  and r.name = tm.role_code
-- join public.role_permissions rp
--   on rp.role_id = r.id
-- join public.permissions p
--   on p.id = rp.permission_id
-- where tm.user_id = 'USER_NUTRITIONIST_UUID'
--   and p.code = 'prescriptions.write';


/* -------------------------------------------------------------------------- */
/* 7) receptionist cannot manage tenant users                                 */
/* Expected: returns 0 rows for manage-users style permission(s).             */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_RECEPTIONIST_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select p.code
-- from public.tenant_memberships tm
-- join public.roles r
--   on r.tenant_id = tm.tenant_id
--  and r.name = tm.role_code
-- join public.role_permissions rp
--   on rp.role_id = r.id
-- join public.permissions p
--   on p.id = rp.permission_id
-- where tm.user_id = 'USER_RECEPTIONIST_UUID'
--   and p.code in ('tenant.users.manage', 'settings.write');


/* -------------------------------------------------------------------------- */
/* 8) tenant_owner/clinic_admin can manage users                              */
/* Expected: at least one row with users management permission for admin.     */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_CLINIC_ADMIN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select p.code
-- from public.tenant_memberships tm
-- join public.roles r
--   on r.tenant_id = tm.tenant_id
--  and r.name = tm.role_code
-- join public.role_permissions rp
--   on rp.role_id = r.id
-- join public.permissions p
--   on p.id = rp.permission_id
-- where tm.user_id = 'USER_CLINIC_ADMIN_UUID'
--   and p.code in ('tenant.users.manage', 'settings.write');


/* -------------------------------------------------------------------------- */
/* 9) platform_support can read operational metadata but not clinical data    */
/* Expected: can read platform metadata (e.g., tenants/profiles as allowed),  */
/*           but cannot read tenant clinical tables.                           */
/* Note: This repository intentionally does not create clinical tables here.   */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_SUPPORT_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- 9a) Operational metadata check (should return rows if policy grants access):
-- select id, slug, name from public.tenants limit 20;
--
-- 9b) Clinical access negative check:
-- Replace `public.<clinical_table>` with a real clinical table from your app schema.
-- Expected: permission denied OR 0 rows depending on your policy model.
-- select * from public.<clinical_table> limit 1;


/* -------------------------------------------------------------------------- */
/* 10) profile auto-provision trigger exists                                  */
/* Expected: at least one trigger entry for profile auto-provisioning.        */
/* -------------------------------------------------------------------------- */
-- select n.nspname as schema_name,
--        c.relname as table_name,
--        t.tgname as trigger_name,
--        pg_get_triggerdef(t.oid, true) as trigger_def
-- from pg_trigger t
-- join pg_class c on c.oid = t.tgrelid
-- join pg_namespace n on n.oid = c.relnamespace
-- where not t.tgisinternal
--   and (
--     t.tgname ilike '%profile%'
--     or pg_get_triggerdef(t.oid, true) ilike '%profile%'
--   )
-- order by schema_name, table_name, trigger_name;
