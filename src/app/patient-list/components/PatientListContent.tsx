'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Search,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  Eye,
  MessageSquare,
  Flag,
  AlertTriangle,
  CheckCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  Phone,
  Pencil,
  ClipboardList,
  ShieldAlert,
  CalendarClock,
  FileText,
  WalletCards,
  ArrowRight,
  Activity,
  LockKeyhole,
  Camera,
  UserPlus,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { SkeletonTableRow } from '@/components/LoadingSkeleton';
import Dialog from '@/components/ui/Dialog';
import {
  createPatient,
  createPatientReviewFlag,
  auditPatientWalletContextOpen,
  getPatientFormSnapshot,
  getPatientPortalAccessStatus,
  getPatientWalletSnapshot,
  invitePatientPortalAccess,
  managePatientPortalAccess,
  updatePatient,
  type PatientMutationInput,
  type PatientPortalAccessStatus,
} from '@/services/patientsApi';
import {
  DEFAULT_PORTAL_INVITE_MESSAGE,
  createPatientInviteAfterCreate,
  describePortalAccessError,
  isValidEmail,
  toInvitePayload,
  validateInvitePrerequisites,
} from '../lib/patientPortalInviteHelpers.js';
import type {
  ProgramType,
  FinancialStatus,
  AdherenceLevel,
  PatientStatus,
  PatientPriorityBand,
  PatientWalletAccess,
  PatientWalletRow,
  PatientWalletSnapshot,
} from '@/domain/types';

// ─── Types & helpers ──────────────────────────────────────────────────────────

type SortKey =
  | 'name'
  | 'age'
  | 'activePackage'
  | 'currentWeek'
  | 'weeklyAdherence'
  | 'financialStatus'
  | 'priorityScore';
type SortDir = 'asc' | 'desc';

const programTypeLabel: Record<ProgramType, string> = {
  emagrecimento: 'Emagrecimento',
  hipertrofia: 'Hipertrofia',
  recomposicao: 'Recomposição',
  saude_metabolica: 'Saúde Metabólica',
  longevidade: 'Longevidade',
};

const programTypeColor: Record<ProgramType, string> = {
  emagrecimento: 'bg-teal-50 text-teal-700',
  hipertrofia: 'bg-indigo-50 text-indigo-700',
  recomposicao: 'bg-purple-50 text-purple-700',
  saude_metabolica: 'bg-blue-50 text-blue-700',
  longevidade: 'bg-amber-50 text-amber-700',
};

function adherenceBg(level: AdherenceLevel): string {
  return {
    excelente: 'text-emerald-700',
    bom: 'text-teal-700',
    regular: 'text-amber-700',
    critico: 'text-red-700',
  }[level];
}

const priorityBandLabel: Record<PatientPriorityBand, string> = {
  critico: 'Critica',
  alto: 'Alta',
  medio: 'Media',
  baixo: 'Baixa',
};

const priorityBandColor: Record<PatientPriorityBand, string> = {
  critico: 'border-red-200 bg-red-50 text-red-700',
  alto: 'border-orange-200 bg-orange-50 text-orange-700',
  medio: 'border-amber-200 bg-amber-50 text-amber-700',
  baixo: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const priorityFilterOptions: Array<{ value: PatientPriorityBand; label: string }> = [
  { value: 'critico', label: 'Critica' },
  { value: 'alto', label: 'Alta' },
  { value: 'medio', label: 'Media' },
  { value: 'baixo', label: 'Baixa' },
];

function PriorityBadge({ band, score }: { band: PatientPriorityBand; score?: number }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
        priorityBandColor[band],
      ].join(' ')}
    >
      <ShieldAlert size={11} />
      {priorityBandLabel[band]}
      {typeof score === 'number' ? <span className="tabular-nums">{score}</span> : null}
    </span>
  );
}

function formatDateTime(value: string | undefined) {
  if (!value) return 'Sem registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem registro';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function sectionStatus(access: PatientWalletAccess[keyof PatientWalletAccess]) {
  return access.canRead ? 'Liberado' : (access.error ?? 'Sem permissao');
}

function WalletMetric({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon size={15} className="text-muted-foreground" />
      </div>
      <p className="mt-2 text-xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function PatientContextDrawer({
  patient,
  access,
  reviewing,
  onClose,
  onMarkReview,
}: {
  patient: PatientWalletRow;
  access: PatientWalletAccess;
  reviewing: boolean;
  onClose: () => void;
  onMarkReview: (patientId: string) => void;
}) {
  const lockedSections = Object.entries(access).filter(([, section]) => !section.canRead);

  return (
    <Dialog
      open
      title={patient.name}
      description="Contexto operacional da carteira. O Paciente 360 continua sendo a ficha completa."
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="right"
      mobileFullscreen
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <PriorityBadge band={patient.priorityBand} score={patient.priorityScore} />
              <p className="mt-3 text-sm font-semibold text-foreground">
                {patient.scoreExplanation}
              </p>
            </div>
            <div className="rounded-lg bg-card px-3 py-2 text-center shadow-sm">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">Score</p>
              <p className="text-2xl font-bold text-foreground tabular-nums">
                {patient.priorityScore}
              </p>
            </div>
          </div>

          {patient.scoreReasons.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {patient.scoreReasons.map((reason) => (
                <li key={`${patient.id}-${reason}`} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Sem motivo critico na carga atual.</p>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href={patient.nextAction.href} className="btn-primary text-sm">
              <ArrowRight size={15} />
              {patient.nextAction.label}
            </Link>
            <Link href={`/clinic/patients/${patient.id}`} className="btn-secondary text-sm">
              <Eye size={15} />
              Abrir 360
            </Link>
            <button
              type="button"
              disabled={reviewing}
              onClick={() => onMarkReview(patient.id)}
              className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Flag size={15} />
              {reviewing ? 'Marcando...' : 'Marcar revisao'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <WalletMetric
            label="Adesao"
            value={`${patient.weeklyAdherence}%`}
            helper={patient.adherenceLevel}
            icon={Activity}
          />
          <WalletMetric
            label="Proxima consulta"
            value={patient.nextAppointment ?? 'Sem agenda'}
            helper={formatDateTime(patient.nextAppointmentAt)}
            icon={CalendarClock}
          />
          <WalletMetric
            label="Documentos"
            value={access.documents.canRead ? patient.pendingDocumentCount : '-'}
            helper={sectionStatus(access.documents)}
            icon={FileText}
          />
          <WalletMetric
            label="Chat"
            value={access.chat.canRead ? patient.unreadChatCount : '-'}
            helper={
              access.chat.canRead
                ? formatDateTime(patient.lastMessageAt)
                : sectionStatus(access.chat)
            }
            icon={MessageSquare}
          />
        </div>

        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Mapa por secao</h3>
          </div>
          <div className="divide-y divide-border text-sm">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span>Clinico</span>
              <span className="font-medium text-foreground">
                {patient.alertCount} alerta(s), {patient.activeProgramName}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span>Financeiro</span>
              <span className="font-medium text-foreground">
                {access.financial.canRead
                  ? `${patient.financialOverdueCount} vencida(s), ${patient.financialPendingCount} pendente(s)`
                  : sectionStatus(access.financial)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span>Documentos</span>
              <span className="font-medium text-foreground">
                {access.documents.canRead
                  ? `${patient.pendingDocumentCount} pendente(s)`
                  : sectionStatus(access.documents)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span>Chat</span>
              <span className="font-medium text-foreground">
                {access.chat.canRead
                  ? `${patient.unreadChatCount} nao lida(s)`
                  : sectionStatus(access.chat)}
              </span>
            </div>
          </div>
        </div>

        {lockedSections.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <div className="flex gap-2">
              <LockKeyhole size={15} className="mt-0.5 flex-shrink-0" />
              <span>
                Algumas secoes foram omitidas por permissao:{' '}
                {lockedSections.map(([key]) => key).join(', ')}.
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

// ─── Adherence Bar ────────────────────────────────────────────────────────────

function AdherenceBar({ value, level }: { value: number; level: AdherenceLevel }) {
  const color = {
    excelente: 'bg-emerald-500',
    bom: 'bg-teal-500',
    regular: 'bg-amber-400',
    critico: 'bg-red-500',
  }[level];

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-muted rounded-full h-1.5 flex-shrink-0">
        <div
          className={['rounded-full h-1.5 transition-all', color].join(' ')}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className={['text-xs font-semibold tabular-nums', adherenceBg(level)].join(' ')}>
        {value}%
      </span>
    </div>
  );
}

// ─── Sort Header ──────────────────────────────────────────────────────────────

type PatientFormState = {
  fullName: string;
  preferredName: string;
  email: string;
  phone: string;
  cpfMasked: string;
  birthDate: string;
  sexGender: string;
  status: PatientStatus;
  tagsText: string;
  mainComplaint: string;
  careObjective: string;
  originChannel: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  internalNotes: string;
  addressPostalCode: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressDistrict: string;
  addressCity: string;
  addressState: string;
  addressCountry: string;
  secondaryDocument: string;
  alternatePhone: string;
  profession: string;
  preferenceNotes: string;
  consentDataProcessing: boolean;
  consentClinicalCommunication: boolean;
  consentImageUse: boolean;
  consentPortalAccess: boolean;
  invitePortalAccount: boolean;
  primaryGuardianName: string;
  primaryGuardianPhone: string;
  profilePhotoFile: File | null;
  profilePhotoPreviewUrl: string;
};

function emptyPatientForm(): PatientFormState {
  return {
    fullName: '',
    preferredName: '',
    email: '',
    phone: '',
    cpfMasked: '',
    birthDate: '',
    sexGender: '',
    status: 'ativo',
    tagsText: '',
    mainComplaint: '',
    careObjective: '',
    originChannel: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    internalNotes: '',
    addressPostalCode: '',
    addressStreet: '',
    addressNumber: '',
    addressComplement: '',
    addressDistrict: '',
    addressCity: '',
    addressState: '',
    addressCountry: 'Brasil',
    secondaryDocument: '',
    alternatePhone: '',
    profession: '',
    preferenceNotes: '',
    consentDataProcessing: false,
    consentClinicalCommunication: false,
    consentImageUse: false,
    consentPortalAccess: false,
    invitePortalAccount: false,
    primaryGuardianName: '',
    primaryGuardianPhone: '',
    profilePhotoFile: null,
    profilePhotoPreviewUrl: '',
  };
}

function toPatientMutationInput(form: PatientFormState): PatientMutationInput {
  const tags = form.tagsText
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    fullName: form.fullName,
    preferredName: form.preferredName,
    email: form.email,
    phone: form.phone,
    cpfMasked: form.cpfMasked,
    birthDate: form.birthDate,
    sexGender: form.sexGender,
    status: form.status,
    tags,
    mainComplaint: form.mainComplaint,
    careObjective: form.careObjective,
    originChannel: form.originChannel,
    emergencyContactName: form.emergencyContactName,
    emergencyContactPhone: form.emergencyContactPhone,
    internalNotes: form.internalNotes,
    address: {
      postalCode: form.addressPostalCode,
      street: form.addressStreet,
      number: form.addressNumber,
      complement: form.addressComplement,
      district: form.addressDistrict,
      city: form.addressCity,
      state: form.addressState,
      country: form.addressCountry,
    },
    secondaryDocument: form.secondaryDocument,
    alternatePhone: form.alternatePhone,
    profession: form.profession,
    preferenceNotes: form.preferenceNotes,
    consents: {
      dataProcessing: form.consentDataProcessing,
      clinicalCommunication: form.consentClinicalCommunication,
      imageUse: form.consentImageUse,
      portalAccess: form.consentPortalAccess,
    },
    primaryGuardianName: form.primaryGuardianName,
    primaryGuardianPhone: form.primaryGuardianPhone,
    profilePhotoFile: form.profilePhotoFile,
  };
}

type PendingPortalInvite = {
  patientId: string;
  inviteEmail: string;
  invitePhone: string;
  inviteeType: 'patient' | 'guardian';
  relationship: string;
  lastError?: string | null;
};

type PortalInvitePrerequisites = {
  missingEmail: boolean;
  invalidEmail: boolean;
  missingConsent: boolean;
  canInvite: boolean;
  message: string | null;
};

function PatientFormModal({
  mode,
  form,
  error,
  inviteRetryError,
  submitting,
  loading,
  invitePrerequisite,
  inviteRetry,
  inviteSubmitting,
  onChange,
  onClose,
  onSubmit,
  onRetryInvite,
}: {
  mode: 'create' | 'edit';
  form: PatientFormState;
  error: string | null;
  inviteRetryError: string | null;
  submitting: boolean;
  loading: boolean;
  invitePrerequisite: PortalInvitePrerequisites;
  inviteRetry: PendingPortalInvite | null;
  inviteSubmitting: boolean;
  onChange: (patch: Partial<PatientFormState>) => void;
  onClose: () => void;
  onSubmit: () => void;
  onRetryInvite: () => void;
}) {
  const title = mode === 'create' ? 'Novo paciente' : 'Editar paciente';
  const isSubmitDisabled = loading || submitting || (mode === 'create' && !!inviteRetry);

  return (
    <Dialog
      open
      title={title}
      description="Dados sensiveis sao gravados em patient_pii e protegidos por RLS."
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      placement="center"
    >
      <div className="-m-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="space-y-4 px-5 py-5"
        >
          {loading ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              Carregando dados do paciente...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Nome completo
                  <input
                    value={form.fullName}
                    onChange={(event) => onChange({ fullName: event.target.value })}
                    className="input-base text-sm"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Nome social/apelido
                  <input
                    value={form.preferredName}
                    onChange={(event) => onChange({ preferredName: event.target.value })}
                    className="input-base text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => onChange({ email: event.target.value })}
                    className="input-base text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Telefone
                  <input
                    value={form.phone}
                    onChange={(event) => onChange({ phone: event.target.value })}
                    className="input-base text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  CPF mascarado
                  <input
                    value={form.cpfMasked}
                    onChange={(event) => onChange({ cpfMasked: event.target.value })}
                    className="input-base text-sm"
                    placeholder="***.***.***-**"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Nascimento
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={(event) => onChange({ birthDate: event.target.value })}
                    className="input-base text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Genero/sexo
                  <select
                    value={form.sexGender}
                    onChange={(event) => onChange({ sexGender: event.target.value })}
                    className="input-base text-sm"
                  >
                    <option value="">Nao informado</option>
                    <option value="feminino">Feminino</option>
                    <option value="masculino">Masculino</option>
                    <option value="nao_binario">Nao binario</option>
                    <option value="outro">Outro</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => onChange({ status: event.target.value as PatientStatus })}
                    className="input-base text-sm"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="pausado">Pausado</option>
                    <option value="inativo">Inativo</option>
                    <option value="concluido">Concluido</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Queixa principal
                  <textarea
                    value={form.mainComplaint}
                    onChange={(event) => onChange({ mainComplaint: event.target.value })}
                    className="input-base min-h-20 resize-y text-sm"
                    placeholder="Ex.: emagrecimento, dor, retorno, avaliacao inicial"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Objetivo do cuidado
                  <textarea
                    value={form.careObjective}
                    onChange={(event) => onChange({ careObjective: event.target.value })}
                    className="input-base min-h-20 resize-y text-sm"
                    placeholder="Meta clinica ou expectativa do paciente"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Origem/canal
                  <select
                    value={form.originChannel}
                    onChange={(event) => onChange({ originChannel: event.target.value })}
                    className="input-base text-sm"
                  >
                    <option value="">Nao informado</option>
                    <option value="indicacao">Indicacao</option>
                    <option value="instagram">Instagram</option>
                    <option value="google">Google</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="retorno">Retorno</option>
                    <option value="campanha">Campanha</option>
                    <option value="outro">Outro</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Tags
                  <input
                    value={form.tagsText}
                    onChange={(event) => onChange({ tagsText: event.target.value })}
                    className="input-base text-sm"
                    placeholder="Separadas por virgula"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Contato de emergencia
                  <input
                    value={form.emergencyContactName}
                    onChange={(event) => onChange({ emergencyContactName: event.target.value })}
                    className="input-base text-sm"
                    placeholder="Nome"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                  Telefone de emergencia
                  <input
                    value={form.emergencyContactPhone}
                    onChange={(event) => onChange({ emergencyContactPhone: event.target.value })}
                    className="input-base text-sm"
                  />
                </label>
                <div className="md:col-span-2 rounded-xl border border-border bg-muted/20 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Camera size={16} />
                    Foto privada e dados complementares
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      Foto do paciente
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          onChange({
                            profilePhotoFile: file,
                            profilePhotoPreviewUrl: file
                              ? URL.createObjectURL(file)
                              : form.profilePhotoPreviewUrl,
                          });
                        }}
                        className="input-base text-sm"
                      />
                      <span className="text-[11px] font-normal text-muted-foreground">
                        Bucket privado com URL assinada curta.
                      </span>
                    </label>
                    <div className="flex items-center gap-3 md:col-span-2">
                      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-border bg-card text-sm font-semibold text-muted-foreground">
                        {form.profilePhotoPreviewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={form.profilePhotoPreviewUrl}
                            alt="Foto do paciente"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          'Sem foto'
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A imagem nao e publica; a interface usa fallback quando nao houver foto.
                      </p>
                    </div>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      Documento secundario
                      <input
                        value={form.secondaryDocument}
                        onChange={(event) => onChange({ secondaryDocument: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      Telefone alternativo
                      <input
                        value={form.alternatePhone}
                        onChange={(event) => onChange({ alternatePhone: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      Profissao
                      <input
                        value={form.profession}
                        onChange={(event) => onChange({ profession: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      Responsavel principal
                      <input
                        value={form.primaryGuardianName}
                        onChange={(event) => onChange({ primaryGuardianName: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      Telefone do responsavel
                      <input
                        value={form.primaryGuardianPhone}
                        onChange={(event) => onChange({ primaryGuardianPhone: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                  </div>
                </div>

                <div className="md:col-span-2 rounded-xl border border-border bg-muted/20 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Endereco estruturado
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      CEP
                      <input
                        value={form.addressPostalCode}
                        onChange={(event) => onChange({ addressPostalCode: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground md:col-span-2">
                      Logradouro
                      <input
                        value={form.addressStreet}
                        onChange={(event) => onChange({ addressStreet: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      Numero
                      <input
                        value={form.addressNumber}
                        onChange={(event) => onChange({ addressNumber: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      Complemento
                      <input
                        value={form.addressComplement}
                        onChange={(event) => onChange({ addressComplement: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      Bairro
                      <input
                        value={form.addressDistrict}
                        onChange={(event) => onChange({ addressDistrict: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      Cidade
                      <input
                        value={form.addressCity}
                        onChange={(event) => onChange({ addressCity: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      UF
                      <input
                        value={form.addressState}
                        onChange={(event) =>
                          onChange({ addressState: event.target.value.toUpperCase().slice(0, 2) })
                        }
                        className="input-base text-sm"
                        maxLength={2}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                      Pais
                      <input
                        value={form.addressCountry}
                        onChange={(event) => onChange({ addressCountry: event.target.value })}
                        className="input-base text-sm"
                      />
                    </label>
                  </div>
                </div>

                <div className="md:col-span-2 rounded-xl border border-border bg-muted/20 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Consentimentos e preferencias
                  </h3>
                  <div className="grid grid-cols-1 gap-3 text-xs font-semibold text-foreground md:grid-cols-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.consentDataProcessing}
                        onChange={(event) =>
                          onChange({ consentDataProcessing: event.target.checked })
                        }
                      />{' '}
                      Tratamento de dados
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.consentClinicalCommunication}
                        onChange={(event) =>
                          onChange({ consentClinicalCommunication: event.target.checked })
                        }
                      />{' '}
                      Comunicacao clinica
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.consentImageUse}
                        onChange={(event) => onChange({ consentImageUse: event.target.checked })}
                      />{' '}
                      Uso de imagem
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.consentPortalAccess}
                        onChange={(event) =>
                          onChange({ consentPortalAccess: event.target.checked })
                        }
                      />{' '}
                      Liberacao para portal
                    </label>
                    {mode === 'create' && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.invitePortalAccount}
                          disabled={!invitePrerequisite.canInvite && !form.invitePortalAccount}
                          title={
                            invitePrerequisite.message
                              ? `${invitePrerequisite.message} ${DEFAULT_PORTAL_INVITE_MESSAGE}`.trim()
                              : undefined
                          }
                          onChange={(event) =>
                            onChange({ invitePortalAccount: event.target.checked })
                          }
                        />{' '}
                        Convidar no cadastro
                      </label>
                    )}
                  </div>
                  <label className="mt-4 flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                    Observacoes de preferencia
                    <textarea
                      value={form.preferenceNotes}
                      onChange={(event) => onChange({ preferenceNotes: event.target.value })}
                      className="input-base min-h-16 resize-y text-sm"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground md:col-span-2">
                  Observacoes internas
                  <textarea
                    value={form.internalNotes}
                    onChange={(event) => onChange({ internalNotes: event.target.value })}
                    className="input-base min-h-20 resize-y text-sm"
                    placeholder="Restrito a equipe: preferencias, restricoes ou contexto inicial"
                  />
                </label>
              </div>
              {mode === 'create' && invitePrerequisite.message ? (
                <p className="text-xs text-amber-700">{invitePrerequisite.message}</p>
              ) : null}
              {mode === 'create' && inviteRetry && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <p className="mb-2">
                    O paciente foi criado, mas o convite do portal falhou.
                    {inviteRetryError ? ` Motivo: ${inviteRetryError}` : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => onRetryInvite()}
                    disabled={inviteSubmitting}
                    className="btn-secondary text-xs disabled:opacity-60"
                  >
                    {inviteSubmitting ? 'Reenviando convite...' : 'Tentar convidar novamente'}
                  </button>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary text-sm disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="btn-primary text-sm disabled:opacity-60"
            >
              {submitting
                ? 'Salvando...'
                : mode === 'create'
                  ? inviteRetry
                    ? 'Conclua o convite para sair'
                    : 'Cadastrar paciente'
                  : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}

function PortalAccessModal({
  patient,
  status,
  loading,
  error,
  inviteEmail,
  invitePhone,
  inviteeType,
  relationship,
  submitting,
  onClose,
  onChangeInvite,
  onAction,
}: {
  patient: PatientWalletRow;
  status: PatientPortalAccessStatus | null;
  loading: boolean;
  error: string | null;
  inviteEmail: string;
  invitePhone: string;
  inviteeType: 'patient' | 'guardian';
  relationship: string;
  submitting: boolean;
  onClose: () => void;
  onChangeInvite: (patch: {
    inviteEmail?: string;
    invitePhone?: string;
    inviteeType?: 'patient' | 'guardian';
    relationship?: string;
  }) => void;
  onAction: (action: 'invite' | 'activate' | 'suspend' | 'revoke') => void;
}) {
  const statusLabel: Record<PatientPortalAccessStatus['status'], string> = {
    none: 'Sem acesso',
    pending: 'Convite pendente',
    active: 'Ativo',
    suspended: 'Suspenso',
    revoked: 'Revogado',
  };
  const checklist = status?.minimumData ?? {
    hasEmailOrPhone: false,
    hasPortalConsent: false,
    hasPatientRecord: true,
  };

  return (
    <Dialog
      open
      title={`Portal do paciente - ${patient.name}`}
      description="Ative, suspenda ou revogue acesso mantendo vinculo e auditoria."
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      placement="center"
    >
      <div className="space-y-4">
        {loading ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Carregando status do portal...
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Status atual
                  </p>
                  <p className="mt-1 text-lg font-bold text-foreground">
                    {status ? statusLabel[status.status] : 'Indisponivel'}
                  </p>
                </div>
                <LockKeyhole size={22} className="text-primary" />
              </div>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                <span className={checklist.hasPatientRecord ? 'text-emerald-700' : 'text-red-700'}>
                  Registro do paciente
                </span>
                <span className={checklist.hasEmailOrPhone ? 'text-emerald-700' : 'text-red-700'}>
                  Email ou telefone
                </span>
                <span
                  className={checklist.hasPortalConsent ? 'text-emerald-700' : 'text-amber-700'}
                >
                  Consentimento portal
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                Tipo de convite
                <select
                  value={inviteeType}
                  onChange={(event) =>
                    onChangeInvite({ inviteeType: event.target.value as 'patient' | 'guardian' })
                  }
                  className="input-base text-sm"
                >
                  <option value="patient">Paciente</option>
                  <option value="guardian">Responsavel</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                Relacao do responsavel
                <input
                  value={relationship}
                  onChange={(event) => onChangeInvite({ relationship: event.target.value })}
                  className="input-base text-sm"
                  disabled={inviteeType !== 'guardian'}
                  placeholder="Mae, pai, cuidador..."
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                Email validado
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => onChangeInvite({ inviteEmail: event.target.value })}
                  className="input-base text-sm"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                Telefone validado
                <input
                  value={invitePhone}
                  onChange={(event) => onChangeInvite({ invitePhone: event.target.value })}
                  className="input-base text-sm"
                />
              </label>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Vinculos e convites</p>
              <p className="mt-1">
                Contas: {status?.accounts.length ?? 0} · Responsaveis:{' '}
                {status?.guardians.length ?? 0} · Convites: {status?.invites.length ?? 0}
              </p>
            </div>
          </>
        )}
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary text-sm disabled:opacity-60"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => onAction('invite')}
            disabled={loading || submitting}
            className="btn-secondary text-sm disabled:opacity-60"
          >
            Convidar
          </button>
          <button
            type="button"
            onClick={() => onAction('activate')}
            disabled={loading || submitting}
            className="btn-primary text-sm disabled:opacity-60"
          >
            Ativar
          </button>
          <button
            type="button"
            onClick={() => onAction('suspend')}
            disabled={loading || submitting}
            className="btn-secondary text-sm disabled:opacity-60"
          >
            Suspender
          </button>
          <button
            type="button"
            onClick={() => onAction('revoke')}
            disabled={loading || submitting}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
          >
            Revogar
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  const ariaSort = active ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort} className="px-4 py-3 text-left whitespace-nowrap">
      <button
        type="button"
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span
          className={['flex flex-col', active ? 'text-primary' : 'text-muted-foreground/40'].join(
            ' '
          )}
        >
          <ChevronUp size={10} className={active && currentDir === 'asc' ? 'text-primary' : ''} />
          <ChevronDown
            size={10}
            className={active && currentDir === 'desc' ? 'text-primary' : ''}
          />
        </span>
      </button>
    </th>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PAGE_SIZES = [10, 20, 50];
const DERIVED_FILTER_LOAD_LIMIT = 100;

export default function PatientListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') ?? '';
  const [patients, setPatients] = useState<PatientWalletRow[]>([]);
  const [walletSnapshot, setWalletSnapshot] = useState<PatientWalletSnapshot | null>(null);
  const [totalPatients, setTotalPatients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [filterStatus, setFilterStatus] = useState<PatientStatus | ''>('');
  const [filterProgram, setFilterProgram] = useState<ProgramType | ''>('');
  const [filterFinancial, setFilterFinancial] = useState<FinancialStatus | ''>('');
  const [filterAdherence, setFilterAdherence] = useState<AdherenceLevel | ''>('');
  const [filterPriority, setFilterPriority] = useState<PatientPriorityBand | ''>('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [patientFormMode, setPatientFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [patientForm, setPatientForm] = useState<PatientFormState>(() => emptyPatientForm());
  const [patientFormError, setPatientFormError] = useState<string | null>(null);
  const [patientFormLoading, setPatientFormLoading] = useState(false);
  const [patientFormSubmitting, setPatientFormSubmitting] = useState(false);
  const [patientInviteRetry, setPatientInviteRetry] = useState<PendingPortalInvite | null>(null);
  const [patientInviteRetrySubmitting, setPatientInviteRetrySubmitting] = useState(false);
  const [patientInviteRetryError, setPatientInviteRetryError] = useState<string | null>(null);
  const [reviewActionPatientId, setReviewActionPatientId] = useState<string | null>(null);
  const [contextPatient, setContextPatient] = useState<PatientWalletRow | null>(null);
  const [portalPatient, setPortalPatient] = useState<PatientWalletRow | null>(null);
  const [portalStatus, setPortalStatus] = useState<PatientPortalAccessStatus | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalSubmitting, setPortalSubmitting] = useState(false);
  const [portalInvite, setPortalInvite] = useState({
    inviteEmail: '',
    invitePhone: '',
    inviteeType: 'patient' as 'patient' | 'guardian',
    relationship: '',
  });
  const loadRequestIdRef = useRef(0);

  const hasDerivedFilters = Boolean(
    filterProgram || filterFinancial || filterAdherence || filterPriority
  );
  const usesServerPagination = !hasDerivedFilters;

  const loadPatients = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    setLoadError(null);

    const result = await getPatientWalletSnapshot({
      search,
      status: filterStatus,
      page: usesServerPagination ? page : 1,
      pageSize: usesServerPagination ? pageSize : DERIVED_FILTER_LOAD_LIMIT,
    });

    if (loadRequestIdRef.current !== requestId) return;

    if (result.error || !result.data) {
      setPatients([]);
      setWalletSnapshot(null);
      setTotalPatients(0);
      setLoadError(result.error?.message ?? 'Falha ao carregar lista de pacientes.');
      setLoading(false);
      toast.error('Falha ao carregar lista de pacientes.');
      return;
    }

    setPatients(result.data.rows);
    setWalletSnapshot(result.data);
    setTotalPatients(result.data.total);
    setLoading(false);
  }, [filterStatus, page, pageSize, search, usesServerPagination]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    setSearch(initialSearch);
    setPage(1);
  }, [initialSearch]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    let result = [...patients];
    if (filterProgram) result = result.filter((p) => p.programType === filterProgram);
    if (filterFinancial) result = result.filter((p) => p.financialStatus === filterFinancial);
    if (filterAdherence) result = result.filter((p) => p.adherenceLevel === filterAdherence);
    if (filterPriority) result = result.filter((p) => p.priorityBand === filterPriority);
    if (sortKey) {
      result.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === 'number' && typeof bv === 'number')
          return sortDir === 'asc' ? av - bv : bv - av;
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv), 'pt-BR')
          : String(bv).localeCompare(String(av), 'pt-BR');
      });
    }
    return result;
  }, [patients, filterProgram, filterFinancial, filterAdherence, filterPriority, sortKey, sortDir]);

  const effectiveTotalPatients = usesServerPagination ? totalPatients : filtered.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotalPatients / pageSize));
  const paginated = usesServerPagination
    ? filtered
    : filtered.slice((page - 1) * pageSize, page * pageSize);
  const firstVisiblePatient = effectiveTotalPatients === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisiblePatient = usesServerPagination
    ? Math.min((page - 1) * pageSize + paginated.length, effectiveTotalPatients)
    : Math.min(page * pageSize, effectiveTotalPatients);
  const pageWindowStart = Math.max(1, Math.min(page - 2, Math.max(1, totalPages - 4)));
  const visiblePageNumbers = Array.from(
    { length: Math.min(5, totalPages - pageWindowStart + 1) },
    (_, index) => pageWindowStart + index
  );

  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === paginated.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginated.map((p) => p.id)));
  };

  const clearFilters = () => {
    setFilterStatus('');
    setFilterProgram('');
    setFilterFinancial('');
    setFilterAdherence('');
    setFilterPriority('');
    setSearch('');
    setPage(1);
  };

  const closePatientForm = () => {
    if (patientFormSubmitting) return;
    setPatientFormMode(null);
    setEditingPatientId(null);
    setPatientForm(emptyPatientForm());
    setPatientFormError(null);
    setPatientInviteRetry(null);
    setPatientInviteRetryError(null);
    setPatientInviteRetrySubmitting(false);
    setPatientFormLoading(false);
  };

  const openCreatePatient = () => {
    setPatientFormMode('create');
    setEditingPatientId(null);
    setPatientForm(emptyPatientForm());
    setPatientFormError(null);
    setPatientInviteRetry(null);
    setPatientInviteRetryError(null);
    setPatientInviteRetrySubmitting(false);
    setPatientFormLoading(false);
  };

  const openEditPatient = async (patientId: string) => {
    setPatientFormMode('edit');
    setEditingPatientId(patientId);
    setPatientForm(emptyPatientForm());
    setPatientFormError(null);
    setPatientFormLoading(true);

    const result = await getPatientFormSnapshot(patientId);
    setPatientFormLoading(false);

    if (result.error || !result.data) {
      setPatientFormError(result.error?.message ?? 'Falha ao carregar paciente.');
      return;
    }

    setPatientForm({
      fullName: result.data.fullName,
      preferredName: result.data.preferredName,
      email: result.data.email,
      phone: result.data.phone,
      cpfMasked: result.data.cpfMasked,
      birthDate: result.data.birthDate,
      sexGender: result.data.sexGender,
      status: result.data.status,
      tagsText: result.data.tags.join(', '),
      mainComplaint: result.data.mainComplaint,
      careObjective: result.data.careObjective,
      originChannel: result.data.originChannel,
      emergencyContactName: result.data.emergencyContactName,
      emergencyContactPhone: result.data.emergencyContactPhone,
      internalNotes: result.data.internalNotes,
      addressPostalCode: result.data.address.postalCode,
      addressStreet: result.data.address.street,
      addressNumber: result.data.address.number,
      addressComplement: result.data.address.complement,
      addressDistrict: result.data.address.district,
      addressCity: result.data.address.city,
      addressState: result.data.address.state,
      addressCountry: result.data.address.country,
      secondaryDocument: result.data.secondaryDocument,
      alternatePhone: result.data.alternatePhone,
      profession: result.data.profession,
      preferenceNotes: result.data.preferenceNotes,
      consentDataProcessing: result.data.consents.dataProcessing,
      consentClinicalCommunication: result.data.consents.clinicalCommunication,
      consentImageUse: result.data.consents.imageUse,
      consentPortalAccess: result.data.consents.portalAccess,
      invitePortalAccount: false,
      primaryGuardianName: result.data.primaryGuardianName,
      primaryGuardianPhone: result.data.primaryGuardianPhone,
      profilePhotoFile: null,
      profilePhotoPreviewUrl: result.data.profilePhotoUrl ?? '',
    });
    setPatientInviteRetry(null);
    setPatientInviteRetryError(null);
    setPatientInviteRetrySubmitting(false);
  };

  const openPortalAccess = async (patient: PatientWalletRow) => {
    setPortalPatient(patient);
    setPortalStatus(null);
    setPortalError(null);
    setPortalInvite({ inviteEmail: '', invitePhone: '', inviteeType: 'patient', relationship: '' });
    setPortalLoading(true);
    const result = await getPatientPortalAccessStatus(patient.id);
    setPortalLoading(false);
    if (result.error || !result.data) {
      setPortalError(result.error?.message ?? 'Falha ao carregar portal.');
      return;
    }
    setPortalStatus(result.data);
    const firstInvite = result.data.invites[0];
    setPortalInvite({
      inviteEmail: firstInvite?.email ?? '',
      invitePhone: firstInvite?.phone ?? '',
      inviteeType: firstInvite?.type ?? 'patient',
      relationship: firstInvite?.relationship ?? '',
    });
  };

  const handlePortalAction = async (action: 'invite' | 'activate' | 'suspend' | 'revoke') => {
    if (!portalPatient) return;
    const normalizedInviteEmail = portalInvite.inviteEmail.trim().toLowerCase();
    if (action === 'invite' && !isValidEmail(normalizedInviteEmail)) {
      setPortalError('Informe um e-mail válido para enviar o convite.');
      return;
    }

    setPortalSubmitting(true);
    setPortalError(null);
    const payload = {
      inviteeType: portalInvite.inviteeType,
      email: normalizedInviteEmail,
      phone: portalInvite.invitePhone.trim(),
      relationship: portalInvite.relationship.trim(),
    };
    const result =
      action === 'invite'
        ? await invitePatientPortalAccess(portalPatient.id, payload)
        : await managePatientPortalAccess(portalPatient.id, {
            action,
            ...payload,
          });
    setPortalSubmitting(false);
    if (result.error || !result.data) {
      setPortalError(
        describePortalAccessError(
          result.error?.message ?? 'Falha ao atualizar portal.',
          action,
          payload.inviteeType
        )
      );
      return;
    }
    setPortalStatus(result.data);
    toast.success(
      action === 'invite' ? 'Convite enviado por e-mail.' : 'Acesso do portal atualizado.'
    );
  };

  const toPendingInvite = (): PendingPortalInvite => {
    const invite = toInvitePayload(patientForm);
    return {
      ...invite,
      patientId: '',
      inviteeType: 'patient',
      relationship: '',
      lastError: null,
    };
  };

  const invitePatientFromCreate = async (
    patientId: string,
    invite: PendingPortalInvite
  ): Promise<string | null> => {
    const inviteFlow = await createPatientInviteAfterCreate({
      patientId,
      form: {
        email: invite.inviteEmail,
        phone: invite.invitePhone,
        consentPortalAccess: patientForm.consentPortalAccess,
        invitePortalAccount: true,
      },
      invitePatientPortalAccess,
    });
    return inviteFlow.inviteError;
  };
  const handleInviteRetry = async () => {
    if (!patientInviteRetry) return;

    setPatientInviteRetrySubmitting(true);
    const editedInvite = {
      ...patientInviteRetry,
      inviteEmail: patientForm.email.trim().toLowerCase(),
      invitePhone: patientForm.phone.trim(),
    };
    const inviteError = await invitePatientFromCreate(editedInvite.patientId, editedInvite);
    setPatientInviteRetrySubmitting(false);

    if (inviteError) {
      setPatientInviteRetry(editedInvite);
      setPatientInviteRetryError(inviteError);
      setPatientFormError('Paciente criado, mas ainda houve falha ao convidar acesso do portal.');
      return;
    }

    setPatientInviteRetry(null);
    setPatientInviteRetryError(null);
    setPatientFormError(null);
    toast.success('Convite do portal enviado com sucesso.');
    closePatientForm();
    await loadPatients();
  };

  const handleSubmitPatientForm = async () => {
    setPatientFormSubmitting(true);
    setPatientFormError(null);
    setPatientInviteRetryError(null);

    const input = toPatientMutationInput(patientForm);
    const result =
      patientFormMode === 'edit' && editingPatientId
        ? await updatePatient(editingPatientId, input)
        : await createPatient(input);

    setPatientFormSubmitting(false);

    if (result.error || !result.data) {
      setPatientFormError(result.error?.message ?? 'Nao foi possivel salvar paciente.');
      return;
    }

    if (patientFormMode === 'create' && patientForm.invitePortalAccount) {
      const createdInvite = toPendingInvite();
      const invitePayload = {
        ...createdInvite,
        patientId: result.data.id,
      };
      const inviteError = await invitePatientFromCreate(result.data.id, invitePayload);
      if (inviteError) {
        setPatientInviteRetry({
          ...invitePayload,
          lastError: inviteError,
        });
        setPatientInviteRetryError(inviteError);
        setPatientFormError(
          'Paciente cadastrado, mas o convite do portal falhou. Use o botao para tentar novamente.'
        );
      } else {
        setPatientInviteRetry(null);
        setPatientInviteRetryError(null);
        toast.success('Paciente cadastrado e convite enviado.');
        closePatientForm();
      }
    } else {
      toast.success(patientFormMode === 'edit' ? 'Paciente atualizado.' : 'Paciente cadastrado.');
      closePatientForm();
    }

    await loadPatients();
  };

  const handleMarkReview = async (patientId: string) => {
    setReviewActionPatientId(patientId);
    const result = await createPatientReviewFlag(patientId);
    setReviewActionPatientId(null);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Paciente marcado para revisao.');
    await loadPatients();
  };

  const handleBulkReview = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setReviewActionPatientId('bulk');
    const results = await Promise.all(ids.map((id) => createPatientReviewFlag(id)));
    setReviewActionPatientId(null);
    const failed = results.filter((result) => result.error);
    if (failed.length > 0) {
      toast.error(`${failed.length} revisao(oes) nao foram marcadas.`);
    } else {
      toast.success(`${ids.length} paciente(s) marcado(s) para revisao.`);
    }
    setSelectedIds(new Set());
    await loadPatients();
  };

  const openPatientContext = async (patient: PatientWalletRow) => {
    setContextPatient(patient);
    const access = walletSnapshot?.access ?? {
      clinical: { canRead: true },
      financial: { canRead: true },
      documents: { canRead: true },
      chat: { canRead: true },
    };
    const sections = (
      Object.entries(access) as Array<[keyof PatientWalletAccess, { canRead: boolean }]>
    )
      .filter(([, section]) => section.canRead)
      .map(([key]) => key);
    const result = await auditPatientWalletContextOpen(patient.id, sections);
    if (result.error) {
      toast.warning('Contexto aberto, mas a auditoria nao foi registrada.');
    }
  };

  const activeFilterChips = useMemo(
    () =>
      [
        search.trim()
          ? {
              key: 'search',
              label: `Busca: ${search.trim()}`,
              onRemove: () => {
                setSearch('');
                setPage(1);
              },
            }
          : null,
        filterStatus
          ? {
              key: 'status',
              label: `Status: ${filterStatus}`,
              onRemove: () => {
                setFilterStatus('');
                setPage(1);
              },
            }
          : null,
        filterProgram
          ? {
              key: 'program',
              label: `Programa: ${programTypeLabel[filterProgram]}`,
              onRemove: () => {
                setFilterProgram('');
                setPage(1);
              },
            }
          : null,
        filterFinancial
          ? {
              key: 'financial',
              label: `Financeiro: ${filterFinancial}`,
              onRemove: () => {
                setFilterFinancial('');
                setPage(1);
              },
            }
          : null,
        filterAdherence
          ? {
              key: 'adherence',
              label: `Adesao: ${filterAdherence}`,
              onRemove: () => {
                setFilterAdherence('');
                setPage(1);
              },
            }
          : null,
        filterPriority
          ? {
              key: 'priority',
              label: `Prioridade: ${priorityBandLabel[filterPriority]}`,
              onRemove: () => {
                setFilterPriority('');
                setPage(1);
              },
            }
          : null,
      ].filter((chip): chip is { key: string; label: string; onRemove: () => void } =>
        Boolean(chip)
      ),
    [filterAdherence, filterFinancial, filterPriority, filterProgram, filterStatus, search]
  );

  const invitePrerequisite =
    patientFormMode === 'create'
      ? validateInvitePrerequisites(patientForm)
      : {
          missingEmail: false,
          invalidEmail: false,
          missingConsent: false,
          canInvite: true,
          message: null,
        };

  const activeFilters = activeFilterChips.length;
  const localWalletSummary = useMemo(
    () => ({
      highPriority: filtered.filter(
        (patient) => patient.priorityBand === 'critico' || patient.priorityBand === 'alto'
      ).length,
      criticalPriority: filtered.filter((patient) => patient.priorityBand === 'critico').length,
      lowAdherence: filtered.filter((patient) => patient.weeklyAdherence < 60).length,
      pendingDocuments: filtered.reduce(
        (total, patient) => total + patient.pendingDocumentCount,
        0
      ),
      unreadChats: filtered.reduce((total, patient) => total + patient.unreadChatCount, 0),
      pendingFinancial: filtered.filter(
        (patient) =>
          patient.financialStatus === 'inadimplente' || patient.financialStatus === 'pendente'
      ).length,
    }),
    [filtered]
  );

  const priorityPatients = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .filter((patient) => patient.priorityBand === 'critico' || patient.priorityBand === 'alto')
        .slice(0, 4),
    [filtered]
  );

  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
      {patientFormMode && (
        <PatientFormModal
          mode={patientFormMode}
          form={patientForm}
          error={patientFormError}
          inviteRetryError={patientInviteRetryError}
          submitting={patientFormSubmitting}
          loading={patientFormLoading}
          invitePrerequisite={invitePrerequisite}
          inviteRetry={patientFormMode === 'create' ? patientInviteRetry : null}
          inviteSubmitting={patientInviteRetrySubmitting}
          onChange={(patch) => setPatientForm((current) => ({ ...current, ...patch }))}
          onClose={closePatientForm}
          onSubmit={handleSubmitPatientForm}
          onRetryInvite={() => void handleInviteRetry()}
        />
      )}
      {portalPatient && (
        <PortalAccessModal
          patient={portalPatient}
          status={portalStatus}
          loading={portalLoading}
          error={portalError}
          inviteEmail={portalInvite.inviteEmail}
          invitePhone={portalInvite.invitePhone}
          inviteeType={portalInvite.inviteeType}
          relationship={portalInvite.relationship}
          submitting={portalSubmitting}
          onClose={() => setPortalPatient(null)}
          onChangeInvite={(patch) => setPortalInvite((current) => ({ ...current, ...patch }))}
          onAction={(action) => void handlePortalAction(action)}
        />
      )}
      {contextPatient && (
        <PatientContextDrawer
          patient={contextPatient}
          access={
            walletSnapshot?.access ?? {
              clinical: { canRead: true },
              financial: { canRead: true },
              documents: { canRead: true },
              chat: { canRead: true },
            }
          }
          reviewing={reviewActionPatientId === contextPatient.id}
          onClose={() => setContextPatient(null)}
          onMarkReview={(patientId) => void handleMarkReview(patientId)}
        />
      )}

      <PageHeader
        title="Pacientes"
        subtitle={`${totalPatients} pacientes no contrato real - ${patients.filter((p) => p.status === 'ativo').length} ativos nesta carga`}
        actions={
          <button type="button" onClick={openCreatePatient} className="btn-primary text-sm">
            <Users size={15} />
            Novo Paciente
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <WalletMetric
          label="Prioridade alta"
          value={localWalletSummary.highPriority}
          helper={`${localWalletSummary.criticalPriority} critica(s)`}
          icon={ShieldAlert}
        />
        <WalletMetric
          label="Baixa adesao"
          value={localWalletSummary.lowAdherence}
          helper="abaixo de 60%"
          icon={Activity}
        />
        <WalletMetric
          label="Financeiro"
          value={
            walletSnapshot?.access.financial.canRead ? localWalletSummary.pendingFinancial : '-'
          }
          helper={sectionStatus(walletSnapshot?.access.financial ?? { canRead: true })}
          icon={WalletCards}
        />
        <WalletMetric
          label="Documentos"
          value={
            walletSnapshot?.access.documents.canRead ? localWalletSummary.pendingDocuments : '-'
          }
          helper={sectionStatus(walletSnapshot?.access.documents ?? { canRead: true })}
          icon={FileText}
        />
        <WalletMetric
          label="Chat"
          value={walletSnapshot?.access.chat.canRead ? localWalletSummary.unreadChats : '-'}
          helper={sectionStatus(walletSnapshot?.access.chat ?? { canRead: true })}
          icon={MessageSquare}
        />
        <WalletMetric
          label="Carregados"
          value={filtered.length}
          helper={`${walletSnapshot?.summary.total ?? totalPatients} no filtro`}
          icon={ClipboardList}
        />
      </div>

      {priorityPatients.length > 0 ? (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Mapa de prioridade</h2>
              <p className="text-xs text-muted-foreground">
                Pacientes ordenados pelo score explicavel desta carga.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSortKey('priorityScore');
                setSortDir('desc');
              }}
              className="btn-secondary text-xs"
            >
              Ordenar por score
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            {priorityPatients.map((patient) => (
              <button
                key={`priority-${patient.id}`}
                type="button"
                onClick={() => void openPatientContext(patient)}
                className="rounded-lg border border-border bg-muted/20 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{patient.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {patient.nextAction.label}
                    </p>
                  </div>
                  <PriorityBadge band={patient.priorityBand} score={patient.priorityScore} />
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loadError ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <button type="button" onClick={loadPatients} className="btn-secondary text-xs">
              Tentar novamente
            </button>
          </div>
        </div>
      ) : null}

      {/* Search + Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Buscar por nome, documento, telefone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="input-base pl-9"
          />
        </div>

        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className={[
            'btn-secondary gap-2 text-sm',
            filterOpen || activeFilters > 0 ? 'border-primary text-primary' : '',
          ].join(' ')}
        >
          <SlidersHorizontal size={15} />
          Filtros
          {activeFilters > 0 && (
            <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 leading-none font-semibold">
              {activeFilters}
            </span>
          )}
        </button>

        {activeFilters > 0 && (
          <button onClick={clearFilters} className="btn-ghost text-sm gap-1.5 text-negative">
            <X size={14} />
            Limpar filtros
          </button>
        )}
      </div>

      {activeFilterChips.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {chip.label}
              <X size={12} />
            </button>
          ))}
        </div>
      ) : null}

      {/* Filter panel */}
      {filterOpen && (
        <div className="card-base p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 fade-in">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Programa
            </label>
            <select
              value={filterProgram}
              onChange={(e) => {
                setFilterProgram(e.target.value as ProgramType | '');
                setPage(1);
              }}
              className="input-base text-sm"
            >
              <option value="">Todos os programas</option>
              {(Object.keys(programTypeLabel) as ProgramType[]).map((k) => (
                <option key={`prog-filter-${k}`} value={k}>
                  {programTypeLabel[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value as PatientStatus | '');
                setPage(1);
              }}
              className="input-base text-sm"
            >
              <option value="">Todos</option>
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
              <option value="inativo">Inativo</option>
              <option value="concluido">Concluido</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Status Financeiro
            </label>
            <select
              value={filterFinancial}
              onChange={(e) => {
                setFilterFinancial(e.target.value as FinancialStatus | '');
                setPage(1);
              }}
              className="input-base text-sm"
            >
              <option value="">Todos</option>
              <option value="em_dia">Em dia</option>
              <option value="pendente">Pendente</option>
              <option value="inadimplente">Inadimplente</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Adesão
            </label>
            <select
              value={filterAdherence}
              onChange={(e) => {
                setFilterAdherence(e.target.value as AdherenceLevel | '');
                setPage(1);
              }}
              className="input-base text-sm"
            >
              <option value="">Todas</option>
              <option value="excelente">Excelente (≥85%)</option>
              <option value="bom">Bom (70–84%)</option>
              <option value="regular">Regular (55–69%)</option>
              <option value="critico">Crítico (&lt;55%)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Prioridade
            </label>
            <select
              value={filterPriority}
              onChange={(e) => {
                setFilterPriority(e.target.value as PatientPriorityBand | '');
                setPage(1);
              }}
              className="input-base text-sm"
            >
              <option value="">Todas</option>
              {priorityFilterOptions.map((option) => (
                <option key={`priority-filter-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="hidden items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 mb-4 slide-up md:flex">
          <span className="text-sm font-semibold text-primary">
            {selectedIds.size} selecionado(s)
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => router.push('/clinic/inbox?tab=conversas')}
              className="btn-secondary text-xs gap-1.5 active:scale-95"
            >
              <MessageSquare size={13} />
              Enviar mensagem
            </button>
            <button
              type="button"
              disabled={reviewActionPatientId !== null}
              onClick={() => void handleBulkReview()}
              className="btn-secondary text-xs gap-1.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Flag size={13} />
              {reviewActionPatientId === 'bulk' ? 'Marcando...' : 'Marcar para revisao'}
            </button>
            <button
              type="button"
              disabled
              title="Envio real de mensagens entra no módulo de chat/notificações."
              className="hidden"
            >
              <MessageSquare size={13} />
              Enviar mensagem
            </button>
            <button
              type="button"
              disabled
              title="Marcação real de revisão depende de escrita segura em patientsApi."
              className="hidden"
            >
              <Flag size={13} />
              Marcar para revisão
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="btn-ghost text-xs">
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card-base overflow-hidden">
        <div className="divide-y divide-border md:hidden">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={`mobile-skel-${index}`} className="space-y-3 p-4">
                <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-12 rounded-xl bg-muted animate-pulse" />
                  <div className="h-12 rounded-xl bg-muted animate-pulse" />
                </div>
              </div>
            ))
          ) : paginated.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum paciente encontrado"
              description="Tente ajustar os filtros ou o termo de busca para encontrar pacientes."
              action={
                <button onClick={clearFilters} className="btn-secondary text-sm">
                  Limpar filtros
                </button>
              }
            />
          ) : (
            paginated.map((patient) => (
              <article key={patient.id} className="space-y-4 p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-xs font-bold text-primary">
                          {patient.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={patient.avatarUrl}
                              alt={`Foto de ${patient.name}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            patient.name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/clinic/patients/${patient.id}`}
                            className="block truncate text-sm font-semibold text-foreground"
                          >
                            {patient.name}
                          </Link>
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone size={11} />
                            {patient.phone}
                          </p>
                        </div>
                      </div>
                      <PriorityBadge band={patient.priorityBand} score={patient.priorityScore} />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-foreground">Triagem</span>
                    <StatusBadge status={patient.status} size="xs" />
                  </div>
                  <p className="mt-2 text-muted-foreground">{patient.scoreExplanation}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Acao sugerida</span>
                    <span className="text-right font-semibold text-foreground">
                      {patient.nextAction.label}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <span className="text-muted-foreground">Programa</span>
                    <p className="mt-1 font-semibold text-foreground">
                      {programTypeLabel[patient.programType]}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <span className="text-muted-foreground">Semana</span>
                    <p className="mt-1 font-semibold text-foreground">
                      {patient.currentWeek}/{patient.totalWeeks}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <span className="text-muted-foreground">Adesao</span>
                    <div className="mt-2">
                      <AdherenceBar
                        value={patient.weeklyAdherence}
                        level={patient.adherenceLevel}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <span className="text-muted-foreground">Chat</span>
                    <div className="mt-2">
                      <span className="font-semibold text-foreground">
                        {walletSnapshot?.access.chat.canRead
                          ? `${patient.unreadChatCount} nao lida(s)`
                          : 'Sem acesso'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Proxima consulta</span>
                    <span className="text-right font-medium text-foreground">
                      {patient.nextAppointment ?? 'Sem agendamento'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Alertas</span>
                    {patient.alertCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-semibold text-red-700">
                        <AlertTriangle size={11} />
                        {patient.alertCount}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <CheckCircle size={12} />
                        OK
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Documentos</span>
                    <span className="text-right font-medium text-foreground">
                      {walletSnapshot?.access.documents.canRead
                        ? `${patient.pendingDocumentCount} pendente(s)`
                        : 'Sem acesso'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => void openPatientContext(patient)}
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label={`Abrir contexto de ${patient.name}`}
                  >
                    <ClipboardList size={15} />
                  </button>
                  <Link
                    href={`/clinic/patients/${patient.id}`}
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label={`Abrir Paciente 360 de ${patient.name}`}
                  >
                    <Eye size={15} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => void openEditPatient(patient.id)}
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label={`Editar paciente ${patient.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void openPortalAccess(patient)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label={`Gerenciar portal de ${patient.name}`}
                    title="Convidar portal do paciente"
                  >
                    <UserPlus size={15} />
                    Convidar portal do paciente
                  </button>
                  <Link
                    href={`/clinic/inbox?tab=conversas&patientId=${patient.id}`}
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label={`Abrir chat de ${patient.name}`}
                  >
                    <MessageSquare size={15} />
                  </Link>
                  <button
                    type="button"
                    disabled={reviewActionPatientId !== null}
                    onClick={() => void handleMarkReview(patient.id)}
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={`Marcar ${patient.name} para revisao`}
                  >
                    <Flag size={15} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto scrollbar-thin md:block">
          <table className="w-full min-w-[1220px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th scope="col" className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === paginated.length && paginated.length > 0}
                    onChange={toggleAll}
                    className="rounded border-input accent-primary cursor-pointer"
                    aria-label="Selecionar pacientes da pagina"
                  />
                </th>
                <SortableHeader
                  label="Prioridade"
                  sortKey="priorityScore"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Paciente"
                  sortKey="name"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Idade"
                  sortKey="age"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                >
                  Telefone
                </th>
                <SortableHeader
                  label="Programa"
                  sortKey="activePackage"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Semana"
                  sortKey="currentWeek"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Adesão"
                  sortKey="weeklyAdherence"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                >
                  Próx. Consulta
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                >
                  Alertas
                </th>
                <SortableHeader
                  label="Financeiro"
                  sortKey="financialStatus"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                >
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonTableRow key={`skel-row-${i}`} />)
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-0">
                    <EmptyState
                      icon={Users}
                      title="Nenhum paciente encontrado"
                      description="Tente ajustar os filtros ou o termo de busca para encontrar pacientes."
                      action={
                        <button onClick={clearFilters} className="btn-secondary text-sm">
                          Limpar filtros
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                paginated.map((patient, rowIndex) => (
                  <tr
                    key={patient.id}
                    className={[
                      'border-b border-border last:border-0 hover:bg-muted/40 transition-colors group',
                      rowIndex % 2 === 0 ? '' : 'bg-muted/20',
                      selectedIds.has(patient.id) ? 'bg-primary/5' : '',
                    ].join(' ')}
                    onClick={() => void openPatientContext(patient)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(patient.id)}
                        onChange={() => toggleSelect(patient.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-input accent-primary cursor-pointer"
                        aria-label={`Selecionar ${patient.name}`}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <PriorityBadge band={patient.priorityBand} score={patient.priorityScore} />
                    </td>

                    {/* Name + avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 overflow-hidden rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                          {patient.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={patient.avatarUrl}
                              alt={`Foto de ${patient.name}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            patient.name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate max-w-[140px]">
                            {patient.name}
                          </p>
                          <StatusBadge status={patient.status} size="xs" />
                        </div>
                      </div>
                    </td>

                    {/* Age */}
                    <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                      {patient.age} anos
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone size={11} />
                        {patient.phone}
                      </span>
                    </td>

                    {/* Program */}
                    <td className="px-4 py-3">
                      <span
                        className={[
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          programTypeColor[patient.programType],
                        ].join(' ')}
                      >
                        {programTypeLabel[patient.programType]}
                      </span>
                    </td>

                    {/* Week */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary rounded-full h-1.5"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  (patient.currentWeek / Math.max(patient.totalWeeks, 1)) * 100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-foreground tabular-nums">
                          {patient.currentWeek}/{patient.totalWeeks}
                        </span>
                      </div>
                    </td>

                    {/* Adherence */}
                    <td className="px-4 py-3">
                      <AdherenceBar
                        value={patient.weeklyAdherence}
                        level={patient.adherenceLevel}
                      />
                    </td>

                    {/* Next appointment */}
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {patient.nextAppointment ?? (
                        <span className="text-amber-600 font-medium">Sem agendamento</span>
                      )}
                    </td>

                    {/* Alerts */}
                    <td className="px-4 py-3">
                      {patient.alertCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          <AlertTriangle size={11} />
                          {patient.alertCount}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle size={12} />
                          OK
                        </span>
                      )}
                    </td>

                    {/* Financial */}
                    <td className="px-4 py-3">
                      {walletSnapshot?.access.financial.canRead ? (
                        <StatusBadge status={patient.financialStatus} size="xs" />
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                          <LockKeyhole size={11} />
                          Sem acesso
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openPatientContext(patient);
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                          aria-label={`Abrir contexto de ${patient.name}`}
                          title="Abrir contexto"
                        >
                          <ClipboardList size={14} />
                        </button>
                        <Link
                          href={`/clinic/patients/${patient.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                          aria-label={`Abrir Paciente 360 de ${patient.name}`}
                          title="Abrir Paciente 360"
                        >
                          <Eye size={14} />
                        </Link>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openEditPatient(patient.id);
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                          aria-label={`Editar paciente ${patient.name}`}
                          title="Editar paciente"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openPortalAccess(patient);
                          }}
                          className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                          aria-label={`Gerenciar portal de ${patient.name}`}
                          title="Convidar portal do paciente"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <UserPlus size={14} />
                            <span>Convidar portal</span>
                          </span>
                        </button>
                        <Link
                          href={`/clinic/inbox?tab=conversas&patientId=${patient.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                          aria-label={`Abrir chat de ${patient.name}`}
                          title="Abrir chat"
                        >
                          <MessageSquare size={14} />
                        </Link>
                        <button
                          type="button"
                          disabled={reviewActionPatientId !== null}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleMarkReview(patient.id);
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`Marcar ${patient.name} para revisao`}
                          title="Marcar para revisao"
                        >
                          <Flag size={14} />
                        </button>
                        <button
                          type="button"
                          disabled
                          className="hidden"
                          aria-label={`Chat de ${patient.name} indisponivel`}
                          title="Chat real ainda não está liberado no MVP clínico."
                        >
                          <MessageSquare size={14} />
                        </button>
                        <button
                          type="button"
                          disabled
                          className="hidden"
                          aria-label={`Revisao de ${patient.name} indisponivel`}
                          title="Revisão real depende de escrita segura em patientsApi."
                        >
                          <Flag size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && effectiveTotalPatients > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Exibindo {firstVisiblePatient}–{lastVisiblePatient} de {effectiveTotalPatients}{' '}
                pacientes
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="ml-2 text-xs border border-input rounded-lg px-2 py-1 bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={`pagesize-${s}`} value={s}>
                    {s} por página
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Pagina anterior"
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              {pageWindowStart > 1 && <span className="text-xs text-muted-foreground px-1">…</span>}
              {visiblePageNumbers.map((pageNum) => (
                <button
                  key={`page-${pageNum}`}
                  type="button"
                  onClick={() => setPage(pageNum)}
                  aria-label={`Ir para pagina ${pageNum}`}
                  className={[
                    'w-7 h-7 rounded-lg text-xs font-semibold transition-colors',
                    page === pageNum
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border hover:bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {pageNum}
                </button>
              ))}
              {pageWindowStart + visiblePageNumbers.length - 1 < totalPages && (
                <span className="text-xs text-muted-foreground px-1">…</span>
              )}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Proxima pagina"
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
