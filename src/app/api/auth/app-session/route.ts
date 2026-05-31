import { NextResponse } from 'next/server';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';

export async function GET() {
  const session = await getCurrentAppSession();

  if (!session) {
    return NextResponse?.json({
      authenticated: false,
      canAccessPlatformAdmin: false,
      canAccessClinicWorkspace: false,
      hasActiveTenantMembership: false,
      canAccessPatientPortal: false,
      targetRoute: '/auth/login',
    });
  }

  const hasActiveTenantMembership = session.tenantMemberships.some(
    (membership) => membership.status === 'active'
  );
  const canAccessPlatformAdmin = canAccessPlatformAdminFromSession(session);
  const canAccessClinicWorkspace = session.canAccessClinicWorkspace();
  const canAccessPatientPortal = false;
  const targetRoute = canAccessPlatformAdmin
    ? '/admin'
    : canAccessClinicWorkspace && hasActiveTenantMembership
      ? '/clinic/dashboard'
      : canAccessPatientPortal
        ? '/patient'
        : '/no-workspace';

  return NextResponse?.json({
    authenticated: true,
    platformRole: session?.platformRole,
    permissions: session?.permissions,
    canAccessPlatformAdmin,
    canAccessClinicWorkspace,
    hasActiveTenantMembership,
    canAccessPatientPortal,
    targetRoute,
  });
}
