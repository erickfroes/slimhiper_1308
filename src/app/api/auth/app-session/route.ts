import { NextResponse } from 'next/server';
import {
  getAppSessionTargetRoute,
  getCurrentAppSession,
} from '@/services/session/getCurrentAppSession';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';
import {
  DOCUMENT_PERMISSION_REQUIREMENTS,
  getDocumentPermissionAccess,
} from '@/services/session/permissions';
import { createClient } from '@/lib/supabase/server';
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
  const canAccessPatientPortal = session.canAccessPatientPortal();
  const targetRoute = getAppSessionTargetRoute(session);
  const documentPermissions = getDocumentPermissionAccess(session.permissions);

  logObservedEvent(context, 'auth_session_resolved', 'info', 'success', {
    auth_state: 'authenticated',
    can_access_platform_admin: canAccessPlatformAdmin,
    can_access_clinic_workspace: canAccessClinicWorkspace,
    can_access_patient_portal: canAccessPatientPortal,
    has_active_tenant_membership: hasActiveTenantMembership,
  });

  return NextResponse.json(
    {
      authenticated: true,
      user: session.user,
      activeTenant: session.activeTenant,
      activeTenantMembership: session.activeTenantMembership,
      tenantMemberships: session.tenantMemberships,
      platformRole: session.platformRole,
      permissions: session.permissions,
      documentPermissions,
      documentPermissionRequirements: DOCUMENT_PERMISSION_REQUIREMENTS,
      featureFlags: session.featureFlags,
      planEntitlements: session.planEntitlements,
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

export async function DELETE(request: Request) {
  const context = createObservabilityContext('api.auth.app-session.logout', request);
  const supabase = await createClient();

  if (!supabase) {
    logObservedEvent(context, 'auth_session_logout', 'warn', 'success', {
      auth_state: 'supabase_unconfigured',
    });

    return NextResponse.json(
      { ok: true, requestId: context.requestId },
      { headers: observedHeaders(context) }
    );
  }

  const { error } = await supabase.auth.signOut();
  logObservedEvent(context, 'auth_session_logout', error ? 'warn' : 'info', 'success', {
    auth_state: error ? 'logout_error_redacted' : 'signed_out',
  });

  return NextResponse.json(
    { ok: true, requestId: context.requestId },
    { headers: observedHeaders(context) }
  );
}
