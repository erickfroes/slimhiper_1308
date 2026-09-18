import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { readBoundedBody, RequestLimitError } from './request-body.ts';

declare const Deno: { env: { get(name: string): string | undefined } };

export function secureEdge(
  handler: (request: Request) => Response | Promise<Response>,
  scope: string
) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return handler(request);
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Retry-After',
    };
    const failure = (status: number, code: string, retryAfter?: number) =>
      new Response(JSON.stringify({ data: null, error: { code, message: code } }), {
        status,
        headers: { ...headers, ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) },
      });
    try {
      const url = Deno.env.get('SUPABASE_URL');
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !key) return failure(503, 'security_backend_unavailable');
      if (
        request.headers.get('content-encoding') &&
        request.headers.get('content-encoding') !== 'identity'
      ) {
        return failure(415, 'unsupported_content_encoding');
      }
      const admin = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      let identity = 'anonymous';
      if (bearer === key) identity = 'service';
      else if (bearer) {
        const {
          data: { user },
        } = await admin.auth.getUser(bearer);
        if (user) identity = `user:${user.id}`;
      }
      // Anonymous webhook requests share a bounded budget. Edge/WAF IP controls
      // complement this; arbitrary X-Forwarded-For is deliberately not trusted.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
      const subject = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, '0')
      ).join('');
      const { data, error } = await admin.rpc('consume_security_rate_limit', {
        p_scope: `edge:${scope}`,
        p_subject_hash: subject,
        p_limit: scope.startsWith('webhook-') ? 300 : 60,
        p_window_seconds: 60,
      });
      if (error || !data) return failure(503, 'security_backend_unavailable');
      if (!data.allowed) return failure(429, 'rate_limit_exceeded', Math.max(1, data.retryAfter));
      let bounded = request;
      if (!['GET', 'HEAD'].includes(request.method)) {
        const bytes = await readBoundedBody(request, 1_048_576);
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('content-length', String(bytes.byteLength));
        bounded = new Request(request.url, {
          method: request.method,
          headers: requestHeaders,
          body: bytes,
        });
      }
      return await handler(bounded);
    } catch (error) {
      return error instanceof RequestLimitError
        ? failure(error.status, error.message)
        : failure(503, 'security_request_failed');
    }
  };
}
