import AdminContent from '../components/AdminContent';
import PlatformAdminGuard from '../components/PlatformAdminGuard';

export default function IntegrationsPage() {
  return (
    <PlatformAdminGuard>
      <AdminContent initialSection="integrations" />
    </PlatformAdminGuard>
  );
}
