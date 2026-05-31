import { getCurrentAppSession, type AppSession } from '@/services/session/getCurrentAppSession';

type AppSessionWithoutComputedBooleans = Omit<
  AppSession,
  | 'isPlatformAdmin'
  | 'isPlatformSupport'
  | 'isClinicUser'
  | 'isPatient'
  | 'canAccessPlatformAdmin'
  | 'canAccessClinicWorkspace'
  | 'canViewFinancial'
  | 'canViewMedicalPrescriptions'
  | 'canManageTenantUsers'
>;

export type UserContext = AppSessionWithoutComputedBooleans & {
  id: string;
  memberships: AppSession['tenantMemberships'];
  canAccessPlatformAdmin: boolean;
  canAccessClinicWorkspace: boolean;
  canAccessPatientPortal: boolean;
  canViewFinancial: boolean;
  canViewMedicalPrescriptions: boolean;
};

export async function getCurrentUserContext(): Promise<UserContext | null> {
  const session = await getCurrentAppSession();
  if (!session) return null;

  const memberships = session.tenantMemberships;
  const {
    isPlatformAdmin: _isPlatformAdmin,
    isPlatformSupport: _isPlatformSupport,
    isClinicUser: _isClinicUser,
    isPatient: _isPatient,
    canAccessPlatformAdmin,
    canAccessClinicWorkspace,
    canViewFinancial,
    canViewMedicalPrescriptions,
    canManageTenantUsers: _canManageTenantUsers,
    ...rest
  } = session;

  return {
    ...rest,
    id: session.userId,
    memberships,
    canAccessPlatformAdmin: canAccessPlatformAdmin(),
    canAccessClinicWorkspace: canAccessClinicWorkspace(),
    canAccessPatientPortal: false,
    canViewFinancial: canViewFinancial(),
    canViewMedicalPrescriptions: canViewMedicalPrescriptions(),
  };
}
