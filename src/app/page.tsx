import type { Metadata } from 'next';
import MarketingHome from '@/components/marketing/MarketingHome';

export const metadata: Metadata = {
  title: 'SlimHiper Clinic OS — Sistema operacional para clínicas',
  description:
    'Site institucional do SlimHiper Clinic OS para clínicas de transformação corporal com pacientes, programas, agenda, documentos, financeiro e portal do paciente.',
};

export default function RootPage() {
  return <MarketingHome />;
}
