-- P1 - User/professional personal data: keep RBAC in tenant_memberships,
-- private user identity in profiles and clinical identity in tenant_professionals.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-profile-avatars',
  'user-profile-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function security.is_valid_user_profile_avatar_path(p_object_name text)
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

alter table public.profiles
  add column if not exists phone text,
  add column if not exists avatar_bucket text,
  add column if not exists avatar_path text,
  add column if not exists avatar_mime_type text,
  add column if not exists avatar_size_bytes bigint,
  add column if not exists avatar_uploaded_at timestamptz,
  add column if not exists avatar_uploaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists private_profile jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_avatar_bucket_check,
  add constraint profiles_avatar_bucket_check
  check (avatar_bucket is null or avatar_bucket = 'user-profile-avatars');

alter table public.profiles
  drop constraint if exists profiles_avatar_size_check,
  add constraint profiles_avatar_size_check
  check (avatar_size_bytes is null or avatar_size_bytes >= 0);

alter table public.profiles
  drop constraint if exists profiles_avatar_path_shape,
  add constraint profiles_avatar_path_shape
  check (
    avatar_path is null
    or (
      avatar_bucket = 'user-profile-avatars'
      and security.is_valid_user_profile_avatar_path(avatar_path)
      and avatar_path = split_part(avatar_path, '/', 1) || '/' || id::text || '/' || split_part(avatar_path, '/', 3)
    )
  );

alter table public.tenant_professionals
  add column if not exists professional_address jsonb not null default '{}'::jsonb,
  add column if not exists attendance_unit_ids uuid[] not null default '{}'::uuid[],
  add column if not exists signature_footer text,
  add column if not exists public_profile jsonb not null default '{}'::jsonb;

create index if not exists idx_profiles_avatar_path
  on public.profiles(avatar_bucket, avatar_path)
  where avatar_path is not null;

create index if not exists idx_tenant_professionals_attendance_units
  on public.tenant_professionals using gin(attendance_unit_ids);

drop policy if exists user_profile_avatars_select_authorized on storage.objects;
drop policy if exists user_profile_avatars_insert_authorized on storage.objects;
drop policy if exists user_profile_avatars_update_authorized on storage.objects;

create policy user_profile_avatars_select_authorized
on storage.objects for select
to authenticated
using (
  bucket_id = 'user-profile-avatars'
  and security.is_valid_user_profile_avatar_path(name)
  and (
    auth.uid() = split_part(name, '/', 2)::uuid
    or security.has_permission(split_part(name, '/', 1)::uuid, 'settings.read', true)
    or security.has_permission(split_part(name, '/', 1)::uuid, 'tenant.users.manage', true)
  )
);

create policy user_profile_avatars_insert_authorized
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'user-profile-avatars'
  and security.is_valid_user_profile_avatar_path(name)
  and (
    auth.uid() = split_part(name, '/', 2)::uuid
    or security.has_permission(split_part(name, '/', 1)::uuid, 'settings.write', true)
    or security.has_permission(split_part(name, '/', 1)::uuid, 'tenant.users.manage', true)
  )
);

create policy user_profile_avatars_update_authorized
on storage.objects for update
to authenticated
using (
  bucket_id = 'user-profile-avatars'
  and security.is_valid_user_profile_avatar_path(name)
  and (
    auth.uid() = split_part(name, '/', 2)::uuid
    or security.has_permission(split_part(name, '/', 1)::uuid, 'settings.write', true)
    or security.has_permission(split_part(name, '/', 1)::uuid, 'tenant.users.manage', true)
  )
)
with check (
  bucket_id = 'user-profile-avatars'
  and security.is_valid_user_profile_avatar_path(name)
  and (
    auth.uid() = split_part(name, '/', 2)::uuid
    or security.has_permission(split_part(name, '/', 1)::uuid, 'settings.write', true)
    or security.has_permission(split_part(name, '/', 1)::uuid, 'tenant.users.manage', true)
  )
);

create or replace function public.get_clinic_team_personal_profiles()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant('settings.read', true);
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'membershipId', tm.id,
        'tenantId', tm.tenant_id,
        'userId', tm.user_id,
        'phone', p.phone,
        'avatarBucket', p.avatar_bucket,
        'avatarPath', p.avatar_path,
        'privateProfile', p.private_profile,
        'professionalProfileId', tp.id,
        'professionalAddress', tp.professional_address,
        'attendanceUnitIds', tp.attendance_unit_ids,
        'signatureFooter', tp.signature_footer,
        'publicProfile', tp.public_profile
      ) order by p.full_name nulls last, p.email nulls last
    )
    from public.tenant_memberships tm
    join public.profiles p on p.id = tm.user_id
    left join lateral (
      select *
      from public.tenant_professionals tp
      where tp.tenant_id = tm.tenant_id
        and tp.membership_id = tm.id
      order by case when tp.is_active then 0 else 1 end,
               case when tp.professional_type = 'physician' then 0 else 1 end,
               tp.updated_at desc
      limit 1
    ) tp on true
    where tm.tenant_id = v_tenant_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.update_clinic_member_personal_profile(
  p_membership_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.tenant_memberships%rowtype;
  v_profile public.profiles%rowtype;
  v_professional public.tenant_professionals%rowtype;
  v_phone text := nullif(btrim(coalesce(p_payload ->> 'phone', '')), '');
  v_avatar jsonb := coalesce(p_payload -> 'avatar', '{}'::jsonb);
  v_avatar_path text := nullif(btrim(v_avatar ->> 'path'), '');
  v_avatar_mime_type text := nullif(btrim(v_avatar ->> 'mimeType'), '');
  v_avatar_size_bytes bigint := nullif(v_avatar ->> 'sizeBytes', '')::bigint;
  v_private_profile jsonb := coalesce(p_payload -> 'privateProfile', '{}'::jsonb);
  v_professional_address jsonb := coalesce(p_payload -> 'professionalAddress', '{}'::jsonb);
  v_attendance_unit_ids uuid[] := coalesce(
    array(select jsonb_array_elements_text(coalesce(p_payload -> 'attendanceUnitIds', '[]'::jsonb))::uuid),
    '{}'::uuid[]
  );
  v_signature_footer text := nullif(btrim(coalesce(p_payload ->> 'signatureFooter', '')), '');
  v_public_profile jsonb := coalesce(p_payload -> 'publicProfile', '{}'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_membership_id is null then
    raise exception 'membership_required' using errcode = '22023';
  end if;

  select * into v_membership
  from public.tenant_memberships
  where id = p_membership_id
  for update;

  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  if not (
    v_user_id = v_membership.user_id
    or security.has_permission(v_membership.tenant_id, 'settings.write', true)
    or security.has_permission(v_membership.tenant_id, 'tenant.users.manage', true)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_private_profile <> '{}'::jsonb and jsonb_typeof(v_private_profile) <> 'object' then
    raise exception 'private_profile_invalid' using errcode = '22023';
  end if;
  if v_professional_address <> '{}'::jsonb and jsonb_typeof(v_professional_address) <> 'object' then
    raise exception 'professional_address_invalid' using errcode = '22023';
  end if;
  if v_public_profile <> '{}'::jsonb and jsonb_typeof(v_public_profile) <> 'object' then
    raise exception 'public_profile_invalid' using errcode = '22023';
  end if;
  if v_avatar_path is not null and not security.is_valid_user_profile_avatar_path(v_avatar_path) then
    raise exception 'user_avatar_path_invalid' using errcode = '22023';
  end if;
  if v_avatar_path is not null and v_avatar_path <> v_membership.tenant_id::text || '/' || v_membership.user_id::text || '/' || split_part(v_avatar_path, '/', 3) then
    raise exception 'user_avatar_path_forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(v_attendance_unit_ids) as requested(unit_id)
    left join public.tenant_units tu
      on tu.tenant_id = v_membership.tenant_id
     and tu.id = requested.unit_id
    where tu.id is null
  ) then
    raise exception 'attendance_unit_forbidden' using errcode = '42501';
  end if;

  update public.profiles
  set phone = v_phone,
      avatar_bucket = case when v_avatar_path is not null then 'user-profile-avatars' else avatar_bucket end,
      avatar_path = coalesce(v_avatar_path, avatar_path),
      avatar_mime_type = coalesce(v_avatar_mime_type, avatar_mime_type),
      avatar_size_bytes = coalesce(v_avatar_size_bytes, avatar_size_bytes),
      avatar_uploaded_at = case when v_avatar_path is not null then now() else avatar_uploaded_at end,
      avatar_uploaded_by = case when v_avatar_path is not null then v_user_id else avatar_uploaded_by end,
      private_profile = v_private_profile,
      updated_at = now()
  where id = v_membership.user_id
  returning * into v_profile;

  select * into v_professional
  from public.tenant_professionals
  where tenant_id = v_membership.tenant_id
    and membership_id = v_membership.id
  order by case when is_active then 0 else 1 end,
           case when professional_type = 'physician' then 0 else 1 end,
           updated_at desc
  limit 1
  for update;

  if found then
    update public.tenant_professionals
    set professional_address = v_professional_address,
        attendance_unit_ids = v_attendance_unit_ids,
        signature_footer = v_signature_footer,
        public_profile = v_public_profile,
        updated_at = now()
    where id = v_professional.id
    returning * into v_professional;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_membership.tenant_id,
    v_user_id,
    'clinic_member_personal_profile.updated',
    'profile',
    v_membership.user_id::text,
    jsonb_build_object(
      'reason', v_reason,
      'membershipId', v_membership.id,
      'targetUserId', v_membership.user_id,
      'hasAvatar', v_profile.avatar_path is not null,
      'professionalProfileId', v_professional.id,
      'changedProfessionalPublicData', v_professional.id is not null
    )
  );

  return jsonb_build_object(
    'membershipId', v_membership.id,
    'tenantId', v_membership.tenant_id,
    'userId', v_membership.user_id,
    'phone', v_profile.phone,
    'avatarBucket', v_profile.avatar_bucket,
    'avatarPath', v_profile.avatar_path,
    'privateProfile', v_profile.private_profile,
    'professionalProfileId', v_professional.id,
    'professionalAddress', coalesce(v_professional.professional_address, '{}'::jsonb),
    'attendanceUnitIds', coalesce(to_jsonb(v_professional.attendance_unit_ids), '[]'::jsonb),
    'signatureFooter', v_professional.signature_footer,
    'publicProfile', coalesce(v_professional.public_profile, '{}'::jsonb)
  );
end;
$$;

create or replace function public.get_user_profile_avatar_signed_url(
  p_membership_id uuid,
  p_expires_in integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, extensions, storage, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.tenant_memberships%rowtype;
  v_profile public.profiles%rowtype;
  v_expires_in integer := greatest(60, least(coalesce(p_expires_in, 300), 900));
  v_signed_url text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_membership
  from public.tenant_memberships
  where id = p_membership_id;

  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  if not (
    v_user_id = v_membership.user_id
    or security.has_permission(v_membership.tenant_id, 'settings.read', true)
    or security.has_permission(v_membership.tenant_id, 'tenant.users.manage', true)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_membership.user_id;

  if v_profile.avatar_bucket is null or v_profile.avatar_path is null then
    return jsonb_build_object('signedUrl', null, 'expiresIn', v_expires_in);
  end if;

  select signed_url into v_signed_url
  from storage.create_signed_url(v_profile.avatar_bucket, v_profile.avatar_path, v_expires_in);

  return jsonb_build_object('signedUrl', v_signed_url, 'expiresIn', v_expires_in);
end;
$$;

revoke all on function public.get_clinic_team_personal_profiles() from public;
revoke all on function public.update_clinic_member_personal_profile(uuid, jsonb, text) from public;
revoke all on function public.get_user_profile_avatar_signed_url(uuid, integer) from public;
grant execute on function public.get_clinic_team_personal_profiles() to authenticated, service_role;
grant execute on function public.update_clinic_member_personal_profile(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.get_user_profile_avatar_signed_url(uuid, integer) to authenticated, service_role;

comment on function public.update_clinic_member_personal_profile(uuid, jsonb, text) is
  'Updates private user contact/avatar data in profiles and professional public identity fields in tenant_professionals without changing tenant_memberships RBAC.';

create or replace function public.fill_prescription_regulatory_professional_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_professional public.tenant_professionals%rowtype;
begin
  if new.prescriber_profile_id is null then
    return new;
  end if;

  select * into v_professional
  from public.tenant_professionals tp
  where tp.tenant_id = new.tenant_id
    and tp.user_id = new.prescriber_profile_id
    and tp.is_active = true
  order by case when tp.professional_type = 'physician' then 0 else 1 end,
           tp.updated_at desc
  limit 1;

  if found then
    new.professional_council := coalesce(new.professional_council, case when v_professional.professional_type = 'physician' then 'CRM' else null end);
    new.professional_registration := coalesce(new.professional_registration, v_professional.license_number);
    new.professional_registration_state := coalesce(new.professional_registration_state, v_professional.license_state);
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'professionalIdentitySource', 'tenant_professionals',
      'tenantProfessionalId', v_professional.id,
      'specialty', v_professional.specialty,
      'signatureFooter', v_professional.signature_footer
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prescription_regulatory_professional_identity
  on public.prescription_regulatory_metadata;
create trigger trg_prescription_regulatory_professional_identity
before insert or update on public.prescription_regulatory_metadata
for each row execute function public.fill_prescription_regulatory_professional_identity();

comment on trigger trg_prescription_regulatory_professional_identity on public.prescription_regulatory_metadata is
  'Fills prescription professional registration fields from tenant_professionals so prescriptions/documents use the same controlled professional identity edited in Settings/Equipe.';
