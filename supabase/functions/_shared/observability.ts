type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type LogFields = Record<string, JsonValue | undefined>;

type Severity = 'debug' | 'info' | 'warn' | 'error';
type Outcome = 'success' | 'failure' | 'denied' | 'skipped';

const sensitiveKeyPattern =
  /(authorization|cookie|token|secret|key|password|email|phone|cpf|cnpj|name|patient|payload|signed|url|path|address|document)/i;

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export async function pseudonymize(value: string | null | undefined, prefix = 'hash') {
  if (!value) return null;
  return `${prefix}_${await hash(value)}`;
}

export function createEdgeContext(module: string, req: Request) {
  const requestId = req.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const correlationId = req.headers.get('x-correlation-id')?.trim() || requestId;
  return { module, requestId, correlationId, startedAt: Date.now() };
}

async function sanitizeField(
  key: string,
  value: JsonValue | undefined
): Promise<JsonValue | undefined> {
  if (value === undefined) return undefined;
  if (sensitiveKeyPattern.test(key)) {
    if (typeof value === 'string' && value.trim()) return pseudonymize(value, 'redacted');
    return '[redacted]';
  }

  if (Array.isArray(value)) return Promise.all(value.map((item) => sanitizeNested(item)));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(async ([nestedKey, nestedValue]) => [
        nestedKey,
        await sanitizeField(nestedKey, nestedValue),
      ])
    );
    return Object.fromEntries(entries.filter(([, nestedValue]) => nestedValue !== undefined));
  }

  return value;
}

async function sanitizeNested(value: JsonValue): Promise<JsonValue> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => sanitizeNested(item)));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(async ([nestedKey, nestedValue]) => [
        nestedKey,
        await sanitizeField(nestedKey, nestedValue),
      ])
    );
    return Object.fromEntries(entries.filter(([, nestedValue]) => nestedValue !== undefined));
  }
  return value;
}

export async function logEdgeEvent(
  context: ReturnType<typeof createEdgeContext>,
  event: string,
  severity: Severity,
  outcome: Outcome,
  fields: LogFields = {}
) {
  const sanitizedEntries = await Promise.all(
    Object.entries(fields).map(async ([key, value]) => [key, await sanitizeField(key, value)])
  );
  const entry = {
    timestamp: new Date().toISOString(),
    severity,
    event,
    module: context.module,
    request_id: context.requestId,
    correlation_id: context.correlationId,
    outcome,
    latency_ms: Date.now() - context.startedAt,
    ...Object.fromEntries(sanitizedEntries.filter(([, value]) => value !== undefined)),
  };
  const line = JSON.stringify(entry);
  if (severity === 'error') console.error(line);
  else if (severity === 'warn') console.warn(line);
  else console.log(line);
}

export function observedEdgeHeaders(context: ReturnType<typeof createEdgeContext>) {
  return {
    'x-request-id': context.requestId,
    'x-correlation-id': context.correlationId,
  };
}
