#!/usr/bin/env node

/**
 * Paciente 360 contract smoke checks
 *
 * Modes:
 * - fixture: validates a local JSON fixture without calling Supabase.
 * - real: calls deployed Supabase Edge Functions and requires env vars.
 *
 * Real mode required env vars:
 * - SUPABASE_URL
 * - TOKEN_WITH_PATIENTS_READ or TEST_ACCESS_TOKEN
 * - PATIENT_ID_TENANT_A or TEST_PATIENT_ID
 *
 * Real mode optional env vars:
 * - TOKEN_WITHOUT_PATIENTS_READ
 * - PATIENT_ID_TENANT_B
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const defaultFixturePath = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'patient360-summary.fixture.json'
);

const args = parseArgs(process.argv.slice(2));
const mode = args.mode ?? 'real';
let readEnvValue = (key) => process.env[key]?.trim() ?? '';

const VALID_PACKAGE_STATUSES = new Set([
  'ativo',
  'pausado',
  'concluido',
  'cancelado',
  'aguardando',
]);
const VALID_PATIENT_STATUSES = new Set(['ativo', 'inativo', 'pausado', 'concluido', 'cancelado']);
const VALID_PROGRAM_TYPES = new Set([
  'emagrecimento',
  'hipertrofia',
  'recomposicao',
  'saude_metabolica',
  'longevidade',
]);
const VALID_ADHERENCE_LEVELS = new Set(['excelente', 'bom', 'regular', 'critico']);
const VALID_FINANCIAL_STATUSES = new Set(['em_dia', 'pendente', 'inadimplente', 'isento']);
const VALID_APPOINTMENT_STATUSES = new Set([
  'agendado',
  'chegou',
  'triagem',
  'medidas',
  'bioimpedancia',
  'aguardando_medico',
  'em_consulta',
  'checkout',
  'concluido',
  'falta',
  'cancelado',
]);
const VALID_APPOINTMENT_TYPES = new Set([
  'consulta_medica',
  'retorno',
  'nutricao',
  'avaliacao_inicial',
  'bioimpedancia',
  'checkup',
]);
const VALID_EVENT_TYPES = new Set([
  'consulta',
  'nutricao',
  'medicamento',
  'medida',
  'documento',
  'pagamento',
  'alerta',
  'mensagem',
  'inicio_programa',
  'meta_atingida',
  'lead_criado',
  'lead_convertido',
  'pacote_vendido',
  'contrato_assinado',
  'paciente_cadastrado',
  'consulta_agendada',
  'checkin_realizado',
  'atendimento_iniciado',
  'atendimento_concluido',
  'anamnese_preenchida',
  'soap_atualizado',
  'medida_registrada',
  'exame_solicitado',
  'exame_resultado_recebido',
  'plano_alimentar_publicado',
  'prescricao_emitida',
  'documento_gerado',
  'documento_assinado',
  'pagamento_recebido',
  'pagamento_atrasado',
  'mensagem_enviada',
  'checkin_semanal_enviado',
]);
const VALID_EVENT_CATEGORIES = new Set([
  'clinical',
  'financial',
  'documents',
  'agenda',
  'communication',
  'patient_app',
  'commercial',
]);
const VALID_ALERT_SEVERITIES = new Set(['critico', 'alto', 'medio', 'baixo']);
const VALID_TASK_PRIORITIES = new Set(['alta', 'media', 'baixa']);
const VALID_TASK_CATEGORIES = new Set(['clinico', 'financeiro', 'documento', 'comunicacao']);
const VALID_DOCUMENT_TYPES = new Set([
  'contrato',
  'consentimento',
  'exame',
  'prescricao',
  'relatorio',
  'outros',
]);
const VALID_DOCUMENT_STATUSES = new Set([
  'pendente_assinatura',
  'assinado',
  'vencido',
  'cancelado',
  'em_analise',
]);

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--mode') {
      parsed.mode = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--mode=')) {
      parsed.mode = arg.slice('--mode='.length);
      continue;
    }

    if (arg === '--fixture') {
      parsed.fixture = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--fixture=')) {
      parsed.fixture = arg.slice('--fixture='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printUsage() {
  console.log(`
Usage:
  node scripts/supabase/test-patient360-contract.mjs --mode=fixture
  node scripts/supabase/test-patient360-contract.mjs --mode=fixture --fixture=tests/fixtures/patient360-summary.fixture.json
  node scripts/supabase/test-patient360-contract.mjs --mode=real

Modes:
  fixture  Validate local JSON only; does not read env vars or call Supabase.
  real     Call Supabase Edge Functions; fails when required env vars are missing.
`);
}

function getRequiredEnvAlias(label, keys) {
  for (const key of keys) {
    const value = readEnvValue(key);
    if (value) return value;
  }

  throw new Error(`Missing required env var for real mode: ${label} (${keys.join(' or ')})`);
}

async function callFunction(name, token, body) {
  const base = readEnvValue('SUPABASE_URL').replace(/\/$/, '');
  const response = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    // noop
  }

  return { status: response.status, json };
}

function isSafeFallbackString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value) {
  return value === undefined || value === null || typeof value === 'string';
}

function isString(value) {
  return typeof value === 'string';
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value) {
  return Number.isInteger(value);
}

function isArray(value) {
  return Array.isArray(value);
}

function assertString(value, message) {
  ok(isSafeFallbackString(value), message);
}

function assertStringType(value, message) {
  ok(isString(value), message);
}

function assertNumber(value, message) {
  ok(isNumber(value), message);
}

function assertEnum(value, validValues, message) {
  ok(typeof value === 'string' && validValues.has(value), message);
}

function assertTimelineEventShape(event, index, checkNumber) {
  const prefix = `${checkNumber}) timeline event[${index}]`;
  ok(isSafeFallbackString(event?.id), `${prefix}.id must exist`);
  ok(isSafeFallbackString(event?.patientId), `${prefix}.patientId must exist`);
  assertEnum(
    event?.type,
    VALID_EVENT_TYPES,
    `${prefix}.type must be a valid frontend TimelineEventType`
  );
  ok(isSafeFallbackString(event?.title), `${prefix}.title must exist`);
  ok(isSafeFallbackString(event?.description), `${prefix}.description must exist`);
  ok(isSafeFallbackString(event?.date), `${prefix}.date must exist`);
  if (event?.category !== undefined) {
    assertEnum(
      event.category,
      VALID_EVENT_CATEGORIES,
      `${prefix}.category must be a valid frontend TimelineEventCategory`
    );
  }
  ok(isOptionalString(event?.actorName), `${prefix}.actorName must be optional string`);
  ok(isOptionalString(event?.statusLabel), `${prefix}.statusLabel must be optional string`);
  ok(isOptionalString(event?.actionLabel), `${prefix}.actionLabel must be optional string`);
  ok(isOptionalString(event?.detailsHref), `${prefix}.detailsHref must be optional string`);
}

function assertAppointmentShape(appointment, index) {
  const prefix = `summary.upcomingAppointments[${index}]`;
  assertString(appointment?.id, `${prefix}.id must exist`);
  assertString(appointment?.patientId, `${prefix}.patientId must exist`);
  assertString(appointment?.patientName, `${prefix}.patientName must exist`);
  assertEnum(appointment?.type, VALID_APPOINTMENT_TYPES, `${prefix}.type must be valid`);
  assertEnum(appointment?.status, VALID_APPOINTMENT_STATUSES, `${prefix}.status must be valid`);
  assertString(appointment?.scheduledAt, `${prefix}.scheduledAt must exist`);
  assertNumber(appointment?.durationMinutes, `${prefix}.durationMinutes must be a number`);
  assertString(appointment?.professionalName, `${prefix}.professionalName must exist`);
  assertString(appointment?.professionalRole, `${prefix}.professionalRole must exist`);
}

function assertSummaryContract(summary, results) {
  ok(summary?.status === 200, `patient-360-summary expected 200, got ${summary?.status}`);
  ok(summary?.json?.ok === true, '1) summary.ok must be true');
  ok(summary.json?.data && summary.json?.meta, '1) summary must include data and meta');

  const data = summary.json.data;
  const profile = data.profile;
  assertString(profile?.name, '2) data.profile.name must exist');
  assertString(profile?.id, '3) data.profile.id must exist');
  ok(profile?.tenantId === undefined, '3) data.profile.tenantId must be omitted from response');
  assertEnum(profile?.status, VALID_PATIENT_STATUSES, '3) data.profile.status must be valid');
  assertNumber(profile?.age, '3) data.profile.age must be a number');
  ok(profile?.birthDate === '', '3) data.profile.birthDate must be blank in minimized response');
  assertString(profile?.cpfMasked, '3) data.profile.cpfMasked must exist');
  ok(profile.cpfMasked.startsWith('***.'), '3) data.profile.cpfMasked must be masked');
  assertStringType(profile?.phone, '3) data.profile.phone must be a string');
  ok(
    profile.phone === '' || /^\(\*\*\) \*\*\*\*\*-\d{4}$/.test(profile.phone),
    '3) data.profile.phone must be blank or masked'
  );
  assertStringType(profile?.email, '3) data.profile.email must be a string');
  ok(
    profile.email === '' || /^[^@]*\*+@[^@]+$/.test(profile.email),
    '3) data.profile.email must be blank or masked'
  );
  ok(isArray(profile?.careTeam), '3) data.profile.careTeam must be an array');
  assertString(profile?.createdAt, '3) data.profile.createdAt must exist');

  const activePackage = data.activePackage;
  assertString(
    activePackage?.programName,
    '4) data.activePackage.programName must exist or be a safe fallback string'
  );
  assertEnum(
    activePackage?.programType,
    VALID_PROGRAM_TYPES,
    '4) data.activePackage.programType must be a valid frontend ProgramType'
  );
  ok(
    typeof activePackage?.status === 'string' && VALID_PACKAGE_STATUSES.has(activePackage.status),
    '5) data.activePackage.status must be a valid frontend PackageStatus from SlimHiper domain'
  );
  assertNumber(activePackage?.totalWeeks, '5) data.activePackage.totalWeeks must be a number');
  assertNumber(activePackage?.currentWeek, '5) data.activePackage.currentWeek must be a number');
  assertNumber(
    activePackage?.totalConsultations,
    '5) data.activePackage.totalConsultations must be a number'
  );
  assertNumber(
    activePackage?.usedConsultations,
    '5) data.activePackage.usedConsultations must be a number'
  );

  const clinicalStatus = data.clinicalStatus;
  assertNumber(
    clinicalStatus?.currentWeightKg,
    '6) clinicalStatus.currentWeightKg must be a number'
  );
  assertNumber(clinicalStatus?.goalWeightKg, '6) clinicalStatus.goalWeightKg must be a number');
  assertNumber(clinicalStatus?.startWeightKg, '6) clinicalStatus.startWeightKg must be a number');
  assertNumber(clinicalStatus?.currentBmi, '6) clinicalStatus.currentBmi must be a number');
  assertNumber(
    clinicalStatus?.weeklyAdherencePercent,
    '6) clinicalStatus.weeklyAdherencePercent must be a number'
  );
  assertEnum(
    clinicalStatus?.adherenceLevel,
    VALID_ADHERENCE_LEVELS,
    '6) clinicalStatus.adherenceLevel must be valid'
  );
  assertNumber(clinicalStatus?.weightLostKg, '6) clinicalStatus.weightLostKg must be a number');
  assertNumber(clinicalStatus?.weightToGoKg, '6) clinicalStatus.weightToGoKg must be a number');
  assertNumber(
    clinicalStatus?.progressPercent,
    '6) clinicalStatus.progressPercent must be a number'
  );
  assertString(clinicalStatus?.lastMeasuredAt, '6) clinicalStatus.lastMeasuredAt must exist');
  ok(isArray(clinicalStatus?.weightHistory), '6) clinicalStatus.weightHistory must be an array');
  ok(
    isArray(clinicalStatus?.adherenceHistory),
    '6) clinicalStatus.adherenceHistory must be an array'
  );

  const financial = data.financial;
  assertEnum(financial?.status, VALID_FINANCIAL_STATUSES, '7) data.financial.status must be valid');
  assertNumber(
    financial?.totalContractValue,
    '7) data.financial.totalContractValue must be a number'
  );
  assertNumber(financial?.totalPaid, '7) data.financial.totalPaid must be a number');
  assertNumber(financial?.totalPending, '8) data.financial.totalPending must be a number');
  assertNumber(financial?.totalOverdue, '8) data.financial.totalOverdue must be a number');
  ok(isArray(financial?.invoices), '8) data.financial.invoices must be an array');

  ok(isArray(data.alerts), '9) data.alerts must be an array');
  data.alerts.forEach((alert, index) => {
    const prefix = `summary.alerts[${index}]`;
    assertString(alert?.id, `${prefix}.id must exist`);
    assertString(alert?.patientId, `${prefix}.patientId must exist`);
    assertEnum(alert?.severity, VALID_ALERT_SEVERITIES, `${prefix}.severity must be valid`);
    assertString(alert?.title, `${prefix}.title must exist`);
    assertStringType(alert?.description, `${prefix}.description must be a string`);
    assertString(alert?.createdAt, `${prefix}.createdAt must exist`);
    ok(typeof alert?.isResolved === 'boolean', `${prefix}.isResolved must be boolean`);
  });

  ok(isArray(data.tasks), '9) data.tasks must be an array');
  data.tasks.forEach((task, index) => {
    const prefix = `summary.tasks[${index}]`;
    assertString(task?.id, `${prefix}.id must exist`);
    assertString(task?.patientId, `${prefix}.patientId must exist`);
    assertString(task?.title, `${prefix}.title must exist`);
    assertString(task?.dueDate, `${prefix}.dueDate must exist`);
    ok(typeof task?.isCompleted === 'boolean', `${prefix}.isCompleted must be boolean`);
    assertEnum(task?.category, VALID_TASK_CATEGORIES, `${prefix}.category must be valid`);
    assertEnum(task?.priority, VALID_TASK_PRIORITIES, `${prefix}.priority must be valid`);
  });

  ok(isArray(data.upcomingAppointments), '10) data.upcomingAppointments must be an array');
  data.upcomingAppointments.forEach(assertAppointmentShape);
  ok(isArray(data.recentTimeline), '11) data.recentTimeline must be an array');
  data.recentTimeline.forEach((event, index) => assertTimelineEventShape(event, index, 11));

  ok(isArray(data.documents), '12) data.documents must be an array');
  data.documents.forEach((document, index) => {
    const prefix = `summary.documents[${index}]`;
    assertString(document?.id, `${prefix}.id must exist`);
    assertString(document?.patientId, `${prefix}.patientId must exist`);
    assertString(document?.name, `${prefix}.name must exist`);
    assertEnum(document?.type, VALID_DOCUMENT_TYPES, `${prefix}.type must be valid`);
    assertEnum(document?.status, VALID_DOCUMENT_STATUSES, `${prefix}.status must be valid`);
    assertString(document?.createdAt, `${prefix}.createdAt must exist`);
    assertString(document?.uploadedBy, `${prefix}.uploadedBy must exist`);
  });

  ok(isArray(data.prescriptions), '13) data.prescriptions must be an array');
  data.prescriptions.forEach((prescription, index) => {
    const prefix = `summary.prescriptions[${index}]`;
    assertString(prescription?.id, `${prefix}.id must exist`);
    assertString(prescription?.patientId, `${prefix}.patientId must exist`);
    assertString(prescription?.medicationName, `${prefix}.medicationName must exist`);
    assertString(prescription?.dosage, `${prefix}.dosage must exist`);
    assertString(prescription?.frequency, `${prefix}.frequency must exist`);
    assertString(prescription?.startDate, `${prefix}.startDate must exist`);
    assertString(prescription?.prescribedBy, `${prefix}.prescribedBy must exist`);
    ok(typeof prescription?.isActive === 'boolean', `${prefix}.isActive must be boolean`);
  });

  const nutritionPlan = data.nutritionPlan;
  assertString(nutritionPlan?.id, '14) data.nutritionPlan.id must exist');
  assertString(nutritionPlan?.patientId, '14) data.nutritionPlan.patientId must exist');
  assertString(nutritionPlan?.planName, '14) data.nutritionPlan.planName must exist');
  assertNumber(
    nutritionPlan?.targetCalories,
    '14) data.nutritionPlan.targetCalories must be a number'
  );
  ok(
    typeof nutritionPlan?.isActive === 'boolean',
    '14) data.nutritionPlan.isActive must be boolean'
  );

  const chat = data.chat;
  assertString(chat?.id, '15) data.chat.id must exist');
  assertString(chat?.patientId, '15) data.chat.patientId must exist');
  assertString(chat?.lastMessageAt, '15) data.chat.lastMessageAt must exist');
  assertString(chat?.lastMessagePreview, '15) data.chat.lastMessagePreview must exist');
  assertString(chat?.lastMessageFrom, '15) data.chat.lastMessageFrom must exist');
  assertNumber(chat?.unreadCount, '15) data.chat.unreadCount must be a number');
  ok(typeof chat?.isOpen === 'boolean', '15) data.chat.isOpen must be boolean');

  ok(isOptionalString(data.mainUnit), '16) data.mainUnit must be optional string/null');
  ok(
    isOptionalString(data.responsibleProfessional),
    '16) data.responsibleProfessional must be optional string/null'
  );
  ok(
    data.clinicalRisk === undefined ||
      data.clinicalRisk === null ||
      ['baixo', 'moderado', 'alto', 'critico'].includes(data.clinicalRisk),
    '16) data.clinicalRisk must be optional valid risk/null'
  );

  results.push('1-16 summary payload passed');
}

function assertTimelineContract(timeline, results, label = 'patient-timeline') {
  ok(timeline?.status === 200, `${label} expected 200, got ${timeline?.status}`);
  ok(timeline?.json?.ok === true, `${label}.ok must be true`);
  ok(timeline.json?.data && timeline.json?.meta, `${label} must include data and meta`);
  ok(isArray(timeline.json?.data?.events), `${label}.data.events must be array`);
  ok(isInteger(timeline.json?.data?.page), `${label}.data.page must be integer`);
  ok(isInteger(timeline.json?.data?.page_size), `${label}.data.page_size must be integer`);
  ok(isInteger(timeline.json?.data?.total), `${label}.data.total must be integer`);
  timeline.json.data.events.forEach((event, index) =>
    assertTimelineEventShape(event, index, label)
  );
  results.push(`${label} payload passed`);
}

function assertCategoryFilter(timelineWithCategory, results) {
  assertTimelineContract(timelineWithCategory, results, 'patient-timeline category filter');
  const categoryEvents = timelineWithCategory.json?.data?.events;
  if (categoryEvents.length > 0) {
    const mismatched = categoryEvents.find((event) => event?.category !== 'clinical');
    ok(!mismatched, 'category filter must return only matching category events when events exist');
  }
  results.push('category filter passed');
}

async function runFixture() {
  const fixturePath = path.resolve(args.fixture ?? defaultFixturePath);
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const results = [];

  assertSummaryContract(fixture.summary, results);
  assertTimelineContract(fixture.timeline, results);
  assertCategoryFilter(fixture.timelineWithCategory ?? fixture.timeline, results);

  if (fixture.forbiddenWithoutPatientsRead) {
    ok(
      fixture.forbiddenWithoutPatientsRead.status === 403,
      `expected 403 without patients.read, got ${fixture.forbiddenWithoutPatientsRead.status}`
    );
    results.push('forbidden fixture passed');
  }

  if (fixture.crossTenant) {
    ok(
      fixture.crossTenant.status !== 200,
      `cross-tenant fetch should fail, got ${fixture.crossTenant.status}`
    );
    results.push(`cross-tenant fixture passed (status ${fixture.crossTenant.status})`);
  }

  console.log(`Paciente 360 fixture contract checks passed: ${fixturePath}`);
  for (const item of results) console.log(`- ${item}`);
}

async function runReal() {
  const envModule = await import('./_shared/env.mjs');
  readEnvValue = envModule.getEnvValue;

  getRequiredEnvAlias('SUPABASE_URL', ['SUPABASE_URL']);

  const tokenWithPatientsRead = getRequiredEnvAlias('patients.read token', [
    'TOKEN_WITH_PATIENTS_READ',
    'TEST_ACCESS_TOKEN',
  ]);
  const patientIdTenantA = getRequiredEnvAlias('tenant A patient id', [
    'PATIENT_ID_TENANT_A',
    'TEST_PATIENT_ID',
  ]);
  const tokenWithoutPatientsRead = readEnvValue('TOKEN_WITHOUT_PATIENTS_READ');
  const patientIdTenantB = readEnvValue('PATIENT_ID_TENANT_B');

  const results = [];

  const summary = await callFunction('patient-360-summary', tokenWithPatientsRead, {
    patient_id: patientIdTenantA,
  });
  assertSummaryContract(summary, results);

  const timeline = await callFunction('patient-timeline', tokenWithPatientsRead, {
    patient_id: patientIdTenantA,
    page: 1,
    page_size: 10,
  });
  assertTimelineContract(timeline, results);

  const timelineWithCategory = await callFunction('patient-timeline', tokenWithPatientsRead, {
    patient_id: patientIdTenantA,
    category: 'clinical',
    page: 1,
    page_size: 10,
  });
  assertCategoryFilter(timelineWithCategory, results);

  if (tokenWithoutPatientsRead) {
    const forbidden = await callFunction('patient-360-summary', tokenWithoutPatientsRead, {
      patient_id: patientIdTenantA,
    });
    ok(forbidden.status === 403, `expected 403 without patients.read, got ${forbidden.status}`);
    results.push('forbidden real check passed');
  } else {
    results.push('forbidden real check skipped (TOKEN_WITHOUT_PATIENTS_READ not provided)');
  }

  if (patientIdTenantB) {
    const crossTenant = await callFunction('patient-360-summary', tokenWithPatientsRead, {
      patient_id: patientIdTenantB,
    });
    ok(crossTenant.status !== 200, `cross-tenant fetch should fail, got ${crossTenant.status}`);
    results.push(`cross-tenant real check passed (status ${crossTenant.status})`);
  } else {
    results.push('cross-tenant real check skipped (PATIENT_ID_TENANT_B not provided)');
  }

  console.log('Paciente 360 real contract checks passed:');
  for (const item of results) console.log(`- ${item}`);
}

if (!['fixture', 'real'].includes(mode)) {
  console.error(`Invalid mode: ${mode}`);
  printUsage();
  process.exit(1);
}

const runner = mode === 'fixture' ? runFixture : runReal;

runner().catch((error) => {
  console.error(`Contract checks failed: ${error.message}`);
  process.exit(1);
});
