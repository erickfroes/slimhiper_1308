function normalizeOrigin(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getInviteRedirectTo(request: Request, tenantId?: string) {
  const configuredOrigin =
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? '') ||
    normalizeOrigin(process.env.SITE_URL ?? '') ||
    normalizeOrigin(process.env.VERCEL_URL ?? '');

  const origin = configuredOrigin || new URL(request.url).origin;
  const url = new URL('/auth/accept-invite', origin);
  if (tenantId) url.searchParams.set('tenantId', tenantId);
  return url.toString();
}
