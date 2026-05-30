import { NextResponse } from 'next/server';
import { getCurrentAppSession } from '@/services/session/getCurrentAppSession';
import { canAccessPlatformAdminFromSession } from '@/lib/auth/canAccessPlatformAdmin';

export async function GET() {
  const session = await getCurrentAppSession();

  if (!session) {
    return NextResponse?.json({ authenticated: false, canAccessPlatformAdmin: false });
  }

  return NextResponse?.json({
    authenticated: true,
    platformRole: session?.platformRole,
    permissions: session?.permissions,
    canAccessPlatformAdmin: canAccessPlatformAdminFromSession(session),
  });
}
