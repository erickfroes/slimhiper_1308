'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Loader2, Save, UserRound } from 'lucide-react';
import type { ProfessionalAddress } from '@/services/clinicSettingsApi';
import {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  type CurrentUserProfile,
  type CurrentUserProfileInput,
} from '@/services/userProfileApi';

function cloneAddress(address: ProfessionalAddress): ProfessionalAddress {
  return { ...address };
}

function profileToInput(profile: CurrentUserProfile): CurrentUserProfileInput {
  return {
    fullName: profile.fullName,
    phone: profile.phone,
    avatarFile: null,
    privateProfile: {
      personalAddress: cloneAddress(profile.privateProfile.personalAddress),
      emergencyContact: profile.privateProfile.emergencyContact,
      privateNotes: profile.privateProfile.privateNotes,
    },
    professionalProfile: profile.professionalProfile
      ? {
          ...profile.professionalProfile,
          professionalAddress: cloneAddress(profile.professionalProfile.professionalAddress),
          attendanceUnitIds: [...profile.professionalProfile.attendanceUnitIds],
          publicProfile: { ...profile.professionalProfile.publicProfile },
        }
      : null,
  };
}

function formatRole(value: string | null | undefined) {
  const normalized = value?.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return 'Sem papel ativo';
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="input-base text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-70"
      />
    </label>
  );
}

function AddressFields({
  address,
  onChange,
  prefix,
}: {
  address: ProfessionalAddress;
  onChange: (address: ProfessionalAddress) => void;
  prefix: string;
}) {
  function patch(key: keyof ProfessionalAddress, value: string) {
    onChange({ ...address, [key]: value });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        label={`${prefix} CEP`}
        value={address.zipCode}
        onChange={(value) => patch('zipCode', value)}
      />
      <Field
        label={`${prefix} Rua`}
        value={address.street}
        onChange={(value) => patch('street', value)}
      />
      <Field
        label={`${prefix} Numero`}
        value={address.number}
        onChange={(value) => patch('number', value)}
      />
      <Field
        label={`${prefix} Complemento`}
        value={address.complement}
        onChange={(value) => patch('complement', value)}
      />
      <Field
        label={`${prefix} Bairro`}
        value={address.district}
        onChange={(value) => patch('district', value)}
      />
      <Field
        label={`${prefix} Cidade`}
        value={address.city}
        onChange={(value) => patch('city', value)}
      />
      <Field
        label={`${prefix} UF`}
        value={address.state}
        onChange={(value) => patch('state', value)}
      />
      <Field
        label={`${prefix} Pais`}
        value={address.country}
        onChange={(value) => patch('country', value)}
      />
    </div>
  );
}

export default function ProfileContent({ backHref }: { backHref: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [draft, setDraft] = useState<CurrentUserProfileInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarSrc = avatarPreview ?? profile?.avatarUrl ?? null;

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      setLoading(true);
      const result = await getCurrentUserProfile();
      if (!mounted) return;
      if (result.error || !result.data) {
        setError(result.error?.message ?? 'Nao foi possivel carregar seu perfil.');
        setProfile(null);
        setDraft(null);
      } else {
        setError(null);
        setProfile(result.data);
        setDraft(profileToInput(result.data));
      }
      setLoading(false);
    }

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const membershipLabel = useMemo(() => {
    const membership = profile?.activeTenantMembership;
    return formatRole(membership?.roleKey ?? membership?.roleCode ?? membership?.legacyRole);
  }, [profile?.activeTenantMembership]);

  function updateDraft(patch: Partial<CurrentUserProfileInput>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updatePersonalAddress(address: ProfessionalAddress) {
    setDraft((current) =>
      current
        ? {
            ...current,
            privateProfile: { ...current.privateProfile, personalAddress: address },
          }
        : current
    );
  }

  function updateProfessionalAddress(address: ProfessionalAddress) {
    setDraft((current) =>
      current?.professionalProfile
        ? {
            ...current,
            professionalProfile: { ...current.professionalProfile, professionalAddress: address },
          }
        : current
    );
  }

  function handleAvatar(file: File | null) {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
    updateDraft({ avatarFile: file });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !draft || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await updateCurrentUserProfile(profile, draft);
    setSaving(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? 'Nao foi possivel salvar seu perfil.');
      return;
    }
    setProfile(result.data);
    setDraft(profileToInput(result.data));
    setAvatarPreview(null);
    setNotice('Perfil atualizado.');
    router.refresh();
  }

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando perfil
      </div>
    );
  }

  if (!profile || !draft) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="card-base max-w-xl p-5">
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <Link
            href={backHref}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary"
          >
            <ArrowLeft size={14} />
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
        >
          <ArrowLeft size={14} />
          Voltar
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="btn-primary justify-center px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {notice}
        </p>
      ) : null}

      <section className="card-base p-5">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex flex-col items-start gap-3">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-primary">
              {avatarSrc ? (
                <Image
                  src={avatarSrc}
                  alt=""
                  width={96}
                  height={96}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound size={34} />
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted">
              <Camera size={14} />
              Alterar avatar
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => handleAvatar(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
            <Field
              label="Nome completo"
              value={draft.fullName}
              onChange={(value) => updateDraft({ fullName: value })}
            />
            <Field label="Email" value={profile.email ?? ''} onChange={() => undefined} disabled />
            <Field
              label="Telefone"
              value={draft.phone}
              onChange={(value) => updateDraft({ phone: value })}
            />
            <Field
              label="Papel ativo"
              value={membershipLabel}
              onChange={() => undefined}
              disabled
            />
          </div>
        </div>
      </section>

      <section className="card-base space-y-4 p-5">
        <div>
          <h2 className="text-base font-bold text-foreground">Dados pessoais</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Informacoes privadas do usuario logado.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Contato de emergencia"
            value={draft.privateProfile.emergencyContact}
            onChange={(value) =>
              updateDraft({
                privateProfile: { ...draft.privateProfile, emergencyContact: value },
              })
            }
          />
        </div>
        <AddressFields
          prefix="Pessoal"
          address={draft.privateProfile.personalAddress}
          onChange={updatePersonalAddress}
        />
        <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
          <span>Observacoes privadas</span>
          <textarea
            value={draft.privateProfile.privateNotes}
            onChange={(event) =>
              updateDraft({
                privateProfile: { ...draft.privateProfile, privateNotes: event.target.value },
              })
            }
            className="input-base min-h-20 resize-y text-sm font-normal text-foreground"
          />
        </label>
      </section>

      {draft.professionalProfile ? (
        <section className="card-base space-y-4 p-5">
          <div>
            <h2 className="text-base font-bold text-foreground">Dados profissionais</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Identidade publica usada em documentos e operacoes clinicas.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Telefone publico"
              value={draft.professionalProfile.publicProfile.displayPhone}
              onChange={(value) =>
                setDraft((current) =>
                  current?.professionalProfile
                    ? {
                        ...current,
                        professionalProfile: {
                          ...current.professionalProfile,
                          publicProfile: {
                            ...current.professionalProfile.publicProfile,
                            displayPhone: value,
                          },
                        },
                      }
                    : current
                )
              }
            />
            <Field
              label="Rodape de assinatura"
              value={draft.professionalProfile.signatureFooter}
              onChange={(value) =>
                setDraft((current) =>
                  current?.professionalProfile
                    ? {
                        ...current,
                        professionalProfile: {
                          ...current.professionalProfile,
                          signatureFooter: value,
                        },
                      }
                    : current
                )
              }
            />
          </div>
          <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
            <span>Bio publica</span>
            <textarea
              value={draft.professionalProfile.publicProfile.bio}
              onChange={(event) =>
                setDraft((current) =>
                  current?.professionalProfile
                    ? {
                        ...current,
                        professionalProfile: {
                          ...current.professionalProfile,
                          publicProfile: {
                            ...current.professionalProfile.publicProfile,
                            bio: event.target.value,
                          },
                        },
                      }
                    : current
                )
              }
              className="input-base min-h-20 resize-y text-sm font-normal text-foreground"
            />
          </label>
          <AddressFields
            prefix="Profissional"
            address={draft.professionalProfile.professionalAddress}
            onChange={updateProfessionalAddress}
          />
        </section>
      ) : (
        <section className="card-base p-5">
          <h2 className="text-base font-bold text-foreground">Dados profissionais</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Nenhum perfil profissional ativo foi encontrado para a membership atual.
          </p>
        </section>
      )}
    </form>
  );
}
