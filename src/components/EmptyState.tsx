import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <section
      className={`mx-auto flex w-full max-w-2xl flex-col items-center justify-center text-center rounded-lg border border-dashed border-border bg-card px-6 py-12 ${className ?? ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon size={24} className="text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </section>
  );
}
