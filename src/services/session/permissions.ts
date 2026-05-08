export const PERMISSIONS = {
  PLATFORM_ADMIN_ACCESS: ['platform.admin.access', 'admin.access'],
  CLINIC_WORKSPACE_ACCESS: ['clinic.workspace.access'],
  FINANCIAL_VIEW: ['financial.view', 'finance.view', 'billing.view'],
  MEDICAL_PRESCRIPTIONS_VIEW: [
    'medical.prescriptions.view',
    'prescriptions.view',
    'medical_records.prescriptions.view',
  ],
  TENANT_USERS_MANAGE: ['tenant.users.manage', 'users.manage', 'clinic.users.manage'],
  PATIENT_PORTAL_ACCESS: ['patient_portal.access', 'patient.portal.access'],
} as const;

export function hasAnyPermission(permissionSet: Set<string>, expected: readonly string[]): boolean {
  return expected.some((permission) => permissionSet.has(permission));
}
