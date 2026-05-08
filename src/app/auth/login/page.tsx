import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/auth/AuthForm';
import { getSupabaseUser } from '@/lib/supabase';

function getRouteForRole(role: string | null) {
  if (role === 'platform_admin' || role === 'platform_support') return '/admin';
  if (
    role &&
    [
      'tenant_owner',
      'clinic_admin',
      'receptionist',
      'physician',
      'nutritionist',
      'fitness_professional',
      'financial_user',
    ].includes(role)
  )
    return '/clinic/dashboard';
  if (role === 'patient' || role === 'guardian') return '/patient';
  return '/clinic/dashboard';
}

export default async function LoginPage() {
  const token = (await cookies()).get('sb-access-token')?.value;

  if (token) {
    const user = await getSupabaseUser(token);
    if (user) {
      redirect(getRouteForRole((user.app_metadata?.role as string | undefined) ?? null));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <AuthForm />
    </div>
  );
}
