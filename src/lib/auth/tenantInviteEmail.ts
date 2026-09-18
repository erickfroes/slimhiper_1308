import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getInviteRedirectTo } from '@/lib/auth/inviteRedirect';

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type TenantInviteDelivery = 'supabase_invite_sent' | 'password_setup_sent';

const INVITATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function createInvitationToken() {
  return randomBytes(32).toString('base64url');
}

function hashInvitationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function isAlreadyRegisteredError(error: { code?: string; message?: string } | null) {
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  return (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    code === 'conflict' ||
    message.includes('already') ||
    message.includes('registered') ||
    message.includes('exists')
  );
}

export async function sendTenantInviteEmail(params: {
  admin: SupabaseAdmin;
  request: Request;
  email: string;
  tenantId: string;
  roleCode: string;
  fullName?: string;
  invitedBy?: string;
}): Promise<{ user: User; delivery: TenantInviteDelivery; invitationId: string }> {
  const { admin, request, email, tenantId, roleCode, fullName, invitedBy } = params;
  const normalizedEmail = normalizeEmail(email);
  const invitationToken = createInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TOKEN_TTL_MS).toISOString();

  const redirectTo = getInviteRedirectTo(request, tenantId, invitationToken);
  const { data: invitation, error: tokenError } = await admin
    .from('tenant_invitation_tokens')
    .insert({
      tenant_id: tenantId,
      email: normalizedEmail,
      role_code: roleCode,
      token_hash: hashInvitationToken(invitationToken),
      expires_at: expiresAt,
      issued_by: invitedBy ?? null,
    })
    .select('id')
    .single();
  if (tokenError || !invitation) throw new Error('invitation_creation_failed');
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      full_name: fullName || undefined,
      tenant_id: tenantId,
      role_code: roleCode,
    },
  });

  if (!error && data.user) {
    return { user: data.user, delivery: 'supabase_invite_sent', invitationId: invitation.id };
  }

  if (!isAlreadyRegisteredError(error)) throw error;

  const existing = await findAuthUserByEmail(admin, email);
  if (!existing) throw error;

  await sendTenantPasswordSetupEmail({ admin, request, email, tenantId, invitationToken });
  return { user: existing, delivery: 'password_setup_sent', invitationId: invitation.id };
}

export async function bindTenantInvitation(
  admin: SupabaseAdmin,
  invitationId: string,
  membershipId: string,
  userId: string
) {
  const { error } = await admin.rpc('bind_tenant_invitation', {
    p_invitation_id: invitationId,
    p_membership_id: membershipId,
    p_user_id: userId,
  });
  if (error) throw new Error('invitation_binding_failed');
}

export async function sendTenantPasswordSetupEmail(params: {
  admin: SupabaseAdmin;
  request: Request;
  email: string;
  tenantId: string;
  invitationToken: string;
}) {
  const { admin, request, email, tenantId, invitationToken } = params;
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: getInviteRedirectTo(request, tenantId, invitationToken),
  });
  if (error) throw error;
}

export async function findAuthUserByEmail(admin: SupabaseAdmin, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((item) => item.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }

  return null;
}
