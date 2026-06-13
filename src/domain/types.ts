// Central domain type definitions for SlimHiper Clinic OS
// Backend integration point: replace mock implementations with Supabase/API calls

export type UserRole =
  | 'clinic_admin'
  | 'physician'
  | 'nutritionist'
  | 'coordinator'
  | 'receptionist'
  | 'platform_admin'
  | 'patient';

export type TenantStatus = 'active' | 'trial' | 'suspended' | 'cancelled';
export type TenantPlan = 'starter' | 'professional' | 'enterprise';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: TenantPlan;
  ownerName: string;
  ownerEmail: string;
  phone: string;
  city: string;
  state: string;
  activePatients: number;
  mrr: number;
  storageUsedGb: number;
  trialEndsAt?: string;
  createdAt: string;
  lastActivityAt: string;
  webhookErrors: number;
  integrationErrors: number;
}

export interface UserProfile {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  professionalProfile?: ProfessionalProfile | null;
  avatarUrl?: string;
  specialty?: string;
  crmNumber?: string;
  crnNumber?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
}

export type ProfessionalType =
  | 'physician'
  | 'nutritionist'
  | 'fitness_professional'
  | 'external_professional';

export interface ProfessionalProfile {
  id: string;
  professionalType: ProfessionalType;
  licenseNumber?: string;
  licenseState?: string;
  specialty?: string;
  isActive: boolean;
  countsAsDoctor: boolean;
}

export type PatientStatus = 'ativo' | 'inativo' | 'pausado' | 'concluido' | 'cancelado';
export type FinancialStatus = 'em_dia' | 'pendente' | 'inadimplente' | 'isento';
export type AdherenceLevel = 'excelente' | 'bom' | 'regular' | 'critico';

export interface PatientProfile {
  id: string;
  tenantId: string;
  name: string;
  preferredName?: string;
  age: number;
  birthDate: string;
  cpfMasked: string;
  phone: string;
  email: string;
  avatarUrl?: string;
  status: PatientStatus;
  careTeam: string[];
  createdAt: string;
  tags?: string[];
}

export type ProgramType =
  | 'emagrecimento'
  | 'hipertrofia'
  | 'recomposicao'
  | 'saude_metabolica'
  | 'longevidade';

export type PackageStatus = 'ativo' | 'pausado' | 'concluido' | 'cancelado' | 'aguardando';

export interface PatientPackageSummary {
  id: string;
  patientId: string;
  programName: string;
  programType: ProgramType;
  totalWeeks: number;
  currentWeek: number;
  startDate: string;
  endDate: string;
  status: PackageStatus;
  totalConsultations: number;
  usedConsultations: number;
  totalNutritionSessions: number;
  usedNutritionSessions: number;
  packageHistory?: PatientPackageHistoryItem[];
  packageEntitlements?: PatientPackageEntitlement[];
  serviceUsage?: PatientPackageServiceUsage[];
  packageLimits?: PatientPackageLimit[];
  checkins?: PatientPackageCheckin[];
}

export interface PatientMeasurementSummary {
  id: string;
  patientId: string;
  measuredAt: string;
  weightKg: number;
  heightCm: number;
  bmi: number;
  bodyFatPercent?: number;
  muscleMassKg?: number;
  visceralFat?: number;
  waistCm?: number;
  hipCm?: number;
  notes?: string;
}

export interface ClinicalStatusSummary {
  currentWeightKg: number;
  goalWeightKg: number;
  startWeightKg: number;
  currentBmi: number;
  weeklyAdherencePercent: number;
  adherenceLevel: AdherenceLevel;
  weightLostKg: number;
  weightToGoKg: number;
  progressPercent: number;
  lastMeasuredAt: string;
  weightHistory: { week: number; weightKg: number; date: string }[];
  adherenceHistory: { week: number; adherencePercent: number; label: string }[];
}

export interface PatientFinancialSummary {
  status: FinancialStatus;
  financialState?: 'em_dia' | 'pagamento_atrasado' | 'cobranca_pendente';
  totalContractValue: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  futureParcelas?: number;
  futureParcelasAmount?: number;
  overdueParcelasCount?: number;
  nextDueDate?: string;
  nextDueAmount?: number;
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  invoices: InvoiceSummary[];
  paymentHistory?: PatientPaymentRecord[];
  charges?: PatientCharge[];
  receipts?: PatientReceipt[];
  negotiations?: PatientNegotiation[];
  paymentReceipts?: PatientPaymentReceipt[];
  subscriptions?: PatientBillingSubscription[];
  refunds?: PatientBillingRefund[];
}

export interface InvoiceSummary {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  paidAt?: string;
  status: 'pago' | 'pendente' | 'vencido' | 'cancelado';
}

export interface PatientPaymentRecord {
  id: string;
  description: string;
  amount: number;
  paidAt: string;
  method: 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'transferencia';
  registeredBy: string;
  receiptId?: string;
}

export interface PatientCharge {
  id: string;
  description: string;
  amount: number;
  issuedAt: string;
  dueDate: string;
  status: 'pendente' | 'pago' | 'vencido' | 'cancelado';
  chargeType: 'boleto' | 'pix' | 'link_pagamento' | 'cartao';
  sentAt?: string;
}

export interface PatientReceipt {
  id: string;
  description: string;
  amount: number;
  issuedAt: string;
  paymentDate: string;
  issuedBy: string;
  receiptNumber: string;
  paymentId?: string;
}

export interface PatientNegotiation {
  id: string;
  description: string;
  originalAmount: number;
  negotiatedAmount: number;
  installments: number;
  status: 'ativa' | 'concluida' | 'cancelada' | 'pendente_aprovacao';
  createdAt: string;
  createdBy: string;
  notes?: string;
}

export interface PatientPaymentReceipt {
  id: string;
  invoiceId?: string | null;
  paymentId?: string | null;
  amountCents: number;
  status:
    | 'pending_upload'
    | 'pending_review'
    | 'approved'
    | 'rejected'
    | 'failed'
    | 'deleted'
    | string;
  submittedAt?: string | null;
  uploadedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  rejectionReason?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

export interface PatientBillingSubscription {
  id: string;
  status: string;
  cycle: string;
  amountCents: number;
  nextDueDate?: string | null;
  description?: string | null;
  createdAt?: string | null;
}

export interface PatientBillingRefund {
  id: string;
  invoiceId?: string | null;
  paymentId?: string | null;
  status: 'requested' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | string;
  amountCents: number;
  reason: string;
  requestedAt?: string | null;
  processedAt?: string | null;
}

export type AppointmentStatus =
  | 'agendado'
  | 'confirmado'
  | 'chegou'
  | 'triagem'
  | 'medidas'
  | 'bioimpedancia'
  | 'aguardando_medico'
  | 'em_consulta'
  | 'checkout'
  | 'concluido'
  | 'falta'
  | 'cancelado';

export type AppointmentType =
  | 'consulta_medica'
  | 'retorno'
  | 'nutricao'
  | 'avaliacao_inicial'
  | 'bioimpedancia'
  | 'checkup';

export interface AppointmentSummary {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  patientAvatarUrl?: string;
  activePackageName?: string;
  alertCount?: number;
  type: AppointmentType;
  status: AppointmentStatus;
  scheduledAt: string;
  durationMinutes: number;
  professionalName: string;
  professionalRole: string;
  roomName?: string;
  notes?: string;
  attendanceLink?: string;
  attendanceQueueId?: string;
  attendanceQueueStatus?: AttendanceQueueStatus;
  recommendedReturn?: string; // ISO date string for recommended follow-up
}

export interface EncounterSummary {
  id: string;
  patientId: string;
  date: string;
  professionalName: string;
  professionalRole: string;
  type: AppointmentType;
  chiefComplaint?: string;
  summary: string;
  weightKg?: number;
  bmi?: number;
  nextSteps?: string;
}

export type TimelineEventType =
  | 'consulta'
  | 'nutricao'
  | 'medicamento'
  | 'medida'
  | 'documento'
  | 'pagamento'
  | 'alerta'
  | 'mensagem'
  | 'inicio_programa'
  | 'meta_atingida'
  // Paciente 360 expanded types
  | 'lead_criado'
  | 'lead_convertido'
  | 'pacote_vendido'
  | 'contrato_assinado'
  | 'paciente_cadastrado'
  | 'consulta_agendada'
  | 'checkin_realizado'
  | 'atendimento_iniciado'
  | 'atendimento_concluido'
  | 'anamnese_preenchida'
  | 'soap_atualizado'
  | 'medida_registrada'
  | 'exame_solicitado'
  | 'exame_resultado_recebido'
  | 'foto_progresso_registrada'
  | 'foto_progresso_liberada'
  | 'plano_alimentar_publicado'
  | 'prescricao_emitida'
  | 'prescricao_atualizada'
  | 'prescricao_cancelada'
  | 'documento_gerado'
  | 'documento_assinado'
  | 'pagamento_recebido'
  | 'pagamento_atrasado'
  | 'mensagem_enviada'
  | 'checkin_semanal_enviado';

export type TimelineEventCategory =
  | 'clinical'
  | 'financial'
  | 'documents'
  | 'agenda'
  | 'communication'
  | 'patient_app'
  | 'commercial';

export interface PatientTimelineEvent {
  id: string;
  patientId: string;
  type: TimelineEventType;
  title: string;
  description: string;
  date: string;
  professional?: string;
  metadata?: Record<string, string | number | boolean>;
  // Paciente 360 expanded fields
  category?: TimelineEventCategory;
  actorName?: string;
  statusLabel?: string;
  actionLabel?: string;
  detailsHref?: string;
}

export type AlertSeverity = 'critico' | 'alto' | 'medio' | 'baixo';

export interface PatientAlert {
  id: string;
  patientId: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  createdAt: string;
  resolvedAt?: string;
  isResolved: boolean;
  category: 'clinico' | 'financeiro' | 'adesao' | 'documento' | 'protocolo';
}

export interface PatientTask {
  id: string;
  patientId: string;
  title: string;
  description?: string;
  dueDate: string;
  isCompleted: boolean;
  completedAt?: string;
  assignedTo?: string;
  category: 'clinico' | 'financeiro' | 'documento' | 'comunicacao';
  priority: 'alta' | 'media' | 'baixa';
}

export interface PatientDocumentSummary {
  id: string;
  patientId: string;
  name: string;
  type: 'contrato' | 'consentimento' | 'exame' | 'prescricao' | 'relatorio' | 'outros';
  status: 'pendente_assinatura' | 'assinado' | 'vencido' | 'cancelado' | 'em_analise';
  createdAt: string;
  signedAt?: string;
  expiresAt?: string;
  uploadedBy: string;
  fileSizeKb?: number;
}

export interface PatientPrescriptionSummary {
  id: string;
  patientId: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate?: string;
  prescribedBy: string;
  isActive: boolean;
  notes?: string;
  // Extended fields
  category?:
    | 'prescricao_medica'
    | 'suplementacao'
    | 'orientacoes_nutricionais'
    | 'orientacoes_gerais'
    | 'plano_alimentar';
  status?: 'ativo' | 'expirado' | 'cancelado' | 'pendente_assinatura' | 'rascunho';
  issueDate?: string;
  validity?: string;
  linkedDocumentId?: string;
  linkedDocument?: string;
  signatureStatus?: 'assinado' | 'pendente' | 'nao_requerido' | 'nao_configurado' | 'rejeitado';
  signatureRequirement?: 'none' | 'd4sign_optional' | 'qualified_or_icp_required';
  version?: string;
  requiresReview?: boolean;
  patientVisible?: boolean;
  items?: PatientPrescriptionItemSummary[];
  regulatory?: PatientPrescriptionRegulatorySummary;
  pdfArtifact?: PatientPrescriptionPdfArtifactSummary;
  medicationReminders?: PatientPrescriptionMedicationReminderSummary[];
}

export interface PatientPrescriptionItemSummary {
  id: string;
  label: string;
  itemType: 'medicamento' | 'suplemento' | 'orientacao' | 'plano_alimentar';
  dosage?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  quantity?: string;
  instructions?: string;
  startDate?: string;
  endDate?: string;
  scheduleTimes?: string[];
  reminderEnabled?: boolean;
}

export interface PatientPrescriptionRegulatorySummary {
  classification: string;
  scope: string;
  signatureRequirement: 'none' | 'd4sign_optional' | 'qualified_or_icp_required';
  signatureStatus: 'not_required' | 'not_configured' | 'pending' | 'validated' | 'rejected';
  d4signAllowed: boolean;
  providerPolicy?: string;
  prescriberName?: string;
}

export interface PatientPrescriptionPdfArtifactSummary {
  id: string;
  status: 'generated' | 'superseded' | 'cancelled' | 'failed';
  versionNumber: number;
  generatedAt?: string;
  releasedToPatient: boolean;
}

export interface PatientPrescriptionMedicationReminderSummary {
  id: string;
  title: string;
  medicationLabel?: string;
  dosage?: string;
  instructions?: string;
  scheduleTimes: string[];
  status: 'active' | 'paused' | 'archived';
}

export interface PatientNutritionPlanSummary {
  id: string;
  patientId: string;
  planName: string;
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  createdAt: string;
  updatedAt: string;
  nutritionistName: string;
  isActive: boolean;
  adherencePercent?: number;
  meals?: NutritionMeal[];
  foodGroups?: NutritionFoodGroup[];
  planHistory?: NutritionPlanHistory[];
  mealAdherence?: MealAdherenceEntry[];
  mealPhotos?: MealPhoto[];
  teamNotes?: NutritionTeamNote[];
}

export interface NutritionMeal {
  id: string;
  name: string;
  time: string;
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  description?: string;
}

export interface NutritionFoodGroup {
  label: string;
  category: 'fonte_proteica' | 'carboidrato' | 'vegetais' | 'gorduras_boas' | 'frutas' | 'liquidos';
  portionDescription: string;
  dailyServings: number;
  examples: string[];
}

export interface NutritionPlanHistory {
  id: string;
  planName: string;
  createdAt: string;
  archivedAt?: string;
  nutritionistName: string;
  targetCalories: number;
  status: 'ativo' | 'arquivado' | 'duplicado';
  notes?: string;
}

export interface MealAdherenceEntry {
  week: number;
  label: string;
  adherencePercent: number;
  mealsLogged: number;
  mealsTotal: number;
}

export interface MealPhoto {
  id: string;
  mealName: string;
  photoUrl?: string;
  submittedAt: string;
  note?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  photoUploadStatus?: 'none' | 'pending_upload' | 'uploaded' | 'failed' | string;
  hasPhoto?: boolean;
}

export interface NutritionTeamNote {
  id: string;
  authorName: string;
  authorRole: string;
  content: string;
  createdAt: string;
  isInternal: boolean;
}

export interface PatientDailyAdherenceSummary {
  dateIso: string;
  progressPercent: number;
  status: 'done' | 'partial' | 'low' | 'empty' | string;
  lastSignalAt?: string;
  waterMl: number;
  waterGoalMl: number;
  mealsCount: number;
  mealsGoal: number;
  workoutsCount: number;
  workoutsGoal: number;
  checkinRequired: boolean;
  checkinDone: boolean;
  pendingCheckinsCount: number;
  mealPhotos: MealPhoto[];
}

export interface PatientChatSummary {
  id: string;
  patientId: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageFrom: string;
  unreadCount: number;
  isOpen: boolean;
  messages?: PatientChatMessage[];
  shortcuts?: PatientChatShortcut[];
  threads?: PatientChatThread[];
  responsibleTeamMember?: PatientChatResponsibleMember;
  serviceHours?: PatientChatServiceHours;
  slaExpected?: PatientChatSla;
}

// ─── Chat domain types ────────────────────────────────────────────────────────

export interface PatientChatMessage {
  id: string;
  from: 'patient' | 'staff';
  text: string;
  time: string;
  read: boolean;
  deliveryStatus?: 'sending' | 'sent' | 'failed';
  isAutomated?: boolean;
  attachments?: PatientChatAttachment[];
}

export interface PatientChatShortcut {
  id: string;
  title?: string;
  text: string;
  category?: string;
}

export interface PatientChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'pending' | 'uploaded' | 'failed' | 'deleted';
  kind: 'image' | 'file';
  signedUrl?: string;
}

export interface PatientChatThread {
  id: string;
  date: string;
  summary: string;
  messageCount: number;
}

export interface PatientChatResponsibleMember {
  name: string;
  role: string;
}

export interface PatientChatServiceHours {
  days: string;
  start: string;
  end: string;
  timezone?: string;
  isAvailable?: boolean;
  unavailableMessage?: string;
}

export interface PatientChatSla {
  label: string;
  note: string;
  status?: 'ok' | 'warning' | 'breached';
  dueAt?: string;
  minutesRemaining?: number;
}

// ─── Document 360 types ───────────────────────────────────────────────────────

export type PatientDocumentCategory =
  | 'relatorio'
  | 'prescricao'
  | 'termo'
  | 'contrato'
  | 'consentimento'
  | 'orientacao'
  | 'pacote_evidencia';

export type PatientDocumentSignatureStatus = 'assinado' | 'pendente' | 'nao_requerido';

export interface PatientDocumentSignatureSummary {
  provider: 'd4sign';
  signatureRequestId: string;
  status: 'sent' | 'viewed' | 'signed' | 'rejected' | 'expired' | 'canceled' | 'error';
}

export interface PatientDocument360Item {
  id: string;
  patientId: string;
  name: string;
  category: PatientDocumentCategory;
  tipo: string;
  status:
    | 'assinado'
    | 'pendente_assinatura'
    | 'em_analise'
    | 'vencido'
    | 'cancelado'
    | 'disponivel';
  assinatura: PatientDocumentSignatureStatus;
  emitidoEm: string;
  ultimoAcesso?: string;
  emitidoPor: string;
  hasEvidencePackage?: boolean;
  signature?: PatientDocumentSignatureSummary;
  canRequestSignature?: boolean;
  signatureDisabledReason?: string;
}

export interface Patient360Summary {
  profile: PatientProfile;
  activePackage: PatientPackageSummary;
  clinicalStatus: ClinicalStatusSummary;
  financial: PatientFinancialSummary;
  alerts: PatientAlert[];
  tasks: PatientTask[];
  upcomingAppointments: AppointmentSummary[];
  recentTimeline: PatientTimelineEvent[];
  documents: PatientDocumentSummary[];
  prescriptions: PatientPrescriptionSummary[];
  dailyAdherence?: PatientDailyAdherenceSummary | null;
  nutritionPlan: PatientNutritionPlanSummary;
  chat: PatientChatSummary;
  mainUnit?: string;
  responsibleProfessional?: string;
  clinicalRisk?: 'baixo' | 'moderado' | 'alto' | 'critico';
  lastUpdate?: string;
}

// Dashboard types
export interface DashboardOperationalInsights {
  crm: {
    canRead: boolean;
    openLeads: number;
    overdueTasks: number;
    href: string;
  };
  inventory: {
    canRead: boolean;
    criticalStockItems: number;
    expiringLots: number;
    daysToExpiry: number;
    href: string;
  };
}

export interface DashboardAccess {
  patients: boolean;
  agenda: boolean;
  documents: boolean;
  financial: boolean;
  chat: boolean;
  crm: boolean;
  inventory: boolean;
}

export interface DashboardSectionEnvelope<T> {
  canRead: boolean;
  data: T;
  error?: string | null;
  updatedAt?: string;
}

export type DashboardActionCategory =
  | 'fila'
  | 'adesao'
  | 'clinico'
  | 'financeiro'
  | 'documento'
  | 'mensagem'
  | 'renovacao'
  | 'comercial'
  | 'estoque';

export type DashboardActionPriority = 'critico' | 'alto' | 'medio' | 'baixo';

export interface DashboardActionItem {
  id: string;
  category: DashboardActionCategory;
  priority: DashboardActionPriority;
  patientId?: string;
  patientName?: string;
  title: string;
  reason: string;
  owner: string;
  slaLabel: string;
  ctaLabel: string;
  href: string;
  metricLabel?: string;
  createdAt?: string;
  dueAt?: string;
}

export interface DashboardLowAdherenceItem {
  id: string;
  patientId: string;
  patientName: string;
  adherencePercent: number;
  reason: string;
  severity: AlertSeverity;
  lastSignalAt?: string | null;
  href: string;
}

export interface DashboardFinancialPendencyItem {
  id: string;
  patientId: string;
  patientName: string;
  status: string;
  amountCents?: number;
  dueDate?: string | null;
  daysOverdue?: number;
  href: string;
}

export interface DashboardDocumentPendencyItem {
  id: string;
  patientId: string;
  patientName: string;
  name: string;
  status: string;
  generatedAt?: string | null;
  href: string;
}

export interface DashboardRecentMessageItem {
  id: string;
  threadId: string;
  patientId: string;
  patientName: string;
  unreadCount: number;
  lastMessageAt?: string | null;
  owner: string;
  href: string;
}

export interface DashboardRenewalItem {
  id: string;
  patientId: string;
  patientName: string;
  programName: string;
  endDate?: string | null;
  daysToEnd?: number;
  href: string;
}

export interface DashboardCohortItem {
  id: string;
  label: string;
  activePatients: number;
  lowAdherenceCount: number;
  renewalsCount: number;
  href: string;
}

export interface DashboardOperationalSections {
  actionableQueue: DashboardSectionEnvelope<DashboardActionItem[]>;
  lowAdherence: DashboardSectionEnvelope<DashboardLowAdherenceItem[]>;
  financialPendencies: DashboardSectionEnvelope<DashboardFinancialPendencyItem[]>;
  documentPendencies: DashboardSectionEnvelope<DashboardDocumentPendencyItem[]>;
  recentMessages: DashboardSectionEnvelope<DashboardRecentMessageItem[]>;
  renewalPipeline: DashboardSectionEnvelope<DashboardRenewalItem[]>;
  cohortPanel: DashboardSectionEnvelope<DashboardCohortItem[]>;
}

export interface DashboardStats {
  consultasHoje: number;
  consultasConcluidas: number;
  filaEspera: number;
  programasAtivos: number;
  alertasClinicos: number;
  mensagensNaoLidas: number;
  documentosPendentes: number;
  inadimplentes: number;
  taxaOcupacao: number;
  baixaAdesao?: number;
  renovacoesPendentes?: number;
  operationalInsights?: DashboardOperationalInsights;
}

export interface DashboardDegradedSection {
  key: string;
  label: string;
  canRead: boolean;
  error: string;
}

export interface DashboardSnapshot {
  stats: DashboardStats;
  waitingQueue: WaitingQueueEntry[];
  todayAppointments: AppointmentSummary[];
  alerts: DashboardAlert[];
  patientsNeedingReview: PatientReviewItem[];
  degradedSections?: DashboardDegradedSection[];
  access?: DashboardAccess;
  sections?: DashboardOperationalSections;
  actionableQueue?: DashboardActionItem[];
}

export type AttendanceQueueStatus =
  | 'scheduled'
  | 'waiting'
  | 'called'
  | 'in_attendance'
  | 'checkout'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'stuck';

export interface WaitingQueueEntry {
  id: string;
  queueId?: string;
  appointmentId?: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  patientAvatarUrl?: string;
  activePackageName?: string;
  alertCount?: number;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  queueStatus?: AttendanceQueueStatus;
  scheduledTime: string;
  arrivedAt?: string;
  calledAt?: string;
  startedAt?: string;
  completedAt?: string;
  waitingMinutes: number;
  professionalName: string;
  room?: string;
  encounterId?: string;
  attendanceLink?: string;
}

export type PatientReturnStatus =
  | 'pendente'
  | 'contatado'
  | 'agendado'
  | 'dispensado'
  | 'vencido'
  | 'cancelado';

export interface PatientReturnSummary {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  activePackageName?: string;
  alertCount?: number;
  dueDate: string;
  status: PatientReturnStatus;
  reason: string;
  contactMethod?: string;
  lastContactAt?: string;
  nextActionAt?: string;
  sourceAppointmentId?: string;
  targetAppointmentId?: string;
  notes?: string;
  href?: string;
}

export interface BlockedSlotSummary {
  id: string;
  startAt: string;
  endAt: string;
  status: 'active' | 'cancelled';
  reason: string;
  location?: string;
}

// Patient list row
export interface PatientListRow {
  id: string;
  name: string;
  age: number;
  phone: string;
  activePackage: string;
  programType: ProgramType;
  currentWeek: number;
  totalWeeks: number;
  weeklyAdherence: number;
  adherenceLevel: AdherenceLevel;
  nextAppointment?: string;
  careTeam: string[];
  alertCount: number;
  financialStatus: FinancialStatus;
  status: PatientStatus;
  avatarUrl?: string;
}

export type PatientPriorityBand = 'critico' | 'alto' | 'medio' | 'baixo';

export type PatientWalletSectionKey = 'clinical' | 'financial' | 'documents' | 'chat';

export interface PatientWalletSectionAccess {
  canRead: boolean;
  error?: string | null;
}

export type PatientWalletAccess = Record<PatientWalletSectionKey, PatientWalletSectionAccess>;

export interface PatientWalletAction {
  label: string;
  href: string;
  kind: 'clinical' | 'financial' | 'documents' | 'chat' | 'agenda' | 'patient';
}

export interface PatientWalletRow extends PatientListRow {
  priorityScore: number;
  priorityBand: PatientPriorityBand;
  triageStatus: 'acao_imediata' | 'monitorar' | 'rotina';
  scoreExplanation: string;
  scoreReasons: string[];
  nextAction: PatientWalletAction;
  nextAppointmentAt?: string;
  activeProgramId?: string;
  activeProgramName: string;
  pendingDocumentCount: number;
  unreadChatCount: number;
  lastMessageAt?: string;
  financialPendingCount: number;
  financialOverdueCount: number;
  clinicalAlertSeverity?: 'critical' | 'high' | 'medium' | 'low';
}

export interface PatientWalletSummary {
  total: number;
  loaded: number;
  active: number;
  highPriority: number;
  criticalPriority: number;
  lowAdherence: number;
  pendingFinancial: number;
  pendingDocuments: number;
  unreadChats: number;
}

export interface PatientWalletSnapshot {
  rows: PatientWalletRow[];
  total: number;
  page: number;
  pageSize: number;
  generatedAt: string;
  summary: PatientWalletSummary;
  access: PatientWalletAccess;
}

export interface DashboardAlert {
  id: string;
  patientId: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  createdAt: string;
  isResolved: boolean;
  category: 'clinico' | 'financeiro' | 'adesao' | 'documento' | 'protocolo';
}

export interface PatientReviewItem {
  id: string;
  name: string;
  issue: string;
  severity: 'critico' | 'alto' | 'medio' | 'baixo';
}

// ─── Package domain types ─────────────────────────────────────────────────────

export interface PatientPackageHistoryItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'concluido' | 'cancelado' | 'ativo';
  totalWeeks: number;
  reason?: string;
}

export interface PatientPackageEntitlement {
  key: string;
  label: string;
  enabled: boolean;
}

export interface PatientPackageServiceUsage {
  label: string;
  used: number;
  total: number;
  color: string;
  bgColor: string;
}

export interface PatientPackageLimit {
  label: string;
  value: string;
}

export interface PatientPackageCheckin {
  id: string;
  title: string;
  status: 'scheduled' | 'sent' | 'completed' | 'overdue' | 'canceled';
  dueDate: string;
  completedAt?: string;
  channel?: 'app' | 'whatsapp' | 'email' | 'presencial';
}

// ─── Report definition types ──────────────────────────────────────────────────

export interface PatientReportDefinition {
  key: string;
  label: string;
  description: string;
  iconKey: string;
  badge?: string;
  badgeColor?: string;
  exportImplemented: boolean;
}

// ─── Clinic Program / Package Template types ──────────────────────────────────

export type ProgramStatus = 'ativo' | 'arquivado' | 'rascunho';
export type ProgramPaymentModel = 'parcelado' | 'avista' | 'assinatura' | 'hibrido';

export interface ProgramPhase {
  name: string;
  durationWeeks: number;
  description: string;
}

export interface ProgramService {
  label: string;
  quantity: number;
  unit: string;
}

export interface ProgramAppEntitlement {
  key: string;
  label: string;
  enabled: boolean;
}

export interface ProgramRequiredDocument {
  label: string;
  required: boolean;
}

export interface ClinicProgram {
  id: string;
  name: string;
  programType: ProgramType;
  objective: string;
  durationWeeks: number;
  status: ProgramStatus;
  phases: ProgramPhase[];
  includedServices: ProgramService[];
  checkInsTotal: number;
  checkInFrequency: string;
  appEntitlements: ProgramAppEntitlement[];
  requiredDocuments: ProgramRequiredDocument[];
  checkinTemplates?: ProgramBuilderCheckinTemplate[];
  team?: ProgramBuilderTeamMember[];
  paymentModel: ProgramPaymentModel;
  paymentDescription: string;
  financialConfig?: ProgramBuilderFinancialConfig;
  activePatients: number;
  createdAt: string;
  updatedAt: string;
  color: string;
}

// Commercial catalog types

export type CommercialServiceStatus = 'ativo' | 'inativo' | 'arquivado';
export type CommercialPackageStatus = 'rascunho' | 'ativo' | 'inativo' | 'arquivado';
export type CommercialRenewalPolicy = 'manual' | 'automatico' | 'sem_renovacao';
export type CommercialDeliveryMode = 'presencial' | 'online' | 'hibrido' | 'interno';
export type CommercialServiceCategory =
  | 'clinico'
  | 'nutricao'
  | 'fitness'
  | 'exame'
  | 'documento'
  | 'suporte'
  | 'outro';

export type UpgradeRequestStatus =
  | 'solicitado'
  | 'cotado'
  | 'aprovado'
  | 'rejeitado'
  | 'cancelado'
  | 'cobranca_pendente'
  | 'concluido';

export interface CommercialService {
  id: string;
  name: string;
  category: CommercialServiceCategory;
  description: string;
  status: CommercialServiceStatus;
  basePriceCents: number;
  durationMinutes?: number | null;
  unit: string;
  deliveryMode: CommercialDeliveryMode;
  packagesCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CommercialPackageService {
  id?: string;
  serviceId: string;
  serviceName: string;
  category?: CommercialServiceCategory | string;
  quantity: number;
  unit: string;
  limitPerPeriod?: number | null;
  position?: number;
}

export interface CommercialProgramLink {
  programId: string;
  programName: string;
  isDefault: boolean;
  status: string;
}

export interface CommercialPackage {
  id: string;
  name: string;
  description: string;
  status: CommercialPackageStatus;
  priceCents: number;
  durationWeeks: number;
  renewalPolicy: CommercialRenewalPolicy;
  communityAccess: boolean;
  priorityChat: boolean;
  benefits: string[];
  usageLimits: Array<{ label: string; value: string }>;
  services: CommercialPackageService[];
  programLinks: CommercialProgramLink[];
  activePatients: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CommercialProgramOption {
  id: string;
  name: string;
  status: ProgramStatus;
  programType: ProgramType;
}

export interface UpgradeRequest {
  id: string;
  patientId: string;
  patientName: string;
  enrollmentId?: string | null;
  currentPackageId?: string | null;
  currentPackageName?: string | null;
  targetPackageId: string;
  targetPackageName: string;
  targetProgramId?: string | null;
  status: UpgradeRequestStatus;
  requestedByRole: 'patient' | 'guardian' | 'staff' | 'system';
  reason: string;
  quoteAmountCents?: number | null;
  quoteCurrency: string;
  quoteNotes: string;
  quoteDueDate?: string | null;
  invoiceId?: string | null;
  invoiceStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  decidedAt?: string | null;
}

export interface PatientCommercialPackage {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  durationWeeks: number;
  renewalPolicy: CommercialRenewalPolicy;
  communityAccess: boolean;
  priorityChat: boolean;
  benefits: string[];
  usageLimits: Array<{ label: string; value: string }>;
  services: Array<{
    serviceId?: string;
    serviceName: string;
    quantity: number;
    unit: string;
    limitPerPeriod?: number | null;
  }>;
  programName?: string | null;
  currentWeek?: number;
  status?: string;
}

export interface PatientUpgradeRequest {
  id: string;
  targetPackageId: string;
  targetPackageName: string;
  status: UpgradeRequestStatus;
  reason: string;
  quoteAmountCents?: number | null;
  quoteCurrency: string;
  quoteNotes: string;
  quoteDueDate?: string | null;
  invoiceStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PatientCommercialContext {
  selectedPatientId: string;
  activeEnrollmentId?: string | null;
  activePackage?: PatientCommercialPackage | null;
  upgradeOptions: PatientCommercialPackage[];
  upgradeRequests: PatientUpgradeRequest[];
  lastCheckedAt?: string | null;
}

// ─── Program Builder types ────────────────────────────────────────────────────

export type BuilderStepKey =
  | 'dados_gerais'
  | 'fases'
  | 'servicos'
  | 'entitlements'
  | 'checkins'
  | 'documentos'
  | 'financeiro'
  | 'equipe'
  | 'revisao';

export interface BuilderStep {
  key: BuilderStepKey;
  label: string;
  description: string;
}

export interface ProgramBuilderTeamMember {
  id: string;
  name: string;
  role: string;
  specialty: string;
}

export interface ProgramBuilderCheckinTemplate {
  id: string;
  label: string;
  frequency: string;
  channel: 'app' | 'whatsapp' | 'email' | 'presencial';
  questions: string[];
}

export interface ProgramBuilderFinancialConfig {
  paymentModel: ProgramPaymentModel;
  basePrice: number;
  installments?: number;
  discountPercent?: number;
  description: string;
}

export interface ProgramBuilderDraft {
  id?: string;
  name: string;
  programType: ProgramType | '';
  objective: string;
  durationWeeks: number;
  color: string;
  status: ProgramStatus;
  phases: ProgramPhase[];
  includedServices: ProgramService[];
  appEntitlements: ProgramAppEntitlement[];
  checkInsTotal: number;
  checkInFrequency: string;
  checkinTemplates: ProgramBuilderCheckinTemplate[];
  requiredDocuments: ProgramRequiredDocument[];
  financial: ProgramBuilderFinancialConfig;
  team: ProgramBuilderTeamMember[];
}
