export const PLAN_ENTITLEMENTS_VERSION = 1;

export type PlanModuleBadge = 'required' | 'sensitive' | 'provider' | 'beta';

export interface PlanModulePartDefinition {
  key: string;
  label: string;
  description: string;
  permissions?: string[];
  featureFlagKey?: string;
  badges?: PlanModuleBadge[];
  defaultEnabled?: boolean;
}

export interface PlanModuleDefinition {
  key: string;
  label: string;
  description: string;
  routePrefixes: string[];
  permissions: string[];
  required?: boolean;
  badges?: PlanModuleBadge[];
  parts: PlanModulePartDefinition[];
}

export interface PlanEntitlementModuleState {
  enabled: boolean;
  parts: Record<string, boolean>;
}

export interface PlanEntitlements {
  version: typeof PLAN_ENTITLEMENTS_VERSION;
  modules: Record<string, PlanEntitlementModuleState>;
}

export const PLAN_MODULE_CATALOG: PlanModuleDefinition[] = [
  {
    key: 'core',
    label: 'Core e dashboard',
    description: 'Sessao, dashboard inicial e acesso minimo ao workspace clinico.',
    routePrefixes: ['/clinic/dashboard'],
    permissions: [],
    required: true,
    badges: ['required'],
    parts: [],
  },
  {
    key: 'patients',
    label: 'Pacientes',
    description: 'Lista de pacientes, cadastro, Patient 360 e dados operacionais do paciente.',
    routePrefixes: ['/clinic/patients', '/paciente-360'],
    permissions: ['patients.read', 'patients.write'],
    parts: [
      {
        key: 'patients.patient360',
        label: 'Patient 360',
        description: 'Abas consolidadas de visao clinica e operacional do paciente.',
        permissions: ['patients.read'],
        featureFlagKey: 'patients.patient360',
      },
      {
        key: 'patients.timeline_sensitive',
        label: 'Timeline sensivel',
        description: 'Eventos sensiveis do historico do paciente.',
        permissions: ['timeline.sensitive.read'],
        featureFlagKey: 'patients.timeline_sensitive',
        badges: ['sensitive'],
      },
    ],
  },
  {
    key: 'patient_portal',
    label: 'Portal do paciente',
    description: 'Portal /patient usado por pacientes e responsaveis vinculados.',
    routePrefixes: ['/patient'],
    permissions: ['patient_portal.access'],
    badges: ['sensitive'],
    parts: [
      {
        key: 'patient_portal.daily',
        label: 'Diario do paciente',
        description: 'Rotina diaria, habitos e acoes do dia no portal.',
        featureFlagKey: 'patient_portal.daily',
      },
      {
        key: 'patient_portal.journey',
        label: 'Jornada e onboarding',
        description: 'Onboarding, etapas da jornada e revisoes pelo paciente.',
        featureFlagKey: 'patient_portal.journey',
      },
      {
        key: 'patient_portal.commercial',
        label: 'Beneficios e pacotes',
        description: 'Catalogo comercial e solicitacoes feitas pelo portal.',
        featureFlagKey: 'patient_portal.commercial',
      },
      {
        key: 'patient_portal.community',
        label: 'Comunidade',
        description: 'Conteudos e grupos visiveis para o paciente.',
        featureFlagKey: 'patient_portal.community',
        badges: ['beta'],
      },
      {
        key: 'patient_portal.documents',
        label: 'Documentos',
        description: 'Documentos liberados e links temporarios no portal.',
        featureFlagKey: 'patient_portal.documents',
        badges: ['sensitive'],
      },
      {
        key: 'patient_portal.financial',
        label: 'Financeiro',
        description: 'Cobrancas, faturas e comprovantes no portal.',
        featureFlagKey: 'patient_portal.financial',
        badges: ['sensitive'],
      },
      {
        key: 'patient_portal.chat',
        label: 'Chat',
        description: 'Mensagens do paciente para a equipe pelo portal.',
        featureFlagKey: 'patient_portal.chat',
      },
      {
        key: 'patient_portal.notifications',
        label: 'Notificacoes',
        description: 'Avisos e notificacoes exibidos no portal.',
        featureFlagKey: 'patient_portal.notifications',
      },
      {
        key: 'patient_portal.checkins',
        label: 'Check-ins',
        description: 'Check-ins e respostas estruturadas do paciente.',
        featureFlagKey: 'patient_portal.checkins',
      },
    ],
  },
  {
    key: 'clinical_records',
    label: 'Prontuario e atendimento',
    description: 'Consultas, SOAP, nutricao, prescricoes e evolucao clinica.',
    routePrefixes: [],
    permissions: [
      'encounters.read',
      'encounters.write',
      'soap.read',
      'soap.write',
      'nutrition.read',
      'nutrition.write',
      'prescriptions.read',
      'prescriptions.write',
    ],
    parts: [
      {
        key: 'clinical_records.soap',
        label: 'SOAP',
        description: 'Registro SOAP e evolucao de atendimento.',
        permissions: ['soap.read', 'soap.write'],
        featureFlagKey: 'clinical_records.soap',
      },
      {
        key: 'clinical_records.nutrition',
        label: 'Nutricao',
        description: 'Plano nutricional e registros de nutricao.',
        permissions: ['nutrition.read', 'nutrition.write'],
        featureFlagKey: 'clinical_records.nutrition',
      },
      {
        key: 'clinical_records.prescriptions',
        label: 'Prescricoes',
        description: 'Prescricoes medicas e orientacoes associadas.',
        permissions: ['prescriptions.read', 'prescriptions.write'],
        featureFlagKey: 'clinical_records.prescriptions',
        badges: ['sensitive'],
      },
    ],
  },
  {
    key: 'agenda',
    label: 'Agenda',
    description: 'Calendario, agendamentos e operacao de recepcao.',
    routePrefixes: ['/clinic/agenda'],
    permissions: ['agenda.read', 'agenda.write'],
    parts: [
      {
        key: 'agenda.appointments',
        label: 'Agendamentos',
        description: 'Criacao, leitura e remarcacao de consultas.',
        permissions: ['agenda.read', 'agenda.write'],
        featureFlagKey: 'agenda.appointments',
      },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    description: 'Funil comercial e acompanhamento de leads.',
    routePrefixes: ['/clinic/crm'],
    permissions: ['crm.read', 'crm.write'],
    parts: [
      {
        key: 'crm.pipeline',
        label: 'Pipeline',
        description: 'Etapas, oportunidades e movimentacao no funil.',
        permissions: ['crm.read', 'crm.write'],
        featureFlagKey: 'crm.pipeline',
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Estoque',
    description: 'Produtos, movimentacoes e alertas de estoque.',
    routePrefixes: ['/clinic/inventory'],
    permissions: ['inventory.read', 'inventory.write'],
    parts: [
      {
        key: 'inventory.movements',
        label: 'Movimentacoes',
        description: 'Entradas, saidas e ajustes de estoque.',
        permissions: ['inventory.read', 'inventory.write'],
        featureFlagKey: 'inventory.movements',
      },
    ],
  },
  {
    key: 'programs',
    label: 'Programas e pacotes',
    description: 'Programas, pacotes comerciais e builder de jornadas.',
    routePrefixes: ['/clinic/programs'],
    permissions: ['packages.read', 'packages.write'],
    parts: [
      {
        key: 'programs.builder',
        label: 'Builder de programas',
        description: 'Construcao de programas e jornadas completas.',
        permissions: ['packages.write'],
        featureFlagKey: 'programs.builder',
      },
    ],
  },
  {
    key: 'community',
    label: 'Comunidade',
    description: 'Recursos de comunidade e comunicacao com grupos.',
    routePrefixes: ['/clinic/community'],
    permissions: ['chat.read', 'notifications.read'],
    parts: [
      {
        key: 'community.groups',
        label: 'Grupos',
        description: 'Espacos comunitarios e grupos de acompanhamento.',
        permissions: ['chat.read'],
        featureFlagKey: 'community.groups',
        badges: ['beta'],
      },
    ],
  },
  {
    key: 'documents',
    label: 'Documentos',
    description: 'Modelos, documentos gerados, assinaturas e links curtos.',
    routePrefixes: ['/clinic/documents'],
    permissions: ['documents.read', 'documents.write'],
    parts: [
      {
        key: 'documents.templates',
        label: 'Modelos',
        description: 'Criacao e uso de modelos de documentos.',
        permissions: ['documents.read', 'documents.write'],
        featureFlagKey: 'documents.templates',
      },
      {
        key: 'documents.d4sign_send',
        label: 'Envio D4Sign',
        description: 'Permite preparar solicitacoes locais de assinatura D4Sign.',
        permissions: ['documents.write'],
        featureFlagKey: 'documents.d4sign_send',
        badges: ['provider'],
      },
      {
        key: 'documents.signed_urls',
        label: 'Signed URLs',
        description: 'Links temporarios e permissionados para documentos.',
        permissions: ['documents.read'],
        featureFlagKey: 'documents.signed_urls',
        badges: ['sensitive'],
      },
    ],
  },
  {
    key: 'financial',
    label: 'Financeiro',
    description: 'Financeiro da clinica, cobrancas locais e conciliacao.',
    routePrefixes: ['/clinic/financeiro'],
    permissions: ['financial.read', 'financial.write'],
    parts: [
      {
        key: 'financial.invoices',
        label: 'Faturas',
        description: 'Faturas, recebiveis e visao financeira local.',
        permissions: ['financial.read', 'financial.write'],
        featureFlagKey: 'financial.invoices',
      },
      {
        key: 'financial.mercadopago',
        label: 'Mercado Pago',
        description:
          'Estados e filas locais relacionadas ao Mercado Pago, sem provider call pela UI.',
        permissions: ['financial.write'],
        featureFlagKey: 'financial.mercadopago',
        badges: ['provider'],
      },
      {
        key: 'financial.asaas',
        label: 'Asaas legado',
        description: 'Estados e filas locais relacionadas ao Asaas legado durante a drenagem.',
        permissions: ['financial.write'],
        featureFlagKey: 'financial.asaas',
        badges: ['provider'],
      },
    ],
  },
  {
    key: 'reports',
    label: 'Relatorios',
    description: 'Relatorios operacionais e indicadores do tenant.',
    routePrefixes: ['/clinic/reports'],
    permissions: ['reports.read', 'reports.write'],
    parts: [
      {
        key: 'reports.exports',
        label: 'Exportacoes',
        description: 'Exportacoes redigidas e relatorios operacionais.',
        permissions: ['reports.read', 'reports.write'],
        featureFlagKey: 'reports.exports',
        badges: ['sensitive'],
      },
    ],
  },
  {
    key: 'communications',
    label: 'Inbox e comunicacoes',
    description: 'Inbox, chat e notificacoes operacionais.',
    routePrefixes: ['/clinic/inbox'],
    permissions: ['chat.read', 'chat.write', 'notifications.read', 'notifications.write'],
    parts: [
      {
        key: 'communications.chat',
        label: 'Chat',
        description: 'Conversas e threads operacionais.',
        permissions: ['chat.read', 'chat.write'],
        featureFlagKey: 'communications.chat',
      },
      {
        key: 'communications.notifications',
        label: 'Notificacoes',
        description: 'Notificacoes e central de avisos.',
        permissions: ['notifications.read', 'notifications.write'],
        featureFlagKey: 'communications.notifications',
      },
    ],
  },
  {
    key: 'settings',
    label: 'Configuracoes',
    description: 'Configuracoes essenciais do tenant, usuarios e RBAC local.',
    routePrefixes: ['/clinic/settings'],
    permissions: ['settings.read', 'settings.write'],
    required: true,
    badges: ['required', 'sensitive'],
    parts: [
      {
        key: 'settings.team',
        label: 'Equipe e permissoes',
        description: 'Usuarios, papeis e permissoes locais.',
        permissions: ['settings.read', 'settings.write'],
        featureFlagKey: 'settings.team',
        badges: ['sensitive'],
      },
    ],
  },
] as PlanModuleDefinition[];

const CATALOG_BY_KEY = new Map(PLAN_MODULE_CATALOG.map((module) => [module.key, module]));

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function moduleDefaultEnabled(module: PlanModuleDefinition, defaultEnabled: boolean) {
  return module.required ? true : defaultEnabled;
}

function partDefaultEnabled(
  part: PlanModulePartDefinition,
  moduleEnabled: boolean,
  defaultEnabled: boolean
) {
  if (!moduleEnabled) return false;
  if (part.defaultEnabled === false) return false;
  return defaultEnabled;
}

export function createDefaultPlanEntitlements(defaultEnabled = true): PlanEntitlements {
  const modules = PLAN_MODULE_CATALOG.reduce<Record<string, PlanEntitlementModuleState>>(
    (acc, planModule) => {
      const enabled = moduleDefaultEnabled(planModule, defaultEnabled);
      acc[planModule.key] = {
        enabled,
        parts: planModule.parts.reduce<Record<string, boolean>>((partAcc, part) => {
          partAcc[part.key] = partDefaultEnabled(part, enabled, defaultEnabled);
          return partAcc;
        }, {}),
      };
      return acc;
    },
    {}
  );

  return { version: PLAN_ENTITLEMENTS_VERSION, modules };
}

export function normalizePlanEntitlements(value: unknown, defaultEnabled = true): PlanEntitlements {
  const input = asRecord(value);
  const inputModules = asRecord(input.modules);
  const modules = PLAN_MODULE_CATALOG.reduce<Record<string, PlanEntitlementModuleState>>(
    (acc, planModule) => {
      const rawModule = asRecord(inputModules[planModule.key]);
      const rawParts = asRecord(rawModule.parts);
      const hasModuleEnabled = hasOwn(rawModule, 'enabled');
      const enabled = planModule.required
        ? true
        : hasModuleEnabled
          ? rawModule.enabled === true
          : moduleDefaultEnabled(planModule, defaultEnabled);

      acc[planModule.key] = {
        enabled,
        parts: planModule.parts.reduce<Record<string, boolean>>((partAcc, part) => {
          const hasPartEnabled = hasOwn(rawParts, part.key);
          partAcc[part.key] = enabled
            ? hasPartEnabled
              ? rawParts[part.key] === true
              : partDefaultEnabled(part, enabled, defaultEnabled)
            : false;
          return partAcc;
        }, {}),
      };

      return acc;
    },
    {}
  );

  return { version: PLAN_ENTITLEMENTS_VERSION, modules };
}

export function validatePlanEntitlementsInput(value: unknown): string[] {
  if (value === undefined || value === null) return [];

  const errors: string[] = [];
  const input = asRecord(value);
  const inputModules = asRecord(input.modules);

  for (const key of Object.keys(inputModules)) {
    const planModule = CATALOG_BY_KEY.get(key);
    if (!planModule) {
      errors.push(`Modulo desconhecido: ${key}.`);
      continue;
    }

    const rawModule = asRecord(inputModules[key]);
    const rawParts = asRecord(rawModule.parts);
    const allowedParts = new Set(planModule.parts.map((part) => part.key));

    if (planModule.required && rawModule.enabled === false) {
      errors.push(`Modulo obrigatorio nao pode ser desligado: ${planModule.label}.`);
    }

    for (const partKey of Object.keys(rawParts)) {
      if (!allowedParts.has(partKey)) {
        errors.push(`Parte desconhecida em ${planModule.label}: ${partKey}.`);
      }
      if (rawModule.enabled === false && rawParts[partKey] === true) {
        errors.push(`Parte ${partKey} nao pode ficar ativa com o modulo desligado.`);
      }
    }
  }

  return errors;
}

export function setPlanModuleEnabled(
  entitlements: PlanEntitlements,
  moduleKey: string,
  enabled: boolean
): PlanEntitlements {
  const planModule = CATALOG_BY_KEY.get(moduleKey);
  if (!planModule) return entitlements;

  const normalized = normalizePlanEntitlements(entitlements);
  const nextEnabled = planModule.required ? true : enabled;
  return {
    ...normalized,
    modules: {
      ...normalized.modules,
      [planModule.key]: {
        enabled: nextEnabled,
        parts: planModule.parts.reduce<Record<string, boolean>>((acc, part) => {
          const current = normalized.modules[planModule.key]?.parts?.[part.key];
          acc[part.key] = nextEnabled ? (current ?? part.defaultEnabled !== false) : false;
          return acc;
        }, {}),
      },
    },
  };
}

export function setPlanPartEnabled(
  entitlements: PlanEntitlements,
  moduleKey: string,
  partKey: string,
  enabled: boolean
): PlanEntitlements {
  const planModule = CATALOG_BY_KEY.get(moduleKey);
  if (!planModule || !planModule.parts.some((part) => part.key === partKey)) return entitlements;

  const normalized = normalizePlanEntitlements(entitlements);
  const moduleState = normalized.modules[moduleKey];
  if (!moduleState?.enabled) return normalized;

  return {
    ...normalized,
    modules: {
      ...normalized.modules,
      [moduleKey]: {
        ...moduleState,
        parts: {
          ...moduleState.parts,
          [partKey]: enabled,
        },
      },
    },
  };
}

export function countPlanEntitlements(entitlements: PlanEntitlements) {
  const normalized = normalizePlanEntitlements(entitlements);
  let enabledModules = 0;
  let enabledParts = 0;
  let providerParts = 0;
  let sensitiveParts = 0;

  for (const planModule of PLAN_MODULE_CATALOG) {
    const moduleState = normalized.modules[planModule.key];
    if (moduleState?.enabled) enabledModules += 1;
    for (const part of planModule.parts) {
      if (moduleState?.parts?.[part.key]) {
        enabledParts += 1;
        if (part.badges?.includes('provider')) providerParts += 1;
        if (part.badges?.includes('sensitive')) sensitiveParts += 1;
      }
    }
  }

  return {
    enabledModules,
    totalModules: PLAN_MODULE_CATALOG.length,
    enabledParts,
    providerParts,
    sensitiveParts,
  };
}

export function getManagedPermissionCodes() {
  return Array.from(
    new Set(
      PLAN_MODULE_CATALOG.flatMap((planModule) => [
        ...planModule.permissions,
        ...planModule.parts.flatMap((part) => part.permissions ?? []),
      ])
    )
  );
}

export function getAllowedPermissionCodes(entitlements: PlanEntitlements) {
  const normalized = normalizePlanEntitlements(entitlements);
  const permissions = new Set<string>();

  for (const planModule of PLAN_MODULE_CATALOG) {
    const moduleState = normalized.modules[planModule.key];
    if (!moduleState?.enabled) continue;
    planModule.permissions.forEach((permission) => permissions.add(permission));
    for (const part of planModule.parts) {
      if (moduleState.parts[part.key]) {
        part.permissions?.forEach((permission) => permissions.add(permission));
      }
    }
  }

  return Array.from(permissions);
}

export function getEntitlementFeatureFlags(entitlements: PlanEntitlements) {
  const normalized = normalizePlanEntitlements(entitlements);
  const flags: Record<string, boolean> = {};

  for (const planModule of PLAN_MODULE_CATALOG) {
    const moduleState = normalized.modules[planModule.key];
    for (const part of planModule.parts) {
      if (part.featureFlagKey) {
        flags[part.featureFlagKey] =
          moduleState?.enabled === true && moduleState.parts[part.key] === true;
      }
    }
  }

  return flags;
}

export function getPlanModuleForPath(pathname: string) {
  const normalizedPathname = pathname.split('?')[0] || '/';
  return (
    PLAN_MODULE_CATALOG.filter((planModule) => planModule.routePrefixes.length > 0)
      .flatMap((planModule) =>
        planModule.routePrefixes.map((routePrefix) => ({
          module: planModule,
          routePrefix,
        }))
      )
      .filter(
        ({ routePrefix }) =>
          normalizedPathname === routePrefix || normalizedPathname.startsWith(`${routePrefix}/`)
      )
      .sort((a, b) => b.routePrefix.length - a.routePrefix.length)[0]?.module ?? null
  );
}

export function getClinicModuleForPath(pathname: string) {
  return getPlanModuleForPath(pathname);
}

export function isPlanPathAllowed(
  pathname: string,
  entitlements: PlanEntitlements,
  permissions: readonly string[] = []
) {
  const planModule = getPlanModuleForPath(pathname);
  if (!planModule) return true;

  const normalized = normalizePlanEntitlements(entitlements);
  const moduleState = normalized.modules[planModule.key];
  if (!moduleState?.enabled) return false;
  if (!planModule.permissions.length) return true;
  if (!permissions.length) return true;

  const permissionSet = new Set(permissions);
  return planModule.permissions.some((permission) => permissionSet.has(permission));
}

export function isClinicPathAllowed(
  pathname: string,
  entitlements: PlanEntitlements,
  permissions: readonly string[] = []
) {
  return isPlanPathAllowed(pathname, entitlements, permissions);
}

export function isPlanModuleEnabled(entitlements: PlanEntitlements, moduleKey: string) {
  return normalizePlanEntitlements(entitlements).modules[moduleKey]?.enabled === true;
}

export function arePlanEntitlementsEqual(left: unknown, right: unknown) {
  return (
    JSON.stringify(normalizePlanEntitlements(left)) ===
    JSON.stringify(normalizePlanEntitlements(right))
  );
}
