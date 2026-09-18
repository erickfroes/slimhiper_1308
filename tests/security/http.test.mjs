import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { loadTs } from './load-ts.mjs';
import { imageHosts } from '../../image-hosts.config.mjs';

const { csvEscape } = loadTs('supabase/functions/_shared/csv.ts');
const { buildContentSecurityPolicy } = loadTs('src/lib/security/csp.ts', {
  '../../../image-hosts.config.mjs': { imageHosts },
});
test('CSV cells neutralize formula and control-character prefixes', () => {
  for (const value of ['=1+1', '+SUM(1)', '-1+2', '@SUM(1)', '\t=1', '\r\n=1', '\0=1'])
    assert.ok(csvEscape(value).startsWith('"\''));
  assert.equal(csvEscape('a"b'), '"a""b"');
  assert.equal(csvEscape(null), '""');
});
test('production CSP uses a nonce, no inline/eval scripts and exact Supabase origin', () => {
  const policy = buildContentSecurityPolicy('A'.repeat(32), {
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.co',
  });
  const script = policy.split(';').find((item) => item.trim().startsWith('script-src '));
  assert.match(script, /nonce-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/);
  assert.match(script, /strict-dynamic/);
  assert.doesNotMatch(script, /unsafe-inline|unsafe-eval|rocket/);
  assert.match(
    policy,
    /connect-src 'self' https:\/\/synthetic.supabase.co wss:\/\/synthetic.supabase.co/
  );
  assert.doesNotMatch(policy, /\*\.supabase/);
  assert.throws(() => buildContentSecurityPolicy("x';script-src *"));
});

test('Next write guard: CSRF, authentication, rate budget, streamed size and handler isolation', async () => {
  const savedOrigin = process.env.SITE_URL;
  const savedAllowed = process.env.APP_ALLOWED_ORIGINS;
  process.env.SITE_URL = 'https://app.example.test';
  process.env.APP_ALLOWED_ORIGINS = '';
  let user = { id: 'synthetic-user' },
    budget = { allowed: true, retryAfter: 12 },
    rpcError = null,
    called = 0;
  const { withSecureRoute } = loadTs('src/lib/security/route.ts', {
    '@/lib/supabase/server': {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user }, error: null }) },
      }),
    },
    '@/lib/supabase/admin': {
      createSupabaseAdminClient: () => ({ rpc: async () => ({ data: budget, error: rpcError }) }),
    },
    './origin': loadTs('src/lib/security/origin.ts'),
    '../../../supabase/functions/_shared/request-body': loadTs(
      'supabase/functions/_shared/request-body.ts'
    ),
  });
  const handler = withSecureRoute(
    async (request) => {
      called++;
      return Response.json(await request.json());
    },
    { scope: 'synthetic', maxBytes: 10 }
  );
  const request = (origin = process.env.SITE_URL, body = '{}') =>
    new NextRequest('https://app.example.test/api/synthetic', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body,
    });
  try {
    assert.equal((await handler(request('https://evil.test'))).status, 403);
    user = null;
    assert.equal((await handler(request())).status, 401);
    user = { id: 'synthetic-user' };
    rpcError = { message: 'synthetic backend outage' };
    assert.equal((await handler(request())).status, 503);
    rpcError = null;
    budget = { allowed: false, retryAfter: 12 };
    const limited = await handler(request());
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '12');
    budget.allowed = true;
    assert.equal((await handler(request(undefined, 'x'.repeat(11)))).status, 413);
    assert.equal(called, 0);
    const accepted = await handler(request());
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get('cache-control'), 'no-store');
    assert.equal(called, 1);
  } finally {
    for (const [key, value] of [
      ['SITE_URL', savedOrigin],
      ['APP_ALLOWED_ORIGINS', savedAllowed],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
