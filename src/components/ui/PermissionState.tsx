import React from 'react';
import { ShieldOff } from 'lucide-react';
import { cx } from './utils';

interface PermissionStateProps {
  title?: string;
  description?: string;
  requiredPermission?: string;
  className?: string;
}

export default function PermissionState({
  title = 'Acesso restrito',
  description = 'Seu perfil nao possui permissao para visualizar esta area.',
  requiredPermission,
  className,
}: PermissionStateProps) {
  return (
    <section
      className={cx(
        'rounded-xl border border-warning-border bg-warning-bg p-5 text-warning-foreground',
        className
      )}
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning-foreground">
          <ShieldOff className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-warning-foreground">{description}</p>
          {requiredPermission ? (
            <p className="mt-2 text-xs font-semibold text-warning-foreground">
              Permissao minima: {requiredPermission}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
