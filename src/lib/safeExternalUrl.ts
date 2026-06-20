const PAYMENT_HOSTS = [
  'asaas.com',
  'sandbox.asaas.com',
  'mercadopago.com.br',
  'mercadopago.com',
  'mpago.la',
  'mock.pay',
];
const DOCUMENT_HOSTS = [
  'd4sign.com',
  'd4sign.com.br',
  'supabase.co',
  'supabase.in',
  'storage.googleapis.com',
];

function hostMatches(hostname: string, allowedHost: string) {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function asAllowedUrl(value: unknown, allowedHosts: string[], allowLocalHttp = false) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol === 'https:' && allowedHosts.some((host) => hostMatches(hostname, host))) {
      return url.toString();
    }

    if (
      allowLocalHttp &&
      process.env.NODE_ENV !== 'production' &&
      url.protocol === 'http:' &&
      isLocalHost(hostname)
    ) {
      return url.toString();
    }

    return null;
  } catch {
    return null;
  }
}

export function asSafePaymentUrl(value: unknown) {
  return asAllowedUrl(value, PAYMENT_HOSTS);
}

export function asSafeDocumentUrl(value: unknown) {
  return asAllowedUrl(value, DOCUMENT_HOSTS, true);
}
