import { envString } from './env.ts';

export type EnvReader = {
  get(key: string): string | undefined;
};

export type Json = Record<string, unknown>;

export const MERCADOPAGO_PROVIDER = 'mercadopago';
export const MERCADOPAGO_FEATURE_FLAGS = ['financial.mercadopago', 'financial.asaas'] as const;

const DEFAULT_MERCADOPAGO_BASE_URL = 'https://api.mercadopago.com';
const PLACEHOLDER_SECRET_PATTERN =
  /^(changeme|change-me|dummy|example|placeholder|test|todo|xxx+)$/i;

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function asPositiveInteger(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

export function safeText(value: unknown, maxLength = 240): string {
  return asString(value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function safeIdempotencyKey(value: unknown): string {
  const key = safeText(value, 120);
  return key.length <= 120 ? key : '';
}

export function isConfiguredSecret(value: string) {
  const normalized = value.trim();
  return normalized.length > 16 && !PLACEHOLDER_SECRET_PATTERN.test(normalized);
}

export function bearerToken(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

export function isDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime());
}

export function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

export function configuredAllowedOrigins(env: EnvReader) {
  return new Set(
    [
      ...(env.get('APP_ALLOWED_ORIGINS') ?? '').split(','),
      env.get('SITE_URL') ?? '',
      env.get('NEXT_PUBLIC_SITE_URL') ?? '',
      'http://localhost:4028',
      'http://127.0.0.1:4028',
    ]
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function isLocalOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function corsHeaders(env: EnvReader, req?: Request) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const origin = req?.headers.get('Origin') ?? '';
  const configured = configuredAllowedOrigins(env);
  const allowedOrigin = origin
    ? configured.has(origin) || isLocalOrigin(origin)
      ? origin
      : ''
    : (configured.values().next().value ?? '');
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers.Vary = 'Origin';
  }
  return headers;
}

export function jsonResponse(
  env: EnvReader,
  status: number,
  payload: Json,
  req?: Request,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(env, req), ...extraHeaders },
  });
}

export function getMercadoPagoConfig(env: EnvReader) {
  const accessToken = envString(env, 'MERCADOPAGO_ACCESS_TOKEN');
  const baseUrl = envString(env, 'MERCADOPAGO_BASE_URL') || DEFAULT_MERCADOPAGO_BASE_URL;
  return {
    accessToken: accessToken && isConfiguredSecret(accessToken) ? accessToken : '',
    baseUrl: baseUrl.replace(/\/+$/, ''),
  };
}

export async function mercadoPagoFetch(
  env: EnvReader,
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {}
) {
  const { accessToken, baseUrl } = getMercadoPagoConfig(env);
  if (!accessToken || !baseUrl) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorCode: 'server_misconfigured',
    };
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (init.idempotencyKey) headers.set('X-Idempotency-Key', init.idempotencyKey);

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const data = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    data,
    errorCode: response.ok ? null : `mercadopago_${response.status}`,
  };
}

export function centsToProviderAmount(cents: number) {
  return Math.round((cents / 100) * 100) / 100;
}

export function amountToCents(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

export function normalizePaymentStatus(value: unknown) {
  const status = asString(value).toLowerCase();
  if (status === 'approved') {
    return { invoiceStatus: 'paid', paymentStatus: 'paid', financialState: 'settled' };
  }
  if (status === 'pending' || status === 'in_process') {
    return { invoiceStatus: 'pending', paymentStatus: 'pending', financialState: 'pending' };
  }
  if (status === 'authorized') {
    return { invoiceStatus: 'pending', paymentStatus: 'authorized', financialState: 'pending' };
  }
  if (status === 'rejected') {
    return { invoiceStatus: 'failed', paymentStatus: 'failed', financialState: 'attention' };
  }
  if (status === 'cancelled' || status === 'canceled') {
    return { invoiceStatus: 'cancelled', paymentStatus: 'cancelled', financialState: 'attention' };
  }
  if (status === 'refunded') {
    return { invoiceStatus: 'refunded', paymentStatus: 'refunded', financialState: 'attention' };
  }
  if (status === 'charged_back') {
    return {
      invoiceStatus: 'chargeback',
      paymentStatus: 'chargeback',
      financialState: 'attention',
    };
  }
  return { invoiceStatus: 'pending', paymentStatus: 'pending', financialState: 'unknown' };
}

export function normalizeSubscriptionStatus(value: unknown) {
  const status = asString(value).toLowerCase();
  if (status === 'authorized') return 'active';
  if (status === 'paused') return 'paused';
  if (status === 'cancelled' || status === 'canceled') return 'canceled';
  return 'active';
}

export function pickPaymentLink(value: Record<string, unknown>) {
  return asString(value.init_point) || asString(value.sandbox_init_point) || null;
}

export function timingSafeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length === rightBytes.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, manifest: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseMercadoPagoSignature(header: string) {
  return Object.fromEntries(
    header
      .split(',')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, value])
  );
}

export async function verifyMercadoPagoWebhookSignature(params: {
  env: EnvReader;
  req: Request;
  dataId: string;
}) {
  const secret = envString(params.env, 'MERCADOPAGO_WEBHOOK_SECRET');
  const signatureHeader = params.req.headers.get('x-signature') ?? '';
  const requestId = params.req.headers.get('x-request-id') ?? '';
  const parsed = parseMercadoPagoSignature(signatureHeader);
  const ts = asString(parsed.ts);
  const v1 = asString(parsed.v1);

  if (!secret || !isConfiguredSecret(secret) || !requestId || !params.dataId || !ts || !v1) {
    return { valid: false, requestId, ts, expected: '', received: v1 };
  }

  const manifest = `id:${params.dataId};request-id:${requestId};ts:${ts};`;
  const expected = await hmacSha256Hex(secret, manifest);
  return {
    valid: timingSafeEqual(expected, v1),
    requestId,
    ts,
    expected,
    received: v1,
  };
}
