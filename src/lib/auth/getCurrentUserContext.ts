import { createClient } from '@/lib/supabase/server';

export type PlatformRole = string | null;

export interface UserProfile {
  id: string;
  email: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  activeTenantId?: string | null;
  platformRole?: string | null;
  raw: Record<string, unknown>;
}

export interface TenantMembership {
  id: string;
  tenantId: string;
  roleId: string;
  status: string | null;
  raw: Record<string, unknown>;
}

export interface ActiveTenantContext {
  id: string;
}

export interface UserContext {
  id: string;
  email: string | null;
  profile: UserProfile | null;
  platformRole: PlatformRole;
  memberships: TenantMembership[];
  activeTenant: ActiveTenantContext | null;
  activeTenantRole: string | null;
  permissions: string[];
  featureFlags: string[];
  canAccessPlatformAdmin: boolean;
  canAccessClinicWorkspace: boolean;
  canAccessPatientPortal: boolean;
  canViewFinancial: boolean;
  canViewMedicalPrescriptions: boolean;
}

function normalizePermission(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export async function getCurrentUserContext(): Promise<UserContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const profileData = asRecord(profileRow);
  const profile: UserProfile | null = profileRow
    ? {
        id: user.id,
        email: (profileData.email as string | null) ?? user.email ?? null,
        fullName: (profileData.full_name as string | null) ?? null,
        avatarUrl: (profileData.avatar_url as string | null) ?? null,
        activeTenantId: (profileData.active_tenant_id as string | null) ?? null,
        platformRole: (profileData.platform_role as string | null) ?? null,
        raw: profileData,
      }
    : null;

  const platformRole =
    profile?.platformRole ?? (typeof user.app_metadata?.role === 'string' ? user.app_metadata.role : null);

  const { data: membershipRows } = await supabase
    .from('tenant_memberships')
    .select('*')
    .eq('user_id', user.id);

  const memberships: TenantMembership[] = (membershipRows ?? []).map((row: unknown) => {
    const raw = asRecord(row);
    return {
      id: String(raw.id ?? ''),
      tenantId: String(raw.tenant_id ?? ''),
      roleId: String(raw.role_id ?? ''),
      status: (raw.status as string | null) ?? null,
      raw,
    };
  });

  const activeTenantId =
    profile?.activeTenantId ?? memberships.find((membership) => membership.status === 'active')?.tenantId ?? null;

  const activeTenant = activeTenantId ? { id: activeTenantId } : null;

  const activeMembership = activeTenantId
    ? memberships.find((membership) => membership.tenantId === activeTenantId) ?? null
    : null;

  const roleIds = Array.from(new Set(memberships.map((membership) => membership.roleId).filter(Boolean)));

  let activeTenantRole: string | null = null;
  let permissions: string[] = [];

  if (roleIds.length > 0) {
    const [{ data: rolesRows }, { data: rolePermissionRows }] = await Promise.all([
      supabase.from('roles').select('*').in('id', roleIds),
      supabase.from('role_permissions').select('role_id, permission_id').in('role_id', roleIds),
    ]);

    const roleNameById = new Map<string, string>();
    for (const row of rolesRows ?? []) {
      const raw = asRecord(row);
      const roleId = String(raw.id ?? '');
      const roleName =
        (raw.key as string | undefined) ??
        (raw.code as string | undefined) ??
        (raw.slug as string | undefined) ??
        (raw.name as string | undefined) ??
        roleId;
      if (roleId) roleNameById.set(roleId, roleName);
    }

    if (activeMembership?.roleId) {
      activeTenantRole = roleNameById.get(activeMembership.roleId) ?? activeMembership.roleId;
    }

    const permissionIds = Array.from(
      new Set((rolePermissionRows ?? []).map((row: any) => String(row.permission_id ?? '')).filter(Boolean)),
    );

    if (permissionIds.length > 0) {
      const { data: permissionRows } = await supabase.from('permissions').select('*').in('id', permissionIds);
      const permissionById = new Map<string, string>();

      for (const row of permissionRows ?? []) {
        const raw = asRecord(row);
        const permissionId = String(raw.id ?? '');
        const key =
          normalizePermission(raw.key) ??
          normalizePermission(raw.code) ??
          normalizePermission(raw.slug) ??
          normalizePermission(raw.name);
        if (permissionId && key) permissionById.set(permissionId, key);
      }

      permissions = Array.from<string>(
        new Set<string>(
          (rolePermissionRows ?? [])
            .map((row: any) => permissionById.get(String(row.permission_id ?? '')) ?? null)
            .filter((permission: string | null): permission is string => Boolean(permission)),
        ),
      );
    }
  }

  const { data: featureFlagRows } = activeTenantId
    ? await supabase.from('feature_flags').select('*').eq('tenant_id', activeTenantId)
    : await supabase.from('feature_flags').select('*').is('tenant_id', null);

  const featureFlags: string[] = Array.from(
    new Set<string>(
      (featureFlagRows ?? [])
        .map((row: unknown) => {
          const raw = asRecord(row);
          const enabled = raw.enabled;
          if (enabled === false) return null;
          return normalizePermission(raw.key) ?? normalizePermission(raw.code) ?? normalizePermission(raw.slug);
        })
        .filter((flag: string | null): flag is string => Boolean(flag)),
    ),
  );

  const permissionSet = new Set(permissions);

  return {
    id: user.id,
    email: user.email ?? profile?.email ?? null,
    profile,
    platformRole,
    memberships,
    activeTenant,
    activeTenantRole,
    permissions,
    featureFlags,
    canAccessPlatformAdmin:
      platformRole === 'platform_admin' || permissionSet.has('platform.admin.access') || permissionSet.has('admin.access'),
    canAccessClinicWorkspace: memberships.length > 0,
    canAccessPatientPortal:
      permissionSet.has('patient_portal.access') || permissionSet.has('patient.portal.access') || featureFlags.includes('patient_portal'),
    canViewFinancial:
      permissionSet.has('financial.view') || permissionSet.has('finance.view') || permissionSet.has('billing.view'),
    canViewMedicalPrescriptions:
      permissionSet.has('medical.prescriptions.view') ||
      permissionSet.has('prescriptions.view') ||
      permissionSet.has('medical_records.prescriptions.view'),
  };
}
