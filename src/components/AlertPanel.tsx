import React from 'react';
import Link from 'next/link';
import { AlertTriangle, AlertCircle, Info, CheckCircle, X } from 'lucide-react';
import type { PatientAlert } from '@/domain/types';
import Icon from '@/components/ui/AppIcon';

const severityConfig = {
  critico: {
    icon: AlertCircle,
    classes: 'bg-red-50 border-red-200 text-red-700',
    iconClass: 'text-red-500',
  },
  alto: {
    icon: AlertTriangle,
    classes: 'bg-orange-50 border-orange-200 text-orange-700',
    iconClass: 'text-orange-500',
  },
  medio: {
    icon: AlertTriangle,
    classes: 'bg-amber-50 border-amber-200 text-amber-700',
    iconClass: 'text-amber-500',
  },
  baixo: {
    icon: Info,
    classes: 'bg-blue-50 border-blue-200 text-blue-700',
    iconClass: 'text-blue-500',
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
      <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
        <CheckCircle size={15} />
        <span className="font-medium">Nenhum alerta ativo</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
          >
            {href ? (
              <Link href={href} className="flex items-start gap-3 flex-1 min-w-0">
                {content}
              </Link>
            ) : (
              content
            )}
            {onResolve && (
              <button
                onClick={() => onResolve(alert.id)}
                className="flex-shrink-0 p-0.5 rounded hover:opacity-70 transition-opacity"
                title="Resolver alerta"
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
