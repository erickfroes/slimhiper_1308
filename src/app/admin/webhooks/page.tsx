import WebhookMonitorContent from './components/WebhookMonitorContent';

export const metadata = {
  title: 'Monitor de Webhooks | Admin',
  description: 'Monitoramento de eventos de webhook dos provedores',
};

export default function WebhooksPage() {
  return <WebhookMonitorContent />;
}
