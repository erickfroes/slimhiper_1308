import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentAppSession, type AppSession } from '@/services/session/getCurrentAppSession';
import { isClinicPathAllowed } from '@/services/planEntitlements';

export type ClinicAccessState =
  | { status: 'ok'; session: AppSession }
  | { status: 'unauthenticated' }
  | { status: 'no_workspace'; session: AppSession }
  | { status: 'forbidden'; session: AppSession; reason: string }
  | { status: 'session_error'; error: unknown };

export async function getClinicAccessState(): Promise<ClinicAccessState> {
  try {
    const session = await getCurrentAppSession();

    if (!session) {
      return { status: 'unauthenticated' };
    }

    const hasActiveTenantMembership = session.tenantMemberships.some(
      (membership) => membership.status === 'active'
    );

    if (!hasActiveTenantMembership) {
      return { status: 'no_workspace', session };
    }

    if (!session.canAccessClinicWorkspace()) {
      return {
        status: 'forbidden',
        session,
        reason: 'active_membership_without_clinic_workspace_access',
      };
    }

    const requestPathname = (await headers()).get('x-pathname') ?? '';
    if (
      requestPathname.startsWith('/clinic') &&
      !isClinicPathAllowed(requestPathname, session.planEntitlements, session.permissions)
    ) {
      return {
        status: 'forbidden',
        session,
        reason: 'plan_module_disabled',
      };
    }

    return { status: 'ok', session };
  } catch (error) {
    return { status: 'session_error', error };
  }
}

export async function requireClinicAccess(): Promise<AppSession> {
  const access = await getClinicAccessState();

  if (access.status === 'ok') {
    return access.session;
  }

  if (access.status === 'unauthenticated') {
    redirect('/auth/login');
  }

  if (access.status === 'no_workspace') {
    redirect('/no-workspace');
  }

  throw new Error(access.status);
}
