-- Return the audited inventory error before the stock snapshot check
-- constraint is reached.

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

  v_required_permission := case
    when v_reason in ('transfer_in', 'transfer_out') then 'inventory.transfer'
    else 'inventory.adjust'
  end;
  if v_tenant_id is null or not security.has_permission(v_tenant_id, v_required_permission, false) then
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
      'itemId',
      v_item_id,
      'locationId',
      v_location_id,
      'lotId',
      v_lot_id,
      'direction',
      v_direction,
      'reason',
      v_reason,
      'quantity',
      v_quantity,
      'quantityOnHand',
      v_current
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

grant execute on function public.create_inventory_movement(jsonb) to authenticated, service_role;
