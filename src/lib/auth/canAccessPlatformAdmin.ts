import type { AppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole, isPlatformSupportRole } from '@/services/session/roles';
import { PERMISSIONS, hasAnyPermission } from '@/services/session/permissions';

export function canAccessPlatformAdminFromSession(session: AppSession): boolean {
  return session.canAccessPlatformAdmin();
}

export function canAccessPlatformAdminFromClientAuth(params: {
  platformRole: string | null | undefined;
  permissions: string[];
}): boolean {
  const permissionSet = new Set(params.permissions);
  return (
    isPlatformOwnerRole(params.platformRole) ||
    isPlatformAdminRole(params.platformRole) ||
    isPlatformSupportRole(params.platformRole) ||
    hasAnyPermission(permissionSet, PERMISSIONS.PLATFORM_ADMIN_ACCESS)
  );
}
