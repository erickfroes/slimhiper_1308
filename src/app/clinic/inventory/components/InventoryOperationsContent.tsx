'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PackagePlus,
  RefreshCw,
  Save,
  Search,
} from 'lucide-react';
import {
  createInventoryLot,
  createInventoryMovement,
  emitInventoryNotifications,
  getInventorySnapshot,
  saveInventoryCategory,
  saveInventoryItem,
  saveInventoryLocation,
  transferInventoryStock,
  type InventoryItem,
  type InventoryItemStatus,
  type InventoryMovementReason,
  type InventorySnapshot,
} from '@/services/inventoryApi';
import { Alert, EmptyState, ErrorState, LoadingSkeleton, RestrictedState } from '@/components/ui';

type MovementMode = 'receipt' | 'consumption' | 'loss' | 'adjustment' | 'transfer';

const movementOptions: Array<{ value: MovementMode; label: string; direction: 'in' | 'out' }> = [
  { value: 'receipt', label: 'Recebimento', direction: 'in' },
  { value: 'consumption', label: 'Consumo', direction: 'out' },
  { value: 'loss', label: 'Perda', direction: 'out' },
  { value: 'adjustment', label: 'Ajuste', direction: 'in' },
  { value: 'transfer', label: 'Transferência', direction: 'out' },
];

const unitOptions = [
  { value: 'unidade', label: 'Unidade' },
  { value: 'caixa', label: 'Caixa' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'frasco', label: 'Frasco' },
  { value: 'ampola', label: 'Ampola' },
  { value: 'comprimido', label: 'Comprimido' },
  { value: 'capsula', label: 'Capsula' },
  { value: 'ml', label: 'mL' },
  { value: 'l', label: 'L' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'dose', label: 'Dose' },
  { value: 'sessao', label: 'Sessao' },
];

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

const emptyItemForm: {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  unit: string;
  status: InventoryItemStatus;
  minimumQuantity: string;
  defaultUnitCost: string;
  initialQuantity: string;
  initialLocationId: string;
  initialLotCode: string;
  initialExpiresAt: string;
} = {
  id: '',
  sku: '',
  name: '',
  categoryId: '',
  unit: 'unidade',
  status: 'active',
  minimumQuantity: '0',
  defaultUnitCost: '',
  initialQuantity: '',
  initialLocationId: '',
  initialLotCode: '',
  initialExpiresAt: '',
};

const emptyCategoryForm = {
  name: '',
};

const emptyLocationForm = {
  code: '',
  name: '',
};

const emptyMovementForm = {
  mode: 'receipt' as MovementMode,
  itemId: '',
  lotId: '',
  locationId: '',
  toLocationId: '',
  lotCode: '',
  expiresAt: '',
  quantity: '1',
  unitCost: '',
  reasonNote: '',
};

function formatQuantity(value: number, unit?: string) {
  return `${numberFormatter.format(value)}${unit ? ` ${unit}` : ''}`;
}

function formatCurrency(cents: number | null | undefined) {
  if (cents == null) return 'Restrito';
  return currencyFormatter.format(cents / 100);
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem validade';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sem validade';
  return date.toLocaleDateString('pt-BR');
}

function inventoryActionErrorMessage(message: string | undefined, action: 'read' | 'write') {
  const fallback =
    action === 'read'
      ? 'Nao foi possivel carregar o estoque.'
      : 'Nao foi possivel salvar no estoque.';
  const normalized = (message ?? '').toLowerCase();
  if (normalized.includes('forbidden') || normalized.includes('42501')) {
    return action === 'read'
      ? 'Seu usuario precisa da permissao inventory.read.'
      : 'Seu usuario precisa de permissao de estoque para gravar, ajustar ou transferir.';
  }
  if (normalized.includes('inventory_location_not_found')) {
    return 'Selecione um local de estoque existente ou cadastre um novo local.';
  }
  if (normalized.includes('inventory_lot_not_found')) {
    return 'Selecione um lote compativel com o item e o local de origem.';
  }
  if (normalized.includes('negative_stock_blocked')) {
    return 'A movimentacao foi bloqueada porque deixaria o saldo negativo.';
  }
  return message || fallback;
}

function getAlertTone(severity: string) {
  if (severity === 'critical')
    return 'border-negative-border bg-negative-bg text-negative-foreground';
  if (severity === 'high') return 'border-orange-200 bg-orange-50 text-orange-800';
  return 'border-warning-border bg-warning-bg text-warning-foreground';
}

function parsePositiveNumber(value: string, fieldLabel: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldLabel} deve ser maior que zero.`);
  }
  return parsed;
}

function parseNonNegativeNumber(value: string, fieldLabel: string) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} nao pode ser negativo.`);
  }
  return parsed;
}

function toOptionalCents(value: string) {
  if (!value) return undefined;
  return Math.round(parseNonNegativeNumber(value, 'Custo') * 100);
}

export default function InventoryOperationsContent() {
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [locationForm, setLocationForm] = useState(emptyLocationForm);
  const [movementForm, setMovementForm] = useState(emptyMovementForm);

  async function loadInventory() {
    setLoading(true);
    setError(null);
    const result = await getInventorySnapshot({ includeCost: true, daysToExpiry: 30 });
    if (result.error) {
      setError(inventoryActionErrorMessage(result.error.message, 'read'));
      setSnapshot(null);
    } else {
      setSnapshot(result.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadInventory();
  }, []);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (snapshot?.items ?? []).filter((item) => {
      const matchesSearch = !term || `${item.name} ${item.sku ?? ''}`.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === 'all' || item.categoryId === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [categoryFilter, search, snapshot?.items]);

  const filteredLots = useMemo(() => {
    return (snapshot?.lots ?? []).filter((lot) => {
      const activeLocationFilter = movementForm.locationId || locationFilter;
      const matchesLocation =
        activeLocationFilter === 'all' ||
        !activeLocationFilter ||
        lot.locationId === activeLocationFilter;
      const matchesItem = !movementForm.itemId || lot.itemId === movementForm.itemId;
      return matchesLocation && matchesItem;
    });
  }, [locationFilter, movementForm.itemId, movementForm.locationId, snapshot?.lots]);

  const selectedItem = useMemo(
    () => snapshot?.items.find((item) => item.id === movementForm.itemId) ?? null,
    [movementForm.itemId, snapshot?.items]
  );

  const totals = useMemo(() => {
    const items = snapshot?.items ?? [];
    return {
      activeItems: items.filter((item) => item.status === 'active').length,
      criticalItems: items.filter((item) => item.quantityOnHand <= item.minimumQuantity).length,
      expiringLots: (snapshot?.alerts ?? []).filter((alert) => alert.type === 'lot_expiry').length,
    };
  }, [snapshot?.alerts, snapshot?.items]);

  function editItem(item: InventoryItem) {
    setItemForm({
      id: item.id,
      sku: item.sku ?? '',
      name: item.name,
      categoryId: item.categoryId ?? '',
      unit: item.unit,
      status: item.status,
      minimumQuantity: String(item.minimumQuantity),
      defaultUnitCost:
        item.defaultUnitCostCents == null ? '' : String(item.defaultUnitCostCents / 100),
      initialQuantity: '',
      initialLocationId: '',
      initialLotCode: '',
      initialExpiresAt: '',
    });
  }

  async function handleSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    let minimumQuantity = 0;
    let initialQuantity = 0;
    let defaultUnitCostCents: number | undefined;
    try {
      if (!itemForm.name.trim()) {
        throw new Error('Informe o nome do item.');
      }
      if (!itemForm.unit.trim()) {
        throw new Error('Informe a unidade do item.');
      }
      minimumQuantity = parseNonNegativeNumber(itemForm.minimumQuantity, 'Estoque minimo');
      initialQuantity = itemForm.id
        ? 0
        : parseNonNegativeNumber(itemForm.initialQuantity, 'Quantidade inicial');
      defaultUnitCostCents = toOptionalCents(itemForm.defaultUnitCost);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Dados invalidos.');
      setSaving(false);
      return;
    }

    const result = await saveInventoryItem({
      id: itemForm.id || undefined,
      sku: itemForm.sku.trim() || undefined,
      name: itemForm.name.trim(),
      categoryId: itemForm.categoryId || undefined,
      unit: itemForm.unit.trim(),
      status: itemForm.status,
      minimumQuantity,
      defaultUnitCostCents,
    });
    if (result.error) {
      setError(inventoryActionErrorMessage(result.error.message, 'write'));
    } else {
      const itemId = result.data?.id ?? itemForm.id;
      if (!itemForm.id && initialQuantity > 0 && itemId) {
        let lotId: string | undefined;
        if (itemForm.initialLotCode.trim() || itemForm.initialExpiresAt) {
          const lotResult = await createInventoryLot({
            itemId,
            locationId: itemForm.initialLocationId || undefined,
            lotCode: itemForm.initialLotCode.trim() || undefined,
            expiresAt: itemForm.initialExpiresAt || undefined,
            unitCostCents: defaultUnitCostCents,
          });
          if (lotResult.error || !lotResult.data) {
            setError(
              inventoryActionErrorMessage(
                lotResult.error?.message ?? 'Nao foi possivel cadastrar o lote inicial.',
                'write'
              )
            );
            setSaving(false);
            return;
          }
          lotId = lotResult.data.id;
        }

        const movementResult = await createInventoryMovement({
          itemId,
          lotId,
          locationId: itemForm.initialLocationId || undefined,
          direction: 'in',
          reason: 'receipt',
          quantity: initialQuantity,
          unitCostCents: defaultUnitCostCents,
          reasonNote: 'Saldo inicial informado no cadastro do item.',
        });
        if (movementResult.error) {
          setError(inventoryActionErrorMessage(movementResult.error.message, 'write'));
          setSaving(false);
          return;
        }
      }

      setNotice(
        itemForm.id
          ? 'Item atualizado com auditoria.'
          : initialQuantity > 0
            ? 'Item cadastrado e saldo inicial registrado no ledger.'
            : 'Item cadastrado com auditoria.'
      );
      setItemForm(emptyItemForm);
      await loadInventory();
    }
    setSaving(false);
  }

  async function handleSaveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const name = categoryForm.name.trim();
    if (!name) {
      setError('Informe o nome da categoria.');
      setSaving(false);
      return;
    }

    const result = await saveInventoryCategory({ name });
    if (result.error || !result.data) {
      setError(
        inventoryActionErrorMessage(
          result.error?.message ?? 'Nao foi possivel salvar a categoria.',
          'write'
        )
      );
    } else {
      setNotice('Categoria salva e disponivel no cadastro de item.');
      setCategoryForm(emptyCategoryForm);
      setItemForm((current) => ({ ...current, categoryId: result.data?.id ?? current.categoryId }));
      await loadInventory();
    }
    setSaving(false);
  }

  async function handleSaveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const name = locationForm.name.trim();
    if (!name) {
      setError('Informe o nome do local.');
      setSaving(false);
      return;
    }

    const result = await saveInventoryLocation({
      name,
      code: locationForm.code.trim() || undefined,
    });
    if (result.error || !result.data) {
      setError(
        inventoryActionErrorMessage(
          result.error?.message ?? 'Nao foi possivel salvar o local.',
          'write'
        )
      );
    } else {
      setNotice('Local salvo e disponivel nas movimentacoes.');
      setLocationForm(emptyLocationForm);
      setMovementForm((current) => ({
        ...current,
        locationId: current.locationId || result.data?.id || '',
      }));
      await loadInventory();
    }
    setSaving(false);
  }

  async function handleMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const mode = movementForm.mode;
    const option = movementOptions.find((item) => item.value === mode) ?? movementOptions[0];
    let lotId = movementForm.lotId || undefined;
    let quantity = 0;
    let unitCostCents: number | undefined;

    try {
      quantity = parsePositiveNumber(movementForm.quantity, 'Quantidade');
      unitCostCents = toOptionalCents(movementForm.unitCost);
      if (mode === 'transfer' && !movementForm.locationId) {
        throw new Error('Informe o local de origem para transferencia.');
      }
      if (mode === 'transfer' && !movementForm.toLocationId) {
        throw new Error('Informe o local de destino para transferencia.');
      }
      if (!movementForm.reasonNote.trim()) {
        throw new Error('Informe o motivo obrigatorio para auditoria.');
      }
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Dados invalidos.');
      setSaving(false);
      return;
    }

    if (mode === 'receipt' && (movementForm.lotCode.trim() || movementForm.expiresAt)) {
      const lotResult = await createInventoryLot({
        itemId: movementForm.itemId,
        locationId: movementForm.locationId || undefined,
        lotCode: movementForm.lotCode.trim() || undefined,
        expiresAt: movementForm.expiresAt || undefined,
        unitCostCents,
      });
      if (lotResult.error || !lotResult.data) {
        setError(
          inventoryActionErrorMessage(
            lotResult.error?.message ?? 'Nao foi possivel cadastrar o lote.',
            'write'
          )
        );
        setSaving(false);
        return;
      }
      lotId = lotResult.data.id;
    }

    const result =
      mode === 'transfer'
        ? await transferInventoryStock({
            itemId: movementForm.itemId,
            lotId,
            fromLocationId: movementForm.locationId,
            toLocationId: movementForm.toLocationId,
            quantity,
            reasonNote: movementForm.reasonNote.trim(),
          })
        : await createInventoryMovement({
            itemId: movementForm.itemId,
            lotId,
            locationId: movementForm.locationId || undefined,
            direction: option.direction,
            reason: mode as InventoryMovementReason,
            quantity,
            unitCostCents,
            reasonNote: movementForm.reasonNote.trim(),
          });

    if (result.error) {
      setError(inventoryActionErrorMessage(result.error.message, 'write'));
    } else {
      setNotice('Movimentacao imutavel registrada no ledger.');
      setMovementForm(emptyMovementForm);
      await loadInventory();
    }
    setSaving(false);
  }

  async function handleEmitNotifications() {
    setSaving(true);
    setError(null);
    const result = await emitInventoryNotifications();
    if (result.error) setError(inventoryActionErrorMessage(result.error.message, 'write'));
    else setNotice(`${result.data?.inserted ?? 0} notificacoes operacionais emitidas.`);
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="p-6 xl:p-8 max-w-screen-2xl mx-auto space-y-4">
        <LoadingSkeleton className="h-24" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <LoadingSkeleton key={index} className="h-56" />
          ))}
        </div>
      </main>
    );
  }

  const forbidden = error?.toLowerCase().includes('forbidden') || error?.includes('42501');

  if (error && !snapshot) {
    return (
      <main className="p-6 xl:p-8 max-w-screen-2xl mx-auto space-y-4">
        {forbidden ? (
          <RestrictedState title="Acesso ao estoque negado">
            Seu usuário precisa da permissão inventory.read.
          </RestrictedState>
        ) : (
          <ErrorState title="Estoque indisponível">{error}</ErrorState>
        )}
        <div>
          <button type="button" onClick={loadInventory} className="btn-secondary min-h-11 px-4">
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 xl:p-8 max-w-screen-2xl mx-auto space-y-6">
      <section className="card-base p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Estoque operacional</p>
            <h1 className="text-2xl font-bold text-foreground">
              Lotes, validade, unidade e ledger
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Controle multiunidade com saldos calculados por movimentacoes auditadas. Custo aparece
              apenas para quem possui inventory.cost.read.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadInventory}
              className="btn-secondary min-h-11 gap-2 px-3 text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
            <button
              type="button"
              onClick={handleEmitNotifications}
              disabled={saving}
              className="btn-primary min-h-11 gap-2 px-3 text-sm"
            >
              <Bell className="h-4 w-4" /> Emitir alertas
            </button>
          </div>
        </div>
        {notice ? (
          <Alert className="mt-4" tone="success" title="Operação concluída">
            {notice}
          </Alert>
        ) : null}
        {error ? (
          <Alert className="mt-4" tone="danger" title="Atenção necessária">
            {error}
          </Alert>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card-base p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Itens ativos</span>
            <Boxes className="h-5 w-5" />
          </div>
          <p className="mt-3 text-3xl font-bold tabular-nums">{totals.activeItems}</p>
        </div>
        <div className="card-base p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Abaixo do mínimo</span>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="mt-3 text-3xl font-bold tabular-nums text-orange-600">
            {totals.criticalItems}
          </p>
        </div>
        <div className="card-base p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Lotes críticos</span>
            <ClipboardList className="h-5 w-5" />
          </div>
          <p className="mt-3 text-3xl font-bold tabular-nums text-negative-foreground">
            {totals.expiringLots}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <div className="space-y-4">
          <div className="card-base p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por item ou SKU"
                  className="input-base min-h-11 pl-9 text-sm"
                />
              </label>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="input-base min-h-11 text-sm"
              >
                <option value="all">Todas as categorias</option>
                {snapshot?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                className="input-base min-h-11 text-sm"
              >
                <option value="all">Todos os locais</option>
                {snapshot?.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card card-shadow">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-semibold text-foreground">Saldos por item</h2>
              <span className="text-xs text-muted-foreground">Selecione para editar</span>
            </div>
            {filteredItems.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="Nenhum item encontrado"
                description="Ajuste os filtros ou cadastre um item para iniciar o controle de estoque."
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-surface-subtle text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3">Categoria</th>
                        <th className="px-4 py-3 text-right">Estoque atual</th>
                        <th className="px-4 py-3 text-right">Mínimo</th>
                        <th className="px-4 py-3 text-right">Reservado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredItems.map((item) => (
                        <tr key={item.id} className="transition-colors hover:bg-hover">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => editItem(item)}
                              className="rounded-sm text-left font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {item.name}
                            </button>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {item.sku || 'Sem SKU'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {item.categoryName ?? 'Sem categoria'}
                          </td>
                          <td
                            className={[
                              'px-4 py-3 text-right font-semibold tabular-nums',
                              item.quantityOnHand <= item.minimumQuantity
                                ? 'text-orange-700'
                                : 'text-foreground',
                            ].join(' ')}
                          >
                            {formatQuantity(item.quantityOnHand, item.unit)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {formatQuantity(item.minimumQuantity, item.unit)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {formatQuantity(item.quantityReserved, item.unit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-border md:hidden">
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => editItem(item)}
                      className="w-full p-4 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-semibold text-foreground">{item.name}</h2>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {item.sku || 'sem SKU'}
                            </span>
                            {item.status !== 'active' ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                {item.status}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.categoryName ?? 'Sem categoria'} · minimo{' '}
                            {formatQuantity(item.minimumQuantity, item.unit)} · custo{' '}
                            {formatCurrency(item.defaultUnitCostCents)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={
                              item.quantityOnHand <= item.minimumQuantity
                                ? 'text-lg font-bold tabular-nums text-orange-700'
                                : 'text-lg font-bold text-foreground'
                            }
                          >
                            {formatQuantity(item.quantityOnHand, item.unit)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            reservado {formatQuantity(item.quantityReserved, item.unit)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card card-shadow">
            <div className="border-b border-border px-4 py-3 font-semibold">Lotes e validade</div>
            <div className="divide-y divide-border">
              {filteredLots.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Nenhum lote para o item/local selecionado.
                </div>
              ) : null}
              {filteredLots.map((lot) => (
                <div key={lot.id} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="font-semibold">
                      {lot.itemName} · {lot.lotCode || 'lote sem código'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lot.locationName ?? 'Sem local'} · validade {formatDate(lot.expiresAt)} ·
                      custo {formatCurrency(lot.unitCostCents)}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="font-bold">{formatQuantity(lot.quantityOnHand)}</p>
                    <p
                      className={
                        lot.daysToExpiry != null && lot.daysToExpiry < 0
                          ? 'text-xs text-red-600'
                          : 'text-xs text-muted-foreground'
                      }
                    >
                      {lot.daysToExpiry == null
                        ? 'Sem validade'
                        : lot.daysToExpiry < 0
                          ? `Vencido ha ${Math.abs(lot.daysToExpiry)} dias`
                          : `${lot.daysToExpiry} dias para vencer`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <form
            onSubmit={handleSaveCategory}
            className="rounded-2xl border border-border bg-card p-4 space-y-3"
          >
            <div className="font-semibold">Categorias</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={categoryForm.name}
                onChange={(event) => setCategoryForm({ name: event.target.value })}
                placeholder="Nova categoria"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-60"
              >
                <PackagePlus className="h-4 w-4" /> Adicionar
              </button>
            </div>
          </form>

          <form
            onSubmit={handleSaveLocation}
            className="rounded-2xl border border-border bg-card p-4 space-y-3"
          >
            <div className="font-semibold">Locais de estoque</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[0.7fr_1fr_auto]">
              <input
                value={locationForm.code}
                onChange={(event) =>
                  setLocationForm((current) => ({ ...current, code: event.target.value }))
                }
                placeholder="Codigo"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={locationForm.name}
                onChange={(event) =>
                  setLocationForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Nome do local"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-60"
              >
                <Save className="h-4 w-4" /> Salvar
              </button>
            </div>
          </form>

          <form
            onSubmit={handleSaveItem}
            className="rounded-2xl border border-border bg-card p-4 space-y-3"
          >
            <div className="flex items-center gap-2 font-semibold">
              <PackagePlus className="h-5 w-5" /> Cadastro/edição de item
            </div>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Nome do item
              <input
                required
                value={itemForm.name}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ex.: Luva nitrilica P"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
                Codigo interno
                <input
                  value={itemForm.sku}
                  onChange={(event) =>
                    setItemForm((current) => ({ ...current, sku: event.target.value }))
                  }
                  placeholder="Ex.: LUVA-P"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
                Unidade/volume
                <select
                  required
                  value={itemForm.unit}
                  onChange={(event) =>
                    setItemForm((current) => ({ ...current, unit: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  {unitOptions.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Categoria
              <select
                value={itemForm.categoryId}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, categoryId: event.target.value }))
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Sem categoria</option>
                {snapshot?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0"
                step="0.001"
                value={itemForm.minimumQuantity}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, minimumQuantity: event.target.value }))
                }
                placeholder="Estoque mínimo"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemForm.defaultUnitCost}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, defaultUnitCost: event.target.value }))
                }
                placeholder="Custo (restrito)"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            {!itemForm.id ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 space-y-2">
                <div className="text-xs font-semibold text-foreground">Saldo inicial</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
                    Quantidade inicial
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={itemForm.initialQuantity}
                      onChange={(event) =>
                        setItemForm((current) => ({
                          ...current,
                          initialQuantity: event.target.value,
                        }))
                      }
                      placeholder="0"
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
                    Local inicial
                    <select
                      value={itemForm.initialLocationId}
                      onChange={(event) =>
                        setItemForm((current) => ({
                          ...current,
                          initialLocationId: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Sem local</option>
                      {snapshot?.locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
                    Lote inicial
                    <input
                      value={itemForm.initialLotCode}
                      onChange={(event) =>
                        setItemForm((current) => ({
                          ...current,
                          initialLotCode: event.target.value,
                        }))
                      }
                      placeholder="Opcional"
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
                    Validade
                    <input
                      type="date"
                      value={itemForm.initialExpiresAt}
                      onChange={(event) =>
                        setItemForm((current) => ({
                          ...current,
                          initialExpiresAt: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              </div>
            ) : null}
            <select
              value={itemForm.status}
              onChange={(event) =>
                setItemForm((current) => ({
                  ...current,
                  status: event.target.value as typeof itemForm.status,
                }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="archived">Arquivado</option>
            </select>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{' '}
              Salvar item
            </button>
          </form>

          <form
            onSubmit={handleMovement}
            className="rounded-2xl border border-border bg-card p-4 space-y-3"
          >
            <div className="flex items-center gap-2 font-semibold">
              <ArrowRightLeft className="h-5 w-5" /> Movimentação imutável
            </div>
            {(snapshot?.locations ?? []).length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Cadastre um local de estoque para popular origem e destino.
              </div>
            ) : null}
            <select
              value={movementForm.mode}
              onChange={(event) =>
                setMovementForm((current) => ({
                  ...current,
                  mode: event.target.value as MovementMode,
                  lotId: '',
                  toLocationId: '',
                }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              {movementOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              required
              value={movementForm.itemId}
              onChange={(event) =>
                setMovementForm((current) => ({
                  ...current,
                  itemId: event.target.value,
                  lotId: '',
                }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecione o item</option>
              {snapshot?.items
                .filter((item) => item.status === 'active')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={movementForm.locationId}
                onChange={(event) =>
                  setMovementForm((current) => ({
                    ...current,
                    locationId: event.target.value,
                    lotId: '',
                    toLocationId:
                      current.toLocationId === event.target.value ? '' : current.toLocationId,
                  }))
                }
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Local origem</option>
                {snapshot?.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              {movementForm.mode === 'transfer' ? (
                <select
                  required
                  value={movementForm.toLocationId}
                  onChange={(event) =>
                    setMovementForm((current) => ({ ...current, toLocationId: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Destino</option>
                  {snapshot?.locations
                    .filter((location) => location.id !== movementForm.locationId)
                    .map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                </select>
              ) : (
                <select
                  value={movementForm.lotId}
                  onChange={(event) =>
                    setMovementForm((current) => ({ ...current, lotId: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Sem lote</option>
                  {filteredLots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.lotCode || lot.id.slice(0, 8)} · {formatDate(lot.expiresAt)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {movementForm.mode === 'transfer' ? (
              <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
                Lote da origem
                <select
                  value={movementForm.lotId}
                  onChange={(event) =>
                    setMovementForm((current) => ({ ...current, lotId: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Sem lote</option>
                  {filteredLots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.lotCode || lot.id.slice(0, 8)} - {formatDate(lot.expiresAt)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {movementForm.mode === 'receipt' ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={movementForm.lotCode}
                  onChange={(event) =>
                    setMovementForm((current) => ({ ...current, lotCode: event.target.value }))
                  }
                  placeholder="Novo lote"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={movementForm.expiresAt}
                  onChange={(event) =>
                    setMovementForm((current) => ({ ...current, expiresAt: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                type="number"
                min="0.001"
                step="0.001"
                value={movementForm.quantity}
                onChange={(event) =>
                  setMovementForm((current) => ({ ...current, quantity: event.target.value }))
                }
                placeholder="Quantidade"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={movementForm.unitCost}
                onChange={(event) =>
                  setMovementForm((current) => ({ ...current, unitCost: event.target.value }))
                }
                placeholder="Custo unitário"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <textarea
              required
              value={movementForm.reasonNote}
              onChange={(event) =>
                setMovementForm((current) => ({ ...current, reasonNote: event.target.value }))
              }
              placeholder="Motivo obrigatório para auditoria"
              className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            {selectedItem ? (
              <p className="text-xs text-muted-foreground">
                Saldo atual de {selectedItem.name}:{' '}
                {formatQuantity(selectedItem.quantityOnHand, selectedItem.unit)}. Saídas são
                bloqueadas se gerarem saldo negativo.
              </p>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}{' '}
              Registrar ledger
            </button>
          </form>

          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="font-semibold">Alertas operacionais</div>
            {(snapshot?.alerts ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem alertas de mínimo ou validade.</p>
            ) : null}
            {snapshot?.alerts.map((alert, index) => (
              <div
                key={`${alert.type}-${alert.itemId}-${alert.lotId ?? index}`}
                className={`rounded-xl border p-3 text-sm ${getAlertTone(alert.severity)}`}
              >
                <p className="font-semibold">
                  {alert.type === 'minimum_stock' ? 'Estoque abaixo do mínimo' : 'Validade crítica'}
                </p>
                <p>
                  {alert.itemName}
                  {alert.lotCode ? ` · lote ${alert.lotCode}` : ''}
                </p>
                <p className="text-xs opacity-80">
                  {alert.expiresAt
                    ? `Vence em ${formatDate(alert.expiresAt)}`
                    : `Saldo ${formatQuantity(alert.quantityOnHand ?? 0)} / mínimo ${formatQuantity(alert.minimumQuantity ?? 0)}`}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3 font-semibold">Ledger recente</div>
        <div className="divide-y divide-border">
          {(snapshot?.movements ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhuma movimentacao registrada.
            </div>
          ) : null}
          {snapshot?.movements.map((movement) => (
            <div key={movement.id} className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="font-semibold">
                  {movement.itemName} · {movement.reason}
                </p>
                <p className="text-xs text-muted-foreground">
                  {movement.locationName ?? 'Sem local'} · {movement.lotCode ?? 'sem lote'} ·{' '}
                  {movement.metadata?.reasonNote ?? 'Sem motivo detalhado'}
                </p>
              </div>
              <div className="text-left lg:text-right">
                <p
                  className={
                    movement.direction === 'in'
                      ? 'font-bold text-emerald-700'
                      : 'font-bold text-red-700'
                  }
                >
                  {movement.direction === 'in' ? '+' : '-'}
                  {formatQuantity(movement.quantity)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(movement.occurredAt).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
