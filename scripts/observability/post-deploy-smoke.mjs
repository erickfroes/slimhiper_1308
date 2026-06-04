#!/usr/bin/env node

const routes = [
  { path: '/api/health', expect: [200], label: 'health endpoint' },
  { path: '/auth/login', expect: [200], label: 'anonymous login page' },
  { path: '/clinic/dashboard', expect: [200, 302, 303, 307, 308], label: 'clinic protected route' },
  { path: '/admin', expect: [200, 302, 303, 307, 308, 403], label: 'admin protected route' },
  { path: '/patient', expect: [200, 302, 303, 307, 308, 403], label: 'patient protected route' },
];

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.slice(2).split('=');
    const value = inlineValue ?? argv[index + 1];
    args.set(key, value);
    if (inlineValue === undefined) index += 1;
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeBaseUrl(value) {
  assert(value, 'Missing --base-url or SLIMHIPER_SMOKE_BASE_URL.');
  return value.replace(/\/$/, '');
}

async function request(baseUrl, route, cookie) {
  const requestId = `smoke-${crypto.randomUUID()}`;
  const response = await fetch(`${baseUrl}${route.path}`, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      'x-request-id': requestId,
      'x-correlation-id': requestId,
      ...(cookie ? { cookie } : {}),
    },
  });
  const bodyText = route.path === '/api/health' ? await response.text() : '';
  const body = bodyText
    ? (() => {
        try {
          return JSON.parse(bodyText);
        } catch {
          return null;
        }
      })()
    : null;

  return {
    requestId,
    status: response.status,
    location: response.headers.get('location'),
    responseRequestId: response.headers.get('x-request-id'),
    healthStatus: typeof body?.status === 'string' ? body.status : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(args.get('base-url') || process.env.SLIMHIPER_SMOKE_BASE_URL);
  const cookie = process.env.SLIMHIPER_SMOKE_COOKIE || '';
  const results = [];

  for (const route of routes) {
    const result = await request(baseUrl, route, cookie);
    assert(
      route.expect.includes(result.status),
      `${route.label} (${route.path}) returned ${result.status}; expected ${route.expect.join('/')}.`
    );

    if (route.path === '/api/health') {
      assert(result.responseRequestId, 'health endpoint did not return x-request-id.');
      assert(result.healthStatus, 'health endpoint did not return a status payload.');
      assert(
        result.healthStatus !== 'fail',
        'health endpoint returned fail; release smoke cannot continue.'
      );
    }

    if (!cookie && ['/clinic/dashboard', '/admin', '/patient'].includes(route.path)) {
      assert(
        [302, 303, 307, 308].includes(result.status) && result.location?.includes('/auth/login'),
        `${route.label} must redirect anonymous users to /auth/login.`
      );
    }

    results.push({
      route: route.path,
      status: result.status,
      healthStatus: result.healthStatus,
      requestId: result.requestId,
    });
  }

  console.log('Post-deploy observability smoke passed.');
  for (const result of results) {
    const healthSuffix = result.healthStatus ? ` health=${result.healthStatus}` : '';
    console.log(`- ${result.route}: ${result.status}${healthSuffix} (${result.requestId})`);
  }
}

main().catch((error) => {
  console.error('Post-deploy observability smoke failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
