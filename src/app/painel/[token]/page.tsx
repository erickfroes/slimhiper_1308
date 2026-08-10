import CallPanelScreen from './CallPanelScreen';

export default async function CallPanelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CallPanelScreen publicToken={token} />;
}
