import { redirect } from 'next/navigation';
import AuthForm from '@/components/auth/AuthForm';
import { getCurrentUserContext } from '@/lib/auth/getCurrentUserContext';

export default async function LoginPage() {
  const context = await getCurrentUserContext();

  if (context) {
    if (context.canAccessPlatformAdmin) redirect('/admin');
    if (
      context.canAccessClinicWorkspace &&
      context.memberships.some((membership) => membership.status === 'active')
    ) {
      redirect('/clinic/dashboard');
    }
    if (context.canAccessPatientPortal) redirect('/patient');
    redirect('/clinic/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <AuthForm />
    </div>
  );
}
