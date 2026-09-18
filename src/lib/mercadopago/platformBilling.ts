import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptMercadoPagoToken } from './tokenCrypto';

type AdminClient = SupabaseClient;

export type PlatformBillingConnectionRow = {
  id: string;
  environment: 'test' | 'production';
  status: string;
  application_id: string | null;
  provider_user_id: string | null;
  account_ref_masked: string | null;
  access_token_ciphertext: string | null;
  access_token_iv: string | null;
  webhook_secret_ciphertext: string | null;
  webhook_secret_iv: string | null;
  configured_at: string | null;
  last_validated_at: string | null;
  last_webhook_at: string | null;
  last_reconciled_at: string | null;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
};

const DEFAULT_BASE_URL = 'https://api.mercadopago.com';

function baseUrl() {
  return (process.env.MERCADOPAGO_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asString(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function safeProviderCode(value: unknown) {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '_')
    .slice(0, 80);
}

export function maskProviderReference(value: string) {
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length <= 8) return normalized;
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

export function platformPriceFrequency(cycle: string) {
  if (cycle === 'quarterly') return { frequency: 3, frequencyType: 'months' };
  if (cycle === 'yearly') return { frequency: 12, frequencyType: 'months' };
  return { frequency: 1, frequencyType: 'months' };
}

export function centsToAmount(cents: number) {
  return Math.round(cents) / 100;
}

export function safeMercadoPagoUrl(value: unknown) {
  const text = asString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'mercadopago.com' || hostname.endsWith('.mercadopago.com')) return url.href;
    if (hostname === 'mercadopago.com.br' || hostname.endsWith('.mercadopago.com.br')) {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getPlatformBillingConnection(
  admin: AdminClient,
  environment?: 'test' | 'production'
) {
  let query = admin
    .from('platform_billing_connections')
    .select(
      'id,environment,status,application_id,provider_user_id,account_ref_masked,access_token_ciphertext,access_token_iv,webhook_secret_ciphertext,webhook_secret_iv,configured_at,last_validated_at,last_webhook_at,last_reconciled_at,error_code,error_message,metadata'
    )
    .eq('provider', 'mercadopago');
  if (environment) query = query.eq('environment', environment);

  const { data, error } = await query
    .order('environment', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PlatformBillingConnectionRow | null) ?? null;
}

export async function getPlatformAccessToken(connection: PlatformBillingConnectionRow) {
  if (!connection.access_token_ciphertext || !connection.access_token_iv) return '';
  return decryptMercadoPagoToken(connection.access_token_ciphertext, connection.access_token_iv);
}

export async function platformMercadoPagoFetch(
  connection: PlatformBillingConnectionRow,
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {}
) {
  const accessToken = await getPlatformAccessToken(connection);
  if (!accessToken) {
    return { ok: false, status: 0, data: null, errorCode: 'platform_token_unavailable' };
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.idempotencyKey) headers.set('X-Idempotency-Key', init.idempotencyKey);

  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      data,
      errorCode: response.ok ? null : `mercadopago_${response.status}`,
    };
  } catch {
    return { ok: false, status: 0, data: null, errorCode: 'mercadopago_network_error' };
  }
}

export async function validatePlatformAccessToken(accessToken: string) {
  if (!accessToken) return { ok: false, errorCode: 'platform_token_unavailable' } as const;
  try {
    const response = await fetch(`${baseUrl()}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const data = asRecord(await response.json().catch(() => null));
    const providerUserId = asString(data.id);
    if (!response.ok || !providerUserId) {
      return { ok: false, errorCode: `mercadopago_${response.status}` } as const;
    }
    return {
      ok: true,
      providerUserId,
      accountRef: maskProviderReference(providerUserId),
    } as const;
  } catch {
    return { ok: false, errorCode: 'mercadopago_network_error' } as const;
  }
}

export async function validatePlatformBillingConnection(
  admin: AdminClient,
  connection: PlatformBillingConnectionRow
) {
  const response = await platformMercadoPagoFetch(connection, '/users/me');
  const record = asRecord(response.data);
  const providerUserId = asString(record.id);
  const now = new Date().toISOString();

  if (!response.ok || !providerUserId) {
    const errorCode = response.errorCode || 'mercadopago_invalid_response';
    await admin
      .from('platform_billing_connections')
      .update({
        status: 'degraded',
        last_validated_at: now,
        error_code: errorCode,
        error_message: 'Nao foi possivel validar a conta Mercado Pago.',
      })
      .eq('id', connection.id);
    return { ok: false, errorCode };
  }

  await admin
    .from('platform_billing_connections')
    .update({
      status: 'active',
      provider_user_id: providerUserId,
      account_ref_masked: maskProviderReference(providerUserId),
      last_validated_at: now,
      error_code: null,
      error_message: null,
    })
    .eq('id', connection.id);

  return { ok: true, providerUserId, accountRef: maskProviderReference(providerUserId) };
}
