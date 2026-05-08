import AdminContent from '../components/AdminContent';
import PlatformAdminGuard from '../components/PlatformAdminGuard';

export default function BillingPage() {
  return (
    <PlatformAdminGuard>
      <AdminContent initialSection="financial" />
    </PlatformAdminGuard>
  );
}
