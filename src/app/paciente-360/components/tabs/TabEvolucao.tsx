'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  FlaskConical,
  Image as ImageIcon,
  Loader2,
  Lock,
  Microscope,
  RefreshCw,
  Ruler,
  Scale,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import WeightEvolutionChart from '@/components/charts/WeightEvolutionChart';
import {
  createBioimpedanceResult,
  createLabOrder,
  createMeasurement,
  getPatientEvolutionSnapshot,
  getProgressPhotoSignedUrl,
  recordLabResult,
  setProgressPhotoPatientVisibility,
  uploadProgressPhoto,
  type BioimpedanceSummary,
  type ClinicalRecordsData,
  type LabOrderSummary,
  type LabResultSummary,
  type ProgressPhotoAngle,
  type ProgressPhotoSummary,
} from '@/services/clinicalRecordsApi';

type EvolutionFormMode = 'measurement' | 'photo' | 'bioimpedance' | 'labOrder' | 'labResult';

interface TabEvolucaoProps {
  patientId: string;
  goalWeightKg?: number;
  permissions: string[];
}

type MeasurementDraft = {
  measuredAt: string;
  weightKg: string;
  heightCm: string;
  bodyFatPercent: string;
  waistCm: string;
  hipCm: string;
  notes: string;
};

type PhotoDraft = {
  angle: ProgressPhotoAngle;
  photoDate: string;
  weightAtPhoto: string;
  consentForComparison: boolean;
  visibilityToPatient: boolean;
  notes: string;
};

type BioimpedanceDraft = {
  measuredAt: string;
  leanMassKg: string;
  fatMassKg: string;
  bodyWaterLiters: string;
  phaseAngleDeg: string;
  source: string;
};

type LabOrderDraft = {
  panelName: string;
  tests: string;
  urgency: string;
  note: string;
};

type LabResultDraft = {
  labOrderId: string;
  resultAt: string;
  values: string;
  interpretation: string;
};

const angleOptions: Array<{ value: ProgressPhotoAngle; label: string }> = [
  { value: 'front', label: 'Frente' },
  { value: 'back', label: 'Costas' },
  { value: 'left', label: 'Lateral esquerda' },
  { value: 'right', label: 'Lateral direita' },
  { value: 'other', label: 'Outro' },
];

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowLocalDateTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function dateTimeLocalToIso(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value?: number | null, suffix = '') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
}

function angleLabel(angle: ProgressPhotoAngle) {
  return angleOptions.find((option) => option.value === angle)?.label ?? 'Foto';
}

function hasAnyPermission(permissions: string[], expected: string[]) {
  const set = new Set(permissions);
  return expected.some((permission) => set.has(permission));
}

function buildInitialMeasurementDraft(records: ClinicalRecordsData | null): MeasurementDraft {
  const latest = records?.latestMeasurement;
  return {
    measuredAt: nowLocalDateTime(),
    weightKg: latest?.weightKg ? String(latest.weightKg) : '',
    heightCm: latest?.heightCm ? String(latest.heightCm) : '',
    bodyFatPercent: latest?.bodyFatPercent ? String(latest.bodyFatPercent) : '',
    waistCm: '',
    hipCm: '',
    notes: '',
  };
}

function emptyPhotoDraft(): PhotoDraft {
  return {
    angle: 'front',
    photoDate: todayDate(),
    weightAtPhoto: '',
    consentForComparison: false,
    visibilityToPatient: false,
    notes: '',
  };
}

function emptyBioimpedanceDraft(): BioimpedanceDraft {
  return {
    measuredAt: nowLocalDateTime(),
    leanMassKg: '',
    fatMassKg: '',
    bodyWaterLiters: '',
    phaseAngleDeg: '',
    source: '',
  };
}

function emptyLabOrderDraft(): LabOrderDraft {
  return { panelName: '', tests: '', urgency: 'routine', note: '' };
}

function emptyLabResultDraft(): LabResultDraft {
  return {
    labOrderId: '',
    resultAt: nowLocalDateTime(),
    values: '',
    interpretation: '',
  };
}

function parseLabValues(value: string) {
  const parsed: Record<string, string | number | boolean> = {};
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [rawKey, ...rawValueParts] = line.split('=');
      const key = rawKey?.trim();
      const rawValue = rawValueParts.join('=').trim();
      if (!key || !rawValue) return;
      const numeric = Number(rawValue.replace(',', '.'));
      parsed[key] = Number.isFinite(numeric) ? numeric : rawValue.slice(0, 120);
    });
  return parsed;
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 truncate text-base font-bold text-foreground">{value}</p>
          {detail ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
      {label}
      {children}
    </label>
  );
}

function PhotoLightbox({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-full w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary h-9 w-9 justify-center px-0"
            aria-label="Fechar foto"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex max-h-[75vh] items-center justify-center bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={title} className="max-h-[75vh] w-auto max-w-full object-contain" />
        </div>
      </div>
    </div>
  );
}

function ProgressPhotoCard({
  photo,
  patientId,
  canRelease,
  onToggleRelease,
}: {
  photo: ProgressPhotoSummary;
  patientId: string;
  canRelease: boolean;
  onToggleRelease: (photo: ProgressPhotoSummary) => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const canOpen = photo.hasPhoto && photo.status === 'uploaded';

  async function handleOpen() {
    if (!canOpen || loadingUrl) return;
    if (signedUrl) {
      setLightboxUrl(signedUrl);
      return;
    }
    setLoadingUrl(true);
    setUrlError(null);
    try {
      const result = await getProgressPhotoSignedUrl(patientId, photo.id);
      if (result.error || !result.data?.url) {
        setUrlError(result.error?.message ?? 'Nao foi possivel abrir a foto.');
        return;
      }
      setSignedUrl(result.data.url);
      setLightboxUrl(result.data.url);
    } finally {
      setLoadingUrl(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        disabled={!canOpen || loadingUrl}
        onClick={() => void handleOpen()}
        className="relative flex h-44 w-full items-center justify-center bg-muted text-muted-foreground disabled:cursor-not-allowed"
      >
        {signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signedUrl}
            alt={`Foto corporal ${angleLabel(photo.angle)}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card">
              {canOpen ? <Lock size={17} /> : <ImageIcon size={17} />}
            </div>
            <span className="text-xs font-semibold">
              {canOpen ? (loadingUrl ? 'Abrindo...' : 'Ver foto') : 'Upload pendente'}
            </span>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-xs font-semibold text-white">
          {angleLabel(photo.angle)}
        </span>
        {photo.visibilityToPatient ? (
          <span className="absolute right-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
            Portal
          </span>
        ) : null}
      </button>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{formatDate(photo.photoDate)}</p>
            <p className="text-xs text-muted-foreground">
              {photo.weightAtPhoto
                ? `${formatNumber(photo.weightAtPhoto, ' kg')} no registro`
                : 'Peso nao informado'}
            </p>
          </div>
          <span
            className={[
              'rounded-full border px-2 py-0.5 text-xs font-semibold',
              photo.status === 'uploaded'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700',
            ].join(' ')}
          >
            {photo.status === 'uploaded' ? 'Enviada' : 'Pendente'}
          </span>
        </div>
        {photo.notes ? <p className="text-xs text-muted-foreground">{photo.notes}</p> : null}
        {urlError ? (
          <p className="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-600">{urlError}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleOpen()}
            disabled={!canOpen || loadingUrl}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {loadingUrl ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
            Abrir
          </button>
          {canRelease ? (
            <button
              type="button"
              onClick={() => onToggleRelease(photo)}
              disabled={photo.status !== 'uploaded'}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              <ShieldCheck size={13} />
              {photo.visibilityToPatient ? 'Ocultar do portal' : 'Liberar ao paciente'}
            </button>
          ) : null}
        </div>
      </div>
      {lightboxUrl ? (
        <PhotoLightbox
          url={lightboxUrl}
          title={`Foto de progresso - ${angleLabel(photo.angle)} - ${formatDate(photo.photoDate)}`}
          onClose={() => setLightboxUrl(null)}
        />
      ) : null}
    </article>
  );
}

export default function TabEvolucao({ patientId, goalWeightKg, permissions }: TabEvolucaoProps) {
  const [records, setRecords] = useState<ClinicalRecordsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<EvolutionFormMode>('measurement');
  const [saving, setSaving] = useState(false);
  const [measurementDraft, setMeasurementDraft] = useState<MeasurementDraft>(
    buildInitialMeasurementDraft(null)
  );
  const [photoDraft, setPhotoDraft] = useState<PhotoDraft>(emptyPhotoDraft);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [bioDraft, setBioDraft] = useState<BioimpedanceDraft>(emptyBioimpedanceDraft);
  const [labOrderDraft, setLabOrderDraft] = useState<LabOrderDraft>(emptyLabOrderDraft);
  const [labResultDraft, setLabResultDraft] = useState<LabResultDraft>(emptyLabResultDraft);

  const canWriteClinical = hasAnyPermission(permissions, [
    'patients.write',
    'encounters.write',
    'soap.write',
  ]);
  const canWritePhotos = hasAnyPermission(permissions, ['progress_photos.write']);
  const canReleasePhotos = hasAnyPermission(permissions, ['progress_photos.release']);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getPatientEvolutionSnapshot(patientId);
    setLoading(false);

    if (result.error || !result.data) {
      setRecords(null);
      setError(result.error?.message ?? 'Nao foi possivel carregar a evolucao.');
      return;
    }

    setRecords(result.data);
    setMeasurementDraft(buildInitialMeasurementDraft(result.data));
  }, [patientId]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const chartData = useMemo(() => {
    const ordered = [...(records?.measurements ?? [])].reverse();
    return ordered.map((item, index) => ({
      week: index + 1,
      weightKg: item.weightKg,
      date: item.measuredAt,
    }));
  }, [records?.measurements]);

  const latestMeasurement = records?.latestMeasurement;
  const pendingLabs =
    records?.labOrders.filter((order) => order.status !== 'completed').length ?? 0;
  const releasedPhotos =
    records?.progressPhotos.filter((photo) => photo.visibilityToPatient).length ?? 0;
  const safeGoalWeight =
    goalWeightKg && goalWeightKg > 0 ? goalWeightKg : (latestMeasurement?.weightKg ?? 0);

  async function handleSaveMeasurement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteClinical) return;
    const weightKg = toNumber(measurementDraft.weightKg);
    const heightCm = toNumber(measurementDraft.heightCm);
    if (!weightKg && !heightCm) {
      toast.error('Informe pelo menos peso ou altura.');
      return;
    }

    setSaving(true);
    const result = await createMeasurement({
      patientId,
      measuredAt: dateTimeLocalToIso(measurementDraft.measuredAt),
      weightKg,
      heightCm,
      bodyFatPercent: toNumber(measurementDraft.bodyFatPercent),
      waistCm: toNumber(measurementDraft.waistCm),
      hipCm: toNumber(measurementDraft.hipCm),
      notes: measurementDraft.notes.trim() || null,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    toast.success('Medidas registradas.');
    await loadRecords();
  }

  async function handleSavePhoto(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWritePhotos) return;
    if (!photoFile) {
      toast.error('Selecione uma foto.');
      return;
    }

    setSaving(true);
    const result = await uploadProgressPhoto(
      {
        patientId,
        angle: photoDraft.angle,
        photoDate: photoDraft.photoDate,
        weightAtPhoto: toNumber(photoDraft.weightAtPhoto),
        consentForComparison: photoDraft.consentForComparison,
        visibilityToPatient: photoDraft.visibilityToPatient,
        notes: photoDraft.notes.trim() || null,
      },
      photoFile
    );
    setSaving(false);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    setPhotoDraft(emptyPhotoDraft());
    setPhotoFile(null);
    toast.success('Foto de progresso enviada com seguranca.');
    await loadRecords();
  }

  async function handleSaveBioimpedance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteClinical) return;
    const payload = {
      lean_mass_kg: toNumber(bioDraft.leanMassKg),
      fat_mass_kg: toNumber(bioDraft.fatMassKg),
      total_body_water_l: toNumber(bioDraft.bodyWaterLiters),
      phase_angle_deg: toNumber(bioDraft.phaseAngleDeg),
      source: bioDraft.source.trim() || null,
    };

    setSaving(true);
    const result = await createBioimpedanceResult({
      patientId,
      measuredAt: dateTimeLocalToIso(bioDraft.measuredAt),
      payload,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    setBioDraft(emptyBioimpedanceDraft());
    toast.success('Bioimpedancia registrada.');
    await loadRecords();
  }

  async function handleSaveLabOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteClinical) return;
    const tests = labOrderDraft.tests
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!labOrderDraft.panelName.trim() || tests.length === 0) {
      toast.error('Informe painel e exames.');
      return;
    }

    setSaving(true);
    const result = await createLabOrder({
      patientId,
      panelName: labOrderDraft.panelName,
      tests,
      urgency: labOrderDraft.urgency,
      note: labOrderDraft.note.trim() || undefined,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    setLabOrderDraft(emptyLabOrderDraft());
    toast.success('Solicitacao de labs registrada.');
    await loadRecords();
  }

  async function handleSaveLabResult(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteClinical) return;
    const values = parseLabValues(labResultDraft.values);
    if (Object.keys(values).length === 0 && !labResultDraft.interpretation.trim()) {
      toast.error('Informe valores ou interpretacao.');
      return;
    }

    setSaving(true);
    const result = await recordLabResult({
      patientId,
      labOrderId: labResultDraft.labOrderId || null,
      resultAt: dateTimeLocalToIso(labResultDraft.resultAt),
      values,
      interpretation: labResultDraft.interpretation.trim() || undefined,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    setLabResultDraft(emptyLabResultDraft());
    toast.success('Resultado laboratorial registrado.');
    await loadRecords();
  }

  async function handleToggleRelease(photo: ProgressPhotoSummary) {
    const nextVisible = !photo.visibilityToPatient;
    const result = await setProgressPhotoPatientVisibility(patientId, photo.id, nextVisible);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(nextVisible ? 'Foto liberada ao paciente.' : 'Foto ocultada do portal.');
    await loadRecords();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (error || !records) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Evolucao indisponivel</p>
            <p className="mt-1 text-sm text-amber-800">
              {error ?? 'Nao foi possivel carregar medidas, fotos e labs.'}
            </p>
            <button
              type="button"
              onClick={() => void loadRecords()}
              className="btn-secondary mt-4 text-xs"
            >
              <RefreshCw size={13} />
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  const formTabs: Array<{
    id: EvolutionFormMode;
    label: string;
    icon: React.ElementType;
    disabled?: boolean;
  }> = [
    { id: 'measurement', label: 'Medida', icon: Ruler, disabled: !canWriteClinical },
    { id: 'photo', label: 'Foto', icon: Camera, disabled: !canWritePhotos },
    { id: 'bioimpedance', label: 'Bioimpedancia', icon: Activity, disabled: !canWriteClinical },
    { id: 'labOrder', label: 'Solicitar labs', icon: FlaskConical, disabled: !canWriteClinical },
    { id: 'labResult', label: 'Resultado lab', icon: Microscope, disabled: !canWriteClinical },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricTile
          icon={Scale}
          label="Peso atual"
          value={formatNumber(latestMeasurement?.weightKg, ' kg')}
          detail={formatDate(latestMeasurement?.measuredAt)}
        />
        <MetricTile
          icon={Activity}
          label="IMC e gordura"
          value={`${formatNumber(latestMeasurement?.bmi)} / ${formatNumber(latestMeasurement?.bodyFatPercent, '%')}`}
          detail="IMC / gordura corporal"
        />
        <MetricTile
          icon={Camera}
          label="Fotos privadas"
          value={records.progressPhotos.length}
          detail={`${releasedPhotos} liberada(s) ao paciente`}
        />
        <MetricTile
          icon={FlaskConical}
          label="Labs pendentes"
          value={pendingLabs}
          detail={`${records.labResults.length} resultado(s) recebido(s)`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <section className="card-base p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Evolucao corporal</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tendencia de peso consolidada com medidas, bioimpedancia, fotos privadas e labs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadRecords()}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                <RefreshCw size={13} />
                Atualizar
              </button>
            </div>
            <WeightEvolutionChart data={chartData} goalWeightKg={safeGoalWeight} />
          </section>

          <section className="card-base p-5">
            <div className="mb-4 flex items-center gap-2">
              <Camera size={16} className="text-primary" />
              <h2 className="text-base font-semibold text-foreground">Fotos de progresso</h2>
              <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                Bucket privado
              </span>
            </div>
            {records.progressPhotos.length === 0 ? (
              <EmptyState
                icon={Camera}
                title="Nenhuma foto corporal registrada"
                description="Use o formulario lateral para enviar a primeira foto privada por angulo e data."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {records.progressPhotos.map((photo) => (
                  <ProgressPhotoCard
                    key={photo.id}
                    photo={photo}
                    patientId={patientId}
                    canRelease={canReleasePhotos}
                    onToggleRelease={(item) => void handleToggleRelease(item)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="card-base p-5">
              <div className="mb-3 flex items-center gap-2">
                <Ruler size={16} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Historico de medidas</h2>
              </div>
              {records.measurements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma medida registrada.</p>
              ) : (
                <div className="space-y-2">
                  {records.measurements.slice(0, 8).map((measurement) => (
                    <div key={measurement.id} className="rounded-lg bg-muted/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">
                          {formatNumber(measurement.weightKg, ' kg')}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(measurement.measuredAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        IMC {formatNumber(measurement.bmi)} - cintura{' '}
                        {formatNumber(measurement.waistCm, ' cm')} - quadril{' '}
                        {formatNumber(measurement.hipCm, ' cm')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-base p-5">
              <div className="mb-3 flex items-center gap-2">
                <Activity size={16} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Bioimpedancia</h2>
              </div>
              {records.bioimpedance.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma bioimpedancia registrada.</p>
              ) : (
                <div className="space-y-2">
                  {records.bioimpedance.slice(0, 5).map((bio) => (
                    <BioimpedanceRow key={bio.id} bio={bio} />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="card-base p-5">
            <div className="mb-4 flex items-center gap-2">
              <FlaskConical size={16} className="text-primary" />
              <h2 className="text-base font-semibold text-foreground">Labs e anexos</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <LabOrdersList orders={records.labOrders} />
              <LabResultsList results={records.labResults} />
            </div>
            <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Anexos laboratoriais devem ser enviados em Prontuario &gt; Anexos. Os arquivos ficam
              no bucket privado clinical-attachments e abrem por link temporario.
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card-base p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {formTabs.map((tab) => {
                const Icon = tab.icon;
                const active = formMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={tab.disabled}
                    onClick={() => setFormMode(tab.id)}
                    className={[
                      'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground',
                      tab.disabled ? 'cursor-not-allowed opacity-50' : '',
                    ].join(' ')}
                  >
                    <Icon size={13} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {formMode === 'measurement' ? (
              <MeasurementForm
                draft={measurementDraft}
                saving={saving}
                disabled={!canWriteClinical}
                onChange={setMeasurementDraft}
                onSubmit={(event) => void handleSaveMeasurement(event)}
              />
            ) : null}
            {formMode === 'photo' ? (
              <PhotoForm
                draft={photoDraft}
                file={photoFile}
                saving={saving}
                disabled={!canWritePhotos}
                canRelease={canReleasePhotos}
                onDraftChange={setPhotoDraft}
                onFileChange={setPhotoFile}
                onSubmit={(event) => void handleSavePhoto(event)}
              />
            ) : null}
            {formMode === 'bioimpedance' ? (
              <BioimpedanceForm
                draft={bioDraft}
                saving={saving}
                disabled={!canWriteClinical}
                onChange={setBioDraft}
                onSubmit={(event) => void handleSaveBioimpedance(event)}
              />
            ) : null}
            {formMode === 'labOrder' ? (
              <LabOrderForm
                draft={labOrderDraft}
                saving={saving}
                disabled={!canWriteClinical}
                onChange={setLabOrderDraft}
                onSubmit={(event) => void handleSaveLabOrder(event)}
              />
            ) : null}
            {formMode === 'labResult' ? (
              <LabResultForm
                draft={labResultDraft}
                orders={records.labOrders}
                saving={saving}
                disabled={!canWriteClinical}
                onChange={setLabResultDraft}
                onSubmit={(event) => void handleSaveLabResult(event)}
              />
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function BioimpedanceRow({ bio }: { bio: BioimpedanceSummary }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{formatDate(bio.measuredAt)}</p>
        <span className="text-xs text-muted-foreground">{bio.source ?? 'Manual'}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Massa magra {formatNumber(bio.leanMassKg, ' kg')} - gordura{' '}
        {formatNumber(bio.fatMassKg, ' kg')} - agua {formatNumber(bio.bodyWaterLiters, ' L')} -
        angulo {formatNumber(bio.phaseAngleDeg)}
      </p>
    </div>
  );
}

function LabOrdersList({ orders }: { orders: LabOrderSummary[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-foreground">Solicitacoes</p>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma solicitacao laboratorial.</p>
      ) : (
        <div className="space-y-2">
          {orders.slice(0, 6).map((order) => (
            <div key={order.id} className="rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{order.panelName}</p>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {order.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(order.orderedAt)} - {order.tests.join(', ') || 'Sem exames listados'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LabResultsList({ results }: { results: LabResultSummary[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-foreground">Resultados</p>
      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum resultado recebido.</p>
      ) : (
        <div className="space-y-2">
          {results.slice(0, 6).map((result) => (
            <div key={result.id} className="rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {formatDate(result.resultAt)}
                </p>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {result.status}
                </span>
              </div>
              {result.interpretation ? (
                <p className="mt-1 text-xs text-muted-foreground">{result.interpretation}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(result.values)
                  .slice(0, 5)
                  .map(([key, value]) => (
                    <span
                      key={key}
                      className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {key}: {String(value)}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MeasurementForm({
  draft,
  saving,
  disabled,
  onChange,
  onSubmit,
}: {
  draft: MeasurementDraft;
  saving: boolean;
  disabled: boolean;
  onChange: React.Dispatch<React.SetStateAction<MeasurementDraft>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Registrar medida</h3>
      <Field label="Data e hora">
        <input
          type="datetime-local"
          className="input-base"
          value={draft.measuredAt}
          disabled={disabled || saving}
          onChange={(event) =>
            onChange((current) => ({ ...current, measuredAt: event.target.value }))
          }
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Peso (kg)">
          <input
            inputMode="decimal"
            className="input-base"
            value={draft.weightKg}
            disabled={disabled || saving}
            onChange={(event) =>
              onChange((current) => ({ ...current, weightKg: event.target.value }))
            }
          />
        </Field>
        <Field label="Altura (cm)">
          <input
            inputMode="decimal"
            className="input-base"
            value={draft.heightCm}
            disabled={disabled || saving}
            onChange={(event) =>
              onChange((current) => ({ ...current, heightCm: event.target.value }))
            }
          />
        </Field>
        <Field label="Gordura (%)">
          <input
            inputMode="decimal"
            className="input-base"
            value={draft.bodyFatPercent}
            disabled={disabled || saving}
            onChange={(event) =>
              onChange((current) => ({ ...current, bodyFatPercent: event.target.value }))
            }
          />
        </Field>
        <Field label="Cintura (cm)">
          <input
            inputMode="decimal"
            className="input-base"
            value={draft.waistCm}
            disabled={disabled || saving}
            onChange={(event) =>
              onChange((current) => ({ ...current, waistCm: event.target.value }))
            }
          />
        </Field>
        <Field label="Quadril (cm)">
          <input
            inputMode="decimal"
            className="input-base"
            value={draft.hipCm}
            disabled={disabled || saving}
            onChange={(event) => onChange((current) => ({ ...current, hipCm: event.target.value }))}
          />
        </Field>
      </div>
      <Field label="Observacao">
        <textarea
          rows={3}
          className="input-base resize-none"
          value={draft.notes}
          maxLength={1000}
          disabled={disabled || saving}
          onChange={(event) => onChange((current) => ({ ...current, notes: event.target.value }))}
        />
      </Field>
      <SubmitButton saving={saving} disabled={disabled} label="Salvar medida" />
    </form>
  );
}

function PhotoForm({
  draft,
  file,
  saving,
  disabled,
  canRelease,
  onDraftChange,
  onFileChange,
  onSubmit,
}: {
  draft: PhotoDraft;
  file: File | null;
  saving: boolean;
  disabled: boolean;
  canRelease: boolean;
  onDraftChange: React.Dispatch<React.SetStateAction<PhotoDraft>>;
  onFileChange: (file: File | null) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Enviar foto privada</h3>
      <Field label="Foto">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          className="input-base"
          disabled={disabled || saving}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
      </Field>
      {file ? <p className="text-xs text-muted-foreground">{file.name}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Angulo">
          <select
            className="input-base"
            value={draft.angle}
            disabled={disabled || saving}
            onChange={(event) =>
              onDraftChange((current) => ({
                ...current,
                angle: event.target.value as ProgressPhotoAngle,
              }))
            }
          >
            {angleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data">
          <input
            type="date"
            className="input-base"
            value={draft.photoDate}
            disabled={disabled || saving}
            onChange={(event) =>
              onDraftChange((current) => ({ ...current, photoDate: event.target.value }))
            }
          />
        </Field>
        <Field label="Peso na foto (kg)">
          <input
            inputMode="decimal"
            className="input-base"
            value={draft.weightAtPhoto}
            disabled={disabled || saving}
            onChange={(event) =>
              onDraftChange((current) => ({ ...current, weightAtPhoto: event.target.value }))
            }
          />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          checked={draft.consentForComparison}
          disabled={disabled || saving}
          onChange={(event) =>
            onDraftChange((current) => ({
              ...current,
              consentForComparison: event.target.checked,
            }))
          }
        />
        Consentimento registrado para comparacao antes/depois.
      </label>
      <label className="flex items-start gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          checked={draft.visibilityToPatient}
          disabled={disabled || saving || !canRelease}
          onChange={(event) =>
            onDraftChange((current) => ({
              ...current,
              visibilityToPatient: event.target.checked,
            }))
          }
        />
        Liberar ao paciente apos upload.
      </label>
      {!canRelease ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Seu perfil pode enviar fotos, mas nao pode liberar imagens corporais ao portal.
        </p>
      ) : null}
      <Field label="Nota interna">
        <textarea
          rows={3}
          className="input-base resize-none"
          value={draft.notes}
          maxLength={1000}
          disabled={disabled || saving}
          onChange={(event) =>
            onDraftChange((current) => ({ ...current, notes: event.target.value }))
          }
        />
      </Field>
      <SubmitButton saving={saving} disabled={disabled} label="Enviar foto" icon={Upload} />
    </form>
  );
}

function BioimpedanceForm({
  draft,
  saving,
  disabled,
  onChange,
  onSubmit,
}: {
  draft: BioimpedanceDraft;
  saving: boolean;
  disabled: boolean;
  onChange: React.Dispatch<React.SetStateAction<BioimpedanceDraft>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Registrar bioimpedancia</h3>
      <Field label="Data e hora">
        <input
          type="datetime-local"
          className="input-base"
          value={draft.measuredAt}
          disabled={disabled || saving}
          onChange={(event) =>
            onChange((current) => ({ ...current, measuredAt: event.target.value }))
          }
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Massa magra (kg)">
          <input
            inputMode="decimal"
            className="input-base"
            value={draft.leanMassKg}
            disabled={disabled || saving}
            onChange={(event) =>
              onChange((current) => ({ ...current, leanMassKg: event.target.value }))
            }
          />
        </Field>
        <Field label="Massa gorda (kg)">
          <input
            inputMode="decimal"
            className="input-base"
            value={draft.fatMassKg}
            disabled={disabled || saving}
            onChange={(event) =>
              onChange((current) => ({ ...current, fatMassKg: event.target.value }))
            }
          />
        </Field>
        <Field label="Agua corporal (L)">
          <input
            inputMode="decimal"
            className="input-base"
            value={draft.bodyWaterLiters}
            disabled={disabled || saving}
            onChange={(event) =>
              onChange((current) => ({ ...current, bodyWaterLiters: event.target.value }))
            }
          />
        </Field>
        <Field label="Angulo de fase">
          <input
            inputMode="decimal"
            className="input-base"
            value={draft.phaseAngleDeg}
            disabled={disabled || saving}
            onChange={(event) =>
              onChange((current) => ({ ...current, phaseAngleDeg: event.target.value }))
            }
          />
        </Field>
      </div>
      <Field label="Fonte/equipamento">
        <input
          className="input-base"
          value={draft.source}
          disabled={disabled || saving}
          onChange={(event) => onChange((current) => ({ ...current, source: event.target.value }))}
        />
      </Field>
      <SubmitButton saving={saving} disabled={disabled} label="Salvar bioimpedancia" />
    </form>
  );
}

function LabOrderForm({
  draft,
  saving,
  disabled,
  onChange,
  onSubmit,
}: {
  draft: LabOrderDraft;
  saving: boolean;
  disabled: boolean;
  onChange: React.Dispatch<React.SetStateAction<LabOrderDraft>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Solicitar labs</h3>
      <Field label="Painel">
        <input
          className="input-base"
          value={draft.panelName}
          disabled={disabled || saving}
          onChange={(event) =>
            onChange((current) => ({ ...current, panelName: event.target.value }))
          }
        />
      </Field>
      <Field label="Exames separados por virgula">
        <textarea
          rows={3}
          className="input-base resize-none"
          value={draft.tests}
          disabled={disabled || saving}
          onChange={(event) => onChange((current) => ({ ...current, tests: event.target.value }))}
        />
      </Field>
      <Field label="Urgencia">
        <select
          className="input-base"
          value={draft.urgency}
          disabled={disabled || saving}
          onChange={(event) => onChange((current) => ({ ...current, urgency: event.target.value }))}
        >
          <option value="routine">Rotina</option>
          <option value="priority">Prioritario</option>
          <option value="urgent">Urgente</option>
        </select>
      </Field>
      <Field label="Nota">
        <textarea
          rows={3}
          className="input-base resize-none"
          value={draft.note}
          disabled={disabled || saving}
          onChange={(event) => onChange((current) => ({ ...current, note: event.target.value }))}
        />
      </Field>
      <SubmitButton saving={saving} disabled={disabled} label="Salvar solicitacao" />
    </form>
  );
}

function LabResultForm({
  draft,
  orders,
  saving,
  disabled,
  onChange,
  onSubmit,
}: {
  draft: LabResultDraft;
  orders: LabOrderSummary[];
  saving: boolean;
  disabled: boolean;
  onChange: React.Dispatch<React.SetStateAction<LabResultDraft>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Registrar resultado</h3>
      <Field label="Solicitacao relacionada">
        <select
          className="input-base"
          value={draft.labOrderId}
          disabled={disabled || saving}
          onChange={(event) =>
            onChange((current) => ({ ...current, labOrderId: event.target.value }))
          }
        >
          <option value="">Sem vinculo</option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.panelName} - {formatDate(order.orderedAt)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Data do resultado">
        <input
          type="datetime-local"
          className="input-base"
          value={draft.resultAt}
          disabled={disabled || saving}
          onChange={(event) =>
            onChange((current) => ({ ...current, resultAt: event.target.value }))
          }
        />
      </Field>
      <Field label="Valores, um por linha (Nome=valor)">
        <textarea
          rows={4}
          className="input-base resize-none"
          value={draft.values}
          disabled={disabled || saving}
          onChange={(event) => onChange((current) => ({ ...current, values: event.target.value }))}
        />
      </Field>
      <Field label="Interpretacao">
        <textarea
          rows={3}
          className="input-base resize-none"
          value={draft.interpretation}
          disabled={disabled || saving}
          onChange={(event) =>
            onChange((current) => ({ ...current, interpretation: event.target.value }))
          }
        />
      </Field>
      <SubmitButton saving={saving} disabled={disabled} label="Salvar resultado" />
    </form>
  );
}

function SubmitButton({
  saving,
  disabled,
  label,
  icon: Icon = CheckCircle2,
}: {
  saving: boolean;
  disabled: boolean;
  label: string;
  icon?: React.ElementType;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || saving}
      className="btn-primary w-full justify-center"
    >
      {saving ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      {saving ? 'Salvando...' : label}
    </button>
  );
}
