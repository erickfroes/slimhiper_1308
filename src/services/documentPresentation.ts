import type { PatientDocument360Item, PatientDocumentCategory } from '@/domain/types';

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  relatorio: 'Relatorio',
  report: 'Relatorio',
  prescricao: 'Prescricao',
  prescription: 'Prescricao',
  termo: 'Termo',
  term: 'Termo',
  contrato: 'Contrato',
  contract: 'Contrato',
  consentimento: 'Consentimento',
  consent: 'Consentimento',
  orientacao: 'Orientacao',
  orientation: 'Orientacao',
  pacote_evidencia: 'Pacote de evidencia',
  evidence_package: 'Pacote de evidencia',
  outros: 'Outros',
  other: 'Outros',
};

export const DOCUMENT_CATEGORY_ORDER: PatientDocumentCategory[] = [
  'relatorio',
  'prescricao',
  'termo',
  'contrato',
  'consentimento',
  'orientacao',
  'pacote_evidencia',
  'outros',
];

export function normalizeDocumentCategory(
  value: string | null | undefined
): PatientDocumentCategory {
  const normalized = String(value ?? 'outros')
    .trim()
    .toLowerCase();
  if (normalized === 'report') return 'relatorio';
  if (normalized === 'prescription') return 'prescricao';
  if (normalized === 'term') return 'termo';
  if (normalized === 'contract') return 'contrato';
  if (normalized === 'consent') return 'consentimento';
  if (normalized === 'orientation') return 'orientacao';
  if (normalized === 'evidence_package') return 'pacote_evidencia';
  if (DOCUMENT_CATEGORY_ORDER.includes(normalized as PatientDocumentCategory)) {
    return normalized as PatientDocumentCategory;
  }
  return 'outros';
}

export function getDocumentCategoryLabel(value: string | null | undefined) {
  const normalized = normalizeDocumentCategory(value);
  return DOCUMENT_CATEGORY_LABELS[normalized] ?? normalized.replace(/_/g, ' ');
}

export function getPatientDocumentStatusLabel(status: PatientDocument360Item['status'] | string) {
  const labels: Record<string, string> = {
    assinado: 'Assinado',
    pendente_assinatura: 'Pendente assinatura',
    em_analise: 'Em analise',
    vencido: 'Vencido',
    cancelado: 'Cancelado',
    disponivel: 'Disponivel',
    generated: 'Disponivel',
    signed: 'Assinado',
    sent_for_signature: 'Pendente assinatura',
    expired: 'Vencido',
    canceled: 'Cancelado',
    cancelled: 'Cancelado',
  };
  return labels[String(status).toLowerCase()] ?? String(status || 'Disponivel').replace(/_/g, ' ');
}
