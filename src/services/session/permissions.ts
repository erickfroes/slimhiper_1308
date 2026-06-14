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
  DOCUMENTS_READ: ['documents.read'],
  DOCUMENTS_WRITE: ['documents.write'],
  DOCUMENTS_RELEASE: ['documents.release', 'documents.write'],
  DOCUMENTS_SIGN: ['documents.sign', 'documents.write'],
  DOCUMENTS_TEMPLATE_MANAGE: ['documents.template.manage', 'documents.write'],
} as const;

export const DOCUMENT_PERMISSION_REQUIREMENTS = {
  read: 'documents.read',
  write: 'documents.write',
  release: 'documents.release',
  sign: 'documents.sign',
  templateManage: 'documents.template.manage',
} as const;

export type DocumentPermissionAccess = Record<
  keyof typeof DOCUMENT_PERMISSION_REQUIREMENTS,
  boolean
>;

export function getDocumentPermissionAccess(
  permissions: readonly string[]
): DocumentPermissionAccess {
  const permissionSet = new Set(permissions);
  return {
    read: hasAnyPermission(permissionSet, PERMISSIONS.DOCUMENTS_READ),
    write: hasAnyPermission(permissionSet, PERMISSIONS.DOCUMENTS_WRITE),
    release: hasAnyPermission(permissionSet, PERMISSIONS.DOCUMENTS_RELEASE),
    sign: hasAnyPermission(permissionSet, PERMISSIONS.DOCUMENTS_SIGN),
    templateManage: hasAnyPermission(permissionSet, PERMISSIONS.DOCUMENTS_TEMPLATE_MANAGE),
  };
}

export function hasAnyPermission(permissionSet: Set<string>, expected: readonly string[]): boolean {
  return expected.some((permission) => permissionSet.has(permission));
}
