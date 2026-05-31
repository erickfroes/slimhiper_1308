import { getCurrentAppSession, type AppSession } from '@/services/session/getCurrentAppSession';

type AppSessionWithoutComputedBooleans = Omit<
  AppSession,
  | 'canAccessPlatformAdmin'
  | 'canAccessClinicWorkspace'
  | 'canViewFinancial'
  | 'canViewMedicalPrescriptions'
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
    canAccessPlatformAdmin,
    canAccessClinicWorkspace,
    canViewFinancial,
    canViewMedicalPrescriptions,
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
