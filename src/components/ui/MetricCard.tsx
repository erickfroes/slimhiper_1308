import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './utils';

type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  tone?: MetricTone;
  action?: React.ReactNode;
  className?: string;
}

const toneClass: Record<MetricTone, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
};

export default function MetricCard({
  icon: Icon,
  label,
  value,
  description,
  tone = 'default',
  action,
  className,
}: MetricCardProps) {
  return (
    <article className={cx('rounded-lg border border-border bg-card p-4 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-3">
        <div
          className={cx('flex h-10 w-10 items-center justify-center rounded-lg', toneClass[tone])}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
      {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
    </article>
  );
}
