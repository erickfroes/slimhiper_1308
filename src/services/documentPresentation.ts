import type { PatientDocumentCategory } from '@/domain/types';
import { getPatientDocumentStatusLabel as getCentralPatientDocumentStatusLabel } from '@/domain/documentStatus';

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  relatorio: 'Relatório',
  report: 'Relatório',
  prescricao: 'Prescrição',
  prescription: 'Prescrição',
  termo: 'Termo',
  term: 'Termo',
  contrato: 'Contrato',
  contract: 'Contrato',
  consentimento: 'Consentimento',
  consent: 'Consentimento',
  orientacao: 'Orientação',
  orientation: 'Orientação',
  pacote_evidencia: 'Pacote de evidência',
  evidence_package: 'Pacote de evidência',
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

export function getPatientDocumentStatusLabel(status: string) {
  return getCentralPatientDocumentStatusLabel(status);
}
