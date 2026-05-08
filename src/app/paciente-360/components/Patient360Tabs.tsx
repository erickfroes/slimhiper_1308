'use client';

import React, { useState } from 'react';
import type { Patient360Summary } from '@/domain/types';
import TabResumo from './tabs/TabResumo';
import TabTimeline from './tabs/TabTimeline';
import TabConsultas from './tabs/TabConsultas';
import TabNutricao from './tabs/TabNutricao';
import TabPrescricoes from './tabs/TabPrescricoes';
import TabDocumentos from './tabs/TabDocumentos';
import TabFinanceiro from './tabs/TabFinanceiro';
import TabPacotes from './tabs/TabPacotes';
import TabChat from './tabs/TabChat';
import TabRelatorios from './tabs/TabRelatorios';
import type { UserContext } from '@/lib/auth/getCurrentUserContext';

const TABS = [
  { key: 'tab-resumo', label: 'Resumo', id: 'resumo' },
  { key: 'tab-timeline', label: 'Timeline', id: 'timeline' },
  { key: 'tab-consultas', label: 'Consultas', id: 'consultas' },
  { key: 'tab-nutricao', label: 'Nutrição', id: 'nutricao' },
  { key: 'tab-prescricoes', label: 'Prescrições', id: 'prescricoes' },
  { key: 'tab-documentos', label: 'Documentos', id: 'documentos' },
  { key: 'tab-financeiro', label: 'Financeiro', id: 'financeiro' },
  { key: 'tab-pacotes', label: 'Pacotes', id: 'pacotes' },
  { key: 'tab-chat', label: 'Chat', id: 'chat', badge: 2 },
  { key: 'tab-relatorios', label: 'Relatórios', id: 'relatorios' },
];

interface Patient360TabsProps {
  data: Patient360Summary;
  patientId: string;
  userContext: UserContext | null;
}

export default function Patient360Tabs({ data, patientId, userContext }: Patient360TabsProps) {
  const [activeTab, setActiveTab] = useState('resumo');

  return (
    <div>
      {/* Tab nav */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin pb-1 mb-5 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap transition-all duration-150 border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted',
            ].join(' ')}
          >
            {tab.label}
            {tab.badge && tab.badge > 0 && (
              <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 leading-none font-semibold">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="fade-in">
        {activeTab === 'resumo' && <TabResumo data={data} />}
        {activeTab === 'timeline' && <TabTimeline events={data.recentTimeline} patientId={data.profile.id} />}
        {activeTab === 'consultas' && <TabConsultas appointments={data.upcomingAppointments} />}
        {activeTab === 'nutricao' && <TabNutricao plan={data.nutritionPlan} />}
        {activeTab === 'prescricoes' && (
          <TabPrescricoes
            prescriptions={data.prescriptions}
            canViewMedicalPrescriptions={userContext?.canViewMedicalPrescriptions ?? false}
            currentRole={userContext?.activeTenantRole ?? null}
          />
        )}
        {activeTab === 'documentos' && <TabDocumentos patientId={patientId} />}
        {activeTab === 'financeiro' && (
          <TabFinanceiro
            financial={data.financial}
            canViewFinancial={userContext?.canViewFinancial ?? false}
            currentRole={userContext?.activeTenantRole ?? null}
          />
        )}
        {activeTab === 'pacotes' && <TabPacotes pkg={data.activePackage} />}
        {activeTab === 'chat' && <TabChat chat={data.chat} patientName={data.profile.name?.trim() || 'Paciente sem nome'} />}
        {activeTab === 'relatorios' && <TabRelatorios patientName={data.profile.name} />}
      </div>
    </div>
  );
}
