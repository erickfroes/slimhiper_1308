#!/usr/bin/env node

const REDIRECT_STATUSES = [302, 303, 307, 308];
const OK_OR_GUARD_STATUSES = [200, ...REDIRECT_STATUSES, 403];

const publicRoutes = [
  { path: '/api/health', expect: [200], label: 'health endpoint', kind: 'health' },
  { path: '/auth/login', expect: [200], label: 'anonymous login page', kind: 'public' },
];

const clinicRoutes = [
  {
    path: '/clinic/dashboard',
    expect: OK_OR_GUARD_STATUSES,
    label: 'clinic dashboard',
    kind: 'clinic',
  },
  {
    path: '/clinic/patients',
    expect: OK_OR_GUARD_STATUSES,
    label: 'clinic patients',
    kind: 'clinic',
  },
  {
    path: '/clinic/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    expect: OK_OR_GUARD_STATUSES,
    label: 'patient 360',
    kind: 'clinic',
  },
  {
    path: '/clinic/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/encounter',
    expect: OK_OR_GUARD_STATUSES,
    label: 'patient encounter',
    kind: 'clinic',
  },
  {
    path: '/clinic/agenda',
    expect: OK_OR_GUARD_STATUSES,
    label: 'clinic agenda',
    kind: 'clinic',
  },
  {
    path: '/clinic/documents',
    expect: OK_OR_GUARD_STATUSES,
    label: 'clinic documents',
    kind: 'clinic',
  },
  {
    path: '/clinic/financeiro',
    expect: OK_OR_GUARD_STATUSES,
    label: 'clinic finance',
    kind: 'clinic',
  },
  {
    path: '/clinic/programs',
    expect: OK_OR_GUARD_STATUSES,
    label: 'clinic programs',
    kind: 'clinic',
  },
  {
    path: '/clinic/reports',
    expect: OK_OR_GUARD_STATUSES,
    label: 'clinic reports',
    kind: 'clinic',
  },
  {
    path: '/clinic/settings',
    expect: OK_OR_GUARD_STATUSES,
    label: 'clinic settings',
    kind: 'clinic',
  },
  { path: '/clinic/inbox', expect: OK_OR_GUARD_STATUSES, label: 'clinic inbox', kind: 'clinic' },
];

const adminRoutes = [
  { path: '/admin', expect: OK_OR_GUARD_STATUSES, label: 'admin dashboard', kind: 'admin' },
  {
    path: '/admin/tenants',
    expect: OK_OR_GUARD_STATUSES,
    label: 'admin tenants',
    kind: 'admin',
  },
  {
    path: '/admin/webhooks',
    expect: OK_OR_GUARD_STATUSES,
    label: 'admin webhooks',
    kind: 'admin',
  },
];

const patientRoutes = [
  { path: '/patient', expect: OK_OR_GUARD_STATUSES, label: 'patient portal', kind: 'patient' },
];

const protectedRoutes = [...clinicRoutes, ...adminRoutes, ...patientRoutes];
const anonymousRoutes = [...publicRoutes, ...protectedRoutes];

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

function readFlag(value) {
  return ['1', 'true', 'yes', 'y', 'sim'].includes(String(value ?? '').trim().toLowerCase());
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
  const shouldReadBody = route.kind === 'health' || route.kind === 'public';
  const bodyText = shouldReadBody ? await response.text() : '';
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
    bodyText,
  };
}

function assertPublicRoute(route, result) {
  if (route.kind === 'health') {
    assert(result.responseRequestId, 'health endpoint did not return x-request-id.');
    assert(result.healthStatus, 'health endpoint did not return a status payload.');
    assert(result.healthStatus !== 'fail', 'health endpoint returned fail; release smoke cannot continue.');
  }

  if (route.kind === 'public' && route.path === '/auth/login') {
    assert(
      result.bodyText.includes('Entrar') || result.bodyText.includes('E-mail'),
      'anonymous login page did not include expected login copy.'
    );
  }
}

function assertAnonymousProtectedRoute(route, result) {
  assert(
    REDIRECT_STATUSES.includes(result.status) && result.location?.includes('/auth/login'),
    `${route.label} must redirect anonymous users to /auth/login.`
  );
}

function assertAuthenticatedRoute(route, result, profileLabel, strictStatus) {
  if (strictStatus) {
    assert(result.status === 200, `${profileLabel} ${route.label} returned ${result.status}; expected 200.`);
    return;
  }

  assert(
    route.expect.includes(result.status),
    `${profileLabel} ${route.label} returned ${result.status}; expected ${route.expect.join('/')}.`
  );

  assert(
    !(REDIRECT_STATUSES.includes(result.status) && result.location?.includes('/auth/login')),
    `${profileLabel} ${route.label} redirected to /auth/login; cookie is missing, expired or invalid.`
  );
}

async function runRoutes({ baseUrl, routes, cookie = '', mode, profileLabel = 'anonymous' }) {
  const results = [];

  for (const route of routes) {
    const result = await request(baseUrl, route, cookie);
    assert(
      route.expect.includes(result.status),
      `${route.label} (${route.path}) returned ${result.status}; expected ${route.expect.join('/')}.`
    );

    if (mode === 'anonymous-public') assertPublicRoute(route, result);
    if (mode === 'anonymous-protected') assertAnonymousProtectedRoute(route, result);
    if (mode === 'authenticated-generic') {
      assertAuthenticatedRoute(route, result, profileLabel, false);
    }
    if (mode === 'authenticated-profile') {
      assertAuthenticatedRoute(route, result, profileLabel, true);
    }

    results.push({
      profile: profileLabel,
      route: route.path,
      label: route.label,
      status: result.status,
      healthStatus: result.healthStatus,
      requestId: result.requestId,
    });
  }

  return results;
}

function getProfileSmokeInputs() {
  return [
    {
      profileLabel: 'clinic',
      cookie: process.env.SLIMHIPER_CLINIC_SMOKE_COOKIE || '',
      routes: clinicRoutes,
    },
    {
      profileLabel: 'admin',
      cookie: process.env.SLIMHIPER_ADMIN_SMOKE_COOKIE || '',
      routes: adminRoutes,
    },
    {
      profileLabel: 'patient',
      cookie: process.env.SLIMHIPER_PATIENT_SMOKE_COOKIE || '',
      routes: patientRoutes,
    },
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(args.get('base-url') || process.env.SLIMHIPER_SMOKE_BASE_URL);
  const requireAuthenticated =
    readFlag(args.get('require-authenticated')) ||
    readFlag(process.env.SLIMHIPER_REQUIRE_AUTHENTICATED_SMOKE);
  const genericCookie = process.env.SLIMHIPER_SMOKE_COOKIE || '';
  const profileInputs = getProfileSmokeInputs();
  const results = [
    ...(await runRoutes({
      baseUrl,
      routes: publicRoutes,
      mode: 'anonymous-public',
      profileLabel: 'anonymous',
    })),
    ...(await runRoutes({
      baseUrl,
      routes: protectedRoutes,
      mode: 'anonymous-protected',
      profileLabel: 'anonymous',
    })),
  ];

  if (genericCookie) {
    results.push(
      ...(await runRoutes({
        baseUrl,
        routes: protectedRoutes,
        cookie: genericCookie,
        mode: 'authenticated-generic',
        profileLabel: 'generic-auth',
      }))
    );
  }

  const enabledProfileInputs = profileInputs.filter((input) => input.cookie);
  for (const input of enabledProfileInputs) {
    results.push(
      ...(await runRoutes({
        baseUrl,
        routes: input.routes,
        cookie: input.cookie,
        mode: 'authenticated-profile',
        profileLabel: input.profileLabel,
      }))
    );
  }

  if (requireAuthenticated) {
    const missingProfiles = profileInputs
      .filter((input) => !input.cookie)
      .map((input) => input.profileLabel);
    assert(
      missingProfiles.length === 0,
      `Authenticated smoke is required, but these profile cookies are missing: ${missingProfiles.join(', ')}.`
    );
  }

  console.log('Post-deploy observability smoke passed.');
  for (const result of results) {
    const healthSuffix = result.healthStatus ? ` health=${result.healthStatus}` : '';
    console.log(
      `- [${result.profile}] ${result.route}: ${result.status}${healthSuffix} (${result.label}; ${result.requestId})`
    );
  }
}

main().catch((error) => {
  console.error('Post-deploy observability smoke failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
