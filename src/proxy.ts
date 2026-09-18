import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { buildContentSecurityPolicy } from '@/lib/security/csp';
import { updateSession } from '@/lib/supabase/middleware';
import {
  getAppSessionTargetRoute,
  getCurrentAppSession,
  type AppSession,
} from '@/services/session/getCurrentAppSession';

type MiddlewareUserContext = {
  canAccessPlatformAdmin: boolean;
  canAccessClinicWorkspace: boolean;
  hasActiveTenantMembership: boolean;
  canAccessPatientPortal: boolean;
  sessionError: boolean;
};

function getFallbackTargetRoute(context: MiddlewareUserContext) {
  if (context.sessionError) return '/auth/login';
  if (context.canAccessPlatformAdmin) return '/admin';
  if (context.canAccessClinicWorkspace && context.hasActiveTenantMembership)
    return '/clinic/dashboard';
  if (context.canAccessPatientPortal) return '/patient';
  return '/no-workspace';
}

function redirectUnlessAlreadyThere(
  request: NextRequest,
  response: NextResponse,
  targetRoute: string
) {
  if (request.nextUrl.pathname === targetRoute) return response;
  const redirect = NextResponse.redirect(new URL(targetRoute, request.url));
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

function getResolvedTargetRoute(appSession: AppSession | null, context: MiddlewareUserContext) {
  return appSession ? getAppSessionTargetRoute(appSession) : getFallbackTargetRoute(context);
}

async function authorizePage(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const session = updateSession(request);
  const { supabase } = session;

  // If Supabase is not configured, allow the request through as unauthenticated.
  if (!supabase) {
    if (
      pathname.startsWith('/admin') ||
      pathname.startsWith('/clinic') ||
      pathname.startsWith('/paciente-360') ||
      pathname.startsWith('/patient')
    ) {
      return redirectUnlessAlreadyThere(request, session.response, '/auth/login');
    }
    return session.response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const response = session.response;

  if (
    !user &&
    (pathname.startsWith('/admin') ||
      pathname.startsWith('/clinic') ||
      pathname.startsWith('/paciente-360') ||
      pathname.startsWith('/patient'))
  ) {
    return redirectUnlessAlreadyThere(request, response, '/auth/login');
  }

  if (!user) return response;

  let context: MiddlewareUserContext;
  let appSession: AppSession | null = null;
  try {
    appSession = await getCurrentAppSession(supabase);
    const hasActiveTenantMembership =
      appSession?.tenantMemberships.some((membership) => membership.status === 'active') ?? false;

    context = {
      canAccessPlatformAdmin: appSession?.canAccessPlatformAdmin() ?? false,
      canAccessClinicWorkspace: appSession?.canAccessClinicWorkspace() ?? false,
      hasActiveTenantMembership,
      canAccessPatientPortal: appSession?.canAccessPatientPortal() ?? false,
      sessionError: false,
    };
  } catch {
    context = {
      canAccessPlatformAdmin: false,
      canAccessClinicWorkspace: false,
      hasActiveTenantMembership: false,
      canAccessPatientPortal: false,
      sessionError: true,
    };
  }

  const targetRoute = getResolvedTargetRoute(appSession, context);

  if (pathname === '/' || pathname.startsWith('/auth/login')) {
    return redirectUnlessAlreadyThere(request, response, targetRoute);
  }

  if (pathname.startsWith('/no-workspace')) {
    if (targetRoute === '/no-workspace' || context.sessionError) return response;
    return redirectUnlessAlreadyThere(request, response, targetRoute);
  }

  if (pathname.startsWith('/admin') && !context.canAccessPlatformAdmin) {
    return redirectUnlessAlreadyThere(request, response, targetRoute);
  }

  if (
    (pathname.startsWith('/clinic') || pathname.startsWith('/paciente-360')) &&
    !(context.canAccessClinicWorkspace && context.hasActiveTenantMembership)
  ) {
    return redirectUnlessAlreadyThere(request, response, targetRoute);
  }

  if (pathname.startsWith('/patient') && !context.canAccessPatientPortal) {
    return redirectUnlessAlreadyThere(request, response, targetRoute);
  }

  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = randomBytes(24).toString('base64');
  const policy = buildContentSecurityPolicy(nonce);
  // Overwrite client-supplied values before SSR; never reuse a submitted nonce.
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', policy);
  const path = request.nextUrl.pathname;
  const needsSession =
    path === '/' ||
    path === '/auth/login' ||
    ['/admin', '/clinic', '/paciente-360', '/patient', '/no-workspace'].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    );
  const response = needsSession
    ? await authorizePage(request)
    : NextResponse.next({ request: { headers: request.headers } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Referrer-Policy', 'no-referrer');
  if (!/\.[a-z0-9]+$/i.test(path)) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'] };
