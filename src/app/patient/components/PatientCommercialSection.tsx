'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  MessageSquare,
  PackageCheck,
  RefreshCw,
  Send,
  UsersRound,
} from 'lucide-react';

import DataState from '@/components/ui/DataState';
import SectionPanel from '@/components/ui/SectionPanel';
import type { PatientPortalSnapshot } from '@/services/patientPortalApi';
import { getPatientCommercialData, requestPatientUpgrade } from '@/services/commercialApi';
import type { PatientCommercialContext, PatientCommercialPackage } from '@/domain/types';

interface PatientCommercialSectionProps {
  snapshot: PatientPortalSnapshot;
  onActionMessage: (message: string | null) => void;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    solicitado: 'Solicitado',
    cotado: 'Cotado',
    aprovado: 'Aprovado',
    rejeitado: 'Rejeitado',
    cancelado: 'Cancelado',
    cobranca_pendente: 'Cobranca pendente',
    concluido: 'Concluido',
  };
  return labels[status] ?? status;
}

function packageHighlights(pkg: PatientCommercialPackage) {
  const items = [
    pkg.communityAccess ? 'Comunidade' : null,
    pkg.priorityChat ? 'Chat prioritario' : null,
    ...pkg.benefits.slice(0, 4),
  ].filter((item): item is string => Boolean(item));
  return items.length ? items : ['Beneficios definidos pela clinica'];
}

export default function PatientCommercialSection({
  snapshot,
  onActionMessage,
}: PatientCommercialSectionProps) {
  const [context, setContext] = useState<PatientCommercialContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPackageId, setBusyPackageId] = useState<string | null>(null);

  const loadCommercial = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await getPatientCommercialData(snapshot.selectedPatientId);
    if (response.error || !response.data) {
      setContext(null);
      setError(response.error?.message ?? 'Nao foi possivel carregar beneficios.');
    } else {
      setContext(response.data);
    }
    setLoading(false);
  }, [snapshot.selectedPatientId]);

  useEffect(() => {
    void loadCommercial();
  }, [loadCommercial]);

  const pendingTargetIds = useMemo(
    () =>
      new Set(
        context?.upgradeRequests
          .filter((request) =>
            ['solicitado', 'cotado', 'cobranca_pendente'].includes(request.status)
          )
          .map((request) => request.targetPackageId) ?? []
      ),
    [context?.upgradeRequests]
  );

  async function handleRequestUpgrade(pkg: PatientCommercialPackage) {
    if (busyPackageId) return;
    setBusyPackageId(pkg.id);
    onActionMessage(null);
    const response = await requestPatientUpgrade({
      patientId: snapshot.selectedPatientId,
      targetPackageId: pkg.id,
      reason: `Solicitacao pelo portal para ${pkg.name}`,
    });
    if (response.error) {
      onActionMessage(response.error.message);
    } else {
      onActionMessage('Solicitacao enviada para a equipe comercial.');
      await loadCommercial();
    }
    setBusyPackageId(null);
  }

  if (loading) {
    return (
      <DataState
        kind="loading"
        title="Carregando beneficios"
        description="Buscando pacote ativo e opcoes liberadas para este vinculo."
      />
    );
  }

  if (error || !context) {
    return (
      <DataState
        kind="error"
        title="Beneficios indisponiveis"
        description={error ?? 'Nao encontramos contexto comercial para este vinculo.'}
        actionLabel="Tentar novamente"
        onAction={() => void loadCommercial()}
      />
    );
  }

  const activePackage = context.activePackage;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Beneficios e planos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare seu pacote atual com opcoes liberadas pela clinica.
          </p>
        </div>
        <button type="button" className="btn-secondary w-fit" onClick={() => void loadCommercial()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Atualizar
        </button>
      </div>

      {activePackage ? (
        <SectionPanel
          title="Pacote atual"
          description={activePackage.programName ?? 'Programa ativo'}
          contentClassName="space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={PackageCheck} label="Pacote" value={activePackage.name} />
            <Metric
              icon={CreditCard}
              label="Valor base"
              value={formatCurrency(activePackage.priceCents)}
            />
            <Metric
              icon={CheckCircle2}
              label="Semana"
              value={String(activePackage.currentWeek ?? 0)}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Beneficios
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {packageHighlights(activePackage).map((benefit) => (
                  <span
                    key={benefit}
                    className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                  >
                    {benefit}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Servicos incluidos
              </p>
              <div className="mt-2 space-y-1">
                {activePackage.services.slice(0, 5).map((service) => (
                  <div
                    key={`${service.serviceName}-${service.unit}`}
                    className="text-sm text-foreground"
                  >
                    {service.quantity}x {service.serviceName}{' '}
                    <span className="text-muted-foreground">{service.unit}</span>
                  </div>
                ))}
                {activePackage.services.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Servicos definidos pela equipe.</p>
                ) : null}
              </div>
            </div>
          </div>
        </SectionPanel>
      ) : (
        <DataState
          kind="empty"
          title="Sem pacote ativo"
          description="Quando a clinica vincular um pacote, seus beneficios aparecem aqui."
        />
      )}

      <SectionPanel
        title="Opcoes de upgrade"
        description="Solicitacoes entram em analise e a equipe define a cotacao final."
      >
        {context.upgradeOptions.length === 0 ? (
          <DataState
            kind="empty"
            title="Nenhum upgrade disponivel"
            description="Novas opcoes aparecem quando forem liberadas para seu programa."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {context.upgradeOptions.map((pkg) => {
              const pending = pendingTargetIds.has(pkg.id);
              return (
                <article key={pkg.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">{pkg.name}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {pkg.description || 'Pacote comercial da clinica.'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold text-foreground">
                        {formatCurrency(pkg.priceCents)}
                      </p>
                      <p className="text-xs text-muted-foreground">{pkg.durationWeeks} sem.</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Metric
                      icon={UsersRound}
                      label="Comunidade"
                      value={pkg.communityAccess ? 'Liberada' : 'Nao'}
                    />
                    <Metric
                      icon={MessageSquare}
                      label="Chat"
                      value={pkg.priorityChat ? 'Prioritario' : 'Padrao'}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {packageHighlights(pkg).map((benefit) => (
                      <span
                        key={benefit}
                        className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                      >
                        {benefit}
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn-primary mt-4 w-full justify-center"
                    disabled={pending || busyPackageId === pkg.id}
                    onClick={() => void handleRequestUpgrade(pkg)}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {pending
                      ? 'Solicitado'
                      : busyPackageId === pkg.id
                        ? 'Enviando...'
                        : 'Solicitar upgrade'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </SectionPanel>

      <SectionPanel title="Historico de upgrades">
        {context.upgradeRequests.length === 0 ? (
          <DataState
            kind="empty"
            title="Sem solicitacoes"
            description="Suas solicitacoes comerciais recentes aparecem aqui."
          />
        ) : (
          <div className="space-y-2">
            {context.upgradeRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {request.targetPackageName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {statusLabel(request.status)}
                    {request.quoteAmountCents
                      ? ` - ${formatCurrency(request.quoteAmountCents)}`
                      : ''}
                  </p>
                </div>
                {request.invoiceStatus ? (
                  <span className="w-fit rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                    Cobranca {request.invoiceStatus}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden={true} />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-semibold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}
