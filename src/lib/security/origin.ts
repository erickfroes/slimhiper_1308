type OriginEnvironment = Record<string, string | undefined>;

export function parseAppOrigin(value: string, allowLocalHttp = false): string {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(allowLocalHttp && local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Invalid application origin configuration.');
  }
  return url.origin;
}

export function getAppOrigin(env: OriginEnvironment = process.env): string {
  const value = env.SITE_URL || env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error('SITE_URL is required.');
  return parseAppOrigin(value.trim(), env.NODE_ENV !== 'production' || env.APP_ENV === 'local');
}

export function isTrustedOrigin(request: Request, env: OriginEnvironment = process.env): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  const allowed = [
    getAppOrigin(env),
    ...(env.APP_ALLOWED_ORIGINS || '')
      .split(',')
      .filter(Boolean)
      .map((value) =>
        parseAppOrigin(value.trim(), env.NODE_ENV !== 'production' || env.APP_ENV === 'local')
      ),
  ];
  try {
    return allowed.includes(
      parseAppOrigin(origin, env.NODE_ENV !== 'production' || env.APP_ENV === 'local')
    );
  } catch {
    return false;
  }
}
