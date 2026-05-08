import TenantDetailContent from './components/TenantDetailContent';
import PlatformAdminGuard from '../../components/PlatformAdminGuard';

export default function TenantDetailPage() {
  return (
    <PlatformAdminGuard backHref="/admin/tenants" backLabel="Voltar aos Tenants">
      <TenantDetailContent />
    </PlatformAdminGuard>
  );
}
