'use client';
import { SystemError } from '@/components/ui';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SystemError
      title="Falha inesperada"
      description="Tente novamente. Se o erro continuar, use a referência para investigar nos logs."
      reference={error.digest}
      onRetry={reset}
    />
  );
}
