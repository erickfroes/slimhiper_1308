import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppSession } from '@/services/session/getCurrentAppSession';
import { isPlatformAdminRole, isPlatformOwnerRole } from '@/services/session/roles';

type AdminClient = SupabaseClient;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPlatformMercadoPagoManager(session: AppSession) {
  return isPlatformOwnerRole(session.platformRole) || isPlatformAdminRole(session.platformRole);
}

async function hasActiveTenantMembership(admin: AdminClient, userId: string, tenantId: string) {
  const { data, error } = await admin
    .from('tenant_memberships')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data);
}

export async function resolveMercadoPagoOAuthTenantId(
  admin: AdminClient,
  session: AppSession,
  requestedTenantId: string
) {
  const normalized = requestedTenantId.trim();
  if (isUuid(normalized)) return normalized;
  if (normalized !== 'current') return '';

  const sessionTenantId = session.activeTenant?.id ?? '';
  if (isUuid(sessionTenantId)) return sessionTenantId;

  const profileResult = await admin
    .from('profiles')
    .select('active_tenant_id')
    .eq('id', session.userId)
    .maybeSingle();
  const profileTenantId = asString(asRecord(profileResult.data).active_tenant_id);
  if (
    isUuid(profileTenantId) &&
    (await hasActiveTenantMembership(admin, session.userId, profileTenantId))
  ) {
    return profileTenantId;
  }

  const membershipResult = await admin
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', session.userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const membershipTenantId = asString(asRecord(membershipResult.data).tenant_id);

  return isUuid(membershipTenantId) ? membershipTenantId : '';
}

export async function canManageMercadoPagoOAuthTenant(
  admin: AdminClient,
  session: AppSession,
  tenantId: string
) {
  if (isPlatformMercadoPagoManager(session)) return true;
  if (session.activeTenant?.id === tenantId && session.permissions.includes('financial.write')) {
    return true;
  }

  const membershipResult = await admin
    .from('tenant_memberships')
    .select('role_code, role')
    .eq('tenant_id', tenantId)
    .eq('user_id', session.userId)
    .eq('status', 'active');

  if (membershipResult.error) return false;

  const roleNames = Array.from(
    new Set(
      (membershipResult.data ?? []).flatMap((row) => {
        const record = asRecord(row);
        return [asString(record.role_code), asString(record.role)].filter(Boolean);
      })
    )
  );
  if (roleNames.length === 0) return false;

  const rolesResult = await admin
    .from('roles')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('name', roleNames);
  if (rolesResult.error) return false;

  const roleIds = (rolesResult.data ?? []).map((row) => asString(asRecord(row).id)).filter(Boolean);
  if (roleIds.length === 0) return false;

  const permissionsResult = await admin
    .from('role_permissions')
    .select('permissions!inner(code)')
    .eq('tenant_id', tenantId)
    .in('role_id', roleIds);
  if (permissionsResult.error) return false;

  return (permissionsResult.data ?? []).some((row) => {
    const permission = asRecord(asRecord(row).permissions);
    return asString(permission.code) === 'financial.write';
  });
}
