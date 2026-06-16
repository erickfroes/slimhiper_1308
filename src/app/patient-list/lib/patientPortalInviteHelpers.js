/**
 * Shared helpers for patient portal invite flows.
 */

/** @typedef {import('@/services/patientsApi').PatientMutationInput} PatientMutationInput */

/**
 * @typedef {{
 *   patientId: string;
 *   inviteEmail: string;
 *   invitePhone: string;
 *   inviteeType: 'patient' | 'guardian';
 *   relationship: string;
 *   lastError?: string | null;
 * }} PendingPortalInvite
 */

/**
 * @typedef {{
 *   missingEmail: boolean;
 *   invalidEmail: boolean;
 *   missingConsent: boolean;
 *   canInvite: boolean;
 *   message: string | null;
 * }} PortalInvitePrerequisites
 */

/**
 * @typedef {{
 *   email: string;
 *   phone: string;
 *   consentPortalAccess: boolean;
 *   invitePortalAccount: boolean;
 * }} InviteFormState
 */

/**
 * @typedef {{
 *   email: string;
 *   phone: string;
 *   relationship: string;
 * }} InvitePayload
 */

/**
 * @typedef {{
 *   canInvite: boolean;
 *   inviteAttempted: boolean;
 *   inviteError: string | null;
 * }} InviteAfterCreateResult
 */

export const DEFAULT_PORTAL_INVITE_MESSAGE =
  'Informe o email do paciente e ative "Liberacao para portal".';

export function isValidEmail(value) {
  const normalized = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

/**
 * Creates an initial invite payload from the patient form state.
 *
 * @param {InviteFormState} form
 * @returns {PendingPortalInvite}
 */
export function toInvitePayload(form) {
  return {
    patientId: '',
    inviteEmail: form.email.trim().toLowerCase(),
    invitePhone: form.phone.trim(),
    inviteeType: 'patient',
    relationship: '',
  };
}

/**
 * @param {'invite' | 'activate' | 'suspend' | 'revoke'} action
 * @param {'patient' | 'guardian'} inviteeType
 */
export function describePortalAccessError(rawError, action, inviteeType) {
  const message = rawError.toLowerCase();
  if (
    message.includes('permissao') ||
    message.includes('permission') ||
    message.includes('sem permiss')
  ) {
    return `Sem permissao para ${action === 'invite' ? 'convidar' : 'atualizar'} acesso do ${inviteeType}.`;
  }
  if (message.includes('email') || message.includes('e-mail')) {
    return 'Informe um e-mail valido e tente novamente.';
  }
  if (message.includes('papel do portal') || message.includes('nao configurado')) {
    return 'Papel de portal (patient/guardian) nao esta configurado no tenant.';
  }
  if (message.includes('ja vinculado') || message.includes('other profile')) {
    return 'Este e-mail ja esta vinculado a outro perfil no mesmo tenant.';
  }
  if (message.includes('limite') || message.includes('rate') || message.includes('429')) {
    return 'Limite de envio de convite atingido. Aguarde alguns minutos e tente novamente.';
  }
  return rawError;
}

/**
 * @param {InviteFormState} form
 * @returns {PortalInvitePrerequisites}
 */
export function validateInvitePrerequisites(form) {
  const email = form.email.trim();
  const missingEmail = email.length === 0;
  const invalidEmail = email.length > 0 && !isValidEmail(email);
  const missingConsent = !form.consentPortalAccess;
  const canInvite = !missingEmail && !invalidEmail && !missingConsent;
  const messageParts = [];
  if (missingEmail) {
    messageParts.push('Informe o email do paciente.');
  } else if (invalidEmail) {
    messageParts.push('Informe um e-mail valido para convite.');
  }
  if (missingConsent) {
    messageParts.push('Habilite "Liberacao para portal".');
  }
  return {
    missingEmail,
    invalidEmail,
    missingConsent,
    canInvite,
    message: messageParts.length > 0 ? messageParts.join(' ') : null,
  };
}

/**
 * Encapsulates the post-create invite behavior for testability.
 *
 * @param {Object} args
 * @param {string} args.patientId
 * @param {InviteFormState} args.form
 * @param {(patientId: string, payload: InvitePayload) => Promise<{ data: unknown | null; error: { message: string } | null }>} args.invitePatientPortalAccess
 * @returns {Promise<InviteAfterCreateResult>}
 */
export async function createPatientInviteAfterCreate({
  patientId,
  form,
  invitePatientPortalAccess,
}) {
  if (!form.invitePortalAccount) {
    return { canInvite: false, inviteAttempted: false, inviteError: null };
  }

  const normalizedEmail = form.email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    return {
      canInvite: true,
      inviteAttempted: false,
      inviteError: 'Informe um e-mail valido para enviar o convite.',
    };
  }
  if (!form.consentPortalAccess) {
    return {
      canInvite: true,
      inviteAttempted: false,
      inviteError: 'Habilite "Liberacao para portal" para enviar o convite.',
    };
  }

  const payload = {
    inviteeType: 'patient',
    email: normalizedEmail,
    phone: form.phone.trim(),
    relationship: '',
  };
  const result = await invitePatientPortalAccess(patientId, payload);
  if (result.error || !result.data) {
    return {
      canInvite: true,
      inviteAttempted: true,
      inviteError: describePortalAccessError(
        result.error?.message ?? 'Falha ao enviar convite do portal.',
        'invite',
        'patient'
      ),
    };
  }
  return { canInvite: true, inviteAttempted: true, inviteError: null };
}

/**
 * @param {Object} args
 * @param {InviteFormState} args.form
 * @param {(input: PatientMutationInput) => Promise<{ data: { id: string } | null; error: { message: string } | null }>} args.createPatient
 * @param {(patientId: string, payload: InvitePayload) => Promise<{ data: unknown | null; error: { message: string } | null }>} args.invitePatientPortalAccess
 * @returns {Promise<{ createdPatientId: string | null; inviteAttempted: boolean; inviteError: string | null }>}
 */
export async function createPatientWithInviteWorkflow({
  form,
  createPatient,
  invitePatientPortalAccess,
  toCreatePayload,
}) {
  const result = await createPatient(toCreatePayload);
  if (result.error || !result.data) {
    return { createdPatientId: null, inviteAttempted: false, inviteError: null };
  }

  const invite = await createPatientInviteAfterCreate({
    patientId: result.data.id,
    form,
    invitePatientPortalAccess,
  });

  return {
    createdPatientId: result.data.id,
    inviteAttempted: invite.inviteAttempted,
    inviteError: invite.inviteError,
  };
}
