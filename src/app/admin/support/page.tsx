import AdminContent from '../components/AdminContent';
import PlatformAdminGuard from '../components/PlatformAdminGuard';

export default function SupportPage() {
  return (
    <PlatformAdminGuard>
      <AdminContent initialSection="support" />
    </PlatformAdminGuard>
  );
}
