import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

type MiddlewareUserContext = {
  canAccessPlatformAdmin: boolean;
  canAccessClinicWorkspace: boolean;
  hasActiveTenantMembership: boolean;
  canAccessPatientPortal: boolean;
};

function getTargetRoute(context: MiddlewareUserContext) {
  if (context.canAccessPlatformAdmin) return '/admin';
  if (context.canAccessClinicWorkspace && context.hasActiveTenantMembership) return '/clinic/dashboard';
  if (context.canAccessPatientPortal) return '/patient';
  return '/clinic/dashboard';
}

async function getMiddlewareUserContext(
  supabase: ReturnType<typeof updateSession>['supabase'],
  userId: string,
): Promise<MiddlewareUserContext> {
  const [{ data: profileRow }, { data: membershipRows }] = await Promise.all([
    supabase.from('profiles').select('platform_role').eq('id', userId).maybeSingle(),
    supabase.from('tenant_memberships').select('status').eq('user_id', userId),
  ]);

  const platformRole = profileRow && typeof profileRow.platform_role === 'string' ? profileRow.platform_role : null;
  const memberships = (membershipRows ?? []) as Array<{ status: string | null }>;
  const hasAnyMembership = memberships.length > 0;
  const hasActiveTenantMembership = memberships.some((membership) => membership.status === 'active');

  return {
    canAccessPlatformAdmin: platformRole === 'platform_admin' || platformRole === 'platform_support',
    canAccessClinicWorkspace: hasAnyMembership,
    hasActiveTenantMembership,
    canAccessPatientPortal: !hasAnyMembership,
  };
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const { supabase, response } = updateSession(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    (pathname.startsWith('/admin') ||
      pathname.startsWith('/clinic') ||
      pathname.startsWith('/patient'))
  ) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  if (!user) return response;

  let context: MiddlewareUserContext;
  try {
    context = await getMiddlewareUserContext(supabase, user.id);
  } catch {
    // Fallback for middleware safety: require only authenticated session,
    // while detailed authorization is enforced in server-side guards.
    context = {
      canAccessPlatformAdmin: false,
      canAccessClinicWorkspace: false,
      hasActiveTenantMembership: false,
      canAccessPatientPortal: false,
    };
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(getTargetRoute(context), request.url));
  }

  if (pathname.startsWith('/auth/login')) {
    return NextResponse.redirect(new URL(getTargetRoute(context), request.url));
  }

  if (pathname.startsWith('/admin') && !context.canAccessPlatformAdmin) {
    return NextResponse.redirect(new URL(getTargetRoute(context), request.url));
  }

  if (pathname.startsWith('/clinic') && !(context.canAccessClinicWorkspace && context.hasActiveTenantMembership)) {
    return NextResponse.redirect(new URL(getTargetRoute(context), request.url));
  }

  if (pathname.startsWith('/patient') && !context.canAccessPatientPortal) {
    return NextResponse.redirect(new URL(getTargetRoute(context), request.url));
  }

  return response;
}

export const config = {
  matcher: ['/', '/auth/login', '/admin/:path*', '/clinic/:path*', '/patient/:path*'],
};
