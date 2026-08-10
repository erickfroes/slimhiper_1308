import type {
  AlertSeverity,
  AppointmentStatus,
  AppointmentSummary,
  AppointmentType,
  DashboardAccess,
  DashboardActionCategory,
  DashboardActionItem,
  DashboardActionPriority,
  DashboardAlert,
  DashboardCohortItem,
  DashboardDegradedSection,
  DashboardDocumentPendencyItem,
  DashboardFinancialPendencyItem,
  DashboardLowAdherenceItem,
  DashboardOperationalInsights,
  DashboardOperationalSections,
  DashboardRecentMessageItem,
  DashboardRenewalItem,
  DashboardSectionEnvelope,
  DashboardSnapshot,
  DashboardStats,
  PatientListRow,
  PatientReviewItem,
  WaitingQueueEntry,
} from '@/domain/types';
import { isMockDataEnabled } from '@/lib/mockMode';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface DashboardProvider {
  getDashboardSnapshot(): Promise<DashboardSnapshot>;
}

export interface PatientPortalMetrics {
  periodDays: number;
  portalAccounts: number;
  selfScheduledAppointments: number;
  completedSelfScheduledAppointments: number;
  avulsoInvoiceAmountCents: number;
  paidPortalInvoiceAmountCents: number;
  lowAdherencePatients: number;
}

type BrowserSupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

function normalizePatientPortalMetrics(value: unknown): PatientPortalMetrics | null {
  const record = asRecord(value);
  const periodDays = Math.round(asNumber(record.periodDays));
  if (periodDays <= 0) return null;
  return {
    periodDays,
    portalAccounts: Math.max(0, Math.round(asNumber(record.portalAccounts))),
    selfScheduledAppointments: Math.max(0, Math.round(asNumber(record.selfScheduledAppointments))),
    completedSelfScheduledAppointments: Math.max(
      0,
      Math.round(asNumber(record.completedSelfScheduledAppointments))
    ),
    avulsoInvoiceAmountCents: Math.max(0, Math.round(asNumber(record.avulsoInvoiceAmountCents))),
    paidPortalInvoiceAmountCents: Math.max(
      0,
      Math.round(asNumber(record.paidPortalInvoiceAmountCents))
    ),
    lowAdherencePatients: Math.max(0, Math.round(asNumber(record.lowAdherencePatients))),
  };
}

const actionCategories = new Set<DashboardActionCategory>([
  'fila',
  'adesao',
  'clinico',
  'financeiro',
  'documento',
  'mensagem',
  'renovacao',
  'comercial',
  'estoque',
]);

const actionPriorities = new Set<DashboardActionPriority>(['critico', 'alto', 'medio', 'baixo']);

const priorityRank: Record<DashboardActionPriority, number> = {
  critico: 0,
  alto: 1,
  medio: 2,
  baixo: 3,
};

function isMockExplicitlyEnabled(): boolean {
  return isMockDataEnabled();
}

export function canUseMockDashboardProvider(): boolean {
  return isMockExplicitlyEnabled();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function clampPercent(value: unknown) {
  return Math.max(0, Math.min(100, Math.round(asNumber(value))));
}

function normalizeAppointmentStatus(status: unknown): AppointmentStatus {
  const normalized = asString(status).toLowerCase();
  if (normalized === 'confirmed' || normalized === 'confirmado') return 'confirmado';
  if (normalized === 'arrived' || normalized === 'chegou') return 'chegou';
  if (normalized === 'triage' || normalized === 'triagem') return 'triagem';
  if (normalized === 'measurements' || normalized === 'medidas') return 'medidas';
  if (normalized === 'bioimpedance' || normalized === 'bioimpedancia') return 'bioimpedancia';
  if (normalized === 'waiting_doctor' || normalized === 'aguardando_medico') {
    return 'aguardando_medico';
  }
  if (normalized === 'in_consultation' || normalized === 'em_consulta') return 'em_consulta';
  if (normalized === 'checkout') return 'checkout';
  if (normalized === 'completed' || normalized === 'concluido') return 'concluido';
  if (normalized === 'no_show' || normalized === 'falta') return 'falta';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'cancelado') {
    return 'cancelado';
  }
  return 'agendado';
}

function normalizeAppointmentType(value: unknown): AppointmentType {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'retorno') return 'retorno';
  if (normalized === 'nutricao' || normalized === 'nutricao_clinica') return 'nutricao';
  if (normalized === 'avaliacao_inicial') return 'avaliacao_inicial';
  if (normalized === 'bioimpedancia') return 'bioimpedancia';
  if (normalized === 'checkup') return 'checkup';
  return 'consulta_medica';
}

function normalizeSeverity(value: unknown): AlertSeverity {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'critical' || normalized === 'critico') return 'critico';
  if (normalized === 'high' || normalized === 'alto') return 'alto';
  if (normalized === 'low' || normalized === 'baixo') return 'baixo';
  return 'medio';
}

function priorityFromSeverity(value: AlertSeverity): DashboardActionPriority {
  if (value === 'critico') return 'critico';
  if (value === 'alto') return 'alto';
  if (value === 'baixo') return 'baixo';
  return 'medio';
}

function normalizeActionPriority(value: unknown): DashboardActionPriority {
  const normalized = asString(value).toLowerCase() as DashboardActionPriority;
  return actionPriorities.has(normalized) ? normalized : 'medio';
}

function normalizeActionCategory(value: unknown): DashboardActionCategory {
  const normalized = asString(value).toLowerCase() as DashboardActionCategory;
  return actionCategories.has(normalized) ? normalized : 'clinico';
}

function normalizeAccess(value: unknown): DashboardAccess {
  const record = asRecord(value);
  return {
    patients: asBoolean(record.patients),
    agenda: asBoolean(record.agenda),
    documents: asBoolean(record.documents),
    financial: asBoolean(record.financial),
    chat: asBoolean(record.chat),
    crm: asBoolean(record.crm),
    inventory: asBoolean(record.inventory),
  };
}

function normalizeDashboardInsights(value: unknown): DashboardOperationalInsights {
  const record = asRecord(value);
  const crm = asRecord(record.crm);
  const inventory = asRecord(record.inventory);

  return {
    crm: {
      canRead: asBoolean(crm.canRead),
      openLeads: asNumber(crm.openLeads),
      overdueTasks: asNumber(crm.overdueTasks),
      href: asString(crm.href, '/clinic/crm'),
    },
    inventory: {
      canRead: asBoolean(inventory.canRead),
      criticalStockItems: asNumber(inventory.criticalStockItems),
      expiringLots: asNumber(inventory.expiringLots),
      daysToExpiry: asNumber(inventory.daysToExpiry, 30),
      href: asString(inventory.href, '/clinic/inventory'),
    },
  };
}

function normalizeStats(value: unknown): DashboardStats {
  const record = asRecord(value);
  return {
    consultasHoje: asNumber(record.consultasHoje),
    consultasConcluidas: asNumber(record.consultasConcluidas),
    filaEspera: asNumber(record.filaEspera),
    programasAtivos: asNumber(record.programasAtivos),
    alertasClinicos: asNumber(record.alertasClinicos),
    mensagensNaoLidas: asNumber(record.mensagensNaoLidas),
    documentosPendentes: asNumber(record.documentosPendentes),
    inadimplentes: asNumber(record.inadimplentes),
    taxaOcupacao: clampPercent(record.taxaOcupacao),
    baixaAdesao: asNumber(record.baixaAdesao),
    renovacoesPendentes: asNumber(record.renovacoesPendentes),
    operationalInsights: normalizeDashboardInsights(record.operationalInsights),
  };
}

function normalizeWaitingQueueEntry(value: unknown): WaitingQueueEntry | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const patientId = asString(record.patientId);
  if (!id || !patientId) return null;

  return {
    id,
    patientId,
    patientName: asString(record.patientName, 'Paciente sem nome'),
    appointmentType: normalizeAppointmentType(record.appointmentType),
    status: normalizeAppointmentStatus(record.status),
    scheduledTime: asString(record.scheduledTime),
    arrivedAt: asString(record.arrivedAt) || undefined,
    waitingMinutes: Math.max(0, Math.round(asNumber(record.waitingMinutes))),
    professionalName: asString(record.professionalName, 'Equipe clinica'),
    room: asString(record.room) || undefined,
  };
}

function normalizeAppointment(value: unknown): AppointmentSummary | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const patientId = asString(record.patientId);
  if (!id || !patientId) return null;

  return {
    id,
    patientId,
    patientName: asString(record.patientName, 'Paciente sem nome'),
    type: normalizeAppointmentType(record.type),
    status: normalizeAppointmentStatus(record.status),
    scheduledAt: asString(record.scheduledAt),
    durationMinutes: Math.max(1, Math.round(asNumber(record.durationMinutes, 30))),
    professionalName: asString(record.professionalName, 'Equipe clinica'),
    professionalRole: asString(record.professionalRole, 'Profissional'),
    roomName: asString(record.roomName) || undefined,
    attendanceLink: asString(record.attendanceLink) || undefined,
    recommendedReturn: asString(record.recommendedReturn) || undefined,
  };
}

function normalizeAlert(value: unknown): DashboardAlert | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const patientId = asString(record.patientId);
  if (!id || !patientId) return null;

  const category = asString(record.category).toLowerCase();
  const allowedCategory: DashboardAlert['category'] =
    category === 'financeiro' ||
    category === 'adesao' ||
    category === 'documento' ||
    category === 'protocolo'
      ? category
      : 'clinico';

  return {
    id,
    patientId,
    severity: normalizeSeverity(record.severity),
    title: asString(record.title, 'Alerta operacional'),
    description: asString(record.description),
    createdAt: asString(record.createdAt),
    isResolved: asBoolean(record.isResolved),
    category: allowedCategory,
  };
}

function normalizeReviewItem(value: unknown): PatientReviewItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;

  return {
    id,
    name: asString(record.name, 'Paciente sem nome'),
    issue: asString(record.issue, 'Revisao pendente'),
    severity: normalizeSeverity(record.severity),
  };
}

function normalizeLowAdherenceItem(value: unknown): DashboardLowAdherenceItem | null {
  const record = asRecord(value);
  const patientId = asString(record.patientId);
  if (!patientId) return null;

  return {
    id: asString(record.id, `low-adherence-${patientId}`),
    patientId,
    patientName: asString(record.patientName, 'Paciente sem nome'),
    adherencePercent: clampPercent(record.adherencePercent),
    reason: asString(record.reason, 'Adesao diaria baixa'),
    severity: normalizeSeverity(record.severity),
    lastSignalAt: asString(record.lastSignalAt) || null,
    href: asString(record.href, `/clinic/patients/${patientId}?tab=timeline`),
  };
}

function normalizeFinancialPendency(value: unknown): DashboardFinancialPendencyItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const patientId = asString(record.patientId);
  if (!id || !patientId) return null;

  return {
    id,
    patientId,
    patientName: asString(record.patientName, 'Paciente sem nome'),
    status: asString(record.status, 'pending'),
    amountCents: asNumber(record.amountCents),
    dueDate: asString(record.dueDate) || null,
    daysOverdue: Math.max(0, Math.round(asNumber(record.daysOverdue))),
    href: asString(record.href, `/clinic/financeiro?patientId=${patientId}`),
  };
}

function normalizeDocumentPendency(value: unknown): DashboardDocumentPendencyItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const patientId = asString(record.patientId);
  if (!id || !patientId) return null;

  return {
    id,
    patientId,
    patientName: asString(record.patientName, 'Paciente sem nome'),
    name: asString(record.name, 'Documento pendente'),
    status: asString(record.status, 'pending'),
    generatedAt: asString(record.generatedAt) || null,
    href: asString(record.href, `/clinic/documents?patientId=${patientId}`),
  };
}

function normalizeRecentMessage(value: unknown): DashboardRecentMessageItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const threadId = asString(record.threadId, id);
  const patientId = asString(record.patientId);
  if (!id || !threadId || !patientId) return null;

  return {
    id,
    threadId,
    patientId,
    patientName: asString(record.patientName, 'Paciente sem nome'),
    unreadCount: Math.max(0, Math.round(asNumber(record.unreadCount))),
    lastMessageAt: asString(record.lastMessageAt) || null,
    owner: asString(record.owner, 'Inbox'),
    href: asString(record.href, `/clinic/inbox?threadId=${threadId}`),
  };
}

function normalizeRenewal(value: unknown): DashboardRenewalItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const patientId = asString(record.patientId);
  if (!id || !patientId) return null;

  return {
    id,
    patientId,
    patientName: asString(record.patientName, 'Paciente sem nome'),
    programName: asString(record.programName, 'Programa ativo'),
    endDate: asString(record.endDate) || null,
    daysToEnd: Math.round(asNumber(record.daysToEnd)),
    href: asString(record.href, `/clinic/patients/${patientId}`),
  };
}

function normalizeCohort(value: unknown): DashboardCohortItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;

  return {
    id,
    label: asString(record.label, 'Coorte'),
    activePatients: asNumber(record.activePatients),
    lowAdherenceCount: asNumber(record.lowAdherenceCount),
    renewalsCount: asNumber(record.renewalsCount),
    href: asString(record.href, '/clinic/programs'),
  };
}

function normalizeActionItem(value: unknown): DashboardActionItem | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const href = asString(record.href);
  if (!id || !href) return null;

  return {
    id,
    category: normalizeActionCategory(record.category),
    priority: normalizeActionPriority(record.priority),
    patientId: asString(record.patientId) || undefined,
    patientName: asString(record.patientName) || undefined,
    title: asString(record.title, 'Acao operacional'),
    reason: asString(record.reason, 'Revisao pendente'),
    owner: asString(record.owner, 'Equipe'),
    slaLabel: asString(record.slaLabel, 'Hoje'),
    ctaLabel: asString(record.ctaLabel, 'Abrir'),
    href,
    metricLabel: asString(record.metricLabel) || undefined,
    createdAt: asString(record.createdAt) || undefined,
    dueAt: asString(record.dueAt) || undefined,
  };
}

function normalizeSection<T>(
  value: unknown,
  mapper: (item: unknown) => T | null,
  fallbackCanRead = true
): DashboardSectionEnvelope<T[]> {
  if (Array.isArray(value)) {
    return {
      canRead: fallbackCanRead,
      data: value.map(mapper).filter((item): item is T => Boolean(item)),
      error: null,
    };
  }

  const record = asRecord(value);
  return {
    canRead: asBoolean(record.canRead, fallbackCanRead),
    data: asArray(record.data)
      .map(mapper)
      .filter((item): item is T => Boolean(item)),
    error: asString(record.error) || null,
    updatedAt: asString(record.updatedAt) || undefined,
  };
}

function statusLabel(status: AppointmentStatus) {
  const labels: Record<AppointmentStatus, string> = {
    agendado: 'Agendado',
    confirmado: 'Confirmado',
    chegou: 'Chegou',
    triagem: 'Triagem',
    medidas: 'Medidas',
    bioimpedancia: 'Bioimpedancia',
    aguardando_medico: 'Aguardando medico',
    em_consulta: 'Em consulta',
    checkout: 'Checkout',
    concluido: 'Concluido',
    falta: 'Falta',
    cancelado: 'Cancelado',
  };
  return labels[status];
}

function waitingPriority(waitingMinutes: number): DashboardActionPriority {
  if (waitingMinutes >= 45) return 'critico';
  if (waitingMinutes >= 20) return 'alto';
  return 'medio';
}

function duePriority(days: number | undefined, threshold: number): DashboardActionPriority {
  return days !== undefined && days >= threshold ? 'alto' : 'medio';
}

function documentPriority(status: string): DashboardActionPriority {
  return status === 'failed' || status === 'expired' ? 'alto' : 'medio';
}

function unreadPriority(unreadCount: number): DashboardActionPriority {
  return unreadCount >= 5 ? 'alto' : 'medio';
}

function buildActionQueue(input: {
  waitingQueue: WaitingQueueEntry[];
  alerts: DashboardAlert[];
  lowAdherence: DashboardLowAdherenceItem[];
  financialPendencies: DashboardFinancialPendencyItem[];
  documentPendencies: DashboardDocumentPendencyItem[];
  recentMessages: DashboardRecentMessageItem[];
  renewalPipeline: DashboardRenewalItem[];
}) {
  const actions: DashboardActionItem[] = [
    ...input.waitingQueue.map((entry) => ({
      id: `queue-${entry.id}`,
      category: 'fila' as const,
      priority: waitingPriority(entry.waitingMinutes),
      patientId: entry.patientId,
      patientName: entry.patientName,
      title: 'Paciente na fila',
      reason: `${statusLabel(entry.status)} aguardando atendimento.`,
      owner: entry.professionalName,
      slaLabel: entry.waitingMinutes > 0 ? `${entry.waitingMinutes} min em espera` : 'No horario',
      ctaLabel: 'Abrir atendimento',
      href: `/clinic/patients/${entry.patientId}/encounter`,
      metricLabel: statusLabel(entry.status),
      createdAt: entry.arrivedAt ?? entry.scheduledTime,
    })),
    ...input.lowAdherence.map((item) => ({
      id: `adherence-${item.patientId}`,
      category: 'adesao' as const,
      priority: priorityFromSeverity(item.severity),
      patientId: item.patientId,
      patientName: item.patientName,
      title: 'Adesao diaria baixa',
      reason: `${item.reason}: ${item.adherencePercent}% hoje.`,
      owner: 'Equipe de acompanhamento',
      slaLabel: 'Acao hoje',
      ctaLabel: 'Abrir 360',
      href: item.href,
      metricLabel: `${item.adherencePercent}%`,
      createdAt: item.lastSignalAt ?? undefined,
    })),
    ...input.alerts.map((alert) => ({
      id: `alert-${alert.id}`,
      category: alert.category === 'adesao' ? ('adesao' as const) : ('clinico' as const),
      priority: priorityFromSeverity(alert.severity),
      patientId: alert.patientId,
      title: alert.title,
      reason: alert.description || 'Alerta ativo no paciente.',
      owner: 'Equipe clinica',
      slaLabel:
        alert.severity === 'critico' || alert.severity === 'alto' ? 'Prioridade hoje' : 'Monitorar',
      ctaLabel: 'Abrir paciente',
      href: `/clinic/patients/${alert.patientId}`,
      createdAt: alert.createdAt,
    })),
    ...input.financialPendencies.map((item) => ({
      id: `financial-${item.id}`,
      category: 'financeiro' as const,
      priority: duePriority(item.daysOverdue, 7),
      patientId: item.patientId,
      patientName: item.patientName,
      title: 'Pendencia financeira',
      reason: `Cobranca ${item.status.toLowerCase()} vinculada ao paciente.`,
      owner: 'Financeiro',
      slaLabel: item.daysOverdue ? `Vencida ha ${item.daysOverdue} dias` : 'Revisar hoje',
      ctaLabel: 'Abrir financeiro',
      href: item.href,
      dueAt: item.dueDate ?? undefined,
    })),
    ...input.documentPendencies.map((item) => ({
      id: `document-${item.id}`,
      category: 'documento' as const,
      priority: documentPriority(item.status),
      patientId: item.patientId,
      patientName: item.patientName,
      title: item.name,
      reason: `Documento com status ${item.status}.`,
      owner: 'Documentos',
      slaLabel: 'Regularizar hoje',
      ctaLabel: 'Abrir documentos',
      href: item.href,
      createdAt: item.generatedAt ?? undefined,
    })),
    ...input.recentMessages.map((item) => ({
      id: `message-${item.threadId}`,
      category: 'mensagem' as const,
      priority: unreadPriority(item.unreadCount),
      patientId: item.patientId,
      patientName: item.patientName,
      title: 'Mensagem sem resposta',
      reason: `${item.unreadCount} mensagens nao lidas na conversa.`,
      owner: item.owner,
      slaLabel: 'Responder hoje',
      ctaLabel: 'Abrir conversa',
      href: item.href,
      metricLabel: `${item.unreadCount} nao lidas`,
      createdAt: item.lastMessageAt ?? undefined,
    })),
    ...input.renewalPipeline.map((item) => ({
      id: `renewal-${item.id}`,
      category: 'renovacao' as const,
      priority:
        item.daysToEnd !== undefined && item.daysToEnd <= 7
          ? ('alto' as const)
          : ('medio' as const),
      patientId: item.patientId,
      patientName: item.patientName,
      title: 'Renovacao proxima',
      reason: `${item.programName} esta perto do encerramento.`,
      owner: 'Comercial',
      slaLabel:
        item.daysToEnd !== undefined && item.daysToEnd >= 0
          ? `${item.daysToEnd} dias restantes`
          : 'Revisar ciclo',
      ctaLabel: 'Abrir programa',
      href: item.href,
      dueAt: item.endDate ?? undefined,
    })),
  ];

  return actions.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]).slice(0, 12);
}

function createSection<T>(
  canRead: boolean,
  data: T[],
  error: string | null = null
): DashboardSectionEnvelope<T[]> {
  return { canRead, data, error };
}

function collectDegradedSections(
  value: unknown,
  sections: DashboardOperationalSections
): DashboardDegradedSection[] {
  const declared = asArray(asRecord(value).degradedSections)
    .map((item) => {
      const record = asRecord(item);
      const key = asString(record.key);
      if (!key) return null;
      return {
        key,
        label: asString(record.label, key),
        canRead: asBoolean(record.canRead),
        error: asString(record.error, 'Leitura parcial indisponivel.'),
      };
    })
    .filter((item): item is DashboardDegradedSection => Boolean(item));

  const sectionLabels: Array<[keyof DashboardOperationalSections, string]> = [
    ['lowAdherence', 'Baixa adesao'],
    ['financialPendencies', 'Pendencias financeiras'],
    ['documentPendencies', 'Pendencias documentais'],
    ['recentMessages', 'Mensagens recentes'],
    ['renewalPipeline', 'Renovacoes'],
    ['cohortPanel', 'Coortes'],
  ];

  for (const [key, label] of sectionLabels) {
    const section = sections[key];
    if (section.error) {
      declared.push({ key, label, canRead: section.canRead, error: section.error });
    }
  }

  const seen = new Set<string>();
  return declared.filter((section) => {
    if (seen.has(section.key)) return false;
    seen.add(section.key);
    return true;
  });
}

function normalizeDashboardSnapshot(value: unknown): DashboardSnapshot {
  const record = asRecord(value);
  const access = normalizeAccess(record.access);
  const sectionsRecord = asRecord(record.sections);
  const stats = normalizeStats(record.stats);
  const waitingQueue = asArray(record.waitingQueue)
    .map(normalizeWaitingQueueEntry)
    .filter((item): item is WaitingQueueEntry => Boolean(item));
  const todayAppointments = asArray(record.todayAppointments)
    .map(normalizeAppointment)
    .filter((item): item is AppointmentSummary => Boolean(item));
  const alerts = asArray(record.alerts)
    .map(normalizeAlert)
    .filter((item): item is DashboardAlert => Boolean(item));
  const patientsNeedingReview = asArray(record.patientsNeedingReview)
    .map(normalizeReviewItem)
    .filter((item): item is PatientReviewItem => Boolean(item));

  const lowAdherence = normalizeSection(
    sectionsRecord.lowAdherence,
    normalizeLowAdherenceItem,
    access.patients
  );
  const financialPendencies = normalizeSection(
    sectionsRecord.financialPendencies,
    normalizeFinancialPendency,
    access.financial
  );
  const documentPendencies = normalizeSection(
    sectionsRecord.documentPendencies,
    normalizeDocumentPendency,
    access.documents
  );
  const recentMessages = normalizeSection(
    sectionsRecord.recentMessages,
    normalizeRecentMessage,
    access.chat
  );
  const renewalPipeline = normalizeSection(
    sectionsRecord.renewalPipeline,
    normalizeRenewal,
    access.patients
  );
  const cohortPanel = normalizeSection(
    sectionsRecord.cohortPanel,
    normalizeCohort,
    access.patients
  );

  const generatedActions = buildActionQueue({
    waitingQueue,
    alerts,
    lowAdherence: lowAdherence.data,
    financialPendencies: financialPendencies.data,
    documentPendencies: documentPendencies.data,
    recentMessages: recentMessages.data,
    renewalPipeline: renewalPipeline.data,
  });
  const actionableQueue = normalizeSection(
    sectionsRecord.actionableQueue ?? generatedActions,
    normalizeActionItem,
    true
  );
  const actionData = actionableQueue.data.length > 0 ? actionableQueue.data : generatedActions;

  const sections: DashboardOperationalSections = {
    actionableQueue: { ...actionableQueue, data: actionData },
    lowAdherence,
    financialPendencies,
    documentPendencies,
    recentMessages,
    renewalPipeline,
    cohortPanel,
  };

  return {
    stats,
    waitingQueue,
    todayAppointments,
    alerts,
    patientsNeedingReview,
    access,
    sections,
    actionableQueue: actionData,
    degradedSections: collectDegradedSections(value, sections),
  };
}

function createMockSections(input: {
  stats: DashboardStats;
  waitingQueue: WaitingQueueEntry[];
  alerts: DashboardAlert[];
  patientsNeedingReview: PatientReviewItem[];
  patients: PatientListRow[];
}): DashboardOperationalSections {
  const lowAdherence = input.patientsNeedingReview.slice(0, 4).map((patient) => ({
    id: `mock-low-${patient.id}`,
    patientId: patient.id,
    patientName: patient.name,
    adherencePercent: patient.severity === 'critico' ? 28 : patient.severity === 'alto' ? 45 : 58,
    reason: patient.issue,
    severity: patient.severity,
    lastSignalAt: new Date().toISOString(),
    href: `/clinic/patients/${patient.id}?tab=timeline`,
  }));
  const financialPendencies = input.patients
    .filter(
      (patient) =>
        patient.financialStatus === 'inadimplente' || patient.financialStatus === 'pendente'
    )
    .slice(0, 4)
    .map((patient, index) => ({
      id: `mock-financial-${patient.id}`,
      patientId: patient.id,
      patientName: patient.name,
      status: patient.financialStatus,
      amountCents: 45000 + index * 12000,
      dueDate: new Date(Date.now() - (index + 2) * 86400000).toISOString().slice(0, 10),
      daysOverdue: index + 2,
      href: `/clinic/financeiro?patientId=${patient.id}`,
    }));
  const documentPendencies = input.patients.slice(0, 3).map((patient, index) => ({
    id: `mock-document-${patient.id}`,
    patientId: patient.id,
    patientName: patient.name,
    name: index === 0 ? 'Contrato pendente de assinatura' : 'Termo de acompanhamento',
    status: index === 0 ? 'pending_signature' : 'draft',
    generatedAt: new Date(Date.now() - index * 3600000).toISOString(),
    href: `/clinic/documents?patientId=${patient.id}`,
  }));
  const recentMessages = input.patients.slice(2, 5).map((patient, index) => ({
    id: `mock-message-${patient.id}`,
    threadId: `mock-thread-${patient.id}`,
    patientId: patient.id,
    patientName: patient.name,
    unreadCount: index + 1,
    lastMessageAt: new Date(Date.now() - (index + 1) * 1800000).toISOString(),
    owner: 'Inbox',
    href: `/clinic/inbox?threadId=mock-thread-${patient.id}`,
  }));
  const renewalPipeline = input.patients.slice(4, 7).map((patient, index) => ({
    id: `mock-renewal-${patient.id}`,
    patientId: patient.id,
    patientName: patient.name,
    programName: patient.activePackage,
    endDate: new Date(Date.now() + (index + 4) * 86400000).toISOString().slice(0, 10),
    daysToEnd: index + 4,
    href: `/clinic/patients/${patient.id}`,
  }));
  const cohortPanel = [
    {
      id: 'mock-cohort-emagrecimento',
      label: 'Emagrecimento',
      activePatients: input.patients.filter((patient) => patient.programType === 'emagrecimento')
        .length,
      lowAdherenceCount: lowAdherence.length,
      renewalsCount: renewalPipeline.length,
      href: '/clinic/programs',
    },
    {
      id: 'mock-cohort-longevidade',
      label: 'Longevidade',
      activePatients: input.patients.filter((patient) => patient.programType === 'longevidade')
        .length,
      lowAdherenceCount: 1,
      renewalsCount: 0,
      href: '/clinic/programs',
    },
  ];

  const actions = buildActionQueue({
    waitingQueue: input.waitingQueue,
    alerts: input.alerts,
    lowAdherence,
    financialPendencies,
    documentPendencies,
    recentMessages,
    renewalPipeline,
  });

  return {
    actionableQueue: createSection(true, actions),
    lowAdherence: createSection(true, lowAdherence),
    financialPendencies: createSection(true, financialPendencies),
    documentPendencies: createSection(true, documentPendencies),
    recentMessages: createSection(true, recentMessages),
    renewalPipeline: createSection(true, renewalPipeline),
    cohortPanel: createSection(true, cohortPanel),
  };
}

let mockDashboardProviderPromise: Promise<DashboardProvider> | null = null;

function getMockDashboardProvider(): Promise<DashboardProvider> {
  mockDashboardProviderPromise ??= import('@/services/mockApi').then((mockApi) => ({
    async getDashboardSnapshot() {
      const [stats, waitingQueue, todayAppointments, alerts, patientsNeedingReview, patients] =
        await Promise.all([
          mockApi.getDashboardStats(),
          mockApi.getWaitingQueue(),
          mockApi.getTodayAppointments(),
          mockApi.getDashboardAlerts(),
          mockApi.getPatientsNeedingReview(),
          mockApi.getPatientList(),
        ]);

      const access: DashboardAccess = {
        patients: true,
        agenda: true,
        documents: true,
        financial: true,
        chat: true,
        crm: true,
        inventory: true,
      };
      const sections = createMockSections({
        stats,
        waitingQueue,
        alerts,
        patientsNeedingReview,
        patients,
      });

      return {
        stats: {
          ...stats,
          baixaAdesao: sections.lowAdherence.data.length,
          renovacoesPendentes: sections.renewalPipeline.data.length,
        },
        waitingQueue,
        todayAppointments,
        alerts,
        patientsNeedingReview,
        access,
        sections,
        actionableQueue: sections.actionableQueue.data,
        degradedSections: [],
      };
    },
  }));

  return mockDashboardProviderPromise;
}

async function getRpcDashboardSnapshot(supabase: BrowserSupabaseClient) {
  const { data, error } = await supabase.rpc('get_clinic_dashboard_snapshot', {
    p_target_date: null,
    p_limit: 12,
  });

  if (error) throw error;
  return normalizeDashboardSnapshot(data);
}

const supabaseDashboardProvider: DashboardProvider = {
  async getDashboardSnapshot() {
    return getRpcDashboardSnapshot(createBrowserSupabaseClient());
  },
};

async function runDashboardOperation<T>(
  operation: (provider: DashboardProvider) => Promise<T>
): Promise<T> {
  const provider = await getDashboardProvider();
  return operation(provider);
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  return runDashboardOperation((provider) => provider.getDashboardSnapshot());
}

export async function getClinicPatientPortalMetrics(): Promise<PatientPortalMetrics | null> {
  if (isMockDataEnabled()) {
    return {
      periodDays: 30,
      portalAccounts: 0,
      selfScheduledAppointments: 0,
      completedSelfScheduledAppointments: 0,
      avulsoInvoiceAmountCents: 0,
      paidPortalInvoiceAmountCents: 0,
      lowAdherencePatients: 0,
    };
  }
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('get_clinic_patient_portal_metrics', { p_days: 30 });
  if (error) throw error;
  return normalizePatientPortalMetrics(data);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const snapshot = await getDashboardSnapshot();
  return snapshot.stats;
}

export async function getWaitingQueue(): Promise<WaitingQueueEntry[]> {
  const snapshot = await getDashboardSnapshot();
  return snapshot.waitingQueue;
}

export async function getTodayAppointments(): Promise<AppointmentSummary[]> {
  const snapshot = await getDashboardSnapshot();
  return snapshot.todayAppointments;
}

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  const snapshot = await getDashboardSnapshot();
  return snapshot.alerts;
}

export async function getPatientsNeedingReview(): Promise<PatientReviewItem[]> {
  const snapshot = await getDashboardSnapshot();
  return snapshot.patientsNeedingReview;
}

async function getDashboardProvider(): Promise<DashboardProvider> {
  if (canUseMockDashboardProvider()) return getMockDashboardProvider();
  return supabaseDashboardProvider;
}
