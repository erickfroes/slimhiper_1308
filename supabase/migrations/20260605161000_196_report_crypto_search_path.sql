-- Ensure report export token generation can resolve pgcrypto helpers when
-- security-definer functions run with a restricted search_path.

create extension if not exists pgcrypto with schema extensions;

alter function public.create_clinic_report_run(text, jsonb, text, uuid)
  set search_path = public, security, extensions, pg_temp;

comment on function public.create_clinic_report_run(text, jsonb, text, uuid) is
  'Creates sanitized clinic/patient report runs and export tokens with pgcrypto helpers available in the function search_path.';
