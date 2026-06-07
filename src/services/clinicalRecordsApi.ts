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

export type ProgressPhotoAngle = 'front' | 'back' | 'left' | 'right' | 'other';

export interface ProgressPhotoSummary {
  id: string;
  patientId: string;
  angle: ProgressPhotoAngle;
  photoDate: string;
  capturedAt: string;
  weightAtPhoto?: number;
  visibilityToPatient: boolean;
  patientVisibleAt?: string | null;
  consentForComparison: boolean;
  status: 'pending_upload' | 'uploaded' | 'failed' | 'deleted' | string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  notes?: string | null;
  hasPhoto: boolean;
}

export interface ClinicalRecordsData {
  measurements: PatientMeasurementSummary[];
  latestMeasurement: PatientMeasurementSummary | null;
  bioimpedance: BioimpedanceSummary[];
  latestBioimpedance: BioimpedanceSummary | null;
  labOrders: LabOrderSummary[];
  labResults: LabResultSummary[];
  progressPhotos: ProgressPhotoSummary[];
  latestProgressPhoto: ProgressPhotoSummary | null;
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

export interface ProgressPhotoUploadInput {
  patientId: string;
  angle: ProgressPhotoAngle;
  photoDate?: string;
  weightAtPhoto?: number | null;
  consentForComparison?: boolean;
  visibilityToPatient?: boolean;
  notes?: string | null;
  encounterId?: string | null;
  measurementId?: string | null;
}

export interface PatientPortalEvolutionSummary {
  selectedPatientId: string;
  latestMeasurement: PatientMeasurementSummary | null;
  releasedPhotos: ProgressPhotoSummary[];
}

interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

const SAFE_AUDIT_METADATA_KEYS = new Set(['encounterId', 'labOrderId', 'source', 'status']);
const PROGRESS_PHOTO_BUCKET = 'progress-photos';
const PROGRESS_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PROGRESS_PHOTO_ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, string | number | boolean> {
  if (!metadata) return {};

  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_AUDIT_METADATA_KEYS.has(key)) continue;

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) sanitized[key] = normalized.slice(0, 120);
      continue;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = value;
      continue;
    }

    if (typeof value === 'boolean') sanitized[key] = value;
  }

  return sanitized;
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
  if (error instanceof Error)
    return { message: fallback, code: error.name, details: error.message };
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; name?: unknown; message?: unknown };
    return {
      message: fallback,
      code: asString(record.code) ?? asString(record.name),
      details: asString(record.message),
    };
  }
  return { message: fallback };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asString(value: unknown, fallback?: string): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asProgressPhotoAngle(value: unknown): ProgressPhotoAngle {
  const angle = asString(value);
  if (angle === 'back' || angle === 'left' || angle === 'right' || angle === 'other') {
    return angle;
  }
  return 'front';
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
    progressPhotos: [],
    latestProgressPhoto: null,
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

function toMeasurementFromRecord(record: Record<string, unknown>): PatientMeasurementSummary {
  const weightKg = asNumber(record.weightKg ?? record.weight_kg) ?? 0;
  const heightCm = asNumber(record.heightCm ?? record.height_cm) ?? 0;

  return {
    id: asString(record.id) ?? '',
    patientId: asString(record.patientId ?? record.patient_id) ?? '',
    measuredAt: asString(record.measuredAt ?? record.measured_at) ?? '',
    weightKg,
    heightCm,
    bmi: asNumber(record.bmi) ?? calculateBmi(weightKg || undefined, heightCm || undefined) ?? 0,
    bodyFatPercent: asNumber(record.bodyFatPercent ?? record.body_fat_pct),
    waistCm: asNumber(record.waistCm ?? record.waist_cm),
    hipCm: asNumber(record.hipCm ?? record.hip_cm),
    notes: asString(record.notes),
  };
}

function toBioimpedanceFromRecord(record: Record<string, unknown>): BioimpedanceSummary {
  const payload = asRecord(record.payload ?? record.result_payload);

  return {
    id: asString(record.id) ?? '',
    patientId: asString(record.patientId ?? record.patient_id) ?? '',
    measuredAt: asString(record.measuredAt ?? record.measured_at) ?? '',
    leanMassKg: asNumber(payload.lean_mass_kg),
    fatMassKg: asNumber(payload.fat_mass_kg),
    bodyWaterLiters: asNumber(payload.total_body_water_l),
    phaseAngleDeg: asNumber(payload.phase_angle_deg),
    source: asString(payload.source),
    payload,
  };
}

function toLabOrderFromRecord(record: Record<string, unknown>): LabOrderSummary {
  const payload = asRecord(record.payload ?? record.order_payload);

  return {
    id: asString(record.id) ?? '',
    patientId: asString(record.patientId ?? record.patient_id) ?? '',
    status: asString(record.status) ?? 'requested',
    orderedAt: asString(record.orderedAt ?? record.ordered_at) ?? '',
    panelName: asString(payload.panel_name) ?? 'Painel laboratorial',
    tests: asStringArray(payload.tests),
    urgency: asString(payload.urgency),
    note: asString(payload.note),
  };
}

function toLabResultFromRecord(record: Record<string, unknown>): LabResultSummary {
  const payload = asRecord(record.payload ?? record.result_payload);
  const { interpretation, ...values } = payload;

  return {
    id: asString(record.id) ?? '',
    patientId: asString(record.patientId ?? record.patient_id) ?? '',
    labOrderId: asString(record.labOrderId ?? record.lab_order_id) ?? null,
    status: asString(record.status) ?? 'received',
    resultAt: asString(record.resultAt ?? record.result_at) ?? null,
    interpretation: asString(interpretation),
    values: values as Record<string, string | number | boolean>,
  };
}

function toProgressPhotoFromRecord(record: Record<string, unknown>): ProgressPhotoSummary {
  return {
    id: asString(record.id) ?? '',
    patientId: asString(record.patientId ?? record.patient_id) ?? '',
    angle: asProgressPhotoAngle(record.angle),
    photoDate: asString(record.photoDate ?? record.photo_date) ?? '',
    capturedAt: asString(record.capturedAt ?? record.captured_at) ?? '',
    weightAtPhoto: asNumber(record.weightAtPhoto ?? record.weight_at_photo),
    visibilityToPatient: asBoolean(record.visibilityToPatient ?? record.visibility_to_patient),
    patientVisibleAt: asString(record.patientVisibleAt ?? record.patient_visible_at) ?? null,
    consentForComparison: asBoolean(record.consentForComparison ?? record.consent_for_comparison),
    status: asString(record.status) ?? 'pending_upload',
    fileName: asString(record.fileName ?? record.file_name) ?? null,
    mimeType: asString(record.mimeType ?? record.mime_type) ?? null,
    sizeBytes: asNumber(record.sizeBytes ?? record.size_bytes) ?? null,
    notes: asString(record.notes) ?? null,
    hasPhoto: asBoolean(record.hasPhoto, asString(record.status) === 'uploaded'),
  };
}

function normalizeClinicalRecordsPayload(payload: unknown): ClinicalRecordsData {
  const record = asRecord(payload);
  const measurements = asArray(record.measurements)
    .map((item) => toMeasurementFromRecord(asRecord(item)))
    .filter((item) => item.id);
  const bioimpedance = asArray(record.bioimpedance)
    .map((item) => toBioimpedanceFromRecord(asRecord(item)))
    .filter((item) => item.id);
  const progressPhotos = asArray(record.progressPhotos)
    .map((item) => toProgressPhotoFromRecord(asRecord(item)))
    .filter((item) => item.id);

  return {
    measurements,
    latestMeasurement: measurements[0] ?? null,
    bioimpedance,
    latestBioimpedance: bioimpedance[0] ?? null,
    labOrders: asArray(record.labOrders)
      .map((item) => toLabOrderFromRecord(asRecord(item)))
      .filter((item) => item.id),
    labResults: asArray(record.labResults)
      .map((item) => toLabResultFromRecord(asRecord(item)))
      .filter((item) => item.id),
    progressPhotos,
    latestProgressPhoto: progressPhotos[0] ?? null,
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
      ...sanitizeAuditMetadata(input.metadata),
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
        progressPhotos: [],
        latestProgressPhoto: null,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to load clinical records.') };
  }
}

export async function getPatientEvolutionSnapshot(
  patientId: string
): Promise<{ data: ClinicalRecordsData | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) return { data: emptyRecords(), error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_evolution_snapshot', {
      p_patient_id: patientId,
    });

    if (error) throw error;

    return { data: normalizeClinicalRecordsPayload(data), error: null };
  } catch (error) {
    return {
      data: null,
      error: safeError(error, 'Nao foi possivel carregar a evolucao corporal.'),
    };
  }
}

export async function getPatientPortalEvolutionSummary(
  patientId?: string
): Promise<{ data: PatientPortalEvolutionSummary | null; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) {
      return {
        data: {
          selectedPatientId: patientId ?? '',
          latestMeasurement: null,
          releasedPhotos: [],
        },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_patient_portal_evolution_summary', {
      p_patient_id: patientId ?? null,
    });
    if (error) throw error;

    const record = asRecord(data);
    const selectedPatientId = asString(record.selectedPatientId) ?? patientId ?? '';
    const latestMeasurementRecord = asRecord(record.latestMeasurement);
    const latestMeasurement = latestMeasurementRecord.id
      ? toMeasurementFromRecord(latestMeasurementRecord)
      : null;

    return {
      data: {
        selectedPatientId,
        latestMeasurement,
        releasedPhotos: asArray(record.releasedPhotos)
          .map((item) => toProgressPhotoFromRecord(asRecord(item)))
          .filter((item) => item.id),
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: safeError(error, 'Nao foi possivel carregar a evolucao corporal.'),
    };
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

function inferProgressPhotoMimeType(file: File): string {
  if (PROGRESS_PHOTO_ACCEPTED_MIME_TYPES.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  return file.type || 'application/octet-stream';
}

export function validateProgressPhotoFile(file: File | null | undefined): SafeServiceError | null {
  if (!file) return { message: 'Selecione uma foto para enviar.', code: 'missing_file' };
  if (file.size <= 0 || file.size > PROGRESS_PHOTO_MAX_BYTES) {
    return {
      message: 'A foto precisa ter ate 8 MB.',
      code: 'invalid_progress_photo_size',
    };
  }

  const mimeType = inferProgressPhotoMimeType(file);
  if (!PROGRESS_PHOTO_ACCEPTED_MIME_TYPES.has(mimeType)) {
    return {
      message: 'Use uma imagem JPG, PNG, WebP, HEIC ou HEIF.',
      code: 'invalid_progress_photo_type',
    };
  }

  return null;
}

function normalizePreparedPhotoUpload(value: unknown): {
  id: string;
  bucket: string;
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
} | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const path = asString(record.path);
  if (!id || !path) return null;

  return {
    id,
    bucket: asString(record.bucket, PROGRESS_PHOTO_BUCKET) ?? PROGRESS_PHOTO_BUCKET,
    path,
    fileName: asString(record.fileName, 'progress-photo.jpg') ?? 'progress-photo.jpg',
    mimeType: asString(record.mimeType, 'image/jpeg') ?? 'image/jpeg',
    sizeBytes: asNumber(record.sizeBytes) ?? 0,
  };
}

async function completeProgressPhotoUpload(
  photoId: string,
  status: 'uploaded' | 'failed'
): Promise<{ data: { id: string; status: string } | null; error: SafeServiceError | null }> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('complete_progress_photo_upload', {
    p_photo_id: photoId,
    p_status: status,
  });

  if (error) {
    return {
      data: null,
      error: safeError(error, 'Nao foi possivel atualizar o status da foto.'),
    };
  }

  const record = asRecord(data);
  return {
    data: {
      id: asString(record.id, photoId) ?? photoId,
      status: asString(record.status, status) ?? status,
    },
    error: null,
  };
}

export async function uploadProgressPhoto(
  input: ProgressPhotoUploadInput,
  file: File
): Promise<{ data: ProgressPhotoSummary | null; error: SafeServiceError | null }> {
  const validationError = validateProgressPhotoFile(file);
  if (validationError) return { data: null, error: validationError };

  try {
    if (isMockEnabled()) {
      return {
        data: {
          id: `mock-progress-photo-${Date.now()}`,
          patientId: input.patientId,
          angle: input.angle,
          photoDate: input.photoDate ?? new Date().toISOString().slice(0, 10),
          capturedAt: new Date().toISOString(),
          weightAtPhoto: input.weightAtPhoto ?? undefined,
          visibilityToPatient: input.visibilityToPatient === true,
          patientVisibleAt: input.visibilityToPatient ? new Date().toISOString() : null,
          consentForComparison: input.consentForComparison === true,
          status: 'uploaded',
          fileName: file.name,
          mimeType: inferProgressPhotoMimeType(file),
          sizeBytes: file.size,
          notes: input.notes ?? null,
          hasPhoto: true,
        },
        error: null,
      };
    }

    const supabase = createBrowserSupabaseClient();
    const mimeType = inferProgressPhotoMimeType(file);
    const { data: preparedPayload, error: prepareError } = await supabase.rpc(
      'prepare_progress_photo_upload',
      {
        p_patient_id: input.patientId,
        p_angle: input.angle,
        p_photo_date: input.photoDate ?? new Date().toISOString().slice(0, 10),
        p_weight_at_photo: input.weightAtPhoto ?? null,
        p_consent_for_comparison: input.consentForComparison === true,
        p_visibility_to_patient: input.visibilityToPatient === true,
        p_file_name: file.name,
        p_mime_type: mimeType,
        p_size_bytes: file.size,
        p_notes: input.notes ?? null,
        p_encounter_id: input.encounterId ?? null,
        p_measurement_id: input.measurementId ?? null,
      }
    );

    if (prepareError) {
      return {
        data: null,
        error: safeError(prepareError, 'Nao foi possivel preparar o upload da foto.'),
      };
    }

    const prepared = normalizePreparedPhotoUpload(preparedPayload);
    if (!prepared) {
      return {
        data: null,
        error: {
          message: 'Contrato invalido ao preparar upload da foto.',
          code: 'invalid_progress_photo_upload_contract',
        },
      };
    }

    const { error: uploadError } = await supabase.storage
      .from(prepared.bucket)
      .upload(prepared.path, file, {
        contentType: prepared.mimeType,
        upsert: false,
      });

    if (uploadError) {
      await completeProgressPhotoUpload(prepared.id, 'failed');
      return {
        data: null,
        error: safeError(uploadError, 'Registro criado, mas o upload da foto falhou.'),
      };
    }

    const completeResult = await completeProgressPhotoUpload(prepared.id, 'uploaded');
    if (completeResult.error) return { data: null, error: completeResult.error };

    return {
      data: {
        id: prepared.id,
        patientId: input.patientId,
        angle: input.angle,
        photoDate: input.photoDate ?? new Date().toISOString().slice(0, 10),
        capturedAt: new Date().toISOString(),
        weightAtPhoto: input.weightAtPhoto ?? undefined,
        visibilityToPatient: input.visibilityToPatient === true,
        patientVisibleAt: input.visibilityToPatient ? new Date().toISOString() : null,
        consentForComparison: input.consentForComparison === true,
        status: 'uploaded',
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        sizeBytes: prepared.sizeBytes,
        notes: input.notes ?? null,
        hasPhoto: true,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel enviar a foto.') };
  }
}

export async function setProgressPhotoPatientVisibility(
  patientId: string,
  photoId: string,
  visible: boolean
): Promise<{
  data: { id: string; visibilityToPatient: boolean } | null;
  error: SafeServiceError | null;
}> {
  try {
    if (isMockEnabled())
      return { data: { id: photoId, visibilityToPatient: visible }, error: null };

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('set_progress_photo_patient_visibility', {
      p_photo_id: photoId,
      p_patient_id: patientId,
      p_visible: visible,
    });

    if (error) {
      return {
        data: null,
        error: safeError(error, 'Nao foi possivel alterar a liberacao da foto.'),
      };
    }

    const record = asRecord(data);
    return {
      data: {
        id: asString(record.id, photoId) ?? photoId,
        visibilityToPatient: asBoolean(record.visibilityToPatient, visible),
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: safeError(error, 'Nao foi possivel alterar a liberacao da foto.'),
    };
  }
}

export async function getProgressPhotoSignedUrl(
  patientId: string,
  photoId: string,
  expiresInSeconds = 300
): Promise<{
  data: { url: string; expiresInSeconds: number } | null;
  error: SafeServiceError | null;
}> {
  if (!patientId.trim() || !photoId.trim()) {
    return { data: null, error: { message: 'Foto invalida para visualizacao.' } };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('get_progress_photo_download', {
      p_photo_id: photoId,
      p_patient_id: patientId,
      p_expires_in: expiresInSeconds,
    });

    if (error) {
      return {
        data: null,
        error: safeError(error, 'Nao foi possivel preparar o link temporario da foto.'),
      };
    }

    const record = asRecord(data);
    const bucket = asString(record.bucket, PROGRESS_PHOTO_BUCKET) ?? PROGRESS_PHOTO_BUCKET;
    const path = asString(record.path);
    const expiresIn = Math.max(60, Math.min(600, asNumber(record.expiresInSeconds) ?? 300));

    if (!path || bucket !== PROGRESS_PHOTO_BUCKET) {
      return {
        data: null,
        error: {
          message: 'Contrato invalido da foto privada.',
          code: 'invalid_progress_photo_download_contract',
        },
      };
    }

    const signed = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (signed.error || !signed.data?.signedUrl) {
      return {
        data: null,
        error: safeError(signed.error, 'Nao foi possivel gerar o link temporario da foto.'),
      };
    }

    return { data: { url: signed.data.signedUrl, expiresInSeconds: expiresIn }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Nao foi possivel abrir a foto.') };
  }
}
