import {
  getAllowedPermissionCodes,
  getEntitlementFeatureFlags,
  getManagedPermissionCodes,
  normalizePlanEntitlements,
  type PlanEntitlements,
} from '@/services/planEntitlements';
import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseAdminLike = Pick<SupabaseClient, 'from'>;

export async function applyTenantEntitlements(params: {
  admin: SupabaseAdminLike;
  tenantId: string;
  entitlements: PlanEntitlements;
}) {
  const { admin, tenantId } = params;
  const entitlements = normalizePlanEntitlements(params.entitlements);
  const featureFlags = getEntitlementFeatureFlags(entitlements);
  const featureFlagRows = Object.entries(featureFlags).map(([key, enabled]) => ({
    tenant_id: tenantId,
    key,
    enabled,
    config: {
      source: 'plan_entitlements',
    },
  }));

  if (featureFlagRows.length > 0) {
    const { error } = await admin
      .from('feature_flags')
      .upsert(featureFlagRows, { onConflict: 'tenant_id,key' });
    if (error) throw error;
  }

  const managedPermissionCodes = getManagedPermissionCodes();
  const allowedPermissionCodes = new Set(getAllowedPermissionCodes(entitlements));

  if (managedPermissionCodes.length === 0) return;

  const { data: permissionRows, error: permissionsError } = await admin
    .from('permissions')
    .select('id,code')
    .eq('tenant_id', tenantId)
    .in('code', managedPermissionCodes);
  if (permissionsError) throw permissionsError;

  const permissions = (permissionRows ?? []) as Array<{ id: string; code: string }>;
  const disallowedPermissionIds = permissions
    .filter((permission) => !allowedPermissionCodes.has(permission.code))
    .map((permission) => permission.id);

  if (disallowedPermissionIds.length > 0) {
    const { error } = await admin
      .from('role_permissions')
      .delete()
      .eq('tenant_id', tenantId)
      .in('permission_id', disallowedPermissionIds);
    if (error) throw error;
  }

  const allowedPermissions = permissions.filter((permission) =>
    allowedPermissionCodes.has(permission.code)
  );
  if (allowedPermissions.length === 0) return;

  const allowedPermissionIds = allowedPermissions.map((permission) => permission.id);
  const patientPortalPermission = allowedPermissions.find(
    (permission) => permission.code === 'patient_portal.access'
  );

  const { data: roleRows, error: rolesError } = await admin
    .from('roles')
    .select('id,name')
    .eq('tenant_id', tenantId)
    .in('name', ['tenant_owner', 'clinic_admin', 'patient', 'guardian']);
  if (rolesError) throw rolesError;

  const roles = (roleRows ?? []) as Array<{ id: string; name: string }>;
  const adminRoleNames = new Set(['tenant_owner', 'clinic_admin']);
  const patientPortalRoleNames = new Set(['patient', 'guardian']);
  const rolePermissionRows = roles.flatMap((role) => {
    const permissionIds = adminRoleNames.has(role.name)
      ? allowedPermissionIds
      : patientPortalRoleNames.has(role.name) && patientPortalPermission
        ? [patientPortalPermission.id]
        : [];

    return permissionIds.map((permissionId) => ({
      tenant_id: tenantId,
      role_id: role.id,
      permission_id: permissionId,
    }));
  });

  if (rolePermissionRows.length > 0) {
    const { error } = await admin
      .from('role_permissions')
      .upsert(rolePermissionRows, { onConflict: 'tenant_id,role_id,permission_id' });
    if (error) throw error;
  }
}
