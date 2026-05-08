import { createClient } from '@/lib/supabase/server';
import { PERMISSIONS, hasAnyPermission } from './permissions';
import {
  isPatientRole,
  isPlatformAdminRole,
  isPlatformSupportRole,
  type PlatformRole,
} from './roles';

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

export interface AppTenantMembership {
  id: string;
  tenantId: string;
  roleId: string;
  roleKey: string | null;
  status: string | null;
}

export interface AppSession {
  userId: string;
  email: string | null;
  fullName: string | null;
  platformRole: PlatformRole;
  activeTenant: { id: string } | null;
  tenantMemberships: AppTenantMembership[];
  activeTenantRole: string | null;
  featureFlags: string[];
  permissions: string[];
  isPlatformAdmin: () => boolean;
  isPlatformSupport: () => boolean;
  isClinicUser: () => boolean;
  isPatient: () => boolean;
  canAccessPlatformAdmin: () => boolean;
  canAccessClinicWorkspace: () => boolean;
  canViewFinancial: () => boolean;
  canViewMedicalPrescriptions: () => boolean;
  canManageTenantUsers: () => boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function getCurrentAppSession(
  supabaseClient?: SupabaseLike
): Promise<AppSession | null> {
  const supabase = supabaseClient ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profileRow }, { data: membershipRows }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('tenant_memberships').select('*').eq('user_id', user.id),
  ]);

  const profile = asRecord(profileRow);
  const platformRole =
    normalizeString(profile.platform_role) ?? normalizeString(user.app_metadata?.role);
  const fullName = normalizeString(profile.full_name);

  const memberships: Array<{
    id: string;
    tenantId: string;
    roleId: string;
    status: string | null;
  }> = (membershipRows ?? []).map((row: unknown) => {
    const raw = asRecord(row);
    return {
      id: String(raw.id ?? ''),
      tenantId: String(raw.tenant_id ?? ''),
      roleId: String(raw.role_id ?? ''),
      status: normalizeString(raw.status),
    };
  });

  const activeTenantId =
    normalizeString(profile.active_tenant_id) ??
    memberships.find((membership) => membership.status === 'active')?.tenantId ??
    null;
  const activeTenant = activeTenantId ? { id: activeTenantId } : null;

  const roleIds = Array.from(
    new Set(memberships.map((membership) => membership.roleId).filter(Boolean))
  );
  const roleKeyById = new Map<string, string>();
  let permissionIds: string[] = [];

  if (roleIds.length > 0) {
    const [{ data: roleRows }, { data: rolePermissionRows }] = await Promise.all([
      supabase.from('roles').select('*').in('id', roleIds),
      supabase.from('role_permissions').select('role_id, permission_id').in('role_id', roleIds),
    ]);

    for (const row of roleRows ?? []) {
      const raw = asRecord(row);
      const roleId = String(raw.id ?? '');
      const roleKey =
        normalizeString(raw.key) ??
        normalizeString(raw.code) ??
        normalizeString(raw.slug) ??
        normalizeString(raw.name);
      if (roleId) roleKeyById.set(roleId, roleKey ?? roleId);
    }

    permissionIds = Array.from(
      new Set(
        (rolePermissionRows ?? [])
          .map((row: { permission_id: unknown }) => String(row.permission_id ?? ''))
          .filter(Boolean)
      )
    );
  }

  const tenantMemberships: AppTenantMembership[] = memberships.map((membership) => ({
    ...membership,
    roleKey: roleKeyById.get(membership.roleId) ?? null,
  }));

  const activeMembership = activeTenantId
    ? (tenantMemberships.find((membership) => membership.tenantId === activeTenantId) ?? null)
    : null;
  const activeTenantRole = activeMembership?.roleKey ?? activeMembership?.roleId ?? null;

  let permissions: string[] = [];
  if (permissionIds.length > 0) {
    const { data: permissionRows } = await supabase
      .from('permissions')
      .select('*')
      .in('id', permissionIds);
    permissions = Array.from(
      new Set(
        (permissionRows ?? [])
          .map((row: unknown) => {
            const raw = asRecord(row);
            return (
              normalizeString(raw.key) ??
              normalizeString(raw.code) ??
              normalizeString(raw.slug) ??
              normalizeString(raw.name)
            );
          })
          .filter((permission): permission is string => Boolean(permission))
      )
    );
  }

  const { data: featureFlagRows } = activeTenantId
    ? await supabase.from('feature_flags').select('*').eq('tenant_id', activeTenantId)
    : await supabase.from('feature_flags').select('*').is('tenant_id', null);

  const featureFlags = Array.from(
    new Set(
      (featureFlagRows ?? [])
        .map((row: unknown) => {
          const raw = asRecord(row);
          if (raw.enabled === false) return null;
          return normalizeString(raw.key) ?? normalizeString(raw.code) ?? normalizeString(raw.slug);
        })
        .filter((flag): flag is string => Boolean(flag))
    )
  );

  const permissionSet = new Set(permissions);

  const session: AppSession = {
    userId: user.id,
    email: user.email ?? normalizeString(profile.email),
    fullName,
    platformRole,
    activeTenant,
    tenantMemberships,
    activeTenantRole,
    featureFlags,
    permissions,
    isPlatformAdmin: () => isPlatformAdminRole(platformRole),
    isPlatformSupport: () => isPlatformSupportRole(platformRole),
    isClinicUser: () => tenantMemberships.length > 0,
    isPatient: () => isPatientRole(platformRole) || tenantMemberships.length === 0,
    canAccessPlatformAdmin: () =>
      isPlatformAdminRole(platformRole) ||
      isPlatformSupportRole(platformRole) ||
      hasAnyPermission(permissionSet, PERMISSIONS.PLATFORM_ADMIN_ACCESS),
    canAccessClinicWorkspace: () => tenantMemberships.length > 0,
    canViewFinancial: () => hasAnyPermission(permissionSet, PERMISSIONS.FINANCIAL_VIEW),
    canViewMedicalPrescriptions: () =>
      hasAnyPermission(permissionSet, PERMISSIONS.MEDICAL_PRESCRIPTIONS_VIEW),
    canManageTenantUsers: () => hasAnyPermission(permissionSet, PERMISSIONS.TENANT_USERS_MANAGE),
  };

  return session;
}
