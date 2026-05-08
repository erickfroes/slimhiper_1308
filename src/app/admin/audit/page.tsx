import AdminContent from '../components/AdminContent';
import PlatformAdminGuard from '../components/PlatformAdminGuard';

export default function AuditPage() {
  return (
    <PlatformAdminGuard>
      <AdminContent initialSection="audit" />
    </PlatformAdminGuard>
  );
}
