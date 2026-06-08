import type { Patient360Summary } from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getPatient360Summary } from '@/services/patient360Api';

export interface SoapFields {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface EncounterSoapState extends SoapFields {
  encounterId: string | null;
  soapNoteId: string | null;
  status: 'draft' | 'final';
}

export interface EncounterContext {
  summary: Patient360Summary;
  soap: EncounterSoapState | null;
}

export interface PersistSoapInput extends SoapFields {
  patientId: string;
  encounterId?: string | null;
  appointmentId?: string | null;
  soapNoteId?: string | null;
}

export interface PersistSoapResult {
  encounterId: string;
  soapNoteId: string;
  status: 'draft' | 'final';
}

interface SafeServiceError {
  message: string;
  code?: string;
  details?: string;
}

type SoapRow = {
  id: string;
  encounter_id: string | null;
  status: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
};

function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function safeError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) return { message: error.message || fallback };
  return { message: fallback };
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

function toSoapState(soap: SoapRow | null): EncounterSoapState | null {
  if (!soap) return null;

  return {
    encounterId: soap.encounter_id,
    soapNoteId: soap.id,
    status: soap.status === 'final' ? 'final' : 'draft',
    subjective: soap.subjective ?? '',
    objective: soap.objective ?? '',
    assessment: soap.assessment ?? '',
    plan: soap.plan ?? '',
  };
}

function validateFinalSoap(input: PersistSoapInput) {
  const requiredFields: Array<[keyof SoapFields, string]> = [
    ['subjective', 'Subjetivo'],
    ['objective', 'Objetivo'],
    ['assessment', 'Avaliacao'],
    ['plan', 'Plano'],
  ];

  const missing = requiredFields.filter(([key]) => !input[key].trim()).map(([, label]) => label);

  if (missing.length > 0) {
    throw new Error(
      `Preencha os campos SOAP obrigatorios antes de finalizar: ${missing.join(', ')}.`
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function autosaveSoapDraft(input: PersistSoapInput): Promise<PersistSoapResult> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('autosave_encounter', {
    p_patient_id: input.patientId,
    p_encounter_id: input.encounterId ?? null,
    p_appointment_id: input.appointmentId ?? null,
    p_soap_note_id: input.soapNoteId ?? null,
    p_subjective: input.subjective,
    p_objective: input.objective,
    p_assessment: input.assessment,
    p_plan: input.plan,
  });

  if (error) throw error;

  const record = asRecord(data);
  const encounterId = asString(record.encounterId);
  const soapNoteId = asString(record.soapNoteId);

  if (!encounterId || !soapNoteId) {
    throw new Error('invalid_autosave_encounter_contract');
  }

  return {
    encounterId,
    soapNoteId,
    status: 'draft',
  };
}

export async function getEncounterContext(
  patientId: string
): Promise<{ data: EncounterContext | null; error: SafeServiceError | null }> {
  try {
    const summaryResult = await getPatient360Summary(patientId);
    if (summaryResult.error || !summaryResult.data) {
      return {
        data: null,
        error: summaryResult.error ?? { message: 'Unable to load patient context.' },
      };
    }

    if (isMockEnabled()) {
      return { data: { summary: summaryResult.data, soap: null }, error: null };
    }

    const { supabase, tenantId } = await resolveTenantPatientContext(patientId);
    const { data: latestEncounter, error: encounterError } = await supabase
      .from('encounters')
      .select('id,tenant_id,patient_id,appointment_id,status')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (encounterError) throw encounterError;

    const soapQuery = supabase
      .from('soap_notes')
      .select('id,encounter_id,status,subjective,objective,assessment,plan')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .order('updated_at', { ascending: false })
      .limit(1);

    const { data: latestSoap, error: soapError } = latestEncounter
      ? await soapQuery.eq('encounter_id', latestEncounter.id).maybeSingle()
      : await soapQuery.maybeSingle();

    if (soapError) throw soapError;

    const soap = toSoapState(latestSoap as SoapRow | null);
    if (soap && !soap.encounterId && latestEncounter?.id) {
      soap.encounterId = latestEncounter.id;
    }

    return { data: { summary: summaryResult.data, soap }, error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to load encounter context.') };
  }
}

async function persistSoap(
  input: PersistSoapInput,
  status: 'draft' | 'final'
): Promise<PersistSoapResult> {
  if (status === 'final') validateFinalSoap(input);

  if (isMockEnabled()) {
    return {
      encounterId: input.encounterId ?? 'mock-encounter',
      soapNoteId: input.soapNoteId ?? 'mock-soap',
      status,
    };
  }

  if (status === 'draft') {
    return autosaveSoapDraft(input);
  }

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc('finalize_encounter_soap', {
    p_payload: {
      patientId: input.patientId,
      encounterId: input.encounterId ?? null,
      appointmentId: input.appointmentId ?? null,
      soapNoteId: input.soapNoteId ?? null,
      subjective: input.subjective,
      objective: input.objective,
      assessment: input.assessment,
      plan: input.plan,
    },
  });

  if (error) throw error;

  const record = asRecord(data);
  const encounterId = asString(record.encounterId);
  const soapNoteId = asString(record.soapNoteId);

  if (!encounterId || !soapNoteId) {
    throw new Error('invalid_finalize_encounter_soap_contract');
  }

  return {
    encounterId,
    soapNoteId,
    status: 'final',
  };
}

export async function saveSoapDraft(
  input: PersistSoapInput
): Promise<{ data: PersistSoapResult | null; error: SafeServiceError | null }> {
  try {
    return { data: await persistSoap(input, 'draft'), error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to save SOAP draft.') };
  }
}

export async function finalizeEncounterSoap(
  input: PersistSoapInput
): Promise<{ data: PersistSoapResult | null; error: SafeServiceError | null }> {
  try {
    return { data: await persistSoap(input, 'final'), error: null };
  } catch (error) {
    return { data: null, error: safeError(error, 'Unable to finalize SOAP encounter.') };
  }
}
