import WebhookMonitorContent from './components/WebhookMonitorContent';

export const metadata = {
  title: 'Monitor de Webhooks | Admin',
  description: 'Monitoramento de eventos de webhook do Asaas e D4Sign',
};

export default function WebhooksPage() {
  return (
      <WebhookMonitorContent />
  );
}
