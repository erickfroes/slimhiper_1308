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

  const activeMembership = activeTenantId
    ? (tenantMemberships.find((membership) => membership.tenantId === activeTenantId) ?? null)
    : null;
  const activeTenantRole = activeMembership?.roleKey ?? null;

  let permissions: string[] = [];
  for (const membership of activeMembership ? [activeMembership] : []) {
    const roleName = membership.roleCode ?? membership.legacyRole;
    if (!membership.tenantId || !roleName) continue;

    const { data: roleRow } = await supabase
      .from('roles')
      .select('id')
      .eq('tenant_id', membership.tenantId)
      .eq('name', roleName)
      .maybeSingle();

    const roleId = normalizeString(asRecord(roleRow).id);
    if (!roleId) continue;

    const { data: rolePermissionRows } = await supabase
      .from('role_permissions')
      .select('permissions!inner(id, code)')
      .eq('role_id', roleId);

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

    if (permissions.length > 0) break;
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
  const normalizedActiveRole = (activeTenantRole ?? '').toLowerCase();
  const isActiveClinicRole =
    normalizedActiveRole.length > 0 && !['patient', 'guardian'].includes(normalizedActiveRole);
  const canManageByRole = ['tenant_owner', 'clinic_admin'].includes(normalizedActiveRole);
  const canViewRxByRole = ['physician', 'clinic_admin', 'tenant_owner'].includes(
    normalizedActiveRole
  );
  const canOpenPatientPortalByPlan = isPlanPathAllowed('/patient', planEntitlements, permissions);

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
    canAccessClinicWorkspace: () => activeMembership?.status === 'active' && isActiveClinicRole,
    canViewFinancial: () => hasAnyPermission(permissionSet, ['financial.read', 'financial.write']),
    canViewMedicalPrescriptions: () =>
      canViewRxByRole &&
      hasAnyPermission(permissionSet, ['prescriptions.read', 'prescriptions.write']),
    canManageTenantUsers: () =>
      canManageByRole || hasAnyPermission(permissionSet, ['tenant.users.manage', 'settings.write']),
    canAccessPatientPortal: () =>
      activeMembership?.status === 'active' &&
      ['patient', 'guardian'].includes(normalizedActiveRole) &&
      canOpenPatientPortalByPlan &&
      hasAnyPermission(permissionSet, PERMISSIONS.PATIENT_PORTAL_ACCESS),
  };

  return session;
}
