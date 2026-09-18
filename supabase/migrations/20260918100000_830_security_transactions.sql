-- Forward-only hardening. Apply before deploying the matching Next/Edge code.
begin;

create table security.request_budgets (
  scope text not null, subject_hash text not null, hits integer not null,
  resets_at timestamptz not null, primary key (scope, subject_hash)
);
create index request_budgets_expiry_idx on security.request_budgets(resets_at);
alter table security.request_budgets enable row level security;
revoke all on security.request_budgets from public, anon, authenticated;

create or replace function public.consume_security_rate_limit(
  p_scope text, p_subject_hash text, p_limit integer, p_window_seconds integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_budget security.request_budgets%rowtype; v_now timestamptz := clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_scope is null or length(p_scope) not between 1 and 200
    or p_subject_hash is null or p_subject_hash !~ '^[a-f0-9]{64}$'
    or p_limit is null or p_limit not between 1 and 10000
    or p_window_seconds is null or p_window_seconds not between 1 and 3600 then
    raise exception 'invalid_rate_budget';
  end if;
  insert into security.request_budgets as b(scope, subject_hash, hits, resets_at)
  values(p_scope, p_subject_hash, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict(scope, subject_hash) do update set
    hits = case when b.resets_at <= v_now then 1 else least(b.hits + 1, p_limit + 1) end,
    resets_at = case when b.resets_at <= v_now then excluded.resets_at else b.resets_at end
  returning * into v_budget;
  if v_budget.hits = 1 then
    delete from security.request_budgets where (scope, subject_hash) in (
      select scope, subject_hash from security.request_budgets
      where resets_at < v_now - interval '1 hour' limit 100
    );
  end if;
  return jsonb_build_object('allowed', v_budget.hits <= p_limit,
    'retryAfter', greatest(1, ceil(extract(epoch from v_budget.resets_at - v_now))::integer));
end;
$$;
revoke all on function public.consume_security_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_security_rate_limit(text,text,integer,integer) to service_role;

alter table public.tenant_memberships add column invitation_version uuid not null default gen_random_uuid();
alter table public.tenant_invitation_tokens
  add column user_id uuid references auth.users(id) on delete cascade,
  add column membership_id uuid references public.tenant_memberships(id) on delete cascade,
  add column invitation_version uuid;
-- Old links cannot establish the new identity/membership binding: require reissue.
update public.tenant_invitation_tokens set revoked_at = now()
where used_at is null and revoked_at is null;

create or replace function public.bind_tenant_invitation(p_invitation_id uuid, p_membership_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_m public.tenant_memberships%rowtype; v_i public.tenant_invitation_tokens%rowtype;
  v_email text; v_version uuid := gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  select * into v_m from public.tenant_memberships where id = p_membership_id for update;
  select * into v_i from public.tenant_invitation_tokens where id = p_invitation_id for update;
  select lower(trim(email)) into v_email from auth.users where id = p_user_id;
  if v_m.id is null or v_i.id is null or v_m.user_id is distinct from p_user_id
    or v_m.tenant_id is distinct from v_i.tenant_id or v_m.role_code is distinct from v_i.role_code
    or v_email is distinct from v_i.email or v_i.used_at is not null or v_i.revoked_at is not null
    or v_i.expires_at <= clock_timestamp() or v_m.status not in ('invited','active') then
    raise exception 'invalid_invitation_binding' using errcode = '42501';
  end if;
  update public.tenant_invitation_tokens set revoked_at = clock_timestamp()
    where tenant_id = v_m.tenant_id and email = v_i.email and id <> v_i.id
    and used_at is null and revoked_at is null;
  update public.tenant_memberships set invitation_version = v_version where id = v_m.id;
  update public.tenant_invitation_tokens set user_id = p_user_id,
    membership_id = v_m.id, invitation_version = v_version where id = v_i.id;
end;
$$;
revoke all on function public.bind_tenant_invitation(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.bind_tenant_invitation(uuid,uuid,uuid) to service_role;

create or replace function security.invalidate_changed_invitation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role_code is distinct from old.role_code or new.unit_id is distinct from old.unit_id
    or new.user_id is distinct from old.user_id or new.tenant_id is distinct from old.tenant_id
    or new.status is distinct from old.status then
    new.invitation_version := gen_random_uuid();
  end if;
  return new;
end;
$$;
create trigger trg_membership_invitation_version before update on public.tenant_memberships
for each row execute function security.invalidate_changed_invitation();

create or replace function public.accept_tenant_invitation(p_token_hash text, p_tenant_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_i public.tenant_invitation_tokens%rowtype; v_m public.tenant_memberships%rowtype;
  v_uid uuid := p_user_id; v_email text; v_confirmed timestamptz; v_active boolean;
begin
  if v_uid is null or auth.role() is distinct from 'service_role' then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_invitation' using errcode = '42501';
  end if;
  select lower(trim(email)), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_confirmed is null then raise exception 'confirmed_email_required' using errcode = '42501'; end if;
  -- Lock membership first, consistently with binding/resend; then recheck token.
  select * into v_i from public.tenant_invitation_tokens where token_hash = p_token_hash;
  select * into v_m from public.tenant_memberships where id = v_i.membership_id for update;
  select * into v_i from public.tenant_invitation_tokens where token_hash = p_token_hash for update;
  if v_i.id is null or v_m.id is null or v_i.user_id is distinct from v_uid
    or v_m.user_id is distinct from v_uid or v_i.email is distinct from v_email
    or v_i.tenant_id is distinct from v_m.tenant_id or v_i.role_code is distinct from v_m.role_code
    or v_i.invitation_version is distinct from v_m.invitation_version
    or v_i.used_at is not null or v_i.revoked_at is not null or v_i.expires_at <= clock_timestamp()
    or (p_tenant_id is not null and p_tenant_id <> v_i.tenant_id)
    or v_m.status not in ('invited','active')
    or not exists(select 1 from public.tenants where id = v_i.tenant_id and status = 'active')
    or not exists(select 1 from public.profiles where id = v_uid and is_active) then
    raise exception 'invalid_invitation' using errcode = '42501';
  end if;
  v_active := v_m.status = 'active';
  update public.tenant_memberships set status = 'active', accepted_at = coalesce(accepted_at, now())
    where id = v_m.id;
  if v_m.role_code = 'patient' then
    update public.patient_accounts set status = 'active', linked_at = now(), updated_at = now()
      where tenant_id = v_m.tenant_id and user_id = v_uid and status = 'pending';
  elsif v_m.role_code = 'guardian' then
    update public.guardian_links set status = 'active', updated_at = now()
      where tenant_id = v_m.tenant_id and guardian_user_id = v_uid and status = 'pending';
  end if;
  if v_m.role_code in ('patient','guardian') then
    update public.patient_portal_access_invites set status = 'active', activated_at = now(), updated_at = now()
      where tenant_id = v_m.tenant_id and user_id = v_uid and status in ('pending','linked');
  end if;
  update public.profiles set active_tenant_id = v_m.tenant_id where id = v_uid;
  insert into public.audit_logs(tenant_id,user_id,action,entity_type,entity_id,metadata)
    values(v_m.tenant_id,v_uid,'tenant_membership.invite_accepted','tenant_membership',v_m.id,
      jsonb_build_object('source','atomic_invitation','roleCode',v_m.role_code));
  update public.tenant_invitation_tokens set used_at = clock_timestamp() where id = v_i.id;
  return jsonb_build_object('acceptedMemberships',case when v_active then '[]'::jsonb else jsonb_build_array(v_m.id) end,
    'activeTenantId',v_m.tenant_id,'alreadyActive',v_active);
end;
$$;
revoke all on function public.accept_tenant_invitation(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.accept_tenant_invitation(text,uuid,uuid) to service_role;
commit;
