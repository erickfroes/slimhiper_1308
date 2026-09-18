import 'server-only';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isTrustedOrigin } from './origin';
import {
  readBoundedBody,
  RequestLimitError,
} from '../../../supabase/functions/_shared/request-body';

type Options = { scope: string; maxBytes?: number; limit?: number; binary?: boolean };

function failure(status: number, code: string, retryAfter?: number) {
  return Response.json(
    { data: null, error: { code, message: code } },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
      },
    }
  );
}

export function withSecureRoute<Args extends unknown[]>(
  handler: (request: NextRequest, ...args: Args) => Promise<Response>,
  options: Options
) {
  return async (request: NextRequest, ...args: Args): Promise<Response> => {
    try {
      if (!isTrustedOrigin(request)) return failure(403, 'untrusted_origin');
      if (
        request.headers.get('content-encoding') &&
        request.headers.get('content-encoding') !== 'identity'
      ) {
        return failure(415, 'unsupported_content_encoding');
      }
      if (
        request.body &&
        !options.binary &&
        !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')
      ) {
        return failure(415, 'json_required');
      }
      const client = await createClient();
      const admin = createSupabaseAdminClient();
      if (!client || !admin) return failure(503, 'security_backend_unavailable');
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (error || !user) return failure(401, 'authentication_required');
      // Verified identity, never an untrusted forwarded header or decoded JWT.
      const subject = createHash('sha256').update(user.id).digest('hex');
      for (const [scope, limit] of [
        ['api-write', 180],
        [options.scope, options.limit ?? 30],
      ] as const) {
        const { data, error: rateError } = await admin.rpc('consume_security_rate_limit', {
          p_scope: scope,
          p_subject_hash: subject,
          p_limit: limit,
          p_window_seconds: 60,
        });
        if (rateError || !data) return failure(503, 'security_backend_unavailable');
        if (!data.allowed) return failure(429, 'rate_limit_exceeded', Math.max(1, data.retryAfter));
      }
      const bytes = await readBoundedBody(request, options.maxBytes ?? 65_536);
      const headers = new Headers(request.headers);
      headers.set('content-length', String(bytes.byteLength));
      const bounded = new NextRequest(request.url, {
        method: request.method,
        headers,
        body: bytes,
      });
      const response = await handler(bounded, ...args);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch (error) {
      return error instanceof RequestLimitError
        ? failure(error.status, error.message)
        : failure(503, 'security_request_failed');
    }
  };
}
