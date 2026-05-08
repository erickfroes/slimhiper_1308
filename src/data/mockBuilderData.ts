// Centralized mock data for Program Builder
// Backend integration point: replace with Supabase/API calls

import type {
  BuilderStep,
  ProgramBuilderDraft,
  ProgramBuilderTeamMember,
  ProgramBuilderCheckinTemplate,
} from '@/domain/types';

// ─── STEPPER STEPS ────────────────────────────────────────────────────────────

export const BUILDER_STEPS: BuilderStep[] = [
  {
    key: 'dados_gerais',
    label: 'Dados gerais',
    description: 'Nome, objetivo, duração e tipo do programa',
  },
  { key: 'fases', label: 'Fases', description: 'Estrutura de fases e cronograma' },
  { key: 'servicos', label: 'Serviços incluídos', description: 'Consultas, sessões e avaliações' },
  {
    key: 'entitlements',
    label: 'Entitlements do app',
    description: 'Funcionalidades liberadas no app do paciente',
  },
  { key: 'checkins', label: 'Check-ins', description: 'Frequência e templates de check-in' },
  { key: 'documentos', label: 'Documentos', description: 'Documentos obrigatórios e opcionais' },
  { key: 'financeiro', label: 'Financeiro', description: 'Modelo de pagamento e precificação' },
  { key: 'equipe', label: 'Equipe', description: 'Profissionais responsáveis pelo programa' },
  { key: 'revisao', label: 'Revisão', description: 'Revisão final antes de publicar' },
];

// ─── MOCK TEAM MEMBERS ────────────────────────────────────────────────────────

export const mockBuilderTeamMembers: ProgramBuilderTeamMember[] = [
  { id: 'tm-001', name: 'Dra. Fernanda Lima', role: 'Médica', specialty: 'Endocrinologia' },
  {
    id: 'tm-002',
    name: 'Nutr. Carlos Mendes',
    role: 'Nutricionista',
    specialty: 'Nutrição Clínica',
  },
  { id: 'tm-003', name: 'Dr. Rafael Souza', role: 'Médico', specialty: 'Clínica Geral' },
  {
    id: 'tm-004',
    name: 'Nutr. Beatriz Alves',
    role: 'Nutricionista',
    specialty: 'Nutrição Esportiva',
  },
  {
    id: 'tm-005',
    name: 'Coord. Ana Souza',
    role: 'Coordenadora',
    specialty: 'Gestão de Programas',
  },
  {
    id: 'tm-006',
    name: 'Psic. Mariana Costa',
    role: 'Psicóloga',
    specialty: 'Comportamento Alimentar',
  },
];

// ─── MOCK CHECKIN TEMPLATES ───────────────────────────────────────────────────

export const mockCheckinTemplates: ProgramBuilderCheckinTemplate[] = [
  {
    id: 'ci-001',
    label: 'Check-in Semanal Padrão',
    frequency: 'Semanal',
    channel: 'app',
    questions: [
      'Como você avalia sua adesão ao plano alimentar esta semana?',
      'Realizou todas as atividades físicas planejadas?',
      'Como está seu nível de energia e disposição?',
      'Teve alguma dificuldade ou sintoma relevante?',
    ],
  },
  {
    id: 'ci-002',
    label: 'Check-in Quinzenal Avançado',
    frequency: 'Quinzenal',
    channel: 'app',
    questions: [
      'Qual foi seu peso ao acordar hoje?',
      'Como avalia sua qualidade de sono nas últimas 2 semanas?',
      'Nível de estresse (1-10)?',
      'Houve alguma situação que dificultou o programa?',
      'Tem dúvidas para a equipe?',
    ],
  },
  {
    id: 'ci-003',
    label: 'Check-in Mensal de Progresso',
    frequency: 'Mensal',
    channel: 'whatsapp',
    questions: [
      'Como você avalia seu progresso geral no programa?',
      'Quais metas foram atingidas este mês?',
      'O que pode melhorar no próximo mês?',
    ],
  },
];

// ─── INITIAL BUILDER DRAFT ────────────────────────────────────────────────────

export const initialBuilderDraft: ProgramBuilderDraft = {
  name: '',
  programType: '',
  objective: '',
  durationWeeks: 12,
  color: 'teal',
  status: 'rascunho',
  phases: [
    {
      name: 'Fase 1 — Avaliação',
      durationWeeks: 2,
      description: 'Avaliação inicial, exames e definição de metas.',
    },
    {
      name: 'Fase 2 — Intervenção',
      durationWeeks: 8,
      description: 'Protocolo principal com acompanhamento intensivo.',
    },
    {
      name: 'Fase 3 — Consolidação',
      durationWeeks: 2,
      description: 'Revisão de resultados e planejamento de manutenção.',
    },
  ],
  includedServices: [
    { label: 'Consultas médicas', quantity: 4, unit: 'sessões' },
    { label: 'Sessões de nutrição', quantity: 4, unit: 'sessões' },
    { label: 'Bioimpedância', quantity: 2, unit: 'avaliações' },
  ],
  appEntitlements: [
    { key: 'chat', label: 'Chat com equipe', enabled: true },
    { key: 'plano_alimentar', label: 'Plano alimentar digital', enabled: true },
    { key: 'checkin', label: 'Check-in semanal', enabled: true },
    { key: 'comunidade', label: 'Comunidade', enabled: false },
    { key: 'receitas', label: 'Biblioteca de receitas', enabled: false },
    { key: 'progresso', label: 'Gráficos de progresso', enabled: true },
    { key: 'notificacoes', label: 'Notificações push', enabled: true },
    { key: 'telemedicina', label: 'Telemedicina', enabled: false },
  ],
  checkInsTotal: 12,
  checkInFrequency: 'Semanal via app',
  checkinTemplates: [],
  requiredDocuments: [
    { label: 'Contrato de prestação de serviços', required: true },
    { label: 'Termo de consentimento informado', required: true },
    { label: 'Anamnese clínica', required: true },
    { label: 'Exames pré-tratamento', required: false },
    { label: 'Declaração de saúde', required: false },
  ],
  financial: {
    paymentModel: 'parcelado',
    basePrice: 2400,
    installments: 12,
    discountPercent: 10,
    description: 'Parcelamento em até 12x ou à vista com 10% de desconto.',
  },
  team: [],
};
