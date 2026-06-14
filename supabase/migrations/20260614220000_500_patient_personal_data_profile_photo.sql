-- P1 - Patient personal data: structured address, optional profile fields and private avatar storage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-profile-photos',
  'patient-profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function security.is_valid_patient_profile_photo_path(p_object_name text)
returns boolean
language sql
stable
as $$
  select
    p_object_name is not null
    and array_length(string_to_array(p_object_name, '/'), 1) = 3
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 1))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 2))
    and nullif(split_part(p_object_name, '/', 3), '') is not null
    and split_part(p_object_name, '/', 3) !~ '[\\/]';
$$;

alter table public.patient_pii
  add column if not exists secondary_document text,
  add column if not exists alternate_phone text,
  add column if not exists profession text,
  add column if not exists preference_notes text,
  add column if not exists consents jsonb not null default '{}'::jsonb,
  add column if not exists primary_guardian_name text,
  add column if not exists primary_guardian_phone text,
  add column if not exists profile_photo_bucket text,
  add column if not exists profile_photo_path text,
  add column if not exists profile_photo_mime_type text,
  add column if not exists profile_photo_size_bytes bigint,
  add column if not exists profile_photo_uploaded_at timestamptz,
  add column if not exists profile_photo_uploaded_by uuid references public.profiles(id) on delete set null;

alter table public.patient_pii
  drop constraint if exists patient_pii_profile_photo_bucket_check,
  add constraint patient_pii_profile_photo_bucket_check
  check (profile_photo_bucket is null or profile_photo_bucket = 'patient-profile-photos');

alter table public.patient_pii
  drop constraint if exists patient_pii_profile_photo_size_check,
  add constraint patient_pii_profile_photo_size_check
  check (profile_photo_size_bytes is null or profile_photo_size_bytes >= 0);

alter table public.patient_pii
  drop constraint if exists patient_pii_profile_photo_path_shape,
  add constraint patient_pii_profile_photo_path_shape
  check (
    profile_photo_path is null
    or (
      profile_photo_bucket = 'patient-profile-photos'
      and security.is_valid_patient_profile_photo_path(profile_photo_path)
      and profile_photo_path = tenant_id::text || '/' || patient_id::text || '/' || split_part(profile_photo_path, '/', 3)
    )
  );

create index if not exists idx_patient_pii_profile_photo_path
  on public.patient_pii(profile_photo_bucket, profile_photo_path)
  where profile_photo_path is not null;

create or replace function public.upsert_patient_with_pii(
  p_patient_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('patients.write', true);
  v_user_id uuid := auth.uid();
  v_patient_id uuid := p_patient_id;
  v_full_name text := nullif(trim(p_payload ->> 'fullName'), '');
  v_status text := coalesce(nullif(p_payload ->> 'status', ''), 'active');
  v_tags text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_payload -> 'tags', '[]'::jsonb))), '{}'::text[]);
  v_metadata jsonb := coalesce(p_payload -> 'metadata', '{}'::jsonb);
  v_address jsonb := coalesce(p_payload -> 'address', '{}'::jsonb);
  v_consents jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  v_photo jsonb := coalesce(p_payload -> 'profilePhoto', '{}'::jsonb);
  v_photo_path text := nullif(trim(v_photo ->> 'path'), '');
  v_photo_mime_type text := nullif(trim(v_photo ->> 'mimeType'), '');
  v_photo_size_bytes bigint := nullif(v_photo ->> 'sizeBytes', '')::bigint;
  v_action text;
begin
  if v_full_name is null or length(v_full_name) < 3 then
    raise exception 'patient_full_name_required' using errcode = '22023';
  end if;

  if v_address <> '{}'::jsonb and jsonb_typeof(v_address) <> 'object' then
    raise exception 'patient_address_invalid' using errcode = '22023';
  end if;

  if v_consents <> '{}'::jsonb and jsonb_typeof(v_consents) <> 'object' then
    raise exception 'patient_consents_invalid' using errcode = '22023';
  end if;

  if v_photo_path is not null and not security.is_valid_patient_profile_photo_path(v_photo_path) then
    raise exception 'patient_profile_photo_path_invalid' using errcode = '22023';
  end if;

  if v_patient_id is null then
    insert into public.patients (tenant_id, status, preferred_name, tags, metadata)
    values (v_tenant_id, v_status, nullif(trim(p_payload ->> 'preferredName'), ''), v_tags, v_metadata)
    returning id into v_patient_id;
    v_action := 'patient_created';
  else
    update public.patients
    set status = v_status,
        preferred_name = nullif(trim(p_payload ->> 'preferredName'), ''),
        tags = v_tags,
        metadata = v_metadata,
        updated_at = now()
    where tenant_id = v_tenant_id
      and id = v_patient_id
    returning id into v_patient_id;

    if v_patient_id is null then
      raise exception 'patient_not_found_or_forbidden' using errcode = 'P0002';
    end if;
    v_action := 'patient_updated';
  end if;

  if v_photo_path is not null and v_photo_path <> v_tenant_id::text || '/' || v_patient_id::text || '/' || split_part(v_photo_path, '/', 3) then
    raise exception 'patient_profile_photo_path_forbidden' using errcode = '42501';
  end if;

  insert into public.patient_pii (
    tenant_id, patient_id, full_name, email, phone, cpf_masked, birth_date, sex_gender,
    address, secondary_document, alternate_phone, profession, preference_notes, consents,
    primary_guardian_name, primary_guardian_phone, profile_photo_bucket, profile_photo_path,
    profile_photo_mime_type, profile_photo_size_bytes, profile_photo_uploaded_at, profile_photo_uploaded_by
  ) values (
    v_tenant_id, v_patient_id, v_full_name, nullif(trim(p_payload ->> 'email'), ''),
    nullif(trim(p_payload ->> 'phone'), ''), nullif(trim(p_payload ->> 'cpfMasked'), ''),
    nullif(trim(p_payload ->> 'birthDate'), '')::date, nullif(trim(p_payload ->> 'sexGender'), ''),
    v_address, nullif(trim(p_payload ->> 'secondaryDocument'), ''), nullif(trim(p_payload ->> 'alternatePhone'), ''),
    nullif(trim(p_payload ->> 'profession'), ''), nullif(trim(p_payload ->> 'preferenceNotes'), ''), v_consents,
    nullif(trim(p_payload ->> 'primaryGuardianName'), ''), nullif(trim(p_payload ->> 'primaryGuardianPhone'), ''),
    case when v_photo_path is null then null else 'patient-profile-photos' end, v_photo_path,
    v_photo_mime_type, v_photo_size_bytes, case when v_photo_path is null then null else now() end, case when v_photo_path is null then null else v_user_id end
  )
  on conflict (patient_id) do update set
    tenant_id = excluded.tenant_id, full_name = excluded.full_name, email = excluded.email,
    phone = excluded.phone, cpf_masked = excluded.cpf_masked, birth_date = excluded.birth_date,
    sex_gender = excluded.sex_gender, address = excluded.address, secondary_document = excluded.secondary_document,
    alternate_phone = excluded.alternate_phone, profession = excluded.profession,
    preference_notes = excluded.preference_notes, consents = excluded.consents,
    primary_guardian_name = excluded.primary_guardian_name, primary_guardian_phone = excluded.primary_guardian_phone,
    profile_photo_bucket = coalesce(excluded.profile_photo_bucket, public.patient_pii.profile_photo_bucket),
    profile_photo_path = coalesce(excluded.profile_photo_path, public.patient_pii.profile_photo_path),
    profile_photo_mime_type = coalesce(excluded.profile_photo_mime_type, public.patient_pii.profile_photo_mime_type),
    profile_photo_size_bytes = coalesce(excluded.profile_photo_size_bytes, public.patient_pii.profile_photo_size_bytes),
    profile_photo_uploaded_at = coalesce(excluded.profile_photo_uploaded_at, public.patient_pii.profile_photo_uploaded_at),
    profile_photo_uploaded_by = coalesce(excluded.profile_photo_uploaded_by, public.patient_pii.profile_photo_uploaded_by),
    updated_at = now();

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, v_user_id, v_action, 'patient', v_patient_id::text,
    jsonb_build_object('source', 'upsert_patient_with_pii', 'addressUpdated', v_address <> '{}'::jsonb, 'profilePhotoPath', v_photo_path is not null));

  return jsonb_build_object('id', v_patient_id);
end;
$$;

drop policy if exists "patient_profile_photos_storage_select" on storage.objects;
create policy "patient_profile_photos_storage_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'patient-profile-photos'
  and security.is_valid_patient_profile_photo_path(name)
  and exists (
    select 1 from public.patient_pii pp
    where pp.profile_photo_bucket = bucket_id
      and pp.profile_photo_path = name
      and (
        security.has_permission(pp.tenant_id, 'patients.read', false)
        or public.can_access_patient_portal_patient(pp.tenant_id, pp.patient_id)
      )
  )
);

drop policy if exists "patient_profile_photos_storage_insert" on storage.objects;
create policy "patient_profile_photos_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'patient-profile-photos'
  and security.is_valid_patient_profile_photo_path(name)
  and security.has_permission(split_part(name, '/', 1)::uuid, 'patients.write', false)
);

drop policy if exists "patient_profile_photos_storage_update" on storage.objects;
create policy "patient_profile_photos_storage_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'patient-profile-photos'
  and security.is_valid_patient_profile_photo_path(name)
  and security.has_permission(split_part(name, '/', 1)::uuid, 'patients.write', false)
)
with check (
  bucket_id = 'patient-profile-photos'
  and security.is_valid_patient_profile_photo_path(name)
  and security.has_permission(split_part(name, '/', 1)::uuid, 'patients.write', false)
);

revoke all on function public.upsert_patient_with_pii(uuid, jsonb) from public;
grant execute on function public.upsert_patient_with_pii(uuid, jsonb) to authenticated, service_role;
