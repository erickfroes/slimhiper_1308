import React from 'react';
import { AlertCircle, CheckCircle2, Info, ShieldAlert, TriangleAlert } from 'lucide-react';
import { cx } from './utils';

type FeedbackTone = 'success' | 'warning' | 'danger' | 'info' | 'restricted';
const feedback = {
  success: {
    icon: CheckCircle2,
    classes: 'border-positive-border bg-positive-bg text-positive-foreground',
  },
  warning: {
    icon: TriangleAlert,
    classes: 'border-warning-border bg-warning-bg text-warning-foreground',
  },
  danger: {
    icon: AlertCircle,
    classes: 'border-negative-border bg-negative-bg text-negative-foreground',
  },
  info: { icon: Info, classes: 'border-info-border bg-info-bg text-info-foreground' },
  restricted: {
    icon: ShieldAlert,
    classes: 'border-warning-border bg-warning-bg text-warning-foreground',
  },
} as const;
export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: FeedbackTone;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = feedback[tone].icon;
  return (
    <section
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('flex gap-3 rounded-xl border p-4 text-sm', feedback[tone].classes, className)}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 opacity-90">{children}</div> : null}
      </div>
    </section>
  );
}
export const ErrorState = (props: Omit<React.ComponentProps<typeof Alert>, 'tone'>) => (
  <Alert tone="danger" {...props} />
);
export const RestrictedState = (props: Omit<React.ComponentProps<typeof Alert>, 'tone'>) => (
  <Alert tone="restricted" {...props} />
);
export function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando"
      className={cx('animate-pulse rounded-lg bg-surface-strong', className)}
    />
  );
}
