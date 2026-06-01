import ObservabilityDashboardContent from './components/ObservabilityDashboardContent';

export const metadata = {
  title: 'Observabilidade | Admin',
  description: 'Dashboard operacional de disponibilidade, alertas e smokes por ambiente.',
};

export default function ObservabilityPage() {
  return <ObservabilityDashboardContent />;
}
