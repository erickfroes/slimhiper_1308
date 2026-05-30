import type {
  AdherenceLevel,
  FinancialStatus,
  PatientListRow,
  PatientStatus,
  ProgramType,
} from '@/domain/types';
import { createRequiredClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getPatientList as getMockPatientList } from '@/services/mockApi';

type SafeServiceError = {
  message: string;
  code?: string;
};

type PatientRow = {
  id: string;
  tenant_id: string;
  status: string | null;
  preferred_name: string | null;
};

type PatientPiiRow = {
  patient_id: string;
  full_name: string | null;
  phone: string | null;
  birth_date: string | null;
};

type PatientAlertRow = {
  patient_id: string;
};

type AppointmentRow = {
  patient_id: string;
  scheduled_at: string;
  status: string | null;
};

const DEFAULT_PROGRAM_TYPE: ProgramType = 'emagrecimento';
const DEFAULT_FINANCIAL_STATUS: FinancialStatus = 'em_dia';
const DEFAULT_ADHERENCE_LEVEL: AdherenceLevel = 'critico';

function isMockExplicitlyEnabled() {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
}

function canUseDevelopmentMockFallback() {
  return process.env.NODE_ENV === 'development';
}

function asServiceError(error: unknown, fallback: string): SafeServiceError {
  if (error instanceof Error) return { message: error.message || fallback };
  if (error && typeof error === 'object' && 'message' in error) {
    return { message: String((error as { message?: unknown }).message ?? fallback) };
  }
  return { message: fallback };
}

function maskPhone(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 4) return 'Nao informado';
  const suffix = digits.slice(-4);
  return `(**) *****-${suffix}`;
}

function calculateAge(birthDate: string | null | undefined) {
  if (!birthDate) return 0;
  const date = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDelta = today.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) age -= 1;
  return Math.max(0, age);
}

function mapPatientStatus(status: string | null | undefined): PatientStatus {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'inactive' || normalized === 'inativo') return 'inativo';
  if (normalized === 'paused' || normalized === 'pausado') return 'pausado';
  if (normalized === 'completed' || normalized === 'concluido') return 'concluido';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'cancelado') {
    return 'cancelado';
  }
  return 'ativo';
}

async function resolveActiveTenantId() {
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
  return tenantId;
}

async function getPatientListFromSupabase(): Promise<PatientListRow[]> {
  const supabase = createBrowserSupabaseClient();
  const tenantId = await resolveActiveTenantId();

  const { data: patientRows, error: patientError } = await supabase
    .from('patients')
    .select('id,tenant_id,status,preferred_name')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (patientError) throw patientError;

  const patients = (patientRows ?? []) as PatientRow[];
  const patientIds = patients.map((patient) => patient.id);
  if (patientIds.length === 0) return [];

  const [piiResult, alertsResult, appointmentsResult] = await Promise.all([
    supabase
      .from('patient_pii')
      .select('patient_id,full_name,phone,birth_date')
      .eq('tenant_id', tenantId)
      .in('patient_id', patientIds),
    supabase
      .from('patient_alerts')
      .select('patient_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .in('patient_id', patientIds),
    supabase
      .from('appointments')
      .select('patient_id,scheduled_at,status')
      .eq('tenant_id', tenantId)
      .gte('scheduled_at', new Date().toISOString())
      .in('patient_id', patientIds)
      .order('scheduled_at', { ascending: true }),
  ]);

  if (piiResult.error) throw piiResult.error;
  if (alertsResult.error) throw alertsResult.error;
  if (appointmentsResult.error) throw appointmentsResult.error;

  const piiByPatientId = new Map(
    ((piiResult.data ?? []) as PatientPiiRow[]).map((row) => [row.patient_id, row])
  );
  const alertCountByPatientId = ((alertsResult.data ?? []) as PatientAlertRow[]).reduce(
    (acc, row) => acc.set(row.patient_id, (acc.get(row.patient_id) ?? 0) + 1),
    new Map<string, number>()
  );
  const nextAppointmentByPatientId = new Map<string, string>();
  for (const appointment of (appointmentsResult.data ?? []) as AppointmentRow[]) {
    if (appointment.status === 'cancelled' || appointment.status === 'canceled') continue;
    if (!nextAppointmentByPatientId.has(appointment.patient_id)) {
      nextAppointmentByPatientId.set(
        appointment.patient_id,
        new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(appointment.scheduled_at))
      );
    }
  }

  return patients.map((patient) => {
    const pii = piiByPatientId.get(patient.id);
    return {
      id: patient.id,
      name: pii?.full_name ?? patient.preferred_name ?? 'Paciente sem nome',
      age: calculateAge(pii?.birth_date),
      phone: maskPhone(pii?.phone),
      activePackage: 'Sem programa',
      programType: DEFAULT_PROGRAM_TYPE,
      currentWeek: 0,
      totalWeeks: 0,
      weeklyAdherence: 0,
      adherenceLevel: DEFAULT_ADHERENCE_LEVEL,
      nextAppointment: nextAppointmentByPatientId.get(patient.id),
      careTeam: [],
      alertCount: alertCountByPatientId.get(patient.id) ?? 0,
      financialStatus: DEFAULT_FINANCIAL_STATUS,
      status: mapPatientStatus(patient.status),
    };
  });
}

export async function getPatientList(): Promise<PatientListRow[]> {
  if (isMockExplicitlyEnabled()) return getMockPatientList();

  try {
    return await getPatientListFromSupabase();
  } catch (error) {
    if (canUseDevelopmentMockFallback()) return getMockPatientList();
    throw asServiceError(error, 'Falha ao carregar lista de pacientes.');
  }
}
