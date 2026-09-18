import { getAppOrigin } from '@/lib/security/origin';

export function getInviteRedirectTo(request: Request, tenantId?: string, invitationToken?: string) {
  void request;
  const origin = getAppOrigin();
  const url = new URL('/auth/accept-invite', origin);
  if (tenantId) url.searchParams.set('tenantId', tenantId);
  if (invitationToken) url.searchParams.set('inviteToken', invitationToken);
  return url.toString();
}
