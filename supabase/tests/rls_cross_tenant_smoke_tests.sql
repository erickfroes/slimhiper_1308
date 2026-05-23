-- Cross-tenant RLS smoke tests (manual)
--
-- Purpose:
--   Verify that tenant A users cannot read or mutate tenant B data after the
--   clean migration set, core bootstrap, and optional demo bootstraps.
--
-- Important:
--   1) Replace all placeholder UUIDs with IDs from your authorized sandbox.
--   2) Run each block independently in Supabase SQL Editor.
--   3) These checks are manual smoke tests, not automated pgTAP tests.
--   4) Do not run against production data.

/* -------------------------------------------------------------------------- */
/* Placeholder setup                                                          */
/* -------------------------------------------------------------------------- */
-- USER_TENANT_A_CLINIC_ADMIN_UUID = '00000000-0000-0000-0000-0000000000a1'
-- USER_TENANT_A_PHYSICIAN_UUID     = '00000000-0000-0000-0000-0000000000a2'
-- USER_TENANT_B_CLINIC_ADMIN_UUID = '00000000-0000-0000-0000-0000000000b1'
--
-- TENANT_A_UUID = '10000000-0000-0000-0000-0000000000a1'
-- TENANT_B_UUID = '10000000-0000-0000-0000-0000000000b1'
--
-- PATIENT_A_UUID = '20000000-0000-0000-0000-0000000000a1'
-- PATIENT_B_UUID = '20000000-0000-0000-0000-0000000000b1'

/* -------------------------------------------------------------------------- */
/* Helper pattern to emulate auth.uid() in SQL Editor                         */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', '<USER_UUID>', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);

/* -------------------------------------------------------------------------- */
/* 1) Tenant A clinic admin can read tenant A metadata                         */
/* Expected: returns exactly TENANT_A_UUID.                                    */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_TENANT_A_CLINIC_ADMIN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select id, slug, name
-- from public.tenants
-- where id = 'TENANT_A_UUID';

/* -------------------------------------------------------------------------- */
/* 2) Tenant A clinic admin cannot read tenant B metadata                      */
/* Expected: returns 0 rows.                                                   */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_TENANT_A_CLINIC_ADMIN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select id, slug, name
-- from public.tenants
-- where id = 'TENANT_B_UUID';

/* -------------------------------------------------------------------------- */
/* 3) Tenant A physician can read patient A basic row                          */
/* Expected: returns exactly PATIENT_A_UUID when demo clinical data exists.    */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_TENANT_A_PHYSICIAN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select id, tenant_id, status
-- from public.patients
-- where id = 'PATIENT_A_UUID'
--   and tenant_id = 'TENANT_A_UUID';

/* -------------------------------------------------------------------------- */
/* 4) Tenant A physician cannot read patient B basic row                       */
/* Expected: returns 0 rows.                                                   */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_TENANT_A_PHYSICIAN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select id, tenant_id, status
-- from public.patients
-- where id = 'PATIENT_B_UUID'
--   and tenant_id = 'TENANT_B_UUID';

/* -------------------------------------------------------------------------- */
/* 5) Tenant A physician cannot read patient B PII                             */
/* Expected: returns 0 rows.                                                   */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_TENANT_A_PHYSICIAN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select patient_id, tenant_id, full_name
-- from public.patient_pii
-- where patient_id = 'PATIENT_B_UUID'
--   and tenant_id = 'TENANT_B_UUID';

/* -------------------------------------------------------------------------- */
/* 6) Tenant A clinic admin cannot read tenant B generated documents           */
/* Expected: returns 0 rows.                                                   */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_TENANT_A_CLINIC_ADMIN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select id, tenant_id, patient_id, status
-- from public.generated_documents
-- where tenant_id = 'TENANT_B_UUID'
--   and patient_id = 'PATIENT_B_UUID';

/* -------------------------------------------------------------------------- */
/* 7) Tenant A clinic admin cannot read tenant B invoices                      */
/* Expected: returns 0 rows when billing demo data exists.                     */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_TENANT_A_CLINIC_ADMIN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select id, tenant_id, patient_id, status
-- from public.patient_invoices
-- where tenant_id = 'TENANT_B_UUID'
--   and patient_id = 'PATIENT_B_UUID';

/* -------------------------------------------------------------------------- */
/* 8) Tenant B clinic admin can read tenant B metadata                         */
/* Expected: returns exactly TENANT_B_UUID.                                    */
/* -------------------------------------------------------------------------- */
-- select set_config('request.jwt.claim.sub', 'USER_TENANT_B_CLINIC_ADMIN_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select id, slug, name
-- from public.tenants
-- where id = 'TENANT_B_UUID';

