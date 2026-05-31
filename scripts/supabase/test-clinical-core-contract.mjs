#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getRequiredServiceRoleKey, requireEnv } from './_shared/env.mjs';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

let admin;
let tenantId;
let patientId;
let appointmentId;
let encounterId;
let soapNoteId;
let currentStep = 'initializing';

try {
  requireEnv(requiredEnv);
  assertSafeTarget(process.env.SUPABASE_URL);
  admin = createClient(process.env.SUPABASE_URL, getRequiredServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await run();
  console.log('Clinical core contract smoke passed.');
} catch (error) {
  console.error(`Clinical core contract smoke failed at step: ${currentStep}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await cleanup();
}

function assertSafeTarget(url) {
  if (process.env.ALLOW_REMOTE_CLINICAL_CORE_SMOKE === 'true') return;

  const parsed = new URL(url);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      'Refusing to run mutating clinical core smoke outside localhost. Set ALLOW_REMOTE_CLINICAL_CORE_SMOKE=true only for an approved sandbox.'
    );
  }
}

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const suffix = randomUUID().slice(0, 8);

  currentStep = 'create tenant';
  const tenant = await insertOne('tenants', {
    slug: `clinical-core-smoke-${suffix}`,
    name: `Clinical Core Smoke ${suffix}`,
    status: 'active',
  });
  tenantId = tenant.id;

  currentStep = 'create patient and pii';
  const patient = await insertOne('patients', {
    tenant_id: tenantId,
    preferred_name: 'Core Smoke',
    status: 'active',
    tags: ['clinical-core-smoke'],
  });
  patientId = patient.id;
  await admin
    .from('patient_pii')
    .insert({
      tenant_id: tenantId,
      patient_id: patientId,
      full_name: 'Paciente Clinical Core Smoke',
      email: 'clinical-core-smoke@example.test',
      phone: '+55 11 99999-0000',
      birth_date: '1990-01-01',
    })
    .throwOnError();

  currentStep = 'create appointment';
  const appointment = await insertOne('appointments', {
    tenant_id: tenantId,
    patient_id: patientId,
    type: 'consulta_medica',
    status: 'agendado',
    scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    duration_minutes: 30,
    location: 'Sala smoke',
  });
  appointmentId = appointment.id;

  currentStep = 'transition appointment queue';
  for (const status of [
    'chegou',
    'triagem',
    'medidas',
    'bioimpedancia',
    'aguardando_medico',
    'em_consulta',
    'checkout',
    'concluido',
  ]) {
    await admin
      .from('appointments')
      .update({
        status,
        arrived_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', appointmentId)
      .throwOnError();
    await admin
      .from('queue_events')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        appointment_id: appointmentId,
        event_type: 'appointment_status_transition',
        status: 'closed',
        metadata: { toStatus: status },
      })
      .throwOnError();
  }

  currentStep = 'create encounter and soap';
  const encounter = await insertOne('encounters', {
    tenant_id: tenantId,
    patient_id: patientId,
    appointment_id: appointmentId,
    status: 'open',
    encounter_type: 'clinic_visit',
    started_at: new Date().toISOString(),
  });
  encounterId = encounter.id;
  const soap = await insertOne('soap_notes', {
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: encounterId,
    status: 'final',
    subjective: 'Paciente relata boa adesao.',
    objective: 'Peso e medidas avaliados.',
    assessment: 'Evolucao clinica adequada.',
    plan: 'Manter plano e reavaliar exames.',
  });
  soapNoteId = soap.id;
  await admin
    .from('encounters')
    .update({ status: 'closed', ended_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', encounterId)
    .throwOnError();

  currentStep = 'create clinical records';
  await insertOne('measurements', {
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: encounterId,
    weight_kg: 82.3,
    height_cm: 172,
    bmi: 27.8,
    waist_cm: 92,
  });
  await insertOne('bioimpedance_results', {
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: encounterId,
    result_payload: {
      lean_mass_kg: 55,
      fat_mass_kg: 22,
      total_body_water_l: 39,
      phase_angle_deg: 6.1,
      source: 'clinical-core-smoke',
    },
  });
  const labOrder = await insertOne('lab_orders', {
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: encounterId,
    order_payload: {
      panel_name: 'Checkup smoke',
      tests: ['hemograma', 'glicemia'],
      urgency: 'routine',
    },
  });
  await insertOne('lab_results', {
    tenant_id: tenantId,
    patient_id: patientId,
    lab_order_id: labOrder.id,
    result_payload: {
      glicemia: 92,
      interpretation: 'Dentro do esperado.',
    },
  });

  currentStep = 'create timeline and audit';
  await insertOne('patient_timeline_events', {
    tenant_id: tenantId,
    patient_id: patientId,
    event_type: 'soap_atualizado',
    category: 'clinical',
    status: 'recorded',
    title: 'SOAP finalizado',
    description: 'Atendimento finalizado no smoke clinico.',
    payload: { encounterId, soapNoteId },
  });
  await insertOne('audit_logs', {
    tenant_id: tenantId,
    action: 'clinical_core_smoke',
    entity_type: 'encounter',
    entity_id: encounterId,
    metadata: { patientId, appointmentId },
  });

  currentStep = 'assert persisted contract';
  const [{ count: appointmentCount }, { count: queueCount }, { count: recordCount }] =
    await Promise.all([
      admin
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId),
      admin
        .from('queue_events')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('appointment_id', appointmentId),
      admin
        .from('measurements')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId),
    ]);

  ok(appointmentCount === 1, 'appointment was not persisted');
  ok((queueCount ?? 0) >= 5, 'queue transitions were not persisted');
  ok(recordCount === 1, 'measurement was not persisted');
}

async function insertOne(table, payload) {
  const { data, error } = await admin.from(table).insert(payload).select('id').single();
  if (error) throw error;
  return data;
}

async function cleanup() {
  if (!admin || !tenantId) return;
  currentStep = 'cleanup';
  const { error } = await admin.from('tenants').delete().eq('id', tenantId);
  if (error) {
    console.error(`Clinical core smoke cleanup failed for tenant ${tenantId}: ${error.message}`);
  }
}
