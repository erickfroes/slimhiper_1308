begin;
create table security.upload_reservations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  user_id uuid not null references auth.users(id), bucket text not null, object_path text not null,
  size_bytes bigint not null check(size_bytes between 1 and 20971520),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), mime_type text not null,
  status text not null default 'reserved' check(status in ('reserved','uploaded','rejected','failed')),
  created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '5 minutes',
  unique(bucket,object_path)
);
create index upload_reservations_tenant_idx on security.upload_reservations(tenant_id,status,expires_at);
create index upload_reservations_user_idx on security.upload_reservations(user_id,created_at);
alter table security.upload_reservations enable row level security;
revoke all on security.upload_reservations from public, anon, authenticated;
grant select, update on security.upload_reservations to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('upload-quarantine','upload-quarantine',false,20971520,array['application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=array['application/octet-stream'];

-- RESTRICTIVE policies cannot be bypassed by a permissive historical policy.
-- Trusted server uploads retain the service-role boundary, after validation.
create policy scanned_uploads_server_insert on storage.objects as restrictive for insert to anon,authenticated
with check(bucket_id not in ('patient-documents','signed-documents','clinical-attachments','evidence-packages',
  'chat-attachments','progress-photos','payment-receipts','meal-photos','patient-profile-photos','user-profile-avatars','upload-quarantine'));
create policy scanned_uploads_no_browser_overwrite on storage.objects as restrictive for update to anon,authenticated
using(bucket_id not in ('patient-documents','signed-documents','clinical-attachments','evidence-packages',
  'chat-attachments','progress-photos','payment-receipts','meal-photos','patient-profile-photos','user-profile-avatars','upload-quarantine'))
with check(bucket_id not in ('patient-documents','signed-documents','clinical-attachments','evidence-packages',
  'chat-attachments','progress-photos','payment-receipts','meal-photos','patient-profile-photos','user-profile-avatars','upload-quarantine'));
create policy quarantine_no_browser_read on storage.objects as restrictive for select to anon,authenticated
using(bucket_id <> 'upload-quarantine');
create policy sealed_documents_no_browser_delete on storage.objects as restrictive for delete to anon,authenticated
using(bucket_id not in ('signed-documents','evidence-packages','upload-quarantine'));

create or replace function public.can_submit_secure_upload(p_bucket text,p_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_tenant uuid; v_subject uuid;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or p_path is null or length(p_path)>512 or p_path !~ '^[A-Za-z0-9/_. ()-]+$'
    or p_path ~ '(^|/)\.\.?(/|$)' or p_path like '%//%'
    or not security.is_valid_uuid_text(split_part(p_path,'/',1))
    or not security.is_valid_uuid_text(split_part(p_path,'/',2)) then return false; end if;
  v_tenant := split_part(p_path,'/',1)::uuid; v_subject := split_part(p_path,'/',2)::uuid;
  if not security.is_tenant_member(v_tenant) then return false; end if;
  case p_bucket
    when 'user-profile-avatars' then
      return security.is_valid_user_profile_avatar_path(p_path)
        and exists(select 1 from public.tenant_memberships where tenant_id=v_tenant and user_id=v_subject and status='active')
        and (v_subject=auth.uid() or security.has_permission(v_tenant,'settings.write',true)
          or security.has_permission(v_tenant,'tenant.users.manage',true));
    when 'patient-profile-photos' then
      return security.is_valid_patient_profile_photo_path(p_path)
        and security.has_permission(v_tenant,'patients.write',false)
        and exists(select 1 from public.patients where tenant_id=v_tenant and id=v_subject);
    when 'chat-attachments' then
      return security.is_valid_chat_attachment_path(p_path) and exists(select 1 from public.chat_attachments a
        where a.tenant_id=v_tenant and a.storage_bucket=p_bucket and a.storage_path=p_path and a.status='pending'
        and a.uploaded_by=auth.uid() and (public.has_permission(v_tenant,'chat.write')
          or public.can_access_patient_portal_patient(v_tenant,a.patient_id)));
    when 'progress-photos' then
      return security.is_valid_progress_photo_path(p_path) and exists(select 1 from public.progress_photos a
        where a.tenant_id=v_tenant and a.storage_bucket=p_bucket and a.storage_path=p_path
          and a.status in ('pending_upload','failed') and a.retention_status='active'
          and security.can_access_progress_photo(v_tenant,a.patient_id,true,false));
    when 'payment-receipts' then
      return security.is_valid_payment_receipt_path(p_path) and exists(select 1 from public.payment_receipts a
        where a.tenant_id=v_tenant and a.storage_bucket=p_bucket and a.storage_path=p_path and a.status='pending_upload'
        and a.submitted_by=auth.uid() and (public.has_clinical_permission(v_tenant,'financial.write')
          or public.can_access_patient_portal_patient(v_tenant,a.patient_id)));
    when 'meal-photos' then
      return security.is_valid_patient_daily_photo_path(p_path)
        and public.can_access_patient_portal_patient(v_tenant,v_subject)
        and exists(select 1 from public.meal_entries a where a.tenant_id=v_tenant and a.patient_id=v_subject
          and a.photo_storage_bucket=p_bucket and a.photo_storage_path=p_path and a.photo_upload_status in ('pending_upload','failed'));
    when 'patient-documents','clinical-attachments' then
      return security.is_valid_clinical_storage_path(p_path)
        and public.has_clinical_permission(v_tenant,'documents.write')
        and exists(select 1 from public.generated_documents a where a.tenant_id=v_tenant
          and a.patient_id=v_subject and a.storage_bucket=p_bucket and a.storage_path=p_path and a.status in ('draft','generated'));
    else return false;
  end case;
end;
$$;
revoke all on function public.can_submit_secure_upload(text,text) from public,anon;
grant execute on function public.can_submit_secure_upload(text,text) to authenticated;

create or replace function public.reserve_secure_upload(p_bucket text,p_path text,p_size bigint,p_mime text,p_sha256 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_id uuid; v_total bigint; v_daily bigint; v_count integer; v_bucket storage.buckets%rowtype;
begin
  if not public.can_submit_secure_upload(p_bucket,p_path) then raise exception 'upload_forbidden' using errcode='42501'; end if;
  select * into v_bucket from storage.buckets where id=p_bucket and not public;
  if v_bucket.id is null or p_size is null or p_size not between 1 and least(coalesce(v_bucket.file_size_limit,10485760),10485760)
    or p_mime is null or p_mime not in ('application/pdf','image/jpeg','image/png','image/webp')
    or (v_bucket.allowed_mime_types is not null and not p_mime=any(v_bucket.allowed_mime_types))
    or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid_upload'; end if;
  v_tenant := split_part(p_path,'/',1)::uuid;
  perform pg_advisory_xact_lock(hashtextextended('upload-user-quota:'||auth.uid()::text,0));
  perform pg_advisory_xact_lock(hashtextextended('upload-quota:'||v_tenant::text,0));
  select coalesce(sum(size_bytes),0),count(*) into v_daily,v_count from security.upload_reservations
    where user_id=auth.uid() and created_at>now()-interval '24 hours';
  if v_daily+p_size>104857600 or v_count>=100 then raise exception 'upload_daily_quota' using errcode='54000'; end if;
  select coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,15}$' then (metadata->>'size')::bigint else 0 end),0)
    into v_total from storage.objects where name like v_tenant::text||'/%';
  select v_total+coalesce(sum(size_bytes),0) into v_total from security.upload_reservations
    where tenant_id=v_tenant and status='reserved' and expires_at>now();
  if v_total+p_size>1073741824 then raise exception 'upload_tenant_quota' using errcode='54000'; end if;
  if exists(select 1 from storage.objects where bucket_id=p_bucket and name=p_path) then
    raise exception 'upload_immutable_path' using errcode='23505';
  end if;
  insert into security.upload_reservations(tenant_id,user_id,bucket,object_path,size_bytes,sha256,mime_type)
    values(v_tenant,auth.uid(),p_bucket,p_path,p_size,p_sha256,p_mime) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.reserve_secure_upload(text,text,bigint,text,text) from public,anon;
grant execute on function public.reserve_secure_upload(text,text,bigint,text,text) to authenticated;

create or replace function public.finish_secure_upload(p_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row security.upload_reservations%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_status is null or p_status not in ('uploaded','failed','rejected') then raise exception 'invalid_status'; end if;
  update security.upload_reservations set status=p_status where id=p_id and status='reserved' returning * into v_row;
  if v_row.id is null then raise exception 'upload_reservation_unavailable'; end if;
  insert into public.audit_logs(tenant_id,user_id,action,entity_type,entity_id,metadata)
    values(v_row.tenant_id,v_row.user_id,'security.upload_'||p_status,'upload',v_row.id,
      jsonb_build_object('bytes',v_row.size_bytes,'mime',v_row.mime_type,'scanner','clamav'));
end;
$$;
revoke all on function public.finish_secure_upload(uuid,text) from public,anon,authenticated;
grant execute on function public.finish_secure_upload(uuid,text) to service_role;
commit;
