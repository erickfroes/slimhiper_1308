import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import type {
  ProfessionalAddress,
  ProfessionalPublicProfile,
  UserPrivateProfile,
} from '@/services/clinicSettingsApi';

export interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

export interface CurrentUserMembership {
  id: string;
  tenantId: string;
  roleKey: string | null;
  roleCode: string | null;
  legacyRole: string | null;
  status: string | null;
}

export interface CurrentUserProfessionalProfile {
  id: string | null;
  professionalAddress: ProfessionalAddress;
  attendanceUnitIds: string[];
  signatureFooter: string;
  publicProfile: ProfessionalPublicProfile;
}

export interface CurrentUserProfile {
  userId: string;
  email: string | null;
  fullName: string;
  phone: string;
  avatarPath: string | null;
  avatarUrl: string | null;
  activeTenantId: string | null;
  activeTenantMembership: CurrentUserMembership | null;
  tenantMemberships: CurrentUserMembership[];
  privateProfile: UserPrivateProfile;
  professionalProfile: CurrentUserProfessionalProfile | null;
}

export interface CurrentUserProfileInput {
  fullName: string;
  phone: string;
  avatarFile?: File | null;
  privateProfile: UserPrivateProfile;
  professionalProfile?: CurrentUserProfessionalProfile | null;
}

const emptyAddress: ProfessionalAddress = {
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
  country: 'Brasil',
};

const emptyPrivateProfile: UserPrivateProfile = {
  personalAddress: emptyAddress,
  emergencyContact: '',
  privateNotes: '',
};

const emptyPublicProfile: ProfessionalPublicProfile = {
  bio: '',
  displayPhone: '',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function asServiceError(error: unknown, fallback: string): SafeServiceError {
  const record = asRecord(error);
  return {
    message: asString(record.message, fallback),
    code: asNullableString(record.code) ?? undefined,
    details: asNullableString(record.details) ?? undefined,
  };
}

function normalizeAddress(value: unknown): ProfessionalAddress {
  const record = asRecord(value);
  return {
    zipCode: asString(record.zipCode),
    street: asString(record.street),
    number: asString(record.number),
    complement: asString(record.complement),
    district: asString(record.district),
    city: asString(record.city),
    state: asString(record.state),
    country: asString(record.country, 'Brasil'),
  };
}

function normalizeAddressPayload(address: ProfessionalAddress) {
  return {
    zipCode: address.zipCode.trim(),
    street: address.street.trim(),
    number: address.number.trim(),
    complement: address.complement.trim(),
    district: address.district.trim(),
    city: address.city.trim(),
    state: address.state.trim().toUpperCase().slice(0, 2),
    country: address.country.trim() || 'Brasil',
  };
}

function normalizePrivateProfile(value: unknown): UserPrivateProfile {
  const record = asRecord(value);
  return {
    personalAddress: normalizeAddress(record.personalAddress),
    emergencyContact: asString(record.emergencyContact),
    privateNotes: asString(record.privateNotes),
  };
}

function normalizePublicProfile(value: unknown): ProfessionalPublicProfile {
  const record = asRecord(value);
  return {
    bio: asString(record.bio),
    displayPhone: asString(record.displayPhone),
  };
}

function normalizeMembership(value: unknown): CurrentUserMembership | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const tenantId = asString(record.tenantId);
  if (!id || !tenantId) return null;
  return {
    id,
    tenantId,
    roleKey: asNullableString(record.roleKey),
    roleCode: asNullableString(record.roleCode),
    legacyRole: asNullableString(record.legacyRole),
    status: asNullableString(record.status),
  };
}

function normalizeProfessionalProfile(value: unknown): CurrentUserProfessionalProfile | null {
  const record = asRecord(value);
  const id = asNullableString(record.id);
  if (!id) return null;
  return {
    id,
    professionalAddress: normalizeAddress(record.professionalAddress),
    attendanceUnitIds: asStringArray(record.attendanceUnitIds),
    signatureFooter: asString(record.signatureFooter),
    publicProfile: normalizePublicProfile(record.publicProfile),
  };
}

async function attachAvatarUrl(profile: CurrentUserProfile): Promise<CurrentUserProfile> {
  if (!profile.avatarPath) return profile;
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.storage
    .from('user-profile-avatars')
    .createSignedUrl(profile.avatarPath, 300);
  return { ...profile, avatarUrl: data?.signedUrl ?? null };
}

function normalizeProfile(value: unknown): CurrentUserProfile | null {
  const record = asRecord(value);
  const userId = asString(record.userId);
  if (!userId) return null;
  const tenantMemberships = Array.isArray(record.tenantMemberships)
    ? record.tenantMemberships
        .map(normalizeMembership)
        .filter((item): item is CurrentUserMembership => Boolean(item))
    : [];
  return {
    userId,
    email: asNullableString(record.email),
    fullName: asString(record.fullName),
    phone: asString(record.phone),
    avatarPath: asNullableString(record.avatarPath),
    avatarUrl: null,
    activeTenantId: asNullableString(record.activeTenantId),
    activeTenantMembership: normalizeMembership(record.activeTenantMembership),
    tenantMemberships,
    privateProfile: normalizePrivateProfile(record.privateProfile ?? emptyPrivateProfile),
    professionalProfile: normalizeProfessionalProfile(record.professionalProfile),
  };
}

function validateAvatarFile(file: File | null | undefined): SafeServiceError | null {
  if (!file) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { message: 'Use uma imagem JPG, PNG ou WebP para o avatar.' };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { message: 'O avatar deve ter no maximo 2 MB.' };
  }
  return null;
}

export async function getCurrentUserProfile(): Promise<{
  data: CurrentUserProfile | null;
  error: SafeServiceError | null;
}> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_current_user_profile');
    if (error) {
      return { data: null, error: asServiceError(error, 'Nao foi possivel carregar seu perfil.') };
    }
    const profile = normalizeProfile(data);
    if (!profile) {
      return {
        data: null,
        error: { message: 'Contrato invalido do perfil do usuario.', code: 'invalid_contract' },
      };
    }
    return { data: await attachAvatarUrl(profile), error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel carregar seu perfil.') };
  }
}

export async function updateCurrentUserProfile(
  currentProfile: CurrentUserProfile,
  input: CurrentUserProfileInput
): Promise<{ data: CurrentUserProfile | null; error: SafeServiceError | null }> {
  const avatarError = validateAvatarFile(input.avatarFile);
  if (avatarError) return { data: null, error: avatarError };
  if (!input.fullName.trim()) {
    return { data: null, error: { message: 'Nome completo e obrigatorio.' } };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    let avatar: { path: string; mimeType: string; sizeBytes: number } | null = null;

    if (input.avatarFile) {
      const tenantId = currentProfile.activeTenantMembership?.tenantId;
      if (!tenantId) {
        return {
          data: null,
          error: { message: 'Selecione um tenant ativo antes de enviar avatar.' },
        };
      }
      const extension =
        input.avatarFile.type === 'image/png'
          ? 'png'
          : input.avatarFile.type === 'image/webp'
            ? 'webp'
            : 'jpg';
      const path = `${tenantId}/${currentProfile.userId}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('user-profile-avatars')
        .upload(path, input.avatarFile, { upsert: true, contentType: input.avatarFile.type });
      if (uploadError) {
        return {
          data: null,
          error: asServiceError(uploadError, 'Nao foi possivel enviar o avatar.'),
        };
      }
      avatar = { path, mimeType: input.avatarFile.type, sizeBytes: input.avatarFile.size };
    }

    const { data, error } = await supabase.rpc('update_current_user_profile', {
      p_payload: {
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        avatar,
        privateProfile: {
          personalAddress: normalizeAddressPayload(input.privateProfile.personalAddress),
          emergencyContact: input.privateProfile.emergencyContact.trim(),
          privateNotes: input.privateProfile.privateNotes.trim(),
        },
        professionalProfile: input.professionalProfile
          ? {
              professionalAddress: normalizeAddressPayload(
                input.professionalProfile.professionalAddress
              ),
              attendanceUnitIds: input.professionalProfile.attendanceUnitIds,
              signatureFooter: input.professionalProfile.signatureFooter.trim(),
              publicProfile: {
                bio: input.professionalProfile.publicProfile.bio.trim(),
                displayPhone: input.professionalProfile.publicProfile.displayPhone.trim(),
              },
            }
          : null,
      },
    });

    if (error) {
      return { data: null, error: asServiceError(error, 'Nao foi possivel salvar seu perfil.') };
    }
    const profile = normalizeProfile(data);
    if (!profile) {
      return {
        data: null,
        error: {
          message: 'Contrato invalido retornado ao salvar perfil.',
          code: 'invalid_contract',
        },
      };
    }
    return { data: await attachAvatarUrl(profile), error: null };
  } catch (error) {
    return { data: null, error: asServiceError(error, 'Nao foi possivel salvar seu perfil.') };
  }
}

export const emptyUserProfileAddress = emptyAddress;
export const emptyUserPrivateProfile = emptyPrivateProfile;
export const emptyUserPublicProfile = emptyPublicProfile;
