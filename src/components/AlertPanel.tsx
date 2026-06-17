import React from 'react';
import Link from 'next/link';
import { AlertTriangle, AlertCircle, Info, CheckCircle, X } from 'lucide-react';
import type { PatientAlert } from '@/domain/types';

const severityConfig = {
  critico: {
    icon: AlertCircle,
    classes: 'bg-negative/10 border-negative/30 text-negative',
    iconClass: 'text-negative',
  },
  alto: {
    icon: AlertTriangle,
    classes: 'bg-warning/10 border-warning/30 text-warning',
    iconClass: 'text-warning',
  },
  medio: {
    icon: AlertTriangle,
    classes: 'bg-warning/10 border-warning/30 text-warning',
    iconClass: 'text-warning',
  },
  baixo: {
    icon: Info,
    classes: 'bg-info/10 border-info/30 text-info',
    iconClass: 'text-info',
  },
};

interface AlertPanelProps {
  alerts: PatientAlert[];
  onResolve?: (alertId: string) => void;
  compact?: boolean;
  getAlertHref?: (alert: PatientAlert) => string;
}

export default function AlertPanel({
  alerts,
  onResolve,
  compact = false,
  getAlertHref,
}: AlertPanelProps) {
  const activeAlerts = alerts.filter((a) => !a.isResolved);

  if (activeAlerts.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border border-positive/30 bg-positive/10 p-3 text-sm text-positive"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <CheckCircle size={15} />
        <span className="font-medium">Nenhum alerta ativo</span>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label="Alertas ativos">
      {activeAlerts.map((alert) => {
        const { icon: Icon, classes, iconClass } = severityConfig[alert.severity];
        const href = getAlertHref?.(alert);
        const content = (
          <>
            <Icon size={15} className={['flex-shrink-0 mt-0.5', iconClass].join(' ')} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-snug">{alert.title}</p>
              {!compact && (
                <p className="text-xs mt-0.5 opacity-80 leading-relaxed">{alert.description}</p>
              )}
            </div>
          </>
        );

        return (
          <div
            key={alert.id}
            className={['flex items-start gap-3 p-3 rounded-xl border', classes].join(' ')}
            role="listitem"
          >
            {href ? (
              <Link
                href={href}
                className="flex items-start gap-3 flex-1 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {content}
              </Link>
            ) : (
              content
            )}
            {onResolve && (
              <button
                onClick={() => onResolve(alert.id)}
                type="button"
                className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground transition-all duration-150 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                title="Resolver alerta"
                aria-label={`Resolver alerta ${alert.title}`}
              >
                <X size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
