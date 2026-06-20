import 'server-only';

const encoder = new TextEncoder();

function base64ToBytes(value: string) {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

function bytesToBase64(value: ArrayBuffer | Uint8Array) {
  return Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value)).toString(
    'base64'
  );
}

function keyMaterial() {
  const raw = process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('missing_mercadopago_token_encryption_key');

  const base64 = base64ToBytes(raw);
  if (base64.byteLength === 32) return base64;

  const utf8 = encoder.encode(raw);
  if (utf8.byteLength === 32) return utf8;

  throw new Error('invalid_mercadopago_token_encryption_key');
}

async function encryptionKey() {
  return crypto.subtle.importKey('raw', keyMaterial(), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptMercadoPagoToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(value)
  );
  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
  };
}

export async function hashMercadoPagoOAuthState(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function maskMercadoPagoAccountRef(value: string) {
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length <= 8) return normalized;
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}
