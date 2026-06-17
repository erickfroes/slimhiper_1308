import React from 'react';

export function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={['animate-pulse bg-muted rounded-md', className].join(' ')} />;
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={['card-base p-5 animate-pulse', className].join(' ')}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-muted rounded w-2/3" />
          <div className="h-2 bg-muted rounded w-1/2" />
        </div>
      </div>
      <div className="h-8 bg-muted rounded w-3/4 mb-2" />
      <div className="h-2 bg-muted rounded w-2/3" />
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => {
        const width = i === 0 ? 'w-24' : i === 1 ? 'w-16' : i === 7 ? 'w-20' : 'w-full';
        return (
          <td key={`skel-cell-${i}`} className="px-4 py-3">
            <div className={['h-3 bg-muted rounded', width].join(' ')} />
          </td>
        );
      })}
    </tr>
  );
}

export default function LoadingSkeleton() {
  return (
    <div
      className="space-y-4 animate-pulse"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="h-8 bg-muted rounded-xl w-1/3 sm:w-1/4" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={`skel-card-${i}`} />
        ))}
      </div>
      <div className="card-base h-64 animate-pulse bg-muted/40 p-5" />
    </div>
  );
}
