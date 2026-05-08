import AdminContent from './components/AdminContent';
import PlatformAdminGuard from './components/PlatformAdminGuard';

export default function AdminPage() {
  return (
    <PlatformAdminGuard backHref="/" backLabel="Voltar ao Dashboard">
      <AdminContent initialSection="overview" />
    </PlatformAdminGuard>
  );
}
