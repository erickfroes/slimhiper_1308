import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseAdminLike = Pick<SupabaseClient, 'from'>;

type PhysicianLimitResult = {
  allowed: boolean;
  limit: number | null;
  current: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

export async function getTenantDoctorsLimit(
  admin: SupabaseAdminLike,
  tenantId: string
): Promise<number | null> {
  const { data, error } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw error;

  const usage = asRecord(asRecord(data).settings).usage;
  const usageRecord = asRecord(usage);
  return positiveInteger(usageRecord.doctorsLimit ?? usageRecord.doctors_limit);
}

export async function canInvitePhysicianWithinLimit(params: {
  admin: SupabaseAdminLike;
  tenantId: string;
  targetUserId?: string | null;
}): Promise<PhysicianLimitResult> {
  const { admin, tenantId, targetUserId } = params;
  const limit = await getTenantDoctorsLimit(admin, tenantId);
  if (!limit) return { allowed: true, limit: null, current: 0 };

  const { data, error } = await admin
    .from('tenant_memberships')
    .select('user_id,role_code,role,status')
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'invited'])
    .or('role_code.eq.physician,role.eq.physician');
  if (error) throw error;

  const current = (data ?? []).filter((membership) => {
    const userId = typeof membership.user_id === 'string' ? membership.user_id : '';
    return !targetUserId || userId !== targetUserId;
  }).length;

  return {
    allowed: current < limit,
    limit,
    current,
  };
}
