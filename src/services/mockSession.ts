import type { UserRole } from '@/domain/types';

export interface MockSessionUser {
  id: string;
  name: string;
  email: string;
}

export interface MockSessionTenant {
  id: string;
  name: string;
  slug: string;
}

export interface RolePermissions {
  canViewFinancial: boolean;
  canViewMedicalPrescriptions: boolean;
  canAccessPlatformAdmin: boolean;
}

const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  clinic_admin: {
    canViewFinancial: true,
    canViewMedicalPrescriptions: true,
    canAccessPlatformAdmin: false,
  },
  coordinator: {
    canViewFinancial: true,
    canViewMedicalPrescriptions: true,
    canAccessPlatformAdmin: false,
  },
  receptionist: {
    canViewFinancial: true,
    canViewMedicalPrescriptions: false,
    canAccessPlatformAdmin: false,
  },
  physician: {
    canViewFinancial: true,
    canViewMedicalPrescriptions: true,
    canAccessPlatformAdmin: false,
  },
  nutritionist: {
    canViewFinancial: false,
    canViewMedicalPrescriptions: false,
    canAccessPlatformAdmin: false,
  },
  platform_admin: {
    canViewFinancial: true,
    canViewMedicalPrescriptions: true,
    canAccessPlatformAdmin: true,
  },
  patient: {
    canViewFinancial: false,
    canViewMedicalPrescriptions: false,
    canAccessPlatformAdmin: false,
  },
};

export const mockSession = {
  currentUser: {
    id: 'user_001',
    name: 'Usuario Local',
    email: 'local@slimhiper.app',
  } satisfies MockSessionUser,
  currentTenant: {
    id: 'tenant_001',
    name: 'SlimHiper Local Clinic',
    slug: 'slimhiper-local',
  } satisfies MockSessionTenant,
  currentRole: 'physician' as UserRole,
  rolePermissions: ROLE_PERMISSIONS,
};

export function getCurrentRolePermissions(
  role: UserRole = mockSession.currentRole
): RolePermissions {
  return mockSession.rolePermissions[role];
}

export function canViewFinancial(role: UserRole = mockSession.currentRole): boolean {
  return getCurrentRolePermissions(role).canViewFinancial;
}

export function canViewMedicalPrescriptions(role: UserRole = mockSession.currentRole): boolean {
  return getCurrentRolePermissions(role).canViewMedicalPrescriptions;
}

export function canAccessPlatformAdmin(role: UserRole = mockSession.currentRole): boolean {
  return getCurrentRolePermissions(role).canAccessPlatformAdmin;
}
