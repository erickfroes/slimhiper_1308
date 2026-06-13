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

  const [
    { data: memberships, error: membershipsError },
    { data: professionals, error: professionalsError },
  ] = await Promise.all([
    admin
      .from('tenant_memberships')
      .select('id,user_id,role_code,role,status')
      .eq('tenant_id', tenantId)
      .in('status', ['active', 'invited']),
    admin
      .from('tenant_professionals')
      .select('membership_id,user_id,professional_type,is_active')
      .eq('tenant_id', tenantId)
      .eq('professional_type', 'physician'),
  ]);

  if (membershipsError) throw membershipsError;
  if (professionalsError) throw professionalsError;

  const activeMembershipIds = new Set((memberships ?? []).map((membership) => membership.id));
  const usersWithPhysicianProfile = new Set(
    (professionals ?? [])
      .map((professional) => (typeof professional.user_id === 'string' ? professional.user_id : ''))
      .filter(Boolean)
  );
  const countedUserIds = new Set<string>();

  (professionals ?? []).forEach((professional) => {
    const userId = typeof professional.user_id === 'string' ? professional.user_id : '';
    const membershipId =
      typeof professional.membership_id === 'string' ? professional.membership_id : '';
    if (!userId || !professional.is_active || !activeMembershipIds.has(membershipId)) return;
    countedUserIds.add(userId);
  });

  (memberships ?? []).forEach((membership) => {
    const userId = typeof membership.user_id === 'string' ? membership.user_id : '';
    if (!userId || usersWithPhysicianProfile.has(userId)) return;
    if (membership.role_code === 'physician' || membership.role === 'physician') {
      countedUserIds.add(userId);
    }
  });

  const current = Array.from(countedUserIds).filter((userId) => {
    return !targetUserId || userId !== targetUserId;
  }).length;

  if (!limit) return { allowed: true, limit: null, current };

  return {
    allowed: current < limit,
    limit,
    current,
  };
}
