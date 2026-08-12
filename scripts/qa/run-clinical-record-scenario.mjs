#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { cleanupQaFixtures, createAdmin, seedQaFixtures, signInQa } from './qa-fixtures.mjs';

let currentStep = 'initializing';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function rpc(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data;
}

async function expectRejected(label, action) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(`${label}: expected rejection.`);
}

async function count(admin, table, filters) {
  let query = admin.from(table).select('*', { count: 'exact', head: true });
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { count: value, error } = await query;
  if (error) throw error;
  return value ?? 0;
}

async function prepareAgendaService(admin, tenantId) {
  const { data: service, error: serviceError } = await admin
    .from('services')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', 'Consulta padrão')
    .maybeSingle();
  if (serviceError || !service) throw serviceError ?? new Error('default QA agenda service was not created');

  const { error: updateError } = await admin
    .from('services')
    .update({ base_price_cents: 10000 })
    .eq('tenant_id', tenantId)
    .eq('id', service.id);
  if (updateError) throw updateError;
  return service.id;
}

async function run() {
  const admin = createAdmin();
  try {
    currentStep = 'cleaning synthetic fixtures';
    await cleanupQaFixtures(admin);
    currentStep = 'seeding synthetic fixtures';
    const fixture = await seedQaFixtures(admin);
    const owner = await signInQa('qa_owner_a', fixture.password);
    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const serviceId = await prepareAgendaService(admin, fixture.tenants.aurora);

    currentStep = 'checking local connection failure without writes';
    const disconnected = createClient('http://127.0.0.1:1', process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await expectRejected('connection drop', () => rpc(disconnected, 'create_agenda_appointment', {}));

    currentStep = 'creating concurrent appointment and conflict check';
    const appointmentInput = {
      p_patient_id: fixture.patients.qa_patient_a,
      p_type: 'consulta_medica',
      p_scheduled_at: startAt,
      p_duration_minutes: 30,
      p_location: 'QA Sala 1',
      p_notes: 'qa_fixture',
      p_commercial_context: { serviceId },
    };
    const concurrent = await Promise.allSettled([
      rpc(owner, 'create_agenda_appointment', appointmentInput),
      rpc(owner, 'create_agenda_appointment', appointmentInput),
    ]);
    const successes = concurrent.filter((result) => result.status === 'fulfilled');
    const failures = concurrent.filter((result) => result.status === 'rejected');
    assert(successes.length === 1 && failures.length === 1, 'concurrent agenda conflict did not resolve deterministically');
    const appointmentId = successes[0].value.id;
    await expectRejected('appointment conflict', () =>
      rpc(owner, 'create_agenda_appointment', {
        ...appointmentInput,
        p_notes: 'qa_fixture_conflict',
      })
    );
    await expectRejected('invalid agenda transition', () =>
      rpc(owner, 'update_appointment_status', {
        p_appointment_id: appointmentId,
        p_next_status: 'checkout',
        p_reason: null,
      })
    );

    currentStep = 'advancing attendance workflow';
    for (const status of ['confirmado', 'chegou', 'triagem', 'medidas', 'bioimpedancia', 'aguardando_medico', 'em_consulta']) {
      await rpc(owner, 'update_appointment_status', {
        p_appointment_id: appointmentId,
        p_next_status: status,
        p_reason: null,
      });
    }

    currentStep = 'recording measurement and SOAP draft';
    const draft = await rpc(owner, 'autosave_encounter', {
      p_patient_id: fixture.patients.qa_patient_a,
      p_encounter_id: null,
      p_appointment_id: appointmentId,
      p_soap_note_id: null,
      p_subjective: 'QA subjective',
      p_objective: 'QA objective',
      p_assessment: 'QA assessment',
      p_plan: 'QA plan',
    });
    await rpc(owner, 'record_patient_measurement', {
      p_payload: {
        patientId: fixture.patients.qa_patient_a,
        encounterId: draft.encounterId,
        appointmentId,
        sourceModule: 'encounter',
        weightKg: 70.2,
        heightCm: 170,
        waistCm: 80,
      },
    });

    currentStep = 'finalizing SOAP and rejecting duplicate retry';
    const finalized = await rpc(owner, 'finalize_encounter_soap', {
      p_payload: {
        patientId: fixture.patients.qa_patient_a,
        encounterId: draft.encounterId,
        appointmentId,
        soapNoteId: draft.soapNoteId,
        subjective: 'QA subjective final',
        objective: 'QA objective final',
        assessment: 'QA assessment final',
        plan: 'QA plan final',
      },
    });
    await expectRejected('duplicate finalization retry', () =>
      rpc(owner, 'finalize_encounter_soap', {
        p_payload: {
          patientId: fixture.patients.qa_patient_a,
          encounterId: draft.encounterId,
          appointmentId,
          soapNoteId: draft.soapNoteId,
          subjective: 'retry', objective: 'retry', assessment: 'retry', plan: 'retry',
        },
      })
    );

    currentStep = 'appending immutable SOAP amendment';
    await rpc(owner, 'append_final_soap_amendment', {
      p_soap_note_id: finalized.soapNoteId,
      p_amendment_text: 'QA addendum: patient reported a relevant clarification after finalization.',
      p_reason: 'Clinical clarification',
    });
    const exported = await rpc(owner, 'export_final_soap_record', { p_soap_note_id: finalized.soapNoteId });
    assert(exported?.soap?.id === finalized.soapNoteId && exported.amendments?.length === 1, 'authorized SOAP export is incomplete');
    const patient = await signInQa('qa_patient_a', fixture.password);
    await expectRejected('patient SOAP export without clinical permission', () =>
      rpc(patient, 'export_final_soap_record', { p_soap_note_id: finalized.soapNoteId })
    );
    await expectRejected('final SOAP direct mutation', async () => {
      const { error } = await admin
        .from('soap_notes')
        .update({ subjective: 'must not mutate' })
        .eq('id', finalized.soapNoteId);
      if (error) throw error;
    });

    currentStep = 'issuing immutable clinical orientation';
    const prescription = await rpc(owner, 'upsert_patient_prescription', {
      p_patient_id: fixture.patients.qa_patient_a,
      p_prescription_id: null,
      p_encounter_id: finalized.encounterId,
      p_finalize: true,
      p_payload: {
        category: 'orientacao', title: 'QA orientação final', instructions: 'Manter acompanhamento.',
        medicationName: 'Orientação QA', dosage: '', frequency: '', patientVisible: true,
      },
    });
    await expectRejected('issued prescription mutation', () =>
      rpc(owner, 'upsert_patient_prescription', {
        p_patient_id: fixture.patients.qa_patient_a,
        p_prescription_id: prescription.id,
        p_encounter_id: finalized.encounterId,
        p_finalize: true,
        p_payload: { category: 'orientacao', title: 'mutation', instructions: 'mutation', medicationName: 'mutation', dosage: '', frequency: '' },
      })
    );

    currentStep = 'asserting automatic checkout and persistence';
    const { data: completedAppointment, error: completedAppointmentError } = await admin
      .from('appointments')
      .select('status')
      .eq('tenant_id', fixture.tenants.aurora)
      .eq('id', appointmentId)
      .single();
    if (completedAppointmentError) throw completedAppointmentError;
    assert(completedAppointment.status === 'concluido', 'final SOAP did not complete checkout');
    const tenantId = fixture.tenants.aurora;
    assert(await count(admin, 'measurements', { tenant_id: tenantId, patient_id: fixture.patients.qa_patient_a }) === 1, 'measurement was not persisted');
    assert(await count(admin, 'soap_note_amendments', { tenant_id: tenantId, soap_note_id: finalized.soapNoteId }) === 1, 'SOAP amendment was not persisted');
    assert((await count(admin, 'patient_timeline_events', { tenant_id: tenantId, patient_id: fixture.patients.qa_patient_a })) >= 4, 'clinical timeline lacks events');
    assert((await count(admin, 'audit_logs', { tenant_id: tenantId })) >= 6, 'clinical audit lacks events');
    console.log(JSON.stringify({ status: 'passed', scenario: 'clinical-record-lifecycle', assertions: 13 }));
  } finally {
    try {
      await cleanupQaFixtures(admin);
    } catch {
      console.error('QA clinical cleanup failed; synthetic fixture removal must be retried.');
    }
  }
}

run().catch((error) => {
  const details = error && typeof error === 'object'
    ? [error.message, error.code, error.details, error.hint].filter(Boolean).join(' | ')
    : String(error);
  console.error(`QA clinical scenario failed during ${currentStep}: ${details || 'unknown_error'}`);
  process.exitCode = 1;
});
