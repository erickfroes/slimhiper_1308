#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const IDS = {
  patient: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  appointment1: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  appointment2: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  encounter1: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  encounter2: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
  soap1: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  measurement1: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  bio1: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
  labOrder1: '11111111-1111-4111-8111-111111111111',
  labResult1: '22222222-2222-4222-8222-222222222222',
  prescription1: '33333333-3333-4333-8333-333333333333',
};

async function tableExists(tableName) {
  const { error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  return !error;
}

async function run() {
  const tenantSlug = process.env.SUPABASE_BOOTSTRAP_TENANT_SLUG ?? 'demo-clinic';
  const tenantName = process.env.SUPABASE_BOOTSTRAP_TENANT_NAME ?? 'Demo Clinic';

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .upsert({ slug: tenantSlug, name: tenantName, status: 'active' }, { onConflict: 'slug' })
    .select('id, slug, name')
    .single();
  if (tenantError) throw tenantError;

  const { data: physicianProfile } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', 'physician.demo@example.com')
    .maybeSingle();

  const practitionerId = physicianProfile?.id ?? null;

  const patientRow = {
    id: IDS.patient,
    tenant_id: tenant.id,
    status: 'active',
    preferred_name: 'Juliana',
  };

  const patientPiiRow = {
    patient_id: IDS.patient,
    tenant_id: tenant.id,
    full_name: 'Juliana Pereira',
    email: 'juliana.pereira.demo@example.com',
    phone: '+55 11 90000-1234',
    cpf_masked: '***.***.***-**',
    birth_date: '1992-04-17',
    sex_gender: 'female',
  };

  const appointments = [
    {
      id: IDS.appointment1,
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      status: 'completed',
      scheduled_at: '2026-04-18T14:00:00Z',
      duration_minutes: 45,
      practitioner_id: practitionerId,
      location: 'Room 2 - Nutrition',
      notes: 'Initial nutritional assessment. Demo-safe content only.',
    },
    {
      id: IDS.appointment2,
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      status: 'scheduled',
      scheduled_at: '2026-05-20T13:30:00Z',
      duration_minutes: 30,
      practitioner_id: practitionerId,
      location: 'Room 1 - Follow-up',
      notes: 'Follow-up visit scheduled. Demo-safe content only.',
    },
  ];

  const encounters = [
    {
      id: IDS.encounter1,
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      appointment_id: IDS.appointment1,
      status: 'closed',
      encounter_type: 'nutrition_consult',
      started_at: '2026-04-18T14:05:00Z',
      ended_at: '2026-04-18T14:50:00Z',
    },
    {
      id: IDS.encounter2,
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      appointment_id: null,
      status: 'open',
      encounter_type: 'telemonitoring_review',
      started_at: '2026-05-03T10:00:00Z',
      ended_at: null,
    },
  ];

  const packageTablesExist = (await tableExists('packages')) || (await tableExists('programs'));
  const programMetadata = {
    package_reference_mode: packageTablesExist ? 'relational' : 'metadata_fallback',
    active_program: {
      name: 'Metabolic Reset 12 Weeks',
      code: 'M12-DEMO',
      started_at: '2026-04-20',
      phase: 'phase_2_adherence',
      status: 'active',
    },
  };

  const soapNotes = [{
    id: IDS.soap1,
    tenant_id: tenant.id,
    patient_id: IDS.patient,
    encounter_id: IDS.encounter1,
    status: 'final',
    subjective: 'Patient reports good adherence to meal timing and hydration goals.',
    objective: 'No acute complaints. Vitals stable. Demo data only.',
    assessment: 'Positive response to initial nutrition plan; continue progressive adjustments.',
    plan: 'Maintain current plan, add one resistance-training session weekly, reassess in 4 weeks.',
    authored_by: practitionerId,
  }];

  const measurements = [{
    id: IDS.measurement1,
    tenant_id: tenant.id,
    patient_id: IDS.patient,
    encounter_id: IDS.encounter1,
    status: 'recorded',
    measured_at: '2026-04-18T14:20:00Z',
    height_cm: 166.0,
    weight_kg: 71.4,
    bmi: 25.9,
    body_fat_pct: 31.2,
  }];

  const bioimpedance = [{
    id: IDS.bio1,
    tenant_id: tenant.id,
    patient_id: IDS.patient,
    encounter_id: IDS.encounter1,
    status: 'final',
    measured_at: '2026-04-18T14:25:00Z',
    result_payload: {
      lean_mass_kg: 46.9,
      fat_mass_kg: 22.3,
      total_body_water_l: 34.1,
      phase_angle_deg: 6.1,
      source: 'demo-device-simulator',
    },
  }];

  const labOrders = [{
    id: IDS.labOrder1,
    tenant_id: tenant.id,
    patient_id: IDS.patient,
    encounter_id: IDS.encounter1,
    status: 'completed',
    ordered_at: '2026-04-18T14:40:00Z',
    ordered_by: practitionerId,
    order_payload: {
      panel_name: 'Metabolic Wellness Panel',
      tests: ['fasting_glucose', 'hba1c', 'lipid_profile'],
      urgency: 'routine',
      note: 'Demo-safe order payload.',
    },
  }];

  const labResults = [{
    id: IDS.labResult1,
    tenant_id: tenant.id,
    patient_id: IDS.patient,
    lab_order_id: IDS.labOrder1,
    status: 'received',
    result_at: '2026-04-23T11:00:00Z',
    result_payload: {
      fasting_glucose_mg_dl: 94,
      hba1c_pct: 5.4,
      ldl_mg_dl: 108,
      hdl_mg_dl: 56,
      triglycerides_mg_dl: 118,
      interpretation: 'Within expected range for this demo scenario.',
    },
  }];

  const prescriptions = [{
    id: IDS.prescription1,
    tenant_id: tenant.id,
    patient_id: IDS.patient,
    encounter_id: IDS.encounter1,
    status: 'final',
    prescription_text: 'Lifestyle prescription: 8k steps/day, protein target 1.4 g/kg/day, sleep 7-8h/night.',
    created_by: practitionerId,
  }];

  const alerts = [{
    tenant_id: tenant.id,
    patient_id: IDS.patient,
    status: 'active',
    alert_type: 'nutrition_followup',
    title: 'Follow-up due this month',
    description: 'Review adherence and update meal strategy by end of month.',
    severity: 'medium',
    starts_at: '2026-05-01T00:00:00Z',
    ends_at: '2026-05-31T23:59:59Z',
  }];

  const tasks = [{
    tenant_id: tenant.id,
    patient_id: IDS.patient,
    status: 'open',
    title: 'Send weekly meal photo log reminder',
    details: 'Automated reminder every Monday. Demo-only workflow.',
    due_at: '2026-05-11T12:00:00Z',
    assigned_to: practitionerId,
  }];

  const timelineEvents = [
    {
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      event_type: 'patient_seeded',
      category: 'commercial',
      status: 'recorded',
      title: 'Paciente cadastrado no CRM',
      description: 'Cadastro inicial concluído com vínculo ao tenant de demonstração.',
      actor_name: 'System bootstrap',
      status_label: 'Registrado',
      action_label: 'Ver perfil',
      details_href: `/patients/${IDS.patient}`,
      event_at: '2026-04-18T14:00:00Z',
      payload: { source: 'bootstrap-patient360-demo' },
    },
    {
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      event_type: 'program_reference',
      category: 'clinical',
      status: 'recorded',
      title: 'Programa nutricional referenciado',
      description: 'Metadados de referência do programa nutricional associados ao prontuário.',
      actor_name: 'Dra. Marina Costa',
      status_label: 'Ativo',
      action_label: 'Abrir protocolo',
      details_href: `/patients/${IDS.patient}/program`,
      event_at: '2026-04-20T09:00:00Z',
      payload: programMetadata,
    },
  ];

  await supabase.from('patients').upsert([patientRow], { onConflict: 'id' }).throwOnError();
  await supabase.from('patient_pii').upsert([patientPiiRow], { onConflict: 'patient_id' }).throwOnError();
  await supabase.from('appointments').upsert(appointments, { onConflict: 'id' }).throwOnError();
  await supabase.from('encounters').upsert(encounters, { onConflict: 'id' }).throwOnError();
  await supabase.from('soap_notes').upsert(soapNotes, { onConflict: 'id' }).throwOnError();
  await supabase.from('measurements').upsert(measurements, { onConflict: 'id' }).throwOnError();
  await supabase.from('bioimpedance_results').upsert(bioimpedance, { onConflict: 'id' }).throwOnError();
  await supabase.from('lab_orders').upsert(labOrders, { onConflict: 'id' }).throwOnError();
  await supabase.from('lab_results').upsert(labResults, { onConflict: 'id' }).throwOnError();
  await supabase.from('prescriptions_placeholder').upsert(prescriptions, { onConflict: 'id' }).throwOnError();
  await supabase.from('patient_alerts').upsert(alerts, { onConflict: 'tenant_id,patient_id,title' }).throwOnError();
  await supabase.from('patient_tasks').upsert(tasks, { onConflict: 'tenant_id,patient_id,title' }).throwOnError();
  await supabase.from('patient_timeline_events').upsert(timelineEvents, { onConflict: 'tenant_id,patient_id,event_type,event_at' }).throwOnError();

  console.log('Paciente 360 demo bootstrap completed.');
  console.log(`Tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`Patient: Juliana Pereira (${IDS.patient})`);
  console.log(`Program reference mode: ${programMetadata.package_reference_mode}`);
}

run().catch((error) => {
  console.error('Bootstrap failed:', error.message);
  process.exit(1);
});
