'use client';

import React from 'react';
import { cx } from './utils';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
  badge?: React.ReactNode;
}

interface TabsProps<T extends string> {
  items: Array<TabItem<T>>;
  value: T;
  onValueChange: (value: T) => void;
  label: string;
  className?: string;
}

export default function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  label,
  className,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx(
        'flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 card-shadow scrollbar-thin',
        className
      )}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            onClick={() => onValueChange(item.id)}
            className={cx(
              'inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition',
              selected
                ? 'bg-selected text-brand-deep'
                : 'text-muted-foreground hover:bg-hover hover:text-foreground',
              item.disabled &&
                'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground'
            )}
          >
            {item.label}
            {item.badge ? item.badge : null}
          </button>
        );
      })}
    </div>
  );
}
