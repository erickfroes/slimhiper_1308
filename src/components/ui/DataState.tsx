import React from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { cx } from './utils';

type DataStateKind = 'loading' | 'empty' | 'error' | 'forbidden' | 'degraded';

interface DataStateProps {
  kind: DataStateKind;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const iconByKind = {
  loading: Loader2,
  empty: Inbox,
  error: AlertTriangle,
  forbidden: ShieldAlert,
  degraded: AlertTriangle,
};

export default function DataState({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: DataStateProps) {
  const Icon = iconByKind[kind];

  return (
    <section
      className={cx(
        'flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center',
        className
      )}
      aria-live={kind === 'loading' ? 'polite' : undefined}
    >
      <div
        className={cx(
          'mb-3 flex h-10 w-10 items-center justify-center rounded-lg',
          kind === 'error'
            ? 'bg-red-50 text-red-600'
            : kind === 'forbidden'
              ? 'bg-slate-100 text-slate-600'
              : kind === 'degraded'
                ? 'bg-amber-50 text-amber-600'
                : 'bg-primary/10 text-primary'
        )}
      >
        <Icon className={cx('h-5 w-5', kind === 'loading' && 'animate-spin')} aria-hidden="true" />
      </div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="btn-secondary mt-4"
          disabled={kind === 'loading'}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
