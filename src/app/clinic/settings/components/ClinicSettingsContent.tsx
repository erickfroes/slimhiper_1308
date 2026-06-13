'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Building2,
  Camera,
  Check,
  ChevronRight,
  Clock,
  CreditCard,
  Edit2,
  FileText,
  Globe,
  Loader2,
  MapPin,
  MessageSquare,
  Palette,
  Plug,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  getClinicSettings,
  inviteClinicMember,
  saveAutoMessageTemplate,
  saveChatServiceHours,
  saveClinicUnit,
  updateComplianceGapStatus,
  updateClinicMemberRole,
  updateClinicMemberProfessionalProfile,
  updateClinicSettings,
  type AutoMessageTemplate,
  type ClinicChatServiceHour,
  type ClinicBrandingSettings,
  type ClinicFinanceSettings,
  type ClinicIntegration,
  type ClinicLegalSettings,
  type ClinicPortalSettings,
  type ClinicProfileSettings,
  type ClinicSettingsSnapshot,
  type ClinicUnit,
  type ClinicUnitStatus,
  type ComplianceGap,
  type ComplianceGapStatus,
  type ProfessionalProfileInput,
  type ProfessionalType,
  type SaveAutoMessageTemplateInput,
  type SaveClinicUnitInput,
} from '@/services/clinicSettingsApi';

type SectionId =
  | 'perfil'
  | 'unidades'
  | 'equipe'
  | 'papeis'
  | 'branding'
  | 'portal'
  | 'chat'
  | 'mensagens'
  | 'legal'
  | 'integracoes'
  | 'financeiro'
  | 'programas'
  | 'compliance';

type ProfileDraft = ClinicProfileSettings & { name: string };

type SaveKey =
  | 'profile'
  | 'branding'
  | 'portal'
  | 'chatHours'
  | 'legal'
  | 'integrations'
  | 'finance'
  | 'programs'
  | 'unit'
  | null;

const SECTIONS: Array<{ id: SectionId; label: string; icon: React.ElementType }> = [
  { id: 'perfil', label: 'Perfil', icon: Building2 },
  { id: 'unidades', label: 'Unidades', icon: MapPin },
  { id: 'equipe', label: 'Equipe', icon: Users },
  { id: 'papeis', label: 'Papeis', icon: ShieldCheck },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'portal', label: 'Portal', icon: Globe },
  { id: 'chat', label: 'Chat', icon: Clock },
  { id: 'mensagens', label: 'Mensagens', icon: MessageSquare },
  { id: 'legal', label: 'Legal', icon: FileText },
  { id: 'integracoes', label: 'Integracoes', icon: Plug },
  { id: 'financeiro', label: 'Financeiro', icon: CreditCard },
  { id: 'programas', label: 'Programas', icon: BookOpen },
  { id: 'compliance', label: 'Compliance', icon: ShieldAlert },
];

const EMPTY_PROFILE: ProfileDraft = {
  name: '',
  cnpj: '',
  email: '',
  phone: '',
  website: '',
  timezone: 'America/Sao_Paulo',
  specialties: '',
  logoUrl: '',
};

const EMPTY_BRANDING: ClinicBrandingSettings = {
  primaryColor: '#0d9488',
  accentColor: '#059669',
  fontFamily: 'Plus Jakarta Sans',
};

const EMPTY_PORTAL: ClinicPortalSettings = {
  url: '',
  selfScheduling: false,
  chatEnabled: false,
  documentsAccess: false,
  financialAccess: false,
  checkInReminder: false,
  npsEnabled: false,
};

const EMPTY_FINANCE: ClinicFinanceSettings = {
  currency: 'BRL',
  defaultDueDay: 10,
  lateFeePercent: 2,
  monthlyInterestPercent: 1,
  pixKey: '',
  autoInvoice: false,
  delinquencyAlerts: true,
  emailReceipts: true,
};

const EMPTY_LEGAL: ClinicLegalSettings = {
  privacyPolicyUrl: '',
  termsUrl: '',
  consentFormVersion: '',
  dpoEmail: '',
  lgpdRequestEmail: '',
  dataRetentionYears: 6,
  requirePatientConsent: true,
};

const EMPTY_UNIT: SaveClinicUnitInput = {
  code: '',
  name: '',
  status: 'active',
  address: '',
  city: '',
  phone: '',
  isMain: false,
};

const EMPTY_AUTO_TEMPLATE: SaveAutoMessageTemplateInput = {
  name: '',
  channel: 'chat',
  triggerEvent: 'after_hours',
  body: '',
  isEnabled: true,
  sortOrder: 0,
};

function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  );
}

function SectionCard({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: SectionId;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card-base overflow-hidden scroll-mt-6">
      <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon size={16} className="text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function InlineAlert({ message, tone = 'error' }: { message: string; tone?: 'error' | 'ok' }) {
  return (
    <div
      className={[
        'flex items-start gap-2 rounded-xl border px-3 py-2 text-sm',
        tone === 'ok'
          ? 'border-positive/20 bg-positive-bg text-positive'
          : 'border-negative/20 bg-negative-bg text-negative',
      ].join(' ')}
    >
      {tone === 'ok' ? (
        <Check size={15} className="mt-0.5" />
      ) : (
        <AlertCircle size={15} className="mt-0.5" />
      )}
      <span>{message}</span>
    </div>
  );
}

function SaveButton({
  children,
  saving,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  saving: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={saving || disabled} className="btn-primary">
      {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
      {children}
    </button>
  );
}

function textStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'active') return 'Ativo';
  if (normalized === 'inactive') return 'Inativo';
  if (normalized === 'archived') return 'Arquivado';
  if (normalized === 'invited') return 'Convidado';
  if (normalized === 'suspended') return 'Suspenso';
  if (normalized === 'revoked') return 'Revogado';
  if (normalized === 'rascunho') return 'Rascunho';
  if (normalized === 'ativo') return 'Ativo';
  if (normalized === 'open') return 'Aberta';
  if (normalized === 'acknowledged') return 'Reconhecida';
  if (normalized === 'resolved') return 'Resolvida';
  if (normalized === 'dismissed') return 'Dispensada';
  return status || 'Indefinido';
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const color =
    normalized === 'active' || normalized === 'ativo'
      ? 'bg-positive-bg text-positive'
      : normalized === 'inactive' || normalized === 'suspended'
        ? 'bg-warning-bg text-warning'
        : 'bg-muted text-muted-foreground';

  return (
    <span className={['rounded-full px-2 py-0.5 text-xs font-medium', color].join(' ')}>
      {textStatus(status)}
    </span>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleDateString('pt-BR');
}

function ComplianceSeverityBadge({ severity }: { severity: ComplianceGap['severity'] }) {
  const config = {
    critical: 'bg-negative-bg text-negative',
    high: 'bg-warning-bg text-warning',
    medium: 'bg-primary/10 text-primary',
    low: 'bg-muted text-muted-foreground',
  };
  const label = {
    critical: 'Critica',
    high: 'Alta',
    medium: 'Media',
    low: 'Baixa',
  };

  return (
    <span className={['rounded-full px-2 py-0.5 text-xs font-medium', config[severity]].join(' ')}>
      {label[severity]}
    </span>
  );
}

function SectionPerfil({
  draft,
  setDraft,
  saving,
  onSave,
}: {
  draft: ProfileDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProfileDraft>>;
  saving: boolean;
  onSave: () => void;
}) {
  const update = (key: keyof ProfileDraft, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-primary/30 bg-primary/10">
          <Camera size={20} className="text-primary/70" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Identidade da clinica</p>
          <p className="text-xs text-muted-foreground">
            Nome e dados operacionais salvos em tenant settings, sem tokens no browser.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Nome da clinica
          <input
            value={draft.name}
            onChange={(event) => update('name', event.target.value)}
            className="input-base"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          CNPJ
          <input
            value={draft.cnpj}
            onChange={(event) => update('cnpj', event.target.value)}
            className="input-base"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          E-mail principal
          <input
            type="email"
            value={draft.email}
            onChange={(event) => update('email', event.target.value)}
            className="input-base"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Telefone
          <input
            value={draft.phone}
            onChange={(event) => update('phone', event.target.value)}
            className="input-base"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Site
          <input
            value={draft.website}
            onChange={(event) => update('website', event.target.value)}
            className="input-base"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Fuso horario
          <select
            value={draft.timezone}
            onChange={(event) => update('timezone', event.target.value)}
            className="input-base"
          >
            <option value="America/Sao_Paulo">America/Sao_Paulo</option>
            <option value="America/Manaus">America/Manaus</option>
            <option value="America/Belem">America/Belem</option>
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground md:col-span-2">
          Especialidades
          <input
            value={draft.specialties}
            onChange={(event) => update('specialties', event.target.value)}
            className="input-base"
          />
        </label>
      </div>

      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={onSave}>
          Salvar perfil
        </SaveButton>
      </div>
    </div>
  );
}

function SectionUnidades({
  units,
  unitDraft,
  setUnitDraft,
  formOpen,
  setFormOpen,
  saving,
  onSave,
}: {
  units: ClinicUnit[];
  unitDraft: SaveClinicUnitInput;
  setUnitDraft: React.Dispatch<React.SetStateAction<SaveClinicUnitInput>>;
  formOpen: boolean;
  setFormOpen: (value: boolean) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const update = (key: keyof SaveClinicUnitInput, value: string | boolean) =>
    setUnitDraft((prev) => ({ ...prev, [key]: value }));

  const startNew = () => {
    setUnitDraft(EMPTY_UNIT);
    setFormOpen(true);
  };

  const startEdit = (unit: ClinicUnit) => {
    setUnitDraft({
      id: unit.id,
      code: unit.code,
      name: unit.name,
      status: unit.status,
      address: unit.address,
      city: unit.city,
      phone: unit.phone,
      isMain: unit.isMain,
    });
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{units.length} unidades reais no tenant</p>
        <button type="button" onClick={startNew} className="btn-secondary py-1.5 text-xs">
          <Plus size={14} />
          Nova unidade
        </button>
      </div>

      {formOpen && (
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">
              {unitDraft.id ? 'Editar unidade' : 'Nova unidade'}
            </p>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="btn-ghost p-1.5"
              aria-label="Fechar formulario de unidade"
            >
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Nome
              <input
                value={unitDraft.name}
                onChange={(event) => update('name', event.target.value)}
                className="input-base"
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Codigo
              <input
                value={unitDraft.code}
                onChange={(event) => update('code', event.target.value)}
                className="input-base"
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Status
              <select
                value={unitDraft.status}
                onChange={(event) => update('status', event.target.value as ClinicUnitStatus)}
                className="input-base"
              >
                <option value="active">Ativa</option>
                <option value="inactive">Inativa</option>
                <option value="archived">Arquivada</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Telefone
              <input
                value={unitDraft.phone}
                onChange={(event) => update('phone', event.target.value)}
                className="input-base"
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground md:col-span-2">
              Endereco
              <input
                value={unitDraft.address}
                onChange={(event) => update('address', event.target.value)}
                className="input-base"
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Cidade
              <input
                value={unitDraft.city}
                onChange={(event) => update('city', event.target.value)}
                className="input-base"
              />
            </label>
            <label className="flex items-center gap-2 pt-6 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={unitDraft.isMain}
                onChange={(event) => update('isMain', event.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Unidade principal
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <SaveButton saving={saving} onClick={onSave}>
              Salvar unidade
            </SaveButton>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {units.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            Nenhuma unidade retornada pelo contrato local.
          </div>
        ) : (
          units.map((unit) => (
            <div key={unit.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{unit.name}</p>
                    <StatusBadge status={unit.status} />
                    {unit.isMain && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Principal
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{unit.code}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {unit.address && <span>{unit.address}</span>}
                    {unit.city && <span>{unit.city}</span>}
                    {unit.phone && <span>{unit.phone}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(unit)}
                  className="btn-ghost p-1.5"
                  aria-label={`Editar ${unit.name}`}
                >
                  <Edit2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const INVITABLE_ROLE_CODES = new Set([
  'tenant_owner',
  'clinic_admin',
  'receptionist',
  'physician',
  'nutritionist',
  'fitness_professional',
  'financial_user',
  'external_professional',
]);

const PROFESSIONAL_TYPE_LABELS: Record<ProfessionalType, string> = {
  physician: 'Medico',
  nutritionist: 'Nutricionista',
  fitness_professional: 'Profissional fitness',
  external_professional: 'Profissional externo',
};

const PROFESSIONAL_TYPE_OPTIONS: Array<{ value: ProfessionalType; label: string }> = [
  { value: 'physician', label: PROFESSIONAL_TYPE_LABELS.physician },
  { value: 'nutritionist', label: PROFESSIONAL_TYPE_LABELS.nutritionist },
  { value: 'fitness_professional', label: PROFESSIONAL_TYPE_LABELS.fitness_professional },
  { value: 'external_professional', label: PROFESSIONAL_TYPE_LABELS.external_professional },
];

function roleToProfessionalType(roleCode: string): ProfessionalType {
  if (roleCode === 'nutritionist') return 'nutritionist';
  if (roleCode === 'fitness_professional') return 'fitness_professional';
  if (roleCode === 'external_professional') return 'external_professional';
  return 'physician';
}

function SectionEquipe({
  snapshot,
  onSnapshotUpdated,
}: {
  snapshot: ClinicSettingsSnapshot;
  onSnapshotUpdated: (snapshot: ClinicSettingsSnapshot) => void;
}) {
  const roleOptions = useMemo(
    () => snapshot.roles.filter((role) => INVITABLE_ROLE_CODES.has(role.name)),
    [snapshot.roles]
  );
  const defaultRoleCode = roleOptions[0]?.name ?? 'clinic_admin';
  const unitOptions = useMemo(
    () => snapshot.units.filter((unit) => unit.status !== 'archived'),
    [snapshot.units]
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState(defaultRoleCode);
  const [inviteUnitId, setInviteUnitId] = useState('');
  const [inviteReason, setInviteReason] = useState('');
  const [inviteProfessionalEnabled, setInviteProfessionalEnabled] = useState(false);
  const [inviteProfessionalType, setInviteProfessionalType] =
    useState<ProfessionalType>('physician');
  const [inviteLicenseNumber, setInviteLicenseNumber] = useState('');
  const [inviteLicenseState, setInviteLicenseState] = useState('');
  const [inviteSpecialty, setInviteSpecialty] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [professionalEditMemberId, setProfessionalEditMemberId] = useState<string | null>(null);
  const [professionalDraft, setProfessionalDraft] = useState<ProfessionalProfileInput>({
    enabled: false,
    professionalType: 'physician',
    licenseNumber: '',
    licenseState: '',
    specialty: '',
  });
  const [professionalReason, setProfessionalReason] = useState('');
  const [savingProfessionalId, setSavingProfessionalId] = useState<string | null>(null);
  const [professionalError, setProfessionalError] = useState<string | null>(null);
  const [professionalNotice, setProfessionalNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!roleOptions.some((role) => role.name === inviteRole)) {
      setInviteRole(defaultRoleCode);
    }
  }, [defaultRoleCode, inviteRole, roleOptions]);

  useEffect(() => {
    if (inviteRole === 'physician') {
      setInviteProfessionalEnabled(true);
      setInviteProfessionalType('physician');
    }
  }, [inviteRole]);

  const inviteProfessionalProfile = inviteProfessionalEnabled
    ? {
        enabled: true,
        professionalType: inviteProfessionalType,
        licenseNumber: inviteLicenseNumber,
        licenseState: inviteLicenseState,
        specialty: inviteSpecialty,
      }
    : null;
  const inviteProfessionalInvalid =
    inviteProfessionalEnabled &&
    inviteProfessionalType === 'physician' &&
    (!inviteLicenseNumber.trim() || inviteLicenseState.trim().length !== 2);

  const submitInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inviting) return;

    setInviting(true);
    setInviteError(null);
    setInviteNotice(null);

    const result = await inviteClinicMember({
      email: inviteEmail,
      fullName: inviteName,
      roleCode: inviteRole,
      unitId: inviteUnitId || null,
      reason: inviteReason,
      professionalProfile: inviteProfessionalProfile,
    });

    if (result.error || !result.data) {
      setInviteError(result.error?.message ?? 'Nao foi possivel convidar membro.');
    } else {
      onSnapshotUpdated(result.data);
      setInviteEmail('');
      setInviteName('');
      setInviteRole(defaultRoleCode);
      setInviteUnitId('');
      setInviteReason('');
      setInviteProfessionalEnabled(false);
      setInviteProfessionalType('physician');
      setInviteLicenseNumber('');
      setInviteLicenseState('');
      setInviteSpecialty('');
      setInviteOpen(false);
      setInviteNotice('Convite registrado e auditado para este tenant.');
    }

    setInviting(false);
  };

  const startProfessionalEdit = (member: (typeof snapshot.team)[number]) => {
    const profile = member.professionalProfile;
    setProfessionalEditMemberId(member.id);
    setProfessionalDraft({
      enabled: profile?.isActive ?? false,
      professionalType: profile?.professionalType ?? roleToProfessionalType(member.roleCode),
      licenseNumber: profile?.licenseNumber ?? '',
      licenseState: profile?.licenseState ?? '',
      specialty: profile?.specialty ?? '',
    });
    setProfessionalReason('');
    setProfessionalError(null);
    setProfessionalNotice(null);
  };

  const saveProfessionalProfile = async (member: (typeof snapshot.team)[number]) => {
    setSavingProfessionalId(member.id);
    setProfessionalError(null);
    setProfessionalNotice(null);
    const result = await updateClinicMemberProfessionalProfile(member.id, {
      ...professionalDraft,
      reason: professionalReason,
    });

    if (result.error || !result.data) {
      setProfessionalError(
        result.error?.message ?? 'Nao foi possivel alterar perfil profissional.'
      );
    } else {
      onSnapshotUpdated(result.data);
      setProfessionalEditMemberId(null);
      setProfessionalNotice('Perfil profissional atualizado sem alterar o papel RBAC.');
    }
    setSavingProfessionalId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {snapshot.team.length} membros reais no tenant
        </p>
        <button
          type="button"
          disabled={roleOptions.length === 0}
          onClick={() => {
            setInviteOpen((value) => !value);
            setInviteError(null);
            setInviteNotice(null);
          }}
          className="btn-secondary py-1.5 text-xs"
          title={
            roleOptions.length === 0
              ? 'Configure papeis do tenant antes de convidar.'
              : 'Convidar usuario com Auth Admin e auditoria.'
          }
        >
          {inviteOpen ? <X size={14} /> : <UserPlus size={14} />}
          {inviteOpen ? 'Fechar convite' : 'Convidar membro'}
        </button>
      </div>

      {(inviteError || inviteNotice || professionalError || professionalNotice) && (
        <div className="space-y-2">
          {inviteError && <InlineAlert message={inviteError} />}
          {inviteNotice && <InlineAlert tone="ok" message={inviteNotice} />}
          {professionalError && <InlineAlert message={professionalError} />}
          {professionalNotice && <InlineAlert tone="ok" message={professionalNotice} />}
        </div>
      )}

      {inviteOpen && (
        <form
          onSubmit={(event) => void submitInvite(event)}
          className="space-y-3 rounded-xl border border-border bg-muted/10 p-4"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              E-mail
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="input-base mt-1"
                placeholder="profissional@clinica.com"
                required
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Nome
              <input
                type="text"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                className="input-base mt-1"
                placeholder="Nome do membro"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Papel
              <select
                value={inviteRole}
                onChange={(event) => {
                  const nextRole = event.target.value;
                  setInviteRole(nextRole);
                  if (nextRole !== 'physician' && !inviteProfessionalEnabled) {
                    setInviteProfessionalType(roleToProfessionalType(nextRole));
                  }
                }}
                className="input-base mt-1"
                required
              >
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.description || role.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Unidade
              <select
                value={inviteUnitId}
                onChange={(event) => setInviteUnitId(event.target.value)}
                className="input-base mt-1"
              >
                <option value="">Sem unidade</option>
                {unitOptions.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-xl border border-border bg-background p-3">
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={inviteProfessionalEnabled}
                disabled={inviteRole === 'physician'}
                onChange={(event) => {
                  setInviteProfessionalEnabled(event.target.checked);
                  if (event.target.checked) {
                    setInviteProfessionalType(roleToProfessionalType(inviteRole));
                  }
                }}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary"
              />
              <span>
                <span className="block font-semibold text-foreground">
                  Tambem atua como profissional de saude
                </span>
                <span className="text-muted-foreground">
                  O papel de permissao continua separado do perfil clinico.
                </span>
              </span>
            </label>

            {inviteProfessionalEnabled ? (
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Tipo profissional
                  <select
                    value={inviteProfessionalType}
                    disabled={inviteRole === 'physician'}
                    onChange={(event) =>
                      setInviteProfessionalType(event.target.value as ProfessionalType)
                    }
                    className="input-base mt-1"
                  >
                    {PROFESSIONAL_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Registro
                  <input
                    value={inviteLicenseNumber}
                    onChange={(event) => setInviteLicenseNumber(event.target.value)}
                    className="input-base mt-1"
                    required={inviteProfessionalType === 'physician'}
                    placeholder="CRM"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  UF
                  <input
                    value={inviteLicenseState}
                    onChange={(event) =>
                      setInviteLicenseState(event.target.value.toUpperCase().slice(0, 2))
                    }
                    className="input-base mt-1"
                    maxLength={2}
                    required={inviteProfessionalType === 'physician'}
                    placeholder="SP"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Especialidade
                  <input
                    value={inviteSpecialty}
                    onChange={(event) => setInviteSpecialty(event.target.value)}
                    className="input-base mt-1"
                    placeholder="Opcional"
                  />
                </label>
              </div>
            ) : null}
          </div>

          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            Motivo auditavel
            <textarea
              value={inviteReason}
              onChange={(event) => setInviteReason(event.target.value)}
              className="input-base mt-1 min-h-20 resize-y"
              placeholder="Ex.: Inclusao de profissional no fluxo operacional da clinica."
              required
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-secondary py-1.5 text-xs"
              onClick={() => setInviteOpen(false)}
              disabled={inviting}
            >
              <X size={14} />
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary py-1.5 text-xs"
              disabled={inviting || roleOptions.length === 0 || inviteProfessionalInvalid}
            >
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Enviar convite
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {snapshot.team.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            Nenhum membro retornado pelo contrato local.
          </div>
        ) : (
          snapshot.team.map((member) => {
            const profile = member.professionalProfile;
            const isEditingProfessional = professionalEditMemberId === member.id;
            const professionalInvalid =
              professionalDraft.enabled &&
              professionalDraft.professionalType === 'physician' &&
              (!professionalDraft.licenseNumber?.trim() ||
                professionalDraft.licenseState?.trim().length !== 2);

            return (
              <div key={member.id} className="space-y-2">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {member.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {member.fullName}
                      </p>
                      <StatusBadge status={member.status} />
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        RBAC: {member.roleCode}
                      </span>
                      {profile ? (
                        <span
                          className={[
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            profile.isActive
                              ? 'bg-positive-bg text-positive'
                              : 'bg-muted text-muted-foreground',
                          ].join(' ')}
                        >
                          {PROFESSIONAL_TYPE_LABELS[profile.professionalType]}
                          {profile.countsAsDoctor ? ' / conta no limite' : ''}
                        </span>
                      ) : null}
                      {!member.isActive && (
                        <span className="rounded-full bg-negative-bg px-2 py-0.5 text-xs font-medium text-negative">
                          Perfil inativo
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="hidden text-right text-xs text-muted-foreground sm:block">
                    <p>{member.unitName ?? 'Sem unidade'}</p>
                    {profile?.licenseState ? <p>UF {profile.licenseState}</p> : null}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary py-1.5 text-xs"
                    onClick={() =>
                      isEditingProfessional
                        ? setProfessionalEditMemberId(null)
                        : startProfessionalEdit(member)
                    }
                  >
                    <Edit2 size={14} />
                    Perfil
                  </button>
                </div>

                {isEditingProfessional ? (
                  <div className="rounded-xl border border-border bg-muted/10 p-3">
                    {(professionalError || professionalNotice) && (
                      <div className="mb-3 space-y-2">
                        {professionalError && <InlineAlert message={professionalError} />}
                        {professionalNotice && (
                          <InlineAlert tone="ok" message={professionalNotice} />
                        )}
                      </div>
                    )}
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <input
                          type="checkbox"
                          checked={professionalDraft.enabled}
                          onChange={(event) =>
                            setProfessionalDraft((current) => ({
                              ...current,
                              enabled: event.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-border text-primary"
                        />
                        Tambem atua como profissional de saude
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Tipo profissional
                        <select
                          value={professionalDraft.professionalType}
                          onChange={(event) =>
                            setProfessionalDraft((current) => ({
                              ...current,
                              professionalType: event.target.value as ProfessionalType,
                            }))
                          }
                          className="input-base mt-1"
                        >
                          {PROFESSIONAL_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Registro
                        <input
                          value={professionalDraft.licenseNumber ?? ''}
                          onChange={(event) =>
                            setProfessionalDraft((current) => ({
                              ...current,
                              licenseNumber: event.target.value,
                            }))
                          }
                          className="input-base mt-1"
                          disabled={!professionalDraft.enabled}
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        UF
                        <input
                          value={professionalDraft.licenseState ?? ''}
                          onChange={(event) =>
                            setProfessionalDraft((current) => ({
                              ...current,
                              licenseState: event.target.value.toUpperCase().slice(0, 2),
                            }))
                          }
                          className="input-base mt-1"
                          disabled={!professionalDraft.enabled}
                          maxLength={2}
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Especialidade
                        <input
                          value={professionalDraft.specialty ?? ''}
                          onChange={(event) =>
                            setProfessionalDraft((current) => ({
                              ...current,
                              specialty: event.target.value,
                            }))
                          }
                          className="input-base mt-1"
                          disabled={!professionalDraft.enabled}
                        />
                      </label>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                      <input
                        value={professionalReason}
                        onChange={(event) => setProfessionalReason(event.target.value)}
                        className="input-base text-xs"
                        placeholder="Motivo auditavel opcional"
                      />
                      <button
                        type="button"
                        className="btn-secondary py-1.5 text-xs"
                        onClick={() => setProfessionalEditMemberId(null)}
                        disabled={savingProfessionalId === member.id}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn-primary py-1.5 text-xs"
                        disabled={
                          savingProfessionalId !== null ||
                          professionalInvalid ||
                          (!professionalDraft.enabled && !profile)
                        }
                        onClick={() => void saveProfessionalProfile(member)}
                      >
                        {savingProfessionalId === member.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        Salvar perfil
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SectionPapeis({
  snapshot,
  onSnapshotUpdated,
}: {
  snapshot: ClinicSettingsSnapshot;
  onSnapshotUpdated: (snapshot: ClinicSettingsSnapshot) => void;
}) {
  const [editingRoles, setEditingRoles] = useState(false);
  const [memberRoleDraft, setMemberRoleDraft] = useState<Record<string, string>>({});
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleNotice, setRoleNotice] = useState<string | null>(null);
  const permissionsByRole = useMemo(() => {
    return new Map(
      snapshot.rolePermissions.map((entry) => [entry.roleName, new Set(entry.permissions)])
    );
  }, [snapshot.rolePermissions]);
  const roleOptions = useMemo(() => snapshot.roles.map((role) => role.name), [snapshot.roles]);
  const getPermissionDelta = (currentRole: string, nextRole: string) => {
    const current = permissionsByRole.get(currentRole) ?? new Set<string>();
    const next = permissionsByRole.get(nextRole) ?? new Set<string>();
    return {
      added: Array.from(next).filter((permission) => !current.has(permission)),
      removed: Array.from(current).filter((permission) => !next.has(permission)),
    };
  };

  const saveMemberRole = async (member: (typeof snapshot.team)[number]) => {
    const nextRole = memberRoleDraft[member.id] ?? member.roleCode;
    if (nextRole === member.roleCode) {
      setRoleNotice('Papel ja esta atualizado para este membro.');
      setRoleError(null);
      return;
    }

    setSavingMemberId(member.id);
    setRoleError(null);
    setRoleNotice(null);
    const result = await updateClinicMemberRole(member.id, nextRole);
    if (result.error || !result.data) {
      setRoleError(result.error?.message ?? 'Nao foi possivel alterar papel.');
    } else {
      onSnapshotUpdated(result.data);
      setRoleNotice('Papel do membro atualizado com auditoria.');
    }
    setSavingMemberId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {snapshot.roles.length} papeis e {snapshot.permissions.length} permissoes pelo RBAC local
        </p>
        <button
          type="button"
          className="btn-secondary py-1.5 text-xs"
          onClick={() => setEditingRoles((value) => !value)}
        >
          <ShieldCheck size={14} />
          {editingRoles ? 'Ocultar edicao' : 'Alterar roles'}
        </button>
      </div>

      {(roleError || roleNotice) && (
        <div className="space-y-2">
          {roleError && <InlineAlert message={roleError} />}
          {roleNotice && <InlineAlert tone="ok" message={roleNotice} />}
        </div>
      )}

      {editingRoles && (
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-foreground">Membros e papeis</p>
            <p className="text-xs text-muted-foreground">
              Altera membros existentes. Convites continuam no backend Auth Admin.
            </p>
          </div>
          <div className="space-y-2">
            {snapshot.team.map((member) => {
              const nextRole = memberRoleDraft[member.id] ?? member.roleCode;
              const delta = getPermissionDelta(member.roleCode, nextRole);
              return (
                <div key={member.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {member.fullName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <select
                      className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                      value={nextRole}
                      disabled={savingMemberId !== null}
                      onChange={(event) =>
                        setMemberRoleDraft((current) => ({
                          ...current,
                          [member.id]: event.target.value,
                        }))
                      }
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-secondary py-1.5 text-xs"
                      disabled={savingMemberId !== null}
                      onClick={() => void saveMemberRole(member)}
                    >
                      {savingMemberId === member.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} />
                      )}
                      Salvar
                    </button>
                  </div>
                  {nextRole !== member.roleCode ? (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      <span className="rounded-full bg-positive-bg px-2 py-0.5 font-medium text-positive">
                        +{delta.added.length} permissoes
                      </span>
                      <span className="rounded-full bg-warning-bg px-2 py-0.5 font-medium text-warning">
                        -{delta.removed.length} permissoes
                      </span>
                      {delta.added.slice(0, 4).map((permission) => (
                        <span
                          key={permission}
                          className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
                        >
                          {permission}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {snapshot.roles.map((role) => {
          const permissionSet = permissionsByRole.get(role.name) ?? new Set<string>();
          return (
            <div key={role.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{role.name}</p>
                    {role.isSystem && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Sistema
                      </span>
                    )}
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {role.membersCount} membros
                    </span>
                  </div>
                  {role.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{role.description}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {snapshot.permissions.slice(0, 18).map((permission) => {
                  const enabled = permissionSet.has(permission.code);
                  return (
                    <span
                      key={permission.id}
                      className={[
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        enabled
                          ? 'bg-positive-bg text-positive'
                          : 'bg-muted text-muted-foreground opacity-60',
                      ].join(' ')}
                    >
                      {permission.code}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionBranding({
  draft,
  setDraft,
  saving,
  onSave,
}: {
  draft: ClinicBrandingSettings;
  setDraft: React.Dispatch<React.SetStateAction<ClinicBrandingSettings>>;
  saving: boolean;
  onSave: () => void;
}) {
  const update = (key: keyof ClinicBrandingSettings, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Cor primaria
          <div className="flex gap-2">
            <input
              type="color"
              value={draft.primaryColor}
              onChange={(event) => update('primaryColor', event.target.value)}
              className="h-10 w-12 rounded-lg border border-border bg-card"
            />
            <input
              value={draft.primaryColor}
              onChange={(event) => update('primaryColor', event.target.value)}
              className="input-base font-mono"
            />
          </div>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Cor de destaque
          <div className="flex gap-2">
            <input
              type="color"
              value={draft.accentColor}
              onChange={(event) => update('accentColor', event.target.value)}
              className="h-10 w-12 rounded-lg border border-border bg-card"
            />
            <input
              value={draft.accentColor}
              onChange={(event) => update('accentColor', event.target.value)}
              className="input-base font-mono"
            />
          </div>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Fonte principal
          <select
            value={draft.fontFamily}
            onChange={(event) => update('fontFamily', event.target.value)}
            className="input-base"
          >
            <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
            <option value="DM Sans">DM Sans</option>
            <option value="Manrope">Manrope</option>
            <option value="General Sans">General Sans</option>
          </select>
        </label>
      </div>

      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={onSave}>
          Salvar branding
        </SaveButton>
      </div>
    </div>
  );
}

function SectionPortal({
  draft,
  setDraft,
  saving,
  onSave,
}: {
  draft: ClinicPortalSettings;
  setDraft: React.Dispatch<React.SetStateAction<ClinicPortalSettings>>;
  saving: boolean;
  onSave: () => void;
}) {
  const toggle = (key: keyof ClinicPortalSettings, value: boolean) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const updateUrl = (value: string) => setDraft((prev) => ({ ...prev, url: value }));

  const items: Array<{ key: keyof ClinicPortalSettings; label: string; description: string }> = [
    {
      key: 'selfScheduling',
      label: 'Auto-agendamento',
      description: 'Preferencia de disponibilidade do portal.',
    },
    { key: 'chatEnabled', label: 'Chat', description: 'Preferencia de chat do paciente.' },
    {
      key: 'documentsAccess',
      label: 'Documentos',
      description: 'Preferencia de acesso a documentos.',
    },
    {
      key: 'financialAccess',
      label: 'Financeiro',
      description: 'Preferencia de acesso financeiro.',
    },
    {
      key: 'checkInReminder',
      label: 'Lembretes',
      description: 'Preferencia de check-in e lembretes.',
    },
    { key: 'npsEnabled', label: 'NPS', description: 'Preferencia de pesquisa pos-atendimento.' },
  ];

  return (
    <div className="space-y-4">
      <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
        URL do portal
        <input
          value={draft.url}
          onChange={(event) => updateUrl(event.target.value)}
          className="input-base"
        />
      </label>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <Toggle
              label={item.label}
              checked={Boolean(draft[item.key])}
              onChange={(value) => toggle(item.key, value)}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={onSave}>
          Salvar portal
        </SaveButton>
      </div>
    </div>
  );
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

function SectionChatHours({
  hours,
  setHours,
  saving,
  onSave,
}: {
  hours: ClinicChatServiceHour[];
  setHours: React.Dispatch<React.SetStateAction<ClinicChatServiceHour[]>>;
  saving: boolean;
  onSave: () => void;
}) {
  const timezone = hours[0]?.timezone ?? 'America/Sao_Paulo';
  const updateHour = (
    weekday: number,
    patch: Partial<
      Pick<ClinicChatServiceHour, 'opensAt' | 'closesAt' | 'timezone' | 'autoReply' | 'isEnabled'>
    >
  ) =>
    setHours((current) =>
      current.map((hour) => (hour.weekday === weekday ? { ...hour, ...patch } : hour))
    );
  const updateTimezone = (value: string) =>
    setHours((current) => current.map((hour) => ({ ...hour, timezone: value })));

  return (
    <div className="space-y-5">
      <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
        Fuso horario
        <select
          value={timezone}
          onChange={(event) => updateTimezone(event.target.value)}
          className="input-base"
        >
          <option value="America/Sao_Paulo">America/Sao_Paulo</option>
          <option value="America/Manaus">America/Manaus</option>
          <option value="America/Belem">America/Belem</option>
        </select>
      </label>

      <div className="space-y-2">
        {hours.map((hour) => (
          <div
            key={hour.weekday}
            className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-[56px_1fr_1fr_auto]"
          >
            <span className="text-xs font-bold text-foreground">
              {WEEKDAY_LABELS[hour.weekday]}
            </span>
            <label className="min-w-0 text-xs font-medium text-muted-foreground">
              Abre
              <input
                type="time"
                value={hour.opensAt}
                disabled={!hour.isEnabled}
                onChange={(event) => updateHour(hour.weekday, { opensAt: event.target.value })}
                className="input-base mt-1"
              />
            </label>
            <label className="min-w-0 text-xs font-medium text-muted-foreground">
              Fecha
              <input
                type="time"
                value={hour.closesAt}
                disabled={!hour.isEnabled}
                onChange={(event) => updateHour(hour.weekday, { closesAt: event.target.value })}
                className="input-base mt-1"
              />
            </label>
            <Toggle
              label={`Ativar ${WEEKDAY_LABELS[hour.weekday]}`}
              checked={hour.isEnabled}
              onChange={(value) => updateHour(hour.weekday, { isEnabled: value })}
            />
          </div>
        ))}
      </div>

      <details className="rounded-xl border border-border bg-muted/10 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Respostas automaticas por dia
        </summary>
        <div className="mt-4 space-y-3">
          {hours.map((hour) => (
            <label
              key={hour.weekday}
              className="block space-y-1.5 text-xs font-medium text-muted-foreground"
            >
              {WEEKDAY_LABELS[hour.weekday]}
              <textarea
                value={hour.autoReply}
                onChange={(event) => updateHour(hour.weekday, { autoReply: event.target.value })}
                className="input-base min-h-20 resize-y"
              />
            </label>
          ))}
        </div>
      </details>

      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={onSave}>
          Salvar chat
        </SaveButton>
      </div>
    </div>
  );
}

function templateToInput(template: AutoMessageTemplate): SaveAutoMessageTemplateInput {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    channel: template.channel,
    triggerEvent: template.triggerEvent,
    body: template.body,
    isEnabled: template.isEnabled,
    sortOrder: template.sortOrder,
  };
}

function SectionAutoMessages({
  templates,
  onSnapshotUpdated,
}: {
  templates: AutoMessageTemplate[];
  onSnapshotUpdated: (snapshot: ClinicSettingsSnapshot) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<SaveAutoMessageTemplateInput>(EMPTY_AUTO_TEMPLATE);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageNotice, setMessageNotice] = useState<string | null>(null);

  const update = (key: keyof SaveAutoMessageTemplateInput, value: string | boolean | number) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const startNew = () => {
    setDraft(EMPTY_AUTO_TEMPLATE);
    setFormOpen(true);
    setMessageError(null);
    setMessageNotice(null);
  };

  const startEdit = (template: AutoMessageTemplate) => {
    setDraft(templateToInput(template));
    setFormOpen(true);
    setMessageError(null);
    setMessageNotice(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingTemplateId(draft.id ?? 'new');
    setMessageError(null);
    setMessageNotice(null);
    const result = await saveAutoMessageTemplate(draft);
    if (result.error || !result.data) {
      setMessageError(result.error?.message ?? 'Nao foi possivel salvar mensagem automatica.');
    } else {
      onSnapshotUpdated(result.data);
      setDraft(EMPTY_AUTO_TEMPLATE);
      setFormOpen(false);
      setMessageNotice('Mensagem automatica salva com auditoria.');
    }
    setSavingTemplateId(null);
  };

  const toggleTemplate = async (template: AutoMessageTemplate, isEnabled: boolean) => {
    setSavingTemplateId(template.id);
    setMessageError(null);
    setMessageNotice(null);
    const result = await saveAutoMessageTemplate({ ...templateToInput(template), isEnabled });
    if (result.error || !result.data) {
      setMessageError(result.error?.message ?? 'Nao foi possivel atualizar mensagem.');
    } else {
      onSnapshotUpdated(result.data);
      setMessageNotice('Mensagem automatica atualizada.');
    }
    setSavingTemplateId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{templates.length} mensagens configuradas</p>
        <button type="button" onClick={startNew} className="btn-secondary py-1.5 text-xs">
          <Plus size={14} />
          Nova mensagem
        </button>
      </div>

      {(messageError || messageNotice) && (
        <div className="space-y-2">
          {messageError && <InlineAlert message={messageError} />}
          {messageNotice && <InlineAlert tone="ok" message={messageNotice} />}
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={(event) => void submit(event)}
          className="space-y-3 rounded-xl border border-border bg-muted/10 p-4"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Nome
              <input
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
                className="input-base mt-1"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Codigo
              <input
                value={draft.code ?? ''}
                onChange={(event) => update('code', event.target.value)}
                className="input-base mt-1 font-mono"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Canal
              <select
                value={draft.channel}
                onChange={(event) => update('channel', event.target.value)}
                className="input-base mt-1"
              >
                <option value="chat">Chat</option>
                <option value="portal">Portal</option>
                <option value="email">E-mail</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Gatilho
              <select
                value={draft.triggerEvent}
                onChange={(event) => update('triggerEvent', event.target.value)}
                className="input-base mt-1"
              >
                <option value="after_hours">Fora do horario</option>
                <option value="welcome">Boas-vindas</option>
                <option value="appointment_reminder">Lembrete de agenda</option>
                <option value="document_ready">Documento pronto</option>
                <option value="payment_pending">Pagamento pendente</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            Mensagem
            <textarea
              value={draft.body}
              onChange={(event) => update('body', event.target.value)}
              className="input-base mt-1 min-h-24 resize-y"
            />
          </label>
          <details className="rounded-xl border border-border bg-background p-3">
            <summary className="cursor-pointer text-xs font-semibold text-foreground">
              Avancado
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Ordem
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={draft.sortOrder}
                  onChange={(event) => update('sortOrder', Number(event.target.value))}
                  className="input-base mt-1"
                />
              </label>
              <label className="flex items-center gap-2 pt-6 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={draft.isEnabled}
                  onChange={(event) => update('isEnabled', event.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                Ativa
              </label>
            </div>
          </details>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-secondary py-1.5 text-xs"
              onClick={() => setFormOpen(false)}
            >
              <X size={14} />
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary py-1.5 text-xs"
              disabled={savingTemplateId !== null}
            >
              {savingTemplateId ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Salvar
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {templates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            Nenhuma mensagem automatica configurada.
          </div>
        ) : (
          templates.map((template) => (
            <div key={template.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{template.name}</p>
                    <StatusBadge status={template.isEnabled ? 'active' : 'inactive'} />
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {template.channel}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {template.triggerEvent}
                  </p>
                  <p className="mt-2 max-h-10 overflow-hidden text-xs text-muted-foreground">
                    {template.body}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Toggle
                    label={`Ativar ${template.name}`}
                    checked={template.isEnabled}
                    disabled={savingTemplateId !== null}
                    onChange={(value) => void toggleTemplate(template, value)}
                  />
                  <button
                    type="button"
                    onClick={() => startEdit(template)}
                    className="btn-ghost p-1.5"
                    aria-label={`Editar ${template.name}`}
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SectionLegal({
  draft,
  setDraft,
  saving,
  onSave,
}: {
  draft: ClinicLegalSettings;
  setDraft: React.Dispatch<React.SetStateAction<ClinicLegalSettings>>;
  saving: boolean;
  onSave: () => void;
}) {
  const update = (key: keyof ClinicLegalSettings, value: string | number | boolean) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          E-mail DPO/LGPD
          <input
            type="email"
            value={draft.dpoEmail}
            onChange={(event) => update('dpoEmail', event.target.value)}
            className="input-base"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          E-mail de solicitacoes LGPD
          <input
            type="email"
            value={draft.lgpdRequestEmail}
            onChange={(event) => update('lgpdRequestEmail', event.target.value)}
            className="input-base"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          URL politica de privacidade
          <input
            value={draft.privacyPolicyUrl}
            onChange={(event) => update('privacyPolicyUrl', event.target.value)}
            className="input-base"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          URL termos de uso
          <input
            value={draft.termsUrl}
            onChange={(event) => update('termsUrl', event.target.value)}
            className="input-base"
          />
        </label>
      </div>

      <details className="rounded-xl border border-border bg-muted/10 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Campos avancados
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            Versao do consentimento
            <input
              value={draft.consentFormVersion}
              onChange={(event) => update('consentFormVersion', event.target.value)}
              className="input-base"
            />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            Retencao operacional (anos)
            <input
              type="number"
              min={1}
              max={20}
              value={draft.dataRetentionYears}
              onChange={(event) => update('dataRetentionYears', Number(event.target.value))}
              className="input-base"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.requirePatientConsent}
              onChange={(event) => update('requirePatientConsent', event.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            Exigir consentimento do paciente
          </label>
        </div>
      </details>

      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={onSave}>
          Salvar legal
        </SaveButton>
      </div>
    </div>
  );
}

function SectionIntegracoes({
  integrations,
  draft,
  setDraft,
  saving,
  onSave,
}: {
  integrations: ClinicIntegration[];
  draft: Record<string, boolean>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  saving: boolean;
  onSave: () => void;
}) {
  const categories = useMemo(
    () => Array.from(new Set(integrations.map((integration) => integration.category))),
    [integrations]
  );

  const toggle = (id: string, value: boolean) => setDraft((prev) => ({ ...prev, [id]: value }));

  return (
    <div className="space-y-5">
      {categories.map((category) => (
        <div key={category} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">{category}</h3>
          {integrations
            .filter((integration) => integration.category === category)
            .map((integration) => {
              const enabled = draft[integration.id] ?? integration.enabled;
              return (
                <div
                  key={integration.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{integration.name}</p>
                      <StatusBadge status={enabled ? 'active' : integration.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{integration.description}</p>
                  </div>
                  <Toggle
                    label={integration.name}
                    checked={enabled}
                    onChange={(value) => toggle(integration.id, value)}
                  />
                </div>
              );
            })}
        </div>
      ))}

      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={onSave}>
          Salvar integracoes
        </SaveButton>
      </div>
    </div>
  );
}

function SectionFinanceiro({
  draft,
  setDraft,
  saving,
  onSave,
}: {
  draft: ClinicFinanceSettings;
  setDraft: React.Dispatch<React.SetStateAction<ClinicFinanceSettings>>;
  saving: boolean;
  onSave: () => void;
}) {
  const update = (key: keyof ClinicFinanceSettings, value: string | number | boolean) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const flags: Array<{ key: keyof ClinicFinanceSettings; label: string; description: string }> = [
    { key: 'autoInvoice', label: 'NF-e automatica', description: 'Preferencia de emissao futura.' },
    {
      key: 'delinquencyAlerts',
      label: 'Alertas de inadimplencia',
      description: 'Preferencia de alerta operacional.',
    },
    {
      key: 'emailReceipts',
      label: 'Recibo por e-mail',
      description: 'Preferencia de envio de comprovante.',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Moeda
          <select
            value={draft.currency}
            onChange={(event) => update('currency', event.target.value)}
            className="input-base"
          >
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Dia de vencimento padrao
          <input
            type="number"
            min={1}
            max={31}
            value={draft.defaultDueDay}
            onChange={(event) => update('defaultDueDay', Number(event.target.value))}
            className="input-base"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Multa por atraso (%)
          <input
            type="number"
            min={0}
            step="0.1"
            value={draft.lateFeePercent}
            onChange={(event) => update('lateFeePercent', Number(event.target.value))}
            className="input-base"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Juros mensais (%)
          <input
            type="number"
            min={0}
            step="0.1"
            value={draft.monthlyInterestPercent}
            onChange={(event) => update('monthlyInterestPercent', Number(event.target.value))}
            className="input-base"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground md:col-span-2">
          Chave PIX operacional
          <input
            value={draft.pixKey}
            onChange={(event) => update('pixKey', event.target.value)}
            className="input-base"
          />
        </label>
      </div>

      <div className="space-y-2">
        {flags.map((flag) => (
          <div
            key={flag.key}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">{flag.label}</p>
              <p className="text-xs text-muted-foreground">{flag.description}</p>
            </div>
            <Toggle
              label={flag.label}
              checked={Boolean(draft[flag.key])}
              onChange={(value) => update(flag.key, value)}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={onSave}>
          Salvar financeiro
        </SaveButton>
      </div>
    </div>
  );
}

function SectionProgramas({
  snapshot,
  selectedIds,
  setSelectedIds,
  saving,
  onSave,
}: {
  snapshot: ClinicSettingsSnapshot;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  saving: boolean;
  onSave: () => void;
}) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggle = (id: string, enabled: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(id);
      else next.delete(id);
      return Array.from(next);
    });

  return (
    <div className="space-y-4">
      {snapshot.programs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Nenhum programa retornado pelo contrato local de packages.
        </div>
      ) : (
        <div className="space-y-2">
          {snapshot.programs.map((program) => {
            const enabled = selectedSet.has(program.id);
            return (
              <div
                key={program.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{program.name}</p>
                    <StatusBadge status={program.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {program.programType || 'Tipo nao informado'} - {program.durationWeeks} semanas
                  </p>
                </div>
                <Toggle
                  label={`Programa padrao ${program.name}`}
                  checked={enabled}
                  onChange={(value) => toggle(program.id, value)}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end">
        <SaveButton saving={saving} disabled={snapshot.programs.length === 0} onClick={onSave}>
          Salvar programas
        </SaveButton>
      </div>
    </div>
  );
}

function SectionCompliance({
  snapshot,
  onSnapshotUpdated,
}: {
  snapshot: ClinicSettingsSnapshot;
  onSnapshotUpdated: (snapshot: ClinicSettingsSnapshot) => void;
}) {
  const [savingGapId, setSavingGapId] = useState<string | null>(null);
  const [gapError, setGapError] = useState<string | null>(null);
  const [gapNotice, setGapNotice] = useState<string | null>(null);
  const activeGaps = snapshot.complianceGaps.filter((gap) => gap.status !== 'resolved');
  const resolvedGaps = snapshot.complianceGaps.filter((gap) => gap.status === 'resolved');

  const changeStatus = async (gap: ComplianceGap, status: ComplianceGapStatus) => {
    setSavingGapId(gap.id);
    setGapError(null);
    setGapNotice(null);
    const result = await updateComplianceGapStatus(gap.id, status);
    if (result.error || !result.data) {
      setGapError(result.error?.message ?? 'Nao foi possivel atualizar compliance.');
    } else {
      onSnapshotUpdated(result.data);
      setGapNotice('Status de compliance atualizado com auditoria.');
    }
    setSavingGapId(null);
  };

  const renderGap = (gap: ComplianceGap) => (
    <div key={gap.id} className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{gap.title}</p>
            <ComplianceSeverityBadge severity={gap.severity} />
            <StatusBadge status={gap.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{gap.description}</p>
          {gap.remediation ? (
            <p className="mt-2 text-xs font-medium text-foreground">{gap.remediation}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{gap.area}</span>
            <span>{gap.code}</span>
            <span>Atualizado {formatDateTime(gap.updatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap justify-end gap-2">
          {gap.status === 'open' ? (
            <button
              type="button"
              className="btn-secondary py-1.5 text-xs"
              disabled={savingGapId !== null}
              onClick={() => void changeStatus(gap, 'acknowledged')}
            >
              {savingGapId === gap.id ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Reconhecer
            </button>
          ) : null}
          {gap.status !== 'resolved' ? (
            <button
              type="button"
              className="btn-primary py-1.5 text-xs"
              disabled={savingGapId !== null}
              onClick={() => void changeStatus(gap, 'resolved')}
            >
              {savingGapId === gap.id ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ShieldCheck size={14} />
              )}
              Resolver
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary py-1.5 text-xs"
              disabled={savingGapId !== null}
              onClick={() => void changeStatus(gap, 'open')}
            >
              Reabrir
            </button>
          )}
          {gap.status !== 'resolved' ? (
            <button
              type="button"
              className="btn-secondary py-1.5 text-xs"
              disabled={savingGapId !== null}
              onClick={() => void changeStatus(gap, 'dismissed')}
            >
              <X size={14} />
              Dispensar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-lg font-bold text-foreground">{snapshot.complianceSummary.open}</p>
          <p className="text-xs text-muted-foreground">Abertas</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-lg font-bold text-foreground">
            {snapshot.complianceSummary.acknowledged}
          </p>
          <p className="text-xs text-muted-foreground">Reconhecidas</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-lg font-bold text-foreground">
            {snapshot.complianceSummary.criticalOpen}
          </p>
          <p className="text-xs text-muted-foreground">Criticas</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-lg font-bold text-foreground">{snapshot.complianceSummary.resolved}</p>
          <p className="text-xs text-muted-foreground">Resolvidas</p>
        </div>
      </div>

      {(gapError || gapNotice) && (
        <div className="space-y-2">
          {gapError && <InlineAlert message={gapError} />}
          {gapNotice && <InlineAlert tone="ok" message={gapNotice} />}
        </div>
      )}

      <div className="space-y-3">
        {activeGaps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            Nenhuma lacuna operacional aberta.
          </div>
        ) : (
          activeGaps.map(renderGap)
        )}
      </div>

      {resolvedGaps.length > 0 ? (
        <details className="rounded-xl border border-border bg-muted/10 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Lacunas resolvidas
          </summary>
          <div className="mt-4 space-y-3">{resolvedGaps.map(renderGap)}</div>
        </details>
      ) : null}
    </div>
  );
}

export default function ClinicSettingsContent() {
  const [activeSection, setActiveSection] = useState<SectionId>('perfil');
  const [snapshot, setSnapshot] = useState<ClinicSettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<SaveKey>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(EMPTY_PROFILE);
  const [brandingDraft, setBrandingDraft] = useState<ClinicBrandingSettings>(EMPTY_BRANDING);
  const [portalDraft, setPortalDraft] = useState<ClinicPortalSettings>(EMPTY_PORTAL);
  const [financeDraft, setFinanceDraft] = useState<ClinicFinanceSettings>(EMPTY_FINANCE);
  const [legalDraft, setLegalDraft] = useState<ClinicLegalSettings>(EMPTY_LEGAL);
  const [chatHoursDraft, setChatHoursDraft] = useState<ClinicChatServiceHour[]>([]);
  const [integrationDraft, setIntegrationDraft] = useState<Record<string, boolean>>({});
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [unitDraft, setUnitDraft] = useState<SaveClinicUnitInput>(EMPTY_UNIT);
  const [unitFormOpen, setUnitFormOpen] = useState(false);

  const applySnapshot = useCallback((next: ClinicSettingsSnapshot) => {
    const integrations = Array.isArray(next.integrations) ? next.integrations : [];

    setSnapshot(next);
    setProfileDraft({ name: next.tenant.name, ...next.profile });
    setBrandingDraft(next.branding);
    setPortalDraft(next.portal);
    setFinanceDraft(next.finance);
    setLegalDraft(next.legal);
    setChatHoursDraft(Array.isArray(next.chatServiceHours) ? next.chatServiceHours : []);
    setIntegrationDraft(
      Object.fromEntries(integrations.map((integration) => [integration.id, integration.enabled]))
    );
    setSelectedProgramIds(Array.isArray(next.defaultProgramIds) ? next.defaultProgramIds : []);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getClinicSettings();
      if (result.error || !result.data) {
        setLoadError(result.error?.message ?? 'Nao foi possivel carregar configuracoes.');
        setSnapshot(null);
        return;
      }

      applySnapshot(result.data);
    } catch {
      setLoadError('Nao foi possivel carregar configuracoes.');
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const savePatch = useCallback(
    async (
      key: Exclude<SaveKey, null | 'unit'>,
      message: string,
      patch: Parameters<typeof updateClinicSettings>[1],
      name: string | null = null
    ) => {
      setSavingKey(key);
      setSaveError(null);
      setNotice(null);
      const result = await updateClinicSettings(name, patch);
      if (result.error || !result.data) {
        setSaveError(result.error?.message ?? 'Nao foi possivel salvar configuracoes.');
      } else {
        applySnapshot(result.data);
        setNotice(message);
      }
      setSavingKey(null);
    },
    [applySnapshot]
  );

  const saveProfile = () => {
    const { name, ...profile } = profileDraft;
    void savePatch('profile', 'Perfil salvo com auditoria local.', { profile }, name);
  };

  const saveBranding = () =>
    void savePatch('branding', 'Branding salvo em tenant settings.', { branding: brandingDraft });

  const savePortal = () =>
    void savePatch('portal', 'Preferencias do portal salvas.', { portal: portalDraft });

  const saveChatHours = async () => {
    setSavingKey('chatHours');
    setSaveError(null);
    setNotice(null);
    const result = await saveChatServiceHours(chatHoursDraft);
    if (result.error || !result.data) {
      setSaveError(result.error?.message ?? 'Nao foi possivel salvar horario de chat.');
    } else {
      applySnapshot(result.data);
      setNotice('Horario de chat salvo com auditoria.');
    }
    setSavingKey(null);
  };

  const saveLegal = () =>
    void savePatch('legal', 'Configuracoes legais salvas.', { legal: legalDraft });

  const saveIntegrations = () => {
    const integrations = Object.fromEntries(
      Object.entries(integrationDraft).map(([id, enabled]) => [
        id,
        { enabled, status: enabled ? 'enabled' : 'disabled' },
      ])
    );
    void savePatch('integrations', 'Integracoes salvas sem secrets no browser.', { integrations });
  };

  const saveFinance = () =>
    void savePatch('finance', 'Preferencias financeiras salvas.', { finance: financeDraft });

  const savePrograms = () =>
    void savePatch(
      'programs',
      'Programas padrao salvos.',
      { defaultPrograms: { programIds: selectedProgramIds } },
      null
    );

  const saveUnit = async () => {
    setSavingKey('unit');
    setSaveError(null);
    setNotice(null);
    const result = await saveClinicUnit(unitDraft);
    if (result.error || !result.data) {
      setSaveError(result.error?.message ?? 'Nao foi possivel salvar unidade.');
    } else {
      applySnapshot(result.data);
      setUnitDraft(EMPTY_UNIT);
      setUnitFormOpen(false);
      setNotice('Unidade salva com auditoria local.');
    }
    setSavingKey(null);
  };

  const scrollTo = (id: SectionId) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="card-base flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Loader2 size={18} className="animate-spin text-primary" />
          Carregando configuracoes reais...
        </div>
      </div>
    );
  }

  if (loadError || !snapshot) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="card-base max-w-lg space-y-4 p-6">
          <InlineAlert message={loadError ?? 'Configuracoes indisponiveis.'} />
          <button type="button" onClick={loadSettings} className="btn-secondary">
            <RefreshCw size={15} />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full">
      <aside className="hidden max-h-[calc(100vh-4rem)] w-56 flex-shrink-0 flex-col self-start overflow-y-auto border-r border-border bg-card lg:sticky lg:top-0 lg:flex">
        <div className="border-b border-border px-4 py-5">
          <h1 className="text-sm font-bold text-foreground">Configuracoes</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{snapshot.tenant.name}</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollTo(section.id)}
                className={[
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                ].join(' ')}
              >
                <Icon size={14} />
                <span className={['text-xs', isActive ? 'font-semibold' : 'font-medium'].join(' ')}>
                  {section.label}
                </span>
                {isActive && <ChevronRight size={12} className="ml-auto" />}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-6 px-4 py-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Configuracoes da Clinica</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Dados do tenant, unidades, RBAC e preferencias pelo contrato local.
            </p>
          </div>
          <button type="button" onClick={loadSettings} className="btn-secondary py-1.5 text-xs">
            <RefreshCw size={14} />
            Atualizar
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollTo(section.id)}
                className={[
                  'flex flex-shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-muted-foreground',
                ].join(' ')}
              >
                <Icon size={12} />
                {section.label}
              </button>
            );
          })}
        </div>

        {(saveError || notice) && (
          <div className="space-y-2">
            {saveError && <InlineAlert message={saveError} />}
            {notice && <InlineAlert tone="ok" message={notice} />}
          </div>
        )}

        <SectionCard id="perfil" title="Perfil da Clinica" icon={Building2}>
          <SectionPerfil
            draft={profileDraft}
            setDraft={setProfileDraft}
            saving={savingKey === 'profile'}
            onSave={saveProfile}
          />
        </SectionCard>

        <SectionCard id="unidades" title="Unidades" icon={MapPin}>
          <SectionUnidades
            units={snapshot.units}
            unitDraft={unitDraft}
            setUnitDraft={setUnitDraft}
            formOpen={unitFormOpen}
            setFormOpen={setUnitFormOpen}
            saving={savingKey === 'unit'}
            onSave={() => void saveUnit()}
          />
        </SectionCard>

        <SectionCard id="equipe" title="Equipe" icon={Users}>
          <SectionEquipe snapshot={snapshot} onSnapshotUpdated={applySnapshot} />
        </SectionCard>

        <SectionCard id="papeis" title="Papeis e Permissoes" icon={ShieldCheck}>
          <SectionPapeis snapshot={snapshot} onSnapshotUpdated={applySnapshot} />
        </SectionCard>

        <SectionCard id="branding" title="Branding" icon={Palette}>
          <SectionBranding
            draft={brandingDraft}
            setDraft={setBrandingDraft}
            saving={savingKey === 'branding'}
            onSave={saveBranding}
          />
        </SectionCard>

        <SectionCard id="portal" title="Portal do Paciente" icon={Globe}>
          <SectionPortal
            draft={portalDraft}
            setDraft={setPortalDraft}
            saving={savingKey === 'portal'}
            onSave={savePortal}
          />
        </SectionCard>

        <SectionCard id="chat" title="Horario de Chat" icon={Clock}>
          <SectionChatHours
            hours={chatHoursDraft}
            setHours={setChatHoursDraft}
            saving={savingKey === 'chatHours'}
            onSave={() => void saveChatHours()}
          />
        </SectionCard>

        <SectionCard id="mensagens" title="Mensagens Automaticas" icon={MessageSquare}>
          <SectionAutoMessages
            templates={snapshot.autoMessageTemplates}
            onSnapshotUpdated={applySnapshot}
          />
        </SectionCard>

        <SectionCard id="legal" title="Legal e LGPD" icon={FileText}>
          <SectionLegal
            draft={legalDraft}
            setDraft={setLegalDraft}
            saving={savingKey === 'legal'}
            onSave={saveLegal}
          />
        </SectionCard>

        <SectionCard id="integracoes" title="Integracoes" icon={Plug}>
          <SectionIntegracoes
            integrations={snapshot.integrations}
            draft={integrationDraft}
            setDraft={setIntegrationDraft}
            saving={savingKey === 'integrations'}
            onSave={saveIntegrations}
          />
        </SectionCard>

        <SectionCard id="financeiro" title="Financeiro" icon={CreditCard}>
          <SectionFinanceiro
            draft={financeDraft}
            setDraft={setFinanceDraft}
            saving={savingKey === 'finance'}
            onSave={saveFinance}
          />
        </SectionCard>

        <SectionCard id="programas" title="Programas Padrao" icon={BookOpen}>
          <SectionProgramas
            snapshot={snapshot}
            selectedIds={selectedProgramIds}
            setSelectedIds={setSelectedProgramIds}
            saving={savingKey === 'programs'}
            onSave={savePrograms}
          />
        </SectionCard>

        <SectionCard id="compliance" title="Compliance Operacional" icon={ShieldAlert}>
          <SectionCompliance snapshot={snapshot} onSnapshotUpdated={applySnapshot} />
        </SectionCard>
      </div>
    </div>
  );
}
