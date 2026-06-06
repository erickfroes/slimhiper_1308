import React from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { cx } from './utils';

export type SortDirection = 'asc' | 'desc';

interface DataTableProps {
  children: React.ReactNode;
  className?: string;
  minWidthClassName?: string;
}

interface SortableColumnHeaderProps<T extends string> {
  label: string;
  sortKey: T;
  currentKey: T | null;
  currentDir: SortDirection;
  onSort: (key: T) => void;
  className?: string;
}

export function DataTable({
  children,
  className,
  minWidthClassName = 'min-w-full',
}: DataTableProps) {
  return (
    <div
      className={cx(
        'overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin',
        className
      )}
    >
      <table className={cx('w-full border-collapse text-sm', minWidthClassName)}>{children}</table>
    </div>
  );
}

export function SortableColumnHeader<T extends string>({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  className,
}: SortableColumnHeaderProps<T>) {
  const active = currentKey === sortKey;
  const ariaSort = active ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th scope="col" aria-sort={ariaSort} className={cx('px-4 py-3 text-left', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cx(
          'inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors',
          active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {label}
        <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </th>
  );
}
