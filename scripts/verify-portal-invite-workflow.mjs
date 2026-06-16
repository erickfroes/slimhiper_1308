#!/usr/bin/env node

import {
  createPatientWithInviteWorkflow,
  validateInvitePrerequisites,
} from '../src/app/patient-list/lib/patientPortalInviteHelpers.js';

const CHECKS = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function pushResult(name, status, error = null) {
  CHECKS.push({ name, status, error });
}

async function run() {
  const validForm = {
    email: 'paciente.teste@example.com',
    phone: '(21) 99999-9999',
    consentPortalAccess: true,
    invitePortalAccount: false,
  };

  let inviteCalls = 0;
  let createCalls = 0;

  const createPatientMock = async () => {
    createCalls += 1;
    return { data: { id: 'patient-no-invite-1' }, error: null };
  };

  const invitePatientPortalAccessMock = async () => {
    inviteCalls += 1;
    return {
      data: { patientId: 'patient-no-invite-1' },
      error: null,
    };
  };

  try {
    const noInvite = await createPatientWithInviteWorkflow({
      form: { ...validForm, invitePortalAccount: false },
      createPatient: createPatientMock,
      invitePatientPortalAccess: invitePatientPortalAccessMock,
      toCreatePayload: { fullName: 'Paciente A' },
    });
    assert(noInvite.createdPatientId === 'patient-no-invite-1', 'Create sem convite deve retornar id criado.');
    assert(noInvite.inviteAttempted === false, 'Create sem convite nao deve disparar convite.');
    assert(inviteCalls === 0, 'Create sem convite nao deve chamar API de convite.');
    assert(createCalls === 1, 'Create sem convite deve chamar criacao uma vez.');
    pushResult('Criacao sem convite nao dispara portal', 'PASSOU');
  } catch (error) {
    pushResult('Criacao sem convite nao dispara portal', 'FALHOU', error);
  }

  inviteCalls = 0;
  createCalls = 0;

  try {
    const withInviteSuccess = await createPatientWithInviteWorkflow({
      form: { ...validForm, invitePortalAccount: true },
      createPatient: createPatientMock,
      invitePatientPortalAccess: invitePatientPortalAccessMock,
      toCreatePayload: { fullName: 'Paciente B' },
    });
    assert(withInviteSuccess.createdPatientId === 'patient-no-invite-1', 'Create com convite deve retornar id criado.');
    assert(withInviteSuccess.inviteAttempted === true, 'Create com convite deve tentar convite.');
    assert(withInviteSuccess.inviteError === null, 'Create com convite nao deve retornar erro de convite.');
    assert(inviteCalls === 1, 'Create com convite deve chamar API de convite.');
    assert(createCalls === 1, 'Create com convite deve chamar criacao uma vez.');
    pushResult('Criacao com convite com sucesso', 'PASSOU');
  } catch (error) {
    pushResult('Criacao com convite com sucesso', 'FALHOU', error);
  }

  inviteCalls = 0;
  createCalls = 0;

  try {
    const badEmailForm = { ...validForm, email: 'email-invalido', invitePortalAccount: true };
    const withInviteInvalidEmail = await createPatientWithInviteWorkflow({
      form: badEmailForm,
      createPatient: createPatientMock,
      invitePatientPortalAccess: invitePatientPortalAccessMock,
      toCreatePayload: { fullName: 'Paciente C' },
    });
    assert(
      withInviteInvalidEmail.createdPatientId === 'patient-no-invite-1',
      'Create com convite invalido deve ter paciente criado.'
    );
    assert(withInviteInvalidEmail.inviteAttempted === false, 'Create com convite invalido nao deve disparar convite.');
    assert(
      withInviteInvalidEmail.inviteError === 'Informe um e-mail valido para enviar o convite.',
      'Mensagem de erro para email invalido nao confere.'
    );
    assert(inviteCalls === 0, 'Create com convite invalido nao deve chamar API de convite.');
    assert(createCalls === 1, 'Create com convite invalido deve continuar criando paciente.');
    pushResult('Create com convite e email invalido', 'PASSOU');
  } catch (error) {
    pushResult('Create com convite e email invalido', 'FALHOU', error);
  }

  const prerequisiteMessages = validateInvitePrerequisites({
    email: '',
    phone: '',
    consentPortalAccess: false,
    invitePortalAccount: true,
  });
  assert(prerequisiteMessages.canInvite === false, 'Requisito sem email nao deve permitir convite.');
  assert(
    prerequisiteMessages.message?.includes('Informe o email'),
    'Mensagem de requisito deve explicar e-mail.'
  );

  const failedChecks = CHECKS.filter((check) => check.status === 'FALHOU');
  for (const check of CHECKS) {
    if (check.status === 'PASSOU') {
      console.log(`[PASSOU] ${check.name}`);
      continue;
    }
    console.error(`[FALHOU] ${check.name}`);
    console.error(check.error instanceof Error ? check.error.message : String(check.error));
  }

  if (failedChecks.length > 0) {
    throw new Error(`${failedChecks.length} validacoes falharam.`);
  }

  console.log(`Checklist: convite de paciente apos criacao (${CHECKS.length} casos).`);
}

run().catch((error) => {
  console.error('Validacao do convite falhou.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
