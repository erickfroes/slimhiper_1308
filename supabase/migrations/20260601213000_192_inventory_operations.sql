-- Phase 9.3: inventory operations UX contracts by lot, expiry and location.
-- Browser clients keep using audited RPCs; ledger movements remain immutable.

create or replace function public.list_inventory_operations_snapshot(p_include_cost boolean default false, p_days_to_expiry integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_can_cost boolean;
  v_days integer := least(greatest(coalesce(p_days_to_expiry, 30), 0), 365);
  v_items jsonb;
  v_categories jsonb;
  v_locations jsonb;
  v_lots jsonb;
  v_movements jsonb;
  v_alerts jsonb;
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_cost := p_include_cost and security.has_permission(v_tenant_id, 'inventory.cost.read', false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'status', c.status
  ) order by c.name), '[]'::jsonb) into v_categories
  from public.inventory_categories c
  where c.tenant_id = v_tenant_id and c.status <> 'archived';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'unitId', l.unit_id,
    'code', l.code,
    'name', l.name,
    'status', l.status
  ) order by l.name), '[]'::jsonb) into v_locations
  from public.inventory_locations l
  where l.tenant_id = v_tenant_id
    and l.status <> 'archived'
    and public.has_unit_access(l.tenant_id, l.unit_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'sku', i.sku,
    'name', i.name,
    'categoryId', i.category_id,
    'categoryName', c.name,
    'unitId', i.unit_id,
    'unit', i.unit,
    'status', i.status,
    'minimumQuantity', i.minimum_quantity,
    'defaultUnitCostCents', case when v_can_cost then i.default_unit_cost_cents else null end,
    'quantityOnHand', coalesce(s.quantity_on_hand, 0),
    'quantityReserved', coalesce(s.quantity_reserved, 0),
    'updatedAt', i.updated_at
  ) order by i.name), '[]'::jsonb) into v_items
  from public.inventory_items i
  left join public.inventory_categories c on c.tenant_id = i.tenant_id and c.id = i.category_id
  left join lateral (
    select sum(ss.quantity_on_hand) as quantity_on_hand, sum(ss.quantity_reserved) as quantity_reserved
    from public.inventory_stock_snapshots ss
    left join public.inventory_locations sl on sl.tenant_id = ss.tenant_id and sl.id = ss.location_id
    where ss.tenant_id = i.tenant_id
      and ss.item_id = i.id
      and public.has_unit_access(ss.tenant_id, sl.unit_id)
  ) s on true
  where i.tenant_id = v_tenant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'itemId', l.item_id,
    'itemName', i.name,
    'locationId', l.location_id,
    'locationName', loc.name,
    'lotCode', l.lot_code,
    'expiresAt', l.expires_at,
    'receivedAt', l.received_at,
    'status', l.status,
    'unitCostCents', case when v_can_cost then l.unit_cost_cents else null end,
    'quantityOnHand', coalesce(s.quantity_on_hand, 0),
    'quantityReserved', coalesce(s.quantity_reserved, 0),
    'daysToExpiry', case when l.expires_at is null then null else l.expires_at - current_date end
  ) order by l.expires_at nulls last, i.name, l.lot_code), '[]'::jsonb) into v_lots
  from public.inventory_lots l
  join public.inventory_items i on i.tenant_id = l.tenant_id and i.id = l.item_id
  left join public.inventory_locations loc on loc.tenant_id = l.tenant_id and loc.id = l.location_id
  left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.item_id = l.item_id and s.lot_id = l.id and (s.location_id is not distinct from l.location_id)
  where l.tenant_id = v_tenant_id
    and public.has_unit_access(l.tenant_id, loc.unit_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'itemId', m.item_id,
    'itemName', i.name,
    'lotId', m.lot_id,
    'lotCode', lot.lot_code,
    'locationId', m.location_id,
    'locationName', loc.name,
    'movementType', m.movement_type,
    'direction', m.direction,
    'reason', m.reason,
    'quantity', m.quantity,
    'unitCostCents', case when v_can_cost then m.unit_cost_cents else null end,
    'createdBy', m.created_by,
    'occurredAt', m.occurred_at,
    'createdAt', m.created_at,
    'metadata', m.metadata
  ) order by m.occurred_at desc, m.created_at desc), '[]'::jsonb) into v_movements
  from (
    select *
    from public.inventory_movements
    where tenant_id = v_tenant_id
    order by occurred_at desc, created_at desc
    limit 80
  ) m
  join public.inventory_items i on i.tenant_id = m.tenant_id and i.id = m.item_id
  left join public.inventory_lots lot on lot.tenant_id = m.tenant_id and lot.id = m.lot_id
  left join public.inventory_locations loc on loc.tenant_id = m.tenant_id and loc.id = m.location_id
  where public.has_unit_access(m.tenant_id, loc.unit_id);

  select coalesce(jsonb_agg(alert order by alert->>'severity' desc, alert->>'itemName'), '[]'::jsonb) into v_alerts
  from (
    select jsonb_build_object(
      'type', 'minimum_stock',
      'severity', case when coalesce(sum(s.quantity_on_hand), 0) <= 0 then 'critical' else 'high' end,
      'itemId', i.id,
      'itemName', i.name,
      'quantityOnHand', coalesce(sum(s.quantity_on_hand), 0),
      'minimumQuantity', i.minimum_quantity,
      'href', '/clinic/inventory?itemId=' || i.id::text
    ) as alert
    from public.inventory_items i
    left join public.inventory_stock_snapshots s on s.tenant_id = i.tenant_id and s.item_id = i.id
    left join public.inventory_locations loc on loc.tenant_id = s.tenant_id and loc.id = s.location_id
    where i.tenant_id = v_tenant_id and i.status = 'active' and public.has_unit_access(i.tenant_id, loc.unit_id)
    group by i.id, i.name, i.minimum_quantity
    having coalesce(sum(s.quantity_on_hand), 0) <= i.minimum_quantity
    union all
    select jsonb_build_object(
      'type', 'lot_expiry',
      'severity', case when l.expires_at < current_date then 'critical' else 'medium' end,
      'itemId', l.item_id,
      'itemName', i.name,
      'lotId', l.id,
      'lotCode', l.lot_code,
      'expiresAt', l.expires_at,
      'quantityOnHand', coalesce(s.quantity_on_hand, 0),
      'href', '/clinic/inventory?lotId=' || l.id::text
    )
    from public.inventory_lots l
    join public.inventory_items i on i.tenant_id = l.tenant_id and i.id = l.item_id
    left join public.inventory_locations loc on loc.tenant_id = l.tenant_id and loc.id = l.location_id
    left join public.inventory_stock_snapshots s on s.tenant_id = l.tenant_id and s.item_id = l.item_id and s.lot_id = l.id and (s.location_id is not distinct from l.location_id)
    where l.tenant_id = v_tenant_id
      and l.status = 'active'
      and l.expires_at is not null
      and l.expires_at <= current_date + (v_days || ' days')::interval
      and public.has_unit_access(l.tenant_id, loc.unit_id)
  ) alerts;

  return jsonb_build_object(
    'items', v_items,
    'categories', v_categories,
    'locations', v_locations,
    'lots', v_lots,
    'movements', v_movements,
    'alerts', v_alerts,
    'costIncluded', v_can_cost,
    'daysToExpiry', v_days
  );
end;
$$;

create or replace function public.upsert_inventory_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_item_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_item public.inventory_items%rowtype;
  v_category_id uuid := nullif(p_payload->>'categoryId', '')::uuid;
  v_unit_id uuid := nullif(p_payload->>'unitId', '')::uuid;
  v_can_cost boolean;
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if nullif(trim(p_payload->>'name'), '') is null then
    raise exception 'item_name_required' using errcode = '22023';
  end if;
  if v_category_id is not null and not exists (select 1 from public.inventory_categories where tenant_id = v_tenant_id and id = v_category_id) then
    raise exception 'invalid_inventory_category' using errcode = '22023';
  end if;
  if v_unit_id is not null and not public.has_unit_access(v_tenant_id, v_unit_id) then
    raise exception 'forbidden_unit' using errcode = '42501';
  end if;

  v_can_cost := security.has_permission(v_tenant_id, 'inventory.cost.read', false);

  if v_item_id is null then
    insert into public.inventory_items (tenant_id, sku, name, category_id, unit_id, unit, status, minimum_quantity, default_unit_cost_cents, metadata)
    values (
      v_tenant_id,
      nullif(trim(p_payload->>'sku'), ''),
      left(trim(p_payload->>'name'), 180),
      v_category_id,
      v_unit_id,
      coalesce(nullif(trim(p_payload->>'unit'), ''), 'unidade'),
      coalesce(nullif(p_payload->>'status', ''), 'active'),
      coalesce(nullif(p_payload->>'minimumQuantity', '')::numeric, 0),
      case when v_can_cost then nullif(p_payload->>'defaultUnitCostCents', '')::integer else null end,
      coalesce(p_payload->'metadata', '{}'::jsonb)
    ) returning * into v_item;

    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    values (v_tenant_id, auth.uid(), 'inventory_item.created', 'inventory_item', v_item.id::text, jsonb_build_object('sku', v_item.sku, 'categoryId', v_item.category_id));
  else
    update public.inventory_items
    set sku = nullif(trim(p_payload->>'sku'), ''),
        name = left(trim(p_payload->>'name'), 180),
        category_id = v_category_id,
        unit_id = v_unit_id,
        unit = coalesce(nullif(trim(p_payload->>'unit'), ''), unit),
        status = coalesce(nullif(p_payload->>'status', ''), status),
        minimum_quantity = coalesce(nullif(p_payload->>'minimumQuantity', '')::numeric, minimum_quantity),
        default_unit_cost_cents = case when v_can_cost then nullif(p_payload->>'defaultUnitCostCents', '')::integer else default_unit_cost_cents end,
        metadata = metadata || coalesce(p_payload->'metadata', '{}'::jsonb),
        updated_at = now()
    where tenant_id = v_tenant_id and id = v_item_id
    returning * into v_item;

    if v_item.id is null then
      raise exception 'inventory_item_not_found' using errcode = 'P0002';
    end if;

    insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
    values (v_tenant_id, auth.uid(), 'inventory_item.updated', 'inventory_item', v_item.id::text, jsonb_build_object('sku', v_item.sku, 'categoryId', v_item.category_id, 'status', v_item.status));
  end if;

  return jsonb_build_object('id', v_item.id, 'name', v_item.name, 'status', v_item.status, 'updatedAt', v_item.updated_at);
end;
$$;

create or replace function public.create_inventory_lot(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_item_id uuid := nullif(p_payload->>'itemId', '')::uuid;
  v_location_id uuid := nullif(p_payload->>'locationId', '')::uuid;
  v_location_unit_id uuid;
  v_lot public.inventory_lots%rowtype;
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.write', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_item_id is null or not exists (select 1 from public.inventory_items where tenant_id = v_tenant_id and id = v_item_id) then
    raise exception 'inventory_item_not_found' using errcode = 'P0002';
  end if;
  if v_location_id is not null then
    select unit_id into v_location_unit_id from public.inventory_locations where tenant_id = v_tenant_id and id = v_location_id;
    if v_location_unit_id is null and not exists (select 1 from public.inventory_locations where tenant_id = v_tenant_id and id = v_location_id) then
      raise exception 'inventory_location_not_found' using errcode = 'P0002';
    end if;
    if not public.has_unit_access(v_tenant_id, v_location_unit_id) then
      raise exception 'forbidden_unit' using errcode = '42501';
    end if;
  end if;

  insert into public.inventory_lots (tenant_id, item_id, location_id, lot_code, expires_at, received_at, status, unit_cost_cents, metadata)
  values (
    v_tenant_id,
    v_item_id,
    v_location_id,
    nullif(trim(p_payload->>'lotCode'), ''),
    nullif(p_payload->>'expiresAt', '')::date,
    coalesce(nullif(p_payload->>'receivedAt', '')::date, current_date),
    coalesce(nullif(p_payload->>'status', ''), 'active'),
    case when security.has_permission(v_tenant_id, 'inventory.cost.read', false) then nullif(p_payload->>'unitCostCents', '')::integer else null end,
    coalesce(p_payload->'metadata', '{}'::jsonb)
  ) returning * into v_lot;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'inventory_lot.created', 'inventory_lot', v_lot.id::text, jsonb_build_object('itemId', v_item_id, 'locationId', v_location_id, 'expiresAt', v_lot.expires_at));

  return jsonb_build_object('id', v_lot.id, 'itemId', v_lot.item_id, 'lotCode', v_lot.lot_code, 'expiresAt', v_lot.expires_at, 'locationId', v_lot.location_id);
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
  v_required_permission text;
  v_location_unit_id uuid;
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;

  v_required_permission := case when v_reason in ('transfer_in', 'transfer_out') then 'inventory.transfer' else 'inventory.adjust' end;
  if v_tenant_id is null or not security.has_permission(v_tenant_id, v_required_permission, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_item_id is null or v_quantity <= 0 or v_direction not in ('in', 'out') or v_reason not in ('receipt', 'consumption', 'loss', 'adjustment', 'transfer_in', 'transfer_out', 'reservation', 'release') then
    raise exception 'invalid_inventory_movement' using errcode = '22023';
  end if;
  if nullif(trim(p_payload->>'reasonNote'), '') is null then
    raise exception 'inventory_reason_note_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.inventory_items where tenant_id = v_tenant_id and id = v_item_id and status = 'active') then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  if v_location_id is not null then
    select unit_id into v_location_unit_id from public.inventory_locations where tenant_id = v_tenant_id and id = v_location_id;
    if not found then
      raise exception 'inventory_location_not_found' using errcode = 'P0002';
    end if;
    if not public.has_unit_access(v_tenant_id, v_location_unit_id) then
      raise exception 'forbidden_unit' using errcode = '42501';
    end if;
  end if;
  if v_lot_id is not null and not exists (
    select 1 from public.inventory_lots
    where tenant_id = v_tenant_id and id = v_lot_id and item_id = v_item_id and (location_id is not distinct from v_location_id)
  ) then
    raise exception 'inventory_lot_not_found' using errcode = 'P0002';
  end if;

  v_delta := case when v_direction = 'in' then v_quantity else -v_quantity end;

  insert into public.inventory_stock_snapshots (tenant_id, item_id, location_id, lot_id, quantity_on_hand, quantity_reserved)
  values (v_tenant_id, v_item_id, v_location_id, v_lot_id, greatest(v_delta, 0), 0)
  on conflict (tenant_id, item_id, location_id, lot_id) do update
  set quantity_on_hand = public.inventory_stock_snapshots.quantity_on_hand + v_delta,
      updated_at = now()
  returning quantity_on_hand into v_current;

  if v_current < 0 then
    raise exception 'negative_stock_blocked' using errcode = '23514';
  end if;

  insert into public.inventory_movements (tenant_id, item_id, lot_id, location_id, movement_type, direction, reason, quantity, unit_cost_cents, related_patient_id, reference_type, reference_id, created_by, metadata, occurred_at)
  values (
    v_tenant_id,
    v_item_id,
    v_lot_id,
    v_location_id,
    case when v_reason like 'transfer%' then 'transfer' when v_reason = 'adjustment' then 'adjustment' when v_direction = 'in' then 'in' else 'out' end,
    v_direction,
    v_reason,
    v_quantity,
    case when security.has_permission(v_tenant_id, 'inventory.cost.read', false) then nullif(p_payload->>'unitCostCents', '')::integer else null end,
    nullif(p_payload->>'patientId', '')::uuid,
    nullif(p_payload->>'referenceType', ''),
    nullif(p_payload->>'referenceId', '')::uuid,
    auth.uid(),
    coalesce(p_payload->'metadata', '{}'::jsonb) || jsonb_build_object('reasonNote', left(trim(p_payload->>'reasonNote'), 500)),
    coalesce(nullif(p_payload->>'occurredAt', '')::timestamptz, now())
  ) returning id into v_movement_id;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_tenant_id, auth.uid(), 'inventory_movement.created', 'inventory_movement', v_movement_id::text, jsonb_build_object('itemId', v_item_id, 'locationId', v_location_id, 'lotId', v_lot_id, 'direction', v_direction, 'reason', v_reason, 'quantity', v_quantity, 'quantityOnHand', v_current));

  if v_reason in ('loss', 'adjustment', 'transfer_in', 'transfer_out') then
    insert into public.notifications (tenant_id, user_id, title, body, category, status, metadata)
    values (v_tenant_id, auth.uid(), 'Movimentacao de estoque registrada', 'Uma movimentacao sensivel de estoque foi auditada.', 'inventory', 'unread', jsonb_build_object('movementId', v_movement_id, 'itemId', v_item_id, 'href', '/clinic/inventory'));
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

  return jsonb_build_object('outMovementId', v_out->>'id', 'inMovementId', v_in->>'id', 'quantityOnHandDestination', v_in->>'quantityOnHand');
end;
$$;

create or replace function public.emit_inventory_operational_notifications(p_days_to_expiry integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_alerts jsonb;
  v_inserted integer := 0;
  v_alert jsonb;
begin
  select tm.tenant_id into v_tenant_id
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid() and tm.status = 'active' and p.is_active = true
  order by tm.created_at desc
  limit 1;

  if v_tenant_id is null or not security.has_permission(v_tenant_id, 'inventory.read', false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_alerts := (public.list_inventory_operations_snapshot(false, p_days_to_expiry)->'alerts');

  for v_alert in select * from jsonb_array_elements(v_alerts)
  loop
    insert into public.notifications (tenant_id, user_id, title, body, category, status, metadata)
    values (
      v_tenant_id,
      auth.uid(),
      case when v_alert->>'type' = 'minimum_stock' then 'Estoque abaixo do minimo' else 'Lote com validade critica' end,
      case when v_alert->>'type' = 'minimum_stock' then 'Revise reposicao do item em estoque.' else 'Revise lote vencido ou proximo do vencimento.' end,
      'inventory',
      'unread',
      v_alert
    );
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'alerts', jsonb_array_length(v_alerts));
end;
$$;

revoke all on function public.list_inventory_operations_snapshot(boolean, integer) from public;
revoke all on function public.upsert_inventory_item(jsonb) from public;
revoke all on function public.create_inventory_lot(jsonb) from public;
revoke all on function public.transfer_inventory_stock(jsonb) from public;
revoke all on function public.emit_inventory_operational_notifications(integer) from public;

grant execute on function public.list_inventory_operations_snapshot(boolean, integer) to authenticated, service_role;
grant execute on function public.upsert_inventory_item(jsonb) to authenticated, service_role;
grant execute on function public.create_inventory_lot(jsonb) to authenticated, service_role;
grant execute on function public.transfer_inventory_stock(jsonb) to authenticated, service_role;
grant execute on function public.emit_inventory_operational_notifications(integer) to authenticated, service_role;

comment on function public.list_inventory_operations_snapshot(boolean, integer) is 'Returns operational inventory catalog, lots, locations, ledger movements and alerts with cost gated by inventory.cost.read.';
comment on function public.transfer_inventory_stock(jsonb) is 'Creates immutable transfer-out and transfer-in inventory ledger movements in one transaction, blocking negative stock.';
