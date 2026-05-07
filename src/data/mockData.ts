// Centralized mock data for SlimHiper Clinic OS
// Backend integration point: replace these with Supabase/API service calls

import type {
  PatientProfile,
  PatientPackageSummary,
  ClinicalStatusSummary,
  PatientFinancialSummary,
  PatientAlert,
  PatientTask,
  AppointmentSummary,
  PatientTimelineEvent,
  PatientDocumentSummary,
  PatientDocument360Item,
  PatientPrescriptionSummary,
  PatientNutritionPlanSummary,
  PatientChatSummary,
  PatientChatMessage,
  PatientChatShortcut,
  Patient360Summary,
  DashboardStats,
  WaitingQueueEntry,
  PatientListRow,
  Tenant,
  DashboardAlert,
  PatientReviewItem,
  NutritionMeal,
  NutritionFoodGroup,
  NutritionPlanHistory,
  MealAdherenceEntry,
  MealPhoto,
  NutritionTeamNote,
  PatientPackageHistoryItem,
  PatientPackageEntitlement,
  PatientPackageServiceUsage,
  PatientPackageLimit,
} from '@/domain/types';

// ─── PRIMARY MOCK PATIENT: Juliana Pereira ───────────────────────────────────

export const mockPatientJuliana: PatientProfile = {
  id: 'patient-001',
  tenantId: 'tenant-001',
  name: 'Juliana Pereira',
  preferredName: 'Ju',
  age: 34,
  birthDate: '1990-03-15',
  cpfMasked: '***. 456.789-**',
  phone: '(11) 98888-1234',
  email: 'juliana.pereira@email.com',
  avatarUrl: undefined,
  status: 'ativo',
  careTeam: ['Dra. Fernanda Lima', 'Nutr. Carlos Mendes'],
  createdAt: '2026-02-01',
  tags: ['emagrecimento', 'prioridade']
};

export const mockPackageHistoryJuliana: PatientPackageHistoryItem[] = [
  {
    id: 'pkg-hist-001',
    name: 'Avaliação Inicial — 4 Semanas',
    startDate: '2025-12-01',
    endDate: '2025-12-28',
    status: 'concluido',
    totalWeeks: 4,
  },
  {
    id: 'pkg-hist-002',
    name: 'Emagrecimento 8 Semanas',
    startDate: '2026-01-06',
    endDate: '2026-03-02',
    status: 'concluido',
    totalWeeks: 8,
  },
];

export const mockPackageEntitlementsJuliana: PatientPackageEntitlement[] = [
  { key: 'chat', label: 'Chat com equipe', enabled: true },
  { key: 'comunidade', label: 'Comunidade', enabled: false },
  { key: 'documentos', label: 'Documentos incluídos', enabled: true },
  { key: 'app', label: 'App do paciente', enabled: true },
];

export const mockServiceUsageJuliana: PatientPackageServiceUsage[] = [
  {
    label: 'Consultas',
    used: 2,
    total: 6,
    color: 'bg-teal-500',
    bgColor: 'bg-teal-50 text-teal-700',
  },
  {
    label: 'Bioimpedância',
    used: 1,
    total: 3,
    color: 'bg-violet-500',
    bgColor: 'bg-violet-50 text-violet-700',
  },
  {
    label: 'Check-ins',
    used: 4,
    total: 12,
    color: 'bg-amber-500',
    bgColor: 'bg-amber-50 text-amber-700',
  },
  {
    label: 'Sessões de Nutrição',
    used: 1,
    total: 4,
    color: 'bg-emerald-500',
    bgColor: 'bg-emerald-50 text-emerald-700',
  },
];

export const mockPackageLimitsJuliana: PatientPackageLimit[] = [
  { label: 'Validade máxima', value: '12 semanas' },
  { label: 'Sessões extras permitidas', value: 'Não incluídas' },
  { label: 'Pausa permitida', value: 'Até 2 semanas' },
  { label: 'Transferência de saldo', value: 'Não permitida' },
];

export const mockPackageJuliana: PatientPackageSummary = {
  id: 'pkg-001',
  patientId: 'patient-001',
  programName: 'Emagrecimento 12 Semanas',
  programType: 'emagrecimento',
  totalWeeks: 12,
  currentWeek: 4,
  startDate: '2026-04-10',
  endDate: '2026-07-03',
  status: 'ativo',
  totalConsultations: 6,
  usedConsultations: 2,
  totalNutritionSessions: 4,
  usedNutritionSessions: 1,
  packageHistory: mockPackageHistoryJuliana,
  packageEntitlements: mockPackageEntitlementsJuliana,
  serviceUsage: mockServiceUsageJuliana,
  packageLimits: mockPackageLimitsJuliana,
};

export const mockClinicalStatusJuliana: ClinicalStatusSummary = {
  currentWeightKg: 82.4,
  goalWeightKg: 74.0,
  startWeightKg: 86.0,
  currentBmi: 29.2,
  weeklyAdherencePercent: 78,
  adherenceLevel: 'bom',
  weightLostKg: 3.6,
  weightToGoKg: 8.4,
  progressPercent: 33,
  lastMeasuredAt: '2026-05-05',
  weightHistory: [
  { week: 1, weightKg: 86.0, date: '2026-04-10' },
  { week: 2, weightKg: 85.1, date: '2026-04-17' },
  { week: 3, weightKg: 84.2, date: '2026-04-24' },
  { week: 4, weightKg: 82.4, date: '2026-05-05' }],

  adherenceHistory: [
  { week: 1, adherencePercent: 85, label: 'Sem 1' },
  { week: 2, adherencePercent: 72, label: 'Sem 2' },
  { week: 3, adherencePercent: 68, label: 'Sem 3' },
  { week: 4, adherencePercent: 78, label: 'Sem 4' }]

};

export const mockFinancialJuliana: PatientFinancialSummary = {
  status: 'em_dia',
  financialState: 'em_dia',
  totalContractValue: 3600,
  totalPaid: 1200,
  totalPending: 2400,
  totalOverdue: 0,
  futureParcelas: 6,
  futureParcelasAmount: 2400,
  overdueParcelasCount: 0,
  nextDueDate: '2026-06-01',
  nextDueAmount: 400,
  lastPaymentDate: '2026-05-01',
  lastPaymentAmount: 400,
  invoices: [
  {
    id: 'inv-001',
    description: 'Parcela 1/9 — Emagrecimento 12 Semanas',
    amount: 400,
    dueDate: '2026-03-01',
    paidAt: '2026-03-01',
    status: 'pago'
  },
  {
    id: 'inv-002',
    description: 'Parcela 2/9 — Emagrecimento 12 Semanas',
    amount: 400,
    dueDate: '2026-04-01',
    paidAt: '2026-04-02',
    status: 'pago'
  },
  {
    id: 'inv-003',
    description: 'Parcela 3/9 — Emagrecimento 12 Semanas',
    amount: 400,
    dueDate: '2026-05-01',
    paidAt: '2026-05-01',
    status: 'pago'
  },
  {
    id: 'inv-004',
    description: 'Parcela 4/9 — Emagrecimento 12 Semanas',
    amount: 400,
    dueDate: '2026-06-01',
    status: 'pendente'
  },
  {
    id: 'inv-005',
    description: 'Parcela 5/9 — Emagrecimento 12 Semanas',
    amount: 400,
    dueDate: '2026-07-01',
    status: 'pendente'
  },
  {
    id: 'inv-006',
    description: 'Parcela 6/9 — Emagrecimento 12 Semanas',
    amount: 400,
    dueDate: '2026-08-01',
    status: 'pendente'
  }],
  paymentHistory: [
  {
    id: 'pay-001',
    description: 'Parcela 1/9 — Emagrecimento 12 Semanas',
    amount: 400,
    paidAt: '2026-03-01',
    method: 'pix',
    registeredBy: 'Coord. Ana Souza',
    receiptId: 'rec-001'
  },
  {
    id: 'pay-002',
    description: 'Parcela 2/9 — Emagrecimento 12 Semanas',
    amount: 400,
    paidAt: '2026-04-02',
    method: 'cartao_credito',
    registeredBy: 'Coord. Ana Souza',
    receiptId: 'rec-002'
  },
  {
    id: 'pay-003',
    description: 'Parcela 3/9 — Emagrecimento 12 Semanas',
    amount: 400,
    paidAt: '2026-05-01',
    method: 'pix',
    registeredBy: 'Sistema',
    receiptId: 'rec-003'
  }],
  charges: [
  {
    id: 'chg-001',
    description: 'Parcela 4/9 — Emagrecimento 12 Semanas',
    amount: 400,
    issuedAt: '2026-05-20',
    dueDate: '2026-06-01',
    status: 'pendente',
    chargeType: 'pix',
    sentAt: '2026-05-20'
  },
  {
    id: 'chg-002',
    description: 'Taxa de avaliação corporal adicional',
    amount: 120,
    issuedAt: '2026-04-28',
    dueDate: '2026-05-15',
    status: 'pago',
    chargeType: 'link_pagamento',
    sentAt: '2026-04-28'
  }],
  receipts: [
  {
    id: 'rec-001',
    description: 'Parcela 1/9 — Emagrecimento 12 Semanas',
    amount: 400,
    issuedAt: '2026-03-01',
    paymentDate: '2026-03-01',
    issuedBy: 'Coord. Ana Souza',
    receiptNumber: 'REC-2026-001'
  },
  {
    id: 'rec-002',
    description: 'Parcela 2/9 — Emagrecimento 12 Semanas',
    amount: 400,
    issuedAt: '2026-04-02',
    paymentDate: '2026-04-02',
    issuedBy: 'Coord. Ana Souza',
    receiptNumber: 'REC-2026-002'
  },
  {
    id: 'rec-003',
    description: 'Parcela 3/9 — Emagrecimento 12 Semanas',
    amount: 400,
    issuedAt: '2026-05-01',
    paymentDate: '2026-05-01',
    issuedBy: 'Sistema',
    receiptNumber: 'REC-2026-003'
  }],
  negotiations: []
};

export const mockAlertsJuliana: PatientAlert[] = [
{
  id: 'alert-001',
  patientId: 'patient-001',
  severity: 'medio',
  title: 'Adesão abaixo de 80%',
  description: 'Paciente registrou adesão de 68% na semana 3. Recomenda-se contato para reforço motivacional.',
  createdAt: '2026-05-01',
  isResolved: false,
  category: 'adesao'
},
{
  id: 'alert-002',
  patientId: 'patient-001',
  severity: 'baixo',
  title: 'Exame de sangue pendente',
  description: 'Solicitação de hemograma completo realizada há 14 dias sem retorno do resultado.',
  createdAt: '2026-04-23',
  isResolved: false,
  category: 'clinico'
}];


export const mockTasksJuliana: PatientTask[] = [
{
  id: 'task-001',
  patientId: 'patient-001',
  title: 'Enviar resultado do hemograma',
  description: 'Solicitar via WhatsApp ou pelo portal do paciente',
  dueDate: '2026-05-10',
  isCompleted: false,
  assignedTo: 'Dra. Fernanda Lima',
  category: 'clinico',
  priority: 'alta'
},
{
  id: 'task-002',
  patientId: 'patient-001',
  title: 'Assinar Termo de Consentimento Revisado',
  description: 'Novo termo enviado por e-mail em 02/05',
  dueDate: '2026-05-12',
  isCompleted: false,
  assignedTo: 'Juliana Pereira',
  category: 'documento',
  priority: 'alta'
},
{
  id: 'task-003',
  patientId: 'patient-001',
  title: 'Registrar medidas semanais',
  dueDate: '2026-05-09',
  isCompleted: false,
  assignedTo: 'Coord. Ana Souza',
  category: 'clinico',
  priority: 'media'
},
{
  id: 'task-004',
  patientId: 'patient-001',
  title: 'Ligar para reforço motivacional',
  description: 'Adesão caiu abaixo de 70% na semana 3',
  dueDate: '2026-05-08',
  isCompleted: true,
  completedAt: '2026-05-07',
  assignedTo: 'Coord. Ana Souza',
  category: 'comunicacao',
  priority: 'media'
}];


export const mockAppointmentsJuliana: AppointmentSummary[] = [
{
  id: 'appt-001',
  patientId: 'patient-001',
  patientName: 'Juliana Pereira',
  type: 'retorno',
  status: 'agendado',
  scheduledAt: '2026-06-12T14:30:00',
  durationMinutes: 45,
  professionalName: 'Dra. Fernanda Lima',
  professionalRole: 'Médica',
  roomName: 'Consultório 2',
  attendanceLink: 'https://meet.slimhiper.com/appt-001',
  recommendedReturn: '2026-07-10'
},
{
  id: 'appt-002',
  patientId: 'patient-001',
  patientName: 'Juliana Pereira',
  type: 'nutricao',
  status: 'agendado',
  scheduledAt: '2026-05-20T10:00:00',
  durationMinutes: 30,
  professionalName: 'Nutr. Carlos Mendes',
  professionalRole: 'Nutricionista',
  roomName: 'Sala de Nutrição',
  attendanceLink: 'https://meet.slimhiper.com/appt-002'
},
{
  id: 'appt-003',
  patientId: 'patient-001',
  patientName: 'Juliana Pereira',
  type: 'retorno',
  status: 'concluido',
  scheduledAt: '2026-04-24T14:00:00',
  durationMinutes: 45,
  professionalName: 'Dra. Fernanda Lima',
  professionalRole: 'Médica',
  roomName: 'Consultório 2',
  notes: 'Evolução positiva. Perdeu 1,8kg. Ajuste no plano alimentar.',
  recommendedReturn: '2026-06-12'
},
{
  id: 'appt-004',
  patientId: 'patient-001',
  patientName: 'Juliana Pereira',
  type: 'avaliacao_inicial',
  status: 'concluido',
  scheduledAt: '2026-04-10T09:00:00',
  durationMinutes: 60,
  professionalName: 'Dra. Fernanda Lima',
  professionalRole: 'Médica',
  roomName: 'Consultório 2',
  notes: 'Avaliação inicial completa. Iniciou programa Emagrecimento 12 Semanas.'
},
{
  id: 'appt-005',
  patientId: 'patient-001',
  patientName: 'Juliana Pereira',
  type: 'consulta_medica',
  status: 'cancelado',
  scheduledAt: '2026-03-28T11:00:00',
  durationMinutes: 45,
  professionalName: 'Dra. Fernanda Lima',
  professionalRole: 'Médica',
  roomName: 'Consultório 2',
  notes: 'Cancelado pela paciente — reagendado para 10/04.'
},
{
  id: 'appt-006',
  patientId: 'patient-001',
  patientName: 'Juliana Pereira',
  type: 'nutricao',
  status: 'falta',
  scheduledAt: '2026-03-15T09:30:00',
  durationMinutes: 30,
  professionalName: 'Nutr. Carlos Mendes',
  professionalRole: 'Nutricionista',
  roomName: 'Sala de Nutrição',
  notes: 'Paciente não compareceu e não avisou.',
  recommendedReturn: '2026-05-20'
}];


export const mockTimelineJuliana: PatientTimelineEvent[] = [
// ── Semana 4 ──────────────────────────────────────────────────────────────
{
  id: 'tl-001',
  patientId: 'patient-001',
  type: 'medida_registrada',
  title: 'Medidas registradas — Semana 4',
  description: 'Peso: 82,4 kg | IMC: 29,2 | Cintura: 91 cm | Quadril: 108 cm',
  date: '2026-05-05',
  professional: 'Coord. Ana Souza',
  category: 'clinical',
  actorName: 'Coord. Ana Souza',
  statusLabel: 'Registrado',
  actionLabel: 'Ver medidas',
  detailsHref: '/clinic/patients/patient-001?tab=consultas'
},
{
  id: 'tl-002',
  patientId: 'patient-001',
  type: 'checkin_semanal_enviado',
  title: 'Check-in semanal enviado — Semana 4',
  description: 'Paciente respondeu ao check-in semanal pelo app. Adesão: 78%.',
  date: '2026-05-04',
  professional: 'Sistema',
  category: 'patient_app',
  actorName: 'Juliana Pereira',
  statusLabel: 'Respondido',
  actionLabel: 'Ver respostas',
  detailsHref: '/clinic/patients/patient-001?tab=timeline'
},
{
  id: 'tl-003',
  patientId: 'patient-001',
  type: 'mensagem_enviada',
  title: 'Mensagem enviada pela paciente',
  description: '"Dra, posso tomar o remédio em outro horário hoje?"',
  date: '2026-05-04',
  professional: 'Juliana Pereira',
  category: 'communication',
  actorName: 'Juliana Pereira',
  statusLabel: 'Não respondida',
  actionLabel: 'Responder',
  detailsHref: '/clinic/patients/patient-001?tab=chat'
},
{
  id: 'tl-004',
  patientId: 'patient-001',
  type: 'pagamento_recebido',
  title: 'Pagamento recebido — Parcela 3/9',
  description: 'Parcela 3/9 do Emagrecimento 12 Semanas. Valor: R$ 400,00.',
  date: '2026-05-01',
  professional: 'Sistema',
  category: 'financial',
  actorName: 'Sistema',
  statusLabel: 'Pago',
  actionLabel: 'Ver fatura',
  detailsHref: '/clinic/patients/patient-001?tab=financeiro'
},
{
  id: 'tl-005',
  patientId: 'patient-001',
  type: 'alerta',
  title: 'Alerta: adesão abaixo de 80%',
  description: 'Semana 3 registrou adesão de 68%. Protocolo de reengajamento ativado.',
  date: '2026-05-01',
  professional: 'Sistema',
  category: 'clinical',
  actorName: 'Sistema',
  statusLabel: 'Ativo'
},
// ── Semana 3 ──────────────────────────────────────────────────────────────
{
  id: 'tl-006',
  patientId: 'patient-001',
  type: 'checkin_realizado',
  title: 'Check-in presencial realizado — Semana 3',
  description: 'Paciente realizou check-in na recepção às 13:55.',
  date: '2026-04-28',
  professional: 'Recepção',
  category: 'agenda',
  actorName: 'Recepção',
  statusLabel: 'Concluído'
},
{
  id: 'tl-007',
  patientId: 'patient-001',
  type: 'atendimento_iniciado',
  title: 'Atendimento iniciado — Consulta Semana 3',
  description: 'Dra. Fernanda Lima iniciou o atendimento no Consultório 2.',
  date: '2026-04-28',
  professional: 'Dra. Fernanda Lima',
  category: 'clinical',
  actorName: 'Dra. Fernanda Lima',
  statusLabel: 'Em andamento'
},
{
  id: 'tl-008',
  patientId: 'patient-001',
  type: 'soap_atualizado',
  title: 'SOAP atualizado — Consulta Semana 3',
  description: 'Subjetivo: Relata dificuldade com dieta nos fins de semana. Objetivo: Peso 83,5 kg. Avaliação: Progresso moderado. Plano: Reforço motivacional.',
  date: '2026-04-28',
  professional: 'Dra. Fernanda Lima',
  category: 'clinical',
  actorName: 'Dra. Fernanda Lima',
  statusLabel: 'Registrado',
  actionLabel: 'Ver SOAP',
  detailsHref: '/clinic/patients/patient-001?tab=consultas'
},
{
  id: 'tl-009',
  patientId: 'patient-001',
  type: 'atendimento_concluido',
  title: 'Atendimento concluído — Consulta Semana 3',
  description: 'Consulta encerrada. Duração: 40 min. Próximo retorno agendado para 12/06.',
  date: '2026-04-28',
  professional: 'Dra. Fernanda Lima',
  category: 'clinical',
  actorName: 'Dra. Fernanda Lima',
  statusLabel: 'Concluído',
  actionLabel: 'Ver resumo',
  detailsHref: '/clinic/patients/patient-001?tab=consultas'
},
{
  id: 'tl-010',
  patientId: 'patient-001',
  type: 'prescricao_emitida',
  title: 'Prescrição emitida — Vitamina D3 2000 UI',
  description: 'Nova prescrição: Vitamina D3 2000 UI, 1x ao dia com o almoço.',
  date: '2026-04-28',
  professional: 'Dra. Fernanda Lima',
  category: 'clinical',
  actorName: 'Dra. Fernanda Lima',
  statusLabel: 'Emitida',
  actionLabel: 'Ver prescrição',
  detailsHref: '/clinic/patients/patient-001?tab=prescricoes'
},
// ── Semana 2 ──────────────────────────────────────────────────────────────
{
  id: 'tl-011',
  patientId: 'patient-001',
  type: 'medida_registrada',
  title: 'Medidas registradas — Semana 2',
  description: 'Peso: 84,2 kg | IMC: 29,8 | Cintura: 93 cm | Quadril: 110 cm',
  date: '2026-04-24',
  professional: 'Coord. Ana Souza',
  category: 'clinical',
  actorName: 'Coord. Ana Souza',
  statusLabel: 'Registrado',
  actionLabel: 'Ver medidas',
  detailsHref: '/clinic/patients/patient-001?tab=consultas'
},
{
  id: 'tl-012',
  patientId: 'patient-001',
  type: 'consulta',
  title: 'Retorno médico — Semana 2',
  description: 'Evolução positiva. Perdeu 1,8 kg. Ajuste no plano alimentar e suplementação.',
  date: '2026-04-24',
  professional: 'Dra. Fernanda Lima',
  category: 'clinical',
  actorName: 'Dra. Fernanda Lima',
  statusLabel: 'Concluído',
  actionLabel: 'Ver consulta',
  detailsHref: '/clinic/patients/patient-001?tab=consultas'
},
{
  id: 'tl-013',
  patientId: 'patient-001',
  type: 'anamnese_preenchida',
  title: 'Anamnese preenchida',
  description: 'Anamnese nutricional completa preenchida pelo paciente via app.',
  date: '2026-04-23',
  professional: 'Juliana Pereira',
  category: 'patient_app',
  actorName: 'Juliana Pereira',
  statusLabel: 'Preenchida',
  actionLabel: 'Ver anamnese',
  detailsHref: '/clinic/patients/patient-001?tab=consultas'
},
{
  id: 'tl-014',
  patientId: 'patient-001',
  type: 'plano_alimentar_publicado',
  title: 'Plano alimentar publicado — Fase 1 Revisada',
  description: 'Redução de 200 kcal. Aumento de proteína para 130g/dia. Meta: 1.600 kcal.',
  date: '2026-04-24',
  professional: 'Nutr. Carlos Mendes',
  category: 'clinical',
  actorName: 'Nutr. Carlos Mendes',
  statusLabel: 'Publicado',
  actionLabel: 'Ver plano',
  detailsHref: '/clinic/patients/patient-001?tab=nutricao'
},
{
  id: 'tl-015',
  patientId: 'patient-001',
  type: 'documento_gerado',
  title: 'Documento gerado — Solicitação de Hemograma',
  description: 'Solicitação de hemograma completo gerada e enviada para o paciente.',
  date: '2026-04-23',
  professional: 'Dra. Fernanda Lima',
  category: 'documents',
  actorName: 'Dra. Fernanda Lima',
  statusLabel: 'Gerado',
  actionLabel: 'Ver documento',
  detailsHref: '/clinic/patients/patient-001?tab=documentos'
},
// ── Semana 1 ──────────────────────────────────────────────────────────────
{
  id: 'tl-016',
  patientId: 'patient-001',
  type: 'consulta_agendada',
  title: 'Consulta agendada — Retorno Semana 2',
  description: 'Retorno médico agendado para 24/04 às 14:00 com Dra. Fernanda Lima.',
  date: '2026-04-17',
  professional: 'Coord. Ana Souza',
  category: 'agenda',
  actorName: 'Coord. Ana Souza',
  statusLabel: 'Agendado',
  actionLabel: 'Ver agenda',
  detailsHref: '/clinic/agenda'
},
{
  id: 'tl-017',
  patientId: 'patient-001',
  type: 'pagamento_atrasado',
  title: 'Aviso: pagamento próximo do vencimento',
  description: 'Parcela 2/9 com vencimento em 01/04. Lembrete enviado por SMS.',
  date: '2026-04-15',
  professional: 'Sistema',
  category: 'financial',
  actorName: 'Sistema',
  statusLabel: 'Pendente',
  actionLabel: 'Ver fatura',
  detailsHref: '/clinic/patients/patient-001?tab=financeiro'
},
// ── Início do programa ────────────────────────────────────────────────────
{
  id: 'tl-018',
  patientId: 'patient-001',
  type: 'inicio_programa',
  title: 'Início do Programa — Emagrecimento 12 Semanas',
  description: 'Paciente iniciou o programa. Peso inicial: 86,0 kg. Meta: 74,0 kg.',
  date: '2026-04-10',
  professional: 'Dra. Fernanda Lima',
  category: 'clinical',
  actorName: 'Dra. Fernanda Lima',
  statusLabel: 'Ativo'
},
{
  id: 'tl-019',
  patientId: 'patient-001',
  type: 'documento_assinado',
  title: 'Contrato assinado digitalmente',
  description: 'Contrato de Prestação de Serviços assinado via portal pelo paciente.',
  date: '2026-04-09',
  professional: 'Juliana Pereira',
  category: 'documents',
  actorName: 'Juliana Pereira',
  statusLabel: 'Assinado',
  actionLabel: 'Ver contrato',
  detailsHref: '/clinic/patients/patient-001?tab=documentos'
},
{
  id: 'tl-020',
  patientId: 'patient-001',
  type: 'contrato_assinado',
  title: 'Contrato de serviços confirmado',
  description: 'Contrato do programa Emagrecimento 12 Semanas confirmado. Valor total: R$ 3.600,00 em 9x.',
  date: '2026-04-09',
  professional: 'Coord. Ana Souza',
  category: 'commercial',
  actorName: 'Coord. Ana Souza',
  statusLabel: 'Confirmado',
  actionLabel: 'Ver contrato',
  detailsHref: '/clinic/patients/patient-001?tab=documentos'
},
{
  id: 'tl-021',
  patientId: 'patient-001',
  type: 'pacote_vendido',
  title: 'Pacote vendido — Emagrecimento 12 Semanas',
  description: 'Pacote adquirido: 6 consultas médicas + 4 sessões de nutrição. Valor: R$ 3.600,00.',
  date: '2026-04-08',
  professional: 'Coord. Ana Souza',
  category: 'commercial',
  actorName: 'Coord. Ana Souza',
  statusLabel: 'Vendido',
  actionLabel: 'Ver pacote',
  detailsHref: '/clinic/patients/patient-001?tab=pacotes'
},
{
  id: 'tl-022',
  patientId: 'patient-001',
  type: 'paciente_cadastrado',
  title: 'Paciente cadastrada no sistema',
  description: 'Cadastro completo realizado. Prontuário criado. Equipe de cuidado atribuída.',
  date: '2026-04-08',
  professional: 'Coord. Ana Souza',
  category: 'commercial',
  actorName: 'Coord. Ana Souza',
  statusLabel: 'Cadastrado'
},
{
  id: 'tl-023',
  patientId: 'patient-001',
  type: 'lead_convertido',
  title: 'Lead convertido em paciente',
  description: 'Juliana Pereira convertida após consulta de avaliação inicial. Origem: indicação.',
  date: '2026-04-07',
  professional: 'Coord. Ana Souza',
  category: 'commercial',
  actorName: 'Coord. Ana Souza',
  statusLabel: 'Convertido'
},
{
  id: 'tl-024',
  patientId: 'patient-001',
  type: 'lead_criado',
  title: 'Lead criado — Juliana Pereira',
  description: 'Lead cadastrado via formulário de indicação. Interesse: emagrecimento.',
  date: '2026-04-01',
  professional: 'Sistema',
  category: 'commercial',
  actorName: 'Sistema',
  statusLabel: 'Criado'
}];


export const mockDocumentsJuliana: PatientDocumentSummary[] = [
{
  id: 'doc-001',
  patientId: 'patient-001',
  name: 'Contrato de Prestação de Serviços',
  type: 'contrato',
  status: 'assinado',
  createdAt: '2026-04-08',
  signedAt: '2026-04-09',
  uploadedBy: 'Coord. Ana Souza',
  fileSizeKb: 245
},
{
  id: 'doc-002',
  patientId: 'patient-001',
  name: 'Termo de Consentimento Livre e Esclarecido',
  type: 'consentimento',
  status: 'pendente_assinatura',
  createdAt: '2026-05-02',
  uploadedBy: 'Dra. Fernanda Lima',
  fileSizeKb: 180
},
{
  id: 'doc-003',
  patientId: 'patient-001',
  name: 'Solicitação de Hemograma Completo',
  type: 'exame',
  status: 'em_analise',
  createdAt: '2026-04-23',
  uploadedBy: 'Dra. Fernanda Lima',
  fileSizeKb: 95
},
{
  id: 'doc-004',
  patientId: 'patient-001',
  name: 'Relatório de Avaliação Inicial',
  type: 'relatorio',
  status: 'assinado',
  createdAt: '2026-04-10',
  signedAt: '2026-04-10',
  uploadedBy: 'Dra. Fernanda Lima',
  fileSizeKb: 312
}];

// ─── Extended documents for Documentos 360 tab ───────────────────────────────

export const mockDocuments360Juliana: PatientDocument360Item[] = [
  // Relatórios
  {
    id: 'doc-r-001',
    patientId: 'patient-001',
    name: 'Relatório de Avaliação Inicial',
    category: 'relatorio',
    tipo: 'Relatório',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '10/04/2026',
    ultimoAcesso: '05/05/2026',
    emitidoPor: 'Dra. Fernanda Lima',
    hasEvidencePackage: true,
  },
  {
    id: 'doc-r-002',
    patientId: 'patient-001',
    name: 'Relatório de Evolução — Semana 4',
    category: 'relatorio',
    tipo: 'Relatório',
    status: 'disponivel',
    assinatura: 'nao_requerido',
    emitidoEm: '05/05/2026',
    ultimoAcesso: '06/05/2026',
    emitidoPor: 'Dra. Fernanda Lima',
  },
  // Prescrições
  {
    id: 'doc-p-001',
    patientId: 'patient-001',
    name: 'Prescrição — Metformina 500mg',
    category: 'prescricao',
    tipo: 'Prescrição Médica',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '10/04/2026',
    ultimoAcesso: '28/04/2026',
    emitidoPor: 'Dra. Fernanda Lima',
    hasEvidencePackage: false,
  },
  {
    id: 'doc-p-002',
    patientId: 'patient-001',
    name: 'Prescrição — Vitamina D3 2000 UI',
    category: 'prescricao',
    tipo: 'Prescrição Médica',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '28/04/2026',
    ultimoAcesso: '02/05/2026',
    emitidoPor: 'Dra. Fernanda Lima',
  },
  // Termos
  {
    id: 'doc-t-001',
    patientId: 'patient-001',
    name: 'Termo de Responsabilidade — Uso de Medicamento',
    category: 'termo',
    tipo: 'Termo',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '10/04/2026',
    ultimoAcesso: '10/04/2026',
    emitidoPor: 'Coord. Ana Souza',
    hasEvidencePackage: true,
  },
  // Contratos
  {
    id: 'doc-c-001',
    patientId: 'patient-001',
    name: 'Contrato de Prestação de Serviços',
    category: 'contrato',
    tipo: 'Contrato',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '08/04/2026',
    ultimoAcesso: '09/04/2026',
    emitidoPor: 'Coord. Ana Souza',
    hasEvidencePackage: true,
  },
  // Consentimentos
  {
    id: 'doc-co-001',
    patientId: 'patient-001',
    name: 'Termo de Consentimento Livre e Esclarecido',
    category: 'consentimento',
    tipo: 'Consentimento',
    status: 'pendente_assinatura',
    assinatura: 'pendente',
    emitidoEm: '02/05/2026',
    emitidoPor: 'Dra. Fernanda Lima',
  },
  {
    id: 'doc-co-002',
    patientId: 'patient-001',
    name: 'Consentimento para Uso de Imagem',
    category: 'consentimento',
    tipo: 'Consentimento',
    status: 'assinado',
    assinatura: 'assinado',
    emitidoEm: '08/04/2026',
    ultimoAcesso: '09/04/2026',
    emitidoPor: 'Coord. Ana Souza',
  },
  // Orientações
  {
    id: 'doc-or-001',
    patientId: 'patient-001',
    name: 'Orientações Nutricionais — Fase 1',
    category: 'orientacao',
    tipo: 'Orientação',
    status: 'disponivel',
    assinatura: 'nao_requerido',
    emitidoEm: '10/04/2026',
    ultimoAcesso: '24/04/2026',
    emitidoPor: 'Nutr. Carlos Mendes',
  },
  {
    id: 'doc-or-002',
    patientId: 'patient-001',
    name: 'Orientações Gerais de Estilo de Vida',
    category: 'orientacao',
    tipo: 'Orientação',
    status: 'disponivel',
    assinatura: 'nao_requerido',
    emitidoEm: '10/04/2026',
    ultimoAcesso: '15/04/2026',
    emitidoPor: 'Dra. Fernanda Lima',
  },
  // Pacotes de evidência
  {
    id: 'doc-pe-001',
    patientId: 'patient-001',
    name: 'Pacote de Evidência — Contrato Inicial',
    category: 'pacote_evidencia',
    tipo: 'Pacote de Evidência',
    status: 'disponivel',
    assinatura: 'nao_requerido',
    emitidoEm: '09/04/2026',
    ultimoAcesso: '01/05/2026',
    emitidoPor: 'Sistema',
    hasEvidencePackage: true,
  },
];


export const mockPrescriptionsJuliana: PatientPrescriptionSummary[] = [
  // ─── Prescrição Médica ───────────────────────────────────────────────────
  {
    id: 'presc-001',
    patientId: 'patient-001',
    medicationName: 'Metformina 500mg',
    dosage: '500mg',
    frequency: '1x ao dia com o jantar',
    startDate: '2026-04-10',
    endDate: '2026-07-10',
    prescribedBy: 'Dra. Fernanda Lima',
    isActive: true,
    notes: 'Reavaliação em 30 dias.',
    category: 'prescricao_medica',
    status: 'ativo',
    issueDate: '2026-04-10',
    validity: '2026-07-10',
    linkedDocument: 'DOC-2026-0041',
    signatureStatus: 'assinado',
    version: 'v1.2',
  },
  {
    id: 'presc-002',
    patientId: 'patient-001',
    medicationName: 'Sibutramina 10mg',
    dosage: '10mg',
    frequency: '1x ao dia pela manhã',
    startDate: '2026-04-10',
    endDate: '2026-06-10',
    prescribedBy: 'Dra. Fernanda Lima',
    isActive: false,
    notes: 'Suspensa após reavaliação.',
    category: 'prescricao_medica',
    status: 'cancelado',
    issueDate: '2026-04-10',
    validity: '2026-06-10',
    linkedDocument: 'DOC-2026-0038',
    signatureStatus: 'assinado',
    version: 'v1.0',
  },
  // ─── Suplementação ───────────────────────────────────────────────────────
  {
    id: 'presc-003',
    patientId: 'patient-001',
    medicationName: 'Whey Protein Isolado',
    dosage: '30g',
    frequency: '1 dose pós-treino',
    startDate: '2026-04-10',
    prescribedBy: 'Nutr. Carlos Mendes',
    isActive: true,
    category: 'suplementacao',
    status: 'ativo',
    issueDate: '2026-04-10',
    validity: '2026-10-10',
    linkedDocument: 'DOC-2026-0042',
    signatureStatus: 'assinado',
    version: 'v1.0',
  },
  {
    id: 'presc-004',
    patientId: 'patient-001',
    medicationName: 'Vitamina D3 2000 UI',
    dosage: '2000 UI',
    frequency: '1x ao dia com o almoço',
    startDate: '2026-04-10',
    prescribedBy: 'Dra. Fernanda Lima',
    isActive: true,
    category: 'suplementacao',
    status: 'ativo',
    issueDate: '2026-04-10',
    validity: '2026-10-10',
    linkedDocument: undefined,
    signatureStatus: 'nao_requerido',
    version: 'v1.0',
  },
  {
    id: 'presc-005',
    patientId: 'patient-001',
    medicationName: 'Ômega-3 1g',
    dosage: '1g',
    frequency: '2x ao dia com as refeições',
    startDate: '2026-05-01',
    prescribedBy: 'Nutr. Carlos Mendes',
    isActive: true,
    category: 'suplementacao',
    status: 'pendente_assinatura',
    issueDate: '2026-05-01',
    validity: '2026-11-01',
    linkedDocument: 'DOC-2026-0055',
    signatureStatus: 'pendente',
    version: 'v1.0',
  },
  // ─── Orientações Nutricionais ────────────────────────────────────────────
  {
    id: 'presc-006',
    patientId: 'patient-001',
    medicationName: 'Orientação Alimentar — Fase 1',
    dosage: '—',
    frequency: '—',
    startDate: '2026-04-10',
    prescribedBy: 'Nutr. Carlos Mendes',
    isActive: true,
    notes: 'Redução de carboidratos simples e aumento de proteína magra.',
    category: 'orientacoes_nutricionais',
    status: 'ativo',
    issueDate: '2026-04-10',
    validity: '2026-07-10',
    linkedDocument: 'DOC-2026-0043',
    signatureStatus: 'assinado',
    version: 'v2.0',
  },
  {
    id: 'presc-007',
    patientId: 'patient-001',
    medicationName: 'Guia de Hidratação',
    dosage: '—',
    frequency: '—',
    startDate: '2026-04-10',
    prescribedBy: 'Nutr. Carlos Mendes',
    isActive: true,
    notes: 'Mínimo 2,5L de água por dia.',
    category: 'orientacoes_nutricionais',
    status: 'ativo',
    issueDate: '2026-04-10',
    validity: '2026-10-10',
    linkedDocument: undefined,
    signatureStatus: 'nao_requerido',
    version: 'v1.0',
  },
  // ─── Orientações Gerais ──────────────────────────────────────────────────
  {
    id: 'presc-008',
    patientId: 'patient-001',
    medicationName: 'Protocolo de Atividade Física',
    dosage: '—',
    frequency: '—',
    startDate: '2026-04-10',
    prescribedBy: 'Dra. Fernanda Lima',
    isActive: true,
    notes: 'Caminhada 30 min/dia, 5x por semana. Evitar exercícios de alta intensidade nas primeiras 4 semanas.',
    category: 'orientacoes_gerais',
    status: 'ativo',
    issueDate: '2026-04-10',
    validity: '2026-07-10',
    linkedDocument: 'DOC-2026-0044',
    signatureStatus: 'assinado',
    version: 'v1.1',
  },
  {
    id: 'presc-009',
    patientId: 'patient-001',
    medicationName: 'Orientações de Sono e Estresse',
    dosage: '—',
    frequency: '—',
    startDate: '2026-05-01',
    prescribedBy: 'Dra. Fernanda Lima',
    isActive: true,
    notes: 'Higiene do sono: 7–9h por noite. Técnicas de respiração para manejo do estresse.',
    category: 'orientacoes_gerais',
    status: 'rascunho',
    issueDate: '2026-05-01',
    validity: '2026-11-01',
    linkedDocument: undefined,
    signatureStatus: 'pendente',
    version: 'v1.0',
  },
];


export const mockNutritionPlanJuliana: PatientNutritionPlanSummary = {
  id: 'nutri-001',
  patientId: 'patient-001',
  planName: 'Plano Hipocalórico Moderado — Fase 1',
  targetCalories: 1600,
  targetProteinG: 130,
  targetCarbsG: 160,
  targetFatG: 55,
  createdAt: '2026-04-10',
  updatedAt: '2026-04-24',
  nutritionistName: 'Nutr. Carlos Mendes',
  isActive: true,
  adherencePercent: 74,
  meals: [
  {
    id: 'meal-001',
    name: 'Café da manhã',
    time: '07:00',
    targetCalories: 320,
    targetProteinG: 25,
    targetCarbsG: 35,
    targetFatG: 8,
    description: 'Refeição leve com proteína e carboidrato de baixo índice glicêmico.'
  },
  {
    id: 'meal-002',
    name: 'Lanche da manhã',
    time: '10:00',
    targetCalories: 150,
    targetProteinG: 10,
    targetCarbsG: 18,
    targetFatG: 4,
    description: 'Fruta + proteína para manter saciedade.'
  },
  {
    id: 'meal-003',
    name: 'Almoço',
    time: '13:00',
    targetCalories: 480,
    targetProteinG: 45,
    targetCarbsG: 50,
    targetFatG: 12,
    description: 'Refeição principal com proteína, carboidrato, vegetais e gordura boa.'
  },
  {
    id: 'meal-004',
    name: 'Lanche da tarde',
    time: '16:00',
    targetCalories: 180,
    targetProteinG: 15,
    targetCarbsG: 20,
    targetFatG: 5,
    description: 'Lanche proteico para evitar compulsão no jantar.'
  },
  {
    id: 'meal-005',
    name: 'Jantar',
    time: '19:30',
    targetCalories: 380,
    targetProteinG: 32,
    targetCarbsG: 30,
    targetFatG: 14,
    description: 'Refeição leve, rica em vegetais e proteína magra.'
  },
  {
    id: 'meal-006',
    name: 'Ceia',
    time: '21:30',
    targetCalories: 90,
    targetProteinG: 3,
    targetCarbsG: 7,
    targetFatG: 12,
    description: 'Opcional. Gordura boa para saciedade noturna.'
  }] as
  NutritionMeal[],
  foodGroups: [
  {
    label: 'Fonte proteica',
    category: 'fonte_proteica',
    portionDescription: '100–150g por refeição principal',
    dailyServings: 4,
    examples: ['Frango grelhado', 'Atum', 'Ovos', 'Whey protein', 'Tofu']
  },
  {
    label: 'Carboidrato',
    category: 'carboidrato',
    portionDescription: '1 xícara cozido por refeição',
    dailyServings: 3,
    examples: ['Arroz integral', 'Batata-doce', 'Aveia', 'Quinoa', 'Pão integral']
  },
  {
    label: 'Vegetais',
    category: 'vegetais',
    portionDescription: 'À vontade no almoço e jantar',
    dailyServings: 5,
    examples: ['Brócolis', 'Abobrinha', 'Espinafre', 'Cenoura', 'Pepino']
  },
  {
    label: 'Gorduras boas',
    category: 'gorduras_boas',
    portionDescription: '1 colher de sopa por refeição',
    dailyServings: 2,
    examples: ['Azeite extra virgem', 'Abacate', 'Castanha-do-pará', 'Amêndoas', 'Linhaça']
  },
  {
    label: 'Frutas',
    category: 'frutas',
    portionDescription: '1 porção média por lanche',
    dailyServings: 2,
    examples: ['Maçã', 'Banana', 'Morango', 'Kiwi', 'Melão']
  },
  {
    label: 'Líquidos',
    category: 'liquidos',
    portionDescription: 'Mínimo 2,5L por dia',
    dailyServings: 8,
    examples: ['Água', 'Água com gás', 'Chá verde', 'Chá de camomila', 'Água de coco (1x/dia)']
  }] as
  NutritionFoodGroup[],
  planHistory: [
  {
    id: 'hist-001',
    planName: 'Plano Hipocalórico Moderado — Fase 1',
    createdAt: '2026-04-24',
    nutritionistName: 'Nutr. Carlos Mendes',
    targetCalories: 1600,
    status: 'ativo',
    notes: 'Redução de 200 kcal. Aumento de proteína para 130g/dia.'
  },
  {
    id: 'hist-002',
    planName: 'Plano Inicial de Avaliação',
    createdAt: '2026-04-10',
    archivedAt: '2026-04-24',
    nutritionistName: 'Nutr. Carlos Mendes',
    targetCalories: 1800,
    status: 'arquivado',
    notes: 'Plano inicial para avaliação de tolerância e preferências alimentares.'
  }] as
  NutritionPlanHistory[],
  mealAdherence: [
  { week: 1, label: 'Sem 1', adherencePercent: 82, mealsLogged: 33, mealsTotal: 42 },
  { week: 2, label: 'Sem 2', adherencePercent: 71, mealsLogged: 30, mealsTotal: 42 },
  { week: 3, label: 'Sem 3', adherencePercent: 65, mealsLogged: 27, mealsTotal: 42 },
  { week: 4, label: 'Sem 4', adherencePercent: 74, mealsLogged: 31, mealsTotal: 42 }] as
  MealAdherenceEntry[],
  mealPhotos: [
  {
    id: 'photo-001',
    mealName: 'Almoço',
    photoUrl: "https://images.unsplash.com/photo-1530814068728-fca41cc000cb",
    submittedAt: '2026-05-05T13:22:00',
    note: 'Frango grelhado com batata-doce e brócolis.',
    reviewedBy: 'Nutr. Carlos Mendes',
    reviewNote: 'Ótima escolha! Porção adequada.'
  },
  {
    id: 'photo-002',
    mealName: 'Café da manhã',
    photoUrl: "https://images.unsplash.com/photo-1710031150684-9f399dfa59e7",
    submittedAt: '2026-05-04T07:45:00',
    note: 'Ovos mexidos com torrada integral.'
  },
  {
    id: 'photo-003',
    mealName: 'Jantar',
    photoUrl: "https://images.unsplash.com/photo-1423516379032-c433998b2845",
    submittedAt: '2026-05-03T19:55:00',
    note: 'Salada com atum e azeite.',
    reviewedBy: 'Nutr. Carlos Mendes',
    reviewNote: 'Adicionar uma fonte de carboidrato complexo.'
  }] as
  MealPhoto[],
  teamNotes: [
  {
    id: 'tnote-001',
    authorName: 'Nutr. Carlos Mendes',
    authorRole: 'Nutricionista',
    content: 'Paciente relata dificuldade em manter o plano nos fins de semana. Orientada sobre estratégias de flexibilização controlada. Próxima sessão: revisar refeições de sábado e domingo.',
    createdAt: '2026-04-28',
    isInternal: false
  },
  {
    id: 'tnote-002',
    authorName: 'Dra. Fernanda Lima',
    authorRole: 'Médica',
    content: 'Ajuste calórico aprovado. Manter proteína elevada para preservação de massa magra durante o déficit.',
    createdAt: '2026-04-24',
    isInternal: true
  }] as
  NutritionTeamNote[]
};

export const mockChatMessagesJuliana: PatientChatMessage[] = [
  {
    id: 'msg-001',
    from: 'patient',
    text: 'Oi! Tudo bem? Tenho uma dúvida sobre o remédio.',
    time: '09:45',
    read: true,
  },
  {
    id: 'msg-002',
    from: 'staff',
    text: 'Olá Juliana! Pode perguntar, estou aqui.',
    time: '09:52',
    read: true,
  },
  {
    id: 'msg-003',
    from: 'patient',
    text: 'Posso tomar a Metformina em horário diferente hoje? Tive um jantar tardio.',
    time: '10:15',
    read: true,
  },
  {
    id: 'msg-004',
    from: 'staff',
    text: 'Sim, pode tomar junto com a próxima refeição principal. Só não pule a dose!',
    time: '10:22',
    read: true,
  },
  {
    id: 'msg-005',
    from: 'patient',
    text: 'Entendi, obrigada! Vou tomar assim que chegar em casa.',
    time: '10:30',
    read: false,
  },
];

export const mockChatShortcutsJuliana: PatientChatShortcut[] = [
  { id: 'sc-001', text: 'Consulta agendada para amanhã às 14h.' },
  { id: 'sc-002', text: 'Lembrete: tomar medicação em jejum.' },
  { id: 'sc-003', text: 'Resultado de exame disponível no app.' },
  { id: 'sc-004', text: 'Confirmar presença na próxima sessão?' },
];

export const mockChatJuliana: PatientChatSummary = {
  id: 'chat-001',
  patientId: 'patient-001',
  lastMessageAt: '2026-05-07T10:22:00',
  lastMessagePreview: 'Dra, posso tomar o remédio em outro horário hoje?',
  lastMessageFrom: 'Juliana Pereira',
  unreadCount: 2,
  isOpen: true,
  responsibleTeamMember: {
    name: 'Dra. Ana Lima',
    role: 'Nutricionista',
  },
  serviceHours: {
    days: 'Seg–Sex',
    start: '08:00',
    end: '18:00',
  },
  slaExpected: {
    label: 'Até 4 horas',
    note: 'em dias úteis',
  },
  messages: mockChatMessagesJuliana,
  shortcuts: mockChatShortcutsJuliana,
};

export const mockPatient360Juliana: Patient360Summary = {
  profile: mockPatientJuliana,
  activePackage: mockPackageJuliana,
  clinicalStatus: mockClinicalStatusJuliana,
  financial: mockFinancialJuliana,
  alerts: mockAlertsJuliana,
  tasks: mockTasksJuliana,
  upcomingAppointments: mockAppointmentsJuliana,
  recentTimeline: mockTimelineJuliana,
  documents: mockDocumentsJuliana,
  prescriptions: mockPrescriptionsJuliana,
  nutritionPlan: mockNutritionPlanJuliana,
  chat: mockChatJuliana,
  mainUnit: 'Unidade Centro — SP',
  responsibleProfessional: 'Dra. Fernanda Lima',
  clinicalRisk: 'moderado',
  lastUpdate: '2026-05-07T10:22:00'
};

// ─── PATIENT LIST MOCK DATA ───────────────────────────────────────────────────

export const mockPatientList: PatientListRow[] = [
{
  id: 'patient-001',
  name: 'Juliana Pereira',
  age: 34,
  phone: '(11) 98888-1234',
  activePackage: 'Emagrecimento 12 Semanas',
  programType: 'emagrecimento',
  currentWeek: 4,
  totalWeeks: 12,
  weeklyAdherence: 78,
  adherenceLevel: 'bom',
  nextAppointment: '12/06 às 14:30',
  careTeam: ['Dra. Fernanda Lima', 'Nutr. Carlos Mendes'],
  alertCount: 2,
  financialStatus: 'em_dia',
  status: 'ativo'
},
{
  id: 'patient-002',
  name: 'Roberto Almeida',
  age: 42,
  phone: '(11) 97777-5678',
  activePackage: 'Hipertrofia 16 Semanas',
  programType: 'hipertrofia',
  currentWeek: 9,
  totalWeeks: 16,
  weeklyAdherence: 91,
  adherenceLevel: 'excelente',
  nextAppointment: '09/05 às 10:00',
  careTeam: ['Dr. Marcos Ribeiro', 'Nutr. Patricia Souza'],
  alertCount: 0,
  financialStatus: 'em_dia',
  status: 'ativo'
},
{
  id: 'patient-003',
  name: 'Camila Torres',
  age: 29,
  phone: '(21) 96666-9012',
  activePackage: 'Recomposição Corporal 20 Semanas',
  programType: 'recomposicao',
  currentWeek: 2,
  totalWeeks: 20,
  weeklyAdherence: 55,
  adherenceLevel: 'critico',
  nextAppointment: '14/05 às 09:00',
  careTeam: ['Dra. Fernanda Lima'],
  alertCount: 3,
  financialStatus: 'pendente',
  status: 'ativo'
},
{
  id: 'patient-004',
  name: 'Marcelo Nascimento',
  age: 51,
  phone: '(11) 95555-3456',
  activePackage: 'Saúde Metabólica 24 Semanas',
  programType: 'saude_metabolica',
  currentWeek: 12,
  totalWeeks: 24,
  weeklyAdherence: 82,
  adherenceLevel: 'bom',
  nextAppointment: '10/05 às 16:00',
  careTeam: ['Dr. Marcos Ribeiro'],
  alertCount: 1,
  financialStatus: 'em_dia',
  status: 'ativo'
},
{
  id: 'patient-005',
  name: 'Fernanda Costa',
  age: 38,
  phone: '(11) 94444-7890',
  activePackage: 'Emagrecimento 12 Semanas',
  programType: 'emagrecimento',
  currentWeek: 7,
  totalWeeks: 12,
  weeklyAdherence: 93,
  adherenceLevel: 'excelente',
  nextAppointment: '08/05 às 11:30',
  careTeam: ['Dra. Fernanda Lima', 'Nutr. Carlos Mendes'],
  alertCount: 0,
  financialStatus: 'em_dia',
  status: 'ativo'
},
{
  id: 'patient-006',
  name: 'André Batista',
  age: 46,
  phone: '(19) 93333-2345',
  activePackage: 'Longevidade Premium 48 Semanas',
  programType: 'longevidade',
  currentWeek: 20,
  totalWeeks: 48,
  weeklyAdherence: 76,
  adherenceLevel: 'bom',
  nextAppointment: '15/05 às 14:00',
  careTeam: ['Dr. Marcos Ribeiro', 'Nutr. Patricia Souza'],
  alertCount: 0,
  financialStatus: 'em_dia',
  status: 'ativo'
},
{
  id: 'patient-007',
  name: 'Larissa Martins',
  age: 27,
  phone: '(11) 92222-6789',
  activePackage: 'Emagrecimento 12 Semanas',
  programType: 'emagrecimento',
  currentWeek: 1,
  totalWeeks: 12,
  weeklyAdherence: 60,
  adherenceLevel: 'regular',
  nextAppointment: '12/05 às 08:30',
  careTeam: ['Dra. Fernanda Lima'],
  alertCount: 1,
  financialStatus: 'inadimplente',
  status: 'ativo'
},
{
  id: 'patient-008',
  name: 'Paulo Henrique Silva',
  age: 55,
  phone: '(11) 91111-0123',
  activePackage: 'Saúde Metabólica 24 Semanas',
  programType: 'saude_metabolica',
  currentWeek: 18,
  totalWeeks: 24,
  weeklyAdherence: 88,
  adherenceLevel: 'excelente',
  nextAppointment: '11/05 às 15:30',
  careTeam: ['Dr. Marcos Ribeiro'],
  alertCount: 0,
  financialStatus: 'em_dia',
  status: 'ativo'
},
{
  id: 'patient-009',
  name: 'Beatriz Rodrigues',
  age: 31,
  phone: '(11) 99000-4567',
  activePackage: 'Recomposição Corporal 20 Semanas',
  programType: 'recomposicao',
  currentWeek: 6,
  totalWeeks: 20,
  weeklyAdherence: 84,
  adherenceLevel: 'bom',
  nextAppointment: '13/05 às 13:00',
  careTeam: ['Dra. Fernanda Lima', 'Nutr. Carlos Mendes'],
  alertCount: 0,
  financialStatus: 'em_dia',
  status: 'ativo'
},
{
  id: 'patient-010',
  name: 'Thiago Carvalho',
  age: 39,
  phone: '(21) 98765-8901',
  activePackage: 'Hipertrofia 16 Semanas',
  programType: 'hipertrofia',
  currentWeek: 3,
  totalWeeks: 16,
  weeklyAdherence: 45,
  adherenceLevel: 'critico',
  nextAppointment: '16/05 às 10:30',
  careTeam: ['Dr. Marcos Ribeiro'],
  alertCount: 4,
  financialStatus: 'pendente',
  status: 'ativo'
},
{
  id: 'patient-011',
  name: 'Renata Oliveira',
  age: 44,
  phone: '(11) 97654-3210',
  activePackage: 'Longevidade Premium 48 Semanas',
  programType: 'longevidade',
  currentWeek: 35,
  totalWeeks: 48,
  weeklyAdherence: 79,
  adherenceLevel: 'bom',
  nextAppointment: '17/05 às 09:30',
  careTeam: ['Dr. Marcos Ribeiro', 'Nutr. Patricia Souza'],
  alertCount: 0,
  financialStatus: 'em_dia',
  status: 'ativo'
},
{
  id: 'patient-012',
  name: 'Diego Ferreira',
  age: 33,
  phone: '(11) 96543-2109',
  activePackage: 'Emagrecimento 12 Semanas',
  programType: 'emagrecimento',
  currentWeek: 10,
  totalWeeks: 12,
  weeklyAdherence: 95,
  adherenceLevel: 'excelente',
  nextAppointment: '07/05 às 17:00',
  careTeam: ['Dra. Fernanda Lima'],
  alertCount: 0,
  financialStatus: 'em_dia',
  status: 'ativo'
}];


// ─── DASHBOARD MOCK DATA ──────────────────────────────────────────────────────

export const mockDashboardStats: DashboardStats = {
  consultasHoje: 14,
  consultasConcluidas: 5,
  filaEspera: 3,
  programasAtivos: 47,
  alertasClinicos: 8,
  mensagensNaoLidas: 12,
  documentosPendentes: 6,
  inadimplentes: 4,
  taxaOcupacao: 82
};

export const mockWaitingQueue: WaitingQueueEntry[] = [
{
  id: 'wq-001',
  patientId: 'patient-005',
  patientName: 'Fernanda Costa',
  appointmentType: 'retorno',
  status: 'em_consulta',
  scheduledTime: '11:00',
  arrivedAt: '10:52',
  waitingMinutes: 0,
  professionalName: 'Dra. Fernanda Lima',
  room: 'Consultório 2'
},
{
  id: 'wq-002',
  patientId: 'patient-004',
  patientName: 'Marcelo Nascimento',
  appointmentType: 'consulta_medica',
  status: 'aguardando_medico',
  scheduledTime: '11:00',
  arrivedAt: '10:45',
  waitingMinutes: 22,
  professionalName: 'Dr. Marcos Ribeiro',
  room: 'Consultório 1'
},
{
  id: 'wq-003',
  patientId: 'patient-008',
  patientName: 'Paulo Henrique Silva',
  appointmentType: 'bioimpedancia',
  status: 'bioimpedancia',
  scheduledTime: '11:30',
  arrivedAt: '11:18',
  waitingMinutes: 9,
  professionalName: 'Coord. Ana Souza',
  room: 'Sala de Bioimpedância'
},
{
  id: 'wq-004',
  patientId: 'patient-009',
  patientName: 'Beatriz Rodrigues',
  appointmentType: 'nutricao',
  status: 'triagem',
  scheduledTime: '11:30',
  arrivedAt: '11:25',
  waitingMinutes: 5,
  professionalName: 'Nutr. Carlos Mendes',
  room: 'Sala de Nutrição'
},
{
  id: 'wq-005',
  patientId: 'patient-002',
  patientName: 'Roberto Almeida',
  appointmentType: 'retorno',
  status: 'agendado',
  scheduledTime: '12:00',
  waitingMinutes: 0,
  professionalName: 'Dr. Marcos Ribeiro',
  room: 'Consultório 1'
}];


export const mockTodayAppointments: AppointmentSummary[] = [
{
  id: 'today-001',
  patientId: 'patient-012',
  patientName: 'Diego Ferreira',
  type: 'retorno',
  status: 'concluido',
  scheduledAt: '2026-05-07T09:00:00',
  durationMinutes: 45,
  professionalName: 'Dra. Fernanda Lima',
  professionalRole: 'Médica',
  roomName: 'Consultório 2'
},
{
  id: 'today-002',
  patientId: 'patient-011',
  patientName: 'Renata Oliveira',
  type: 'consulta_medica',
  status: 'concluido',
  scheduledAt: '2026-05-07T09:30:00',
  durationMinutes: 45,
  professionalName: 'Dr. Marcos Ribeiro',
  professionalRole: 'Médico',
  roomName: 'Consultório 1'
},
{
  id: 'today-003',
  patientId: 'patient-006',
  patientName: 'André Batista',
  type: 'checkup',
  status: 'concluido',
  scheduledAt: '2026-05-07T10:00:00',
  durationMinutes: 60,
  professionalName: 'Dr. Marcos Ribeiro',
  professionalRole: 'Médico',
  roomName: 'Consultório 1'
},
{
  id: 'today-004',
  patientId: 'patient-001',
  patientName: 'Juliana Pereira',
  type: 'nutricao',
  status: 'concluido',
  scheduledAt: '2026-05-07T10:30:00',
  durationMinutes: 30,
  professionalName: 'Nutr. Carlos Mendes',
  professionalRole: 'Nutricionista',
  roomName: 'Sala de Nutrição'
},
{
  id: 'today-005',
  patientId: 'patient-005',
  patientName: 'Fernanda Costa',
  type: 'retorno',
  status: 'em_consulta',
  scheduledAt: '2026-05-07T11:00:00',
  durationMinutes: 45,
  professionalName: 'Dra. Fernanda Lima',
  professionalRole: 'Médica',
  roomName: 'Consultório 2'
},
{
  id: 'today-006',
  patientId: 'patient-004',
  patientName: 'Marcelo Nascimento',
  type: 'consulta_medica',
  status: 'aguardando_medico',
  scheduledAt: '2026-05-07T11:00:00',
  durationMinutes: 45,
  professionalName: 'Dr. Marcos Ribeiro',
  professionalRole: 'Médico',
  roomName: 'Consultório 1'
},
{
  id: 'today-007',
  patientId: 'patient-008',
  patientName: 'Paulo Henrique Silva',
  type: 'bioimpedancia',
  status: 'bioimpedancia',
  scheduledAt: '2026-05-07T11:30:00',
  durationMinutes: 30,
  professionalName: 'Coord. Ana Souza',
  professionalRole: 'Coordenadora',
  roomName: 'Sala de Bioimpedância'
},
{
  id: 'today-008',
  patientId: 'patient-009',
  patientName: 'Beatriz Rodrigues',
  type: 'nutricao',
  status: 'triagem',
  scheduledAt: '2026-05-07T11:30:00',
  durationMinutes: 30,
  professionalName: 'Nutr. Carlos Mendes',
  professionalRole: 'Nutricionista',
  roomName: 'Sala de Nutrição'
},
{
  id: 'today-009',
  patientId: 'patient-002',
  patientName: 'Roberto Almeida',
  type: 'retorno',
  status: 'agendado',
  scheduledAt: '2026-05-07T12:00:00',
  durationMinutes: 45,
  professionalName: 'Dr. Marcos Ribeiro',
  professionalRole: 'Médico',
  roomName: 'Consultório 1'
},
{
  id: 'today-010',
  patientId: 'patient-003',
  patientName: 'Camila Torres',
  type: 'consulta_medica',
  status: 'agendado',
  scheduledAt: '2026-05-07T14:00:00',
  durationMinutes: 45,
  professionalName: 'Dra. Fernanda Lima',
  professionalRole: 'Médica',
  roomName: 'Consultório 2'
}];


// ─── PLATFORM ADMIN MOCK ──────────────────────────────────────────────────────

export const mockTenants: Tenant[] = [
{
  id: 'tenant-001',
  name: 'Clínica SlimCenter SP',
  slug: 'slimcenter-sp',
  status: 'active',
  plan: 'professional',
  ownerName: 'Dr. Rodrigo Farias',
  ownerEmail: 'rodrigo@slimcenter.com.br',
  phone: '(11) 3456-7890',
  city: 'São Paulo',
  state: 'SP',
  activePatients: 47,
  mrr: 1490,
  storageUsedGb: 12.4,
  createdAt: '2025-08-15',
  lastActivityAt: '2026-05-07',
  webhookErrors: 0,
  integrationErrors: 0
},
{
  id: 'tenant-002',
  name: 'Corpo em Forma RJ',
  slug: 'corpo-em-forma-rj',
  status: 'active',
  plan: 'enterprise',
  ownerName: 'Dra. Mariana Vasconcelos',
  ownerEmail: 'mariana@corpoemforma.com.br',
  phone: '(21) 2345-6789',
  city: 'Rio de Janeiro',
  state: 'RJ',
  activePatients: 124,
  mrr: 3990,
  storageUsedGb: 38.7,
  createdAt: '2025-06-01',
  lastActivityAt: '2026-05-07',
  webhookErrors: 2,
  integrationErrors: 1
},
{
  id: 'tenant-003',
  name: 'Vita Transform BH',
  slug: 'vita-transform-bh',
  status: 'trial',
  plan: 'starter',
  ownerName: 'Dr. Felipe Andrade',
  ownerEmail: 'felipe@vitatransform.com.br',
  phone: '(31) 3456-7891',
  city: 'Belo Horizonte',
  state: 'MG',
  activePatients: 8,
  mrr: 0,
  storageUsedGb: 1.2,
  trialEndsAt: '2026-05-21',
  createdAt: '2026-04-21',
  lastActivityAt: '2026-05-06',
  webhookErrors: 0,
  integrationErrors: 0
},
{
  id: 'tenant-004',
  name: 'MetaClinic Curitiba',
  slug: 'metaclinic-cwb',
  status: 'suspended',
  plan: 'professional',
  ownerName: 'Dra. Tatiane Braga',
  ownerEmail: 'tatiane@metaclinic.com.br',
  phone: '(41) 3456-7892',
  city: 'Curitiba',
  state: 'PR',
  activePatients: 0,
  mrr: 0,
  storageUsedGb: 5.8,
  createdAt: '2025-11-10',
  lastActivityAt: '2026-03-15',
  webhookErrors: 0,
  integrationErrors: 3
},
{
  id: 'tenant-005',
  name: 'Emagre+ Campinas',
  slug: 'emagreplus-campinas',
  status: 'active',
  plan: 'starter',
  ownerName: 'Dr. Gustavo Pires',
  ownerEmail: 'gustavo@emagreplus.com.br',
  phone: '(19) 3456-7893',
  city: 'Campinas',
  state: 'SP',
  activePatients: 23,
  mrr: 690,
  storageUsedGb: 4.1,
  createdAt: '2025-12-05',
  lastActivityAt: '2026-05-07',
  webhookErrors: 1,
  integrationErrors: 0
}];


// ─── DASHBOARD ALERTS ─────────────────────────────────────────────────────────

export const mockDashboardAlerts: DashboardAlert[] = [
{
  id: 'dash-alert-001',
  patientId: 'patient-003',
  severity: 'alto',
  title: 'Camila Torres — Adesão crítica (55%)',
  description: '3 semanas consecutivas abaixo de 60%. Protocolo de reengajamento recomendado.',
  createdAt: '2026-05-07',
  isResolved: false,
  category: 'adesao'
},
{
  id: 'dash-alert-002',
  patientId: 'patient-010',
  severity: 'critico',
  title: 'Thiago Carvalho — 4 alertas ativos',
  description: 'Adesão 45%, inadimplência pendente, 2 documentos vencidos.',
  createdAt: '2026-05-07',
  isResolved: false,
  category: 'protocolo'
},
{
  id: 'dash-alert-003',
  patientId: 'patient-007',
  severity: 'medio',
  title: 'Larissa Martins — Fatura vencida',
  description: 'Parcela 2 vencida há 5 dias. Contato necessário.',
  createdAt: '2026-05-06',
  isResolved: false,
  category: 'financeiro'
}];


// ─── PATIENTS NEEDING REVIEW ──────────────────────────────────────────────────

export const mockPatientsNeedingReview: PatientReviewItem[] = [
{ id: 'patient-003', name: 'Camila Torres', issue: 'Adesão crítica · 55%', severity: 'critico' },
{ id: 'patient-010', name: 'Thiago Carvalho', issue: '4 alertas ativos', severity: 'critico' },
{ id: 'patient-007', name: 'Larissa Martins', issue: 'Inadimplente · fatura vencida', severity: 'alto' },
{ id: 'patient-001', name: 'Juliana Pereira', issue: 'Adesão caiu para 68% (sem 3)', severity: 'medio' }];