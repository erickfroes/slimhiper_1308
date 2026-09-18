import { imageHosts } from '../../../image-hosts.config.mjs';

export function buildContentSecurityPolicy(
  nonce: string,
  env: Record<string, string | undefined> = process.env
) {
  if (!/^[A-Za-z0-9+/=]{22,64}$/.test(nonce)) throw new Error('Invalid CSP nonce.');
  const development = env.NODE_ENV !== 'production';
  const connections = new Set<string>();
  for (const value of [env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_URL]) {
    if (!value) continue;
    const url = new URL(value);
    if (
      url.protocol !== 'https:' &&
      !(
        (development || env.APP_ENV === 'local') &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
        url.protocol === 'http:'
      )
    ) {
      throw new Error('Invalid Supabase origin.');
    }
    connections.add(url.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    connections.add(url.origin);
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    // React style props, charts and Sonner use inline CSS, never inline scripts.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${imageHosts.map((h) => `${h.protocol}://${h.hostname}`).join(' ')}`,
    "font-src 'self' data:",
    `connect-src 'self' ${[...connections].join(' ')}${development ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(!development && env.APP_ENV !== 'local' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
