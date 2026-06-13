-- Inventory usability mutators and ledger permission compatibility.
-- Categories and locations stay RLS-protected; authenticated writes go through audited RPCs.

create or replace function public.upsert_inventory_category(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant(null, true);
  v_category_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload->>'id', '')) then (p_payload->>'id')::uuid
    else null
  end;
  v_name text := nullif(left(trim(p_payload->>'name'), 120), '');
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'active');
  v_category public.inventory_categories%rowtype;
begin
  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'inventory_category_name_required' using errcode = '22023';
  end if;
  if v_status not in ('active', 'inactive', 'archived') then
    raise exception 'invalid_inventory_category_status' using errcode = '22023';
  end if;

  if v_category_id is null then
    insert into public.inventory_categories (tenant_id, name, status, metadata)
    values (v_tenant_id, v_name, v_status, coalesce(p_payload->'metadata', '{}'::jsonb))
    on conflict (tenant_id, name) do update
      set status = excluded.status,
          metadata = public.inventory_categories.metadata || excluded.metadata,
          updated_at = now()
    returning * into v_category;
  else
    update public.inventory_categories
       set name = v_name,
           status = v_status,
           metadata = metadata || coalesce(p_payload->'metadata', '{}'::jsonb),
           updated_at = now()
     where tenant_id = v_tenant_id
       and id = v_category_id
    returning * into v_category;

    if v_category.id is null then
      raise exception 'inventory_category_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    auth.uid(),
    case when v_category_id is null then 'inventory_category.created' else 'inventory_category.updated' end,
    'inventory_category',
    v_category.id::text,
    jsonb_build_object('name', v_category.name, 'status', v_category.status)
  );

  return jsonb_build_object('id', v_category.id, 'name', v_category.name, 'status', v_category.status);
end;
$$;

create or replace function public.upsert_inventory_location(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid := security.resolve_current_tenant(null, true);
  v_location_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload->>'id', '')) then (p_payload->>'id')::uuid
    else null
  end;
  v_unit_id uuid := case
    when security.is_valid_uuid_text(coalesce(p_payload->>'unitId', '')) then (p_payload->>'unitId')::uuid
    else null
  end;
  v_name text := nullif(left(trim(p_payload->>'name'), 140), '');
  v_code text := nullif(
    left(
      upper(regexp_replace(coalesce(nullif(trim(p_payload->>'code'), ''), trim(p_payload->>'name')), '[^a-zA-Z0-9]+', '_', 'g')),
      40
    ),
    ''
  );
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'active');
  v_location public.inventory_locations%rowtype;
begin
  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'inventory_location_name_required' using errcode = '22023';
  end if;
  if v_code is null then
    v_code := 'LOCAL_' || upper(substr(gen_random_uuid()::text, 1, 8));
  end if;
  if v_status not in ('active', 'inactive', 'archived') then
    raise exception 'invalid_inventory_location_status' using errcode = '22023';
  end if;
  if v_unit_id is not null and not public.has_unit_access(v_tenant_id, v_unit_id) then
    raise exception 'forbidden_unit' using errcode = '42501';
  end if;

  if v_location_id is null then
    insert into public.inventory_locations (tenant_id, unit_id, code, name, status, metadata)
    values (v_tenant_id, v_unit_id, v_code, v_name, v_status, coalesce(p_payload->'metadata', '{}'::jsonb))
    on conflict (tenant_id, code) do update
      set name = excluded.name,
          status = excluded.status,
          metadata = public.inventory_locations.metadata || excluded.metadata,
          updated_at = now()
    returning * into v_location;
  else
    update public.inventory_locations
       set unit_id = v_unit_id,
           code = v_code,
           name = v_name,
           status = v_status,
           metadata = metadata || coalesce(p_payload->'metadata', '{}'::jsonb),
           updated_at = now()
     where tenant_id = v_tenant_id
       and id = v_location_id
    returning * into v_location;

    if v_location.id is null then
      raise exception 'inventory_location_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    auth.uid(),
    case when v_location_id is null then 'inventory_location.created' else 'inventory_location.updated' end,
    'inventory_location',
    v_location.id::text,
    jsonb_build_object('code', v_location.code, 'status', v_location.status, 'unitId', v_location.unit_id)
  );

  return jsonb_build_object(
    'id', v_location.id,
    'unitId', v_location.unit_id,
    'code', v_location.code,
    'name', v_location.name,
    'status', v_location.status
  );
end;
$$;

create or replace function public.create_inventory_movement(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_item_id uuid := nullif(p_payload->>'itemId', '')::uuid;
  v_location_id uuid := nullif(p_payload->>'locationId', '')::uuid;
  v_lot_id uuid := nullif(p_payload->>'lotId', '')::uuid;
  v_direction text := coalesce(nullif(p_payload->>'direction', ''), 'in');
  v_reason text := coalesce(nullif(p_payload->>'reason', ''), 'adjustment');
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, 0);
  v_current numeric;
  v_delta numeric;
  v_movement_id uuid;
  v_requires_transfer boolean;
  v_location_unit_id uuid;
begin
  v_tenant_id := security.resolve_current_tenant(null, true);
  v_requires_transfer := v_reason in ('transfer_in', 'transfer_out');

  if v_tenant_id is null
    or not (
      security.has_permission(v_tenant_id, case when v_requires_transfer then 'inventory.transfer' else 'inventory.adjust' end, false)
      or security.has_permission(v_tenant_id, 'inventory.write', false)
    )
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_item_id is null
    or v_quantity <= 0
    or v_direction not in ('in', 'out')
    or v_reason not in (
      'receipt',
      'consumption',
      'loss',
      'adjustment',
      'transfer_in',
      'transfer_out',
      'reservation',
      'release'
    )
  then
    raise exception 'invalid_inventory_movement' using errcode = '22023';
  end if;
  if nullif(trim(p_payload->>'reasonNote'), '') is null then
    raise exception 'inventory_reason_note_required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.inventory_items
    where tenant_id = v_tenant_id and id = v_item_id and status = 'active'
  ) then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  if v_location_id is not null then
    select unit_id into v_location_unit_id
    from public.inventory_locations
    where tenant_id = v_tenant_id and id = v_location_id;
    if not found then
      raise exception 'inventory_location_not_found' using errcode = 'P0002';
    end if;
    if not public.has_unit_access(v_tenant_id, v_location_unit_id) then
      raise exception 'forbidden_unit' using errcode = '42501';
    end if;
  end if;
  if v_lot_id is not null and not exists (
    select 1
    from public.inventory_lots
    where tenant_id = v_tenant_id
      and id = v_lot_id
      and item_id = v_item_id
      and (location_id is not distinct from v_location_id)
  ) then
    raise exception 'inventory_lot_not_found' using errcode = 'P0002';
  end if;

  v_delta := case when v_direction = 'in' then v_quantity else -v_quantity end;

  select coalesce(quantity_on_hand, 0)
    into v_current
  from public.inventory_stock_snapshots
  where tenant_id = v_tenant_id
    and item_id = v_item_id
    and (location_id is not distinct from v_location_id)
    and (lot_id is not distinct from v_lot_id)
  for update;

  v_current := coalesce(v_current, 0);
  if v_current + v_delta < 0 then
    raise exception 'negative_stock_blocked' using errcode = '23514';
  end if;

  insert into public.inventory_stock_snapshots (
    tenant_id,
    item_id,
    location_id,
    lot_id,
    quantity_on_hand,
    quantity_reserved
  )
  values (v_tenant_id, v_item_id, v_location_id, v_lot_id, greatest(v_delta, 0), 0)
  on conflict (tenant_id, item_id, location_id, lot_id) do update
  set quantity_on_hand = public.inventory_stock_snapshots.quantity_on_hand + v_delta,
      updated_at = now()
  returning quantity_on_hand into v_current;

  insert into public.inventory_movements (
    tenant_id,
    item_id,
    lot_id,
    location_id,
    movement_type,
    direction,
    reason,
    quantity,
    unit_cost_cents,
    related_patient_id,
    reference_type,
    reference_id,
    created_by,
    metadata,
    occurred_at
  )
  values (
    v_tenant_id,
    v_item_id,
    v_lot_id,
    v_location_id,
    case
      when v_reason like 'transfer%' then 'transfer'
      when v_reason = 'adjustment' then 'adjustment'
      when v_direction = 'in' then 'in'
      else 'out'
    end,
    v_direction,
    v_reason,
    v_quantity,
    case
      when security.has_permission(v_tenant_id, 'inventory.cost.read', false)
        then nullif(p_payload->>'unitCostCents', '')::integer
      else null
    end,
    nullif(p_payload->>'patientId', '')::uuid,
    nullif(p_payload->>'referenceType', ''),
    nullif(p_payload->>'referenceId', '')::uuid,
    auth.uid(),
    coalesce(p_payload->'metadata', '{}'::jsonb)
      || jsonb_build_object('reasonNote', left(trim(p_payload->>'reasonNote'), 500)),
    coalesce(nullif(p_payload->>'occurredAt', '')::timestamptz, now())
  ) returning id into v_movement_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_tenant_id,
    auth.uid(),
    'inventory_movement.created',
    'inventory_movement',
    v_movement_id::text,
    jsonb_build_object(
      'itemId', v_item_id,
      'locationId', v_location_id,
      'lotId', v_lot_id,
      'direction', v_direction,
      'reason', v_reason,
      'quantity', v_quantity,
      'quantityOnHand', v_current
    )
  );

  if v_reason in ('loss', 'adjustment', 'transfer_in', 'transfer_out') then
    insert into public.notifications (tenant_id, user_id, title, body, category, status, metadata)
    values (
      v_tenant_id,
      auth.uid(),
      'Movimentacao de estoque registrada',
      'Uma movimentacao sensivel de estoque foi auditada.',
      'inventory',
      'unread',
      jsonb_build_object('movementId', v_movement_id, 'itemId', v_item_id, 'href', '/clinic/inventory')
    );
  end if;

  return jsonb_build_object('id', v_movement_id, 'itemId', v_item_id, 'quantityOnHand', v_current);
end;
$$;

create or replace function public.transfer_inventory_stock(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_out jsonb;
  v_in jsonb;
  v_from_location_id uuid := nullif(p_payload->>'fromLocationId', '')::uuid;
  v_to_location_id uuid := nullif(p_payload->>'toLocationId', '')::uuid;
  v_reason_note text := nullif(trim(p_payload->>'reasonNote'), '');
begin
  if v_from_location_id is null or v_to_location_id is null or v_from_location_id = v_to_location_id then
    raise exception 'invalid_transfer_locations' using errcode = '22023';
  end if;
  if v_reason_note is null then
    raise exception 'inventory_reason_note_required' using errcode = '22023';
  end if;

  v_out := public.create_inventory_movement(jsonb_build_object(
    'itemId', p_payload->>'itemId',
    'lotId', p_payload->>'lotId',
    'locationId', p_payload->>'fromLocationId',
    'direction', 'out',
    'reason', 'transfer_out',
    'quantity', p_payload->>'quantity',
    'reasonNote', v_reason_note,
    'referenceType', 'inventory_transfer',
    'metadata', coalesce(p_payload->'metadata', '{}'::jsonb) || jsonb_build_object('toLocationId', v_to_location_id)
  ));
  v_in := public.create_inventory_movement(jsonb_build_object(
    'itemId', p_payload->>'itemId',
    'locationId', p_payload->>'toLocationId',
    'direction', 'in',
    'reason', 'transfer_in',
    'quantity', p_payload->>'quantity',
    'reasonNote', v_reason_note,
    'referenceType', 'inventory_transfer',
    'referenceId', v_out->>'id',
    'metadata', coalesce(p_payload->'metadata', '{}'::jsonb) || jsonb_build_object('fromLocationId', v_from_location_id)
  ));

  return jsonb_build_object(
    'outMovementId', v_out->>'id',
    'inMovementId', v_in->>'id',
    'quantityOnHandDestination', v_in->>'quantityOnHand'
  );
end;
$$;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from public.roles r
join public.permissions p on p.tenant_id = r.tenant_id
where r.name in ('tenant_owner', 'clinic_admin')
  and p.code in ('inventory.adjust', 'inventory.transfer')
on conflict (tenant_id, role_id, permission_id) do nothing;

revoke all on function public.upsert_inventory_category(jsonb) from public;
revoke all on function public.upsert_inventory_location(jsonb) from public;
revoke all on function public.create_inventory_movement(jsonb) from public;
revoke all on function public.transfer_inventory_stock(jsonb) from public;

grant execute on function public.upsert_inventory_category(jsonb) to authenticated, service_role;
grant execute on function public.upsert_inventory_location(jsonb) to authenticated, service_role;
grant execute on function public.create_inventory_movement(jsonb) to authenticated, service_role;
grant execute on function public.transfer_inventory_stock(jsonb) to authenticated, service_role;

comment on function public.upsert_inventory_category(jsonb) is
  'Audited inventory category mutator. Direct table writes remain protected by RLS/grants.';
comment on function public.upsert_inventory_location(jsonb) is
  'Audited inventory location mutator used to populate movement location comboboxes.';
