import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { isMockDataEnabled } from '@/lib/mockMode';

export type CallPanelStatus = 'active' | 'inactive';

export interface CallPanel {
  id: string;
  name: string;
  unitId?: string;
  unitName?: string;
  status: CallPanelStatus;
  publicToken: string;
  settings: { soundEnabled?: boolean; recentCallMinutes?: number };
  updatedAt?: string;
}

export interface CallPanelCall {
  displayName: string;
  roomName: string;
  calledAt: string;
}

export interface CallPanelSnapshot {
  panelName: string;
  soundEnabled: boolean;
  currentCall: CallPanelCall | null;
  recentCalls: CallPanelCall[];
  refreshedAt: string;
}

export interface CallPanelInput {
  id?: string;
  name: string;
  unitId?: string | null;
  status: CallPanelStatus;
  settings?: CallPanel['settings'];
}

const mockPanels: CallPanel[] = [];

function createMockToken() {
  return `mock${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value: unknown): CallPanelStatus {
  return value === 'inactive' ? 'inactive' : 'active';
}

function normalizeCall(value: unknown): CallPanelCall | null {
  const record = asRecord(value);
  const displayName = asString(record.displayName);
  const roomName = asString(record.roomName);
  const calledAt = asString(record.calledAt);
  return displayName && roomName && calledAt ? { displayName, roomName, calledAt } : null;
}

function normalizePanel(value: unknown): CallPanel | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const name = asString(record.name);
  const publicToken = asString(record.publicToken);
  if (!id || !name || !publicToken) return null;

  const settings = asRecord(record.settings);
  return {
    id,
    name,
    unitId: asString(record.unitId) || undefined,
    unitName: asString(record.unitName) || undefined,
    status: normalizeStatus(record.status),
    publicToken,
    settings: {
      soundEnabled: asBoolean(settings.soundEnabled, true),
      recentCallMinutes: Number(settings.recentCallMinutes) || 5,
    },
    updatedAt: asString(record.updatedAt) || undefined,
  };
}

export async function listCallPanels(): Promise<CallPanel[]> {
  if (isMockDataEnabled()) return mockPanels;
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('list_call_panels');
  if (error) throw error;
  return asArray(data)
    .map(normalizePanel)
    .filter((panel): panel is CallPanel => Boolean(panel));
}

export async function saveCallPanel(input: CallPanelInput): Promise<CallPanel> {
  if (isMockDataEnabled()) {
    const existingIndex = mockPanels.findIndex((panel) => panel.id === input.id);
    const panel: CallPanel = {
      id: input.id ?? createMockToken(),
      name: input.name,
      unitId: input.unitId ?? undefined,
      status: input.status,
      publicToken: existingIndex >= 0 ? mockPanels[existingIndex].publicToken : createMockToken(),
      settings: input.settings ?? { soundEnabled: true, recentCallMinutes: 5 },
      updatedAt: new Date().toISOString(),
    };
    if (existingIndex >= 0) mockPanels.splice(existingIndex, 1, panel);
    else mockPanels.push(panel);
    return panel;
  }
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('upsert_call_panel', {
    p_panel_id: input.id ?? null,
    p_payload: {
      name: input.name,
      unitId: input.unitId ?? null,
      status: input.status,
      settings: input.settings ?? { soundEnabled: true, recentCallMinutes: 5 },
    },
  });
  if (error) throw error;
  const panel = normalizePanel(data);
  if (!panel) throw new Error('Contrato inválido ao salvar painel de chamada.');
  return panel;
}

export async function rotateCallPanelToken(panelId: string): Promise<{ publicToken: string }> {
  if (isMockDataEnabled()) {
    const panel = mockPanels.find((item) => item.id === panelId);
    if (!panel) throw new Error('Painel de chamada não encontrado.');
    panel.publicToken = createMockToken();
    panel.updatedAt = new Date().toISOString();
    return { publicToken: panel.publicToken };
  }
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('rotate_call_panel_token', { p_panel_id: panelId });
  if (error) throw error;
  const publicToken = asString(asRecord(data).publicToken);
  if (!publicToken) throw new Error('Contrato inválido ao renovar link do painel.');
  return { publicToken };
}

export async function getCallPanelSnapshot(publicToken: string): Promise<CallPanelSnapshot> {
  if (isMockDataEnabled()) {
    const panel = mockPanels.find(
      (item) => item.publicToken === publicToken && item.status === 'active'
    );
    if (!panel) throw new Error('Painel de chamada não encontrado ou inativo.');
    return {
      panelName: panel.name,
      soundEnabled: panel.settings.soundEnabled ?? true,
      currentCall: null,
      recentCalls: [],
      refreshedAt: new Date().toISOString(),
    };
  }
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('get_call_panel_snapshot', {
    p_public_token: publicToken,
  });
  if (error) throw error;
  const record = asRecord(data);
  return {
    panelName: asString(record.panelName) || 'Painel de chamadas',
    soundEnabled: asBoolean(record.soundEnabled, true),
    currentCall: normalizeCall(record.currentCall),
    recentCalls: asArray(record.recentCalls)
      .map(normalizeCall)
      .filter((call): call is CallPanelCall => Boolean(call)),
    refreshedAt: asString(record.refreshedAt),
  };
}
