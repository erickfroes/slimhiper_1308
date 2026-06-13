import type { User } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getInviteRedirectTo } from '@/lib/auth/inviteRedirect';

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type TenantInviteDelivery = 'supabase_invite_sent' | 'password_setup_sent';

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
}): Promise<{ user: User; delivery: TenantInviteDelivery }> {
  const { admin, request, email, tenantId, roleCode, fullName } = params;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: getInviteRedirectTo(request, tenantId),
    data: {
      full_name: fullName || undefined,
      tenant_id: tenantId,
      role_code: roleCode,
    },
  });

  if (!error && data.user) {
    return { user: data.user, delivery: 'supabase_invite_sent' };
  }

  if (!isAlreadyRegisteredError(error)) throw error;

  const existing = await findAuthUserByEmail(admin, email);
  if (!existing) throw error;

  await sendTenantPasswordSetupEmail({ admin, request, email, tenantId });
  return { user: existing, delivery: 'password_setup_sent' };
}

export async function sendTenantPasswordSetupEmail(params: {
  admin: SupabaseAdmin;
  request: Request;
  email: string;
  tenantId: string;
}) {
  const { admin, request, email, tenantId } = params;
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: getInviteRedirectTo(request, tenantId),
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
