import React from 'react';
import { cx } from './utils';

interface ActionBarProps {
  children: React.ReactNode;
  leading?: React.ReactNode;
  className?: string;
  sticky?: boolean;
}

export default function ActionBar({
  children,
  leading,
  className,
  sticky = false,
}: ActionBarProps) {
  return (
    <div
      className={cx(
        'flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between',
        sticky && 'sticky top-0 z-20 shadow-sm',
        className
      )}
    >
      {leading ? <div className="min-w-0 text-sm text-muted-foreground">{leading}</div> : null}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
