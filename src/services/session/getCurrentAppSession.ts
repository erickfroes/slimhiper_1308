import { createClient } from '@/lib/supabase/server';
import {
  getEntitlementFeatureFlags,
  isPlanPathAllowed,
  normalizePlanEntitlements,
  type PlanEntitlements,
} from '@/services/planEntitlements';
import { PERMISSIONS, hasAnyPermission } from './permissions';
import {
  isPatientRole,
  isPlatformAdminRole,
  isPlatformOwnerRole,
  isPlatformSupportRole,
  type PlatformRole,
} from './roles';

type SupabaseLike = NonNullable<Awaited<ReturnType<typeof createClient>>>;

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
  activeTenantRoles: string[];
  featureFlags: string[];
  permissions: string[];
  planEntitlements: PlanEntitlements;
  isPlatformAdmin: () => boolean;
  isPlatformSupport: () => boolean;
  isClinicUser: () => boolean;
  isPatient: () => boolean;
  canAccessPlatformAdmin: () => boolean;
  canAccessClinicWorkspace: () => boolean;
  canViewFinancial: () => boolean;
  canViewMedicalPrescriptions: () => boolean;
  canManageTenantUsers: () => boolean;
  canAccessPatientPortal: () => boolean;
}

export function getAppSessionTargetRoute(session: AppSession | null): string {
  if (!session) return '/auth/login';

  const hasActiveTenantMembership = session.tenantMemberships.some(
    (membership) => membership.status === 'active'
  );

  if (session.canAccessPlatformAdmin()) return '/admin';
  if (session.canAccessClinicWorkspace() && hasActiveTenantMembership) return '/clinic/dashboard';
  if (session.canAccessPatientPortal()) return '/patient';
  return '/no-workspace';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeStringArray(values: Array<string | null | undefined>): string[] {
  const normalized = values
    .map((value) => normalizeString(value))
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  return Array.from(new Set(normalized));
}

export async function getCurrentAppSession(
  supabaseClient?: SupabaseLike
): Promise<AppSession | null> {
  const supabase = supabaseClient ?? (await createClient());
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileResult, membershipResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('tenant_memberships')
      .select('id, tenant_id, user_id, role, role_code, status, unit_id')
      .eq('user_id', user.id),
  ]);

  const profileRow = profileResult.data;
  const membershipRows = membershipResult.data;

  const profile = asRecord(profileRow);
  if (profileRow && profile.is_active === false) {
    return null;
  }

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

  const requestedActiveTenantId = normalizeString(profile.active_tenant_id);
  const requestedActiveMembership = requestedActiveTenantId
    ? (memberships.find(
        (membership) =>
          membership.tenantId === requestedActiveTenantId && membership.status === 'active'
      ) ?? null)
    : null;
  const fallbackActiveMembership =
    memberships.find((membership) => membership.status === 'active') ?? null;
  const activeTenantId =
    requestedActiveMembership?.tenantId ?? fallbackActiveMembership?.tenantId ?? null;
  const activeTenant = activeTenantId ? { id: activeTenantId } : null;

  const tenantMemberships: AppTenantMembership[] = memberships;

  const activeTenantMemberships = activeTenantId
    ? tenantMemberships.filter(
        (membership) => membership.tenantId === activeTenantId && membership.status === 'active'
      )
    : [];
  const activeMembership = activeTenantMemberships[0] ?? null;
  const activeTenantRole = activeMembership?.roleKey ?? null;
  const activeTenantRoles = normalizeStringArray(
    activeTenantMemberships.map((membership) => membership.roleKey)
  );
  const hasActiveClinicRole = activeTenantRoles.some(
    (role) => role.length > 0 && !['patient', 'guardian'].includes(role)
  );
  const hasPatientPortalRole = activeTenantRoles.some((role) =>
    ['patient', 'guardian'].includes(role)
  );

  let permissions: string[] = [];
  const activeRoleNames = normalizeStringArray(
    activeTenantMemberships.flatMap((membership) => [membership.roleCode, membership.legacyRole])
  );
  if (activeTenantId && activeRoleNames.length > 0) {
    const { data: roleRows, error: roleRowsError } = await supabase
      .from('roles')
      .select('id')
      .eq('tenant_id', activeTenantId)
      .in('name', activeRoleNames);

    if (roleRowsError) {
      console.error('[getCurrentAppSession] role query failed', roleRowsError);
    } else {
      const roleIds = (roleRows ?? [])
        .map((row: unknown) => normalizeString(asRecord(row).id))
        .filter((value): value is string => Boolean(value));

      if (roleIds.length > 0) {
        const { data: rolePermissionRows, error: rolePermissionError } = await supabase
          .from('role_permissions')
          .select('permissions!inner(id, code)')
          .in('role_id', roleIds);

        if (rolePermissionError) {
          console.error(
            '[getCurrentAppSession] role_permissions query failed',
            rolePermissionError
          );
        } else {
          permissions = Array.from(
            new Set(
              (rolePermissionRows ?? [])
                .map((row: unknown) => asRecord(row))
                .map((row) => asRecord(row.permissions))
                .map((permission) => normalizeString(permission.code))
                .filter((permission): permission is string => Boolean(permission))
            )
          );
        }
      }
    }
  }

  const [featureFlagsResult, tenantSettingsResult] = activeTenantId
    ? await Promise.all([
        supabase.from('feature_flags').select('*').eq('tenant_id', activeTenantId),
        supabase.from('tenants').select('settings').eq('id', activeTenantId).maybeSingle(),
      ])
    : [{ data: [] }, { data: null }];

  const tenantSettings = asRecord(asRecord(tenantSettingsResult.data).settings);
  const planEntitlements = normalizePlanEntitlements(tenantSettings.planEntitlements);
  const entitlementFeatureFlags = getEntitlementFeatureFlags(planEntitlements);
  const persistedFeatureFlags = new Map<string, boolean>();
  for (const row of featureFlagsResult.data ?? []) {
    const raw = asRecord(row);
    const key = normalizeString(raw.key) ?? normalizeString(raw.code) ?? normalizeString(raw.slug);
    if (key) persistedFeatureFlags.set(key, raw.enabled !== false);
  }
  const featureFlags = Object.entries(entitlementFeatureFlags).reduce<string[]>(
    (acc, [key, enabledByEntitlement]) => {
      const enabled = persistedFeatureFlags.has(key)
        ? persistedFeatureFlags.get(key) === true
        : enabledByEntitlement;
      if (enabled) acc.push(key);
      return acc;
    },
    []
  );
  for (const [key, enabled] of persistedFeatureFlags.entries()) {
    if (enabled && !featureFlags.includes(key)) featureFlags.push(key);
  }

  const permissionSet = new Set(permissions);
  const canOpenPatientPortalByPlan = isPlanPathAllowed('/patient', planEntitlements, permissions);

  const session: AppSession = {
    userId: user.id,
    email: user.email ?? normalizeString(profile.email),
    fullName,
    platformRole,
    activeTenant,
    tenantMemberships,
    activeTenantRole,
    activeTenantRoles,
    featureFlags,
    permissions,
    planEntitlements,
    isPlatformAdmin: () => isPlatformAdminRole(platformRole),
    isPlatformSupport: () => isPlatformSupportRole(platformRole),
    isClinicUser: () => tenantMemberships.length > 0,
    isPatient: () => isPatientRole(platformRole),
    canAccessPlatformAdmin: () =>
      isPlatformOwnerRole(platformRole) ||
      isPlatformAdminRole(platformRole) ||
      isPlatformSupportRole(platformRole) ||
      hasAnyPermission(permissionSet, PERMISSIONS.PLATFORM_ADMIN_ACCESS),
    canAccessClinicWorkspace: () =>
      activeTenantMemberships[0] !== undefined &&
      (hasActiveClinicRole || hasAnyPermission(permissionSet, PERMISSIONS.CLINIC_WORKSPACE_ACCESS)),
    canViewFinancial: () =>
      hasAnyPermission(permissionSet, [
        ...PERMISSIONS.FINANCIAL_VIEW,
        'financial.read',
        'financial.write',
      ]),
    canViewMedicalPrescriptions: () =>
      hasAnyPermission(permissionSet, PERMISSIONS.MEDICAL_PRESCRIPTIONS_VIEW),
    canManageTenantUsers: () =>
      hasAnyPermission(permissionSet, [...PERMISSIONS.TENANT_USERS_MANAGE, 'settings.write']),
    canAccessPatientPortal: () =>
      activeTenantMemberships[0] !== undefined &&
      hasPatientPortalRole &&
      canOpenPatientPortalByPlan &&
      hasAnyPermission(permissionSet, PERMISSIONS.PATIENT_PORTAL_ACCESS),
  };

  return session;
}
