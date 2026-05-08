import { NextResponse, type NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const ADMIN_ROLES = new Set(['platform_admin', 'platform_support']);
const CLINIC_ROLES = new Set(['tenant_owner', 'clinic_admin', 'receptionist', 'physician', 'nutritionist', 'fitness_professional', 'financial_user']);
const PATIENT_ROLES = new Set(['patient', 'guardian']);

function getTargetRoute(role: string | null) {
  if (role && ADMIN_ROLES.has(role)) return '/admin';
  if (role && CLINIC_ROLES.has(role)) return '/clinic/dashboard';
  if (role && PATIENT_ROLES.has(role)) return '/patient';
  return '/clinic/dashboard';
}

async function getUser(accessToken?: string) {
  if (!accessToken) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  return response.json();
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get('sb-access-token')?.value;
  const user = await getUser(token);
  const role = (user?.app_metadata?.role as string | undefined) ?? null;

  if (!user && (pathname.startsWith('/admin') || pathname.startsWith('/clinic') || pathname.startsWith('/patient'))) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/auth/login', '/admin/:path*', '/clinic/:path*', '/patient/:path*'],
};
