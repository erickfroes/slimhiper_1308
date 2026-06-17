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

const kindTone = {
  loading: {
    iconBg: 'bg-primary/15',
    iconText: 'text-primary',
  },
  empty: {
    iconBg: 'bg-muted',
    iconText: 'text-muted-foreground',
  },
  error: {
    iconBg: 'bg-negative-bg',
    iconText: 'text-negative',
  },
  forbidden: {
    iconBg: 'bg-muted',
    iconText: 'text-muted-foreground',
  },
  degraded: {
    iconBg: 'bg-warning-bg',
    iconText: 'text-warning',
  },
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
  const tone = kindTone[kind];
  const isLoading = kind === 'loading';

  return (
    <section
      className={cx(
        'mx-auto flex w-full max-w-3xl flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center',
        className
      )}
      aria-live={kind === 'loading' ? 'polite' : kind === 'error' ? 'assertive' : undefined}
      aria-busy={isLoading ? 'true' : undefined}
      role={isLoading ? 'status' : kind === 'error' ? 'alert' : 'status'}
    >
      <div
        className={cx(
          'mb-3 flex h-10 w-10 items-center justify-center rounded-lg',
          tone.iconBg,
          tone.iconText
        )}
      >
        <Icon className={cx('h-5 w-5', kind === 'loading' && 'animate-spin')} aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          aria-label={actionLabel}
          onClick={onAction}
          className={cx(
            'btn-secondary mt-4 inline-flex items-center gap-1',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isLoading ? 'cursor-not-allowed disabled:opacity-55' : ''
          )}
          disabled={isLoading}
          aria-disabled={isLoading ? 'true' : undefined}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
