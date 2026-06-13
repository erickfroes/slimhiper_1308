import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createObservabilityContext,
  logObservedEvent,
  observedHeaders,
} from '@/lib/observability/server';

async function signOutAndRedirect(request: Request) {
  const context = createObservabilityContext('api.auth.logout', request);
  const supabase = await createClient();

  if (!supabase) {
    logObservedEvent(context, 'auth_logout_redirect', 'warn', 'success', {
      auth_state: 'supabase_unconfigured',
    });
  } else {
    const { error } = await supabase.auth.signOut();
    logObservedEvent(context, 'auth_logout_redirect', error ? 'warn' : 'info', 'success', {
      auth_state: error ? 'logout_error_redacted' : 'signed_out',
    });
  }

  const response = NextResponse.redirect(new URL('/auth/login', request.url), { status: 303 });
  const headers = observedHeaders(context);
  Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

export async function POST(request: Request) {
  return signOutAndRedirect(request);
}
