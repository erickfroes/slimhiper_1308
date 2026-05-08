import TenantsManagementContent from './components/TenantsManagementContent';
import PlatformAdminGuard from '../components/PlatformAdminGuard';

export default function AdminTenantsPage() {
  return (
    <PlatformAdminGuard backHref="/admin" backLabel="Voltar ao Admin">
      <TenantsManagementContent />
    </PlatformAdminGuard>
  );
}
