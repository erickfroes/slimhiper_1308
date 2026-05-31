#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { getRequiredServiceRoleKey, requireEnv } from './_shared/env.mjs';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

let supabase;
try {
  requireEnv(requiredEnv);
  supabase = createClient(process.env.SUPABASE_URL, getRequiredServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

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
  program: '71000000-0000-4000-8000-0000000000a1',
  programPhase1: '71000000-0000-4000-8000-0000000000b1',
  programPhase2: '71000000-0000-4000-8000-0000000000b2',
  programService1: '71000000-0000-4000-8000-0000000000a2',
  programService2: '71000000-0000-4000-8000-0000000000a5',
  programEntitlement: '71000000-0000-4000-8000-0000000000a3',
  programDocument: '71000000-0000-4000-8000-0000000000d1',
  programCheckinTemplate: '71000000-0000-4000-8000-0000000000c1',
  enrollment: '71000000-0000-4000-8000-0000000000a4',
  checkin1: '71000000-0000-4000-8000-0000000000e1',
  checkin2: '71000000-0000-4000-8000-0000000000e2',
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
      status: 'concluido',
      scheduled_at: '2026-04-18T14:00:00Z',
      duration_minutes: 45,
      practitioner_id: practitionerId,
      location: 'Room 2 - Nutrition',
      notes: 'Consulta de avaliação nutricional inicial. Conteúdo demonstrativo.',
      type: 'consulta_nutricao',
    },
    {
      id: IDS.appointment2,
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      status: 'agendado',
      scheduled_at: '2026-05-20T13:30:00Z',
      duration_minutes: 30,
      practitioner_id: practitionerId,
      location: 'Room 1 - Follow-up',
      notes: 'Retorno de acompanhamento agendado. Conteúdo demonstrativo.',
      type: 'retorno',
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
    waist_cm: 82.0,
    measured_by: practitionerId,
    notes: 'Primeira avaliação antropométrica do programa demo.',
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
    medication_name: 'Plano de estilo de vida',
    dosage: 'Acompanhamento diário',
    frequency: 'diaria',
    instructions: 'Registrar adesão no check-in semanal e revisar no retorno.',
    start_date: '2026-04-18',
    end_date: '2026-07-11',
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
      event_type: 'paciente_cadastrado',
      category: 'commercial',
      status: 'recorded',
      title: 'Paciente cadastrado no CRM',
      description: 'Cadastro inicial concluído com vínculo ao tenant de demonstração.',
      actor_name: 'System bootstrap',
      status_label: 'Registrado',
      action_label: 'Ver perfil',
      details_href: `/patients/${IDS.patient}`,
      event_at: '2026-04-18T14:00:00Z',
      payload: { source: 'bootstrap-patient360-demo', summary: 'Cadastro inicial concluído.' },
    },
    {
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      event_type: 'consulta_agendada',
      category: 'agenda',
      status: 'recorded',
      title: 'Consulta de retorno agendada',
      description: 'Retorno nutricional confirmado para acompanhamento de evolução.',
      actor_name: 'Central de agendamento',
      status_label: 'Agendado',
      action_label: 'Ver agenda',
      details_href: `/clinic/agenda?appointmentId=${IDS.appointment2}`,
      event_at: '2026-05-05T10:30:00Z',
      payload: {
        appointmentId: IDS.appointment2,
        appointmentStatus: 'agendado',
        appointmentType: 'retorno',
      },
    },
    {
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      event_type: 'atendimento_concluido',
      category: 'clinical',
      status: 'recorded',
      title: 'Atendimento concluído',
      description: 'Consulta inicial finalizada com plano terapêutico ativo.',
      actor_name: 'Dra. Marina Costa',
      status_label: 'Concluído',
      action_label: 'Ver atendimento',
      details_href: `/clinic/patients/${IDS.patient}/encounters/${IDS.encounter1}`,
      event_at: '2026-04-18T14:50:00Z',
      payload: { encounterId: IDS.encounter1, programMetadata },
    },
    {
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      event_type: 'soap_atualizado',
      category: 'clinical',
      status: 'recorded',
      title: 'SOAP atualizado',
      description: 'Evolução clínica registrada com conduta de acompanhamento.',
      actor_name: 'Dra. Marina Costa',
      status_label: 'Final',
      action_label: 'Abrir SOAP',
      details_href: `/clinic/patients/${IDS.patient}/encounters/${IDS.encounter1}`,
      event_at: '2026-04-18T15:00:00Z',
      payload: { soapId: IDS.soap1, soapStatus: 'final' },
    },
    {
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      event_type: 'medida_registrada',
      category: 'clinical',
      status: 'recorded',
      title: 'Medidas corporais registradas',
      description: 'Peso, IMC e composição corporal foram atualizados no prontuário.',
      actor_name: 'Equipe clínica',
      status_label: 'Registrado',
      action_label: 'Ver medidas',
      details_href: `/clinic/patients/${IDS.patient}?tab=resumo`,
      event_at: '2026-04-18T14:25:00Z',
      payload: { measurementId: IDS.measurement1, bmi: 25.9, weightKg: 71.4 },
    },
    {
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      event_type: 'prescricao_emitida',
      category: 'clinical',
      status: 'recorded',
      title: 'Prescrição emitida',
      description: 'Plano de hábitos e metas semanais disponibilizado para a paciente.',
      actor_name: 'Dra. Marina Costa',
      status_label: 'Emitida',
      action_label: 'Ver prescrição',
      details_href: `/clinic/patients/${IDS.patient}?tab=prescricoes`,
      event_at: '2026-04-18T15:05:00Z',
      payload: { prescriptionId: IDS.prescription1 },
    },
    {
      tenant_id: tenant.id,
      patient_id: IDS.patient,
      event_type: 'checkin_semanal_enviado',
      category: 'patient_app',
      status: 'recorded',
      title: 'Check-in semanal enviado',
      description: 'Paciente enviou check-in com adesão alimentar e rotina de sono.',
      actor_name: 'Aplicativo do paciente',
      status_label: 'Recebido',
      action_label: 'Ver check-in',
      details_href: `/clinic/patients/${IDS.patient}?tab=comunicacao`,
      event_at: '2026-05-03T10:00:00Z',
      payload: { adherencePercent: 84, source: 'patient-app-demo' },
    },
  ];

  await supabase.from('patients').upsert([patientRow], { onConflict: 'id' }).throwOnError();
  await supabase.from('patient_pii').upsert([patientPiiRow], { onConflict: 'tenant_id,patient_id' }).throwOnError();
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

  await supabase
    .from('programs')
    .upsert(
      {
        id: IDS.program,
        tenant_id: tenant.id,
        name: 'Metabolic Reset 12 Weeks',
        program_type: 'saude_metabolica',
        objective: 'Programa demo com enrollment e check-ins reais para Paciente 360.',
        duration_weeks: 12,
        status: 'ativo',
        payment_model: 'parcelado',
        payment_description: 'Plano demo em 12 parcelas.',
        color: 'teal',
        created_by: practitionerId,
        checkins_total: 12,
        checkin_frequency: 'Semanal via app',
        financial_config: {
          paymentModel: 'parcelado',
          basePrice: 2400,
          installments: 12,
          discountPercent: 0,
          description: 'Plano demo em 12 parcelas.',
        },
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await supabase
    .from('program_phases')
    .upsert(
      [
        {
          id: IDS.programPhase1,
          tenant_id: tenant.id,
          program_id: IDS.program,
          position: 1,
          name: 'Avaliacao',
          duration_weeks: 2,
          description: 'Triagem, exames e metas iniciais.',
        },
        {
          id: IDS.programPhase2,
          tenant_id: tenant.id,
          program_id: IDS.program,
          position: 2,
          name: 'Acompanhamento',
          duration_weeks: 10,
          description: 'Consultas, nutricao e check-ins semanais.',
        },
      ],
      { onConflict: 'id' }
    )
    .throwOnError();

  await supabase
    .from('program_services')
    .upsert(
      [
        {
          id: IDS.programService1,
          tenant_id: tenant.id,
          program_id: IDS.program,
          label: 'Consultas clinicas',
          quantity: 4,
          unit: 'consulta',
        },
        {
          id: IDS.programService2,
          tenant_id: tenant.id,
          program_id: IDS.program,
          label: 'Sessoes de nutricao',
          quantity: 3,
          unit: 'sessao',
        },
      ],
      { onConflict: 'id' }
    )
    .throwOnError();

  await supabase
    .from('program_entitlements')
    .upsert(
      {
        id: IDS.programEntitlement,
        tenant_id: tenant.id,
        program_id: IDS.program,
        key: 'chat',
        label: 'Chat com equipe',
        enabled: true,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await supabase
    .from('program_required_documents')
    .upsert(
      {
        id: IDS.programDocument,
        tenant_id: tenant.id,
        program_id: IDS.program,
        label: 'Termo de consentimento informado',
        required: true,
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await supabase
    .from('program_checkin_templates')
    .upsert(
      {
        id: IDS.programCheckinTemplate,
        tenant_id: tenant.id,
        program_id: IDS.program,
        label: 'Check-in semanal demo',
        frequency: 'Semanal',
        channel: 'app',
        questions: [
          'Como foi sua adesao ao plano nesta semana?',
          'Teve algum sintoma ou dificuldade?',
          'Deseja deixar alguma observacao para a equipe?',
        ],
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  if (practitionerId) {
    await supabase
      .from('program_team_members')
      .upsert(
        {
          tenant_id: tenant.id,
          program_id: IDS.program,
          profile_id: practitionerId,
          role_label: 'Medico',
          specialty: 'Medicina',
        },
        { onConflict: 'tenant_id,program_id,profile_id' }
      )
      .throwOnError();
  }

  await supabase
    .from('patient_program_enrollments')
    .upsert(
      {
        id: IDS.enrollment,
        tenant_id: tenant.id,
        patient_id: IDS.patient,
        program_id: IDS.program,
        status: 'ativo',
        start_date: '2026-05-01',
        end_date: '2026-07-23',
        current_week: 5,
        total_consultations: 4,
        used_consultations: 1,
        total_nutrition_sessions: 3,
        used_nutrition_sessions: 1,
        metadata: { seeded_by: 'bootstrap-patient360-demo' },
      },
      { onConflict: 'id' }
    )
    .throwOnError();

  await supabase
    .from('patient_program_checkins')
    .upsert(
      [
        {
          id: IDS.checkin1,
          tenant_id: tenant.id,
          patient_id: IDS.patient,
          enrollment_id: IDS.enrollment,
          program_id: IDS.program,
          template_id: IDS.programCheckinTemplate,
          title: 'Check-in semanal demo #1',
          channel: 'app',
          due_date: '2026-05-08',
          status: 'completed',
          questions: ['Como foi sua adesao ao plano nesta semana?'],
          responses: { adherence: 84 },
          completed_at: '2026-05-08T10:00:00Z',
        },
        {
          id: IDS.checkin2,
          tenant_id: tenant.id,
          patient_id: IDS.patient,
          enrollment_id: IDS.enrollment,
          program_id: IDS.program,
          template_id: IDS.programCheckinTemplate,
          title: 'Check-in semanal demo #2',
          channel: 'app',
          due_date: '2026-05-15',
          status: 'scheduled',
          questions: ['Como foi sua adesao ao plano nesta semana?'],
          responses: {},
        },
      ],
      { onConflict: 'id' }
    )
    .throwOnError();

  console.log('Paciente 360 demo bootstrap completed.');
  console.log(`Tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`Patient: Juliana Pereira (${IDS.patient})`);
  console.log(`Program reference mode: ${programMetadata.package_reference_mode}`);
}

run().catch((error) => {
  console.error('Bootstrap failed:', error.message);
  process.exit(1);
});
