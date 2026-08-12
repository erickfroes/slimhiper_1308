import React from 'react';
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { cx } from './utils';
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'restricted';
const tones: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface-subtle text-muted-foreground',
  success: 'border-positive-border bg-positive-bg text-positive-foreground',
  warning: 'border-warning-border bg-warning-bg text-warning-foreground',
  danger: 'border-negative-border bg-negative-bg text-negative-foreground',
  info: 'border-info-border bg-info-bg text-info-foreground',
  restricted: 'border-warning-border bg-warning-bg text-warning-foreground',
};
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
export function StatusBadge({
  tone = 'neutral',
  label,
  dot = true,
}: {
  tone?: BadgeTone;
  label: string;
  dot?: boolean;
}) {
  return (
    <Badge tone={tone}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {label}
    </Badge>
  );
}
export function ClinicalRiskBadge({
  level,
  label,
}: {
  level: 'low' | 'medium' | 'high' | 'critical';
  label?: string;
}) {
  const config = {
    low: [Info, 'info'] as const,
    medium: [AlertTriangle, 'warning'] as const,
    high: [AlertTriangle, 'danger'] as const,
    critical: [XCircle, 'danger'] as const,
  }[level];
  const Icon = config[0];
  return (
    <Badge tone={config[1]}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label ?? level}
    </Badge>
  );
}
