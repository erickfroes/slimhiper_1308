'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Patient360Summary } from '@/domain/types';
import TabResumo from './tabs/TabResumo';
import TabEvolucao from './tabs/TabEvolucao';
import TabTimeline from './tabs/TabTimeline';
import TabProntuario from './tabs/TabProntuario';
import TabConsultas from './tabs/TabConsultas';
import TabNutricao from './tabs/TabNutricao';
import TabPrescricoes from './tabs/TabPrescricoes';
import TabDocumentos from './tabs/TabDocumentos';
import TabFinanceiro from './tabs/TabFinanceiro';
import TabPacotes from './tabs/TabPacotes';
import TabChat from './tabs/TabChat';
import TabRelatorios from './tabs/TabRelatorios';
import type { UserContext } from '@/lib/auth/getCurrentUserContext';
import { ShieldOff } from 'lucide-react';

const TABS = [
  { key: 'tab-resumo', label: 'Resumo', id: 'resumo' },
  { key: 'tab-evolucao', label: 'Evolucao', id: 'evolucao' },
  { key: 'tab-timeline', label: 'Timeline', id: 'timeline' },
  { key: 'tab-prontuario', label: 'Prontuario', id: 'prontuario' },
  { key: 'tab-consultas', label: 'Consultas', id: 'consultas' },
  { key: 'tab-nutricao', label: 'Nutrição', id: 'nutricao' },
  { key: 'tab-prescricoes', label: 'Prescrições', id: 'prescricoes' },
  { key: 'tab-documentos', label: 'Documentos', id: 'documentos' },
  { key: 'tab-financeiro', label: 'Financeiro', id: 'financeiro' },
  { key: 'tab-pacotes', label: 'Pacotes', id: 'pacotes' },
  { key: 'tab-chat', label: 'Chat', id: 'chat' },
  { key: 'tab-relatorios', label: 'Relatórios', id: 'relatorios' },
] as const;

type Patient360TabId = (typeof TABS)[number]['id'];

const TAB_IDS = new Set<string>(TABS.map((tab) => tab.id));

const TAB_PERMISSION_RULES: Partial<
  Record<Patient360TabId, { permissions: string[]; description: string }>
> = {
  consultas: {
    permissions: ['agenda.read', 'agenda.write', 'appointments.read', 'appointments.write'],
    description: 'agenda.read',
  },
  nutricao: {
    permissions: ['nutrition.read', 'nutrition.write'],
    description: 'nutrition.read',
  },
  prescricoes: {
    permissions: ['prescriptions.read', 'prescriptions.write'],
    description: 'prescriptions.read',
  },
  documentos: {
    permissions: ['documents.read', 'documents.write'],
    description: 'documents.read',
  },
  financeiro: {
    permissions: ['financial.read', 'financial.write'],
    description: 'financial.read',
  },
  pacotes: {
    permissions: ['packages.read', 'packages.write'],
    description: 'packages.read',
  },
  chat: {
    permissions: ['chat.read', 'chat.write'],
    description: 'chat.read',
  },
  relatorios: {
    permissions: ['reports.read', 'reports.write'],
    description: 'reports.read',
  },
  prontuario: {
    permissions: ['encounters.read', 'soap.read'],
    description: 'encounters.read ou soap.read',
  },
  evolucao: {
    permissions: ['progress_photos.read'],
    description: 'progress_photos.read',
  },
};

const ROLE_TAB_ACCESS: Record<string, Patient360TabId[]> = {
  physician: ['prontuario', 'consultas', 'prescricoes'],
  nutritionist: ['prontuario', 'nutricao'],
  fitness_professional: ['nutricao'],
};

function isPatient360TabId(value: string | null): value is Patient360TabId {
  return Boolean(value && TAB_IDS.has(value));
}

function hasAnyPermission(permissions: string[], expected: string[]) {
  const permissionSet = new Set(permissions);
  return expected.some((permission) => permissionSet.has(permission));
}

function hasRoleBasedAccess(tabId: Patient360TabId, userContext: UserContext | null): boolean {
  const activeRoles = (userContext?.activeTenantRoles ?? []).map((role) => role.toLowerCase());
  const roleSet = new Set(activeRoles);
  const allowedFromRole = Array.from(roleSet).some((role) =>
    (ROLE_TAB_ACCESS[role] ?? []).includes(tabId)
  );
  return (
    allowedFromRole ||
    roleSet.has('tenant_owner') ||
    roleSet.has('clinic_admin') ||
    roleSet.has('platform_admin')
  );
}

function canAccessTab(tabId: Patient360TabId, userContext: UserContext | null) {
  const rule = TAB_PERMISSION_RULES[tabId];
  if (!rule) return true;
  if (hasRoleBasedAccess(tabId, userContext)) return true;
  return hasAnyPermission(userContext?.permissions ?? [], rule.permissions);
}

function TabForbidden({
  label,
  requiredPermission,
}: {
  label: string;
  requiredPermission: string;
}) {
  return (
    <div className="card-base p-6 flex items-start gap-3 border-amber-200 bg-amber-50/40">
      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
        <ShieldOff size={18} className="text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-amber-900">Acesso restrito a esta aba</p>
        <p className="text-xs text-amber-800 mt-1">
          Seu perfil nao possui permissao para visualizar {label}. Permissao minima:{' '}
          <span className="font-semibold">{requiredPermission}</span>.
        </p>
      </div>
    </div>
  );
}

interface Patient360TabsProps {
  data: Patient360Summary;
  patientId: string;
  userContext: UserContext | null;
}

export default function Patient360Tabs({ data, patientId, userContext }: Patient360TabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<Patient360TabId>(
    isPatient360TabId(requestedTab) ? requestedTab : 'resumo'
  );
  const unreadCount = data.chat?.unreadCount ?? 0;
  const activeTabConfig = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const activeTabRule = TAB_PERMISSION_RULES[activeTab];
  const isActiveTabForbidden = !canAccessTab(activeTab, userContext);

  useEffect(() => {
    if (isPatient360TabId(requestedTab) && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
    }
    if (!requestedTab && activeTab !== 'resumo') {
      setActiveTab('resumo');
    }
  }, [activeTab, requestedTab]);

  const handleTabChange = useCallback(
    (tabId: Patient360TabId) => {
      if (!canAccessTab(tabId, userContext)) return;
      setActiveTab(tabId);
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tabId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, userContext]
  );

  return (
    <div>
      {/* Tab nav */}
      <div
        role="tablist"
        aria-label="Abas do Paciente 360"
        className="mb-5 flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 card-shadow scrollbar-thin"
      >
        {TABS.map((tab) => {
          const tabAllowed = canAccessTab(tab.id, userContext);
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-disabled={!tabAllowed}
              disabled={!tabAllowed}
              title={
                tabAllowed
                  ? undefined
                  : `Requer ${TAB_PERMISSION_RULES[tab.id]?.description ?? 'permissao'}`
              }
              onClick={() => handleTabChange(tab.id)}
              className={[
                'flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeTab === tab.id
                  ? 'bg-selected text-brand-deep'
                  : 'text-muted-foreground hover:bg-hover hover:text-foreground',
                !tabAllowed
                  ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground'
                  : '',
              ].join(' ')}
            >
              {tab.label}
              {tab.id === 'chat' && unreadCount > 0 && (
                <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 leading-none font-semibold">
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="fade-in">
        {isActiveTabForbidden && activeTabRule && (
          <TabForbidden
            label={activeTabConfig.label.toLowerCase()}
            requiredPermission={activeTabRule.description}
          />
        )}
        {activeTab === 'resumo' && (
          <TabResumo
            data={data}
            canViewDocuments={canAccessTab('documentos', userContext)}
            canViewFinancial={userContext?.canViewFinancial ?? false}
            canViewChat={canAccessTab('chat', userContext)}
          />
        )}
        {!isActiveTabForbidden && activeTab === 'timeline' && (
          <TabTimeline events={data.recentTimeline} patientId={data.profile.id} />
        )}
        {!isActiveTabForbidden && activeTab === 'evolucao' && (
          <TabEvolucao
            patientId={patientId}
            goalWeightKg={data.clinicalStatus.goalWeightKg}
            permissions={userContext?.permissions ?? []}
          />
        )}
        {!isActiveTabForbidden && activeTab === 'prontuario' && (
          <TabProntuario
            patientId={patientId}
            data={data}
            permissions={userContext?.permissions ?? []}
          />
        )}
        {!isActiveTabForbidden && activeTab === 'consultas' && (
          <TabConsultas patientId={patientId} initialAppointments={data.upcomingAppointments} />
        )}
        {!isActiveTabForbidden && activeTab === 'nutricao' && (
          <TabNutricao patientId={patientId} initialPlan={data.nutritionPlan} />
        )}
        {!isActiveTabForbidden && activeTab === 'prescricoes' && (
          <TabPrescricoes
            patientId={patientId}
            prescriptions={data.prescriptions}
            canViewMedicalPrescriptions={userContext?.canViewMedicalPrescriptions ?? false}
          />
        )}
        {!isActiveTabForbidden && activeTab === 'documentos' && (
          <TabDocumentos patientId={patientId} />
        )}
        {!isActiveTabForbidden && activeTab === 'financeiro' && (
          <TabFinanceiro
            patientId={patientId}
            financial={data.financial}
            canViewFinancial={userContext?.canViewFinancial ?? false}
            currentRole={userContext?.activeTenantRole ?? null}
            permissions={userContext?.permissions ?? []}
          />
        )}
        {!isActiveTabForbidden && activeTab === 'pacotes' && (
          <TabPacotes pkg={data.activePackage} />
        )}
        {!isActiveTabForbidden && activeTab === 'chat' && (
          <TabChat
            patientId={patientId}
            chat={data.chat}
            patientName={data.profile.name?.trim() || 'Paciente sem nome'}
            canWriteChat={userContext?.permissions?.includes('chat.write') ?? false}
          />
        )}
        {!isActiveTabForbidden && activeTab === 'relatorios' && (
          <TabRelatorios patientId={patientId} patientName={data.profile.name} />
        )}
      </div>
    </div>
  );
}
