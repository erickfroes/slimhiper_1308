export type ClinicDocumentStatusKind =
  | 'draft'
  | 'available'
  | 'pending_signature'
  | 'signed'
  | 'failed'
  | 'restricted';

export type ClinicDocumentSignatureStatus =
  | 'assinado'
  | 'pendente'
  | 'nao_requerido'
  | 'recusado'
  | 'expirado'
  | 'falhou';

export const DOCUMENT_FAILED_STATUSES = new Set(['failed', 'expired', 'cancelled', 'canceled']);
export const DOCUMENT_SIGNATURE_PENDING_PROVIDER_STATUSES = new Set(['pending', 'sent', 'viewed']);

export const CLINIC_DOCUMENT_STATUS_LABELS: Record<ClinicDocumentStatusKind, string> = {
  draft: 'Rascunho',
  available: 'Disponível',
  pending_signature: 'Assinatura pendente',
  signed: 'Assinado',
  failed: 'Falha operacional',
  restricted: 'Restrito',
};

export const CLINIC_DOCUMENT_STATUS_CLASSES: Record<ClinicDocumentStatusKind, string> = {
  draft: 'border-blue-200 bg-blue-50 text-blue-700',
  available: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pending_signature: 'border-amber-200 bg-amber-50 text-amber-700',
  signed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  restricted: 'border-slate-200 bg-slate-100 text-slate-700',
};

export const CLINIC_DOCUMENT_SIGNATURE_STATUS_LABELS: Record<
  ClinicDocumentSignatureStatus,
  string
> = {
  assinado: 'Assinado',
  pendente: 'Assinatura pendente',
  nao_requerido: 'Sem assinatura',
  recusado: 'Assinatura recusada',
  expirado: 'Assinatura expirada',
  falhou: 'Falha na assinatura',
};

export const CLINIC_DOCUMENT_SIGNATURE_STATUS_CLASSES: Record<
  ClinicDocumentSignatureStatus,
  string
> = {
  assinado: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pendente: 'border-amber-200 bg-amber-50 text-amber-700',
  nao_requerido: 'border-slate-200 bg-slate-100 text-slate-700',
  recusado: 'border-red-200 bg-red-50 text-red-700',
  expirado: 'border-red-200 bg-red-50 text-red-700',
  falhou: 'border-red-200 bg-red-50 text-red-700',
};

export const CLINIC_DOCUMENT_STATUS_FILTER_OPTIONS = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'generated', label: 'Gerado' },
  { value: 'sent_for_signature', label: 'Enviado para assinatura' },
  { value: 'signed', label: 'Assinado' },
  { value: 'failed', label: 'Falhou' },
] as const;

export const CLINIC_DOCUMENT_SIGNATURE_FILTER_OPTIONS = [
  { value: 'pending', label: 'Pendente' },
  { value: 'sent', label: 'Enviada' },
  { value: 'viewed', label: 'Visualizada' },
  { value: 'signed', label: 'Assinada' },
  { value: 'failed', label: 'Falhou' },
  { value: 'expired', label: 'Expirada' },
] as const;

export function normalizeProviderSignatureStatus(
  status: string | null | undefined,
  hasSignatureRequest = true
): ClinicDocumentSignatureStatus {
  if (!hasSignatureRequest) return 'nao_requerido';
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'signed') return 'assinado';
  if (normalized === 'rejected' || normalized === 'canceled' || normalized === 'cancelled') {
    return 'recusado';
  }
  if (normalized === 'expired') return 'expirado';
  if (normalized === 'failed' || normalized === 'error') return 'falhou';
  return 'pendente';
}

export function getClinicDocumentStatusKind({
  status,
  signatureStatus,
  releasedToPatient,
}: {
  status: string | null | undefined;
  signatureStatus: string | null | undefined;
  releasedToPatient: boolean;
}): ClinicDocumentStatusKind {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase();
  if (signatureStatus === 'assinado' || normalized === 'signed') return 'signed';
  if (signatureStatus === 'pendente' || normalized === 'sent_for_signature') {
    return 'pending_signature';
  }
  if (DOCUMENT_FAILED_STATUSES.has(normalized) || signatureStatus === 'falhou') return 'failed';
  if (normalized === 'draft') return 'draft';
  if (!releasedToPatient) return 'restricted';
  return 'available';
}

export function getPatientDocumentStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    assinado: 'Assinado',
    pendente_assinatura: 'Assinatura pendente',
    em_analise: 'Em análise',
    vencido: 'Vencido',
    cancelado: 'Cancelado',
    disponivel: 'Disponível',
    generated: 'Disponível',
    signed: 'Assinado',
    sent_for_signature: 'Assinatura pendente',
    expired: 'Vencido',
    canceled: 'Cancelado',
    cancelled: 'Cancelado',
    draft: 'Rascunho',
    failed: 'Falhou',
  };
  return (
    labels[String(status ?? '').toLowerCase()] ?? String(status || 'Disponível').replace(/_/g, ' ')
  );
}
