'use client';

import React, { useState } from 'react';
import type {
  PatientPackageSummary,
  PatientPackageHistoryItem,
  PatientPackageEntitlement,
  PatientPackageServiceUsage,
  PatientPackageLimit,
  PatientPackageCheckin,
} from '@/domain/types';
import {
  Package,
  Calendar,
  CheckCircle2,
  Clock,
  MessageCircle,
  Smartphone,
  Users,
  FileText,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  RefreshCw,
  XCircle,
  Settings,
  ScrollText,
  DollarSign,
  AlertTriangle,
  History,
  BarChart3,
  Activity,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';

interface TabPacotesProps {
  pkg?: PatientPackageSummary | null;
}

function StatusBadge({
  status,
}: {
  status: 'ativo' | 'concluido' | 'cancelado' | 'pausado' | 'aguardando';
}) {
  const map: Record<string, { label: string; className: string }> = {
    ativo: { label: 'Ativo', className: 'bg-emerald-100 text-emerald-700' },
    concluido: { label: 'Concluído', className: 'bg-blue-100 text-blue-700' },
    cancelado: { label: 'Cancelado', className: 'bg-red-100 text-red-700' },
    pausado: { label: 'Pausado', className: 'bg-amber-100 text-amber-700' },
    aguardando: { label: 'Aguardando', className: 'bg-gray-100 text-gray-600' },
  };
  const { label, className } = map[status] ?? map['aguardando'];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function EntitlementRow({
  icon,
  label,
  enabled,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2.5 text-sm text-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      {enabled ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <CheckCircle2 size={13} />
          Liberado
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          <XCircle size={13} />
          Bloqueado
        </span>
      )}
    </div>
  );
}

const ENTITLEMENT_ICONS: Record<string, React.ReactNode> = {
  chat: <MessageCircle size={14} />,
  comunidade: <Users size={14} />,
  documentos: <FileText size={14} />,
  app: <Smartphone size={14} />,
};

const CHECKIN_STATUS: Record<
  PatientPackageCheckin['status'],
  { label: string; className: string }
> = {
  scheduled: { label: 'Agendado', className: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Enviado', className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Concluido', className: 'bg-emerald-100 text-emerald-700' },
  overdue: { label: 'Atrasado', className: 'bg-red-100 text-red-700' },
  canceled: { label: 'Cancelado', className: 'bg-gray-100 text-gray-500' },
};

export default function TabPacotes({ pkg }: TabPacotesProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!pkg) {
    return (
      <div className="card-base p-5">
        <EmptyState icon={Package} title="Pacote indisponível" description="Sem pacote ativo" />
      </div>
    );
  }

  const hasActivePackage =
    pkg.programName !== 'Sem pacote ativo' ||
    pkg.totalWeeks > 0 ||
    pkg.totalConsultations > 0 ||
    pkg.totalNutritionSessions > 0;

  if (!hasActivePackage) {
    return (
      <div className="card-base p-5">
        <EmptyState
          icon={Package}
          title="Sem pacote ativo"
          description="Nenhum enrollment de programa foi retornado para este paciente."
        />
      </div>
    );
  }

  const progressPercent =
    pkg.totalWeeks > 0 ? Math.round((pkg.currentWeek / pkg.totalWeeks) * 100) : 0;

  const packageHistory: PatientPackageHistoryItem[] = pkg.packageHistory ?? [];
  const packageEntitlements: PatientPackageEntitlement[] = pkg.packageEntitlements ?? [];
  const serviceUsage: PatientPackageServiceUsage[] = pkg.serviceUsage ?? [
    {
      label: 'Consultas',
      used: pkg.usedConsultations,
      total: pkg.totalConsultations,
      color: 'bg-teal-500',
      bgColor: 'bg-teal-50 text-teal-700',
    },
    {
      label: 'Sessões de Nutrição',
      used: pkg.usedNutritionSessions,
      total: pkg.totalNutritionSessions,
      color: 'bg-emerald-500',
      bgColor: 'bg-emerald-50 text-emerald-700',
    },
  ];
  const packageLimits: PatientPackageLimit[] = pkg.packageLimits ?? [];
  const checkins: PatientPackageCheckin[] = pkg.checkins ?? [];

  const actions = [
    {
      key: 'vender',
      label: 'Vender novo pacote',
      icon: <ShoppingCart size={14} />,
      variant: 'primary',
    },
    {
      key: 'renovar',
      label: 'Renovar pacote',
      icon: <RefreshCw size={14} />,
      variant: 'secondary',
    },
    {
      key: 'cancelar',
      label: 'Cancelar pacote',
      icon: <XCircle size={14} />,
      variant: 'danger',
    },
    {
      key: 'editar',
      label: 'Editar acesso',
      icon: <Settings size={14} />,
      variant: 'secondary',
    },
    {
      key: 'contrato',
      label: 'Ver contrato',
      icon: <ScrollText size={14} />,
      variant: 'secondary',
    },
    {
      key: 'financeiro',
      label: 'Ver financeiro',
      icon: <DollarSign size={14} />,
      variant: 'secondary',
    },
  ];

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-teal-600" />
          <p className="text-sm font-semibold text-foreground">Pacotes do Paciente</p>
        </div>
        <StatusBadge status={pkg.status} />
      </div>

      {/* ── Active Package Card ── */}
      <div className="card-base p-5 border-l-4 border-l-teal-500">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-foreground">{pkg.programName}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Activity size={12} />
              Semana {pkg.currentWeek} de {pkg.totalWeeks}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-teal-50 text-teal-700 px-3 py-1.5 rounded-full text-xs font-semibold">
            <BarChart3 size={13} />
            {progressPercent}% concluído
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Semana {pkg.currentWeek}</span>
            <span>Semana {pkg.totalWeeks}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-teal-500 h-2.5 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar size={13} className="text-teal-500 shrink-0" />
            <div>
              <p className="text-foreground font-medium">Data de início</p>
              <p>{new Date(pkg.startDate).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock size={13} className="text-amber-500 shrink-0" />
            <div>
              <p className="text-foreground font-medium">Data final</p>
              <p>{new Date(pkg.endDate).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Services ── */}
      <div className="card-base p-5">
        <p className="text-sm font-semibold text-foreground mb-4">Serviços do Pacote</p>
        <div className="space-y-4">
          {serviceUsage.map((svc) => {
            const pct = svc.total > 0 ? Math.round((svc.used / svc.total) * 100) : 0;
            const remaining = Math.max(0, svc.total - svc.used);
            return (
              <div key={svc.label}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-foreground">{svc.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${svc.bgColor}`}>
                      {svc.used}/{svc.total} usadas
                    </span>
                    <span className="text-muted-foreground">{remaining} restantes</span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`${svc.color} h-2 rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary row */}
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Incluídos</p>
            <p className="text-sm font-bold text-foreground">
              {serviceUsage.reduce((a, s) => a + s.total, 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Utilizados</p>
            <p className="text-sm font-bold text-teal-600">
              {serviceUsage.reduce((a, s) => a + s.used, 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Restantes</p>
            <p className="text-sm font-bold text-amber-600">
              {serviceUsage.reduce((a, s) => a + (s.total - s.used), 0)}
            </p>
          </div>
        </div>
      </div>

      {/* ── App Entitlements ── */}
      {packageEntitlements.length > 0 && (
        <div className="card-base p-5">
          <p className="text-sm font-semibold text-foreground mb-1">Entitlements do App</p>
          <p className="text-xs text-muted-foreground mb-3">
            Funcionalidades liberadas para o paciente
          </p>
          <div>
            {packageEntitlements.map((ent) => (
              <EntitlementRow
                key={ent.key}
                icon={ENTITLEMENT_ICONS[ent.key] ?? <FileText size={14} />}
                label={ent.label}
                enabled={ent.enabled}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Package Limits ── */}
      {packageLimits.length > 0 && (
        <div className="card-base p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-amber-500" />
            <p className="text-sm font-semibold text-foreground">Limites do Pacote</p>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            {packageLimits.map((limit, idx) => (
              <div
                key={limit.label}
                className={`flex justify-between py-1.5 ${idx < packageLimits.length - 1 ? 'border-b border-border' : ''}`}
              >
                <span>{limit.label}</span>
                <span className="font-medium text-foreground">{limit.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Package History ── */}
      <div className="card-base p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Check-ins da Jornada</p>
            <p className="text-xs text-muted-foreground">
              Eventos gerados pelo enrollment do programa.
            </p>
          </div>
          <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
            {checkins.length}
          </span>
        </div>
        {checkins.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum check-in foi retornado para este enrollment.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {checkins.slice(0, 6).map((checkin) => {
              const status = CHECKIN_STATUS[checkin.status] ?? CHECKIN_STATUS.scheduled;
              return (
                <div key={checkin.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{checkin.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(checkin.dueDate).toLocaleDateString('pt-BR')}
                      {checkin.channel ? ` - ${checkin.channel}` : ''}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card-base overflow-hidden">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <History size={14} className="text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Histórico de Pacotes</p>
            <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
              {packageHistory.length}
            </span>
          </div>
          {historyOpen ? (
            <ChevronUp size={15} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={15} className="text-muted-foreground" />
          )}
        </button>

        {historyOpen && (
          <div className="border-t border-border divide-y divide-border">
            {packageHistory.map((h) => (
              <div key={h.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{h.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(h.startDate).toLocaleDateString('pt-BR')} →{' '}
                    {new Date(h.endDate).toLocaleDateString('pt-BR')} · {h.totalWeeks} semanas
                  </p>
                  {h.reason && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">{h.reason}</p>
                  )}
                </div>
                <StatusBadge status={h.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Renewal / Cancellation ── */}
      <div className="card-base p-5">
        <p className="text-sm font-semibold text-foreground mb-1">Renovação / Cancelamento</p>
        <p className="text-xs text-muted-foreground mb-4">
          O pacote atual vence em{' '}
          <span className="font-semibold text-foreground">
            {new Date(pkg.endDate).toLocaleDateString('pt-BR')}
          </span>
          . Renove antes do vencimento para manter o acesso do paciente.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            title="Acao bloqueada ate contrato real de renovacao de pacote."
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold transition-colors cursor-not-allowed opacity-55"
          >
            <RefreshCw size={13} />
            Renovar pacote
          </button>
          <button
            type="button"
            disabled
            title="Acao bloqueada ate contrato real de cancelamento de pacote."
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-semibold transition-colors cursor-not-allowed opacity-55"
          >
            <XCircle size={13} />
            Cancelar pacote
          </button>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="card-base p-5">
        <p className="text-sm font-semibold text-foreground mb-3">Ações</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {actions.map((action) => {
            const isPrimary = action.variant === 'primary';
            const isDanger = action.variant === 'danger';
            const baseClass =
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors justify-center';
            const variantClass = isPrimary
              ? 'bg-teal-600 hover:bg-teal-700 text-white'
              : isDanger
                ? 'border border-red-300 text-red-600 hover:bg-red-50'
                : 'border border-border text-foreground hover:bg-muted/60';
            return (
              <button
                key={action.key}
                type="button"
                disabled
                title="Acao bloqueada ate contrato real de pacotes."
                className={`${baseClass} ${variantClass} cursor-not-allowed opacity-55`}
              >
                {action.icon}
                {action.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
