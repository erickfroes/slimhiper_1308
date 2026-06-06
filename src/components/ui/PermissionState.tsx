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
        'rounded-lg border border-amber-200 bg-amber-50/70 p-5 text-amber-950',
        className
      )}
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <ShieldOff className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-amber-900">{description}</p>
          {requiredPermission ? (
            <p className="mt-2 text-xs font-semibold text-amber-900">
              Permissao minima: {requiredPermission}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
