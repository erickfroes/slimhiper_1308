import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseAdminLike = Pick<SupabaseClient, 'from'>;

export type ProfessionalType =
  | 'physician'
  | 'nutritionist'
  | 'fitness_professional'
  | 'external_professional';

export type ProfessionalProfilePayload = {
  enabled: true;
  professionalType: ProfessionalType;
  licenseNumber: string | null;
  licenseState: string | null;
  specialty: string | null;
};

const PROFESSIONAL_TYPES = new Set<ProfessionalType>([
  'physician',
  'nutritionist',
  'fitness_professional',
  'external_professional',
]);

const ROLE_PROFESSIONAL_TYPE: Partial<Record<string, ProfessionalType>> = {
  physician: 'physician',
  nutritionist: 'nutritionist',
  fitness_professional: 'fitness_professional',
  external_professional: 'external_professional',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeString(value: unknown, maxLength = 160) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function normalizeLicenseState(value: unknown) {
  return normalizeString(value, 2)
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
}

function normalizeProfessionalType(value: unknown, fallback: ProfessionalType): ProfessionalType {
  const normalized = normalizeString(value, 80) as ProfessionalType;
  return PROFESSIONAL_TYPES.has(normalized) ? normalized : fallback;
}

export function normalizeProfessionalProfileInput(
  value: unknown,
  roleCode: string
): { profile: ProfessionalProfilePayload | null; error: string | null } {
  const record = asRecord(value);
  const roleDefaultType = ROLE_PROFESSIONAL_TYPE[roleCode] ?? 'physician';
  const enabled = roleCode === 'physician' || record.enabled === true;

  if (!enabled) return { profile: null, error: null };

  const professionalType = normalizeProfessionalType(record.professionalType, roleDefaultType);
  const licenseNumber = normalizeString(record.licenseNumber, 80) || null;
  const licenseState = normalizeLicenseState(record.licenseState) || null;
  const specialty = normalizeString(record.specialty, 160) || null;

  if (professionalType === 'physician') {
    if (!licenseNumber) {
      return { profile: null, error: 'Informe o CRM/registro do medico.' };
    }
    if (!licenseState || licenseState.length !== 2) {
      return { profile: null, error: 'Informe a UF do CRM/registro do medico.' };
    }
  }

  return {
    profile: {
      enabled: true,
      professionalType,
      licenseNumber,
      licenseState,
      specialty,
    },
    error: null,
  };
}

export function professionalProfileAuditMetadata(profile: ProfessionalProfilePayload | null) {
  if (!profile) return null;

  return {
    professionalType: profile.professionalType,
    licenseState: profile.licenseState,
    hasLicenseNumber: Boolean(profile.licenseNumber),
  };
}

export async function upsertTenantProfessionalProfile(params: {
  admin: SupabaseAdminLike;
  tenantId: string;
  userId: string;
  membershipId: string;
  unitId: string | null;
  profile: ProfessionalProfilePayload;
}) {
  const { admin, tenantId, userId, membershipId, unitId, profile } = params;

  return admin.from('tenant_professionals').upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      membership_id: membershipId,
      unit_id: unitId,
      professional_type: profile.professionalType,
      license_number: profile.licenseNumber,
      license_state: profile.licenseState,
      specialty: profile.specialty,
      is_active: true,
    },
    { onConflict: 'tenant_id,user_id,professional_type' }
  );
}
