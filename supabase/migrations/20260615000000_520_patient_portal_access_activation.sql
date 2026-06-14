-- P1: patient portal access activation and revocation operations.
-- Staff can stage invites without external provider calls, link existing auth profiles,
-- activate/suspend/revoke patient/guardian access and audit every state change.

create table if not exists public.patient_portal_access_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null,
  invitee_type text not null check (invitee_type in ('patient', 'guardian')),
  email text,
  phone text,
  relationship text,
  status text not null default 'pending'
    check (status in ('pending', 'linked', 'active', 'suspended', 'revoked', 'expired')),
  user_id uuid references public.profiles(id) on delete set null,
  patient_account_id uuid references public.patient_accounts(id) on delete set null,
  guardian_link_id uuid references public.guardian_links(id) on delete set null,
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint patient_portal_access_invites_patient_same_tenant
    foreign key (tenant_id, patient_id)
    references public.patients(tenant_id, id)
    on delete cascade,
  constraint patient_portal_access_invites_contact_present
    check (email is not null or phone is not null or user_id is not null)
);

create index if not exists idx_patient_portal_invites_patient_status
  on public.patient_portal_access_invites(tenant_id, patient_id, status);
create index if not exists idx_patient_portal_invites_user_status
  on public.patient_portal_access_invites(user_id, status) where user_id is not null;

alter table public.patient_portal_access_invites enable row level security;

drop policy if exists patient_portal_invites_staff_select on public.patient_portal_access_invites;
create policy patient_portal_invites_staff_select
on public.patient_portal_access_invites for select
using (public.has_permission(tenant_id, 'patients.read'));

grant select on public.patient_portal_access_invites to authenticated, service_role;
revoke insert, update, delete on public.patient_portal_access_invites from anon, authenticated;

do $$
begin
  perform security.touch_updated_at('public.patient_portal_access_invites');
exception when undefined_function then
  null;
end $$;

create or replace function public.get_patient_portal_access_status(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security
as $$
declare
  v_tenant_id uuid;
  v_has_minimum_data boolean;
  v_patient_email text;
  v_patient_phone text;
begin
  select p.tenant_id, nullif(btrim(pp.email), ''), nullif(btrim(pp.phone), '')
    into v_tenant_id, v_patient_email, v_patient_phone
  from public.patients p
  left join public.patient_pii pp on pp.tenant_id = p.tenant_id and pp.patient_id = p.id
  where p.id = p_patient_id;

  if v_tenant_id is null then
    raise exception 'patient_not_found';
  end if;

  if not public.has_permission(v_tenant_id, 'patients.read') then
    raise exception 'forbidden';
  end if;

  v_has_minimum_data := v_patient_email is not null or v_patient_phone is not null;

  return jsonb_build_object(
    'patientId', p_patient_id,
    'tenantId', v_tenant_id,
    'status', case
      when exists (select 1 from public.patient_accounts pa where pa.tenant_id = v_tenant_id and pa.patient_id = p_patient_id and pa.status = 'active')
        or exists (select 1 from public.guardian_links gl where gl.tenant_id = v_tenant_id and gl.patient_id = p_patient_id and gl.status = 'active') then 'active'
      when exists (select 1 from public.patient_accounts pa where pa.tenant_id = v_tenant_id and pa.patient_id = p_patient_id and pa.status = 'suspended')
        or exists (select 1 from public.guardian_links gl where gl.tenant_id = v_tenant_id and gl.patient_id = p_patient_id and gl.status = 'suspended') then 'suspended'
      when exists (select 1 from public.patient_accounts pa where pa.tenant_id = v_tenant_id and pa.patient_id = p_patient_id and pa.status = 'pending')
        or exists (select 1 from public.guardian_links gl where gl.tenant_id = v_tenant_id and gl.patient_id = p_patient_id and gl.status = 'pending')
        or exists (select 1 from public.patient_portal_access_invites i where i.tenant_id = v_tenant_id and i.patient_id = p_patient_id and i.status in ('pending', 'linked')) then 'pending'
      when exists (select 1 from public.patient_accounts pa where pa.tenant_id = v_tenant_id and pa.patient_id = p_patient_id and pa.status = 'revoked')
        or exists (select 1 from public.guardian_links gl where gl.tenant_id = v_tenant_id and gl.patient_id = p_patient_id and gl.status = 'revoked') then 'revoked'
      else 'none'
    end,
    'minimumData', jsonb_build_object(
      'hasEmailOrPhone', v_has_minimum_data,
      'hasPortalConsent', coalesce((select (pp.consents ->> 'portalAccess')::boolean from public.patient_pii pp where pp.tenant_id = v_tenant_id and pp.patient_id = p_patient_id), false),
      'hasPatientRecord', true
    ),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object('id', pa.id, 'userId', pa.user_id, 'status', pa.status, 'linkedAt', pa.linked_at, 'email', pr.email))
      from public.patient_accounts pa left join public.profiles pr on pr.id = pa.user_id
      where pa.tenant_id = v_tenant_id and pa.patient_id = p_patient_id
    ), '[]'::jsonb),
    'guardians', coalesce((
      select jsonb_agg(jsonb_build_object('id', gl.id, 'userId', gl.guardian_user_id, 'status', gl.status, 'relationship', gl.relationship, 'email', pr.email))
      from public.guardian_links gl left join public.profiles pr on pr.id = gl.guardian_user_id
      where gl.tenant_id = v_tenant_id and gl.patient_id = p_patient_id
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'type', i.invitee_type, 'email', i.email, 'phone', i.phone, 'relationship', i.relationship, 'status', i.status, 'invitedAt', i.invited_at))
      from public.patient_portal_access_invites i
      where i.tenant_id = v_tenant_id and i.patient_id = p_patient_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.manage_patient_portal_access(p_patient_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security
as $$
declare
  v_tenant_id uuid;
  v_actor uuid := auth.uid();
  v_action text := coalesce(p_payload ->> 'action', 'invite');
  v_type text := coalesce(p_payload ->> 'inviteeType', 'patient');
  v_email text := nullif(lower(btrim(coalesce(p_payload ->> 'email', ''))), '');
  v_phone text := nullif(btrim(coalesce(p_payload ->> 'phone', '')), '');
  v_relationship text := nullif(btrim(coalesce(p_payload ->> 'relationship', '')), '');
  v_user_id uuid;
  v_invite_id uuid;
  v_account_id uuid;
  v_guardian_id uuid;
  v_new_status text;
begin
  select tenant_id into v_tenant_id from public.patients where id = p_patient_id;
  if v_tenant_id is null then raise exception 'patient_not_found'; end if;
  if not public.has_permission(v_tenant_id, 'patients.write') then raise exception 'forbidden'; end if;

  if v_action not in ('invite', 'activate', 'suspend', 'revoke') then raise exception 'invalid_action'; end if;
  if v_type not in ('patient', 'guardian') then raise exception 'invalid_invitee_type'; end if;

  if v_action = 'invite' then
    if v_email is null and v_phone is null then raise exception 'contact_required'; end if;
    select id into v_user_id from public.profiles where lower(email) = v_email and is_active = true limit 1;

    insert into public.patient_portal_access_invites (tenant_id, patient_id, invitee_type, email, phone, relationship, status, user_id, invited_by, metadata)
    values (v_tenant_id, p_patient_id, v_type, v_email, v_phone, v_relationship,
      case when v_user_id is null then 'pending' else 'linked' end, v_user_id, v_actor,
      jsonb_build_object('source', 'clinic_patient_form'))
    returning id into v_invite_id;

    if v_user_id is not null then
      insert into public.tenant_memberships (tenant_id, user_id, role_code, role, status, invited_by)
      values (v_tenant_id, v_user_id, v_type, v_type, 'invited', v_actor)
      on conflict (tenant_id, user_id) do update set role_code = excluded.role_code, role = excluded.role, status = case when tenant_memberships.status = 'active' then 'active' else 'invited' end, updated_at = now();

      if v_type = 'patient' then
        insert into public.patient_accounts (tenant_id, patient_id, user_id, status)
        values (v_tenant_id, p_patient_id, v_user_id, 'pending')
        on conflict (tenant_id, patient_id, user_id) do update set status = 'pending', updated_at = now()
        returning id into v_account_id;
        update public.patient_portal_access_invites set patient_account_id = v_account_id where id = v_invite_id;
      else
        insert into public.guardian_links (tenant_id, patient_id, guardian_user_id, relationship, status)
        values (v_tenant_id, p_patient_id, v_user_id, v_relationship, 'pending')
        on conflict (tenant_id, patient_id, guardian_user_id) do update set relationship = excluded.relationship, status = 'pending', updated_at = now()
        returning id into v_guardian_id;
        update public.patient_portal_access_invites set guardian_link_id = v_guardian_id where id = v_invite_id;
      end if;
    end if;

    v_new_status := 'pending';
  else
    v_new_status := case v_action when 'activate' then 'active' when 'suspend' then 'suspended' else 'revoked' end;
    update public.patient_accounts set status = v_new_status, linked_at = case when v_new_status = 'active' then coalesce(linked_at, now()) else linked_at end, updated_at = now()
      where tenant_id = v_tenant_id and patient_id = p_patient_id;
    update public.guardian_links set status = v_new_status, updated_at = now()
      where tenant_id = v_tenant_id and patient_id = p_patient_id;
    update public.patient_portal_access_invites set status = v_new_status, activated_at = case when v_new_status = 'active' then coalesce(activated_at, now()) else activated_at end, revoked_at = case when v_new_status = 'revoked' then now() else revoked_at end, updated_at = now()
      where tenant_id = v_tenant_id and patient_id = p_patient_id and status <> 'expired';
    update public.tenant_memberships tm set status = case when v_new_status = 'active' then 'active' when v_new_status = 'suspended' then 'suspended' else 'revoked' end, accepted_at = case when v_new_status = 'active' then coalesce(accepted_at, now()) else accepted_at end, updated_at = now()
      where tm.tenant_id = v_tenant_id and tm.user_id in (
        select user_id from public.patient_accounts where tenant_id = v_tenant_id and patient_id = p_patient_id
        union select guardian_user_id from public.guardian_links where tenant_id = v_tenant_id and patient_id = p_patient_id
      ) and tm.role_code in ('patient', 'guardian');
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, v_actor, 'patient_portal.' || v_action, 'patient', p_patient_id,
    jsonb_build_object('status', v_new_status, 'inviteeType', v_type, 'emailPresent', v_email is not null, 'phonePresent', v_phone is not null));

  return public.get_patient_portal_access_status(p_patient_id);
end;
$$;

revoke all on function public.get_patient_portal_access_status(uuid) from public;
revoke all on function public.manage_patient_portal_access(uuid, jsonb) from public;
grant execute on function public.get_patient_portal_access_status(uuid) to authenticated, service_role;
grant execute on function public.manage_patient_portal_access(uuid, jsonb) to authenticated, service_role;
