import AdminContent from '../components/AdminContent';
import PlatformAdminGuard from '../components/PlatformAdminGuard';

export default function SecurityPage() {
  return (
    <PlatformAdminGuard>
      <AdminContent initialSection="security" />
    </PlatformAdminGuard>
  );
}
