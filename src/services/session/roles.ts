export const PLATFORM_ROLES = {
  OWNER: 'platform_owner',
  ADMIN: 'platform_admin',
  SUPPORT: 'platform_support',
  CLINIC_USER: 'clinic_user',
  PATIENT: 'patient',
} as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES] | string | null;

export function normalizeRole(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

export function isPlatformAdminRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === PLATFORM_ROLES.ADMIN;
}

export function isPlatformSupportRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === PLATFORM_ROLES.SUPPORT;
}

export function isPatientRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === PLATFORM_ROLES.PATIENT;
}

export function isPlatformOwnerRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === PLATFORM_ROLES.OWNER;
}
