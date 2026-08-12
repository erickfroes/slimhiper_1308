'use client';
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal, X } from 'lucide-react';
import { cx } from './utils';

export function Card({ children, className }: React.PropsWithChildren<{ className?: string }>) {
  return <article className={cx('card-base', className)}>{children}</article>;
}
export function Panel({ children, className }: React.PropsWithChildren<{ className?: string }>) {
  return <section className={cx('surface-panel border', className)}>{children}</section>;
}
export { default as StatCard } from './MetricCard';
export { DataTable as Table, DataTable as DataGrid } from './DataTable';
export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav aria-label="Paginação" className="flex min-h-11 items-center justify-end gap-2 text-sm">
      <button
        type="button"
        className="btn-ghost min-h-11 min-w-11 justify-center p-2"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="tabular-nums text-muted-foreground">
        {page} de {pageCount}
      </span>
      <button
        type="button"
        className="btn-ghost min-h-11 min-w-11 justify-center p-2"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        aria-label="Próxima página"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
export function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <a
                className="rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={item.href}
              >
                {item.label}
              </a>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function Dropdown({ label, children }: React.PropsWithChildren<{ label: React.ReactNode }>) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className="btn-secondary min-h-11"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-40 rounded-xl border border-border bg-card p-1 card-shadow-md">
          {children}
        </div>
      ) : null}
    </div>
  );
}
export function Popover({
  trigger,
  children,
}: React.PropsWithChildren<{ trigger: React.ReactNode }>) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="dialog"
          className="absolute z-40 mt-2 rounded-xl border border-border bg-card p-3 card-shadow-md"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
export function Tooltip({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-48 -translate-x-1/2 rounded-lg bg-brand-ink px-2 py-1 text-xs text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
export function Drawer({
  open,
  title,
  children,
  onOpenChange,
}: React.PropsWithChildren<{
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
}>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex bg-overlay">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Fechar"
        onClick={() => onOpenChange(false)}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative ml-auto flex h-full w-full max-w-md flex-col bg-card card-shadow-md"
      >
        <header className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">{title}</h2>
          <button
            type="button"
            className="btn-ghost min-h-11 min-w-11 justify-center p-2"
            aria-label="Fechar"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}
