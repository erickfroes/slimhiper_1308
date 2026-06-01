import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { SafeServiceError, ServiceEnvelope } from '@/services/crmApi';

export type InventoryItemStatus = 'active' | 'inactive' | 'archived';
export type InventoryLotStatus = 'active' | 'quarantined' | 'expired' | 'depleted' | 'archived';
export type InventoryMovementReason =
  | 'receipt'
  | 'consumption'
  | 'loss'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out'
  | 'reservation'
  | 'release';

export type InventoryCategory = {
  id: string;
  name: string;
  status: InventoryItemStatus;
};

export type InventoryLocation = {
  id: string;
  unitId: string | null;
  code: string;
  name: string;
  status: InventoryItemStatus;
};

export type InventoryItem = {
  id: string;
  sku: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  unitId?: string | null;
  unit: string;
  status: InventoryItemStatus;
  minimumQuantity: number;
  defaultUnitCostCents: number | null;
  quantityOnHand: number;
  quantityReserved: number;
  updatedAt: string;
};

export type InventoryLot = {
  id: string;
  itemId: string;
  itemName?: string;
  locationId: string | null;
  locationName?: string | null;
  lotCode: string | null;
  expiresAt: string | null;
  receivedAt?: string | null;
  status: InventoryLotStatus;
  unitCostCents?: number | null;
  quantityOnHand: number;
  quantityReserved: number;
  daysToExpiry?: number | null;
};

export type InventoryMovement = {
  id: string;
  itemId: string;
  itemName: string;
  lotId: string | null;
  lotCode: string | null;
  locationId: string | null;
  locationName: string | null;
  movementType: 'in' | 'out' | 'adjustment' | 'transfer';
  direction: 'in' | 'out';
  reason: InventoryMovementReason;
  quantity: number;
  unitCostCents: number | null;
  createdBy: string | null;
  occurredAt: string;
  createdAt: string;
  metadata?: { reasonNote?: string } & Record<string, unknown>;
};

export type InventoryAlert = {
  type: 'minimum_stock' | 'lot_expiry';
  severity: 'critical' | 'high' | 'medium' | 'low';
  itemId: string;
  itemName: string;
  lotId?: string;
  lotCode?: string | null;
  expiresAt?: string | null;
  quantityOnHand?: number;
  minimumQuantity?: number;
  href?: string;
};

export type InventorySnapshot = {
  items: InventoryItem[];
  categories: InventoryCategory[];
  locations: InventoryLocation[];
  lots: InventoryLot[];
  movements: InventoryMovement[];
  alerts: InventoryAlert[];
  costIncluded: boolean;
  daysToExpiry: number;
};

export type InventoryItemInput = {
  id?: string;
  sku?: string;
  name: string;
  categoryId?: string;
  unitId?: string;
  unit: string;
  status: InventoryItemStatus;
  minimumQuantity: number;
  defaultUnitCostCents?: number;
};

export type InventoryLotInput = {
  itemId: string;
  locationId?: string;
  lotCode?: string;
  expiresAt?: string;
  receivedAt?: string;
  unitCostCents?: number;
};

export type InventoryMovementInput = {
  itemId: string;
  lotId?: string;
  locationId?: string;
  direction: 'in' | 'out';
  reason: InventoryMovementReason;
  quantity: number;
  unitCostCents?: number;
  patientId?: string;
  reasonNote: string;
};

export type InventoryTransferInput = {
  itemId: string;
  lotId?: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  reasonNote: string;
};

function isMockExplicitlyEnabled() {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function asServiceError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) return { message: error.message || fallback };
  if (error && typeof error === 'object' && 'message' in error) {
    return {
      message: String((error as { message?: unknown }).message ?? fallback),
      code:
        'code' in error && typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : undefined,
    };
  }
  return { message: fallback };
}

const MOCK_SNAPSHOT: InventorySnapshot = {
  costIncluded: true,
  daysToExpiry: 30,
  categories: [{ id: 'mock-cat-1', name: 'Insumos clínicos', status: 'active' }],
  locations: [
    {
      id: 'mock-location-1',
      unitId: null,
      code: 'CENTRAL',
      name: 'Estoque central',
      status: 'active',
    },
  ],
  items: [
    {
      id: 'mock-item-1',
      sku: 'LUVA-P',
      name: 'Luva nitrílica P',
      categoryId: 'mock-cat-1',
      categoryName: 'Insumos clínicos',
      unit: 'caixa',
      status: 'active',
      minimumQuantity: 10,
      defaultUnitCostCents: 4290,
      quantityOnHand: 8,
      quantityReserved: 0,
      updatedAt: new Date().toISOString(),
    },
  ],
  lots: [
    {
      id: 'mock-lot-1',
      itemId: 'mock-item-1',
      itemName: 'Luva nitrílica P',
      locationId: 'mock-location-1',
      locationName: 'Estoque central',
      lotCode: 'L-2026-06',
      expiresAt: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10),
      receivedAt: new Date().toISOString().slice(0, 10),
      status: 'active',
      unitCostCents: 4290,
      quantityOnHand: 8,
      quantityReserved: 0,
      daysToExpiry: 12,
    },
  ],
  movements: [
    {
      id: 'mock-movement-1',
      itemId: 'mock-item-1',
      itemName: 'Luva nitrílica P',
      lotId: 'mock-lot-1',
      lotCode: 'L-2026-06',
      locationId: 'mock-location-1',
      locationName: 'Estoque central',
      movementType: 'in',
      direction: 'in',
      reason: 'receipt',
      quantity: 8,
      unitCostCents: 4290,
      createdBy: null,
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      metadata: { reasonNote: 'Carga mock habilitada explicitamente.' },
    },
  ],
  alerts: [
    {
      type: 'minimum_stock',
      severity: 'high',
      itemId: 'mock-item-1',
      itemName: 'Luva nitrílica P',
      quantityOnHand: 8,
      minimumQuantity: 10,
      href: '/clinic/inventory?itemId=mock-item-1',
    },
  ],
};

function toNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value ?? fallback);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeSnapshot(
  payload: Partial<InventorySnapshot> | null | undefined
): InventorySnapshot {
  return {
    items: (payload?.items ?? []).map((item) => ({
      ...item,
      minimumQuantity: toNumber(item.minimumQuantity),
      defaultUnitCostCents:
        item.defaultUnitCostCents == null ? null : toNumber(item.defaultUnitCostCents),
      quantityOnHand: toNumber(item.quantityOnHand),
      quantityReserved: toNumber(item.quantityReserved),
    })),
    categories: payload?.categories ?? [],
    locations: payload?.locations ?? [],
    lots: (payload?.lots ?? []).map((lot) => ({
      ...lot,
      unitCostCents: lot.unitCostCents == null ? null : toNumber(lot.unitCostCents),
      quantityOnHand: toNumber(lot.quantityOnHand),
      quantityReserved: toNumber(lot.quantityReserved),
      daysToExpiry: lot.daysToExpiry == null ? null : toNumber(lot.daysToExpiry),
    })),
    movements: (payload?.movements ?? []).map((movement) => ({
      ...movement,
      quantity: toNumber(movement.quantity),
      unitCostCents: movement.unitCostCents == null ? null : toNumber(movement.unitCostCents),
    })),
    alerts: payload?.alerts ?? [],
    costIncluded: Boolean(payload?.costIncluded),
    daysToExpiry: toNumber(payload?.daysToExpiry, 30),
  };
}

export async function getInventorySnapshot(options?: {
  includeCost?: boolean;
  daysToExpiry?: number;
}): ServiceEnvelope<InventorySnapshot> {
  if (isMockExplicitlyEnabled()) return { data: MOCK_SNAPSHOT, error: null };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('list_inventory_operations_snapshot', {
      p_include_cost: Boolean(options?.includeCost),
      p_days_to_expiry: options?.daysToExpiry ?? 30,
    });
    if (error) throw error;
    return { data: normalizeSnapshot(data as Partial<InventorySnapshot>), error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel carregar o estoque.') };
  }
}

export async function saveInventoryItem(
  input: InventoryItemInput
): ServiceEnvelope<{ id: string }> {
  if (isMockExplicitlyEnabled())
    return { data: { id: input.id ?? 'mock-item-created' }, error: null };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('upsert_inventory_item', { p_payload: input });
    if (error) throw error;
    return { data: data as { id: string }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel salvar o item.') };
  }
}

export async function createInventoryLot(
  input: InventoryLotInput
): ServiceEnvelope<{ id: string }> {
  if (isMockExplicitlyEnabled()) return { data: { id: 'mock-lot-created' }, error: null };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('create_inventory_lot', { p_payload: input });
    if (error) throw error;
    return { data: data as { id: string }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel cadastrar o lote.') };
  }
}

export async function createInventoryMovement(
  input: InventoryMovementInput
): ServiceEnvelope<{ id: string; quantityOnHand: number }> {
  if (isMockExplicitlyEnabled())
    return { data: { id: 'mock-movement-created', quantityOnHand: 1 }, error: null };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('create_inventory_movement', { p_payload: input });
    if (error) throw error;
    return { data: data as { id: string; quantityOnHand: number }, error: null };
  } catch (error) {
    return {
      data: null,
      error: asServiceError(error, 'Nao foi possivel registrar a movimentacao.'),
    };
  }
}

export async function transferInventoryStock(
  input: InventoryTransferInput
): ServiceEnvelope<{ outMovementId: string; inMovementId: string }> {
  if (isMockExplicitlyEnabled()) {
    return {
      data: { outMovementId: 'mock-transfer-out', inMovementId: 'mock-transfer-in' },
      error: null,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('transfer_inventory_stock', { p_payload: input });
    if (error) throw error;
    return { data: data as { outMovementId: string; inMovementId: string }, error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel transferir o estoque.') };
  }
}

export async function emitInventoryNotifications(): ServiceEnvelope<{
  inserted: number;
  alerts: number;
}> {
  if (isMockExplicitlyEnabled()) return { data: { inserted: 1, alerts: 1 }, error: null };

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('emit_inventory_operational_notifications');
    if (error) throw error;
    return { data: data as { inserted: number; alerts: number }, error: null };
  } catch (error) {
    return {
      data: null,
      error: asServiceError(error, 'Nao foi possivel emitir notificacoes de estoque.'),
    };
  }
}
