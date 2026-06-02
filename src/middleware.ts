import { NextResponse, type NextRequest } from 'next/server';
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
  return NextResponse.redirect(new URL(targetRoute, request.url));
}

function getResolvedTargetRoute(appSession: AppSession | null, context: MiddlewareUserContext) {
  return appSession ? getAppSessionTargetRoute(appSession) : getFallbackTargetRoute(context);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const { supabase, response } = updateSession(request);

  // If Supabase is not configured, allow the request through as unauthenticated.
  if (!supabase) {
    if (
      pathname.startsWith('/admin') ||
      pathname.startsWith('/clinic') ||
      pathname.startsWith('/patient')
    ) {
      return redirectUnlessAlreadyThere(request, response, '/auth/login');
    }
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    (pathname.startsWith('/admin') ||
      pathname.startsWith('/clinic') ||
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
    pathname.startsWith('/clinic') &&
    !(context.canAccessClinicWorkspace && context.hasActiveTenantMembership)
  ) {
    if (context.sessionError || context.hasActiveTenantMembership) {
      return response;
    }
    return redirectUnlessAlreadyThere(request, response, targetRoute);
  }

  if (pathname.startsWith('/patient') && !context.canAccessPatientPortal) {
    return redirectUnlessAlreadyThere(request, response, targetRoute);
  }

  return response;
}

export const config = {
  matcher: [
    '/',
    '/auth/login',
    '/no-workspace',
    '/admin/:path*',
    '/clinic/:path*',
    '/patient/:path*',
  ],
};
