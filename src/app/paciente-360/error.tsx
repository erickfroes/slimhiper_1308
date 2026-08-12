'use client';
import { SystemError } from '@/components/ui';

export default function Patient360Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SystemError
      title="Paciente 360 indisponível"
      description="A consulta do paciente falhou antes da tela ficar pronta."
      reference={error.digest}
      actionLabel="Recarregar"
      onRetry={reset}
    />
  );
}
