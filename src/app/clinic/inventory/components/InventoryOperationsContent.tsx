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
  ShieldAlert,
} from 'lucide-react';
import {
  createInventoryLot,
  createInventoryMovement,
  emitInventoryNotifications,
  getInventorySnapshot,
  saveInventoryItem,
  transferInventoryStock,
  type InventoryItem,
  type InventoryItemStatus,
  type InventoryMovementReason,
  type InventorySnapshot,
} from '@/services/inventoryApi';

type MovementMode = 'receipt' | 'consumption' | 'loss' | 'adjustment' | 'transfer';

const movementOptions: Array<{ value: MovementMode; label: string; direction: 'in' | 'out' }> = [
  { value: 'receipt', label: 'Recebimento', direction: 'in' },
  { value: 'consumption', label: 'Consumo', direction: 'out' },
  { value: 'loss', label: 'Perda', direction: 'out' },
  { value: 'adjustment', label: 'Ajuste', direction: 'in' },
  { value: 'transfer', label: 'Transferência', direction: 'out' },
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
} = {
  id: '',
  sku: '',
  name: '',
  categoryId: '',
  unit: 'unidade',
  status: 'active',
  minimumQuantity: '0',
  defaultUnitCost: '',
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

function getAlertTone(severity: string) {
  if (severity === 'critical') return 'border-red-200 bg-red-50 text-red-800';
  if (severity === 'high') return 'border-orange-200 bg-orange-50 text-orange-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
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
  const [movementForm, setMovementForm] = useState(emptyMovementForm);

  async function loadInventory() {
    setLoading(true);
    setError(null);
    const result = await getInventorySnapshot({ includeCost: true, daysToExpiry: 30 });
    if (result.error) {
      setError(result.error.message);
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
      const matchesLocation = locationFilter === 'all' || lot.locationId === locationFilter;
      const matchesItem = !movementForm.itemId || lot.itemId === movementForm.itemId;
      return matchesLocation && matchesItem;
    });
  }, [locationFilter, movementForm.itemId, snapshot?.lots]);

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
    });
  }

  async function handleSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    let minimumQuantity = 0;
    let defaultUnitCostCents: number | undefined;
    try {
      if (!itemForm.name.trim()) {
        throw new Error('Informe o nome do item.');
      }
      if (!itemForm.unit.trim()) {
        throw new Error('Informe a unidade do item.');
      }
      minimumQuantity = parseNonNegativeNumber(itemForm.minimumQuantity, 'Estoque minimo');
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
      setError(result.error.message);
    } else {
      setNotice(itemForm.id ? 'Item atualizado com auditoria.' : 'Item cadastrado com auditoria.');
      setItemForm(emptyItemForm);
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
        setError(lotResult.error?.message ?? 'Nao foi possivel cadastrar o lote.');
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
      setError(result.error.message);
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
    if (result.error) setError(result.error.message);
    else setNotice(`${result.data?.inserted ?? 0} notificacoes operacionais emitidas.`);
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="p-6 xl:p-8 max-w-screen-2xl mx-auto space-y-4">
        <div className="h-24 rounded-2xl bg-muted animate-pulse" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-56 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  const forbidden = error?.toLowerCase().includes('forbidden') || error?.includes('42501');

  if (error && !snapshot) {
    return (
      <main className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          <div className="flex items-center gap-3">
            {forbidden ? (
              <ShieldAlert className="h-6 w-6" />
            ) : (
              <AlertTriangle className="h-6 w-6" />
            )}
            <div>
              <h1 className="text-lg font-semibold">
                {forbidden ? 'Acesso ao estoque negado' : 'Estoque indisponivel'}
              </h1>
              <p className="text-sm">
                {forbidden ? 'Seu usuario precisa da permissao inventory.read.' : error}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadInventory}
            className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 xl:p-8 max-w-screen-2xl mx-auto space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold"
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
            <button
              type="button"
              onClick={handleEmitNotifications}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Bell className="h-4 w-4" /> Emitir alertas
            </button>
          </div>
        </div>
        {notice ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Itens ativos</span>
            <Boxes className="h-5 w-5" />
          </div>
          <p className="mt-3 text-3xl font-bold">{totals.activeItems}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Abaixo do mínimo</span>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="mt-3 text-3xl font-bold text-orange-600">{totals.criticalItems}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Lotes críticos</span>
            <ClipboardList className="h-5 w-5" />
          </div>
          <p className="mt-3 text-3xl font-bold text-red-600">{totals.expiringLots}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por item ou SKU"
                  className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm"
                />
              </label>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
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
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
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

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 font-semibold">Saldos por item</div>
            {filteredItems.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                Nenhum item encontrado para os filtros atuais.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => editItem(item)}
                    className="w-full p-4 text-left transition hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
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
                              ? 'text-lg font-bold text-orange-600'
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
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
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
            onSubmit={handleSaveItem}
            className="rounded-2xl border border-border bg-card p-4 space-y-3"
          >
            <div className="flex items-center gap-2 font-semibold">
              <PackagePlus className="h-5 w-5" /> Cadastro/edição de item
            </div>
            <input
              required
              value={itemForm.name}
              onChange={(event) =>
                setItemForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Nome do item"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={itemForm.sku}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, sku: event.target.value }))
                }
                placeholder="SKU"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                required
                value={itemForm.unit}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, unit: event.target.value }))
                }
                placeholder="Unidade"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
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
