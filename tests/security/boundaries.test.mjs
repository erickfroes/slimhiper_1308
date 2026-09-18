import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { loadTs } from './load-ts.mjs';

const origin = loadTs('src/lib/security/origin.ts');
const { literalContainsFilter } = loadTs('src/lib/security/postgrest.ts');
const { validateUploadBytes } = loadTs('src/lib/security/file-validation.ts');
const { readBoundedBody } = loadTs('supabase/functions/_shared/request-body.ts');
const { scanWithClamAv } = loadTs('src/lib/security/clamav.ts');
const encode = (text) => new TextEncoder().encode(text);

test('origins: ignore Host/Forwarded, require exact canonical origin', () => {
  const env = { NODE_ENV: 'production', SITE_URL: 'https://app.example.test' };
  for (const value of [
    'null',
    'https://evil.test',
    'https://app.example.test.evil.test',
    'http://app.example.test',
  ]) {
    assert.equal(
      origin.isTrustedOrigin(
        new Request('https://evil.test', {
          headers: {
            origin: value,
            host: 'app.example.test',
            'x-forwarded-host': 'app.example.test',
          },
        }),
        env
      ),
      false
    );
  }
  assert.equal(origin.isTrustedOrigin(new Request(env.SITE_URL), env), false);
  assert.equal(
    origin.isTrustedOrigin(new Request(env.SITE_URL, { headers: { origin: env.SITE_URL } }), env),
    true
  );
  for (const value of [
    'https://u:p@app.example.test',
    'https://app.example.test/path',
    'javascript:alert(1)',
    'http://localhost:4028',
  ])
    assert.throws(() => origin.parseAppOrigin(value));
  assert.equal(origin.parseAppOrigin('http://127.0.0.1:4028', true), 'http://127.0.0.1:4028');
});

test('PostgREST: malicious delimiters stay inside a quoted literal', () => {
  const value = literalContainsFilter('x"),tenant_id.neq.null,(name.ilike.*');
  assert.ok(value.startsWith('"%') && value.endsWith('%"'));
  assert.ok(value.includes('x\\"),tenant'));
  assert.ok(value.includes('\\\\*'));
  assert.equal(literalContainsFilter('a'.repeat(121)), '"%' + 'a'.repeat(120) + '%"');
});

test('body limits count actual bytes even with absent or false Content-Length', async () => {
  for (const headers of [{}, { 'content-length': '1' }, { 'content-length': '999' }]) {
    await assert.rejects(
      readBoundedBody(
        new Request('http://localhost', { method: 'POST', headers, body: '12345' }),
        4
      ),
      (error) => error.status === 413
    );
  }
  assert.equal(
    new TextDecoder().decode(
      await readBoundedBody(new Request('http://localhost', { method: 'POST', body: '1234' }), 4)
    ),
    '1234'
  );
  const stream = new ReadableStream({ start() {} });
  await assert.rejects(
    readBoundedBody(
      new Request('http://localhost', { method: 'POST', body: stream, duplex: 'half' }),
      4,
      15
    ),
    (error) => error.status === 408
  );
});

test('uploads: reject MIME spoofing, executable PDF names and sealed buckets', () => {
  const pdf = encode('%PDF-1.7\n%%EOF');
  assert.equal(
    validateUploadBytes(pdf, 'application/pdf', 'patient-documents').mime,
    'application/pdf'
  );
  assert.throws(
    () => validateUploadBytes(pdf, 'image/png', 'patient-profile-photos'),
    /type_mismatch/
  );
  assert.throws(
    () => validateUploadBytes(pdf, 'application/pdf', 'signed-documents'),
    /bucket_forbidden/
  );
  for (const name of ['/JavaScript', '/J#53', '/OpenAction', '/EmbeddedFile'])
    assert.throws(
      () =>
        validateUploadBytes(
          encode(`%PDF-1.7\n${name} x\n%%EOF`),
          'application/pdf',
          'patient-documents'
        ),
      /active_pdf/
    );
  assert.throws(
    () => validateUploadBytes(new Uint8Array(), 'image/jpeg', 'meal-photos'),
    /size_invalid/
  );
  assert.throws(
    () => validateUploadBytes(new Uint8Array(5_242_881), 'image/jpeg', 'meal-photos'),
    /size_invalid/
  );
});

test('ClamAV: explicit clean verdict required; test transport uses loopback only', async () => {
  const previous = { host: process.env.CLAMAV_HOST, port: process.env.CLAMAV_PORT };
  try {
    delete process.env.CLAMAV_HOST;
    await assert.rejects(scanWithClamAv(encode('synthetic')), /scanner_unavailable/);
    for (const verdict of ['stream: OK', 'stream: Synthetic.Test FOUND', 'stream: ERROR']) {
      let received = Buffer.alloc(0);
      const server = createServer((socket) =>
        socket.on('data', (chunk) => {
          received = Buffer.concat([received, chunk]);
          if (received.length >= 10 + 4 + 9 + 4) socket.end(verdict + '\0');
        })
      );
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      process.env.CLAMAV_HOST = '127.0.0.1';
      process.env.CLAMAV_PORT = String(server.address().port);
      try {
        if (verdict === 'stream: OK') await scanWithClamAv(encode('synthetic'));
        else
          await assert.rejects(
            scanWithClamAv(encode('synthetic')),
            verdict.endsWith('FOUND') ? /upload_rejected/ : /scanner_unavailable/
          );
        assert.equal(received.subarray(0, 10).toString(), 'zINSTREAM\0');
        assert.equal(received.readUInt32BE(10), 9);
        assert.equal(received.subarray(14, 23).toString(), 'synthetic');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }
  } finally {
    for (const [key, value] of [
      ['CLAMAV_HOST', previous.host],
      ['CLAMAV_PORT', previous.port],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]
  );
}
test('all write routes and Edge entrypoints retain the shared boundary', () => {
  let routes = 0,
    edges = 0;
  for (const file of files('src/app/api').filter((file) => file.endsWith('route.ts'))) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/, file);
    for (const match of source.matchAll(/export const (POST|PUT|PATCH|DELETE)\s*=\s*([^\n]+)/g)) {
      assert.match(match[2], /withSecureRoute\(/, file);
      routes++;
    }
  }
  for (const file of files('supabase/functions').filter((file) => file.endsWith('index.ts'))) {
    const source = readFileSync(file, 'utf8');
    if (source.includes('Deno.serve(')) {
      assert.match(source, /Deno\.serve\(\s*secureEdge\(/, file);
      edges++;
    }
  }
  assert.ok(routes >= 20 && edges >= 31);
  for (const file of files('src/services').filter((file) => file.endsWith('.ts')))
    assert.doesNotMatch(readFileSync(file, 'utf8'), /\.upload\(/, file);
});
