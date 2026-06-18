-- Profile, commercial finance context and patient portal access-by-program.
-- Adds only forward schema/functions; old migrations remain immutable.

create or replace function security.try_uuid(p_value text)
returns uuid
language sql
immutable
as $$
  select case
    when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then p_value::uuid
    else null
  end;
$$;

alter table public.patient_invoices
  add column if not exists program_id uuid,
  add column if not exists package_id uuid,
  add column if not exists enrollment_id uuid,
  add column if not exists service_id uuid,
  add column if not exists source_module text;

alter table public.payments
  add column if not exists program_id uuid,
  add column if not exists package_id uuid,
  add column if not exists enrollment_id uuid,
  add column if not exists service_id uuid,
  add column if not exists source_module text;

alter table public.patient_subscriptions
  add column if not exists program_id uuid,
  add column if not exists package_id uuid,
  add column if not exists enrollment_id uuid,
  add column if not exists service_id uuid,
  add column if not exists source_module text;

alter table public.patient_program_enrollments
  add column if not exists app_entitlements_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists access_snapshot_synced_at timestamptz;

do $$
begin
  alter table public.patient_invoices
    add constraint patient_invoices_program_same_tenant
    foreign key (tenant_id, program_id) references public.programs(tenant_id, id)
    on delete set null (program_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patient_invoices
    add constraint patient_invoices_package_same_tenant
    foreign key (tenant_id, package_id) references public.packages(tenant_id, id)
    on delete set null (package_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patient_invoices
    add constraint patient_invoices_enrollment_same_tenant
    foreign key (tenant_id, enrollment_id) references public.patient_program_enrollments(tenant_id, id)
    on delete set null (enrollment_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.payments
    add constraint payments_program_same_tenant
    foreign key (tenant_id, program_id) references public.programs(tenant_id, id)
    on delete set null (program_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.payments
    add constraint payments_package_same_tenant
    foreign key (tenant_id, package_id) references public.packages(tenant_id, id)
    on delete set null (package_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.payments
    add constraint payments_enrollment_same_tenant
    foreign key (tenant_id, enrollment_id) references public.patient_program_enrollments(tenant_id, id)
    on delete set null (enrollment_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patient_subscriptions
    add constraint patient_subscriptions_program_same_tenant
    foreign key (tenant_id, program_id) references public.programs(tenant_id, id)
    on delete set null (program_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patient_subscriptions
    add constraint patient_subscriptions_package_same_tenant
    foreign key (tenant_id, package_id) references public.packages(tenant_id, id)
    on delete set null (package_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patient_subscriptions
    add constraint patient_subscriptions_enrollment_same_tenant
    foreign key (tenant_id, enrollment_id) references public.patient_program_enrollments(tenant_id, id)
    on delete set null (enrollment_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  if to_regclass('public.services') is not null then
    alter table public.patient_invoices
      add constraint patient_invoices_service_same_tenant
      foreign key (tenant_id, service_id) references public.services(tenant_id, id)
      on delete set null (service_id);
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if to_regclass('public.services') is not null then
    alter table public.payments
      add constraint payments_service_same_tenant
      foreign key (tenant_id, service_id) references public.services(tenant_id, id)
      on delete set null (service_id);
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if to_regclass('public.services') is not null then
    alter table public.patient_subscriptions
      add constraint patient_subscriptions_service_same_tenant
      foreign key (tenant_id, service_id) references public.services(tenant_id, id)
      on delete set null (service_id);
  end if;
exception when duplicate_object then null;
end $$;

create index if not exists idx_patient_invoices_commercial_context
  on public.patient_invoices(tenant_id, patient_id, enrollment_id, program_id, package_id);
create index if not exists idx_payments_commercial_context
  on public.payments(tenant_id, patient_id, enrollment_id, program_id, package_id);
create index if not exists idx_patient_subscriptions_commercial_context
  on public.patient_subscriptions(tenant_id, patient_id, enrollment_id, program_id, package_id);
create index if not exists idx_patient_program_enrollments_access_snapshot
  on public.patient_program_enrollments(tenant_id, patient_id, status);

update public.patient_program_enrollments e
set app_entitlements_snapshot = coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', pe.key,
          'label', pe.label,
          'enabled', pe.enabled,
          'config', pe.config
        ) order by pe.created_at asc
      )
      from public.program_entitlements pe
      where pe.tenant_id = e.tenant_id
        and pe.program_id = e.program_id
    ), '[]'::jsonb),
    access_snapshot_synced_at = coalesce(access_snapshot_synced_at, now())
where app_entitlements_snapshot = '[]'::jsonb;

update public.patient_invoices i
set program_id = coalesce(i.program_id, security.try_uuid(i.metadata ->> 'program_id')),
    package_id = coalesce(
      i.package_id,
      security.try_uuid(i.metadata ->> 'package_id'),
      security.try_uuid(i.metadata ->> 'target_package_id')
    ),
    enrollment_id = coalesce(i.enrollment_id, security.try_uuid(i.metadata ->> 'enrollment_id')),
    service_id = coalesce(i.service_id, security.try_uuid(i.metadata ->> 'service_id')),
    source_module = coalesce(i.source_module, i.metadata ->> 'sourceModule', i.metadata ->> 'source')
where i.metadata <> '{}'::jsonb;

update public.patient_invoices i
set program_id = coalesce(i.program_id, e.program_id),
    package_id = coalesce(i.package_id, e.package_id),
    enrollment_id = coalesce(i.enrollment_id, e.id),
    source_module = coalesce(i.source_module, i.metadata ->> 'source', 'program_enrollment')
from public.patient_program_enrollments e
where i.tenant_id = e.tenant_id
  and i.enrollment_id = e.id;

update public.patient_invoices i
set program_id = coalesce(i.program_id, a.commercial_program_id),
    package_id = coalesce(i.package_id, a.commercial_package_id),
    enrollment_id = coalesce(i.enrollment_id, a.commercial_enrollment_id),
    service_id = coalesce(i.service_id, a.commercial_service_id),
    source_module = coalesce(i.source_module, a.metadata ->> 'sourceModule', a.metadata ->> 'source')
from public.appointments a
where a.tenant_id = i.tenant_id
  and a.financial_invoice_id = i.id;

update public.payments p
set program_id = coalesce(p.program_id, i.program_id, security.try_uuid(p.metadata ->> 'program_id')),
    package_id = coalesce(p.package_id, i.package_id, security.try_uuid(p.metadata ->> 'package_id')),
    enrollment_id = coalesce(p.enrollment_id, i.enrollment_id, security.try_uuid(p.metadata ->> 'enrollment_id')),
    service_id = coalesce(p.service_id, i.service_id, security.try_uuid(p.metadata ->> 'service_id')),
    source_module = coalesce(p.source_module, i.source_module, p.metadata ->> 'sourceModule', p.metadata ->> 'source')
from public.patient_invoices i
where i.tenant_id = p.tenant_id
  and i.id = p.patient_invoice_id;

update public.patient_subscriptions s
set program_id = coalesce(s.program_id, security.try_uuid(s.metadata ->> 'program_id')),
    package_id = coalesce(s.package_id, security.try_uuid(s.metadata ->> 'package_id')),
    enrollment_id = coalesce(s.enrollment_id, security.try_uuid(s.metadata ->> 'enrollment_id')),
    service_id = coalesce(s.service_id, security.try_uuid(s.metadata ->> 'service_id')),
    source_module = coalesce(s.source_module, s.metadata ->> 'sourceModule', s.metadata ->> 'source', 'subscription')
where s.metadata <> '{}'::jsonb;

create or replace function public.get_current_user_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_active_tenant_id uuid;
  v_active_membership public.tenant_memberships%rowtype;
  v_memberships jsonb := '[]'::jsonb;
  v_professional jsonb := null;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id;

  if not found or v_profile.is_active = false then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', tm.id,
    'tenantId', tm.tenant_id,
    'roleCode', tm.role_code,
    'legacyRole', tm.role,
    'roleKey', coalesce(tm.role_code, tm.role),
    'status', tm.status
  ) order by tm.created_at asc), '[]'::jsonb)
  into v_memberships
  from public.tenant_memberships tm
  where tm.user_id = v_user_id;

  v_active_tenant_id := coalesce(
    (
      select v_profile.active_tenant_id
      where v_profile.active_tenant_id is not null
        and exists (
          select 1
          from public.tenant_memberships tm
          where tm.user_id = v_user_id
            and tm.tenant_id = v_profile.active_tenant_id
            and tm.status = 'active'
        )
    ),
    (
      select tm.tenant_id
      from public.tenant_memberships tm
      where tm.user_id = v_user_id
        and tm.status = 'active'
      order by tm.created_at asc
      limit 1
    )
  );

  if v_active_tenant_id is not null then
    select * into v_active_membership
    from public.tenant_memberships tm
    where tm.user_id = v_user_id
      and tm.tenant_id = v_active_tenant_id
      and tm.status = 'active'
    order by tm.created_at asc
    limit 1;
  end if;

  if v_active_membership.id is not null then
    select jsonb_build_object(
      'id', tp.id,
      'professionalAddress', coalesce(tp.professional_address, '{}'::jsonb),
      'attendanceUnitIds', coalesce(to_jsonb(tp.attendance_unit_ids), '[]'::jsonb),
      'signatureFooter', tp.signature_footer,
      'publicProfile', coalesce(tp.public_profile, '{}'::jsonb)
    )
    into v_professional
    from public.tenant_professionals tp
    where tp.tenant_id = v_active_membership.tenant_id
      and tp.membership_id = v_active_membership.id
    order by case when tp.is_active then 0 else 1 end,
             case when tp.professional_type = 'physician' then 0 else 1 end,
             tp.updated_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'userId', v_profile.id,
    'email', v_profile.email,
    'fullName', v_profile.full_name,
    'phone', v_profile.phone,
    'avatarBucket', v_profile.avatar_bucket,
    'avatarPath', v_profile.avatar_path,
    'activeTenantId', v_active_tenant_id,
    'activeTenantMembership', case when v_active_membership.id is null then null else jsonb_build_object(
      'id', v_active_membership.id,
      'tenantId', v_active_membership.tenant_id,
      'roleCode', v_active_membership.role_code,
      'legacyRole', v_active_membership.role,
      'roleKey', coalesce(v_active_membership.role_code, v_active_membership.role),
      'status', v_active_membership.status
    ) end,
    'tenantMemberships', v_memberships,
    'privateProfile', coalesce(v_profile.private_profile, '{}'::jsonb),
    'professionalProfile', v_professional
  );
end;
$$;

create or replace function public.update_current_user_profile(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_active_membership public.tenant_memberships%rowtype;
  v_full_name text := nullif(btrim(coalesce(p_payload ->> 'fullName', '')), '');
  v_phone text := nullif(btrim(coalesce(p_payload ->> 'phone', '')), '');
  v_avatar jsonb := coalesce(p_payload -> 'avatar', '{}'::jsonb);
  v_avatar_path text := nullif(btrim(v_avatar ->> 'path'), '');
  v_avatar_mime_type text := nullif(btrim(v_avatar ->> 'mimeType'), '');
  v_avatar_size_bytes bigint := nullif(v_avatar ->> 'sizeBytes', '')::bigint;
  v_private_profile jsonb := coalesce(p_payload -> 'privateProfile', '{}'::jsonb);
  v_professional_payload jsonb := p_payload -> 'professionalProfile';
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if v_full_name is null or length(v_full_name) > 160 then
    raise exception 'full_name_invalid' using errcode = '22023';
  end if;
  if v_private_profile <> '{}'::jsonb and jsonb_typeof(v_private_profile) <> 'object' then
    raise exception 'private_profile_invalid' using errcode = '22023';
  end if;
  if v_professional_payload is not null and jsonb_typeof(v_professional_payload) <> 'object' then
    raise exception 'professional_profile_invalid' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found or v_profile.is_active = false then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;

  select * into v_active_membership
  from public.tenant_memberships tm
  where tm.user_id = v_user_id
    and tm.status = 'active'
    and (
      v_profile.active_tenant_id is null
      or tm.tenant_id = v_profile.active_tenant_id
    )
  order by case when tm.tenant_id = v_profile.active_tenant_id then 0 else 1 end,
           tm.created_at asc
  limit 1;

  if v_avatar_path is not null then
    if v_active_membership.id is null then
      raise exception 'active_tenant_required_for_avatar' using errcode = '42501';
    end if;
    if not security.is_valid_user_profile_avatar_path(v_avatar_path) then
      raise exception 'user_avatar_path_invalid' using errcode = '22023';
    end if;
    if v_avatar_path <> v_active_membership.tenant_id::text || '/' || v_user_id::text || '/' || split_part(v_avatar_path, '/', 3) then
      raise exception 'user_avatar_path_forbidden' using errcode = '42501';
    end if;
  end if;

  update public.profiles
  set full_name = v_full_name,
      phone = v_phone,
      avatar_bucket = case when v_avatar_path is not null then 'user-profile-avatars' else avatar_bucket end,
      avatar_path = coalesce(v_avatar_path, avatar_path),
      avatar_mime_type = coalesce(v_avatar_mime_type, avatar_mime_type),
      avatar_size_bytes = coalesce(v_avatar_size_bytes, avatar_size_bytes),
      avatar_uploaded_at = case when v_avatar_path is not null then now() else avatar_uploaded_at end,
      avatar_uploaded_by = case when v_avatar_path is not null then v_user_id else avatar_uploaded_by end,
      private_profile = v_private_profile,
      updated_at = now()
  where id = v_user_id
  returning * into v_profile;

  if v_professional_payload is not null and v_active_membership.id is not null then
    update public.tenant_professionals tp
    set professional_address = coalesce(v_professional_payload -> 'professionalAddress', tp.professional_address),
        attendance_unit_ids = coalesce(
          array(select jsonb_array_elements_text(coalesce(v_professional_payload -> 'attendanceUnitIds', '[]'::jsonb))::uuid),
          tp.attendance_unit_ids
        ),
        signature_footer = nullif(btrim(coalesce(v_professional_payload ->> 'signatureFooter', '')), ''),
        public_profile = coalesce(v_professional_payload -> 'publicProfile', tp.public_profile),
        updated_at = now()
    where tp.tenant_id = v_active_membership.tenant_id
      and tp.membership_id = v_active_membership.id;
  end if;

  if v_active_membership.tenant_id is not null then
    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    values (
      v_active_membership.tenant_id,
      v_user_id,
      'current_user_profile.updated',
      'profile',
      v_user_id::text,
      jsonb_build_object('hasAvatar', v_profile.avatar_path is not null)
    );
  end if;

  return public.get_current_user_profile();
end;
$$;

create or replace function public.sync_patient_program_access_snapshot(p_enrollment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_enrollment public.patient_program_enrollments%rowtype;
  v_snapshot jsonb := '[]'::jsonb;
begin
  select * into v_enrollment
  from public.patient_program_enrollments
  where id = p_enrollment_id
  for update;

  if not found then
    raise exception 'enrollment_not_found' using errcode = 'P0002';
  end if;

  if not security.has_permission(v_enrollment.tenant_id, 'packages.write', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', pe.key,
    'label', pe.label,
    'enabled', pe.enabled,
    'config', pe.config
  ) order by pe.created_at asc), '[]'::jsonb)
  into v_snapshot
  from public.program_entitlements pe
  where pe.tenant_id = v_enrollment.tenant_id
    and pe.program_id = v_enrollment.program_id;

  update public.patient_program_enrollments
  set app_entitlements_snapshot = v_snapshot,
      access_snapshot_synced_at = now(),
      updated_at = now()
  where tenant_id = v_enrollment.tenant_id
    and id = v_enrollment.id;

  return jsonb_build_object('id', v_enrollment.id, 'appEntitlementsSnapshot', v_snapshot);
end;
$$;

create or replace function public.fill_patient_program_access_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
begin
  if new.app_entitlements_snapshot is null
     or new.app_entitlements_snapshot = '[]'::jsonb
     or (tg_op = 'UPDATE' and new.program_id is distinct from old.program_id) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', pe.key,
      'label', pe.label,
      'enabled', pe.enabled,
      'config', pe.config
    ) order by pe.created_at asc), '[]'::jsonb)
    into new.app_entitlements_snapshot
    from public.program_entitlements pe
    where pe.tenant_id = new.tenant_id
      and pe.program_id = new.program_id;
    new.access_snapshot_synced_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_patient_program_access_snapshot on public.patient_program_enrollments;
create trigger trg_patient_program_access_snapshot
before insert or update of program_id on public.patient_program_enrollments
for each row execute function public.fill_patient_program_access_snapshot();

create or replace function public.apply_program_enrollment_billing_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_invoice_id uuid := security.try_uuid(new.metadata ->> 'invoice_id');
  v_program public.programs%rowtype;
  v_invoice public.patient_invoices%rowtype;
  v_payment_model text := lower(coalesce(new.metadata ->> 'payment_model', 'avista'));
  v_installments integer := 1;
  v_amount_cents integer := 0;
  v_base_installment integer := 0;
  v_first_installment integer := 0;
  v_index integer;
  v_description text;
begin
  if new.metadata ? 'billing_schedule_generated_at' then
    return new;
  end if;

  if v_invoice_id is null then
    return new;
  end if;

  select * into v_program
  from public.programs
  where tenant_id = new.tenant_id
    and id = new.program_id;

  select * into v_invoice
  from public.patient_invoices
  where tenant_id = new.tenant_id
    and id = v_invoice_id
  for update;

  if v_program.id is null or v_invoice.id is null then
    return new;
  end if;

  v_installments := case
    when coalesce(new.metadata #>> '{financial_config_snapshot,installments}', '') ~ '^[0-9]+$'
      then greatest((new.metadata #>> '{financial_config_snapshot,installments}')::integer, 1)
    when coalesce(new.metadata ->> 'installments', '') ~ '^[0-9]+$'
      then greatest((new.metadata ->> 'installments')::integer, 1)
    else 1
  end;
  v_amount_cents := greatest(coalesce(v_invoice.amount_cents, 0), 0);
  if v_amount_cents > 0 then
    v_installments := least(v_installments, v_amount_cents);
  end if;
  v_description := coalesce(nullif(v_invoice.description, ''), 'Programa ' || v_program.name);

  update public.patient_invoices
  set program_id = new.program_id,
      package_id = new.package_id,
      enrollment_id = new.id,
      source_module = 'program_enrollment',
      metadata = metadata || jsonb_build_object(
        'source', 'program_enrollment',
        'program_id', new.program_id,
        'package_id', new.package_id,
        'enrollment_id', new.id,
        'payment_model', v_payment_model,
        'installments', v_installments
      )
  where tenant_id = new.tenant_id
    and id = v_invoice_id;

  if v_amount_cents > 0 and v_payment_model in ('parcelado', 'hibrido') and v_installments > 1 then
    v_base_installment := greatest(floor(v_amount_cents::numeric / v_installments)::integer, 1);
    v_first_installment := v_amount_cents - (v_base_installment * (v_installments - 1));

    update public.patient_invoices
    set amount_cents = v_first_installment,
        description = v_description || ' (1/' || v_installments || ')',
        metadata = metadata || jsonb_build_object('installment_number', 1, 'installment_count', v_installments)
    where tenant_id = new.tenant_id
      and id = v_invoice_id;

    for v_index in 2..least(v_installments, 60) loop
      insert into public.patient_invoices (
        tenant_id,
        patient_id,
        status,
        amount_cents,
        due_date,
        description,
        program_id,
        package_id,
        enrollment_id,
        source_module,
        metadata
      )
      select
        new.tenant_id,
        new.patient_id,
        'pending',
        v_base_installment,
        (coalesce(v_invoice.due_date, new.start_date, current_date) + ((v_index - 1) * interval '1 month'))::date,
        v_description || ' (' || v_index || '/' || v_installments || ')',
        new.program_id,
        new.package_id,
        new.id,
        'program_enrollment',
        jsonb_build_object(
          'source', 'program_enrollment',
          'provider', 'local',
          'program_id', new.program_id,
          'package_id', new.package_id,
          'enrollment_id', new.id,
          'payment_model', v_payment_model,
          'installment_number', v_index,
          'installment_count', v_installments,
          'created_by_contract', 'apply_program_enrollment_billing_schedule'
        )
      where not exists (
        select 1
        from public.patient_invoices existing
        where existing.tenant_id = new.tenant_id
          and existing.enrollment_id = new.id
          and existing.metadata ->> 'installment_number' = v_index::text
      );
    end loop;
  elsif v_amount_cents > 0 and v_payment_model = 'assinatura' then
    insert into public.patient_subscriptions (
      tenant_id,
      patient_id,
      status,
      cycle,
      amount_cents,
      next_due_date,
      program_id,
      package_id,
      enrollment_id,
      source_module,
      metadata
    )
    select
      new.tenant_id,
      new.patient_id,
      'active',
      'monthly',
      v_amount_cents,
      coalesce(new.start_date, current_date),
      new.program_id,
      new.package_id,
      new.id,
      'program_enrollment',
      jsonb_build_object(
        'source', 'program_enrollment',
        'provider', 'local',
        'description', v_description,
        'program_id', new.program_id,
        'package_id', new.package_id,
        'enrollment_id', new.id,
        'payment_model', v_payment_model,
        'created_by_contract', 'apply_program_enrollment_billing_schedule'
      )
    where not exists (
      select 1
      from public.patient_subscriptions existing
      where existing.tenant_id = new.tenant_id
        and existing.enrollment_id = new.id
    );
  end if;

  update public.patient_program_enrollments
  set metadata = metadata || jsonb_build_object('billing_schedule_generated_at', now())
  where tenant_id = new.tenant_id
    and id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_program_enrollment_billing_schedule on public.patient_program_enrollments;
create trigger trg_program_enrollment_billing_schedule
after update of metadata on public.patient_program_enrollments
for each row execute function public.apply_program_enrollment_billing_schedule();

create or replace function security.patient_has_program_capability(
  p_tenant_id uuid,
  p_patient_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = public, security, pg_temp
as $$
  with requested as (
    select unnest(case lower(coalesce(p_capability, ''))
      when 'chat' then array['chat', 'chat_prioritario']
      when 'checkins' then array['checkin', 'checkins']
      when 'checkin' then array['checkin', 'checkins']
      when 'comunidade' then array['comunidade', 'community']
      when 'community' then array['comunidade', 'community']
      when 'progresso' then array['progresso', 'progress']
      when 'jornada' then array['progresso', 'jornada', 'journey']
      when 'diario' then array['checkin', 'plano_alimentar', 'diario', 'daily']
      when 'plano_alimentar' then array['plano_alimentar', 'nutricao', 'nutrition']
      when 'notificacoes' then array['notificacoes', 'notifications']
      when 'documentos' then array['documentos', 'documents', 'contratos']
      when 'beneficios' then array['beneficios', 'benefits', 'pacote']
      else array[lower(coalesce(p_capability, ''))]
    end) as key
  ), active_enrollments as (
    select e.*
    from public.patient_program_enrollments e
    where e.tenant_id = p_tenant_id
      and e.patient_id = p_patient_id
      and e.status in ('ativo', 'pausado', 'aguardando')
  ), snapshot_entitlements as (
    select e.id, item ->> 'key' as key, coalesce((item ->> 'enabled')::boolean, true) as enabled
    from active_enrollments e
    cross join lateral jsonb_array_elements(coalesce(e.app_entitlements_snapshot, '[]'::jsonb)) item
  ), live_entitlements as (
    select e.id, pe.key, pe.enabled
    from active_enrollments e
    join public.program_entitlements pe
      on pe.tenant_id = e.tenant_id
     and pe.program_id = e.program_id
    where coalesce(jsonb_array_length(e.app_entitlements_snapshot), 0) = 0
  )
  select case
    when lower(coalesce(p_capability, '')) in ('resumo', 'financeiro', 'finance', 'documentos', 'notificacoes')
      then true
    when lower(coalesce(p_capability, '')) = 'beneficios'
      then exists (select 1 from active_enrollments)
    else exists (
      select 1
      from (
        select key, enabled from snapshot_entitlements
        union all
        select key, enabled from live_entitlements
      ) ent
      join requested r on r.key = lower(ent.key)
      where ent.enabled = true
    )
  end;
$$;

create or replace function security.patient_portal_capability_enabled(
  p_tenant_id uuid,
  p_patient_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = public, security, pg_temp
as $$
  select security.can_access_patient_portal_patient(p_tenant_id, p_patient_id)
    and security.patient_has_program_capability(p_tenant_id, p_patient_id, p_capability);
$$;

create or replace function public.get_patient_access_context(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_has_program boolean := false;
  v_financial_state text := 'em_dia';
  v_result jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select x.tenant_id
  into v_tenant_id
  from (
    select pa.tenant_id
    from public.patient_accounts pa
    where pa.user_id = v_user_id
      and pa.patient_id = p_patient_id
      and pa.status = 'active'
    union
    select gl.tenant_id
    from public.guardian_links gl
    where gl.guardian_user_id = v_user_id
      and gl.patient_id = p_patient_id
      and gl.status = 'active'
  ) x
  where security.can_access_patient_portal_patient(x.tenant_id, p_patient_id)
  limit 1;

  if v_tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.patient_program_enrollments e
    where e.tenant_id = v_tenant_id
      and e.patient_id = p_patient_id
      and e.status in ('ativo', 'pausado', 'aguardando')
  )
  into v_has_program;

  select case
    when exists (
      select 1
      from public.patient_invoices i
      where i.tenant_id = v_tenant_id
        and i.patient_id = p_patient_id
        and public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) = 'vencido'
    ) then 'pagamento_atrasado'
    when exists (
      select 1
      from public.patient_invoices i
      where i.tenant_id = v_tenant_id
        and i.patient_id = p_patient_id
        and public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) = 'pendente'
    ) then 'cobranca_pendente'
    else 'em_dia'
  end
  into v_financial_state;

  v_result := jsonb_build_object(
    'tenantId', v_tenant_id,
    'patientId', p_patient_id,
    'hasActiveProgram', v_has_program,
    'financialState', v_financial_state,
    'financialBlocksAccess', false,
    'capabilities', jsonb_build_object(
      'resumo', jsonb_build_object('enabled', true, 'reason', null),
      'diario', jsonb_build_object('enabled', security.patient_has_program_capability(v_tenant_id, p_patient_id, 'diario'), 'reason', case when v_has_program then null else 'Sem programa ativo com acesso diario.' end),
      'jornada', jsonb_build_object('enabled', security.patient_has_program_capability(v_tenant_id, p_patient_id, 'jornada'), 'reason', case when v_has_program then null else 'Sem programa ativo com jornada liberada.' end),
      'beneficios', jsonb_build_object('enabled', security.patient_has_program_capability(v_tenant_id, p_patient_id, 'beneficios'), 'reason', case when v_has_program then null else 'Sem pacote ativo.' end),
      'comunidade', jsonb_build_object('enabled', security.patient_has_program_capability(v_tenant_id, p_patient_id, 'comunidade'), 'reason', 'Programa atual nao libera comunidade.'),
      'documentos', jsonb_build_object('enabled', true, 'reason', null),
      'financeiro', jsonb_build_object('enabled', true, 'reason', null, 'financialState', v_financial_state, 'blocksAccess', false),
      'chat', jsonb_build_object('enabled', security.patient_has_program_capability(v_tenant_id, p_patient_id, 'chat'), 'reason', 'Programa atual nao libera chat.'),
      'notificacoes', jsonb_build_object('enabled', true, 'reason', null),
      'checkins', jsonb_build_object('enabled', security.patient_has_program_capability(v_tenant_id, p_patient_id, 'checkins'), 'reason', 'Programa atual nao libera check-ins.')
    )
  );

  return v_result;
end;
$$;

create or replace function public.get_patient_financial_summary(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_total_contract numeric := 0;
  v_total_paid numeric := 0;
  v_total_pending numeric := 0;
  v_total_overdue numeric := 0;
  v_next_due_date date;
  v_next_due_amount numeric;
  v_last_payment_date timestamptz;
  v_last_payment_amount numeric;
  v_invoices jsonb := '[]'::jsonb;
  v_payment_history jsonb := '[]'::jsonb;
  v_status text := 'isento';
  v_financial_state text := 'em_dia';
begin
  select p.tenant_id into v_tenant_id from public.patients p where p.id = p_patient_id;
  if v_tenant_id is null then
    return null;
  end if;
  if not security.has_permission(v_tenant_id, 'financial.read', true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with normalized as (
    select i.id, i.description, i.amount_cents, i.due_date, i.paid_at,
           public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) as domain_status
    from public.patient_invoices i
    where i.tenant_id = v_tenant_id and i.patient_id = p_patient_id
  )
  select coalesce(sum(amount_cents), 0)::numeric / 100,
         coalesce(sum(amount_cents) filter (where domain_status = 'pendente'), 0)::numeric / 100,
         coalesce(sum(amount_cents) filter (where domain_status = 'vencido'), 0)::numeric / 100
    into v_total_contract, v_total_pending, v_total_overdue
  from normalized;

  select coalesce(sum(p.amount_cents), 0)::numeric / 100
    into v_total_paid
  from public.payments p
  where p.tenant_id = v_tenant_id
    and p.patient_id = p_patient_id
    and lower(coalesce(p.status, '')) in ('paid', 'pago', 'received', 'confirmed', 'payment_received', 'payment_confirmed');

  select i.due_date, i.amount_cents::numeric / 100
    into v_next_due_date, v_next_due_amount
  from public.patient_invoices i
  where i.tenant_id = v_tenant_id
    and i.patient_id = p_patient_id
    and public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at) = 'pendente'
  order by i.due_date asc
  limit 1;

  select p.paid_at, p.amount_cents::numeric / 100
    into v_last_payment_date, v_last_payment_amount
  from public.payments p
  where p.tenant_id = v_tenant_id
    and p.patient_id = p_patient_id
    and p.paid_at is not null
  order by p.paid_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'description', i.description,
           'amount', round(i.amount_cents::numeric / 100, 2),
           'dueDate', i.due_date,
           'paidAt', i.paid_at,
           'status', public.map_billing_status_to_invoice_status(i.status, i.due_date, i.paid_at),
           'sourceModule', coalesce(i.source_module, a.metadata ->> 'sourceModule', i.metadata ->> 'sourceModule', i.metadata ->> 'source'),
           'appointmentId', a.id,
           'programId', coalesce(i.program_id, a.commercial_program_id, security.try_uuid(i.metadata ->> 'program_id')),
           'packageId', coalesce(i.package_id, a.commercial_package_id, security.try_uuid(i.metadata ->> 'package_id'), security.try_uuid(i.metadata ->> 'target_package_id')),
           'enrollmentId', coalesce(i.enrollment_id, a.commercial_enrollment_id, security.try_uuid(i.metadata ->> 'enrollment_id')),
           'serviceId', coalesce(i.service_id, a.commercial_service_id, security.try_uuid(i.metadata ->> 'service_id'))
         ) order by i.due_date desc), '[]'::jsonb)
    into v_invoices
  from public.patient_invoices i
  left join public.appointments a
    on a.tenant_id = i.tenant_id
   and a.financial_invoice_id = i.id
  where i.tenant_id = v_tenant_id and i.patient_id = p_patient_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'description', coalesce(i.description, 'Pagamento'),
           'amount', round(p.amount_cents::numeric / 100, 2),
           'paidAt', p.paid_at,
           'method', public.map_payment_method_to_domain(p.method),
           'registeredBy', 'Sistema',
           'invoiceId', i.id,
           'sourceModule', coalesce(p.source_module, i.source_module, a.metadata ->> 'sourceModule', p.metadata ->> 'sourceModule', p.metadata ->> 'source'),
           'appointmentId', a.id,
           'programId', coalesce(p.program_id, i.program_id, a.commercial_program_id, security.try_uuid(p.metadata ->> 'program_id')),
           'packageId', coalesce(p.package_id, i.package_id, a.commercial_package_id, security.try_uuid(p.metadata ->> 'package_id')),
           'enrollmentId', coalesce(p.enrollment_id, i.enrollment_id, a.commercial_enrollment_id, security.try_uuid(p.metadata ->> 'enrollment_id')),
           'serviceId', coalesce(p.service_id, i.service_id, a.commercial_service_id, security.try_uuid(p.metadata ->> 'service_id'))
         ) order by p.paid_at desc), '[]'::jsonb)
    into v_payment_history
  from public.payments p
  left join public.patient_invoices i on i.tenant_id = p.tenant_id and i.id = p.patient_invoice_id
  left join public.appointments a on a.tenant_id = p.tenant_id and a.financial_payment_id = p.id
  where p.tenant_id = v_tenant_id and p.patient_id = p_patient_id and p.paid_at is not null;

  if v_total_overdue > 0 then
    v_status := 'inadimplente'; v_financial_state := 'pagamento_atrasado';
  elsif v_total_pending > 0 then
    v_status := 'pendente'; v_financial_state := 'cobranca_pendente';
  elsif v_total_contract = 0 and v_total_paid = 0 then
    v_status := 'isento'; v_financial_state := 'em_dia';
  else
    v_status := 'em_dia'; v_financial_state := 'em_dia';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'financialState', v_financial_state,
    'totalContractValue', round(v_total_contract, 2),
    'totalPaid', round(v_total_paid, 2),
    'totalPending', round(v_total_pending, 2),
    'totalOverdue', round(v_total_overdue, 2),
    'nextDueDate', v_next_due_date,
    'nextDueAmount', case when v_next_due_amount is null then null else round(v_next_due_amount, 2) end,
    'lastPaymentDate', v_last_payment_date,
    'lastPaymentAmount', case when v_last_payment_amount is null then null else round(v_last_payment_amount, 2) end,
    'invoices', v_invoices,
    'paymentHistory', v_payment_history,
    'charges', '[]'::jsonb,
    'receipts', '[]'::jsonb,
    'negotiations', '[]'::jsonb
  );
end;
$$;

create or replace function public.get_patient_finance_m13(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_patient_id uuid := p_patient_id;
  v_can_financial boolean := false;
  v_payment_receipts jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_refunds jsonb := '[]'::jsonb;
begin
  select p.tenant_id into v_tenant_id
  from public.patients p
  where p.id = p_patient_id;

  if v_tenant_id is null then
    raise exception 'patient_not_found' using errcode = '22023';
  end if;

  v_can_financial := public.has_clinical_permission(v_tenant_id, 'financial.read');
  if not v_can_financial and not public.can_access_patient_portal_patient(v_tenant_id, v_patient_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id,
    'invoiceId', pr.patient_invoice_id,
    'paymentId', pr.payment_id,
    'amountCents', pr.amount_cents,
    'status', pr.status,
    'submittedAt', pr.submitted_at,
    'uploadedAt', pr.uploaded_at,
    'reviewedAt', pr.reviewed_at,
    'reviewNote', case when v_can_financial then pr.review_note else null end,
    'rejectionReason', pr.rejection_reason,
    'fileName', pr.file_name,
    'mimeType', pr.mime_type,
    'sizeBytes', pr.size_bytes,
    'sourceModule', coalesce(i.source_module, p.source_module),
    'programId', coalesce(i.program_id, p.program_id),
    'packageId', coalesce(i.package_id, p.package_id),
    'enrollmentId', coalesce(i.enrollment_id, p.enrollment_id),
    'serviceId', coalesce(i.service_id, p.service_id)
  ) order by pr.submitted_at desc), '[]'::jsonb)
  into v_payment_receipts
  from public.payment_receipts pr
  left join public.patient_invoices i on i.tenant_id = pr.tenant_id and i.id = pr.patient_invoice_id
  left join public.payments p on p.tenant_id = pr.tenant_id and p.id = pr.payment_id
  where pr.tenant_id = v_tenant_id
    and pr.patient_id = v_patient_id
    and pr.status <> 'deleted';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ps.id,
    'status', ps.status,
    'cycle', ps.cycle,
    'amountCents', ps.amount_cents,
    'nextDueDate', ps.next_due_date,
    'description', ps.metadata ->> 'description',
    'createdAt', ps.created_at,
    'sourceModule', ps.source_module,
    'programId', ps.program_id,
    'packageId', ps.package_id,
    'enrollmentId', ps.enrollment_id,
    'serviceId', ps.service_id
  ) order by ps.next_due_date asc nulls last, ps.created_at desc), '[]'::jsonb)
  into v_subscriptions
  from public.patient_subscriptions ps
  where ps.tenant_id = v_tenant_id
    and ps.patient_id = v_patient_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', br.id,
    'invoiceId', br.patient_invoice_id,
    'paymentId', br.payment_id,
    'status', br.status,
    'amountCents', br.amount_cents,
    'reason', br.reason,
    'requestedAt', br.requested_at,
    'processedAt', br.processed_at
  ) order by br.requested_at desc), '[]'::jsonb)
  into v_refunds
  from public.billing_refunds br
  where br.tenant_id = v_tenant_id
    and br.patient_id = v_patient_id;

  return jsonb_build_object(
    'paymentReceipts', v_payment_receipts,
    'subscriptions', v_subscriptions,
    'refunds', v_refunds
  );
end;
$$;

create or replace function public.get_patient_portal_snapshot(p_patient_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_selected_patient_id uuid;
  v_selected_tenant_id uuid;
  v_patients jsonb := '[]'::jsonb;
  v_patient jsonb := '{}'::jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_invoices jsonb := '[]'::jsonb;
  v_chat jsonb := '{}'::jsonb;
  v_notifications jsonb := '[]'::jsonb;
  v_checkins jsonb := '[]'::jsonb;
  v_access jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  with linked as (
    select pa.tenant_id, pa.patient_id, 'patient'::text as linkage_type, null::text as relationship
    from public.patient_accounts pa
    where pa.user_id = v_user_id
      and pa.status = 'active'
      and public.has_permission(pa.tenant_id, 'patient_portal.access')
    union all
    select gl.tenant_id, gl.patient_id, 'guardian'::text as linkage_type, gl.relationship
    from public.guardian_links gl
    where gl.guardian_user_id = v_user_id
      and gl.status = 'active'
      and public.has_permission(gl.tenant_id, 'patient_portal.access')
  ), dedup as (
    select distinct on (tenant_id, patient_id)
      tenant_id, patient_id, linkage_type, relationship
    from linked
    order by tenant_id, patient_id, linkage_type desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'tenantId', d.tenant_id,
    'patientId', d.patient_id,
    'linkageType', d.linkage_type,
    'relationship', d.relationship,
    'displayName', coalesce(pp.full_name, p.preferred_name, 'Paciente'),
    'status', p.status
  ) order by coalesce(pp.full_name, p.preferred_name, 'Paciente')), '[]'::jsonb)
  into v_patients
  from dedup d
  join public.patients p on p.tenant_id = d.tenant_id and p.id = d.patient_id
  left join public.patient_pii pp on pp.tenant_id = d.tenant_id and pp.patient_id = d.patient_id;

  if jsonb_array_length(v_patients) = 0 then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_patient_id is not null then
    if not exists (select 1 from jsonb_array_elements(v_patients) item where (item->>'patientId')::uuid = p_patient_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    v_selected_patient_id := p_patient_id;
  else
    v_selected_patient_id := (v_patients->0->>'patientId')::uuid;
  end if;

  v_selected_tenant_id := (
    select (item->>'tenantId')::uuid
    from jsonb_array_elements(v_patients) item
    where (item->>'patientId')::uuid = v_selected_patient_id
    limit 1
  );
  v_access := public.get_patient_access_context(v_selected_patient_id);

  select jsonb_build_object(
    'id', p.id,
    'tenantId', p.tenant_id,
    'preferredName', coalesce(p.preferred_name, pp.full_name, 'Paciente'),
    'fullName', pp.full_name,
    'email', pp.email,
    'phone', pp.phone,
    'status', p.status,
    'tags', p.tags,
    'createdAt', p.created_at
  )
  into v_patient
  from public.patients p
  left join public.patient_pii pp on pp.tenant_id = p.tenant_id and pp.patient_id = p.id
  where p.tenant_id = v_selected_tenant_id
    and p.id = v_selected_patient_id;

  if coalesce((v_access #>> '{capabilities,documentos,enabled}')::boolean, false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', gd.id,
      'name', gd.name,
      'category', gd.category,
      'status', gd.status,
      'generatedAt', gd.generated_at,
      'releasedToPatient', gd.released_to_patient
    ) order by gd.generated_at desc), '[]'::jsonb)
    into v_documents
    from public.generated_documents gd
    where gd.tenant_id = v_selected_tenant_id
      and gd.patient_id = v_selected_patient_id
      and gd.released_to_patient = true;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pi.id,
    'status', pi.status,
    'amountCents', pi.amount_cents,
    'dueDate', pi.due_date,
    'paidAt', pi.paid_at,
    'description', pi.description,
    'paymentLink', coalesce(pi.payment_link, pl.url),
    'sourceModule', pi.source_module,
    'programId', pi.program_id,
    'packageId', pi.package_id,
    'enrollmentId', pi.enrollment_id,
    'serviceId', pi.service_id
  ) order by pi.due_date desc nulls last, pi.created_at desc), '[]'::jsonb)
  into v_invoices
  from public.patient_invoices pi
  left join public.payment_links pl on pl.tenant_id = pi.tenant_id and pl.patient_id = pi.patient_id and pl.status = 'active'
  where pi.tenant_id = v_selected_tenant_id
    and pi.patient_id = v_selected_patient_id;

  if coalesce((v_access #>> '{capabilities,notificacoes,enabled}')::boolean, false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'title', case when n.moderation_status = 'approved' then n.title else 'Notificacao sob revisao' end,
      'body', case when n.moderation_status = 'approved' then n.body else 'Conteudo removido ou sob revisao de moderacao.' end,
      'category', n.category,
      'status', n.status,
      'moderationStatus', n.moderation_status,
      'createdAt', n.created_at
    ) order by n.created_at desc), '[]'::jsonb)
    into v_notifications
    from public.notifications n
    where n.tenant_id = v_selected_tenant_id
      and (n.user_id = v_user_id or n.patient_id = v_selected_patient_id)
      and n.status <> 'archived'
      and n.archived_at is null
    limit 20;
  end if;

  if coalesce((v_access #>> '{capabilities,checkins,enabled}')::boolean, false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', pc.id,
      'title', pc.title,
      'status', pc.status,
      'channel', pc.channel,
      'dueDate', pc.due_date,
      'questions', pc.questions,
      'responses', pc.responses,
      'completedAt', pc.completed_at
    ) order by pc.due_date desc), '[]'::jsonb)
    into v_checkins
    from public.patient_program_checkins pc
    where pc.tenant_id = v_selected_tenant_id
      and pc.patient_id = v_selected_patient_id
    limit 20;
  end if;

  if coalesce((v_access #>> '{capabilities,chat,enabled}')::boolean, false) then
    select jsonb_build_object(
      'threadId', pct.id,
      'status', pct.status,
      'lastMessageAt', pct.last_message_at,
      'messages', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', pcm.id,
          'senderLabel', case when pcm.moderation_status = 'approved' then pcm.sender_label else 'Moderacao' end,
          'isOwn', pcm.sender_user_id = v_user_id,
          'body', case when pcm.moderation_status = 'approved' then pcm.body else 'Conteudo removido ou sob revisao de moderacao.' end,
          'moderationStatus', pcm.moderation_status,
          'createdAt', pcm.created_at
        ) order by pcm.created_at asc)
        from (
          select *
          from public.patient_chat_messages pcm
          where pcm.tenant_id = pct.tenant_id
            and pcm.thread_id = pct.id
            and pcm.patient_id = pct.patient_id
            and pcm.archived_at is null
          order by pcm.created_at desc
          limit 20
        ) pcm
      ), '[]'::jsonb)
    )
    into v_chat
    from public.patient_chat_threads pct
    where pct.tenant_id = v_selected_tenant_id
      and pct.patient_id = v_selected_patient_id
      and pct.archived_at is null;
  else
    v_chat := jsonb_build_object('threadId', null, 'status', 'blocked', 'messages', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'selectedPatientId', v_selected_patient_id,
    'patients', v_patients,
    'patient', v_patient,
    'documents', v_documents,
    'invoices', v_invoices,
    'chat', coalesce(v_chat, jsonb_build_object('threadId', null, 'status', 'open', 'messages', '[]'::jsonb)),
    'notifications', v_notifications,
    'checkins', v_checkins,
    'access', v_access
  );
end;
$$;

create or replace function public.send_patient_portal_message(
  p_patient_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_thread_id uuid;
  v_message_id uuid;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if v_body is null or length(v_body) > 2000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;

  select x.tenant_id into v_tenant_id
  from (
    select pa.tenant_id
    from public.patient_accounts pa
    where pa.user_id = v_user_id and pa.patient_id = p_patient_id and pa.status = 'active'
    union
    select gl.tenant_id
    from public.guardian_links gl
    where gl.guardian_user_id = v_user_id and gl.patient_id = p_patient_id and gl.status = 'active'
  ) x
  where security.patient_portal_capability_enabled(x.tenant_id, p_patient_id, 'chat')
  limit 1;

  if v_tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.patient_chat_threads (tenant_id, patient_id, status, last_message_at, unread_count, metadata)
  values (v_tenant_id, p_patient_id, 'open', now(), 1, jsonb_build_object('source', 'patient_portal'))
  on conflict (tenant_id, patient_id) do update
    set status = case when public.patient_chat_threads.status = 'archived' then 'open' else public.patient_chat_threads.status end,
        last_message_at = now(),
        unread_count = greatest(public.patient_chat_threads.unread_count, 0) + 1,
        updated_at = now()
  returning id into v_thread_id;

  insert into public.patient_chat_messages (tenant_id, thread_id, patient_id, sender_user_id, sender_label, body, metadata)
  values (v_tenant_id, v_thread_id, p_patient_id, v_user_id, 'Portal do paciente', v_body, jsonb_build_object('source', 'patient_portal'))
  returning id into v_message_id;

  return jsonb_build_object('id', v_message_id, 'threadId', v_thread_id, 'createdAt', now());
end;
$$;

create or replace function public.submit_patient_portal_checkin(
  p_checkin_id uuid,
  p_responses jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.patient_program_checkins%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_row
  from public.patient_program_checkins pc
  where pc.id = p_checkin_id;

  if v_row.id is null
     or not security.patient_portal_capability_enabled(v_row.tenant_id, v_row.patient_id, 'checkins') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_row.status in ('completed', 'canceled') then
    raise exception 'checkin_closed' using errcode = '22023';
  end if;

  update public.patient_program_checkins
  set responses = coalesce(p_responses, '{}'::jsonb),
      status = 'completed',
      completed_at = now(),
      updated_at = now()
  where tenant_id = v_row.tenant_id and id = v_row.id;

  return jsonb_build_object('id', v_row.id, 'status', 'completed', 'completedAt', now());
end;
$$;

revoke all on function public.get_current_user_profile() from public;
revoke all on function public.update_current_user_profile(jsonb) from public;
revoke all on function public.sync_patient_program_access_snapshot(uuid) from public;
revoke all on function public.get_patient_access_context(uuid) from public;
revoke all on function security.patient_has_program_capability(uuid, uuid, text) from public;
revoke all on function security.patient_portal_capability_enabled(uuid, uuid, text) from public;

grant execute on function public.get_current_user_profile() to authenticated, service_role;
grant execute on function public.update_current_user_profile(jsonb) to authenticated, service_role;
grant execute on function public.sync_patient_program_access_snapshot(uuid) to authenticated, service_role;
grant execute on function public.get_patient_access_context(uuid) to authenticated, service_role;
grant execute on function security.patient_has_program_capability(uuid, uuid, text) to authenticated, service_role;
grant execute on function security.patient_portal_capability_enabled(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.get_patient_financial_summary(uuid) to authenticated, service_role;
grant execute on function public.get_patient_finance_m13(uuid) to authenticated, service_role;
grant execute on function public.get_patient_portal_snapshot(uuid) to authenticated, service_role;
grant execute on function public.send_patient_portal_message(uuid, text) to authenticated, service_role;
grant execute on function public.submit_patient_portal_checkin(uuid, jsonb) to authenticated, service_role;

comment on function public.get_current_user_profile() is
  'Returns the authenticated user profile, active membership and professional profile scoped to the user.';
comment on function public.update_current_user_profile(jsonb) is
  'Updates only the authenticated user identity/contact/private profile and own active professional public fields.';
comment on function public.get_patient_access_context(uuid) is
  'Returns patient portal capability access resolved from tenant portal access plus program/package enrollment snapshots. Financial debt never blocks access by default.';
comment on function public.sync_patient_program_access_snapshot(uuid) is
  'Resynchronizes app entitlement snapshots for a patient program enrollment after program access changes.';
