'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Building2,
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  Edit2,
  Globe,
  Loader2,
  MapPin,
  Palette,
  Plug,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  getClinicSettings,
  inviteClinicMember,
  saveClinicUnit,
  updateClinicMemberRole,
  updateClinicSettings,
  type ClinicBrandingSettings,
  type ClinicFinanceSettings,
  type ClinicIntegration,
  type ClinicPortalSettings,
  type ClinicProfileSettings,
  type ClinicSettingsSnapshot,
  type ClinicUnit,
  type ClinicUnitStatus,
  type SaveClinicUnitInput,
} from '@/services/clinicSettingsApi';

type SectionId =
  | 'perfil'
  | 'unidades'
  | 'equipe'
  | 'papeis'
  | 'branding'
  | 'portal'
  | 'integracoes'
  | 'financeiro'
  | 'programas';

type ProfileDraft = ClinicProfileSettings & { name: string };

type SaveKey =
  | 'profile'
  | 'branding'
  | 'portal'
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
  { id: 'integracoes', label: 'Integracoes', icon: Plug },
  { id: 'financeiro', label: 'Financeiro', icon: CreditCard },
  { id: 'programas', label: 'Programas', icon: BookOpen },
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

const EMPTY_UNIT: SaveClinicUnitInput = {
  code: '',
  name: '',
  status: 'active',
  address: '',
  city: '',
  phone: '',
  isMain: false,
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
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!roleOptions.some((role) => role.name === inviteRole)) {
      setInviteRole(defaultRoleCode);
    }
  }, [defaultRoleCode, inviteRole, roleOptions]);

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
      setInviteOpen(false);
      setInviteNotice('Convite registrado e auditado para este tenant.');
    }

    setInviting(false);
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

      {(inviteError || inviteNotice) && (
        <div className="space-y-2">
          {inviteError && <InlineAlert message={inviteError} />}
          {inviteNotice && <InlineAlert tone="ok" message={inviteNotice} />}
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
                onChange={(event) => setInviteRole(event.target.value)}
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
              disabled={inviting || roleOptions.length === 0}
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
          snapshot.team.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {member.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {member.fullName}
                  </p>
                  <StatusBadge status={member.status} />
                  {!member.isActive && (
                    <span className="rounded-full bg-negative-bg px-2 py-0.5 text-xs font-medium text-negative">
                      Perfil inativo
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              <div className="hidden text-right text-xs text-muted-foreground sm:block">
                <p className="font-medium text-foreground">{member.roleCode}</p>
                <p>{member.unitName ?? 'Sem unidade'}</p>
              </div>
            </div>
          ))
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
            {snapshot.team.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{member.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
                <select
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                  value={memberRoleDraft[member.id] ?? member.roleCode}
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
            ))}
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
  const [integrationDraft, setIntegrationDraft] = useState<Record<string, boolean>>({});
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [unitDraft, setUnitDraft] = useState<SaveClinicUnitInput>(EMPTY_UNIT);
  const [unitFormOpen, setUnitFormOpen] = useState(false);

  const applySnapshot = useCallback((next: ClinicSettingsSnapshot) => {
    setSnapshot(next);
    setProfileDraft({ name: next.tenant.name, ...next.profile });
    setBrandingDraft(next.branding);
    setPortalDraft(next.portal);
    setFinanceDraft(next.finance);
    setIntegrationDraft(
      Object.fromEntries(
        next.integrations.map((integration) => [integration.id, integration.enabled])
      )
    );
    setSelectedProgramIds(next.defaultProgramIds);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await getClinicSettings();
    if (result.error || !result.data) {
      setLoadError(result.error?.message ?? 'Nao foi possivel carregar configuracoes.');
      setSnapshot(null);
    } else {
      applySnapshot(result.data);
    }
    setLoading(false);
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
      </div>
    </div>
  );
}
