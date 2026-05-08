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
  userId: string;
  unitId: string | null;
  roleCode: string | null;
  legacyRole: string | null;
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
    userId: string;
    unitId: string | null;
    roleCode: string | null;
    legacyRole: string | null;
    roleKey: string | null;
    status: string | null;
  }> = (membershipRows ?? []).map((row: unknown) => {
    const raw = asRecord(row);
    const roleCode = normalizeString(raw.role_code);
    const legacyRole = normalizeString(raw.role);
    return {
      id: String(raw.id ?? ''),
      tenantId: String(raw.tenant_id ?? ''),
      userId: String(raw.user_id ?? ''),
      unitId: normalizeString(raw.unit_id),
      roleCode,
      legacyRole,
      roleKey: roleCode ?? legacyRole,
      status: normalizeString(raw.status),
    };
  });

  const activeTenantId =
    normalizeString(profile.active_tenant_id) ??
    memberships.find((membership) => membership.status === 'active')?.tenantId ??
    null;
  const activeTenant = activeTenantId ? { id: activeTenantId } : null;

  const activeMemberships = memberships.filter((membership) => membership.status === 'active');
  const membershipRolePairs = Array.from(
    new Set(
      activeMemberships
        .map((membership) => {
          const roleKey = membership.roleCode ?? membership.legacyRole;
          return membership.tenantId && roleKey ? `${membership.tenantId}::${roleKey}` : null;
        })
        .filter((value): value is string => Boolean(value))
    )
  );

  const tenantMemberships: AppTenantMembership[] = memberships;

  const activeMembership = activeTenantId
    ? (tenantMemberships.find((membership) => membership.tenantId === activeTenantId) ?? null)
    : null;
  const activeTenantRole = activeMembership?.roleKey ?? null;

  let permissions: string[] = [];
  if (membershipRolePairs.length > 0) {
    const orFilter = membershipRolePairs
      .map((pair) => {
        const [tenantId, roleName] = pair.split('::');
        return `and(tenant_id.eq.${tenantId},name.eq.${roleName})`;
      })
      .join(',');

    const { data: roleRows } = await supabase
      .from('roles')
      .select('id, tenant_id, name')
      .or(orFilter);

    const roleIds = Array.from(
      new Set((roleRows ?? []).map((row: { id: unknown }) => String(row.id ?? '')).filter(Boolean))
    );

    if (roleIds.length > 0) {
      const { data: rolePermissionRows } = await supabase
        .from('role_permissions')
        .select('role_id, permissions!inner(id, key, code, slug, name)')
        .in('role_id', roleIds);

      permissions = Array.from(
        new Set(
          (rolePermissionRows ?? [])
            .map((row: unknown) => {
              const raw = asRecord(row);
              const permission = asRecord(raw.permissions);
              return (
                normalizeString(permission.key) ??
                normalizeString(permission.code) ??
                normalizeString(permission.slug) ??
                normalizeString(permission.name)
              );
            })
            .filter((permission): permission is string => Boolean(permission))
        )
      );
    }
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
  const normalizedActiveRole = (activeTenantRole ?? '').toLowerCase();
  const isActiveClinicRole =
    normalizedActiveRole.length > 0 && !['patient', 'guardian'].includes(normalizedActiveRole);
  const canManageByRole = ['tenant_owner', 'clinic_admin'].includes(normalizedActiveRole);
  const canViewRxByRole = ['physician', 'clinic_admin', 'tenant_owner'].includes(normalizedActiveRole);

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
    canAccessClinicWorkspace: () =>
      activeMembership?.status === 'active' && isActiveClinicRole,
    canViewFinancial: () =>
      hasAnyPermission(permissionSet, [...PERMISSIONS.FINANCIAL_VIEW, 'financial.read', 'financial.write']),
    canViewMedicalPrescriptions: () =>
      canViewRxByRole &&
      hasAnyPermission(permissionSet, [
        ...PERMISSIONS.MEDICAL_PRESCRIPTIONS_VIEW,
        'prescriptions.read',
        'prescriptions.write',
      ]),
    canManageTenantUsers: () =>
      hasAnyPermission(permissionSet, [...PERMISSIONS.TENANT_USERS_MANAGE, 'settings.write']) ||
      canManageByRole,
  };

  return session;
}
