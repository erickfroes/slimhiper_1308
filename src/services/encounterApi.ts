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

type EncounterRow = {
  id: string;
  tenant_id: string;
  patient_id: string;
  status: string | null;
};

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
      .select('id,tenant_id,patient_id,status')
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

async function ensureEncounter(input: {
  patientId: string;
  encounterId?: string | null;
  status: 'open' | 'closed';
}) {
  const { supabase, tenantId, userId, patientId } = await resolveTenantPatientContext(
    input.patientId
  );
  const now = new Date().toISOString();

  if (input.encounterId) {
    const { data: encounter, error } = await supabase
      .from('encounters')
      .select('id,tenant_id,patient_id,status')
      .eq('id', input.encounterId)
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .single();

    if (error) throw error;

    const existingEncounter = encounter as EncounterRow;
    if (input.status === 'open' && existingEncounter.status === 'closed') {
      throw new Error('encounter_already_finalized');
    }

    return { supabase, tenantId, userId, patientId, encounter: existingEncounter };
  }

  const { data: encounter, error } = await supabase
    .from('encounters')
    .insert({
      tenant_id: tenantId,
      patient_id: patientId,
      status: input.status,
      encounter_type: 'clinic_visit',
      started_at: now,
      created_by: userId,
    })
    .select('id,tenant_id,patient_id,status')
    .single();

  if (error) throw error;
  return { supabase, tenantId, userId, patientId, encounter: encounter as EncounterRow };
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

  const { supabase, tenantId, userId, patientId, encounter } = await ensureEncounter({
    patientId: input.patientId,
    encounterId: input.encounterId,
    status: status === 'final' ? 'closed' : 'open',
  });
  if (input.soapNoteId) {
    const { data: existingSoap, error: existingSoapError } = await supabase
      .from('soap_notes')
      .select('id,encounter_id,status')
      .eq('id', input.soapNoteId)
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .single();

    if (existingSoapError) throw existingSoapError;

    const currentSoap = existingSoap as Pick<SoapRow, 'id' | 'encounter_id' | 'status'>;
    if (currentSoap.status === 'final') {
      throw new Error('soap_note_already_finalized');
    }

    if (currentSoap.encounter_id && currentSoap.encounter_id !== encounter.id) {
      throw new Error('soap_note_encounter_mismatch');
    }
  }

  const now = new Date().toISOString();
  const soapPayload = {
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: encounter.id,
    status,
    subjective: input.subjective,
    objective: input.objective,
    assessment: input.assessment,
    plan: input.plan,
    authored_by: userId,
    updated_at: now,
  };

  const soapResult = input.soapNoteId
    ? await supabase
        .from('soap_notes')
        .update(soapPayload)
        .eq('id', input.soapNoteId)
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .select('id')
        .single()
    : await supabase
        .from('soap_notes')
        .insert({ ...soapPayload, created_at: now })
        .select('id')
        .single();

  if (soapResult.error) throw soapResult.error;

  if (status === 'final') {
    const { error: encounterError } = await supabase
      .from('encounters')
      .update({
        status: 'closed',
        ended_at: now,
        finalized_by: userId,
        updated_at: now,
      })
      .eq('id', encounter.id)
      .eq('tenant_id', tenantId);

    if (encounterError) throw encounterError;

    const { error: timelineError } = await supabase.from('patient_timeline_events').insert({
      tenant_id: tenantId,
      patient_id: patientId,
      event_type: 'soap_atualizado',
      category: 'clinical',
      status: 'recorded',
      title: 'SOAP finalizado',
      description: 'Atendimento SOAP finalizado e registrado no prontuario.',
      actor_name: 'Equipe clinica',
      status_label: 'Finalizado',
      action_label: 'Abrir SOAP',
      details_href: `/clinic/patients/${patientId}/encounter`,
      event_at: now,
      payload: {
        encounterId: encounter.id,
        soapNoteId: soapResult.data.id,
      },
    });

    if (timelineError) throw timelineError;
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    action: status === 'final' ? 'soap_finalized' : 'soap_draft_saved',
    entity_type: 'soap_note',
    entity_id: soapResult.data.id,
    metadata: {
      patientId,
      encounterId: encounter.id,
      status,
    },
  });

  if (auditError) throw auditError;

  return {
    encounterId: encounter.id,
    soapNoteId: soapResult.data.id,
    status,
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
