import { NextResponse } from 'next/server';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import {
  createObservabilityContext,
  logObservedEvent,
  observedHeaders,
} from '@/lib/observability/server';

export async function GET(request: Request) {
  const context = createObservabilityContext('api.auth.app-session', request);
  const session = await getCurrentAppSession();

  if (!session) {
    logObservedEvent(context, 'auth_session_resolved', 'warn', 'denied', {
      auth_state: 'unauthenticated',
    });

    return NextResponse.json(
      {
        authenticated: false,
        canAccessPlatformAdmin: false,
        canAccessClinicWorkspace: false,
        hasActiveTenantMembership: false,
        canAccessPatientPortal: false,
        targetRoute: '/auth/login',
        requestId: context.requestId,
      },
      { headers: observedHeaders(context) }
    );
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

  logObservedEvent(context, 'auth_session_resolved', 'info', 'success', {
    auth_state: 'authenticated',
    can_access_platform_admin: canAccessPlatformAdmin,
    can_access_clinic_workspace: canAccessClinicWorkspace,
    has_active_tenant_membership: hasActiveTenantMembership,
  });

  return NextResponse.json(
    {
      authenticated: true,
      platformRole: session.platformRole,
      permissions: session.permissions,
      canAccessPlatformAdmin,
      canAccessClinicWorkspace,
      hasActiveTenantMembership,
      canAccessPatientPortal,
      targetRoute,
      requestId: context.requestId,
    },
    { headers: observedHeaders(context) }
  );
}
