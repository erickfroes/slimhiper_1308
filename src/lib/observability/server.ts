import { createHash, randomUUID } from 'crypto';

export type ObservabilitySeverity = 'debug' | 'info' | 'warn' | 'error';
export type ObservabilityOutcome = 'success' | 'failure' | 'denied' | 'skipped';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ObservabilityFields = Record<string, JsonValue | undefined>;

export type ObservabilityContext = {
  requestId: string;
  correlationId: string;
  module: string;
  startedAt: number;
};

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|key|password|email|phone|cpf|cnpj|name|patient|payload|signed|url|path|address)/i;

function safeHash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function pseudonymize(value: string | null | undefined, prefix = 'hash') {
  if (!value) return null;
  return `${prefix}_${safeHash(value)}`;
}

function sanitizeValue(key: string, value: JsonValue | undefined): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    if (typeof value === 'string' && value.trim()) return pseudonymize(value, 'redacted');
    return '[redacted]';
  }

  if (Array.isArray(value)) return value.map((item) => sanitizeNested(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([nestedKey, nestedValue]) => [nestedKey, sanitizeValue(nestedKey, nestedValue)])
        .filter(([, nestedValue]) => nestedValue !== undefined)
    );
  }

  return value;
}

function sanitizeNested(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((item) => sanitizeNested(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([nestedKey, nestedValue]) => [nestedKey, sanitizeValue(nestedKey, nestedValue)])
        .filter(([, nestedValue]) => nestedValue !== undefined)
    );
  }
  return value;
}

function sanitizeFields(fields: ObservabilityFields = {}) {
  return Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, sanitizeValue(key, value)])
      .filter(([, value]) => value !== undefined)
  );
}

export function createObservabilityContext(
  module: string,
  request?: Request
): ObservabilityContext {
  const inboundRequestId = request?.headers.get('x-request-id')?.trim();
  const inboundCorrelationId = request?.headers.get('x-correlation-id')?.trim();
  const requestId = inboundRequestId || randomUUID();

  return {
    requestId,
    correlationId: inboundCorrelationId || requestId,
    module,
    startedAt: Date.now(),
  };
}

export function logObservedEvent(
  context: ObservabilityContext,
  event: string,
  severity: ObservabilitySeverity,
  outcome: ObservabilityOutcome,
  fields: ObservabilityFields = {}
) {
  const entry = {
    timestamp: new Date().toISOString(),
    severity,
    event,
    module: context.module,
    request_id: context.requestId,
    correlation_id: context.correlationId,
    outcome,
    latency_ms: Date.now() - context.startedAt,
    ...sanitizeFields(fields),
  };

  const line = JSON.stringify(entry);
  if (severity === 'error') console.error(line);
  else if (severity === 'warn') console.warn(line);
  else console.info(line);
}

export function observedHeaders(context: ObservabilityContext) {
  return {
    'x-request-id': context.requestId,
    'x-correlation-id': context.correlationId,
  };
}
