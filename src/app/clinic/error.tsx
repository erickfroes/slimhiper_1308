'use client';
import { SystemError } from '@/components/ui';

export default function ClinicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SystemError
      title="Workspace clínico indisponível"
      description="A sessão ou os dados clínicos falharam durante o carregamento."
      reference={error.digest}
      onRetry={reset}
    />
  );
}
