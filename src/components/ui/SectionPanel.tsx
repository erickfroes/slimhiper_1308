import React from 'react';
import { cx } from './utils';

interface SectionPanelProps {
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export default function SectionPanel({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: SectionPanelProps) {
  return (
    <section className={cx('rounded-lg border border-border bg-card shadow-sm', className)}>
      {(title || description || actions) && (
        <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-foreground">{title}</h2> : null}
            {description ? (
              <div className="mt-1 text-sm text-muted-foreground">{description}</div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      )}
      <div className={cx('p-4', contentClassName)}>{children}</div>
    </section>
  );
}
