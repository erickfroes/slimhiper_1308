'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { Patient360Summary } from '@/domain/types';
import {
  getMedicalRecordSnapshot,
  getRecordAttachmentSignedUrl,
  removePatientCareTeamMember,
  upsertPatientCareTeamMember,
  type ClinicalNoteSummary,
  type MedicalRecordSnapshot,
  type PatientCareTeamMember,
  type RecordAuditEntry,
  type RecordAttachmentSummary,
} from '@/services/medicalRecordsApi';
import { getPatientClinicalRecords, type ClinicalRecordsData } from '@/services/clinicalRecordsApi';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileArchive,
  FileText,
  FlaskConical,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';

type RecordSubtab = 'evolucao' | 'soap' | 'medidas' | 'anexos' | 'equipe' | 'auditoria';

const SUBTABS: Array<{ id: RecordSubtab; label: string; icon: React.ElementType }> = [
  { id: 'evolucao', label: 'Evolucao', icon: FileText },
  { id: 'soap', label: 'SOAP', icon: Stethoscope },
  { id: 'medidas', label: 'Medidas e labs', icon: Activity },
  { id: 'anexos', label: 'Anexos', icon: FileArchive },
  { id: 'equipe', label: 'Equipe', icon: UsersRound },
  { id: 'auditoria', label: 'Auditoria', icon: ShieldCheck },
];

const roleLabel: Record<string, string> = {
  tenant_owner: 'Responsavel do tenant',
  clinic_admin: 'Admin da clinica',
  physician: 'Medico',
  nutritionist: 'Nutricionista',
  fitness_professional: 'Educador fisico',
  receptionist: 'Recepcao',
  external_professional: 'Profissional externo',
};

interface TabProntuarioProps {
  patientId: string;
  data: Patient360Summary;
  permissions: string[];
}

type TeamDraft = {
  membershipId: string;
  roleLabel: string;
  specialty: string;
  isPrimary: boolean;
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
}

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(value: string) {
  if (value === 'active') return 'Ativo';
  if (value === 'locked') return 'Bloqueado';
  if (value === 'archived') return 'Arquivado';
  if (value === 'final') return 'Final';
  if (value === 'draft') return 'Rascunho';
  return value || '-';
}

function canAskForAudit(permissions: string[]) {
  return permissions.includes('timeline.sensitive.read');
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed">{description}</p>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function NoteCard({ note }: { note: ClinicalNoteSummary }) {
  const isEncounter = note.type === 'encounter';
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
                isEncounter
                  ? 'border-teal-200 bg-teal-50 text-teal-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700',
              ].join(' ')}
            >
              {isEncounter ? <Stethoscope size={11} /> : <FileText size={11} />}
              {isEncounter ? 'Atendimento' : 'Evolucao'}
            </span>
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {statusLabel(note.status)}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-foreground">{note.title}</h3>
        </div>
        <span className="text-xs text-muted-foreground">{formatDateTime(note.createdAt)}</span>
      </div>
      {note.summary && (
        <p className="mt-3 text-sm leading-relaxed text-foreground">{note.summary}</p>
      )}
      {note.body && (
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground scrollbar-thin">
          {note.body}
        </pre>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{note.authorName}</span>
        <span>-</span>
        <span>{roleLabel[note.authorRole] ?? note.authorRole}</span>
        {note.signedAt && (
          <>
            <span>-</span>
            <span>Assinado em {formatDateTime(note.signedAt)}</span>
          </>
        )}
      </div>
    </article>
  );
}

function TeamMemberCard({
  member,
  canManage,
  onRemove,
  removing,
}: {
  member: PatientCareTeamMember;
  canManage: boolean;
  onRemove: (memberId: string) => void;
  removing: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UserRound size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{member.name}</p>
            {member.isPrimary && (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                Principal
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {member.roleLabel || member.specialty || roleLabel[member.roleCode] || member.roleCode}
          </p>
          {member.email && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{member.email}</p>
          )}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => onRemove(member.id)}
            disabled={removing}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`Remover ${member.name}`}
            title="Remover da equipe"
          >
            {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function AuditRow({ entry }: { entry: RecordAuditEntry }) {
  const action = entry.action.replaceAll('_', ' ');
  const metadata = Object.entries(entry.metadata ?? {}).filter(([, value]) => value !== null);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold capitalize text-foreground">{action}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entry.actorName} - {entry.entityType ?? 'registro'}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
      </div>
      {metadata.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {metadata.slice(0, 4).map(([key, value]) => (
            <span
              key={key}
              className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {key}: {String(value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentRow({
  attachment,
  patientId,
}: {
  attachment: RecordAttachmentSummary;
  patientId: string;
}) {
  const [loadingUrl, setLoadingUrl] = useState(false);

  const handleOpen = async () => {
    setLoadingUrl(true);
    const result = await getRecordAttachmentSignedUrl(attachment.id, patientId);
    setLoadingUrl(false);

    if (result.error || !result.data?.url) {
      toast.error(result.error?.message ?? 'Nao foi possivel abrir o anexo.');
      return;
    }

    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{attachment.fileName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatBytes(attachment.sizeBytes)} - {attachment.uploadedByName} -{' '}
          {formatDateTime(attachment.createdAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleOpen()}
        disabled={loadingUrl || attachment.status !== 'uploaded'}
        className="btn-secondary justify-center px-3 py-1.5 text-xs"
      >
        {loadingUrl ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        Abrir
      </button>
    </div>
  );
}

export default function TabProntuario({ patientId, data, permissions }: TabProntuarioProps) {
  const [snapshot, setSnapshot] = useState<MedicalRecordSnapshot | null>(null);
  const [clinicalRecords, setClinicalRecords] = useState<ClinicalRecordsData | null>(null);
  const [activeSubtab, setActiveSubtab] = useState<RecordSubtab>('evolucao');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTeam, setSavingTeam] = useState(false);
  const [removingTeamId, setRemovingTeamId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TeamDraft>({
    membershipId: '',
    roleLabel: '',
    specialty: '',
    isPrimary: false,
  });
  const includeAudit = canAskForAudit(permissions);

  const loadRecord = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [recordResult, recordsResult] = await Promise.all([
      getMedicalRecordSnapshot(patientId, includeAudit),
      getPatientClinicalRecords(patientId),
    ]);

    if (recordResult.error || !recordResult.data) {
      setSnapshot(null);
      setClinicalRecords(recordsResult.data);
      setError(recordResult.error?.message ?? 'Nao foi possivel carregar o prontuario.');
      setLoading(false);
      return;
    }

    setSnapshot(recordResult.data);
    setClinicalRecords(recordsResult.data);
    if (recordsResult.error) {
      toast.warning('Medidas e exames indisponiveis no prontuario.');
    }
    setLoading(false);
  }, [includeAudit, patientId]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      const [recordResult, recordsResult] = await Promise.all([
        getMedicalRecordSnapshot(patientId, includeAudit),
        getPatientClinicalRecords(patientId),
      ]);

      if (cancelled) return;

      if (recordResult.error || !recordResult.data) {
        setSnapshot(null);
        setClinicalRecords(recordsResult.data);
        setError(recordResult.error?.message ?? 'Nao foi possivel carregar o prontuario.');
        setLoading(false);
        return;
      }

      setSnapshot(recordResult.data);
      setClinicalRecords(recordsResult.data);
      setLoading(false);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [includeAudit, patientId]);

  const availableCandidates = useMemo(
    () => snapshot?.careTeamCandidates.filter((candidate) => !candidate.alreadyAssigned) ?? [],
    [snapshot?.careTeamCandidates]
  );

  const encounterNotes = useMemo(
    () => snapshot?.notes.filter((note) => note.type === 'encounter') ?? [],
    [snapshot?.notes]
  );

  const latestMeasurement = clinicalRecords?.latestMeasurement;
  const latestBioimpedance = clinicalRecords?.latestBioimpedance;

  const handleRefresh = () => void loadRecord();

  const handleAddTeamMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.membershipId) {
      toast.error('Selecione um profissional.');
      return;
    }

    setSavingTeam(true);
    const result = await upsertPatientCareTeamMember({
      patientId,
      membershipId: draft.membershipId,
      roleLabel: draft.roleLabel,
      specialty: draft.specialty,
      isPrimary: draft.isPrimary,
    });
    setSavingTeam(false);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    setDraft({ membershipId: '', roleLabel: '', specialty: '', isPrimary: false });
    toast.success('Equipe assistencial atualizada.');
    await loadRecord();
  };

  const handleRemoveTeamMember = async (memberId: string) => {
    setRemovingTeamId(memberId);
    const result = await removePatientCareTeamMember(patientId, memberId);
    setRemovingTeamId(null);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    toast.success('Profissional removido da equipe.');
    await loadRecord();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Prontuario indisponivel</p>
            <p className="mt-1 text-sm text-amber-800">
              {error ?? 'Nao foi possivel carregar o prontuario longitudinal.'}
            </p>
            <button type="button" onClick={handleRefresh} className="btn-secondary mt-4 text-xs">
              <RefreshCw size={13} />
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricTile label="Prontuario" value={statusLabel(snapshot.record.status)} />
        <MetricTile label="Notas longitudinais" value={snapshot.notes.length} />
        <MetricTile label="Equipe ativa" value={snapshot.careTeam.length} />
        <MetricTile
          label="Ultima escrita"
          value={formatDateTime(snapshot.record.lastWrittenAt ?? snapshot.record.updatedAt)}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Prontuario longitudinal</h2>
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                {data.profile.name}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Registro unico do paciente, com SOAP finalizado, evolucoes, medidas, anexos e equipe
              assistencial.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              <RefreshCw size={13} />
              Atualizar
            </button>
            <Link
              href={`/clinic/patients/${patientId}/encounter`}
              className="btn-primary px-3 py-1.5 text-xs"
            >
              <Stethoscope size={13} />
              Abrir SOAP
            </Link>
          </div>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Subabas do prontuario"
        className="flex gap-1 overflow-x-auto border-b border-border pb-1 scrollbar-thin"
      >
        {SUBTABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeSubtab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveSubtab(tab.id)}
              className={[
                'flex items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeSubtab === 'evolucao' && (
        <div className="space-y-3">
          {snapshot.notes.length === 0 ? (
            <EmptyPanel
              title="Sem evolucoes registradas"
              description="Finalizar um atendimento SOAP cria a primeira nota longitudinal deste prontuario."
            />
          ) : (
            snapshot.notes.map((note) => <NoteCard key={note.id} note={note} />)
          )}
        </div>
      )}

      {activeSubtab === 'soap' && (
        <div className="space-y-3">
          {encounterNotes.length === 0 ? (
            <EmptyPanel
              title="Sem SOAP finalizado"
              description="Use o atendimento SOAP para autosalvar rascunhos e finalizar uma nota no prontuario."
            />
          ) : (
            encounterNotes.map((note) => <NoteCard key={note.id} note={note} />)
          )}
        </div>
      )}

      {activeSubtab === 'medidas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <MetricTile label="Peso atual" value={latestMeasurement?.weightKg ?? '-'} />
            <MetricTile label="IMC" value={latestMeasurement?.bmi ?? '-'} />
            <MetricTile
              label="Bioimpedancia"
              value={latestBioimpedance ? formatDate(latestBioimpedance.measuredAt) : '-'}
            />
            <MetricTile label="Exames solicitados" value={clinicalRecords?.labOrders.length ?? 0} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardList size={15} className="text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Historico de medidas</h3>
              </div>
              {(clinicalRecords?.measurements ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma medida registrada.</p>
              ) : (
                <div className="space-y-2">
                  {(clinicalRecords?.measurements ?? []).slice(0, 8).map((measurement) => (
                    <div
                      key={measurement.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {formatDate(measurement.measuredAt)}
                      </span>
                      <span className="font-semibold text-foreground">
                        {measurement.weightKg} kg - IMC {measurement.bmi}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <FlaskConical size={15} className="text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Labs e bioimpedancia</h3>
              </div>
              {(clinicalRecords?.labOrders ?? []).length === 0 &&
              (clinicalRecords?.labResults ?? []).length === 0 &&
              !latestBioimpedance ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum exame ou bioimpedancia registrado.
                </p>
              ) : (
                <div className="space-y-2">
                  {latestBioimpedance && (
                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <p className="font-semibold text-foreground">
                        Bioimpedancia - {formatDate(latestBioimpedance.measuredAt)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Massa magra {latestBioimpedance.leanMassKg ?? '-'} kg, gordura{' '}
                        {latestBioimpedance.fatMassKg ?? '-'} kg
                      </p>
                    </div>
                  )}
                  {(clinicalRecords?.labOrders ?? []).slice(0, 6).map((order) => (
                    <div key={order.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <p className="font-semibold text-foreground">{order.panelName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(order.orderedAt)} - {order.tests.length} exames - {order.status}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeSubtab === 'anexos' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs text-sky-800">
            <div className="flex items-start gap-2">
              <Lock size={14} className="mt-0.5" />
              <p>
                Anexos ficam no bucket privado <strong>clinical-attachments</strong> e abrem por
                link temporario de 5 minutos.
              </p>
            </div>
          </div>
          {snapshot.attachments.length === 0 ? (
            <EmptyPanel
              title="Sem anexos no prontuario"
              description="A estrutura de anexos esta pronta para arquivos clinicos vinculados ao prontuario ou a uma nota."
            />
          ) : (
            snapshot.attachments.map((attachment) => (
              <AttachmentRow key={attachment.id} attachment={attachment} patientId={patientId} />
            ))
          )}
        </div>
      )}

      {activeSubtab === 'equipe' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            {snapshot.careTeam.length === 0 ? (
              <EmptyPanel
                title="Equipe assistencial nao atribuida"
                description="Atribua profissionais para dar continuidade ao cuidado e restringir acesso por equipe quando aplicavel."
              />
            ) : (
              snapshot.careTeam.map((member) => (
                <TeamMemberCard
                  key={member.id}
                  member={member}
                  canManage={snapshot.access.canManageTeam}
                  removing={removingTeamId === member.id}
                  onRemove={(memberId) => void handleRemoveTeamMember(memberId)}
                />
              ))
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Plus size={15} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Editar equipe</h3>
            </div>
            {!snapshot.access.canManageTeam ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
                Seu perfil pode visualizar a equipe, mas nao possui permissao para altera-la.
              </div>
            ) : (
              <form onSubmit={handleAddTeamMember} className="space-y-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                  Profissional
                  <select
                    value={draft.membershipId}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, membershipId: event.target.value }))
                    }
                    className="input-base text-sm"
                    disabled={savingTeam}
                  >
                    <option value="">Selecione</option>
                    {availableCandidates.map((candidate) => (
                      <option key={candidate.membershipId} value={candidate.membershipId}>
                        {candidate.name} - {roleLabel[candidate.roleCode] ?? candidate.roleCode}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                  Papel no caso
                  <input
                    value={draft.roleLabel}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, roleLabel: event.target.value }))
                    }
                    className="input-base text-sm"
                    placeholder="Responsavel clinico"
                    disabled={savingTeam}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                  Especialidade
                  <input
                    value={draft.specialty}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, specialty: event.target.value }))
                    }
                    className="input-base text-sm"
                    placeholder="Endocrinologia, Nutricao..."
                    disabled={savingTeam}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={draft.isPrimary}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, isPrimary: event.target.checked }))
                    }
                    disabled={savingTeam}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  Profissional principal
                </label>
                <button
                  type="submit"
                  disabled={savingTeam}
                  className="btn-primary w-full justify-center"
                >
                  {savingTeam ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Adicionar
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {activeSubtab === 'auditoria' && (
        <div className="space-y-3">
          {!snapshot.access.canViewAudit ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <Lock size={16} className="mt-0.5" />
                <div>
                  <p className="font-semibold">Auditoria restrita</p>
                  <p className="mt-1 text-xs">
                    Apenas administradores ou profissionais com permissao sensivel podem visualizar
                    acessos e escritas do prontuario.
                  </p>
                </div>
              </div>
            </div>
          ) : snapshot.audit.length === 0 ? (
            <EmptyPanel
              title="Sem eventos de auditoria"
              description="Aberturas, autosaves, finalizacoes e edicoes de equipe passam a ser registradas sem conteudo clinico bruto."
            />
          ) : (
            snapshot.audit.map((entry) => <AuditRow key={entry.id} entry={entry} />)
          )}
        </div>
      )}

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800">
        <div className="flex items-start gap-2">
          <CheckCircle2 size={14} className="mt-0.5" />
          <p>
            Abrir esta aba inicializa ou localiza o prontuario unico do paciente e registra
            auditoria operacional sem incluir conteudo clinico bruto nos logs.
          </p>
        </div>
      </div>
    </div>
  );
}
