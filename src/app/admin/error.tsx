'use client';
import { SystemError } from '@/components/ui';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SystemError
      title="Admin indisponível"
      description="A consulta administrativa falhou antes da tela ficar pronta."
      reference={error.digest}
      actionLabel="Recarregar"
      onRetry={reset}
    />
  );
}
