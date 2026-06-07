'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import { finalizeEncounterSoap, getEncounterContext, saveSoapDraft } from '@/services/encounterApi';
import {
  createBioimpedanceResult,
  createLabOrder,
  createMeasurement,
  getPatientClinicalRecords,
  type ClinicalRecordsData,
} from '@/services/clinicalRecordsApi';
import type { Patient360Summary } from '@/domain/types';
import {
  ArrowLeft,
  Save,
  CheckCircle,
  FlaskConical,
  Pill,
  ClipboardList,
  UserPlus,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  Stethoscope,
  FileText,
  Zap,
} from 'lucide-react';

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
          {title}
        </span>
        {open ? (
          <ChevronUp size={14} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    baixo: { label: 'Risco Baixo', cls: 'bg-green-100 text-green-700' },
    moderado: { label: 'Risco Moderado', cls: 'bg-amber-100 text-amber-700' },
    alto: { label: 'Risco Alto', cls: 'bg-orange-100 text-orange-700' },
    critico: { label: 'Risco Crítico', cls: 'bg-red-100 text-red-700' },
  };
  const r = map[risk] ?? { label: risk, cls: 'bg-muted text-muted-foreground' };
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${r.cls}`}
    >
      <AlertTriangle size={10} />
      {r.label}
    </span>
  );
}

function MetricPill({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground">
        {value}
        {unit ? <span className="font-normal text-muted-foreground ml-0.5">{unit}</span> : null}
      </span>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
}

function formatClinicalValue(value?: string | number | boolean | null, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function SOAPField({
  label,
  value,
  onChange,
  placeholder,
  rows = 5,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
      />
    </div>
  );
}

type MeasurementFormState = {
  weightKg: string;
  heightCm: string;
  bodyFatPercent: string;
  waistCm: string;
  hipCm: string;
  notes: string;
};

type BioimpedanceFormState = {
  leanMassKg: string;
  fatMassKg: string;
  bodyWaterLiters: string;
  phaseAngleDeg: string;
};

type LabOrderFormState = {
  panelName: string;
  tests: string;
  urgency: string;
  note: string;
};

function emptyMeasurementForm(): MeasurementFormState {
  return {
    weightKg: '',
    heightCm: '',
    bodyFatPercent: '',
    waistCm: '',
    hipCm: '',
    notes: '',
  };
}

function emptyBioimpedanceForm(): BioimpedanceFormState {
  return {
    leanMassKg: '',
    fatMassKg: '',
    bodyWaterLiters: '',
    phaseAngleDeg: '',
  };
}

function emptyLabOrderForm(): LabOrderFormState {
  return {
    panelName: '',
    tests: '',
    urgency: 'routine',
    note: '',
  };
}

function parseNumericInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EncounterPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = params?.patientId as string;
  const appointmentId = searchParams.get('appointmentId');

  const [data, setData] = useState<Patient360Summary | null>(null);
  const [clinicalRecords, setClinicalRecords] = useState<ClinicalRecordsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clinicalRecordsError, setClinicalRecordsError] = useState<string | null>(null);

  const [soap, setSoap] = useState({ S: '', O: '', A: '', P: '' });
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [soapNoteId, setSoapNoteId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [clinicalActionError, setClinicalActionError] = useState<string | null>(null);
  const [clinicalActionSuccess, setClinicalActionSuccess] = useState<string | null>(null);
  const [clinicalActionSaving, setClinicalActionSaving] = useState(false);
  const [measurementForm, setMeasurementForm] = useState<MeasurementFormState>(() =>
    emptyMeasurementForm()
  );
  const [bioimpedanceForm, setBioimpedanceForm] = useState<BioimpedanceFormState>(() =>
    emptyBioimpedanceForm()
  );
  const [labOrderForm, setLabOrderForm] = useState<LabOrderFormState>(() => emptyLabOrderForm());

  useEffect(() => {
    let isMounted = true;

    async function loadEncounter() {
      setLoading(true);
      setLoadError(null);

      const result = await getEncounterContext(patientId);
      if (!isMounted) return;

      if (result.error || !result.data) {
        setData(null);
        setLoadError(result.error?.message ?? 'Nao foi possivel carregar o atendimento.');
        setLoading(false);
        return;
      }

      setData(result.data.summary);
      const recordsResult = await getPatientClinicalRecords(patientId);
      if (!isMounted) return;

      setClinicalRecords(recordsResult.data);
      setClinicalRecordsError(recordsResult.error?.message ?? null);
      setEncounterId(result.data.soap?.encounterId ?? null);
      setSoapNoteId(result.data.soap?.soapNoteId ?? null);
      setFinalized(result.data.soap?.status === 'final');

      if (result.data.soap) {
        setSoap({
          S: result.data.soap.subjective,
          O: result.data.soap.objective,
          A: result.data.soap.assessment,
          P: result.data.soap.plan,
        });
      }

      setLoading(false);
    }

    void loadEncounter();

    return () => {
      isMounted = false;
    };
  }, [patientId]);

  const handleSaveDraft = async () => {
    if (finalized) {
      setActionError('Atendimento finalizado nao pode ser editado.');
      return;
    }

    setSaving(true);
    setActionError(null);

    const result = await saveSoapDraft({
      patientId,
      encounterId,
      appointmentId,
      soapNoteId,
      subjective: soap.S,
      objective: soap.O,
      assessment: soap.A,
      plan: soap.P,
    });

    setSaving(false);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel salvar o rascunho.');
      return;
    }

    setEncounterId(result.data.encounterId);
    setSoapNoteId(result.data.soapNoteId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleFinalize = async () => {
    setSaving(true);
    setActionError(null);

    const result = await finalizeEncounterSoap({
      patientId,
      encounterId,
      appointmentId,
      soapNoteId,
      subjective: soap.S,
      objective: soap.O,
      assessment: soap.A,
      plan: soap.P,
    });

    setSaving(false);

    if (result.error || !result.data) {
      setActionError(result.error?.message ?? 'Nao foi possivel finalizar o atendimento.');
      return;
    }

    setEncounterId(result.data.encounterId);
    setSoapNoteId(result.data.soapNoteId);
    setFinalized(true);
  };

  const reloadClinicalRecords = async () => {
    const recordsResult = await getPatientClinicalRecords(patientId);
    setClinicalRecords(recordsResult.data);
    setClinicalRecordsError(recordsResult.error?.message ?? null);
  };

  const ensureDraftEncounter = async () => {
    if (finalized) {
      throw new Error('Atendimento finalizado nao pode receber novos registros.');
    }

    if (encounterId) return encounterId;

    const result = await saveSoapDraft({
      patientId,
      encounterId,
      appointmentId,
      soapNoteId,
      subjective: soap.S,
      objective: soap.O,
      assessment: soap.A,
      plan: soap.P,
    });

    if (result.error || !result.data) {
      throw new Error(result.error?.message ?? 'Nao foi possivel abrir atendimento.');
    }

    setEncounterId(result.data.encounterId);
    setSoapNoteId(result.data.soapNoteId);
    return result.data.encounterId;
  };

  const handleCreateMeasurement = async () => {
    setClinicalActionSaving(true);
    setClinicalActionError(null);
    setClinicalActionSuccess(null);

    try {
      const activeEncounterId = await ensureDraftEncounter();
      const result = await createMeasurement({
        patientId,
        encounterId: activeEncounterId,
        weightKg: parseNumericInput(measurementForm.weightKg),
        heightCm: parseNumericInput(measurementForm.heightCm),
        bodyFatPercent: parseNumericInput(measurementForm.bodyFatPercent),
        waistCm: parseNumericInput(measurementForm.waistCm),
        hipCm: parseNumericInput(measurementForm.hipCm),
        notes: measurementForm.notes,
      });

      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? 'Nao foi possivel registrar medidas.');
      }

      setMeasurementForm(emptyMeasurementForm());
      setClinicalActionSuccess('Medidas registradas.');
      await reloadClinicalRecords();
    } catch (error) {
      setClinicalActionError(
        error instanceof Error ? error.message : 'Nao foi possivel registrar medidas.'
      );
    } finally {
      setClinicalActionSaving(false);
    }
  };

  const handleCreateBioimpedance = async () => {
    setClinicalActionSaving(true);
    setClinicalActionError(null);
    setClinicalActionSuccess(null);

    try {
      const activeEncounterId = await ensureDraftEncounter();
      const result = await createBioimpedanceResult({
        patientId,
        encounterId: activeEncounterId,
        payload: {
          lean_mass_kg: parseNumericInput(bioimpedanceForm.leanMassKg),
          fat_mass_kg: parseNumericInput(bioimpedanceForm.fatMassKg),
          total_body_water_l: parseNumericInput(bioimpedanceForm.bodyWaterLiters),
          phase_angle_deg: parseNumericInput(bioimpedanceForm.phaseAngleDeg),
          source: 'clinic_encounter',
        },
      });

      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? 'Nao foi possivel registrar bioimpedancia.');
      }

      setBioimpedanceForm(emptyBioimpedanceForm());
      setClinicalActionSuccess('Bioimpedancia registrada.');
      await reloadClinicalRecords();
    } catch (error) {
      setClinicalActionError(
        error instanceof Error ? error.message : 'Nao foi possivel registrar bioimpedancia.'
      );
    } finally {
      setClinicalActionSaving(false);
    }
  };

  const handleCreateLabOrder = async () => {
    setClinicalActionSaving(true);
    setClinicalActionError(null);
    setClinicalActionSuccess(null);

    try {
      const activeEncounterId = await ensureDraftEncounter();
      const tests = labOrderForm.tests
        .split(',')
        .map((test) => test.trim())
        .filter(Boolean);

      if (!labOrderForm.panelName.trim() || tests.length === 0) {
        throw new Error('Informe o painel e ao menos um exame.');
      }

      const result = await createLabOrder({
        patientId,
        encounterId: activeEncounterId,
        panelName: labOrderForm.panelName,
        tests,
        urgency: labOrderForm.urgency,
        note: labOrderForm.note,
      });

      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? 'Nao foi possivel solicitar exames.');
      }

      setLabOrderForm(emptyLabOrderForm());
      setClinicalActionSuccess('Exames solicitados.');
      await reloadClinicalRecords();
    } catch (error) {
      setClinicalActionError(
        error instanceof Error ? error.message : 'Nao foi possivel solicitar exames.'
      );
    } finally {
      setClinicalActionSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardShell>
    );
  }

  if (!data) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
          <AlertTriangle size={22} className="text-red-600" />
          <div>
            <p className="text-sm font-semibold text-foreground">Atendimento indisponivel</p>
            <p className="text-sm text-muted-foreground mt-1">
              {loadError ?? 'Nao foi possivel carregar os dados deste paciente.'}
            </p>
          </div>
          <button
            onClick={() => router.push(`/clinic/patients/${patientId}`)}
            className="btn-secondary text-sm px-3 py-1.5"
          >
            Voltar ao Paciente 360
          </button>
        </div>
      </DashboardShell>
    );
  }

  const { profile, activePackage, clinicalStatus, prescriptions, alerts, tasks } = data;

  const activePrescriptions = prescriptions?.filter((p) => p.isActive) ?? [];
  const openTasks = tasks?.filter((t) => !t.isCompleted) ?? [];
  const latestMeasurement = clinicalRecords?.latestMeasurement;
  const latestBioimpedance = clinicalRecords?.latestBioimpedance;
  const labOrders = clinicalRecords?.labOrders ?? [];
  const labResults = clinicalRecords?.labResults ?? [];
  const currentWeightKg = latestMeasurement?.weightKg ?? clinicalStatus.currentWeightKg;
  const currentBmi = latestMeasurement?.bmi ?? clinicalStatus.currentBmi;
  const lastMeasuredAt = latestMeasurement?.measuredAt ?? clinicalStatus.lastMeasuredAt;
  const activePackageProgress = Math.min(
    100,
    Math.max(
      0,
      Math.round((activePackage.currentWeek / Math.max(activePackage.totalWeeks, 1)) * 100)
    )
  );
  const recentClinicalEvents = (data.recentTimeline ?? [])
    .filter(
      (event) =>
        event.category === 'clinical' ||
        [
          'consulta',
          'nutricao',
          'atendimento_iniciado',
          'atendimento_concluido',
          'soap_atualizado',
          'medida_registrada',
          'exame_solicitado',
          'exame_resultado_recebido',
          'prescricao_emitida',
        ].includes(event.type)
    )
    .slice(0, 3);

  return (
    <DashboardShell>
      <div className="flex flex-col h-full">
        {/* ── Top bar ── */}
        <div className="flex flex-col gap-3 px-4 py-4 border-b border-border bg-card flex-shrink-0 xl:flex-row xl:items-center xl:justify-between xl:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push(`/clinic/patients/${patientId}`)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={15} />
              Voltar ao Paciente 360
            </button>
            <span className="text-muted-foreground/40">|</span>
            <div className="flex items-center gap-2">
              <Stethoscope size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">Atendimento SOAP</span>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {profile.name}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() =>
                document.getElementById('encounter-clinical-records')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              <FlaskConical size={13} />
              Solicitar Exames
            </button>
            <button
              disabled
              title="Prescricoes serao habilitadas apos contrato backend."
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground opacity-60 cursor-not-allowed"
            >
              <Pill size={13} />
              Criar Prescrição
            </button>
            <button
              disabled
              title="Atualizacao de plano sera habilitada apos contrato backend."
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground opacity-60 cursor-not-allowed"
            >
              <RefreshCw size={13} />
              Atualizar Plano
            </button>
            <button
              disabled
              title="Atribuicao de tarefas sera habilitada apos contrato backend."
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground opacity-60 cursor-not-allowed"
            >
              <UserPlus size={13} />
              Atribuir Tarefa
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={saving || finalized}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                saved
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'border-primary/40 text-primary hover:bg-primary/5'
              }`}
            >
              <Save size={13} />
              {saving ? 'Salvando...' : saved ? 'Rascunho salvo!' : 'Salvar Rascunho'}
            </button>
            <button
              onClick={handleFinalize}
              disabled={saving || finalized}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                finalized
                  ? 'bg-green-600 text-white cursor-default'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              <CheckCircle size={13} />
              {saving
                ? 'Processando...'
                : finalized
                  ? 'Atendimento Finalizado'
                  : 'Finalizar Atendimento'}
            </button>
          </div>
        </div>

        {/* ── Three-column body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_280px] gap-0">
          {/* ── LEFT COLUMN ── */}
          <div className="border-b border-border overflow-visible p-4 space-y-3 bg-muted/20 xl:border-b-0 xl:border-r xl:overflow-y-auto xl:scrollbar-thin">
            {/* Patient summary */}
            <SectionCard title="Paciente">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{profile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {profile.age} anos · {profile.preferredName ? `"${profile.preferredName}"` : ''}
                  </p>
                </div>
              </div>
              <div className="space-y-0">
                <MetricPill label="CPF" value={profile.cpfMasked} />
                <MetricPill label="Telefone" value={profile.phone} />
                <MetricPill
                  label="Status"
                  value={profile.status === 'ativo' ? 'Ativo' : profile.status}
                />
                {data.responsibleProfessional && (
                  <MetricPill label="Responsável" value={data.responsibleProfessional} />
                )}
                {data.mainUnit && <MetricPill label="Unidade" value={data.mainUnit} />}
              </div>
              {data.clinicalRisk && (
                <div className="mt-3">
                  <RiskBadge risk={data.clinicalRisk} />
                </div>
              )}
            </SectionCard>

            {/* Active package */}
            <SectionCard title="Pacote Ativo">
              <p className="text-sm font-semibold text-foreground mb-1">
                {activePackage.programName}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Semana {activePackage.currentWeek} de {activePackage.totalWeeks} · Início{' '}
                {activePackage.startDate}
              </p>
              <div className="w-full bg-muted rounded-full h-1.5 mb-1">
                <div
                  className="bg-primary h-1.5 rounded-full"
                  style={{
                    width: `${activePackageProgress}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {activePackageProgress}% concluído
              </p>
              <div className="mt-3 space-y-0">
                <MetricPill
                  label="Consultas"
                  value={`${activePackage.usedConsultations}/${activePackage.totalConsultations}`}
                />
                <MetricPill
                  label="Sessões Nutrição"
                  value={`${activePackage.usedNutritionSessions}/${activePackage.totalNutritionSessions}`}
                />
                <MetricPill label="Término" value={activePackage.endDate} />
              </div>
            </SectionCard>

            {/* Latest metrics */}
            <SectionCard title="Últimas Medidas">
              <div className="space-y-0">
                <MetricPill label="Peso atual" value={currentWeightKg} unit=" kg" />
                <MetricPill label="Peso inicial" value={clinicalStatus.startWeightKg} unit=" kg" />
                <MetricPill label="Meta" value={clinicalStatus.goalWeightKg} unit=" kg" />
                <MetricPill label="Perdido" value={clinicalStatus.weightLostKg} unit=" kg" />
                <MetricPill label="IMC" value={currentBmi} />
                {latestMeasurement?.bodyFatPercent !== undefined && (
                  <MetricPill
                    label="Gordura corporal"
                    value={latestMeasurement.bodyFatPercent}
                    unit="%"
                  />
                )}
                {latestMeasurement?.waistCm !== undefined && (
                  <MetricPill label="Cintura" value={latestMeasurement.waistCm} unit=" cm" />
                )}
                <MetricPill
                  label="Adesão semanal"
                  value={`${clinicalStatus.weeklyAdherencePercent}%`}
                />
                <MetricPill label="Última medição" value={formatDate(lastMeasuredAt)} />
              </div>
            </SectionCard>

            {/* Alerts */}
            {alerts && alerts.filter((a) => !a.isResolved).length > 0 && (
              <SectionCard title="Alertas Ativos">
                <div className="space-y-2">
                  {alerts
                    .filter((a) => !a.isResolved)
                    .map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-100"
                      >
                        <AlertTriangle size={12} className="text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-amber-800">{alert.title}</p>
                          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                            {alert.description}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </SectionCard>
            )}
          </div>

          {/* ── CENTER COLUMN — SOAP Editor ── */}
          <div className="min-w-0 overflow-y-auto scrollbar-thin p-4 lg:p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={16} className="text-primary" />
              <h2 className="text-base font-semibold text-foreground">Registro SOAP</h2>
              <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                <Clock size={12} />
                {new Date().toLocaleDateString('pt-BR')}
              </span>
            </div>

            {finalized && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
                <CheckCircle size={15} />
                Atendimento finalizado com sucesso. Registro salvo no prontuário.
              </div>
            )}

            {actionError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
                <AlertTriangle size={15} />
                {actionError}
              </div>
            )}

            <SOAPField
              label="S — Subjetivo"
              value={soap.S}
              onChange={(v) => setSoap((p) => ({ ...p, S: v }))}
              placeholder="Queixa principal, história da doença atual, sintomas relatados pelo paciente, histórico relevante..."
              rows={6}
              disabled={finalized}
            />
            <SOAPField
              label="O — Objetivo"
              value={soap.O}
              onChange={(v) => setSoap((p) => ({ ...p, O: v }))}
              placeholder="Dados objetivos: peso, IMC, pressão arterial, exame físico, resultados de exames, bioimpedância..."
              rows={6}
              disabled={finalized}
            />
            <SOAPField
              label="A — Avaliação"
              value={soap.A}
              onChange={(v) => setSoap((p) => ({ ...p, A: v }))}
              placeholder="Diagnóstico, hipóteses diagnósticas, análise clínica, evolução do quadro, resposta ao tratamento..."
              rows={6}
              disabled={finalized}
            />
            <SOAPField
              label="P — Plano"
              value={soap.P}
              onChange={(v) => setSoap((p) => ({ ...p, P: v }))}
              placeholder="Conduta, prescrições, solicitação de exames, orientações, retorno, encaminhamentos, ajustes no programa..."
              rows={6}
              disabled={finalized}
            />

            <div
              id="encounter-clinical-records"
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Registros clinicos do atendimento
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Medidas, bioimpedancia e exames ficam vinculados ao atendimento em aberto; apos
                    finalizar, novos registros devem ser feitos em outro atendimento.
                  </p>
                </div>
                {clinicalActionSaving && (
                  <span className="text-xs font-medium text-muted-foreground">Salvando...</span>
                )}
              </div>

              {clinicalActionError && (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {clinicalActionError}
                </div>
              )}
              {clinicalActionSuccess && (
                <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  {clinicalActionSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleCreateMeasurement();
                  }}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <ClipboardList size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-foreground">Medidas</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['weightKg', 'Peso kg'],
                      ['heightCm', 'Altura cm'],
                      ['bodyFatPercent', 'Gordura %'],
                      ['waistCm', 'Cintura cm'],
                      ['hipCm', 'Quadril cm'],
                    ].map(([key, label]) => (
                      <label key={key} className="flex flex-col gap-1 text-xs text-foreground">
                        {label}
                        <input
                          value={measurementForm[key as keyof MeasurementFormState]}
                          onChange={(event) =>
                            setMeasurementForm((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          disabled={clinicalActionSaving || finalized}
                          className="input-base text-xs disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
                          inputMode="decimal"
                        />
                      </label>
                    ))}
                    <label className="col-span-2 flex flex-col gap-1 text-xs text-foreground">
                      Observacao
                      <input
                        value={measurementForm.notes}
                        onChange={(event) =>
                          setMeasurementForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        disabled={clinicalActionSaving || finalized}
                        className="input-base text-xs disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={clinicalActionSaving || finalized}
                    className="btn-secondary mt-3 w-full justify-center text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Registrar medidas
                  </button>
                </form>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleCreateBioimpedance();
                  }}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Zap size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-foreground">Bioimpedancia</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['leanMassKg', 'Massa magra kg'],
                      ['fatMassKg', 'Massa gorda kg'],
                      ['bodyWaterLiters', 'Agua L'],
                      ['phaseAngleDeg', 'Angulo fase'],
                    ].map(([key, label]) => (
                      <label key={key} className="flex flex-col gap-1 text-xs text-foreground">
                        {label}
                        <input
                          value={bioimpedanceForm[key as keyof BioimpedanceFormState]}
                          onChange={(event) =>
                            setBioimpedanceForm((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          disabled={clinicalActionSaving || finalized}
                          className="input-base text-xs disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
                          inputMode="decimal"
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={clinicalActionSaving || finalized}
                    className="btn-secondary mt-3 w-full justify-center text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Registrar bioimpedancia
                  </button>
                </form>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleCreateLabOrder();
                  }}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <FlaskConical size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-foreground">Exames</span>
                  </div>
                  <div className="space-y-2">
                    <label className="flex flex-col gap-1 text-xs text-foreground">
                      Painel
                      <input
                        value={labOrderForm.panelName}
                        onChange={(event) =>
                          setLabOrderForm((current) => ({
                            ...current,
                            panelName: event.target.value,
                          }))
                        }
                        disabled={clinicalActionSaving || finalized}
                        className="input-base text-xs disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
                        placeholder="Checkup metabolico"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-foreground">
                      Exames
                      <input
                        value={labOrderForm.tests}
                        onChange={(event) =>
                          setLabOrderForm((current) => ({
                            ...current,
                            tests: event.target.value,
                          }))
                        }
                        disabled={clinicalActionSaving || finalized}
                        className="input-base text-xs disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
                        placeholder="Hemograma, glicemia, lipidograma"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-foreground">
                      Urgencia
                      <select
                        value={labOrderForm.urgency}
                        onChange={(event) =>
                          setLabOrderForm((current) => ({
                            ...current,
                            urgency: event.target.value,
                          }))
                        }
                        disabled={clinicalActionSaving || finalized}
                        className="input-base text-xs disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
                      >
                        <option value="routine">Rotina</option>
                        <option value="priority">Prioritario</option>
                      </select>
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={clinicalActionSaving || finalized}
                    className="btn-secondary mt-3 w-full justify-center text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Solicitar exames
                  </button>
                </form>
              </div>
            </div>

            {/* Bottom action row */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <button
                onClick={handleSaveDraft}
                disabled={saving || finalized}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border transition-colors ${
                  saved
                    ? 'bg-green-50 border-green-300 text-green-700'
                    : 'border-primary/40 text-primary hover:bg-primary/5'
                }`}
              >
                <Save size={14} />
                {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar Rascunho'}
              </button>
              <button
                onClick={handleFinalize}
                disabled={saving || finalized}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                  finalized
                    ? 'bg-green-600 text-white cursor-default'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                <CheckCircle size={14} />
                {saving ? 'Processando...' : finalized ? 'Finalizado' : 'Finalizar Atendimento'}
              </button>
            </div>
          </div>

          {/* ── RIGHT COLUMN — Clinical context ── */}
          <div className="border-t border-border overflow-visible p-4 space-y-3 bg-muted/20 xl:border-t-0 xl:border-l xl:overflow-y-auto xl:scrollbar-thin">
            {/* Programa ativo */}
            <SectionCard title="Programa Ativo">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={13} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {activePackage.programName}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Semana {activePackage.currentWeek}/{activePackage.totalWeeks} · Status:{' '}
                <span className="font-medium text-green-700 capitalize">
                  {activePackage.status}
                </span>
              </p>
            </SectionCard>

            {clinicalRecordsError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Dados clínicos complementares indisponíveis: {clinicalRecordsError}
              </div>
            )}

            {/* Alergias */}
            <SectionCard title="Alergias">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/60 border border-dashed border-border">
                <AlertTriangle size={12} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground italic">
                  Nenhuma alergia registrada
                </span>
              </div>
            </SectionCard>

            {/* Medicamentos / Prescrições ativas */}
            <SectionCard title="Prescrições Ativas">
              {activePrescriptions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nenhuma prescrição ativa.</p>
              ) : (
                <div className="space-y-2">
                  {activePrescriptions.slice(0, 4).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start gap-2 p-2 rounded-lg bg-blue-50 border border-blue-100"
                    >
                      <Pill size={11} className="text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-blue-800">{p.medicationName}</p>
                        <p className="text-xs text-blue-700">
                          {p.dosage} · {p.frequency}
                        </p>
                        <p className="text-xs text-blue-600 mt-0.5">{p.prescribedBy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Últimas medidas */}
            <SectionCard title="Últimas Medidas" defaultOpen={false}>
              <div className="space-y-0">
                <MetricPill label="Peso" value={currentWeightKg} unit=" kg" />
                <MetricPill label="IMC" value={currentBmi} />
                <MetricPill label="Adesão" value={`${clinicalStatus.weeklyAdherencePercent}%`} />
                <MetricPill label="Perdido" value={clinicalStatus.weightLostKg} unit=" kg" />
              </div>
            </SectionCard>

            {/* Bioimpedância */}
            <SectionCard title="Bioimpedância" defaultOpen={false}>
              {latestBioimpedance ? (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    Última: {formatDate(latestBioimpedance.measuredAt)}
                  </p>
                  <div className="space-y-0">
                    <MetricPill
                      label="Massa magra"
                      value={formatClinicalValue(latestBioimpedance.leanMassKg)}
                      unit={latestBioimpedance.leanMassKg !== undefined ? ' kg' : undefined}
                    />
                    <MetricPill
                      label="Massa gorda"
                      value={formatClinicalValue(latestBioimpedance.fatMassKg)}
                      unit={latestBioimpedance.fatMassKg !== undefined ? ' kg' : undefined}
                    />
                    <MetricPill
                      label="Água corporal"
                      value={formatClinicalValue(latestBioimpedance.bodyWaterLiters)}
                      unit={latestBioimpedance.bodyWaterLiters !== undefined ? ' L' : undefined}
                    />
                    <MetricPill
                      label="Ângulo de fase"
                      value={formatClinicalValue(latestBioimpedance.phaseAngleDeg)}
                      unit={latestBioimpedance.phaseAngleDeg !== undefined ? '°' : undefined}
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Nenhuma bioimpedância registrada.
                </p>
              )}
            </SectionCard>

            {/* Exames */}
            <SectionCard title="Exames" defaultOpen={false}>
              {labOrders.length === 0 && labResults.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nenhum exame registrado.</p>
              ) : (
                <div className="space-y-3">
                  {labOrders.map((order) => (
                    <div key={order.id} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-foreground">{order.panelName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(order.orderedAt)} · {order.tests.length} testes
                        </p>
                      </div>
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-amber-100 text-amber-700">
                        {order.status}
                      </span>
                    </div>
                  ))}
                  {labResults.map((result) => (
                    <div key={result.id} className="rounded-lg border border-border p-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs font-semibold text-foreground">Resultado recebido</p>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(result.resultAt)}
                        </span>
                      </div>
                      {result.interpretation && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {result.interpretation}
                        </p>
                      )}
                      <div className="space-y-0">
                        {Object.entries(result.values)
                          .slice(0, 4)
                          .map(([key, value]) => (
                            <MetricPill
                              key={key}
                              label={key.replaceAll('_', ' ')}
                              value={formatClinicalValue(value)}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Sintomas recentes */}
            <SectionCard title="Sintomas Recentes" defaultOpen={false}>
              <p className="text-xs text-muted-foreground italic">
                Nenhum sintoma recente registrado no contrato local disponível.
              </p>
            </SectionCard>

            {/* Pendências */}
            <SectionCard title="Pendências" defaultOpen={false}>
              <div className="space-y-2">
                {openTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhuma pendência aberta.</p>
                ) : (
                  openTasks.map((t) => (
                    <div key={t.id} className="flex items-start gap-2">
                      <ClipboardList
                        size={11}
                        className="text-muted-foreground mt-0.5 flex-shrink-0"
                      />
                      <div>
                        <p className="text-xs font-medium text-foreground">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Prazo: {t.dueDate}
                          {t.assignedTo ? ` · ${t.assignedTo}` : ''}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>

            {/* Últimos atendimentos */}
            <SectionCard title="Últimos Atendimentos" defaultOpen={false}>
              <div className="space-y-3">
                {recentClinicalEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Nenhum atendimento recente registrado.
                  </p>
                ) : (
                  recentClinicalEvents.map((event) => (
                    <div
                      key={event.id}
                      className="border-b border-border pb-2 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-foreground">{event.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(event.date)}
                        </span>
                      </div>
                      {(event.professional ?? event.actorName) ? (
                        <p className="text-xs text-muted-foreground">
                          {event.professional ?? event.actorName}
                        </p>
                      ) : null}
                      <p className="text-xs text-foreground/80 mt-0.5 leading-relaxed">
                        {event.description}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
