import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const ADMIN_ROLES = new Set(['platform_admin', 'platform_support']);
const CLINIC_ROLES = new Set([
  'tenant_owner',
  'clinic_admin',
  'receptionist',
  'physician',
  'nutritionist',
  'fitness_professional',
  'financial_user',
]);
const PATIENT_ROLES = new Set(['patient', 'guardian']);

function getTargetRoute(role: string | null) {
  if (role && ADMIN_ROLES.has(role)) return '/admin';
  if (role && CLINIC_ROLES.has(role)) return '/clinic/dashboard';
  if (role && PATIENT_ROLES.has(role)) return '/patient';
  return '/clinic/dashboard';
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const { supabase, response } = updateSession(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = (user?.app_metadata?.role as string | undefined) ?? null;

  if (
    !user &&
    (pathname.startsWith('/admin') ||
      pathname.startsWith('/clinic') ||
      pathname.startsWith('/patient'))
  ) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  if (user && pathname === '/') {
    return NextResponse.redirect(new URL(getTargetRoute(role), request.url));
  }

  if (user && pathname.startsWith('/auth/login')) {
    return NextResponse.redirect(new URL(getTargetRoute(role), request.url));
  }

  if (user && pathname.startsWith('/admin') && !ADMIN_ROLES.has(role ?? '')) {
    return NextResponse.redirect(new URL(getTargetRoute(role), request.url));
  }

  if (user && pathname.startsWith('/clinic') && !CLINIC_ROLES.has(role ?? '')) {
    return NextResponse.redirect(new URL(getTargetRoute(role), request.url));
  }

  if (user && pathname.startsWith('/patient') && !PATIENT_ROLES.has(role ?? '')) {
    return NextResponse.redirect(new URL(getTargetRoute(role), request.url));
  }

  return response;
}

export const config = {
  matcher: ['/', '/auth/login', '/admin/:path*', '/clinic/:path*', '/patient/:path*'],
};
