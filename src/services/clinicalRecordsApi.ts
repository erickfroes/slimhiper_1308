import type { PatientMeasurementSummary } from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface BioimpedanceSummary {
  id: string;
  patientId: string;
  measuredAt: string;
  leanMassKg?: number;
  fatMassKg?: number;
  bodyWaterLiters?: number;
  phaseAngleDeg?: number;
  source?: string;
  payload: Record<string, unknown>;
}

export interface LabOrderSummary {
  id: string;
  patientId: string;
  status: string;
  orderedAt: string;
  panelName: string;
  tests: string[];
  urgency?: string;
  note?: string;
}

export interface LabResultSummary {
  id: string;
  patientId: string;
  labOrderId: string | null;
  status: string;
  resultAt: string | null;
  interpretation?: string;
  values: Record<string, string | number | boolean>;
}

export interface ClinicalRecordsData {
  measurements: PatientMeasurementSummary[];
  latestMeasurement: PatientMeasurementSummary | null;
  bioimpedance: BioimpedanceSummary[];
  latestBioimpedance: BioimpedanceSummary | null;
  labOrders: LabOrderSummary[];
  labResults: LabResultSummary[];
}

export interface MeasurementInput {
  patientId: string;
  encounterId?: string | null;
  measuredAt?: string;
  heightCm?: number | null;
  weightKg?: number | null;
  bmi?: number | null;
  bodyFatPercent?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  notes?: string | null;
}

export interface BioimpedanceInput {
  patientId: string;
  encounterId?: string | null;
  measuredAt?: string;
  payload: Record<string, unknown>;
  status?: string;
}

export interface LabOrderInput {
  patientId: string;
  encounterId?: string | null;
  panelName: string;
  tests: string[];
  urgency?: string;
  note?: string;
}

export interface LabResultInput {
  patientId: string;
  labOrderId?: string | null;
  resultAt?: string;
  values: Record<string, string | number | boolean>;
  interpretation?: string;
}

interface SafeServiceError {
  message: string;
}

type MeasurementRow = {
  id: string;
  patient_id: string;
  measured_at: string;
  height_cm: unknown;
  weight_kg: unknown;
  bmi: unknown;
  body_fat_pct: unknown;
  waist_cm: unknown;
  hip_cm: unknown;
  notes: string | null;
};

type BioimpedanceRow = {
  id: string;
  patient_id: string;
  measured_at: string;
  result_payload: Record<string, unknown> | null;
};

type LabOrderRow = {
  id: string;
  patient_id: string;
  status: string;
  ordered_at: string;
  order_payload: Record<string, unknown> | null;
};

type LabResultRow = {
  id: string;
  patient_id: string;
  lab_order_id: string | null;
  status: string;
  result_at: string | null;
  result_payload: Record<string, unknown> | null;
};

function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) return { message: error.message || fallback };
  return { message: fallback };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function calculateBmi(weightKg?: number | null, heightCm?: number | null) {
  if (!weightKg || !heightCm) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

function emptyRecords(): ClinicalRecordsData {
  return {
    measurements: [],
    latestMeasurement: null,
    bioimpedance: [],
    latestBioimpedance: null,
    labOrders: [],
    labResults: [],
  };
}

async function resolveTenantPatientContext(patientId: string) {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('unauthenticated');

  const [{ data: profile }, { data: memberships, error: membershipsError }] = await Promise.all([
    supabase.from('profiles').select('active_tenant_id').eq('id', user.id).maybeSingle(),
    supabase
      .from('tenant_memberships')
      .select('tenant_id,status')
      .eq('user_id', user.id)
      .eq('status', 'active'),
  ]);

  if (membershipsError) throw membershipsError;

  const activeMemberships = memberships ?? [];
  const preferredTenantId =
    typeof profile?.active_tenant_id === 'string' ? profile.active_tenant_id : null;
  const preferredMembership = preferredTenantId
    ? activeMemberships.find((membership) => membership.tenant_id === preferredTenantId)
    : null;
  const tenantId = preferredMembership?.tenant_id ?? activeMemberships[0]?.tenant_id ?? null;

  if (!tenantId) throw new Error('no_active_tenant');

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id,tenant_id')
    .eq('id', patientId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (patientError) throw patientError;
  if (!patient) throw new Error('patient_not_found_or_forbidden');

  return { supabase, tenantId, userId: user.id, patientId };
}

function toMeasurement(row: MeasurementRow): PatientMeasurementSummary {
  const weightKg = asNumber(row.weight_kg) ?? 0;
  const heightCm = asNumber(row.height_cm) ?? 0;

  return {
    id: row.id,
    patientId: row.patient_id,
    measuredAt: row.measured_at,
    weightKg,
    heightCm,
    bmi: asNumber(row.bmi) ?? calculateBmi(weightKg, heightCm) ?? 0,
    bodyFatPercent: asNumber(row.body_fat_pct),
    waistCm: asNumber(row.waist_cm),
    hipCm: asNumber(row.hip_cm),
    notes: row.notes ?? undefined,
  };
}

function toBioimpedance(row: BioimpedanceRow): BioimpedanceSummary {
  const payload = asRecord(row.result_payload);

  return {
    id: row.id,
    patientId: row.patient_id,
    measuredAt: row.measured_at,
    leanMassKg: asNumber(payload.lean_mass_kg),
    fatMassKg: asNumber(payload.fat_mass_kg),
    bodyWaterLiters: asNumber(payload.total_body_water_l),
    phaseAngleDeg: asNumber(payload.phase_angle_deg),
    source: asString(payload.source),
    payload,
  };
}

function toLabOrder(row: LabOrderRow): LabOrderSummary {
  const payload = asRecord(row.order_payload);

  return {
    id: row.id,
    patientId: row.patient_id,
    status: row.status,
    orderedAt: row.ordered_at,
    panelName: asString(payload.panel_name) ?? 'Painel laboratorial',
    tests: asStringArray(payload.tests),
    urgency: asString(payload.urgency),
    note: asString(payload.note),
  };
}

function toLabResult(row: LabResultRow): LabResultSummary {
  const payload = asRecord(row.result_payload);
  const { interpretation, ...values } = payload;

  return {
    id: row.id,
    patientId: row.patient_id,
    labOrderId: row.lab_order_id,
    status: row.status,
    resultAt: row.result_at,
    interpretation: asString(interpretation),
    values: values as Record<string, string | number | boolean>,
  };
}

async function insertAuditLog(input: {
  patientId: string;
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.from('audit_logs').insert({
    tenant_id: input.tenantId,
    user_id: input.userId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: {
      patientId: input.patientId,
      ...input.metadata,
    },
  });

  if (error) throw error;
}

async function insertClinicalTimelineEvent(input: {
  patientId: string;
  tenantId: string;
  eventType: string;
  title: string;
  description: string;
  entityId: string;
  href?: string;
  payload?: Record<string, unknown>;
}) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.from('patient_timeline_events').insert({
    tenant_id: input.tenantId,
    patient_id: input.patientId,
    event_type: input.eventType,
    category: 'clinical',
    status: 'recorded',
    title: input.title,
    description: input.description,
    actor_name: 'Equipe clinica',
    status_label: 'Registrado',
    details_href: input.href ?? `/clinic/patients/${input.patientId}/encounter`,
    event_at: new Date().toISOString(),
    payload: {
      entityId: input.entityId,
      ...input.payload,
    },
  });

  if (error) throw error;
}

export async function getPatientClinicalRecords(
  patientId: string
): Promise<{ data: ClinicalRecordsData | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) return { data: emptyRecords(), error: null };

    const { supabase, tenantId } = await resolveTenantPatientContext(patientId);
    const [measurementsResult, bioimpedanceResult, labOrdersResult, labResultsResult] =
      await Promise.all([
        supabase
          .from('measurements')
          .select(
            'id,patient_id,measured_at,height_cm,weight_kg,bmi,body_fat_pct,waist_cm,hip_cm,notes'
          )
          .eq('tenant_id', tenantId)
          .eq('patient_id', patientId)
          .order('measured_at', { ascending: false })
          .limit(10),
        supabase
          .from('bioimpedance_results')
          .select('id,patient_id,measured_at,result_payload')
          .eq('tenant_id', tenantId)
          .eq('patient_id', patientId)
          .order('measured_at', { ascending: false })
          .limit(5),
        supabase
          .from('lab_orders')
          .select('id,patient_id,status,ordered_at,order_payload')
          .eq('tenant_id', tenantId)
          .eq('patient_id', patientId)
          .order('ordered_at', { ascending: false })
          .limit(10),
        supabase
          .from('lab_results')
          .select('id,patient_id,lab_order_id,status,result_at,result_payload')
          .eq('tenant_id', tenantId)
          .eq('patient_id', patientId)
          .order('result_at', { ascending: false, nullsFirst: false })
          .limit(10),
      ]);

    for (const result of [
      measurementsResult,
      bioimpedanceResult,
      labOrdersResult,
      labResultsResult,
    ]) {
      if (result.error) throw result.error;
    }

    const measurements = ((measurementsResult.data ?? []) as MeasurementRow[]).map(toMeasurement);
    const bioimpedance = ((bioimpedanceResult.data ?? []) as BioimpedanceRow[]).map(toBioimpedance);

    return {
      data: {
        measurements,
        latestMeasurement: measurements[0] ?? null,
        bioimpedance,
        latestBioimpedance: bioimpedance[0] ?? null,
        labOrders: ((labOrdersResult.data ?? []) as LabOrderRow[]).map(toLabOrder),
        labResults: ((labResultsResult.data ?? []) as LabResultRow[]).map(toLabResult),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to load clinical records.') };
  }
}

export async function createMeasurement(
  input: MeasurementInput
): Promise<{ data: { id: string } | null; error: SafeServiceError | null }> {
  try {
    const { supabase, tenantId, userId, patientId } = await resolveTenantPatientContext(
      input.patientId
    );
    const { data, error } = await supabase
      .from('measurements')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        encounter_id: input.encounterId ?? null,
        status: 'recorded',
        measured_at: input.measuredAt ?? new Date().toISOString(),
        height_cm: input.heightCm ?? null,
        weight_kg: input.weightKg ?? null,
        bmi: input.bmi ?? calculateBmi(input.weightKg, input.heightCm),
        body_fat_pct: input.bodyFatPercent ?? null,
        waist_cm: input.waistCm ?? null,
        hip_cm: input.hipCm ?? null,
        measured_by: userId,
        notes: input.notes ?? null,
      })
      .select('id')
      .single();

    if (error) throw error;

    await insertAuditLog({
      patientId,
      tenantId,
      userId,
      action: 'measurement_created',
      entityType: 'measurement',
      entityId: data.id,
    });
    await insertClinicalTimelineEvent({
      patientId,
      tenantId,
      eventType: 'medida_registrada',
      title: 'Medidas registradas',
      description: 'Novas medidas corporais foram registradas no atendimento.',
      entityId: data.id,
      payload: { encounterId: input.encounterId ?? null },
    });

    return { data: { id: data.id }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to create measurement.') };
  }
}

export async function updateMeasurement(
  measurementId: string,
  input: MeasurementInput
): Promise<{ data: { id: string } | null; error: SafeServiceError | null }> {
  try {
    const { supabase, tenantId, userId, patientId } = await resolveTenantPatientContext(
      input.patientId
    );
    const { data, error } = await supabase
      .from('measurements')
      .update({
        measured_at: input.measuredAt,
        height_cm: input.heightCm,
        weight_kg: input.weightKg,
        bmi: input.bmi ?? calculateBmi(input.weightKg, input.heightCm),
        body_fat_pct: input.bodyFatPercent,
        waist_cm: input.waistCm,
        hip_cm: input.hipCm,
        notes: input.notes,
      })
      .eq('id', measurementId)
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .select('id')
      .single();

    if (error) throw error;

    await insertAuditLog({
      patientId,
      tenantId,
      userId,
      action: 'measurement_updated',
      entityType: 'measurement',
      entityId: data.id,
    });

    return { data: { id: data.id }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to update measurement.') };
  }
}

export async function deleteMeasurement(
  patientId: string,
  measurementId: string
): Promise<{ error: SafeServiceError | null }> {
  try {
    const { supabase, tenantId, userId } = await resolveTenantPatientContext(patientId);
    const { error } = await supabase
      .from('measurements')
      .delete()
      .eq('id', measurementId)
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId);

    if (error) throw error;

    await insertAuditLog({
      patientId,
      tenantId,
      userId,
      action: 'measurement_deleted',
      entityType: 'measurement',
      entityId: measurementId,
    });

    return { error: null };
  } catch (error) {
    return { error: safeError(error, 'Unable to delete measurement.') };
  }
}

export async function createBioimpedanceResult(
  input: BioimpedanceInput
): Promise<{ data: { id: string } | null; error: SafeServiceError | null }> {
  try {
    const { supabase, tenantId, userId, patientId } = await resolveTenantPatientContext(
      input.patientId
    );
    const { data, error } = await supabase
      .from('bioimpedance_results')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        encounter_id: input.encounterId ?? null,
        status: input.status ?? 'final',
        measured_at: input.measuredAt ?? new Date().toISOString(),
        result_payload: input.payload,
      })
      .select('id')
      .single();

    if (error) throw error;

    await insertAuditLog({
      patientId,
      tenantId,
      userId,
      action: 'bioimpedance_created',
      entityType: 'bioimpedance_result',
      entityId: data.id,
    });
    await insertClinicalTimelineEvent({
      patientId,
      tenantId,
      eventType: 'medida_registrada',
      title: 'Bioimpedancia registrada',
      description: 'Resultado de bioimpedancia registrado no atendimento.',
      entityId: data.id,
      payload: { encounterId: input.encounterId ?? null },
    });

    return { data: { id: data.id }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to create bioimpedance result.') };
  }
}

export async function createLabOrder(
  input: LabOrderInput
): Promise<{ data: { id: string } | null; error: SafeServiceError | null }> {
  try {
    const { supabase, tenantId, userId, patientId } = await resolveTenantPatientContext(
      input.patientId
    );
    const { data, error } = await supabase
      .from('lab_orders')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        encounter_id: input.encounterId ?? null,
        status: 'requested',
        ordered_by: userId,
        order_payload: {
          panel_name: input.panelName,
          tests: input.tests,
          urgency: input.urgency ?? 'routine',
          note: input.note ?? null,
        },
      })
      .select('id')
      .single();

    if (error) throw error;

    await insertAuditLog({
      patientId,
      tenantId,
      userId,
      action: 'lab_order_created',
      entityType: 'lab_order',
      entityId: data.id,
    });
    await insertClinicalTimelineEvent({
      patientId,
      tenantId,
      eventType: 'exame_solicitado',
      title: 'Exames solicitados',
      description: `Painel ${input.panelName} solicitado no atendimento.`,
      entityId: data.id,
      payload: { encounterId: input.encounterId ?? null, tests: input.tests },
    });

    return { data: { id: data.id }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to create lab order.') };
  }
}

export async function recordLabResult(
  input: LabResultInput
): Promise<{ data: { id: string } | null; error: SafeServiceError | null }> {
  try {
    const { supabase, tenantId, userId, patientId } = await resolveTenantPatientContext(
      input.patientId
    );
    const { data, error } = await supabase
      .from('lab_results')
      .insert({
        tenant_id: tenantId,
        patient_id: patientId,
        lab_order_id: input.labOrderId ?? null,
        status: 'received',
        result_at: input.resultAt ?? new Date().toISOString(),
        result_payload: {
          ...input.values,
          interpretation: input.interpretation ?? null,
        },
      })
      .select('id')
      .single();

    if (error) throw error;

    await insertAuditLog({
      patientId,
      tenantId,
      userId,
      action: 'lab_result_recorded',
      entityType: 'lab_result',
      entityId: data.id,
    });
    await insertClinicalTimelineEvent({
      patientId,
      tenantId,
      eventType: 'exame_resultado_recebido',
      title: 'Resultado de exame recebido',
      description: 'Resultado laboratorial registrado no prontuario.',
      entityId: data.id,
      payload: { labOrderId: input.labOrderId ?? null },
    });

    return { data: { id: data.id }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to record lab result.') };
  }
}
