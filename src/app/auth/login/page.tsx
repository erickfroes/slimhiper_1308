import { redirect } from 'next/navigation';
import AuthForm from '@/components/auth/AuthForm';
import AuthLayout from '@/components/auth/AuthLayout';
import { getCurrentUserContext } from '@/lib/auth/getCurrentUserContext';

export default async function LoginPage() {
  const context = await getCurrentUserContext();

  if (context) {
    if (context?.canAccessPlatformAdmin) redirect('/admin');
    if (
      context?.canAccessClinicWorkspace &&
      context?.memberships?.some((membership) => membership?.status === 'active')
    ) {
      redirect('/clinic/dashboard');
    }
    if (context?.canAccessPatientPortal) redirect('/patient');
    redirect('/no-workspace');
  }

  return (
    <AuthLayout>
      <AuthForm />
    </AuthLayout>
  );
}
