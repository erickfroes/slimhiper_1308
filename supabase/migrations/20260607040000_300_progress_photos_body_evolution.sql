-- M09 - Body evolution: private progress photos, signed downloads and portal-safe summary.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function security.is_valid_progress_photo_path(p_object_name text)
returns boolean
language sql
stable
as $$
  select
    p_object_name is not null
    and array_length(string_to_array(p_object_name, '/'), 1) = 4
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 1))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 2))
    and security.is_valid_uuid_text(split_part(p_object_name, '/', 3))
    and nullif(split_part(p_object_name, '/', 4), '') is not null
    and split_part(p_object_name, '/', 4) !~ '[\\/]';
$$;

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  patient_id uuid not null,
  encounter_id uuid,
  measurement_id uuid,
  angle text not null default 'front'
    check (angle in ('front', 'back', 'left', 'right', 'other')),
  photo_date date not null default current_date,
  captured_at timestamptz not null default now(),
  weight_at_photo numeric(6,2),
  visibility_to_patient boolean not null default false,
  patient_visible_at timestamptz,
  patient_visible_by uuid references public.profiles(id) on delete set null,
  consent_for_comparison boolean not null default false,
  storage_bucket text not null default 'progress-photos'
    check (storage_bucket = 'progress-photos'),
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status text not null default 'pending_upload'
    check (status in ('pending_upload', 'uploaded', 'failed', 'deleted')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  notes text,
  retention_expires_at timestamptz not null default (now() + interval '6 years'),
  retention_status text not null default 'active'
    check (retention_status in ('active', 'delete_due', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (storage_bucket, storage_path),
  constraint progress_photos_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint progress_photos_encounter_same_tenant
    foreign key (tenant_id, encounter_id)
    references public.encounters(tenant_id, id),
  constraint progress_photos_measurement_same_tenant
    foreign key (tenant_id, measurement_id)
    references public.measurements(tenant_id, id),
  constraint progress_photos_visibility_consistency
    check (
      (visibility_to_patient = false and patient_visible_at is null)
      or (visibility_to_patient = true and patient_visible_at is not null)
    ),
  constraint progress_photos_storage_path_shape
    check (
      storage_path is null
      or (
        security.is_valid_progress_photo_path(storage_path)
        and storage_path = tenant_id::text || '/' || patient_id::text || '/' || id::text || '/' || split_part(storage_path, '/', 4)
      )
    )
);

create index idx_progress_photos_patient_date
  on public.progress_photos(tenant_id, patient_id, photo_date desc, captured_at desc);
create index idx_progress_photos_patient_visible
  on public.progress_photos(tenant_id, patient_id, visibility_to_patient, photo_date desc)
  where status = 'uploaded' and retention_status = 'active';
create index idx_progress_photos_retention
  on public.progress_photos(retention_status, retention_expires_at)
  where retention_status <> 'deleted';

select security.touch_updated_at('public.progress_photos');

alter table public.progress_photos enable row level security;

create or replace function security.seed_tenant_progress_photo_rbac(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.permissions (tenant_id, code, description)
  select p_tenant_id, code, description
  from (
    values
      ('progress_photos.read', 'Read body progress photos'),
      ('progress_photos.write', 'Upload and manage body progress photos'),
      ('progress_photos.release', 'Release body progress photos to patient portal')
  ) as seed(code, description)
  on conflict (tenant_id, code) do update
  set description = excluded.description,
      updated_at = now();

  insert into public.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant_id, r.id, p.id
  from (
    values
      ('tenant_owner', 'progress_photos.read'),
      ('tenant_owner', 'progress_photos.write'),
      ('tenant_owner', 'progress_photos.release'),
      ('clinic_admin', 'progress_photos.read'),
      ('clinic_admin', 'progress_photos.write'),
      ('clinic_admin', 'progress_photos.release'),
      ('physician', 'progress_photos.read'),
      ('physician', 'progress_photos.write'),
      ('physician', 'progress_photos.release'),
      ('nutritionist', 'progress_photos.read'),
      ('nutritionist', 'progress_photos.write'),
      ('nutritionist', 'progress_photos.release'),
      ('fitness_professional', 'progress_photos.read'),
      ('fitness_professional', 'progress_photos.write')
  ) as matrix(role_code, permission_code)
  join public.roles r
    on r.tenant_id = p_tenant_id
   and r.name = matrix.role_code
  join public.permissions p
    on p.tenant_id = p_tenant_id
   and p.code = matrix.permission_code
  on conflict (tenant_id, role_id, permission_id) do nothing;
end;
$$;

do $$
declare
  v_tenant_id uuid;
begin
  for v_tenant_id in select id from public.tenants loop
    perform security.seed_tenant_progress_photo_rbac(v_tenant_id);
  end loop;
end $$;

create or replace function public.seed_new_tenant_rbac()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform security.seed_tenant_rbac(new.id);
  perform security.seed_tenant_progress_photo_rbac(new.id);
  return new;
end;
$$;

create or replace function security.can_access_progress_photo(
  p_tenant_id uuid,
  p_patient_id uuid,
  p_write boolean default false,
  p_release boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.patients p
    where p.tenant_id = p_tenant_id
      and p.id = p_patient_id
  )
  and case
    when p_release then (
      security.can_manage_tenant(p_tenant_id)
      or security.has_permission(p_tenant_id, 'progress_photos.release', false)
    )
    when p_write then (
      security.can_manage_tenant(p_tenant_id)
      or security.has_permission(p_tenant_id, 'progress_photos.write', false)
    )
    else (
      security.can_manage_tenant(p_tenant_id)
      or security.has_permission(p_tenant_id, 'progress_photos.read', false)
    )
  end;
$$;

drop policy if exists progress_photos_select_staff on public.progress_photos;
create policy progress_photos_select_staff
on public.progress_photos for select
to authenticated
using (security.can_access_progress_photo(tenant_id, patient_id, false, false));

drop policy if exists progress_photos_select_patient_released on public.progress_photos;
create policy progress_photos_select_patient_released
on public.progress_photos for select
to authenticated
using (
  status = 'uploaded'
  and retention_status = 'active'
  and visibility_to_patient = true
  and public.can_access_patient_portal_patient(tenant_id, patient_id)
);

drop policy if exists progress_photos_write_staff on public.progress_photos;
create policy progress_photos_write_staff
on public.progress_photos for all
to authenticated
using (security.can_access_progress_photo(tenant_id, patient_id, true, false))
with check (security.can_access_progress_photo(tenant_id, patient_id, true, false));

drop policy if exists "progress_photos_storage_select" on storage.objects;
create policy "progress_photos_storage_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'progress-photos'
  and security.is_valid_progress_photo_path(name)
  and exists (
    select 1
    from public.progress_photos pp
    where pp.storage_bucket = bucket_id
      and pp.storage_path = name
      and pp.status = 'uploaded'
      and pp.retention_status = 'active'
      and (
        security.can_access_progress_photo(pp.tenant_id, pp.patient_id, false, false)
        or (
          pp.visibility_to_patient = true
          and public.can_access_patient_portal_patient(pp.tenant_id, pp.patient_id)
        )
      )
  )
);

drop policy if exists "progress_photos_storage_insert" on storage.objects;
create policy "progress_photos_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'progress-photos'
  and security.is_valid_progress_photo_path(name)
  and exists (
    select 1
    from public.progress_photos pp
    where pp.storage_bucket = bucket_id
      and pp.storage_path = name
      and pp.status in ('pending_upload', 'failed')
      and security.can_access_progress_photo(pp.tenant_id, pp.patient_id, true, false)
  )
);

drop policy if exists "progress_photos_storage_update" on storage.objects;
create policy "progress_photos_storage_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'progress-photos'
  and security.is_valid_progress_photo_path(name)
  and exists (
    select 1
    from public.progress_photos pp
    where pp.storage_bucket = bucket_id
      and pp.storage_path = name
      and security.can_access_progress_photo(pp.tenant_id, pp.patient_id, true, false)
  )
)
with check (
  bucket_id = 'progress-photos'
  and security.is_valid_progress_photo_path(name)
  and exists (
    select 1
    from public.progress_photos pp
    where pp.storage_bucket = bucket_id
      and pp.storage_path = name
      and security.can_access_progress_photo(pp.tenant_id, pp.patient_id, true, false)
  )
);

create or replace function public.get_patient_evolution_snapshot(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_measurements jsonb := '[]'::jsonb;
  v_bioimpedance jsonb := '[]'::jsonb;
  v_lab_orders jsonb := '[]'::jsonb;
  v_lab_results jsonb := '[]'::jsonb;
  v_progress_photos jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select p.tenant_id
  into v_tenant_id
  from public.patients p
  where p.id = p_patient_id
    and security.can_access_progress_photo(p.tenant_id, p.id, false, false)
  limit 1;

  if v_tenant_id is null then
    raise exception 'patient_not_found_or_forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'patientId', m.patient_id,
    'measuredAt', m.measured_at,
    'heightCm', m.height_cm,
    'weightKg', m.weight_kg,
    'bmi', m.bmi,
    'bodyFatPercent', m.body_fat_pct,
    'waistCm', m.waist_cm,
    'hipCm', m.hip_cm,
    'notes', m.notes
  ) order by m.measured_at desc), '[]'::jsonb)
  into v_measurements
  from public.measurements m
  where m.tenant_id = v_tenant_id
    and m.patient_id = p_patient_id
    and m.status <> 'void';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', br.id,
    'patientId', br.patient_id,
    'measuredAt', br.measured_at,
    'payload', br.result_payload
  ) order by br.measured_at desc), '[]'::jsonb)
  into v_bioimpedance
  from public.bioimpedance_results br
  where br.tenant_id = v_tenant_id
    and br.patient_id = p_patient_id
    and br.status <> 'void';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', lo.id,
    'patientId', lo.patient_id,
    'status', lo.status,
    'orderedAt', lo.ordered_at,
    'payload', lo.order_payload
  ) order by lo.ordered_at desc), '[]'::jsonb)
  into v_lab_orders
  from public.lab_orders lo
  where lo.tenant_id = v_tenant_id
    and lo.patient_id = p_patient_id
    and lo.status <> 'cancelled';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', lr.id,
    'patientId', lr.patient_id,
    'labOrderId', lr.lab_order_id,
    'status', lr.status,
    'resultAt', lr.result_at,
    'payload', lr.result_payload
  ) order by lr.result_at desc nulls last, lr.created_at desc), '[]'::jsonb)
  into v_lab_results
  from public.lab_results lr
  where lr.tenant_id = v_tenant_id
    and lr.patient_id = p_patient_id
    and lr.status <> 'void';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pp.id,
    'patientId', pp.patient_id,
    'angle', pp.angle,
    'photoDate', pp.photo_date,
    'capturedAt', pp.captured_at,
    'weightAtPhoto', pp.weight_at_photo,
    'visibilityToPatient', pp.visibility_to_patient,
    'patientVisibleAt', pp.patient_visible_at,
    'consentForComparison', pp.consent_for_comparison,
    'status', pp.status,
    'fileName', pp.file_name,
    'mimeType', pp.mime_type,
    'sizeBytes', pp.size_bytes,
    'notes', pp.notes,
    'hasPhoto', pp.status = 'uploaded' and pp.storage_path is not null
  ) order by pp.photo_date desc, pp.captured_at desc), '[]'::jsonb)
  into v_progress_photos
  from public.progress_photos pp
  where pp.tenant_id = v_tenant_id
    and pp.patient_id = p_patient_id
    and pp.status <> 'deleted'
    and pp.retention_status = 'active';

  return jsonb_build_object(
    'measurements', v_measurements,
    'bioimpedance', v_bioimpedance,
    'labOrders', v_lab_orders,
    'labResults', v_lab_results,
    'progressPhotos', v_progress_photos
  );
end;
$$;

create or replace function public.get_patient_portal_evolution_summary(p_patient_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_link record;
  v_patient_id uuid;
  v_tenant_id uuid;
  v_latest_measurement jsonb := null;
  v_released_photos jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select tenant_id, patient_id
  into v_link
  from security.resolve_patient_portal_link(p_patient_id)
  limit 1;

  v_tenant_id := v_link.tenant_id;
  v_patient_id := v_link.patient_id;

  if v_tenant_id is null or v_patient_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', m.id,
    'measuredAt', m.measured_at,
    'weightKg', m.weight_kg,
    'heightCm', m.height_cm,
    'bmi', m.bmi,
    'bodyFatPercent', m.body_fat_pct,
    'waistCm', m.waist_cm,
    'hipCm', m.hip_cm
  )
  into v_latest_measurement
  from public.measurements m
  where m.tenant_id = v_tenant_id
    and m.patient_id = v_patient_id
    and m.status <> 'void'
  order by m.measured_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pp.id,
    'angle', pp.angle,
    'photoDate', pp.photo_date,
    'capturedAt', pp.captured_at,
    'weightAtPhoto', pp.weight_at_photo,
    'fileName', pp.file_name
  ) order by pp.photo_date desc, pp.captured_at desc), '[]'::jsonb)
  into v_released_photos
  from public.progress_photos pp
  where pp.tenant_id = v_tenant_id
    and pp.patient_id = v_patient_id
    and pp.status = 'uploaded'
    and pp.retention_status = 'active'
    and pp.visibility_to_patient = true
  limit 12;

  return jsonb_build_object(
    'selectedPatientId', v_patient_id,
    'latestMeasurement', v_latest_measurement,
    'releasedPhotos', v_released_photos
  );
end;
$$;

create or replace function public.prepare_progress_photo_upload(
  p_patient_id uuid,
  p_angle text,
  p_photo_date date,
  p_weight_at_photo numeric,
  p_consent_for_comparison boolean,
  p_visibility_to_patient boolean,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_notes text default null,
  p_encounter_id uuid default null,
  p_measurement_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_photo_id uuid := gen_random_uuid();
  v_angle text := coalesce(nullif(p_angle, ''), 'front');
  v_mime_type text := lower(coalesce(nullif(p_mime_type, ''), 'application/octet-stream'));
  v_file_name text := left(coalesce(nullif(p_file_name, ''), 'progress-photo'), 160);
  v_safe_file_name text;
  v_extension text;
  v_storage_path text;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select p.tenant_id into v_tenant_id
  from public.patients p
  where p.id = p_patient_id
  limit 1;

  if v_tenant_id is null or not security.can_access_progress_photo(v_tenant_id, p_patient_id, true, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_visibility_to_patient = true
     and not security.can_access_progress_photo(v_tenant_id, p_patient_id, false, true) then
    raise exception 'progress_photo_release_required' using errcode = '42501';
  end if;

  if v_angle not in ('front', 'back', 'left', 'right', 'other') then
    raise exception 'invalid_angle' using errcode = '22023';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 8388608 then
    raise exception 'invalid_file_size' using errcode = '22023';
  end if;

  if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif') then
    raise exception 'invalid_file_type' using errcode = '22023';
  end if;

  v_safe_file_name := regexp_replace(v_file_name, '[^a-zA-Z0-9._-]+', '_', 'g');
  v_safe_file_name := trim(both '_' from v_safe_file_name);
  if v_safe_file_name = '' then
    v_safe_file_name := 'progress-photo';
  end if;

  v_extension := case
    when v_mime_type = 'image/png' then 'png'
    when v_mime_type = 'image/webp' then 'webp'
    when v_mime_type = 'image/heic' then 'heic'
    when v_mime_type = 'image/heif' then 'heif'
    else 'jpg'
  end;

  if position('.' in v_safe_file_name) = 0 then
    v_safe_file_name := v_safe_file_name || '.' || v_extension;
  end if;

  v_storage_path := v_tenant_id::text || '/' || p_patient_id::text || '/' || v_photo_id::text || '/' || v_safe_file_name;

  insert into public.progress_photos (
    id,
    tenant_id,
    patient_id,
    encounter_id,
    measurement_id,
    angle,
    photo_date,
    weight_at_photo,
    visibility_to_patient,
    patient_visible_at,
    patient_visible_by,
    consent_for_comparison,
    storage_path,
    file_name,
    mime_type,
    size_bytes,
    status,
    uploaded_by,
    notes
  )
  values (
    v_photo_id,
    v_tenant_id,
    p_patient_id,
    p_encounter_id,
    p_measurement_id,
    v_angle,
    coalesce(p_photo_date, current_date),
    p_weight_at_photo,
    coalesce(p_visibility_to_patient, false),
    case when coalesce(p_visibility_to_patient, false) then now() else null end,
    case when coalesce(p_visibility_to_patient, false) then v_user_id else null end,
    coalesce(p_consent_for_comparison, false),
    v_storage_path,
    v_safe_file_name,
    v_mime_type,
    p_size_bytes,
    'pending_upload',
    v_user_id,
    nullif(left(coalesce(p_notes, ''), 1000), '')
  );

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    v_user_id,
    'progress_photo_upload_prepared',
    'progress_photo',
    v_photo_id,
    jsonb_build_object('patientId', p_patient_id, 'angle', v_angle, 'visibilityToPatient', coalesce(p_visibility_to_patient, false))
  );

  insert into public.patient_timeline_events (
    tenant_id,
    patient_id,
    event_type,
    category,
    status,
    title,
    description,
    actor_name,
    status_label,
    details_href,
    event_at,
    payload
  )
  values (
    v_tenant_id,
    p_patient_id,
    'foto_progresso_registrada',
    'clinical',
    'pending_upload',
    'Foto de progresso preparada',
    'A equipe iniciou o registro de uma foto corporal privada.',
    'Equipe clinica',
    'Upload pendente',
    '/clinic/patients/' || p_patient_id::text || '?tab=evolucao',
    now(),
    jsonb_build_object('entityId', v_photo_id, 'angle', v_angle)
  );

  return jsonb_build_object(
    'id', v_photo_id,
    'bucket', 'progress-photos',
    'path', v_storage_path,
    'fileName', v_safe_file_name,
    'mimeType', v_mime_type,
    'sizeBytes', p_size_bytes
  );
end;
$$;

create or replace function public.complete_progress_photo_upload(
  p_photo_id uuid,
  p_status text default 'uploaded'
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_photo public.progress_photos%rowtype;
  v_status text := coalesce(nullif(p_status, ''), 'uploaded');
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_photo
  from public.progress_photos
  where id = p_photo_id;

  if v_photo.id is null or not security.can_access_progress_photo(v_photo.tenant_id, v_photo.patient_id, true, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_status not in ('uploaded', 'failed') then
    raise exception 'invalid_upload_status' using errcode = '22023';
  end if;

  update public.progress_photos
  set status = v_status,
      metadata = metadata || jsonb_build_object('completedAt', now(), 'completedBy', v_user_id)
  where tenant_id = v_photo.tenant_id
    and id = v_photo.id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_photo.tenant_id,
    v_user_id,
    'progress_photo_upload_' || v_status,
    'progress_photo',
    v_photo.id,
    jsonb_build_object('patientId', v_photo.patient_id)
  );

  return jsonb_build_object('id', v_photo.id, 'status', v_status);
end;
$$;

create or replace function public.set_progress_photo_patient_visibility(
  p_photo_id uuid,
  p_patient_id uuid,
  p_visible boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_photo public.progress_photos%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_photo
  from public.progress_photos
  where id = p_photo_id
    and patient_id = p_patient_id;

  if v_photo.id is null or not security.can_access_progress_photo(v_photo.tenant_id, v_photo.patient_id, false, true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_visible = true and v_photo.status <> 'uploaded' then
    raise exception 'photo_not_uploaded' using errcode = '22023';
  end if;

  update public.progress_photos
  set visibility_to_patient = coalesce(p_visible, false),
      patient_visible_at = case when coalesce(p_visible, false) then now() else null end,
      patient_visible_by = case when coalesce(p_visible, false) then v_user_id else null end
  where tenant_id = v_photo.tenant_id
    and id = v_photo.id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_photo.tenant_id,
    v_user_id,
    case when coalesce(p_visible, false) then 'progress_photo_released_to_patient' else 'progress_photo_hidden_from_patient' end,
    'progress_photo',
    v_photo.id,
    jsonb_build_object('patientId', v_photo.patient_id)
  );

  if coalesce(p_visible, false) then
    insert into public.patient_timeline_events (
      tenant_id,
      patient_id,
      event_type,
      category,
      status,
      title,
      description,
      actor_name,
      status_label,
      details_href,
      event_at,
      payload
    )
    values (
      v_photo.tenant_id,
      v_photo.patient_id,
      'foto_progresso_liberada',
      'patient_app',
      'released',
      'Foto de progresso liberada',
      'Uma foto de evolucao corporal foi liberada para o portal do paciente.',
      'Equipe clinica',
      'Liberada',
      '/clinic/patients/' || v_photo.patient_id::text || '?tab=evolucao',
      now(),
      jsonb_build_object('entityId', v_photo.id, 'angle', v_photo.angle)
    );
  end if;

  return jsonb_build_object('id', v_photo.id, 'visibilityToPatient', coalesce(p_visible, false));
end;
$$;

create or replace function public.get_progress_photo_download(
  p_photo_id uuid,
  p_patient_id uuid,
  p_expires_in integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_photo public.progress_photos%rowtype;
  v_expires integer := greatest(60, least(600, coalesce(p_expires_in, 300)));
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_photo
  from public.progress_photos
  where id = p_photo_id
    and patient_id = p_patient_id;

  if v_photo.id is null then
    raise exception 'photo_not_found' using errcode = 'P0002';
  end if;

  if v_photo.status <> 'uploaded'
     or v_photo.retention_status <> 'active'
     or v_photo.storage_bucket <> 'progress-photos'
     or v_photo.storage_path is null then
    raise exception 'photo_not_available' using errcode = '22023';
  end if;

  if not (
    security.can_access_progress_photo(v_photo.tenant_id, v_photo.patient_id, false, false)
    or (
      v_photo.visibility_to_patient = true
      and security.can_access_patient_portal_patient(v_photo.tenant_id, v_photo.patient_id)
    )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'bucket', v_photo.storage_bucket,
    'path', v_photo.storage_path,
    'expiresInSeconds', v_expires
  );
end;
$$;

revoke all on function security.is_valid_progress_photo_path(text) from public;
revoke all on function security.seed_tenant_progress_photo_rbac(uuid) from public;
revoke all on function security.can_access_progress_photo(uuid, uuid, boolean, boolean) from public;
revoke all on function public.get_patient_evolution_snapshot(uuid) from public;
revoke all on function public.get_patient_portal_evolution_summary(uuid) from public;
revoke all on function public.prepare_progress_photo_upload(uuid, text, date, numeric, boolean, boolean, text, text, bigint, text, uuid, uuid) from public;
revoke all on function public.complete_progress_photo_upload(uuid, text) from public;
revoke all on function public.set_progress_photo_patient_visibility(uuid, uuid, boolean) from public;
revoke all on function public.get_progress_photo_download(uuid, uuid, integer) from public;

grant execute on function security.is_valid_progress_photo_path(text) to authenticated, service_role;
grant execute on function security.seed_tenant_progress_photo_rbac(uuid) to service_role;
grant execute on function security.can_access_progress_photo(uuid, uuid, boolean, boolean) to authenticated, service_role;
grant execute on function public.get_patient_evolution_snapshot(uuid) to authenticated;
grant execute on function public.get_patient_portal_evolution_summary(uuid) to authenticated;
grant execute on function public.prepare_progress_photo_upload(uuid, text, date, numeric, boolean, boolean, text, text, bigint, text, uuid, uuid) to authenticated;
grant execute on function public.complete_progress_photo_upload(uuid, text) to authenticated;
grant execute on function public.set_progress_photo_patient_visibility(uuid, uuid, boolean) to authenticated;
grant execute on function public.get_progress_photo_download(uuid, uuid, integer) to authenticated;

grant select, insert, update on public.progress_photos to authenticated, service_role;

comment on table public.progress_photos is
  'Highly sensitive private body progress photo metadata. Bytes live in progress-photos and open only through short-lived signed URLs.';
comment on function public.get_patient_evolution_snapshot(uuid) is
  'Returns measurements, bioimpedance, labs and progress photo metadata for the Patient 360 Evolution tab.';
comment on function public.get_patient_portal_evolution_summary(uuid) is
  'Returns portal-safe body evolution summary and only patient-released progress photo metadata.';
