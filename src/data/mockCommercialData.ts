import type {
  CommercialPackage,
  CommercialProgramOption,
  CommercialService,
  PatientCommercialContext,
  UpgradeRequest,
} from '@/domain/types';

export const mockCommercialServices: CommercialService[] = [
  {
    id: 'mock-service-medical',
    name: 'Consulta medica de acompanhamento',
    category: 'clinico',
    description: 'Consulta de evolucao, ajuste de conduta e revisao de exames.',
    status: 'ativo',
    basePriceCents: 28000,
    durationMinutes: 45,
    unit: 'sessao',
    deliveryMode: 'hibrido',
    packagesCount: 2,
    createdAt: '2026-06-01T12:00:00Z',
    updatedAt: '2026-06-06T12:00:00Z',
  },
  {
    id: 'mock-service-nutrition',
    name: 'Sessao de nutricao',
    category: 'nutricao',
    description: 'Plano alimentar, ajustes semanais e revisao de adesao.',
    status: 'ativo',
    basePriceCents: 18000,
    durationMinutes: 40,
    unit: 'sessao',
    deliveryMode: 'online',
    packagesCount: 2,
    createdAt: '2026-06-01T12:00:00Z',
    updatedAt: '2026-06-06T12:00:00Z',
  },
  {
    id: 'mock-service-bioimpedance',
    name: 'Bioimpedancia',
    category: 'exame',
    description: 'Avaliacao de composicao corporal com registro evolutivo.',
    status: 'ativo',
    basePriceCents: 9000,
    durationMinutes: 20,
    unit: 'avaliacao',
    deliveryMode: 'presencial',
    packagesCount: 1,
    createdAt: '2026-06-01T12:00:00Z',
    updatedAt: '2026-06-06T12:00:00Z',
  },
];

export const mockCommercialPrograms: CommercialProgramOption[] = [
  {
    id: 'prog-001',
    name: 'Emagrecimento 12 Semanas',
    status: 'ativo',
    programType: 'emagrecimento',
  },
  {
    id: 'prog-002',
    name: 'Hipertrofia 16 Semanas',
    status: 'ativo',
    programType: 'hipertrofia',
  },
];

export const mockCommercialPackages: CommercialPackage[] = [
  {
    id: 'mock-package-core',
    name: 'Core Metabolico',
    description: 'Pacote operacional para acompanhamento mensal com check-ins e plano digital.',
    status: 'ativo',
    priceCents: 129000,
    durationWeeks: 12,
    renewalPolicy: 'manual',
    communityAccess: false,
    priorityChat: false,
    benefits: ['Plano alimentar digital', 'Check-in semanal', 'Dashboard de progresso'],
    usageLimits: [
      { label: 'Consultas medicas', value: '3 sessoes' },
      { label: 'Nutricionistas', value: '4 sessoes' },
    ],
    services: [
      {
        serviceId: 'mock-service-medical',
        serviceName: 'Consulta medica de acompanhamento',
        category: 'clinico',
        quantity: 3,
        unit: 'sessao',
        limitPerPeriod: 1,
        position: 1,
      },
      {
        serviceId: 'mock-service-nutrition',
        serviceName: 'Sessao de nutricao',
        category: 'nutricao',
        quantity: 4,
        unit: 'sessao',
        limitPerPeriod: 2,
        position: 2,
      },
    ],
    programLinks: [
      {
        programId: 'prog-001',
        programName: 'Emagrecimento 12 Semanas',
        isDefault: true,
        status: 'ativo',
      },
    ],
    activePatients: 18,
    createdAt: '2026-06-01T12:00:00Z',
    updatedAt: '2026-06-06T12:00:00Z',
  },
  {
    id: 'mock-package-plus',
    name: 'Plus Intensivo',
    description: 'Mais sessoes, comunidade liberada e chat priorizado para fases intensivas.',
    status: 'ativo',
    priceCents: 189000,
    durationWeeks: 12,
    renewalPolicy: 'manual',
    communityAccess: true,
    priorityChat: true,
    benefits: [
      'Comunidade do programa',
      'Chat prioritario',
      'Bioimpedancia mensal',
      'Revisao quinzenal de metas',
    ],
    usageLimits: [
      { label: 'Consultas medicas', value: '4 sessoes' },
      { label: 'Bioimpedancia', value: '3 avaliacoes' },
    ],
    services: [
      {
        serviceId: 'mock-service-medical',
        serviceName: 'Consulta medica de acompanhamento',
        category: 'clinico',
        quantity: 4,
        unit: 'sessao',
        limitPerPeriod: 2,
        position: 1,
      },
      {
        serviceId: 'mock-service-bioimpedance',
        serviceName: 'Bioimpedancia',
        category: 'exame',
        quantity: 3,
        unit: 'avaliacao',
        limitPerPeriod: 1,
        position: 2,
      },
    ],
    programLinks: [
      {
        programId: 'prog-001',
        programName: 'Emagrecimento 12 Semanas',
        isDefault: false,
        status: 'ativo',
      },
      {
        programId: 'prog-002',
        programName: 'Hipertrofia 16 Semanas',
        isDefault: true,
        status: 'ativo',
      },
    ],
    activePatients: 9,
    createdAt: '2026-06-01T12:00:00Z',
    updatedAt: '2026-06-06T12:00:00Z',
  },
];

export const mockUpgradeRequests: UpgradeRequest[] = [
  {
    id: 'mock-upgrade-001',
    patientId: 'patient-001',
    patientName: 'Juliana Pereira',
    enrollmentId: 'mock-enrollment-001',
    currentPackageId: 'mock-package-core',
    currentPackageName: 'Core Metabolico',
    targetPackageId: 'mock-package-plus',
    targetPackageName: 'Plus Intensivo',
    status: 'cotado',
    requestedByRole: 'patient',
    reason: 'Quer acesso a comunidade e bioimpedancia mensal.',
    quoteAmountCents: 59000,
    quoteCurrency: 'BRL',
    quoteNotes: 'Upgrade proporcional ao ciclo atual.',
    quoteDueDate: '2026-06-15',
    invoiceStatus: null,
    createdAt: '2026-06-06T12:00:00Z',
    updatedAt: '2026-06-06T14:00:00Z',
  },
];

export const mockClinicCommercialCatalog = {
  services: mockCommercialServices,
  packages: mockCommercialPackages,
  programs: mockCommercialPrograms,
  upgradeRequests: mockUpgradeRequests,
  summary: {
    services: mockCommercialServices.filter((service) => service.status === 'ativo').length,
    packages: mockCommercialPackages.filter((pkg) => pkg.status === 'ativo').length,
    upgradesOpen: mockUpgradeRequests.filter((request) =>
      ['solicitado', 'cotado', 'cobranca_pendente'].includes(request.status)
    ).length,
    upgradeRevenuePendingCents: mockUpgradeRequests.reduce(
      (sum, request) => sum + (request.quoteAmountCents ?? 0),
      0
    ),
  },
  lastCheckedAt: '2026-06-06T14:00:00Z',
};

export const mockPatientCommercialData: PatientCommercialContext = {
  selectedPatientId: 'patient-001',
  activeEnrollmentId: 'mock-enrollment-001',
  activePackage: {
    ...mockCommercialPackages[0],
    programName: 'Emagrecimento 12 Semanas',
    currentWeek: 5,
    status: 'ativo',
  },
  upgradeOptions: [mockCommercialPackages[1]],
  upgradeRequests: mockUpgradeRequests.map((request) => ({
    id: request.id,
    targetPackageId: request.targetPackageId,
    targetPackageName: request.targetPackageName,
    status: request.status,
    reason: request.reason,
    quoteAmountCents: request.quoteAmountCents,
    quoteCurrency: request.quoteCurrency,
    quoteNotes: request.quoteNotes,
    quoteDueDate: request.quoteDueDate,
    invoiceStatus: request.invoiceStatus,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  })),
  lastCheckedAt: '2026-06-06T14:00:00Z',
};
